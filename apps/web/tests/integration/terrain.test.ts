/**
 * Terrain : flotte, tournées, passages, incidents et preuves (stockage privé).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { JPEG_1PX, plans, precollecteur, type Precollecteur } from '../support/fixtures';

let A: Precollecteur;
let clientId: string;
let tourneeId: string;

beforeAll(async () => {
  A = await precollecteur('precoA', 'Test Propreté A');
  const [mensuel] = await plans(A.sb);
  const c = await A.sb.from('clients').insert({ entreprise_id: A.entrepriseId, nom: 'Terrain 1', plan_id: mensuel!.id }).select('id').single();
  if (c.error) throw c.error;
  clientId = c.data.id;
  const t = await A.sb.from('tournees_precollecte').insert({ entreprise_id: A.entrepriseId }).select('id').single();
  if (t.error) throw t.error;
  tourneeId = t.data.id;
});

describe('flotte et équipe', () => {
  it('un employé et un tricycle, puis l’équipage', async () => {
    const e = await A.sb.from('employes').insert({ entreprise_id: A.entrepriseId, nom: 'Chauffeur', fonction: 'chauffeur' }).select('id').single();
    const t = await A.sb.from('tricycles').insert({ entreprise_id: A.entrepriseId, nom: 'Tricycle 1', capacite_kg: 500 }).select('id, statut').single();
    expect(e.error).toBeNull();
    expect(t.data?.statut).toBe('actif');
    expect((await A.sb.from('tricycle_employes').insert({ tricycle_id: t.data!.id, employe_id: e.data!.id })).error).toBeNull();
  });
  it('refuse une fonction ou un état inconnus', async () => {
    expect((await A.sb.from('employes').insert({ entreprise_id: A.entrepriseId, nom: 'x', fonction: 'pilote' })).error).toBeTruthy();
    expect((await A.sb.from('tricycles').insert({ entreprise_id: A.entrepriseId, nom: 'x', statut: 'volé' })).error).toBeTruthy();
  });
  it('insertion groupée à colonnes hétérogènes (régression démo)', async () => {
    const r = await A.sb.from('tricycles').insert([
      { entreprise_id: A.entrepriseId, nom: 'T-A', statut: 'actif' },
      { entreprise_id: A.entrepriseId, nom: 'T-B', statut: 'maintenance' },
    ]);
    expect(r.error).toBeNull();
  });
});

describe('tournées et passages', () => {
  it('un passage par client et par tournée, pas de doublon', async () => {
    expect((await A.sb.from('collectes').insert({ entreprise_id: A.entrepriseId, tournee_id: tourneeId, client_id: clientId })).error).toBeNull();
    expect((await A.sb.from('collectes').insert({ entreprise_id: A.entrepriseId, tournee_id: tourneeId, client_id: clientId })).error).toBeTruthy();
  });
  it('réalisé puis annulé puis non réalisé avec motif', async () => {
    const { data } = await A.sb.from('collectes').select('id').eq('tournee_id', tourneeId).eq('client_id', clientId).single();
    const id = data!.id;
    await A.sb.from('collectes').update({ statut: 'realisee', realisee_at: new Date().toISOString() }).eq('id', id);
    await A.sb.from('collectes').update({ statut: 'prevue', realisee_at: null }).eq('id', id);
    const r = await A.sb.from('collectes').update({ statut: 'non_realisee', motif: 'Client absent' }).eq('id', id).select('statut, motif').single();
    expect(r.data).toEqual({ statut: 'non_realisee', motif: 'Client absent' });
  });
  it('refuse un statut de passage inconnu', async () => {
    const { data } = await A.sb.from('collectes').select('id').eq('tournee_id', tourneeId).single();
    expect((await A.sb.from('collectes').update({ statut: 'fait' }).eq('id', data!.id)).error).toBeTruthy();
  });
  it('supprimer la tournée supprime ses passages (cascade)', async () => {
    const t = await A.sb.from('tournees_precollecte').insert({ entreprise_id: A.entrepriseId }).select('id').single();
    await A.sb.from('collectes').insert({ entreprise_id: A.entrepriseId, tournee_id: t.data!.id, client_id: clientId });
    await A.sb.from('tournees_precollecte').delete().eq('id', t.data!.id);
    const { data } = await A.sb.from('collectes').select('id').eq('tournee_id', t.data!.id);
    expect(data).toHaveLength(0);
  });
});

describe('incidents et preuves', () => {
  it('dépôt d’une photo dans son dossier, lecture par URL signée', async () => {
    const chemin = `${A.entrepriseId}/${A.id}/photo-${Date.now()}.jpg`;
    expect((await A.sb.storage.from('preuves').upload(chemin, JPEG_1PX, { contentType: 'image/jpeg' })).error).toBeNull();
    const { data } = await A.sb.storage.from('preuves').createSignedUrl(chemin, 60);
    expect(data?.signedUrl).toMatch(/^https:\/\//);
    const res = await fetch(data!.signedUrl);
    expect(res.status).toBe(200);
    const i = await A.sb.from('incidents_precollecte').insert({ entreprise_id: A.entrepriseId, source: 'precollecteur', categorie: 'depot_sauvage', client_id: clientId, media_path: chemin, media_type: 'photo' });
    expect(i.error).toBeNull();
  });
  it('dépôt d’une vidéo webm accepté', async () => {
    const r = await A.sb.storage.from('preuves').upload(`${A.entrepriseId}/${A.id}/video-${Date.now()}.webm`, Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), { contentType: 'video/webm' });
    expect(r.error).toBeNull();
  });
  it('refuse un type de fichier non prévu (PDF, texte…)', async () => {
    const r = await A.sb.storage.from('preuves').upload(`${A.entrepriseId}/${A.id}/doc-${Date.now()}.txt`, Buffer.from('bonjour'), { contentType: 'text/plain' });
    expect(r.error).toBeTruthy();
  });
  it('refuse un dépôt dans le dossier d’un autre utilisateur', async () => {
    const r = await A.sb.storage.from('preuves').upload(`${A.entrepriseId}/00000000-0000-0000-0000-000000000000/x-${Date.now()}.jpg`, JPEG_1PX, { contentType: 'image/jpeg' });
    expect(r.error).toBeTruthy();
  });
  it('un précollecteur ne peut pas se faire passer pour un client', async () => {
    const r = await A.sb.from('incidents_precollecte').insert({ entreprise_id: A.entrepriseId, source: 'client', categorie: 'autre' });
    expect(r.error).toBeTruthy();
  });
  it('statut d’incident : ouvert → en_cours → résolu, refus des valeurs inconnues', async () => {
    const i = await A.sb.from('incidents_precollecte').insert({ entreprise_id: A.entrepriseId, source: 'precollecteur', categorie: 'autre' }).select('id, statut').single();
    expect(i.data?.statut).toBe('ouvert');
    await A.sb.from('incidents_precollecte').update({ statut: 'en_cours' }).eq('id', i.data!.id);
    const r = await A.sb.from('incidents_precollecte').update({ statut: 'resolu' }).eq('id', i.data!.id).select('statut').single();
    expect(r.data?.statut).toBe('resolu');
    expect((await A.sb.from('incidents_precollecte').update({ statut: 'oublié' }).eq('id', i.data!.id)).error).toBeTruthy();
  });
});
