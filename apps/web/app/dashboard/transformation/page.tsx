import { ArrowRight, Boxes, Factory, PackageCheck, Recycle, Scale } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { StatCard } from '@/components/stat-card';
import { DEMO_USERS } from '@/lib/portal-config';

const FLUX = [
  { matiere: 'Plastique', entree: 14.7, produit: 'Granulés PET', sortie: 9.6, rendement: 65 },
  { matiere: 'Métal', entree: 4.1, produit: 'Concassé alu/acier', sortie: 3.9, rendement: 95 },
  { matiere: 'Papier/Carton', entree: 11.4, produit: 'Compacté revente', sortie: 11.0, rendement: 96 },
  { matiere: 'Verre', entree: 6.8, produit: 'Verre concassé', sortie: 6.5, rendement: 95 },
  { matiere: 'Organique', entree: 31.4, produit: 'Compost', sortie: 22.0, rendement: 70 },
];

const ENTREES = [
  { date: '26 mai · 11:42', camion: 'Δ-217', tonnage: '3,2 t', secteur: 'Nsam' },
  { date: '26 mai · 10:58', camion: 'Δ-184', tonnage: '4,1 t', secteur: 'Mvog-Mbi' },
  { date: '26 mai · 10:14', camion: 'Δ-093', tonnage: '2,8 t', secteur: 'Efoulan' },
  { date: '25 mai · 18:33', camion: 'Δ-217', tonnage: '3,5 t', secteur: 'Nsam' },
];

const SORTIES = [
  { date: '26 mai', recycleur: 'Plastica Cameroun', produit: 'Granulés PET', qte: '4,2 t', mont: '1,6 M' },
  { date: '25 mai', recycleur: 'CIMENCAM Recycling', produit: 'Métaux', qte: '2,8 t', mont: '3,4 M' },
  { date: '23 mai', recycleur: 'Papeterie Mvolyé', produit: 'Carton compacté', qte: '1,9 t', mont: '162 K' },
];

export default function DashboardTransformation() {
  return (
    <PortalShell portalKey="mairie" user={DEMO_USERS.mairie} currentPath="/dashboard/transformation">
      <div className="space-y-6">
        <header>
          <h1>Transformation</h1>
          <p className="text-body text-muted-foreground">
            Suivi des flux entrants à l'entrepôt et produits sortants vendus aux recycleurs.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Scale} label="Entrées (mois)" value="68,4 t" accent="blue" delta={{ value: '+12 % vs M-1', positive: true }} />
          <StatCard icon={Boxes} label="Stock entrepôt" value="22,8 t" accent="teal" />
          <StatCard icon={PackageCheck} label="Sorties (mois)" value="53,0 t" accent="green" />
          <StatCard icon={Recycle} label="Taux transformation" value="78 %" accent="warning" delta={{ value: 'Cible 80%', positive: false }} />
        </div>

        {/* Flux par matière */}
        <section className="card-soft overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="m-0 flex items-center gap-2">
              <Factory size={18} className="text-brand-blue" /> Bilan par matière (mois en cours)
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {FLUX.map((f) => (
              <li key={f.matiere} className="grid grid-cols-12 items-center gap-3 px-5 py-4">
                <span className="col-span-2 font-semibold">{f.matiere}</span>
                <span className="col-span-2 flex items-center gap-1 text-body-sm">
                  {f.entree} t <ArrowRight size={14} className="text-muted-foreground" />
                </span>
                <span className="col-span-3 text-body-sm text-muted-foreground">{f.produit}</span>
                <span className="col-span-2 text-body-sm font-semibold">{f.sortie} t</span>
                <div className="col-span-2">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${f.rendement >= 90 ? 'bg-brand-green' : f.rendement >= 70 ? 'bg-warning' : 'bg-danger'}`}
                      style={{ width: `${f.rendement}%` }}
                    />
                  </div>
                </div>
                <span className="col-span-1 text-right text-body-sm font-bold">{f.rendement}%</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Entrées */}
          <section className="card-soft overflow-hidden">
            <div className="border-b border-border p-5">
              <h2 className="m-0 flex items-center gap-2">
                <Scale size={18} className="text-brand-blue" /> Entrées récentes
              </h2>
              <p className="text-small text-muted-foreground">Pesées à l'entrepôt.</p>
            </div>
            <ul className="divide-y divide-border">
              {ENTREES.map((e, i) => (
                <li key={i} className="flex items-center justify-between px-5 py-3 text-body-sm">
                  <div>
                    <p className="font-semibold">Camion {e.camion} · {e.secteur}</p>
                    <p className="text-small text-muted-foreground">{e.date}</p>
                  </div>
                  <span className="font-bold text-brand-blue">{e.tonnage}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Sorties */}
          <section className="card-soft overflow-hidden">
            <div className="border-b border-border p-5">
              <h2 className="m-0 flex items-center gap-2">
                <PackageCheck size={18} className="text-brand-green" /> Sorties (ventes)
              </h2>
              <p className="text-small text-muted-foreground">Livraisons aux recycleurs partenaires.</p>
            </div>
            <ul className="divide-y divide-border">
              {SORTIES.map((s, i) => (
                <li key={i} className="flex items-center justify-between px-5 py-3 text-body-sm">
                  <div>
                    <p className="font-semibold">{s.produit}</p>
                    <p className="text-small text-muted-foreground">{s.date} · {s.recycleur} · {s.qte}</p>
                  </div>
                  <span className="font-bold text-brand-green">{s.mont} FCFA</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </PortalShell>
  );
}
