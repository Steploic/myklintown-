import Link from 'next/link';
import { Banknote, CalendarClock, Check, CheckCircle2, FileText, Hourglass, Receipt, Smartphone, Wand2, X } from 'lucide-react';
import { cn } from '@myklintown/ui';
import { PrecoShell } from '@/components/precollecteur/shell';
import { EmptyState, Kpi, PageHeader } from '@/components/ui/blocks';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { RelanceButtons } from '@/components/precollecteur/relance-buttons';
import { PaiementForm } from '@/components/precollecteur/facture-bits';
import { requireEntreprise } from '@/lib/precollecteur/context';
import { genererFacturesAction, validerPaiementAction } from '@/lib/precollecteur/actions';
import { parametre, rows } from '@/lib/server';
import {
  dateFr,
  dateHeureFr,
  fcfa,
  isoJour,
  joursEntre,
  messageEcheance,
  messageRelance,
  METHODES_PAIEMENT,
  niveauRelance,
  NIVEAUX_RELANCE,
  nombre,
} from '@/lib/format';
import type { ClientStatut, Facture, Paiement } from '@/lib/types';

export const metadata = { title: 'Factures & relances' };

const ONGLETS = [
  { cle: 'recouvrement', label: 'Recouvrement' },
  { cle: 'echeances', label: 'Échéances' },
  { cle: 'factures', label: 'Factures en attente' },
  { cle: 'paiements', label: 'Journal des paiements' },
] as const;

type FactureClient = Facture & { clients: { id: string; nom: string; telephone: string | null; code: string } };

