/**
 * Parcours entre acteurs, contre la vraie base :
 *   ménage ⇄ précollecteur (rattachement, passages, contestation avec preuve)
 *   Mairie → zones → souscription en ligne → supervision agrégée.
 * Les tests Mairie sont ignorés tant que le compte de test n'est pas promu
 * (voir tests/README.md) — ils l'indiquent clairement.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  carreEnMer,
  clientAnonyme,
  compte,
  JPEG_1PX,
  mairie,
  plans,
  POINT_EN_MER,
  precollecteur,
  type Compte,
  type Precollecteur,
} from '../support/fixtures';

let A: Precollecteur;
let B: Precollecteur;
let menage: Compte;
let M: Awaited<ReturnType<typeof mairie>>;
let planId: string;

beforeAll(async () => {
  A = await precollecteur('precoA', 'Test Propreté A');
  B = await precollecteur('precoB', 'Test Concurrent B');
  menage = await compte('menage', 'citoyen');
  M = await mairie();
  planId = (await plans(A.sb))[0]!.id;
  if (!M.promue) {
    console.warn(`\n⚠️  Tests Mairie IGNORÉS : exécuter dans le SQL Editor\n    select public.promouvoir_utilisateur('${M.email}', 'mairie');\n`);
  }
});

describe('rattachement d’un ménage à sa fiche (code + téléphone)', () => {
  let fiche: { id: string; code: string };
  beforeAll(async () => {
    const { data, error } = await A.sb
      .from('clients')
      .insert({ entreprise_id: A.entrepriseId, nom: 'Foyer rattachable', telephone: '+237 6 77 11 22 33', plan_id: planId })
      .select('id, code')
      .single();
    if (error) throw error;
    fiche = data;
  });
  it('mauvais téléphone : refus, message neutre', async () => {
    const { error } = await menage.sb.rpc('rattacher_mon_compte', { p_code: fiche.code, p_telephone: '699999999' });
    expect(error?.message).toMatch(/Code ou téléphone incorrect/);
  });
  it('code inconnu : exactement le même message (pas d’énumération)', async () => {
    const { error } = await menage.sb.rpc('rattacher_mon_compte', { p_code: 'MKT-FFFFFFFF', p_telephone: '677112233' });
    expect(error?.message).toMatch(/Code ou téléphone incorrect/);
  });
  it('téléphone trop court : refus', async () => {
    const { error } = await menage.sb.rpc('rattacher_mon_compte', { p_code: fiche.code, p_telephone: '2233' });
    expect(error).toBeTruthy();
  });
  it('bon code (minuscules) + téléphone (autre format) : rattaché', async () => {
    const { data, error } = await menage.sb.rpc('rattacher_mon_compte', { p_code: fiche.code.toLowerCase(), p_telephone: '00237677112233' });
    expect(error).toBeNull();
    expect(data).toBe(fiche.id);
  });
  it('le ménage voit sa fiche, son précollecteur, ses factures', async () => {
    const { data } = await menage.sb.from('v_clients_statut').select('id, nom').eq('user_id', menage.id);
    expect(data?.map((c) => c.nom)).toEqual(['Foyer rattachable']);
    const e = await menage.sb.from('entreprises').select('nom').eq('id', A.entrepriseId).single();
    expect(e.data?.nom).toBe('Test Propreté A');
  });
  it('mais pas les autres clients de son précollecteur', async () => {
    await A.sb.from('clients').insert({ entreprise_id: A.entrepriseId, nom: 'Voisin', plan_id: planId });
    const { data } = await menage.sb.from('clients').select('nom');
    expect(data?.map((c) => c.nom)).toEqual(['Foyer rattachable']);
  });
  it('ne peut pas modifier sa fiche lui-même (le précollecteur la gère)', async () => {
    const { data } = await menage.sb.from('clients').update({ statut: 'actif', nom: 'Hack' }).eq('id', fiche.id).select();
    expect(data ?? []).toHaveLength(0);
  });
  it('un 2e rattachement du même compte est refusé', async () => {
    const { error } = await menage.sb.rpc('rattacher_mon_compte', { p_code: fiche.code, p_telephone: '677112233' });
    expect(error?.message).toMatch(/déjà rattaché/);
  });
  it('une fiche déjà prise ne peut pas être rattachée par un autre compte', async () => {
    const autre = await compte('intrus', 'citoyen');
    const { error } = await autre.sb.rpc('rattacher_mon_compte', { p_code: fiche.code, p_telephone: '677112233' });
    expect(error).toBeTruthy();
  });

  describe('passages vus par le ménage', () => {
    let collecteA: string;
    let collecteAutre: string;
    beforeAll(async () => {
      const t = await A.sb.from('tournees_precollecte').insert({ entreprise_id: A.entrepriseId }).select('id').single();
      const c1 = await A.sb.from('collectes').insert({ entreprise_id: A.entrepriseId, tournee_id: t.data!.id, client_id: fiche.id, statut: 'realisee', realisee_at: new Date().toISOString() }).select('id').single();
      collecteA = c1.data!.id;
      const voisin = await A.sb.from('clients').select('id').eq('nom', 'Voisin').single();
      const c2 = await A.sb.from('collectes').insert({ entreprise_id: A.entrepriseId, tournee_id: t.data!.id, client_id: voisin.data!.id }).select('id').single();
      collecteAutre = c2.data!.id;
    });
    it('voit son passage, pas celui du voisin', async () => {
      const { data } = await menage.sb.from('collectes').select('id');
      expect(data?.map((c) => c.id)).toEqual([collecteA]);
    });
    it('confirme son passage', async () => {
      expect((await menage.sb.rpc('confirmer_passage', { p_collecte: collecteA, p_confirme: true })).error).toBeNull();
      const { data } = await A.sb.from('collectes').select('confirmation_client').eq('id', collecteA).single();
      expect(data?.confirmation_client).toBe('confirmee');
    });
    it('ne peut pas confirmer le passage du voisin', async () => {
      expect((await menage.sb.rpc('confirmer_passage', { p_collecte: collecteAutre, p_confirme: true })).error).toBeTruthy();
    });
    it('conteste avec une preuve déposée dans le dossier de son précollecteur', async () => {
      const chemin = `${A.entrepriseId}/${menage.id}/contestation-${Date.now()}.jpg`;
      expect((await menage.sb.storage.from('preuves').upload(chemin, JPEG_1PX, { contentType: 'image/jpeg' })).error).toBeNull();
      const i = await menage.sb.from('incidents_precollecte').insert({ entreprise_id: A.entrepriseId, client_id: fiche.id, collecte_id: collecteA, source: 'client', categorie: 'passage_non_effectue', media_path: chemin, media_type: 'photo' });
      expect(i.error).toBeNull();
      expect((await menage.sb.rpc('confirmer_passage', { p_collecte: collecteA, p_confirme: false })).error).toBeNull();
      const vu = await A.sb.from('incidents_precollecte').select('source, media_path').eq('collecte_id', collecteA);
      expect(vu.data?.[0]).toMatchObject({ source: 'client', media_path: chemin });
      const { data } = await A.sb.storage.from('preuves').createSignedUrl(chemin, 60);
      expect(data?.signedUrl).toBeTruthy();
    });
    it('ne peut pas déposer dans le dossier d’une autre entreprise', async () => {
      const r = await menage.sb.storage.from('preuves').upload(`${B.entrepriseId}/${menage.id}/x-${Date.now()}.jpg`, JPEG_1PX, { contentType: 'image/jpeg' });
      expect(r.error).toBeTruthy();
    });
    it('ne peut pas signaler un incident en se faisant passer pour le précollecteur', async () => {
      const r = await menage.sb.from('incidents_precollecte').insert({ entreprise_id: A.entrepriseId, source: 'precollecteur', categorie: 'autre' });
      expect(r.error).toBeTruthy();
    });
  });
});

describe('souscription en ligne : refus hors zone', () => {
  it('sans zone couvrante, la souscription est refusée', async () => {
    const autre = await compte('intrus', 'citoyen');
    const { error } = await autre.sb.rpc('souscrire_client', {
      p_entreprise: B.entrepriseId, p_plan: planId, p_nom: 'x', p_telephone: '677', p_adresse: null, p_quartier: null,
      p_lat: 0.1, p_lng: 0.1,
    });
    expect(error?.message).toMatch(/ne dessert pas/);
  });
});

describe('Mairie : zones, souscription, supervision', () => {
  const siMairie = () => M.promue;
  let zoneId: string;

  it('crée une zone (en mer)', async ({ skip }) => {
    if (!siMairie()) skip();
    const r = await M.sb.from('zones').insert({ nom: 'Zone test Nord', contour: carreEnMer(0) }).select('id').single();
    expect(r.error).toBeNull();
    zoneId = r.data!.id;
  });
  it('détecte un chevauchement et en donne la surface', async ({ skip }) => {
    if (!siMairie()) skip();
    const { data } = await M.sb.rpc('zones_en_conflit', { p_contour: carreEnMer(0.01), p_exclure: null });
    const c = (data as { id: string; recouvrement_m2: number }[]).find((x) => x.id === zoneId);
    expect(c).toBeTruthy();
    expect(c!.recouvrement_m2).toBeGreaterThan(1_000_000);
  });
  it('pas de faux chevauchement pour une zone voisine', async ({ skip }) => {
    if (!siMairie()) skip();
    const { data } = await M.sb.rpc('zones_en_conflit', { p_contour: carreEnMer(0.05), p_exclure: null });
    expect((data as { id: string }[]).some((x) => x.id === zoneId)).toBe(false);
  });
  it('une zone ne se chevauche pas elle-même en modification', async ({ skip }) => {
    if (!siMairie()) skip();
    const { data } = await M.sb.rpc('zones_en_conflit', { p_contour: carreEnMer(0), p_exclure: zoneId });
    expect((data as { id: string }[]).some((x) => x.id === zoneId)).toBe(false);
  });
  it('affecte A à la zone ; A la voit', async ({ skip }) => {
    if (!siMairie()) skip();
    expect((await M.sb.from('zone_affectations').insert({ zone_id: zoneId, entreprise_id: A.entrepriseId })).error).toBeNull();
    const { data } = await A.sb.from('zone_affectations').select('zone_id').eq('entreprise_id', A.entrepriseId);
    expect(data?.map((x) => x.zone_id)).toContain(zoneId);
  });
  it('un point dans la zone trouve A, un point hors zone ne trouve rien', async ({ skip }) => {
    if (!siMairie()) skip();
    const dedans = await menage.sb.rpc('precollecteurs_du_point', { p_lat: POINT_EN_MER.lat, p_lng: POINT_EN_MER.lng });
    expect((dedans.data as { entreprise_id: string }[]).map((x) => x.entreprise_id)).toContain(A.entrepriseId);
    const dehors = await menage.sb.rpc('precollecteurs_du_point', { p_lat: 2.6, p_lng: 9.6 });
    expect((dehors.data as { entreprise_id: string }[]).map((x) => x.entreprise_id)).not.toContain(A.entrepriseId);
  });
  it('souscription en ligne auprès de A : fiche « demande », zone renseignée', async ({ skip }) => {
    if (!siMairie()) skip();
    const s = await compte('souscripteur', 'citoyen');
    const { data: id, error } = await s.sb.rpc('souscrire_client', {
      p_entreprise: A.entrepriseId, p_plan: planId, p_nom: 'Foyer en ligne', p_telephone: '677445566',
      p_adresse: 'Portail bleu', p_quartier: 'Large', p_lat: POINT_EN_MER.lat, p_lng: POINT_EN_MER.lng,
    });
    expect(error).toBeNull();
    const { data } = await A.sb.from('v_clients_statut').select('statut, zone_nom, user_id').eq('id', id as string).single();
    expect(data).toMatchObject({ statut: 'demande', zone_nom: 'Zone test Nord', user_id: s.id });
    const deux = await s.sb.rpc('souscrire_client', {
      p_entreprise: A.entrepriseId, p_plan: planId, p_nom: 'Doublon', p_telephone: '677', p_adresse: null, p_quartier: null,
      p_lat: POINT_EN_MER.lat, p_lng: POINT_EN_MER.lng,
    });
    expect(deux.error?.message).toMatch(/déjà un abonnement/);
  });
  it('souscrire chez B (non affecté à la zone) est refusé', async ({ skip }) => {
    if (!siMairie()) skip();
    const s = await compte('souscripteur2', 'citoyen');
    const { error } = await s.sb.rpc('souscrire_client', {
      p_entreprise: B.entrepriseId, p_plan: planId, p_nom: 'x', p_telephone: '677', p_adresse: null, p_quartier: null,
      p_lat: POINT_EN_MER.lat, p_lng: POINT_EN_MER.lng,
    });
    expect(error?.message).toMatch(/ne dessert pas/);
  });
  it('supervision : agrégats par zone et par précollecteur', async ({ skip }) => {
    if (!siMairie()) skip();
    const z = await M.sb.rpc('supervision_zones');
    const ligne = (z.data as { zone_id: string; precollecteurs: string[]; nb_clients: number }[]).find((x) => x.zone_id === zoneId);
    expect(ligne?.precollecteurs).toContain('Test Propreté A');
    expect(Number(ligne?.nb_clients)).toBeGreaterThanOrEqual(1);
    const p = await M.sb.rpc('supervision_precollecteurs');
    expect((p.data as { entreprise_id: string }[]).map((x) => x.entreprise_id)).toEqual(expect.arrayContaining([A.entrepriseId, B.entrepriseId]));
    const a = await M.sb.rpc('supervision_activite', { p_semaines: 4 });
    expect(a.error).toBeNull();
  });
  it('les données de démo sont exclues des statistiques', async ({ skip }) => {
    if (!siMairie()) skip();
    const avant = (await M.sb.rpc('supervision_zones')).data as { zone_id: string; nb_clients: number }[];
    const n0 = Number(avant.find((x) => x.zone_id === zoneId)!.nb_clients);
    await A.sb.from('clients').insert({ entreprise_id: A.entrepriseId, nom: 'Démo', plan_id: planId, zone_id: zoneId, est_demo: true });
    const apres = (await M.sb.rpc('supervision_zones')).data as { zone_id: string; nb_clients: number }[];
    expect(Number(apres.find((x) => x.zone_id === zoneId)!.nb_clients)).toBe(n0);
  });
  it('la Mairie ne lit ni les ménages, ni les factures, ni les paiements', async ({ skip }) => {
    if (!siMairie()) skip();
    for (const t of ['clients', 'factures', 'paiements_clients', 'relances', 'employes', 'v_clients_statut']) {
      const { data } = await M.sb.from(t).select('*').limit(3);
      expect(data ?? [], t).toHaveLength(0);
    }
  });
  it('la Mairie lit et traite les incidents', async ({ skip }) => {
    if (!siMairie()) skip();
    const i = await A.sb.from('incidents_precollecte').insert({ entreprise_id: A.entrepriseId, source: 'precollecteur', categorie: 'autre' }).select('id').single();
    const r = await M.sb.from('incidents_precollecte').update({ statut: 'resolu' }).eq('id', i.data!.id).select('statut').single();
    expect(r.data?.statut).toBe('resolu');
  });
  it('la Mairie ne peut pas écrire de facture', async ({ skip }) => {
    if (!siMairie()) skip();
    const c = await A.sb.from('clients').select('id').limit(1).single();
    const r = await M.sb.from('factures').insert({ entreprise_id: A.entrepriseId, client_id: c.data!.id, periode_debut: '2026-10-01', periode_fin: '2026-10-31', montant_fcfa: 1, echeance: '2026-10-01' });
    expect(r.error).toBeTruthy();
  });
  it('retire l’affectation puis supprime la zone', async ({ skip }) => {
    if (!siMairie()) skip();
    expect((await M.sb.from('zone_affectations').delete().eq('zone_id', zoneId)).error).toBeNull();
    expect((await M.sb.from('zones').delete().eq('id', zoneId)).error).toBeNull();
  });
});

describe('anonyme', () => {
  it('ne peut pas confirmer un passage', async () => {
    expect((await clientAnonyme().rpc('confirmer_passage', { p_collecte: '00000000-0000-0000-0000-000000000000', p_confirme: true })).error).toBeTruthy();
  });
});
