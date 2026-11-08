import { canAccessPath, homeForRole, isProtectedPath } from './roles';
import { cheminInterne } from './metier';

/**
 * Où envoyer un compte connecté : la page demandée avant la connexion si elle
 * est interne et ouverte à son rôle, sinon l'accueil de son espace.
 *
 * Module à part de `roles.ts` : le middleware importe `roles.ts` et n'a pas à
 * embarquer `metier.ts`.
 */
export function destinationApresConnexion(role: string | null | undefined, suite?: string | null): string {
  if (cheminInterne(suite)) {
    const chemin = suite!.split('?')[0]!;
    if (!isProtectedPath(chemin) || canAccessPath(role, chemin)) return suite!;
  }
  return homeForRole(role);
}
