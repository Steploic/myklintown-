'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Check, Loader2, X } from 'lucide-react';
import { confirmerPassageAction } from '@/lib/client/actions';

/**
 * Le ménage confirme le passage du précollecteur. S'il le conteste, il est
 * envoyé vers la prise de vue : une contestation sans preuve n'est pas reçue.
 */
export function ConfirmationPassage({ collecteId }: { collecteId: string }) {
  const [fait, setFait] = useState(false);
  const [enCours, start] = useTransition();

  if (fait) {
    return (
      <span className="chip-ok">
        <Check size={12} /> Confirmé
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={enCours}
        onClick={() =>
          start(async () => {
            const r = await confirmerPassageAction(collecteId);
            if (!r.error) setFait(true);
          })
        }
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md bg-terrain-ok px-3 text-body-sm font-semibold text-white"
      >
        {enCours ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Il est passé
      </button>
      <Link
        href={`/citoyen/signaler?collecte=${collecteId}`}
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-terrain-stop/40 px-3 text-body-sm font-semibold text-terrain-stop"
      >
        <X size={16} /> Pas passé
      </Link>
    </span>
  );
}
