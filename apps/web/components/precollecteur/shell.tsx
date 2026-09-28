import { PortalShell } from '@/components/portal-shell';
import { requireEntreprise } from '@/lib/precollecteur/context';

/** Coque de l'espace précollecteur : le nom de l'entreprise en en-tête. */
export async function PrecoShell({ path, children }: { path: string; children: React.ReactNode }) {
  const { entreprise } = await requireEntreprise();
  return (
    <PortalShell portalKey="precollecteur" currentPath={path} titre={entreprise.nom}>
      {children}
    </PortalShell>
  );
}
