import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Eye, FilePlus2, ScrollText } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { PageHeader, Section } from '@/components/ui/blocks';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import {
  creerVersionAction,
  majBrouillonAction,
  publierVersionAction,
  supprimerBrouillonAction,
} from '@/lib/admin/documents-actions';
import { DOCUMENTS, TYPES_DOCUMENTS, type DocumentLegal } from '@/lib/documents';
import { getSupabase, row, rows, utilisateurCourant } from '@/lib/server';
import { dateFr, nombre } from '@/lib/format';

export const metadata = { title: 'Charte et contrat' };

const AIDE_FORMAT = 'Texte simple : « ## Titre » pour une section, « - » en début de ligne pour une liste, une ligne vide entre deux paragraphes.';

/** Charte du ménage et contrat d'abonnement — administrateurs MyKlinTown uniquement. */
export default async function DocumentsPage() {
  const supabase = await getSupabase();
  const user = await utilisateurCourant(supabase);
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').maybeSingle();
  if (row<{ role: string }>(p)?.role !== 'admin') redirect('/dashboard');

  const [{ data: d }, { data: a }] = await Promise.all([
    supabase.from('documents_legaux').select('*').order('version', { ascending: false }),
    supabase.from('acceptations_documents').select('document_id'),
  ]);
  const documents = rows<DocumentLegal>(d);
  const acceptations = new Map<string, number>();
  for (const x of rows<{ document_id: string }>(a)) acceptations.set(x.document_id, (acceptations.get(x.document_id) ?? 0) + 1);

  return (
    <PortalShell portalKey="mairie" currentPath="/dashboard/documents">
      <PageHeader
        titre="Charte et contrat"
        sousTitre="Textes que chaque ménage accepte (en ligne, ou sur papier remis par son précollecteur). Une version publiée ne se modifie plus : on en publie une nouvelle, que les ménages acceptent à leur tour."
      />
      <div className="grid gap-6">
        {TYPES_DOCUMENTS.map((type) => {
          const versions = documents.filter((x) => x.type === type);
          const publiees = versions.filter((x) => x.publie_at);
          const enVigueur = publiees[0];
          const brouillons = versions.filter((x) => !x.publie_at);
          const modele = versions[0];
          const { libelle, chemin } = DOCUMENTS[type];
          return (
            <Section key={type} titre={libelle} sousTitre={enVigueur ? `Version ${enVigueur.version} en vigueur` : 'Aucune version publiée'}>
              <div className="space-y-5">
                {publiees.length > 0 && (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {publiees.map((v) => (
                      <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-body-sm">
                        <span className="flex flex-wrap items-center gap-2">
                          <ScrollText size={16} className="text-muted-foreground" />
                          <span className="num font-semibold text-brand-ink">v{v.version}</span>
                          <span>{v.titre}</span>
                          {v === enVigueur ? <span className="chip-ok">En vigueur</span> : <span className="chip-neutre">Remplacée</span>}
                          {v.provisoire && <span className="chip-relance">Provisoire</span>}
                        </span>
                        <span className="flex flex-wrap items-center gap-3 text-muted-foreground">
                          <span>publiée le {dateFr(v.publie_at)}</span>
                          <span className="num">{nombre(acceptations.get(v.id) ?? 0)} acceptation{(acceptations.get(v.id) ?? 0) > 1 ? 's' : ''}</span>
                          <Link href={`${chemin}?version=${v.version}`} target="_blank" className="font-semibold text-brand-blue hover:underline">Lire</Link>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {brouillons.map((b) => (
                  <div key={b.id} className="rounded-lg border border-terrain-relance/30 bg-terrain-relance/5 p-4">
                    <p className="mb-3 flex flex-wrap items-center gap-2 font-semibold text-brand-ink">
                      <span className="chip-relance">Brouillon</span> Version {b.version}
                      <Link href={`${chemin}?version=${b.version}`} target="_blank" className="btn-ghost -my-2 ml-auto">
                        <Eye size={16} /> Aperçu
                      </Link>
                    </p>
                    <ActionForm action={majBrouillonAction} className="space-y-3">
                      <input type="hidden" name="id" value={b.id} />
                      <ChampsTexte titre={b.titre} contenu={b.contenu} provisoire={b.provisoire} prefixe={b.id} />
                      <SubmitButton variant="outline">Enregistrer le brouillon</SubmitButton>
                    </ActionForm>
                    <div className="mt-4 flex flex-wrap items-start gap-4 border-t border-border pt-4">
                      <ActionForm action={publierVersionAction} className="flex-1 space-y-2">
                        <input type="hidden" name="id" value={b.id} />
                        <label className="flex items-start gap-2 text-body-sm">
                          <input type="checkbox" name="confirmer" required className="mt-0.5 h-5 w-5 shrink-0 accent-[#3E9A5E]" />
                          <span>J’ai relu cette version. Publiée, elle ne se modifie plus et chaque ménage devra l’accepter.</span>
                        </label>
                        <SubmitButton pendingLabel="Publication…">Publier la version {b.version}</SubmitButton>
                      </ActionForm>
                      <ActionForm action={supprimerBrouillonAction}>
                        <input type="hidden" name="id" value={b.id} />
                        <SubmitButton variant="ghost" pendingLabel="…">Supprimer le brouillon</SubmitButton>
                      </ActionForm>
                    </div>
                  </div>
                ))}

                {brouillons.length === 0 && (
                  <details className="group rounded-lg border border-border">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-semibold text-brand-blue">
                      <FilePlus2 size={16} /> Rédiger la version {(modele?.version ?? 0) + 1}
                    </summary>
                    <ActionForm action={creerVersionAction} className="space-y-3 border-t border-border p-4">
                      <input type="hidden" name="type" value={type} />
                      <ChampsTexte titre={modele?.titre ?? libelle} contenu={modele?.contenu ?? ''} provisoire={false} prefixe={type} />
                      <SubmitButton>Créer le brouillon</SubmitButton>
                    </ActionForm>
                  </details>
                )}
              </div>
            </Section>
          );
        })}
      </div>
    </PortalShell>
  );
}

function ChampsTexte({ titre, contenu, provisoire, prefixe }: { titre: string; contenu: string; provisoire: boolean; prefixe: string }) {
  return (
    <>
      <div>
        <label className="field-label" htmlFor={`${prefixe}-titre`}>Titre</label>
        <input id={`${prefixe}-titre`} name="titre" required minLength={3} maxLength={200} defaultValue={titre} className="field" />
      </div>
      <div>
        <label className="field-label" htmlFor={`${prefixe}-contenu`}>Texte</label>
        <textarea id={`${prefixe}-contenu`} name="contenu" required rows={14} defaultValue={contenu} className="field min-h-[16rem] font-mono text-body-sm" />
        <p className="field-hint">{AIDE_FORMAT}</p>
      </div>
      <label className="flex items-center gap-2 text-body-sm">
        <input type="checkbox" name="provisoire" defaultChecked={provisoire} className="h-5 w-5 accent-[#3E9A5E]" />
        Version provisoire (signalée aux ménages comme telle)
      </label>
    </>
  );
}
