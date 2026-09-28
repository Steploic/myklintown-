import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Logo } from '@myklintown/ui';
import { PrintButton } from '@/components/ui/print-button';
import { requireEntreprise } from '@/lib/precollecteur/context';
import { row } from '@/lib/server';
import { qrSvg } from '@/lib/qr';
import { telLisible } from '@/lib/format';

export const metadata = { title: 'Étiquette QR' };

/** Étiquette à coller au portail du foyer : le précollecteur la scanne à chaque passage. */
export default async function EtiquettePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, entreprise } = await requireEntreprise();
  const { data } = await supabase
    .from('clients')
    .select('id, nom, code, quartier')
    .eq('id', id)
    .eq('entreprise_id', entreprise.id)
    .maybeSingle();
  const client = row<{ id: string; nom: string; code: string; quartier: string | null }>(data);
  if (!client) notFound();
  const qr = await qrSvg(client.code);

  return (
    <div className="min-h-screen bg-muted px-4 py-8 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-6 flex max-w-sm items-center justify-between">
        <Link href={`/precollecteur/clients/${client.id}`} className="btn-ghost">← Retour</Link>
        <PrintButton />
      </div>
      <article className="mx-auto w-[9.5cm] overflow-hidden rounded-2xl border-2 border-brand-ink bg-white shadow-elevated print:shadow-none">
        <header className="flex items-center justify-between bg-brand-gradient-ink px-4 py-3 text-white">
          <Logo size={24} variant="bare" />
          <span className="text-small font-semibold uppercase tracking-wider text-brand-leaf">Foyer abonné</span>
        </header>
        <div className="px-5 pb-5 pt-4 text-center">
          <div className="mx-auto w-[6cm]" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="num mt-2 text-[1.35rem] font-bold tracking-[0.12em] text-brand-ink">{client.code}</p>
          <p className="mt-1 font-semibold text-brand-ink">{client.nom}</p>
          {client.quartier && <p className="text-small text-muted-foreground">{client.quartier}</p>}
          <div className="mt-3 rounded-lg bg-brand-green/10 px-3 py-2 text-small text-terrain-ok">
            Collecte assurée par <strong>{entreprise.nom}</strong>
            {entreprise.telephone && <span className="block">{telLisible(entreprise.telephone)}</span>}
          </div>
        </div>
      </article>
    </div>
  );
}
