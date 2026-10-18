import Link from 'next/link';
import { Info } from 'lucide-react';
import { cn } from '@myklintown/ui';
import { PrecoShell } from '@/components/precollecteur/shell';
import { PageHeader, Section } from '@/components/ui/blocks';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { requireEntreprise } from '@/lib/precollecteur/context';
import { enregistrerChargesAction } from '@/lib/precollecteur/actions';
import { parametre, rows } from '@/lib/server';
import { dateFr, fcfa, nombre } from '@/lib/format';
import { CATEGORIES_CHARGES, derniersMois, finDeMois, moisCourant, moisValide } from '@/lib/charges';

export const metadata = { title: 'Charges du mois' };

interface LigneCout {
  mois: string;
  categorie: string;
  montant_fcfa: number;
  note: string | null;
}

/** Début du jour à Yaoundé (UTC+1, sans heure d'été), en horodatage ISO. */
const debutJourDouala = (jour: string) => `${jour}T00:00:00+01:00`;

export default async function ChargesPage({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  const demande = (await searchParams).mois;
  const mois = moisValide(demande) ? demande : moisCourant();
  const debut = `${mois}-01`;
  const fin = finDeMois(mois);
  const lendemain = new Date(Date.UTC(Number(fin.slice(0, 4)), Number(fin.slice(5, 7)) - 1, Number(fin.slice(8)) + 1)).toISOString().slice(0, 10);
  const { supabase, entreprise } = await requireEntreprise();

  const [co, servis, pa, taux] = await Promise.all([
    supabase.from('couts_exploitation').select('mois, categorie, montant_fcfa, note').eq('entreprise_id', entreprise.id).order('mois', { ascending: false }),
    // Ménages servis au moins une fois dans le mois (hors démonstration).
    supabase
      .from('clients')
      .select('id, collectes!inner(id)', { count: 'exact', head: true })
      .eq('entreprise_id', entreprise.id)
      .eq('est_demo', false)
      .eq('collectes.statut', 'realisee')
      .gte('collectes.date_prevue', debut)
      .lte('collectes.date_prevue', fin),
    supabase
      .from('paiements_clients')
      .select('montant_fcfa, clients!inner(est_demo)')
      .eq('entreprise_id', entreprise.id)
      .eq('statut', 'valide')
      .eq('clients.est_demo', false)
      .gte('created_at', debutJourDouala(debut))
      .lt('created_at', debutJourDouala(lendemain)),
    parametre(supabase, 'commission_taux', 0.1),
  ]);

  const couts = rows<LigneCout>(co.data);
  const duMois = couts.filter((c) => c.mois === debut);
  const valeurDe = (cle: string) => duMois.find((c) => c.categorie === cle)?.montant_fcfa;
  const total = duMois.reduce((s, c) => s + c.montant_fcfa, 0);
  const menages = servis.count ?? 0;
  const encaisse = rows<{ montant_fcfa: number }>(pa.data).reduce((s, p) => s + p.montant_fcfa, 0);
  const garde = Math.round(encaisse * (1 - taux));

  const historique = Array.from(
    couts.reduce((m, c) => m.set(c.mois, (m.get(c.mois) ?? 0) + c.montant_fcfa), new Map<string, number>()),
  );
  const nomMois = dateFr(debut, { month: 'long', year: 'numeric' });

  return (
    <PrecoShell path="/precollecteur/charges">
      <PageHeader
        titre="Charges du mois"
        sousTitre="Ce que vous coûte la collecte. Avec vos passages, la plateforme calcule votre coût par ménage servi."
      />

      <nav aria-label="Mois" className="mb-5 flex flex-wrap gap-1.5">
        {derniersMois(6).map((m) => (
          <Link
            key={m}
            href={`/precollecteur/charges?mois=${m}`}
            aria-current={m === mois ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1 text-body-sm font-semibold capitalize',
              m === mois ? 'border-brand-ink bg-brand-ink text-white' : 'border-border bg-surface text-muted-foreground hover:bg-muted',
            )}
          >
            {dateFr(`${m}-01`, { month: 'short', year: '2-digit' })}
          </Link>
        ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section titre={`Charges de ${nomMois}`} sousTitre="En FCFA, pour tout le mois. Laissez vide ce que vous n’avez pas encore.">
          <ActionForm key={mois} action={enregistrerChargesAction} className="space-y-4">
            <input type="hidden" name="mois" value={mois} />
            {CATEGORIES_CHARGES.map((c) => (
              <div key={c.cle}>
                <label htmlFor={`charge-${c.cle}`} className="field-label">
                  {c.label}
                </label>
                <input
                  id={`charge-${c.cle}`}
                  name={c.cle}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0"
                  defaultValue={valeurDe(c.cle) ?? ''}
                  className="field num"
                />
                <p className="field-hint">{c.aide}</p>
              </div>
            ))}
            <div>
              <label htmlFor="note-autres" className="field-label">
                Précisez les autres charges <span className="font-normal text-muted-foreground">(facultatif)</span>
              </label>
              <input
                id="note-autres"
                name="note_autres"
                maxLength={500}
                defaultValue={duMois.find((c) => c.categorie === 'autres')?.note ?? ''}
                className="field"
              />
            </div>
            <SubmitButton>Enregistrer les charges de {dateFr(debut, { month: 'long' })}</SubmitButton>
          </ActionForm>
        </Section>

        <div className="space-y-6">
          <Section titre="Votre coût par ménage servi" sousTitre={nomMois}>
            <dl className="space-y-3 text-body-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Charges saisies</dt>
                <dd className="num font-semibold text-brand-ink">{total ? fcfa(total) : '—'}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Ménages servis au moins une fois</dt>
                <dd className="num font-semibold text-brand-ink">{nombre(menages)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
                <dt className="font-semibold text-brand-ink">Coût par ménage servi</dt>
                <dd className="num text-h2-sm font-bold text-brand-ink" data-testid="cout-par-menage">
                  {total && menages ? fcfa(Math.round(total / menages)) : '—'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Ce que vous gardez par ménage servi</dt>
                <dd className="num font-semibold text-brand-ink">{menages ? fcfa(Math.round(garde / menages)) : '—'}</dd>
              </div>
            </dl>
            <p className="mt-3 text-small text-muted-foreground">
              « Ce que vous gardez » : vos encaissements validés du mois ({fcfa(encaisse)}), moins la commission MyKlinTown de{' '}
              {Math.round(taux * 100)} %. Tant que le coût reste en dessous, la collecte vous rapporte.
            </p>
          </Section>

          {historique.length > 0 && (
            <Section titre="Mois saisis" flush>
              <ul className="divide-y divide-border">
                {historique.map(([m, t]) => (
                  <li key={m}>
                    <Link href={`/precollecteur/charges?mois=${m.slice(0, 7)}`} className="flex items-center justify-between gap-3 px-5 py-3 text-body-sm hover:bg-muted/40">
                      <span className="font-semibold capitalize text-brand-ink">{dateFr(m, { month: 'long', year: 'numeric' })}</span>
                      <span className="num">{fcfa(t)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <p className="flex items-start gap-2 rounded-lg bg-brand-blue/5 p-4 text-body-sm text-brand-blue">
            <Info size={18} className="mt-0.5 shrink-0" />
            Seuls vous et l’équipe MyKlinTown voyez ces montants. La Mairie ne voit que des totaux par ville, dans les indicateurs du pilote.
          </p>
        </div>
      </div>
    </PrecoShell>
  );
}
