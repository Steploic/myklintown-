'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@myklintown/ui';
import type { ActionState } from '@/lib/types';

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

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
  const [state, formAction] = useActionState(action, {} as ActionState);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className} {...rest}>
      {children}
      <FormMessage state={state} />
    </form>
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
  const { pending } = useFormStatus();
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
