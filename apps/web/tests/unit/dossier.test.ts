import { afterEach, describe, expect, it, vi } from 'vitest';
import { cheminPiece, etatDossier, lireQuartiers, urlLogo, verifierFichier } from '@/lib/dossier';
import { destinationApresConnexion } from '@/lib/destination';
import { CONTACT, lienAppel, lienWhatsApp } from '@/lib/contact';

const ENTREPRISE = '3f1c2b9e-8d4a-4c1e-9a7b-2e5d6f708192';
const COMMUNE = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
// Même motif que `enregistrer_piece_dossier` (migration 20261109000017).
const FORMAT_BASE = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}$/;

describe('chemin d’une pièce du dossier', () => {
  it('dans le dossier de l’entreprise, au format accepté par la base', () => {
    for (const [piece, type] of [['permis', 'application/pdf'], ['logo', 'image/png'], ['autorisation', 'image/jpeg']] as const) {
      const c = cheminPiece(ENTREPRISE, piece, type, piece === 'autorisation' ? COMMUNE : null);
      expect(c.startsWith(`${ENTREPRISE}/`)).toBe(true);
      expect(c).toMatch(FORMAT_BASE);
    }
  });
  it('l’autorisation porte la commune ; l’extension suit le format', () => {
    expect(cheminPiece(ENTREPRISE, 'autorisation', 'image/webp', COMMUNE)).toMatch(new RegExp(`/autorisation-${COMMUNE}-\\d+\\.webp$`));
    expect(cheminPiece(ENTREPRISE, 'permis', 'image/jpeg')).toMatch(/\/permis-\d+\.jpg$/);
  });
  it('format inconnu : refusé', () => {
    expect(() => cheminPiece(ENTREPRISE, 'permis', 'application/zip')).toThrow(/Format non accepté/);
  });
});

describe('vérification d’un fichier avant envoi', () => {
  it('pièce : photo ou PDF de 5 Mo au plus', () => {
    expect(verifierFichier('permis', { type: 'application/pdf', size: 1_000_000 })).toBeNull();
    expect(verifierFichier('permis', { type: 'image/jpeg', size: 6 * 1024 * 1024 })).toMatch(/5 Mo/);
    expect(verifierFichier('autorisation', { type: 'text/plain', size: 10 })).toMatch(/photo/);
  });
  it('logo : image de 1 Mo au plus, jamais un PDF', () => {
    expect(verifierFichier('logo', { type: 'image/png', size: 200_000 })).toBeNull();
    expect(verifierFichier('logo', { type: 'application/pdf', size: 200_000 })).toMatch(/image/);
    expect(verifierFichier('logo', { type: 'image/png', size: 2 * 1024 * 1024 })).toMatch(/1 Mo/);
  });
});

describe('quartiers saisis', () => {
  it('séparés par virgules, points-virgules ou retours à la ligne ; espaces resserrés', () => {
    expect(lireQuartiers(' Nsam,  Efoulan ;Mvan\n  Biyem   Assi ,,')).toEqual(['Nsam', 'Efoulan', 'Mvan', 'Biyem Assi']);
  });
  it('vide ou absent : aucun ; 40 au plus', () => {
    expect(lireQuartiers('')).toEqual([]);
    expect(lireQuartiers(null)).toEqual([]);
    expect(lireQuartiers(Array.from({ length: 50 }, (_, i) => `Q${i}`).join(','))).toHaveLength(40);
  });
});

describe('état du dossier', () => {
  it('toute valeur inconnue (base sans la migration) vaut « incomplet »', () => {
    expect(etatDossier(undefined)).toBe('incomplet');
    expect(etatDossier('n_importe_quoi')).toBe('incomplet');
    expect(etatDossier('valide')).toBe('valide');
    expect(etatDossier('refuse')).toBe('refuse');
  });
});

describe('adresse publique d’un logo', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('compartiment public `logos`, chemin encodé', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://projet.supabase.co/');
    expect(urlLogo(`${ENTREPRISE}/logo-1.png`)).toBe(`https://projet.supabase.co/storage/v1/object/public/logos/${ENTREPRISE}/logo-1.png`);
  });
  it('sans logo : rien', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://projet.supabase.co');
    expect(urlLogo(null)).toBeNull();
  });
});

describe('destination après connexion (session conservée)', () => {
  it('la page demandée si elle est ouverte au rôle, sinon son espace', () => {
    expect(destinationApresConnexion('precollecteur', '/precollecteur/clients')).toBe('/precollecteur/clients');
    expect(destinationApresConnexion('precollecteur', '/dashboard')).toBe('/precollecteur');
    expect(destinationApresConnexion('citoyen', null)).toBe('/citoyen');
    expect(destinationApresConnexion('citoyen', '/legal/charte')).toBe('/legal/charte');
  });
  it('jamais vers un autre site', () => {
    expect(destinationApresConnexion('citoyen', '//exemple.com/piege')).toBe('/citoyen');
    expect(destinationApresConnexion('citoyen', 'https://exemple.com')).toBe('/citoyen');
    expect(destinationApresConnexion('citoyen', '/\\exemple.com')).toBe('/citoyen');
  });
});

describe('coordonnées publiques', () => {
  it('liens d’appel et WhatsApp sans espaces ni « + » superflus', () => {
    expect(lienAppel(CONTACT.appels[0])).toBe('tel:+237653565348');
    expect(lienWhatsApp(CONTACT.whatsapp)).toBe('https://wa.me/237640129041');
  });
});
