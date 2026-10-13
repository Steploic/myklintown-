import { NextResponse } from 'next/server';
import { getSupabase, row, rpc } from '@/lib/server';
import { documentCsv } from '@/lib/csv';
import { dateFr } from '@/lib/format';
import {
  INDICATEURS,
  VERDICTS,
  cibleDe,
  evaluer,
  libelleCible,
  perimetreValide,
  rangMois,
  valeurDe,
  type TableauIndicateurs,
  type ValeursKpi,
} from '@/lib/indicateurs';

/** Décimal lisible par un Excel français (virgule), sans séparateur de milliers. */
const dec = (v: number | null | undefined, facteur = 1) =>
  v == null ? null : String(Math.round(v * facteur * 10) / 10).replace('.', ',');

/**
 * Export des indicateurs du pilote (agrégats seulement).
 *   ?type=mois      le tableau mensuel transmis au Technipole (valeur, cible, verdict) ;
 *   ?type=semaines  les relevés hebdomadaires, chiffres bruts pour analyse.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const perimetre = perimetreValide(url.searchParams.get('perimetre'));
  const type = url.searchParams.get('type') === 'semaines' ? 'semaines' : 'mois';

  const supabase = await getSupabase();
  const { data, error } = await rpc(supabase, 'indicateurs_pilote', { p_perimetre: perimetre });
  const t = row<TableauIndicateurs>(data);
  if (error || !t) {
    return NextResponse.json({ erreur: error?.message ?? 'Indicateurs indisponibles' }, { status: 403 });
  }

  let csv: string;
  if (type === 'mois') {
    const reference = t.mois[0]?.valeurs?.incidents_1000.valeur ?? null;
    const entetes = ['Indicateur', 'Définition'];
    for (const m of t.mois) {
      const nom = dateFr(m.debut, { month: 'long', year: 'numeric' });
      entetes.push(`${nom} — valeur`, `${nom} — cible`, `${nom} — verdict`);
    }
    const lignes = INDICATEURS.map((def) => {
      const ligne: unknown[] = [def.label, def.definition];
      for (const m of t.mois) {
        const rang = rangMois(t.cibles, m.debut);
        const valeur = valeurDe(m.valeurs, def.cle);
        const verdict = evaluer(def, valeur, cibleDe(t.cibles, def.cle, rang, reference), m.etat);
        ligne.push(
          m.etat === 'a_venir' ? '' : valeur == null ? '—' : def.format(valeur),
          libelleCible(t.cibles, def.cle, rang, reference),
          m.etat === 'a_venir' ? 'à venir' : `${VERDICTS[verdict].label}${m.etat === 'en_cours' ? ' (mois en cours)' : ''}`,
        );
      }
      return ligne;
    });
    csv = documentCsv(entetes, lignes);
  } else {
    const releves: { valeurs: ValeursKpi | null; calcule_at: string | null; mode: string }[] = [
      ...t.semaines,
      ...(t.semaine_en_cours ? [{ valeurs: t.semaine_en_cours, calcule_at: null, mode: 'en cours (direct)' }] : []),
    ];
    const entetes = [
      'Début', 'Fin', 'Ménages inscrits', 'Abonnés actifs', 'dont en délai de grâce', 'Taux de paiement (%)',
      'Passages réalisés', 'Passages planifiés', 'Taux d’exécution (%)', 'Rétention (%)', 'Délai moyen des signalements (h)',
      'Signalements résolus', 'Signalements en attente', 'Part du Mobile Money (%)', 'Encaissé hors espèces (FCFA)',
      'Encaissé total (FCFA)', 'Incidents terrain', 'Incidents pour 1 000 passages', 'Relevé le', 'Mode',
    ];
    const lignes = releves
      .filter((r) => r.valeurs)
      .map(({ valeurs: v, calcule_at, mode }) => [
        v!.debut, v!.fin, v!.menages_inscrits, v!.abonnes_actifs.valeur, v!.abonnes_actifs.dont_grace,
        dec(v!.taux_paiement.valeur, 100), v!.taux_execution.num, v!.taux_execution.den, dec(v!.taux_execution.valeur, 100),
        dec(v!.retention.valeur, 100), dec(v!.delai_signalement_h.valeur), v!.delai_signalement_h.n, v!.delai_signalement_h.en_attente,
        dec(v!.part_mobile_money.valeur, 100), v!.part_mobile_money.num, v!.part_mobile_money.den,
        v!.incidents_1000.num, dec(v!.incidents_1000.valeur), calcule_at ? calcule_at.slice(0, 10) : '', mode,
      ]);
    csv = documentCsv(entetes, lignes);
  }

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="indicateurs-pilote-${type}-${perimetre}-${t.aujourdhui}.csv"`,
    },
  });
}
