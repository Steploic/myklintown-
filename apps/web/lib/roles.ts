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

export function homeForRole(role: string | null | undefined): string {
  if (role && role in ROLE_HOME) return ROLE_HOME[role as UserRole];
  return '/citoyen';
}
