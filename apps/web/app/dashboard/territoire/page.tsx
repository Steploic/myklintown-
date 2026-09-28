import { redirect } from 'next/navigation';

/** Ancienne page de maquette (données inventées) : remplacée par la supervision réelle. */
export default function Page() {
  redirect('/dashboard');
}
