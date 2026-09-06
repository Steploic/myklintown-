'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, KeyRound, Send } from 'lucide-react';
import { Logo } from '@myklintown/ui';
import { requestPasswordResetAction, type AuthState } from '@/lib/auth-actions';

const INITIAL: AuthState = {};

/** Motifs renvoyés par /auth/callback quand un lien ne peut pas être honoré. */
const MOTIFS: Record<string, string> = {
  'lien-autre-appareil':
    'Ce lien doit être ouvert sur l’appareil et le navigateur depuis lesquels la demande a été faite. Refaites la demande ici.',
  'lien-expire': 'Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.',
  'lien-invalide': 'Ce lien est incomplet. Demandez-en un nouveau.',
};

function FormulaireOubli() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, INITIAL);
  const motif = useSearchParams().get('motif');
  const avertissement = motif ? MOTIFS[motif] : null;

  return (
    <div className="card-soft w-full max-w-md p-8">
      <Logo size={40} />
      <div className="mt-6 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue">
        <KeyRound size={22} />
      </div>
      <h1 className="mt-4">Mot de passe oublié</h1>
      <p className="mt-1 text-body text-muted-foreground">
        Saisissez l’adresse e-mail de votre compte. Vous recevrez un lien pour définir un nouveau mot
        de passe. Il reste valable une heure et ne sert qu’une fois.
      </p>

      {avertissement && !state.message && (
        <div className="mt-5 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-body-sm text-warning">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{avertissement}</span>
        </div>
      )}

      {state.error && (
        <div className="mt-5 flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-body-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      {state.message ? (
        <div className="mt-6 flex items-start gap-2 rounded-md border border-brand-green/30 bg-brand-green/10 px-3 py-3 text-body-sm text-brand-green">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span>{state.message}</span>
        </div>
      ) : (
        <form action={formAction} className="mt-6 space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="text-body-sm font-medium">
              Adresse e-mail
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
          <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60">
            <Send size={16} /> {pending ? 'Envoi…' : 'Envoyer le lien'}
          </button>
        </form>
      )}

      <Link
        href="/login"
        className="mt-6 inline-flex items-center gap-1 text-body-sm text-brand-blue hover:underline"
      >
        <ArrowLeft size={14} /> Retour à la connexion
      </Link>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-brand-gradient-soft px-6">
      <Suspense fallback={<div className="card-soft w-full max-w-md p-8" />}>
        <FormulaireOubli />
      </Suspense>
    </div>
  );
}
