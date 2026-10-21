import { MapPinOff } from 'lucide-react';

/**
 * Compte Mairie rattaché à aucune commune (migration 20261019000016) : la base
 * ne lui montre rien. On le lui dit, plutôt que des pages vides sans raison.
 */
export function AvisSansCommune() {
  return (
    <div role="alert" data-testid="avis-sans-commune" className="mb-6 flex items-start gap-3 rounded-xl border border-terrain-relance/30 bg-terrain-relance/5 p-4">
      <MapPinOff size={20} className="mt-0.5 shrink-0 text-terrain-relance" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold text-brand-ink">Votre compte Mairie n’est rattaché à aucune commune</p>
        <p className="mt-0.5 text-body-sm text-muted-foreground">
          Vous ne voyez donc ni zone, ni précollecteur, ni indicateur. Demandez à l’équipe MyKlinTown de rattacher votre compte à votre
          commune : l’accès s’ouvre aussitôt, sans nouvelle demande.
        </p>
      </div>
    </div>
  );
}
