import { Check, Info } from 'lucide-react';
import { PrecoShell } from '@/components/precollecteur/shell';
import { PageHeader } from '@/components/ui/blocks';
import { requireEntreprise } from '@/lib/precollecteur/context';
import { parametre, rows } from '@/lib/server';
import { fcfa } from '@/lib/format';
import type { Plan } from '@/lib/types';

export const metadata = { title: 'Grille tarifaire' };

export default async function GrillePage() {
  const { supabase } = await requireEntreprise();
  const [{ data }, taux] = await Promise.all([
    supabase.from('plans_tarifaires').select('*').eq('actif', true).order('ordre'),
    parametre(supabase, 'commission_taux', 0.1),
  ]);
  const plans = rows<Plan>(data);
  const reference = plans.find((p) => p.duree_mois === 1)?.prix_fcfa;

  return (
    <PrecoShell path="/precollecteur/grille">
      <PageHeader
        titre="Grille tarifaire commune"
        sousTitre="Les mêmes prix pour tous les précollecteurs MyKlinTown : vos clients choisissent dans cette grille."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p, i) => {
          const mensuel = Math.round(p.prix_fcfa / p.duree_mois);
          const eco = reference && p.duree_mois > 1 ? Math.round((1 - mensuel / reference) * 100) : 0;
          return (
            <article key={p.id} className={`card-soft relative flex flex-col p-6 ${i === 1 ? 'ring-2 ring-brand-green' : ''}`}>
              {eco > 0 && <span className="chip-ok absolute right-4 top-4">−{eco} %</span>}
              <p className="text-small font-semibold uppercase tracking-wider text-brand-green">{p.nom}</p>
              <p className="num mt-2 text-[2rem] font-bold leading-none text-brand-ink">{fcfa(p.prix_fcfa)}</p>
              <p className="mt-1 text-body-sm text-muted-foreground">
                {p.duree_mois === 1 ? 'par mois' : `pour ${p.duree_mois} mois · soit ${fcfa(mensuel)} / mois`}
              </p>
              {p.description && <p className="mt-3 text-body-sm">{p.description}</p>}
              <ul className="mt-4 space-y-2 text-body-sm">
                {p.avantages.map((a) => (
                  <li key={a} className="flex items-start gap-2">
                    <Check size={16} className="mt-0.5 shrink-0 text-brand-green" /> {a}
                  </li>
                ))}
              </ul>
              <p className="mt-auto pt-4 text-small text-muted-foreground">
                Vous recevez {fcfa(Math.round(p.prix_fcfa * (1 - taux)))} après commission.
              </p>
            </article>
          );
        })}
      </div>
      <p className="mt-6 flex items-start gap-2 rounded-lg bg-brand-blue/5 p-4 text-body-sm text-brand-blue">
        <Info size={18} className="mt-0.5 shrink-0" />
        Grille proposée pour la phase pilote, en cours de validation avec les premiers partenaires. Commission
        MyKlinTown appliquée aux encaissements : {Math.round(taux * 100)} % (hypothèse pilote, fourchette 10–15 %).
        Les prix sont lus en base : aucune modification locale n’est possible.
      </p>
    </PrecoShell>
  );
}
