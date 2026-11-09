'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSupabase, parametre, row, rows, rpc, toutesLesLignes, type Supa } from '@/lib/server';
import { requireEntreprise } from './context';
import { ajouterJours, ajouterMois, dateFr, estErreurReseau, fcfa, isoJour, MESSAGE_RESEAU, STATUTS_A_FACTURER } from '@/lib/format';
import { cheminInterne, normaliserNom, periodeFacture } from '@/lib/metier';
import { CATEGORIES_CHARGES, MONTANT_MAX, lireMontant, moisValide } from '@/lib/charges';
import { enregistrerAcceptation } from '@/lib/acceptations';
import { estTypeDocument } from '@/lib/documents';
import { lireQuartiers, type Piece } from '@/lib/dossier';
import type { ActionState, ClientStatut, Plan } from '@/lib/types';

const txt = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? '').trim();
  return v === '' ? null : v;
};
const num = (fd: FormData, k: string) => {
  const v = txt(fd, k);
  if (v === null) return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

function rafraichir() {
  revalidatePath('/precollecteur', 'layout');
  revalidatePath('/employe', 'layout');
}

function erreurLisible(message: string | undefined): string {
  if (!message) return 'Une erreur est survenue.';
  if (estErreurReseau({ message })) return MESSAGE_RESEAU;
  if (/row-level security|42501|permission/i.test(message)) {
    return 'Action refusée : vos droits ne le permettent pas.';
  }
  if (/duplicate key/i.test(message)) return 'Cet élément existe déjà.';
  return message;
}

// =============================================================================
// Entreprise
// =============================================================================

/**
 * Création de l'espace : plus de code d'agrément (retours de l'équipe,
 * 08/11/2026). L'inscription est libre et se fait sans pièces ; les pièces du
 * dossier se déposent ensuite, et l'entreprise n'apparaît dans l'annuaire
 * qu'une fois le dossier vérifié par MyKlinTown.
 */
export async function creerEntrepriseAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await getSupabase();
  const nom = txt(fd, 'nom');
  if (!nom) return { error: 'Le nom de l’entreprise est obligatoire.' };
  if (fd.get('conditions') !== 'on') {
    return { error: 'Cochez la case pour accepter les conditions d’utilisation et la charte du précollecteur.' };
  }

  const { error } = await rpc(supabase, 'inscrire_mon_entreprise', {
    p_nom: nom,
    p_telephone: txt(fd, 'telephone'),
    p_siege: txt(fd, 'siege'),
    p_niu: txt(fd, 'niu'),
    p_devise: txt(fd, 'devise'),
    p_communes: fd.getAll('communes').map(String).filter(Boolean),
    p_quartiers: lireQuartiers(txt(fd, 'quartiers')),
    p_conditions_acceptees: true,
  });
  if (error) return { error: erreurLisible(error.message) };
  rafraichir();
  redirect('/precollecteur?bienvenue=1');
}

// =============================================================================
// Dossier et vitrine (migration 20261109000017)
// =============================================================================

/** NIU et siège social depuis le dossier. Sur un dossier vérifié, la base le renvoie en vérification. */
export async function majIdentiteAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, entreprise } = await requireEntreprise();
  const niu = txt(fd, 'niu')?.replace(/[\s.-]+/g, '').toUpperCase() ?? null;
  if (niu && !/^[A-Z0-9]{6,30}$/.test(niu)) return { error: 'NIU illisible : lettres et chiffres seulement (ex. M012345678901A).' };
  const { error } = await supabase.from('entreprises').update({ niu, siege: txt(fd, 'siege') }).eq('id', entreprise.id);
  if (error) return { error: erreurLisible(error.message) };
  rafraichir();
  return { ok: 'Identité enregistrée.' };
}

export async function majVitrineAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireEntreprise();
  const { error } = await rpc(supabase, 'mettre_a_jour_ma_vitrine', {
    p_devise: txt(fd, 'devise'),
    p_quartiers: lireQuartiers(txt(fd, 'quartiers')),
  });
  if (error) return { error: erreurLisible(error.message) };
  rafraichir();
  return { ok: 'Vitrine enregistrée.' };
}

export async function definirCommunesAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireEntreprise();
  const communes = fd.getAll('communes').map(String).filter(Boolean);
  const { error } = await rpc(supabase, 'definir_mes_communes', { p_communes: communes });
  if (error) return { error: erreurLisible(error.message) };
  rafraichir();
  return { ok: communes.length ? 'Communes d’activité enregistrées.' : 'Aucune commune d’activité : ajoutez-en au moins une.' };
}

/** Pièce déjà téléversée par le navigateur dans le stockage : on l'inscrit au dossier. */
export async function enregistrerPieceAction(input: { piece: Piece; chemin: string; commune?: string | null }): Promise<ActionState> {
  const { supabase } = await requireEntreprise();
  const { error } = await rpc(supabase, 'enregistrer_piece_dossier', {
    p_piece: input.piece,
    p_chemin: input.chemin,
    p_commune: input.commune ?? null,
  });
  if (error) return { error: erreurLisible(error.message) };
  rafraichir();
  return { ok: input.piece === 'logo' ? 'Logo enregistré.' : 'Pièce enregistrée.' };
}

export async function soumettreDossierAction(_p: ActionState, _fd: FormData): Promise<ActionState> {
  const { supabase } = await requireEntreprise();
  const { error } = await rpc(supabase, 'soumettre_mon_dossier');
  if (error) return { error: erreurLisible(error.message) };
  rafraichir();
  return { ok: 'Dossier envoyé : MyKlinTown vérifie vos pièces.' };
}

