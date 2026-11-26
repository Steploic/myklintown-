/**
 * Sans les Mairies (migration 20261126000027), contre la base de test :
 *   - le gérant trace, renomme et supprime SA zone, affectée d'office à son
 *     entreprise ; un concurrent n'y touche pas ; le gérant ne la donne pas ;
 *   - un abonné est rangé dans une zone de SON précollecteur, jamais d'un
 *     concurrent ;
 *   - accès Mairie fermés : la Mairie ne lit plus rien, aucune demande d'accès
 *     ne passe ; rouverts, tout revient comme avant.
 * Les attaques sont aussi vérifiées hors ligne (supabase/tests-securite).
 * Ignorés, avec la consigne, tant que la migration n'est pas exécutée.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  carreEnMer, compte, interrupteurMairies, mairie, precollecteur, supprimerClientsDeTest, type Precollecteur,
} from '../support/fixtures';

type CompteMairie = Awaited<ReturnType<typeof mairie>>;

let A: Precollecteur;
let B: Precollecteur;
let M: CompteMairie;
let migration = false;
let zoneA = '';
const DECALAGE = 0.6;
const CONTOUR = carreEnMer(DECALAGE);
// Au milieu du carré (côté 0,02°).
const DANS = { lat: 2.5 + DECALAGE + 0.01, lng: 9.3 + DECALAGE + 0.01 };
const NOMS = ['Foyer test sans Mairie A', 'Foyer test sans Mairie B'];

beforeAll(async () => {
  A = await precollecteur('precoA', 'Test Propreté A');
  B = await precollecteur('precoB', 'Test Propreté B');
  M = await mairie(); // ouvre les accès Mairie (monde d'avant)
  migration = !(await A.sb.rpc('mairies_actives')).error;
  if (!migration) {
    console.warn('\n⚠️  Tests « sans Mairie » IGNORÉS : exécuter supabase/migrations/20261126000027_sans_mairie.sql\n');
    return;
  }
  await A.sb.from('zones').delete().eq('entreprise_id', A.entrepriseId).like('nom', 'Zone test%');
});

afterAll(async () => {
  if (!migration) return;
  await supprimerClientsDeTest(A.sb, A.entrepriseId, { noms: NOMS });
  await supprimerClientsDeTest(B.sb, B.entrepriseId, { noms: NOMS });
  if (zoneA) await A.sb.from('zones').delete().eq('id', zoneA);
  await interrupteurMairies(true);
});

const fiche = (P: Precollecteur, nom: string, zoneId: string | null) =>
  P.sb
    .from('clients')
    .insert({ entreprise_id: P.entrepriseId, nom, telephone: null, tarif_fcfa: 2000, facturation_mois: 1, passages_semaine: 2, statut: 'actif', lat: DANS.lat, lng: DANS.lng, zone_id: zoneId })
    .select('id, zone_id')
    .single();

describe('zones tracées par le précollecteur', () => {
  it('le gérant trace sa zone : elle est affectée d’office à son entreprise', async ({ skip }) => {
    if (!migration) skip();
    const { data, error } = await A.sb.from('zones').insert({ nom: 'Zone test sans Mairie', contour: CONTOUR, entreprise_id: A.entrepriseId }).select('id').single();
    expect(error).toBeNull();
    zoneA = (data as { id: string }).id;
    const { data: af } = await A.sb.from('zone_affectations').select('entreprise_id').eq('zone_id', zoneA);
    expect(af).toEqual([{ entreprise_id: A.entrepriseId }]);
  });

  it('un concurrent ne la renomme, ne la supprime, ne s’y affecte ni n’en trace au nom de A ; A ne la donne pas', async ({ skip }) => {
    if (!migration || !zoneA) skip();
    expect((await B.sb.from('zones').update({ nom: 'Zone test volée' }).eq('id', zoneA).select('id')).data ?? []).toEqual([]);
    expect((await B.sb.from('zones').delete().eq('id', zoneA).select('id')).data ?? []).toEqual([]);
    expect((await B.sb.from('zone_affectations').insert({ zone_id: zoneA, entreprise_id: B.entrepriseId })).error).not.toBeNull();
    expect((await B.sb.from('zones').insert({ nom: 'Zone test piège', contour: CONTOUR, entreprise_id: A.entrepriseId })).error).not.toBeNull();
    const donnee = await A.sb.from('zones').update({ entreprise_id: B.entrepriseId }).eq('id', zoneA);
    expect(donnee.error?.message).toMatch(/reste à l.entreprise/);
    const renommee = await A.sb.from('zones').update({ nom: 'Zone test sans Mairie (Est)' }).eq('id', zoneA).select('nom');
    expect(renommee.data).toEqual([{ nom: 'Zone test sans Mairie (Est)' }]);
  });

  it('un abonné est rangé dans une zone de SON précollecteur, jamais dans celle d’un concurrent', async ({ skip }) => {
    if (!migration || !zoneA) skip();
    const a = await fiche(A, NOMS[0]!, null);
    expect(a.error).toBeNull();
    expect(a.data?.zone_id).toBe(zoneA);
    const b = await fiche(B, NOMS[1]!, zoneA);
    expect(b.error).toBeNull();
    expect(b.data?.zone_id).toBeNull();
  });
});

describe('accès Mairie fermés', () => {
  it('la Mairie ne lit plus rien, aucune demande d’accès ne passe ; rouverts, tout revient', async ({ skip }) => {
    if (!migration || M.role !== 'mairie') skip();
    const avant = await M.sb.from('entreprises').select('id').eq('id', A.entrepriseId);
    const candidat = await compte('accesFerme', 'citoyen');
    expect(await interrupteurMairies(false)).toBe(true);
    try {
      expect((await M.sb.from('entreprises').select('id').eq('id', A.entrepriseId)).data ?? []).toEqual([]);
      expect((await M.sb.rpc('indicateurs_pilote', { p_perimetre: 'YDE3' })).error?.message).toMatch(/Réservé/);
      const demande = await candidat.sb.rpc('demander_acces_mairie', {
        p_commune: M.communeId, p_fonction: 'Agent de test', p_service: null, p_telephone: null, p_message: null,
      });
      expect(demande.error?.message).toMatch(/fermés/);
    } finally {
      await interrupteurMairies(true);
      await candidat.sb.rpc('annuler_demande_acces');
    }
    expect((await M.sb.from('entreprises').select('id').eq('id', A.entrepriseId)).data ?? []).toEqual(avant.data ?? []);
  });
});
