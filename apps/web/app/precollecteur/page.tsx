import Link from 'next/link';
import {
  AlertTriangle,
  Banknote,
  Bike,
  CalendarClock,
  CheckCircle2,
  FlaskConical,
  Receipt,
  Route,
  UserPlus,
  Users,
} from 'lucide-react';
import { PrecoShell } from '@/components/precollecteur/shell';
import { Kpi, PageHeader, Section } from '@/components/ui/blocks';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { CollectesChart, EncaissementsChart } from '@/components/precollecteur/charts';
import { requireEntreprise } from '@/lib/precollecteur/context';
import { chargerDemoAction, supprimerDemoAction } from '@/lib/precollecteur/actions';
import { parametre, rows } from '@/lib/server';
import { ajouterJours, dateFr, fcfa, isoJour, nombre, pct, STATUT_TOURNEE } from '@/lib/format';

export const metadata = { title: 'Tableau de bord' };

export default async function PrecollecteurDashboard({
  searchParams,
}: {
  searchParams: Promise<{ bienvenue?: string }>;
}) {
  const { bienvenue } = await searchParams;
  const { supabase, entreprise } = await requireEntreprise();
  const auj = isoJour();
  const il30 = ajouterJours(auj, -30);
  const debutMois = auj.slice(0, 8) + '01';
  const il12sem = ajouterJours(auj, -84);

  const [cl, co, to, pa, em, tr, inc, taux] = await Promise.all([
    supabase
      .from('v_clients_statut')
      .select('id, statut, statut_abonnement, montant_impaye, nb_impayees, couverture_fin, est_demo')
      .eq('entreprise_id', entreprise.id),
    supabase
      .from('collectes')
      .select('id, statut, date_prevue, employe_id, tournee_id')
      .eq('entreprise_id', entreprise.id)
      .gte('date_prevue', il30),
    supabase
      .from('tournees_precollecte')
      .select('id, date, statut, tricycle_id, employe_id')
      .eq('entreprise_id', entreprise.id)
      .order('date', { ascending: false })
      .limit(60),
    supabase
      .from('paiements_clients')
      .select('montant_fcfa, created_at')
      .eq('entreprise_id', entreprise.id)
      .gte('created_at', il12sem),
    supabase.from('employes').select('id, nom').eq('entreprise_id', entreprise.id),
    supabase.from('tricycles').select('id, nom, statut').eq('entreprise_id', entreprise.id),
    supabase
      .from('incidents_precollecte')
      .select('id', { count: 'exact', head: true })
      .eq('entreprise_id', entreprise.id)
      .neq('statut', 'resolu'),
    parametre(supabase, 'commission_taux', 0.1),
  ]);

  const clients = rows<{
    id: string;
    statut: string;
    statut_abonnement: string;
    montant_impaye: number;
    nb_impayees: number;
    est_demo: boolean;
  }>(cl.data);
  const collectes = rows<{ id: string; statut: string; date_prevue: string; employe_id: string | null; tournee_id: string | null }>(co.data);
  const tournees = rows<{ id: string; date: string; statut: string; tricycle_id: string | null; employe_id: string | null }>(to.data);
  const paiements = rows<{ montant_fcfa: number; created_at: string }>(pa.data);
  const employes = rows<{ id: string; nom: string }>(em.data);
  const tricycles = rows<{ id: string; nom: string; statut: string }>(tr.data);

  const actifs = clients.filter((c) => c.statut === 'actif');
  const aJour = actifs.filter((c) => c.statut_abonnement === 'a_jour').length;
  const echeance = actifs.filter((c) => c.statut_abonnement === 'echeance_proche').length;
  const aFacturer = actifs.filter((c) => ['sans_facture', 'expire'].includes(c.statut_abonnement)).length;
  const impayes = clients.filter((c) => Number(c.nb_impayees) > 0);
  const montantImpaye = impayes.reduce((s, c) => s + Number(c.montant_impaye || 0), 0);
  const demandes = clients.filter((c) => c.statut === 'demande').length;
  const aDesDemo = clients.some((c) => c.est_demo);

  const caMois = paiements
    .filter((p) => p.created_at.slice(0, 10) >= debutMois)
    .reduce((s, p) => s + p.montant_fcfa, 0);
  const commission = caMois * taux;

  const prevues = collectes.length;
  const realisees = collectes.filter((c) => c.statut === 'realisee').length;
  const nonRealisees = collectes.filter((c) => c.statut === 'non_realisee').length;
  const enAttente = prevues - realisees - nonRealisees;

  // Graphique : 14 derniers jours.
  const jours = Array.from({ length: 14 }, (_, i) => ajouterJours(auj, i - 13));
  const parJour = jours.map((j) => ({
    jour: dateFr(j, { day: 'numeric', month: 'numeric' }),
    realisees: collectes.filter((c) => c.date_prevue === j && c.statut === 'realisee').length,
    non_realisees: collectes.filter((c) => c.date_prevue === j && c.statut === 'non_realisee').length,
  }));

  // Encaissements par semaine (12 semaines).
  const semaines = Array.from({ length: 12 }, (_, i) => ajouterJours(auj, -7 * (11 - i)));
  const parSemaine = semaines.map((fin, i) => {
    const debut = ajouterJours(fin, -6);
    return {
      semaine: i === 11 ? 'Cette sem.' : dateFr(debut, { day: 'numeric', month: 'short' }),
      encaisse: paiements
        .filter((p) => p.created_at.slice(0, 10) >= debut && p.created_at.slice(0, 10) <= fin)
        .reduce((s, p) => s + p.montant_fcfa, 0),
    };
  });

  // Activité par employé et par véhicule (30 j).
  const tourneeTricycle = new Map(tournees.map((t) => [t.id, t.tricycle_id]));
  const parEmploye = employes
    .map((e) => {
      const siens = collectes.filter((c) => c.employe_id === e.id);
      return { nom: e.nom, faits: siens.filter((c) => c.statut === 'realisee').length, total: siens.length };
    })
    .filter((e) => e.total > 0)
    .sort((a, b) => b.faits - a.faits);
  const parTricycle = tricycles
    .map((t) => {
      const siens = collectes.filter((c) => c.tournee_id && tourneeTricycle.get(c.tournee_id) === t.id);
      return {
        nom: t.nom,
        statut: t.statut,
        faits: siens.filter((c) => c.statut === 'realisee').length,
        tournees: tournees.filter((x) => x.tricycle_id === t.id && x.date >= il30).length,
      };
    })
    .sort((a, b) => b.faits - a.faits);
  const nomEmploye = new Map(employes.map((e) => [e.id, e.nom]));
  const nomTricycle = new Map(tricycles.map((t) => [t.id, t.nom]));

  const vide = clients.length === 0;

  return (
    <PrecoShell path="/precollecteur">
      <PageHeader
        titre={bienvenue ? `Bienvenue, ${entreprise.nom}` : 'Tableau de bord'}
        sousTitre={`Activité au ${dateFr(auj, { weekday: 'long', day: 'numeric', month: 'long' })}`}
        actions={
          <>
            <Link href="/precollecteur/tournees" className="btn-outline">
              <Route size={16} /> Tournée du jour
            </Link>
            <Link href="/precollecteur/clients/nouveau" className="btn-primary">
              <UserPlus size={16} /> Nouveau client
            </Link>
          </>
        }
      />

      {vide && (
        <section className="card-soft mb-6 overflow-hidden">
          <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h2>Commencez par vos clients</h2>
              <p className="mt-1 max-w-xl text-body-sm text-muted-foreground">
                Enregistrez les ménages que vous servez déjà : l’abonnement est pris dans la grille
                tarifaire MyKlinTown et la première facture est émise automatiquement. Vous voulez
                d’abord voir l’outil en action ? Chargez un jeu de démonstration, supprimable en un clic.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/precollecteur/clients/nouveau" className="btn-primary">
                <UserPlus size={16} /> Ajouter un client
              </Link>
              <ActionForm action={chargerDemoAction}>
                <SubmitButton variant="outline" pendingLabel="Chargement…">
                  <FlaskConical size={16} /> Charger la démo
                </SubmitButton>
              </ActionForm>
            </div>
          </div>
        </section>
      )}

      {aDesDemo && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-blue/20 bg-brand-blue/5 px-4 py-3">
          <p className="flex items-center gap-2 text-body-sm text-brand-blue">
            <FlaskConical size={16} /> Des données de démonstration sont affichées (ménages marqués « démo »).
          </p>
          <ActionForm action={supprimerDemoAction}>
            <SubmitButton variant="ghost" pendingLabel="Suppression…">
              Supprimer la démo
            </SubmitButton>
          </ActionForm>
        </div>
      )}

      {demandes > 0 && (
        <Link
          href="/precollecteur/clients?filtre=demande"
          className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-brand-green/30 bg-brand-green/5 px-4 py-3 text-body-sm font-semibold text-terrain-ok"
        >
          <span className="flex items-center gap-2">
            <UserPlus size={18} /> {demandes} nouvelle{demandes > 1 ? 's' : ''} demande{demandes > 1 ? 's' : ''} d’abonnement en ligne à valider
          </span>
          <span aria-hidden>→</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Clients actifs"
          valeur={nombre(actifs.length)}
          detail={`${aJour} à jour · ${pct(aJour, actifs.length)}`}
          icon={Users}
          ton="ok"
          href="/precollecteur/clients"
        />
        <Kpi
          label="Arrivent à échéance"
          valeur={nombre(echeance)}
          detail={aFacturer ? `+ ${aFacturer} à refacturer` : 'dans les 7 jours'}
          icon={CalendarClock}
          ton="relance"
          href="/precollecteur/facturation?onglet=echeances"
        />
        <Kpi
          label="Encaissé ce mois"
          valeur={fcfa(caMois)}
          detail={`Commission MyKlinTown ${Math.round(taux * 100)} % : ${fcfa(commission)}`}
          icon={Banknote}
          ton="info"
          href="/precollecteur/facturation?onglet=paiements"
        />
        <Kpi
          label="Factures impayées"
          valeur={nombre(impayes.length)}
          detail={`${fcfa(montantImpaye)} à recouvrer`}
          icon={Receipt}
          ton="stop"
          href="/precollecteur/facturation?onglet=recouvrement"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Collectes prévues (30 j)" valeur={nombre(prevues)} detail={`${enAttente} encore à faire`} />
        <Kpi label="Réalisées" valeur={nombre(realisees)} detail={`Taux d’exécution ${pct(realisees, realisees + nonRealisees)}`} ton="ok" icon={CheckCircle2} />
        <Kpi label="Non réalisées" valeur={nombre(nonRealisees)} detail="avec motif enregistré" ton="stop" icon={AlertTriangle} />
        <Kpi
          label="Incidents ouverts"
          valeur={nombre(inc.count ?? 0)}
          detail="preuves photo / vidéo"
          ton={(inc.count ?? 0) > 0 ? 'relance' : 'neutre'}
          href="/precollecteur/incidents"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section titre="Collectes des 14 derniers jours" sousTitre="Passages réalisés et non réalisés">
          <CollectesChart data={parJour} />
        </Section>
        <Section titre="Encaissements" sousTitre="Par semaine, sur 12 semaines">
          <EncaissementsChart data={parSemaine} />
        </Section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Section titre="Activité par employé" sousTitre="30 derniers jours" flush>
          {parEmploye.length ? (
            <ul className="divide-y divide-border">
              {parEmploye.map((e) => (
                <li key={e.nom} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="truncate text-body-sm font-medium">{e.nom}</span>
                  <span className="num text-body-sm text-muted-foreground">
                    <strong className="text-brand-ink">{e.faits}</strong> / {e.total} passages
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-body-sm text-muted-foreground">
              Aucune activité encore. Assignez un employé à une tournée pour suivre son travail.
            </p>
          )}
        </Section>

        <Section titre="Activité par véhicule" sousTitre="30 derniers jours" flush>
          {parTricycle.length ? (
            <ul className="divide-y divide-border">
              {parTricycle.map((t) => (
                <li key={t.nom} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="flex min-w-0 items-center gap-2 text-body-sm font-medium">
                    <Bike size={16} className="shrink-0 text-brand-teal" />
                    <span className="truncate">{t.nom}</span>
                    {t.statut !== 'actif' && <span className="chip-relance">{t.statut === 'maintenance' ? 'Maintenance' : 'Hors service'}</span>}
                  </span>
                  <span className="num shrink-0 text-body-sm text-muted-foreground">
                    <strong className="text-brand-ink">{t.faits}</strong> passages · {t.tournees} tournées
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-body-sm text-muted-foreground">
              Aucun tricycle enregistré.{' '}
              <Link href="/precollecteur/flotte" className="font-semibold text-brand-blue hover:underline">
                Ajouter ma flotte
              </Link>
            </p>
          )}
        </Section>

        <Section
          titre="Dernières tournées"
          actions={<Link href="/precollecteur/tournees" className="btn-ghost">Tout voir</Link>}
          flush
        >
          {tournees.length ? (
            <ul className="divide-y divide-border">
              {tournees.slice(0, 5).map((t) => {
                const s = STATUT_TOURNEE[t.statut] ?? STATUT_TOURNEE.planifiee!;
                const faits = collectes.filter((c) => c.tournee_id === t.id && c.statut === 'realisee').length;
                const total = collectes.filter((c) => c.tournee_id === t.id).length;
                return (
                  <li key={t.id}>
                    <Link href={`/precollecteur/tournees/${t.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/40">
                      <span className="min-w-0">
                        <span className="block text-body-sm font-semibold">{dateFr(t.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                        <span className="block truncate text-small text-muted-foreground">
                          {[t.employe_id && nomEmploye.get(t.employe_id), t.tricycle_id && nomTricycle.get(t.tricycle_id)].filter(Boolean).join(' · ') || 'Non assignée'}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="num text-small text-muted-foreground">{faits}/{total}</span>
                        <span className={s.chip}>{s.label}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-5 py-6 text-body-sm text-muted-foreground">Aucune tournée planifiée.</p>
          )}
        </Section>
      </div>
    </PrecoShell>
  );
}
