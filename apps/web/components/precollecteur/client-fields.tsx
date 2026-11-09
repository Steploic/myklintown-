import { LocationPicker } from '@/components/map/location-picker';
import { TarifFields } from '@/components/precollecteur/tarif-fields';
import type { ClientStatut, Zone } from '@/lib/types';

export function ClientFields({
  zones,
  client,
}: {
  zones: Zone[];
  client?: ClientStatut | null;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="nom" className="field-label">Nom de l’abonné (personne ou structure) *</label>
          <input id="nom" name="nom" required defaultValue={client?.nom ?? ''} className="field" placeholder="ex. Famille Ateba" />
        </div>
        <div>
          <label htmlFor="telephone" className="field-label">Téléphone</label>
          <input id="telephone" name="telephone" type="tel" defaultValue={client?.telephone ?? ''} className="field" placeholder="6 XX XX XX XX" />
          <p className="field-hint">Sert aux rappels et aux relances WhatsApp / SMS.</p>
        </div>
        <div>
          <label htmlFor="quartier" className="field-label">Quartier</label>
          <input id="quartier" name="quartier" defaultValue={client?.quartier ?? ''} className="field" placeholder="ex. Nsam" />
        </div>
        <div>
          <label htmlFor="adresse" className="field-label">Repère / adresse</label>
          <input id="adresse" name="adresse" defaultValue={client?.adresse ?? ''} className="field" placeholder="ex. Portail bleu après la boulangerie" />
        </div>
      </div>

      <fieldset>
        <legend className="field-label">Tarif convenu avec l’abonné</legend>
        <TarifFields
          defaut={{
            tarif: client?.tarif_fcfa ?? client?.plan_prix ?? null,
            mois: client?.facturation_mois ?? client?.plan_duree_mois ?? 1,
            passages: client?.passages_semaine,
            sacs: client?.sacs_inclus,
            volume: client?.sacs_volume_litres,
          }}
        />
      </fieldset>

      <div>
        <p className="field-label">Localisation du domicile</p>
        <LocationPicker
          defaut={client?.lat != null && client?.lng != null ? [client.lat, client.lng] : null}
          zones={zones.map((z) => ({ id: z.id, nom: z.nom, couleur: z.couleur, contour: z.contour }))}
        />
      </div>

      {zones.length > 0 && (
        <div>
          <label htmlFor="zone_id" className="field-label">Zone de collecte</label>
          <select id="zone_id" name="zone_id" defaultValue={client?.zone_id ?? ''} className="field">
            <option value="">Détecter automatiquement depuis la position</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>{z.nom}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="notes" className="field-label">Notes internes</label>
        <textarea id="notes" name="notes" rows={2} defaultValue={client?.notes ?? ''} className="field" placeholder="ex. Chien dans la cour, passer par l’arrière" />
      </div>
    </div>
  );
}
