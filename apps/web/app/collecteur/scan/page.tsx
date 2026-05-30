import { PortalShell } from '@/components/portal-shell';
import { DEMO_USERS } from '@/lib/portal-config';
import { CollecteurScanClient } from '@/components/collecteur-scan-client';

export default function CollecteurScan() {
  return (
    <PortalShell portalKey="collecteur" user={DEMO_USERS.collecteur} currentPath="/collecteur/scan">
      <div className="space-y-6">
        <header>
          <h1>Scanner un QR Code</h1>
          <p className="text-body text-muted-foreground">
            Pointez la caméra vers le QR Code du ménage. Chaque scan est horodaté et qualifié
            (collecte OK, bac vide, absent, inaccessible).
          </p>
        </header>

        <CollecteurScanClient />
      </div>
    </PortalShell>
  );
}