export async function majEntrepriseAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, entreprise } = await requireEntreprise();
  const nom = txt(fd, 'nom');
  if (!nom) return { error: 'Le nom est obligatoire.' };
  // Identité fiscale imprimée sur les factures émises ensuite (les factures
  // déjà émises gardent celle du jour de leur émission).
  const niu = txt(fd, 'niu')?.replace(/\s+/g, '').toUpperCase() ?? null;
  const rccm = txt(fd, 'rccm')?.toUpperCase() ?? null;
  const adresseFiscale = txt(fd, 'adresse_fiscale');
  if (niu && niu.length > 30) return { error: 'NIU trop long (30 caractères au plus).' };
  if (rccm && rccm.length > 60) return { error: 'Numéro RCCM trop long (60 caractères au plus).' };
  if (adresseFiscale && adresseFiscale.length > 300) return { error: 'Adresse fiscale trop longue (300 caractères au plus).' };
  const { error } = await supabase
    .from('entreprises')
    .update({ nom, telephone: txt(fd, 'telephone'), siege: txt(fd, 'siege'), niu, rccm, adresse_fiscale: adresseFiscale })
    .eq('id', entreprise.id);
  if (error) return { error: erreurLisible(error.message) };
  rafraichir();
  return { ok: 'Informations enregistrées.' };
}

/** Tarif saisi (fiche client ou devis) : montant par facture, période, passages, sacs. */
function lireTarif(fd: FormData):
  | { tarif_fcfa: number; facturation_mois: number; passages_semaine: number; sacs_inclus: boolean; sacs_volume_litres: number | null }
  | { error: string } {
  const tarif = num(fd, 'tarif_fcfa');
  if (tarif == null || !Number.isInteger(tarif) || tarif < 0 || tarif > 10_000_000) {
    return { error: 'Indiquez le montant de chaque facture, en FCFA (nombre entier).' };
  }
  const mois = num(fd, 'facturation_mois') ?? 1;
  const passages = num(fd, 'passages_semaine') ?? 2;
  if (![1, 3, 6, 12].includes(mois)) return { error: 'Période facturée : 1, 3, 6 ou 12 mois.' };
  if (!Number.isInteger(passages) || passages < 1 || passages > 7) return { error: 'Passages par semaine : de 1 à 7.' };
  const sacs = fd.get('sacs_inclus') === 'on';
  const volume = sacs ? num(fd, 'sacs_volume_litres') : null;
  return { tarif_fcfa: tarif, facturation_mois: mois, passages_semaine: passages, sacs_inclus: sacs, sacs_volume_litres: volume };
}

// =============================================================================
// Devis (migration 20261110000018)
// =============================================================================

export async function proposerDevisAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireEntreprise();
  const tarif = lireTarif(fd);
  if ('error' in tarif) return { error: tarif.error };
  const { error } = await rpc(supabase, 'proposer_devis', {
    p_demande: String(fd.get('demande_id')),
    p_tarif: tarif.tarif_fcfa,
    p_facturation_mois: tarif.facturation_mois,
    p_passages: tarif.passages_semaine,
    p_sacs: tarif.sacs_inclus,
    p_volume: tarif.sacs_volume_litres,
    p_note: txt(fd, 'note'),
  });
  if (error) return { error: erreurLisible(error.message) };
  rafraichir();
  return { ok: 'Devis envoyé : l’abonné le voit dans son espace.' };
}

export async function retirerDevisAction(fd: FormData) {
  const { supabase } = await requireEntreprise();
  const { error } = await rpc(supabase, 'retirer_devis', { p_devis: String(fd.get('devis_id')) });
  rafraichir();
  if (error) redirect(`/precollecteur/demandes?erreur=${encodeURIComponent(error.message)}`);
}

// =============================================================================
// Facturation — cœur : une facture = une période de couverture, au tarif convenu avec l'abonné
// =============================================================================

