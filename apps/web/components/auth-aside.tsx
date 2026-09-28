import Link from 'next/link';
import { Check } from 'lucide-react';
import { Logo } from '@myklintown/ui';
import { PixelDots } from '@/components/ui/blocks';

/** Panneau de marque des pages d'authentification (grands écrans). */
export function AuthAside({ titre, points }: { titre: string; points: string[] }) {
  return (
    <div className="relative hidden overflow-hidden bg-brand-gradient-ink p-10 text-white lg:flex lg:flex-col lg:justify-between">
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -right-20 h-[30rem] w-[30rem] rounded-full bg-brand-leaf/15 blur-3xl" />
      <Link href="/" aria-label="Accueil">
        <Logo size={40} variant="bare" />
      </Link>
      <div className="relative max-w-md">
        <PixelDots className="mb-5 h-12 w-12" />
        <p className="text-[2rem] font-bold leading-tight">{titre}</p>
        <ul className="mt-6 space-y-3 text-white/80">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2.5">
              <Check size={18} className="mt-0.5 shrink-0 text-brand-leaf" /> {p}
            </li>
          ))}
        </ul>
      </div>
      <p className="relative text-small text-white/50">Phase pilote · Yaoundé · 2026</p>
    </div>
  );
}
