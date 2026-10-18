import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { PrintButton } from '@/components/ui/print-button';
import { TexteDocument } from '@/components/legal/texte-document';
import { getSupabase } from '@/lib/server';
import { DOCUMENTS, lireDocument, versionsPubliees, type TypeDocument } from '@/lib/documents';
import { dateFr } from '@/lib/format';

/**
 * Page publique d'un document légal (charte du ménage, contrat d'abonnement) :
 * lisible avant toute inscription, version par version (`?version=N`).
 */
export async function PageDocument({ type, version }: { type: TypeDocument; version: number | null }) {
  const supabase = await getSupabase();
  const [doc, versions] = await Promise.all([lireDocument(supabase, type, version), versionsPubliees(supabase, type)]);
  const { libelle, chemin } = DOCUMENTS[type];
  const derniere = versions[0]?.version;

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <div className="no-print">
        <SiteHeader />
      </div>
      <main className="container max-w-3xl flex-1 space-y-6 py-12 print:py-0">
        {!doc ? (
          <section className="card-soft space-y-2 p-6">
            <h1>{libelle}</h1>
            <p className="text-body-sm text-muted-foreground">
              {version ? `La version ${version} de ce document n’existe pas ou n’est pas publiée.` : 'Ce document n’est pas encore publié.'}
            </p>
            {version && derniere && (
              <Link href={chemin} className="btn-outline">Lire la version en vigueur</Link>
            )}
          </section>
        ) : (
          <>
            <header className="space-y-2">
              <p className="text-small font-semibold uppercase tracking-wider text-brand-green">{libelle}</p>
              <h1>{doc.titre}</h1>
              <p className="flex flex-wrap items-center gap-2 text-body-sm text-muted-foreground">
                <span className="num">Version {doc.version}</span>
                {doc.publie_at ? <span>· publiée le {dateFr(doc.publie_at, { day: 'numeric', month: 'long', year: 'numeric' })}</span> : <span className="chip-relance">Brouillon (visible des administrateurs seulement)</span>}
                {doc.provisoire && <span className="chip-relance">Version provisoire</span>}
                {doc.publie_at && derniere && doc.version < derniere && <span className="chip-neutre">Remplacée par la version {derniere}</span>}
              </p>
            </header>
            <article className="card-soft p-6 sm:p-8 print:border-0 print:p-0 print:shadow-none">
              <TexteDocument contenu={doc.contenu} />
            </article>
            <div className="no-print flex flex-wrap items-center justify-between gap-3">
              <PrintButton label="Imprimer" />
              {versions.length > 1 && (
                <nav aria-label="Versions publiées" className="flex flex-wrap items-center gap-2 text-body-sm">
                  <span className="text-muted-foreground">Versions :</span>
                  {versions.map((v) => (
                    <Link
                      key={v.version}
                      href={v.version === derniere ? chemin : `${chemin}?version=${v.version}`}
                      aria-current={v.version === doc.version ? 'page' : undefined}
                      className={v.version === doc.version ? 'chip-info num' : 'chip-neutre num hover:underline'}
                    >
                      v{v.version}
                    </Link>
                  ))}
                </nav>
              )}
            </div>
          </>
        )}
        <p className="no-print text-body-sm text-muted-foreground">
          Voir aussi :{' '}
          {Object.entries(DOCUMENTS)
            .filter(([t]) => t !== type)
            .map(([t, d]) => (
              <Link key={t} href={d.chemin} className="font-semibold text-brand-blue hover:underline">{d.libelle}</Link>
            ))}
          {' · '}
          <Link href="/legal" className="font-semibold text-brand-blue hover:underline">Mentions légales</Link>
        </p>
      </main>
      <div className="no-print">
        <SiteFooter />
      </div>
    </div>
  );
}
