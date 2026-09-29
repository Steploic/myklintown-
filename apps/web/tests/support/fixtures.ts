/**
 * Comptes et données de TEST, réutilisés d'une exécution à l'autre.
 *
 * - Les identifiants vivent dans `tests/.fixtures.local.json` (ignoré par git :
 *   le dépôt est public). Absent ? Il est créé avec un suffixe et un mot de
 *   passe neufs.
 * - Adresses : mkt.test.<clé>.<suffixe>@gmail.com — le motif que
 *   `supabase/NETTOYAGE_TESTS.sql` sait supprimer.
 * - Chaque exécution REMET À ZÉRO les données des entreprises de test avant de
 *   commencer : les tests ne dépendent jamais d'un état laissé par le précédent.
 * - Les zones de test sont tracées EN MER, au large de Kribi : aucun vrai
 *   ménage ne peut y tomber.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const RACINE = path.resolve(__dirname, '..', '..');

function lireEnv(): Record<string, string> {
  const fichier = path.join(RACINE, '.env.local');
  const brut = fs.existsSync(fichier) ? fs.readFileSync(fichier, 'utf8') : '';
  const env: Record<string, string> = {};
  for (const ligne of brut.split(/\r?\n/)) {
    if (!ligne.includes('=') || ligne.trim().startsWith('#')) continue;
    const i = ligne.indexOf('=');
    env[ligne.slice(0, i).trim()] = ligne.slice(i + 1).trim();
  }
  return { ...env, ...(process.env as Record<string, string>) };
}

const ENV = lireEnv();
export const SUPABASE_URL = ENV.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON = ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
if (!SUPABASE_URL || !SUPABASE_ANON) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY absents (apps/web/.env.local).');
}

const FICHIER_FIXTURES = path.join(RACINE, 'tests', '.fixtures.local.json');

export interface Identifiants {
  suffixe: string;
  motDePasse: string;
}

export function identifiants(): Identifiants {
  if (fs.existsSync(FICHIER_FIXTURES)) return JSON.parse(fs.readFileSync(FICHIER_FIXTURES, 'utf8'));
  const id = {
    suffixe: String(Date.now()),
    motDePasse: 'Test-' + Math.random().toString(36).slice(2, 10) + '!9',
  };
  fs.writeFileSync(FICHIER_FIXTURES, JSON.stringify(id, null, 2));
  return id;
}

export const emailDe = (cle: string) => `mkt.test.${cle}.${identifiants().suffixe}@gmail.com`;

export function clientAnonyme(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface Compte {
  sb: SupabaseClient;
  id: string;
  email: string;
  role: string;
}

/** Connexion au compte de test `cle` ; création s'il n'existe pas encore. */
export async function compte(cle: string, roleDemande: 'citoyen' | 'precollecteur' | string = 'citoyen'): Promise<Compte> {
  const sb = clientAnonyme();
  const email = emailDe(cle);
  const { motDePasse } = identifiants();
  let { data, error } = await sb.auth.signInWithPassword({ email, password: motDePasse });
  if (error) {
    const r = await sb.auth.signUp({
      email,
      password: motDePasse,
      options: { data: { nom_complet: `Test ${cle}`, role: roleDemande, telephone: '690000000' } },
    });
    if (r.error || !r.data.session) throw new Error(`Création du compte ${cle} : ${r.error?.message ?? 'pas de session'}`);
    ({ data, error } = await sb.auth.signInWithPassword({ email, password: motDePasse }));
    if (error) throw error;
  }
  const { data: p } = await sb.from('profiles').select('role').eq('id', data.user!.id).single();
  return { sb, id: data.user!.id, email, role: (p as { role: string } | null)?.role ?? '?' };
}

export interface Precollecteur extends Compte {
  entrepriseId: string;
}

/** Compte précollecteur de test avec son entreprise, données remises à zéro. */
export async function precollecteur(cle: string, nomEntreprise: string): Promise<Precollecteur> {
  const c = await compte(cle, 'precollecteur');
  if (c.role !== 'precollecteur') throw new Error(`${cle} devrait être précollecteur, il est ${c.role}`);
  let { data } = await c.sb.from('entreprise_membres').select('entreprise_id').eq('user_id', c.id).maybeSingle();
  if (!data) {
    const r = await c.sb.rpc('creer_mon_entreprise', { p_nom: nomEntreprise, p_telephone: '690000001', p_siege: 'Test' });
    if (r.error) throw r.error;
    data = { entreprise_id: r.data as string };
  }
  const entrepriseId = (data as { entreprise_id: string }).entreprise_id;
  await reinitialiser(c.sb, entrepriseId);
  return { ...c, entrepriseId };
}

/** Efface les données d'exploitation d'une entreprise de test (cascade SQL). */
export async function reinitialiser(sb: SupabaseClient, entrepriseId: string) {
  for (const table of ['clients', 'tournees_precollecte', 'employes', 'tricycles'] as const) {
    const { error } = await sb.from(table).delete().eq('entreprise_id', entrepriseId);
    if (error) throw new Error(`Remise à zéro ${table} : ${error.message}`);
  }
  // Les incidents ne se suppriment pas (ce sont des preuves) : on clôt ceux des essais précédents.
  await sb.from('incidents_precollecte').update({ statut: 'resolu' }).eq('entreprise_id', entrepriseId).neq('statut', 'resolu');
}

/** Compte Mairie de test : n'existe qu'après promotion SQL (voir tests/README.md). */
export async function mairie(): Promise<Compte & { promue: boolean }> {
  const c = await compte('mairie', 'citoyen');
  const promue = c.role === 'mairie' || c.role === 'admin';
  if (promue) {
    await c.sb.from('zones').delete().like('nom', 'Zone test%');
  }
  return { ...c, promue };
}

export async function plans(sb: SupabaseClient) {
  const { data, error } = await sb.from('plans_tarifaires').select('*').eq('actif', true).order('ordre');
  if (error) throw error;
  return data as { id: string; code: string; prix_fcfa: number; duree_mois: number }[];
}

/** Carré en mer au large de Kribi (Atlantique) : aucun domicile réel dedans. */
export function carreEnMer(decalage = 0, cote = 0.02) {
  const lat = 2.5 + decalage;
  const lng = 9.3 + decalage;
  return {
    type: 'Polygon' as const,
    coordinates: [[[lng, lat], [lng + cote, lat], [lng + cote, lat + cote], [lng, lat + cote], [lng, lat]]],
  };
}
export const POINT_EN_MER = { lat: 2.51, lng: 9.31 };

export const iso = (decalageJours = 0) => {
  const d = new Date(Date.now() + decalageJours * 86_400_000);
  return d.toISOString().slice(0, 10);
};

/** Image JPEG minimale valide (1×1) pour les tests de stockage. */
export const JPEG_1PX = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);
