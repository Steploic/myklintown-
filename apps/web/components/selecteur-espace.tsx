import Link from 'next/link';
import { ArrowLeftRight, ChevronDown, Home, Landmark, Sun, Truck } from 'lucide-react';
import type { PortalKey } from '@/lib/portal-config';

/**
 * Espaces ouverts aux administrateurs. (Les portails de démonstration
 * Collecteur et Partenaire B2B ont été retirés le 19/10/2026.)
 */
const ESPACES_ADMIN = [
  { cle: 'mairie', href: '/dashboard', label: 'Espace Mairie', icon: Landmark },
  { cle: 'precollecteur', href: '/precollecteur', label: 'Espace Précollecteur', icon: Truck },
  { cle: 'citoyen', href: '/citoyen', label: 'Espace Client', icon: Home },
] as const;

/**
 * Un employé peut aussi être abonné (revue du 09/11/2026) : rejoindre l'équipe
 * de son précollecteur ne lui retire plus l'accès à son propre abonnement.
 */
const ESPACES_EMPLOYE = [
  { cle: 'employe', href: '/employe', label: 'Espace employé', icon: Sun },
  { cle: 'citoyen', href: '/citoyen', label: 'Mon abonnement', icon: Home },
] as const;

/** Les rôles qui ont plus d'un espace, donc un sélecteur. */
export function aPlusieursEspaces(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'employe';
}

/**
 * « Changer d'espace » — administrateurs (le rôle ouvre tous les espaces, mais
 * aucun menu n'y menait) et employés (leur espace et leur abonnement). Sans
 * JavaScript : un simple <details>, utilisable dans la barre latérale (serveur)
 * comme dans le menu mobile (client).
 */
export function SelecteurEspace({ courant, role }: { courant: PortalKey; role?: string | null }) {
  const espaces = role === 'employe' ? ESPACES_EMPLOYE : ESPACES_ADMIN;
  return (
    <details className="group mx-3 mb-2 rounded-lg border border-white/10">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-body-sm font-medium text-white/80 hover:bg-white/[0.06] hover:text-white [&::-webkit-details-marker]:hidden">
        <ArrowLeftRight size={16} aria-hidden />
        <span className="flex-1">Changer d’espace</span>
        <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="space-y-0.5 px-1.5 pb-1.5">
        {espaces.filter((e) => e.cle !== courant).map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-body-sm text-white/75 hover:bg-white/[0.08] hover:text-white"
            >
              <Icon size={16} aria-hidden /> {label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
