'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Banknote, Check, Loader2, MapPin, QrCode, RotateCcw, ShieldAlert, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { cn } from '@myklintown/ui';
import { QrScanner } from '@/components/qr-scanner';
import { encaisserEspecesAction, marquerCollecteAction, scannerClientAction, type ResultatScan } from '@/lib/terrain-actions';
import { fcfa, MOTIFS_NON_REALISEE, statutAbonnement } from '@/lib/format';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';

export interface Passage {
  id: string;
  statut: 'prevue' | 'realisee' | 'non_realisee';
  motif: string | null;
  client: {
    id: string;
    nom: string;
    code: string;
    quartier: string | null;
    adresse: string | null;
    statut_abonnement: string;
    lat: number | null;
    lng: number | null;
    /** Reste dû (paiements validés déduits) : propose l'encaissement en espèces. */
    montant_impaye?: number;
  };
}

const TERRAIN = {
  ok: { classe: 'bg-terrain-ok', icone: ShieldCheck, consigne: 'Servir' },
  relance: { classe: 'bg-terrain-relance', icone: TriangleAlert, consigne: 'Servir et rappeler le paiement' },
  stop: { classe: 'bg-terrain-stop', icone: ShieldAlert, consigne: 'Ne pas servir : impayé' },
  neutre: { classe: 'bg-brand-ink', icone: ShieldCheck, consigne: 'À vérifier' },
} as const;

