-- =============================================================================
-- MyKlinTown — Liste d'attente réservée aux précollecteurs vérifiés ; colonnes
-- système gardées dès la création ; encaissements non supprimables
-- =============================================================================
-- Revue du 10/11/2026.
--
--   1. Liste d'attente (`demandes_ouvertes`, `prendre_demande`) : réservée aux
--      précollecteurs dont le dossier est validé et qui ne sont pas suspendus,
--      comme le sont déjà les demandes de devis.
--   2. Les colonnes « système » (compte rattaché à une fiche client ou
--      employé, confirmation de l'abonné, validation d'un encaissement)
--      étaient gardées à la modification ; elles le sont aussi à la création.
--      `mon_employe()` ne reconnaît qu'une fiche de sa propre entreprise.
--   3. Un encaissement enregistré ne se supprime plus depuis l'application ;
--      seul un encaissement rejeté s'efface.
--   4. Un employé désactivé n'est plus « membre » de l'entreprise.
--   5. Les tables de la première version, que l'application n'utilise plus,
--      sont fermées à l'API.
--   6. Le préfixe de facture ne se tronque plus au-delà de 999 entreprises.
--
-- Mêmes signatures. Additive et rejouable. À jouer APRÈS 20261113000021 ;
-- « OK » sur les lignes 1 à 6 du contrôle ; la ligne 7 est une information.
-- =============================================================================

begin;

-- =============================================================================
-- 0. Migrations préalables
-- =============================================================================
do $$
begin
  if to_regclass('public.rattachements_essais') is null then
    raise exception 'Migration à jouer d''abord : 20261113000021_rattachement_essais (et les précédentes)'
      using hint = 'Rien n''a été modifié. Contrôle complet : supabase/EMPREINTE_SCHEMA.sql';
  end if;
end $$;

-- =============================================================================
-- 1. Liste d'attente : précollecteurs vérifiés seulement
-- =============================================================================
create or replace function public.precollecteur_verifie(p_entreprise uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.entreprises e
    where e.id = p_entreprise and e.dossier_statut = 'valide' and e.statut <> 'suspendu'
  )
$$;

revoke all on function public.precollecteur_verifie(uuid) from public, anon;
grant execute on function public.precollecteur_verifie(uuid) to authenticated, service_role;

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
    and ((public.est_gerant(public.mon_entreprise()) and public.precollecteur_verifie(public.mon_entreprise()))
         or public.supervise_zone(d.zone_id))
    and not exists (select 1 from public.clients c where c.user_id = d.user_id and c.statut <> 'resilie')
  order by d.created_at
$$;

revoke all on function public.demandes_ouvertes() from public, anon;
grant execute on function public.demandes_ouvertes() to authenticated;

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
  if not public.precollecteur_verifie(v_ent) then
    raise exception 'Votre dossier doit être validé par MyKlinTown avant de prendre un ménage en charge'
      using errcode = '42501';
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

revoke all on function public.prendre_demande(uuid) from public, anon;
grant execute on function public.prendre_demande(uuid) to authenticated;

-- =============================================================================
-- 2. Colonnes système : gardées dès la création
-- =============================================================================
-- Même règle que `garde_colonnes_systeme` (modification) : seules les fonctions
-- de la base et l'équipe MyKlinTown fixent ces colonnes. Depuis l'application,
-- une ligne se crée avec ces colonnes vides.
create or replace function public.garde_insertion_systeme() returns trigger
language plpgsql set search_path = public as $$
declare
  i int;
  v_colonne text;
  v_valeur jsonb;
begin
  if current_user not in ('anon', 'authenticated') or public.est_admin() then
    return new;
  end if;
  for i in 0 .. tg_nargs - 1 loop
    v_colonne := tg_argv[i];
    v_valeur := to_jsonb(new) -> v_colonne;
    if v_valeur is not null and v_valeur not in ('null'::jsonb, 'false'::jsonb) then
      raise exception 'Création refusée : « % » ne se fixe pas depuis l''application (%).', v_colonne, tg_table_name
        using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

