import { PageDocument } from '@/components/legal/page-document';
import { lireVersion } from '@/lib/documents';

export const metadata = { title: 'Contrat d’abonnement' };

export default async function ContratPage({ searchParams }: { searchParams: Promise<{ version?: string }> }) {
  const { version } = await searchParams;
  return <PageDocument type="contrat_menage" version={lireVersion(version)} />;
}
