import Link from 'next/link';
import { Logo } from '@myklintown/ui';
import { PrintButton } from '@/components/ui/print-button';
import { requireEntreprise } from '@/lib/precollecteur/context';
import { rows } from '@/lib/server';
import { qrSvg } from '@/lib/qr';
import { nomFichier, telLisible } from '@/lib/format';
import { disposition, enPages, formatDepuis } from '@/lib/planche';

export async function generateMetadata() {
  const { entreprise } = await requireEntreprise();
  // Le nom du PDF enregistré = le titre de la page.
  return { title: { absolute: `Planche_QR_${nomFichier(entreprise.nom)}_${new Date().toISOString().slice(0, 10)}` } };
}

interface Client {
  id: string;
  nom: string;
  code: string;
  quartier: string | null;
}

/**
 * Planche pour l'imprimeur : toutes les étiquettes QR des clients, en
 * 10 × 15 cm espacées de 0,5 cm, une page = 1 m² (vinyle facturé au m²).
 * « Imprimer → Enregistrer en PDF » donne le fichier à envoyer, au bon format.
 * `?ids=a,b,c` : seulement ces clients ; `?largeur=&hauteur=&ecart=&page=` (mm)
 * si l'imprimeur change de format.
 */
export default async function PlancheQrPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const { supabase, entreprise } = await requireEntreprise();
  let requete = supabase
    .from('clients')
    .select('id, nom, code, quartier')
    .eq('entreprise_id', entreprise.id)
    .eq('est_demo', false)
    .neq('statut', 'resilie')
    .order('quartier', { nullsFirst: false })
    .order('nom');
  const ids = (params.ids ?? '').split(',').filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (ids.length) requete = requete.in('id', ids);
  const { data } = await requete;
  const clients = rows<Client>(data);

  const f = formatDepuis(params);
  const d = disposition(f);
  const pages = enPages(clients, d.parPage);
  const qrs = new Map(await Promise.all(clients.map(async (c) => [c.id, await qrSvg(c.code)] as const)));
  const mm = (v: number) => `${v}mm`;
  // Le QR prend 70 % de la largeur ; le texte suit la taille de l'étiquette.
  const k = f.largeur / 100;

  return (
    <div className="min-h-screen bg-muted px-4 py-6 print:bg-white print:p-0">
      <style
        dangerouslySetInnerHTML={{
          __html: `
@page { size: ${mm(f.page)} ${mm(f.page)}; margin: 0; }
@media screen { .planche-page { zoom: 0.32; } }
@media print { .planche-page { break-after: page; page-break-after: always; } .planche-page:last-child { break-after: auto; } }`,
        }}
      />
      <div className="no-print mx-auto mb-5 max-w-3xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/precollecteur/clients" className="btn-ghost">← Clients</Link>
          <PrintButton label="Imprimer / Enregistrer en PDF" />
        </div>
        <div className="card-soft p-4 text-body-sm">
          <p className="font-semibold text-brand-ink">
            {clients.length} étiquette{clients.length > 1 ? 's' : ''} · {pages.length} page{pages.length > 1 ? 's' : ''} de {f.page / 1000 === 1 ? '1 m²' : `${f.page / 10} × ${f.page / 10} cm`}
          </p>
          <p className="mt-1 text-muted-foreground">
            Étiquettes de {f.largeur / 10} × {f.hauteur / 10} cm, espacées de {f.ecart / 10} cm : {d.colonnes} colonnes × {d.rangees} rangées ={' '}
            {d.parPage} par page. Dans la fenêtre d’impression : destination <strong>Enregistrer au format PDF</strong>, marges{' '}
            <strong>Aucune</strong>, échelle <strong>100 %</strong>, <strong>graphiques d’arrière-plan</strong> cochés.
          </p>
          <p className="mt-1 text-muted-foreground">Aperçu réduit à l’écran ; le PDF est en taille réelle.</p>
        </div>
      </div>

      {pages.map((page, i) => (
        <section
          key={i}
          className="planche-page impression-fidele relative mx-auto mb-6 bg-white shadow-elevated print:mb-0 print:shadow-none"
          style={{ width: mm(f.page), height: mm(f.page) }}
        >
          <div
            className="absolute grid"
            style={{
              left: mm(d.margeX),
              top: mm(d.margeY),
              gridTemplateColumns: `repeat(${d.colonnes}, ${mm(f.largeur)})`,
              gridAutoRows: mm(f.hauteur),
              gap: mm(f.ecart),
            }}
          >
            {page.map((c) => (
              <article
                key={c.id}
                className="flex flex-col overflow-hidden border-brand-ink bg-white text-center"
                style={{ width: mm(f.largeur), height: mm(f.hauteur), borderWidth: mm(0.6 * k), borderRadius: mm(6 * k) }}
              >
                <header
                  className="flex items-center justify-between bg-brand-gradient-ink text-white"
                  style={{ padding: `${mm(4 * k)} ${mm(5 * k)}` }}
                >
                  <Logo size={Math.round(30 * k)} variant="bare" />
                  <span className="font-semibold uppercase text-brand-leaf" style={{ fontSize: `${9 * k}pt`, letterSpacing: '0.08em' }}>
                    Abonné
                  </span>
                </header>
                <div className="flex flex-1 flex-col items-center" style={{ padding: `${mm(4 * k)} ${mm(5 * k)}` }}>
                  <div style={{ width: mm(70 * k), height: mm(70 * k) }} dangerouslySetInnerHTML={{ __html: qrs.get(c.id)! }} />
                  <p className="num font-bold text-brand-ink" style={{ fontSize: `${17 * k}pt`, letterSpacing: '0.1em', marginTop: mm(2 * k) }}>
                    {c.code}
                  </p>
                  <p className="font-semibold leading-tight text-brand-ink" style={{ fontSize: `${12 * k}pt` }}>{c.nom}</p>
                  {c.quartier && <p className="text-muted-foreground" style={{ fontSize: `${9.5 * k}pt` }}>{c.quartier}</p>}
                  <div
                    className="w-full rounded-lg bg-brand-green/10 text-terrain-ok"
                    style={{ marginTop: 'auto', padding: `${mm(2.5 * k)} ${mm(3 * k)}`, fontSize: `${9 * k}pt` }}
                  >
                    Collecte assurée par <strong>{entreprise.nom}</strong>
                    {entreprise.telephone && <span className="block">{telLisible(entreprise.telephone)}</span>}
                  </div>
                  <p className="leading-snug text-muted-foreground" style={{ fontSize: `${7 * k}pt`, marginTop: mm(2 * k) }}>
                    Suivez vos passages et vos factures : créez votre compte MyKlinTown, puis saisissez ce code et votre téléphone.
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      {clients.length === 0 && <p className="no-print text-center text-muted-foreground">Aucun client à imprimer.</p>}
    </div>
  );
}
