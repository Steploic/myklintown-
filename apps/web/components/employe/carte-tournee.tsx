import Link from 'next/link';
import { Bike, ChevronRight, MapPinned, Users } from 'lucide-react';
import { dateFr, isoJour, STATUT_TOURNEE } from '@/lib/format';
import type { TourneeEquipe } from '@/lib/employe/donnees';

/** Une tournée de l'équipe : où, avec qui, où on en est. */
export function CarteTournee({ t }: { t: TourneeEquipe }) {
  const s = STATUT_TOURNEE[t.statut] ?? STATUT_TOURNEE.planifiee!;
  const auj = t.date === isoJour();
  const largeur = (n: number) => `${(n / Math.max(1, t.total)) * 100}%`;
  return (
    <Link href={`/employe/tournees/${t.id}`} className="card-soft block p-4 transition-shadow hover:shadow-elevated">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-brand-ink">
            {dateFr(t.date, { weekday: 'long', day: 'numeric', month: 'long' })}
            {auj && <span className="chip-info ml-2">Aujourd’hui</span>}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted-foreground">
            <span className="inline-flex items-center gap-1"><MapPinned size={14} /> {t.zone_nom ?? 'Tous les clients'}</span>
            {t.tricycle_nom && <span className="inline-flex items-center gap-1"><Bike size={14} /> {t.tricycle_nom}</span>}
            {t.equipe.length > 0 && <span className="inline-flex items-center gap-1"><Users size={14} /> {t.equipe.join(', ')}</span>}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1">
          <span className={s.chip}>{s.label}</span>
          <ChevronRight size={18} className="text-muted-foreground" aria-hidden />
        </span>
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
        <span className="bg-terrain-ok" style={{ width: largeur(t.faits) }} />
        <span className="bg-terrain-stop" style={{ width: largeur(t.rates) }} />
      </div>
      <p className="num mt-1.5 text-small text-muted-foreground">
        {t.faits} faits · {t.rates} non faits · {t.total - t.faits - t.rates} restants
      </p>
    </Link>
  );
}