revoke all on function public.garde_insertion_systeme() from public, anon;

drop trigger if exists clients_insertion_systeme on public.clients;
create trigger clients_insertion_systeme before insert on public.clients
  for each row execute function public.garde_insertion_systeme('user_id');

drop trigger if exists employes_insertion_systeme on public.employes;
create trigger employes_insertion_systeme before insert on public.employes
  for each row execute function public.garde_insertion_systeme('user_id');

drop trigger if exists collectes_insertion_systeme on public.collectes;
create trigger collectes_insertion_systeme before insert on public.collectes
  for each row execute function public.garde_insertion_systeme('confirmation_client', 'confirmation_at', 'refus_abonnement');

drop trigger if exists paiements_clients_insertion_systeme on public.paiements_clients;
create trigger paiements_clients_insertion_systeme before insert on public.paiements_clients
  for each row execute function public.garde_insertion_systeme('valide_par', 'valide_at');

-- La fiche employé de l'appelant : dans une entreprise dont il est membre.
create or replace function public.mon_employe() returns uuid
language sql stable security definer set search_path = public as $$
  select e.id
  from public.employes e
  where e.user_id = auth.uid() and e.actif
    and exists (select 1 from public.entreprise_membres m
                where m.entreprise_id = e.entreprise_id and m.user_id = e.user_id)
  order by e.created_at, e.id
  limit 1
$$;

revoke all on function public.mon_employe() from public, anon;
grant execute on function public.mon_employe() to authenticated;

-- =============================================================================
-- 3. Un encaissement enregistré ne se supprime pas depuis l'application
-- =============================================================================
-- Les suppressions en cascade (fiche de démonstration effacée) s'exécutent avec
-- les droits du propriétaire de la table : elles ne sont pas concernées.
create or replace function public.paiements_clients_suppression() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') and old.statut <> 'rejete' and not public.est_admin() then
    raise exception 'Un encaissement enregistré ne se supprime pas. En cas d''erreur de saisie, contactez MyKlinTown.'
      using errcode = '42501';
  end if;
  return old;
end $$;

revoke all on function public.paiements_clients_suppression() from public, anon;

drop trigger if exists paiements_clients_suppression on public.paiements_clients;
create trigger paiements_clients_suppression before delete on public.paiements_clients
  for each row execute function public.paiements_clients_suppression();

-- =============================================================================
-- 4. Un employé désactivé n'est plus « membre »
-- =============================================================================
create or replace function public.est_membre(p_entreprise uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.entreprise_membres m
    where m.entreprise_id = p_entreprise and m.user_id = auth.uid()
      and (m.role_membre <> 'agent'
           or exists (select 1 from public.employes e
                      where e.entreprise_id = m.entreprise_id and e.user_id = m.user_id and e.actif))
  )
$$;

revoke all on function public.est_membre(uuid) from public, anon;
grant execute on function public.est_membre(uuid) to authenticated;

-- =============================================================================
-- 5. Tables de la première version : fermées à l'API
-- =============================================================================
-- L'application ne les lit ni ne les écrit plus. Leurs données restent en
-- place ; seuls les droits des comptes de l'API sont retirés.
do $$
declare
  v_table text;
  v_fonction regprocedure;
begin
  foreach v_table in array array[
    'abonnements', 'articles_marketplace', 'bacs', 'camions', 'capteurs_iot', 'demandes_collecte',
    'incidents_terrain', 'menages', 'mouvements_stock', 'paiements', 'profils_gamification',
    'rapports_qhse', 'recycleurs', 'scans', 'secteurs', 'signalements', 'structures', 'tournees'
  ] loop
    if to_regclass('public.' || quote_ident(v_table)) is not null then
      execute format('revoke all on table public.%I from anon, authenticated', v_table);
    end if;
  end loop;
  for v_fonction in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('create_signalement', 'create_incident_terrain')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_fonction);
  end loop;
