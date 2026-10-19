import { Logo } from '@myklintown/ui';
import { dateFr, dateHeureFr, fcfa, METHODES_PAIEMENT, telLisible } from '@/lib/format';
import { ANCIEN_NUMERO, tauxLisible } from '@/lib/facture';
import type { DestinataireFacture, EmetteurFacture, Facture, Paiement } from '@/lib/types';

/**
 * Facture / reçu imprimable, tel qu'émis : l'émetteur et le client sont lus
 * dans l'instantané pris à l'émission (pas dans leurs fiches actuelles), les
 * montants dans la ventilation enregistrée. Partagé par l'espace précollecteur
 * et l'espace ménage.
 *
 * `secours` : fiches actuelles, pour une base où la migration 20261019000014
 * (instantanés) n'a pas encore été jouée.
 */
export function DocumentFacture({
  facture: f,
  paiements,
  secours,
}: {
  facture: Facture;
  paiements: Paiement[];
  secours: { emetteur: EmetteurFacture; destinataire: DestinataireFacture };
}) {
  const em: EmetteurFacture = f.emetteur ?? secours.emetteur;
  const de: DestinataireFacture = f.destinataire ?? secours.destinataire;
  const annulee = f.statut === 'annulee';
  const recu = paiements.filter((p) => (p.statut ?? 'valide') === 'valide').reduce((s, p) => s + p.montant_fcfa, 0);
  const reste = annulee ? 0 : Math.max(0, f.montant_fcfa - recu);
  const taux = Number(f.tva_taux ?? 0);
  const ht = f.montant_ht_fcfa ?? f.montant_fcfa;
  const tva = f.montant_tva_fcfa ?? 0;
  const type = annulee ? 'Facture annulée' : f.statut === 'payee' ? 'Reçu de paiement' : 'Facture';
  const adresse = em.adresse_fiscale || [em.siege, em.commune].filter(Boolean).join(', ');

  return (
    <article className="impression-fidele relative mx-auto max-w-2xl overflow-hidden rounded-2xl bg-white p-6 shadow-elevated sm:p-8 print:max-w-none print:rounded-none print:shadow-none">
      {annulee && (
        <div aria-hidden className="pointer-events-none absolute inset-0 grid place-content-center">
          <span className="-rotate-[24deg] select-none rounded-xl border-[6px] border-terrain-stop/40 px-6 py-1 text-[3.25rem] font-black uppercase tracking-[0.2em] text-terrain-stop/30 sm:text-[4.5rem]">
            Annulée
          </span>
        </div>
      )}

      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-border pb-6">
        <div className="min-w-0 space-y-0.5 text-body-sm text-muted-foreground">
          <p className="text-h2 font-bold text-brand-ink">{em.nom}</p>
          {adresse && <p>{adresse}</p>}
          {em.telephone && <p>{telLisible(em.telephone)}</p>}
          {em.niu && <p className="num">NIU : {em.niu}</p>}
          {em.rccm && <p className="num">RCCM : {em.rccm}</p>}
        </div>
        <div className="sm:text-right">
          <p className={`text-small font-semibold uppercase tracking-wider ${annulee ? 'text-terrain-stop' : 'text-brand-green'}`}>{type}</p>
          <p className="num text-h2 font-bold text-brand-ink">{f.numero}</p>
          <p className="text-body-sm text-muted-foreground">Émise le {dateFr(f.created_at)}</p>
        </div>
      </header>

      {annulee && (
        <p className="mt-4 rounded-lg border border-terrain-stop/25 bg-terrain-stop/5 px-4 py-3 text-body-sm text-terrain-stop">
          Facture annulée{f.annulee_at ? ` le ${dateFr(f.annulee_at)}` : ''}
          {f.motif_annulation ? ` — motif : ${f.motif_annulation}` : ''}. Elle n’est plus due.
        </p>
      )}

      <section className="grid gap-6 py-6 sm:grid-cols-2">
        <div>
          <p className="text-small font-semibold uppercase tracking-wider text-muted-foreground">Client</p>
          <p className="font-semibold text-brand-ink">{de.nom}</p>
          <p className="text-body-sm text-muted-foreground">{[de.adresse, de.quartier].filter(Boolean).join(', ')}</p>
          <p className="num text-body-sm text-muted-foreground">
            Code {de.code}
            {de.telephone ? ` · ${telLisible(de.telephone)}` : ''}
          </p>
        </div>
        <div className="space-y-2 sm:text-right">
          <div>
            <p className="text-small font-semibold uppercase tracking-wider text-muted-foreground">Période couverte</p>
            <p className="font-semibold text-brand-ink">du {dateFr(f.periode_debut)} au {dateFr(f.periode_fin)}</p>
          </div>
          <div>
            <p className="text-small font-semibold uppercase tracking-wider text-muted-foreground">Échéance</p>
            <p className="font-semibold text-brand-ink">{dateFr(f.echeance)}</p>
          </div>
        </div>
      </section>

      <table className="w-full text-body-sm">
        <thead>
          <tr className="border-y border-border text-left text-small uppercase tracking-wider text-muted-foreground">
            <th className="py-2">Désignation</th>
            <th className="whitespace-nowrap py-2 text-right">Montant HT</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border">
            <td className="py-3 pr-3">{f.libelle ?? 'Abonnement de précollecte des déchets ménagers'}</td>
            <td className="num whitespace-nowrap py-3 text-right font-semibold">{fcfa(ht)}</td>
          </tr>
        </tbody>
        <tfoot className="[&_td:first-child]:pr-4">
          <tr>
            <td className="pt-3 text-right text-muted-foreground">Total HT</td>
            <td className="num whitespace-nowrap pt-3 text-right">{fcfa(ht)}</td>
          </tr>
          <tr>
            <td className="text-right text-muted-foreground">
              {taux > 0 ? `TVA ${tauxLisible(taux)}` : em.mention_tva || 'TVA'}
            </td>
            <td className="num whitespace-nowrap text-right">{fcfa(tva)}</td>
          </tr>
          <tr>
            <td className="pt-1 text-right font-semibold text-brand-ink">Total TTC</td>
            <td className="num whitespace-nowrap pt-1 text-right text-h2-sm font-bold text-brand-ink">{fcfa(f.montant_fcfa)}</td>
          </tr>
          {!annulee && (
            <>
              <tr>
                <td className="text-right text-muted-foreground">Déjà réglé</td>
                <td className="num whitespace-nowrap text-right text-terrain-ok">{fcfa(recu)}</td>
              </tr>
              <tr>
                <td className="text-right font-semibold">Reste à payer</td>
                <td className="num whitespace-nowrap text-right font-bold">{fcfa(reste)}</td>
              </tr>
            </>
          )}
        </tfoot>
      </table>

      {paiements.length > 0 && (
        <section className="mt-6 rounded-lg bg-muted/60 p-4 text-body-sm">
          <p className="mb-2 font-semibold text-brand-ink">Paiements reçus</p>
          <ul className="space-y-1">
            {paiements.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2">
                <span>
                  {dateHeureFr(p.created_at)} · {METHODES_PAIEMENT[p.methode] ?? p.methode}
                  {p.reference ? ` · réf. ${p.reference}` : ''}
                  {p.statut === 'a_valider' ? ' · en attente de validation' : p.statut === 'rejete' ? ' · non validé' : ''}
                </span>
                <span className="num font-semibold">{fcfa(p.montant_fcfa)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(em.mentions_legales || ANCIEN_NUMERO.test(f.numero)) && (
        <section className="mt-6 space-y-1 text-small text-muted-foreground">
          {em.mentions_legales && <p className="whitespace-pre-line">{em.mentions_legales}</p>}
          {ANCIEN_NUMERO.test(f.numero) && (
            <p>Numéro attribué avant la numérotation par émetteur (octobre 2026) : il reste valable.</p>
          )}
        </section>
      )}

      <footer className="mt-8 flex items-center justify-between gap-4 border-t border-border pt-4 text-small text-muted-foreground">
        <span>Document généré par MyKlinTown — tarif issu de la grille commune.</span>
        <Logo size={20} />
      </footer>
    </article>
  );
}
