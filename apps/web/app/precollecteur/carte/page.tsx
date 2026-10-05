import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { PrecoShell } from '@/components/precollecteur/shell';
import { PageHeader, Section } from '@/components/ui/blocks';
import { CartePoints, type PointCarte, type Ton } from '@/components/map/carte-points';
import { requireEntreprise } from '@/lib/precollecteur/context';
import { rows, rpc } from '@/lib/server';
import { fcfa, heureFr, statutAbonnement, telLisible } from '@/lib/format';
import { RafraichissementAuto } from '@/components/ui/rafraichissement-auto';
import type { ClientStatut, Zone } from '@/lib/types';

export const metadata = { title: 'Carte des clients' };

/**
 * Tous les clients sur une carte, couleur = état du paiement (retour R7 de Julien
 * et retour de Pie). Les demandes de ménages sans précollecteur y figurent aussi.
 */
export default async function CarteClientsPage() {
  const { supabase, entreprise } = await requireEntreprise();
  const [cl, za, dem, live] = await Promise.all([
    supabase
      .from('v_clients_statut')
      .select('id, nom, quartier, telephone, lat, lng, statut, statut_abonnement, plan_nom, montant_impaye')
      .eq('entreprise_id', entreprise.id)
      .neq('statut', 'resilie'),
    supabase.from('zone_affectations').select('zones(*)').eq('entreprise_id', entreprise.id),
    rpc(supabase, 'demandes_ouvertes'),
    rpc(supabase, 'positions_en_direct'),
  ]);
  const clients = rows<ClientStatut>(cl.data);
  const zones = rows<{ zones: Zone | null }>(za.data).map((a) => a.zones).filter((z): z is Zone => !!z);
  const demandes = rows<{ id: string; quartier: string | null; lat: number; lng: number; plan_nom: string | null }>(dem.data);

  const points: PointCarte[] = clients
    .filter((c) => c.lat != null && c.lng != null)
    .map((c) => {
      const s = statutAbonnement(c.statut_abonnement);
      return {
        id: c.id,
        lat: c.lat!,
        lng: c.lng!,
        ton: s.terrain as Ton,
        picto: 'maison',
        titre: c.nom,
        lignes: [s.label + (Number(c.montant_impaye) > 0 ? ` · ${fcfa(c.montant_impaye)} dus` : ''), [c.quartier, c.plan_nom].filter(Boolean).join(' · '), telLisible(c.telephone)],
        lien: { href: `/precollecteur/clients/${c.id}`, label: 'Fiche' },
      };
    });
  for (const d of demandes) {
    points.push({
      id: `demande-${d.id}`,
      lat: d.lat,
      lng: d.lng,
      ton: 'info',
      picto: 'demande',
      titre: 'Ménage en attente de précollecteur',
      lignes: [[d.quartier, d.plan_nom].filter(Boolean).join(' · ')],
      lien: { href: '/precollecteur/demandes', label: 'Prendre en charge' },
    });
  }

  // Tricycles en tournée : dernière position envoyée par l'appli de l'équipe.
  const enDirect = rows<{ tournee_id: string; lat: number; lng: number; vu_at: string; tricycle_nom: string | null; zone_nom: string | null; equipe: string | null }>(live.data);
  for (const d of enDirect) {
    points.push({
      id: `direct-${d.tournee_id}`,
      lat: d.lat,
      lng: d.lng,
      ton: 'direct',
      picto: 'tricycle',
      titre: d.tricycle_nom ?? 'Équipe en tournée',
      lignes: [d.equipe ?? '', `Vu à ${heureFr(d.vu_at)}${d.zone_nom ? ` · ${d.zone_nom}` : ''}`],
      lien: { href: `/precollecteur/tournees/${d.tournee_id}`, label: 'Tournée' },
    });
  }

  return (
    <PrecoShell path="/precollecteur/carte">
      {enDirect.length > 0 && <RafraichissementAuto secondes={30} />}
      <PageHeader
        titre="Carte des clients"
        sousTitre="Chaque repère est un foyer ; sa couleur dit où en est le paiement. Touchez un repère pour la fiche ou l’itinéraire."
        actions={
          demandes.length > 0 && (
            <Link href="/precollecteur/demandes" className="btn-secondary">
              <Inbox size={16} /> {demandes.length} demande{demandes.length > 1 ? 's' : ''} en attente
            </Link>
          )
        }
      />
      <Section>
        <CartePoints
          points={points}
          zones={zones.map((z) => ({ id: z.id, nom: z.nom, contour: z.contour, couleur: z.couleur }))}
          legende={[
            { ton: 'ok', label: 'À jour' },
            { ton: 'relance', label: 'À relancer' },
            { ton: 'stop', label: 'Impayé / expiré' },
            { ton: 'neutre', label: 'Autre' },
            { ton: 'info', label: 'Demandes en attente' },
            { ton: 'direct', label: 'Équipes en tournée' },
          ]}
          hauteur={560}
          sansPosition={clients.filter((c) => c.lat == null || c.lng == null).length}
        />
      </Section>
      <p className="mt-3 text-small text-muted-foreground">
        Équipes en tournée : position envoyée toutes les 30 s par le téléphone d’un équipier, tant que l’espace employé
        est ouvert. La carte se met à jour toute seule.
      </p>
    </PrecoShell>
  );
}
