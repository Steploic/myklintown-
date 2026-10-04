import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Bike,
  Camera,
  Check,
  FileText,
  MapPinned,
  QrCode,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { PixelDots } from '@/components/ui/blocks';
import { createClient } from '@supabase/supabase-js';
import { rows } from '@/lib/server';
import { fcfa } from '@/lib/format';
import type { Plan } from '@/lib/types';


// Page publique servie depuis le cache et regénérée toutes les 5 minutes :
// elle ne dépend plus d'un aller-retour vers la base à chaque visite (retour R10).
export const revalidate = 300;

async function lireGrille(): Promise<Plan[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !cle) return [];
  try {
    // Client anonyme SANS cookies : la grille est publique, et les cookies
    // rendraient la page dynamique (donc non mise en cache).
    const supabase = createClient(url, cle, { auth: { persistSession: false } });
    const { data } = await supabase.from('plans_tarifaires').select('*').eq('actif', true).order('ordre');
    return rows<Plan>(data);
  } catch {
    return [];
  }
}

const FONCTIONS = [
  { icon: Users, titre: 'Clients & abonnements', texte: 'Fiche de chaque ménage, historique, statut d’abonnement calculé, rappels avant échéance.' },
  { icon: Receipt, titre: 'Factures & recouvrement', texte: 'Facture émise au prix de la grille, encaissement espèces ou Mobile Money, relances graduées en un geste.' },
  { icon: QrCode, titre: 'Tournées & scan QR', texte: 'Planifiez la tournée, scannez le QR du portail : le passage est tracé, la couleur dit s’il faut servir.' },
  { icon: Bike, titre: 'Flotte & équipe', texte: 'Plusieurs tricycles, plusieurs employés : qui roule sur quoi, et l’activité de chacun.' },
  { icon: Camera, titre: 'Preuves photo & vidéo', texte: 'Prises dans l’application, datées et localisées. Pas d’import depuis la galerie : la preuve est authentique.' },
  { icon: BarChart3, titre: 'Tableau de bord', texte: 'Clients actifs, chiffre d’affaires, impayés, collectes prévues, réalisées et manquées, par employé et par véhicule.' },
];

const ETAPES = [
  { n: '1', titre: 'La Mairie découpe', texte: 'Le territoire est divisé en zones de collecte, chacune confiée à un ou plusieurs précollecteurs.' },
  { n: '2', titre: 'Le précollecteur s’équipe', texte: 'Il crée son espace, enregistre ses clients, sa flotte et son équipe. Gratuit à l’installation.' },
  { n: '3', titre: 'Le ménage s’abonne', texte: 'Il choisit sa formule, place son domicile : la plateforme le relie au précollecteur de sa zone.' },
  { n: '4', titre: 'Chaque passage compte', texte: 'Scanné, payé, confirmé par le ménage. Tout le monde voit la même vérité.' },
];

