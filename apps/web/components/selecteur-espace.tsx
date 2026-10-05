import Link from 'next/link';
import { ArrowLeftRight, ChevronDown, Home, Landmark, Truck } from 'lucide-react';
import type { PortalKey } from '@/lib/portal-config';

/**
 * Espaces ouverts aux administrateurs. Les portails collecteur et partenaire
 * B2B sont masqués depuis le pivot précollecteurs : ils n'y figurent pas.
 */
const ESPACES = [
  { cle: 'mairie', href: '/dashboard', label: 'Espace Mairie', icon: Landmark },
  { cle: 'precollecteur', href: '/precollecteur', label: 'Espace Précollecteur', icon: Truck },
  { cle: 'citoyen', href: '/citoyen', label: 'Espace Client', icon: Home },
] as const;

/**
 * « Changer d'espace » — administrateurs uniquement (le rôle ouvre tous les
 * espaces, mais aucun menu n'y menait). Sans JavaScript : un simple <details>,
 * utilisable dans la barre latérale (serveur) comme dans le menu mobile (client).
 */
export function SelecteurEspace({ courant }: { courant: PortalKey }) {
  return (
    <details className="group mx-3 mb-2 rounded-lg border border-white/10">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-body-sm font-medium text-white/80 hover:bg-white/[0.06] hover:text-white [&::-webkit-details-marker]:hidden">
        <ArrowLeftRight size={16} aria-hidden />
        <span className="flex-1">Changer d’espace</span>
        <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="space-y-0.5 px-1.5 pb-1.5">
        {ESPACES.filter((e) => e.cle !== courant).map(({ href, label, icon: Icon }) => (
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
