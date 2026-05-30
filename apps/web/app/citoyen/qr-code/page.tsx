import { Download, Printer, QrCode, ShieldCheck, Smartphone, Sticker } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { DEMO_USERS } from '@/lib/portal-config';

export default function CitoyenQRCode() {
  return (
    <PortalShell portalKey="citoyen" user={DEMO_USERS.citoyen} currentPath="/citoyen/qr-code">
      <div className="space-y-6">
        <header>
          <h1>Mon QR Code de service</h1>
          <p className="text-body text-muted-foreground">
            Le QR Code unique de votre foyer. Imprimez-le, plastifiez-le et fixez-le sur votre portail
            ou sur votre bac pour permettre la preuve de passage du collecteur.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* QR Code Card — Hero */}
          <section className="card-soft p-8 lg:col-span-2">
            <div className="grid items-center gap-8 md:grid-cols-2">
              <div className="grid place-items-center">
                <div className="relative">
                  <div className="absolute -inset-2 rounded-2xl bg-brand-gradient-soft" aria-hidden />
                  <div className="relative grid place-items-center rounded-2xl border-4 border-foreground bg-white p-6">
                    <QrCode size={220} strokeWidth={1.5} className="text-foreground" />
                  </div>
                </div>
                <p className="mt-4 font-mono text-body-sm text-muted-foreground">
                  MKT-YDE3-NSAM-C0427
                </p>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-small uppercase tracking-wider text-muted-foreground">
                    Identification
                  </p>
                  <h2 className="m-0">Famille TSANGA</h2>
                  <p className="text-body-sm text-muted-foreground">
                    Nsam-Efoulan · Yaoundé III · Cameroun
                  </p>
                </div>
                <ul className="space-y-2 text-body-sm">
                  <li className="flex items-start gap-2">
                    <ShieldCheck size={16} className="mt-1 text-brand-green" />
                    Code <strong>unique et infalsifiable</strong> généré par MyKlinTown.
                  </li>
                  <li className="flex items-start gap-2">
                    <Smartphone size={16} className="mt-1 text-brand-green" />
                    Scanné par le collecteur via l'app Collecteur Pro à chaque passage.
                  </li>
                  <li className="flex items-start gap-2">
                    <Sticker size={16} className="mt-1 text-brand-green" />
                    À fixer en évidence sur le portail ou directement sur le bac.
                  </li>
                </ul>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button type="button" className="btn-primary">
                    <Printer size={16} /> Imprimer en A5
                  </button>
                  <button type="button" className="btn-outline">
                    <Download size={16} /> Télécharger PNG
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Status */}
          <section className="card-soft space-y-4 p-6">
            <h2 className="m-0">Statut du QR Code</h2>
            <dl className="space-y-3 text-body-sm">
              <div className="flex justify-between border-b border-border pb-2">
                <dt className="text-muted-foreground">Activé le</dt>
                <dd className="font-semibold">14 mars 2026</dd>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <dt className="text-muted-foreground">Dernier scan</dt>
                <dd className="font-semibold">Hier · 06:42</dd>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <dt className="text-muted-foreground">Scans 30 jours</dt>
                <dd className="font-semibold">8 passages</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">État</dt>
                <dd>
                  <span className="badge-success">Actif</span>
                </dd>
              </div>
            </dl>
            <button type="button" className="btn-outline w-full">
              Demander un duplicata
            </button>
          </section>
        </div>

        {/* Instructions */}
        <section className="card-soft p-6">
          <h2>Mode d'emploi</h2>
          <ol className="mt-3 grid gap-4 md:grid-cols-3">
            <li className="rounded-lg border border-border p-4">
              <span className="grid h-8 w-8 place-content-center rounded-full bg-brand-blue text-body-sm font-bold text-white">
                1
              </span>
              <p className="mt-3 font-semibold">Imprimer</p>
              <p className="text-body-sm text-muted-foreground">
                Bouton "Imprimer en A5" — format optimal pour la lisibilité depuis la rue.
              </p>
            </li>
            <li className="rounded-lg border border-border p-4">
              <span className="grid h-8 w-8 place-content-center rounded-full bg-brand-blue text-body-sm font-bold text-white">
                2
              </span>
              <p className="mt-3 font-semibold">Plastifier</p>
              <p className="text-body-sm text-muted-foreground">
                Pour résister à la pluie et au soleil. Pochette plastique transparente suffit.
              </p>
            </li>
            <li className="rounded-lg border border-border p-4">
              <span className="grid h-8 w-8 place-content-center rounded-full bg-brand-blue text-body-sm font-bold text-white">
                3
              </span>
              <p className="mt-3 font-semibold">Fixer</p>
              <p className="text-body-sm text-muted-foreground">
                À hauteur d'homme, côté rue. Le collecteur le scanne en 2 secondes.
              </p>
            </li>
          </ol>
        </section>
      </div>
    </PortalShell>
  );
}
