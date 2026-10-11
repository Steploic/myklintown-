'use client';

import { createContext, startTransition, useActionState, useCallback, useContext, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@myklintown/ui';
import { estPanneReseau, MESSAGE_HORS_LIGNE, MESSAGE_RESEAU } from '@/lib/format';
import type { ActionState } from '@/lib/types';

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * Soumission SANS remise à zéro automatique.
 *
 * Avec `<form action={…}>`, React 19 vide tous les champs après chaque envoi,
 * même refusé. Conséquence constatée par les tests : on choisit « MTN Mobile
 * Money », l'envoi est refusé faute de référence, le menu revient en silence à
 * « Espèces »… et le paiement est enregistré avec le mauvais moyen. On soumet
 * donc nous-mêmes : les valeurs saisies restent en place quand l'envoi échoue.
 */
export function useSoumission<S>(action: (prev: Awaited<S>, fd: FormData) => Promise<S>, initial: Awaited<S>) {
  const [state, dispatch, pending] = useActionState<S, FormData>(action, initial);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
  return [state, onSubmit, pending] as const;
}

/** Transmet l'état « en cours » aux boutons (useFormStatus ne voit pas onSubmit). */
const EnCours = createContext<boolean | null>(null);

interface ActionFormProps extends Omit<React.FormHTMLAttributes<HTMLFormElement>, 'action'> {
  action: Action;
  /** Vider le formulaire après un succès (ajout d'éléments en série). */
  resetOnSuccess?: boolean;
  children: React.ReactNode;
}

/**
 * Formulaire branché sur une Server Action, avec retour visible.
 * Un formulaire qui échoue en silence est pire qu'un bouton absent :
 * chaque soumission affiche soit une confirmation, soit la raison du refus.
 */
export function ActionForm({ action, resetOnSuccess, children, className, ...rest }: ActionFormProps) {
  // Sans réseau, l'envoi échouait en exception et faisait planter la page :
  // on répond par un message, et la saisie reste en place pour réessayer.
  const actionSure = useCallback<Action>(
    async (prev, fd) => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return { error: MESSAGE_HORS_LIGNE, reseau: true };
      try {
        return await action(prev, fd);
      } catch (e) {
        if (estPanneReseau(e)) return { error: MESSAGE_RESEAU, reseau: true };
        throw e;
      }
    },
    [action],
  );
  const [state, onSubmit, pending] = useSoumission(actionSure, {} as ActionState);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <EnCours.Provider value={pending}>
      <form ref={ref} onSubmit={onSubmit} className={className} {...rest}>
        {children}
        <FormMessage state={state} />
      </form>
    </EnCours.Provider>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-3 flex items-start gap-2 rounded-md border border-terrain-stop/25 bg-terrain-stop/5 px-3 py-2 text-body-sm text-terrain-stop">
        <AlertCircle size={16} className="mt-0.5 shrink-0" /> {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p role="status" className="mt-3 flex items-start gap-2 rounded-md border border-terrain-ok/25 bg-terrain-ok/5 px-3 py-2 text-body-sm text-terrain-ok">
        <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> {state.ok}
      </p>
    );
  }
  return null;
}

export function SubmitButton({
  children,
  pendingLabel = 'Enregistrement…',
  variant = 'primary',
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingLabel?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
}) {
  const statut = useFormStatus();
  const pending = useContext(EnCours) ?? statut.pending;
  return (
    <button
      type="submit"
      disabled={pending || rest.disabled}
      className={cn(`btn-${variant}`, className)}
      {...rest}
    >
      {pending ? (
        <>
          <Loader2 size={16} className="animate-spin" /> {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
