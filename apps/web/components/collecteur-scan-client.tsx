'use client';

import { useState } from 'react';
import { CheckCircle2, Clock, QrCode, RefreshCcw, Smartphone, WifiOff, X } from 'lucide-react';
import { QrScanner } from './qr-scanner';

type ScanType = 'collecte_ok' | 'bac_vide' | 'absent' | 'inaccessible';

const TYPE_LABEL: Record<ScanType, { label: string; class: string }> = {
  collecte_ok: { label: 'Collecte OK', class: 'badge-success' },
  bac_vide: { label: 'Bac vide', class: 'badge-info' },
  absent: { label: 'Absent', class: 'badge-warning' },
  inaccessible: { label: 'Inaccessible', class: 'badge-danger' },
};

interface SessionScan {
  id: string;
  code: string;
  foyer: string;
  secteur: string;
  time: string;
  type: ScanType;
}

/**
 * Déduit un libellé foyer + secteur lisible depuis un QR code MyKlinTown.
 * Format attendu : MKT-YDE3-NSAM-C0427  (préfixe-commune-secteur-identifiant)
 * Tolère tout autre contenu : on affiche le texte brut.
 */
function parseQr(code: string): { foyer: string; secteur: string } {
  const parts = code.trim().split('-');
  if (parts[0] === 'MKT' && parts.length >= 4) {
    const secteur = parts[2] ?? '—';
    const ref = parts.slice(3).join('-');
    return { foyer: `Foyer ${ref}`, secteur };
  }
  return { foyer: code, secteur: '—' };
}

function nowHHMM(): string {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function CollecteurScanClient() {
  const [scans, setScans] = useState<SessionScan[]>([]);
  const [pending, setPending] = useState<{ code: string; foyer: string; secteur: string } | null>(
    null,
  );

  const handleScan = (text: string) => {
    // Ignore si une confirmation est déjà ouverte
    if (pending) return;
    const { foyer, secteur } = parseQr(text);
    setPending({ code: text, foyer, secteur });
    // Retour haptique sur mobile
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate?.(80);
    }
  };

  const confirm = (type: ScanType) => {
    if (!pending) return;
    setScans((prev) => [
      {
        id: `${Date.now()}`,
        code: pending.code,
        foyer: pending.foyer,
        secteur: pending.secteur,
        time: nowHHMM(),
        type,
      },
      ...prev,
    ]);
    setPending(null);
  };

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Scanner */}
        <section className="card-soft overflow-hidden lg:col-span-2">
          <QrScanner onScan={handleScan} />
        </section>

        {/* Status */}
        <div className="space-y-6">
          <section className="card-soft p-5">
            <div className="flex items-center justify-between">
              <h2 className="m-0">Session de scan</h2>
              <span className="badge-success">Live</span>
            </div>
            <ul className="mt-3 space-y-2 text-body-sm">
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Scans cette session</span>
                <span className="font-semibold">{scans.length}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Collectes OK</span>
                <span className="font-semibold text-brand-green">
                  {scans.filter((s) => s.type === 'collecte_ok').length}
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Anomalies</span>
                <span className="font-semibold">
                  {scans.filter((s) => s.type !== 'collecte_ok').length}
                </span>
              </li>
            </ul>
          </section>

          <section className="card-soft p-5">
            <h2 className="m-0">Mode hors-ligne</h2>
            <p className="mt-1 text-body-sm text-muted-foreground">
              Les scans sont conservés localement et synchronisés au retour du réseau.
            </p>
            <label className="mt-3 flex cursor-pointer items-center justify-between rounded-lg border border-border p-3">
              <span className="flex items-center gap-2 text-body-sm font-medium">
                <WifiOff size={16} /> Forcer hors-ligne
              </span>
              <input type="checkbox" className="h-5 w-5 accent-brand-green" />
            </label>
          </section>
        </div>
      </div>

      {/* Historique de la session */}
      <section className="card-soft overflow-hidden">
        <div className="flex items-center justify-between border-b border-border p-5">
          <div>
            <h2 className="m-0">Scans de la session</h2>
            <p className="text-small text-muted-foreground">
              {scans.length === 0
                ? 'Aucun scan pour le moment — activez la caméra ci-dessus.'
                : `${scans.length} scan${scans.length > 1 ? 's' : ''} enregistré${scans.length > 1 ? 's' : ''}.`}
            </p>
          </div>
        </div>
        {scans.length > 0 && (
          <ul className="divide-y divide-border">
            {scans.map((s) => (
              <li key={s.id} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/40">
                <span className="grid h-10 w-10 place-content-center rounded-md bg-brand-blue/10 text-brand-blue">
                  <Clock size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-semibold">{s.foyer}</p>
                  <p className="truncate text-small text-muted-foreground">
                    Secteur {s.secteur} · {s.time} · <span className="font-mono">{s.code}</span>
                  </p>
                </div>
                <span className={TYPE_LABEL[s.type].class}>{TYPE_LABEL[s.type].label}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Modale de confirmation après scan */}
      {pending && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-elevated">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-content-center rounded-full bg-brand-green/15 text-brand-green">
                  <QrCode size={22} />
                </span>
                <div>
                  <p className="text-body-sm font-semibold">{pending.foyer}</p>
                  <p className="text-small text-muted-foreground">
                    Secteur {pending.secteur} ·{' '}
                    <span className="font-mono">{pending.code}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setPending(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mt-5 text-body-sm font-semibold">Enregistrer ce passage comme :</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => confirm('collecte_ok')} className="btn-primary">
                <CheckCircle2 size={16} /> Collecte OK
              </button>
              <button type="button" onClick={() => confirm('bac_vide')} className="btn-outline">
                Bac vide
              </button>
              <button type="button" onClick={() => confirm('absent')} className="btn-outline">
                Absent
              </button>
              <button type="button" onClick={() => confirm('inaccessible')} className="btn-outline">
                Inaccessible
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
