'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Circle, RefreshCcw, ShieldAlert, Square, Video } from 'lucide-react';
import { cn } from '@myklintown/ui';

export interface Capture {
  blob: Blob;
  type: 'photo' | 'video';
  mime: string;
  ext: string;
  capturedAt: string;
  lat: number | null;
  lng: number | null;
  apercu: string;
}

const DUREE_MAX_VIDEO = 30;

function choisirMimeVideo(): { mime: string; ext: string } {
  const candidats = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  for (const m of candidats) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
      return { mime: m, ext: m.startsWith('video/mp4') ? 'mp4' : 'webm' };
    }
  }
  return { mime: '', ext: 'webm' };
}

/**
 * Prise de vue DANS l'application, sans aucun accès à la galerie.
 *
 * Exigence du cahier des fonctionnalités (§1.5 et §2.3) : la preuve doit être
 * capturée au moment des faits. Il n'y a donc volontairement aucun
 * `<input type="file">` ici — même avec `capture`, certains navigateurs Android
 * proposent la galerie. On passe par le flux caméra (getUserMedia), la photo
 * est horodatée et géolocalisée dans l'image elle-même.
 */
export function CameraCapture({ onChange }: { onChange: (c: Capture | null) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const posRef = useRef<{ lat: number; lng: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [etat, setEtat] = useState<'inactif' | 'demarrage' | 'pret' | 'enregistrement' | 'refus' | 'erreur'>('inactif');
  const [secondes, setSecondes] = useState(0);
  const [capture, setCapture] = useState<Capture | null>(null);
  const [erreur, setErreur] = useState('');

  const arreterFlux = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  useEffect(() => () => arreterFlux(), [arreterFlux]);

  const ouvrir = async (m: 'photo' | 'video' = mode) => {
    setEtat('demarrage');
    setErreur('');
    arreterFlux();
    navigator.geolocation?.getCurrentPosition(
      (p) => (posRef.current = { lat: p.coords.latitude, lng: p.coords.longitude }),
      () => undefined,
      { enableHighAccuracy: true, timeout: 10000 },
    );
    try {
      const video = { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: m === 'video' });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setEtat('pret');
    } catch (err) {
      const e = err as DOMException;
      if (e?.name === 'NotAllowedError') setEtat('refus');
      else {
        setEtat('erreur');
        setErreur(e?.name === 'NotFoundError' ? 'Aucune caméra sur cet appareil.' : 'Caméra indisponible.');
      }
    }
  };

  const terminer = (c: Capture) => {
    arreterFlux();
    setCapture(c);
    setEtat('inactif');
    onChange(c);
  };

  const prendrePhoto = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(v, 0, 0);
    // Horodatage incrusté : la preuve porte sa date et son lieu.
    const maintenant = new Date();
    const pos = posRef.current;
    const ligne = `MyKlinTown · ${maintenant.toLocaleString('fr-FR')}${pos ? ` · ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}` : ''}`;
    const h = Math.max(28, Math.round(canvas.height * 0.045));
    ctx.fillStyle = 'rgba(13,36,56,0.72)';
    ctx.fillRect(0, canvas.height - h, canvas.width, h);
    ctx.fillStyle = '#fff';
    ctx.font = `600 ${Math.round(h * 0.5)}px sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(ligne, Math.round(h * 0.4), canvas.height - h / 2);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        terminer({
          blob,
          type: 'photo',
          mime: 'image/jpeg',
          ext: 'jpg',
          capturedAt: maintenant.toISOString(),
          lat: pos?.lat ?? null,
          lng: pos?.lng ?? null,
          apercu: URL.createObjectURL(blob),
        });
      },
      'image/jpeg',
      0.85,
    );
  };

  const demarrerVideo = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const { mime, ext } = choisirMimeVideo();
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_200_000 }) : new MediaRecorder(stream);
    chunksRef.current = [];
    const debut = new Date();
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onstop = () => {
      const type = (rec.mimeType || mime || 'video/webm').split(';')[0]!;
      const blob = new Blob(chunksRef.current, { type });
      terminer({
        blob,
        type: 'video',
        mime: type,
        ext: type === 'video/mp4' ? 'mp4' : ext,
        capturedAt: debut.toISOString(),
        lat: posRef.current?.lat ?? null,
        lng: posRef.current?.lng ?? null,
        apercu: URL.createObjectURL(blob),
      });
    };
    rec.start(1000);
    recRef.current = rec;
    setSecondes(0);
    setEtat('enregistrement');
    timerRef.current = setInterval(() => {
      setSecondes((s) => {
        if (s + 1 >= DUREE_MAX_VIDEO) arreterVideo();
        return s + 1;
      });
    }, 1000);
  };

  const arreterVideo = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
  };

  const recommencer = () => {
    if (capture) URL.revokeObjectURL(capture.apercu);
    setCapture(null);
    onChange(null);
    void ouvrir();
  };

  const changerMode = (m: 'photo' | 'video') => {
    if (etat === 'enregistrement') return;
    setMode(m);
    if (etat === 'pret') void ouvrir(m);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-input bg-brand-ink">
      {!capture && (
        <div className="flex border-b border-white/10">
          {(['photo', 'video'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => changerMode(m)}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 py-2.5 text-body-sm font-semibold',
                mode === m ? 'bg-white/10 text-white' : 'text-white/60',
              )}
            >
              {m === 'photo' ? <Camera size={16} /> : <Video size={16} />} {m === 'photo' ? 'Photo' : 'Vidéo'}
            </button>
          ))}
        </div>
      )}

      <div className="relative aspect-[4/3] w-full">
        {capture ? (
          capture.type === 'photo' ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={capture.apercu} alt="Preuve capturée" className="absolute inset-0 h-full w-full object-contain" />
          ) : (
            <video src={capture.apercu} controls playsInline className="absolute inset-0 h-full w-full object-contain" />
          )
        ) : (
          <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
        )}

        {!capture && etat === 'inactif' && (
          <button type="button" onClick={() => void ouvrir()} className="absolute inset-0 grid place-content-center gap-3 text-white">
            <span className="mx-auto grid h-16 w-16 place-content-center rounded-full bg-brand-green">
              {mode === 'photo' ? <Camera size={28} /> : <Video size={28} />}
            </span>
            <span className="font-semibold">Ouvrir la caméra</span>
            <span className="max-w-xs px-6 text-center text-small text-white/70">
              La preuve est prise maintenant, datée et localisée. L’import depuis la galerie n’est pas possible.
            </span>
          </button>
        )}
        {etat === 'demarrage' && <p className="absolute inset-0 grid place-content-center text-body-sm text-white">Démarrage de la caméra…</p>}
        {(etat === 'refus' || etat === 'erreur') && (
          <div className="absolute inset-0 grid place-content-center gap-3 px-6 text-center text-white">
            <ShieldAlert size={32} className="mx-auto text-warning" />
            <p className="font-semibold">{etat === 'refus' ? 'Accès caméra refusé' : erreur}</p>
            <p className="text-small text-white/70">Autorisez la caméra dans les réglages du navigateur puis réessayez.</p>
            <button type="button" onClick={() => void ouvrir()} className="btn-primary mx-auto">
              <RefreshCcw size={14} /> Réessayer
            </button>
          </div>
        )}
        {etat === 'enregistrement' && (
          <span className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-terrain-stop px-3 py-1 text-small font-bold text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> REC {secondes}s / {DUREE_MAX_VIDEO}s
          </span>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 p-3">
        {capture ? (
          <button type="button" onClick={recommencer} className="btn-outline border-white/20 bg-transparent text-white hover:bg-white/10">
            <RefreshCcw size={16} /> Reprendre
          </button>
        ) : etat === 'pret' && mode === 'photo' ? (
          <button type="button" onClick={prendrePhoto} className="grid h-16 w-16 place-content-center rounded-full border-4 border-white bg-white/20" aria-label="Prendre la photo">
            <Circle size={40} className="fill-white text-white" />
          </button>
        ) : etat === 'pret' && mode === 'video' ? (
          <button type="button" onClick={demarrerVideo} className="grid h-16 w-16 place-content-center rounded-full border-4 border-white" aria-label="Démarrer l’enregistrement">
            <Circle size={40} className="fill-terrain-stop text-terrain-stop" />
          </button>
        ) : etat === 'enregistrement' ? (
          <button type="button" onClick={arreterVideo} className="grid h-16 w-16 place-content-center rounded-full border-4 border-white" aria-label="Arrêter">
            <Square size={26} className="fill-white text-white" />
          </button>
        ) : (
          <span className="h-16" />
        )}
      </div>
    </div>
  );
}
