/**
 * Coordonnées publiques de MyKlinTown : un seul endroit à modifier.
 *
 * Retours de l'équipe (08/11/2026) : les deux numéros d'appel ne reçoivent
 * pas de WhatsApp, qui a son propre numéro. L'e-mail est celui du compte du
 * projet ; il changera avec le nom de domaine de la société.
 */
export const CONTACT = {
  ville: 'Yaoundé, Cameroun',
  appels: ['+237 6 53 56 53 48', '+237 6 90 77 76 63'],
  whatsapp: '+237 6 40 12 90 41',
  email: 'projet.myklintown@gmail.com',
} as const;

/** Lien « tel: » : chiffres et « + » seulement. */
export function lienAppel(numero: string): string {
  return `tel:${numero.replace(/[^\d+]/g, '')}`;
}

/** Lien WhatsApp : wa.me attend l'indicatif suivi du numéro, sans « + » ni espaces. */
export function lienWhatsApp(numero: string): string {
  return `https://wa.me/${numero.replace(/\D/g, '')}`;
}
