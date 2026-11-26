'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { CheckCircle2, FileDown, FileSpreadsheet, QrCode, RotateCcw, Users } from 'lucide-react';
import { cn } from '@myklintown/ui';
import { analyserImport, COLONNES, lireLignes, type EtatLigne, type Lecture, type ZoneImport } from '@/lib/import-clients';
import { ErreurTableur, lireTableur } from '@/lib/tableur';
import { importerClientsAction, type ResultatImport } from '@/lib/precollecteur/actions';
import { fcfa } from '@/lib/format';

const TAILLE_MAX = 5 * 1024 * 1024;
const AFFICHAGE_MAX = 300;

type Filtre = 'tous' | 'pret' | 'erreur' | 'doublon';

const titreColonne = (cle: string) => COLONNES.find((c) => c.cle === cle)?.titre ?? cle;

export function ImportClients({ zones, existants }: { zones: ZoneImport[]; existants: { telephones: string[]; nomsQuartiers: string[] } }) {
  const [fichier, setFichier] = useState<string | null>(null);
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [facturer, setFacturer] = useState(false);
  const [resultat, setResultat] = useState<ResultatImport | null>(null);
  const [lectureEnCours, setLectureEnCours] = useState(false);
  const [envoi, demarrer] = useTransition();

  const analyse = useMemo<EtatLigne[]>(() => (lecture ? analyserImport(lecture.lignes, zones, existants) : []), [lecture, zones, existants]);
  const compte = (e: Filtre) => (e === 'tous' ? analyse.length : analyse.filter((l) => l.etat === e).length);
  const prets = analyse.filter((l) => l.etat === 'pret');
  const visibles = analyse.filter((l) => filtre === 'tous' || l.etat === filtre);

  function recommencer() {
    setFichier(null);
    setLecture(null);
    setErreur(null);
    setResultat(null);
    setFiltre('tous');
  }

  async function choisir(f: File | undefined) {
    recommencer();
    if (!f) return;
    setFichier(f.name);
    if (f.size > TAILLE_MAX) {
      setErreur('Fichier trop lourd (5 Mo au plus). Un fichier de clients pèse d’habitude moins de 200 Ko : vérifiez qu’il ne contient pas d’images.');
      return;
    }
    setLectureEnCours(true);
    try {
      const tableau = await lireTableur(new Uint8Array(await f.arrayBuffer()));
      const l = lireLignes(tableau);
      if ('error' in l) setErreur(l.error);
      else if (!l.lignes.length) setErreur('Le fichier ne contient aucun client sous la ligne des titres.');
      else setLecture(l);
    } catch (e) {
      setErreur(e instanceof ErreurTableur ? e.message : 'Fichier illisible : enregistrez-le au format Excel (.xlsx) ou CSV, puis réessayez.');
    } finally {
      setLectureEnCours(false);
    }
  }

  function importer() {
    demarrer(async () => {
      try {
        const r = await importerClientsAction({ lignes: prets.map((l) => l.brute), facturer });
        setResultat(r);
      } catch {
        setResultat({
          error: 'Connexion interrompue. Réessayez : les clients déjà enregistrés seront reconnus comme doublons et ne seront pas créés deux fois.',
        });
      }
    });
  }

  if (resultat && !resultat.error) {
    return (
      <div className="card-soft max-w-3xl space-y-4 p-5 sm:p-6" role="status">
        <p className="flex items-center gap-2 text-h2-sm text-brand-ink">
          <CheckCircle2 className="text-terrain-ok" size={22} />
          {resultat.crees} client{resultat.crees! > 1 ? 's' : ''} ajouté{resultat.crees! > 1 ? 's' : ''}
        </p>
        {resultat.factures != null && (
          <p className="text-body-sm text-muted-foreground">
            {resultat.factures} première{resultat.factures > 1 ? 's' : ''} facture{resultat.factures > 1 ? 's' : ''} émise{resultat.factures > 1 ? 's' : ''}
            {resultat.facturesEnEchec ? ` ; ${resultat.facturesEnEchec} n’ont pas pu l’être (à émettre depuis la fiche du client).` : '.'}
          </p>
        )}
        {!!resultat.ecartees?.length && (
          <p className="text-body-sm text-muted-foreground">
            {resultat.ecartees.length} ligne{resultat.ecartees.length > 1 ? 's' : ''} écartée{resultat.ecartees.length > 1 ? 's' : ''} : corrigez-les dans le fichier et importez-le de nouveau, les clients déjà
            ajoutés seront reconnus.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          {resultat.depuis && (
            <Link href={`/precollecteur/clients/planche?depuis=${encodeURIComponent(resultat.depuis)}`} className="btn-primary">
              <QrCode size={16} /> Imprimer leurs étiquettes QR
            </Link>
          )}
          <Link href="/precollecteur/clients" className="btn-outline">
            <Users size={16} /> Voir mes clients
          </Link>
          <button type="button" onClick={recommencer} className="btn-ghost">
            <RotateCcw size={16} /> Importer un autre fichier
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="card-soft max-w-3xl space-y-3 p-5 sm:p-6">
        <h2 className="text-h2-sm text-brand-ink">1. Le modèle à remplir</h2>
        <p className="text-body-sm text-muted-foreground">
          Une ligne par foyer. Seuls le <strong>nom</strong> et le <strong>tarif</strong> sont obligatoires ; le téléphone permet au ménage de
          rattacher son compte. Votre propre fichier convient aussi s’il a une ligne de titres (Nom, Téléphone, Quartier, Tarif…).
        </p>
        <a href="/precollecteur/clients/import/modele" download className="btn-outline">
          <FileDown size={16} /> Télécharger le modèle Excel
        </a>
      </section>

      <section className="card-soft max-w-3xl space-y-3 p-5 sm:p-6">
        <h2 className="text-h2-sm text-brand-ink">2. Votre fichier</h2>
        <p className="text-body-sm text-muted-foreground">Excel (.xlsx) ou CSV. Rien n’est enregistré à cette étape : vous verrez d’abord chaque ligne.</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="btn-primary cursor-pointer">
            <FileSpreadsheet size={16} /> {fichier ? 'Choisir un autre fichier' : 'Choisir le fichier'}
            <input
              type="file"
              className="sr-only"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(e) => {
                void choisir(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          {fichier && <span className="min-w-0 truncate text-body-sm text-muted-foreground">{lectureEnCours ? `Lecture de ${fichier}…` : fichier}</span>}
        </div>
        {erreur && (
          <p role="alert" className="rounded-lg bg-terrain-stop/10 p-3 text-body-sm text-terrain-stop">
            {erreur}
          </p>
        )}
      </section>

      {lecture && (
        <section className="card-soft space-y-4 p-5 sm:p-6">
          <h2 className="text-h2-sm text-brand-ink">3. Vérifier et enregistrer</h2>
          <p className="text-body-sm font-semibold text-brand-ink" data-testid="bilan-import">
            {analyse.length} ligne{analyse.length > 1 ? 's' : ''} lue{analyse.length > 1 ? 's' : ''} · {compte('pret')} prête{compte('pret') > 1 ? 's' : ''} ·{' '}
            {compte('erreur')} à corriger · {compte('doublon')} doublon{compte('doublon') > 1 ? 's' : ''}
          </p>
          <p className="text-small text-muted-foreground">
            Colonnes reconnues : {lecture.reconnues.map(titreColonne).join(', ')}.
            {!!lecture.ignorees.length && <> Colonnes ignorées : {lecture.ignorees.join(', ')}.</>}
          </p>
          {!lecture.reconnues.includes('tarif') && (
            <p role="alert" className="rounded-lg bg-terrain-relance/10 p-3 text-body-sm text-brand-ink">
              Aucune colonne « Tarif » trouvée : ajoutez-la (montant de chaque facture, en FCFA), c’est elle qui sert à facturer.
            </p>
          )}

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {(
              [
                ['tous', 'Toutes'],
                ['pret', 'Prêtes'],
                ['erreur', 'À corriger'],
                ['doublon', 'Doublons'],
              ] as const
            ).map(([cle, label]) => (
              <button
                key={cle}
                type="button"
                onClick={() => setFiltre(cle)}
                aria-pressed={filtre === cle}
                className={cn(
                  'flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-body-sm font-semibold',
                  filtre === cle ? 'border-brand-ink bg-brand-ink text-white' : 'border-border bg-surface text-muted-foreground',
                )}
              >
                {label} <span className="num text-small">{compte(cle)}</span>
              </button>
            ))}
          </div>

          <div className="max-h-[28rem] overflow-auto rounded-lg border border-border">
            <table className="table-data min-w-[44rem]">
              <thead>
                <tr>
                  <th>Ligne</th>
                  <th>Nom</th>
                  <th>Téléphone</th>
                  <th>Quartier</th>
                  <th className="text-right">Tarif</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {visibles.slice(0, AFFICHAGE_MAX).map((l) => (
                  <tr key={l.numero}>
                    <td className="num text-muted-foreground">{l.numero}</td>
                    <td className="font-semibold text-brand-ink">{l.etat === 'pret' ? l.client.nom : (l.brute.nom ?? '—')}</td>
                    <td className="num">{l.etat === 'pret' ? (l.client.telephone ?? '—') : (l.brute.telephone ?? '—')}</td>
                    <td>{l.etat === 'pret' ? (l.client.quartier ?? '—') : (l.brute.quartier ?? '—')}</td>
                    <td className="num text-right">{l.etat === 'pret' ? fcfa(l.client.tarif_fcfa) : (l.brute.tarif ?? '—')}</td>
                    <td className="min-w-[14rem]">
                      {l.etat === 'pret' && <span className="chip-ok">Prête</span>}
                      {l.etat === 'doublon' && (
                        <>
                          <span className="chip-neutre">Doublon</span>
                          <span className="mt-1 block text-small text-muted-foreground">{l.raison}</span>
                        </>
                      )}
                      {l.etat === 'erreur' && (
                        <>
                          <span className="chip-stop">À corriger</span>
                          {l.erreurs.map((m) => (
                            <span key={m} className="mt-1 block text-small text-terrain-stop">
                              {m}
                            </span>
                          ))}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visibles.length > AFFICHAGE_MAX && (
            <p className="text-small text-muted-foreground">… et {visibles.length - AFFICHAGE_MAX} autres lignes, non affichées.</p>
          )}

          <label className="flex items-start gap-3 rounded-lg bg-muted/60 p-3 text-body-sm">
            <input type="checkbox" checked={facturer} onChange={(e) => setFacturer(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#30823A]" />
            <span>
              <strong className="text-brand-ink">Émettre la première facture de chacun maintenant</strong>
              <span className="block text-muted-foreground">
                La période commence aujourd’hui. Laissez décoché si ces abonnés ont déjà payé la période en cours.
              </span>
            </span>
          </label>
          <p className="text-small text-muted-foreground">
            La charte de l’abonné se remet ensuite sur papier et s’enregistre depuis la fiche de chaque client.
          </p>

          {resultat?.error && (
            <p role="alert" className="rounded-lg bg-terrain-stop/10 p-3 text-body-sm text-terrain-stop">
              {resultat.error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3">
            {compte('erreur') + compte('doublon') > 0 && compte('pret') > 0 && (
              <span className="text-small text-muted-foreground">Les lignes à corriger et les doublons ne seront pas importés.</span>
            )}
            <button type="button" onClick={importer} disabled={!prets.length || envoi} className="btn-primary">
              {envoi ? 'Enregistrement…' : `Importer ${prets.length} client${prets.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
