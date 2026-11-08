import { PageDocument } from '@/components/legal/page-document';
import { lireVersion } from '@/lib/documents';

export const metadata = { title: 'Charte du précollecteur' };

export default async function ChartePrecollecteurPage({ searchParams }: { searchParams: Promise<{ version?: string }> }) {
  const { version } = await searchParams;
  return <PageDocument type="charte_precollecteur" version={lireVersion(version)} />;
}
