import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { EmptyState, PageHeader, Section } from '@/components/ui/blocks';
import { IncidentForm } from '@/components/capture/incident-form';
import { Preuve } from '@/components/ui/preuve';
import { getMonAbonnement } from '@/lib/client/context';
import { signalerIncidentClientAction } from '@/lib/client/actions';
import { rows } from '@/lib/server';
import { urlsPreuves } from '@/lib/preuves';
import { CATEGORIES_INCIDENT, CATEGORIES_INCIDENT_CLIENT, dateFr, dateHeureFr, STATUT_INCIDENT } from '@/lib/format';
import type { Incident } from '@/lib/types';

export const metadata = { title: 'Signaler un problème' };

export default async function SignalerPage({ searchParams }: { searchParams: Promise<{ collecte?: string }> }) {
  const { collecte } = await searchParams;
  const { supabase, user, client } = await getMonAbonnement();

  if (!client) {
    return (
      <PortalShell portalKey="citoyen" currentPath="/citoyen/signaler">
        <PageHeader titre="Signaler un problème" />
        <div className="card-soft">
          <EmptyState
            icon={Sparkles}
            titre="Abonnez-vous d’abord"
            texte="Les signalements sont transmis à votre précollecteur : il en faut un !"
            action={<Link href="/citoyen/souscrire" className="btn-primary">M’abonner</Link>}
          />
        </div>
      </PortalShell>
    );
  }

  let dateCollecte: string | null = null;
  if (collecte) {
    const { data } = await supabase.from('collectes').select('date_prevue').eq('id', collecte).maybeSingle();
    dateCollecte = (data as { date_prevue?: string } | null)?.date_prevue ?? null;
  }
  const { data } = await supabase
    .from('incidents_precollecte')
    .select('*')
    .eq('auteur_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);
  const mes = rows<Incident>(data);
  const urls = await urlsPreuves(supabase, mes.map((i) => i.media_path));

  return (
    <PortalShell portalKey="citoyen" currentPath="/citoyen/signaler" titre={client.nom}>
      <PageHeader
        titre={collecte ? 'Le précollecteur n’est pas passé' : 'Signaler un problème'}
        sousTitre={
          collecte
            ? `Passage du ${dateFr(dateCollecte)} : prenez une photo ou une vidéo maintenant, elle sera jointe à votre contestation.`
            : 'Photo ou vidéo prise sur place : c’est ce qui rend le signalement incontestable.'
        }
        retour={{ href: '/citoyen', label: 'Mon espace' }}
      />
      <div className="card-soft p-5 sm:p-6">
        <IncidentForm
          entrepriseId={client.entreprise_id}
          categories={collecte ? ['passage_non_effectue', 'collecte_incomplete'] : CATEGORIES_INCIDENT_CLIENT}
          action={signalerIncidentClientAction}
          preuveObligatoire={!!collecte}
          associations={{ clientId: client.id, collecteId: collecte ?? null }}
          retour={collecte ? '/citoyen/collectes' : undefined}
          libelleEnvoi={collecte ? 'Envoyer ma contestation' : 'Envoyer le signalement'}
        />
      </div>

      {mes.length > 0 && (
        <Section titre="Mes signalements" className="mt-6" flush>
          <ul className="divide-y divide-border">
            {mes.map((i) => (
              <li key={i.id} className="flex gap-3 px-5 py-3">
                <Preuve url={i.media_path ? urls.get(i.media_path) : undefined} type={i.media_type} capture={i.capture_at} />
                <div className="min-w-0 text-body-sm">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-brand-ink">
                    {CATEGORIES_INCIDENT[i.categorie] ?? i.categorie}
                    <span className={STATUT_INCIDENT[i.statut]?.chip}>{STATUT_INCIDENT[i.statut]?.label}</span>
                  </p>
                  {i.description && <p className="text-muted-foreground">{i.description}</p>}
                  <p className="text-small text-muted-foreground">{dateHeureFr(i.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </PortalShell>
  );
}
