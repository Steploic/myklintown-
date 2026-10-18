'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@myklintown/ui';

/**
 * Champ mot de passe avec un bouton pour voir ce qu'on tape (retour d'équipe :
 * sur téléphone, une faute de frappe invisible bloque la connexion).
 *
 * Le libellé du bouton ne contient volontairement pas « mot de passe » : le
 * champ reste le seul élément désigné ainsi (lecteurs d'écran, tests).
 */
export function ChampMotDePasse({ className, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? 'text' : 'password'} className={cn('field pr-12', className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Masquer la saisie' : 'Afficher la saisie'}
        aria-pressed={visible}
        aria-controls={props.id}
        className="absolute inset-y-0 right-0 grid w-12 place-content-center rounded-r-md text-muted-foreground transition-colors hover:text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
      >
        {visible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      </button>
    </div>
  );
}
