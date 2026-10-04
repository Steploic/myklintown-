'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSupabase, rpc } from '@/lib/server';
import { estErreurReseau, MESSAGE_RESEAU } from '@/lib/format';
import { normaliserNom } from '@/lib/metier';
import type { ActionState } from '@/lib/types';

const txt = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

/**
 * Demande d'accès Mairie (retour R1). Sans compte : on le crée (rôle ménage par
 * défaut, sans aucun pouvoir) puis on dépose la demande ; un administrateur
 * MyKlinTown la valide, ce qui promeut le compte en « mairie ».
 */
export async function demanderAccesMairieAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!txt(fd, 'fonction')) return { error: 'Indiquez votre fonction (ex. Chef du service d’hygiène).' };
  if (!txt(fd, 'commune_id')) return { error: 'Choisissez votre commune.' };

  if (!user) {
    const email = txt(fd, 'email').toLowerCase();
    const motDePasse = String(fd.get('password') ?? '');
    const nom = normaliserNom(txt(fd, 'nom'));
    if (!nom || !email || motDePasse.length < 6) {
      return { error: 'Nom, e-mail et mot de passe (6 caractères minimum) sont obligatoires.' };
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password: motDePasse,
      options: { data: { nom_complet: nom, role: 'citoyen', telephone: txt(fd, 'telephone') } },
    });
    if (error) {
      if (estErreurReseau(error)) return { error: MESSAGE_RESEAU };
      if (/already registered|already exists/i.test(error.message)) {
        return { error: 'Un compte existe déjà avec cette adresse : connectez-vous d’abord, puis revenez sur cette page.' };
      }
      return { error: error.message };
    }
    if (!data.session) {
      return { ok: 'Compte créé. Confirmez votre adresse e-mail, connectez-vous, puis revenez sur cette page pour envoyer la demande.' };
    }
  }

  const { error } = await rpc(supabase, 'demander_acces_mairie', {
    p_commune: txt(fd, 'commune_id'),
    p_fonction: txt(fd, 'fonction'),
    p_service: txt(fd, 'service') || null,
    p_telephone: txt(fd, 'telephone') || null,
    p_message: txt(fd, 'message') || null,
  });
  if (error) return { error: estErreurReseau(error) ? MESSAGE_RESEAU : error.message };
  revalidatePath('/acces-mairie');
  redirect('/acces-mairie?envoyee=1');
}

/** L'auteur retire sa demande tant qu'elle n'est pas traitée. */
export async function annulerDemandeAccesAction() {
  const supabase = await getSupabase();
  await rpc(supabase, 'annuler_demande_acces');
  revalidatePath('/acces-mairie');
  redirect('/acces-mairie');
}

/** Validation par un administrateur MyKlinTown. */
export async function traiterDemandeAccesAction(fd: FormData) {
  const supabase = await getSupabase();
  await rpc(supabase, 'traiter_demande_acces', {
    p_demande: String(fd.get('demande_id')),
    p_accepter: fd.get('decision') === 'accepter',
  });
  revalidatePath('/dashboard/acces');
}
