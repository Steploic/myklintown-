import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ScanLine } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { EmptyState, PageHeader } from '@/components/ui/blocks';
import { requireEmploye } from '@/lib/employe/context';
import { tourneesDeLEquipe } from '@/lib/employe/donnees';
import { isoJour } from '@/lib/format';

export const metadata = { title: 'Scanner' };

/**
 * Raccourci « Scanner » : ouvre la caméra sur la tournée du moment (en cours,
 * sinon celle prévue aujourd'hui). Le scan n'a de sens que dans une tournée.
 */
export default async function ScanEmploye() {
  const { supabase, entreprise } = await requireEmploye();
  const tournees = await tourneesDeLEquipe(supabase, 'a_faire');
  const cible = tournees.find((t) => t.statut === 'en_cours') ?? tournees.find((t) => t.date === isoJour());
  if (cible) redirect(`/employe/tournees/${cible.id}?scan=1`);

  return (
    <PortalShell portalKey="employe" currentPath="/employe/scan" titre={entreprise.nom}>
      <PageHeader titre="Scanner" />
      <div className="card-soft">
        <EmptyState
          icon={ScanLine}
          titre="Aucune tournée aujourd’hui"
          texte={
            <>
              Le scan enregistre un passage dans une tournée. Votre gérant ne vous a mis dans aucune tournée en cours ou
              prévue aujourd’hui. <Link href="/employe" className="font-semibold text-brand-blue hover:underline">Voir mes tournées</Link>
            </>
          }
        />
      </div>
    </PortalShell>
  );
}
