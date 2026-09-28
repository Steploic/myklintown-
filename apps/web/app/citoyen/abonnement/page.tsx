import { redirect } from 'next/navigation';

/** Ancienne page (prix codés en dur) : l'abonnement se gère désormais depuis l'accueil client. */
export default function AbonnementPage() {
  redirect('/citoyen');
}
