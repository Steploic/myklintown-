import { ScrollText } from 'lucide-react';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { CaseDocuments } from '@/components/client/case-documents';
import { accepterDocumentsAction } from '@/lib/client/actions';
import { DOCUMENTS, type DocumentAAccepter } from '@/lib/documents';
import { getSupabase, rows, rpc } from '@/lib/server';

/**
 * Ménage déjà inscrit qui n'a pas accepté la charte ou le contrat en vigueur
 * (inscrit avant leur mise en place, ou nouvelle version publiée) : rappel NON
 * bloquant, avec l'acceptation sur place.
 */
export async function BandeauCharte() {
  const supabase = await getSupabase();
  const { data, error } = await rpc(supabase, 'documents_a_accepter');
  const docs = error ? [] : rows<DocumentAAccepter>(data);
  if (!docs.length) return null;
  const nouvelle = docs.some((d) => d.version > 1);
  return (
    <section className="mb-5 rounded-lg border border-brand-blue/20 bg-brand-blue/5 px-4 py-3 text-body-sm">
      <p className="flex items-start gap-2 font-semibold text-brand-blue">
        <ScrollText size={18} className="mt-0.5 shrink-0" />
        {nouvelle ? 'Nouvelle version à lire et accepter : ' : 'À lire et accepter : '}
        {docs.map((d) => DOCUMENTS[d.type]?.libelle ?? d.titre).join(' et ')}
        {docs.every((d) => d.provisoire) ? ' (version provisoire)' : ''}.
      </p>
      <p className="mt-1 text-muted-foreground">Votre abonnement continue en attendant : prenez le temps de les lire.</p>
      <ActionForm action={accepterDocumentsAction} className="mt-3 space-y-3">
        {docs.map((d) => (
          <input key={d.type} type="hidden" name="type" value={d.type} />
        ))}
        <CaseDocuments id="bandeau-documents" />
        <SubmitButton variant="secondary" pendingLabel="Enregistrement…">J’accepte</SubmitButton>
      </ActionForm>
    </section>
  );
}
