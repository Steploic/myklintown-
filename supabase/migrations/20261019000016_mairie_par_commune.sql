-- =============================================================================
-- MyKlinTown — Chaque compte Mairie supervise SA commune (chantier 4c)
-- =============================================================================
-- ⚠️ RISQUE PRINCIPAL — À LIRE AVANT DE JOUER CE SCRIPT
-- Un compte Mairie qui n'est rattaché à AUCUNE commune ne voit plus rien
-- (zones non modifiables, supervision vide, ni codes d'agrément ni
-- indicateurs). Le contrôle final LISTE ces comptes : affectez-leur leur
-- commune LE JOUR MÊME (requête plus bas, ou écran « Demandes d'accès » de
-- l'administrateur). Les zones et les précollecteurs sans commune, également
-- listés, ne sont plus visibles que de l'administrateur.
--
-- Jusqu'ici, tout compte Mairie voyait et modifiait les zones, affectations,
-- codes d'agrément et données de supervision des 13 communes (Yaoundé et
-- Douala) : `est_superviseur()` ne regardait que le rôle, et la commune d'un
-- compte Mairie n'était connue que par sa demande d'accès.
--
-- Désormais :
--   1. `mairie_communes` : la ou les communes de chaque compte Mairie. Reprise
--      des demandes d'accès ACCEPTÉES ; ensuite, `traiter_demande_acces` la
--      remplit à l'acceptation, et l'administrateur ajoute ou retire une
--      commune (`accorder_commune_mairie`, `retirer_commune_mairie`). Aucun
--      compte n'y écrit directement.
--   2. Prédicats `supervise_commune`, `supervise_zone`, `supervise_entreprise` :
--      l'administrateur garde tout ; un compte Mairie supervise ses communes,
--      leurs zones, et les précollecteurs qui y sont rattachés (siège dans la
--      commune, ou au moins une zone de la commune). `est_superviseur()` reste
--      le contrôle d'entrée par le rôle.
--   3. Politiques et fonctions de la Mairie cloisonnées : zones et
--      affectations (écriture), entreprises, membres, tournées, passages,
--      incidents, preuves, codes d'agrément, relevés d'indicateurs ;
--      supervision par zone, par précollecteur, activité, demandes sans
--      précollecteur, liste d'attente. Les CONTOURS de toutes les zones restent
--      lisibles (contrôle des chevauchements entre communes voisines).
--   4. Indicateurs du pilote : un compte Mairie suit ceux de SA commune
--      (périmètre = code de la commune, ex. « YDE3 »), relevés et historisés
--      comme ceux de Yaoundé et Douala. Un précollecteur compte dans UNE seule
--      commune, celle qui donne déjà sa ville : la commune de ses zones (la
--      première par code), à défaut celle de son siège. « Tout le pilote »,
--      « Yaoundé » et « Douala » restent réservés à l'administrateur.
--   5. Codes d'agrément : délivrés pour une commune de la Mairie (celle-ci par
--      défaut si elle n'en a qu'une) ; l'espace créé avec un code est rattaché à
--      la commune du code. La commune d'un précollecteur ne se change plus
--      depuis l'application (administrateur seulement).
--   6. Demandes d'abonnement HORS de toute zone : aucune commune connue, elles
--      ne sont plus visibles que de l'administrateur (les communes n'ont pas de
--      contour).
--
-- Additive et rejouable : une transaction, rien n'est supprimé. La reprise
-- des demandes acceptées ne joue que sur une table vide : un rejeu ne rend pas
-- une commune que l'administrateur a retirée.
--
-- Ordre de mise en production :
--   1. sauvegarde de la base ;
--   2. jouer ce script dans le SQL Editor (compte postgres) ;
--   3. lire le contrôle final : chaque ligne « OK », sinon affecter les
--      communes manquantes (ci-dessous) et relancer le seul contrôle ;
--   4. fusionner et déployer l'application, sans attendre. L'application
--      d'avant fonctionne avec ce script (une Mairie n'y voit déjà que sa
--      commune), avec deux gênes : sa page Indicateurs répond « Périmètre
--      réservé » (elle demande « tout le pilote »), et le formulaire de zone
--      propose d'abord une autre commune (l'enregistrement est alors refusé).
--      La nouvelle application fonctionne aussi sans ce script (comme avant).
--
-- Avant, en lecture seule — comptes Mairie et commune de leur demande :
--   select p.email, c.code, d.statut
--     from public.profiles p
--     left join public.demandes_acces d on d.user_id = p.id and d.statut = 'acceptee'
--     left join public.communes c on c.id = d.commune_id
--    where p.role = 'mairie' order by 1;
--
-- Affecter une commune à un compte Mairie (SQL Editor ; codes YDE1…YDE7, DLA1…DLA6) :
--   insert into public.mairie_communes (user_id, commune_id)
--   select p.id, c.id from public.profiles p, public.communes c
--    where p.email = 'adresse@exemple.cm' and c.code = 'YDE3'
--   on conflict do nothing;
-- Rattacher un précollecteur (ou une zone) à sa commune :
--   update public.entreprises set commune_id = (select id from public.communes where code = 'YDE3')
--    where nom = '…';
--
-- Retour arrière d'urgence (toutes les Mairies revoient tout, comme avant ;
-- vérifié sur le banc supabase/tests-securite) :
--   create or replace function public.supervise_commune(p_commune uuid) returns boolean
--     language sql stable security definer set search_path = public as 'select public.est_superviseur()';
--   create or replace function public.supervise_zone(p_zone uuid) returns boolean
--     language sql stable security definer set search_path = public as 'select public.est_superviseur()';
--   create or replace function public.supervise_entreprise(p_entreprise uuid) returns boolean
--     language sql stable security definer set search_path = public as 'select public.est_superviseur()';
-- (rejouer ensuite ce script rétablit le cloisonnement ; la table reste).
-- =============================================================================

