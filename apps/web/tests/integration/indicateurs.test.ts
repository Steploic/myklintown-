/**
 * Indicateurs du pilote, côté base réelle (migration 20261013000011) :
 *   - le tableau n'est lisible que par la Mairie et les administrateurs ;
 *   - une activité réelle (passage réalisé) se retrouve dans la semaine en cours ;
 *   - les charges du mois restent privées au gérant ;
 *   - « résolu » pose l'heure de résolution.
 * Les calculs eux-mêmes sont vérifiés au chiffre près hors ligne
 * (supabase/tests-securite/indicateurs.test.mjs).
 * Ignorés, avec la consigne, tant que la migration n'est pas exécutée.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { clientAnonyme, compte, mairie, plans, precollecteur, type Compte, type Precollecteur } from '../support/fixtures';
import type { TableauIndicateurs } from '@/lib/indicateurs';

let A: Precollecteur;
let B: Precollecteur;
let M: Compte & { promue: boolean };
let menage: Compte;
let migration = false;

/** Aujourd'hui à Yaoundé (la base raisonne en jours de Yaoundé). */
const aujourdhui = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala' }).format(new Date());
const moisEnCours = () => `${aujourdhui().slice(0, 7)}-01`;

beforeAll(async () => {
  A = await precollecteur('precoA', 'Test Propreté A');
  B = await precollecteur('precoB', 'Test Concurrent B');
  M = await mairie();
  menage = await compte('menage', 'citoyen');
  migration = !(await A.sb.from('couts_exploitation').select('id').limit(1)).error;
  if (!migration) {
    console.warn('\n⚠️  Tests « indicateurs du pilote » IGNORÉS : exécuter supabase/migrations/20261013000011_indicateurs_pilote.sql\n');
    return;
  }
  await A.sb.from('couts_exploitation').delete().eq('entreprise_id', A.entrepriseId);
});

describe('tableau des indicateurs', () => {
  it('la Mairie le lit : 3 mois, les cibles du livrable, les relevés hebdomadaires', async ({ skip }) => {
    if (!migration || !M.promue) skip();
    const { data, error } = await M.sb.rpc('indicateurs_pilote', { p_perimetre: 'pilote' });
    expect(error).toBeNull();
    const t = data as TableauIndicateurs;
    expect(t.pilote).toEqual({ debut: '2026-10-01', fin: '2026-12-31' });
    expect(t.mois.map((m) => m.debut)).toEqual(['2026-10-01', '2026-11-01', '2026-12-01']);
    expect(t.cibles?.abonnes_actifs).toEqual([800, 1500, 2000]);
    expect(t.cibles?.taux_paiement).toEqual([0.7, 0.8, 0.85]);
    expect(Array.isArray(t.semaines)).toBe(true);
    expect(t.aujourdhui).toBe(aujourdhui());
  });

  it('ni un ménage, ni un précollecteur, ni un visiteur', async ({ skip }) => {
    if (!migration) skip();
    for (const sb of [menage.sb, A.sb]) {
      const { error } = await sb.rpc('indicateurs_pilote', { p_perimetre: 'pilote' });
      expect(error?.message).toMatch(/Réservé à la Mairie/);
      expect((await sb.from('kpi_releves').select('id')).data ?? []).toHaveLength(0);
    }
    expect((await clientAnonyme().rpc('indicateurs_pilote', { p_perimetre: 'pilote' })).error).toBeTruthy();
    expect((await A.sb.rpc('kpi_calculer', { p_debut: '2026-10-01', p_fin: '2026-10-07' })).error).toBeTruthy();
  });

  it('un périmètre inconnu est refusé', async ({ skip }) => {
    if (!migration || !M.promue) skip();
    const { error } = await M.sb.rpc('indicateurs_pilote', { p_perimetre: 'kribi' });
    expect(error?.message).toMatch(/Périmètre inconnu/);
  });

  it('un passage réalisé aujourd’hui entre dans la semaine en cours', async ({ skip }) => {
    if (!migration || !M.promue) skip();
    const avant = ((await M.sb.rpc('indicateurs_pilote', { p_perimetre: 'pilote' })).data as TableauIndicateurs).semaine_en_cours;
    if (!avant) skip(); // hors de la période du pilote

    const [mensuel] = await plans(A.sb);
    const c = await A.sb.from('clients').insert({ entreprise_id: A.entrepriseId, nom: 'Indicateur 1', plan_id: mensuel!.id }).select('id').single();
    const t = await A.sb.from('tournees_precollecte').insert({ entreprise_id: A.entrepriseId, date: aujourdhui(), statut: 'terminee' }).select('id').single();
    const co = await A.sb
      .from('collectes')
      .insert({ entreprise_id: A.entrepriseId, tournee_id: t.data!.id, client_id: c.data!.id, date_prevue: aujourdhui(), statut: 'realisee' });
    expect(co.error).toBeNull();

    const apres = ((await M.sb.rpc('indicateurs_pilote', { p_perimetre: 'pilote' })).data as TableauIndicateurs).semaine_en_cours!;
    expect(apres.taux_execution.num).toBe(avant!.taux_execution.num + 1);
    expect(apres.taux_execution.den).toBe(avant!.taux_execution.den + 1);
    expect(apres.menages_inscrits).toBe(avant!.menages_inscrits + 1);
  });
});

