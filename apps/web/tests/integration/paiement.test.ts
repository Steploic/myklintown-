/**
 * Paiement en ligne (migration 20261006000008), sur la base de test :
 * ce qu'AUCUN compte ne peut faire (s'activer, écrire ou confirmer une
 * transaction), les liens de paiement, et — avec la clé secrète du projet de
 * test — l'enregistrement unique d'un paiement confirmé.
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
  else console.warn('\n⚠️  Enregistrement d’un paiement confirmé NON testé : SUPABASE_SECRET_KEY absente de apps/web/.env.test.local (jamais sur la production)\n');

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

// Migration 20261115000023 (revue du 10/11/2026) : une seule demande en cours
// par facture ; un paiement confirmé n'est imputé que dans la limite du reste dû.
describe('garde-fous du paiement en ligne (clé service)', () => {
  const demande = (reference: string, facture: string, client: string) => ({
    entreprise_id: A.entrepriseId, client_id: client, facture_id: facture, reference, fournisseur: 'simulation',
    fournisseur_reference: `sim_${reference}`, canal: 'cm.mtn', telephone: '+237677000334',
    montant_fcfa: 3500, origine: 'menage', statut: 'en_attente',
  });

  it('une seule demande en cours par facture', async ({ skip }) => {
    if (!migration || !service) skip();
    const planId = (await plans(A.sb))[0]!.id;
    const c = await A.sb.from('clients').insert({ entreprise_id: A.entrepriseId, nom: 'Foyer Double Demande', telephone: '677000334', plan_id: planId }).select('id').single();
    const client = (c.data as { id: string }).id;
    const f = await A.sb
      .from('factures')
      .insert({ entreprise_id: A.entrepriseId, client_id: client, montant_fcfa: 3500, periode_debut: iso(0), periode_fin: iso(29), echeance: iso(7) })
      .select('id')
      .single();
    const facture = (f.data as { id: string }).id;
    const t = Date.now();
    expect((await service!.from('paiements_en_ligne').insert(demande(`MKTDBL1${t}`, facture, client))).error).toBeNull();
    const seconde = await service!.from('paiements_en_ligne').insert(demande(`MKTDBL2${t}`, facture, client));
    expect(seconde.error?.code).toBe('23505');
    // Terminée, elle laisse partir la suivante.
    await service!.from('paiements_en_ligne').update({ statut: 'expire' }).eq('reference', `MKTDBL1${t}`);
    expect((await service!.from('paiements_en_ligne').insert(demande(`MKTDBL3${t}`, facture, client))).error).toBeNull();
  });

  it('facture déjà réglée : le paiement confirmé est « à rembourser », rien n’est compté deux fois', async ({ skip }) => {
    if (!migration || !service) skip();
    // La facture du test précédent est réglée (3 500 en ligne) ; une seconde demande aboutit quand même.
    const reference = `MKTTARD${Date.now()}`;
    expect((await service!.from('paiements_en_ligne').insert(demande(reference, factureId, clientId))).error).toBeNull();
    const r = await service!.rpc('enregistrer_paiement_en_ligne', { p_reference: reference });
    expect(r.error).toBeNull();
    expect(r.data).toBeNull();
    const { data: paiements } = await A.sb.from('paiements_clients').select('montant_fcfa').eq('facture_id', factureId);
    expect(paiements).toEqual([{ montant_fcfa: 3500 }]);
    const { data: t } = await A.sb.from('paiements_en_ligne').select('statut, a_rembourser_fcfa, message').eq('reference', reference).single();
    expect(t).toEqual({ statut: 'reussi', a_rembourser_fcfa: 3500, message: 'Facture déjà réglée : paiement à rembourser.' });
  });
});
