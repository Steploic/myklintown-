'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check, Loader2, MousePointerClick, PenLine, Plus, Trash2, Undo2, X } from 'lucide-react';
import { cn } from '@myklintown/ui';
import {
  affecterZoneAction,
  enregistrerZoneAction,
  retirerAffectationAction,
  supprimerZoneAction,
  verifierConflitsAction,
  type Conflit,
} from '@/lib/mairie/actions';
import type { ZoneCarte } from './zone-map';
import type { GeoPolygon } from '@/lib/types';

const ZoneMap = dynamic(() => import('./zone-map'), {
  ssr: false,
  loading: () => <div className="grid h-[560px] place-content-center rounded-xl border border-border bg-muted text-muted-foreground">Chargement de la carte…</div>,
});

const COULEURS = ['#2E7F8E', '#3E9A5E', '#2B6CB0', '#B86E00', '#8E44AD', '#C8372D', '#0D2438'];

export interface ZoneEdit {
  id: string;
  nom: string;
  couleur: string;
  commune_id: string | null;
  contour: GeoPolygon;
  entreprises: { id: string; nom: string }[];
  nb_clients: number;
}

export function ZoneEditor({
  zones,
  entreprises,
  communes,
}: {
  zones: ZoneEdit[];
  entreprises: { id: string; nom: string }[];
  communes: { id: string; nom: string }[];
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<string | null>(null);
  const [dessin, setDessin] = useState<null | { id: string | null }>(null);
  const [points, setPoints] = useState<[number, number][]>([]);
  const [nom, setNom] = useState('');
  const [couleur, setCouleur] = useState(COULEURS[0]!);
  const [commune, setCommune] = useState(communes[0]?.id ?? '');
  const [conflits, setConflits] = useState<Conflit[] | null>(null);
  const [autorise, setAutorise] = useState(false);
  const [message, setMessage] = useState<{ ok?: string; error?: string }>({});
  const [enCours, start] = useTransition();

  const zoneSel = zones.find((z) => z.id === selection) ?? null;
  const carte: ZoneCarte[] = useMemo(
    () =>
      zones
        .filter((z) => !dessin || z.id !== dessin.id)
        .map((z) => ({
          id: z.id,
          nom: z.nom,
          couleur: z.couleur,
          contour: z.contour,
          attribuee: z.entreprises.length > 0,
          etiquette: z.entreprises.length ? z.entreprises.map((e) => e.nom).join(', ') : 'Non attribuée',
        })),
    [zones, dessin],
  );
  const nonAttribuees = zones.filter((z) => z.entreprises.length === 0).length;

  const commencer = (z?: ZoneEdit) => {
    setMessage({});
    setConflits(null);
    setAutorise(false);
    if (z) {
      setDessin({ id: z.id });
      setNom(z.nom);
      setCouleur(z.couleur);
      setCommune(z.commune_id ?? communes[0]?.id ?? '');
      const pts = z.contour.coordinates[0]!.slice(0, -1).map(([lng, lat]) => [lat, lng] as [number, number]);
      setPoints(pts);
    } else {
      setDessin({ id: null });
      setNom('');
      setPoints([]);
      setCouleur(COULEURS[zones.length % COULEURS.length]!);
    }
    setSelection(null);
  };

  const annuler = () => {
    setDessin(null);
    setPoints([]);
    setConflits(null);
  };

  const ajouterPoint = (p: [number, number]) => {
    setPoints((pts) => [...pts, p]);
    setConflits(null);
  };

  const verifier = () =>
    start(async () => {
      setConflits(await verifierConflitsAction(points, dessin?.id));
    });

  const enregistrer = () =>
    start(async () => {
      const r = await enregistrerZoneAction({
        id: dessin?.id,
        nom,
        couleur,
        communeId: commune || null,
        points,
        chevauchementAutorise: autorise,
      });
      setMessage(r);
      if (!r.error) {
        setDessin(null);
        setPoints([]);
        setSelection(r.id ?? null);
        router.refresh();
      }
    });

  const agir = (fn: () => Promise<{ ok?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setMessage(r);
      router.refresh();
    });

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-body-sm text-muted-foreground">
            <span className="mr-3 inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-brand-teal" /> attribuée</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-2 border-dashed border-[#8A96A3]" /> non attribuée ({nonAttribuees})</span>
          </p>
          {!dessin && (
            <button type="button" className="btn-primary" onClick={() => commencer()}>
              <Plus size={16} /> Dessiner une zone
            </button>
          )}
        </div>
        {dessin && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-ink px-4 py-3 text-white">
            <span className="flex items-center gap-2 text-body-sm">
              <MousePointerClick size={18} className="text-brand-leaf" />
              Touchez la carte pour poser les sommets ({points.length} point{points.length > 1 ? 's' : ''}).
            </span>
            <span className="flex gap-2">
              <button type="button" onClick={() => setPoints((p) => p.slice(0, -1))} disabled={!points.length} className="inline-flex items-center gap-1 rounded-md bg-white/10 px-3 py-1.5 text-body-sm font-semibold disabled:opacity-40">
                <Undo2 size={14} /> Annuler le point
              </button>
              <button type="button" onClick={() => setPoints([])} disabled={!points.length} className="inline-flex items-center gap-1 rounded-md bg-white/10 px-3 py-1.5 text-body-sm font-semibold disabled:opacity-40">
                Effacer
              </button>
            </span>
          </div>
        )}
        <ZoneMap zones={carte} selection={selection} onSelect={setSelection} dessin={!!dessin} points={points} onPoint={ajouterPoint} />
      </div>

      <aside className="space-y-4">
        {message.error && (
          <p className="flex items-start gap-2 rounded-md border border-terrain-stop/25 bg-terrain-stop/5 px-3 py-2 text-body-sm text-terrain-stop">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> {message.error}
          </p>
        )}
        {message.ok && !message.error && (
          <p className="flex items-center gap-2 rounded-md border border-terrain-ok/25 bg-terrain-ok/5 px-3 py-2 text-body-sm text-terrain-ok">
            <Check size={16} /> {message.ok}
          </p>
        )}

        {dessin ? (
          <div className="card-soft space-y-4 p-5">
            <p className="text-h2-sm font-semibold text-brand-ink">{dessin.id ? 'Modifier la zone' : 'Nouvelle zone'}</p>
            <div>
              <label className="field-label" htmlFor="z-nom">Nom</label>
              <input id="z-nom" value={nom} onChange={(e) => setNom(e.target.value)} className="field" placeholder="ex. Nsam — Bloc Est" />
            </div>
            <div>
              <label className="field-label" htmlFor="z-com">Commune</label>
              <select id="z-com" value={commune} onChange={(e) => setCommune(e.target.value)} className="field">
                {communes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nom}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="field-label">Couleur</p>
              <div className="flex gap-2">
                {COULEURS.map((c) => (
                  <button key={c} type="button" onClick={() => setCouleur(c)} aria-label={`Couleur ${c}`} className={cn('h-8 w-8 rounded-full border-2', couleur === c ? 'border-brand-ink ring-2 ring-brand-ink/20' : 'border-white')} style={{ background: c }} />
                ))}
              </div>
            </div>

            <button type="button" onClick={verifier} disabled={points.length < 3 || enCours} className="btn-outline w-full">
              {enCours ? <Loader2 size={16} className="animate-spin" /> : null} Vérifier les chevauchements
            </button>
            {conflits && (
              conflits.length === 0 ? (
                <p className="flex items-center gap-2 text-body-sm font-semibold text-terrain-ok"><Check size={16} /> Aucun chevauchement.</p>
              ) : (
                <div className="rounded-md bg-terrain-relance/10 p-3 text-body-sm text-terrain-relance">
                  <p className="font-semibold">Chevauche :</p>
                  <ul className="list-inside list-disc">
                    {conflits.map((c) => (
                      <li key={c.id}>{c.nom} — {Math.round(c.recouvrement_m2).toLocaleString('fr-FR')} m²</li>
                    ))}
                  </ul>
                  <label className="mt-2 flex items-center gap-2">
                    <input type="checkbox" checked={autorise} onChange={(e) => setAutorise(e.target.checked)} className="h-4 w-4" />
                    Chevauchement autorisé
                  </label>
                </div>
              )
            )}

            <div className="flex gap-2">
              <button type="button" onClick={annuler} className="btn-outline flex-1"><X size={16} /> Annuler</button>
              <button type="button" onClick={enregistrer} disabled={points.length < 3 || !nom.trim() || enCours} className="btn-primary flex-1">
                {enCours ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Enregistrer
              </button>
            </div>
          </div>
        ) : zoneSel ? (
          <div className="card-soft space-y-4 p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-2 text-h2-sm font-semibold text-brand-ink">
                  <span className="h-3.5 w-3.5 rounded-sm" style={{ background: zoneSel.couleur }} /> {zoneSel.nom}
                </p>
                <p className="text-small text-muted-foreground">{zoneSel.nb_clients} ménage{zoneSel.nb_clients > 1 ? 's' : ''} abonné{zoneSel.nb_clients > 1 ? 's' : ''}</p>
              </div>
              <button type="button" onClick={() => setSelection(null)} className="text-muted-foreground" aria-label="Fermer"><X size={18} /></button>
            </div>
            <div>
              <p className="field-label">Précollecteurs affectés</p>
              {zoneSel.entreprises.length === 0 ? (
                <p className="text-body-sm text-terrain-relance">Aucun — zone non couverte.</p>
              ) : (
                <ul className="space-y-1.5">
                  {zoneSel.entreprises.map((e) => (
                    <li key={e.id} className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2 text-body-sm">
                      <span className="font-medium">{e.nom}</span>
                      <button type="button" onClick={() => agir(() => retirerAffectationAction(zoneSel.id, e.id))} className="text-muted-foreground hover:text-terrain-stop" aria-label={`Retirer ${e.nom}`}>
                        <X size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {entreprises.filter((e) => !zoneSel.entreprises.some((x) => x.id === e.id)).length > 0 && (
                <select
                  className="field mt-2"
                  value=""
                  onChange={(ev) => ev.target.value && agir(() => affecterZoneAction(zoneSel.id, ev.target.value))}
                  aria-label="Affecter un précollecteur"
                >
                  <option value="">+ Affecter un précollecteur…</option>
                  {entreprises
                    .filter((e) => !zoneSel.entreprises.some((x) => x.id === e.id))
                    .map((e) => (
                      <option key={e.id} value={e.id}>{e.nom}</option>
                    ))}
                </select>
              )}
            </div>
            <div className="flex gap-2 border-t border-border pt-4">
              <button type="button" onClick={() => commencer(zoneSel)} className="btn-outline flex-1"><PenLine size={16} /> Modifier</button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Supprimer la zone « ${zoneSel.nom} » ? Les ménages qui y sont rattachés perdront leur zone.`)) {
                    agir(() => supprimerZoneAction(zoneSel.id));
                    setSelection(null);
                  }
                }}
                className="btn-outline flex-1 text-terrain-stop"
              >
                <Trash2 size={16} /> Supprimer
              </button>
            </div>
          </div>
        ) : (
          <div className="card-soft p-5">
            <p className="text-h2-sm font-semibold text-brand-ink">Zones ({zones.length})</p>
            <p className="mb-3 text-small text-muted-foreground">Touchez une zone sur la carte ou dans la liste.</p>
            {zones.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">Aucune zone : commencez par « Dessiner une zone ».</p>
            ) : (
              <ul className="space-y-1">
                {zones.map((z) => (
                  <li key={z.id}>
                    <button type="button" onClick={() => setSelection(z.id)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-body-sm hover:bg-muted">
                      <span className="flex items-center gap-2 font-medium">
                        <span className="h-3 w-3 rounded-sm" style={{ background: z.entreprises.length ? z.couleur : '#8A96A3' }} /> {z.nom}
                      </span>
                      <span className={z.entreprises.length ? 'chip-ok' : 'chip-relance'}>{z.entreprises.length ? `${z.entreprises.length} préco.` : 'libre'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
