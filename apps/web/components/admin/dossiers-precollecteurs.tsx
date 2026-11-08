import { BadgeCheck, Check, X } from 'lucide-react';
import { Section } from '@/components/ui/blocks';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { CarteVitrine } from '@/components/annuaire/carte-vitrine';
import { statuerDossierAction } from '@/lib/admin/dossiers-actions';
import { ETATS_DOSSIER, etatDossier } from '@/lib/dossier';
import { dateFr, telLisible } from '@/lib/format';
import type { DossierStatut } from '@/lib/types';

export interface DossierEntreprise {
  id: string;
  nom: string;
  telephone: string | null;
  email: string | null;
  niu: string | null;
  siege: string | null;
  devise: string | null;
  quartiers: string[] | null;
  logo_path: string | null;
  permis_env_path: string | null;
  dossier_statut: DossierStatut | null;
  dossier_motif: string | null;
  dossier_soumis_at: string | null;
  dossier_statue_at: string | null;
  entreprise_communes: { commune_id: string; autorisation_path: string | null; communes: { nom: string } | null }[] | null;
}

const ORDRE: Record<DossierStatut, number> = { soumis: 0, refuse: 1, incomplet: 2, valide: 3 };

/**
 * Dossiers des précollecteurs, pour l'équipe MyKlinTown : ceux à vérifier en
 * tête, pièces ouvertes par URL signée, puis la décision.
 */
export function DossiersPrecollecteurs({ dossiers, urls }: { dossiers: DossierEntreprise[]; urls: Map<string, string> }) {
  const tries = [...dossiers].sort(
    (a, b) =>
      ORDRE[etatDossier(a.dossier_statut)] - ORDRE[etatDossier(b.dossier_statut)] ||
      (a.dossier_soumis_at ?? '').localeCompare(b.dossier_soumis_at ?? ''),
  );
  const aVerifier = tries.filter((d) => etatDossier(d.dossier_statut) === 'soumis');
  const autres = tries.filter((d) => etatDossier(d.dossier_statut) !== 'soumis');

  return (
    <Section
      className="mt-6"
      titre="Dossiers des précollecteurs"
      sousTitre={`${aVerifier.length} dossier${aVerifier.length > 1 ? 's' : ''} à vérifier. Un dossier validé ouvre la place du précollecteur dans l’annuaire public.`}
    >
      <div className="space-y-4">
        {aVerifier.map((d) => (
          <article key={d.id} className="rounded-xl border border-brand-blue/25 p-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
              <div className="space-y-3 text-body-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-h2-sm font-semibold text-brand-ink">{d.nom}</span>
                  <span className={ETATS_DOSSIER.soumis.chip}>Envoyé le {d.dossier_soumis_at ? dateFr(d.dossier_soumis_at) : '—'}</span>
                </p>
                <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
                  <dt className="text-muted-foreground">NIU</dt>
                  <dd className="num font-semibold">{d.niu ?? '—'}</dd>
                  <dt className="text-muted-foreground">Siège social</dt>
                  <dd>{d.siege ?? '—'}</dd>
                  <dt className="text-muted-foreground">Contact</dt>
                  <dd>{[telLisible(d.telephone), d.email].filter(Boolean).join(' · ') || '—'}</dd>
                  <dt className="text-muted-foreground">Quartiers</dt>
                  <dd>{d.quartiers?.length ? d.quartiers.join(', ') : '—'}</dd>
                  <dt className="text-muted-foreground">Permis environnemental</dt>
                  <dd><Lien chemin={d.permis_env_path} urls={urls} /></dd>
                  {(d.entreprise_communes ?? []).map((c) => (
                    <Ligne key={c.commune_id} titre={`Autorisation · ${c.communes?.nom ?? 'commune'}`}>
                      <Lien chemin={c.autorisation_path} urls={urls} />
                    </Ligne>
                  ))}
                </dl>
              </div>
              <div className="space-y-3">
                <CarteVitrine nom={d.nom} devise={d.devise} logoPath={d.logo_path} />
                <ActionForm action={statuerDossierAction}>
                  <input type="hidden" name="entreprise_id" value={d.id} />
                  <input type="hidden" name="decision" value="valide" />
                  <SubmitButton className="w-full" pendingLabel="Validation…">
                    <Check size={16} /> Valider le dossier
                  </SubmitButton>
                </ActionForm>
                <ActionForm action={statuerDossierAction} className="space-y-2">
                  <input type="hidden" name="entreprise_id" value={d.id} />
                  <input type="hidden" name="decision" value="refuse" />
                  <label htmlFor={`motif-${d.id}`} className="field-label">Motif du refus</label>
                  <input id={`motif-${d.id}`} name="motif" required maxLength={500} className="field" placeholder="ex. Autorisation de Yaoundé III illisible" />
                  <SubmitButton variant="danger" className="w-full" pendingLabel="Refus…">
                    <X size={16} /> Refuser
                  </SubmitButton>
                </ActionForm>
              </div>
            </div>
          </article>
        ))}

        {autres.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {autres.map((d) => {
              const etat = etatDossier(d.dossier_statut);
              return (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-body-sm">
                  <span className="flex items-center gap-2 font-semibold text-brand-ink">
                    <BadgeCheck size={16} className="text-muted-foreground" /> {d.nom}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {etat === 'refuse' && d.dossier_motif && <span className="text-small text-muted-foreground">{d.dossier_motif}</span>}
                    <span className={ETATS_DOSSIER[etat].chip}>{ETATS_DOSSIER[etat].label}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Section>
  );
}

function Ligne({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{titre}</dt>
      <dd>{children}</dd>
    </>
  );
}

function Lien({ chemin, urls }: { chemin: string | null; urls: Map<string, string> }) {
  if (!chemin) return <span className="chip-relance">Manquante</span>;
  const url = urls.get(chemin);
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-brand-blue hover:underline">Ouvrir la pièce</a>
  ) : (
    <span className="chip-neutre">Fichier introuvable</span>
  );
}
