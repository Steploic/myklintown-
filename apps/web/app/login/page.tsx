'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { Logo } from '@myklintown/ui';
import { signInAction, type AuthState } from '@/lib/auth-actions';

const INITIAL: AuthState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signInAction, INITIAL);

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Visuel */}
      <div className="relative hidden bg-brand-gradient lg:flex lg:flex-col lg:justify-between lg:p-10">
        <Link href="/" className="text-white">
          <Logo size={56} variant="bare" />
        </Link>
        <div className="space-y-3 text-white">
          <p className="text-h2-sm font-semibold">
            « MyKlinTown a transformé notre vision : nous ne supervisons plus la collecte, nous la
            pilotons. »
          </p>
          <p className="text-body-sm text-white/80">— Chef de Service Hygiène, Mairie Yaoundé III</p>
        </div>
      </div>

      {/* Formulaire */}
      <div className="flex items-center justify-center p-6 lg:p-10">
        <form action={formAction} className="w-full max-w-md space-y-6">
          <div className="space-y-2 lg:hidden">
            <Logo size={40} />
          </div>
          <div className="space-y-1">
            <h1 className="text-h1-sm">Connexion</h1>
            <p className="text-body-sm text-muted-foreground">Accédez à votre portail MyKlinTown.</p>
          </div>

          {state.error && (
            <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-body-sm text-danger">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{state.error}</span>
            </div>
          )}

          <div className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="email" className="text-body-sm font-medium">
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="vous@exemple.cm"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm placeholder:text-muted-foreground focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
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
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm placeholder:text-muted-foreground focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
              />
            </div>
            <div className="flex items-center justify-between text-body-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="remember" className="rounded border-border" />
                <span className="text-muted-foreground">Se souvenir de moi</span>
              </label>
              <Link href="/forgot" className="text-brand-blue hover:underline">
                Mot de passe oublié ?
              </Link>
            </div>
          </div>

          <button type="submit" disabled={pending} className="btn-secondary w-full">
            {pending ? 'Connexion…' : 'Se connecter'}
          </button>

          <p className="text-center text-body-sm text-muted-foreground">
            Pas encore de compte ?{' '}
            <Link href="/signup" className="font-medium text-brand-blue hover:underline">
              Créer un compte
            </Link>
          </p>
          <div className="text-center text-small text-muted-foreground">
            <Link href="/" className="hover:text-brand-blue">
              ← Retour à l'accueil
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
