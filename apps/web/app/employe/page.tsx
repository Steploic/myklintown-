import { AlertTriangle, Banknote, CheckCircle2, CircleSlash, Hourglass, Route } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { EmptyState, Kpi, PageHeader, Section } from '@/components/ui/blocks';
import { CarteTournee } from '@/components/employe/carte-tournee';
import { RafraichissementAuto } from '@/components/ui/rafraichissement-auto';
import { requireEmploye } from '@/lib/employe/context';
import { tourneesDeLEquipe, type StatsEmploye } from '@/lib/employe/donnees';
import { row, rpc } from '@/lib/server';
import { fcfa } from '@/lib/format';

export const metadata = { title: 'Aujourd’hui' };

const FONCTIONS: Record<string, string> = {
  chauffeur: 'Chauffeur',
  collecteur: 'Ramasseur',
  superviseur: 'Superviseur',
  autre: 'Équipe',
};

/** Accueil de l'employé : ses tournées à faire, et ce que son équipe a accompli. */
export default async function EmployeAccueil() {
  const { supabase, employe, entreprise } = await requireEmploye();
  const [aFaire, s] = await Promise.all([
    tourneesDeLEquipe(supabase, 'a_faire'),
    rpc(supabase, 'mes_statistiques_employe', { p_jours: 30 }),
  ]);
  const stats = row<StatsEmploye>(s.data);
  const prenom = employe.nom.split(' ')[0];

  return (
    <PortalShell portalKey="employe" currentPath="/employe" titre={entreprise.nom}>
      <RafraichissementAuto secondes={30} />
      <PageHeader
        titre={`Bonjour ${prenom}`}
        sousTitre={`${FONCTIONS[employe.fonction] ?? 'Équipe'} chez ${entreprise.nom}`}
      />

      <Section titre="Mes tournées" sousTitre="Celles où votre gérant vous a mis dans l’équipe." className="mb-6">
        {aFaire.length === 0 ? (
          <EmptyState
            icon={Route}
            titre="Aucune tournée prévue"
            texte="Votre gérant vous ajoute à l’équipe d’une tournée quand il la planifie. Elle apparaîtra ici."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {aFaire.map((t) => (
              <CarteTournee key={t.id} t={t} />
            ))}
          </div>
        )}
      </Section>

      {stats && (
        <Section titre="Mon équipe sur 30 jours" sousTitre="Passages, scans et incidents sont partagés entre les membres de l’équipe.">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Kpi label="Tournées" valeur={stats.tournees} icon={Route} ton="info" />
            <Kpi label="Passages faits" valeur={stats.passages_faits} icon={CheckCircle2} ton="ok" />
            <Kpi label="Non faits" valeur={stats.passages_non_faits} icon={CircleSlash} ton="stop" />
            <Kpi label="Incidents déclarés" valeur={stats.incidents} icon={AlertTriangle} ton="relance" detail="par vous" />
            <Kpi label="Espèces validées" valeur={fcfa(stats.especes_validees)} icon={Banknote} ton="ok" detail="encaissées par vous" />
            <Kpi label="En attente" valeur={fcfa(stats.especes_a_valider)} icon={Hourglass} ton="relance" detail="à valider par le gérant" />
          </div>
        </Section>
      )}
    </PortalShell>
  );
}