export function TourneeRunner({
  tourneeId,
  passages,
  modifiable,
  espace = 'precollecteur',
  scanAuDepart = false,
  encaissement = false,
}: {
  tourneeId: string;
  passages: Passage[];
  modifiable: boolean;
  /** Espace qui affiche la tournée : liens vers la fiche client et la déclaration d'incident. */
  espace?: 'precollecteur' | 'employe';
  /** Ouvre directement la caméra (raccourci « Scanner » de l'employé). */
  scanAuDepart?: boolean;
  /** Bouton « Encaisser » sur les foyers qui doivent de l'argent. */
  encaissement?: boolean;
}) {
  const router = useRouter();
  const [etat, setEtat] = useState(() => new Map(passages.map((p) => [p.id, { statut: p.statut, motif: p.motif }])));
  // Le serveur fait foi : quand il renvoie de nouvelles données (fin de tournée,
  // passage ajouté hors planning), l'affichage s'aligne sans fermer le scanner.
  const empreinte = passages.map((p) => `${p.id}:${p.statut}:${p.motif ?? ''}`).join('|');
  useEffect(() => {
    setEtat(new Map(passages.map((p) => [p.id, { statut: p.statut, motif: p.motif }])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empreinte]);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [motifPour, setMotifPour] = useState<string | null>(null);
  const [scan, setScan] = useState(modifiable && scanAuDepart);
  const [encaissePour, setEncaissePour] = useState<string | null>(null);
  const [resultat, setResultat] = useState<ResultatScan | null>(null);
  const [, startTransition] = useTransition();

  const marquer = (id: string, statut: 'realisee' | 'non_realisee' | 'prevue', motif?: string) => {
    setEnCours(id);
    setMotifPour(null);
    startTransition(async () => {
      const r = await marquerCollecteAction({ collecteId: id, statut, motif });
      if (!r.error) {
        setEtat((m) => new Map(m).set(id, { statut, motif: motif ?? null }));
      }
      setEnCours(null);
    });
  };

  const onScan = (texte: string) => {
    startTransition(async () => {
      const r = await scannerClientAction(tourneeId, texte);
      setResultat(r);
      if (r.client && !r.error) {
        const p = passages.find((x) => x.client.code === r.client!.code);
        if (p) setEtat((m) => new Map(m).set(p.id, { statut: 'realisee', motif: null }));
        if (r.horsPlanning) router.refresh();
      }
    });
  };

  const faits = [...etat.values()].filter((e) => e.statut === 'realisee').length;
  const rates = [...etat.values()].filter((e) => e.statut === 'non_realisee').length;
  const restants = passages.length - faits - rates;
  const ordonnes = [...passages].sort((a, b) => {
    const sa = etat.get(a.id)!.statut === 'prevue' ? 0 : 1;
    const sb = etat.get(b.id)!.statut === 'prevue' ? 0 : 1;
    return sa - sb || a.client.nom.localeCompare(b.client.nom);
  });

  const rs = resultat?.client ? statutAbonnement(resultat.client.statut_abonnement) : null;
  const t = rs ? TERRAIN[rs.terrain] : null;

  return (
    <div className="space-y-4">
      <div className="card-soft sticky top-14 z-20 p-4 lg:top-0">
        <div className="flex items-center justify-between gap-3">
          <div className="num flex gap-4 text-body-sm">
            <span><strong className="text-h2-sm text-terrain-ok">{faits}</strong> faits</span>
            <span><strong className="text-h2-sm text-terrain-stop">{rates}</strong> non faits</span>
            <span><strong className="text-h2-sm text-brand-ink">{restants}</strong> restants</span>
          </div>
          {modifiable && (
            <button type="button" onClick={() => { setScan((s) => !s); setResultat(null); }} className={scan ? 'btn-outline' : 'btn-secondary'}>
              <QrCode size={18} /> {scan ? 'Fermer le scan' : 'Scanner'}
            </button>
          )}
        </div>
        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-muted">
          <span className="bg-terrain-ok transition-all" style={{ width: `${(faits / Math.max(1, passages.length)) * 100}%` }} />
          <span className="bg-terrain-stop transition-all" style={{ width: `${(rates / Math.max(1, passages.length)) * 100}%` }} />
        </div>
      </div>

      {scan && (
        <div className="card-soft overflow-hidden">
          <QrScanner onScan={onScan} />
          {resultat && (
            <div
              role="status"
              className={cn('flex items-center gap-4 p-5 text-white', resultat.error ? 'bg-brand-ink' : t?.classe)}
            >
              {resultat.error ? (
                <>
                  <X size={36} className="shrink-0" />
                  <p className="font-semibold">{resultat.error}</p>
                </>
              ) : (
                t && (
                  <>
                    <t.icone size={40} className="shrink-0" />
                    <div className="min-w-0">
                      <p className="text-small font-semibold uppercase tracking-wider opacity-90">{t.consigne}</p>
                      <p className="truncate text-h2 font-bold">{resultat.client!.nom}</p>
                      <p className="text-body-sm opacity-90">
                        {rs!.label} · {resultat.dejaFait ? 'passage déjà enregistré' : resultat.horsPlanning ? 'passage ajouté (hors planning)' : 'passage enregistré ✓'}
                      </p>
                    </div>
                  </>
                )
              )}
            </div>
          )}
        </div>
      )}

      <ul className="space-y-2">
        {ordonnes.map((p) => {
          const e = etat.get(p.id)!;
          const s = statutAbonnement(p.client.statut_abonnement);
          const bande = { ok: 'bg-terrain-ok', relance: 'bg-terrain-relance', stop: 'bg-terrain-stop', neutre: 'bg-border' }[s.terrain];
          return (
            <li key={p.id} className={cn('card-soft overflow-hidden', e.statut !== 'prevue' && 'opacity-80')}>
              <div className="flex items-stretch">
                <span className={cn('w-1.5 shrink-0', bande)} aria-hidden />
                <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 p-3.5">
                  <div className="min-w-0">
                    {espace === 'precollecteur' ? (
                      <Link href={`/precollecteur/clients/${p.client.id}`} className="block truncate font-semibold text-brand-ink">{p.client.nom}</Link>
                    ) : (
                      <p className="truncate font-semibold text-brand-ink">{p.client.nom}</p>
                    )}
                    <p className="truncate text-small text-muted-foreground">
                      {[p.client.quartier, p.client.adresse].filter(Boolean).join(' · ') || p.client.code}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className={s.chip}>{s.label}</span>
                      {e.statut === 'realisee' && <span className="chip-ok"><Check size={12} /> Collecté</span>}
                      {e.statut === 'non_realisee' && <span className="chip-stop">Non fait{e.motif ? ` · ${e.motif}` : ''}</span>}
                      {encaissement && Number(p.client.montant_impaye) > 0 && (
                        <button
                          type="button"
                          onClick={() => setEncaissePour(encaissePour === p.id ? null : p.id)}
                          className="chip-relance gap-1 hover:opacity-80"
                        >
                          <Banknote size={12} /> Encaisser · {fcfa(p.client.montant_impaye!)} dus
                        </button>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.client.lat != null && p.client.lng != null && (
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${p.client.lat},${p.client.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="grid h-11 w-11 place-content-center rounded-md border border-input text-muted-foreground hover:bg-muted"
                        aria-label="Itinéraire"
                      >
                        <MapPin size={18} />
                      </a>
                    )}
                    {modifiable &&
                      (enCours === p.id ? (
                        <Loader2 size={22} className="m-3 animate-spin text-muted-foreground" />
                      ) : e.statut === 'prevue' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setMotifPour(motifPour === p.id ? null : p.id)}
                            className="grid h-11 w-11 place-content-center rounded-md border border-terrain-stop/40 text-terrain-stop hover:bg-terrain-stop/5"
                            aria-label="Non collecté"
                          >
                            <X size={20} />
                          </button>
                          <button
                            type="button"
                            onClick={() => marquer(p.id, 'realisee')}
                            className="flex h-11 items-center gap-1.5 rounded-md bg-terrain-ok px-4 font-semibold text-white hover:bg-terrain-ok/90"
                          >
                            <Check size={20} /> Collecté
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Annuler le passage enregistré chez ${p.client.nom} ?`)) marquer(p.id, 'prevue');
                          }}
                          className="btn-ghost"
                          aria-label="Annuler"
                        >
                          <RotateCcw size={16} /> Annuler
                        </button>
                      ))}
                  </div>
                </div>
              </div>
              {encaissePour === p.id && (
                <ActionForm action={encaisserEspecesAction} className="flex flex-wrap items-end gap-2 border-t border-border bg-muted/40 p-3">
                  <input type="hidden" name="client_id" value={p.client.id} />
                  <div className="min-w-[9rem] flex-1">
                    <label className="field-label" htmlFor={`montant-${p.id}`}>Espèces reçues (FCFA)</label>
                    <input
                      id={`montant-${p.id}`}
                      name="montant"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      defaultValue={p.client.montant_impaye}
                      className="field"
                      required
                    />
                  </div>
                  <SubmitButton pendingLabel="Enregistrement…"><Banknote size={16} /> Enregistrer</SubmitButton>
                </ActionForm>
              )}
              {motifPour === p.id && (
                <div className="flex flex-wrap gap-2 border-t border-border bg-muted/40 p-3">
                  <span className="w-full text-small font-semibold text-muted-foreground">Pourquoi pas collecté ?</span>
                  {MOTIFS_NON_REALISEE.map((m) => (
                    <button key={m} type="button" onClick={() => marquer(p.id, 'non_realisee', m)} className="rounded-full border border-input bg-surface px-3 py-1.5 text-body-sm font-medium hover:border-terrain-stop hover:text-terrain-stop">
                      {m}
                    </button>
                  ))}
                  <Link
                    href={`/${espace}/incidents/nouveau?collecte=${p.id}&client=${p.client.id}&tournee=${tourneeId}`}
                    className="rounded-full bg-brand-ink px-3 py-1.5 text-body-sm font-semibold text-white"
                  >
                    Documenter un incident (photo / vidéo)
                  </Link>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
