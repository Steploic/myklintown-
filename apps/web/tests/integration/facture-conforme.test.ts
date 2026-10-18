/**
 * Facture inaltérable et conforme (migration 20261019000014), sur la base de
 * test : numérotation par émetteur sans trou, ventilation HT / TVA / TTC,
 * instantanés, montant figé (même avec la clé de service), suppression
 * refusée, client facturé non supprimable, démonstration en DEMO-…,
 * annulation tracée.
 * Ignorés, avec la consigne, tant que la migration n'est pas exécutée.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { CLE_SERVICE, clientServiceTest, iso, plans, precollecteur, type Precollecteur } from '../support/fixtures';

let A: Precollecteur;
let B: Precollecteur;
let planId = '';
let migration = false;
let service: SupabaseClient | null = null;
let annee = '';

async function client(P: Precollecteur, nom: string, demo = false) {
  const { data, error } = await P.sb
    .from('clients')
    .insert({ entreprise_id: P.entrepriseId, nom, plan_id: planId, telephone: '677000444', quartier: 'Nsam', est_demo: demo })
    .select('id, code')
    .single();
  if (error) throw error;
  return data as { id: string; code: string };
}

async function facture(P: Precollecteur, clientId: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await P.sb
    .from('factures')
    .insert({ entreprise_id: P.entrepriseId, client_id: clientId, montant_fcfa: 3500, periode_debut: iso(0), periode_fin: iso(29), echeance: iso(7), ...extra })
    .select('*')
    .single();
  if (error) throw error;
  return data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const prefixe = async (P: Precollecteur) =>
  ((await P.sb.from('entreprises').select('prefixe_facture').eq('id', P.entrepriseId).single()).data as { prefixe_facture: string }).prefixe_facture;

beforeAll(async () => {
  // Remise à zéro (purge de test) : la numérotation de chaque émetteur repart de 1.
  A = await precollecteur('precoA', 'Test Propreté A');
  B = await precollecteur('precoB', 'Test Concurrent B');
  planId = (await plans(A.sb))[0]!.id;
  migration = !(await A.sb.from('entreprises').select('prefixe_facture').eq('id', A.entrepriseId).single()).error;
  if (!migration) {
    console.warn('\n⚠️  Tests « facture conforme » IGNORÉS : exécuter supabase/migrations/20261019000014_charte_facture_conforme.sql\n');
    return;
  }
  if (CLE_SERVICE) service = clientServiceTest();
  else console.warn('\n⚠️  « montant figé avec la clé de service » NON testé : SUPABASE_SECRET_KEY absente de apps/web/.env.test.local (jamais sur la production)\n');
  annee = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Africa/Douala', year: 'numeric' }).format(new Date());
});

describe('numérotation par émetteur, sans trou', () => {
  it('deux émetteurs ont chacun leur 00001, puis 00002 ; le numéro envoyé est ignoré', async ({ skip }) => {
    if (!migration || !service) skip(); // la remise à zéro du compteur passe par la purge (clé de service)
    const [pA, pB] = [await prefixe(A), await prefixe(B)];
    expect(pA).toMatch(/^F\d{3,}$/);
    expect(pA).not.toBe(pB);
    const cA = await client(A, 'Numéro A');
    const cB = await client(B, 'Numéro B');
    const a1 = await facture(A, cA.id, { numero: 'F-CHOISI' });
    const b1 = await facture(B, cB.id);
    const a2 = await facture(A, cA.id);
    expect(a1.numero).toBe(`${pA}-${annee}-00001`);
    expect(b1.numero).toBe(`${pB}-${annee}-00001`);
    expect(a2.numero).toBe(`${pA}-${annee}-00002`);
    expect([a1.sequence, a2.sequence]).toEqual([1, 2]);
  });

  it('une émission refusée ne consomme pas de numéro', async ({ skip }) => {
    if (!migration) skip();
    const c = await client(A, 'Émission refusée');
    const avant = await facture(A, c.id);
    // Refusée : période qui finit avant de commencer.
    const r = await A.sb.from('factures').insert({ entreprise_id: A.entrepriseId, client_id: c.id, montant_fcfa: 3500, periode_debut: iso(10), periode_fin: iso(0), echeance: iso(10) });
    expect(r.error).toBeTruthy();
    const apres = await facture(A, c.id);
    expect(apres.sequence).toBe(avant.sequence + 1);
  });

  it('démonstration : DEMO-…, hors numérotation réelle, supprimée avec sa fiche', async ({ skip }) => {
    if (!migration) skip();
    const reel = await client(A, 'Avant démo');
    const r1 = await facture(A, reel.id);
    const d = await client(A, 'Famille démo (test)', true);
    const fd = await facture(A, d.id);
    expect(fd.numero).toMatch(new RegExp(`^DEMO-${await prefixe(A)}-${annee}-\\d{5,}$`));
    expect(fd.est_demo).toBe(true);
    expect(fd.sequence).toBeNull();
    const r2 = await facture(A, reel.id);
    expect(r2.sequence).toBe(r1.sequence + 1);
    expect((await A.sb.from('clients').delete().eq('id', d.id)).error).toBeNull();
    expect((await A.sb.from('factures').select('id').eq('id', fd.id)).data).toEqual([]);
  });
});

describe('facture conforme', () => {
  it('HT + TVA = TTC, instantanés de l’émetteur (NIU, RCCM, mention TVA) et du client', async ({ skip }) => {
    if (!migration) skip();
    expect((await A.sb.from('entreprises').update({ niu: 'M012345678901A', rccm: 'RC/YAO/2026/B/0001', adresse_fiscale: 'BP 100 Yaoundé' }).eq('id', A.entrepriseId)).error).toBeNull();
    const c = await client(A, 'Foyer Conforme');
    const f = await facture(A, c.id);
    expect(f.montant_ht_fcfa + f.montant_tva_fcfa).toBe(f.montant_fcfa);
    expect(Number(f.tva_taux)).toBeGreaterThanOrEqual(0);
    expect(f.emetteur).toMatchObject({ niu: 'M012345678901A', rccm: 'RC/YAO/2026/B/0001', adresse_fiscale: 'BP 100 Yaoundé' });
    expect(f.emetteur.mention_tva).toBeTruthy();
    expect(f.destinataire).toMatchObject({ nom: 'Foyer Conforme', code: c.code, quartier: 'Nsam' });
    // Le NIU change : la facture émise garde celui du jour de son émission.
    await A.sb.from('entreprises').update({ niu: 'M999999999999Z' }).eq('id', A.entrepriseId);
    const relue = (await A.sb.from('factures').select('emetteur').eq('id', f.id).single()).data as { emetteur: { niu: string } };
    expect(relue.emetteur.niu).toBe('M012345678901A');
    await A.sb.from('entreprises').update({ niu: null, rccm: null, adresse_fiscale: null }).eq('id', A.entrepriseId);
  });

  it('la date d’émission est celle du serveur (pas d’antidate)', async ({ skip }) => {
    if (!migration) skip();
    const c = await client(A, 'Foyer Antidaté');
    const f = await facture(A, c.id, { created_at: '2025-01-01T00:00:00Z' });
    expect(Date.now() - new Date(f.created_at).getTime()).toBeLessThan(10 * 60_000);
  });

  it('le préfixe de numérotation ne se change pas depuis l’application', async ({ skip }) => {
    if (!migration) skip();
    const { error } = await A.sb.from('entreprises').update({ prefixe_facture: 'F999' }).eq('id', A.entrepriseId);
    expect(error?.message).toMatch(/ne se change pas/);
  });
});

describe('inaltérable', () => {
  it('le gérant ne modifie ni le montant, ni le numéro, ni l’échéance', async ({ skip }) => {
    if (!migration) skip();
    const c = await client(A, 'Foyer Figé');
    const f = await facture(A, c.id);
    for (const changement of [{ montant_fcfa: 100 }, { numero: 'F-ARRANGE' }, { echeance: iso(60) }, { libelle: 'Autre chose' }]) {
      const { error } = await A.sb.from('factures').update(changement).eq('id', f.id);
      expect(error?.message, JSON.stringify(changement)).toMatch(/inaltérable/);
    }
  });

  it('montant figé même avec la clé de service', async ({ skip }) => {
    if (!migration || !service) skip();
    const c = await client(A, 'Foyer Figé Service');
    const f = await facture(A, c.id);
    const { error } = await service!.from('factures').update({ montant_fcfa: 100, montant_ht_fcfa: 100 }).eq('id', f.id);
    expect(error?.message).toMatch(/inaltérable/);
    const relue = (await A.sb.from('factures').select('montant_fcfa').eq('id', f.id).single()).data as { montant_fcfa: number };
    expect(relue.montant_fcfa).toBe(3500);
  });

  it('une facture ne se supprime pas (ni par le gérant, ni par la clé de service)', async ({ skip }) => {
    if (!migration) skip();
    const c = await client(A, 'Foyer Supprimé');
    const f = await facture(A, c.id);
    await A.sb.from('factures').delete().eq('id', f.id);
    if (service) expect((await service.from('factures').delete().eq('id', f.id)).error?.message).toMatch(/ne se supprime pas/);
    expect((await A.sb.from('factures').select('id').eq('id', f.id)).data).toHaveLength(1);
  });

  it('un client facturé ne se supprime pas : on le résilie', async ({ skip }) => {
    if (!migration) skip();
    const c = await client(A, 'Foyer Facturé');
    await facture(A, c.id);
    const { error } = await A.sb.from('clients').delete().eq('id', c.id);
    expect(error?.message).toMatch(/Résiliez-le/);
    expect((await A.sb.from('clients').update({ statut: 'resilie' }).eq('id', c.id)).error).toBeNull();
    // Sans facture, une fiche saisie par erreur se supprime toujours.
    const vide = await client(A, 'Fiche saisie par erreur');
    expect((await A.sb.from('clients').delete().eq('id', vide.id)).error).toBeNull();
  });

  it('annulation tracée : motif, date, auteur ; elle reste annulée', async ({ skip }) => {
    if (!migration) skip();
    const c = await client(A, 'Foyer Annulé');
    const f = await facture(A, c.id);
    expect((await A.sb.from('factures').update({ statut: 'annulee', motif_annulation: 'Erreur de formule' }).eq('id', f.id)).error).toBeNull();
    const a = (await A.sb.from('factures').select('statut, annulee_at, annulee_par, motif_annulation').eq('id', f.id).single()).data as Record<string, unknown>;
    expect(a).toMatchObject({ statut: 'annulee', annulee_par: A.id, motif_annulation: 'Erreur de formule' });
    expect(a.annulee_at).toBeTruthy();
    expect((await A.sb.from('factures').update({ statut: 'emise' }).eq('id', f.id)).error).toBeTruthy();
    expect((await A.sb.from('factures').update({ motif_annulation: 'Autre' }).eq('id', f.id)).error).toBeTruthy();
  });
});
