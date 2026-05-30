import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combine clsx + tailwind-merge — pattern shadcn/ui standard.
 * Permet `cn('px-2', condition && 'px-4')` avec déduplication des classes Tailwind conflictuelles.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