end $$;

-- =============================================================================
-- 6. Préfixe de facture : F001 … F999, puis F1000 …
-- =============================================================================
create or replace function public.prefixe_facture_suivant() returns text
language plpgsql set search_path = public as $$
declare
  v_numero bigint := nextval('public.entreprises_prefixe_seq');
begin
  -- lpad(…, 3) tronquait au-delà de 999 : deux entreprises recevaient le même préfixe.
  return 'F' || case when v_numero < 1000 then lpad(v_numero::text, 3, '0') else v_numero::text end;
end $$;

revoke all on function public.prefixe_facture_suivant() from public, anon;
grant execute on function public.prefixe_facture_suivant() to authenticated, service_role;

alter table public.entreprises alter column prefixe_facture set default public.prefixe_facture_suivant();

commit;

-- =============================================================================
-- Contrôle (à lire dans le résultat) : « OK » sur les lignes 1 à 6.
-- =============================================================================
select controle, case when ok is null then 'INFO' when ok then 'OK' else 'À VÉRIFIER' end as resultat, detail
from (
  select 1 as n, 'Liste d''attente réservée aux précollecteurs vérifiés' as controle,
         (select bool_and(p.prosrc like '%precollecteur_verifie%') from pg_proc p
           where p.oid in ('public.demandes_ouvertes()'::regprocedure, 'public.prendre_demande(uuid)'::regprocedure)) as ok,
         'dossier validé et entreprise non suspendue' as detail
  union all
  select 2, 'Colonnes système gardées dès la création',
         (select count(*) = 4 from pg_trigger
           where not tgisinternal and tgname in ('clients_insertion_systeme', 'employes_insertion_systeme',
                                                  'collectes_insertion_systeme', 'paiements_clients_insertion_systeme')),
         'fiche client, fiche employé, passage, encaissement'
  union all
  select 3, 'Fiche employé reconnue dans sa seule entreprise',
         (select p.prosrc like '%entreprise_membres%' from pg_proc p where p.oid = 'public.mon_employe()'::regprocedure),
         'pointage, scan et encaissement de terrain'
  union all
  select 4, 'Encaissement non supprimable ; employé désactivé hors de l''équipe',
         exists (select 1 from pg_trigger where not tgisinternal and tgname = 'paiements_clients_suppression')
         and (select p.prosrc like '%e.actif%' from pg_proc p where p.oid = 'public.est_membre(uuid)'::regprocedure),
         'seul un encaissement rejeté s''efface'
  union all
  select 5, 'Tables de la première version fermées à l''API',
         not exists (select 1 from information_schema.role_table_grants g
                      where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated')
                        and g.table_name in ('abonnements', 'articles_marketplace', 'bacs', 'camions', 'capteurs_iot',
                                             'demandes_collecte', 'incidents_terrain', 'menages', 'mouvements_stock',
                                             'paiements', 'profils_gamification', 'rapports_qhse', 'recycleurs', 'scans',
                                             'secteurs', 'signalements', 'structures', 'tournees')),
         'leurs données restent en place'
  union all
  select 6, 'Préfixe de facture sans troncature',
         (select pg_get_expr(d.adbin, d.adrelid) like '%prefixe_facture_suivant%'
            from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
           where d.adrelid = 'public.entreprises'::regclass and a.attname = 'prefixe_facture'),
         'F001 … F999, puis F1000'
  union all
  select 7, 'Précollecteurs vérifiés ; fiches employé hors de leur équipe',
         null::boolean,
         (select count(*) filter (where e.dossier_statut = 'valide' and e.statut <> 'suspendu') || ' vérifié(s) sur ' || count(*)
            from public.entreprises e)
         || ' ; ' ||
         (select count(*) from public.employes e
           where e.user_id is not null
             and not exists (select 1 from public.entreprise_membres m
                              where m.entreprise_id = e.entreprise_id and m.user_id = e.user_id))
         || ' fiche(s) à examiner'
) x order by n;
