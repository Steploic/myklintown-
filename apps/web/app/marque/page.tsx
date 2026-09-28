import { ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Logo } from '@myklintown/ui';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { PixelDots } from '@/components/ui/blocks';

export const metadata = { title: 'Charte graphique' };

const COULEURS = [
  { nom: 'Nuit', hex: '#0D2438', role: 'Fonds sombres, barres latérales, titres', texte: 'text-white' },
  { nom: 'Bleu confiance', hex: '#1B3F63', role: 'Actions secondaires, liens', texte: 'text-white' },
  { nom: 'Bleu pixel', hex: '#2B6CB0', role: 'Accents issus des pixels du logo', texte: 'text-white' },
  { nom: 'Sarcelle', hex: '#2E7F8E', role: 'Graphiques, éléments secondaires', texte: 'text-white' },
  { nom: 'Vert action', hex: '#3E9A5E', role: 'Bouton principal, validation', texte: 'text-white' },
  { nom: 'Vert feuille', hex: '#79C267', role: 'Accents sur fond sombre', texte: 'text-brand-ink' },
  { nom: 'Brume', hex: '#F4F7F5', role: 'Fond d’application', texte: 'text-brand-ink' },
];

/** Charte V2 : la référence visuelle pour l'équipe (supports, réseaux, impressions). */
export default function MarquePage() {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <SiteHeader />
      <main className="container flex-1 py-14">
        <p className="text-small font-semibold uppercase tracking-wider text-brand-green">Charte graphique · V2 · septembre 2026</p>
        <h1 className="mt-2 text-[2.2rem] font-bold md:text-[2.8rem]">L’identité MyKlinTown</h1>
        <p className="mt-3 max-w-2xl text-body text-muted-foreground">
          Une ville propre, rendue lisible par la donnée. Le logo le dit déjà : des pixels qui s’assemblent en un cercle
          qui devient feuille. La charte en tire trois règles : la couleur passe du bleu (la donnée) au vert (le
          résultat) ; l’interface est pensée pour le terrain, au soleil et au pouce ; les couleurs d’état ne mentent
          jamais.
        </p>

        <section className="mt-12">
          <h2 className="text-[1.5rem] font-bold">Logo</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="grid h-44 place-content-center rounded-2xl border border-border bg-white"><Logo size={56} /></div>
            <div className="grid h-44 place-content-center rounded-2xl bg-brand-gradient-ink"><Logo size={56} variant="bare" /></div>
            <div className="flex h-44 items-center justify-center gap-6 rounded-2xl border border-border bg-background">
              <Logo size={72} showWordmark={false} />
              <span className="grid h-[72px] w-[72px] place-content-center rounded-2xl bg-brand-ink"><Logo size={48} showWordmark={false} variant="bare" /></span>
            </div>
          </div>
          <p className="mt-3 text-body-sm text-muted-foreground">
            Version couleur sur fond clair, version blanche sur fond sombre, symbole seul pour les icônes d’application
            et les petits formats. Ne jamais déformer, recolorer ou poser le logo couleur sur un fond sombre.
          </p>
        </section>

        <section className="mt-14">
          <h2 className="text-[1.5rem] font-bold">Couleurs</h2>
          <div className="mt-5 h-3 rounded-full bg-gradient-to-r from-[#2B6CB0] via-[#2E7F8E] to-[#79C267]" />
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {COULEURS.map((c) => (
              <div key={c.hex} className="overflow-hidden rounded-xl border border-border">
                <div className={`flex h-24 items-end p-3 font-bold ${c.texte}`} style={{ background: c.hex }}>{c.nom}</div>
                <div className="p-3">
                  <p className="num text-body-sm font-semibold">{c.hex}</p>
                  <p className="text-small text-muted-foreground">{c.role}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <h2 className="text-[1.5rem] font-bold">Code terrain</h2>
          <p className="mt-2 max-w-2xl text-body-sm text-muted-foreground">
            Réservé aux états de service et de paiement. Jamais décoratif : quand le vert apparaît, c’est que tout va bien.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { c: '#1F8A4C', i: ShieldCheck, t: 'Servir', d: 'À jour · réalisé · résolu' },
              { c: '#B86E00', i: TriangleAlert, t: 'Relancer', d: 'Échéance proche · à facturer' },
              { c: '#C8372D', i: ShieldAlert, t: 'Ne pas servir', d: 'Impayé · non réalisé · incident' },
            ].map(({ c, i: Icon, t, d }) => (
              <div key={t} className="rounded-2xl p-5 text-white" style={{ background: c }}>
                <Icon size={28} />
                <p className="mt-4 text-h2 font-bold">{t}</p>
                <p className="num text-small opacity-90">{c} · {d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14 grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-[1.5rem] font-bold">Typographie</h2>
            <p className="mt-2 text-body-sm text-muted-foreground">Barlow, une seule famille. Légèrement condensée : beaucoup d’information sur un petit écran, lisible de loin.</p>
            <div className="mt-5 space-y-3 rounded-2xl border border-border p-6">
              <p className="text-[2.4rem] font-bold leading-none text-brand-ink">Titre 700</p>
              <p className="text-h2 font-semibold text-brand-ink">Sous-titre 600</p>
              <p className="text-body">Texte courant 400 — la précollecte, enfin pilotée.</p>
              <p className="num text-h2 font-bold text-brand-green">3 500 FCFA · 14 / 18</p>
              <p className="text-small text-muted-foreground">Chiffres à chasse fixe (tabular) pour les montants et compteurs.</p>
            </div>
          </div>
          <div>
            <h2 className="text-[1.5rem] font-bold">Signature</h2>
            <p className="mt-2 text-body-sm text-muted-foreground">
              Les pixels du logo s’échappent en motif discret : états vides, supports imprimés, en-têtes. Toujours peu,
              toujours dans l’angle.
            </p>
            <div className="relative mt-5 h-[13.5rem] overflow-hidden rounded-2xl bg-brand-gradient-ink p-6 text-white">
              <PixelDots className="absolute right-6 top-6 h-16 w-16" />
              <p className="absolute bottom-6 left-6 max-w-xs text-h2 font-bold">Boutons de 44 px minimum, coins arrondis 8 px, cartes 16 px.</p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
