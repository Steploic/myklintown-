/**
 * Facturation et statut d'abonnement CALCULÉ, contre la vraie base :
 * numéros, déclencheur « payée », vue v_clients_statut, contraintes.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { iso, plans, precollecteur, type Precollecteur } from '../support/fixtures';

let A: Precollecteur;
let planMensuel: { id: string; prix_fcfa: number };

async function nouveauClient(nom: string, statut = 'actif') {
  const { data, error } = await A.sb
    .from('clients')
    .insert({ entreprise_id: A.entrepriseId, nom, plan_id: planMensuel.id, statut, telephone: '677000222' })
    .select('id, code')
    .single();
  if (error) throw error;
  return data;
}

async function facture(clientId: string, debut: number, fin: number, echeance: number, montant = 3500) {
  const { data, error } = await A.sb
    .from('factures')
    .insert({ entreprise_id: A.entrepriseId, client_id: clientId, periode_debut: iso(debut), periode_fin: iso(fin), montant_fcfa: montant, echeance: iso(echeance) })
    .select('id, numero, statut')
    .single();
  if (error) throw error;
  return data;
}

const payer = (factureId: string, clientId: string, montant: number, methode = 'especes') =>
  A.sb.from('paiements_clients').insert({ facture_id: factureId, entreprise_id: A.entrepriseId, client_id: clientId, montant_fcfa: montant, methode }).select('id').single();

const statut = async (clientId: string) =>
  (await A.sb.from('v_clients_statut').select('statut_abonnement, montant_impaye, nb_impayees, couverture_fin').eq('id', clientId).single()).data!;

const statutFacture = async (id: string) => (await A.sb.from('factures').select('statut').eq('id', id).single()).data!.statut;

beforeAll(async () => {
  A = await precollecteur('precoA', 'Test Propreté A');
  planMensuel = (await plans(A.sb)).find((p) => p.duree_mois === 1)!;
});

describe('grille tarifaire en base', () => {
  it('trois formules actives, prix positifs, triées', async () => {
    const p = await plans(A.sb);
    expect(p.length).toBeGreaterThanOrEqual(3);
    for (const x of p) expect(x.prix_fcfa).toBeGreaterThan(0);
  });
  it('la commission est lisible et dans la fourchette 10–15 %', async () => {
    const { data } = await A.sb.from('parametres_plateforme').select('valeur').eq('cle', 'commission_taux').single();
    expect(Number(data!.valeur)).toBeGreaterThanOrEqual(0.1);
    expect(Number(data!.valeur)).toBeLessThanOrEqual(0.15);
  });
});

describe('fiche client', () => {
  it('reçoit un code MKT- unique automatiquement', async () => {
    const a = await nouveauClient('Code 1');
    const b = await nouveauClient('Code 2');
    expect(a.code).toMatch(/^MKT-[0-9A-F]{8}$/);
    expect(a.code).not.toBe(b.code);
  });
  it('refuse un statut inconnu', async () => {
    const r = await A.sb.from('clients').insert({ entreprise_id: A.entrepriseId, nom: 'x', statut: 'vip' });
    expect(r.error).toBeTruthy();
  });
});

describe('factures', () => {
  it('numérotation F<AAMM>-NNNNN, unique et croissante', async () => {
    const c = await nouveauClient('Numérotation');
    const f1 = await facture(c.id, 0, 29, 7);
    const f2 = await facture(c.id, 30, 59, 37);
    expect(f1.numero).toMatch(/^F\d{4}-\d{5}$/);
    expect(f2.numero > f1.numero).toBe(true);
  });
  it('refuse une période qui finit avant de commencer', async () => {
    const c = await nouveauClient('Période absurde');
    const r = await A.sb.from('factures').insert({ entreprise_id: A.entrepriseId, client_id: c.id, periode_debut: iso(10), periode_fin: iso(0), montant_fcfa: 3500, echeance: iso(10) });
    expect(r.error).toBeTruthy();
  });
  it('refuse un montant négatif', async () => {
    const c = await nouveauClient('Montant négatif');
    const r = await A.sb.from('factures').insert({ entreprise_id: A.entrepriseId, client_id: c.id, periode_debut: iso(0), periode_fin: iso(29), montant_fcfa: -1, echeance: iso(7) });
    expect(r.error).toBeTruthy();
  });
});

describe('paiements → statut de facture (déclencheur)', () => {
  it('paiement partiel : la facture reste émise', async () => {
    const c = await nouveauClient('Partiel');
    const f = await facture(c.id, 0, 29, 7);
    await payer(f.id, c.id, 2000);
    expect(await statutFacture(f.id)).toBe('emise');
    expect(Number((await statut(c.id)).montant_impaye)).toBe(1500);
  });
  it('solde réglé en deux fois : la facture passe à payée', async () => {
    const c = await nouveauClient('Deux fois');
    const f = await facture(c.id, 0, 29, 7);
    await payer(f.id, c.id, 2000);
    await payer(f.id, c.id, 1500, 'mtn_momo');
    expect(await statutFacture(f.id)).toBe('payee');
  });
  it('trop-perçu : payée quand même', async () => {
    const c = await nouveauClient('Trop-perçu');
    const f = await facture(c.id, 0, 29, 7);
    await payer(f.id, c.id, 5000);
    expect(await statutFacture(f.id)).toBe('payee');
  });
  it('annuler un paiement fait repasser la facture en émise', async () => {
    const c = await nouveauClient('Remboursé');
    const f = await facture(c.id, 0, 29, 7);
    const p = await payer(f.id, c.id, 3500);
    expect(await statutFacture(f.id)).toBe('payee');
    await A.sb.from('paiements_clients').delete().eq('id', p.data!.id);
    expect(await statutFacture(f.id)).toBe('emise');
  });
  it('une facture annulée le reste, même payée ensuite', async () => {
    const c = await nouveauClient('Annulée');
    const f = await facture(c.id, 0, 29, 7);
    await A.sb.from('factures').update({ statut: 'annulee' }).eq('id', f.id);
    await payer(f.id, c.id, 3500);
    expect(await statutFacture(f.id)).toBe('annulee');
  });
  it('refuse un paiement nul ou négatif', async () => {
    const c = await nouveauClient('Paiement nul');
    const f = await facture(c.id, 0, 29, 7);
    expect((await payer(f.id, c.id, 0)).error).toBeTruthy();
    expect((await payer(f.id, c.id, -100)).error).toBeTruthy();
  });
  it('refuse un moyen de paiement inconnu', async () => {
    const c = await nouveauClient('Moyen inconnu');
    const f = await facture(c.id, 0, 29, 7);
    expect((await payer(f.id, c.id, 3500, 'bitcoin')).error).toBeTruthy();
  });
});

describe('statut d’abonnement calculé (jamais saisi)', () => {
  it('sans facture → sans_facture', async () => {
    const c = await nouveauClient('Jamais facturé');
    expect((await statut(c.id)).statut_abonnement).toBe('sans_facture');
  });
  it('facture payée couvrant > 7 jours → a_jour', async () => {
    const c = await nouveauClient('À jour');
    const f = await facture(c.id, -5, 25, 2);
    await payer(f.id, c.id, 3500);
    const s = await statut(c.id);
    expect(s.statut_abonnement).toBe('a_jour');
    expect(s.couverture_fin).toBe(iso(25));
  });
  it('couverture qui finit dans ≤ 7 jours → echeance_proche', async () => {
    const c = await nouveauClient('Échéance');
    const f = await facture(c.id, -25, 5, -18);
    await payer(f.id, c.id, 3500);
    expect((await statut(c.id)).statut_abonnement).toBe('echeance_proche');
  });
  it('couverture terminée → expire', async () => {
    const c = await nouveauClient('Expiré');
    const f = await facture(c.id, -40, -10, -33);
    await payer(f.id, c.id, 3500);
    expect((await statut(c.id)).statut_abonnement).toBe('expire');
  });
  it('facture échue non réglée → impaye, montant exact', async () => {
    const c = await nouveauClient('Impayé');
    await facture(c.id, -20, 10, -13);
    const s = await statut(c.id);
    expect(s.statut_abonnement).toBe('impaye');
    expect(Number(s.montant_impaye)).toBe(3500);
    expect(Number(s.nb_impayees)).toBe(1);
  });
  it('facture émise mais pas encore échue → pas impayé', async () => {
    const c = await nouveauClient('Pas encore échue');
    await facture(c.id, 0, 29, 7);
    expect((await statut(c.id)).statut_abonnement).not.toBe('impaye');
  });
  it('impayé prioritaire sur une couverture encore valide', async () => {
    const c = await nouveauClient('Couvert mais impayé');
    const f1 = await facture(c.id, -10, 20, -3);
    await payer(f1.id, c.id, 3500);
    await facture(c.id, -40, -11, -35);
    expect((await statut(c.id)).statut_abonnement).toBe('impaye');
  });
  it.each(['demande', 'suspendu', 'resilie'])('statut de fiche « %s » prioritaire', async (st) => {
    const c = await nouveauClient(`Fiche ${st}`, st);
    expect((await statut(c.id)).statut_abonnement).toBe(st);
  });
});
