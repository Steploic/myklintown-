'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, CloudOff, RotateCw } from 'lucide-react';
import { demander, serviceWorkerActif } from '@/lib/hors-ligne/client';
import { dateHeureFr } from '@/lib/format';

type Etat = { type: 'cache'; le: number } | { type: 'pret'; pretes: number; autres: number; version: string } | null;

/**
 * Sur une page du terrain (lib/hors-ligne/pages.ts) :
 *   - en ligne, la page s'enregistre sur le téléphone, avec `preparer` (depuis
 *     une liste : les tournées du jour) → « Disponible sans réseau » ;
 *   - elle se réenregistre quand `version` change (tournée démarrée,
 *     terminée…) et quand l'équipe quitte l'écran (téléphone verrouillé, autre
 *     application) : rouverte sans réseau, elle montre son dernier état ;
 *   - servie depuis le téléphone faute de réseau → la date de cet
 *     enregistrement : l'équipe sait qu'elle voit un instantané.
 * Sans service worker (navigateur ancien, développement), rien ne s'affiche.
 */
export function EtatHorsLigne({ preparer = [], version = '' }: { preparer?: string[]; version?: string }) {
  const [etat, setEtat] = useState<Etat>(null);
  const cle = preparer.join('|');
  const depuisCache = useRef(false);
  const versionPreparee = useRef<string | null>(null);

  const enregistrer = useCallback(
    async (forcer: boolean) => {
      const sw = await serviceWorkerActif();
      if (!sw || depuisCache.current) return;
      const ici = window.location.pathname;
      const autres = cle ? cle.split('|') : [];
      // Les fichiers déjà chargés par la page, ceux chargés à la demande compris
      // (la carte) : absents du HTML, le service worker ne les verrait pas.
      const ressources = performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .filter((n) => n.includes('/_next/static/'));
      const r = await demander<{ resultats: Record<string, boolean> }>(
        sw,
        { type: 'preparer', urls: [ici, ...autres], forcer: forcer ? [ici] : [], ressources },
        90_000,
      );
      if (!r?.resultats) return;
      const prete = (u: string) => r.resultats[new URL(u, window.location.origin).pathname] === true;
      if (!prete(ici)) return;
      versionPreparee.current = version;
      setEtat({ type: 'pret', pretes: autres.filter(prete).length, autres: autres.length, version });
    },
    [cle, version],
  );

  // Premier affichage : servie depuis le téléphone ? Sinon, s'enregistrer ;
  // puis à chaque changement d'état de la page.
  useEffect(() => {
    let fini = false;
    void (async () => {
      const sw = await serviceWorkerActif();
      if (!sw || fini || depuisCache.current) return;
      if (versionPreparee.current === null) {
        const e = await demander<{ depuisCache: boolean; le: number | null }>(sw, { type: 'etat' });
        if (fini) return;
        if (e?.depuisCache && e.le) {
          depuisCache.current = true;
          setEtat({ type: 'cache', le: e.le });
          return;
        }
      }
      if (versionPreparee.current === version) return;
      await enregistrer(versionPreparee.current !== null);
    })();
    return () => {
      fini = true;
    };
  }, [enregistrer, version]);

  // L'équipe quitte l'écran : la page telle qu'elle est maintenant (une minute d'écart au moins).
  useEffect(() => {
    let dernier = 0;
    const auDepart = () => {
      if (document.visibilityState !== 'hidden' || Date.now() - dernier < 60_000) return;
      dernier = Date.now();
      void enregistrer(true);
    };
    document.addEventListener('visibilitychange', auDepart);
    return () => document.removeEventListener('visibilitychange', auDepart);
  }, [enregistrer]);

  if (!etat) return null;
  if (etat.type === 'cache') {
    return (
      <div
        role="status"
        data-testid="hors-ligne-cache"
        className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-terrain-relance/30 bg-terrain-relance/5 px-4 py-3 text-body-sm text-brand-ink"
      >
        <span className="flex items-start gap-2">
          <CloudOff size={18} className="mt-0.5 shrink-0 text-terrain-relance" aria-hidden />
          <span>
            <strong>Hors ligne</strong> : page enregistrée le {dateHeureFr(new Date(etat.le))}. Vos gestes partent au retour du réseau.
          </span>
        </span>
        <button type="button" onClick={() => window.location.reload()} className="btn-outline inline-flex items-center gap-1.5">
          <RotateCw size={14} aria-hidden /> Recharger
        </button>
      </div>
    );
  }
  return (
    <p data-testid="hors-ligne-pret" data-version={etat.version} className="mb-4 flex items-center gap-1.5 text-small font-semibold text-terrain-ok">
      <CheckCircle2 size={14} aria-hidden />
      {etat.autres > 0
        ? `Prêt pour le terrain : ${etat.pretes} tournée${etat.pretes > 1 ? 's' : ''} disponible${etat.pretes > 1 ? 's' : ''} sans réseau`
        : 'Disponible sans réseau'}
    </p>
  );
}
