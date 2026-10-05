/**
 * Paiement en ligne (migration 20261006000008), contre la vraie base :
 * ce qu'AUCUN compte ne peut faire (s'activer, écrire ou confirmer une
 * transaction), les liens de paiement, et — si la clé service est fournie —
 * l'enregistrement unique d'un paiement confirmé.
 * Ignorés, avec la consigne, tant que la migration n'est pas exécutée.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { CLE_SERVICE, clientAnonyme, clientServiceTest, compte, iso, plans, precollecteur, type Compte, type Precollecteur } from '../support/fixtures';

let A: Precollecteur;
let B: Precollecteur;
let menage: Compte;
let migration = false;
let service: SupabaseClient | null = null;
let factureId = '';
let clientId = '';

beforeAll(async () => {
  A = await precollecteur('precoA', 'Test Propreté A');
  B = await precollecteur('precoB', 'Test Concurrent B');
  menage = await compte('menage', 'citoyen');
  migration = !(await A.sb.from('entreprises').select('paiement_statut').eq('id', A.entrepriseId).single()).error;
  if (!migration) {
    console.warn('\n⚠️  Tests « paiement en ligne » IGNORÉS : exécuter supabase/migrations/20261006000008_paiement_en_ligne.sql\n');
    return;
  }
  if (CLE_SERVICE) service = clientServiceTest();
  else console.warn('\n⚠️  Enregistrement d’un paiement confirmé NON testé : SUPABASE_SERVICE_ROLE_KEY absente de apps/web/.env.local\n');

  const planId = (await plans(A.sb))[0]!.id;
  const c = await A.sb.from('clients').insert({ entreprise_id: A.entrepriseId, nom: 'Foyer En Ligne', telephone: '677000333', plan_id: planId }).select('id').single();
  clientId = (c.data as { id: string }).id;
  const f = await A.sb
    .from('factures')
    .insert({ entreprise_id: A.entrepriseId, client_id: clientId, montant_fcfa: 3500, periode_debut: iso(0), periode_fin: iso(29), echeance: iso(7) })
    .select('id')
    .single();
  factureId = (f.data as { id: string }).id;
});

describe('ce qu’aucun compte ne peut faire', () => {
  it('un gérant ne s’active pas lui-même', async ({ skip }) => {
    if (!migration) skip();
    const { error } = await A.sb.from('entreprises').update({ paiement_statut: 'actif', paiement_compte_id: 'faux' }).eq('id', A.entrepriseId);
    expect(error?.message).toMatch(/se configure côté serveur/);
    // Les autres champs restent modifiables.
    expect((await A.sb.from('entreprises').update({ siege: 'Test' }).eq('id', A.entrepriseId)).error).toBeNull();
  });

  it('personne n’écrit une transaction en ligne', async ({ skip }) => {
    if (!migration) skip();
    const ligne = {
      entreprise_id: A.entrepriseId, client_id: clientId, facture_id: factureId, reference: `FAUX${Date.now()}`,
      canal: 'cm.mtn', telephone: '+237677000333', montant_fcfa: 3500, origine: 'menage',
    };
    expect((await A.sb.from('paiements_en_ligne').insert(ligne)).error).toBeTruthy();
    expect((await menage.sb.from('paiements_en_ligne').insert(ligne)).error).toBeTruthy();
  });

  it('personne ne confirme un paiement à la place du serveur', async ({ skip }) => {
    if (!migration) skip();
    for (const c of [A.sb, menage.sb, clientAnonyme()]) {
      const { error } = await c.rpc('enregistrer_paiement_en_ligne', { p_reference: 'X' });
      expect(error).toBeTruthy();
    }
    const { data } = await A.sb.from('factures').select('statut').eq('id', factureId).single();
    expect(data).toEqual({ statut: 'emise' });
  });
});

describe('liens de paiement', () => {
  let jeton = '';
  it('le gérant crée un lien (le même tant qu’il est valable)', async ({ skip }) => {
    if (!migration) skip();
    const r1 = await A.sb.rpc('creer_lien_paiement', { p_facture: factureId });
    expect(r1.error).toBeNull();
    jeton = r1.data as string;
    expect(jeton).toMatch(/^[0-9a-f]{32}$/);
    expect((await A.sb.rpc('creer_lien_paiement', { p_facture: factureId })).data).toBe(jeton);
  });

  it('ni un autre précollecteur, ni un ménage, ni un visiteur', async ({ skip }) => {
    if (!migration) skip();
    for (const c of [B.sb, menage.sb, clientAnonyme()]) {
      expect((await c.rpc('creer_lien_paiement', { p_facture: factureId })).error).toBeTruthy();
    }
    expect((await B.sb.from('liens_paiement').select('jeton').eq('jeton', jeton)).data).toEqual([]);
    expect((await menage.sb.from('liens_paiement').select('jeton').eq('jeton', jeton)).data).toEqual([]);
  });
});

describe('paiement confirmé (clé service)', () => {
  it('enregistré une seule fois, facture réglée, visible du gérant et du seul ménage concerné', async ({ skip }) => {
    if (!migration || !service) skip();
    const reference = `MKTTEST${Date.now()}`;
    const ins = await service!.from('paiements_en_ligne').insert({
      entreprise_id: A.entrepriseId, client_id: clientId, facture_id: factureId, reference, fournisseur: 'simulation',
      fournisseur_reference: `sim_${reference}`, canal: 'cm.orange', telephone: '+237699000333',
      montant_fcfa: 3500, commission_fcfa: 350, origine: 'lien', statut: 'en_attente',
    });
    expect(ins.error).toBeNull();
    const p1 = await service!.rpc('enregistrer_paiement_en_ligne', { p_reference: reference });
    const p2 = await service!.rpc('enregistrer_paiement_en_ligne', { p_reference: reference });
    expect(p1.error).toBeNull();
    expect(p2.data).toBe(p1.data);
    const { data: paiements } = await A.sb.from('paiements_clients').select('montant_fcfa, methode, statut').eq('facture_id', factureId);
    expect(paiements).toEqual([{ montant_fcfa: 3500, methode: 'orange_money', statut: 'valide' }]);
    expect((await A.sb.from('factures').select('statut').eq('id', factureId).single()).data).toEqual({ statut: 'payee' });
    expect((await A.sb.from('paiements_en_ligne').select('statut').eq('reference', reference)).data).toEqual([{ statut: 'reussi' }]);
    expect((await B.sb.from('paiements_en_ligne').select('id').eq('reference', reference)).data).toEqual([]);
    expect((await menage.sb.from('paiements_en_ligne').select('id').eq('reference', reference)).data).toEqual([]);
  });
});
