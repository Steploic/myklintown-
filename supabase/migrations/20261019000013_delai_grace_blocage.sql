-- =============================================================================
-- MyKlinTown — Délai de grâce et vrai blocage au passage (livrable §3.2)
-- =============================================================================
-- Le livrable : « vert, il sert ; orange, il sert et relance, c'est le dernier
-- passage ; rouge, il ne sert pas et le motif s'affiche. L'arbitrage est porté
-- par le système, pas par l'agent sur le pas de la porte. »
--
-- Jusqu'ici :
--   • dès la fin de la couverture payée, le ménage passait au rouge (« expiré »)
--     — le délai de grâce (`delai_grace_jours`) n'était lu que par les
--     indicateurs ;
--   • le rouge n'était qu'une couleur : le scan enregistrait le passage comme
--     réalisé, et il comptait dans le taux d'exécution.
--
-- Désormais :
--   • GRÂCE (orange) : couverture terminée depuis moins de `delai_grace_jours`
--     jours — même règle que l'indicateur « abonnés à jour » (20261013000011) ;
--     au-delà, « expiré » (rouge). Le seuil « échéance proche » lit enfin
--     `rappel_echeance_jours` (il était écrit en dur : 7) ;
--   • la vue `v_clients_statut` donne la CONSIGNE de terrain (servir / servir et
--     relancer / ne pas servir / vérifier). Des espèces remises à l'équipe, pas
--     encore validées, qui couvrent ce qui est dû : on sert ;
--   • BLOCAGE, derrière l'interrupteur `terrain_blocage_actif` (0 par défaut) :
--     un ménage à ne pas servir qui est scanné n'est PAS noté servi ; son passage
--     prévu devient « Refus / impayé », posé par la base (`refus_abonnement`), et
--     sort du taux d'exécution (un passage refusé n'était pas dû). Le pointage
--     « Collecté » est refusé. Un geste fait hors ligne est jugé au jour où il a
--     été fait ;
--   • la suspension reste CALCULÉE (rouge) : aucune tâche planifiée n'écrit
--     `clients.statut` ; « suspendu » reste un choix du gérant.
--
-- Mise en service : jouer cette migration, déployer l'application, former les
-- équipes, PUIS activer le blocage :
--   update public.parametres_plateforme set valeur = '1', updated_at = now()
--    where cle = 'terrain_blocage_actif';
--
-- Ordre de mise en production : cette migration D'ABORD, l'application ensuite
-- (l'application d'avant fonctionne avec elle : les colonnes sont ajoutées en
-- fin de vue, « grace » s'y affiche « À facturer », et le blocage est éteint).
--
-- Une transaction, rejouable. À jouer sur la base de TEST, puis sur la vraie.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Interrupteur du blocage (éteint)
-- -----------------------------------------------------------------------------
insert into public.parametres_plateforme (cle, valeur, description) values
  ('terrain_blocage_actif', '0',
   'Blocage au passage (livrable §3.2). 1 = un ménage en rouge (impayé, expiré, suspendu) n''est pas servi : le passage est noté « Refus / impayé » par la base et sort du taux d''exécution. 0 = couleurs affichées seulement. À activer après la formation des équipes.')
on conflict (cle) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Règles de calcul (une seule définition, partagée par la vue et le terrain)
-- -----------------------------------------------------------------------------
-- Jour de Yaoundé/Douala (et non de l'horloge UTC du serveur).
create or replace function public.jour_douala() returns date
language sql stable set search_path = public as $$
  select (now() at time zone 'Africa/Douala')::date
$$;

create or replace function public.parametre_entier(p_cle text, p_defaut int) returns int
language sql stable set search_path = public as $$
  select coalesce((select round((valeur #>> '{}')::numeric)::int from public.parametres_plateforme where cle = p_cle), p_defaut)
$$;

create or replace function public.terrain_blocage_actif() returns boolean
language sql stable set search_path = public as $$
  select public.parametre_entier('terrain_blocage_actif', 0) = 1
$$;

-- Statut d'abonnement d'une fiche à une date. L'ordre des cas est l'ordre de priorité.
create or replace function public.statut_abonnement_calcule(
  p_statut_client text, p_nb_retard bigint, p_couverture_fin date, p_jour date, p_grace int, p_rappel int
) returns text
language sql immutable set search_path = public as $$
  select case
    when p_statut_client in ('demande', 'suspendu', 'resilie') then p_statut_client
    when coalesce(p_nb_retard, 0) > 0 then 'impaye'
    when p_couverture_fin is null then 'sans_facture'
    when p_couverture_fin < p_jour - p_grace then 'expire'
    when p_couverture_fin < p_jour then 'grace'
    when p_couverture_fin <= p_jour + p_rappel then 'echeance_proche'
    else 'a_jour'
  end
$$;

-- Consigne de terrain : que fait l'agent devant ce portail ?
create or replace function public.consigne_terrain_calculee(p_statut text, p_reste numeric, p_a_valider numeric) returns text
language sql immutable set search_path = public as $$
  select case
    when p_statut = 'a_jour' then 'servir'
    when p_statut in ('echeance_proche', 'sans_facture', 'grace') then 'servir_rappeler'
    -- Espèces remises à l'équipe, pas encore validées par le gérant, qui
    -- couvrent ce qui est dû : on sert (le gérant valide ensuite).
    when p_statut = 'impaye' and coalesce(p_reste, 0) > 0 and coalesce(p_a_valider, 0) >= p_reste then 'servir_rappeler'
    when p_statut in ('impaye', 'expire', 'suspendu') then 'ne_pas_servir'
    else 'verifier'
  end
$$;

-- -----------------------------------------------------------------------------
-- 3. La vue des fiches : mêmes colonnes, dans le même ordre, puis les ajouts
-- -----------------------------------------------------------------------------
create or replace view public.v_clients_statut with (security_invoker = true) as
select
  c.*,
  p.nom as plan_nom,
  p.prix_fcfa as plan_prix,
  p.duree_mois as plan_duree_mois,
  z.nom as zone_nom,
  cov.couverture_fin,
  coalesce(imp.nb_impayees, 0) as nb_impayees,
  coalesce(imp.montant_impaye, 0) as montant_impaye,
  imp.plus_ancienne_echeance,
  st.statut_abonnement,
  -- Ajouts de 20261019000013 (toujours en fin de liste) :
  cov.couverture_fin + prm.grace as fin_grace,
  coalesce(imp.montant_a_valider, 0) as montant_a_valider,
  public.consigne_terrain_calculee(st.statut_abonnement, imp.montant_impaye, imp.montant_a_valider) as consigne_terrain
from public.clients c
cross join lateral (
  select public.jour_douala() as jour,
         public.parametre_entier('delai_grace_jours', 7) as grace,
         public.parametre_entier('rappel_echeance_jours', 7) as rappel
) prm
left join public.plans_tarifaires p on p.id = c.plan_id
left join public.zones z on z.id = c.zone_id
left join lateral (
  select max(f.periode_fin) as couverture_fin
  from public.factures f where f.client_id = c.id and f.statut = 'payee'
) cov on true
left join lateral (
  select count(*) as nb_impayees,
         sum(f.montant_fcfa - coalesce((select sum(pc.montant_fcfa) from public.paiements_clients pc
                                         where pc.facture_id = f.id and pc.statut = 'valide'), 0)) as montant_impaye,
         min(f.echeance) as plus_ancienne_echeance,
         count(*) filter (where f.echeance < prm.jour) as nb_retard,
         sum((select coalesce(sum(pc.montant_fcfa), 0) from public.paiements_clients pc
               where pc.facture_id = f.id and pc.statut = 'a_valider')) as montant_a_valider
  from public.factures f where f.client_id = c.id and f.statut = 'emise'
) imp on true
cross join lateral (
  select public.statut_abonnement_calcule(c.statut, imp.nb_retard, cov.couverture_fin, prm.jour, prm.grace, prm.rappel) as statut_abonnement
) st;

-- Même calcul pour UNE fiche, à une date donnée : un geste fait hors ligne et
-- envoyé après minuit est jugé au jour où il a été fait. Interne (appelé par les
-- fonctions de terrain), fermé aux comptes. Le contrôle final vérifie qu'il
-- donne exactement la vue pour aujourd'hui.
create or replace function public.etat_terrain_client(p_client uuid, p_jour date)
returns table (statut_abonnement text, consigne_terrain text)
language sql stable set search_path = public as $$
  with prm as (
    select public.parametre_entier('delai_grace_jours', 7) as grace,
           public.parametre_entier('rappel_echeance_jours', 7) as rappel
  ), cov as (
    select max(f.periode_fin) as couverture_fin
      from public.factures f where f.client_id = p_client and f.statut = 'payee'
  ), imp as (
    select sum(f.montant_fcfa - coalesce((select sum(pc.montant_fcfa) from public.paiements_clients pc
                                           where pc.facture_id = f.id and pc.statut = 'valide'), 0)) as montant_impaye,
           count(*) filter (where f.echeance < p_jour) as nb_retard,
           sum((select coalesce(sum(pc.montant_fcfa), 0) from public.paiements_clients pc
                 where pc.facture_id = f.id and pc.statut = 'a_valider')) as montant_a_valider
      from public.factures f where f.client_id = p_client and f.statut = 'emise'
  ), st as (
    select public.statut_abonnement_calcule(c.statut, imp.nb_retard, cov.couverture_fin, p_jour, prm.grace, prm.rappel) as s,
           imp.montant_impaye, imp.montant_a_valider
      from public.clients c cross join prm cross join cov cross join imp
     where c.id = p_client
  )
  select st.s, public.consigne_terrain_calculee(st.s, st.montant_impaye, st.montant_a_valider) from st
$$;

-- -----------------------------------------------------------------------------
-- 4. Passage refusé : posé par la base, jamais par l'application
-- -----------------------------------------------------------------------------
alter table public.collectes add column if not exists refus_abonnement boolean not null default false;
comment on column public.collectes.refus_abonnement is
  'Passage non servi parce que le ménage était à « ne pas servir » (impayé, expiré, suspendu) avec le blocage actif. Posé par les fonctions de terrain ; exclu du taux d''exécution (le passage n''était pas dû).';

-- Un gérant ne peut pas « excuser » un passage manqué pour gonfler son taux d'exécution.
drop trigger if exists collectes_refus_systeme on public.collectes;
create trigger collectes_refus_systeme before update on public.collectes
  for each row execute function public.garde_colonnes_systeme('refus_abonnement');

-- -----------------------------------------------------------------------------
-- 5. Fonctions de terrain (mêmes signatures que 20261012000010)
-- -----------------------------------------------------------------------------
create or replace function public.scanner_passage(p_tournee uuid, p_code text, p_horodatage timestamptz default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t public.tournees_precollecte;
  c record;
  e record;
  v_collecte uuid;
  v_statut text;
  v_heure timestamptz := public.heure_terrain(p_horodatage);
  v_refus boolean;
begin
  select * into t from public.tournees_precollecte where id = p_tournee;
  if not found or not public.peut_agir_sur_tournee(p_tournee) then
    raise exception 'Tournée introuvable ou hors de vos tournées' using errcode = '42501';
  end if;
  if t.statut not in ('planifiee', 'en_cours') then
    raise exception 'Tournée close : rouvrez-la pour scanner';
  end if;

  select cl.id, cl.nom, cl.code, cl.quartier into c
    from public.clients cl
   where cl.entreprise_id = t.entreprise_id and cl.code = upper(btrim(p_code));
  if not found then
    raise exception 'Code % inconnu : ce ménage n''est pas un client de l''entreprise', upper(btrim(p_code));
  end if;

  -- Le ménage est jugé au jour du geste (geste fait hors ligne, envoyé plus tard).
  select * into e from public.etat_terrain_client(c.id, (v_heure at time zone 'Africa/Douala')::date);
  v_refus := public.terrain_blocage_actif() and e.consigne_terrain = 'ne_pas_servir';

  select id, statut into v_collecte, v_statut
    from public.collectes where tournee_id = p_tournee and client_id = c.id;

  -- Déjà enregistré (scan rejoué après une coupure, ou scanné deux fois) : rien ne bouge.
  if v_collecte is not null and v_statut = 'realisee' then
    return jsonb_build_object('nom', c.nom, 'code', c.code, 'statut_abonnement', e.statut_abonnement,
                              'consigne', e.consigne_terrain, 'refuse', false,
                              'quartier', c.quartier, 'hors_planning', false, 'deja_fait', true);
  end if;

  if v_refus then
    -- Ne pas servir : le passage prévu est noté « Refus / impayé » par la base
    -- (il sort du taux d'exécution) ; rien n'est ajouté hors planning.
    if v_collecte is not null then
      update public.collectes
         set statut = 'non_realisee', motif = 'Refus / impayé', refus_abonnement = true,
             realisee_at = v_heure, enregistre_at = now(),
             employe_id = coalesce(public.mon_employe(), employe_id)
       where id = v_collecte;
    end if;
  elsif v_collecte is not null then
    update public.collectes
       set statut = 'realisee', motif = null, refus_abonnement = false, realisee_at = v_heure, enregistre_at = now(),
           employe_id = coalesce(public.mon_employe(), employe_id)
     where id = v_collecte;
  else
    insert into public.collectes (entreprise_id, tournee_id, client_id, date_prevue, employe_id, statut, realisee_at, enregistre_at)
    values (t.entreprise_id, t.id, c.id, t.date, coalesce(public.mon_employe(), t.employe_id), 'realisee', v_heure, now());
  end if;

  return jsonb_build_object('nom', c.nom, 'code', c.code, 'statut_abonnement', e.statut_abonnement,
                            'consigne', e.consigne_terrain, 'refuse', v_refus,
                            'quartier', c.quartier, 'hors_planning', v_collecte is null, 'deja_fait', false);
end $$;

create or replace function public.pointer_passage(
  p_collecte uuid, p_statut text, p_motif text default null, p_horodatage timestamptz default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tournee uuid;
  v_statut_tournee text;
  v_client uuid;
  v_heure timestamptz := public.heure_terrain(p_horodatage);
  v_bloque boolean := false;
begin
  if p_statut not in ('realisee', 'non_realisee', 'prevue') then raise exception 'Statut inconnu'; end if;
  select co.tournee_id, t.statut, co.client_id into v_tournee, v_statut_tournee, v_client
    from public.collectes co
    join public.tournees_precollecte t on t.id = co.tournee_id
   where co.id = p_collecte;
  if not found then raise exception 'Passage introuvable'; end if;
  if not public.peut_agir_sur_tournee(v_tournee) then
    raise exception 'Ce passage ne fait pas partie de vos tournées' using errcode = '42501';
  end if;
  if v_statut_tournee not in ('planifiee', 'en_cours') then
    raise exception 'Tournée close : rouvrez-la pour corriger un passage';
  end if;

  if p_statut <> 'prevue' and public.terrain_blocage_actif() then
    select e.consigne_terrain = 'ne_pas_servir' into v_bloque
      from public.etat_terrain_client(v_client, (v_heure at time zone 'Africa/Douala')::date) e;
    v_bloque := coalesce(v_bloque, false);
  end if;
  -- Message lu par l'agent (aussi au retour du réseau) : ne jamais y mettre de
  -- mot que l'application prendrait pour une coupure (voir estErreurReseau).
  if p_statut = 'realisee' and v_bloque then
    raise exception 'Ne pas servir : abonnement impayé, expiré ou suspendu. Notez « Non collecté » ou encaissez d''abord.';
  end if;

  update public.collectes
     set statut = p_statut,
         motif = case when p_statut = 'non_realisee' then coalesce(nullif(btrim(p_motif), ''), 'Autre') end,
         refus_abonnement = (p_statut = 'non_realisee' and v_bloque),
         realisee_at = case when p_statut = 'prevue' then null else v_heure end,
         enregistre_at = now(),
         employe_id = coalesce(public.mon_employe(), employe_id)
   where id = p_collecte;
end $$;

-- Démarrer / terminer (équipier) ; le gérant peut aussi rouvrir ou annuler.
create or replace function public.changer_statut_tournee(p_tournee uuid, p_statut text) returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.tournees_precollecte;
  v_gerant boolean;
begin
  select * into t from public.tournees_precollecte where id = p_tournee for update;
  if not found or not public.peut_agir_sur_tournee(p_tournee) then
    raise exception 'Tournée introuvable ou hors de vos tournées' using errcode = '42501';
  end if;
  v_gerant := public.est_gerant(t.entreprise_id) or public.est_admin();
  if p_statut not in ('planifiee', 'en_cours', 'terminee', 'annulee') then raise exception 'Statut inconnu'; end if;
  if not v_gerant and not ((t.statut = 'planifiee' and p_statut = 'en_cours')
                           or (t.statut = 'en_cours' and p_statut = 'terminee')) then
    raise exception 'Seul le gérant peut rouvrir ou annuler une tournée' using errcode = '42501';
  end if;

  if p_statut = 'en_cours' then
    update public.tournees_precollecte
       set statut = 'en_cours', fin_at = null, debut_at = coalesce(debut_at, now())
     where id = p_tournee;
  elsif p_statut = 'terminee' then
    -- Blocage au passage : un ménage à ne pas servir, non visité, n'était pas dû.
    if public.terrain_blocage_actif() then
      update public.collectes co
         set statut = 'non_realisee', motif = 'Refus / impayé', refus_abonnement = true
       where co.tournee_id = p_tournee and co.statut = 'prevue'
         and (select e.consigne_terrain from public.etat_terrain_client(co.client_id, t.date) e) = 'ne_pas_servir';
    end if;
    -- Ce qui n'a pas été visité est tracé comme non réalisé.
    update public.collectes set statut = 'non_realisee', motif = 'Non visité en fin de tournée'
     where tournee_id = p_tournee and statut = 'prevue';
    update public.tournees_precollecte set statut = 'terminee', fin_at = now() where id = p_tournee;
  else
    update public.tournees_precollecte set statut = p_statut where id = p_tournee;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Indicateurs : un passage refusé n'était pas dû
-- -----------------------------------------------------------------------------
-- kpi_calculer : copie intégrale de 20261013000011, seul le calcul des passages
-- (indicateurs 3 et 8) change. Les relevés déjà figés ne sont pas recalculés.
create or replace function public.kpi_calculer(
  p_debut date, p_fin date, p_perimetre text default 'pilote', p_type text default 'libre'
) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v_jour date := (now() at time zone 'Africa/Douala')::date;
  v_fin date := least(p_fin, (now() at time zone 'Africa/Douala')::date);
  v_debut_ts timestamptz := p_debut::timestamp at time zone 'Africa/Douala';
  v_fin_ts timestamptz;
  v_ref_ts timestamptz;
  v_grace int;
  v_commission numeric;
  v_ents uuid[];
  v_inscrits int; v_a_jour int; v_en_grace int; v_precos int;
  v_prevus int; v_realises int; v_refus int;
  v_cohorte int; v_renouveles int;
  v_sig_n int; v_sig_h numeric; v_sig_attente int; v_sig_ancien numeric;
  v_charges bigint; v_menages_mois bigint; v_encaisse bigint; v_ent_saisies int; v_ent_servi int;
  v_mm bigint; v_total bigint; v_mm_n int; v_total_n int;
  v_incidents int;
  v_esp_attente int; v_esp_attente_fcfa bigint; v_esp_rejet int; v_esp_rejet_fcfa bigint;
  v_cout jsonb;
begin
  if p_debut is null or p_fin is null or p_debut > v_fin then
    return null;
  end if;
  v_fin_ts := (v_fin + 1)::timestamp at time zone 'Africa/Douala';
  v_ref_ts := least(now(), v_fin_ts);

  select coalesce((select (valeur #>> '{}')::int from public.parametres_plateforme where cle = 'delai_grace_jours'), 7)
    into v_grace;
  select coalesce((select (valeur #>> '{}')::numeric from public.parametres_plateforme where cle = 'commission_taux'), 0)
    into v_commission;

  select coalesce(array_agg(e.id), '{}') into v_ents
    from public.entreprises e
   where p_perimetre = 'pilote' or public.kpi_ville_entreprise(e.id) = p_perimetre;

  -- 1 et 2. Abonnés à jour et ménages inscrits, au jour de mesure
  with fp as (
    select f.client_id, f.periode_debut, f.periode_fin
      from public.factures f
      join public.clients c on c.id = f.client_id and not c.est_demo
     where f.entreprise_id = any(v_ents) and f.statut <> 'annulee'
       and f.montant_fcfa <= coalesce((select sum(p.montant_fcfa) from public.paiements_clients p
                                        where p.facture_id = f.id and p.statut = 'valide' and p.created_at < v_fin_ts), 0)
  ), inscrits as (
    select c.id, c.entreprise_id from public.clients c
     where c.entreprise_id = any(v_ents) and not c.est_demo
       and c.statut in ('actif', 'suspendu') and c.created_at < v_fin_ts
  ), a_jour as (
    select i.id, bool_or(fp.periode_fin >= v_fin) as couvert
      from inscrits i join fp on fp.client_id = i.id
     where fp.periode_debut <= v_fin and fp.periode_fin >= v_fin - v_grace
     group by i.id
  )
  select (select count(*) from inscrits),
         (select count(*) from a_jour),
         (select count(*) from a_jour where not couvert),
         (select count(distinct entreprise_id) from inscrits)
    into v_inscrits, v_a_jour, v_en_grace, v_precos;

  -- 3 et 8. Passages planifiés et réalisés. Un passage refusé pour abonnement
  -- impayé ou expiré (blocage au passage, migration 20261019000013) n'était
  -- pas dû : il sort du dénominateur et il est compté à part.
  select count(*) filter (where not co.refus_abonnement), count(*) filter (where co.statut = 'realisee'),
         count(*) filter (where co.refus_abonnement)
    into v_prevus, v_realises, v_refus
    from public.collectes co
    join public.clients c on c.id = co.client_id and not c.est_demo
    left join public.tournees_precollecte t on t.id = co.tournee_id
   where co.entreprise_id = any(v_ents)
     and co.date_prevue between p_debut and v_fin
     and t.statut is distinct from 'annulee'
     and not (co.statut = 'prevue' and co.date_prevue >= v_jour);

  -- 4. Rétention sur 30 jours glissants, délai de grâce écoulé
  with fp as (
    select f.client_id, f.periode_debut, f.periode_fin
      from public.factures f
      join public.clients c on c.id = f.client_id and not c.est_demo
     where f.entreprise_id = any(v_ents) and f.statut <> 'annulee'
       and f.montant_fcfa <= coalesce((select sum(p.montant_fcfa) from public.paiements_clients p
                                        where p.facture_id = f.id and p.statut = 'valide' and p.created_at < v_fin_ts), 0)
  ), cohorte as (
    select fp.client_id, max(fp.periode_debut) as periode_debut
      from fp
     where fp.periode_fin between v_fin - v_grace - 29 and v_fin - v_grace
     group by fp.client_id
  )
  select count(*),
         count(*) filter (where exists (select 1 from fp f2 where f2.client_id = co.client_id and f2.periode_debut > co.periode_debut))
    into v_cohorte, v_renouveles
    from cohorte co;

  -- 5. Signalements des ménages : résolus dans la période, puis en attente au jour de mesure
  select count(*), avg(extract(epoch from (i.resolu_at - i.created_at)) / 3600.0)
    into v_sig_n, v_sig_h
    from public.incidents_precollecte i
    left join public.clients c on c.id = i.client_id
   where i.source = 'client' and i.entreprise_id = any(v_ents) and not coalesce(c.est_demo, false)
     and i.resolu_at >= v_debut_ts and i.resolu_at < v_fin_ts;

  select count(*), max(extract(epoch from (v_ref_ts - i.created_at)) / 3600.0)
    into v_sig_attente, v_sig_ancien
    from public.incidents_precollecte i
    left join public.clients c on c.id = i.client_id
   where i.source = 'client' and i.entreprise_id = any(v_ents) and not coalesce(c.est_demo, false)
     and i.created_at < v_fin_ts
     and (i.resolu_at >= v_fin_ts or (i.resolu_at is null and i.statut <> 'resolu'));

  -- 6. Coût de collecte par ménage servi (mensuel)
  if p_type = 'mois' then
    with mois as (
      select generate_series(date_trunc('month', p_debut::timestamp), date_trunc('month', v_fin::timestamp), interval '1 month')::date as m
    ), couts as (
      select ce.entreprise_id, ce.mois, sum(ce.montant_fcfa)::bigint as charges
        from public.couts_exploitation ce
       where ce.entreprise_id = any(v_ents) and ce.mois in (select m from mois)
       group by 1, 2
    ), servis as (
      select co.entreprise_id, date_trunc('month', co.date_prevue::timestamp)::date as mois, count(distinct co.client_id) as menages
        from public.collectes co
        join public.clients c on c.id = co.client_id and not c.est_demo
       where co.entreprise_id = any(v_ents) and co.statut = 'realisee' and co.date_prevue between p_debut and v_fin
       group by 1, 2
    ), recettes as (
      select p.entreprise_id, date_trunc('month', p.created_at at time zone 'Africa/Douala')::date as mois, sum(p.montant_fcfa)::bigint as encaisse
        from public.paiements_clients p
        join public.clients c on c.id = p.client_id and not c.est_demo
       where p.entreprise_id = any(v_ents) and p.statut = 'valide'
         and p.created_at >= v_debut_ts and p.created_at < v_fin_ts
       group by 1, 2
    )
    select coalesce(sum(cs.charges), 0), coalesce(sum(s.menages), 0), coalesce(sum(r.encaisse), 0),
           count(distinct cs.entreprise_id),
           (select count(distinct entreprise_id) from servis)
      into v_charges, v_menages_mois, v_encaisse, v_ent_saisies, v_ent_servi
      from couts cs
      left join servis s on s.entreprise_id = cs.entreprise_id and s.mois = cs.mois
      left join recettes r on r.entreprise_id = cs.entreprise_id and r.mois = cs.mois;

    v_cout := jsonb_build_object(
      'valeur', round(v_charges::numeric / nullif(v_menages_mois, 0)),
      'charges', v_charges,
      'menages_mois', v_menages_mois,
      -- Ce que le précollecteur garde, par ménage servi (critère C3).
      'recette_par_menage', round(v_encaisse * (1 - v_commission) / nullif(v_menages_mois, 0)),
      'commission_taux', v_commission,
      'entreprises_saisies', v_ent_saisies,
      'entreprises_actives', v_ent_servi);
  end if;

  -- 7. Part du Mobile Money (en montant)
  select coalesce(sum(p.montant_fcfa) filter (where p.methode <> 'especes'), 0), coalesce(sum(p.montant_fcfa), 0),
         count(*) filter (where p.methode <> 'especes'), count(*)
    into v_mm, v_total, v_mm_n, v_total_n
    from public.paiements_clients p
    join public.clients c on c.id = p.client_id and not c.est_demo
   where p.entreprise_id = any(v_ents) and p.statut in ('valide', 'a_valider')
     and p.created_at >= v_debut_ts and p.created_at < v_fin_ts;

  -- 8. Incidents déclarés par les équipes
  select count(*) into v_incidents
    from public.incidents_precollecte i
    left join public.clients c on c.id = i.client_id
   where i.source = 'precollecteur' and i.entreprise_id = any(v_ents) and not coalesce(c.est_demo, false)
     and i.created_at >= v_debut_ts and i.created_at < v_fin_ts;

  -- Circuit espèces (critère C4) : sommes non rapprochées et sommes rejetées
  select count(*) filter (where p.statut = 'a_valider' and p.created_at < v_ref_ts - interval '7 days'),
         coalesce(sum(p.montant_fcfa) filter (where p.statut = 'a_valider' and p.created_at < v_ref_ts - interval '7 days'), 0),
         count(*) filter (where p.statut = 'rejete' and p.created_at >= v_debut_ts),
         coalesce(sum(p.montant_fcfa) filter (where p.statut = 'rejete' and p.created_at >= v_debut_ts), 0)
    into v_esp_attente, v_esp_attente_fcfa, v_esp_rejet, v_esp_rejet_fcfa
    from public.paiements_clients p
    join public.clients c on c.id = p.client_id and not c.est_demo
   where p.entreprise_id = any(v_ents) and p.methode = 'especes' and p.created_at < v_fin_ts;

  return jsonb_build_object(
    'debut', p_debut,
    'fin', p_fin,
    'mesure_au', v_fin,
    'type', p_type,
    'perimetre', p_perimetre,
    'delai_grace_jours', v_grace,
    'precollecteurs_actifs', v_precos,
    'menages_inscrits', v_inscrits,
    'abonnes_actifs', jsonb_build_object('valeur', v_a_jour, 'dont_grace', v_en_grace),
    'taux_paiement', jsonb_build_object('valeur', round(v_a_jour::numeric / nullif(v_inscrits, 0), 4), 'num', v_a_jour, 'den', v_inscrits),
    'taux_execution', jsonb_build_object('valeur', round(v_realises::numeric / nullif(v_prevus, 0), 4), 'num', v_realises, 'den', v_prevus,
                                        'exclus_refus', v_refus),
    'retention', jsonb_build_object('valeur', round(v_renouveles::numeric / nullif(v_cohorte, 0), 4), 'num', v_renouveles, 'den', v_cohorte),
    'delai_signalement_h', jsonb_build_object('valeur', round(v_sig_h, 1), 'n', v_sig_n,
                                              'en_attente', v_sig_attente, 'plus_ancien_h', round(v_sig_ancien, 1)),
    'cout_par_menage', v_cout,
    'part_mobile_money', jsonb_build_object('valeur', round(v_mm::numeric / nullif(v_total, 0), 4), 'num', v_mm, 'den', v_total,
                                            'nb', v_mm_n, 'nb_total', v_total_n),
    'incidents_1000', jsonb_build_object('valeur', round(v_incidents * 1000.0 / nullif(v_realises, 0), 1), 'num', v_incidents, 'den', v_realises),
    'especes', jsonb_build_object('a_valider_7j', v_esp_attente, 'a_valider_7j_fcfa', v_esp_attente_fcfa,
                                  'rejetees', v_esp_rejet, 'rejetees_fcfa', v_esp_rejet_fcfa)
  );
end $$;

-- Supervision Mairie (20260928000004) : mêmes signatures, passages refusés exclus.
create or replace function public.supervision_zones()
returns table (
  zone_id uuid, zone_nom text, couleur text, contour jsonb, commune text,
  precollecteurs text[], nb_clients bigint, nb_clients_actifs bigint,
  collectes_30j bigint, collectes_realisees_30j bigint, incidents_ouverts bigint
)
language sql stable security definer set search_path = public as $$
  select z.id, z.nom, z.couleur, z.contour, cm.nom,
    coalesce((select array_agg(e.nom order by e.nom) from public.zone_affectations a
              join public.entreprises e on e.id = a.entreprise_id where a.zone_id = z.id), '{}'),
    (select count(*) from public.clients c where c.zone_id = z.id and not c.est_demo),
    (select count(*) from public.clients c where c.zone_id = z.id and c.statut = 'actif' and not c.est_demo),
    (select count(*) from public.collectes co join public.clients c on c.id = co.client_id
      where c.zone_id = z.id and co.date_prevue >= current_date - 30 and not c.est_demo and not co.refus_abonnement),
    (select count(*) from public.collectes co join public.clients c on c.id = co.client_id
      where c.zone_id = z.id and co.statut = 'realisee' and co.date_prevue >= current_date - 30 and not c.est_demo),
    (select count(*) from public.incidents_precollecte i join public.clients c on c.id = i.client_id
      where c.zone_id = z.id and i.statut <> 'resolu')
  from public.zones z
  left join public.communes cm on cm.id = z.commune_id
  where public.est_superviseur()
  order by z.nom
$$;

create or replace function public.supervision_precollecteurs()
returns table (
  entreprise_id uuid, nom text, telephone text, statut text, zones text[],
  nb_clients bigint, nb_tricycles bigint, nb_employes bigint,
  collectes_30j bigint, collectes_realisees_30j bigint, incidents_ouverts bigint
)
language sql stable security definer set search_path = public as $$
  select e.id, e.nom, e.telephone, e.statut,
    coalesce((select array_agg(z.nom order by z.nom) from public.zone_affectations a
              join public.zones z on z.id = a.zone_id where a.entreprise_id = e.id), '{}'),
    (select count(*) from public.clients c where c.entreprise_id = e.id and c.statut = 'actif' and not c.est_demo),
    (select count(*) from public.tricycles t where t.entreprise_id = e.id and t.statut = 'actif'),
    (select count(*) from public.employes em where em.entreprise_id = e.id and em.actif),
    (select count(*) from public.collectes co join public.clients c on c.id = co.client_id
      where co.entreprise_id = e.id and co.date_prevue >= current_date - 30 and not c.est_demo and not co.refus_abonnement),
    (select count(*) from public.collectes co join public.clients c on c.id = co.client_id
      where co.entreprise_id = e.id and co.statut = 'realisee' and co.date_prevue >= current_date - 30 and not c.est_demo),
    (select count(*) from public.incidents_precollecte i where i.entreprise_id = e.id and i.statut <> 'resolu')
  from public.entreprises e
  where public.est_superviseur()
  order by e.nom
$$;

create or replace function public.supervision_activite(p_semaines int default 12)
returns table (semaine date, prevues bigint, realisees bigint, non_realisees bigint)
language sql stable security definer set search_path = public as $$
  select date_trunc('week', co.date_prevue)::date,
         count(*) filter (where not co.refus_abonnement),
         count(*) filter (where co.statut = 'realisee'),
         count(*) filter (where co.statut = 'non_realisee' and not co.refus_abonnement)
  from public.collectes co join public.clients c on c.id = co.client_id
  where public.est_superviseur() and not c.est_demo
    and co.date_prevue >= current_date - (p_semaines * 7)
  group by 1 order by 1
$$;

-- -----------------------------------------------------------------------------
-- 7. Droits (aucune fonction n'est ouverte par défaut depuis 20261011000009)
-- -----------------------------------------------------------------------------
-- Appelées par la vue (droits de l'appelant) : ouvertes aux comptes connectés.
revoke all on function public.jour_douala() from public, anon;
revoke all on function public.parametre_entier(text, int) from public, anon;
revoke all on function public.terrain_blocage_actif() from public, anon;
revoke all on function public.statut_abonnement_calcule(text, bigint, date, date, int, int) from public, anon;
revoke all on function public.consigne_terrain_calculee(text, numeric, numeric) from public, anon;
grant execute on function public.jour_douala() to authenticated, service_role;
grant execute on function public.parametre_entier(text, int) to authenticated, service_role;
grant execute on function public.terrain_blocage_actif() to authenticated, service_role;
grant execute on function public.statut_abonnement_calcule(text, bigint, date, date, int, int) to authenticated, service_role;
grant execute on function public.consigne_terrain_calculee(text, numeric, numeric) to authenticated, service_role;
-- Interne aux fonctions de terrain.
revoke all on function public.etat_terrain_client(uuid, date) from public, anon, authenticated;
-- Fonctions de terrain : comptes connectés seulement (elles vérifient ensuite gérant ou équipier).
revoke all on function public.scanner_passage(uuid, text, timestamptz) from public, anon;
revoke all on function public.pointer_passage(uuid, text, text, timestamptz) from public, anon;
revoke all on function public.changer_statut_tournee(uuid, text) from public, anon;
grant execute on function public.scanner_passage(uuid, text, timestamptz) to authenticated;
grant execute on function public.pointer_passage(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.changer_statut_tournee(uuid, text) to authenticated;

commit;

-- Contrôle : 7 lignes « OK » attendues (la ligne 1 donne aussi l'état de l'interrupteur).
select controle, resultat
from (
  select 1 as n, 'Interrupteur terrain_blocage_actif' as controle,
         case when exists (select 1 from public.parametres_plateforme where cle = 'terrain_blocage_actif')
              then 'OK (blocage ' || case when public.terrain_blocage_actif() then 'ACTIF' else 'éteint' end || ')'
              else 'À VÉRIFIER' end as resultat
  union all
  select 2, 'Colonnes fin_grace, montant_a_valider, consigne_terrain en fin de v_clients_statut',
         case when (select count(*) from information_schema.columns
                     where table_schema = 'public' and table_name = 'v_clients_statut'
                       and column_name in ('fin_grace', 'montant_a_valider', 'consigne_terrain')) = 3
              then 'OK' else 'À VÉRIFIER' end
  union all
  select 3, 'Règle : couverture finie la veille = grâce ; il y a 7 jours = grâce ; il y a 8 jours = expiré (délai de 7 j)',
         case when public.statut_abonnement_calcule('actif', 0, current_date - 1, current_date, 7, 7) = 'grace'
               and public.statut_abonnement_calcule('actif', 0, current_date - 7, current_date, 7, 7) = 'grace'
               and public.statut_abonnement_calcule('actif', 0, current_date - 8, current_date, 7, 7) = 'expire'
               and public.consigne_terrain_calculee('impaye', 3500, 3500) = 'servir_rappeler'
               and public.consigne_terrain_calculee('expire', 0, 0) = 'ne_pas_servir'
              then 'OK' else 'À VÉRIFIER' end
  union all
  select 4, 'La vue et le calcul de terrain sont d''accord sur toutes les fiches',
         case when (select count(*) from public.v_clients_statut v
                     cross join lateral public.etat_terrain_client(v.id, public.jour_douala()) e
                     where e.statut_abonnement is distinct from v.statut_abonnement
                        or e.consigne_terrain is distinct from v.consigne_terrain) = 0
              then 'OK' else 'À VÉRIFIER' end
  union all
  select 5, 'collectes.refus_abonnement protégée (déclencheur collectes_refus_systeme)',
         case when exists (select 1 from information_schema.columns
                            where table_schema = 'public' and table_name = 'collectes' and column_name = 'refus_abonnement')
               and exists (select 1 from pg_trigger where tgname = 'collectes_refus_systeme'
                            and tgrelid = 'public.collectes'::regclass)
              then 'OK' else 'À VÉRIFIER' end
  union all
  select 6, 'Une seule version de scanner_passage et de pointer_passage',
         case when (select count(*) from pg_proc where proname = 'scanner_passage' and pronamespace = 'public'::regnamespace) = 1
               and (select count(*) from pg_proc where proname = 'pointer_passage' and pronamespace = 'public'::regnamespace) = 1
              then 'OK' else 'À VÉRIFIER' end
  union all
  select 7, 'Droits : calculs ouverts aux comptes, fermés au visiteur ; etat_terrain_client interne',
         case when has_function_privilege('authenticated', 'public.statut_abonnement_calcule(text, bigint, date, date, int, int)', 'execute')
               and has_function_privilege('authenticated', 'public.consigne_terrain_calculee(text, numeric, numeric)', 'execute')
               and has_function_privilege('authenticated', 'public.parametre_entier(text, int)', 'execute')
               and has_function_privilege('authenticated', 'public.jour_douala()', 'execute')
               and not has_function_privilege('anon', 'public.statut_abonnement_calcule(text, bigint, date, date, int, int)', 'execute')
               and not has_function_privilege('anon', 'public.scanner_passage(uuid, text, timestamptz)', 'execute')
               and not has_function_privilege('authenticated', 'public.etat_terrain_client(uuid, date)', 'execute')
              then 'OK' else 'À VÉRIFIER' end
) x order by n;
