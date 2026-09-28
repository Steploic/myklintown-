import Link from 'next/link';
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Clock,
  FileText,
  MessageCircle,
  Phone,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { cn } from '@myklintown/ui';
import { PortalShell } from '@/components/portal-shell';
import { Section } from '@/components/ui/blocks';
import { ConfirmationPassage } from '@/components/client/confirmation-passage';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { rattacherCompteAction } from '@/lib/compte-actions';
import { getMonAbonnement } from '@/lib/client/context';
import { getCurrentProfile } from '@/lib/get-profile';
import { rows } from '@/lib/server';
import { ajouterJours, dateFr, fcfa, isoJour, statutAbonnement, telInternational, telLisible } from '@/lib/format';
import type { Collecte } from '@/lib/types';

export const metadata = { title: 'Mon abonnement' };

const HERO = {
  ok: { classe: 'bg-terrain-ok', icone: ShieldCheck, titre: 'Votre collecte est assurée' },
  relance: { classe: 'bg-terrain-relance', icone: TriangleAlert, titre: 'Pensez à renouveler' },
  stop: { classe: 'bg-terrain-stop', icone: ShieldAlert, titre: 'Service interrompu' },
  neutre: { classe: 'bg-brand-blue', icone: Clock, titre: 'Demande en cours' },
} as const;

