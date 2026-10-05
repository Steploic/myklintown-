import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarCheck, CheckCircle2, FileText, MapPin, Pencil, Printer, Receipt, UserCheck } from 'lucide-react';
import { PrecoShell } from '@/components/precollecteur/shell';
import { PageHeader, Section } from '@/components/ui/blocks';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { ClientFields } from '@/components/precollecteur/client-fields';
import { PaiementForm } from '@/components/precollecteur/facture-bits';
import { RelanceButtons } from '@/components/precollecteur/relance-buttons';
import { Preuve } from '@/components/ui/preuve';
import { requireEntreprise } from '@/lib/precollecteur/context';
import {
  annulerFactureAction,
  changerStatutClientAction,
  emettreFactureAction,
  majClientAction,
} from '@/lib/precollecteur/actions';
import { row, rows } from '@/lib/server';
import { qrSvg } from '@/lib/qr';
import { urlsPreuves } from '@/lib/preuves';
import {
  CATEGORIES_INCIDENT,
  dateFr,
  dateHeureFr,
  fcfa,
  isoJour,
  joursEntre,
  messageEcheance,
  messageRelance,
  METHODES_PAIEMENT,
  niveauRelance,
  STATUT_COLLECTE,
  STATUT_INCIDENT,
  statutAbonnement,
  telLisible,
} from '@/lib/format';
import type { ClientStatut, Collecte, Facture, Incident, Paiement, Plan, Zone } from '@/lib/types';

export const metadata = { title: 'Fiche client' };

