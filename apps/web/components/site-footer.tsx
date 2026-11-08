import Link from 'next/link';
import { Logo } from '@myklintown/ui';
import { CONTACT, lienAppel, lienWhatsApp } from '@/lib/contact';

export function SiteFooter() {
  return (
    <footer className="bg-brand-gradient-ink text-white">
      <div className="container grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-4">
          <Logo size={34} variant="bare" />
          <p className="max-w-xs text-body-sm text-white/65">
            La plateforme qui réunit précollecteurs et abonnés : devis, tournées, factures et preuves de passage, depuis le téléphone.
          </p>
        </div>
        <div className="space-y-3">
          <h3 className="text-small font-semibold uppercase tracking-wider text-brand-leaf">Espaces</h3>
          <ul className="space-y-2 text-body-sm text-white/75">
            <li><Link href="/signup?role=precollecteur" className="hover:text-white">Précollecteur</Link></li>
            <li><Link href="/signup?role=citoyen" className="hover:text-white">Abonné</Link></li>
            <li><Link href="/rejoindre" className="hover:text-white">Employé (avec un code)</Link></li>
            <li><Link href="/acces-mairie" className="hover:text-white">Mairie (sur demande)</Link></li>
          </ul>
        </div>
        <div className="space-y-3">
          <h3 className="text-small font-semibold uppercase tracking-wider text-brand-leaf">Contact</h3>
          <ul className="space-y-3 text-body-sm text-white/75">
            <li>{CONTACT.ville}</li>
            <li>
              <span className="block text-small text-white/50">Appels uniquement</span>
              {CONTACT.appels.map((n) => (
                <a key={n} href={lienAppel(n)} className="block hover:text-white">{n}</a>
              ))}
            </li>
            <li>
              <span className="block text-small text-white/50">WhatsApp</span>
              <a href={lienWhatsApp(CONTACT.whatsapp)} target="_blank" rel="noopener noreferrer" className="hover:text-white">
                {CONTACT.whatsapp}
              </a>
            </li>
            <li>
              <span className="block text-small text-white/50">E-mail</span>
              <a href={`mailto:${CONTACT.email}`} className="break-all hover:text-white">{CONTACT.email}</a>
            </li>
          </ul>
        </div>
        <div className="space-y-3">
          <h3 className="text-small font-semibold uppercase tracking-wider text-brand-leaf">Ressources</h3>
          <ul className="space-y-2 text-body-sm text-white/75">
            <li><Link href="/marque" className="hover:text-white">Charte graphique</Link></li>
            <li><Link href="/legal/charte" className="hover:text-white">Charte de l’abonné</Link></li>
            <li><Link href="/legal/contrat" className="hover:text-white">Contrat d’abonnement</Link></li>
            <li><Link href="/legal" className="hover:text-white">Mentions légales</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-small text-white/50">
          <span>© {new Date().getFullYear()} MyKlinTown</span>
          <span>Lancement officiel · décembre 2026</span>
        </div>
      </div>
    </footer>
  );
}
