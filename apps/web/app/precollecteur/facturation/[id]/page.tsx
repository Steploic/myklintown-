import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PrintButton } from '@/components/ui/print-button';
import { DocumentFacture } from '@/components/facture/document-facture';
import { requireEntreprise } from '@/lib/precollecteur/context';
import { row, rows } from '@/lib/server';
import { nomFichier } from '@/lib/format';
import type { Facture, Paiement } from '@/lib/types';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireEntreprise();
  const { data } = await supabase.from('factures').select('numero, statut, created_at, clients(nom)').eq('id', id).maybeSingle();
  const f = data as { numero: string; statut: string; created_at: string; clients: { nom: string } | null } | null;
  if (!f) return { title: 'Facture' };
  const type = f.statut === 'payee' ? 'Reçu' : 'Facture';
  return { title: { absolute: `${type}_${f.numero}_${nomFichier(f.clients?.nom ?? '')}_${f.created_at.slice(0, 10)}` } };
}

/** Facture / reçu imprimable (ou à enregistrer en PDF depuis le navigateur). */
export default async function FacturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, entreprise } = await requireEntreprise();
  const { data } = await supabase
    .from('factures')
    .select('*, clients(nom, code, telephone, adresse, quartier)')
    .eq('id', id)
    .eq('entreprise_id', entreprise.id)
    .maybeSingle();
  const f = row<Facture & { clients: { nom: string; code: string; telephone: string | null; adresse: string | null; quartier: string | null } }>(data);
  if (!f) notFound();
  const { data: pd } = await supabase.from('paiements_clients').select('*').eq('facture_id', id).order('created_at');
  const paiements = rows<Paiement>(pd);

  return (
    <div className="min-h-screen bg-muted px-4 py-8 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-6 flex max-w-2xl items-center justify-between gap-3">
        <Link href={`/precollecteur/clients/${f.client_id}`} className="btn-ghost">← Fiche client</Link>
        <PrintButton label={f.statut === 'payee' ? 'Imprimer le reçu' : 'Imprimer la facture'} />
      </div>
      <DocumentFacture
        facture={f}
        paiements={paiements}
        secours={{
          emetteur: { nom: entreprise.nom, siege: entreprise.siege, telephone: entreprise.telephone },
          destinataire: f.clients,
        }}
      />
    </div>
  );
}
