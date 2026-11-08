import { PageDocument } from '@/components/legal/page-document';
import { lireVersion } from '@/lib/documents';

export const metadata = { title: 'Conditions d’utilisation (précollecteurs)' };

export default async function ConditionsPrecollecteurPage({ searchParams }: { searchParams: Promise<{ version?: string }> }) {
  const { version } = await searchParams;
  return <PageDocument type="cgu_precollecteur" version={lireVersion(version)} />;
}
