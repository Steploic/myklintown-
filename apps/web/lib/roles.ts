/**
 * Rôles utilisateur et routage par portail.
 * Partagé entre le middleware (protection des routes) et les Server Actions auth.
 * Doit rester aligné sur l'enum `user_role` de la base (migration init).
 */
export type UserRole = 'citoyen' | 'collecteur' | 'mairie' | 'enterprise' | 'admin';

/** Page d'accueil de chaque rôle après connexion. */
export const ROLE_HOME: Record<UserRole, string> = {
  citoyen: '/citoyen',
  collecteur: '/collecteur',
  mairie: '/dashboard',
  enterprise: '/enterprise',
  admin: '/dashboard',
};

/**
 * Rôles qu'un visiteur peut s'attribuer lui-même en s'inscrivant.
 *
 * `collecteur`, `mairie` et `admin` en sont exclus : ils ouvrent l'accès aux
 * données des ménages, aux tournées et aux encaissements. Ils se promeuvent
 * côté serveur, ils ne se demandent pas.
 *
 * ⚠️ Doit rester aligné sur `handle_new_user()` dans `supabase/setup_rls.sql`.
 * C'est la base qui fait autorité — cette liste n'est qu'un garde-fou en amont,
 * pour rendre le refus lisible plutôt que silencieux.
 */
export const SELF_SERVICE_ROLES = ['citoyen', 'enterprise'] as const;

export type SelfServiceRole = (typeof SELF_SERVICE_ROLES)[number];

export function isSelfServiceRole(value: string): value is SelfServiceRole {
  return (SELF_SERVICE_ROLES as readonly string[]).includes(value);
}

/** Préfixes de routes nécessitant une authentification. */
export const PROTECTED_PREFIXES = [
  '/citoyen',
  '/collecteur',
  '/dashboard',
  '/enterprise',
  '/settings',
] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

/**
 * Portails accessibles à chaque rôle.
 *
 * Être connecté ne suffit pas : encore faut-il être connecté *en tant que*.
 * Sans cette table, un ménage authentifié ouvrait le tableau de bord Mairie —
 * la RLS l'aurait empêché de lire quoi que ce soit, mais l'interface s'ouvrait.
 *
 * `/settings` est commun à tous : chacun y gère son propre compte.
 */
export const ROLE_ALLOWED_PREFIXES: Record<UserRole, readonly string[]> = {
  citoyen: ['/citoyen', '/settings'],
  collecteur: ['/collecteur', '/settings'],
  mairie: ['/dashboard', '/settings'],
  enterprise: ['/enterprise', '/settings'],
  admin: ['/citoyen', '/collecteur', '/dashboard', '/enterprise', '/settings'],
};

/** Ce rôle a-t-il le droit d'ouvrir ce chemin ? Refuse par défaut. */
export function canAccessPath(role: string | null | undefined, pathname: string): boolean {
  if (!role || !(role in ROLE_ALLOWED_PREFIXES)) return false;
  return ROLE_ALLOWED_PREFIXES[role as UserRole].some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}

export function homeForRole(role: string | null | undefined): string {
  if (role && role in ROLE_HOME) return ROLE_HOME[role as UserRole];
  return '/citoyen';
}
