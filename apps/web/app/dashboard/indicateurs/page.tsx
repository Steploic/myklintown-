import { BarChart3, Download } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { EmptyState, PageHeader, Section } from '@/components/ui/blocks';
import { Criteres, GrilleMoisCourant, Methode, OngletsPerimetre, SuiviHebdo, TableauMensuel } from '@/components/mairie/indicateurs';
import { accesCommunes } from '@/lib/mairie/communes';
import { getSupabase, row, rpc } from '@/lib/server';
import { dateFr, nombre } from '@/lib/format';
import { moisCourant, perimetresDisponibles, perimetreValide, rangMois, type TableauIndicateurs } from '@/lib/indicateurs';

export const metadata = { title: 'Indicateurs du pilote' };

/**
 * Les huit indicateurs promis au Technipole (livrable du 2 septembre 2026,
 * chapitre 8), calculés par la base sur les données réelles et relevés chaque
 * semaine. Agrégats seulement : aucun ménage n'est nommé. Un compte Mairie
 * suit sa commune ; l'équipe MyKlinTown, tout le pilote.
 */
export default async function IndicateursPage({ searchParams }: { searchParams: Promise<{ perimetre?: string }> }) {
  const supabase = await getSupabase();
  const options = perimetresDisponibles(await accesCommunes(supabase));
  const perimetre = perimetreValide((await searchParams).perimetre, options);
  // Compte Mairie rattaché à aucune commune : rien à demander à la base.
  const { data, error } = options.length
    ? await rpc(supabase, 'indicateurs_pilote', { p_perimetre: perimetre })
    : { data: null, error: { message: 'Aucune commune n’est rattachée à votre compte Mairie.' } };
  const t = row<TableauIndicateurs>(data);
  const courant = t ? moisCourant(t) : null;
  const exportHref = (type: string) => `/dashboard/indicateurs/export?perimetre=${perimetre}&type=${type}`;

  return (
    <PortalShell portalKey="mairie" currentPath="/dashboard/indicateurs">
      <PageHeader
        titre="Indicateurs du pilote"
        sousTitre={
          t
            ? `Pilote du ${dateFr(t.pilote.debut, { day: 'numeric', month: 'long' })} au ${dateFr(t.pilote.fin, { day: 'numeric', month: 'long', year: 'numeric' })} · les 8 indicateurs du livrable Technipole, calculés sur les données réelles.`
            : 'Les 8 indicateurs du livrable Technipole, calculés sur les données réelles.'
        }
        actions={
          t && (
            <>
              <a href={exportHref('mois')} className="btn-outline no-print">
                <Download size={16} /> Tableau mensuel (CSV)
              </a>
              <a href={exportHref('semaines')} className="btn-outline no-print">
                <Download size={16} /> Relevés hebdomadaires (CSV)
              </a>
            </>
          )
        }
      />

      {!t ? (
        <div className="card-soft">
          <EmptyState
            icon={BarChart3}
            titre="Indicateurs indisponibles"
            texte={
              !options.length
                ? 'Les indicateurs d’un compte Mairie sont ceux de sa commune : demandez à l’équipe MyKlinTown de rattacher votre compte à la vôtre.'
                : error?.message?.includes('indicateurs_pilote')
                  ? 'La base n’a pas encore le calcul des indicateurs : la migration 20261013000011 doit être exécutée.'
                  : `La base n’a pas répondu (${error?.message ?? 'réponse vide'}). Réessayez dans un instant.`
            }
          />
        </div>
      ) : (
        <>
          <OngletsPerimetre actif={perimetre} options={options} />

          {courant?.valeurs ? (
            <Section
              titre={`${courant.etat === 'en_cours' ? 'Mois en cours' : 'Dernier mois'} : ${dateFr(courant.debut, { month: 'long', year: 'numeric' })} (M${rangMois(t.cibles, courant.debut) + 1})`}
              sousTitre={`Mesuré au ${dateFr(courant.valeurs.mesure_au, { day: 'numeric', month: 'long' })} · ${nombre(courant.valeurs.precollecteurs_actifs)} précollecteur${courant.valeurs.precollecteurs_actifs > 1 ? 's' : ''} avec des ménages inscrits · cibles de fin de mois`}
            >
              <GrilleMoisCourant t={t} mois={courant} />
            </Section>
          ) : (
            <div className="card-soft">
              <EmptyState icon={BarChart3} titre="Le pilote n’a pas encore commencé" texte={`Premier relevé à partir du ${dateFr(t.pilote.debut, { day: 'numeric', month: 'long' })}.`} />
            </div>
          )}

          <Section
            titre="Suivi mensuel"
            sousTitre="Le tableau du point d’étape avec le Technipole : valeur, cible et verdict de chaque mois. Un mois clos est figé."
            className="mt-6"
            flush
          >
            <TableauMensuel t={t} />
          </Section>

          <Section titre="Semaine par semaine" sousTitre="Relevé consolidé chaque lundi, historisé." className="mt-6" flush>
            <SuiviHebdo t={t} />
          </Section>

          <Section
            titre="Critères de réussite au 31 décembre"
            sousTitre="Livrable Technipole, chapitre 1.3 : le pilote est concluant si les quatre sont tenus."
            className="mt-6"
            flush
          >
            <Criteres t={t} />
          </Section>

          <Methode t={t} grace={courant?.valeurs?.delai_grace_jours ?? null} />
        </>
      )}
    </PortalShell>
  );
}
