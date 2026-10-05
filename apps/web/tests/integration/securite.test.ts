/**
 * Matrice de sécurité contre la VRAIE base : qui peut lire / écrire quoi.
 * La RLS est la seule barrière qui compte (l'interface peut être contournée
 * avec la clé anon publique) : on l'attaque directement, comme le ferait un curieux.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { clientAnonyme, compte, JPEG_1PX, plans, precollecteur, type Compte, type Precollecteur } from '../support/fixtures';

const TABLES_PRIVEES = [
  'entreprises',
  'entreprise_membres',
  'employes',
  'tricycles',
  'tricycle_employes',
  'clients',
  'factures',
  'paiements_clients',
  'relances',
  'tournees_precollecte',
  'collectes',
  'incidents_precollecte',
  'v_clients_statut',
] as const;

let A: Precollecteur;
let B: Precollecteur;
let menage: Compte;
let clientA: { id: string; code: string };
let factureA: string;

beforeAll(async () => {
  A = await precollecteur('precoA', 'Test Propreté A');
  B = await precollecteur('precoB', 'Test Concurrent B');
  menage = await compte('intrus', 'citoyen');
  const [mensuel] = await plans(A.sb);
  const c = await A.sb.from('clients').insert({ entreprise_id: A.entrepriseId, nom: 'Secret A', telephone: '677000111', plan_id: mensuel!.id }).select('id, code').single();
  if (c.error) throw c.error;
  clientA = c.data;
  const f = await A.sb.from('factures').insert({ entreprise_id: A.entrepriseId, client_id: clientA.id, periode_debut: '2026-10-01', periode_fin: '2026-10-31', montant_fcfa: 3500, echeance: '2026-10-08' }).select('id').single();
  if (f.error) throw f.error;
  factureA = f.data.id;
  await A.sb.from('employes').insert({ entreprise_id: A.entrepriseId, nom: 'Employé secret' });
  await A.sb.from('incidents_precollecte').insert({ entreprise_id: A.entrepriseId, source: 'precollecteur', categorie: 'autre', description: 'secret' });
});

describe('témoin : le propriétaire voit bien ses propres données', () => {
  // Sans ce témoin, un « ne voit rien » pourrait réussir par erreur (requête cassée).
  it.each(['entreprises', 'clients', 'factures', 'employes', 'incidents_precollecte', 'v_clients_statut'] as const)(
    'A voit ses lignes dans %s',
    async (table) => {
      const col = table === 'entreprises' ? 'id' : 'entreprise_id';
      const { data, error } = await A.sb.from(table).select('*').eq(col, A.entrepriseId);
      expect(error).toBeNull();
      expect((data ?? []).length).toBeGreaterThan(0);
    },
  );
});

describe('visiteur anonyme (clé publique seule)', () => {
  it.each(TABLES_PRIVEES)('ne lit rien dans %s', async (table) => {
    const { data } = await clientAnonyme().from(table).select('*').limit(5);
    expect(data ?? []).toHaveLength(0);
  });
  it('lit la grille tarifaire (page d’accueil publique)', async () => {
    const { data } = await clientAnonyme().from('plans_tarifaires').select('code, prix_fcfa');
    expect((data ?? []).length).toBeGreaterThanOrEqual(3);
  });
  it('ne lit pas les paramètres (commission)', async () => {
    const { data } = await clientAnonyme().from('parametres_plateforme').select('*');
    expect(data ?? []).toHaveLength(0);
  });
  it('ne peut rien écrire', async () => {
    const anon = clientAnonyme();
    expect((await anon.from('clients').insert({ entreprise_id: A.entrepriseId, nom: 'x' })).error).toBeTruthy();
    expect((await anon.from('plans_tarifaires').update({ prix_fcfa: 1 }).eq('code', 'MENSUEL').select()).data ?? []).toHaveLength(0);
    expect((await anon.from('zones').insert({ nom: 'x', contour: {} })).error).toBeTruthy();
  });
  it.each([
    ['creer_mon_entreprise', { p_nom: 'x' }],
    ['souscrire_client', { p_entreprise: '00000000-0000-0000-0000-000000000000', p_plan: '00000000-0000-0000-0000-000000000000', p_nom: 'x', p_telephone: 'x', p_adresse: null, p_quartier: null, p_lat: 0, p_lng: 0 }],
    ['rattacher_mon_compte', { p_code: 'MKT-X', p_telephone: '1' }],
    ['precollecteurs_du_point', { p_lat: 3.8, p_lng: 11.5 }],
    ['supervision_zones', {}],
    ['supervision_precollecteurs', {}],
  ])('ne peut pas appeler %s', async (fn, args) => {
    const { error } = await clientAnonyme().rpc(fn, args);
    expect(error).toBeTruthy();
  });
  it('ne voit aucune preuve photo', async () => {
    const { data } = await clientAnonyme().storage.from('preuves').list(A.entrepriseId);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('précollecteur concurrent (B) face aux données de A', () => {
  it.each(TABLES_PRIVEES.filter((t) => t !== 'entreprise_membres'))('B ne voit rien de A dans %s', async (table) => {
    const col = table === 'entreprises' ? 'id' : table === 'tricycle_employes' ? 'tricycle_id' : 'entreprise_id';
    if (table === 'tricycle_employes') {
      const { data } = await B.sb.from(table).select('*');
      expect(data ?? []).toHaveLength(0);
      return;
    }
    const { data } = await B.sb.from(table).select('*').eq(col, A.entrepriseId);
    expect(data ?? []).toHaveLength(0);
  });
  it('B ne peut pas créer de client chez A', async () => {
    expect((await B.sb.from('clients').insert({ entreprise_id: A.entrepriseId, nom: 'intrus' })).error).toBeTruthy();
  });
  it('B ne peut pas modifier un client de A', async () => {
    const { data } = await B.sb.from('clients').update({ nom: 'piraté' }).eq('id', clientA.id).select();
    expect(data ?? []).toHaveLength(0);
    const { data: verif } = await A.sb.from('clients').select('nom').eq('id', clientA.id).single();
    expect(verif?.nom).toBe('Secret A');
  });
  it('B ne peut pas supprimer un client de A', async () => {
    await B.sb.from('clients').delete().eq('id', clientA.id);
    const { data } = await A.sb.from('clients').select('id').eq('id', clientA.id);
    expect(data).toHaveLength(1);
  });
  it('B ne peut pas encaisser sur une facture de A', async () => {
    const r = await B.sb.from('paiements_clients').insert({ facture_id: factureA, entreprise_id: A.entrepriseId, client_id: clientA.id, montant_fcfa: 3500 });
    expect(r.error).toBeTruthy();
  });
  it('B ne peut pas renommer l’entreprise de A', async () => {
    const { data } = await B.sb.from('entreprises').update({ nom: 'piraté' }).eq('id', A.entrepriseId).select();
    expect(data ?? []).toHaveLength(0);
  });
  it('B ne peut pas déposer de fichier dans le dossier de A', async () => {
    const r = await B.sb.storage.from('preuves').upload(`${A.entrepriseId}/${B.id}/intrus-${Date.now()}.jpg`, JPEG_1PX, { contentType: 'image/jpeg' });
    expect(r.error).toBeTruthy();
  });
  it('B ne peut pas déclarer un incident au nom de A', async () => {
    const r = await B.sb.from('incidents_precollecte').insert({ entreprise_id: A.entrepriseId, source: 'precollecteur', categorie: 'autre' });
    expect(r.error).toBeTruthy();
  });
  it('B ne peut pas créer une 2e entreprise', async () => {
    expect((await B.sb.rpc('creer_mon_entreprise', { p_nom: 'Doublon' })).error).toBeTruthy();
  });
  it('B ne découpe pas le territoire et ne voit pas la supervision', async () => {
    expect((await B.sb.from('zones').insert({ nom: 'Zone test pirate', contour: { type: 'Polygon', coordinates: [[[9.3, 2.5], [9.31, 2.5], [9.31, 2.51], [9.3, 2.5]]] } })).error).toBeTruthy();
    expect((await B.sb.rpc('supervision_zones')).data ?? []).toHaveLength(0);
    expect((await B.sb.rpc('supervision_precollecteurs')).data ?? []).toHaveLength(0);
  });
  it('B ne modifie pas la grille tarifaire ni la commission', async () => {
    expect((await B.sb.from('plans_tarifaires').update({ prix_fcfa: 1 }).eq('code', 'MENSUEL').select()).data ?? []).toHaveLength(0);
    expect((await B.sb.from('parametres_plateforme').update({ valeur: 0 }).eq('cle', 'commission_taux').select()).data ?? []).toHaveLength(0);
    const { data } = await B.sb.from('parametres_plateforme').select('valeur').eq('cle', 'commission_taux').single();
    expect(Number(data?.valeur)).toBeGreaterThan(0);
  });
});

describe('ménage sans abonnement', () => {
  it.each(TABLES_PRIVEES.filter((t) => t !== 'entreprise_membres'))('ne voit rien dans %s', async (table) => {
    const { data } = await menage.sb.from(table).select('*').limit(5);
    expect(data ?? []).toHaveLength(0);
  });
  it('ne peut pas créer d’entreprise (rôle ménage)', async () => {
    expect((await menage.sb.rpc('creer_mon_entreprise', { p_nom: 'x' })).error).toBeTruthy();
  });
  it('ne peut pas se promouvoir (PATCH direct du rôle)', async () => {
    const r = await menage.sb.from('profiles').update({ role: 'admin' }).eq('id', menage.id).select();
    expect(r.error).toBeTruthy();
    const { data } = await menage.sb.from('profiles').select('role').eq('id', menage.id).single();
    expect(data?.role).toBe('citoyen');
  });
  it('ne voit que son propre profil', async () => {
    const { data } = await menage.sb.from('profiles').select('id');
    expect((data ?? []).map((p) => p.id)).toEqual([menage.id]);
  });
});

describe('inscription : rôle forgé', () => {
  it('demander « admin » ou « mairie » à l’inscription donne « citoyen »', async () => {
    const forge = await compte('forge', 'admin');
    expect(forge.role).toBe('citoyen');
    const forge2 = await compte('forge2', 'mairie');
    expect(forge2.role).toBe('citoyen');
  });
  it('précollecteur est bien auto-attribuable', () => {
    expect(A.role).toBe('precollecteur');
  });
});