async function emettreFacturePour(
  supabase: Supa,
  entrepriseId: string,
  clientId: string,
): Promise<{ error?: string; numero?: string }> {
  const { data: c } = await supabase
    .from('clients')
    .select('id, nom, plan_id, statut, tarif_fcfa, facturation_mois')
    .eq('id', clientId)
    .eq('entreprise_id', entrepriseId)
    .maybeSingle();
  const client = row<{ id: string; nom: string; plan_id: string | null; statut: string; tarif_fcfa: number | null; facturation_mois: number | null }>(c);
  if (!client) return { error: 'Client introuvable.' };

  // Tarif convenu avec l'abonné ; à défaut, l'ancienne formule de sa fiche.
  let montant = client.tarif_fcfa;
  let dureeMois = client.facturation_mois ?? 1;
  if (montant == null && client.plan_id) {
    const { data: p } = await supabase.from('plans_tarifaires').select('*').eq('id', client.plan_id).single();
    const plan = row<Plan>(p);
    if (plan) {
      montant = plan.prix_fcfa;
      dureeMois = plan.duree_mois;
    }
  }
  if (montant == null) return { error: 'Fixez d’abord le tarif de cet abonné, depuis sa fiche.' };

  const { data: attente } = await supabase
    .from('factures')
    .select('id')
    .eq('client_id', clientId)
    .eq('statut', 'emise')
    .limit(1);
  if (rows(attente).length) return { error: 'Une facture est déjà en attente de paiement pour ce client.' };

  const { data: derniere } = await supabase
    .from('factures')
    .select('periode_fin')
    .eq('client_id', clientId)
    .neq('statut', 'annulee')
    .order('periode_fin', { ascending: false })
    .limit(1)
    .maybeSingle();
  const finPrecedente = row<{ periode_fin: string }>(derniere)?.periode_fin;

  const grace = await parametre(supabase, 'delai_grace_jours', 7);
  const { debut, fin, echeance } = periodeFacture({
    aujourdhui: isoJour(),
    finPrecedente,
    dureeMois,
    grace,
  });

  const { data: f, error } = await supabase
    .from('factures')
    .insert({
      entreprise_id: entrepriseId,
      client_id: clientId,
      plan_id: client.plan_id,
      libelle: `Abonnement de précollecte · du ${dateFr(debut)} au ${dateFr(fin)}`,
      periode_debut: debut,
      periode_fin: fin,
      montant_fcfa: montant,
      echeance,
    })
    .select('numero')
    .single();
  // Deux émissions simultanées (deux onglets, « Générer » pendant une émission) :
  // la base n'en garde qu'une (migration 20261112000020).
  if (error && /factures_une_emise_par_client/.test(error.message)) {
    return { error: 'Une facture est déjà en attente de paiement pour ce client.' };
  }
  if (error) return { error: erreurLisible(error.message) };
  return { numero: row<{ numero: string }>(f)?.numero };
}

export async function emettreFactureAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, entreprise } = await requireEntreprise();
  const r = await emettreFacturePour(supabase, entreprise.id, String(fd.get('client_id')));
  if (r.error) return { error: r.error };
  rafraichir();
  return { ok: `Facture ${r.numero} émise.` };
}

/** Rappels d'échéance : facture la période suivante de tous les clients qui arrivent au bout. */
export async function genererFacturesAction(_p: ActionState, _fd: FormData): Promise<ActionState> {
  const { supabase, entreprise } = await requireEntreprise();
  const { data } = await toutesLesLignes((de, a) =>
    supabase
      .from('v_clients_statut')
      .select('id, statut_abonnement, nb_impayees')
      .eq('entreprise_id', entreprise.id)
      .eq('statut', 'actif')
      .order('id')
      .range(de, a),
  );
  const cibles = rows<Pick<ClientStatut, 'id' | 'statut_abonnement' | 'nb_impayees'>>(data).filter(
    (c) =>
      Number(c.nb_impayees) === 0 &&
      STATUTS_A_FACTURER.includes(c.statut_abonnement),
  );
  let n = 0;
  for (const c of cibles) {
    const r = await emettreFacturePour(supabase, entreprise.id, c.id);
    if (!r.error) n++;
  }
  rafraichir();
  return n
    ? { ok: `${n} facture${n > 1 ? 's' : ''} émise${n > 1 ? 's' : ''} pour les abonnements à échéance.` }
    : { ok: 'Aucun abonnement à facturer pour le moment : tout le monde est couvert.' };
}

/**
 * Une facture ne se supprime ni ne se corrige : elle s'annule, avec un motif
 * (imprimé sur la facture annulée), puis on en émet une nouvelle.
 */
export async function annulerFactureAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, entreprise } = await requireEntreprise();
  const motif = txt(fd, 'motif');
  if (!motif || motif.length < 3) return { error: 'Indiquez le motif de l’annulation : il figure sur la facture annulée.' };
  const { data, error } = await supabase
    .from('factures')
    .update({ statut: 'annulee', motif_annulation: motif.slice(0, 300) })
    .eq('id', String(fd.get('facture_id')))
    .eq('entreprise_id', entreprise.id)
    .eq('statut', 'emise')
    .select('numero');
  if (error) return { error: erreurLisible(error.message) };
  const f = rows<{ numero: string }>(data)[0];
  if (!f) return { error: 'Cette facture n’est plus annulable : elle a été réglée ou annulée entre-temps.' };
  rafraichir();
  return { ok: `Facture ${f.numero} annulée. Elle reste consultable, marquée « annulée ».` };
}

