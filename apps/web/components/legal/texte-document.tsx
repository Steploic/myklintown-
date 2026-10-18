import { decouperDocument } from '@/lib/documents';

/**
 * Texte d'un document légal, rendu bloc par bloc en nœuds texte React : un
 * contenu qui contiendrait des balises s'affiche tel quel, il n'est jamais
 * interprété.
 */
export function TexteDocument({ contenu }: { contenu: string }) {
  return (
    <div className="space-y-4 text-body">
      {decouperDocument(contenu).map((b, i) => {
        if (b.type === 'titre') {
          return b.niveau === 2 ? (
            <h2 key={i} className="pt-2">{b.texte}</h2>
          ) : (
            <h3 key={i} className="pt-1 font-semibold text-brand-ink">{b.texte}</h3>
          );
        }
        if (b.type === 'liste') {
          return (
            <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-brand-green">
              {b.elements.map((e, j) => (
                <li key={j}>{e}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{b.texte}</p>;
      })}
    </div>
  );
}
