/**
 * Délai de grâce et blocage au passage (migration 20261019000013), sur la base
 * de test : statut et consigne calculés par la vue, scan servi ou refusé selon
 * l'interrupteur `terrain_blocage_actif`.
 * Ignorés, avec la consigne, tant que la migration n'est pas exécutée. La partie
 * « blocage allumé » demande la clé secrète du projet de test (l'interrupteur
 * est réservé à l'administrateur) ; elle remet l'interrupteur à 0 en partant.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CLE_SERVICE, clientServiceTest, iso, plans, precollecteur, type Precollecteur } from '../support/fixtures';

let A: Precollecteur;
let planId = '';
let migration = false;
let service: SupabaseClient | null = null;

/** Foyer dont la dernière période payée s'est terminée il y a `finIlYa` jours. */
async function foyer(nom: string, finIlYa: number) {
  const { data: c, error } = await A.sb
    .from('clients')
    .insert({ entreprise_id: A.entrepriseId, nom, plan_id: planId, telephone: '677000444' })
    .select('id, code')
    .single();
  if (error) throw error;
  const { data: f, error: e2 } = await A.sb
    .from('factures')
    .insert({
      entreprise_id: A.entrepriseId, client_id: c.id, montant_fcfa: 3500,
      periode_debut: iso(-finIlYa - 29), periode_fin: iso(-finIlYa), echeance: iso(-finIlYa - 22),
    })
    .select('id')
    .single();
  if (e2) throw e2;
  const { error: e3 } = await A.sb
    .from('paiements_clients')
    .insert({ facture_id: f.id, entreprise_id: A.entrepriseId, client_id: c.id, montant_fcfa: 3500, methode: 'especes' });
  if (e3) throw e3;
  return c as { id: string; code: string };
}

/** Tournée du jour avec un passage prévu chez ce foyer. */
async function tourneeAvec(clientId: string) {
  const { data: t, error } = await A.sb.from('tournees_precollecte').insert({ entreprise_id: A.entrepriseId, date: iso(0) }).select('id').single();
  if (error) throw error;
  const { data: co, error: e2 } = await A.sb
    .from('collectes')
    .insert({ entreprise_id: A.entrepriseId, tournee_id: t.id, client_id: clientId, date_prevue: iso(0) })
    .select('id')
    .single();
  if (e2) throw e2;
  return { tournee: t.id as string, collecte: co.id as string };
}

const vue = async (id: string) =>
  (await A.sb.from('v_clients_statut').select('statut_abonnement, consigne_terrain, fin_grace').eq('id', id).single()).data as {
    statut_abonnement: string; consigne_terrain: string; fin_grace: string;
  };

const passage = async (id: string) =>
  (await A.sb.from('collectes').select('statut, motif, refus_abonnement').eq('id', id).single()).data as {
    statut: string; motif: string | null; refus_abonnement: boolean;
  };

const interrupteur = async (v: 0 | 1) => {
  const { error } = await service!.from('parametres_plateforme').update({ valeur: v }).eq('cle', 'terrain_blocage_actif');
  if (error) throw error;
};

beforeAll(async () => {
  A = await precollecteur('precoA', 'Test Propreté A');
  planId = (await plans(A.sb))[0]!.id;
  migration = !(await A.sb.from('v_clients_statut').select('consigne_terrain').limit(1)).error;
  if (!migration) {
    console.warn('\n⚠️  Tests « délai de grâce et blocage » IGNORÉS : exécuter supabase/migrations/20261019000013_delai_grace_blocage.sql\n');
    return;
  }
  if (CLE_SERVICE) service = clientServiceTest();
  else console.warn('\n⚠️  Blocage ALLUMÉ non testé : SUPABASE_SECRET_KEY absente de apps/web/.env.test.local\n');
});

afterAll(async () => {
  if (service) await interrupteur(0);
});

describe('délai de grâce (vue v_clients_statut)', () => {
  it('couverture finie hier : grâce, servir et rappeler, jusqu’à 7 jours après', async (ctx) => {
    if (!migration) return ctx.skip();
    const c = await foyer('Grâce hier', 1);
    const v = await vue(c.id);
    expect(v.statut_abonnement).toBe('grace');
    expect(v.consigne_terrain).toBe('servir_rappeler');
    expect(v.fin_grace).toBe(iso(6));
  });
  it('couverture finie il y a 7 jours : encore en grâce ; il y a 8 jours : expiré, ne pas servir', async (ctx) => {
    if (!migration) return ctx.skip();
    expect((await vue((await foyer('Grâce J-7', 7)).id)).statut_abonnement).toBe('grace');
    const v = await vue((await foyer('Expiré J-8', 8)).id);
    expect(v.statut_abonnement).toBe('expire');
    expect(v.consigne_terrain).toBe('ne_pas_servir');
  });
});

describe('blocage au passage', () => {
  it('éteint (par défaut) : un foyer expiré scanné est servi, comme avant', async (ctx) => {
    if (!migration) return ctx.skip();
    if (service) await interrupteur(0);
    const c = await foyer('Expiré scanné, blocage éteint', 10);
    const { tournee, collecte } = await tourneeAvec(c.id);
    const { data, error } = await A.sb.rpc('scanner_passage', { p_tournee: tournee, p_code: c.code });
    expect(error).toBeNull();
    expect((data as { refuse: boolean }).refuse).toBe(false);
    expect((await passage(collecte)).statut).toBe('realisee');
  });

  it('allumé : le foyer expiré n’est pas servi, son passage est noté « Refus / impayé » par la base', async (ctx) => {
    if (!migration || !service) return ctx.skip();
    await interrupteur(1);
    const c = await foyer('Expiré scanné, blocage allumé', 10);
    const { tournee, collecte } = await tourneeAvec(c.id);
    const { data, error } = await A.sb.rpc('scanner_passage', { p_tournee: tournee, p_code: c.code });
    expect(error).toBeNull();
    expect(data).toMatchObject({ refuse: true, consigne: 'ne_pas_servir', statut_abonnement: 'expire' });
    expect(await passage(collecte)).toEqual({ statut: 'non_realisee', motif: 'Refus / impayé', refus_abonnement: true });
  });

  it('allumé : « Collecté » refusé avec un message lisible ; un foyer en grâce reste servi', async (ctx) => {
    if (!migration || !service) return ctx.skip();
    await interrupteur(1);
    const rouge = await foyer('Expiré pointé', 10);
    const p = await tourneeAvec(rouge.id);
    const { error } = await A.sb.rpc('pointer_passage', { p_collecte: p.collecte, p_statut: 'realisee' });
    expect(error?.message).toMatch(/Ne pas servir/);
    const orange = await foyer('Grâce pointé', 2);
    const q = await tourneeAvec(orange.id);
    expect((await A.sb.rpc('pointer_passage', { p_collecte: q.collecte, p_statut: 'realisee' })).error).toBeNull();
    expect((await passage(q.collecte)).statut).toBe('realisee');
  });

  it('le gérant ne peut pas « excuser » lui-même un passage manqué', async (ctx) => {
    if (!migration) return ctx.skip();
    const c = await foyer('Passage manqué', 1);
    const { collecte } = await tourneeAvec(c.id);
    const { error } = await A.sb.from('collectes').update({ refus_abonnement: true }).eq('id', collecte);
    expect(error).not.toBeNull();
    expect((await passage(collecte)).refus_abonnement).toBe(false);
  });
});
