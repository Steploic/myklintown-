import { ClipboardList, HardHat, Save, ShieldCheck } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { DEMO_USERS } from '@/lib/portal-config';

const EPI = [
  { id: 'gants', label: 'Gants de protection' },
  { id: 'masque', label: 'Masque FFP2' },
  { id: 'chaussures', label: 'Chaussures de sécurité' },
  { id: 'gilet', label: 'Gilet haute visibilité' },
  { id: 'lunettes', label: 'Lunettes de protection' },
];

const RAPPORTS = [
  { id: 'QHSE-2026-0526', date: '26 mai 2026', tournee: 'Nsam · Matin', epi: 'Complet', incidents: 0 },
  { id: 'QHSE-2026-0525', date: '25 mai 2026', tournee: 'Nsam · Matin', epi: 'Complet', incidents: 1 },
  { id: 'QHSE-2026-0524', date: '24 mai 2026', tournee: 'Nsam · Soir', epi: 'Complet', incidents: 0 },
];

export default function CollecteurQHSE() {
  return (
    <PortalShell portalKey="collecteur" user={DEMO_USERS.collecteur} currentPath="/collecteur/qhse">
      <div className="space-y-6">
        <header>
          <h1>Rapport QHSE</h1>
          <p className="text-body text-muted-foreground">
            Qualité, Hygiène, Sécurité, Environnement. À remplir en fin de tournée pour les archives
            de la Mairie.
          </p>
        </header>

        <form className="card-soft space-y-6 p-6">
          <fieldset className="space-y-3">
            <legend className="flex items-center gap-2 text-h2-sm font-semibold">
              <HardHat size={20} className="text-brand-blue" /> Équipements de Protection Individuelle
            </legend>
            <p className="text-body-sm text-muted-foreground">
              Cochez les EPI portés durant la tournée.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {EPI.map((e) => (
                <label
                  key={e.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 transition-colors has-[:checked]:border-brand-green has-[:checked]:bg-brand-green/5"
                >
                  <input
                    type="checkbox"
                    name={`epi-${e.id}`}
                    defaultChecked
                    className="h-5 w-5 accent-brand-green"
                  />
                  <span className="text-body-sm font-medium">{e.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <label htmlFor="incidents" className="text-h2-sm font-semibold">
              Incidents observés
            </label>
            <textarea
              id="incidents"
              rows={4}
              placeholder="Décrivez tout incident, blessure, ou anomalie observée pendant la tournée..."
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="ressources" className="text-h2-sm font-semibold">
              Ressources manquantes
            </label>
            <textarea
              id="ressources"
              rows={3}
              placeholder="EPI en rupture, consommables, pièces, etc."
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-h2-sm font-semibold">État du camion en fin de tournée</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {(['Opérationnel', 'À surveiller', 'Maintenance requise'] as const).map((etat, i) => (
                <label
                  key={etat}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 has-[:checked]:border-brand-green has-[:checked]:bg-brand-green/5"
                >
                  <input type="radio" name="etat-camion" defaultChecked={i === 0} className="accent-brand-green" />
                  <span className="text-body-sm font-medium">{etat}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <p className="flex items-center gap-2 text-body-sm text-muted-foreground">
              <ShieldCheck size={16} className="text-brand-green" />
              Rapport horodaté et envoyé automatiquement à la Mairie.
            </p>
            <button type="submit" className="btn-primary">
              <Save size={16} /> Soumettre le rapport
            </button>
          </div>
        </form>

        {/* Historique */}
        <section className="card-soft overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="m-0 flex items-center gap-2">
              <ClipboardList size={18} className="text-brand-blue" /> Rapports précédents
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead className="border-b border-border bg-muted text-left text-small uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Référence</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Tournée</th>
                  <th className="px-5 py-3 font-medium">EPI</th>
                  <th className="px-5 py-3 font-medium">Incidents</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {RAPPORTS.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <td className="px-5 py-3 font-mono text-small text-muted-foreground">{r.id}</td>
                    <td className="px-5 py-3">{r.date}</td>
                    <td className="px-5 py-3">{r.tournee}</td>
                    <td className="px-5 py-3"><span className="badge-success">{r.epi}</span></td>
                    <td className="px-5 py-3 font-semibold">{r.incidents}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PortalShell>
  );
}
