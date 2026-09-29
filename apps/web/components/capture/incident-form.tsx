'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Send } from 'lucide-react';
import { createClient } from '@myklintown/db/client';
import { CameraCapture, type Capture } from './camera-capture';
import { CATEGORIES_INCIDENT, estErreurReseau, MESSAGE_RESEAU } from '@/lib/format';

const DUREE_MAX_ENVOI_MS = 90_000;
const DELAI_DEPASSE = 'MKT_DELAI_ENVOI';
import type { ActionState } from '@/lib/types';

export interface IncidentInput {
  categorie: string;
  description: string | null;
  clientId: string | null;
  collecteId: string | null;
  tourneeId: string | null;
  mediaPath: string | null;
  mediaType: 'photo' | 'video' | null;
  captureAt: string | null;
  lat: number | null;
  lng: number | null;
  /** Page où le serveur renvoie après l'enregistrement (redirection côté serveur). */
  retour?: string | null;
}

/**
 * Déclaration d'incident avec preuve capturée sur le moment.
 * Le média part directement du téléphone vers le stockage privé (dossier de
 * l'entreprise / de l'auteur), puis la déclaration est enregistrée côté serveur.
 */
export function IncidentForm({
  entrepriseId,
  categories,
  action,
  preuveObligatoire,
  clients,
  associations,
  retour,
  libelleEnvoi = 'Envoyer le signalement',
}: {
  entrepriseId: string;
  categories: string[];
  action: (input: IncidentInput) => Promise<ActionState>;
  preuveObligatoire?: boolean;
  clients?: { id: string; nom: string }[];
  associations?: { clientId?: string | null; collecteId?: string | null; tourneeId?: string | null };
  retour?: string;
  libelleEnvoi?: string;
}) {
  const [capture, setCapture] = useState<Capture | null>(null);
  const [categorie, setCategorie] = useState(categories[0] ?? 'autre');
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState(associations?.clientId ?? '');
  const [etat, setEtat] = useState<'idle' | 'envoi' | 'ok'>('idle');
  const [erreur, setErreur] = useState('');

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');
    if (preuveObligatoire && !capture) {
      setErreur('Une photo ou une vidéo prise maintenant est obligatoire pour ce signalement.');
      return;
    }
    setEtat('envoi');
    try {
      let mediaPath: string | null = null;
      if (capture) {
        const supabase = createClient();
        // Identité lue sur l'appareil (pas d'appel réseau) : une coupure ne doit
        // pas se déguiser en « session expirée ». Le serveur revérifie de toute façon.
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) throw new Error('Session expirée : reconnectez-vous.');
        mediaPath = `${entrepriseId}/${session.user.id}/${crypto.randomUUID()}.${capture.ext}`;
        const envoi = supabase.storage.from('preuves').upload(mediaPath, capture.blob, {
          contentType: capture.mime,
          upsert: false,
        });
        // Jamais d'attente infinie sur un réseau qui ne répond plus.
        const delai = new Promise<never>((_, rejeter) =>
          setTimeout(() => rejeter(new Error(DELAI_DEPASSE)), DUREE_MAX_ENVOI_MS),
        );
        const { error } = await Promise.race([envoi, delai]);
        if (error) {
          throw new Error(estErreurReseau(error) ? MESSAGE_RESEAU : `Envoi de la preuve impossible : ${error.message}`);
        }
      }
      const r = await action({
        categorie,
        description: description.trim() || null,
        clientId: clientId || null,
        collecteId: associations?.collecteId ?? null,
        tourneeId: associations?.tourneeId ?? null,
        mediaPath,
        mediaType: capture?.type ?? null,
        captureAt: capture?.capturedAt ?? null,
        lat: capture?.lat ?? null,
        lng: capture?.lng ?? null,
        retour: retour ?? null,
      });
      if (r?.error) throw new Error(r.error);
      setEtat('ok');
      // Avec `retour`, c'est le serveur qui redirige dans la même réponse : une
      // navigation lancée ici après coup pouvait être écrasée par la mise à jour
      // de page que déclenche l'action (constaté par les tests).
    } catch (err) {
      setEtat('idle');
      const message = (err as Error).message ?? '';
      setErreur(
        message === DELAI_DEPASSE
          ? 'L’envoi de la preuve prend trop de temps (réseau lent). Votre photo est conservée : réessayez.'
          : estErreurReseau({ message }) || /unexpected response/i.test(message)
            ? MESSAGE_RESEAU
            : message,
      );
    }
  };

  if (etat === 'ok' && !retour) {
    return (
      <div className="card-soft flex flex-col items-center gap-3 p-8 text-center">
        <CheckCircle2 size={40} className="text-terrain-ok" />
        <p className="text-h2-sm font-semibold text-brand-ink">Signalement enregistré</p>
        <button
          type="button"
          className="btn-outline"
          onClick={() => {
            setEtat('idle');
            setCapture(null);
            setDescription('');
          }}
        >
          Nouveau signalement
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={envoyer} className="grid gap-5 lg:grid-cols-2">
      <div>
        <p className="field-label">
          Preuve {preuveObligatoire ? <span className="text-terrain-stop">(obligatoire)</span> : <span className="font-normal text-muted-foreground">(recommandée)</span>}
        </p>
        <CameraCapture onChange={setCapture} />
      </div>
      <div className="space-y-4">
        <fieldset>
          <legend className="field-label">Nature du problème</legend>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <label key={c} className="cursor-pointer rounded-full border border-input bg-surface px-3 py-2 text-body-sm font-medium has-[:checked]:border-brand-ink has-[:checked]:bg-brand-ink has-[:checked]:text-white">
                <input type="radio" name="categorie" value={c} checked={categorie === c} onChange={() => setCategorie(c)} className="sr-only" />
                {CATEGORIES_INCIDENT[c] ?? c}
              </label>
            ))}
          </div>
        </fieldset>
        {clients && (
          <div>
            <label className="field-label" htmlFor="inc-client">Client concerné</label>
            <select id="inc-client" value={clientId} onChange={(e) => setClientId(e.target.value)} className="field">
              <option value="">— Aucun en particulier —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.nom}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="field-label" htmlFor="inc-desc">Description</label>
          <textarea
            id="inc-desc"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="field"
            placeholder="Que s’est-il passé ? Où exactement ?"
          />
        </div>
        {erreur && (
          <p role="alert" className="flex items-start gap-2 rounded-md border border-terrain-stop/25 bg-terrain-stop/5 px-3 py-2 text-body-sm text-terrain-stop">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> {erreur}
          </p>
        )}
        <button type="submit" disabled={etat !== 'idle'} className="btn-primary w-full">
          {etat === 'envoi' ? <Loader2 size={16} className="animate-spin" /> : etat === 'ok' ? <CheckCircle2 size={16} /> : <Send size={16} />}
          {etat === 'envoi' ? 'Envoi de la preuve…' : etat === 'ok' ? 'Enregistré' : libelleEnvoi}
        </button>
      </div>
    </form>
  );
}