export default async function FicheClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cree?: string; pris?: string }>;
}) {
  const { id } = await params;
  const { cree, pris } = await searchParams;
  const { supabase, entreprise } = await requireEntreprise();

  const { data: c } = await supabase
    .from('v_clients_statut')
    .select('*')
    .eq('id', id)
    .eq('entreprise_id', entreprise.id)
    .maybeSingle();
  const client = row<ClientStatut>(c);
  if (!client) notFound();

  const [fa, pa, co, inc, re, em, pl, za] = await Promise.all([
    supabase.from('factures').select('*').eq('client_id', id).order('periode_debut', { ascending: false }),
    supabase.from('paiements_clients').select('*').eq('client_id', id).order('created_at', { ascending: false }),
    supabase.from('collectes').select('*').eq('client_id', id).order('date_prevue', { ascending: false }).limit(30),
    supabase.from('incidents_precollecte').select('*').eq('client_id', id).order('created_at', { ascending: false }),
    supabase.from('relances').select('canal, niveau, created_at').eq('client_id', id).order('created_at', { ascending: false }).limit(5),
    supabase.from('employes').select('id, nom').eq('entreprise_id', entreprise.id).eq('actif', true),
    supabase.from('plans_tarifaires').select('*').eq('actif', true).order('ordre'),
    supabase.from('zone_affectations').select('zones(*)').eq('entreprise_id', entreprise.id),
  ]);
  const factures = rows<Facture>(fa.data);
  const paiements = rows<Paiement>(pa.data);
  const collectes = rows<Collecte>(co.data);
  const incidents = rows<Incident>(inc.data);
  const relances = rows<{ canal: string; niveau: number; created_at: string }>(re.data);
  const employes = rows<{ id: string; nom: string }>(em.data);
  const plans = rows<Plan>(pl.data);
  const zones = rows<{ zones: Zone | null }>(za.data).map((a) => a.zones).filter((z): z is Zone => !!z);
  const nomEmploye = new Map(employes.map((e) => [e.id, e.nom]));
  const urls = await urlsPreuves(supabase, incidents.map((i) => i.media_path));
  const qr = await qrSvg(client.code);

  const s = statutAbonnement(client.statut_abonnement);
  const auj = isoJour();
  const payeParFacture = (fid: string) => paiements.filter((p) => p.facture_id === fid).reduce((t, p) => t + p.montant_fcfa, 0);
  const enAttente = factures.filter((f) => f.statut === 'emise');
  const realisees = collectes.filter((x) => x.statut === 'realisee').length;

  return (
    <PrecoShell path="/precollecteur/clients">
      <PageHeader
        titre={client.nom}
        sousTitre={
          <span className="flex flex-wrap items-center gap-2">
            <span className={s.chip}>{s.label}</span>
            <span className="num">{client.code}</span>
            {client.est_demo && <span className="chip-neutre">démo</span>}
          </span>
        }
        retour={{ href: '/precollecteur/clients', label: 'Clients' }}
      />

      {pris && (
        <p className="mb-5 flex items-center gap-2 rounded-lg border border-terrain-ok/25 bg-terrain-ok/5 px-4 py-3 text-body-sm font-medium text-terrain-ok">
          <CheckCircle2 size={18} /> Demande prise en charge : ce ménage est votre client et sa première facture est émise. Appelez-le pour convenir du premier passage.
        </p>
      )}
      {cree && (
        <p className="mb-5 flex items-center gap-2 rounded-lg border border-terrain-ok/25 bg-terrain-ok/5 px-4 py-3 text-body-sm font-medium text-terrain-ok">
          <CheckCircle2 size={18} /> Client enregistré. Imprimez son QR code pour le coller à son portail.
        </p>
      )}

      {client.statut === 'demande' && (
        <section className="mb-6 rounded-xl border border-brand-green/30 bg-brand-green/5 p-5">
          <h2 className="flex items-center gap-2"><UserCheck size={20} className="text-brand-green" /> Demande d’abonnement en ligne</h2>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Ce ménage s’est inscrit depuis l’application en choisissant la formule <strong>{client.plan_nom}</strong>.
            Accepter ouvre son abonnement et émet sa première facture.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={changerStatutClientAction}>
              <input type="hidden" name="client_id" value={client.id} />
              <input type="hidden" name="statut" value="actif" />
              <SubmitButton pendingLabel="Validation…">Accepter le client</SubmitButton>
            </form>
            <form action={changerStatutClientAction}>
              <input type="hidden" name="client_id" value={client.id} />
              <input type="hidden" name="statut" value="resilie" />
              <SubmitButton variant="outline" pendingLabel="…">Refuser</SubmitButton>
            </form>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {/* Abonnement */}
          <Section titre="Abonnement" sousTitre={client.plan_nom ? `${client.plan_nom} · ${fcfa(client.plan_prix)}` : 'Aucune formule'}>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-small text-muted-foreground">Couvert jusqu’au</dt>
                <dd className="num font-semibold text-brand-ink">{dateFr(client.couverture_fin)}</dd>
              </div>
              <div>
                <dt className="text-small text-muted-foreground">Reste dû</dt>
                <dd className={`num font-semibold ${Number(client.montant_impaye) > 0 ? 'text-terrain-stop' : 'text-brand-ink'}`}>{fcfa(client.montant_impaye)}</dd>
              </div>
              <div>
                <dt className="text-small text-muted-foreground">Collectes réalisées</dt>
                <dd className="num font-semibold text-brand-ink">{realisees} / {collectes.length}</dd>
              </div>
              <div>
                <dt className="text-small text-muted-foreground">Client depuis</dt>
                <dd className="num font-semibold text-brand-ink">{dateFr(client.created_at)}</dd>
              </div>
            </dl>

            {client.statut_abonnement === 'echeance_proche' && client.couverture_fin && (
              <div className="mt-4 rounded-lg bg-terrain-relance/5 p-3">
                <p className="mb-2 text-body-sm font-semibold text-terrain-relance">Rappel d’échéance à envoyer</p>
                <RelanceButtons
                  clientId={client.id}
                  factureId={null}
                  telephone={client.telephone}
                  niveau={1}
                  message={messageEcheance({ client: client.nom, fin: client.couverture_fin, entreprise: entreprise.nom, prix: client.plan_prix })}
                />
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
              {client.statut === 'actif' && enAttente.length === 0 && (
                <ActionForm action={emettreFactureAction}>
                  <input type="hidden" name="client_id" value={client.id} />
                  <SubmitButton variant="secondary" pendingLabel="Émission…">
                    <Receipt size={16} /> Facturer la période suivante
                  </SubmitButton>
                </ActionForm>
              )}
              {client.statut === 'actif' && (
                <form action={changerStatutClientAction}>
                  <input type="hidden" name="client_id" value={client.id} />
                  <input type="hidden" name="statut" value="suspendu" />
                  <SubmitButton variant="outline" pendingLabel="…">Suspendre le service</SubmitButton>
                </form>
              )}
              {(client.statut === 'suspendu' || client.statut === 'resilie') && (
                <form action={changerStatutClientAction}>
                  <input type="hidden" name="client_id" value={client.id} />
                  <input type="hidden" name="statut" value="actif" />
                  <SubmitButton variant="outline" pendingLabel="…">Réactiver</SubmitButton>
                </form>
              )}
              {client.statut !== 'resilie' && client.statut !== 'demande' && (
                <form action={changerStatutClientAction}>
                  <input type="hidden" name="client_id" value={client.id} />
                  <input type="hidden" name="statut" value="resilie" />
                  <SubmitButton variant="ghost" pendingLabel="…">Résilier</SubmitButton>
                </form>
              )}
            </div>
          </Section>

          {/* Factures */}
          <Section titre="Factures et paiements" flush>
            {factures.length === 0 ? (
              <p className="px-5 py-6 text-body-sm text-muted-foreground">Aucune facture pour l’instant.</p>
            ) : (
              <ul className="divide-y divide-border">
                {factures.map((f) => {
                  const paye = payeParFacture(f.id);
                  const reste = Math.max(0, f.montant_fcfa - paye);
                  const retard = f.statut === 'emise' ? joursEntre(f.echeance, auj) : 0;
                  const niveau = niveauRelance(retard);
                  const pf = paiements.filter((p) => p.facture_id === f.id);
                  return (
                    <li key={f.id} className="space-y-3 px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 font-semibold text-brand-ink">
                            <FileText size={16} className="text-muted-foreground" /> {f.numero}
                            {f.statut === 'payee' && <span className="chip-ok">Payée</span>}
                            {f.statut === 'annulee' && <span className="chip-neutre">Annulée</span>}
                            {f.statut === 'emise' && (retard > 0 ? <span className="chip-stop">En retard de {retard} j</span> : <span className="chip-relance">À régler avant le {dateFr(f.echeance)}</span>)}
                          </p>
                          <p className="text-small text-muted-foreground">{f.libelle}</p>
                        </div>
                        <div className="text-right">
                          <p className="num font-bold text-brand-ink">{fcfa(f.montant_fcfa)}</p>
                          {paye > 0 && f.statut === 'emise' && <p className="num text-small text-muted-foreground">déjà reçu {fcfa(paye)}</p>}
                        </div>
                      </div>
                      {pf.length > 0 && (
                        <ul className="space-y-1 rounded-md bg-muted/50 px-3 py-2 text-small">
                          {pf.map((p) => (
                            <li key={p.id} className="flex flex-wrap justify-between gap-2">
                              <span>
                                {dateHeureFr(p.created_at)} · {METHODES_PAIEMENT[p.methode] ?? p.methode}
                                {p.reference && <span className="text-muted-foreground"> · réf. {p.reference}</span>}
                                {p.encaisse_par && <span className="text-muted-foreground"> · par {nomEmploye.get(p.encaisse_par) ?? 'un employé'}</span>}
                              </span>
                              <span className="num font-semibold text-terrain-ok">+ {fcfa(p.montant_fcfa)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {f.statut === 'emise' && (
                        <div className="space-y-3">
                          {retard > 0 && (
                            <RelanceButtons
                              clientId={client.id}
                              factureId={f.id}
                              telephone={client.telephone}
                              niveau={niveau}
                              message={messageRelance({ niveau, client: client.nom, montant: reste, entreprise: entreprise.nom, numero: f.numero, echeance: f.echeance })}
                              derniere={relances[0] ? `${relances[0].canal} · ${dateHeureFr(relances[0].created_at)}` : null}
                            />
                          )}
                          <div className="flex flex-wrap items-start gap-2">
                            <PaiementForm factureId={f.id} resteDu={reste} employes={employes} compact />
                            <Link href={`/precollecteur/facturation/${f.id}`} className="btn-outline">
                              <Printer size={16} /> Facture
                            </Link>
                            {paye === 0 && (
                              <form action={annulerFactureAction}>
                                <input type="hidden" name="facture_id" value={f.id} />
                                <SubmitButton variant="ghost" pendingLabel="…">Annuler</SubmitButton>
                              </form>
                            )}
                          </div>
                        </div>
                      )}
                      {f.statut === 'payee' && (
                        <Link href={`/precollecteur/facturation/${f.id}`} className="btn-ghost -ml-2.5">
                          <Printer size={15} /> Reçu imprimable
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {/* Collectes */}
          <Section titre="Historique des passages" sousTitre="30 derniers passages" flush>
            {collectes.length === 0 ? (
              <p className="px-5 py-6 text-body-sm text-muted-foreground">Aucun passage enregistré.</p>
            ) : (
              <ul className="divide-y divide-border">
                {collectes.map((x) => {
                  const st = STATUT_COLLECTE[x.statut]!;
                  return (
                    <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-body-sm">
                      <span className="flex items-center gap-2">
                        <CalendarCheck size={16} className="text-muted-foreground" />
                        {dateFr(x.date_prevue, { weekday: 'short', day: 'numeric', month: 'short' })}
                        {x.employe_id && <span className="text-muted-foreground">· {nomEmploye.get(x.employe_id) ?? ''}</span>}
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        {x.motif && <span className="text-small text-muted-foreground">{x.motif}</span>}
                        {x.confirmation_client === 'confirmee' && <span className="chip-ok">Confirmé par le client</span>}
                        {x.confirmation_client === 'contestee' && <span className="chip-stop">Contesté par le client</span>}
                        <span className={st.chip}>{st.label}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {incidents.length > 0 && (
            <Section titre="Incidents" flush>
              <ul className="divide-y divide-border">
                {incidents.map((i) => (
                  <li key={i.id} className="flex gap-3 px-5 py-3">
                    <Preuve url={i.media_path ? urls.get(i.media_path) : undefined} type={i.media_type} capture={i.capture_at} />
                    <div className="min-w-0 flex-1 text-body-sm">
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-brand-ink">
                        {CATEGORIES_INCIDENT[i.categorie] ?? i.categorie}
                        <span className={STATUT_INCIDENT[i.statut]?.chip}>{STATUT_INCIDENT[i.statut]?.label}</span>
                        <span className="chip-neutre">{i.source === 'client' ? 'Signalé par le client' : 'Terrain'}</span>
                      </p>
                      {i.description && <p className="text-muted-foreground">{i.description}</p>}
                      <p className="text-small text-muted-foreground">{dateHeureFr(i.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <details className="card-soft group">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold text-brand-ink">
              <span className="flex items-center gap-2"><Pencil size={16} /> Modifier la fiche</span>
              <span className="text-muted-foreground group-open:rotate-180">⌄</span>
            </summary>
            <ActionForm action={majClientAction} className="border-t border-border p-5">
              <input type="hidden" name="id" value={client.id} />
              <ClientFields plans={plans} zones={zones} client={client} />
              <SubmitButton className="mt-4 w-full">Enregistrer</SubmitButton>
            </ActionForm>
          </details>
        </div>

        {/* Colonne latérale */}
        <div className="space-y-6">
          <Section titre="QR code du foyer">
            <div className="mx-auto w-44 rounded-lg border border-border p-2" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="num mt-2 text-center font-semibold tracking-wider text-brand-ink">{client.code}</p>
            <p className="mt-1 text-center text-small text-muted-foreground">Scanné à chaque passage pour prouver le service.</p>
            <Link href={`/precollecteur/clients/${client.id}/etiquette`} className="btn-outline mt-3 w-full">
              <Printer size={16} /> Imprimer l’étiquette
            </Link>
          </Section>

          <Section titre="Contact">
            <dl className="space-y-3 text-body-sm">
              <div>
                <dt className="text-small text-muted-foreground">Téléphone</dt>
                <dd className="font-semibold">{telLisible(client.telephone)}</dd>
              </div>
              <div>
                <dt className="text-small text-muted-foreground">Adresse</dt>
                <dd>{[client.adresse, client.quartier].filter(Boolean).join(', ') || '—'}</dd>
              </div>
              <div>
                <dt className="text-small text-muted-foreground">Zone</dt>
                <dd>{client.zone_nom ?? 'Hors zone attribuée'}</dd>
              </div>
              {client.lat != null && client.lng != null && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${client.lat},${client.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-outline w-full"
                >
                  <MapPin size={16} /> Itinéraire
                </a>
              )}
              {client.notes && <p className="rounded-md bg-muted/60 p-2 text-small">{client.notes}</p>}
            </dl>
          </Section>

        </div>
      </div>
    </PrecoShell>
  );
}
