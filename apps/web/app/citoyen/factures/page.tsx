import { FileText } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { EmptyState, PageHeader } from '@/components/ui/blocks';
import { getMonAbonnement } from '@/lib/client/context';
import { rows } from '@/lib/server';
import { dateFr, dateHeureFr, fcfa, isoJour, METHODES_PAIEMENT } from '@/lib/format';
import type { Facture, Paiement } from '@/lib/types';

export const metadata = { title: 'Mes factures' };

export default async function MesFacturesPage() {
  const { supabase, client, entreprise } = await getMonAbonnement();
  const [{ data: fa }, { data: pa }] = client
    ? await Promise.all([
        supabase.from('factures').select('*').eq('client_id', client.id).neq('statut', 'annulee').order('periode_debut', { ascending: false }),
        supabase.from('paiements_clients').select('*').eq('client_id', client.id).order('created_at', { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];
  const factures = rows<Facture>(fa);
  const paiements = rows<Paiement>(pa);
  const auj = isoJour();

  return (
    <PortalShell portalKey="citoyen" currentPath="/citoyen/factures" titre={client?.nom}>
      <PageHeader
        titre="Mes factures"
        sousTitre={entreprise ? `Réglez en espèces à ${entreprise.nom} ou par Mobile Money : chaque paiement apparaît ici.` : undefined}
      />
      {factures.length === 0 ? (
        <div className="card-soft">
          <EmptyState icon={FileText} titre="Aucune facture" texte="Votre première facture sera émise à la validation de votre abonnement." />
        </div>
      ) : (
        <ul className="space-y-3">
          {factures.map((f) => {
            const pf = paiements.filter((p) => p.facture_id === f.id);
            const recu = pf.filter((p) => (p.statut ?? 'valide') === 'valide').reduce((s, p) => s + p.montant_fcfa, 0);
            return (
              <li key={f.id} className="card-soft p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="num font-semibold text-brand-ink">{f.numero}</p>
                    <p className="text-small text-muted-foreground">{f.libelle}</p>
                  </div>
                  <div className="text-right">
                    <p className="num text-h2-sm font-bold text-brand-ink">{fcfa(f.montant_fcfa)}</p>
                    {f.statut === 'payee' ? (
                      <span className="chip-ok">Payée</span>
                    ) : f.echeance < auj ? (
                      <span className="chip-stop">En retard · reste {fcfa(f.montant_fcfa - recu)}</span>
                    ) : (
                      <span className="chip-relance">À régler avant le {dateFr(f.echeance)}</span>
                    )}
                  </div>
                </div>
                {pf.length > 0 && (
                  <ul className="mt-3 space-y-1 rounded-md bg-muted/50 px-3 py-2 text-small">
                    {pf.map((p) => (
                      <li key={p.id} className="flex justify-between gap-2">
                        <span>{dateHeureFr(p.created_at)} · {METHODES_PAIEMENT[p.methode] ?? p.methode}</span>
                        <span className="num font-semibold text-terrain-ok">
                          {fcfa(p.montant_fcfa)}
                          {p.statut === 'a_valider' && <span className="chip-relance ml-1">En attente de validation</span>}
                          {p.statut === 'rejete' && <span className="chip-stop ml-1">Non validé</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PortalShell>
  );
}
