-- =============================================================================
-- MyKlinTown — Indicateurs du pilote (livrable Technipole du 2 septembre 2026, §8)
-- =============================================================================
-- Les huit indicateurs promis au Technipole, calculés PAR LA BASE sur les
-- données réelles, relevés chaque semaine et chaque mois, et HISTORISÉS : un
-- relevé ne se réécrit pas, il garde ce que la plateforme savait à cette date.
--
--   1. ménages abonnés actifs         5. délai de traitement d'un signalement
--   2. taux de paiement effectif      6. coût de collecte par ménage servi
--   3. taux d'exécution du service    7. part du Mobile Money
--   4. rétention mensuelle            8. incidents pour 1 000 passages
--
-- Ajouts :
--   • incidents_precollecte.resolu_at, posé par la base au passage à « résolu »
--     (sans lui, le délai de traitement n'est pas mesurable) ;
--   • couts_exploitation : charges mensuelles saisies par chaque précollecteur
--     (sans elles, le coût par ménage servi n'est pas mesurable) ;
--   • kpi_releves : relevés figés (semaine / mois × pilote / Yaoundé / Douala) ;
--   • paramètres `pilote_periode` et `kpi_cibles` : les cibles M1-M3 du livrable
--     sont lues en base, jamais écrites dans le code ;
--   • relevé quotidien par pg_cron si l'extension est disponible ; à défaut, la
--     page rattrape les relevés manquants à son ouverture (marqués « rattrapage »).
--
-- Données de démonstration (`clients.est_demo`) exclues partout.
-- Dates : jours de Yaoundé/Douala (Africa/Douala), pas de l'horloge UTC du serveur.
--
-- Script ADDITIF et IDEMPOTENT : il peut être rejoué sans risque.
-- =============================================================================

-- =============================================================================
-- 1. Paramètres : période du pilote et cibles
-- =============================================================================

insert into public.parametres_plateforme (cle, valeur, description) values
  ('pilote_periode', '{"debut": "2026-10-01", "fin": "2026-12-31"}',
   'Période de la phase pilote (rapport Technipole du 26/08/2026). Les relevés d''indicateurs couvrent cette période.'),
  ('kpi_cibles', '{
     "mois": ["2026-10-01", "2026-11-01", "2026-12-01"],
     "abonnes_actifs": [800, 1500, 2000],
     "taux_paiement": [0.70, 0.80, 0.85],
     "taux_execution": [0.90, 0.93, 0.95],
     "retention": [null, 0.88, 0.90],
     "delai_signalement_h": [72, 48, 24],
     "cout_par_menage": [null, null, null],
     "part_mobile_money": [0, 0.15, 0.30],
     "incidents_1000_variation": [null, -0.20, -0.35],
     "criteres": {"c1_abonnes_actifs": 1600, "c2_taux_paiement": 0.80}
   }',
   'Cibles de fin de mois M1 (octobre), M2 (novembre), M3 (décembre) — livrable Technipole du 2 septembre 2026, chapitre 8. null = pas de cible (« mesure »). Incidents : variation visée par rapport à la valeur d''octobre, qui sert de référence. criteres = seuils des critères de réussite C1 et C2 (chapitre 1.3).')
on conflict (cle) do nothing;

-- =============================================================================
-- 2. Signalements : heure de résolution posée par la base
-- =============================================================================
-- Le délai « du dépôt à la résolution » demande l'heure de résolution. Elle est
-- posée par la base, jamais saisie : par l'API, une valeur envoyée est ignorée.
-- Les incidents résolus AVANT cette migration n'ont pas d'heure : ils sont
-- exclus du délai moyen (on ne l'invente pas).
--
-- ⚠️ SECURITY INVOKER : la fonction doit voir le rôle de l'appelant.

alter table public.incidents_precollecte add column if not exists resolu_at timestamptz;

create or replace function public.horodater_resolution_incident() returns trigger
language plpgsql set search_path = public as $$
declare
  v_api boolean := current_user in ('anon', 'authenticated');
begin
  if tg_op = 'UPDATE' and new.statut is not distinct from old.statut then
    if v_api then new.resolu_at := old.resolu_at; end if;
    return new;
  end if;
  if new.statut = 'resolu' then
    -- Hors API (SQL Editor, reprise de données), une heure explicite est gardée.
    if v_api or new.resolu_at is null or (tg_op = 'UPDATE' and new.resolu_at is not distinct from old.resolu_at) then
      new.resolu_at := now();
    end if;
  else
    new.resolu_at := null;
  end if;
  return new;
end $$;

drop trigger if exists incidents_resolution on public.incidents_precollecte;
create trigger incidents_resolution before insert or update on public.incidents_precollecte
  for each row execute function public.horodater_resolution_incident();

create index if not exists incidents_pc_resolu_idx on public.incidents_precollecte (resolu_at) where resolu_at is not null;

-- =============================================================================
-- 3. Charges d'exploitation mensuelles (saisies par le gérant)
-- =============================================================================
-- « Coût de collecte par ménage servi = charges d'exploitation ÷ ménages servis »
-- (livrable §8) et critère C3. Les charges du terrain sont connues du seul
-- précollecteur : il les saisit chaque mois. La Mairie n'en voit que l'agrégat.

create table if not exists public.couts_exploitation (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  mois date not null check (extract(day from mois) = 1),
  categorie text not null check (categorie in ('carburant', 'entretien', 'personnel', 'autres')),
  montant_fcfa int not null check (montant_fcfa between 0 and 100000000),
  note text check (char_length(note) <= 500),
  saisi_par uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entreprise_id, mois, categorie)
);
create index if not exists couts_exploitation_mois_idx on public.couts_exploitation (mois);

-- Qui a saisi : posé par la base (par l'API, la valeur envoyée est ignorée).
create or replace function public.horodater_saisie_couts() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.saisi_par := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists couts_exploitation_saisie on public.couts_exploitation;
create trigger couts_exploitation_saisie before insert or update on public.couts_exploitation
  for each row execute function public.horodater_saisie_couts();

-- Une ligne ne change ni d'entreprise, ni de mois, ni de poste : on corrige son montant.
drop trigger if exists couts_exploitation_colonnes_systeme on public.couts_exploitation;
create trigger couts_exploitation_colonnes_systeme before update on public.couts_exploitation
  for each row execute function public.garde_colonnes_systeme('entreprise_id', 'mois', 'categorie', 'created_at');

alter table public.couts_exploitation enable row level security;

-- Le gérant (pas l'agent de terrain) et l'administrateur ; personne d'autre.
drop policy if exists couts_gerant on public.couts_exploitation;
create policy couts_gerant on public.couts_exploitation for all to authenticated
  using (public.est_gerant(entreprise_id) or public.est_admin())
  with check (public.est_gerant(entreprise_id) or public.est_admin());

revoke all on public.couts_exploitation from anon;

-- =============================================================================
-- 4. Relevés historisés
-- =============================================================================
-- Écrits uniquement par la base (fonction de relevé) ; lus par la Mairie et les
-- administrateurs. Aucun droit d'écriture par l'API : un relevé transmis au
-- Technipole ne peut pas être retouché après coup.

create table if not exists public.kpi_releves (
  id uuid primary key default gen_random_uuid(),
  type_periode text not null check (type_periode in ('semaine', 'mois')),
  debut date not null,
  fin date not null check (fin >= debut),
  perimetre text not null check (perimetre in ('pilote', 'yaounde', 'douala')),
  valeurs jsonb not null,
  -- auto = relevé à temps ; rattrapage = calculé plus d'un jour après la fin de la période.
  mode text not null check (mode in ('auto', 'rattrapage')),
  calcule_at timestamptz not null default now(),
  unique (type_periode, debut, perimetre)
);

alter table public.kpi_releves enable row level security;

drop policy if exists kpi_releves_lecture on public.kpi_releves;
create policy kpi_releves_lecture on public.kpi_releves for select to authenticated
  using (public.est_superviseur());

revoke all on public.kpi_releves from anon;
revoke insert, update, delete, truncate on public.kpi_releves from authenticated;

-- =============================================================================
-- 5. Calcul
-- =============================================================================
-- Fonctions INTERNES (SECURITY INVOKER, fermées aux comptes de l'API) : elles
-- ne s'exécutent que depuis `indicateurs_pilote` (SECURITY DEFINER, Mairie et
-- admin) ou depuis la tâche planifiée.

-- Ville d'un précollecteur : celle de ses zones, à défaut celle de son siège.
create or replace function public.kpi_ville_entreprise(p_entreprise uuid) returns text
language sql stable set search_path = public as $$
  select case when x.code like 'YDE%' then 'yaounde' when x.code like 'DLA%' then 'douala' end
  from (
    select cm.code, 1 as rang
      from public.zone_affectations a
      join public.zones z on z.id = a.zone_id
      join public.communes cm on cm.id = z.commune_id
     where a.entreprise_id = p_entreprise
    union all
    select cm.code, 2
      from public.entreprises e
      join public.communes cm on cm.id = e.commune_id
     where e.id = p_entreprise
  ) x
  order by x.rang, x.code
  limit 1
$$;

-- Les huit indicateurs sur une période [p_debut, p_fin], mesurés au soir de
-- p_fin (ou aujourd'hui si la période n'est pas finie).
--
-- Définitions (livrable §8, précisées pour être calculables sans ambiguïté) :
--   • payé = facture non annulée dont les paiements VALIDÉS, encaissés avant
--     la fin du jour de mesure, couvrent le montant ;
--   • abonné actif / à jour = ménage inscrit (actif ou suspendu) dont une
--     facture payée couvre le jour de mesure, ou s'est terminée depuis moins
--     que le délai de grâce (`delai_grace_jours`) ;
--   • taux de paiement = abonnés à jour ÷ ménages inscrits ;
--   • exécution = passages réalisés ÷ passages planifiés (hors tournées
--     annulées ; un passage encore « prévu » aujourd'hui n'est pas encore dû) ;
--   • rétention = sur 30 jours glissants, ménages dont la période payée s'est
--     terminée (délai de grâce écoulé) et qui ont payé la suivante ;
--   • signalement = incident déclaré par un ménage ; délai moyen du dépôt à la
--     résolution, sur les signalements résolus dans la période ;
--   • coût par ménage servi (relevé MENSUEL seulement) = charges saisies ÷
--     ménages servis au moins une fois dans le mois, chez les précollecteurs
--     qui ont saisi leurs charges ;
--   • Mobile Money = encaissements hors espèces ÷ encaissements (validés ou en
--     attente de validation, hors rejetés), en montant ;
--   • incidents pour 1 000 passages = incidents déclarés par les équipes ÷
--     passages réalisés × 1 000.
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
  v_prevus int; v_realises int;
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

  -- 3 et 8. Passages planifiés et réalisés
  select count(*), count(*) filter (where co.statut = 'realisee')
    into v_prevus, v_realises
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
    'taux_execution', jsonb_build_object('valeur', round(v_realises::numeric / nullif(v_prevus, 0), 4), 'num', v_realises, 'den', v_prevus),
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

-- Relève chaque semaine (lundi → dimanche) et chaque mois TERMINÉS du pilote qui
-- n'ont pas encore de relevé, pour les trois périmètres. Renvoie le nombre de
-- relevés créés. Un relevé existant n'est jamais recalculé.
create or replace function public.kpi_releves_a_jour() returns int
language plpgsql volatile set search_path = public as $$
declare
  v_jour date := (now() at time zone 'Africa/Douala')::date;
  v_pilote jsonb;
  v_debut date;
  v_fin date;
  v_s date;
  v_d date;
  v_f date;
  v_p text;
  v_type text;
  v_n int := 0;
  v_rc int;
begin
  select valeur into v_pilote from public.parametres_plateforme where cle = 'pilote_periode';
  v_debut := (v_pilote ->> 'debut')::date;
  v_fin := (v_pilote ->> 'fin')::date;
  if v_debut is null or v_fin is null then return 0; end if;

  foreach v_type in array array['semaine', 'mois'] loop
    v_s := case when v_type = 'semaine' then date_trunc('week', v_debut::timestamp)::date
                else date_trunc('month', v_debut::timestamp)::date end;
    while v_s <= v_fin loop
      v_d := greatest(v_s, v_debut);
      v_f := least(case when v_type = 'semaine' then v_s + 6
                        else (v_s + interval '1 month' - interval '1 day')::date end, v_fin);
      exit when v_f >= v_jour;  -- période pas encore terminée
      foreach v_p in array array['pilote', 'yaounde', 'douala'] loop
        if not exists (select 1 from public.kpi_releves r
                        where r.type_periode = v_type and r.debut = v_d and r.perimetre = v_p) then
          insert into public.kpi_releves (type_periode, debut, fin, perimetre, valeurs, mode)
          values (v_type, v_d, v_f, v_p, public.kpi_calculer(v_d, v_f, v_p, v_type),
                  case when now() < (v_f + 2)::timestamp at time zone 'Africa/Douala' then 'auto' else 'rattrapage' end)
          on conflict (type_periode, debut, perimetre) do nothing;
          get diagnostics v_rc = row_count;
          v_n := v_n + v_rc;
        end if;
      end loop;
      v_s := case when v_type = 'semaine' then v_s + 7 else (v_s + interval '1 month')::date end;
    end loop;
  end loop;
  return v_n;
end $$;

-- =============================================================================
-- 6. Lecture par la Mairie et l'équipe MyKlinTown (un seul appel par page)
-- =============================================================================
-- Rattrape d'abord les relevés manquants, puis renvoie : cibles, mois du pilote
-- (relevé figé quand le mois est clos, calcul en direct pour le mois en cours),
-- semaine en cours (en direct) et relevés hebdomadaires.
create or replace function public.indicateurs_pilote(p_perimetre text default 'pilote') returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_jour date := (now() at time zone 'Africa/Douala')::date;
  v_pilote jsonb;
  v_debut date;
  v_fin date;
  v_m date;
  v_d date;
  v_f date;
  v_rel public.kpi_releves;
  v_mois jsonb := '[]'::jsonb;
begin
  if not public.est_superviseur() then
    raise exception 'Réservé à la Mairie et à l''équipe MyKlinTown' using errcode = '42501';
  end if;
  if p_perimetre is null or p_perimetre not in ('pilote', 'yaounde', 'douala') then
    raise exception 'Périmètre inconnu : %', p_perimetre;
  end if;

  perform public.kpi_releves_a_jour();

  select valeur into v_pilote from public.parametres_plateforme where cle = 'pilote_periode';
  v_debut := (v_pilote ->> 'debut')::date;
  v_fin := (v_pilote ->> 'fin')::date;

  v_m := date_trunc('month', v_debut::timestamp)::date;
  while v_m <= v_fin loop
    v_d := greatest(v_m, v_debut);
    v_f := least((v_m + interval '1 month' - interval '1 day')::date, v_fin);
    v_rel := null;
    select * into v_rel from public.kpi_releves r
     where r.type_periode = 'mois' and r.debut = v_d and r.perimetre = p_perimetre;
    v_mois := v_mois || jsonb_build_array(jsonb_build_object(
      'debut', v_d,
      'fin', v_f,
      'etat', case when v_rel.id is not null then 'clos' when v_d <= v_jour then 'en_cours' else 'a_venir' end,
      'valeurs', coalesce(v_rel.valeurs, case when v_d <= v_jour then public.kpi_calculer(v_d, v_f, p_perimetre, 'mois') end),
      'calcule_at', v_rel.calcule_at,
      'mode', v_rel.mode));
    v_m := (v_m + interval '1 month')::date;
  end loop;

  return jsonb_build_object(
    'perimetre', p_perimetre,
    'aujourdhui', v_jour,
    'pilote', v_pilote,
    'cibles', (select valeur from public.parametres_plateforme where cle = 'kpi_cibles'),
    'releve_planifie', public.kpi_releve_planifie(),
    'mois', v_mois,
    'semaine_en_cours', case when v_jour between v_debut and v_fin then
        public.kpi_calculer(greatest(date_trunc('week', v_jour::timestamp)::date, v_debut), v_jour, p_perimetre, 'semaine') end,
    'semaines', coalesce((
      select jsonb_agg(jsonb_build_object('debut', r.debut, 'fin', r.fin, 'valeurs', r.valeurs,
                                          'calcule_at', r.calcule_at, 'mode', r.mode) order by r.debut)
        from public.kpi_releves r
       where r.type_periode = 'semaine' and r.perimetre = p_perimetre), '[]'::jsonb)
  );
end $$;

-- Droits : fonctions internes fermées à l'API ; lecture réservée aux comptes
-- connectés (la fonction vérifie elle-même le rôle Mairie / admin).
revoke all on function public.kpi_ville_entreprise(uuid) from public, anon, authenticated;
revoke all on function public.kpi_calculer(date, date, text, text) from public, anon, authenticated;
revoke all on function public.kpi_releves_a_jour() from public, anon, authenticated;
revoke all on function public.indicateurs_pilote(text) from public, anon;
grant execute on function public.indicateurs_pilote(text) to authenticated;

-- =============================================================================
-- 7. Relevé quotidien (pg_cron), si l'extension est disponible
-- =============================================================================
-- Chaque jour à 06:00 (heure de Yaoundé) : relève la semaine qui vient de se
-- terminer (le lundi) et le mois qui vient de se terminer (le 1er). Sans
-- pg_cron, la page fait le même rattrapage à son ouverture.
do $cron$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron indisponible : relevés faits à l''ouverture de la page Indicateurs.';
    return;
  end if;
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    raise notice 'pg_cron non activé (%) : relevés faits à l''ouverture de la page Indicateurs.', sqlerrm;
    return;
  end;
  -- Droits recommandés par Supabase ; sans effet s'ils sont déjà donnés.
  begin
    grant usage on schema cron to postgres;
    grant all privileges on all tables in schema cron to postgres;
  exception when others then
    null;
  end;
  begin
    perform cron.schedule('mkt-releves-indicateurs', '0 5 * * *', 'select public.kpi_releves_a_jour()');
  exception when others then
    raise notice 'Relevé planifié non créé (%) : relevés faits à l''ouverture de la page Indicateurs.', sqlerrm;
  end;
end $cron$;

-- La tâche existe-t-elle vraiment ? (faux si pg_cron est absent ou illisible)
create or replace function public.kpi_releve_planifie() returns boolean
language plpgsql stable set search_path = public as $$
begin
  return exists (select 1 from cron.job where jobname = 'mkt-releves-indicateurs' and active);
exception when others then
  return false;
end $$;

revoke all on function public.kpi_releve_planifie() from public, anon, authenticated;

-- =============================================================================
-- Contrôle final (une ligne par point ; « relevé planifié » à false n'est pas
-- une erreur : la page rattrape alors les relevés à son ouverture)
-- =============================================================================
select 'incidents : heure de résolution' as controle,
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'incidents_precollecte' and column_name = 'resolu_at') as ok
union all
select 'charges d''exploitation protégées (RLS)', relrowsecurity from pg_class where oid = 'public.couts_exploitation'::regclass
union all
select 'relevés protégés (RLS)', relrowsecurity from pg_class where oid = 'public.kpi_releves'::regclass
union all
select 'cibles du livrable en base', exists (select 1 from public.parametres_plateforme where cle = 'kpi_cibles')
union all
select 'calcul fermé aux visiteurs et aux comptes',
       not has_function_privilege('anon', 'public.indicateurs_pilote(text)', 'execute')
       and not has_function_privilege('authenticated', 'public.kpi_calculer(date, date, text, text)', 'execute')
union all
select 'relevé quotidien planifié (sinon : à l''ouverture de la page)', public.kpi_releve_planifie();
