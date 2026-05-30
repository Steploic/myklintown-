'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { Camera, RefreshCcw, ShieldAlert } from 'lucide-react';

type ScanState = 'idle' | 'starting' | 'scanning' | 'denied' | 'error';

interface QrScannerProps {
  /** Appelé à chaque code décodé (anti-rebond intégré : 3 s pour un même code). */
  onScan: (text: string) => void;
  /** Hauteur de la zone caméra. Défaut : aspect vidéo. */
  className?: string;
}

/**
 * Scanner QR réel basé sur la caméra du navigateur (@zxing/browser).
 *
 * - Fonctionne sur mobile et desktop, aucun backend requis.
 * - Préfère la caméra arrière (`facingMode: environment`).
 * - Conserve le viewfinder visuel de la charte par-dessus le flux vidéo.
 * - Demande la permission caméra uniquement après action explicite de l'agent.
 */
export function QrScanner({ onScan, className }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef<{ text: string; at: number } | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const [state, setState] = useState<ScanState>('idle');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [errorMsg, setErrorMsg] = useState('');

  const stop = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {
      /* déjà arrêté */
    }
    controlsRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setState('starting');
    setErrorMsg('');
    stop();
    try {
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode } },
        videoRef.current!,
        (result) => {
          if (!result) return;
          const text = result.getText();
          const now = Date.now();
          const last = lastScanRef.current;
          // Anti-rebond : ignore le même code répété en moins de 3 s
          if (last && last.text === text && now - last.at < 3000) return;
          lastScanRef.current = { text, at: now };
          onScanRef.current(text);
        },
      );
      controlsRef.current = controls;
      setState('scanning');
    } catch (err) {
      const e = err as DOMException;
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setState('denied');
      } else if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') {
        setState('error');
        setErrorMsg('Aucune caméra disponible sur cet appareil.');
      } else {
        setState('error');
        setErrorMsg(e.message || 'Erreur d’accès à la caméra.');
      }
    }
  }, [facingMode, stop]);

  // Redémarre le flux quand on bascule de caméra (uniquement si déjà actif)
  useEffect(() => {
    if (state === 'scanning' || state === 'starting') {
      void start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  // Nettoyage à la destruction du composant
  useEffect(() => () => stop(), [stop]);

  const active = state === 'scanning' || state === 'starting';

  return (
    <div className={className}>
      <div className="relative aspect-video overflow-hidden bg-foreground">
        {/* Flux vidéo */}
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          muted
          playsInline
          aria-label="Aperçu caméra"
        />

        {/* Overlay viewfinder (charte) — visible uniquement caméra active */}
        {active && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="relative h-3/4 w-3/4 max-w-md">
              <div className="absolute inset-0 rounded-2xl border-2 border-white/30" />
              {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((pos) => (
                <span
                  key={pos}
                  className={`absolute h-8 w-8 border-brand-green ${
                    pos.includes('top') ? 'top-0 border-t-4' : 'bottom-0 border-b-4'
                  } ${pos.includes('left') ? 'left-0 rounded-tl-2xl border-l-4' : 'right-0 rounded-tr-2xl border-r-4'}`}
                />
              ))}
              <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-brand-green shadow-[0_0_20px_2px_rgba(79,163,106,0.7)]" />
            </div>
            <p className="absolute bottom-6 left-0 right-0 text-center text-body-sm font-medium text-white">
              Centrez le QR Code dans le cadre…
            </p>
          </div>
        )}

        {/* État : inactif */}
        {state === 'idle' && (
          <button
            type="button"
            onClick={() => void start()}
            className="absolute inset-0 grid place-items-center bg-foreground/95 text-white"
          >
            <span className="flex flex-col items-center gap-3">
              <span className="grid h-16 w-16 place-content-center rounded-full bg-brand-green">
                <Camera size={28} />
              </span>
              <span className="text-body-sm font-semibold">Activer la caméra</span>
              <span className="max-w-xs text-center text-small text-white/70">
                Autorisez l’accès caméra pour scanner les QR codes des ménages.
              </span>
            </span>
          </button>
        )}

        {/* État : démarrage */}
        {state === 'starting' && (
          <div className="absolute inset-0 grid place-items-center bg-foreground/80 text-white">
            <p className="text-body-sm">Démarrage de la caméra…</p>
          </div>
        )}

        {/* État : permission refusée */}
        {state === 'denied' && (
          <div className="absolute inset-0 grid place-items-center bg-foreground/95 px-6 text-center text-white">
            <span className="flex flex-col items-center gap-3">
              <span className="grid h-16 w-16 place-content-center rounded-full bg-warning/20 text-warning">
                <ShieldAlert size={28} />
              </span>
              <span className="text-body-sm font-semibold">Accès caméra refusé</span>
              <span className="max-w-xs text-small text-white/70">
                Autorisez la caméra dans les réglages du navigateur, puis réessayez.
              </span>
              <button type="button" onClick={() => void start()} className="btn-primary mt-1">
                <RefreshCcw size={14} /> Réessayer
              </button>
            </span>
          </div>
        )}

        {/* État : erreur */}
        {state === 'error' && (
          <div className="absolute inset-0 grid place-items-center bg-foreground/95 px-6 text-center text-white">
            <span className="flex flex-col items-center gap-3">
              <span className="grid h-16 w-16 place-content-center rounded-full bg-danger/20 text-danger">
                <ShieldAlert size={28} />
              </span>
              <span className="text-body-sm font-semibold">{errorMsg}</span>
              <button type="button" onClick={() => void start()} className="btn-primary mt-1">
                <RefreshCcw size={14} /> Réessayer
              </button>
            </span>
          </div>
        )}
      </div>

      {/* Barre de contrôle */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
        <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
          <Camera size={16} />
          {state === 'scanning'
            ? `Caméra ${facingMode === 'environment' ? 'arrière' : 'avant'} active`
            : 'Caméra inactive'}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-outline"
            onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
            disabled={!active}
          >
            <RefreshCcw size={14} /> Basculer caméra
          </button>
        </div>
      </div>
    </div>
  );
}
