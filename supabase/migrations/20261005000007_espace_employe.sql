-- =============================================================================
-- MyKlinTown — Espace employé (proposition de Pie, compte rendu de test)
-- =============================================================================
-- Les employés d'une entreprise de précollecte (chauffeur, ramasseur) ont
-- désormais LEUR compte, limité au terrain :
--   ++  Invitation par le gérant (code à usage unique, 7 jours) → l'employé crée
--       son compte (e-mail) et rejoint l'équipe. Rôle « employe ».
--   ++  Équipe par tournée (une ou plusieurs personnes, définie à l'avance) :
--       scans, passages, incidents et statistiques partagés entre ses membres.
--   ++  Gestes de terrain par fonctions contrôlées (pointer, scanner, démarrer /
--       terminer) : gérant OU équipier de la tournée, jamais une tournée terminée.
--   ++  Encaissement en espèces par l'employé, « à valider » par le gérant : une
--       facture n'est payée qu'avec des paiements VALIDÉS.
--   ++  Position en direct pendant la tournée (appli ouverte).
--   ++  Droits resserrés : jusqu'ici tout membre d'une entreprise avait tous les
--       droits. Le gérant garde tout ; l'employé lit ce qu'il lui faut et
--       n'écrit que par les fonctions ci-dessus. Désactiver sa fiche suspend
--       son accès.
--
-- Script ADDITIF et IDEMPOTENT. À exécuter APRÈS 20261004000006.
-- La valeur « employe » est ajoutée au type des rôles dans la même exécution :
-- elle n'est donc jamais utilisée DIRECTEMENT par ce script (seulement dans le
-- corps de fonctions, évalué plus tard).
-- =============================================================================

alter type public.user_role add value if not exists 'employe';

-- -----------------------------------------------------------------------------
-- 1. Compte ↔ fiche employé, équipe de tournée, invitations, positions
-- -----------------------------------------------------------------------------
alter table public.employes add column if not exists user_id uuid references public.profiles(id) on delete set null;
create unique index if not exists employes_user_unique on public.employes (user_id) where user_id is not null;

create table if not exists public.tournee_equipe (
  tournee_id uuid not null references public.tournees_precollecte(id) on delete cascade,
  employe_id uuid not null references public.employes(id) on delete cascade,
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tournee_id, employe_id)
);
create index if not exists tournee_equipe_employe_idx on public.tournee_equipe (employe_id);

-- Reprise : le « responsable » unique des tournées existantes devient leur équipe.
insert into public.tournee_equipe (tournee_id, employe_id, entreprise_id)
select t.id, t.employe_id, t.entreprise_id
from public.tournees_precollecte t
where t.employe_id is not null
on conflict do nothing;

create table if not exists public.invitations_employe (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  employe_id uuid not null references public.employes(id) on delete cascade,
  code text not null unique,
  cree_par uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  expire_at timestamptz not null default now() + interval '7 days',
  utilisee_at timestamptz,
  utilisee_par uuid references public.profiles(id) on delete set null
);
create index if not exists invitations_employe_employe_idx on public.invitations_employe (employe_id);

create table if not exists public.positions_tournee (
  id bigint generated always as identity primary key,
  tournee_id uuid not null references public.tournees_precollecte(id) on delete cascade,
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  employe_id uuid references public.employes(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  lat double precision not null,
  lng double precision not null,
  precision_m real,
  created_at timestamptz not null default now()
);
create index if not exists positions_tournee_idx on public.positions_tournee (tournee_id, created_at desc);

-- Paiement en espèces reçu par un employé : à valider par le gérant.
alter table public.paiements_clients add column if not exists statut text not null default 'valide';
alter table public.paiements_clients add column if not exists valide_par uuid references public.profiles(id) on delete set null;
alter table public.paiements_clients add column if not exists valide_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'paiements_clients_statut_check') then
    alter table public.paiements_clients
      add constraint paiements_clients_statut_check check (statut in ('valide', 'a_valider', 'rejete'));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Qui est qui dans l'entreprise
