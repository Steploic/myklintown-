'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { AlertCircle, Building2, CheckCircle2, Recycle, Truck, Users } from 'lucide-react';
import { Logo } from '@myklintown/ui';
import { signUpAction, type AuthState } from '@/lib/auth-actions';

const ROLES = [
  { value: 'citoyen', label: 'Citoyen / Ménage', icon: Users, desc: 'M\'abonner pour faire collecter mes déchets' },
  { value: 'collecteur', label: 'Collecteur', icon: Truck, desc: 'Je travaille pour une structure de pré-collecte' },
  { value: 'mairie', label: 'Agent Mairie', icon: Building2, desc: 'Je supervise la gestion territoriale' },
  { value: 'enterprise', label: 'Recycleur / Entreprise', icon: Recycle, desc: 'Je veux acheter ou collecter des déchets triés' },
];

const INITIAL: AuthState = {};

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signUpAction, INITIAL);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/">
            <Logo size={36} />
          </Link>
          <span className="text-body-sm text-muted-foreground">
            Déjà inscrit ?{' '}
            <Link href="/login" className="font-medium text-brand-blue hover:underline">
              Se connecter
            </Link>
          </span>
        </div>
      </header>

      <main className="container py-12">
        <form action={formAction} className="mx-auto max-w-3xl space-y-8">
          <div className="space-y-2 text-center">
            <h1 className="text-h1-sm md:text-h1">Créer un compte MyKlinTown</h1>
            <p className="text-body text-muted-foreground">
              Choisissez le profil qui vous correspond. Vous pourrez ensuite compléter votre dossier.
            </p>
          </div>

          {state.error && (
            <div className="mx-auto flex max-w-xl items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-body-sm text-danger">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{state.error}</span>
            </div>
          )}
          {state.message && (
            <div className="mx-auto flex max-w-xl items-start gap-2 rounded-md border border-brand-green/30 bg-brand-green/10 px-3 py-2 text-body-sm text-brand-green">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <span>{state.message}</span>
            </div>
          )}

          <fieldset className="grid gap-4 md:grid-cols-2">
            <legend className="sr-only">Choisissez votre rôle</legend>
            {ROLES.map(({ value, label, icon: Icon, desc }) => (
              <label
                key={value}
                className="card-soft flex cursor-pointer items-start gap-4 p-5 transition-colors has-[:checked]:border-brand-green has-[:checked]:bg-brand-green/5"
              >
                <input type="radio" name="role" value={value} className="sr-only" defaultChecked={value === 'citoyen'} />
                <span className="grid h-10 w-10 place-content-center rounded-lg bg-brand-blue/10 text-brand-blue">
                  <Icon size={20} />
                </span>
                <span className="flex-1">
                  <span className="block text-h2-sm font-semibold">{label}</span>
                  <span className="block text-body-sm text-muted-foreground">{desc}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="card-soft space-y-4 p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="nom" className="text-body-sm font-medium">
                  Nom complet
                </label>
                <input
                  id="nom"
                  name="nom"
                  type="text"
                  required
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="tel" className="text-body-sm font-medium">
                  Téléphone
                </label>
                <input
                  id="tel"
                  name="tel"
                  type="tel"
                  placeholder="+237 6 ..."
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="email" className="text-body-sm font-medium">
                  E-mail
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="password" className="text-body-sm font-medium">
                  Mot de passe
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                />
              </div>
            </div>
            <button type="submit" disabled={pending} className="btn-primary w-full">
              {pending ? 'Création…' : 'Créer mon compte'}
            </button>
            <p className="text-center text-small text-muted-foreground">
              En créant un compte, vous acceptez nos conditions d'utilisation.
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}
