'use client';

import { useState, useTransition } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Check, Loader2, Phone, Send, Truck } from 'lucide-react';
import { cn } from '@myklintown/ui';
import { LocationPicker } from '@/components/map/location-picker';
import { chercherPrecollecteursAction, deposerDemandeAction, souscrireAction, type PrecollecteurTrouve } from '@/lib/client/actions';
import { fcfa, telLisible } from '@/lib/format';
import type { Plan } from '@/lib/types';

const ETAPES = ['Formule', 'Adresse', 'Précollecteur'];

/**
 * Parcours d'abonnement du ménage (cahier des fonctionnalités §2.1) :
 * formule dans la grille unifiée → adresse et position → la plateforme trouve
 * le(s) précollecteur(s) de la zone → demande envoyée au précollecteur choisi.
 */
export function Souscription({ plans, nomDefaut, telDefaut }: { plans: Plan[]; nomDefaut: string; telDefaut: string }) {
  const [etape, setEtape] = useState(0);
  const [planId, setPlanId] = useState(plans[0]?.id ?? '');
  const [nom, setNom] = useState(nomDefaut);
  const [telephone, setTelephone] = useState(telDefaut);
  const [quartier, setQuartier] = useState('');
  const [adresse, setAdresse] = useState('');
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [trouves, setTrouves] = useState<PrecollecteurTrouve[] | null>(null);
  const [choix, setChoix] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, startTransition] = useTransition();

  const plan = plans.find((p) => p.id === planId);

  const versPrecollecteurs = () => {
    setErreur('');
    if (!nom.trim() || !telephone.trim()) return setErreur('Nom et téléphone sont nécessaires pour que le précollecteur vous contacte.');
    if (!pos) return setErreur('Placez votre domicile sur la carte (ou utilisez « Ma position »).');
    startTransition(async () => {
      const r = await chercherPrecollecteursAction(pos[0], pos[1]);
      setTrouves(r);
      setChoix(r[0]?.entreprise_id ?? '');
      setEtape(2);
    });
  };

  // R3 : plus d'impasse — la demande est enregistrée et proposée aux précollecteurs.
  const transmettre = () => {
    if (!pos) return;
    setErreur('');
    startTransition(async () => {
      const r = await deposerDemandeAction({ planId, nom, telephone, adresse, quartier, lat: pos[0], lng: pos[1] });
      if (r?.error) setErreur(r.error);
    });
  };

  const envoyer = () => {
    if (!pos || !choix) return;
    setErreur('');
    startTransition(async () => {
      const r = await souscrireAction({ entrepriseId: choix, planId, nom, telephone, adresse, quartier, lat: pos[0], lng: pos[1] });
      // En cas de succès, le serveur redirige lui-même vers /citoyen?demande=1.
      if (r?.error) setErreur(r.error);
    });
  };

  return (
    <div className="card-soft overflow-hidden">
      <ol className="flex border-b border-border">
        {ETAPES.map((e, i) => (
          <li
            key={e}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 py-3 text-body-sm font-semibold',
              i === etape ? 'text-brand-ink' : i < etape ? 'text-terrain-ok' : 'text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'grid h-6 w-6 place-content-center rounded-full text-small',
                i === etape ? 'bg-brand-ink text-white' : i < etape ? 'bg-terrain-ok text-white' : 'bg-muted',
              )}
            >
              {i < etape ? <Check size={14} /> : i + 1}
            </span>
            <span className="hidden sm:inline">{e}</span>
          </li>
        ))}
      </ol>

      <div className="p-5 sm:p-6">
        {etape === 0 && (
          <div className="space-y-4">
            <h2>Choisissez votre formule</h2>
            <p className="text-body-sm text-muted-foreground">Mêmes prix chez tous les précollecteurs partenaires.</p>
            <div className="grid gap-3 md:grid-cols-3">
              {plans.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setPlanId(p.id)}
                  className={cn(
                    'rounded-xl border p-4 text-left transition-colors',
                    planId === p.id ? 'border-brand-green bg-brand-green/5 ring-1 ring-brand-green' : 'border-input hover:border-brand-green/60',
                  )}
                >
                  <p className="font-semibold text-brand-ink">{p.nom}</p>
                  <p className="num text-h2 font-bold text-brand-green">{fcfa(p.prix_fcfa)}</p>
                  <p className="text-small text-muted-foreground">{p.duree_mois === 1 ? 'par mois' : `pour ${p.duree_mois} mois`}</p>
                  <ul className="mt-2 space-y-1 text-small">
                    {p.avantages.map((a) => (
                      <li key={a} className="flex gap-1.5"><Check size={14} className="mt-0.5 shrink-0 text-brand-green" /> {a}</li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button type="button" className="btn-primary" disabled={!planId} onClick={() => setEtape(1)}>
                Continuer <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {etape === 1 && (
          <div className="space-y-4">
            <h2>Où habitez-vous ?</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="s-nom">Nom du foyer</label>
                <input id="s-nom" value={nom} onChange={(e) => setNom(e.target.value)} className="field" />
              </div>
              <div>
                <label className="field-label" htmlFor="s-tel">Téléphone</label>
                <input id="s-tel" type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} className="field" placeholder="6 XX XX XX XX" />
              </div>
              <div>
                <label className="field-label" htmlFor="s-q">Quartier</label>
                <input id="s-q" value={quartier} onChange={(e) => setQuartier(e.target.value)} className="field" placeholder="ex. Nsam" />
              </div>
              <div>
                <label className="field-label" htmlFor="s-a">Repère</label>
                <input id="s-a" value={adresse} onChange={(e) => setAdresse(e.target.value)} className="field" placeholder="ex. Portail bleu après la pharmacie" />
              </div>
            </div>
            <LocationPicker defaut={pos} onChange={(lat, lng) => setPos([lat, lng])} />
            {erreur && <Erreur texte={erreur} />}
            <div className="flex justify-between">
              <button type="button" className="btn-outline" onClick={() => setEtape(0)}>
                <ArrowLeft size={16} /> Retour
              </button>
              <button type="button" className="btn-primary" onClick={versPrecollecteurs} disabled={enCours}>
                {enCours ? <Loader2 size={16} className="animate-spin" /> : null} Trouver mon précollecteur <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {etape === 2 && (
          <div className="space-y-4">
            <h2>Votre précollecteur</h2>
            {trouves && trouves.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl bg-brand-blue/5 p-6 text-center">
                <Send size={30} className="text-brand-blue" />
                <p className="font-semibold text-brand-ink">Votre quartier n’a pas encore de précollecteur partenaire attitré.</p>
                <p className="max-w-md text-body-sm text-muted-foreground">
                  Transmettez votre demande : elle est proposée aux précollecteurs MyKlinTown, et le premier qui la
                  prend en charge vous appelle pour démarrer. Vous suivez son avancement depuis votre espace.
                </p>
                {erreur && <Erreur texte={erreur} />}
                <button type="button" className="btn-primary" onClick={transmettre} disabled={enCours}>
                  {enCours ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Transmettre ma demande
                </button>
                <div className="flex flex-wrap justify-center gap-2">
                  <button type="button" className="btn-ghost" onClick={() => setEtape(1)}>
                    <ArrowLeft size={16} /> Corriger ma position
                  </button>
                  <a href="/citoyen" className="btn-ghost">J’ai déjà un code client</a>
                </div>
              </div>
            ) : (
              <>
                <p className="text-body-sm text-muted-foreground">
                  Votre domicile est dans la zone <strong>{trouves?.[0]?.zone_nom}</strong>.
                  {trouves && trouves.length > 1 ? ' Plusieurs précollecteurs y travaillent : choisissez.' : ''}
                </p>
                <div className="space-y-2">
                  {trouves?.map((t) => (
                    <label
                      key={t.entreprise_id}
                      className="flex cursor-pointer items-center gap-4 rounded-xl border border-input p-4 has-[:checked]:border-brand-green has-[:checked]:bg-brand-green/5"
                    >
                      <input type="radio" name="precollecteur" value={t.entreprise_id} checked={choix === t.entreprise_id} onChange={() => setChoix(t.entreprise_id)} className="h-5 w-5 accent-[#3E9A5E]" />
                      <span className="grid h-10 w-10 place-content-center rounded-lg bg-brand-teal/10 text-brand-teal"><Truck size={20} /></span>
                      <span className="flex-1">
                        <span className="block font-semibold text-brand-ink">{t.entreprise_nom}</span>
                        <span className="flex items-center gap-1 text-small text-muted-foreground"><Phone size={12} /> {telLisible(t.entreprise_telephone)}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="rounded-lg bg-muted/60 p-3 text-body-sm">
                  Récapitulatif : formule <strong>{plan?.nom}</strong> à <strong>{fcfa(plan?.prix_fcfa)}</strong>. Le précollecteur
                  valide votre demande, puis vous réglez la première période (espèces ou Mobile Money) avant le premier passage.
                </div>
                {erreur && <Erreur texte={erreur} />}
                <div className="flex justify-between">
                  <button type="button" className="btn-outline" onClick={() => setEtape(1)}>
                    <ArrowLeft size={16} /> Retour
                  </button>
                  <button type="button" className="btn-primary" onClick={envoyer} disabled={!choix || enCours}>
                    {enCours ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Envoyer ma demande
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Erreur({ texte }: { texte: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-md border border-terrain-stop/25 bg-terrain-stop/5 px-3 py-2 text-body-sm text-terrain-stop">
      <AlertCircle size={16} className="mt-0.5 shrink-0" /> {texte}
    </p>
  );
}