export async function enregistrerPaiementAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, entreprise } = await requireEntreprise();
  const factureId = String(fd.get('facture_id'));
  const montant = num(fd, 'montant');
  if (!montant || montant <= 0) return { error: 'Indiquez le montant encaissé.' };

  const { data: f } = await supabase
    .from('factures')
    .select('id, client_id, montant_fcfa, statut')
    .eq('id', factureId)
    .eq('entreprise_id', entreprise.id)
    .single();
  const facture = row<{ id: string; client_id: string; montant_fcfa: number; statut: string }>(f);
  if (!facture) return { error: 'Facture introuvable.' };
  if (facture.statut !== 'emise') return { error: 'Cette facture est déjà réglée ou annulée.' };

  const methode = txt(fd, 'methode') ?? 'especes';
  const reference = txt(fd, 'reference');
  if (methode !== 'especes' && !reference) {
    return { error: 'Pour un paiement Mobile Money ou un virement, saisissez la référence de la transaction.' };
  }

  // Jamais au-delà du reste dû (encaissements validés et espèces à valider
  // déduits) : 35 000 au lieu de 3 500 réglait la facture et gonflait le chiffre
  // du mois. La base refuse aussi (migration 20261112000020).
  const { data: dp } = await supabase
    .from('paiements_clients')
    .select('montant_fcfa')
    .eq('facture_id', facture.id)
    .in('statut', ['valide', 'a_valider']);
  const reste = facture.montant_fcfa - rows<{ montant_fcfa: number }>(dp).reduce((s, p) => s + p.montant_fcfa, 0);
  if (Math.round(montant) > reste) {
    return {
      error: reste > 0
        ? `Le reste dû sur cette facture est de ${fcfa(reste)} : un encaissement ne peut pas le dépasser.`
        : 'Cette facture est déjà entièrement réglée (espèces à valider comprises).',
    };
  }

  const { error } = await supabase.from('paiements_clients').insert({
    facture_id: facture.id,
    entreprise_id: entreprise.id,
    client_id: facture.client_id,
    montant_fcfa: Math.round(montant),
    methode,
    reference,
    encaisse_par: txt(fd, 'encaisse_par'),
  });
  if (error) return { error: erreurLisible(error.message) };

  // Un client suspendu pour impayé qui règle redevient actif.
  await supabase
    .from('clients')
    .update({ statut: 'actif' })
    .eq('id', facture.client_id)
    .eq('statut', 'suspendu');

  rafraichir();
  return { ok: 'Paiement enregistré. Le statut de la facture est mis à jour automatiquement.' };
}

/** Espèces reçues par un employé : le gérant les valide (la facture se règle) ou les rejette. */
export async function validerPaiementAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireEntreprise();
  const { error } = await rpc(supabase, 'valider_paiement', {
    p_paiement: String(fd.get('paiement_id')),
    p_valider: fd.get('decision') === 'valider',
  });
  if (error) return { error: erreurLisible(error.message) };
  rafraichir();
  return {};
}

export async function enregistrerRelanceAction(input: {
  factureId: string | null;
  clientId: string;
  canal: 'whatsapp' | 'sms' | 'appel' | 'visite';
  niveau: number;
  message: string;
}): Promise<ActionState> {
  const { supabase, entreprise } = await requireEntreprise();
  const { error } = await supabase.from('relances').insert({
    entreprise_id: entreprise.id,
    facture_id: input.factureId,
    client_id: input.clientId,
    canal: input.canal,
    niveau: input.niveau,
    message: input.message,
  });
  if (error) return { error: erreurLisible(error.message) };
  revalidatePath('/precollecteur/facturation');
  return { ok: 'Relance enregistrée.' };
}

// =============================================================================
// Clients
// =============================================================================

async function zoneDuPoint(supabase: Supa, lat: number | null, lng: number | null) {
  if (lat === null || lng === null) return null;
  const { data } = await rpc(supabase, 'zone_du_point', { p_lat: lat, p_lng: lng });
  return (data as unknown as string | null) ?? null;
}

export async function creerClientAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, entreprise } = await requireEntreprise();
  const nom = normaliserNom(txt(fd, 'nom')) || null;
  if (!nom) return { error: 'Le nom du client est obligatoire.' };
  const tarif = lireTarif(fd);
  if ('error' in tarif) return { error: tarif.error };

  const lat = num(fd, 'lat');
  const lng = num(fd, 'lng');
  const zoneChoisie = txt(fd, 'zone_id');
  const zone = zoneChoisie ?? (await zoneDuPoint(supabase, lat, lng));

  const { data, error } = await supabase
    .from('clients')
    .insert({
      entreprise_id: entreprise.id,
      nom,
      telephone: txt(fd, 'telephone'),
      adresse: txt(fd, 'adresse'),
      quartier: normaliserNom(txt(fd, 'quartier')) || null,
      lat,
      lng,
      zone_id: zone,
      ...tarif,
      notes: txt(fd, 'notes'),
      statut: 'actif',
    })
    .select('id')
    .single();
  if (error) return { error: erreurLisible(error.message) };
  const id = row<{ id: string }>(data)!.id;

  // Charte et contrat remis sur papier et acceptés : tracé au nom du gérant.
  if (fd.get('charte_remise') === 'on') {
    await enregistrerAcceptation(supabase, { clientId: id });
  }
  if (fd.get('facturer') === 'on') {
    await emettreFacturePour(supabase, entreprise.id, id);
  }
  rafraichir();
  redirect(`/precollecteur/clients/${id}?cree=1`);
}

/** Fiche client : la charte et le contrat ont été remis sur papier et acceptés. */
export async function enregistrerRemiseCharteAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireEntreprise();
  const types = fd.getAll('type').filter(estTypeDocument);
  const refus = await enregistrerAcceptation(supabase, { clientId: String(fd.get('client_id')), ...(types.length ? { types } : {}) });
  if (refus) return { error: erreurLisible(refus) };
  rafraichir();
  return { ok: 'Remise enregistrée, à votre nom et à la date de ce jour.' };
}

export async function majClientAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, entreprise } = await requireEntreprise();
  const id = String(fd.get('id'));
  const nom = normaliserNom(txt(fd, 'nom')) || null;
  if (!nom) return { error: 'Le nom est obligatoire.' };
  const tarif = lireTarif(fd);
  if ('error' in tarif) return { error: tarif.error };
  const lat = num(fd, 'lat');
  const lng = num(fd, 'lng');
  const zone = txt(fd, 'zone_id') ?? (await zoneDuPoint(supabase, lat, lng));
  const { error } = await supabase
    .from('clients')
    .update({
      nom,
      telephone: txt(fd, 'telephone'),
      adresse: txt(fd, 'adresse'),
      quartier: normaliserNom(txt(fd, 'quartier')) || null,
      ...tarif,
      notes: txt(fd, 'notes'),
      lat,
      lng,
      zone_id: zone,
    })
    .eq('id', id)
    .eq('entreprise_id', entreprise.id);
  if (error) return { error: erreurLisible(error.message) };
  rafraichir();
  return { ok: 'Fiche client mise à jour.' };
}

