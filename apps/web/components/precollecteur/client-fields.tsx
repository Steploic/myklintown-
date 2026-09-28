import { LocationPicker } from '@/components/map/location-picker';
import { fcfa } from '@/lib/format';
import type { ClientStatut, Plan, Zone } from '@/lib/types';

/** Cartes de formule : on choisit DANS la grille, on ne saisit jamais un prix. */
export function PlanPicker({ plans, defaut, name = 'plan_id' }: { plans: Plan[]; defaut?: string | null; name?: string }) {
  return (
    <fieldset>
      <legend className="field-label">Formule (grille tarifaire MyKlinTown) *</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {plans.map((p, i) => (
          <label
            key={p.id}
            className="relative flex cursor-pointer flex-col rounded-lg border border-input bg-surface p-3 transition-colors has-[:checked]:border-brand-green has-[:checked]:bg-brand-green/5 has-[:checked]:ring-1 has-[:checked]:ring-brand-green"
          >
            <input
              type="radio"
              name={name}
              value={p.id}
              required
              defaultChecked={defaut ? defaut === p.id : i === 0}
              className="peer sr-only"
            />
            <span className="text-body-sm font-semibold text-brand-ink">{p.nom}</span>
            <span className="num text-h2-sm font-bold text-brand-green">{fcfa(p.prix_fcfa)}</span>
            <span className="text-small text-muted-foreground">
              {p.duree_mois === 1 ? 'par mois' : `pour ${p.duree_mois} mois`} · {p.passages_semaine} passages / sem.
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ClientFields({
  plans,
  zones,
  client,
}: {
  plans: Plan[];
  zones: Zone[];
  client?: ClientStatut | null;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="nom" className="field-label">Nom du client / du foyer *</label>
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

      <PlanPicker plans={plans} defaut={client?.plan_id} />

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
