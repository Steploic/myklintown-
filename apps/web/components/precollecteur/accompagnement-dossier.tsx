import { CheckCircle2, LifeBuoy } from 'lucide-react';
import { Section } from '@/components/ui/blocks';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { demanderAccompagnementAction, retirerAccompagnementAction } from '@/lib/precollecteur/accompagnement-actions';
import { estOuverte, ETAPES_CONFORMITE, STATUT_POUR_GERANT, type Accompagnement, type EtapeConformite } from '@/lib/accompagnement';
import { dateFr } from '@/lib/format';

interface Ligne {
  etape: EtapeConformite;
  titre: string;
  aide: string;
  communeId: string | null;
  /** La pièce est déjà au dossier. */
  faite: boolean;
  libelleFaite: string;
}

/**
 * « Se mettre en règle, avec MyKlinTown » (migration 20261127000029) : pour
 * chaque étape qui manque, le gérant demande à être accompagné ; il suit ici
 * sa demande et lit le message de l'équipe.
 */
export function AccompagnementDossier({
  demandes,
  niuRenseigne,
  permisDepose,
  communes,
}: {
  demandes: Accompagnement[];
  niuRenseigne: boolean;
  permisDepose: boolean;
  communes: { id: string; nom: string; autorisationDeposee: boolean }[];
}) {
  const etape = (cle: EtapeConformite) => ETAPES_CONFORMITE.find((e) => e.cle === cle)!;
  const lignes: Ligne[] = [
    { ...etape('structure'), etape: 'structure', communeId: null, faite: false, libelleFaite: '' },
    { ...etape('niu'), etape: 'niu', communeId: null, faite: niuRenseigne, libelleFaite: 'NIU renseigné' },
    ...communes.map((c) => ({
      ...etape('autorisation'),
      etape: 'autorisation' as const,
      titre: `Autorisation de la commune : ${c.nom}`,
      communeId: c.id,
      faite: c.autorisationDeposee,
      libelleFaite: 'Pièce au dossier',
    })),
    { ...etape('permis'), etape: 'permis', communeId: null, faite: permisDepose, libelleFaite: 'Pièce au dossier' },
  ];
  // La demande la plus récente de chaque étape (et commune).
  const derniere = (l: Ligne) => demandes.find((d) => d.etape === l.etape && (d.commune_id ?? null) === l.communeId);

  return (
    <Section
      className="mt-6"
      titre="Se mettre en règle, avec MyKlinTown"
      sousTitre="MyKlinTown ne présente aux abonnés que des précollecteurs habilités. Il vous manque une pièce ? L’équipe vous accompagne dans vos démarches."
    >
      <ul className="divide-y divide-border rounded-lg border border-border" data-testid="accompagnement">
        {lignes.map((l) => {
          const d = derniere(l);
          const cle = `${l.etape}-${l.communeId ?? ''}`;
          return (
            <li key={cle} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-brand-ink">{l.titre}</p>
                <p className="text-small text-muted-foreground">{l.aide}</p>
                {d && (
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-small">
                    <span className={STATUT_POUR_GERANT[d.statut].chip}>{STATUT_POUR_GERANT[d.statut].label}</span>
                    <span className="text-muted-foreground">demandé le {dateFr(d.created_at)}</span>
                  </p>
                )}
                {d?.message_equipe && (
                  <p className="mt-2 rounded-md bg-brand-blue/5 px-3 py-2 text-body-sm text-brand-ink">
                    <strong>Message de l’équipe MyKlinTown :</strong> {d.message_equipe}
                  </p>
                )}
              </div>
              <div className="shrink-0">
                {d && estOuverte(d.statut) ? (
                  <ActionForm action={retirerAccompagnementAction}>
                    <input type="hidden" name="id" value={d.id} />
                    <SubmitButton variant="outline" pendingLabel="…">Retirer ma demande</SubmitButton>
                  </ActionForm>
                ) : l.faite ? (
                  <span className="inline-flex items-center gap-1.5 text-small font-semibold text-terrain-ok">
                    <CheckCircle2 size={14} aria-hidden /> {l.libelleFaite}
                  </span>
                ) : d?.statut === 'obtenue' ? null : (
                  <details className="w-72 max-w-full">
                    <summary className="btn-outline inline-flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
                      <LifeBuoy size={16} aria-hidden /> Être accompagné
                    </summary>
                    <ActionForm action={demanderAccompagnementAction} className="mt-2 space-y-2">
                      <input type="hidden" name="etape" value={l.etape} />
                      {l.communeId && <input type="hidden" name="commune_id" value={l.communeId} />}
                      <label className="field-label" htmlFor={`acc-${cle}`}>
                        Où en êtes-vous ? (facultatif)
                      </label>
                      <textarea id={`acc-${cle}`} name="message" maxLength={500} rows={2} className="field" placeholder="Ce qui bloque, ce que vous avez déjà fait…" />
                      <SubmitButton pendingLabel="Envoi…">Demander l’accompagnement</SubmitButton>
                    </ActionForm>
                  </details>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
