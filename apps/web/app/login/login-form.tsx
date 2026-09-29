'use client';

import { useSoumission } from '@/components/ui/action-form';
import Link from 'next/link';
import { AlertCircle, Loader2 } from 'lucide-react';
import { signInAction, type AuthState } from '@/lib/auth-actions';

const INITIAL: AuthState = {};

export function LoginForm() {
  const [state, formAction, pending] = useSoumission(signInAction, INITIAL);

  return (
    <form onSubmit={formAction} className="space-y-4">
      {state.error && (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-terrain-stop/25 bg-terrain-stop/5 px-3 py-2 text-body-sm text-terrain-stop">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {state.error}
        </p>
      )}
      <div>
        <label htmlFor="email" className="field-label">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="email" required placeholder="vous@exemple.cm" className="field" />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="field-label">Mot de passe</label>
          <Link href="/forgot" className="mb-1 text-body-sm font-medium text-brand-blue hover:underline">
            Oublié ?
          </Link>
        </div>
        <input id="password" name="password" type="password" autoComplete="current-password" required placeholder="••••••••" className="field" />
      </div>
      <button type="submit" disabled={pending} className="btn-secondary w-full">
        {pending && <Loader2 size={16} className="animate-spin" />} {pending ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  );
}
