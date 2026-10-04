/**
 * Retours de test de l'équipe, côté base (migration 20261004000006) :
 *   - liste d'attente des ménages hors zone (R3) : confidentialité, prise en charge ;
 *   - demandes d'accès Mairie (R1) : réservées à leur auteur, validées par un admin ;
 *   - communes (R2), mise en forme des noms (R8).
 * Ignorés, avec la consigne, tant que la migration n'est pas exécutée.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { clientAnonyme, compte, plans, POINT_EN_MER, precollecteur, type Compte, type Precollecteur } from '../support/fixtures';

let A: Precollecteur;
let S: Compte;
let autre: Compte;
let acces: Compte;
let planId: string;
let migration = false;

beforeAll(async () => {
  A = await precollecteur('precoA', 'Test Propreté A');
  S = await compte('souscripteur', 'citoyen');
  autre = await compte('menage', 'citoyen');
  acces = await compte('acces', 'citoyen');
  planId = (await plans(A.sb))[0]!.id;
  migration = !(await A.sb.rpc('demandes_ouvertes')).error;
  if (!migration) {
    console.warn('\n⚠️  Tests « retours d’équipe » IGNORÉS : exécuter supabase/migrations/20261004000006_retours_tests_equipe.sql\n');
    return;
  }
  // Rien ne reste d'un essai précédent.
  await S.sb.from('demandes_abonnement').update({ statut: 'annulee' }).eq('statut', 'en_attente');
  await acces.sb.rpc('annuler_demande_acces');
});

const point = { lat: POINT_EN_MER.lat + 0.3, lng: POINT_EN_MER.lng + 0.3 };

describe('R2 / R8 — communes et noms', () => {
  it('les 13 communes de Yaoundé et Douala existent, lisibles sans compte', async ({ skip }) => {
    if (!migration) skip();
    const { data, error } = await clientAnonyme().from('communes').select('code');
    expect(error).toBeNull();
    const codes = (data ?? []).map((c: { code: string }) => c.code);
    for (const c of ['YDE1', 'YDE3', 'YDE7', 'DLA1', 'DLA5', 'DLA6']) expect(codes).toContain(c);
  });
  it('normaliser_nom suit la même règle que l’application', async ({ skip }) => {
    if (!migration) skip();
    const { data } = await A.sb.rpc('normaliser_nom', { p: '  jean   ATEBA-ESSO ' });
    expect(data).toBe('Jean Ateba-Esso');
    const vide = await A.sb.rpc('normaliser_nom', { p: '   ' });
    expect(vide.data).toBeNull();
  });
});

describe('R3 — liste d’attente des ménages hors zone', () => {
  let demandeId = '';
  const quartier = `Quartier Integration ${Date.now().toString().slice(-6)}`;

  it('un visiteur sans compte ne peut rien déposer', async ({ skip }) => {
    if (!migration) skip();
    const { error } = await clientAnonyme().rpc('deposer_demande_abonnement', {
      p_plan: planId, p_nom: 'X', p_telephone: '690000000', p_adresse: null, p_quartier: null, p_lat: point.lat, p_lng: point.lng,
    });
    expect(error).toBeTruthy();
  });

  it('le ménage dépose sa demande ; le nom est remis en forme', async ({ skip }) => {
    if (!migration) skip();
    const { data, error } = await S.sb.rpc('deposer_demande_abonnement', {
      p_plan: planId, p_nom: 'test   SOUSCRIPTEUR', p_telephone: '690000000', p_adresse: 'Rue test', p_quartier: quartier, p_lat: point.lat, p_lng: point.lng,
    });
    expect(error).toBeNull();
    demandeId = data as string;
    const { data: d } = await S.sb.from('demandes_abonnement').select('nom, statut').eq('id', demandeId).single();
    expect(d).toMatchObject({ nom: 'Test Souscripteur', statut: 'en_attente' });
  });

  it('une seule demande en attente par ménage', async ({ skip }) => {
    if (!migration) skip();
    const { error } = await S.sb.rpc('deposer_demande_abonnement', {
      p_plan: planId, p_nom: 'Test', p_telephone: '690000000', p_adresse: null, p_quartier: null, p_lat: point.lat, p_lng: point.lng,
    });
    expect(error?.message).toMatch(/déjà enregistrée/);
  });

  it('un autre ménage ne voit pas la demande', async ({ skip }) => {
    if (!migration) skip();
    const { data } = await autre.sb.from('demandes_abonnement').select('id').eq('id', demandeId);
    expect(data).toEqual([]);
    const { data: liste, error } = await autre.sb.rpc('demandes_ouvertes');
    expect(error).toBeNull();
    expect(liste).toEqual([]);
  });

  it('le précollecteur la voit SANS nom ni téléphone', async ({ skip }) => {
    if (!migration) skip();
    const { data } = await A.sb.rpc('demandes_ouvertes');
    const d = (data as Record<string, unknown>[]).find((x) => x.id === demandeId);
    expect(d).toBeTruthy();
    expect(d!.quartier).toBe(quartier);
    expect(d).not.toHaveProperty('nom');
    expect(d).not.toHaveProperty('telephone');
    // Et la table elle-même lui reste fermée.
    const direct = await A.sb.from('demandes_abonnement').select('id').eq('id', demandeId);
    expect(direct.data).toEqual([]);
  });

  it('un ménage ne peut pas « prendre » une demande', async ({ skip }) => {
    if (!migration) skip();
    const { error } = await autre.sb.rpc('prendre_demande', { p_demande: demandeId });
    expect(error?.message).toMatch(/Réservé aux précollecteurs/);
  });

  it('prise en charge : le ménage devient client actif du précollecteur', async ({ skip }) => {
    if (!migration) skip();
    const { data: clientId, error } = await A.sb.rpc('prendre_demande', { p_demande: demandeId });
    expect(error).toBeNull();
    const { data: c } = await A.sb.from('clients').select('nom, telephone, statut, user_id, quartier').eq('id', clientId as string).single();
    expect(c).toMatchObject({ nom: 'Test Souscripteur', telephone: '690000000', statut: 'actif', user_id: S.id, quartier });
    const { data: d } = await S.sb.from('demandes_abonnement').select('statut').eq('id', demandeId).single();
    expect(d?.statut).toBe('prise');
  });

  it('une demande déjà prise ne peut pas l’être deux fois', async ({ skip }) => {
    if (!migration) skip();
    const { error } = await A.sb.rpc('prendre_demande', { p_demande: demandeId });
    expect(error?.message).toMatch(/déjà été prise/);
  });

  it('un ménage déjà abonné ne peut plus déposer', async ({ skip }) => {
    if (!migration) skip();
    const { error } = await S.sb.rpc('deposer_demande_abonnement', {
      p_plan: planId, p_nom: 'Test', p_telephone: '690000000', p_adresse: null, p_quartier: null, p_lat: point.lat, p_lng: point.lng,
    });
    expect(error?.message).toMatch(/déjà un abonnement/);
    await A.sb.from('clients').delete().eq('entreprise_id', A.entrepriseId).eq('quartier', quartier);
  });

  it('le ménage peut retirer sa demande, pas la passer « prise » lui-même', async ({ skip }) => {
    if (!migration) skip();
    const { data: id } = await S.sb.rpc('deposer_demande_abonnement', {
      p_plan: planId, p_nom: 'Test', p_telephone: '690000000', p_adresse: null, p_quartier: null, p_lat: point.lat, p_lng: point.lng,
    });
    const triche = await S.sb.from('demandes_abonnement').update({ statut: 'prise' }).eq('id', id as string).select('id');
    expect(triche.data ?? []).toEqual([]);
    const { data } = await S.sb.from('demandes_abonnement').update({ statut: 'annulee' }).eq('id', id as string).select('statut');
    expect(data).toEqual([{ statut: 'annulee' }]);
  });
});

describe('R1 — demandes d’accès Mairie', () => {
  let communeId = '';

  it('un compte dépose sa demande, une seule à la fois', async ({ skip }) => {
    if (!migration) skip();
    const { data: c } = await acces.sb.from('communes').select('id').eq('code', 'YDE3').single();
    communeId = (c as { id: string }).id;
    const premiere = await acces.sb.rpc('demander_acces_mairie', {
      p_commune: communeId, p_fonction: 'Agent de test', p_service: 'Hygiène', p_telephone: null, p_message: null,
    });
    expect(premiere.error).toBeNull();
    const seconde = await acces.sb.rpc('demander_acces_mairie', {
      p_commune: communeId, p_fonction: 'Agent de test', p_service: null, p_telephone: null, p_message: null,
    });
    expect(seconde.error?.message).toMatch(/déjà en cours/);
  });

  it('fonction obligatoire', async ({ skip }) => {
    if (!migration) skip();
    const { error } = await autre.sb.rpc('demander_acces_mairie', {
      p_commune: communeId, p_fonction: '  ', p_service: null, p_telephone: null, p_message: null,
    });
    expect(error?.message).toMatch(/fonction/i);
  });

  it('personne d’autre ne lit la demande, et seul un admin la traite', async ({ skip }) => {
    if (!migration) skip();
    const { data: miennes } = await acces.sb.from('demandes_acces').select('id, statut').eq('statut', 'en_attente');
    expect(miennes).toHaveLength(1);
    const id = (miennes as { id: string }[])[0]!.id;

    const lue = await autre.sb.from('demandes_acces').select('id').eq('id', id);
    expect(lue.data).toEqual([]);
    const liste = await A.sb.rpc('demandes_acces_a_traiter');
    expect(liste.data).toEqual([]);

    for (const intrus of [A, autre, acces]) {
      const { error } = await intrus.sb.rpc('traiter_demande_acces', { p_demande: id, p_accepter: true });
      expect(error?.message).toMatch(/Réservé aux administrateurs/);
    }
    const { data: p } = await acces.sb.from('profiles').select('role').eq('id', acces.id).single();
    expect(p?.role).toBe('citoyen');
  });

  it('l’auteur ne peut pas modifier sa demande directement', async ({ skip }) => {
    if (!migration) skip();
    const { data } = await acces.sb.from('demandes_acces').update({ statut: 'acceptee' }).eq('user_id', acces.id).select('id');
    expect(data ?? []).toEqual([]);
  });

  it('l’auteur retire sa demande', async ({ skip }) => {
    if (!migration) skip();
    const { error } = await acces.sb.rpc('annuler_demande_acces');
    expect(error).toBeNull();
    const { data } = await acces.sb.from('demandes_acces').select('id').eq('statut', 'en_attente');
    expect(data).toEqual([]);
  });
});
