import { PageDocument } from '@/components/legal/page-document';
import { lireVersion } from '@/lib/documents';

export const metadata = { title: 'Charte du ménage' };

export default async function ChartePage({ searchParams }: { searchParams: Promise<{ version?: string }> }) {
  const { version } = await searchParams;
  return <PageDocument type="charte_menage" version={lireVersion(version)} />;
}
