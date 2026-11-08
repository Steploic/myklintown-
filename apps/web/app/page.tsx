import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Bike,
  CalendarCheck,
  Camera,
  Check,
  FileText,
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

// Page publique entièrement statique. La grille tarifaire commune n'y figure
// plus : chaque abonné obtient un devis de son précollecteur (corrections de
// l'équipe, 08/11/2026).

const FONCTIONS = [
  { icon: Users, titre: 'Clients & abonnements', texte: 'Fiche de chaque abonné, historique, statut d’abonnement calculé, rappels avant échéance.' },
  { icon: Receipt, titre: 'Factures & recouvrement', texte: 'Facture émise au tarif convenu avec l’abonné, encaissement espèces ou Mobile Money, relances graduées en un geste.' },
  { icon: QrCode, titre: 'Tournées & scan QR', texte: 'Planifiez la tournée, scannez le QR du portail : le passage est tracé, la couleur dit s’il faut servir.' },
  { icon: Bike, titre: 'Flotte & équipe', texte: 'Plusieurs tricycles, plusieurs employés : qui roule sur quoi, et l’activité de chacun.' },
  { icon: Camera, titre: 'Preuves photo & vidéo', texte: 'Prises dans l’application, datées et localisées. Pas d’import depuis la galerie : la preuve est authentique.' },
  { icon: BarChart3, titre: 'Tableau de bord', texte: 'Clients actifs, chiffre d’affaires, impayés, collectes prévues, réalisées et manquées, par employé et par véhicule.' },
];

const ETAPES = [
  { n: '1', titre: 'Le précollecteur s’équipe', texte: 'Il crée son espace, enregistre ses clients, sa flotte et son équipe. Inscription gratuite.' },
  { n: '2', titre: 'L’abonné demande un devis', texte: 'Maison, commerce ou institution : il décrit ses besoins et la fréquence de ramassage souhaitée. Un précollecteur de son quartier lui propose un tarif.' },
  { n: '3', titre: 'Chaque passage compte', texte: 'Scanné, payé, confirmé par l’abonné. Tout le monde voit la même vérité.' },
];

