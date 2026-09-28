import Link from 'next/link';
import { QrCode } from 'lucide-react';
import { Logo } from '@myklintown/ui';
import { PortalShell } from '@/components/portal-shell';
import { EmptyState, PageHeader } from '@/components/ui/blocks';
import { PrintButton } from '@/components/ui/print-button';
import { getMonAbonnement } from '@/lib/client/context';
import { qrSvg } from '@/lib/qr';

export const metadata = { title: 'Mon QR code' };

/** Le VRAI QR code du foyer : il encode le code client scanné par le précollecteur. */
export default async function QrCodePage() {
  const { client, entreprise } = await getMonAbonnement();

  if (!client) {
    return (
      <PortalShell portalKey="citoyen" currentPath="/citoyen/qr-code">
        <PageHeader titre="Mon QR code" />
        <div className="card-soft">
          <EmptyState
            icon={QrCode}
            titre="Pas encore de QR code"
            texte="Il est créé avec votre abonnement."
            action={<Link href="/citoyen/souscrire" className="btn-primary">M’abonner</Link>}
          />
        </div>
      </PortalShell>
    );
  }
  const qr = await qrSvg(client.code);

  return (
    <PortalShell portalKey="citoyen" currentPath="/citoyen/qr-code" titre={client.nom}>
      <div className="no-print">
        <PageHeader
          titre="Mon QR code"
          sousTitre="Collez-le à votre portail : le précollecteur le scanne à chaque passage, ce qui prouve le service."
          actions={<PrintButton />}
        />
      </div>
      <article className="mx-auto max-w-sm overflow-hidden rounded-2xl border-2 border-brand-ink bg-white shadow-elevated">
        <header className="flex items-center justify-between bg-brand-gradient-ink px-4 py-3 text-white">
          <Logo size={24} variant="bare" />
          <span className="text-small font-semibold uppercase tracking-wider text-brand-leaf">Foyer abonné</span>
        </header>
        <div className="p-6 text-center">
          <div className="mx-auto w-60" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="num mt-3 text-[1.4rem] font-bold tracking-[0.12em] text-brand-ink">{client.code}</p>
          <p className="font-semibold text-brand-ink">{client.nom}</p>
          {entreprise && <p className="mt-2 text-small text-muted-foreground">Collecte assurée par {entreprise.nom}</p>}
        </div>
      </article>
    </PortalShell>
  );
}
