import {
  AlertTriangle,
  BarChart3,
  Camera,
  Home,
  LayoutDashboard,
  Map as MapIcon,
  QrCode,
  Receipt,
  Route,
  Truck,
  Users,
  Wallet,
  Tags,
  Bike,
  FileText,
  CalendarCheck,
  Shapes,
  Inbox,
  KeyRound,
  History,
  ScanLine,
  Sun,
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

export const PRECOLLECTEUR_NAV: PortalNavItem[] = [
  { href: '/precollecteur', label: 'Tableau de bord', icon: LayoutDashboard, court: 'Accueil' },
  { href: '/precollecteur/clients', label: 'Clients', icon: Users },
  { href: '/precollecteur/facturation', label: 'Factures & relances', icon: Receipt, court: 'Factures' },
  { href: '/precollecteur/tournees', label: 'Tournées', icon: Route },
  { href: '/precollecteur/carte', label: 'Carte', icon: MapIcon },
  { href: '/precollecteur/demandes', label: 'Demandes en attente', icon: Inbox, court: 'Demandes' },
  { href: '/precollecteur/flotte', label: 'Flotte & équipe', icon: Bike },
  { href: '/precollecteur/incidents', label: 'Incidents', icon: Camera },
  { href: '/precollecteur/charges', label: 'Charges du mois', icon: Wallet, court: 'Charges' },
  { href: '/precollecteur/grille', label: 'Grille tarifaire', icon: Tags },
];

/** Employé (chauffeur, ramasseur) : le terrain, rien d'autre (proposition de Pie). */
export const EMPLOYE_NAV: PortalNavItem[] = [
  { href: '/employe', label: 'Aujourd’hui', icon: Sun },
  { href: '/employe/scan', label: 'Scanner', icon: ScanLine },
  { href: '/employe/incidents/nouveau', label: 'Déclarer un incident', icon: Camera, court: 'Incident' },
  { href: '/employe/historique', label: 'Historique', icon: History },
];

export const CITOYEN_NAV: PortalNavItem[] = [
  { href: '/citoyen', label: 'Mon abonnement', icon: Home, court: 'Accueil' },
  { href: '/citoyen/collectes', label: 'Mes collectes', icon: CalendarCheck, court: 'Collectes' },
  { href: '/citoyen/factures', label: 'Mes factures', icon: FileText, court: 'Factures' },
  { href: '/citoyen/qr-code', label: 'Mon QR code', icon: QrCode, court: 'QR code' },
  { href: '/citoyen/signaler', label: 'Signaler un problème', icon: AlertTriangle },
];

export const DASHBOARD_NAV: PortalNavItem[] = [
  { href: '/dashboard', label: 'Supervision', icon: LayoutDashboard },
  { href: '/dashboard/indicateurs', label: 'Indicateurs du pilote', icon: BarChart3, court: 'Indicateurs' },
  { href: '/dashboard/zones', label: 'Zones de collecte', icon: Shapes, court: 'Zones' },
  { href: '/dashboard/precollecteurs', label: 'Précollecteurs', icon: Truck },
  { href: '/dashboard/incidents', label: 'Incidents', icon: AlertTriangle },
  { href: '/dashboard/acces', label: 'Demandes d’accès', icon: KeyRound, roles: ['admin'] },
];

export type PortalKey = 'precollecteur' | 'employe' | 'citoyen' | 'mairie';

export const PORTALS = {
  precollecteur: {
    name: 'Mon entreprise',
    role: 'Espace Précollecteur',
    nav: PRECOLLECTEUR_NAV,
  },
  employe: {
    name: 'Mon équipe',
    role: 'Espace Employé',
    nav: EMPLOYE_NAV,
  },
  citoyen: {
    name: 'Mon foyer',
    role: 'Espace Client',
    nav: CITOYEN_NAV,
  },
  mairie: {
    name: 'Service d’hygiène',
    role: 'Espace Mairie',
    nav: DASHBOARD_NAV,
  },
} as const;

/** Entrées de navigation visibles pour ce rôle. */
export function navPourRole(nav: PortalNavItem[], role: string | null | undefined): PortalNavItem[] {
  return nav.filter((i) => !i.roles || (role != null && i.roles.includes(role)));
}