begin;

-- =============================================================================
-- 1. Communes de chaque compte Mairie
-- =============================================================================
create table if not exists public.mairie_communes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  commune_id uuid not null references public.communes(id) on delete cascade,
  accorde_at timestamptz not null default now(),
  accorde_par uuid references public.profiles(id) on delete set null,
  primary key (user_id, commune_id)
);
create index if not exists mairie_communes_commune_idx on public.mairie_communes (commune_id);

comment on table public.mairie_communes is
  'Communes supervisées par chaque compte Mairie. Écrite par traiter_demande_acces (acceptation) et par l''administrateur (accorder_commune_mairie / retirer_commune_mairie), jamais directement par un compte.';

-- Lecture : le compte lui-même et l'administrateur. Écriture : par les fonctions.
alter table public.mairie_communes enable row level security;
drop policy if exists mairie_communes_lecture on public.mairie_communes;
create policy mairie_communes_lecture on public.mairie_communes for select to authenticated
  using (user_id = auth.uid() or public.est_admin());
revoke all on public.mairie_communes from anon;
revoke insert, update, delete, truncate on public.mairie_communes from authenticated;

-- Reprise des demandes d'accès ACCEPTÉES, seulement si la table est vide
-- (première exécution) : un rejeu ne rend pas une commune retirée depuis.
insert into public.mairie_communes (user_id, commune_id, accorde_at, accorde_par)
select distinct on (d.user_id, d.commune_id)
       d.user_id, d.commune_id, coalesce(d.traitee_at, d.created_at), d.traitee_par
  from public.demandes_acces d
 where d.statut = 'acceptee' and d.commune_id is not null
   and not exists (select 1 from public.mairie_communes)
 order by d.user_id, d.commune_id, d.traitee_at desc nulls last
on conflict (user_id, commune_id) do nothing;

-- Codes d'agrément délivrés sans commune par une Mairie qui n'en a qu'une :
-- ils restent visibles d'elle (ils portent désormais sa commune).
update public.codes_agrement ca
   set commune_id = x.commune_id
  from (select mc.user_id, (array_agg(mc.commune_id))[1] as commune_id
          from public.mairie_communes mc
         group by mc.user_id
        having count(*) = 1) x
 where ca.commune_id is null and ca.cree_par = x.user_id;

-- Précollecteur sans commune créé avec un code qui en porte une : celle du code.
update public.entreprises e
   set commune_id = ca.commune_id
  from public.codes_agrement ca
 where ca.entreprise_id = e.id and e.commune_id is null and ca.commune_id is not null;

-- =============================================================================
-- 2. Prédicats de supervision
-- =============================================================================
-- L'administrateur supervise tout ; un compte Mairie, ses communes. Un ancien
-- compte Mairie (rôle changé) ne supervise plus rien, même s'il garde ses lignes.

