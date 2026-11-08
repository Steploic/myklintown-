import Link from 'next/link';
import { ArrowRight, BadgeCheck, MapPin, Search } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { fetchAvecDelai } from '@myklintown/db/server';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { CarteVitrine } from '@/components/annuaire/carte-vitrine';
import { rows } from '@/lib/server';

export const metadata = { title: 'Trouver un précollecteur' };

interface Fiche {
  id: string;
  nom: string;
  devise: string | null;
  logo_path: string | null;
}

/**
 * Annuaire public (retours de l'équipe, 08/11/2026, § 1.4) : le visiteur
 * saisit son quartier et voit les précollecteurs VÉRIFIÉS qui y travaillent,
 * avec leur nom, leur logo et leur devise. Rien d'autre.
 */
async function chercher(quartier: string): Promise<{ fiches: Fiche[]; erreur: boolean }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !cle) return { fiches: [], erreur: true };
  try {
    // Visiteur anonyme, sans cookie : l'annuaire ne dépend d'aucun compte.
    const supabase = createClient(url, cle, { auth: { persistSession: false }, global: { fetch: fetchAvecDelai } });
    const { data, error } = await supabase.rpc('annuaire_precollecteurs', { p_recherche: quartier });
    return { fiches: rows<Fiche>(data), erreur: !!error };
  } catch {
    return { fiches: [], erreur: true };
  }
}

export default async function AnnuairePage({ searchParams }: { searchParams: Promise<{ quartier?: string }> }) {
  const { quartier: brut } = await searchParams;
  const quartier = (brut ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const resultat = quartier.length >= 2 ? await chercher(quartier) : null;

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <SiteHeader />
      <main className="flex-1">
        <section className="bg-brand-gradient-ink text-white">
          <div className="container max-w-3xl py-14">
            <p className="text-small font-semibold uppercase tracking-wider text-brand-leaf">Annuaire des précollecteurs</p>
            <h1 className="mt-2 text-[2rem] font-bold leading-tight text-white md:text-[2.6rem]">Trouver un précollecteur près de chez moi</h1>
            <p className="mt-3 max-w-xl text-body text-white/75">
              Saisissez votre quartier : voici les précollecteurs vérifiés par MyKlinTown qui y travaillent.
            </p>
            <form action="/annuaire" method="get" className="mt-6 flex flex-col gap-3 sm:flex-row">
              <label htmlFor="quartier" className="sr-only">Votre quartier de résidence</label>
              <input
                id="quartier"
                name="quartier"
                defaultValue={quartier}
                required
                minLength={2}
                maxLength={60}
                autoComplete="address-level3"
                className="field flex-1 text-foreground"
                placeholder="ex. Nsam, Bastos, Biyem-Assi"
              />
              <button type="submit" className="btn-primary px-5">
                <Search size={18} /> Rechercher
              </button>
            </form>
          </div>
        </section>

        <section className="container max-w-3xl space-y-6 py-10">
          {resultat?.erreur && (
            <p role="alert" className="rounded-lg border border-terrain-relance/30 bg-terrain-relance/5 p-4 text-body-sm text-terrain-relance">
              L’annuaire est momentanément indisponible. Réessayez dans un instant.
            </p>
          )}

          {resultat && !resultat.erreur && resultat.fiches.length > 0 && (
            <>
              <p className="flex items-center gap-2 text-body-sm text-muted-foreground">
                <MapPin size={16} /> {resultat.fiches.length} précollecteur{resultat.fiches.length > 1 ? 's' : ''} vérifié{resultat.fiches.length > 1 ? 's' : ''} pour « {quartier} »
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {resultat.fiches.map((f) => (
                  <CarteVitrine key={f.id} nom={f.nom} devise={f.devise} logoPath={f.logo_path} />
                ))}
              </div>
            </>
          )}

          {resultat && !resultat.erreur && resultat.fiches.length === 0 && (
            <div className="card-soft space-y-2 p-6 text-center">
              <p className="font-semibold text-brand-ink">Aucun précollecteur vérifié pour « {quartier} » pour l’instant.</p>
              <p className="mx-auto max-w-md text-body-sm text-muted-foreground">
                Le lancement officiel a lieu en décembre 2026. Inscrivez-vous dès maintenant : vous serez mis en relation
                avec un précollecteur vérifié de votre quartier.
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border p-6">
              <h2 className="text-h2-sm font-semibold">Faire ramasser vos déchets</h2>
              <p className="mt-1 text-body-sm text-muted-foreground">Créez votre compte abonné, sans engagement.</p>
              <Link href="/signup?role=citoyen" className="btn-secondary mt-4">
                Faire ramasser mes déchets <ArrowRight size={16} />
              </Link>
            </div>
            <div className="rounded-2xl border border-border p-6">
              <h2 className="text-h2-sm font-semibold">Vous êtes précollecteur ?</h2>
              <p className="mt-1 text-body-sm text-muted-foreground">Inscription gratuite : votre vitrine apparaît ici une fois votre dossier vérifié.</p>
              <Link href="/signup?role=precollecteur" className="btn-primary mt-4">Créer ma vitrine</Link>
            </div>
          </div>

          <p className="flex items-start gap-2 text-small text-muted-foreground">
            <BadgeCheck size={16} className="mt-0.5 shrink-0" />
            Seuls les précollecteurs dont le dossier (NIU, autorisation de la commune, permis environnemental) a été vérifié
            par MyKlinTown figurent dans cet annuaire.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
