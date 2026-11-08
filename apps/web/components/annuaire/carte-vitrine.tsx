import { Truck } from 'lucide-react';
import { urlLogo } from '@/lib/dossier';

/**
 * Vitrine d'un précollecteur dans l'annuaire : nom, logo et devise, rien
 * d'autre (retours de l'équipe, 08/11/2026). Le gérant la voit à l'identique
 * depuis son dossier.
 */
export function CarteVitrine({ nom, devise, logoPath }: { nom: string; devise?: string | null; logoPath?: string | null }) {
  const logo = urlLogo(logoPath);
  return (
    <article className="card-soft flex items-center gap-4 p-4">
      {logo ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={logo} alt={`Logo de ${nom}`} className="h-14 w-14 shrink-0 rounded-xl border border-border bg-white object-contain p-1" />
      ) : (
        <span className="grid h-14 w-14 shrink-0 place-content-center rounded-xl bg-brand-teal/10 text-brand-teal">
          <Truck size={26} />
        </span>
      )}
      <div className="min-w-0">
        <p className="font-semibold text-brand-ink">{nom}</p>
        {devise && <p className="text-body-sm italic text-muted-foreground">« {devise} »</p>}
      </div>
    </article>
  );
}