export default async function FacturationPage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string }>;
}) {
  const { onglet = 'recouvrement' } = await searchParams;
  const { supabase, entreprise } = await requireEntreprise();
  const auj = isoJour();
  const debutMois = auj.slice(0, 8) + '01';

  const [fa, pa, re, cl, em, taux] = await Promise.all([
    supabase
      .from('factures')
      .select('*, clients(id, nom, telephone, code)')
      .eq('entreprise_id', entreprise.id)
      .eq('statut', 'emise')
      .order('echeance'),
    supabase
      .from('paiements_clients')
      .select('*, clients(nom), factures(numero)')
      .eq('entreprise_id', entreprise.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('relances')
      .select('facture_id, client_id, canal, niveau, created_at')
      .eq('entreprise_id', entreprise.id)
      .order('created_at', { ascending: false })
      .limit(300),
    supabase
      .from('v_clients_statut')
      .select('id, nom, telephone, plan_prix, couverture_fin, statut_abonnement, statut, nb_impayees')
      .eq('entreprise_id', entreprise.id)
      .eq('statut', 'actif'),
    supabase.from('employes').select('id, nom, actif').eq('entreprise_id', entreprise.id),
    parametre(supabase, 'commission_taux', 0.1),
  ]);

  const factures = rows<FactureClient>(fa.data);
  const paiements = rows<Paiement & { clients: { nom: string } | null; factures: { numero: string } | null }>(pa.data);
  const relances = rows<{ facture_id: string | null; client_id: string; canal: string; niveau: number; created_at: string }>(re.data);
  const clients = rows<Pick<ClientStatut, 'id' | 'nom' | 'telephone' | 'plan_prix' | 'couverture_fin' | 'statut_abonnement' | 'statut' | 'nb_impayees'>>(cl.data);
  const tousEmployes = rows<{ id: string; nom: string; actif: boolean }>(em.data);
  const employes = tousEmployes.filter((e) => e.actif);
  const nomEmploye = new Map(tousEmployes.map((e) => [e.id, e.nom]));
  // Espèces reçues sur le terrain par un employé : à valider avant de compter.
  const aValider = paiements.filter((p) => p.statut === 'a_valider');
  const valides = paiements.filter((p) => (p.statut ?? 'valide') === 'valide');

  const factureIds = factures.map((f) => f.id);
  const { data: pf } = factureIds.length
    ? await supabase.from('paiements_clients').select('facture_id, montant_fcfa').in('facture_id', factureIds).eq('statut', 'valide')
    : { data: [] };
  const deja = new Map<string, number>();
  for (const p of rows<{ facture_id: string; montant_fcfa: number }>(pf)) {
    deja.set(p.facture_id, (deja.get(p.facture_id) ?? 0) + p.montant_fcfa);
  }
  const reste = (f: Facture) => Math.max(0, f.montant_fcfa - (deja.get(f.id) ?? 0));

  const enRetard = factures.filter((f) => f.echeance < auj);
  const totalRetard = enRetard.reduce((s, f) => s + reste(f), 0);
  const totalAttente = factures.reduce((s, f) => s + reste(f), 0);
  const aEcheance = clients.filter(
    (c) => c.statut_abonnement === 'echeance_proche' || c.statut_abonnement === 'expire' || c.statut_abonnement === 'sans_facture',
  );
  const encaisseMois = valides.filter((p) => p.created_at.slice(0, 10) >= debutMois).reduce((s, p) => s + p.montant_fcfa, 0);
  const derniereRelance = (fid: string) => relances.find((r) => r.facture_id === fid);

  return (
    <PrecoShell path="/precollecteur/facturation">
      <PageHeader
        titre="Factures & relances"
        sousTitre="Paiement avant service : un client impayé apparaît en rouge au scan."
        actions={
          <>
            <Link href="/precollecteur/paiement-en-ligne" className="btn-outline">
              <Smartphone size={16} /> Paiement en ligne
              {entreprise.paiement_statut === 'actif' && <span className="chip-ok ml-1">actif</span>}
            </Link>
            <ActionForm action={genererFacturesAction}>
              <SubmitButton variant="secondary" pendingLabel="Facturation…">
                <Wand2 size={16} /> Facturer les échéances
              </SubmitButton>
            </ActionForm>
          </>
        }
      />

      {aValider.length > 0 && (
        <section className="mb-6 rounded-2xl border border-terrain-relance/30 bg-terrain-relance/5 p-4 sm:p-5" aria-labelledby="especes-a-valider">
          <h2 id="especes-a-valider" className="flex items-center gap-2 text-h2-sm font-semibold text-brand-ink">
            <Hourglass size={18} className="text-terrain-relance" /> Espèces à valider ({aValider.length})
          </h2>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Reçues sur le terrain par votre équipe. Elles ne règlent la facture qu’une fois validées, quand vous avez l’argent en main.
          </p>
          <ul className="mt-3 space-y-2">
            {aValider.map((p) => (
              <li key={p.id} className="card-soft flex flex-wrap items-center justify-between gap-3 p-3.5">
                <span className="min-w-0">
                  <Link href={`/precollecteur/clients/${p.client_id}`} className="block truncate font-semibold text-brand-ink">{p.clients?.nom ?? '—'}</Link>
                  <span className="block text-small text-muted-foreground">
                    {dateHeureFr(p.created_at)} · reçu par {(p.encaisse_par && nomEmploye.get(p.encaisse_par)) || 'un employé'} · facture {p.factures?.numero ?? '—'}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="num font-semibold">{fcfa(p.montant_fcfa)}</span>
                  <form action={validerPaiementAction}>
                    <input type="hidden" name="paiement_id" value={p.id} />
                    <input type="hidden" name="decision" value="rejeter" />
                    <SubmitButton variant="outline" pendingLabel="…"><X size={16} /> Rejeter</SubmitButton>
                  </form>
                  <form action={validerPaiementAction}>
                    <input type="hidden" name="paiement_id" value={p.id} />
                    <input type="hidden" name="decision" value="valider" />
                    <SubmitButton pendingLabel="…"><Check size={16} /> Valider</SubmitButton>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="En retard" valeur={nombre(enRetard.length)} detail={fcfa(totalRetard)} ton="stop" icon={Receipt} />
        <Kpi label="En attente (total)" valeur={nombre(factures.length)} detail={fcfa(totalAttente)} ton="relance" icon={FileText} />
        <Kpi label="À échéance" valeur={nombre(aEcheance.length)} detail="abonnements à renouveler" ton="info" icon={CalendarClock} />
        <Kpi
          label="Encaissé ce mois"
          valeur={fcfa(encaisseMois)}
          detail={`dont commission ${Math.round(taux * 100)} % : ${fcfa(encaisseMois * taux)}`}
          ton="ok"
          icon={Banknote}
        />
      </div>

      <nav className="-mx-4 mt-6 flex gap-1 overflow-x-auto border-b border-border px-4 lg:mx-0 lg:px-0" aria-label="Onglets">
        {ONGLETS.map((o) => (
          <Link
            key={o.cle}
            href={`/precollecteur/facturation?onglet=${o.cle}`}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-3 py-2.5 text-body-sm font-semibold',
              onglet === o.cle ? 'border-brand-green text-brand-ink' : 'border-transparent text-muted-foreground hover:text-brand-ink',
            )}
          >
            {o.label}
          </Link>
        ))}
      </nav>

      <div className="mt-5">
        {onglet === 'recouvrement' &&
          (enRetard.length === 0 ? (
            <div className="card-soft">
              <EmptyState icon={CheckCircle2} titre="Aucun impayé en retard" texte="Tous vos clients facturés ont réglé dans les délais." />
            </div>
          ) : (
            <>
              <p className="mb-3 text-body-sm text-muted-foreground">
                Classement automatique par ancienneté : <strong>rappel</strong> jusqu’à 7 jours de retard,{' '}
                <strong>relance</strong> jusqu’à 21 jours, puis <strong>mise en demeure</strong> avec suspension du service.
              </p>
              <ul className="space-y-3">
                {enRetard.map((f) => {
                  const retard = joursEntre(f.echeance, auj);
                  const niveau = niveauRelance(retard);
                  const r = derniereRelance(f.id);
                  return (
                    <li key={f.id} className="card-soft p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link href={`/precollecteur/clients/${f.clients.id}`} className="font-semibold text-brand-ink hover:text-brand-green">
                            {f.clients.nom}
                          </Link>
                          <p className="text-small text-muted-foreground">
                            {f.numero} · échue le {dateFr(f.echeance)} · <strong className="text-terrain-stop">{retard} j de retard</strong>
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={NIVEAUX_RELANCE[niveau].chip}>{NIVEAUX_RELANCE[niveau].label}</span>
                          <span className="num text-h2-sm font-bold text-terrain-stop">{fcfa(reste(f))}</span>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-start gap-2">
                        <RelanceButtons
                          clientId={f.clients.id}
                          factureId={f.id}
                          telephone={f.clients.telephone}
                          niveau={niveau}
                          message={messageRelance({ niveau, client: f.clients.nom, montant: reste(f), entreprise: entreprise.nom, numero: f.numero, echeance: f.echeance })}
                          derniere={r ? `${r.canal} · ${dateHeureFr(r.created_at)}` : null}
                        />
                      </div>
                      <div className="mt-3">
                        <PaiementForm factureId={f.id} resteDu={reste(f)} employes={employes} compact />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          ))}

        {onglet === 'echeances' &&
          (aEcheance.length === 0 ? (
            <div className="card-soft">
              <EmptyState icon={CalendarClock} titre="Aucune échéance dans les 7 jours" texte="Les rappels apparaîtront ici une semaine avant la fin de chaque abonnement." />
            </div>
          ) : (
            <ul className="space-y-3">
              {aEcheance.map((c) => (
                <li key={c.id} className="card-soft flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <Link href={`/precollecteur/clients/${c.id}`} className="font-semibold text-brand-ink hover:text-brand-green">{c.nom}</Link>
                    <p className="text-small text-muted-foreground">
                      {c.couverture_fin ? `Couvert jusqu’au ${dateFr(c.couverture_fin)}` : 'Jamais facturé'}
                      {Number(c.nb_impayees) > 0 && ' · facture déjà émise'}
                    </p>
                  </div>
                  {c.couverture_fin && (
                    <RelanceButtons
                      clientId={c.id}
                      factureId={null}
                      telephone={c.telephone}
                      niveau={1}
                      message={messageEcheance({ client: c.nom, fin: c.couverture_fin, entreprise: entreprise.nom, prix: c.plan_prix })}
                    />
                  )}
                </li>
              ))}
            </ul>
          ))}

        {onglet === 'factures' &&
          (factures.length === 0 ? (
            <div className="card-soft">
              <EmptyState icon={FileText} titre="Aucune facture en attente" />
            </div>
          ) : (
            <>
            <ul className="space-y-2 md:hidden">
              {factures.map((f) => (
                <li key={f.id}>
                  <Link href={`/precollecteur/facturation/${f.id}`} className="card-soft flex items-center justify-between gap-3 p-3.5">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-brand-ink">{f.clients.nom}</span>
                      <span className="num block text-small text-muted-foreground">{f.numero} · {dateFr(f.periode_debut)} → {dateFr(f.periode_fin)}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="num font-semibold">{fcfa(reste(f))}</span>
                      <span className={f.echeance < auj ? 'chip-stop' : 'chip-relance'}>{dateFr(f.echeance)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="card-soft hidden overflow-x-auto md:block">
              <table className="table-data min-w-[640px]">
                <thead>
                  <tr>
                    <th>Facture</th>
                    <th>Client</th>
                    <th>Période</th>
                    <th>Échéance</th>
                    <th className="text-right">Reste dû</th>
                  </tr>
                </thead>
                <tbody>
                  {factures.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <Link href={`/precollecteur/facturation/${f.id}`} className="num font-semibold text-brand-blue hover:underline">{f.numero}</Link>
                      </td>
                      <td>
                        <Link href={`/precollecteur/clients/${f.clients.id}`} className="hover:text-brand-green">{f.clients.nom}</Link>
                      </td>
                      <td className="num text-muted-foreground">{dateFr(f.periode_debut)} → {dateFr(f.periode_fin)}</td>
                      <td>
                        <span className={f.echeance < auj ? 'chip-stop' : 'chip-relance'}>{dateFr(f.echeance)}</span>
                      </td>
                      <td className="num text-right font-semibold">{fcfa(reste(f))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          ))}

        {onglet === 'paiements' &&
          (paiements.length === 0 ? (
            <div className="card-soft">
              <EmptyState icon={Banknote} titre="Aucun paiement enregistré" />
            </div>
          ) : (
            <>
            <ul className="space-y-2 md:hidden">
              {paiements.map((p) => (
                <li key={p.id} className="card-soft flex items-center justify-between gap-3 p-3.5">
                  <span className="min-w-0">
                    <Link href={`/precollecteur/clients/${p.client_id}`} className="block truncate font-semibold text-brand-ink">{p.clients?.nom ?? '—'}</Link>
                    <span className="block text-small text-muted-foreground">
                      {dateHeureFr(p.created_at)} · {METHODES_PAIEMENT[p.methode] ?? p.methode}
                      {p.reference && <> · réf. {p.reference}</>}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`num font-semibold ${(p.statut ?? 'valide') === 'valide' ? 'text-terrain-ok' : 'text-muted-foreground line-through'}`}>{fcfa(p.montant_fcfa)}</span>
                    {p.statut === 'a_valider' && <span className="chip-relance">À valider</span>}
                    {p.statut === 'rejete' && <span className="chip-stop">Rejeté</span>}
                  </span>
                </li>
              ))}
            </ul>
            <div className="card-soft hidden overflow-x-auto md:block">
              <table className="table-data min-w-[640px]">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Client</th>
                    <th>Facture</th>
                    <th>Moyen</th>
                    <th className="text-right">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {paiements.map((p) => (
                    <tr key={p.id}>
                      <td className="num text-muted-foreground">{dateHeureFr(p.created_at)}</td>
                      <td>
                        <Link href={`/precollecteur/clients/${p.client_id}`} className="hover:text-brand-green">{p.clients?.nom ?? '—'}</Link>
                      </td>
                      <td>
                        <Link href={`/precollecteur/facturation/${p.facture_id}`} className="num text-brand-blue hover:underline">{p.factures?.numero ?? '—'}</Link>
                      </td>
                      <td>
                        {METHODES_PAIEMENT[p.methode] ?? p.methode}
                        {p.reference && <span className="block text-small text-muted-foreground">réf. {p.reference}</span>}
                      </td>
                      <td className="num text-right">
                        <span className={`font-semibold ${(p.statut ?? 'valide') === 'valide' ? 'text-terrain-ok' : 'text-muted-foreground line-through'}`}>{fcfa(p.montant_fcfa)}</span>
                        {p.statut === 'a_valider' && <span className="chip-relance ml-2">À valider</span>}
                        {p.statut === 'rejete' && <span className="chip-stop ml-2">Rejeté</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          ))}
      </div>
    </PrecoShell>
  );
}
