import Link from 'next/link';
import { AlertCircle, AlertTriangle, BadgeCheck, Hourglass, Inbox, MapPin, Send } from 'lucide-react';
import { PrecoShell } from '@/components/precollecteur/shell';
import { EmptyState, PageHeader } from '@/components/ui/blocks';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { TarifFields } from '@/components/precollecteur/tarif-fields';
import { requireEntreprise } from '@/lib/precollecteur/context';
import { proposerDevisAction, retirerDevisAction } from '@/lib/precollecteur/actions';
import { etatDossier } from '@/lib/dossier';
import { ACCES_VOIE, aDesDasri, CATEGORIES, GABARITS, libelleFrequence, libelleTarif, resumerReponses } from '@/lib/devis';
import { parametre, rows, rpc } from '@/lib/server';
import { dateFr } from '@/lib/format';
import type { DemandeOuverte } from '@/lib/types';

export const metadata = { title: 'Demandes de devis' };

/**
 * Demandes de devis de son secteur (commune déclarée ou quartier desservi), ou
 * adressées à lui depuis l'annuaire. Identité de l'abonné masquée : nom,
 * téléphone, repère et position n'apparaissent qu'une fois le devis accepté,
 * dans la fiche client.
 */
export default async function DemandesPage({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const { erreur } = await searchParams;
  const { supabase, entreprise } = await requireEntreprise();
  const verifie = etatDossier(entreprise.dossier_statut) === 'valide';
  const [{ data }, ouverts] = await Promise.all([rpc(supabase, 'demandes_devis_ouvertes'), parametre(supabase, 'devis_ouverts', 0)]);
  const demandes = rows<DemandeOuverte>(data);
  const devisOuverts = ouverts === 1;

  return (
    <PrecoShell path="/precollecteur/demandes">
      <PageHeader
        titre="Demandes de devis"
        sousTitre="Les abonnés de votre secteur décrivent leurs besoins : proposez votre tarif. Leur nom, leur téléphone et leur adresse s’affichent dans la fiche client dès qu’ils acceptent votre devis."
      />
      {erreur && (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-terrain-stop/25 bg-terrain-stop/5 px-3 py-2 text-body-sm text-terrain-stop">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {erreur}
        </p>
      )}
      {!verifie && (
        <Link href="/precollecteur/dossier" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-terrain-relance/30 bg-terrain-relance/5 px-4 py-3 text-body-sm font-semibold text-terrain-relance">
          <span className="flex items-center gap-2"><BadgeCheck size={18} /> Les demandes de devis arrivent une fois votre dossier vérifié par MyKlinTown.</span>
          <span aria-hidden>→</span>
        </Link>
      )}
      {verifie && !devisOuverts && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-brand-blue/20 bg-brand-blue/5 px-4 py-3 text-body-sm text-brand-blue">
          <Hourglass size={18} className="mt-0.5 shrink-0" />
          Liste d’attente jusqu’au lancement officiel : vous voyez les demandes de votre secteur et vous pourrez proposer votre tarif dès l’ouverture des devis.
        </p>
      )}

      {demandes.length === 0 ? (
        <div className="card-soft">
          <EmptyState icon={Inbox} titre="Aucune demande de devis" texte="Les demandes des abonnés de vos communes et de vos quartiers apparaîtront ici." />
        </div>
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">
          {demandes.map((d) => {
            const categorie = CATEGORIES.find((c) => c.cle === d.categorie)?.label ?? d.categorie;
            const reponses = resumerReponses(d.categorie, d.details);
            const enAttenteDeReponse = d.mon_devis_statut === 'propose';
            return (
              <li key={d.id} className="card-soft space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-brand-ink">{categorie}</p>
                    <p className="flex items-center gap-1.5 text-small text-muted-foreground">
                      <MapPin size={14} /> {[d.quartier, d.commune].filter(Boolean).join(' · ')} · le {dateFr(d.created_at, { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <span className="flex flex-wrap gap-1.5">
                    {d.ciblee && <span className="chip-ok">Vous a choisi</span>}
                    {d.nb_devis > (enAttenteDeReponse ? 1 : 0) && <span className="chip-neutre">{d.nb_devis - (enAttenteDeReponse ? 1 : 0)} autre(s) devis</span>}
                  </span>
                </div>
                <ul className="space-y-0.5 text-body-sm">
                  <li>{libelleFrequence(d.passages_semaine)}{d.sacs_besoin ? ` · sacs demandés (${d.sacs_volume_litres} L)` : ''}</li>
                  {(d.acces_voie || d.gabarit_max) && (
                    <li>Accès : {[d.acces_voie && ACCES_VOIE[d.acces_voie], d.gabarit_max && `jusqu’à ${GABARITS[d.gabarit_max]?.toLowerCase()}`].filter(Boolean).join(', ')}</li>
                  )}
                  {d.inaccessible_pluies && <li className="text-terrain-relance">Inaccessible en saison des pluies</li>}
                  {reponses.map((r) => <li key={r} className="text-muted-foreground">{r}</li>)}
                </ul>
                {aDesDasri(d.categorie, d.details) && (
                  <p className="flex items-start gap-2 text-small font-semibold text-terrain-stop">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" /> DASRI déclarés : un précollecteur certifié DASRI est obligatoire.
                  </p>
                )}

                {enAttenteDeReponse ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-green/5 px-3 py-2 text-body-sm">
                    <span>Votre devis : <strong>{libelleTarif(d.mon_tarif_fcfa, d.mon_facturation_mois)}</strong>, en attente de réponse</span>
                    <form action={retirerDevisAction}>
                      <input type="hidden" name="devis_id" value={d.mon_devis_id ?? ''} />
                      <SubmitButton variant="ghost" pendingLabel="Retrait…">Retirer</SubmitButton>
                    </form>
                  </div>
                ) : (
                  <details className="rounded-lg border border-border" open={d.ciblee}>
                    <summary className="cursor-pointer list-none px-3 py-2 text-body-sm font-semibold text-brand-blue">
                      <Send size={14} className="mr-1.5 inline" />
                      {d.mon_devis_statut === 'refuse' ? 'Refusé : proposer un autre tarif' : 'Proposer un tarif'}
                    </summary>
                    <ActionForm action={proposerDevisAction} className="space-y-3 border-t border-border p-3">
                      <input type="hidden" name="demande_id" value={d.id} />
                      <TarifFields id={`t-${d.id}`} defaut={{ passages: d.passages_semaine, sacs: d.sacs_besoin, volume: d.sacs_volume_litres }} />
                      <div>
                        <label htmlFor={`note-${d.id}`} className="field-label">Message à l’abonné</label>
                        <input id={`note-${d.id}`} name="note" maxLength={500} className="field" placeholder="ex. Passage le matin avant 8 h" />
                      </div>
                      <SubmitButton className="w-full" pendingLabel="Envoi…" disabled={!devisOuverts}>
                        Proposer ce tarif
                      </SubmitButton>
                    </ActionForm>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PrecoShell>
  );
}