const ABONNES = [
  'Un devis adapté à votre domicile, votre commerce ou votre institution',
  'La fréquence de ramassage qui vous convient, sacs poubelles en option',
  'Chaque passage visible, à confirmer d’un geste',
  'Factures et reçus toujours accessibles',
  'Un problème ? Photo ou vidéo prise sur place, transmise immédiatement',
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <SiteHeader />

      <main className="flex-1">
        {/* ACCROCHE */}
        <section className="relative overflow-hidden bg-brand-gradient-ink text-white">
          <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-blue-pixel/25 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-32 right-0 h-[28rem] w-[28rem] rounded-full bg-brand-leaf/15 blur-3xl" />
          <div className="container relative grid gap-12 py-16 md:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-small font-semibold text-brand-leaf">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-leaf" /> Lancement officiel · décembre 2026
              </p>
              <h1 className="mt-5 text-[2.35rem] font-bold leading-[1.08] tracking-tight text-white md:text-[3.4rem]">
                La collecte des déchets,{' '}
                <br />
                <span className="bg-gradient-to-r from-brand-blue-clair via-brand-teal-clair to-brand-leaf bg-clip-text text-transparent">
                  enfin simple et fiable pour tous.
                </span>
              </h1>
              <p className="mt-5 max-w-xl text-[1.08rem] leading-relaxed text-white/75">
                MyKlinTown réunit tout le monde sur une même application. Que ce soit pour votre maison, votre entreprise
                ou votre institution, vos déchets sont collectés à temps par des précollecteurs qui gèrent efficacement
                leurs tournées et leurs paiements depuis leurs smartphones.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/signup?role=precollecteur" className="btn-primary px-5 text-body">
                  Créer mon espace précollecteur <ArrowRight size={18} />
                </Link>
                <Link href="/signup?role=citoyen" className="btn-outline border-white/25 bg-white/5 px-5 text-body text-white hover:bg-white/10">
                  Faire ramasser mes déchets
                </Link>
              </div>
              <p className="mt-4 text-small text-white/55">Sans installation · Fonctionne sur tout smartphone et PC</p>
            </div>

            {/* Maquette téléphone : l'écran de tournée */}
            <div className="relative mx-auto w-full max-w-[20rem]">
              <PixelDots className="absolute -left-10 top-8 h-14 w-14 opacity-90" />
              <div className="rounded-[2.2rem] border border-white/15 bg-brand-ink p-2.5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
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
                      { n: 'Boulangerie du Lac', s: 'Impayé', c: 'bg-terrain-stop', chip: 'chip-stop' },
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
                Fini le cahier et les impayés oubliés. Chaque client, chaque facture, chaque passage est au même endroit,
                et vous voyez enfin combien rapporte votre activité.
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
        <section id="fonctionnement" className="scroll-mt-16 py-20">
          <div className="container">
            <h2 className="max-w-xl text-[1.9rem] font-bold leading-tight md:text-[2.4rem]">Une chaîne simple entre les acteurs.</h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
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

        {/* ABONNÉS + LANCEMENT */}
        <section className="bg-background py-20">
          <div className="container grid gap-6 lg:grid-cols-2">
            <article id="abonnes" className="scroll-mt-20 rounded-2xl border border-border bg-surface p-8">
              <span className="grid h-12 w-12 place-content-center rounded-xl bg-brand-teal/10 text-brand-teal"><Smartphone size={24} /></span>
              <h2 className="mt-5 text-[1.6rem] font-bold">Abonnés : vos déchets ramassés à temps.</h2>
              <ul className="mt-4 space-y-2 text-body-sm">
                {ABONNES.map((t) => (
                  <li key={t} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-brand-green" /> {t}</li>
                ))}
              </ul>
              <Link href="/signup?role=citoyen" className="btn-secondary mt-6">Faire ramasser mes déchets <ArrowRight size={16} /></Link>
            </article>
            <article className="relative overflow-hidden rounded-2xl bg-brand-gradient-ink p-8 text-white">
              <PixelDots className="absolute right-6 top-6 h-12 w-12 opacity-80" />
              <span className="grid h-12 w-12 place-content-center rounded-xl bg-white/10 text-brand-leaf"><CalendarCheck size={24} /></span>
              <h2 className="mt-5 text-[1.6rem] font-bold text-white">Lancement officiel en décembre 2026.</h2>
              <p className="mt-4 text-body-sm text-white/80">
                Inscrivez-vous dès maintenant, gratuitement et sans engagement. Les précollecteurs dont le dossier est
                vérifié seront les premiers visibles par les abonnés de leur quartier ; les abonnés inscrits seront les
                premiers servis.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/signup?role=precollecteur" className="btn-primary">Je suis précollecteur</Link>
                <Link href="/signup?role=citoyen" className="btn-outline border-white/25 bg-white/5 text-white hover:bg-white/10">
                  Je cherche un précollecteur
                </Link>
              </div>
            </article>
          </div>
        </section>

        {/* APPEL FINAL */}
        <section className="py-20">
          <div className="container">
            <div className="relative overflow-hidden rounded-3xl bg-brand-green px-8 py-12 text-white md:px-14">
              <PixelDots className="absolute right-10 top-8 h-16 w-16 opacity-60" />
              <div className="flex flex-wrap items-center justify-between gap-6">
                <div className="max-w-xl">
                  <h2 className="text-[1.8rem] font-bold leading-tight text-white md:text-[2.2rem]">Vous êtes précollecteur ? Créez votre vitrine.</h2>
                  <p className="mt-2 text-white/85">
                    Inscription gratuite et sans engagement : soyez visible auprès des abonnés de votre quartier dès l’ouverture.
                  </p>
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
