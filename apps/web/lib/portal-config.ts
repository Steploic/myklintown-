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
  type LucideIcon,
} from 'lucide-react';

export interface PortalNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string | number;
}

/** Données démo utilisateur — à remplacer par l'utilisateur authentifié Supabase. */
export const DEMO_USERS = {
  citoyen: { nom: 'Marie Tsanga', email: 'm.tsanga@orange.cm' },
  collecteur: { nom: 'Jean Fabrice', email: 'agent-c217@myklintown.cm' },
  mairie: { nom: 'Chef Service', email: 'hygiene@yaounde3.cm' },
  enterprise: { nom: 'Paul Essomba', email: 'p.essomba@ecocycle.cm' },
} as const;

export const CITOYEN_NAV: PortalNavItem[] = [
  { href: '/citoyen', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/citoyen/abonnement', label: 'Mon abonnement', icon: Wallet },
  { href: '/citoyen/qr-code', label: 'Mon QR Code', icon: QrCode },
  { href: '/citoyen/signaler', label: 'Signaler', icon: AlertTriangle, badge: 'NEW' },
  { href: '/citoyen/marketplace', label: 'Marketplace', icon: ShoppingBag },
  { href: '/citoyen/recyclage', label: 'Mes recyclages', icon: Recycle },
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
  { href: '/dashboard', label: "Vue d'ensemble", icon: LayoutDashboard },
  { href: '/dashboard/territoire', label: 'Territoire', icon: MapIcon },
  { href: '/dashboard/menages', label: 'Ménages', icon: Users, badge: '4.2k' },
  { href: '/dashboard/tournees', label: 'Tournées', icon: Truck },
  { href: '/dashboard/recouvrement', label: 'Recouvrement', icon: Wallet },
  { href: '/dashboard/transformation', label: 'Transformation', icon: Recycle },
  { href: '/dashboard/signalements', label: 'Signalements', icon: AlertTriangle, badge: 3 },
  { href: '/dashboard/rapports', label: 'Rapports', icon: BarChart3 },
];

export const ENTERPRISE_NAV: PortalNavItem[] = [
  { href: '/enterprise', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/enterprise/centres-tri', label: 'Centres de tri', icon: Warehouse },
  { href: '/enterprise/stock', label: 'Stock entrepôt', icon: Package },
  { href: '/enterprise/marketplace', label: 'Marketplace vendeur', icon: ShoppingBag },
  { href: '/enterprise/livraisons', label: 'Livraisons', icon: Truck },
  { href: '/enterprise/facturation', label: 'Facturation', icon: DollarSign },
];

export type PortalKey = 'citoyen' | 'collecteur' | 'mairie' | 'enterprise';

export const PORTALS = {
  citoyen: {
    name: 'Famille TSANGA',
    role: 'Portail Citoyen',
    nav: CITOYEN_NAV,
  },
  collecteur: {
    name: 'Tournée du 26 mai · Matin',
    role: 'Portail Collecteur',
    nav: COLLECTEUR_NAV,
  },
  mairie: {
    name: 'Service Hygiène · Yaoundé III',
    role: 'Dashboard Mairie',
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
