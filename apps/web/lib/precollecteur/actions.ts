'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSupabase, parametre, row, rows, rpc, type Supa } from '@/lib/server';
import { requireEntreprise } from './context';
import { ajouterJours, ajouterMois, dateFr, estErreurReseau, isoJour, MESSAGE_RESEAU } from '@/lib/format';
import { cheminInterne, normaliserNom, periodeFacture } from '@/lib/metier';
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

export async function creerEntrepriseAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await getSupabase();
  const nom = txt(fd, 'nom');
  if (!nom) return { error: 'Le nom de l’entreprise est obligatoire.' };

  const { error } = await rpc(supabase, 'creer_mon_entreprise', {
    p_nom: nom,
    p_telephone: txt(fd, 'telephone'),
    p_siege: txt(fd, 'siege'),
    p_commune: txt(fd, 'commune_id'),
  });
  if (error) return { error: erreurLisible(error.message) };
  rafraichir();
  redirect('/precollecteur?bienvenue=1');
}

export async function majEntrepriseAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, entreprise } = await requireEntreprise();
  const nom = txt(fd, 'nom');
  if (!nom) return { error: 'Le nom est obligatoire.' };
  const { error } = await supabase
    .from('entreprises')
    .update({ nom, telephone: txt(fd, 'telephone'), siege: txt(fd, 'siege') })
    .eq('id', entreprise.id);
  if (error) return { error: erreurLisible(error.message) };
  rafraichir();
  return { ok: 'Informations enregistrées.' };
}

// =============================================================================
// Facturation — cœur : une facture = une période de couverture, prix de la grille
// =============================================================================

async function emettreFacturePour(
  supabase: Supa,
  entrepriseId: string,
  clientId: string,
): Promise<{ error?: string; numero?: string }> {
  const { data: c } = await supabase
    .from('clients')
    .select('id, nom, plan_id, statut')
    .eq('id', clientId)
    .eq('entreprise_id', entrepriseId)
    .maybeSingle();
  const client = row<{ id: string; nom: string; plan_id: string | null; statut: string }>(c);
  if (!client) return { error: 'Client introuvable.' };
  if (!client.plan_id) return { error: 'Choisissez d’abord une formule dans la grille tarifaire.' };

  const { data: p } = await supabase.from('plans_tarifaires').select('*').eq('id', client.plan_id).single();
  const plan = row<Plan>(p);
  if (!plan) return { error: 'Formule introuvable.' };

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
    dureeMois: plan.duree_mois,
    grace,
  });

  const { data: f, error } = await supabase
    .from('factures')
    .insert({
      entreprise_id: entrepriseId,
      client_id: clientId,
      plan_id: plan.id,
      libelle: `Abonnement ${plan.nom} · du ${dateFr(debut)} au ${dateFr(fin)}`,
      periode_debut: debut,
      periode_fin: fin,
      montant_fcfa: plan.prix_fcfa,
      echeance,
    })
    .select('numero')
    .single();
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
  const { data } = await supabase
    .from('v_clients_statut')
    .select('id, statut_abonnement, nb_impayees')
    .eq('entreprise_id', entreprise.id)
    .eq('statut', 'actif');
  const cibles = rows<Pick<ClientStatut, 'id' | 'statut_abonnement' | 'nb_impayees'>>(data).filter(
    (c) =>
      Number(c.nb_impayees) === 0 &&
      ['echeance_proche', 'expire', 'sans_facture'].includes(c.statut_abonnement),
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

export async function annulerFactureAction(fd: FormData) {
  const { supabase, entreprise } = await requireEntreprise();
  await supabase
    .from('factures')
    .update({ statut: 'annulee' })
    .eq('id', String(fd.get('facture_id')))
    .eq('entreprise_id', entreprise.id)
    .eq('statut', 'emise');
  rafraichir();
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
export async function validerPaiementAction(fd: FormData) {
  const { supabase } = await requireEntreprise();
  await rpc(supabase, 'valider_paiement', {
    p_paiement: String(fd.get('paiement_id')),
    p_valider: fd.get('decision') === 'valider',
  });
  rafraichir();
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
  const planId = txt(fd, 'plan_id');
  if (!nom) return { error: 'Le nom du client est obligatoire.' };
  if (!planId) return { error: 'Choisissez une formule dans la grille tarifaire.' };

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
      plan_id: planId,
      notes: txt(fd, 'notes'),
      statut: 'actif',
    })
    .select('id')
    .single();
  if (error) return { error: erreurLisible(error.message) };
  const id = row<{ id: string }>(data)!.id;

  if (fd.get('facturer') === 'on') {
    await emettreFacturePour(supabase, entreprise.id, id);
  }
  rafraichir();
  redirect(`/precollecteur/clients/${id}?cree=1`);
}

