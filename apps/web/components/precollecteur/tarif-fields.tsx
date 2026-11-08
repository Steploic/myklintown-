import { FREQUENCES, VOLUMES_SACS } from '@/lib/devis';

export interface TarifDefaut {
  tarif?: number | null;
  mois?: number | null;
  passages?: number | null;
  sacs?: boolean | null;
  volume?: number | null;
}

const PERIODES = [1, 3, 6, 12];

/**
 * Tarif convenu avec l'abonné (plus de grille commune, retours de l'équipe du
 * 08/11/2026) : montant de chaque facture, période qu'elle couvre, passages par
 * semaine, sacs fournis. Sert au devis comme à la fiche client.
 */
export function TarifFields({ defaut, id = 't' }: { defaut?: TarifDefaut; id?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor={`${id}-tarif`} className="field-label">Montant de chaque facture (FCFA) *</label>
        <input id={`${id}-tarif`} name="tarif_fcfa" type="number" inputMode="numeric" min={0} max={10000000} step={50} required
          defaultValue={defaut?.tarif ?? ''} className="field num" placeholder="ex. 3500" />
      </div>
      <div>
        <label htmlFor={`${id}-mois`} className="field-label">Période facturée</label>
        <select id={`${id}-mois`} name="facturation_mois" defaultValue={String(defaut?.mois ?? 1)} className="field">
          {PERIODES.map((m) => <option key={m} value={m}>{m === 1 ? 'Chaque mois' : `Tous les ${m} mois`}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-passages`} className="field-label">Passages par semaine</label>
        <select id={`${id}-passages`} name="passages_semaine" defaultValue={String(defaut?.passages ?? 2)} className="field">
          {FREQUENCES.map((f) => <option key={f.valeur} value={f.valeur}>{f.label}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-body-sm font-semibold text-brand-ink">
          <input type="checkbox" name="sacs_inclus" defaultChecked={!!defaut?.sacs} className="h-4 w-4 accent-[#30823A]" />
          Sacs poubelles fournis
        </label>
        <label htmlFor={`${id}-volume`} className="sr-only">Volume des sacs fournis</label>
        <select id={`${id}-volume`} name="sacs_volume_litres" defaultValue={String(defaut?.volume ?? 50)} className="field">
          {VOLUMES_SACS.map((v) => <option key={v} value={v}>Sacs de {v} litres</option>)}
        </select>
      </div>
    </div>
  );
}