export default async function CitoyenAccueil({
  searchParams,
}: {
  searchParams: Promise<{ demande?: string; rattache?: string }>;
}) {
  const { demande, rattache } = await searchParams;
  const { supabase, client, entreprise } = await getMonAbonnement();
  const profile = await getCurrentProfile();
  const prenom = profile?.nom?.split(' ')[0] ?? '';

  if (!client) {
    return (
      <PortalShell portalKey="citoyen" currentPath="/citoyen">
        <section className="overflow-hidden rounded-2xl bg-brand-gradient-ink p-6 text-white sm:p-10">
          <p className="text-small font-semibold uppercase tracking-wider text-brand-leaf">Bienvenue{prenom ? `, ${prenom}` : ''}</p>
          <h1 className="mt-2 max-w-xl text-[1.75rem] font-bold leading-tight text-white sm:text-[2.25rem]">
            Faites collecter vos déchets par un précollecteur de votre quartier.
          </h1>
          <p className="mt-3 max-w-xl text-white/75">
            Choisissez une formule, indiquez votre domicile : MyKlinTown trouve le précollecteur qui dessert votre zone.
            Vous suivez ensuite chaque passage et chaque paiement depuis votre téléphone.
          </p>
          <Link href="/citoyen/souscrire" className="btn-primary mt-6">
            <Sparkles size={16} /> M’abonner maintenant
          </Link>
        </section>
        <section className="card-soft mt-6 p-5 sm:p-6">
          <h2 className="flex items-center gap-2">
            <QrCode size={20} className="text-brand-green" /> Déjà servi par un précollecteur ?
          </h2>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Saisissez le code de l’étiquette collée à votre portail (il commence par « MKT- ») et le téléphone que
            vous lui avez donné : votre compte retrouve votre abonnement, vos factures et vos passages.
          </p>
          <ActionForm action={rattacherCompteAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <label className="field-label" htmlFor="r-code">Code client</label>
              <input id="r-code" name="code" required placeholder="MKT-XXXXXXXX" autoCapitalize="characters" className="field num uppercase" />
            </div>
            <div>
              <label className="field-label" htmlFor="r-tel">Téléphone</label>
              <input id="r-tel" name="telephone" type="tel" required placeholder="6 XX XX XX XX" className="field" />
            </div>
            <SubmitButton pendingLabel="Vérification…">Retrouver mon abonnement</SubmitButton>
          </ActionForm>
        </section>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { icon: CalendarCheck, t: 'Passages suivis', d: 'Vous voyez quand le précollecteur est passé, et vous confirmez.' },
            { icon: FileText, t: 'Factures claires', d: 'Même grille de prix partout, reçus consultables à tout moment.' },
            { icon: AlertTriangle, t: 'Un problème ?', d: 'Signalez-le avec une photo ou une vidéo prise sur place.' },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="card-soft p-5">
              <Icon size={22} className="text-brand-green" />
              <p className="mt-2 font-semibold text-brand-ink">{t}</p>
              <p className="text-body-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </PortalShell>
    );
  }

  const il30 = ajouterJours(isoJour(), -30);
  const { data } = await supabase
    .from('collectes')
    .select('*')
    .eq('client_id', client.id)
    .gte('date_prevue', il30)
    .order('date_prevue', { ascending: false })
    .limit(10);
  const collectes = rows<Collecte>(data);
  const aConfirmer = collectes.filter((c) => c.statut === 'realisee' && !c.confirmation_client).slice(0, 3);
  const faits = collectes.filter((c) => c.statut === 'realisee').length;

  const s = statutAbonnement(client.statut_abonnement);
  const h = HERO[s.terrain];
  const Icone = h.icone;
  const tel = telInternational(entreprise?.telephone);

  return (
    <PortalShell portalKey="citoyen" currentPath="/citoyen" titre={client.nom}>
      {rattache && (
        <p className="mb-5 flex items-center gap-2 rounded-lg border border-terrain-ok/25 bg-terrain-ok/5 px-4 py-3 text-body-sm font-medium text-terrain-ok">
          <CheckCircle2 size={18} /> Compte rattaché : voici votre abonnement chez {entreprise?.nom}.
        </p>
      )}
      {demande && (
        <p className="mb-5 flex items-center gap-2 rounded-lg border border-terrain-ok/25 bg-terrain-ok/5 px-4 py-3 text-body-sm font-medium text-terrain-ok">
          <CheckCircle2 size={18} /> Demande envoyée à {entreprise?.nom}. Il vous contactera pour valider et encaisser la première période.
        </p>
      )}

      <section className={cn('rounded-2xl p-6 text-white sm:p-8', h.classe)}>
        <div className="flex items-start gap-4">
          <Icone size={40} className="shrink-0" />
          <div className="min-w-0">
            <p className="text-small font-semibold uppercase tracking-wider opacity-85">{s.label}</p>
            <h1 className="text-[1.6rem] font-bold leading-tight text-white sm:text-[2rem]">{h.titre}</h1>
            <p className="mt-1 opacity-90">
              {client.statut === 'demande'
                ? `En attente de validation par ${entreprise?.nom ?? 'votre précollecteur'}.`
                : client.couverture_fin
                  ? `Formule ${client.plan_nom} · couvert jusqu’au ${dateFr(client.couverture_fin, { day: 'numeric', month: 'long', year: 'numeric' })}`
                  : `Formule ${client.plan_nom} · première période à régler`}
            </p>
            {Number(client.montant_impaye) > 0 && (
              <p className="num mt-3 inline-block rounded-lg bg-white/15 px-3 py-1.5 font-semibold">
                À régler : {fcfa(client.montant_impaye)}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {aConfirmer.length > 0 && (
            <Section titre="Confirmez les derniers passages" sousTitre="Votre réponse sert de preuve de service." flush>
              <ul className="divide-y divide-border">
                {aConfirmer.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <span className="font-medium">{dateFr(c.date_prevue, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                    <ConfirmationPassage collecteId={c.id} />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section
            titre="Derniers passages"
            sousTitre={`${faits} collecte${faits > 1 ? 's' : ''} sur les 30 derniers jours`}
            actions={<Link href="/citoyen/collectes" className="btn-ghost">Historique</Link>}
            flush
          >
            {collectes.length === 0 ? (
              <p className="px-5 py-6 text-body-sm text-muted-foreground">Aucun passage enregistré pour l’instant.</p>
            ) : (
              <ul className="divide-y divide-border">
                {collectes.slice(0, 5).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3 text-body-sm">
                    <span>{dateFr(c.date_prevue, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    <span className={c.statut === 'realisee' ? 'chip-ok' : c.statut === 'non_realisee' ? 'chip-stop' : 'chip-info'}>
                      {c.statut === 'realisee' ? 'Collecté' : c.statut === 'non_realisee' ? `Non collecté${c.motif ? ` · ${c.motif}` : ''}` : 'Prévu'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          {entreprise && (
            <Section titre="Mon précollecteur">
              <p className="font-semibold text-brand-ink">{entreprise.nom}</p>
              <p className="text-body-sm text-muted-foreground">{telLisible(entreprise.telephone)}</p>
              {client.zone_nom && <p className="text-small text-muted-foreground">Zone {client.zone_nom}</p>}
              {tel && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <a href={`tel:+${tel}`} className="btn-outline"><Phone size={16} /> Appeler</a>
                  <a href={`https://wa.me/${tel}`} target="_blank" rel="noreferrer" className="btn-outline"><MessageCircle size={16} /> WhatsApp</a>
                </div>
              )}
            </Section>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Link href="/citoyen/qr-code" className="card-soft flex flex-col items-center gap-2 p-4 text-center text-body-sm font-semibold text-brand-ink hover:shadow-elevated">
              <QrCode size={24} className="text-brand-green" /> Mon QR code
            </Link>
            <Link href="/citoyen/signaler" className="card-soft flex flex-col items-center gap-2 p-4 text-center text-body-sm font-semibold text-brand-ink hover:shadow-elevated">
              <AlertTriangle size={24} className="text-terrain-relance" /> Signaler
            </Link>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}
