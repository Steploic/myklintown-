import { describe, expect, it } from 'vitest';
import { canAccessPath, homeForRole, isProtectedPath, isSelfServiceRole, ROLE_HOME } from '@/lib/roles';

describe('rôles auto-attribuables à l’inscription', () => {
  it('ménage et précollecteur : oui', () => {
    expect(isSelfServiceRole('citoyen')).toBe(true);
    expect(isSelfServiceRole('precollecteur')).toBe(true);
  });
  it('mairie, admin, collecteur : jamais', () => {
    expect(isSelfServiceRole('mairie')).toBe(false);
    expect(isSelfServiceRole('admin')).toBe(false);
    expect(isSelfServiceRole('collecteur')).toBe(false);
    expect(isSelfServiceRole('')).toBe(false);
    expect(isSelfServiceRole('ADMIN')).toBe(false);
  });
});

describe('page d’accueil par rôle', () => {
  it.each([
    ['citoyen', '/citoyen'],
    ['precollecteur', '/precollecteur'],
    ['mairie', '/dashboard'],
    ['admin', '/dashboard'],
  ])('%s → %s', (r, h) => expect(homeForRole(r)).toBe(h));
  it('rôle inconnu → espace ménage (le moins privilégié)', () => {
    expect(homeForRole('pirate')).toBe('/citoyen');
    expect(homeForRole(null)).toBe('/citoyen');
  });
  it('chaque page d’accueil est bien accessible à son rôle', () => {
    for (const [role, home] of Object.entries(ROLE_HOME)) expect(canAccessPath(role, home)).toBe(true);
  });
});

describe('chemins protégés', () => {
  it.each(['/citoyen', '/precollecteur/clients', '/dashboard/zones', '/settings', '/collecteur/scan', '/enterprise'])(
    '%s est protégé',
    (p) => expect(isProtectedPath(p)).toBe(true),
  );
  it.each(['/', '/login', '/signup', '/marque', '/legal', '/forgot', '/precollecteurx', '/citoyens'])(
    '%s est public',
    (p) => expect(isProtectedPath(p)).toBe(false),
  );
});

describe('matrice d’accès aux espaces', () => {
  const cas: [string, string, boolean][] = [
    ['precollecteur', '/precollecteur', true],
    ['precollecteur', '/precollecteur/clients/abc', true],
    ['precollecteur', '/dashboard', false],
    ['precollecteur', '/dashboard/zones', false],
    ['precollecteur', '/citoyen', false],
    ['citoyen', '/citoyen/factures', true],
    ['citoyen', '/precollecteur', false],
    ['citoyen', '/dashboard', false],
    ['mairie', '/dashboard/zones', true],
    ['mairie', '/precollecteur', false],
    ['mairie', '/citoyen', false],
    ['admin', '/precollecteur', true],
    ['admin', '/dashboard', true],
    ['citoyen', '/settings', true],
    ['precollecteur', '/settings', true],
    ['mairie', '/settings', true],
    [null as unknown as string, '/citoyen', false],
    ['pirate', '/citoyen', false],
  ];
  it.each(cas)('%s sur %s → %s', (role, chemin, attendu) => expect(canAccessPath(role, chemin)).toBe(attendu));
  it('un préfixe ressemblant n’ouvre pas l’espace (/precollecteurs ≠ /precollecteur)', () => {
    expect(canAccessPath('precollecteur', '/precollecteurs')).toBe(false);
  });
});
