import { Camera, Video } from 'lucide-react';

/** Vignette d'une preuve photo ou vidéo (URL signée). */
export function Preuve({ url, type, capture }: { url?: string; type: 'photo' | 'video' | null; capture?: string | null }) {
  if (!url || !type) {
    return (
      <span className="grid h-20 w-24 shrink-0 place-content-center rounded-md bg-muted text-muted-foreground" title="Sans média">
        <Camera size={18} />
      </span>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="group relative block h-20 w-24 shrink-0 overflow-hidden rounded-md bg-brand-ink" title={capture ? `Capturé le ${new Date(capture).toLocaleString('fr-FR')}` : undefined}>
      {type === 'photo' ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={url} alt="Preuve" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
      ) : (
        <>
          <video src={url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
          <span className="absolute inset-0 grid place-content-center bg-black/30 text-white">
            <Video size={20} />
          </span>
        </>
      )}
    </a>
  );
}
