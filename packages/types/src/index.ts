/**
 * Types domaine MyKlinTown
 *
 * Source de vérité partagée entre apps/web et (futur) apps/mobile.
 * Aligné sur les spécifications du cahier des charges V2 et de l'executive
 * summary remis à la Mairie de Yaoundé III.
 */

export type UUID = string;
export type ISODateString = string;

// =============================================================================
// Géolocalisation
// =============================================================================

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface GeoBoundingBox {
  southWest: GeoPoint;
  northEast: GeoPoint;
}

// =============================================================================
// Utilisateurs & Rôles
// =============================================================================

export type UserRole = 'citoyen' | 'collecteur' | 'mairie' | 'enterprise' | 'admin';

export interface UserProfile {
  id: UUID;
  email: string;
  telephone?: string;
  nom_complet: string;
  role: UserRole;
  avatar_url?: string;
  created_at: ISODateString;
}

// =============================================================================
// Géographie urbaine
// =============================================================================

export interface Commune {
  id: UUID;
  nom: string;          // "Yaoundé III"
  code: string;         // "YDE3"
}

export interface Secteur {
  id: UUID;
  commune_id: UUID;
  nom: string;          // "Nsam", "Mvog-Mbi", etc.
  polygone_geojson: object; // GeoJSON Polygon
}

// =============================================================================
// Ménages & Abonnements
// =============================================================================

export type StatutAbonnement = 'actif' | 'expire' | 'en_attente' | 'suspendu' | 'test';
export type FormuleAbonnement = 'mensuel' | 'trimestriel' | 'annuel';

export interface Menage {
  id: UUID;
  user_id?: UUID;             // null si pas encore créé son compte
  nom_foyer: string;
  telephone: string;
  localisation: GeoPoint;
  adresse_textuelle: string;
  secteur_id: UUID;
  qr_code_id: string;         // identifiant imprimé sur l'étiquette QR
  structure_pre_collecte_id?: UUID;
  statut_abonnement: StatutAbonnement;
  created_at: ISODateString;
}

export interface StructurePreCollecte {
  id: UUID;
  nom: string;
  type: 'pre_collecte' | 'ecole' | 'b2b' | 'mairie';
  secteur_id: UUID;
  contact_nom: string;
  contact_telephone: string;
  nb_menages_couverts: number;
  created_at: ISODateString;
}

export interface Abonnement {
  id: UUID;
  menage_id: UUID;
  formule: FormuleAbonnement;
  montant_fcfa: number;
  date_debut: ISODateString;
  date_fin: ISODateString;
  statut_solvabilite: 'a_jour' | 'en_retard' | 'critique';
  created_at: ISODateString;
}

// =============================================================================
// Paiements (Mobile Money)
// =============================================================================

export type MethodePaiement = 'mtn_momo' | 'orange_money' | 'especes' | 'virement';
export type StatutPaiement = 'en_attente' | 'reussi' | 'echoue' | 'rembourse';

export interface Paiement {
  id: UUID;
  abonnement_id: UUID;
  menage_id: UUID;
  montant_fcfa: number;
  methode: MethodePaiement;
  reference_externe?: string;   // ID de transaction du provider Mobile Money
  statut: StatutPaiement;
  created_at: ISODateString;
}

// =============================================================================
// Bacs & Capteurs IoT
// =============================================================================

export type TypeBac = 'residentiel' | 'scolaire' | 'b2b' | 'public';
export type NiveauRemplissage = 'vide' | 'partiel' | 'plein' | 'deborde';

export interface Bac {
  id: UUID;
  qr_code_id: string;
  type: TypeBac;
  localisation: GeoPoint;
  capacite_litres: number;
  niveau_remplissage: NiveauRemplissage;
  pourcentage_remplissage?: number; // 0-100, si capteur IoT
  menage_id?: UUID;                  // si bac résidentiel attaché
  structure_id?: UUID;               // si bac collectif
  last_capteur_update?: ISODateString;
  capteur_id?: UUID;
  created_at: ISODateString;
}

export interface CapteurIoT {
  id: UUID;
  bac_id: UUID;
  modele: string;                // ex: HC-SR04, JSN-SR04T
  microcontroleur: string;       // ex: ESP32, Pycom Lopy
  reseau: 'lorawan' | 'gprs' | 'wifi';
  batterie_pct?: number;
  online: boolean;
  last_ping?: ISODateString;
}

// =============================================================================
// Camions & Tournées
// =============================================================================

export type StatutCamion = 'disponible' | 'en_tournee' | 'maintenance' | 'hors_service';

export interface Camion {
  id: UUID;
  immatriculation: string;
  capacite_tonnes: number;
  modele: string;
  chauffeur_user_id?: UUID;
  statut: StatutCamion;
  position_actuelle?: GeoPoint;
  last_position_update?: ISODateString;
  boitier_gps_id?: string;       // ID du boîtier IoT indépendant du tel chauffeur
}

