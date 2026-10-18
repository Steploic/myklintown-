import { DOCUMENTS } from '@/lib/documents';

/**
 * Case obligatoire « J'ai lu et j'accepte la charte et le contrat » (liens
 * vers les textes en vigueur, ouverts à côté pour ne pas perdre la saisie).
 */
export function CaseDocuments({
  id = 'documents',
  name = 'documents',
  checked,
  onChange,
}: {
  id?: string;
  name?: string;
  checked?: boolean;
  onChange?: (coche: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 rounded-lg border border-input bg-muted/40 p-3 text-left text-body-sm">
      <input
        id={id}
        name={name}
        type="checkbox"
        required
        {...(onChange ? { checked: !!checked, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.checked) } : {})}
        className="mt-0.5 h-5 w-5 shrink-0 accent-[#3E9A5E]"
      />
      <span>
        J’ai lu et j’accepte la{' '}
        <a href={DOCUMENTS.charte_menage.chemin} target="_blank" rel="noreferrer" className="font-semibold text-brand-blue underline">
          charte du ménage
        </a>{' '}
        et le{' '}
        <a href={DOCUMENTS.contrat_menage.chemin} target="_blank" rel="noreferrer" className="font-semibold text-brand-blue underline">
          contrat d’abonnement
        </a>
        .
      </span>
    </label>
  );
}
