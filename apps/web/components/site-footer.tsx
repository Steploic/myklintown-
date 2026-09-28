import Link from 'next/link';
import { Logo } from '@myklintown/ui';

export function SiteFooter() {
  return (
    <footer className="bg-brand-gradient-ink text-white">
      <div className="container grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-4">
          <Logo size={34} variant="bare" />
          <p className="max-w-xs text-body-sm text-white/65">
            Le logiciel des précollecteurs de déchets : clients, factures, tournées et preuves de passage, depuis le téléphone.
          </p>
        </div>
        <div className="space-y-3">
          <h3 className="text-small font-semibold uppercase tracking-wider text-brand-leaf">Espaces</h3>
          <ul className="space-y-2 text-body-sm text-white/75">
            <li><Link href="/signup?role=precollecteur" className="hover:text-white">Précollecteur</Link></li>
            <li><Link href="/signup?role=citoyen" className="hover:text-white">Ménage</Link></li>
            <li><Link href="/login" className="hover:text-white">Mairie (sur invitation)</Link></li>
          </ul>
        </div>
        <div className="space-y-3">
          <h3 className="text-small font-semibold uppercase tracking-wider text-brand-leaf">Contact</h3>
          <ul className="space-y-2 text-body-sm text-white/75">
            <li>Yaoundé, Cameroun</li>
            <li>+237 6 53 56 53 48</li>
            <li>+237 6 90 77 76 63</li>
          </ul>
        </div>
        <div className="space-y-3">
          <h3 className="text-small font-semibold uppercase tracking-wider text-brand-leaf">Ressources</h3>
          <ul className="space-y-2 text-body-sm text-white/75">
            <li><Link href="/#tarifs" className="hover:text-white">Grille tarifaire</Link></li>
            <li><Link href="/marque" className="hover:text-white">Charte graphique</Link></li>
            <li><Link href="/legal" className="hover:text-white">Mentions légales</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container flex h-12 items-center justify-between text-small text-white/50">
          <span>© {new Date().getFullYear()} MyKlinTown</span>
          <span>Phase pilote · Yaoundé</span>
        </div>
      </div>
    </footer>
  );
}
