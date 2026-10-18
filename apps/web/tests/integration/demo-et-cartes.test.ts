/**
 * Portails de démonstration retirés et cartes centrées sur la commune de
 * chacun (migration 20261019000015).
 * Ignorés, avec la consigne, tant que la migration n'est pas exécutée.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { clientAnonyme, compte, mairie, precollecteur, type Compte, type Precollecteur } from '../support/fixtures';

let A: Precollecteur;
let M: Compte & { promue: boolean };
let menage: Compte;
let migration = false;

beforeAll(async () => {
  A = await precollecteur('precoA', 'Test Propreté A');
  M = await mairie();
  menage = await compte('intrus', 'citoyen');
  const r = await menage.sb.rpc('centre_carte');
  migration = !r.error;
  if (!migration) {
    console.warn('\n⚠️  Tests « démo retirée, cartes » IGNORÉS : exécuter supabase/migrations/20261019000015_nettoyage_demo_douala.sql\n');
  }
});

describe('inscription : rôles des portails retirés', () => {
  it('demander « enterprise » à l’inscription donne « citoyen »', async ({ skip }) => {
    if (!migration) skip();
    const c = await compte(`partenaire${Date.now()}`, 'enterprise');
    expect(c.role).toBe('citoyen');
  });
});

describe('centre des cartes', () => {
  it('un ménage sans domicile ni demande : Yaoundé', async ({ skip }) => {
    if (!migration) skip();
    const { data, error } = await menage.sb.rpc('centre_carte');
    expect(error).toBeNull();
    expect(data).toEqual([
      { lat: 3.848, lng: 11.502, zoom: 13, lat_min: null, lng_min: null, lat_max: null, lng_max: null, origine: 'defaut' },
    ]);
  });

  it('un précollecteur : un centre (ses zones, sa commune, ses clients, ou Yaoundé)', async ({ skip }) => {
    if (!migration) skip();
    const { data, error } = await A.sb.rpc('centre_carte');
    expect(error).toBeNull();
    const [r] = data as { lat: number; lng: number; origine: string }[];
    expect(['zones', 'commune', 'clients', 'defaut']).toContain(r!.origine);
    expect(Number.isFinite(r!.lat) && Number.isFinite(r!.lng)).toBe(true);
  });

  it('fermé au visiteur anonyme', async ({ skip }) => {
    if (!migration) skip();
    const { error } = await clientAnonyme().rpc('centre_carte');
    expect(error).toBeTruthy();
  });
});

describe('référentiel des communes', () => {
  it('lisible sans compte, centre de carte compris', async ({ skip }) => {
    if (!migration) skip();
    const { data, error } = await clientAnonyme().from('communes').select('code, centre_lat, centre_lng, zoom').in('code', ['YDE3', 'DLA1']).order('code');
    expect(error).toBeNull();
    expect((data ?? []).map((c) => [c.code, c.centre_lat != null, c.centre_lng != null, c.zoom != null])).toEqual([
      ['DLA1', true, true, true],
      ['YDE3', true, true, true],
    ]);
  });

  it('la Mairie ne le modifie plus (administrateur seulement)', async ({ skip }) => {
    if (!migration || !M.promue || M.role !== 'mairie') skip();
    const { data } = await M.sb.from('communes').update({ nom: 'Commune pirate' }).eq('code', 'DLA1').select('id');
    expect(data ?? []).toHaveLength(0);
    const { data: lu } = await clientAnonyme().from('communes').select('nom').eq('code', 'DLA1').single();
    expect(lu?.nom).toBe('Douala I');
  });
});
