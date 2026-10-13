/**
 * Code d'agrément des précollecteurs (migration 20261013000012) : seuls ceux
 * que la Mairie a autorisés créent leur espace.
 * Ignorés, avec la consigne, tant que la migration n'est pas exécutée.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { compte, mairie, precollecteur, type Compte, type Precollecteur } from '../support/fixtures';

let M: Compte & { promue: boolean };
let A: Precollecteur;
let nouveau: Compte;
let migration = false;
let code = '';
const nom = `Test Agréé ${Date.now().toString().slice(-6)}`;

beforeAll(async () => {
  M = await mairie();
  A = await precollecteur('precoA', 'Test Propreté A');
  migration = !(await A.sb.from('codes_agrement').select('id').limit(1)).error;
  if (!migration) {
    console.warn('\n⚠️  Tests « code d’agrément » IGNORÉS : exécuter supabase/migrations/20261013000012_codes_agrement.sql\n');
    return;
  }
  // Un compte précollecteur neuf, sans entreprise.
  nouveau = await compte(`agree${Date.now()}`, 'precollecteur');
});

describe('la Mairie délivre les codes', () => {
  it('un code de 10 caractères sans ambiguïté (ni I, L, O, U)', async ({ skip }) => {
    if (!migration || !M.promue) skip();
    const { data, error } = await M.sb.rpc('creer_code_agrement', { p_destinataire: nom, p_telephone: '690112233' });
    expect(error).toBeNull();
    code = data as string;
    expect(code).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/);
    const { data: lu } = await M.sb.from('codes_agrement').select('destinataire, utilise_at').eq('code', code).single();
    expect(lu).toEqual({ destinataire: nom, utilise_at: null });
  });

  it('un précollecteur ne s’en délivre pas et ne les lit pas', async ({ skip }) => {
    if (!migration) skip();
    expect((await A.sb.rpc('creer_code_agrement', { p_destinataire: 'Moi' })).error?.message).toMatch(/Réservé à la Mairie/);
    expect((await A.sb.from('codes_agrement').select('id')).data ?? []).toHaveLength(0);
  });
});

describe('création de l’espace', () => {
  it('sans code : refusé', async ({ skip }) => {
    if (!migration) skip();
    const { error } = await nouveau.sb.rpc('creer_mon_entreprise', { p_nom: nom });
    expect(error?.message).toMatch(/Code d’agrément invalide|Code d'agrément invalide/);
  });

  it('avec un code inventé : même refus, sans en dire plus', async ({ skip }) => {
    if (!migration) skip();
    const { error } = await nouveau.sb.rpc('creer_mon_entreprise', { p_nom: nom, p_code: 'ABCDE-FGHJK' });
    expect(error?.message).toMatch(/invalide ou expiré/);
  });

  it('avec le code tapé à sa façon (minuscules, tiret) : espace créé, code consommé', async ({ skip }) => {
    if (!migration || !code) skip();
    const saisie = `${code.slice(0, 5).toLowerCase()}-${code.slice(5)}`;
    const { data: id, error } = await nouveau.sb.rpc('creer_mon_entreprise', { p_nom: nom, p_code: saisie });
    expect(error).toBeNull();
    const { data } = await M.sb.from('codes_agrement').select('utilise_par, entreprise_id').eq('code', code).single();
    expect(data).toEqual({ utilise_par: nouveau.id, entreprise_id: id });
  });

  it('le même code ne sert pas deux fois', async ({ skip }) => {
    if (!migration || !code) skip();
    const autre = await compte(`agree2${Date.now()}`, 'precollecteur');
    expect((await autre.sb.rpc('creer_mon_entreprise', { p_nom: 'Doublon', p_code: code })).error).toBeTruthy();
  });

  it('un code révoqué ne sert plus ; un code utilisé ne se révoque pas', async ({ skip }) => {
    if (!migration || !M.promue) skip();
    const r = await M.sb.rpc('creer_code_agrement', { p_destinataire: 'À révoquer' });
    const { data: ligne } = await M.sb.from('codes_agrement').select('id').eq('code', r.data as string).single();
    expect((await M.sb.rpc('revoquer_code_agrement', { p_id: ligne!.id })).error).toBeNull();
    const autre = await compte(`agree3${Date.now()}`, 'precollecteur');
    expect((await autre.sb.rpc('creer_mon_entreprise', { p_nom: 'Révoqué', p_code: r.data })).error).toBeTruthy();

    const { data: utilise } = await M.sb.from('codes_agrement').select('id').eq('code', code).single();
    expect((await M.sb.rpc('revoquer_code_agrement', { p_id: utilise!.id })).error).toBeTruthy();
  });
});
