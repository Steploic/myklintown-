'use client';

import { useState, useTransition } from 'react';
import { AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, Check, Loader2, LocateFixed, Send } from 'lucide-react';
import { cn } from '@myklintown/ui';
import { CaseDocuments } from '@/components/client/case-documents';
import { CarteVitrine } from '@/components/annuaire/carte-vitrine';
import { chercherAnnuaireAction, deposerDemandeDevisAction } from '@/lib/client/actions';
import {
  ACCES_VOIE,
  CATEGORIES,
  FREQUENCES,
  GABARITS,
  QUESTIONS,
  VOLUMES_SACS,
  type Categorie,
  type Question,
  type Reponses,
} from '@/lib/devis';

const ETAPES = ['Lieu', 'Coordonnées', 'Besoins', 'Envoi'];

type Fiche = { id: string; nom: string; devise: string | null; logo_path: string | null };

/**
 * Demande de devis (fiche « Formulaires de devis » de l'équipe) : le lieu à
 * collecter, le tronc commun (contact, quartier, repère, accès), les besoins
 * (fréquence, sacs, questions de la catégorie), puis la position — seulement
 * sur place — et le précollecteur, choisi dans l'annuaire ou laissé ouvert.
 */
export function DemandeDevis({
  communes,
  nomDefaut,
  telDefaut,
}: {
  communes: { id: string; nom: string }[];
  nomDefaut: string;
  telDefaut: string;
}) {
  const [etape, setEtape] = useState(0);
  const [categorie, setCategorie] = useState<Categorie | ''>('');
  const [nom, setNom] = useState(nomDefaut);
  const [telephone, setTelephone] = useState(telDefaut);
  const [memeWhatsapp, setMemeWhatsapp] = useState(true);
  const [whatsapp, setWhatsapp] = useState('');
  const [communeId, setCommuneId] = useState('');
  const [quartier, setQuartier] = useState('');
  const [repere, setRepere] = useState('');
  const [accesVoie, setAccesVoie] = useState('');
  const [gabaritMax, setGabaritMax] = useState('');
  const [pluies, setPluies] = useState(false);
  const [passages, setPassages] = useState(2);
  const [sacs, setSacs] = useState(false);
  const [volume, setVolume] = useState<number>(50);
  const [reponses, setReponses] = useState<Reponses>({});
  const [surPlace, setSurPlace] = useState(false);
  const [position, setPosition] = useState<{ lat: number; lng: number; precision: number } | null>(null);
  const [fiches, setFiches] = useState<Fiche[] | null>(null);
  const [cible, setCible] = useState('');
  const [accepte, setAccepte] = useState(false);
  const [erreur, setErreur] = useState('');
  const [enCours, startTransition] = useTransition();
  const [localisation, setLocalisation] = useState(false);

  const repondre = (cle: string, v: string | number | boolean | string[] | undefined) =>
    setReponses((r) => {
      const n = { ...r };
      if (v === undefined || v === '') delete n[cle];
      else n[cle] = v;
      return n;
    });

  const suivant = () => {
    setErreur('');
    if (etape === 0 && !categorie) return setErreur('Choisissez le lieu à collecter.');
    if (etape === 1) {
      if (!nom.trim() || !telephone.trim()) return setErreur('Nom et téléphone sont nécessaires pour que le précollecteur vous contacte.');
      if (!communeId) return setErreur('Choisissez votre arrondissement (commune) : la demande part aux précollecteurs qui y travaillent.');
      if (!quartier.trim()) return setErreur('Indiquez votre quartier.');
      if (!repere.trim()) return setErreur('Indiquez un repère précis : carrefour, bâtiment, couleur du portail…');
    }
    if (etape === 2) {
      startTransition(async () => {
        setFiches(await chercherAnnuaireAction(quartier));
        setEtape(3);
      });
      return;
    }
    setEtape((e) => e + 1);
  };

  const localiser = () => {
    setErreur('');
    if (!navigator.geolocation) return setErreur('Votre téléphone ne donne pas sa position : le repère suffira.');
    setLocalisation(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude, precision: Math.round(p.coords.accuracy) });
        setLocalisation(false);
      },
      () => {
        setLocalisation(false);
        setErreur('Position indisponible : autorisez la localisation, ou laissez-la de côté (le repère suffit).');
      },
      { enableHighAccuracy: true, timeout: 20_000 },
    );
  };

  const envoyer = () => {
    if (!categorie) return;
    setErreur('');
    startTransition(async () => {
      const r = await deposerDemandeDevisAction({
        categorie,
        nom,
        telephone,
        whatsapp: memeWhatsapp ? telephone : whatsapp,
        communeId,
        quartier,
        repere,
        accesVoie,
        gabaritMax,
        inaccessiblePluies: pluies,
        passagesSemaine: passages,
        sacsBesoin: sacs,
        sacsVolumeLitres: sacs ? volume : null,
        details: reponses,
        lat: surPlace && position ? position.lat : null,
        lng: surPlace && position ? position.lng : null,
        entrepriseCible: cible || null,
        documentsAcceptes: accepte,
      });
      // En cas de succès, le serveur redirige vers /citoyen.
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
            <span className={cn('grid h-6 w-6 place-content-center rounded-full text-small', i === etape ? 'bg-brand-ink text-white' : i < etape ? 'bg-terrain-ok text-white' : 'bg-muted')}>
              {i < etape ? <Check size={14} /> : i + 1}
            </span>
            <span className="hidden sm:inline">{e}</span>
          </li>
        ))}
      </ol>

      <div className="space-y-5 p-5 sm:p-6">
        {etape === 0 && (
          <>
            <h2>Où faut-il collecter ?</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {CATEGORIES.map((c) => (
                <button
                  type="button"
                  key={c.cle}
                  onClick={() => {
                    setCategorie(c.cle);
                    setReponses({});
                  }}
                  aria-pressed={categorie === c.cle}
                  className={cn(
                    'rounded-xl border p-4 text-left transition-colors',
                    categorie === c.cle ? 'border-brand-green bg-brand-green/5 ring-1 ring-brand-green' : 'border-input hover:border-brand-green/60',
                  )}
                >
                  <span className="block font-semibold text-brand-ink">{c.label}</span>
                  <span className="block text-small text-muted-foreground">{c.detail}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {etape === 1 && (
          <>
            <h2>Vos coordonnées et l’accès</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Champ id="dv-nom" label="Nom et prénom, ou nom de la structure *">
                <input id="dv-nom" value={nom} onChange={(e) => setNom(e.target.value)} className="field" />
              </Champ>
              <Champ id="dv-tel" label="Téléphone *">
                <input id="dv-tel" type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} className="field" placeholder="6 XX XX XX XX" />
              </Champ>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-body-sm">
                  <input type="checkbox" checked={memeWhatsapp} onChange={(e) => setMemeWhatsapp(e.target.checked)} className="h-4 w-4 accent-[#30823A]" />
                  Même numéro sur WhatsApp
                </label>
                {!memeWhatsapp && (
                  <input aria-label="Numéro WhatsApp" type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="field mt-2" placeholder="Numéro WhatsApp" />
                )}
              </div>
              <Champ id="dv-commune" label="Arrondissement (commune) *">
                <select id="dv-commune" required value={communeId} onChange={(e) => setCommuneId(e.target.value)} className="field">
                  <option value="">— Choisir —</option>
                  {communes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nom}</option>
                  ))}
                </select>
              </Champ>
              <Champ id="dv-quartier" label="Quartier *">
                <input id="dv-quartier" value={quartier} onChange={(e) => setQuartier(e.target.value)} className="field" placeholder="ex. Nsam" />
              </Champ>
              <div className="sm:col-span-2">
                <Champ id="dv-repere" label="Repère exact *">
                  <textarea id="dv-repere" rows={2} value={repere} onChange={(e) => setRepere(e.target.value)} className="field" placeholder="ex. Derrière la station, portail bleu face à la pharmacie" />
                </Champ>
              </div>
              <Champ id="dv-voie" label="Voie d’accès">
                <select id="dv-voie" value={accesVoie} onChange={(e) => setAccesVoie(e.target.value)} className="field">
                  <option value="">— Choisir —</option>
                  {Object.entries(ACCES_VOIE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Champ>
              <Champ id="dv-gabarit" label="Plus gros véhicule qui passe">
                <select id="dv-gabarit" value={gabaritMax} onChange={(e) => setGabaritMax(e.target.value)} className="field">
                  <option value="">— Choisir —</option>
                  {Object.entries(GABARITS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Champ>
              <label className="flex items-center gap-2 text-body-sm sm:col-span-2">
                <input type="checkbox" checked={pluies} onChange={(e) => setPluies(e.target.checked)} className="h-4 w-4 accent-[#30823A]" />
                Inaccessible en saison des pluies
              </label>
            </div>
          </>
        )}

        {etape === 2 && categorie && (
          <>
            <h2>Vos besoins</h2>
            <fieldset>
              <legend className="field-label">Ramassages par semaine *</legend>
              <div className="grid gap-2 sm:grid-cols-4">
                {FREQUENCES.map((f) => (
                  <label key={f.valeur} className="flex cursor-pointer items-center gap-2 rounded-lg border border-input p-3 text-body-sm has-[:checked]:border-brand-green has-[:checked]:bg-brand-green/5">
                    <input type="radio" name="dv-passages" checked={passages === f.valeur} onChange={() => setPassages(f.valeur)} className="accent-[#30823A]" /> {f.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-2 rounded-lg border border-input p-3">
              <label className="flex items-center gap-2 text-body-sm font-semibold text-brand-ink">
                <input type="checkbox" checked={sacs} onChange={(e) => setSacs(e.target.checked)} className="h-4 w-4 accent-[#30823A]" />
                J’ai besoin de sacs poubelles
              </label>
              {sacs && (
                <Champ id="dv-volume" label="Volume des sacs">
                  <select id="dv-volume" value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="field">
                    {VOLUMES_SACS.map((v) => <option key={v} value={v}>{v} litres</option>)}
                  </select>
                </Champ>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {QUESTIONS[categorie].filter((q) => !q.si || q.si(reponses)).map((q) => (
                <QuestionChamp key={q.cle} question={q} valeur={reponses[q.cle]} onChange={(v) => repondre(q.cle, v)} />
              ))}
            </div>
            {categorie === 'institution' && reponses.type_institution === 'sante' && (
              <p className="flex items-start gap-2 rounded-lg border border-terrain-relance/30 bg-terrain-relance/5 p-3 text-body-sm text-terrain-relance">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                MyKlinTown met en relation avec des précollecteurs pour les déchets classiques. Les DASRI (seringues, pansements
                sanguins…) exigent un précollecteur certifié DASRI.
              </p>
            )}
            {categorie !== 'residentiel' && (
              <p className="text-small text-muted-foreground">Le volume sera évalué lors d’une visite préalable du précollecteur.</p>
            )}
          </>
        )}

        {etape === 3 && (
          <>
            <h2>Position et précollecteur</h2>
            <div className="space-y-2 rounded-lg border border-input p-3 text-body-sm">
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={surPlace} onChange={(e) => { setSurPlace(e.target.checked); if (!e.target.checked) setPosition(null); }} className="mt-0.5 h-4 w-4 accent-[#30823A]" />
                <span>
                  <span className="font-semibold text-brand-ink">Je suis en ce moment sur le lieu à collecter</span>
                  <span className="block text-small text-muted-foreground">
                    N’enregistrez la position que sur place : ailleurs, elle tromperait le précollecteur. Sinon, le repère suffit.
                  </span>
                </span>
              </label>
              {surPlace && (
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={localiser} disabled={localisation} className="btn-outline">
                    {localisation ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />} Enregistrer ma position
                  </button>
                  {position && <span className="chip-ok">Position enregistrée (± {position.precision} m)</span>}
                </div>
              )}
            </div>

            <fieldset className="space-y-2">
              <legend className="field-label">À qui envoyer la demande ?</legend>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-input p-3 text-body-sm has-[:checked]:border-brand-green has-[:checked]:bg-brand-green/5">
                <input type="radio" name="dv-cible" checked={cible === ''} onChange={() => setCible('')} className="accent-[#30823A]" />
                Tous les précollecteurs vérifiés de mon quartier et de ma commune
              </label>
              {fiches?.map((f) => (
                <label key={f.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-input p-2 has-[:checked]:border-brand-green has-[:checked]:bg-brand-green/5">
                  <input type="radio" name="dv-cible" checked={cible === f.id} onChange={() => setCible(f.id)} className="ml-1 accent-[#30823A]" />
                  <span className="flex-1"><CarteVitrine nom={f.nom} devise={f.devise} logoPath={f.logo_path} /></span>
                </label>
              ))}
              {fiches && fiches.length === 0 && (
                <p className="text-small text-muted-foreground">
                  Aucun précollecteur vérifié n’est encore inscrit pour « {quartier} » : votre demande part à ceux de votre
                  commune ; s’il n’y en a pas encore, l’équipe MyKlinTown vous met en relation.
                </p>
              )}
            </fieldset>
            <CaseDocuments id="dv-documents" checked={accepte} onChange={setAccepte} />
          </>
        )}

        {erreur && (
          <p role="alert" className="flex items-start gap-2 rounded-md border border-terrain-stop/25 bg-terrain-stop/5 px-3 py-2 text-body-sm text-terrain-stop">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> {erreur}
          </p>
        )}

        <div className="flex justify-between gap-2">
          {etape > 0 ? (
            <button type="button" className="btn-outline" onClick={() => { setErreur(''); setEtape((e) => e - 1); }}>
              <ArrowLeft size={16} /> Retour
            </button>
          ) : <span />}
          {etape < 3 ? (
            <button type="button" className="btn-primary" onClick={suivant} disabled={enCours}>
              {enCours && <Loader2 size={16} className="animate-spin" />} Continuer <ArrowRight size={16} />
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={envoyer} disabled={enCours || !accepte}>
              {enCours ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Demander une évaluation
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Champ({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      {children}
    </div>
  );
}

function QuestionChamp({
  question: q,
  valeur,
  onChange,
}: {
  question: Question;
  valeur: Reponses[string] | undefined;
  onChange: (v: string | number | boolean | string[] | undefined) => void;
}) {
  const id = `dv-${q.cle}`;
  if (q.type === 'choix') {
    return (
      <Champ id={id} label={q.label}>
        <select id={id} value={typeof valeur === 'string' ? valeur : ''} onChange={(e) => onChange(e.target.value)} className="field">
          <option value="">— Choisir —</option>
          {Object.entries(q.options).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Champ>
    );
  }
  if (q.type === 'multiple') {
    const choix = Array.isArray(valeur) ? valeur : [];
    return (
      <fieldset className="sm:col-span-2">
        <legend className="field-label">{q.label}</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {Object.entries(q.options).map(([v, l]) => (
            <label key={v} className="flex items-center gap-2 text-body-sm">
              <input
                type="checkbox"
                checked={choix.includes(v)}
                onChange={(e) => onChange(e.target.checked ? [...choix, v] : choix.filter((x) => x !== v))}
                className="h-4 w-4 accent-[#30823A]"
              />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  if (q.type === 'nombre') {
    return (
      <Champ id={id} label={q.label}>
        <input id={id} type="number" inputMode="numeric" min={q.min} max={q.max} value={typeof valeur === 'number' ? valeur : ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} className="field num" />
      </Champ>
    );
  }
  if (q.type === 'texte') {
    return (
      <Champ id={id} label={q.label}>
        <input id={id} maxLength={q.max} value={typeof valeur === 'string' ? valeur : ''} onChange={(e) => onChange(e.target.value)} className="field" placeholder={q.placeholder} />
      </Champ>
    );
  }
  return (
    <Champ id={id} label={q.label}>
      <select id={id} value={valeur === true ? 'oui' : valeur === false ? 'non' : ''} onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value === 'oui')} className="field">
        <option value="">— Choisir —</option>
        <option value="oui">Oui</option>
        <option value="non">Non</option>
      </select>
    </Champ>
  );
}
