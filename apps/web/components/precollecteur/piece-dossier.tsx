'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import { createClient } from '@myklintown/db/client';
import { cheminPiece, TYPES_LOGO, TYPES_PIECE, verifierFichier, type Piece } from '@/lib/dossier';
import { enregistrerPieceAction } from '@/lib/precollecteur/actions';
import { estErreurReseau, MESSAGE_RESEAU } from '@/lib/format';

/** Au-delà, l'envoi est abandonné : jamais d'attente infinie sur un réseau qui ne répond plus. */
const DUREE_MAX_ENVOI_MS = 90_000;

/**
 * Dépôt d'une pièce du dossier (autorisation d'une commune, permis) ou du logo :
 * le fichier part directement dans le stockage (dossier de l'entreprise), puis
 * le serveur l'inscrit au dossier. Photo prise au téléphone ou PDF scanné.
 */
export function PieceDossier({
  entrepriseId,
  piece,
  communeId,
  libelle,
  deposee,
}: {
  entrepriseId: string;
  piece: Piece;
  communeId?: string;
  libelle: string;
  deposee: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [etat, setEtat] = useState<'idle' | 'envoi' | 'ok'>('idle');
  const [erreur, setErreur] = useState('');

  const envoyer = async (fichier: File) => {
    setErreur('');
    const refus = verifierFichier(piece, fichier);
    if (refus) return setErreur(refus);
    setEtat('envoi');
    try {
      const chemin = cheminPiece(entrepriseId, piece, fichier.type, communeId);
      const envoi = createClient()
        .storage.from(piece === 'logo' ? 'logos' : 'dossiers')
        .upload(chemin, fichier, { contentType: fichier.type, upsert: false });
      const delai = new Promise<never>((_, rejeter) =>
        setTimeout(() => rejeter(new Error('Envoi trop long : vérifiez votre connexion puis réessayez.')), DUREE_MAX_ENVOI_MS),
      );
      const { error } = await Promise.race([envoi, delai]);
      if (error) throw new Error(estErreurReseau(error) ? MESSAGE_RESEAU : `Envoi impossible : ${error.message}`);
      const r = await enregistrerPieceAction({ piece, chemin, commune: communeId ?? null });
      if (r.error) throw new Error(r.error);
      setEtat('ok');
      router.refresh();
    } catch (e) {
      setEtat('idle');
      setErreur(e instanceof Error ? e.message : 'Envoi impossible.');
    } finally {
      if (ref.current) ref.current.value = '';
    }
  };

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={`btn-outline cursor-pointer ${etat === 'envoi' ? 'pointer-events-none opacity-60' : ''}`}>
        {etat === 'envoi' ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
        {etat === 'envoi' ? 'Envoi…' : `${deposee ? 'Remplacer' : 'Déposer'} ${libelle}`}
      </label>
      <input
        id={id}
        ref={ref}
        type="file"
        accept={(piece === 'logo' ? TYPES_LOGO : TYPES_PIECE).join(',')}
        className="sr-only"
        disabled={etat === 'envoi'}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void envoyer(f);
        }}
      />
      {etat === 'ok' && (
        <p role="status" className="flex items-center gap-1.5 text-small font-semibold text-terrain-ok">
          <CheckCircle2 size={14} /> Bien reçu.
        </p>
      )}
      {erreur && (
        <p role="alert" className="flex items-start gap-1.5 text-small text-terrain-stop">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {erreur}
        </p>
      )}
    </div>
  );
}