export async function changerStatutClientAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, entreprise } = await requireEntreprise();
  const id = String(fd.get('client_id'));
  const statut = String(fd.get('statut'));
  if (!['actif', 'suspendu', 'resilie'].includes(statut)) return { error: 'Statut inconnu.' };

  const { data: avant } = await supabase.from('clients').select('statut').eq('id', id).eq('entreprise_id', entreprise.id).maybeSingle();
  const { data: maj, error } = await supabase.from('clients').update({ statut }).eq('id', id).eq('entreprise_id', entreprise.id).select('id');
  if (error) return { error: erreurLisible(error.message) };
  if (!rows(maj).length) return { error: 'Client introuvable : rechargez la page.' };

  // Accepter une demande en ligne = ouvrir l'abonnement : on émet la première facture.
  if (row<{ statut: string }>(avant)?.statut === 'demande' && statut === 'actif') {
    const r = await emettreFacturePour(supabase, entreprise.id, id);
    rafraichir();
    if (r.error) return { error: `Client accepté, mais la première facture n’a pas pu être émise : ${r.error}` };
    return {};
  }
  rafraichir();
  return {};
}

// =============================================================================
// Flotte et équipe
// =============================================================================

export async function creerEmployeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, entreprise } = await requireEntreprise();
  const nom = normaliserNom(txt(fd, 'nom')) || null;
  if (!nom) return { error: 'Le nom est obligatoire.' };
  const { error } = await supabase.from('employes').insert({
    entreprise_id: entreprise.id,
    nom,
    telephone: txt(fd, 'telephone'),
    fonction: txt(fd, 'fonction') ?? 'collecteur',
  });
  if (error) return { error: erreurLisible(error.message) };
  rafraichir();
  return { ok: `${nom} a rejoint l’équipe.` };
}

export async function basculerEmployeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, entreprise } = await requireEntreprise();
  const { data, error } = await supabase
    .from('employes')
    .update({ actif: fd.get('actif') === 'true' })
    .eq('id', String(fd.get('employe_id')))
    .eq('entreprise_id', entreprise.id)
    .select('id');
  if (error) return { error: erreurLisible(error.message) };
  if (!rows(data).length) return { error: 'Employé introuvable : rechargez la page.' };
  rafraichir();
  return {};
}

/**
 * Invitation d'un employé à créer son compte (espace employé). Un nouveau code
 * remplace le précédent ; il est valable 7 jours, une seule fois.
 */
export async function inviterEmployeAction(fd: FormData) {
  const { supabase } = await requireEntreprise();
  const employeId = String(fd.get('employe_id'));
  const { error } = await rpc(supabase, 'creer_invitation_employe', { p_employe: employeId });
  rafraichir();
  redirect(`/precollecteur/flotte?${error ? `erreur=${encodeURIComponent(erreurLisible(error.message))}` : `invite=${employeId}`}#employe-${employeId}`);
}

/** Départ d'un employé : son compte perd l'accès, sa fiche et son historique restent. */
export async function retirerAccesEmployeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireEntreprise();
  const { error } = await rpc(supabase, 'retirer_acces_employe', { p_employe: String(fd.get('employe_id')) });
  if (error) return { error: erreurLisible(error.message) };
  rafraichir();
  return {};
}

export async function creerTricycleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, entreprise } = await requireEntreprise();
  const nom = txt(fd, 'nom');
  if (!nom) return { error: 'Donnez un nom au tricycle (ex. « Tricycle 1 »).' };
  const { error } = await supabase.from('tricycles').insert({
    entreprise_id: entreprise.id,
    nom,
    immatriculation: txt(fd, 'immatriculation'),
    capacite_kg: num(fd, 'capacite_kg'),
  });
  if (error) return { error: erreurLisible(error.message) };
  rafraichir();
  return { ok: `${nom} ajouté à la flotte.` };
}

export async function statutTricycleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, entreprise } = await requireEntreprise();
  const statut = String(fd.get('statut'));
  if (!['actif', 'maintenance', 'hors_service'].includes(statut)) return { error: 'État inconnu.' };
  const { data, error } = await supabase
    .from('tricycles')
    .update({ statut })
    .eq('id', String(fd.get('tricycle_id')))
    .eq('entreprise_id', entreprise.id)
    .select('id');
  if (error) return { error: erreurLisible(error.message) };
  if (!rows(data).length) return { error: 'Tricycle introuvable : rechargez la page.' };
  rafraichir();
  return {};
}

export async function affecterEmployeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, entreprise } = await requireEntreprise();
  const tricycle_id = String(fd.get('tricycle_id'));
  const employe_id = String(fd.get('employe_id') ?? '');
  if (!employe_id) return { error: 'Choisissez l’employé à affecter.' };
  // La RLS vérifie le tricycle ; l'employé doit lui aussi être de la maison.
  const { data: e } = await supabase
    .from('employes')
    .select('id')
    .eq('id', employe_id)
    .eq('entreprise_id', entreprise.id)
    .maybeSingle();
  if (!e) return { error: 'Employé introuvable : rechargez la page.' };
  const { error } = await supabase.from('tricycle_employes').upsert({ tricycle_id, employe_id });
  if (error) return { error: erreurLisible(error.message) };
  rafraichir();
  return {};
}

