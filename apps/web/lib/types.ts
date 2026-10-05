/** Lignes des tables du pivot précollecteurs (migration 20260928000004). */

export interface Plan {
  id: string;
  code: string;
  nom: string;
  description: string | null;
  duree_mois: number;
  prix_fcfa: number;
  passages_semaine: number;
  avantages: string[];
  ordre: number;
  actif: boolean;
}

export interface Entreprise {
  id: string;
  nom: string;
  telephone: string | null;
  email: string | null;
  siege: string | null;
  commune_id: string | null;
  statut: 'essai' | 'actif' | 'suspendu';
  /** Paiement en ligne (compte connecté Notch Pay) : « actif » une fois la vérification faite. */
  paiement_statut?: 'inactif' | 'en_verification' | 'actif' | 'refuse';
  paiement_compte_id?: string | null;
  created_at: string;
}

export interface Zone {
  id: string;
  commune_id: string | null;
  nom: string;
  couleur: string;
  contour: GeoPolygon;
  notes: string | null;
}

export interface GeoPolygon {
  type: 'Polygon';
  coordinates: [number, number][][];
}

export interface Employe {
  id: string;
  entreprise_id: string;
  nom: string;
  telephone: string | null;
  fonction: string;
  actif: boolean;
  user_id?: string | null;
}

export interface Tricycle {
  id: string;
  entreprise_id: string;
  nom: string;
  immatriculation: string | null;
  capacite_kg: number | null;
  statut: 'actif' | 'maintenance' | 'hors_service';
}

export interface ClientStatut {
  id: string;
  entreprise_id: string;
  user_id: string | null;
  code: string;
  nom: string;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  quartier: string | null;
  lat: number | null;
  lng: number | null;
  zone_id: string | null;
  plan_id: string | null;
  statut: string;
  notes: string | null;
  est_demo: boolean;
  created_at: string;
  plan_nom: string | null;
  plan_prix: number | null;
  plan_duree_mois: number | null;
  zone_nom: string | null;
  couverture_fin: string | null;
  nb_impayees: number;
  montant_impaye: number;
  plus_ancienne_echeance: string | null;
  statut_abonnement: string;
}

export interface Facture {
  id: string;
  entreprise_id: string;
  client_id: string;
  numero: string;
  plan_id: string | null;
  libelle: string | null;
  periode_debut: string;
  periode_fin: string;
  montant_fcfa: number;
  echeance: string;
  statut: 'emise' | 'payee' | 'annulee';
  created_at: string;
}

export interface Paiement {
  id: string;
  facture_id: string;
  client_id: string;
  montant_fcfa: number;
  methode: string;
  reference: string | null;
  encaisse_par: string | null;
  /** Espèces reçues par un employé : « a_valider » jusqu'à la validation du gérant. */
  statut?: 'valide' | 'a_valider' | 'rejete';
  created_at: string;
}

export interface Tournee {
  id: string;
  entreprise_id: string;
  date: string;
  zone_id: string | null;
  tricycle_id: string | null;
  employe_id: string | null;
  statut: string;
  debut_at: string | null;
  fin_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface Collecte {
  id: string;
  entreprise_id: string;
  tournee_id: string | null;
  client_id: string;
  date_prevue: string;
  statut: 'prevue' | 'realisee' | 'non_realisee';
  motif: string | null;
  realisee_at: string | null;
  employe_id: string | null;
  confirmation_client: 'confirmee' | 'contestee' | null;
  confirmation_at: string | null;
}

export interface Incident {
  id: string;
  entreprise_id: string;
  client_id: string | null;
  collecte_id: string | null;
  tournee_id: string | null;
  auteur_id: string;
  source: 'precollecteur' | 'client';
  categorie: string;
  description: string | null;
  media_path: string | null;
  media_type: 'photo' | 'video' | null;
  capture_at: string | null;
  lat: number | null;
  lng: number | null;
  statut: string;
  created_at: string;
}

export interface ActionState {
  error?: string;
  ok?: string;
}
