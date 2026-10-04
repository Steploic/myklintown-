import {
  AlertOctagon,
  AlertTriangle,
  BarChart3,
  Building2,
  Camera,
  ClipboardList,
  DollarSign,
  Home,
  LayoutDashboard,
  Map as MapIcon,
  Package,
  QrCode,
  Receipt,
  Recycle,
  Route,
  ShoppingBag,
  Trophy,
  Truck,
  Users,
  Wallet,
  Warehouse,
  Tags,
  Bike,
  FileText,
  CalendarCheck,
  Shapes,
  Inbox,
  KeyRound,
  type LucideIcon,
} from 'lucide-react';

export interface PortalNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string | number;
  /** Libellé court pour la barre d'onglets mobile. */
  court?: string;
  /** Réservé à certains rôles (absent = visible par tous ceux du portail). */
  roles?: string[];
}

/** Données démo utilisateur — à remplacer par l'utilisateur authentifié Supabase. */
export const DEMO_USERS = {
  citoyen: { nom: 'Marie Tsanga', email: 'm.tsanga@orange.cm' },
  collecteur: { nom: 'Jean Fabrice', email: 'agent-c217@myklintown.cm' },
  mairie: { nom: 'Chef Service', email: 'hygiene@yaounde3.cm' },
  enterprise: { nom: 'Paul Essomba', email: 'p.essomba@ecocycle.cm' },
} as const;

export const PRECOLLECTEUR_NAV: PortalNavItem[] = [
  { href: '/precollecteur', label: 'Tableau de bord', icon: LayoutDashboard, court: 'Accueil' },
  { href: '/precollecteur/clients', label: 'Clients', icon: Users },
  { href: '/precollecteur/facturation', label: 'Factures & relances', icon: Receipt, court: 'Factures' },
  { href: '/precollecteur/tournees', label: 'Tournées', icon: Route },
  { href: '/precollecteur/carte', label: 'Carte', icon: MapIcon },
  { href: '/precollecteur/demandes', label: 'Demandes en attente', icon: Inbox, court: 'Demandes' },
  { href: '/precollecteur/flotte', label: 'Flotte & équipe', icon: Bike },
  { href: '/precollecteur/incidents', label: 'Incidents', icon: Camera },
  { href: '/precollecteur/grille', label: 'Grille tarifaire', icon: Tags },
];

export const CITOYEN_NAV: PortalNavItem[] = [
  { href: '/citoyen', label: 'Mon abonnement', icon: Home, court: 'Accueil' },
  { href: '/citoyen/collectes', label: 'Mes collectes', icon: CalendarCheck, court: 'Collectes' },
  { href: '/citoyen/factures', label: 'Mes factures', icon: FileText, court: 'Factures' },
  { href: '/citoyen/qr-code', label: 'Mon QR code', icon: QrCode, court: 'QR code' },
  { href: '/citoyen/signaler', label: 'Signaler un problème', icon: AlertTriangle },
];

export const COLLECTEUR_NAV: PortalNavItem[] = [
  { href: '/collecteur', label: 'Ma tournée', icon: LayoutDashboard },
  { href: '/collecteur/scan', label: 'Scanner QR', icon: QrCode },
  { href: '/collecteur/itineraire', label: 'Itinéraire', icon: Route },
  { href: '/collecteur/incidents', label: 'Incidents', icon: AlertOctagon, badge: 1 },
  { href: '/collecteur/qhse', label: 'Rapport QHSE', icon: ClipboardList },
  { href: '/collecteur/performance', label: 'Performance', icon: Trophy },
];

export const DASHBOARD_NAV: PortalNavItem[] = [
  { href: '/dashboard', label: 'Supervision', icon: LayoutDashboard },
  { href: '/dashboard/zones', label: 'Zones de collecte', icon: Shapes, court: 'Zones' },
  { href: '/dashboard/precollecteurs', label: 'Précollecteurs', icon: Truck },
  { href: '/dashboard/incidents', label: 'Incidents', icon: AlertTriangle },
  { href: '/dashboard/acces', label: 'Demandes d’accès', icon: KeyRound, roles: ['admin'] },
];

export const ENTERPRISE_NAV: PortalNavItem[] = [
  { href: '/enterprise', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/enterprise/centres-tri', label: 'Centres de tri', icon: Warehouse },
  { href: '/enterprise/stock', label: 'Stock entrepôt', icon: Package },
  { href: '/enterprise/marketplace', label: 'Marketplace vendeur', icon: ShoppingBag },
  { href: '/enterprise/livraisons', label: 'Livraisons', icon: Truck },
  { href: '/enterprise/facturation', label: 'Facturation', icon: DollarSign },
];

export type PortalKey = 'precollecteur' | 'citoyen' | 'collecteur' | 'mairie' | 'enterprise';

export const PORTALS = {
  precollecteur: {
    name: 'Mon entreprise',
    role: 'Espace Précollecteur',
    nav: PRECOLLECTEUR_NAV,
  },
  citoyen: {
    name: 'Mon foyer',
    role: 'Espace Client',
    nav: CITOYEN_NAV,
  },
  collecteur: {
    name: 'Tournée du 26 mai · Matin',
    role: 'Portail Collecteur',
    nav: COLLECTEUR_NAV,
  },
  mairie: {
    name: 'Service d’hygiène',
    role: 'Espace Mairie',
    nav: DASHBOARD_NAV,
  },
  enterprise: {
    name: 'EcoCycle SARL',
    role: 'Espace Partenaire B2B',
    nav: ENTERPRISE_NAV,
  },
} as const;

/** Icônes réutilisables pour les pages */
export const ICONS = {
  Home,
  Camera,
  Receipt,
  Building2,
  BarChart3,
  Recycle,
  Truck,
} as const;

/** Entrées de navigation visibles pour ce rôle. */
export function navPourRole(nav: PortalNavItem[], role: string | null | undefined): PortalNavItem[] {
  return nav.filter((i) => !i.roles || (role != null && i.roles.includes(role)));
}