create or replace function public.supervise_commune(p_commune uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_admin()
      or (p_commune is not null
          and coalesce(public.role_courant() = 'mairie', false)
          and exists (select 1 from public.mairie_communes mc
                       where mc.user_id = auth.uid() and mc.commune_id = p_commune))
$$;

create or replace function public.supervise_zone(p_zone uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_admin()
      or exists (select 1 from public.zones z
                  where z.id = p_zone and public.supervise_commune(z.commune_id))
$$;

-- Précollecteur rattaché à une commune de la Mairie : son siège y est, ou il
-- y dessert au moins une zone.
create or replace function public.supervise_entreprise(p_entreprise uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_admin()
      or (coalesce(public.role_courant() = 'mairie', false)
          and exists (
            select 1 from public.mairie_communes mc
             where mc.user_id = auth.uid()
               and (exists (select 1 from public.entreprises e
                             where e.id = p_entreprise and e.commune_id = mc.commune_id)
                    or exists (select 1 from public.zone_affectations a
                                 join public.zones z on z.id = a.zone_id
                                where a.entreprise_id = p_entreprise and z.commune_id = mc.commune_id))))
$$;

-- =============================================================================
-- 3. Accès Mairie : la commune est gardée à l'acceptation ; administration
-- =============================================================================
-- Reprise de 20261004000006 : l'acceptation rattache aussi le compte à la
-- commune de sa demande.
create or replace function public.traiter_demande_acces(p_demande uuid, p_accepter boolean) returns void
language plpgsql security definer set search_path = public as $$
declare d public.demandes_acces;
begin
  if not public.est_admin() then raise exception 'Réservé aux administrateurs MyKlinTown' using errcode = '42501'; end if;
  select * into d from public.demandes_acces where id = p_demande for update;
  if not found or d.statut <> 'en_attente' then raise exception 'Demande introuvable ou déjà traitée'; end if;
  update public.demandes_acces
     set statut = case when p_accepter then 'acceptee' else 'refusee' end,
         traitee_at = now(), traitee_par = auth.uid()
   where id = d.id;
  if p_accepter then
    update public.profiles set role = 'mairie' where id = d.user_id;
    if d.commune_id is not null then
      insert into public.mairie_communes (user_id, commune_id, accorde_par)
      values (d.user_id, d.commune_id, auth.uid())
      on conflict (user_id, commune_id) do nothing;
    end if;
  end if;
end $$;

create or replace function public.accorder_commune_mairie(p_user uuid, p_commune uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_admin() then raise exception 'Réservé aux administrateurs MyKlinTown' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = p_user and role = 'mairie') then
    raise exception 'Ce compte n''est pas un compte Mairie';
  end if;
  if not exists (select 1 from public.communes where id = p_commune) then
    raise exception 'Commune inconnue';
  end if;
  insert into public.mairie_communes (user_id, commune_id, accorde_par)
  values (p_user, p_commune, auth.uid())
  on conflict (user_id, commune_id) do nothing;
end $$;

create or replace function public.retirer_commune_mairie(p_user uuid, p_commune uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_admin() then raise exception 'Réservé aux administrateurs MyKlinTown' using errcode = '42501'; end if;
  delete from public.mairie_communes where user_id = p_user and commune_id = p_commune;
  if not found then raise exception 'Cette commune n''était pas rattachée à ce compte'; end if;
end $$;

-- Écran de l'administrateur : comptes Mairie (ceux sans commune d'abord).
-- E-mail du COMPTE (auth), comme pour les demandes d'accès (20261011000009 §4).
create or replace function public.comptes_mairie()
returns table (user_id uuid, nom text, email text, communes jsonb)
language sql stable security definer set search_path = public as $$
  select p.id, p.nom_complet, coalesce(u.email::text, p.email),
         coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nom', c.nom, 'code', c.code) order by c.nom)
                     from public.mairie_communes mc
                     join public.communes c on c.id = mc.commune_id
                    where mc.user_id = p.id), '[]'::jsonb)
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.role = 'mairie' and public.est_admin()
  order by exists (select 1 from public.mairie_communes mc where mc.user_id = p.id), p.nom_complet
$$;

-- =============================================================================
-- 4. Politiques : chaque Mairie sur ses communes
-- =============================================================================
-- Zones : tout compte lit les contours (chevauchements, orientation des
-- ménages) ; une Mairie ne trace, modifie ou supprime que dans ses communes.
drop policy if exists zones_ecriture on public.zones;
create policy zones_ecriture on public.zones for all to authenticated
  using (public.supervise_commune(commune_id))
  with check (public.supervise_commune(commune_id));

-- Affectations : sur les zones de ses communes, à un précollecteur qu'elle supervise.
drop policy if exists affectations_ecriture on public.zone_affectations;
create policy affectations_ecriture on public.zone_affectations for all to authenticated
  using (public.supervise_zone(zone_id))
  with check (public.supervise_zone(zone_id) and public.supervise_entreprise(entreprise_id));

drop policy if exists entreprises_lecture on public.entreprises;
create policy entreprises_lecture on public.entreprises for select to authenticated
  using (public.est_membre(id) or public.est_client_de(id) or public.supervise_entreprise(id));

drop policy if exists membres_lecture on public.entreprise_membres;
create policy membres_lecture on public.entreprise_membres for select to authenticated
  using (user_id = auth.uid() or public.est_membre(entreprise_id) or public.supervise_entreprise(entreprise_id));

drop policy if exists tournees_pc_superviseur on public.tournees_precollecte;
create policy tournees_pc_superviseur on public.tournees_precollecte for select to authenticated
  using (public.supervise_entreprise(entreprise_id));

drop policy if exists collectes_superviseur on public.collectes;
create policy collectes_superviseur on public.collectes for select to authenticated
  using (public.supervise_entreprise(entreprise_id));

-- Incidents (reprise de 20261005000007 §8).
drop policy if exists incidents_pc_lecture on public.incidents_precollecte;
create policy incidents_pc_lecture on public.incidents_precollecte for select to authenticated
  using (
    auteur_id = auth.uid()
    or public.est_gerant(entreprise_id)
    or public.supervise_entreprise(entreprise_id)
    or (public.est_agent(entreprise_id) and tournee_id is not null and public.est_equipier(tournee_id))
  );
drop policy if exists incidents_pc_maj on public.incidents_precollecte;
create policy incidents_pc_maj on public.incidents_precollecte for update to authenticated
  using (public.est_gerant(entreprise_id) or public.supervise_entreprise(entreprise_id))
  with check (public.est_gerant(entreprise_id) or public.supervise_entreprise(entreprise_id));

-- Preuves photo / vidéo (chemin {entreprise_id}/{auteur}/{fichier}).
drop policy if exists preuves_lecture on storage.objects;
create policy preuves_lecture on storage.objects for select to authenticated
  using (
    bucket_id = 'preuves'
    and (split_part(name, '/', 2) = auth.uid()::text
         or public.est_membre(public.dossier_entreprise(name))
         or public.supervise_entreprise(public.dossier_entreprise(name)))
  );

-- Codes d'agrément : ceux de ses communes (sans commune : l'administrateur).
drop policy if exists codes_agrement_lecture on public.codes_agrement;
create policy codes_agrement_lecture on public.codes_agrement for select to authenticated
  using (public.supervise_commune(commune_id));