export async function majClientAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, entreprise } = await requireEntreprise();
  const id = String(fd.get('id'));
  const nom = normaliserNom(txt(fd, 'nom')) || null;
  if (!nom) return { error: 'Le nom est obligatoire.' };
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
      plan_id: txt(fd, 'plan_id'),
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

export async function changerStatutClientAction(fd: FormData) {
  const { supabase, entreprise } = await requireEntreprise();
  const id = String(fd.get('client_id'));
  const statut = String(fd.get('statut'));
  if (!['actif', 'suspendu', 'resilie'].includes(statut)) return;

  const { data: avant } = await supabase.from('clients').select('statut').eq('id', id).single();
  await supabase.from('clients').update({ statut }).eq('id', id).eq('entreprise_id', entreprise.id);

  // Accepter une demande en ligne = ouvrir l'abonnement : on émet la première facture.
  if (row<{ statut: string }>(avant)?.statut === 'demande' && statut === 'actif') {
    await emettreFacturePour(supabase, entreprise.id, id);
  }
  rafraichir();
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

export async function basculerEmployeAction(fd: FormData) {
  const { supabase, entreprise } = await requireEntreprise();
  await supabase
    .from('employes')
    .update({ actif: fd.get('actif') === 'true' })
    .eq('id', String(fd.get('employe_id')))
    .eq('entreprise_id', entreprise.id);
  rafraichir();
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
export async function retirerAccesEmployeAction(fd: FormData) {
  const { supabase } = await requireEntreprise();
  await rpc(supabase, 'retirer_acces_employe', { p_employe: String(fd.get('employe_id')) });
  rafraichir();
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

export async function statutTricycleAction(fd: FormData) {
  const { supabase, entreprise } = await requireEntreprise();
  const statut = String(fd.get('statut'));
  if (!['actif', 'maintenance', 'hors_service'].includes(statut)) return;
  await supabase
    .from('tricycles')
    .update({ statut })
    .eq('id', String(fd.get('tricycle_id')))
    .eq('entreprise_id', entreprise.id);
  rafraichir();
}

export async function affecterEmployeAction(fd: FormData) {
  const { supabase, entreprise } = await requireEntreprise();
  const tricycle_id = String(fd.get('tricycle_id'));
  const employe_id = String(fd.get('employe_id') ?? '');
  if (!employe_id) return;
  // La RLS vérifie le tricycle ; l'employé doit lui aussi être de la maison.
  const { data: e } = await supabase
    .from('employes')
    .select('id')
    .eq('id', employe_id)
    .eq('entreprise_id', entreprise.id)
    .maybeSingle();
  if (!e) return;
  await supabase.from('tricycle_employes').upsert({ tricycle_id, employe_id });
  rafraichir();
}

export async function retirerEmployeAction(fd: FormData) {
  const { supabase } = await requireEntreprise();
  await supabase
    .from('tricycle_employes')
    .delete()
    .eq('tricycle_id', String(fd.get('tricycle_id')))
    .eq('employe_id', String(fd.get('employe_id')));
  rafraichir();
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
  if (equipe.length) {
    const { error: e2 } = await supabase
      .from('tournee_equipe')
      .insert(equipe.map((id) => ({ tournee_id: tourneeId, employe_id: id, entreprise_id: entreprise.id })));
    if (e2) return { error: erreurLisible(e2.message) };
  }

  // Les passages prévus = tous les clients actifs de la zone (ou de l'entreprise).
  let q = supabase.from('clients').select('id').eq('entreprise_id', entreprise.id).eq('statut', 'actif');
  if (zoneId) q = q.eq('zone_id', zoneId);
  const { data: cl } = await q;
  const clients = rows<{ id: string }>(cl);
  if (clients.length) {
    await supabase.from('collectes').insert(
      clients.map((c) => ({
        entreprise_id: entreprise.id,
        tournee_id: tourneeId,
        client_id: c.id,
        date_prevue: date,
        employe_id: employeId,
      })),
    );
  }
  rafraichir();
  redirect(`/precollecteur/tournees/${tourneeId}`);
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

export async function statutIncidentAction(fd: FormData) {
  const { supabase, entreprise } = await requireEntreprise();
  await supabase
    .from('incidents_precollecte')
    .update({ statut: String(fd.get('statut')) })
    .eq('id', String(fd.get('incident_id')))
    .eq('entreprise_id', entreprise.id);
  rafraichir();
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

  const { data: pl } = await supabase.from('plans_tarifaires').select('*').eq('actif', true).order('ordre');
  const plans = rows<Plan>(pl);
  if (!plans.length) return { error: 'La grille tarifaire est vide : impossible de créer des abonnements.' };

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
        plan_id: plans[i % 5 === 0 ? Math.min(1, plans.length - 1) : 0]!.id,
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
    const plan = plans[i % 5 === 0 ? Math.min(1, plans.length - 1) : 0]!;
    const decalage = i < 10 ? -10 : i < 13 ? -26 : -40;
    const debut = ajouterJours(auj, decalage);
    const fin = ajouterJours(ajouterMois(debut, plan.duree_mois), -1);
    factures.push({
      entreprise_id: entreprise.id,
      client_id: c.id,
      plan_id: plan.id,
      libelle: `Abonnement ${plan.nom} · du ${dateFr(debut)} au ${dateFr(fin)}`,
      periode_debut: debut,
      periode_fin: fin,
      montant_fcfa: plan.prix_fcfa,
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
  return { ok: 'Démonstration chargée : 18 ménages, 2 employés, 2 tricycles, 3 tournées, factures et paiements.' };
}

export async function supprimerDemoAction(_p: ActionState, _fd: FormData): Promise<ActionState> {
  const { supabase, entreprise } = await requireEntreprise();
  await supabase.from('clients').delete().eq('entreprise_id', entreprise.id).eq('est_demo', true);
  await supabase.from('tournees_precollecte').delete().eq('entreprise_id', entreprise.id).eq('notes', 'démo');
  await supabase.from('employes').delete().eq('entreprise_id', entreprise.id).like('nom', '%(démo)');
  await supabase.from('incidents_precollecte').delete().eq('entreprise_id', entreprise.id).like('description', '%(démo%');
  await supabase.from('tricycles').delete().eq('entreprise_id', entreprise.id).like('nom', '%(démo)');
  rafraichir();
  return { ok: 'Données de démonstration supprimées.' };
}

// =============================================================================
// R3 — Demandes de ménages sans précollecteur
// =============================================================================

export async function prendreDemandeAction(fd: FormData) {
  const { supabase, entreprise } = await requireEntreprise();
  const { data, error } = await rpc(supabase, 'prendre_demande', { p_demande: String(fd.get('demande_id')) });
  if (error) redirect(`/precollecteur/demandes?erreur=${encodeURIComponent(error.message)}`);
  const clientId = data as string;
  // Paiement avant service : la première période est facturée tout de suite.
  await emettreFacturePour(supabase, entreprise.id, clientId);
  rafraichir();
  redirect(`/precollecteur/clients/${clientId}?pris=1`);
}
