import { KeyRound, MessageCircle } from 'lucide-react';
import { Section } from '@/components/ui/blocks';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { creerCodeAgrementAction, revoquerCodeAgrementAction } from '@/lib/mairie/actions';
import { dateFr, telInternational, telLisible } from '@/lib/format';
import { ETATS_CODE, etatCode, formaterCode, type CodeAgrement } from '@/lib/agrement';

/**
 * La Mairie délivre les codes d'agrément : sans lui, un précollecteur ne peut
 * pas créer son espace. Un code sert une fois, 30 jours au plus. Il est
 * délivré pour une commune de la Mairie, et l'espace créé y est rattaché.
 */
export function CodesAgrement({
  codes,
  communes,
  choixLibre,
  origine,
}: {
  codes: CodeAgrement[];
  /** Communes pour lesquelles ce compte délivre (les siennes ; toutes pour l'administrateur). */
  communes: { id: string; nom: string }[];
  /** Administrateur : commune facultative. */
  choixLibre: boolean;
  origine: string;
}) {
  const unique = !choixLibre && communes.length === 1;
  return (
    <Section
      titre="Codes d’agrément"
      sousTitre="Un précollecteur ne crée son espace qu’avec un code délivré ici : une seule fois, valable 30 jours, rattaché à la commune du code."
      className="mt-6"
      flush
    >
      {!choixLibre && communes.length === 0 ? (
        <p className="border-b border-border px-5 py-4 text-body-sm text-muted-foreground">
          Aucune commune n’est rattachée à votre compte : vous ne pouvez pas encore délivrer de code.
        </p>
      ) : (
        <ActionForm action={creerCodeAgrementAction} resetOnSuccess className="grid gap-3 border-b border-border p-5 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-end">
          <div>
            <label htmlFor="ca-destinataire" className="field-label">Précollecteur agréé *</label>
            <input id="ca-destinataire" name="destinataire" required minLength={2} maxLength={120} className="field" placeholder="ex. Propreté Mvog-Ada" />
          </div>
          <div>
            <label htmlFor="ca-telephone" className="field-label">Téléphone</label>
            <input id="ca-telephone" name="telephone" type="tel" className="field" placeholder="6 XX XX XX XX" />
          </div>
          <div>
            <label htmlFor="ca-commune" className="field-label">Commune{choixLibre ? '' : ' *'}</label>
            <select id="ca-commune" name="commune_id" className="field" defaultValue={unique ? communes[0]!.id : ''} required={!choixLibre}>
              {!unique && <option value="">{choixLibre ? '—' : '— Choisir —'}</option>}
              {communes.map((c) => (
                <option key={c.id} value={c.id}>{c.nom}</option>
              ))}
            </select>
          </div>
          <SubmitButton pendingLabel="Création…">
            <KeyRound size={16} /> Délivrer un code
          </SubmitButton>
        </ActionForm>
      )}

      {codes.length === 0 ? (
        <p className="px-5 py-6 text-body-sm text-muted-foreground">Aucun code délivré pour le moment.</p>
      ) : (
        <ul className="divide-y divide-border" data-testid="codes-agrement">
          {codes.map((c) => {
            const etat = etatCode(c);
            const e = ETATS_CODE[etat];
            const message = `Bonjour ${c.destinataire}, la Mairie vous délivre votre code d’agrément MyKlinTown : ${formaterCode(c.code)}. Créez votre espace précollecteur sur ${origine}/signup?role=precollecteur : ce code vous sera demandé (une seule fois, valable jusqu’au ${dateFr(c.expire_at)}).`;
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-brand-ink">
                    {c.destinataire} <span className={e.chip}>{e.label}</span>
                  </p>
                  <p className="text-small text-muted-foreground">
                    {[c.communes?.nom, c.telephone ? telLisible(c.telephone) : null, `délivré le ${dateFr(c.created_at)}`].filter(Boolean).join(' · ')}
                    {etat === 'en_attente' && ` · valable jusqu’au ${dateFr(c.expire_at)}`}
                    {etat === 'utilise' && c.utilise_at && ` · espace « ${c.entreprises?.nom ?? '—'} » créé le ${dateFr(c.utilise_at)}`}
                  </p>
                </div>
                {etat === 'en_attente' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="num rounded-md bg-muted px-3 py-1.5 text-body tracking-widest text-brand-ink" aria-label={`Code ${c.code.split('').join(' ')}`}>
                      {formaterCode(c.code)}
                    </strong>
                    <a
                      href={`https://wa.me/${telInternational(c.telephone) ?? ''}?text=${encodeURIComponent(message)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary"
                    >
                      <MessageCircle size={16} /> WhatsApp
                    </a>
                    <form action={revoquerCodeAgrementAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <SubmitButton variant="ghost" pendingLabel="…">Révoquer</SubmitButton>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