-- Relevés d'indicateurs : ceux de ses communes (pilote, Yaoundé, Douala : l'administrateur).
drop policy if exists kpi_releves_lecture on public.kpi_releves;
create policy kpi_releves_lecture on public.kpi_releves for select to authenticated
  using (public.supervise_commune((select c.id from public.communes c where c.code = perimetre)));

-- =============================================================================
-- 5. Supervision : agrégats des seules communes de la Mairie
-- =============================================================================
-- Reprises de 20261019000013 §6 (passages refusés exclus) : mêmes signatures,
-- seul le filtre change.
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
  where public.supervise_commune(z.commune_id)
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
  where public.supervise_entreprise(e.id)
  order by e.nom
$$;

-- Les précollecteurs supervisés sont cherchés une fois (pas un appel par passage).
create or replace function public.supervision_activite(p_semaines int default 12)
returns table (semaine date, prevues bigint, realisees bigint, non_realisees bigint)
language sql stable security definer set search_path = public as $$
  select date_trunc('week', co.date_prevue)::date,
         count(*) filter (where not co.refus_abonnement),
         count(*) filter (where co.statut = 'realisee'),
         count(*) filter (where co.statut = 'non_realisee' and not co.refus_abonnement)
  from public.collectes co join public.clients c on c.id = co.client_id
  where public.est_superviseur() and not c.est_demo
    and co.entreprise_id in (select e.id from public.entreprises e where public.supervise_entreprise(e.id))
    and co.date_prevue >= current_date - (p_semaines * 7)
  group by 1 order by 1
$$;

-- Demandes sans précollecteur (reprise de 20261004000006) : celles des zones
-- de ses communes ; hors de toute zone, l'administrateur seul.
create or replace function public.supervision_demandes()
returns table (quartier text, zone_nom text, nombre bigint, plus_ancienne timestamptz)
language sql stable security definer set search_path = public as $$
  select coalesce(d.quartier, '—'), z.nom, count(*), min(d.created_at)
  from public.demandes_abonnement d
  left join public.zones z on z.id = d.zone_id
  where d.statut = 'en_attente' and public.supervise_zone(d.zone_id)
  group by 1, 2
  order by 3 desc
$$;

