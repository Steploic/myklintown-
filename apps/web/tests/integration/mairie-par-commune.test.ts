/**
 * Une Mairie par commune (migration 20261019000016), contre la base de test :
 *   - la Mairie de Douala I ne voit ni ne modifie Yaoundé III (zones,
 *     affectations, précollecteurs, incidents, codes d'agrément, supervision) ;
 *   - elle travaille normalement dans sa commune ;
 *   - les contours de toutes les zones restent lisibles (chevauchements) ;
 *   - aucun compte ne s'attribue une commune ; l'administrateur, si.
 * Les attaques et la reprise des données sont aussi vérifiées hors ligne
 * (supabase/tests-securite). Ignorés, avec la consigne, tant que la migration
 * n'est pas exécutée ou que les comptes Mairie de test ne sont pas promus.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { avecCommunesMairie, carreEnMer, communeId, compte, mairie, precollecteur, type Compte, type Precollecteur } from '../support/fixtures';

type CompteMairie = Awaited<ReturnType<typeof mairie>>;

let A: Precollecteur;
let D: Precollecteur;
let MY: CompteMairie;
let MD: CompteMairie;
let ADM: Compte;
let pret = false;
let zoneY = '';
let zoneD = '';
let incidentA = '';
const ZONE_Y = carreEnMer(0.2);
const ZONE_D = carreEnMer(0.4);

const ids = (data: unknown, cle: string) => ((data ?? []) as Record<string, string>[]).map((r) => r[cle]);

beforeAll(async () => {
  A = await precollecteur('precoA', 'Test Propreté A'); // Yaoundé III
  D = await precollecteur('precoD', 'Test Propreté Douala', 'DLA1');
  MY = await mairie(); // Yaoundé III
  MD = await mairie('mairieDouala', 'DLA1');
  ADM = await compte('admin', 'citoyen');
  const migration = await avecCommunesMairie(A.sb);
  pret = migration && MY.role === 'mairie' && MD.role === 'mairie';
  if (!migration) {
    console.warn('\n⚠️  Tests « une Mairie par commune » IGNORÉS : exécuter supabase/migrations/20261019000016_mairie_par_commune.sql\n');
    return;
  }
  if (!pret) {
    console.warn(`\n⚠️  Tests « une Mairie par commune » IGNORÉS : promouvoir ${MY.email} et ${MD.email} (rôle mairie).\n`);
    return;
  }
  // Chaque Mairie trace une zone dans sa commune et la confie à son précollecteur.
  const y = await MY.sb.from('zones').insert({ nom: 'Zone test Yaoundé III', commune_id: MY.communeId, contour: ZONE_Y }).select('id').single();
  const d = await MD.sb.from('zones').insert({ nom: 'Zone test Douala I', commune_id: MD.communeId, contour: ZONE_D }).select('id').single();
  if (y.error || d.error) throw new Error(`zones : ${y.error?.message ?? d.error?.message}`);
  zoneY = y.data.id;
  zoneD = d.data.id;
  for (const [M, zone, ent] of [[MY, zoneY, A.entrepriseId], [MD, zoneD, D.entrepriseId]] as const) {
    const { error } = await M.sb.from('zone_affectations').insert({ zone_id: zone, entreprise_id: ent });
    if (error) throw new Error(`affectation : ${error.message}`);
  }
  const i = await A.sb.from('incidents_precollecte').insert({ entreprise_id: A.entrepriseId, source: 'precollecteur', categorie: 'autre' }).select('id').single();
  incidentA = i.data!.id;
});

afterAll(async () => {
  if (!pret) return;
  await MY.sb.from('zones').delete().eq('id', zoneY);
  await MD.sb.from('zones').delete().eq('id', zoneD);
});

describe('la Mairie de Douala I et Yaoundé III', () => {
  it('sa supervision ne montre que Douala I', async ({ skip }) => {
    if (!pret) skip();
    const z = await MD.sb.rpc('supervision_zones');
    expect(ids(z.data, 'zone_id')).toContain(zoneD);
    expect(ids(z.data, 'zone_id')).not.toContain(zoneY);
    const p = await MD.sb.rpc('supervision_precollecteurs');
    expect(ids(p.data, 'entreprise_id')).toContain(D.entrepriseId);
    expect(ids(p.data, 'entreprise_id')).not.toContain(A.entrepriseId);
    // Et réciproquement.
    expect(ids((await MY.sb.rpc('supervision_zones')).data, 'zone_id')).not.toContain(zoneD);
  });

  it('elle ne renomme, ne supprime, ne trace aucune zone de Yaoundé III', async ({ skip }) => {
    if (!pret) skip();
    expect((await MD.sb.from('zones').update({ nom: 'Annexée' }).eq('id', zoneY).select('id')).data ?? []).toHaveLength(0);
    expect((await MD.sb.from('zones').delete().eq('id', zoneY).select('id')).data ?? []).toHaveLength(0);
    const pirate = await MD.sb.from('zones').insert({ nom: 'Zone test pirate', commune_id: MY.communeId, contour: carreEnMer(0.6) });
    expect(pirate.error).toBeTruthy();
    const { data } = await MY.sb.from('zones').select('nom').eq('id', zoneY).single();
    expect(data?.nom).toBe('Zone test Yaoundé III');
  });

  it('elle ne retire ni n’ajoute de précollecteur sur une zone de Yaoundé III', async ({ skip }) => {
    if (!pret) skip();
    expect((await MD.sb.from('zone_affectations').delete().eq('zone_id', zoneY).select('zone_id')).data ?? []).toHaveLength(0);
    expect((await MD.sb.from('zone_affectations').insert({ zone_id: zoneY, entreprise_id: D.entrepriseId })).error).toBeTruthy();
    // Sa zone, à un précollecteur qu'elle ne supervise pas : refusé aussi.
    expect((await MD.sb.from('zone_affectations').insert({ zone_id: zoneD, entreprise_id: A.entrepriseId })).error).toBeTruthy();
    const { data } = await MY.sb.from('zone_affectations').select('entreprise_id').eq('zone_id', zoneY);
    expect(ids(data, 'entreprise_id')).toEqual([A.entrepriseId]);
  });

  it('elle ne lit ni le précollecteur ni les incidents de Yaoundé III, et ne les traite pas', async ({ skip }) => {
    if (!pret) skip();
    expect((await MD.sb.from('entreprises').select('id').eq('id', A.entrepriseId)).data ?? []).toHaveLength(0);
    expect((await MD.sb.from('entreprise_membres').select('user_id').eq('entreprise_id', A.entrepriseId)).data ?? []).toHaveLength(0);
    expect((await MD.sb.from('incidents_precollecte').select('id').eq('entreprise_id', A.entrepriseId)).data ?? []).toHaveLength(0);
    expect((await MD.sb.from('incidents_precollecte').update({ statut: 'resolu' }).eq('id', incidentA).select('id')).data ?? []).toHaveLength(0);
    // La Mairie de Yaoundé III, elle, le traite.
    const r = await MY.sb.from('incidents_precollecte').update({ statut: 'resolu' }).eq('id', incidentA).select('statut').single();
    expect(r.data?.statut).toBe('resolu');
  });

  it('codes d’agrément : ni délivrés pour Yaoundé III, ni lus ou révoqués', async ({ skip }) => {
    if (!pret) skip();
    const pour = await MD.sb.rpc('creer_code_agrement', { p_destinataire: 'Test pirate', p_commune: MY.communeId });
    expect(pour.error?.message).toMatch(/que pour sa commune/);
    const code = (await MY.sb.rpc('creer_code_agrement', { p_destinataire: 'Test Agrément Yaoundé III' })).data as string;
    const { data: ligne } = await MY.sb.from('codes_agrement').select('id, commune_id').eq('code', code).single();
    expect(ligne?.commune_id).toBe(MY.communeId);
    expect((await MD.sb.from('codes_agrement').select('id').eq('id', ligne!.id)).data ?? []).toHaveLength(0);
    expect((await MD.sb.rpc('revoquer_code_agrement', { p_id: ligne!.id })).error?.message).toMatch(/introuvable/);
    expect((await MY.sb.rpc('revoquer_code_agrement', { p_id: ligne!.id })).error).toBeNull();
    // Sa commune par défaut pour elle-même.
    const sien = (await MD.sb.rpc('creer_code_agrement', { p_destinataire: 'Test Agrément Douala I' })).data as string;
    const { data: l2 } = await MD.sb.from('codes_agrement').select('id, commune_id').eq('code', sien).single();
    expect(l2?.commune_id).toBe(MD.communeId);
    await MD.sb.rpc('revoquer_code_agrement', { p_id: l2!.id });
  });

  it('les contours de Yaoundé III restent lisibles : le chevauchement est détecté', async ({ skip }) => {
    if (!pret) skip();
    expect((await MD.sb.from('zones').select('id').eq('id', zoneY)).data).toHaveLength(1);
    const { data } = await MD.sb.rpc('zones_en_conflit', { p_contour: ZONE_Y, p_exclure: null });
    expect(ids(data, 'id')).toContain(zoneY);
  });

  it('aucun compte ne s’attribue une commune', async ({ skip }) => {
    if (!pret) skip();
    const y = await communeId('YDE3');
    expect((await MD.sb.from('mairie_communes').insert({ user_id: MD.id, commune_id: y })).error).toBeTruthy();
    expect((await MD.sb.rpc('accorder_commune_mairie', { p_user: MD.id, p_commune: y })).error?.message).toMatch(/Réservé aux administrateurs/);
    expect((await MD.sb.from('mairie_communes').select('commune_id')).data).toEqual([{ commune_id: MD.communeId }]);
    expect((await MD.sb.rpc('comptes_mairie')).data ?? []).toHaveLength(0);
  });
});

describe('l’administrateur', () => {
  it('liste les comptes Mairie, ajoute puis retire une commune', async ({ skip }) => {
    if (!pret || ADM.role !== 'admin') skip();
    const { data } = await ADM.sb.rpc('comptes_mairie');
    const comptes = (data ?? []) as { user_id: string; communes: { code: string }[] }[];
    expect(comptes.find((c) => c.user_id === MY.id)?.communes.map((c) => c.code)).toEqual(['YDE3']);
    expect(comptes.find((c) => c.user_id === MD.id)?.communes.map((c) => c.code)).toEqual(['DLA1']);

    expect((await ADM.sb.rpc('accorder_commune_mairie', { p_user: MD.id, p_commune: MY.communeId })).error).toBeNull();
    try {
      expect(ids((await MD.sb.rpc('supervision_zones')).data, 'zone_id')).toEqual(expect.arrayContaining([zoneY, zoneD]));
    } finally {
      expect((await ADM.sb.rpc('retirer_commune_mairie', { p_user: MD.id, p_commune: MY.communeId })).error).toBeNull();
    }
    expect(ids((await MD.sb.rpc('supervision_zones')).data, 'zone_id')).not.toContain(zoneY);
  });
});