export type StatutTournee = 'planifiee' | 'en_cours' | 'terminee' | 'annulee';

export interface Tournee {
  id: UUID;
  date: ISODateString;
  creneau: 'matin' | 'soir';
  camion_id: UUID;
  secteur_id: UUID;
  collecteur_user_id: UUID;
  parcours_planifie_geojson: object;     // LineString GeoJSON
  parcours_effectue_geojson?: object;    // reconstitué via tracking GPS
  menages_a_collecter: UUID[];           // ordre de passage
  statut: StatutTournee;
  tonnage_collecte_kg?: number;
  duree_minutes?: number;
  km_parcourus?: number;
  created_at: ISODateString;
}

export type TypeScan = 'collecte_ok' | 'bac_vide' | 'absent' | 'inaccessible';

export interface Scan {
  id: UUID;
  tournee_id: UUID;
  menage_id?: UUID;
  bac_id?: UUID;
  type: TypeScan;
  localisation: GeoPoint;
  photo_url?: string;
  notes?: string;
  scanned_at: ISODateString;
  sync_offline: boolean;          // true si scan fait offline puis synchronisé
}

// =============================================================================
// Signalements (citoyens)
// =============================================================================

export type TypeSignalement = 'bac_plein' | 'depot_sauvage' | 'retard_collecte' | 'incident_collecteur';
export type StatutSignalement = 'nouveau' | 'en_traitement' | 'resolu' | 'rejete';

export interface Signalement {
  id: UUID;
  auteur_user_id: UUID;
  type: TypeSignalement;
  localisation: GeoPoint;
  description?: string;
  photo_url?: string;
  statut: StatutSignalement;
  created_at: ISODateString;
  resolved_at?: ISODateString;
  resolved_by_user_id?: UUID;
}

// =============================================================================
// QHSE (Qualité, Hygiène, Sécurité, Environnement)
// =============================================================================

export interface RapportQHSE {
  id: UUID;
  tournee_id: UUID;
  collecteur_user_id: UUID;
  epi_porte: boolean;
  incidents: string;
  ressources_manquantes: string;
  photo_urls: string[];
  created_at: ISODateString;
}

// =============================================================================
// Marketplace & Recyclage (B2B)
// =============================================================================

export type TypeDechet = 'plastique' | 'metal' | 'papier_carton' | 'verre' | 'organique' | 'electronique';

export interface Recycleur {
  id: UUID;
  user_id: UUID;
  raison_sociale: string;
  types_dechets_acceptes: TypeDechet[];
  adresse: string;
  localisation: GeoPoint;
  contact_nom: string;
  contact_telephone: string;
  created_at: ISODateString;
}

export interface ArticleMarketplace {
  id: UUID;
  recycleur_id: UUID;
  nom: string;                         // ex: "Granulés PET recyclés"
  description: string;
  type_dechet_origine: TypeDechet;
  prix_unitaire_fcfa: number;
  unite: 'kg' | 'tonne' | 'piece';
  stock_disponible: number;
  photos: string[];
  statut: 'en_vente' | 'rupture' | 'archive';
  created_at: ISODateString;
}

export interface DemandeCollecte {
  id: UUID;
  demandeur_user_id: UUID;             // citoyen ou structure
  recycleur_id?: UUID;                 // assigné après acceptation
  type_dechet: TypeDechet;
  volume_estime_kg: number;
  localisation: GeoPoint;
  date_souhaitee: ISODateString;
  statut: 'nouvelle' | 'acceptee' | 'en_cours' | 'terminee' | 'annulee';
  prix_propose_fcfa?: number;
  created_at: ISODateString;
}

// =============================================================================
// Stock entrepôt
// =============================================================================

export interface MouvementStock {
  id: UUID;
  type: 'entree' | 'sortie';
  type_dechet: TypeDechet;
  quantite_kg: number;
  source_tournee_id?: UUID;            // si type=entree
  destination_recycleur_id?: UUID;     // si type=sortie
  prix_unitaire_fcfa?: number;
  notes?: string;
  created_at: ISODateString;
  created_by_user_id: UUID;
}

// =============================================================================
// Gamification
// =============================================================================

export interface ProfilGamification {
  user_id: UUID;
  points_totaux: number;
  niveau: number;
  badges: string[];                    // codes de badges débloqués
  classement_global?: number;
  classement_secteur?: number;
}

// =============================================================================
// KPIs (vue dashboard mairie)
// =============================================================================

export interface KPIDashboard {
  date: ISODateString;
  menages_actifs: number;
  taux_recouvrement_pct: number;
  tonnage_collecte_kg: number;
  taux_couverture_pct: number;
  signalements_ouverts: number;
  camions_en_tournee: number;
  taux_transformation_pct: number;     // déchets entrants / produits sortants
}
