import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PrintButton } from '@/components/ui/print-button';
import { DocumentFacture } from '@/components/facture/document-facture';
import { getMonAbonnement } from '@/lib/client/context';
import { row, rows } from '@/lib/server';
import { nomFichier } from '@/lib/format';
import type { Facture, Paiement } from '@/lib/types';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, client } = await getMonAbonnement();
  if (!client) return { title: 'Facture' };
  const { data } = await supabase.from('factures').select('numero, statut, created_at').eq('id', id).eq('client_id', client.id).maybeSingle();
  const f = data as { numero: string; statut: string; created_at: string } | null;
  if (!f) return { title: 'Facture' };
  const type = f.statut === 'payee' ? 'Reçu' : 'Facture';
  return { title: { absolute: `${type}_${f.numero}_${nomFichier(client.nom)}_${f.created_at.slice(0, 10)}` } };
}

/** Facture ou reçu du ménage, tel qu'émis par son précollecteur, imprimable. */
export default async function MaFacturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, client, entreprise } = await getMonAbonnement();
  if (!client) notFound();
  const { data } = await supabase.from('factures').select('*').eq('id', id).eq('client_id', client.id).maybeSingle();
  const f = row<Facture>(data);
  if (!f) notFound();
  const { data: pd } = await supabase.from('paiements_clients').select('*').eq('facture_id', id).order('created_at');

  return (
    <div className="min-h-screen bg-muted px-4 py-8 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-6 flex max-w-2xl items-center justify-between gap-3">
        <Link href="/citoyen/factures" className="btn-ghost">← Mes factures</Link>
        <PrintButton label={f.statut === 'payee' ? 'Imprimer le reçu' : 'Imprimer la facture'} />
      </div>
      <DocumentFacture
        facture={f}
        paiements={rows<Paiement>(pd)}
        secours={{
          emetteur: { nom: entreprise?.nom ?? 'Votre précollecteur', telephone: entreprise?.telephone },
          destinataire: { nom: client.nom, code: client.code, telephone: client.telephone, adresse: client.adresse, quartier: client.quartier },
        }}
      />
    </div>
  );
}
