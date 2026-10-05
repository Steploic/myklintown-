import { CheckCircle2, Clock, Link2, ShieldCheck, Smartphone, Wallet, XCircle } from 'lucide-react';
import { PrecoShell } from '@/components/precollecteur/shell';
import { EmptyState, PageHeader, Section } from '@/components/ui/blocks';
import { SubmitButton } from '@/components/ui/action-form';
import { requireEntreprise } from '@/lib/precollecteur/context';
import { activerPaiementEnLigneAction } from '@/lib/paiement/actions';
import { paiementEnLigneDisponible, rafraichirEtatCompte } from '@/lib/paiement/service';
import { CANAUX, type Canal } from '@/lib/paiement/regles';
import { parametre, rows } from '@/lib/server';
import { dateHeureFr, fcfa } from '@/lib/format';

export const metadata = { title: 'Paiement en ligne' };

const STATUT_TRANSACTION: Record<string, { label: string; chip: string }> = {
  initie: { label: 'Préparé', chip: 'chip-neutre' },
  en_attente: { label: 'En attente', chip: 'chip-relance' },
  reussi: { label: 'Payé', chip: 'chip-ok' },
  echoue: { label: 'Échoué', chip: 'chip-stop' },
  annule: { label: 'Annulé', chip: 'chip-neutre' },
  expire: { label: 'Expiré', chip: 'chip-neutre' },
};
const ORIGINE: Record<string, string> = { menage: 'Espace du ménage', lien: 'Lien WhatsApp', tournee: 'Pendant la tournée' };

/**
 * Ouverture du paiement en ligne pour le précollecteur : compte « connecté »
 * chez Notch Pay (vérification d'identité), l'argent arrive directement sur ce
 * compte, la commission MyKlinTown est prélevée à la source.
 */
export default async function PaiementEnLignePage({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const { erreur } = await searchParams;
  const { supabase, entreprise } = await requireEntreprise();
  const disponible = paiementEnLigneDisponible();
  let statut = entreprise.paiement_statut ?? 'inactif';
  if (disponible && statut === 'en_verification') {
    statut = (await rafraichirEtatCompte({ id: entreprise.id, paiement_compte_id: entreprise.paiement_compte_id ?? null, paiement_statut: statut })) as typeof statut;
  }
  const [taux, tx] = await Promise.all([
    parametre(supabase, 'commission_taux', 0.1),
    supabase
      .from('paiements_en_ligne')
      .select('id, created_at, montant_fcfa, commission_fcfa, canal, origine, statut, message, clients(nom)')
      .eq('entreprise_id', entreprise.id)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);
  const transactions = rows<{
    id: string; created_at: string; montant_fcfa: number; commission_fcfa: number; canal: Canal;
    origine: string; statut: string; message: string | null; clients: { nom: string } | null;
  }>(tx.data);
  const pct = `${Math.round(taux * 100)} %`;

  return (
    <PrecoShell path="/precollecteur/facturation">
      <PageHeader
        titre="Paiement en ligne"
        sousTitre="Vos clients paient par MTN Mobile Money ou Orange Money ; l’argent arrive directement sur votre compte."
        retour={{ href: '/precollecteur/facturation', label: 'Factures & relances' }}
      />

      {erreur && (
        <p role="alert" className="mb-4 rounded-md border border-terrain-stop/25 bg-terrain-stop/5 px-3 py-2 text-body-sm text-terrain-stop">{erreur}</p>
      )}

      {!disponible ? (
        <div className="card-soft mb-6">
          <EmptyState
            icon={Wallet}
            titre="Bientôt disponible"
            texte="Le paiement en ligne n’est pas encore ouvert sur MyKlinTown. En attendant, encaissez en espèces ou notez les paiements Mobile Money avec leur référence."
          />
        </div>
      ) : statut === 'actif' ? (
        <section className="mb-6 rounded-2xl border border-terrain-ok/25 bg-terrain-ok/5 p-5">
          <p className="flex items-center gap-2 text-h2-sm font-semibold text-terrain-ok"><CheckCircle2 size={20} /> Paiement en ligne actif</p>
          <ul className="mt-3 grid gap-2 text-body-sm sm:grid-cols-3">
            <li className="rounded-lg bg-surface p-3"><Smartphone size={16} className="mb-1 text-brand-blue" /> Vos clients paient depuis leur espace (« Mes factures »).</li>
            <li className="rounded-lg bg-surface p-3"><Link2 size={16} className="mb-1 text-brand-blue" /> Envoyez un lien de paiement depuis la fiche d’un client.</li>
            <li className="rounded-lg bg-surface p-3"><Wallet size={16} className="mb-1 text-brand-blue" /> En tournée : « Encaisser » → Mobile Money, le client valide sur son téléphone.</li>
          </ul>
          <p className="mt-3 text-small text-muted-foreground">
            Commission MyKlinTown de {pct} prélevée automatiquement sur chaque paiement ; le reste est versé sur votre compte Notch Pay.
          </p>
        </section>
      ) : (
        <section className="card-soft mb-6 p-5 sm:p-6">
          {statut === 'en_verification' ? (
            <p className="flex items-center gap-2 text-h2-sm font-semibold text-terrain-relance"><Clock size={20} /> Vérification en cours chez Notch Pay</p>
          ) : statut === 'refuse' ? (
            <p className="flex items-center gap-2 text-h2-sm font-semibold text-terrain-stop"><XCircle size={20} /> Vérification refusée par Notch Pay</p>
          ) : (
            <p className="flex items-center gap-2 text-h2-sm font-semibold text-brand-ink"><ShieldCheck size={20} /> Activer le paiement en ligne</p>
          )}
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-body-sm text-muted-foreground">
            <li>Votre compte de paiement est créé chez Notch Pay, au nom de votre entreprise.</li>
            <li>Notch Pay vérifie votre identité (pièce d’identité, coordonnées) : c’est la loi pour recevoir de l’argent.</li>
            <li>Ensuite, chaque paiement d’un client arrive sur ce compte, moins la commission MyKlinTown ({pct}).</li>
          </ol>
          <form action={activerPaiementEnLigneAction} className="mt-4">
            <SubmitButton pendingLabel="Ouverture…">
              <ShieldCheck size={16} /> {statut === 'inactif' ? 'Activer le paiement en ligne' : 'Continuer la vérification'}
            </SubmitButton>
          </form>
          {statut === 'refuse' && (
            <p className="mt-3 text-small text-muted-foreground">Corrigez les informations demandées par Notch Pay, ou contactez l’équipe MyKlinTown.</p>
          )}
        </section>
      )}

      <Section titre="Paiements en ligne récents" flush>
        {transactions.length === 0 ? (
          <EmptyState icon={Smartphone} titre="Aucun paiement en ligne pour l’instant" />
        ) : (
          <ul className="divide-y divide-border">
            {transactions.map((t) => {
              const st = STATUT_TRANSACTION[t.statut] ?? STATUT_TRANSACTION.initie!;
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-brand-ink">{t.clients?.nom ?? '—'}</span>
                    <span className="block text-small text-muted-foreground">
                      {dateHeureFr(t.created_at)} · {CANAUX[t.canal]?.court ?? t.canal} · {ORIGINE[t.origine] ?? t.origine}
                      {t.message && <> · {t.message}</>}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="num font-semibold">{fcfa(t.montant_fcfa)}</span>
                    <span className="text-small text-muted-foreground">dont commission {fcfa(t.commission_fcfa)}</span>
                    <span className={st.chip}>{st.label}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </PrecoShell>
  );
}
