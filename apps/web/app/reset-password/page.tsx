'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react';
import { Logo } from '@myklintown/ui';
import { updatePasswordAction, type AuthState } from '@/lib/auth-actions';

const INITIAL: AuthState = {};

/**
 * Définition du nouveau mot de passe.
 *
 * On arrive ici depuis /auth/callback, qui a déjà ouvert la session de
 * récupération. Si cette session manque, l'action serveur le dit clairement
 * plutôt que d'échouer sans explication.
 */
export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState(updatePasswordAction, INITIAL);

  return (
    <div className="grid min-h-screen place-items-center bg-brand-gradient-soft px-6">
      <div className="card-soft w-full max-w-md p-8">
        <Logo size={40} />
        <div className="mt-6 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-green/10 text-brand-green">
          <ShieldCheck size={22} />
        </div>
        <h1 className="mt-4">Nouveau mot de passe</h1>
        <p className="mt-1 text-body text-muted-foreground">
          Choisissez un mot de passe. Vous serez connecté aussitôt.
        </p>

        {state.error && (
          <div className="mt-5 flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-body-sm text-danger">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{state.error}</span>
          </div>
        )}

        <form action={formAction} className="mt-6 space-y-4">
          <div className="space-y-1">
            <label htmlFor="password" className="text-body-sm font-medium">
              Nouveau mot de passe
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              placeholder="••••••••"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm placeholder:text-muted-foreground focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
            />
            <p className="text-small text-muted-foreground">6 caractères au minimum.</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="confirmation" className="text-body-sm font-medium">
              Confirmez le mot de passe
            </label>
            <input
              id="confirmation"
              name="confirmation"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              placeholder="••••••••"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm placeholder:text-muted-foreground focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
            />
          </div>

          <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60">
            <KeyRound size={16} /> {pending ? 'Enregistrement…' : 'Enregistrer et me connecter'}
          </button>
        </form>

        <Link
          href="/forgot"
          className="mt-6 inline-flex items-center gap-1 text-body-sm text-brand-blue hover:underline"
        >
          <ArrowLeft size={14} /> Demander un nouveau lien
        </Link>
      </div>
    </div>
  );
}
