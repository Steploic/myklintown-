import { redirect } from 'next/navigation';
import { GraduationCap, MessageCircle, Phone } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { EmptyState, Kpi, PageHeader, Section } from '@/components/ui/blocks';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { suivreAccompagnementAction } from '@/lib/admin/accompagnement-actions';
import { estOuverte, STATUT_POUR_EQUIPE, titreEtape, type Accompagnement, type StatutAccompagnement } from '@/lib/accompagnement';
import { getCurrentProfile } from '@/lib/get-profile';
import { getSupabase, rows } from '@/lib/server';
import { dateFr, telInternational, telLisible } from '@/lib/format';

export const metadata = { title: 'Accompagnements' };

type Demande = Accompagnement & {
  communes: { nom: string } | null;
  entreprises: { id: string; nom: string; telephone: string | null; dossier_statut: string } | null;
};

const STATUTS = Object.entries(STATUT_POUR_EQUIPE) as [StatutAccompagnement, string][];

/**
 * Accompagnement des précollecteurs vers la conformité (migration
 * 20261127000029) : les demandes d'aide, à suivre par l'équipe MyKlinTown.
 * Une pièce déposée au dossier clôt la demande d'elle-même.
 */
export default async function AccompagnementsPage() {
  const profil = await getCurrentProfile();
  if (profil?.role !== 'admin') redirect('/dashboard');
  const supabase = await getSupabase();
  const { data } = await supabase
    .from('accompagnements')
    .select('id, etape, commune_id, statut, message, message_equipe, created_at, updated_at, communes(nom), entreprises(id, nom, telephone, dossier_statut)')
    .order('created_at', { ascending: false })
    .limit(300);
  const demandes = rows<Demande>(data);
  const aSuivre = demandes.filter((d) => estOuverte(d.statut)).reverse(); // la plus ancienne d'abord
  const terminees = demandes.filter((d) => !estOuverte(d.statut)).slice(0, 50);
  const obtenues = demandes.filter((d) => d.statut === 'obtenue').length;
  const accompagnes = new Set(demandes.map((d) => d.entreprises?.id).filter(Boolean)).size;

  const etape = (d: Demande) => (d.etape === 'autorisation' && d.communes ? `Autorisation de la commune : ${d.communes.nom}` : titreEtape(d.etape));

  return (
    <PortalShell portalKey="mairie" currentPath="/dashboard/accompagnements">
      <PageHeader
        titre="Accompagnement vers la conformité"
        sousTitre="Les précollecteurs qui demandent de l’aide pour se mettre en règle. Une pièce déposée à leur dossier clôt la demande d’elle-même."
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="À suivre" valeur={aSuivre.length} icon={GraduationCap} ton="relance" />
        <Kpi label="Pièces obtenues" valeur={obtenues} icon={GraduationCap} ton="ok" />
        <Kpi label="Précollecteurs accompagnés" valeur={accompagnes} icon={GraduationCap} ton="info" />
      </div>

      <Section titre={`À suivre (${aSuivre.length})`} className="mb-6">
        {aSuivre.length === 0 ? (
          <EmptyState icon={GraduationCap} titre="Aucune demande à suivre" texte="Un précollecteur demande de l’aide depuis son dossier, à côté de chaque pièce qui lui manque." />
        ) : (
          <ul className="space-y-3" data-testid="accompagnements-a-suivre">
            {aSuivre.map((d) => (
              <CarteDemande key={d.id} d={d} etape={etape(d)} />
            ))}
          </ul>
        )}
      </Section>

      {terminees.length > 0 && (
        <Section titre="Terminées">
          <ul className="divide-y divide-border rounded-lg border border-border">
            {terminees.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-body-sm">
                <span>
                  <strong>{d.entreprises?.nom ?? '—'}</strong> · {etape(d)}
                </span>
                <span className="text-muted-foreground">
                  {STATUT_POUR_EQUIPE[d.statut]} · {dateFr(d.updated_at)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </PortalShell>
  );
}

function CarteDemande({ d, etape }: { d: Demande; etape: string }) {
  const tel = d.entreprises?.telephone ?? null;
  const international = telInternational(tel);
  const texte = `Bonjour, ici l’équipe MyKlinTown. Vous avez demandé à être accompagné pour : ${etape}. Quand pouvons-nous en parler ?`;
  return (
    <li className="card-soft space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-brand-ink">{d.entreprises?.nom ?? '—'}</p>
          <p className="text-body-sm">{etape}</p>
          <p className="text-small text-muted-foreground">demandé le {dateFr(d.created_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tel && (
            <a href={`tel:${tel}`} className="btn-outline inline-flex items-center gap-1.5">
              <Phone size={14} aria-hidden /> {telLisible(tel)}
            </a>
          )}
          {international && (
            <a href={`https://wa.me/${international}?text=${encodeURIComponent(texte)}`} target="_blank" rel="noreferrer" className="btn-outline inline-flex items-center gap-1.5">
              <MessageCircle size={14} aria-hidden /> WhatsApp
            </a>
          )}
        </div>
      </div>
      {d.message && <p className="rounded-md bg-muted/60 px-3 py-2 text-body-sm">« {d.message} »</p>}
      <ActionForm action={suivreAccompagnementAction} className="grid gap-2 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
        <input type="hidden" name="id" value={d.id} />
        <div>
          <label className="field-label" htmlFor={`statut-${d.id}`}>Où en est-on ?</label>
          <select id={`statut-${d.id}`} name="statut" defaultValue={d.statut} className="field">
            {STATUTS.map(([valeur, label]) => (
              <option key={valeur} value={valeur}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor={`message-${d.id}`}>Message au précollecteur (il le lit dans son dossier)</label>
          <textarea id={`message-${d.id}`} name="message" defaultValue={d.message_equipe ?? ''} maxLength={1000} rows={1} className="field" />
        </div>
        <SubmitButton pendingLabel="…">Enregistrer</SubmitButton>
      </ActionForm>
    </li>
  );
}
