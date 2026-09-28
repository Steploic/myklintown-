import { redirect } from 'next/navigation';

/** Ancienne page de maquette (données inventées) : hors périmètre du pilote. */
export default function Page() {
  redirect('/citoyen');
}
