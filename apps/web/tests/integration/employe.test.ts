/**
 * Espace employé (migration 20261005000007), contre la vraie base :
 *   invitation → compte employé ; droits resserrés (lecture, pas d'écriture
 *   directe) ; gestes de terrain réservés à l'équipe de la tournée ; espèces
 *   « à valider » ; position en direct ; retrait de l'accès.
 * Ignorés, avec la consigne, tant que la migration n'est pas exécutée.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { clientAnonyme, compte, iso, plans, precollecteur, type Compte, type Precollecteur } from '../support/fixtures';

let A: Precollecteur;
let B: Precollecteur;
let E: Compte;
let autre: Compte;
let migration = false;
let employeId = '';
let code = '';
let clientId = '';
let clientCode = '';
let factureId = '';
let t1 = '';
let t2 = '';

const role = async (c: Compte) => {
  const { data } = await c.sb.from('profiles').select('role').eq('id', c.id).single();
  return (data as { role: string } | null)?.role;
};

beforeAll(async () => {
  A = await precollecteur('precoA', 'Test Propreté A');
  B = await precollecteur('precoB', 'Test Concurrent B');
  E = await compte('employe', 'citoyen');
  autre = await compte('menage', 'citoyen');
  migration = !(await A.sb.rpc('mes_statistiques_employe', { p_jours: 1 })).error;
  if (!migration) {
    console.warn('\n⚠️  Tests « espace employé » IGNORÉS : exécuter supabase/migrations/20261005000007_espace_employe.sql\n');
    return;
  }
  const planId = (await plans(A.sb))[0]!.id;
  const e = await A.sb.from('employes').insert({ entreprise_id: A.entrepriseId, nom: 'Agent Intégration', fonction: 'collecteur' }).select('id').single();
  employeId = (e.data as { id: string }).id;
  const c = await A.sb.from('clients').insert({ entreprise_id: A.entrepriseId, nom: 'Foyer Employé', telephone: '677000111', plan_id: planId }).select('id, code').single();
  ({ id: clientId, code: clientCode } = c.data as { id: string; code: string });
  const f = await A.sb
    .from('factures')
    .insert({ entreprise_id: A.entrepriseId, client_id: clientId, montant_fcfa: 3500, periode_debut: iso(-30), periode_fin: iso(-1), echeance: iso(-20) })
    .select('id')
    .single();
  factureId = (f.data as { id: string }).id;
});

describe('invitation et compte employé', () => {
  it('seul le gérant crée une invitation', async ({ skip }) => {
    if (!migration) skip();
    for (const intrus of [E, B, autre]) {
      const { error } = await intrus.sb.rpc('creer_invitation_employe', { p_employe: employeId });
      expect(error?.message).toMatch(/Réservé au gérant/);
    }
    const { data, error } = await A.sb.rpc('creer_invitation_employe', { p_employe: employeId });
    expect(error).toBeNull();
    code = data as string;
    expect(code).toMatch(/^[0-9A-F]{8}$/);
  });

  it('un nouveau code remplace le précédent', async ({ skip }) => {
    if (!migration) skip();
    const ancien = code;
    code = (await A.sb.rpc('creer_invitation_employe', { p_employe: employeId })).data as string;
    expect(code).not.toBe(ancien);
    const { data } = await clientAnonyme().rpc('apercu_invitation', { p_code: ancien });
    expect(data).toEqual([]);
  });

  it('aperçu public de l’invitation (avant inscription)', async ({ skip }) => {
    if (!migration) skip();
    const { data, error } = await clientAnonyme().rpc('apercu_invitation', { p_code: code.toLowerCase() });
    expect(error).toBeNull();
    expect(data).toEqual([{ entreprise_nom: 'Test Propreté A', employe_nom: 'Agent Intégration', fonction: 'collecteur', valide: true }]);
  });

  it('code inconnu : refus clair', async ({ skip }) => {
    if (!migration) skip();
    const { error } = await E.sb.rpc('rejoindre_entreprise', { p_code: 'FFFFFFFF' });
    expect(error?.message).toMatch(/inconnu/);
  });

  it('un gérant ne peut pas rejoindre une autre équipe', async ({ skip }) => {
    if (!migration) skip();
    const { error } = await B.sb.rpc('rejoindre_entreprise', { p_code: code });
    expect(error?.message).toMatch(/appartient déjà à une entreprise/);
  });

  it('l’employé rejoint l’équipe (code tapé avec tiret et minuscules) et devient « employe »', async ({ skip }) => {
    if (!migration) skip();
    const tape = `${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase();
    const { data, error } = await E.sb.rpc('rejoindre_entreprise', { p_code: tape });
    expect(error).toBeNull();
    expect(data).toBe(A.entrepriseId);
    expect(await role(E)).toBe('employe');
    const { data: m } = await E.sb.from('entreprise_membres').select('role_membre').eq('user_id', E.id).single();
    expect(m).toEqual({ role_membre: 'agent' });
  });

  it('un code ne sert qu’une fois', async ({ skip }) => {
    if (!migration) skip();
    const { error } = await autre.sb.rpc('rejoindre_entreprise', { p_code: code });
    expect(error?.message).toMatch(/déjà été utilisé/);
  });

  it('l’employé ne peut pas se promouvoir lui-même', async ({ skip }) => {
    if (!migration) skip();
    const { error } = await E.sb.from('profiles').update({ role: 'admin' }).eq('id', E.id);
    expect(error).toBeTruthy();
    expect(await role(E)).toBe('employe');
  });
});

describe('droits de l’employé', () => {
  it('lit les clients, ne les modifie pas', async ({ skip }) => {
    if (!migration) skip();
    const { data } = await E.sb.from('clients').select('id').eq('id', clientId);
    expect(data).toHaveLength(1);
    const ins = await E.sb.from('clients').insert({ entreprise_id: A.entrepriseId, nom: 'Intrus' }).select('id');
    expect(ins.error).toBeTruthy();
    const maj = await E.sb.from('clients').update({ nom: 'Piraté' }).eq('id', clientId).select('id');
    expect(maj.data ?? []).toEqual([]);
  });

  it('ni factures, ni relances, ni flotte, ni paiements directs', async ({ skip }) => {
    if (!migration) skip();
    const f = await E.sb.from('factures').insert({ entreprise_id: A.entrepriseId, client_id: clientId, montant_fcfa: 1, periode_debut: iso(0), periode_fin: iso(1), echeance: iso(1) }).select('id');
    expect(f.error).toBeTruthy();
    const r = await E.sb.from('relances').select('id');
    expect(r.data).toEqual([]);
    const t = await E.sb.from('tricycles').insert({ entreprise_id: A.entrepriseId, nom: 'Intrus' }).select('id');
    expect(t.error).toBeTruthy();
    const em = await E.sb.from('employes').update({ nom: 'Patron' }).eq('id', employeId).select('id');
    expect(em.data ?? []).toEqual([]);
    const p = await E.sb.from('paiements_clients').insert({ facture_id: factureId, entreprise_id: A.entrepriseId, client_id: clientId, montant_fcfa: 3500 }).select('id');
    expect(p.error).toBeTruthy();
  });

  it('ne voit rien d’une autre entreprise', async ({ skip }) => {
    if (!migration) skip();
    const { data } = await E.sb.from('clients').select('id').eq('entreprise_id', B.entrepriseId);
    expect(data).toEqual([]);
  });
});

describe('tournées de l’équipe', () => {
  beforeAll(async () => {
    if (!migration) return;
    const nouvelle = async (avecE: boolean) => {
      const { data } = await A.sb.from('tournees_precollecte').insert({ entreprise_id: A.entrepriseId, date: iso(0), notes: 'test employé' }).select('id').single();
      const id = (data as { id: string }).id;
      await A.sb.from('collectes').insert({ entreprise_id: A.entrepriseId, tournee_id: id, client_id: clientId, date_prevue: iso(0) });
      if (avecE) await A.sb.from('tournee_equipe').insert({ tournee_id: id, employe_id: employeId, entreprise_id: A.entrepriseId });
      return id;
    };
    t1 = await nouvelle(true);
    t2 = await nouvelle(false);
  });

  it('ne voit que les tournées de son équipe', async ({ skip }) => {
    if (!migration) skip();
    const { data } = await E.sb.from('tournees_precollecte').select('id').in('id', [t1, t2]);
    expect((data as { id: string }[]).map((x) => x.id)).toEqual([t1]);
  });

  it('pointer : sa tournée oui, une autre non', async ({ skip }) => {
    if (!migration) skip();
    const { data: c1 } = await A.sb.from('collectes').select('id').eq('tournee_id', t1).single();
    const { data: c2 } = await A.sb.from('collectes').select('id').eq('tournee_id', t2).single();
    const ok = await E.sb.rpc('pointer_passage', { p_collecte: (c1 as { id: string }).id, p_statut: 'non_realisee', p_motif: 'Client absent' });
    expect(ok.error).toBeNull();
    const ko = await E.sb.rpc('pointer_passage', { p_collecte: (c2 as { id: string }).id, p_statut: 'realisee' });
    expect(ko.error?.message).toMatch(/ne fait pas partie de vos tournées/);
    // Écriture directe : refusée.
    const direct = await E.sb.from('collectes').update({ statut: 'realisee' }).eq('id', (c1 as { id: string }).id).select('id');
    expect(direct.data ?? []).toEqual([]);
  });

  it('démarrer oui ; annuler non (réservé au gérant)', async ({ skip }) => {
    if (!migration) skip();
    expect((await E.sb.rpc('changer_statut_tournee', { p_tournee: t1, p_statut: 'en_cours' })).error).toBeNull();
    const annule = await E.sb.rpc('changer_statut_tournee', { p_tournee: t1, p_statut: 'annulee' });
    expect(annule.error?.message).toMatch(/Seul le gérant/);
  });

  it('scan : passage enregistré, code inconnu refusé', async ({ skip }) => {
    if (!migration) skip();
    const { data, error } = await E.sb.rpc('scanner_passage', { p_tournee: t1, p_code: clientCode });
    expect(error).toBeNull();
    expect(data).toMatchObject({ nom: 'Foyer Employé', hors_planning: false, deja_fait: false });
    const encore = await E.sb.rpc('scanner_passage', { p_tournee: t1, p_code: clientCode });
    expect(encore.data).toMatchObject({ deja_fait: true });
    const inconnu = await E.sb.rpc('scanner_passage', { p_tournee: t1, p_code: 'MKT-FFFFFFFF' });
    expect(inconnu.error?.message).toMatch(/inconnu/);
    const ailleurs = await E.sb.rpc('scanner_passage', { p_tournee: t2, p_code: clientCode });
    expect(ailleurs.error).toBeTruthy();
  });

  it('position en direct : visible du gérant, pas d’une autre entreprise ; une toutes les 10 s au plus', async ({ skip }) => {
    if (!migration) skip();
    expect((await E.sb.rpc('envoyer_position', { p_tournee: t1, p_lat: 3.85, p_lng: 11.5, p_precision: 12 })).error).toBeNull();
    expect((await E.sb.rpc('envoyer_position', { p_tournee: t1, p_lat: 3.86, p_lng: 11.51, p_precision: 12 })).error).toBeNull();
    const { data: vues } = await A.sb.from('positions_tournee').select('lat').eq('tournee_id', t1);
    expect(vues).toEqual([{ lat: 3.85 }]);
    const { data: direct } = await A.sb.rpc('positions_en_direct');
    expect((direct as { tournee_id: string }[]).some((d) => d.tournee_id === t1)).toBe(true);
    const { data: chezB } = await B.sb.from('positions_tournee').select('id').eq('tournee_id', t1);
    expect(chezB).toEqual([]);
    const intrus = await autre.sb.rpc('envoyer_position', { p_tournee: t1, p_lat: 1, p_lng: 1 });
    expect(intrus.error).toBeTruthy();
  });

  it('terminer oui ; rouvrir non (gérant seulement) ; plus de pointage une fois close', async ({ skip }) => {
    if (!migration) skip();
    expect((await E.sb.rpc('changer_statut_tournee', { p_tournee: t1, p_statut: 'terminee' })).error).toBeNull();
    const rouvrir = await E.sb.rpc('changer_statut_tournee', { p_tournee: t1, p_statut: 'en_cours' });
    expect(rouvrir.error?.message).toMatch(/Seul le gérant/);
    const { data: c1 } = await A.sb.from('collectes').select('id').eq('tournee_id', t1).single();
    const close = await A.sb.rpc('pointer_passage', { p_collecte: (c1 as { id: string }).id, p_statut: 'prevue' });
    expect(close.error?.message).toMatch(/Tournée close/);
    expect((await A.sb.rpc('changer_statut_tournee', { p_tournee: t1, p_statut: 'en_cours' })).error).toBeNull();
  });
});

describe('espèces encaissées par l’employé', () => {
  const statutFacture = async () => ((await A.sb.from('factures').select('statut').eq('id', factureId).single()).data as { statut: string }).statut;
  const impaye = async () =>
    Number(((await A.sb.from('v_clients_statut').select('montant_impaye').eq('id', clientId).single()).data as { montant_impaye: number }).montant_impaye);

  it('à valider : la facture n’est pas réglée pour autant', async ({ skip }) => {
    if (!migration) skip();
    const { error } = await E.sb.rpc('encaisser_especes', { p_client: clientId, p_montant: 2000 });
    expect(error).toBeNull();
    const { data } = await A.sb.from('paiements_clients').select('statut, encaisse_par').eq('facture_id', factureId);
    expect(data).toEqual([{ statut: 'a_valider', encaisse_par: employeId }]);
    expect(await statutFacture()).toBe('emise');
    expect(await impaye()).toBe(3500);
  });

  it('jamais deux fois la même somme : le reste déduit l’attente', async ({ skip }) => {
    if (!migration) skip();
    const { error } = await E.sb.rpc('encaisser_especes', { p_client: clientId, p_montant: 2000 });
    expect(error?.message).toMatch(/il reste 1500 FCFA/);
  });

  it('seul le gérant valide', async ({ skip }) => {
    if (!migration) skip();
    const { data } = await A.sb.from('paiements_clients').select('id').eq('facture_id', factureId).single();
    const id = (data as { id: string }).id;
    expect((await E.sb.rpc('valider_paiement', { p_paiement: id, p_valider: true })).error?.message).toMatch(/Réservé au gérant/);
    expect((await A.sb.rpc('valider_paiement', { p_paiement: id, p_valider: true })).error).toBeNull();
    expect(await impaye()).toBe(1500);
    expect(await statutFacture()).toBe('emise');
  });

  it('rejeté : ne compte pas ; validé : la facture est payée', async ({ skip }) => {
    if (!migration) skip();
    await E.sb.rpc('encaisser_especes', { p_client: clientId, p_montant: 1500 });
    const premier = (await A.sb.from('paiements_clients').select('id').eq('facture_id', factureId).eq('statut', 'a_valider').single()).data as { id: string };
    await A.sb.rpc('valider_paiement', { p_paiement: premier.id, p_valider: false });
    expect(await statutFacture()).toBe('emise');
    await E.sb.rpc('encaisser_especes', { p_client: clientId, p_montant: 1500 });
    const second = (await A.sb.from('paiements_clients').select('id').eq('facture_id', factureId).eq('statut', 'a_valider').single()).data as { id: string };
    await A.sb.rpc('valider_paiement', { p_paiement: second.id, p_valider: true });
    expect(await statutFacture()).toBe('payee');
  });

  it('statistiques de l’employé', async ({ skip }) => {
    if (!migration) skip();
    const { data } = await E.sb.rpc('mes_statistiques_employe', { p_jours: 30 });
    expect(data).toMatchObject({ passages_faits: 1, especes_validees: 3500, especes_a_valider: 0 });
  });
});

describe('suspension et retrait de l’accès', () => {
  it('fiche désactivée : plus rien n’est lisible', async ({ skip }) => {
    if (!migration) skip();
    await A.sb.from('employes').update({ actif: false }).eq('id', employeId);
    const { data } = await E.sb.from('clients').select('id').eq('id', clientId);
    expect(data).toEqual([]);
    await A.sb.from('employes').update({ actif: true }).eq('id', employeId);
    const { data: retour } = await E.sb.from('clients').select('id').eq('id', clientId);
    expect(retour).toHaveLength(1);
  });

  it('accès retiré : compte ménage ordinaire, plus aucune donnée', async ({ skip }) => {
    if (!migration) skip();
    expect((await E.sb.rpc('retirer_acces_employe', { p_employe: employeId })).error?.message).toMatch(/Réservé au gérant/);
    expect((await A.sb.rpc('retirer_acces_employe', { p_employe: employeId })).error).toBeNull();
    expect(await role(E)).toBe('citoyen');
    const { data } = await E.sb.from('clients').select('id').eq('id', clientId);
    expect(data).toEqual([]);
    const { data: fiche } = await A.sb.from('employes').select('user_id').eq('id', employeId).single();
    expect(fiche).toEqual({ user_id: null });
  });
});