export default async function HomePage() {
  const plans = await lireGrille();
  const reference = plans.find((p) => p.duree_mois === 1)?.prix_fcfa;

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <SiteHeader />

      <main className="flex-1">
        {/* HERO */}
        <section className="relative overflow-hidden bg-brand-gradient-ink text-white">
          <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-blue-pixel/20 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-32 right-0 h-[28rem] w-[28rem] rounded-full bg-brand-leaf/15 blur-3xl" />
          <div className="container relative grid gap-12 py-16 md:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-small font-semibold text-brand-leaf">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-leaf" /> Pilote Yaoundé · oct.–déc. 2026
              </p>
              <h1 className="mt-5 text-[2.35rem] font-bold leading-[1.08] tracking-tight text-white md:text-[3.4rem]">
                La précollecte,
                <br />
                <span className="bg-gradient-to-r from-[#7FB6E6] via-[#5FC4B4] to-brand-leaf bg-clip-text text-transparent">enfin pilotée.</span>
              </h1>
              <p className="mt-5 max-w-xl text-[1.08rem] leading-relaxed text-white/75">
                MyKlinTown est l’outil des précollecteurs de déchets : vos clients, leurs abonnements, vos factures,
                vos tournées et vos preuves de passage, sur votre téléphone. Vous encaissez, on vous aide à être payé.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/signup?role=precollecteur" className="btn-primary px-5 text-body">
                  Créer mon espace précollecteur <ArrowRight size={18} />
                </Link>
                <Link href="/signup?role=citoyen" className="btn-outline border-white/25 bg-white/5 px-5 text-body text-white hover:bg-white/10">
                  Je suis un ménage
                </Link>
              </div>
              <p className="mt-4 text-small text-white/55">Sans installation · fonctionne sur tout smartphone · données hébergées en sécurité</p>
            </div>

            {/* Maquette téléphone : l'écran de tournée */}
            <div className="relative mx-auto w-full max-w-[20rem]">
              <PixelDots className="absolute -left-10 top-8 h-14 w-14 opacity-90" />
              <div className="rounded-[2.2rem] border border-white/15 bg-[#0A1C2C] p-2.5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
                <div className="overflow-hidden rounded-[1.7rem] bg-background text-foreground">
                  <div className="flex items-center justify-between bg-surface px-4 py-3">
                    <span className="text-small font-bold text-brand-ink">Tournée · mardi</span>
                    <span className="num text-small font-semibold text-terrain-ok">14 / 18</span>
                  </div>
                  <div className="h-1.5 bg-muted">
                    <div className="h-full w-[78%] bg-terrain-ok" />
                  </div>
                  <div className="m-3 flex items-center gap-3 rounded-xl bg-terrain-ok p-3 text-white">
                    <ShieldCheck size={30} />
                    <div className="leading-tight">
                      <p className="text-[10px] font-bold uppercase tracking-wider opacity-90">Servir</p>
                      <p className="font-bold">Famille Ateba</p>
                      <p className="text-[11px] opacity-90">À jour · passage enregistré ✓</p>
                    </div>
                  </div>
                  <ul className="space-y-2 px-3 pb-4">
                    {[
                      { n: 'Mme Ngo Bassa', s: 'Échéance proche', c: 'bg-terrain-relance', chip: 'chip-relance' },
                      { n: 'M. Fouda Jean', s: 'Impayé', c: 'bg-terrain-stop', chip: 'chip-stop' },
                      { n: 'Famille Mbarga', s: 'À jour', c: 'bg-terrain-ok', chip: 'chip-ok' },
                    ].map((x) => (
                      <li key={x.n} className="flex items-stretch overflow-hidden rounded-lg bg-surface shadow-sm">
                        <span className={`w-1 ${x.c}`} />
                        <span className="flex flex-1 items-center justify-between gap-2 px-2.5 py-2">
                          <span className="text-[12px] font-semibold text-brand-ink">{x.n}</span>
                          <span className={`${x.chip} text-[10px]`}>{x.s}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PRÉCOLLECTEURS */}
        <section id="precollecteurs" className="scroll-mt-16 py-20">
          <div className="container">
            <div className="max-w-2xl">
              <p className="text-small font-semibold uppercase tracking-wider text-brand-green">Pour les précollecteurs</p>
              <h2 className="mt-2 text-[1.9rem] font-bold leading-tight md:text-[2.4rem]">Tout ce qu’il faut pour structurer votre activité.</h2>
              <p className="mt-3 text-body text-muted-foreground">
                Fini le cahier et les impayés oubliés. Chaque client, chaque facture, chaque passage est au même endroit —
                et vous, vous voyez enfin combien rapporte votre activité.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FONCTIONS.map(({ icon: Icon, titre, texte }) => (
                <article key={titre} className="card-soft group p-6 transition-shadow hover:shadow-elevated">
                  <span className="grid h-11 w-11 place-content-center rounded-xl bg-brand-green/10 text-brand-green transition-colors group-hover:bg-brand-green group-hover:text-white">
                    <Icon size={22} />
                  </span>
                  <h3 className="mt-4 text-h2-sm font-semibold text-brand-ink">{titre}</h3>
                  <p className="mt-1 text-body-sm text-muted-foreground">{texte}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* CODE TERRAIN */}
        <section className="bg-background py-20">
          <div className="container grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-small font-semibold uppercase tracking-wider text-brand-green">Paiement avant service</p>
              <h2 className="mt-2 text-[1.9rem] font-bold leading-tight md:text-[2.4rem]">Trois couleurs. Zéro discussion au portail.</h2>
              <p className="mt-3 text-body text-muted-foreground">
                Au scan du QR code, l’écran dit à l’agent quoi faire. Le statut est calculé à partir des factures et des
                paiements : personne ne le décide à la main.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { c: 'bg-terrain-ok', i: ShieldCheck, t: 'Servir', d: 'Abonnement à jour.' },
                { c: 'bg-terrain-relance', i: TriangleAlert, t: 'Servir et rappeler', d: 'Échéance dans moins de 7 jours.' },
                { c: 'bg-terrain-stop', i: ShieldAlert, t: 'Ne pas servir', d: 'Facture échue et non réglée.' },
              ].map(({ c, i: Icon, t, d }) => (
                <div key={t} className={`${c} rounded-2xl p-5 text-white shadow-elevated`}>
                  <Icon size={32} />
                  <p className="mt-6 text-h2 font-bold">{t}</p>
                  <p className="text-body-sm opacity-90">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* COMMENT ÇA MARCHE */}
        <section className="py-20">
          <div className="container">
            <h2 className="max-w-xl text-[1.9rem] font-bold leading-tight md:text-[2.4rem]">Un seul circuit, trois acteurs.</h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-4">
              {ETAPES.map((e) => (
                <li key={e.n} className="relative">
                  <span className="num grid h-11 w-11 place-content-center rounded-full bg-brand-ink text-h2-sm font-bold text-brand-leaf">{e.n}</span>
                  <h3 className="mt-4 text-h2-sm font-semibold text-brand-ink">{e.titre}</h3>
                  <p className="mt-1 text-body-sm text-muted-foreground">{e.texte}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* TARIFS */}
        <section id="tarifs" className="scroll-mt-16 bg-background py-20">
          <div className="container">
            <div className="max-w-2xl">
              <p className="text-small font-semibold uppercase tracking-wider text-brand-green">Grille tarifaire commune</p>
              <h2 className="mt-2 text-[1.9rem] font-bold leading-tight md:text-[2.4rem]">Le même prix chez tous nos précollecteurs.</h2>
              <p className="mt-3 text-body text-muted-foreground">
                Le ménage choisit sa formule dans une grille unique : pas de négociation, pas de surprise. Le précollecteur
                ne paie MyKlinTown qu’à travers une commission sur ce qu’il encaisse.
              </p>
            </div>
            {plans.length > 0 ? (
              <div className="mt-10 grid gap-4 md:grid-cols-3">
                {plans.map((p, i) => {
                  const mensuel = Math.round(p.prix_fcfa / p.duree_mois);
                  const eco = reference && p.duree_mois > 1 ? Math.round((1 - mensuel / reference) * 100) : 0;
                  return (
                    <article key={p.id} className={`relative flex flex-col rounded-2xl bg-surface p-7 ${i === 1 ? 'shadow-elevated ring-2 ring-brand-green' : 'card-soft'}`}>
                      {i === 1 && <span className="absolute -top-3 left-7 rounded-full bg-brand-green px-3 py-1 text-small font-bold text-white">Le plus choisi</span>}
                      <p className="text-small font-semibold uppercase tracking-wider text-brand-green">{p.nom}</p>
                      <p className="num mt-3 text-[2.4rem] font-bold leading-none text-brand-ink">{fcfa(p.prix_fcfa)}</p>
                      <p className="mt-1 text-body-sm text-muted-foreground">
                        {p.duree_mois === 1 ? 'par mois' : `pour ${p.duree_mois} mois`}
                        {eco > 0 && <span className="ml-2 font-semibold text-terrain-ok">−{eco} %</span>}
                      </p>
                      <ul className="mt-5 space-y-2 text-body-sm">
                        {p.avantages.map((a) => (
                          <li key={a} className="flex items-start gap-2"><Check size={16} className="mt-0.5 shrink-0 text-brand-green" /> {a}</li>
                        ))}
                      </ul>
                      <Link href="/signup?role=citoyen" className={`${i === 1 ? 'btn-primary' : 'btn-outline'} mt-7`}>
                        Choisir {p.nom.toLowerCase()}
                      </Link>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="mt-8 text-body-sm text-muted-foreground">La grille tarifaire sera affichée ici dès le lancement du pilote.</p>
            )}
            <p className="mt-6 text-small text-muted-foreground">Grille proposée pour la phase pilote, en cours de validation avec les partenaires.</p>
          </div>
        </section>

        {/* MÉNAGES + MAIRIES */}
        <section className="py-20">
          <div className="container grid gap-6 lg:grid-cols-2">
            <article id="menages" className="scroll-mt-20 rounded-2xl border border-border p-8">
              <span className="grid h-12 w-12 place-content-center rounded-xl bg-brand-teal/10 text-brand-teal"><Smartphone size={24} /></span>
              <h2 className="mt-5 text-[1.6rem] font-bold">Ménages : suivez votre service.</h2>
              <ul className="mt-4 space-y-2 text-body-sm">
                {[
                  'Abonnement en 3 étapes auprès du précollecteur de votre zone',
                  'Chaque passage visible, à confirmer d’un geste',
                  'Factures et reçus toujours accessibles',
                  'Un problème ? Photo ou vidéo prise sur place, transmise immédiatement',
                ].map((t) => (
                  <li key={t} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-brand-green" /> {t}</li>
                ))}
              </ul>
              <Link href="/signup?role=citoyen" className="btn-secondary mt-6">M’abonner <ArrowRight size={16} /></Link>
            </article>
            <article id="mairies" className="scroll-mt-20 rounded-2xl bg-brand-gradient-ink p-8 text-white">
              <span className="grid h-12 w-12 place-content-center rounded-xl bg-white/10 text-brand-leaf"><MapPinned size={24} /></span>
              <h2 className="mt-5 text-[1.6rem] font-bold text-white">Mairies : voyez tout le territoire.</h2>
              <ul className="mt-4 space-y-2 text-body-sm text-white/80">
                {[
                  'Découpage de la commune en zones de collecte, sans chevauchement',
                  'Affectation des précollecteurs, zones couvertes et non couvertes',
                  'Volumes collectés, incidents, performance par zone et dans le temps',
                  'Données agrégées et exportables, sans exposer les ménages',
                ].map((t) => (
                  <li key={t} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-brand-leaf" /> {t}</li>
                ))}
              </ul>
              <Link href="/acces-mairie" className="btn-primary mt-6">Demander un accès <ArrowRight size={16} /></Link>
            </article>
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="pb-20">
          <div className="container">
            <div className="relative overflow-hidden rounded-3xl bg-brand-green px-8 py-12 text-white md:px-14">
              <PixelDots className="absolute right-10 top-8 h-16 w-16 opacity-60" />
              <div className="flex flex-wrap items-center justify-between gap-6">
                <div className="max-w-xl">
                  <h2 className="text-[1.8rem] font-bold leading-tight text-white md:text-[2.2rem]">Vous êtes précollecteur ? Rejoignez le pilote.</h2>
                  <p className="mt-2 text-white/85">Créez votre espace en 2 minutes, chargez une démonstration, et voyez par vous-même.</p>
                </div>
                <Link href="/signup?role=precollecteur" className="inline-flex min-h-[48px] items-center gap-2 rounded-md bg-white px-6 font-semibold text-brand-ink shadow-elevated hover:bg-white/90">
                  <FileText size={18} /> Créer mon espace
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
