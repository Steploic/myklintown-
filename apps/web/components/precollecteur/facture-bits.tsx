import { Banknote } from 'lucide-react';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { enregistrerPaiementAction } from '@/lib/precollecteur/actions';
import { METHODES_PAIEMENT } from '@/lib/format';

/** Encaissement d'une facture : espèces par défaut (canal dominant du pilote). */
export function PaiementForm({
  factureId,
  resteDu,
  employes,
  compact,
}: {
  factureId: string;
  resteDu: number;
  employes: { id: string; nom: string }[];
  compact?: boolean;
}) {
  return (
    <details className="group" open={!compact}>
      <summary className="btn-primary cursor-pointer list-none">
        <Banknote size={16} /> Encaisser
      </summary>
      <ActionForm action={enregistrerPaiementAction} className="mt-3 space-y-3 rounded-lg border border-border bg-muted/40 p-3">
        <input type="hidden" name="facture_id" value={factureId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor={`montant-${factureId}`}>Montant reçu (FCFA)</label>
            <input id={`montant-${factureId}`} name="montant" type="number" inputMode="numeric" min={1} defaultValue={resteDu} className="field num" required />
          </div>
          <div>
            <label className="field-label" htmlFor={`methode-${factureId}`}>Moyen de paiement</label>
            <select id={`methode-${factureId}`} name="methode" className="field" defaultValue="especes">
              {Object.entries(METHODES_PAIEMENT).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor={`ref-${factureId}`}>Référence (MoMo / virement)</label>
            <input id={`ref-${factureId}`} name="reference" className="field" placeholder="ex. MP240928.1532.A12345" />
          </div>
          <div>
            <label className="field-label" htmlFor={`par-${factureId}`}>Encaissé par</label>
            <select id={`par-${factureId}`} name="encaisse_par" className="field" defaultValue="">
              <option value="">Moi (gérant)</option>
              {employes.map((e) => (
                <option key={e.id} value={e.id}>{e.nom}</option>
              ))}
            </select>
          </div>
        </div>
        <SubmitButton className="w-full sm:w-auto">Enregistrer le paiement</SubmitButton>
      </ActionForm>
    </details>
  );
}
