'use client';

import Link from 'next/link';
import { useSoumission } from '@/components/ui/action-form';
import { AlertCircle, CheckCircle2, Home, Loader2, Truck } from 'lucide-react';
import { signUpAction, type AuthState } from '@/lib/auth-actions';

// Profils obtenables en ligne (voir SELF_SERVICE_ROLES) : le précollecteur ne voit
// que les données de SA propre entreprise ; le ménage, les siennes. Les accès
// Mairie sont ouverts par MyKlinTown, jamais demandés à l'inscription.
const PROFILS = [
  { value: 'precollecteur', label: 'Précollecteur', icon: Truck, desc: 'Je gère une activité de précollecte (clients, tricycles, tournées).' },
  { value: 'citoyen', label: 'Ménage', icon: Home, desc: 'Je veux faire collecter les déchets de mon foyer.' },
];

const INITIAL: AuthState = {};

export function SignupForm({ defaut }: { defaut: 'precollecteur' | 'citoyen' }) {
  const [state, formAction, pending] = useSoumission(signUpAction, INITIAL);

  return (
    <form onSubmit={formAction} className="space-y-5">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="field-label">Je suis…</legend>
        {PROFILS.map(({ value, label, icon: Icon, desc }) => (
          <label
            key={value}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-input p-4 transition-colors has-[:checked]:border-brand-green has-[:checked]:bg-brand-green/5 has-[:checked]:ring-1 has-[:checked]:ring-brand-green"
          >
            <input type="radio" name="role" value={value} defaultChecked={value === defaut} className="sr-only" />
            <span className="grid h-10 w-10 shrink-0 place-content-center rounded-lg bg-brand-ink text-brand-leaf">
              <Icon size={20} />
            </span>
            <span>
              <span className="block font-semibold text-brand-ink">{label}</span>
              <span className="block text-small text-muted-foreground">{desc}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {state.error && (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-terrain-stop/25 bg-terrain-stop/5 px-3 py-2 text-body-sm text-terrain-stop">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="flex items-start gap-2 rounded-md border border-terrain-ok/25 bg-terrain-ok/5 px-3 py-2 text-body-sm text-terrain-ok">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> {state.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="nom" className="field-label">Nom complet</label>
          <input id="nom" name="nom" required autoComplete="name" className="field" />
        </div>
        <div>
          <label htmlFor="tel" className="field-label">Téléphone</label>
          <input id="tel" name="tel" type="tel" autoComplete="tel" placeholder="6 XX XX XX XX" className="field" />
        </div>
        <div>
          <label htmlFor="email" className="field-label">E-mail</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="field" />
        </div>
        <div>
          <label htmlFor="password" className="field-label">Mot de passe</label>
          <input id="password" name="password" type="password" required minLength={6} autoComplete="new-password" className="field" />
          <p className="field-hint">6 caractères minimum.</p>
        </div>
      </div>

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending && <Loader2 size={16} className="animate-spin" />} {pending ? 'Création…' : 'Créer mon compte'}
      </button>
      <p className="text-center text-small text-muted-foreground">
        Vous représentez une Mairie ?{' '}
        <Link href="/acces-mairie" className="font-semibold text-brand-blue hover:underline">
          Demandez votre accès
        </Link>
        .
      </p>
    </form>
  );
}
