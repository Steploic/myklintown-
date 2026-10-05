import { Banknote, History } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { EmptyState, PageHeader, Section } from '@/components/ui/blocks';
import { CarteTournee } from '@/components/employe/carte-tournee';
import { requireEmploye } from '@/lib/employe/context';
import { tourneesDeLEquipe } from '@/lib/employe/donnees';
import { rows } from '@/lib/server';
import { CATEGORIES_INCIDENT, dateHeureFr, fcfa, STATUT_INCIDENT } from '@/lib/format';

export const metadata = { title: 'Historique' };

const STATUT_ESPECES: Record<string, { label: string; chip: string }> = {
  a_valider: { label: 'À valider', chip: 'chip-relance' },
  valide: { label: 'Validé', chip: 'chip-ok' },
  rejete: { label: 'Rejeté', chip: 'chip-stop' },
};

/** Ce que l'équipe a fait : tournées passées, espèces remises, incidents déclarés. */
export default async function HistoriqueEmploye() {
  const { supabase, user, employe, entreprise } = await requireEmploye();
  const [passees, pa, inc] = await Promise.all([
    tourneesDeLEquipe(supabase, 'passees', 40),
    supabase
      .from('paiements_clients')
      .select('id, montant_fcfa, statut, created_at, clients(nom)')
      .eq('encaisse_par', employe.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('incidents_precollecte')
      .select('id, categorie, description, statut, created_at')
      .eq('auteur_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);
  const especes = rows<{ id: string; montant_fcfa: number; statut: string; created_at: string; clients: { nom: string } | null }>(pa.data);
  const incidents = rows<{ id: string; categorie: string; description: string | null; statut: string; created_at: string }>(inc.data);

  return (
    <PortalShell portalKey="employe" currentPath="/employe/historique" titre={entreprise.nom}>
      <PageHeader titre="Historique" sousTitre="Les tournées de votre équipe, vos encaissements et vos déclarations." />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Section titre="Tournées passées">
          {passees.length === 0 ? (
            <EmptyState icon={History} titre="Aucune tournée terminée" texte="Vos tournées terminées s’afficheront ici." />
          ) : (
            <div className="space-y-3">
              {passees.map((t) => (
                <CarteTournee key={t.id} t={t} />
              ))}
            </div>
          )}
        </Section>

        <div className="space-y-6">
          <Section titre="Mes encaissements" sousTitre="Espèces reçues sur le terrain" flush>
            {especes.length === 0 ? (
              <EmptyState icon={Banknote} titre="Aucun encaissement" />
            ) : (
              <ul className="divide-y divide-border">
                {especes.map((p) => {
                  const st = STATUT_ESPECES[p.statut] ?? STATUT_ESPECES.valide!;
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-brand-ink">{p.clients?.nom ?? '—'}</span>
                        <span className="block text-small text-muted-foreground">{dateHeureFr(p.created_at)}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="num font-semibold">{fcfa(p.montant_fcfa)}</span>
                        <span className={st.chip}>{st.label}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section titre="Mes incidents déclarés" flush>
            {incidents.length === 0 ? (
              <EmptyState icon={History} titre="Aucun incident déclaré" />
            ) : (
              <ul className="divide-y divide-border">
                {incidents.map((i) => {
                  const st = STATUT_INCIDENT[i.statut] ?? STATUT_INCIDENT.ouvert!;
                  return (
                    <li key={i.id} className="px-5 py-3">
                      <p className="flex items-center justify-between gap-2">
                        <span className="font-medium text-brand-ink">{CATEGORIES_INCIDENT[i.categorie] ?? i.categorie}</span>
                        <span className={st.chip}>{st.label}</span>
                      </p>
                      {i.description && <p className="text-small text-muted-foreground">{i.description}</p>}
                      <p className="text-small text-muted-foreground">{dateHeureFr(i.created_at)}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </PortalShell>
  );
}