describe('charges du mois', () => {
  it('le gérant saisit et corrige ; l’auteur est posé par la base', async ({ skip }) => {
    if (!migration) skip();
    const ligne = { entreprise_id: A.entrepriseId, mois: moisEnCours(), categorie: 'carburant', montant_fcfa: 30000, saisi_par: B.id };
    expect((await A.sb.from('couts_exploitation').upsert(ligne, { onConflict: 'entreprise_id,mois,categorie' })).error).toBeNull();
    expect(
      (await A.sb.from('couts_exploitation').upsert({ ...ligne, montant_fcfa: 32000 }, { onConflict: 'entreprise_id,mois,categorie' })).error,
    ).toBeNull();
    const { data } = await A.sb.from('couts_exploitation').select('montant_fcfa, saisi_par').eq('entreprise_id', A.entrepriseId).single();
    expect(data).toEqual({ montant_fcfa: 32000, saisi_par: A.id });
  });

  it('refuse un mois mal formé et un poste inconnu', async ({ skip }) => {
    if (!migration) skip();
    const base = { entreprise_id: A.entrepriseId, montant_fcfa: 1 };
    expect((await A.sb.from('couts_exploitation').insert({ ...base, mois: `${aujourdhui().slice(0, 7)}-15`, categorie: 'entretien' })).error).toBeTruthy();
    expect((await A.sb.from('couts_exploitation').insert({ ...base, mois: moisEnCours(), categorie: 'loyer' })).error).toBeTruthy();
  });

  it('un autre précollecteur et la Mairie ne voient rien, n’écrivent rien', async ({ skip }) => {
    if (!migration) skip();
    const lecteurs = M.promue ? [B.sb, M.sb] : [B.sb];
    for (const sb of lecteurs) {
      expect((await sb.from('couts_exploitation').select('id').eq('entreprise_id', A.entrepriseId)).data ?? []).toHaveLength(0);
      const ecrit = await sb.from('couts_exploitation').insert({ entreprise_id: A.entrepriseId, mois: moisEnCours(), categorie: 'autres', montant_fcfa: 1 });
      expect(ecrit.error).toBeTruthy();
    }
    expect((await clientAnonyme().from('couts_exploitation').select('id')).error).toBeTruthy();
  });
});

describe('signalements : heure de résolution', () => {
  it('posée par la base au passage à « résolu », effacée à la réouverture', async ({ skip }) => {
    if (!migration) skip();
    const i = await A.sb
      .from('incidents_precollecte')
      .insert({ entreprise_id: A.entrepriseId, source: 'precollecteur', categorie: 'autre', description: 'Indicateurs : résolution' })
      .select('id, resolu_at')
      .single();
    expect(i.error).toBeNull();
    expect(i.data!.resolu_at).toBeNull();

    const r = await A.sb.from('incidents_precollecte').update({ statut: 'resolu', resolu_at: '2020-01-01T00:00:00Z' }).eq('id', i.data!.id).select('resolu_at').single();
    expect(Math.abs(Date.now() - new Date(r.data!.resolu_at as string).getTime())).toBeLessThan(5 * 60_000);

    const o = await A.sb.from('incidents_precollecte').update({ statut: 'en_cours' }).eq('id', i.data!.id).select('resolu_at').single();
    expect(o.data!.resolu_at).toBeNull();
    await A.sb.from('incidents_precollecte').update({ statut: 'resolu' }).eq('id', i.data!.id);
  });
});