export async function retirerEmployeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireEntreprise();
  const { error } = await supabase
    .from('tricycle_employes')
    .delete()
    .eq('tricycle_id', String(fd.get('tricycle_id')))
    .eq('employe_id', String(fd.get('employe_id')));
  if (error) return { error: erreurLisible(error.message) };
  rafraichir();
  return {};
}

// =============================================================================
// Tournées et collectes
// =============================================================================

export async function planifierTourneeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, entreprise } = await requireEntreprise();
  const date = txt(fd, 'date') ?? isoJour();
  const zoneId = txt(fd, 'zone_id');
  const tricycleId = txt(fd, 'tricycle_id');
  // Équipe (chauffeur, ramasseur…) définie à l'avance ; à défaut, l'équipage du tricycle.
  let equipe = fd.getAll('equipe').map(String).filter(Boolean);
  if (equipe.length === 0 && tricycleId) {
    const { data: eq } = await supabase.from('tricycle_employes').select('employe_id').eq('tricycle_id', tricycleId);
    equipe = rows<{ employe_id: string }>(eq).map((e) => e.employe_id);
  }
  const employeId = equipe[0] ?? null;

  const { data: t, error } = await supabase
    .from('tournees_precollecte')
    .insert({
      entreprise_id: entreprise.id,
      date,
      zone_id: zoneId,
      tricycle_id: tricycleId,
      employe_id: employeId,
      notes: txt(fd, 'notes'),
    })
    .select('id')
    .single();
  if (error) return { error: erreurLisible(error.message) };
  const tourneeId = row<{ id: string }>(t)!.id;
  // Une tournée sans son équipe ou sans ses passages ne sert à rien : on la
  // retire et on dit pourquoi (auparavant, les passages manquaient en silence).
  const abandonner = async (message: string): Promise<ActionState> => {
    await supabase.from('tournees_precollecte').delete().eq('id', tourneeId).eq('entreprise_id', entreprise.id);
    rafraichir();
    return { error: `Tournée non créée : ${erreurLisible(message)}` };
  };
  if (equipe.length) {
    const { error: e2 } = await supabase
      .from('tournee_equipe')
      .insert(equipe.map((id) => ({ tournee_id: tourneeId, employe_id: id, entreprise_id: entreprise.id })));
    if (e2) return abandonner(e2.message);
  }

  // Les passages prévus = tous les clients actifs de la zone (ou de l'entreprise), au-delà de 1 000.
  const { data: cl, error: e3 } = await toutesLesLignes((de, a) => {
    let q = supabase.from('clients').select('id').eq('entreprise_id', entreprise.id).eq('statut', 'actif');
    if (zoneId) q = q.eq('zone_id', zoneId);
    return q.order('id').range(de, a);
  });
  if (e3) return abandonner(e3.message);
  const clients = rows<{ id: string }>(cl);
  for (let i = 0; i < clients.length; i += 500) {
    const { error: e4 } = await supabase.from('collectes').insert(
      clients.slice(i, i + 500).map((c) => ({
        entreprise_id: entreprise.id,
        tournee_id: tourneeId,
        client_id: c.id,
        date_prevue: date,
        employe_id: employeId,
      })),
    );
    if (e4) return abandonner(e4.message);
  }
  rafraichir();
  redirect(`/precollecteur/tournees/${tourneeId}`);
}

// =============================================================================
// Charges d'exploitation du mois (indicateur « coût par ménage servi »)
// =============================================================================

export async function enregistrerChargesAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, entreprise } = await requireEntreprise();
  const mois = txt(fd, 'mois');
  if (!moisValide(mois)) return { error: 'Mois invalide : on ne saisit que les charges d’un mois commencé.' };

  const aEcrire: { categorie: string; montant_fcfa: number; note: string | null }[] = [];
  const aEffacer: string[] = [];
  for (const c of CATEGORIES_CHARGES) {
    const montant = lireMontant(txt(fd, c.cle));
    if (montant === null) aEffacer.push(c.cle);
    else if (Number.isNaN(montant) || montant > MONTANT_MAX) return { error: `${c.label} : montant illisible (un nombre entier de FCFA).` };
    else aEcrire.push({ categorie: c.cle, montant_fcfa: montant, note: c.cle === 'autres' ? txt(fd, 'note_autres')?.slice(0, 500) ?? null : null });
  }

  const debut = `${mois}-01`;
  if (aEcrire.length) {
    const { error } = await supabase
      .from('couts_exploitation')
      .upsert(aEcrire.map((l) => ({ ...l, entreprise_id: entreprise.id, mois: debut })), { onConflict: 'entreprise_id,mois,categorie' });
    if (error) return { error: erreurLisible(error.message) };
  }
  if (aEffacer.length) {
    const { error } = await supabase
      .from('couts_exploitation')
      .delete()
      .eq('entreprise_id', entreprise.id)
      .eq('mois', debut)
      .in('categorie', aEffacer);
    if (error) return { error: erreurLisible(error.message) };
  }
  rafraichir();
  const total = aEcrire.reduce((s, l) => s + l.montant_fcfa, 0);
  return {
    ok: aEcrire.length
      ? `Charges de ${dateFr(debut, { month: 'long', year: 'numeric' })} enregistrées : ${fcfa(total)} au total.`
      : `Charges de ${dateFr(debut, { month: 'long', year: 'numeric' })} effacées.`,
  };
}

