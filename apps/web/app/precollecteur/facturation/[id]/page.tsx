import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Logo } from '@myklintown/ui';
import { PrintButton } from '@/components/ui/print-button';
import { requireEntreprise } from '@/lib/precollecteur/context';
import { row, rows } from '@/lib/server';
import { dateFr, dateHeureFr, fcfa, METHODES_PAIEMENT, nomFichier, telLisible } from '@/lib/format';
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
  const recu = paiements.reduce((s, p) => s + p.montant_fcfa, 0);
  const reste = Math.max(0, f.montant_fcfa - recu);

  return (
    <div className="min-h-screen bg-muted px-4 py-8 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-6 flex max-w-2xl items-center justify-between">
        <Link href={`/precollecteur/clients/${f.client_id}`} className="btn-ghost">← Fiche client</Link>
        <PrintButton label={f.statut === 'payee' ? 'Imprimer le reçu' : 'Imprimer la facture'} />
      </div>
      <article className="impression-fidele mx-auto max-w-2xl rounded-2xl bg-white p-8 shadow-elevated print:max-w-none print:rounded-none print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-border pb-6">
          <div>
            <p className="text-h2 font-bold text-brand-ink">{entreprise.nom}</p>
            <p className="text-body-sm text-muted-foreground">{entreprise.siege}</p>
            {entreprise.telephone && <p className="text-body-sm text-muted-foreground">{telLisible(entreprise.telephone)}</p>}
          </div>
          <div className="text-right">
            <p className="text-small font-semibold uppercase tracking-wider text-brand-green">
              {f.statut === 'payee' ? 'Reçu de paiement' : f.statut === 'annulee' ? 'Facture annulée' : 'Facture'}
            </p>
            <p className="num text-h2 font-bold text-brand-ink">{f.numero}</p>
            <p className="text-body-sm text-muted-foreground">Émise le {dateFr(f.created_at)}</p>
          </div>
        </header>

        <section className="grid gap-6 py-6 sm:grid-cols-2">
          <div>
            <p className="text-small font-semibold uppercase tracking-wider text-muted-foreground">Client</p>
            <p className="font-semibold text-brand-ink">{f.clients.nom}</p>
            <p className="text-body-sm text-muted-foreground">{[f.clients.adresse, f.clients.quartier].filter(Boolean).join(', ')}</p>
            <p className="num text-body-sm text-muted-foreground">Code {f.clients.code} · {telLisible(f.clients.telephone)}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-small font-semibold uppercase tracking-wider text-muted-foreground">Échéance</p>
            <p className="font-semibold text-brand-ink">{dateFr(f.echeance)}</p>
          </div>
        </section>

        <table className="w-full text-body-sm">
          <thead>
            <tr className="border-y border-border text-left text-small uppercase tracking-wider text-muted-foreground">
              <th className="py-2">Désignation</th>
              <th className="py-2 text-right">Montant</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border">
              <td className="py-3">{f.libelle ?? 'Abonnement de précollecte des déchets ménagers'}</td>
              <td className="num py-3 text-right font-semibold">{fcfa(f.montant_fcfa)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-3 text-right text-muted-foreground">Total</td>
              <td className="num pt-3 text-right text-h2-sm font-bold text-brand-ink">{fcfa(f.montant_fcfa)}</td>
            </tr>
            <tr>
              <td className="text-right text-muted-foreground">Déjà réglé</td>
              <td className="num text-right text-terrain-ok">{fcfa(recu)}</td>
            </tr>
            <tr>
              <td className="text-right font-semibold">Reste à payer</td>
              <td className="num text-right font-bold">{fcfa(reste)}</td>
            </tr>
          </tfoot>
        </table>

        {paiements.length > 0 && (
          <section className="mt-6 rounded-lg bg-muted/60 p-4 text-body-sm">
            <p className="mb-2 font-semibold text-brand-ink">Paiements reçus</p>
            <ul className="space-y-1">
              {paiements.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span>{dateHeureFr(p.created_at)} · {METHODES_PAIEMENT[p.methode] ?? p.methode}{p.reference ? ` · réf. ${p.reference}` : ''}</span>
                  <span className="num font-semibold">{fcfa(p.montant_fcfa)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-8 flex items-center justify-between gap-4 border-t border-border pt-4 text-small text-muted-foreground">
          <span>Document généré par MyKlinTown — tarif issu de la grille commune.</span>
          <Logo size={20} />
        </footer>
      </article>
    </div>
  );
}
