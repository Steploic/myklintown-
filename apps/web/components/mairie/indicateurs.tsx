import Link from 'next/link';
import { cn } from '@myklintown/ui';
import { Volet } from '@/components/ui/volet';
import { TauxHebdoChart } from '@/components/mairie/indicateurs-chart';
import { dateFr, nombre } from '@/lib/format';
import {
  INDICATEURS,
  PERIMETRES,
  VERDICTS,
  cibleDe,
  criteres,
  detail,
  evaluer,
  libelleCible,
  rangMois,
  valeurDe,
  type DefIndicateur,
  type MoisPilote,
  type Perimetre,
  type TableauIndicateurs,
  type ValeursKpi,
} from '@/lib/indicateurs';

const nomMois = (debut: string) => dateFr(debut, { month: 'long', year: 'numeric' });
const jourCourt = (d: string) => dateFr(d, { day: 'numeric', month: 'short' });

/** Valeur de référence des incidents : celle du premier mois du pilote. */
export function referenceIncidents(t: TableauIndicateurs): number | null {
  return t.mois[0]?.valeurs?.incidents_1000.valeur ?? null;
}

export function OngletsPerimetre({ actif }: { actif: Perimetre }) {
  return (
    <nav aria-label="Périmètre" className="no-print mb-5 inline-flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
      {PERIMETRES.map((p) => (
        <Link
          key={p.cle}
          href={p.cle === 'pilote' ? '/dashboard/indicateurs' : `/dashboard/indicateurs?perimetre=${p.cle}`}
          aria-current={p.cle === actif ? 'page' : undefined}
          className={cn(
            'rounded-md px-3 py-1.5 text-body-sm font-semibold transition-colors',
            p.cle === actif ? 'bg-brand-ink text-white' : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {p.label}
        </Link>
      ))}
    </nav>
  );
}

function CarteIndicateur({
  def,
  v,
  mois,
  rang,
  t,
}: {
  def: DefIndicateur;
  v: ValeursKpi;
  mois: MoisPilote;
  rang: number;
  t: TableauIndicateurs;
}) {
  const ref = referenceIncidents(t);
  const valeur = valeurDe(v, def.cle);
  const cible = cibleDe(t.cibles, def.cle, rang, ref);
  const verdict = VERDICTS[evaluer(def, valeur, cible, mois.etat)];
  const avancement = def.cumul && valeur != null && cible ? Math.min(100, Math.round((valeur / cible) * 100)) : null;

  return (
    <article className="card-soft flex flex-col p-4" data-testid={`kpi-${def.cle}`}>
      <h3 className="text-body-sm font-semibold text-brand-ink">{def.label}</h3>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p className="num text-[1.75rem] font-bold leading-none text-brand-ink">{valeur == null ? '—' : def.format(valeur)}</p>
        <span className={verdict.chip}>{verdict.label}</span>
      </div>
      <p className="mt-1.5 text-small text-muted-foreground">
        Cible fin {dateFr(mois.debut, { month: 'long' })} : <strong className="text-brand-ink">{libelleCible(t.cibles, def.cle, rang, ref)}</strong>
      </p>
      {avancement != null && (
        <div className="mt-2" aria-label={`${avancement} % de la cible`}>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-brand-green" style={{ width: `${avancement}%` }} />
          </div>
          <p className="mt-1 text-small text-muted-foreground">{avancement} % de la cible</p>
        </div>
      )}
      <p className="mt-auto pt-2 text-small text-muted-foreground">{detail(v, def.cle)}</p>
    </article>
  );
}

export function GrilleMoisCourant({ t, mois }: { t: TableauIndicateurs; mois: MoisPilote }) {
  const v = mois.valeurs!;
  const rang = rangMois(t.cibles, mois.debut);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {INDICATEURS.map((def) => (
        <CarteIndicateur key={def.cle} def={def} v={v} mois={mois} rang={rang} t={t} />
      ))}
    </div>
  );
}

const ETATS_MOIS: Record<MoisPilote['etat'], string> = {
  clos: 'clos',
  en_cours: 'en cours',
  a_venir: 'à venir',
};

/** Le tableau mensuel tel que transmis au Technipole (livrable §8). */
export function TableauMensuel({ t }: { t: TableauIndicateurs }) {
  const ref = referenceIncidents(t);
  return (
    <div className="overflow-x-auto">
      <table className="table-data min-w-[760px]" data-testid="tableau-mensuel">
        <thead>
          <tr>
            <th>Indicateur</th>
            {t.mois.map((m, i) => (
              <th key={m.debut} className="text-right">
                {nomMois(m.debut)} (M{rangMois(t.cibles, m.debut) + 1 || i + 1})
                <span className="block font-normal normal-case tracking-normal">{ETATS_MOIS[m.etat]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {INDICATEURS.map((def) => (
            <tr key={def.cle}>
              <td className="max-w-[260px]">
                <span className="font-semibold text-brand-ink">{def.label}</span>
                <span className="block text-small text-muted-foreground">{def.definition}</span>
              </td>
              {t.mois.map((m) => {
                const rang = rangMois(t.cibles, m.debut);
                const valeur = valeurDe(m.valeurs, def.cle);
                const verdict = m.valeurs ? VERDICTS[evaluer(def, valeur, cibleDe(t.cibles, def.cle, rang, ref), m.etat)] : null;
                return (
                  <td key={m.debut} className="text-right align-top">
                    <span className="num block text-body font-semibold text-brand-ink">
                      {m.etat === 'a_venir' ? '' : valeur == null ? '—' : def.format(valeur)}
                    </span>
                    <span className="block text-small text-muted-foreground">cible {libelleCible(t.cibles, def.cle, rang, ref)}</span>
                    {verdict && m.etat !== 'a_venir' && <span className={cn(verdict.chip, 'mt-1')}>{verdict.label}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const COLONNES_HEBDO: { cle: Exclude<DefIndicateur['cle'], 'cout_par_menage'>; court: string }[] = [
  { cle: 'abonnes_actifs', court: 'Abonnés' },
  { cle: 'taux_paiement', court: 'Paiement' },
  { cle: 'taux_execution', court: 'Exécution' },
  { cle: 'retention', court: 'Rétention' },
  { cle: 'delai_signalement_h', court: 'Délai' },
  { cle: 'part_mobile_money', court: 'MoMo' },
  { cle: 'incidents_1000', court: 'Incidents ‰' },
];

export function SuiviHebdo({ t }: { t: TableauIndicateurs }) {
  const lignes: { debut: string; fin: string; valeurs: ValeursKpi | null; releve: string; rattrapage: boolean; enCours: boolean }[] = [
    ...(t.semaine_en_cours
      ? [{ debut: t.semaine_en_cours.debut, fin: t.semaine_en_cours.fin, valeurs: t.semaine_en_cours, releve: 'en direct', rattrapage: false, enCours: true }]
      : []),
    ...[...t.semaines].reverse().map((s) => ({
      debut: s.debut,
      fin: s.fin,
      valeurs: s.valeurs,
      releve: dateFr(s.calcule_at, { day: 'numeric', month: 'short' }),
      rattrapage: s.mode === 'rattrapage',
      enCours: false,
    })),
  ];
  const points = [...lignes].reverse().map((l) => ({
    semaine: jourCourt(l.debut) + (l.enCours ? ' *' : ''),
    paiement: l.valeurs?.taux_paiement.valeur == null ? null : Math.round(l.valeurs.taux_paiement.valeur * 1000) / 10,
    execution: l.valeurs?.taux_execution.valeur == null ? null : Math.round(l.valeurs.taux_execution.valeur * 1000) / 10,
  }));

  if (!lignes.length) {
    return <p className="p-5 text-body-sm text-muted-foreground">Le premier relevé hebdomadaire sera fait à la fin de la première semaine du pilote.</p>;
  }
  const def = (cle: string) => INDICATEURS.find((x) => x.cle === cle)!;

  return (
    <>
      {points.length > 1 && (
        <div className="border-b border-border p-5">
          <TauxHebdoChart data={points} />
          <p className="mt-1 text-small text-muted-foreground">* semaine en cours, calculée en direct.</p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="table-data min-w-[820px]" data-testid="tableau-hebdo">
          <thead>
            <tr>
              <th>Semaine</th>
              {COLONNES_HEBDO.map((c) => (
                <th key={c.cle} className="whitespace-nowrap text-right" title={def(c.cle).label}>{c.court}</th>
              ))}
              <th className="text-right">Relevé</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.debut}>
                <td className="whitespace-nowrap font-semibold text-brand-ink">
                  {jourCourt(l.debut)} → {jourCourt(l.fin)}
                </td>
                {COLONNES_HEBDO.map((c) => {
                  const valeur = valeurDe(l.valeurs, c.cle);
                  return (
                    <td key={c.cle} className="num text-right">
                      {valeur == null ? '—' : def(c.cle).format(valeur)}
                    </td>
                  );
                })}
                <td className="text-right">
                  {l.enCours ? (
                    <span className="chip-info">en cours</span>
                  ) : l.rattrapage ? (
                    <span className="chip-neutre" title="Relevé calculé plus d’un jour après la fin de la semaine">rattrapé {l.releve}</span>
                  ) : (
                    <span className="text-small text-muted-foreground">{l.releve}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Criteres({ t }: { t: TableauIndicateurs }) {
  return (
    <ul className="divide-y divide-border">
      {criteres(t).map((c) => (
        <li key={c.code} className="flex flex-wrap items-start gap-3 px-5 py-3">
          <span className="grid h-8 w-10 shrink-0 place-content-center rounded-md bg-brand-ink text-small font-bold text-white">{c.code}</span>
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-semibold text-brand-ink">{c.enonce}</p>
            <p className="text-small text-muted-foreground">{c.etat}</p>
          </div>
          <span className={cn(c.chip, 'shrink-0')}>
            {c.chip === 'chip-ok' ? 'Tenu' : c.chip === 'chip-relance' ? 'À surveiller' : 'À mesurer'}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Methode({ t, grace }: { t: TableauIndicateurs; grace: number | null }) {
  return (
    <Volet
      titre="Méthode de calcul"
      className="card-soft no-print mt-6"
      classeTitre="cursor-pointer px-5 py-4 text-body-sm font-semibold text-brand-blue"
    >
      <div className="space-y-4 border-t border-border px-5 py-4 text-body-sm">
        <dl className="grid gap-3 md:grid-cols-2">
          {INDICATEURS.map((d) => (
            <div key={d.cle}>
              <dt className="font-semibold text-brand-ink">{d.label}</dt>
              <dd className="text-muted-foreground">{d.methode}</dd>
            </div>
          ))}
        </dl>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Délai de grâce appliqué : {grace == null ? '—' : `${nombre(grace)} jours`} (paramètre de la plateforme).</li>
          <li>Les données de démonstration sont exclues. Un précollecteur est rattaché à Yaoundé ou à Douala par la commune de ses zones, à défaut par celle de son siège.</li>
          <li>
            Les mois clos et les semaines terminées sont <strong>figés</strong> : la plateforme garde ce qu’elle savait à la date du relevé ; une
            correction ultérieure ne les réécrit pas. Le mois et la semaine en cours sont calculés en direct.
          </li>
          <li>
            {t.releve_planifie
              ? 'Relevé automatique chaque jour à 6 h : la semaine terminée le lundi, le mois terminé le 1er.'
              : 'Relevé fait à l’ouverture de cette page (aucune tâche planifiée sur la base). '}
            Un relevé calculé plus d’un jour après la fin de sa période est marqué « rattrapé ».
          </li>
          <li>Les cibles sont celles du livrable Technipole du 2 septembre 2026 (chapitre 8), lues en base.</li>
        </ul>
      </div>
    </Volet>
  );
}