// =============================================================================
// Incidents avec preuve
// =============================================================================

export async function creerIncidentAction(input: {
  categorie: string;
  description: string | null;
  clientId: string | null;
  collecteId: string | null;
  tourneeId: string | null;
  mediaPath: string | null;
  mediaType: 'photo' | 'video' | null;
  captureAt: string | null;
  lat: number | null;
  lng: number | null;
  retour?: string | null;
}): Promise<ActionState> {
  const { supabase, entreprise, user } = await requireEntreprise();
  // Le fichier doit avoir été déposé par CE compte, dans le dossier de CETTE entreprise.
  if (input.mediaPath && !input.mediaPath.startsWith(`${entreprise.id}/${user.id}/`)) {
    return { error: 'Preuve invalide.' };
  }
  const { error } = await supabase.from('incidents_precollecte').insert({
    entreprise_id: entreprise.id,
    source: 'precollecteur',
    categorie: input.categorie,
    description: input.description,
    client_id: input.clientId,
    collecte_id: input.collecteId,
    tournee_id: input.tourneeId,
    media_path: input.mediaPath,
    media_type: input.mediaType,
    capture_at: input.captureAt,
    lat: input.lat,
    lng: input.lng,
  });
  if (error) return { error: erreurLisible(error.message) };
  rafraichir();
  if (cheminInterne(input.retour)) redirect(input.retour!);
  return { ok: 'Incident enregistré avec sa preuve.' };
}

export async function statutIncidentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, entreprise } = await requireEntreprise();
  const { data, error } = await supabase
    .from('incidents_precollecte')
    .update({ statut: String(fd.get('statut')) })
    .eq('id', String(fd.get('incident_id')))
    .eq('entreprise_id', entreprise.id)
    .select('id');
  if (error) return { error: erreurLisible(error.message) };
  if (!rows(data).length) return { error: 'Incident introuvable : rechargez la page.' };
  rafraichir();
  return {};
}

// =============================================================================
// Données de démonstration (clairement marquées, supprimables)
// =============================================================================

const DEMO_NOMS = [
  'Famille Ateba', 'Famille Nkoulou', 'Mme Ngo Bassa', 'M. Fouda Jean', 'Famille Mbarga',
  'Mme Essomba', 'Famille Tchoumi', 'M. Abena Paul', 'Famille Owona', 'Mme Ndzana',
  'Famille Messi', 'M. Onana Luc', 'Famille Bella', 'Mme Ekani', 'Famille Nguema',
  'M. Ayissi', 'Famille Zambo', 'Mme Manga',
];
const DEMO_QUARTIERS = ['Nsam', 'Efoulan', 'Mvog-Mbi', 'Obobogo', 'Ahala'];

