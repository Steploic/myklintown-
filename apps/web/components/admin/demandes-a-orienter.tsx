import { Compass, MapPin, Phone } from 'lucide-react';
import { Section } from '@/components/ui/blocks';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { orienterDemandeAction } from '@/lib/admin/devis-actions';
import { CATEGORIES, libelleFrequence } from '@/lib/devis';
import { dateFr, telInternational, telLisible } from '@/lib/format';
import type { DemandeAOrienter } from '@/lib/types';

/**
 * Demandes de devis qu'aucun précollecteur vérifié ne reçoit, pour l'équipe
 * MyKlinTown (migration 20261111000019) : elle précise la commune, ou adresse
 * la demande à un précollecteur vérifié. Sans cette liste, ces abonnés
 * attendraient sans que personne le sache.
 */
export function DemandesAOrienter({
  demandes,
  communes,
  verifies,
}: {
  demandes: DemandeAOrienter[];
  communes: { id: string; nom: string }[];
  verifies: { id: string; nom: string }[];
}) {
  return (
    <Section
      className="mt-6"
      titre="Demandes de devis à orienter"
      sousTitre={
        demandes.length
          ? `${demandes.length} demande${demandes.length > 1 ? 's' : ''} qu’aucun précollecteur vérifié ne reçoit : précisez la commune, ou adressez-la à un précollecteur vérifié.`
          : 'Chaque demande de devis en attente arrive à au moins un précollecteur vérifié.'
      }
    >
      {demandes.length > 0 && (
        <ul className="space-y-4">
          {demandes.map((d) => {
            const tel = telInternational(d.telephone);
            return (
              <li key={d.id} className="rounded-xl border border-border p-4">
                <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
                  <div className="space-y-1.5 text-body-sm">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-brand-ink">{CATEGORIES.find((c) => c.cle === d.categorie)?.label ?? d.categorie}</span>
                      <span className="text-muted-foreground">le {dateFr(d.created_at, { day: 'numeric', month: 'long' })}</span>
                    </p>
                    <p className="flex flex-wrap items-center gap-1.5">
                      <MapPin size={14} className="text-muted-foreground" /> {d.quartier}
                      {d.commune ? <span className="text-muted-foreground">· {d.commune}</span> : <span className="chip-relance">commune inconnue</span>}
                    </p>
                    <p className="text-muted-foreground">Repère : {d.repere}</p>
                    <p className="text-muted-foreground">{libelleFrequence(d.passages_semaine)}</p>
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{d.nom}</span>
                      {tel ? (
                        <a href={`tel:+${tel}`} className="inline-flex items-center gap-1 font-semibold text-brand-blue hover:underline">
                          <Phone size={14} /> {telLisible(d.telephone)}
                        </a>
                      ) : (
                        <span>{d.telephone}</span>
                      )}
                      {d.whatsapp && d.whatsapp !== d.telephone && <span className="text-muted-foreground">WhatsApp {telLisible(d.whatsapp)}</span>}
                    </p>
                    {d.cible && <p className="text-terrain-relance">Avait choisi {d.cible}, dont le dossier n’est plus vérifié.</p>}
                    {d.precollecteurs_secteur > 0 && (
                      <p className="text-brand-blue">
                        {d.precollecteurs_secteur} précollecteur{d.precollecteurs_secteur > 1 ? 's' : ''} y travaille{d.precollecteurs_secteur > 1 ? 'nt' : ''} sans
                        dossier vérifié : valider leur dossier suffit.
                      </p>
                    )}
                  </div>
                  <ActionForm action={orienterDemandeAction} className="space-y-2">
                    <input type="hidden" name="demande_id" value={d.id} />
                    <div>
                      <label htmlFor={`commune-${d.id}`} className="field-label">Commune de la demande</label>
                      <select id={`commune-${d.id}`} name="commune_id" defaultValue={d.commune_id ?? ''} className="field">
                        <option value="">— Inchangée —</option>
                        {communes.map((c) => (
                          <option key={c.id} value={c.id}>{c.nom}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`entreprise-${d.id}`} className="field-label">Ou l’adresser à</label>
                      <select id={`entreprise-${d.id}`} name="entreprise_id" defaultValue="" className="field">
                        <option value="">— Aucun précollecteur en particulier —</option>
                        {verifies.map((e) => (
                          <option key={e.id} value={e.id}>{e.nom}</option>
                        ))}
                      </select>
                    </div>
                    <SubmitButton variant="secondary" className="w-full" pendingLabel="Orientation…">
                      <Compass size={16} /> Orienter la demande
                    </SubmitButton>
                  </ActionForm>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