-- Liste d'attente (reprise de 20261011000009 §5) : le gérant voit tout (position
-- approchée), la Mairie les demandes des zones de ses communes.
create or replace function public.demandes_ouvertes()
returns table (id uuid, quartier text, adresse text, lat double precision, lng double precision,
               zone_nom text, plan_nom text, plan_prix integer, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id, d.quartier,
         null::text,                         -- adresse exacte : après la prise en charge
         round(d.lat::numeric, 3)::double precision,   -- ≈ 100 m
         round(d.lng::numeric, 3)::double precision,
         z.nom, p.nom, p.prix_fcfa, d.created_at
  from public.demandes_abonnement d
  left join public.zones z on z.id = d.zone_id
  left join public.plans_tarifaires p on p.id = d.plan_id
  where d.statut = 'en_attente'
    and (public.est_gerant(public.mon_entreprise()) or public.supervise_zone(d.zone_id))
    and not exists (select 1 from public.clients c where c.user_id = d.user_id and c.statut <> 'resilie')
  order by d.created_at
$$;

-- =============================================================================
-- 6. Codes d'agrément et commune des précollecteurs
-- =============================================================================
-- Reprises de 20261013000012. Un code est délivré pour une commune de la
-- Mairie (la sienne par défaut si elle n'en a qu'une). Sans commune : un
-- administrateur seulement.
create or replace function public.creer_code_agrement(
  p_destinataire text, p_telephone text default null, p_commune uuid default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_commune uuid := p_commune;
  v_n int;
begin
  if not public.est_superviseur() then
    raise exception 'Réservé à la Mairie' using errcode = '42501';
  end if;
  if char_length(coalesce(trim(p_destinataire), '')) < 2 then
    raise exception 'Indiquez à qui ce code est destiné';
  end if;
  if v_commune is null and not public.supervise_commune(null) then
    select count(*), (array_agg(mc.commune_id))[1] into v_n, v_commune
      from public.mairie_communes mc where mc.user_id = auth.uid();
    if v_n = 0 then
      raise exception 'Votre compte Mairie n''est rattaché à aucune commune : demandez à l''équipe MyKlinTown de l''y rattacher.'
        using errcode = '42501';
    elsif v_n > 1 then
      raise exception 'Choisissez la commune pour laquelle ce code est délivré';
    end if;
  end if;
  if not public.supervise_commune(v_commune) then
    raise exception 'Un compte Mairie ne délivre de codes que pour sa commune' using errcode = '42501';
  end if;
  loop
    v_code := public.nouveau_code_invitation();
    exit when not exists (select 1 from public.codes_agrement where code = v_code);
  end loop;
  insert into public.codes_agrement (code, destinataire, telephone, commune_id)
  values (v_code, left(trim(p_destinataire), 120), nullif(left(trim(coalesce(p_telephone, '')), 30), ''), v_commune);
  return v_code;
end $$;

-- Un code d'une autre commune est « introuvable » (même message : rien n'est révélé).
create or replace function public.revoquer_code_agrement(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_superviseur() then
    raise exception 'Réservé à la Mairie' using errcode = '42501';
  end if;
  update public.codes_agrement set revoque_at = now()
   where id = p_id and utilise_at is null and revoque_at is null
     and public.supervise_commune(commune_id);
  if not found then raise exception 'Code introuvable, déjà utilisé ou déjà révoqué'; end if;
end $$;

-- L'espace créé avec un code est rattaché à la commune du CODE (celle de la
-- Mairie qui l'a délivré), avant celle choisie dans le formulaire.
create or replace function public.creer_mon_entreprise(
  p_nom text, p_telephone text default null, p_siege text default null, p_commune uuid default null, p_code text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_agrement public.codes_agrement;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if public.role_courant() not in ('precollecteur', 'admin') then
    raise exception 'Réservé aux comptes précollecteur' using errcode = '42501';
  end if;
  if exists (select 1 from public.entreprise_membres where user_id = auth.uid()) then
    raise exception 'Ce compte gère déjà une entreprise';
  end if;
  if coalesce(trim(p_nom), '') = '' then raise exception 'Le nom de l''entreprise est obligatoire'; end if;

  if not public.est_admin() or coalesce(trim(p_code), '') <> '' then
    select * into v_agrement from public.codes_agrement
     where code = public.normaliser_code_invitation(p_code)
     for update;
    if not found or v_agrement.revoque_at is not null or v_agrement.utilise_at is not null or v_agrement.expire_at < now() then
      raise exception 'Code d''agrément invalide ou expiré. Il est délivré par la Mairie de votre commune.' using errcode = '22023';
    end if;
  end if;

  insert into public.entreprises (nom, telephone, email, siege, commune_id, proprietaire_id)
  values (trim(p_nom), p_telephone, (select email from public.profiles where id = auth.uid()), p_siege,
          coalesce(v_agrement.commune_id, p_commune), auth.uid())
  returning id into v_id;

  insert into public.entreprise_membres (entreprise_id, user_id, role_membre)
  values (v_id, auth.uid(), 'gerant');

  if v_agrement.id is not null then
    update public.codes_agrement set utilise_at = now(), utilise_par = auth.uid(), entreprise_id = v_id
     where id = v_agrement.id;
  end if;
  return v_id;
end $$;

-- La commune d'un précollecteur décide de la Mairie qui le supervise : elle
-- rejoint les colonnes « système » (20261011000009 §3, 20261019000014 §3).
drop trigger if exists entreprises_colonnes_systeme on public.entreprises;
create trigger entreprises_colonnes_systeme before update on public.entreprises
  for each row execute function public.garde_colonnes_systeme('statut', 'proprietaire_id', 'prefixe_facture', 'commune_id');

-- =============================================================================
-- 7. Indicateurs du pilote par commune
-- =============================================================================
-- Périmètre : 'pilote', 'yaounde', 'douala' (administrateur) ou le code d'une
-- commune (« YDE3 », « DLA1 »…).
do $$
declare r record;
begin
  for r in select conname from pg_constraint
            where conrelid = 'public.kpi_releves'::regclass and contype = 'c'
              and conname <> 'kpi_releves_perimetre_valide'
              and pg_get_constraintdef(oid) like '%perimetre%'
  loop
    execute format('alter table public.kpi_releves drop constraint %I', r.conname);
  end loop;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.kpi_releves'::regclass and conname = 'kpi_releves_perimetre_valide') then
    alter table public.kpi_releves add constraint kpi_releves_perimetre_valide
      check (perimetre in ('pilote', 'yaounde', 'douala') or perimetre ~ '^[A-Z0-9]{2,12}$');
  end if;
end $$;

-- Commune d'un précollecteur pour les indicateurs : la même règle que sa ville
-- (kpi_ville_entreprise, 20261013000011) — celle de ses zones, la première par
-- code, à défaut celle de son siège. Chaque précollecteur compte dans une seule
-- commune : les communes d'une ville s'additionnent.
create or replace function public.kpi_commune_entreprise(p_entreprise uuid) returns text
language sql stable set search_path = public as $$
  select x.code
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

-- kpi_calculer : copie intégrale de 20261019000013 §6 ; seule la sélection des
-- précollecteurs du périmètre change (une commune en plus des deux villes).
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
   where p_perimetre = 'pilote'
      or public.kpi_ville_entreprise(e.id) = p_perimetre
      or public.kpi_commune_entreprise(e.id) = p_perimetre;

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

-- Reprise de 20261013000011 §5 : les communes s'ajoutent aux trois périmètres.
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
  v_perimetres text[];
begin
  select valeur into v_pilote from public.parametres_plateforme where cle = 'pilote_periode';
  v_debut := (v_pilote ->> 'debut')::date;
  v_fin := (v_pilote ->> 'fin')::date;
  if v_debut is null or v_fin is null then return 0; end if;

  v_perimetres := array['pilote', 'yaounde', 'douala']
    || coalesce((select array_agg(c.code order by c.code) from public.communes c where c.code ~ '^[A-Z0-9]{2,12}$'), '{}');

  foreach v_type in array array['semaine', 'mois'] loop
    v_s := case when v_type = 'semaine' then date_trunc('week', v_debut::timestamp)::date
                else date_trunc('month', v_debut::timestamp)::date end;
    while v_s <= v_fin loop
      v_d := greatest(v_s, v_debut);
      v_f := least(case when v_type = 'semaine' then v_s + 6
                        else (v_s + interval '1 month' - interval '1 day')::date end, v_fin);
      exit when v_f >= v_jour;  -- période pas encore terminée
      foreach v_p in array v_perimetres loop
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

-- Reprise de 20261013000011 §6 : un compte Mairie lit les indicateurs de ses
-- communes ; le pilote et les deux villes, l'administrateur.
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
  if p_perimetre is null
     or not (p_perimetre in ('pilote', 'yaounde', 'douala')
             or exists (select 1 from public.communes c where c.code = p_perimetre and c.code ~ '^[A-Z0-9]{2,12}$')) then
    raise exception 'Périmètre inconnu : %', p_perimetre;
  end if;
  if not public.supervise_commune((select c.id from public.communes c where c.code = p_perimetre)) then
    if not exists (select 1 from public.mairie_communes mc where mc.user_id = auth.uid()) then
      raise exception 'Votre compte Mairie n''est rattaché à aucune commune : demandez à l''équipe MyKlinTown de l''y rattacher.'
        using errcode = '42501';
    end if;
    raise exception 'Périmètre réservé : un compte Mairie suit les indicateurs de sa commune' using errcode = '42501';
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

-- =============================================================================
-- 8. Carte vide d'un compte Mairie : sa commune, puis les zones de ses communes
-- =============================================================================
-- Reprise de 20261019000015 §4 ; seul le cas de la Mairie change (sa commune
-- vient de mairie_communes ; à défaut, les zones de SES communes, plus celles
-- de tout le territoire).
create or replace function public.centre_carte()
returns table (lat double precision, lng double precision, zoom integer,
               lat_min double precision, lng_min double precision,
               lat_max double precision, lng_max double precision,
               origine text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text := public.role_courant();
  v_ent uuid;
  v_commune uuid;
  b record;
begin
  if v_uid is null then
    return;
  end if;

  if v_role in ('precollecteur', 'employe') then
    select m.entreprise_id into v_ent
      from public.entreprise_membres m
     where m.user_id = v_uid
     order by (m.role_membre = 'gerant') desc, m.created_at
     limit 1;

    if v_ent is not null then
      select min((pt ->> 1)::float8) as s, min((pt ->> 0)::float8) as o,
             max((pt ->> 1)::float8) as n, max((pt ->> 0)::float8) as e
        into b
        from public.zone_affectations a
        join public.zones z on z.id = a.zone_id
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(z.contour #> '{coordinates,0}') = 'array' then z.contour #> '{coordinates,0}' end) pt
       where a.entreprise_id = v_ent
         and jsonb_typeof(pt -> 0) = 'number' and jsonb_typeof(pt -> 1) = 'number';
      if b.s is not null then
        return query select (b.s + b.n) / 2, (b.o + b.e) / 2, null::integer, b.s, b.o, b.n, b.e, 'zones'::text;
        return;
      end if;

      select e.commune_id into v_commune from public.entreprises e where e.id = v_ent;
      return query
        select c.centre_lat, c.centre_lng, coalesce(c.zoom, 13)::integer,
               null::float8, null::float8, null::float8, null::float8, 'commune'::text
          from public.communes c
         where c.id = v_commune and c.centre_lat is not null and c.centre_lng is not null;
      if found then
        return;
      end if;

      select min(cl.lat) as s, min(cl.lng) as o, max(cl.lat) as n, max(cl.lng) as e
        into b
        from public.clients cl
       where cl.entreprise_id = v_ent and cl.statut <> 'resilie'
         and cl.lat is not null and cl.lng is not null;
      if b.s is not null then
        return query select (b.s + b.n) / 2, (b.o + b.e) / 2, null::integer, b.s, b.o, b.n, b.e, 'clients'::text;
        return;
      end if;
    end if;

  elsif v_role = 'citoyen' then
    return query
      select round(cl.lat::numeric, 3)::float8, round(cl.lng::numeric, 3)::float8, 16,
             null::float8, null::float8, null::float8, null::float8, 'domicile'::text
        from public.clients cl
       where cl.user_id = v_uid and cl.statut <> 'resilie'
         and cl.lat is not null and cl.lng is not null
       order by cl.created_at desc
       limit 1;
    if found then
      return;
    end if;

    return query
      select round(d.lat::numeric, 3)::float8, round(d.lng::numeric, 3)::float8, 16,
             null::float8, null::float8, null::float8, null::float8, 'demande'::text
        from public.demandes_abonnement d
       where d.user_id = v_uid and d.statut = 'en_attente'
       order by d.created_at desc
       limit 1;
    if found then
      return;
    end if;

  elsif v_role = 'mairie' then
    return query
      select c.centre_lat, c.centre_lng, coalesce(c.zoom, 13)::integer,
             null::float8, null::float8, null::float8, null::float8, 'commune'::text
        from public.mairie_communes mc
        join public.communes c on c.id = mc.commune_id
       where mc.user_id = v_uid and c.centre_lat is not null and c.centre_lng is not null
       order by mc.accorde_at, c.nom
       limit 1;
    if found then
      return;
    end if;

    select min((pt ->> 1)::float8) as s, min((pt ->> 0)::float8) as o,
           max((pt ->> 1)::float8) as n, max((pt ->> 0)::float8) as e
      into b
      from public.zones z
      join public.mairie_communes mc on mc.commune_id = z.commune_id and mc.user_id = v_uid
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(z.contour #> '{coordinates,0}') = 'array' then z.contour #> '{coordinates,0}' end) pt
     where jsonb_typeof(pt -> 0) = 'number' and jsonb_typeof(pt -> 1) = 'number';
    if b.s is not null then
      return query select (b.s + b.n) / 2, (b.o + b.e) / 2, null::integer, b.s, b.o, b.n, b.e, 'zones'::text;
      return;
    end if;

  elsif v_role = 'admin' then
    select min((pt ->> 1)::float8) as s, min((pt ->> 0)::float8) as o,
           max((pt ->> 1)::float8) as n, max((pt ->> 0)::float8) as e
      into b
      from public.zones z
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(z.contour #> '{coordinates,0}') = 'array' then z.contour #> '{coordinates,0}' end) pt
     where jsonb_typeof(pt -> 0) = 'number' and jsonb_typeof(pt -> 1) = 'number';
    if b.s is not null then
      return query select (b.s + b.n) / 2, (b.o + b.e) / 2, null::integer, b.s, b.o, b.n, b.e, 'zones'::text;
      return;
    end if;
  end if;

  return query select 3.848::float8, 11.502::float8, 13,
                      null::float8, null::float8, null::float8, null::float8, 'defaut'::text;
end $$;

-- =============================================================================
-- 9. Droits (aucune fonction n'est ouverte par défaut depuis 20261011000009 §7.a)
-- =============================================================================
-- Prédicats : évalués par les politiques, donc ouverts aux comptes connectés.
-- Administration et supervision : comptes connectés (chaque fonction vérifie
-- ensuite le rôle). Jamais le visiteur anonyme.
do $$
declare f text;
begin
  foreach f in array array[
    'public.supervise_commune(uuid)', 'public.supervise_zone(uuid)', 'public.supervise_entreprise(uuid)',
    'public.traiter_demande_acces(uuid, boolean)', 'public.accorder_commune_mairie(uuid, uuid)',
    'public.retirer_commune_mairie(uuid, uuid)', 'public.comptes_mairie()',
    'public.supervision_zones()', 'public.supervision_precollecteurs()', 'public.supervision_activite(int)',
    'public.supervision_demandes()', 'public.demandes_ouvertes()',
    'public.creer_code_agrement(text, text, uuid)', 'public.revoquer_code_agrement(uuid)',
    'public.creer_mon_entreprise(text, text, text, uuid, text)',
    'public.indicateurs_pilote(text)', 'public.centre_carte()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
-- Calculs internes : ni les comptes, ni le visiteur (la tâche planifiée et
-- indicateurs_pilote les appellent avec les droits du propriétaire).
revoke all on function public.kpi_commune_entreprise(uuid) from public, anon, authenticated;
revoke all on function public.kpi_calculer(date, date, text, text) from public, anon, authenticated;
revoke all on function public.kpi_releves_a_jour() from public, anon, authenticated;

commit;

-- =============================================================================
-- Contrôle (à lire dans le résultat) : chaque ligne doit afficher « OK ».
-- Les lignes 2 à 5 LISTENT ce qui reste à rattacher à une commune.
-- =============================================================================
select controle, case when ok then 'OK' else 'À VÉRIFIER' end as resultat, detail
from (
  select 1 as n, 'Table mairie_communes : RLS, aucune écriture pour les comptes ni le visiteur' as controle,
         c.relrowsecurity
         and not has_table_privilege('authenticated', c.oid, 'INSERT')
         and not has_table_privilege('authenticated', c.oid, 'UPDATE')
         and not has_table_privilege('authenticated', c.oid, 'DELETE')
         and not has_table_privilege('anon', c.oid, 'SELECT') as ok,
         (select count(*) from public.mairie_communes) || ' rattachement(s), dont '
           || (select count(*) from public.mairie_communes mc
                where exists (select 1 from public.demandes_acces d
                               where d.user_id = mc.user_id and d.commune_id = mc.commune_id and d.statut = 'acceptee'))
           || ' issus d''une demande d''accès acceptée' as detail
    from pg_class c where c.oid = 'public.mairie_communes'::regclass
  union all
  select 2, 'Comptes Mairie SANS commune (ils ne voient plus rien : à rattacher aujourd''hui)',
         count(*) = 0, coalesce(string_agg(p.email, ', ' order by p.email), 'aucun')
    from public.profiles p
   where p.role = 'mairie'
     and not exists (select 1 from public.mairie_communes mc where mc.user_id = p.id)
  union all
  select 3, 'Zones sans commune (modifiables par l''administrateur seulement)',
         count(*) = 0, coalesce(string_agg(z.nom, ', ' order by z.nom), 'aucune')
    from public.zones z where z.commune_id is null
  union all
  select 4, 'Précollecteurs sans commune ni zone rattachée (invisibles des Mairies)',
         count(*) = 0, coalesce(string_agg(e.nom, ', ' order by e.nom), 'aucun')
    from public.entreprises e
   where e.commune_id is null
     and not exists (select 1 from public.zone_affectations a join public.zones z on z.id = a.zone_id
                      where a.entreprise_id = e.id and z.commune_id is not null)
  union all
  select 5, 'Codes d''agrément à utiliser, sans commune (visibles de l''administrateur seulement)',
         count(*) = 0, coalesce(string_agg(ca.destinataire, ', ' order by ca.destinataire), 'aucun')
    from public.codes_agrement ca
   where ca.commune_id is null and ca.utilise_at is null and ca.revoque_at is null and ca.expire_at > now()
  union all
  select 6, 'Politiques qui donnent encore tout à la Mairie (est_superviseur seul)',
         count(*) = 0, coalesce(string_agg(tablename || '.' || policyname, ', ' order by tablename, policyname), 'aucune')
    from pg_policies
   where schemaname in ('public', 'storage')
     and coalesce(qual, '') || ' ' || coalesce(with_check, '') ~ 'est_superviseur'
  union all
  select 7, 'Fonctions de la Mairie cloisonnées par commune',
         count(*) filter (where not cloisonnee) = 0,
         coalesce(string_agg(nom, ', ' order by nom) filter (where not cloisonnee), 'toutes (' || count(*) || ')')
    from (select f as nom, pg_get_functiondef(to_regprocedure(f)) ~ '(supervise_(commune|zone|entreprise)|mairie_communes)' as cloisonnee
            from unnest(array[
              'public.supervision_zones()', 'public.supervision_precollecteurs()', 'public.supervision_activite(int)',
              'public.supervision_demandes()', 'public.demandes_ouvertes()', 'public.creer_code_agrement(text, text, uuid)',
              'public.revoquer_code_agrement(uuid)', 'public.indicateurs_pilote(text)', 'public.centre_carte()',
              'public.traiter_demande_acces(uuid, boolean)']) f) x
  union all
  select 8, 'Droits : prédicats et fonctions ouverts aux comptes connectés, fermés au visiteur ; calculs internes fermés',
         has_function_privilege('authenticated', 'public.supervise_entreprise(uuid)', 'execute')
         and has_function_privilege('authenticated', 'public.accorder_commune_mairie(uuid, uuid)', 'execute')
         and not has_function_privilege('anon', 'public.supervise_commune(uuid)', 'execute')
         and not has_function_privilege('anon', 'public.supervise_zone(uuid)', 'execute')
         and not has_function_privilege('anon', 'public.supervise_entreprise(uuid)', 'execute')
         and not has_function_privilege('anon', 'public.accorder_commune_mairie(uuid, uuid)', 'execute')
         and not has_function_privilege('anon', 'public.retirer_commune_mairie(uuid, uuid)', 'execute')
         and not has_function_privilege('anon', 'public.comptes_mairie()', 'execute')
         and not has_function_privilege('authenticated', 'public.kpi_commune_entreprise(uuid)', 'execute')
         and not has_function_privilege('authenticated', 'public.kpi_calculer(date, date, text, text)', 'execute'),
         'supervise_*, accorder/retirer_commune_mairie, comptes_mairie, kpi_commune_entreprise'
  union all
  select 9, 'Relevés d''indicateurs : périmètre « commune » accepté',
         exists (select 1 from pg_constraint where conrelid = 'public.kpi_releves'::regclass and conname = 'kpi_releves_perimetre_valide'),
         (select count(*) from public.communes where code ~ '^[A-Z0-9]{2,12}$') || ' commune(s) suivie(s)'
  union all
  select 10, 'Récapitulatif : comptes Mairie et leurs communes', true,
         coalesce((select string_agg(x.email || ' → ' || x.communes, ' ; ' order by x.email)
                     from (select p.email, coalesce(string_agg(c.code, ', ' order by c.code), 'AUCUNE') as communes
                             from public.profiles p
                             left join public.mairie_communes mc on mc.user_id = p.id
                             left join public.communes c on c.id = mc.commune_id
                            where p.role = 'mairie'
                            group by p.email) x), 'aucun compte Mairie')
) x order by n;
