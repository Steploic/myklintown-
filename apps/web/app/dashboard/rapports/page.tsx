import { redirect } from 'next/navigation';

/** Ancienne page de maquette (données inventées) : remplacée par les indicateurs réels du pilote. */
export default function Page() {
  redirect('/dashboard/indicateurs');
}
