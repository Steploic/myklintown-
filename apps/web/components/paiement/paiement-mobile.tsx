'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2, Smartphone } from 'lucide-react';
import { cn } from '@myklintown/ui';
import { CANAUX, operateurProbable, type Canal } from '@/lib/paiement/regles';
import { statutPaiementAction, type ResultatDemande } from '@/lib/paiement/actions';
import { fcfa } from '@/lib/format';

const INTERVALLE_MS = 3_000;
const ATTENTE_MAX_MS = 4 * 60_000;

type Etape = 'saisie' | 'attente' | 'reussi' | 'echec';

/**
 * Paiement Mobile Money : opérateur + numéro, puis le client valide sur son
 * téléphone (message de l'opérateur, code secret). On suit le statut jusqu'au
 * bout ; le paiement n'est compté qu'une fois confirmé par Notch Pay.
 */
export function PaiementMobile({
  montant,
  telephoneParDefaut,
  demander,
  libelle = 'Payer',
  pourAutrui = false,
}: {
  montant: number;
  telephoneParDefaut?: string | null;
  demander: (canal: Canal, telephone: string) => Promise<ResultatDemande>;
  libelle?: string;
  /** Le téléphone qui valide est celui du ménage, pas celui de l'utilisateur (tournée). */
  pourAutrui?: boolean;
}) {
  const router = useRouter();
  const [telephone, setTelephone] = useState(telephoneParDefaut ?? '');
  const [canal, setCanal] = useState<Canal | null>(operateurProbable(telephoneParDefaut));
  const [etape, setEtape] = useState<Etape>('saisie');
  const [message, setMessage] = useState('');
  const [reference, setReference] = useState<string | null>(null);
  const [enCours, start] = useTransition();
  const debut = useRef(0);
  // Plusieurs paiements possibles sur une même page (une facture chacun).
  const id = useId();

  // Opérateur pré-coché d'après le numéro (modifiable).
  const changerTelephone = (v: string) => {
    setTelephone(v);
    const probable = operateurProbable(v);
    if (probable) setCanal(probable);
  };

  const lancer = () => {
    setMessage('');
    if (!canal) return setMessage('Choisissez MTN Mobile Money ou Orange Money.');
    start(async () => {
      const r = await demander(canal, telephone);
      if (r.error || !r.reference) {
        setMessage(r.error ?? 'Le paiement n’a pas pu être lancé.');
        return;
      }
      debut.current = Date.now();
      setReference(r.reference);
      setEtape('attente');
    });
  };

  useEffect(() => {
    if (etape !== 'attente' || !reference) return;
    let fini = false;
    const t = setInterval(async () => {
      if (fini) return;
      const s = await statutPaiementAction(reference);
      if (s.statut === 'reussi') {
        fini = true;
        setEtape('reussi');
        router.refresh();
      } else if (s.statut === 'echoue' || s.statut === 'annule' || s.statut === 'expire') {
        fini = true;
        setMessage(s.message ?? (s.statut === 'annule' ? 'Paiement annulé.' : s.statut === 'expire' ? 'Demande expirée.' : 'Le paiement a échoué.'));
        setEtape('echec');
      } else if (Date.now() - debut.current > ATTENTE_MAX_MS) {
        fini = true;
        setMessage('Toujours aucune validation. Si le montant a été débité, il sera pris en compte dès confirmation de l’opérateur.');
        setEtape('echec');
      }
    }, INTERVALLE_MS);
    return () => {
      fini = true;
      clearInterval(t);
    };
  }, [etape, reference, router]);

  if (etape === 'reussi') {
    return (
      <p role="status" className="flex items-center gap-2 rounded-lg border border-terrain-ok/25 bg-terrain-ok/5 px-4 py-3 font-semibold text-terrain-ok">
        <CheckCircle2 size={20} /> Paiement de {fcfa(montant)} reçu. Merci !
      </p>
    );
  }

  if (etape === 'attente') {
    return (
      <div role="status" className="rounded-lg border border-brand-blue/20 bg-brand-blue/5 p-4">
        <p className="flex items-center gap-2 font-semibold text-brand-ink">
          <Loader2 size={18} className="animate-spin" /> En attente de validation sur le téléphone
        </p>
        <p className="mt-1 text-body-sm text-muted-foreground">
          {pourAutrui ? 'Le ménage reçoit' : 'Vous recevez'} un message {canal ? CANAUX[canal].court : ''} sur le {telephone} :{' '}
          {pourAutrui ? 'il saisit' : 'saisissez'} {pourAutrui ? 'son' : 'votre'} code secret pour valider {fcfa(montant)}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="field-label">Opérateur</legend>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(CANAUX) as Canal[]).map((c) => (
            <label
              key={c}
              className={cn(
                'flex min-h-[44px] cursor-pointer items-center justify-center rounded-md border px-3 text-body-sm font-semibold',
                canal === c ? 'border-brand-green bg-brand-green/10 text-brand-ink' : 'border-input text-muted-foreground',
              )}
            >
              <input type="radio" name={`canal-${id}`} value={c} checked={canal === c} onChange={() => setCanal(c)} className="sr-only" />
              {CANAUX[c].court}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="field-label" htmlFor={`tel-${id}`}>Numéro {pourAutrui ? 'du ménage' : 'Mobile Money'}</label>
        <input
          id={`tel-${id}`}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={telephone}
          onChange={(e) => changerTelephone(e.target.value)}
          className="field"
          placeholder="6 XX XX XX XX"
        />
      </div>
      {message && (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-terrain-stop/25 bg-terrain-stop/5 px-3 py-2 text-body-sm text-terrain-stop">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {message}
        </p>
      )}
      <button type="button" onClick={lancer} disabled={enCours} className="btn-primary w-full">
        {enCours ? <Loader2 size={16} className="animate-spin" /> : <Smartphone size={16} />} {libelle} {fcfa(montant)}
      </button>
      {etape === 'echec' && (
        <p className="text-small text-muted-foreground">Vous pouvez corriger le numéro et réessayer.</p>
      )}
    </div>
  );
}
