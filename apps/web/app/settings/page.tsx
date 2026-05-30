import { Bell, Globe, Lock, Save, User, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@myklintown/ui';
import { signOutAction } from '@/lib/auth-actions';

interface SettingsSection {
  id: string;
  icon: LucideIcon;
  title: string;
  fields: { label: string; value: string; action?: string }[];
}

const SECTIONS: SettingsSection[] = [
  {
    id: 'profil',
    icon: User,
    title: 'Profil',
    fields: [
      { label: 'Nom complet', value: 'Marie Tsanga' },
      { label: 'E-mail', value: 'm.tsanga@orange.cm' },
      { label: 'Téléphone', value: '+237 6 90 ...' },
    ],
  },
  {
    id: 'securite',
    icon: Lock,
    title: 'Sécurité',
    fields: [
      { label: 'Mot de passe', value: '••••••••', action: 'Modifier' },
      { label: 'Authentification à 2 facteurs', value: 'Désactivée', action: 'Activer' },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/">
            <Logo size={36} />
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="text-body-sm font-medium text-brand-blue hover:underline">
              Se déconnecter
            </button>
          </form>
        </div>
      </header>

      <main className="container max-w-4xl space-y-6 py-10">
        <header>
          <h1>Paramètres du compte</h1>
          <p className="text-body text-muted-foreground">
            Gérez vos informations personnelles, votre sécurité et vos préférences.
          </p>
        </header>

        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <section key={section.id} className="card-soft p-6">
              <h2 className="m-0 flex items-center gap-2">
                <Icon size={20} className="text-brand-blue" /> {section.title}
              </h2>
              <ul className="mt-4 space-y-3">
                {section.fields.map((f) => (
                  <li key={f.label} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="text-small text-muted-foreground">{f.label}</p>
                      <p className="text-body-sm font-semibold">{f.value}</p>
                    </div>
                    <button type="button" className="text-body-sm font-medium text-brand-blue hover:underline">
                      {f.action ?? 'Modifier'}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {/* Notifications */}
        <section className="card-soft p-6">
          <h2 className="m-0 flex items-center gap-2">
            <Bell size={20} className="text-brand-blue" /> Notifications
          </h2>
          <ul className="mt-4 space-y-2">
            {[
              { label: 'Avant chaque collecte', defaut: true },
              { label: 'Confirmation de paiement', defaut: true },
              { label: 'Résolution d\'un signalement', defaut: true },
              { label: 'Nouveautés marketplace', defaut: false },
              { label: 'Newsletter MyKlinTown', defaut: false },
            ].map((n) => (
              <li key={n.label}>
                <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border p-3">
                  <span className="text-body-sm font-medium">{n.label}</span>
                  <input type="checkbox" defaultChecked={n.defaut} className="h-5 w-5 accent-brand-green" />
                </label>
              </li>
            ))}
          </ul>
        </section>

        {/* Langue */}
        <section className="card-soft p-6">
          <h2 className="m-0 flex items-center gap-2">
            <Globe size={20} className="text-brand-blue" /> Langue & région
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-body-sm font-medium">Langue</span>
              <select className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm">
                <option>Français (Cameroun)</option>
                <option>English</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-body-sm font-medium">Devise</span>
              <select className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm">
                <option>FCFA (XAF)</option>
                <option>EUR</option>
                <option>USD</option>
              </select>
            </label>
          </div>
        </section>

        <div className="flex justify-end">
          <button type="submit" className="btn-primary">
            <Save size={16} /> Enregistrer les modifications
          </button>
        </div>
      </main>
    </div>
  );
}
