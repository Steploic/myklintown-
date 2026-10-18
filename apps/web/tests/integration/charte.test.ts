/**
 * Charte du ménage et contrat d'abonnement (migration 20261019000014), sur la
 * base de test : lecture publique des versions publiées, acceptation en ligne
 * horodatée (une seule fois), remise papier enregistrée par le précollecteur,
 * et ce qu'aucun compte ne peut faire (écrire une acceptation, publier un texte).
 * Ignorés, avec la consigne, tant que la migration n'est pas exécutée.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { CLE_SERVICE, clientAnonyme, clientServiceTest, compte, plans, precollecteur, type Compte, type Precollecteur } from '../support/fixtures';

let A: Precollecteur;
let B: Precollecteur;
let M: Compte;
let migration = false;
let service: SupabaseClient | null = null;
let planId = '';

const TYPES = ['charte_menage', 'contrat_menage'];

beforeAll(async () => {
  A = await precollecteur('precoA', 'Test Propreté A');
  B = await precollecteur('precoB', 'Test Concurrent B');
  M = await compte('charte', 'citoyen');
  planId = (await plans(A.sb))[0]!.id;
  migration = !(await clientAnonyme().from('documents_legaux').select('id').limit(1)).error;
  if (!migration) {
    console.warn('\n⚠️  Tests « charte et contrat » IGNORÉS : exécuter supabase/migrations/20261019000014_charte_facture_conforme.sql\n');
    return;
  }
  if (CLE_SERVICE) {
    service = clientServiceTest();
    // Le compte de test repart sans acceptation (il est réutilisé d'une exécution à l'autre).
    await service.from('acceptations_documents').delete().eq('user_id', M.id);
  } else {
    console.warn('\n⚠️  Acceptation en ligne NON testée : SUPABASE_SECRET_KEY absente de apps/web/.env.test.local (jamais sur la production)\n');
  }
});

describe('lecture', () => {
  it('sans compte : la charte et le contrat publiés se lisent, pas les brouillons', async ({ skip }) => {
    if (!migration) skip();
    const { data, error } = await clientAnonyme().from('documents_legaux').select('type, version, publie_at');
    expect(error).toBeNull();
    const lignes = (data ?? []) as { type: string; publie_at: string | null }[];
    expect(new Set(lignes.map((d) => d.type))).toEqual(new Set(TYPES));
    expect(lignes.every((d) => d.publie_at)).toBe(true);
  });
});

describe('ce qu’aucun compte ne peut faire', () => {
  it('écrire une acceptation directement (ménage ou gérant)', async ({ skip }) => {
    if (!migration) skip();
    const doc = ((await M.sb.from('documents_legaux').select('id').eq('type', 'charte_menage').limit(1).single()).data as { id: string }).id;
    const ligne = { document_id: doc, user_id: M.id, mode: 'en_ligne' };
    expect((await M.sb.from('acceptations_documents').insert(ligne)).error).toBeTruthy();
    expect((await A.sb.from('acceptations_documents').insert({ ...ligne, entreprise_id: A.entrepriseId })).error).toBeTruthy();
  });

  it('publier ou réécrire un texte (gérant)', async ({ skip }) => {
    if (!migration) skip();
    expect((await A.sb.from('documents_legaux').insert({ type: 'contrat_menage', version: 900, titre: 'Contrat maison', contenu: 'x', publie_at: new Date().toISOString() })).error).toBeTruthy();
    const { data } = await A.sb.from('documents_legaux').update({ contenu: 'réécrit' }).eq('type', 'charte_menage').select('id');
    expect(data ?? []).toEqual([]);
  });

  it('enregistrer une remise papier pour le client d’un autre précollecteur, ou lire son état', async ({ skip }) => {
    if (!migration) skip();
    const c = await A.sb.from('clients').insert({ entreprise_id: A.entrepriseId, nom: 'Foyer de A', plan_id: planId }).select('id').single();
    const id = (c.data as { id: string }).id;
    const r = await B.sb.rpc('accepter_documents', { p_types: TYPES, p_client: id });
    expect(r.error?.message).toMatch(/Réservé à l’équipe|Réservé à l'équipe/);
    expect((await B.sb.rpc('charte_du_client', { p_client: id })).data).toEqual([]);
  });
});

describe('acceptation', () => {
  it('en ligne : les deux documents à accepter, acceptés une seule fois, horodatés', async ({ skip }) => {
    if (!migration || !service) skip();
    const avant = ((await M.sb.rpc('documents_a_accepter')).data ?? []) as { type: string }[];
    expect(avant.map((d) => d.type).sort()).toEqual(TYPES);
    expect((await M.sb.rpc('accepter_documents', { p_types: TYPES })).data).toBe(2);
    expect((await M.sb.rpc('accepter_documents', { p_types: TYPES })).data).toBe(0);
    expect((await M.sb.rpc('documents_a_accepter')).data).toEqual([]);
    const lues = ((await M.sb.from('acceptations_documents').select('mode, accepte_at, auteur_id')).data ?? []) as { mode: string; accepte_at: string; auteur_id: string }[];
    expect(lues).toHaveLength(2);
    for (const a of lues) {
      expect(a.mode).toBe('en_ligne');
      expect(a.auteur_id).toBe(M.id);
      expect(Date.now() - new Date(a.accepte_at).getTime()).toBeLessThan(10 * 60_000);
    }
  });

  it('sur papier : le gérant l’enregistre pour son client, la fiche l’affiche', async ({ skip }) => {
    if (!migration) skip();
    const c = await A.sb.from('clients').insert({ entreprise_id: A.entrepriseId, nom: 'Foyer Papier', plan_id: planId }).select('id').single();
    const id = (c.data as { id: string }).id;
    const avant = ((await A.sb.rpc('charte_du_client', { p_client: id })).data ?? []) as { acceptee: boolean }[];
    expect(avant).toHaveLength(2);
    expect(avant.every((d) => !d.acceptee)).toBe(true);

    expect((await A.sb.rpc('accepter_documents', { p_types: ['charte_menage'], p_client: id })).error).toBeNull();
    const etat = Object.fromEntries(
      (((await A.sb.rpc('charte_du_client', { p_client: id })).data ?? []) as { type: string; acceptee: boolean; mode: string | null }[]).map((d) => [d.type, d]),
    );
    expect(etat.charte_menage).toMatchObject({ acceptee: true, mode: 'remise_papier' });
    expect(etat.contrat_menage).toMatchObject({ acceptee: false });
    // Le gérant lit la trace (auteur = lui).
    const trace = ((await A.sb.from('acceptations_documents').select('auteur_id, mode').eq('client_id', id)).data ?? []) as { auteur_id: string }[];
    expect(trace).toEqual([{ auteur_id: A.id, mode: 'remise_papier' }]);
  });
});
