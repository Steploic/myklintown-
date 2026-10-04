import Link from 'next/link';
import { Clock } from 'lucide-react';
import { getSupabase, utilisateurCourant } from '@/lib/server';

/** Rappel affiché au compte qui attend la validation de son accès Mairie. */
export async function BandeauAccesMairie() {
  const supabase = await getSupabase();
  const user = await utilisateurCourant(supabase);
  if (!user) return null;
  const { data } = await supabase.from('demandes_acces').select('id').eq('user_id', user.id).eq('statut', 'en_attente').limit(1);
  if (!data?.length) return null;
  return (
    <Link
      href="/acces-mairie"
      className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-brand-blue/20 bg-brand-blue/5 px-4 py-3 text-body-sm font-medium text-brand-blue"
    >
      <span className="flex items-center gap-2">
        <Clock size={18} /> Votre demande d’accès Mairie est en cours de traitement.
      </span>
      <span aria-hidden>→</span>
    </Link>
  );
}
