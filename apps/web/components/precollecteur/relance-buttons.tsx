'use client';

import { useState, useTransition } from 'react';
import { Check, MessageCircle, MessageSquareText, Phone } from 'lucide-react';
import { enregistrerRelanceAction } from '@/lib/precollecteur/actions';
import { telInternational } from '@/lib/format';

/**
 * Relance en un geste : ouvre WhatsApp / SMS / l'appel avec un message prérédigé
 * ET trace la relance en base (qui, quand, par quel canal, à quel niveau).
 * Sans prestataire SMS, c'est le téléphone du précollecteur qui envoie : aucun coût.
 */
export function RelanceButtons({
  clientId,
  factureId,
  telephone,
  message,
  niveau,
  derniere,
}: {
  clientId: string;
  factureId: string | null;
  telephone: string | null;
  message: string;
  niveau: number;
  derniere?: string | null;
}) {
  const [fait, setFait] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const intl = telInternational(telephone);

  const tracer = (canal: 'whatsapp' | 'sms' | 'appel') => {
    startTransition(async () => {
      const r = await enregistrerRelanceAction({ factureId, clientId, canal, niveau, message });
      if (!r.error) setFait(canal);
    });
  };

  if (!intl) {
    return <span className="text-small text-muted-foreground">Pas de téléphone enregistré</span>;
  }

  const texte = encodeURIComponent(message);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <a
        href={`https://wa.me/${intl}?text=${texte}`}
        target="_blank"
        rel="noreferrer"
        onClick={() => tracer('whatsapp')}
        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md bg-[#1FA855] px-3 text-body-sm font-semibold text-white hover:bg-[#1a944b]"
      >
        <MessageCircle size={16} /> WhatsApp
      </a>
      <a
        href={`sms:+${intl}?body=${texte}`}
        onClick={() => tracer('sms')}
        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-input bg-surface px-3 text-body-sm font-semibold hover:bg-muted"
      >
        <MessageSquareText size={16} /> SMS
      </a>
      <a
        href={`tel:+${intl}`}
        onClick={() => tracer('appel')}
        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-input bg-surface px-3 text-body-sm font-semibold hover:bg-muted"
        aria-label="Appeler"
      >
        <Phone size={16} />
      </a>
      {fait ? (
        <span className="flex items-center gap-1 text-small font-semibold text-terrain-ok">
          <Check size={14} /> Relance tracée
        </span>
      ) : (
        derniere && <span className="text-small text-muted-foreground">Dernière : {derniere}</span>
      )}
    </div>
  );
}
