import Link from 'next/link';
import { CalendarCheck } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { EmptyState, Kpi, PageHeader } from '@/components/ui/blocks';
import { ConfirmationPassage } from '@/components/client/confirmation-passage';
import { getMonAbonnement } from '@/lib/client/context';
import { rows } from '@/lib/server';
import { dateFr, dateHeureFr, nombre, pct } from '@/lib/format';
import type { Collecte } from '@/lib/types';

export const metadata = { title: 'Mes collectes' };

export default async function MesCollectesPage() {
  const { supabase, client } = await getMonAbonnement();
  const { data } = client
    ? await supabase.from('collectes').select('*').eq('client_id', client.id).order('date_prevue', { ascending: false }).limit(100)
    : { data: [] };
  const collectes = rows<Collecte>(data);
  const faites = collectes.filter((c) => c.statut === 'realisee');
  const ratees = collectes.filter((c) => c.statut === 'non_realisee');

  return (
    <PortalShell portalKey="citoyen" currentPath="/citoyen/collectes" titre={client?.nom}>
      <PageHeader titre="Mes collectes" sousTitre="Chaque passage enregistré par votre précollecteur, et votre confirmation." />
      {collectes.length === 0 ? (
        <div className="card-soft">
          <EmptyState
            icon={CalendarCheck}
            titre="Aucun passage pour l’instant"
            texte={client ? 'Les passages apparaîtront ici dès la première tournée.' : 'Abonnez-vous pour être servi.'}
            action={!client && <Link href="/citoyen/souscrire" className="btn-primary">M’abonner</Link>}
          />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-3 gap-3">
            <Kpi label="Collectés" valeur={nombre(faites.length)} ton="ok" />
            <Kpi label="Non collectés" valeur={nombre(ratees.length)} ton="stop" />
            <Kpi label="Régularité" valeur={pct(faites.length, faites.length + ratees.length)} ton="info" />
          </div>
          <ul className="space-y-2">
            {collectes.map((c) => (
              <li key={c.id} className="card-soft flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold text-brand-ink">{dateFr(c.date_prevue, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                  <p className="text-small text-muted-foreground">
                    {c.statut === 'realisee'
                      ? `Collecté${c.realisee_at ? ` à ${new Date(c.realisee_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}`
                      : c.statut === 'non_realisee'
                        ? `Non collecté · ${c.motif ?? 'motif non précisé'}`
                        : 'Passage prévu'}
                  </p>
                </div>
                {c.confirmation_client === 'confirmee' ? (
                  <span className="chip-ok">Vous avez confirmé</span>
                ) : c.confirmation_client === 'contestee' ? (
                  <span className="chip-stop">Contesté le {dateHeureFr(c.confirmation_at)}</span>
                ) : c.statut === 'realisee' ? (
                  <ConfirmationPassage collecteId={c.id} />
                ) : (
                  <span className={c.statut === 'non_realisee' ? 'chip-stop' : 'chip-info'}>{c.statut === 'non_realisee' ? 'Non collecté' : 'Prévu'}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </PortalShell>
  );
}