-- -----------------------------------------------------------------------------
create or replace function public.est_gerant(p_entreprise uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.entreprise_membres
    where entreprise_id = p_entreprise and user_id = auth.uid() and role_membre = 'gerant'
  )
$$;

-- Employé : membre « agent » ET fiche employé ACTIVE (désactiver la fiche suspend l'accès).
create or replace function public.est_agent(p_entreprise uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.entreprise_membres m
    join public.employes e on e.entreprise_id = m.entreprise_id and e.user_id = m.user_id
    where m.entreprise_id = p_entreprise and m.user_id = auth.uid()
      and m.role_membre = 'agent' and e.actif
  )
$$;

create or replace function public.mon_employe() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.employes where user_id = auth.uid() and actif limit 1
$$;

-- Membre de l'équipe de cette tournée (fiche active).
create or replace function public.est_equipier(p_tournee uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tournee_equipe te
    join public.employes e on e.id = te.employe_id
    where te.tournee_id = p_tournee and e.user_id = auth.uid() and e.actif
  )
$$;

-- Peut agir sur le terrain pour cette tournée : son gérant, ou un équipier.
create or replace function public.peut_agir_sur_tournee(p_tournee uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tournees_precollecte t
    where t.id = p_tournee
      and (public.est_gerant(t.entreprise_id)
           or public.est_admin()
           or (public.est_agent(t.entreprise_id) and public.est_equipier(t.id)))
  )
$$;

-- -----------------------------------------------------------------------------
-- 3. Le rôle « employe » suit l'appartenance à une équipe
-- -----------------------------------------------------------------------------
-- Reprise de guard_profile_role (20260831000003) avec deux passages autorisés,
-- adossés aux DONNÉES et non à la parole du porteur du compte :
--   citoyen/precollecteur → employe : seulement avec une appartenance « agent »
--     créée par rejoindre_entreprise (aucune politique ne permet de l'insérer) ;
--   employe → citoyen : seulement quand plus aucune appartenance ne subsiste.
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_claims jsonb;
begin
  if new.role is not distinct from old.role then
    return new;
  end if;

  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    v_claims := null;
  end;

  if v_claims is null then
    return new;
  end if;

  if (v_claims ->> 'role') = 'service_role' then
    return new;
  end if;

  if public.current_user_role() = 'admin' then
    return new;
  end if;

  if new.role::text = 'employe' and old.role::text in ('citoyen', 'precollecteur')
     and exists (
       select 1 from public.entreprise_membres m
       join public.employes e on e.entreprise_id = m.entreprise_id and e.user_id = m.user_id
       where m.user_id = new.id and m.role_membre = 'agent'
     ) then
    return new;
  end if;

  if old.role::text = 'employe' and new.role::text = 'citoyen'
     and not exists (select 1 from public.entreprise_membres where user_id = new.id) then
    return new;
  end if;

  raise exception
    'Changement de rôle refusé (% : % -> %). Un rôle se promeut côté serveur, jamais par le porteur du compte.',
    new.id, old.role, new.role
    using errcode = '42501';
end $$;

-- Retrait d'un employé (suppression de sa fiche ou de son accès) : il quitte
-- l'équipe et redevient un compte ménage ordinaire.
create or replace function public.liberer_compte_employe(p_entreprise uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  delete from public.entreprise_membres
   where entreprise_id = p_entreprise and user_id = p_user and role_membre = 'agent';
  update public.profiles set role = 'citoyen'
   where id = p_user and role::text = 'employe'
     and not exists (select 1 from public.entreprise_membres where user_id = p_user);
end $$;

create or replace function public.employe_avant_suppression() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.liberer_compte_employe(old.entreprise_id, old.user_id);
  return old;
end $$;
drop trigger if exists employes_liberer_compte on public.employes;
create trigger employes_liberer_compte
  before delete on public.employes
  for each row execute function public.employe_avant_suppression();

-- -----------------------------------------------------------------------------
-- 4. Invitations
-- -----------------------------------------------------------------------------
create or replace function public.normaliser_code_invitation(p text) returns text
language sql immutable as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

create or replace function public.creer_invitation_employe(p_employe uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  e public.employes;
  v_code text;
begin
  select * into e from public.employes where id = p_employe;
  if not found or not public.est_gerant(e.entreprise_id) then
    raise exception 'Réservé au gérant de l''entreprise' using errcode = '42501';
  end if;
  if not e.actif then raise exception 'Réactivez d''abord la fiche de cet employé'; end if;
  if e.user_id is not null then raise exception 'Cet employé a déjà son compte'; end if;

  -- Une seule invitation valable à la fois : les précédentes non utilisées tombent.
  delete from public.invitations_employe where employe_id = e.id and utilisee_at is null;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.invitations_employe where code = v_code);
  end loop;
  insert into public.invitations_employe (entreprise_id, employe_id, code)
  values (e.entreprise_id, e.id, v_code);
  return v_code;
end $$;

-- Aperçu avant inscription (page publique « Rejoindre une équipe »).
create or replace function public.apercu_invitation(p_code text)
returns table (entreprise_nom text, employe_nom text, fonction text, valide boolean)
language sql stable security definer set search_path = public as $$
  select en.nom, e.nom, e.fonction,
         (i.utilisee_at is null and i.expire_at > now() and e.actif and e.user_id is null)
  from public.invitations_employe i
  join public.employes e on e.id = i.employe_id
  join public.entreprises en on en.id = i.entreprise_id
  where i.code = public.normaliser_code_invitation(p_code)
$$;

create or replace function public.rejoindre_entreprise(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  i public.invitations_employe;
  e public.employes;
  v_role text := public.role_courant();
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select * into i from public.invitations_employe
   where code = public.normaliser_code_invitation(p_code) for update;
  if not found then raise exception 'Code d''invitation inconnu : vérifiez-le auprès de votre gérant'; end if;
  if i.utilisee_at is not null then raise exception 'Ce code a déjà été utilisé'; end if;
  if i.expire_at <= now() then raise exception 'Ce code a expiré : demandez-en un nouveau à votre gérant'; end if;

  if v_role not in ('citoyen', 'precollecteur', 'employe') then
    raise exception 'Ce compte ne peut pas rejoindre une équipe (rôle %)', v_role;
  end if;
  if exists (select 1 from public.entreprise_membres where user_id = auth.uid()) then
    raise exception 'Ce compte appartient déjà à une entreprise : utilisez un autre compte';
  end if;

  select * into e from public.employes where id = i.employe_id for update;
  if not e.actif then raise exception 'Cette fiche employé est désactivée'; end if;
  if e.user_id is not null then raise exception 'Cette fiche employé est déjà reliée à un compte'; end if;

  update public.employes set user_id = auth.uid() where id = e.id;
  insert into public.entreprise_membres (entreprise_id, user_id, role_membre)
  values (i.entreprise_id, auth.uid(), 'agent');
  update public.profiles set role = 'employe' where id = auth.uid();
  update public.invitations_employe set utilisee_at = now(), utilisee_par = auth.uid() where id = i.id;
  return i.entreprise_id;
end $$;

-- Le gérant retire l'accès (départ) : la fiche reste, l'historique aussi.
create or replace function public.retirer_acces_employe(p_employe uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e public.employes;
begin
  select * into e from public.employes where id = p_employe for update;
  if not found or not public.est_gerant(e.entreprise_id) then
    raise exception 'Réservé au gérant de l''entreprise' using errcode = '42501';
  end if;
  if e.user_id is null then return; end if;
  update public.employes set user_id = null where id = e.id;
  perform public.liberer_compte_employe(e.entreprise_id, e.user_id);
end $$;

-- -----------------------------------------------------------------------------
-- 5. Gestes de terrain (gérant ou équipier ; jamais sur une tournée close)
-- -----------------------------------------------------------------------------
create or replace function public.pointer_passage(p_collecte uuid, p_statut text, p_motif text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tournee uuid;
  v_statut_tournee text;
begin
  if p_statut not in ('realisee', 'non_realisee', 'prevue') then raise exception 'Statut inconnu'; end if;
  select co.tournee_id, t.statut into v_tournee, v_statut_tournee
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

  update public.collectes
     set statut = p_statut,
         motif = case when p_statut = 'non_realisee' then coalesce(nullif(btrim(p_motif), ''), 'Autre') end,
         realisee_at = case when p_statut = 'prevue' then null else now() end,
         employe_id = coalesce(public.mon_employe(), employe_id)
   where id = p_collecte;
end $$;

-- Scan du QR d'un client pendant la tournée : passage tracé tout de suite
-- (créé « hors planning » si le ménage n'était pas prévu).
create or replace function public.scanner_passage(p_tournee uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t public.tournees_precollecte;
  c record;
  v_collecte uuid;
  v_statut text;
begin
  select * into t from public.tournees_precollecte where id = p_tournee;
  if not found or not public.peut_agir_sur_tournee(p_tournee) then
    raise exception 'Tournée introuvable ou hors de vos tournées' using errcode = '42501';
  end if;
  if t.statut not in ('planifiee', 'en_cours') then
    raise exception 'Tournée close : rouvrez-la pour scanner';
  end if;

  select v.id, v.nom, v.code, v.statut_abonnement, v.quartier into c
    from public.v_clients_statut v
   where v.entreprise_id = t.entreprise_id and v.code = upper(btrim(p_code));
  if not found then
    raise exception 'Code % inconnu : ce ménage n''est pas un client de l''entreprise', upper(btrim(p_code));
  end if;

  select id, statut into v_collecte, v_statut
    from public.collectes where tournee_id = p_tournee and client_id = c.id;

  if v_collecte is not null and v_statut = 'realisee' then
    return jsonb_build_object('nom', c.nom, 'code', c.code, 'statut_abonnement', c.statut_abonnement,
                              'quartier', c.quartier, 'hors_planning', false, 'deja_fait', true);
  end if;

  if v_collecte is not null then
    update public.collectes
       set statut = 'realisee', motif = null, realisee_at = now(),
           employe_id = coalesce(public.mon_employe(), employe_id)
     where id = v_collecte;
  else
    insert into public.collectes (entreprise_id, tournee_id, client_id, date_prevue, employe_id, statut, realisee_at)
    values (t.entreprise_id, t.id, c.id, t.date, coalesce(public.mon_employe(), t.employe_id), 'realisee', now());
  end if;

  return jsonb_build_object('nom', c.nom, 'code', c.code, 'statut_abonnement', c.statut_abonnement,
                            'quartier', c.quartier, 'hors_planning', v_collecte is null, 'deja_fait', false);
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
    -- Ce qui n'a pas été visité est tracé comme non réalisé.
    update public.collectes set statut = 'non_realisee', motif = 'Non visité en fin de tournée'
     where tournee_id = p_tournee and statut = 'prevue';
    update public.tournees_precollecte set statut = 'terminee', fin_at = now() where id = p_tournee;
  else
    update public.tournees_precollecte set statut = p_statut where id = p_tournee;
  end if;
end $$;

-- Position en direct (appli ouverte, tournée en cours) ; une toutes les 10 s au plus.
create or replace function public.envoyer_position(
  p_tournee uuid, p_lat double precision, p_lng double precision, p_precision real default null
) returns void
language plpgsql security definer set search_path = public as $$
declare t public.tournees_precollecte;
begin
  select * into t from public.tournees_precollecte where id = p_tournee;
  if not found or not public.peut_agir_sur_tournee(p_tournee) then
    raise exception 'Tournée introuvable ou hors de vos tournées' using errcode = '42501';
  end if;
  if t.statut <> 'en_cours' then return; end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Position invalide'; end if;
  if exists (select 1 from public.positions_tournee
              where tournee_id = p_tournee and user_id = auth.uid()
                and created_at > now() - interval '10 seconds') then
    return;
  end if;
  insert into public.positions_tournee (tournee_id, entreprise_id, employe_id, lat, lng, precision_m)
  values (p_tournee, t.entreprise_id, public.mon_employe(), p_lat, p_lng, p_precision);
end $$;

-- Dernière position de chaque tournée en cours (carte du gérant).
create or replace function public.positions_en_direct()
returns table (tournee_id uuid, lat double precision, lng double precision, vu_at timestamptz,
               tricycle_nom text, zone_nom text, equipe text)
language sql stable security definer set search_path = public as $$
  select distinct on (p.tournee_id)
         p.tournee_id, p.lat, p.lng, p.created_at, tr.nom, z.nom,
         (select string_agg(e.nom, ', ' order by e.nom)
            from public.tournee_equipe te join public.employes e on e.id = te.employe_id
           where te.tournee_id = t.id)
  from public.positions_tournee p
  join public.tournees_precollecte t on t.id = p.tournee_id
  left join public.tricycles tr on tr.id = t.tricycle_id
  left join public.zones z on z.id = t.zone_id
  where t.statut = 'en_cours'
    and (public.est_gerant(t.entreprise_id) or public.est_admin())
    and p.created_at > now() - interval '12 hours'
  order by p.tournee_id, p.created_at desc
$$;

-- -----------------------------------------------------------------------------
-- 6. Espèces encaissées par un employé, validées par le gérant
-- -----------------------------------------------------------------------------
-- Une facture n'est « payée » qu'avec des paiements VALIDÉS.
create or replace function public.maj_statut_facture() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_facture uuid := coalesce(new.facture_id, old.facture_id);
  v_total int;
begin
  select coalesce(sum(montant_fcfa), 0) into v_total
  from public.paiements_clients where facture_id = v_facture and statut = 'valide';

  update public.factures f
     set statut = case when v_total >= f.montant_fcfa then 'payee' else 'emise' end
   where f.id = v_facture and f.statut <> 'annulee';
  return null;
end $$;

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
  case
    when c.statut in ('demande', 'suspendu', 'resilie') then c.statut
    when coalesce(imp.nb_retard, 0) > 0 then 'impaye'
    when cov.couverture_fin is null then 'sans_facture'
    when cov.couverture_fin < current_date then 'expire'
    when cov.couverture_fin <= current_date + 7 then 'echeance_proche'
    else 'a_jour'
  end as statut_abonnement
from public.clients c
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
         count(*) filter (where f.echeance < current_date) as nb_retard
  from public.factures f where f.client_id = c.id and f.statut = 'emise'
) imp on true;

create or replace function public.encaisser_especes(p_client uuid, p_montant int) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c public.clients;
  f public.factures;
  v_reste int;
  v_gerant boolean;
  v_id uuid;
begin
  select * into c from public.clients where id = p_client;
  if not found then raise exception 'Client introuvable'; end if;
  v_gerant := public.est_gerant(c.entreprise_id);
  if not (v_gerant or public.est_agent(c.entreprise_id)) then
    raise exception 'Réservé à l''équipe de l''entreprise' using errcode = '42501';
  end if;

  -- La plus ancienne facture à régler.
  select * into f from public.factures
   where client_id = c.id and statut = 'emise'
   order by echeance, created_at limit 1;
  if not found then raise exception 'Aucune facture à régler pour ce client'; end if;

  -- Reste : on déduit aussi les espèces déjà reçues en attente de validation,
  -- pour ne jamais encaisser deux fois la même somme.
  select f.montant_fcfa - coalesce(sum(montant_fcfa), 0) into v_reste
    from public.paiements_clients where facture_id = f.id and statut in ('valide', 'a_valider');
  if p_montant is null or p_montant <= 0 or p_montant > v_reste then
    raise exception 'Montant invalide : il reste % FCFA à encaisser sur la facture %', v_reste, f.numero;
  end if;

  insert into public.paiements_clients (facture_id, entreprise_id, client_id, montant_fcfa, methode, encaisse_par, statut)
  values (f.id, c.entreprise_id, c.id, p_montant, 'especes', public.mon_employe(),
          case when v_gerant then 'valide' else 'a_valider' end)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.valider_paiement(p_paiement uuid, p_valider boolean) returns void
language plpgsql security definer set search_path = public as $$
declare pc public.paiements_clients;
begin
  select * into pc from public.paiements_clients where id = p_paiement for update;
  if not found or not public.est_gerant(pc.entreprise_id) then
    raise exception 'Réservé au gérant de l''entreprise' using errcode = '42501';
  end if;
  if pc.statut <> 'a_valider' then raise exception 'Ce paiement a déjà été traité'; end if;
  update public.paiements_clients
     set statut = case when p_valider then 'valide' else 'rejete' end,
         valide_par = auth.uid(), valide_at = now()
   where id = pc.id;
  -- Un client suspendu pour impayé qui a réglé redevient actif.
  if p_valider then
    update public.clients set statut = 'actif' where id = pc.client_id and statut = 'suspendu';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 7. Statistiques de l'employé (partagées avec son équipe)
-- -----------------------------------------------------------------------------
create or replace function public.mes_statistiques_employe(p_jours int default 30) returns jsonb
language sql stable security definer set search_path = public as $$
  with moi as (select public.mon_employe() as id),
  mes_tournees as (
    select t.* from public.tournees_precollecte t
    join public.tournee_equipe te on te.tournee_id = t.id
    where te.employe_id = (select id from moi) and t.date >= current_date - p_jours
  )
  select jsonb_build_object(
    'tournees', (select count(*) from mes_tournees where statut in ('en_cours', 'terminee')),
    'passages_faits', (select count(*) from public.collectes co where co.tournee_id in (select id from mes_tournees) and co.statut = 'realisee'),
    'passages_non_faits', (select count(*) from public.collectes co where co.tournee_id in (select id from mes_tournees) and co.statut = 'non_realisee'),
    'incidents', (select count(*) from public.incidents_precollecte i
                   where i.auteur_id = auth.uid() and i.created_at >= now() - make_interval(days => p_jours)),
    'especes_validees', (select coalesce(sum(montant_fcfa), 0) from public.paiements_clients
                          where encaisse_par = (select id from moi) and statut = 'valide'
                            and created_at >= now() - make_interval(days => p_jours)),
    'especes_a_valider', (select coalesce(sum(montant_fcfa), 0) from public.paiements_clients
                           where encaisse_par = (select id from moi) and statut = 'a_valider')
  )
  where (select id from moi) is not null
$$;

-- -----------------------------------------------------------------------------
-- 8. Droits : le gérant garde tout, l'employé lit et agit par les fonctions
-- -----------------------------------------------------------------------------
alter table public.tournee_equipe enable row level security;
alter table public.invitations_employe enable row level security;
alter table public.positions_tournee enable row level security;

drop policy if exists entreprises_maj on public.entreprises;
create policy entreprises_maj on public.entreprises for update to authenticated
  using (public.est_gerant(id) or public.est_admin())
  with check (public.est_gerant(id) or public.est_admin());

do $$
declare t text;
begin
  foreach t in array array['employes', 'tricycles', 'factures', 'paiements_clients', 'relances'] loop
    execute format('drop policy if exists %I on public.%I', t || '_membres', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.est_gerant(entreprise_id) or public.est_admin())
         with check (public.est_gerant(entreprise_id) or public.est_admin())',
      t || '_membres', t);
  end loop;
  -- Lecture pour l'employé : son équipe, la flotte, et de quoi dire au ménage
  -- ce qu'il doit (pas de relances).
  foreach t in array array['employes', 'tricycles', 'factures', 'paiements_clients'] loop
    execute format('drop policy if exists %I on public.%I', t || '_agent', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.est_agent(entreprise_id))',
      t || '_agent', t);
  end loop;
end $$;

drop policy if exists tricycle_employes_membres on public.tricycle_employes;
create policy tricycle_employes_membres on public.tricycle_employes for all to authenticated
  using (exists (select 1 from public.tricycles t where t.id = tricycle_id and (public.est_gerant(t.entreprise_id) or public.est_admin())))
  with check (exists (select 1 from public.tricycles t where t.id = tricycle_id and (public.est_gerant(t.entreprise_id) or public.est_admin())));
drop policy if exists tricycle_employes_agent on public.tricycle_employes;
create policy tricycle_employes_agent on public.tricycle_employes for select to authenticated
  using (exists (select 1 from public.tricycles t where t.id = tricycle_id and public.est_agent(t.entreprise_id)));

drop policy if exists clients_membres on public.clients;
create policy clients_membres on public.clients for all to authenticated
  using (public.est_gerant(entreprise_id) or public.est_admin())
  with check (public.est_gerant(entreprise_id) or public.est_admin());
drop policy if exists clients_agent on public.clients;
create policy clients_agent on public.clients for select to authenticated
  using (public.est_agent(entreprise_id));

drop policy if exists tournees_pc_membres on public.tournees_precollecte;
create policy tournees_pc_membres on public.tournees_precollecte for all to authenticated
  using (public.est_gerant(entreprise_id) or public.est_admin())
  with check (public.est_gerant(entreprise_id) or public.est_admin());
drop policy if exists tournees_pc_agent on public.tournees_precollecte;
create policy tournees_pc_agent on public.tournees_precollecte for select to authenticated
  using (public.est_agent(entreprise_id) and public.est_equipier(id));

drop policy if exists collectes_membres on public.collectes;
create policy collectes_membres on public.collectes for all to authenticated
  using (public.est_gerant(entreprise_id) or public.est_admin())
  with check (public.est_gerant(entreprise_id) or public.est_admin());
drop policy if exists collectes_agent on public.collectes;
create policy collectes_agent on public.collectes for select to authenticated
  using (public.est_agent(entreprise_id) and public.est_equipier(tournee_id));

drop policy if exists incidents_pc_lecture on public.incidents_precollecte;
create policy incidents_pc_lecture on public.incidents_precollecte for select to authenticated
  using (
    auteur_id = auth.uid()
    or public.est_gerant(entreprise_id)
    or public.est_superviseur()
    or (public.est_agent(entreprise_id) and tournee_id is not null and public.est_equipier(tournee_id))
  );
drop policy if exists incidents_pc_maj on public.incidents_precollecte;
create policy incidents_pc_maj on public.incidents_precollecte for update to authenticated
  using (public.est_gerant(entreprise_id) or public.est_superviseur())
  with check (public.est_gerant(entreprise_id) or public.est_superviseur());

drop policy if exists tournee_equipe_gerant on public.tournee_equipe;
create policy tournee_equipe_gerant on public.tournee_equipe for all to authenticated
  using (public.est_gerant(entreprise_id) or public.est_admin())
  with check (
    (public.est_gerant(entreprise_id) or public.est_admin())
    and exists (select 1 from public.tournees_precollecte t where t.id = tournee_id and t.entreprise_id = tournee_equipe.entreprise_id)
    and exists (select 1 from public.employes e where e.id = employe_id and e.entreprise_id = tournee_equipe.entreprise_id)
  );
drop policy if exists tournee_equipe_agent on public.tournee_equipe;
create policy tournee_equipe_agent on public.tournee_equipe for select to authenticated
  using (public.est_agent(entreprise_id) and public.est_equipier(tournee_id));

drop policy if exists invitations_gerant on public.invitations_employe;
create policy invitations_gerant on public.invitations_employe for select to authenticated
  using (public.est_gerant(entreprise_id) or public.est_admin());

drop policy if exists positions_lecture on public.positions_tournee;
create policy positions_lecture on public.positions_tournee for select to authenticated
  using (public.est_gerant(entreprise_id) or public.est_admin()
         or (public.est_agent(entreprise_id) and public.est_equipier(tournee_id)));

-- Liste d'attente (20261004000006) : réservée aux gérants, pas aux employés.
create or replace function public.demandes_ouvertes()
returns table (id uuid, quartier text, adresse text, lat double precision, lng double precision,
               zone_nom text, plan_nom text, plan_prix integer, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id, d.quartier, d.adresse, d.lat, d.lng, z.nom, p.nom, p.prix_fcfa, d.created_at
  from public.demandes_abonnement d
  left join public.zones z on z.id = d.zone_id
  left join public.plans_tarifaires p on p.id = d.plan_id
  where d.statut = 'en_attente'
    and (public.est_gerant(public.mon_entreprise()) or public.est_superviseur())
    -- ménage abonné entre-temps par un autre chemin (code client) : plus à proposer
    and not exists (select 1 from public.clients c where c.user_id = d.user_id and c.statut <> 'resilie')
  order by d.created_at
$$;

create or replace function public.prendre_demande(p_demande uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ent uuid := public.mon_entreprise();
  d public.demandes_abonnement;
  v_client uuid;
begin
  if v_ent is null or not public.est_gerant(v_ent) then
    raise exception 'Réservé aux précollecteurs' using errcode = '42501';
  end if;
  select * into d from public.demandes_abonnement where id = p_demande for update;
  if not found or d.statut <> 'en_attente' then raise exception 'Cette demande a déjà été prise en charge'; end if;
  if exists (select 1 from public.clients where user_id = d.user_id and statut <> 'resilie') then
    raise exception 'Ce ménage est déjà abonné ailleurs';
  end if;

  insert into public.clients (entreprise_id, user_id, nom, telephone, adresse, quartier, lat, lng, zone_id, plan_id, statut)
  values (v_ent, d.user_id, d.nom, d.telephone, d.adresse, d.quartier, d.lat, d.lng, d.zone_id, d.plan_id, 'actif')
  returning id into v_client;

  update public.demandes_abonnement
     set statut = 'prise', entreprise_id = v_ent, client_id = v_client, prise_at = now()
   where id = d.id;
  return v_client;
end $$;

-- -----------------------------------------------------------------------------
-- 9. Droits d'exécution
-- -----------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.est_gerant(uuid)', 'public.est_agent(uuid)', 'public.mon_employe()', 'public.est_equipier(uuid)',
    'public.peut_agir_sur_tournee(uuid)', 'public.liberer_compte_employe(uuid, uuid)',
    'public.creer_invitation_employe(uuid)', 'public.rejoindre_entreprise(text)', 'public.retirer_acces_employe(uuid)',
    'public.pointer_passage(uuid, text, text)', 'public.scanner_passage(uuid, text)',
    'public.changer_statut_tournee(uuid, text)', 'public.envoyer_position(uuid, double precision, double precision, real)',
    'public.positions_en_direct()', 'public.encaisser_especes(uuid, integer)', 'public.valider_paiement(uuid, boolean)',
    'public.mes_statistiques_employe(integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
-- Interne : jamais appelée directement.
revoke all on function public.liberer_compte_employe(uuid, uuid) from authenticated;
-- La page « Rejoindre une équipe » montre l'invitation avant toute inscription.
revoke all on function public.apercu_invitation(text) from public;
grant execute on function public.apercu_invitation(text) to anon, authenticated;

-- Contrôle
select (select count(*) from public.tournee_equipe) as equipes_reprises,
       (select relrowsecurity from pg_class where relname = 'tournee_equipe') as rls_equipe,
       (select relrowsecurity from pg_class where relname = 'invitations_employe') as rls_invitations,
       (select relrowsecurity from pg_class where relname = 'positions_tournee') as rls_positions;