export async function chargerDemoAction(_p: ActionState, _fd: FormData): Promise<ActionState> {
  const { supabase, entreprise } = await requireEntreprise();

  const { data: dejà } = await supabase
    .from('clients')
    .select('id')
    .eq('entreprise_id', entreprise.id)
    .eq('est_demo', true)
    .limit(1);
  if (rows(dejà).length) return { error: 'Les données de démonstration sont déjà chargées.' };

  // Plus de grille commune : chaque abonné de démonstration a son tarif (mensuel, ou trimestriel un sur cinq).
  const tarifDemo = (i: number) => (i % 5 === 0 ? { tarif: 9500, mois: 3 } : { tarif: 3500, mois: 1 });

  const { data: emps } = await supabase
    .from('employes')
    .insert([
      { entreprise_id: entreprise.id, nom: 'Joseph (démo)', telephone: '690000101', fonction: 'chauffeur' },
      { entreprise_id: entreprise.id, nom: 'Aline (démo)', telephone: '690000102', fonction: 'collecteur' },
    ])
    .select('id');
  const employes = rows<{ id: string }>(emps);
  const { data: tris } = await supabase
    .from('tricycles')
    .insert([
      { entreprise_id: entreprise.id, nom: 'Tricycle A (démo)', immatriculation: 'CE-001-DM', capacite_kg: 500, statut: 'actif' },
      { entreprise_id: entreprise.id, nom: 'Tricycle B (démo)', immatriculation: 'CE-002-DM', capacite_kg: 500, statut: 'maintenance' },
    ])
    .select('id');
  const tricycles = rows<{ id: string }>(tris);
  if (employes.length === 2 && tricycles.length === 2) {
    await supabase.from('tricycle_employes').insert([
      { tricycle_id: tricycles[0]!.id, employe_id: employes[0]!.id },
      { tricycle_id: tricycles[0]!.id, employe_id: employes[1]!.id },
    ]);
  }

  // 18 ménages autour de Nsam-Efoulan (Yaoundé III).
  const { data: cls, error } = await supabase
    .from('clients')
    .insert(
      DEMO_NOMS.map((nom, i) => ({
        entreprise_id: entreprise.id,
        nom,
        telephone: `6${String(77000000 + i * 1373).padStart(8, '0')}`,
        quartier: DEMO_QUARTIERS[i % DEMO_QUARTIERS.length],
        adresse: `Rue ${i + 3}, porte ${10 + i}`,
        lat: 3.8285 + (Math.sin(i * 1.7) * 0.012),
        lng: 11.4985 + (Math.cos(i * 2.3) * 0.014),
        tarif_fcfa: tarifDemo(i).tarif,
        facturation_mois: tarifDemo(i).mois,
        passages_semaine: 2,
        statut: i === 17 ? 'demande' : 'actif',
        est_demo: true,
      })),
    )
    .select('id');
  if (error) return { error: erreurLisible(error.message) };
  const clients = rows<{ id: string }>(cls);

  // Historique de facturation : payés, à échéance, impayés.
  const auj = isoJour();
  const factures: Record<string, unknown>[] = [];
  clients.slice(0, 17).forEach((c, i) => {
    const t = tarifDemo(i);
    const decalage = i < 10 ? -10 : i < 13 ? -26 : -40;
    const debut = ajouterJours(auj, decalage);
    const fin = ajouterJours(ajouterMois(debut, t.mois), -1);
    factures.push({
      entreprise_id: entreprise.id,
      client_id: c.id,
      libelle: `Abonnement de précollecte · du ${dateFr(debut)} au ${dateFr(fin)}`,
      periode_debut: debut,
      periode_fin: fin,
      montant_fcfa: t.tarif,
      echeance: ajouterJours(debut, 7),
    });
  });
  const { data: fs } = await supabase.from('factures').insert(factures).select('id, client_id, montant_fcfa');
  const facts = rows<{ id: string; client_id: string; montant_fcfa: number }>(fs);
  // 13 payées sur 17 (les 4 dernières restent en impayé).
  const payees = facts.filter((_, i) => i < 13);
  if (payees.length) {
    await supabase.from('paiements_clients').insert(
      payees.map((f, i) => ({
        facture_id: f.id,
        entreprise_id: entreprise.id,
        client_id: f.client_id,
        montant_fcfa: f.montant_fcfa,
        methode: i % 3 === 0 ? 'mtn_momo' : i % 4 === 0 ? 'orange_money' : 'especes',
        reference: i % 3 === 0 || i % 4 === 0 ? `DEMO-${1000 + i}` : null,
        encaisse_par: employes[1]?.id ?? null,
      })),
    );
  }

  // Trois tournées passées + leurs passages.
  for (const [j, jours] of [-7, -4, -1].entries()) {
    const date = ajouterJours(auj, jours);
    const { data: t } = await supabase
      .from('tournees_precollecte')
      .insert({
        entreprise_id: entreprise.id,
        date,
        tricycle_id: tricycles[0]?.id ?? null,
        employe_id: employes[j % 2]?.id ?? null,
        statut: 'terminee',
        debut_at: `${date}T06:10:00Z`,
        fin_at: `${date}T09:40:00Z`,
        notes: 'démo',
      })
      .select('id')
      .single();
    const tid = row<{ id: string }>(t)?.id;
    if (!tid) continue;
    // Équipe de démonstration : chauffeur et ramasseur du tricycle.
    await supabase.from('tournee_equipe').insert(
      employes.slice(0, 2).map((e) => ({ tournee_id: tid, employe_id: e.id, entreprise_id: entreprise.id })),
    );
    await supabase.from('collectes').insert(
      clients.slice(0, 17).map((c, i) => {
        const rate = (i + j) % 9 === 0;
        return {
          entreprise_id: entreprise.id,
          tournee_id: tid,
          client_id: c.id,
          date_prevue: date,
          employe_id: employes[j % 2]?.id ?? null,
          statut: rate ? 'non_realisee' : 'realisee',
          motif: rate ? (i % 2 ? 'Client absent' : 'Accès impossible') : null,
          realisee_at: `${date}T0${6 + (i % 3)}:${String(10 + i * 2).padStart(2, '0')}:00Z`,
        };
      }),
    );
  }

  await supabase.from('incidents_precollecte').insert({
    entreprise_id: entreprise.id,
    source: 'precollecteur',
    categorie: 'depot_sauvage',
    description: 'Dépôt sauvage au carrefour (démo — sans photo).',
    client_id: clients[3]?.id ?? null,
  });

  rafraichir();
  return { ok: 'Démonstration chargée : 18 abonnés, 2 employés, 2 tricycles, 3 tournées, factures et paiements.' };
}

export async function supprimerDemoAction(_p: ActionState, _fd: FormData): Promise<ActionState> {
  const { supabase, entreprise } = await requireEntreprise();
  // Dans l'ordre des dépendances ; arrêt à la première erreur, sans annoncer un succès.
  const etapes = [
    () => supabase.from('clients').delete().eq('entreprise_id', entreprise.id).eq('est_demo', true),
    () => supabase.from('tournees_precollecte').delete().eq('entreprise_id', entreprise.id).eq('notes', 'démo'),
    () => supabase.from('employes').delete().eq('entreprise_id', entreprise.id).like('nom', '%(démo)'),
    () => supabase.from('incidents_precollecte').delete().eq('entreprise_id', entreprise.id).like('description', '%(démo%'),
    () => supabase.from('tricycles').delete().eq('entreprise_id', entreprise.id).like('nom', '%(démo)'),
  ];
  for (const etape of etapes) {
    const { error } = await etape();
    if (error) {
      rafraichir();
      return { error: `Suppression interrompue : ${erreurLisible(error.message)}` };
    }
  }
  rafraichir();
  return { ok: 'Données de démonstration supprimées.' };
}

// =============================================================================
// R3 — Demandes de ménages sans précollecteur
// =============================================================================

