-- =============================================================================
-- MyKlinTown — Paiement en ligne : une demande à la fois par facture ; jamais
-- plus que le reste dû imputé ; suivi auprès du fournisseur limité
-- =============================================================================
-- PR #37 (paiement encaissé par MyKlinTown), revue du 10/11/2026.
--
--   1. Une seule demande en cours par facture. Deux demandes simultanées
--      (double appui sur « Payer », lien ouvert pendant que l'employé demande
--      le paiement en tournée) partaient toutes les deux : l'abonné pouvait
--      payer deux fois. Index unique partiel ; l'application fait d'abord
--      expirer les demandes restées sans réponse plus de 10 minutes.
--   2. Un paiement confirmé n'est imputé que dans la limite du reste dû, sous
--      verrou de la facture. Facture annulée, déjà réglée (espèces encaissées
--      pendant la validation) ou trop-perçu : la somme en trop est notée
--      « à rembourser » (`a_rembourser_fcfa`), jamais comptée sur la facture.
--      L'encaissement en espèces verrouille lui aussi la facture.
--   3. `verifie_at` : dernière interrogation du fournisseur par l'écran de
--      suivi (une toutes les 2 secondes au plus par paiement).
--   4. Index sur le numéro payeur : les demandes par lien de paiement sont
--      limitées par numéro.
--
-- Mêmes signatures. Additive et rejouable. À jouer APRÈS 20261114000022 ;
-- « OK » sur les lignes 1 à 5 du contrôle ; la ligne 6 est une information.
-- =============================================================================

begin;

-- =============================================================================
-- 0. Migrations préalables
-- =============================================================================
do $$
begin
  if to_regclass('public.paiements_en_ligne') is null
     or to_regprocedure('public.precollecteur_verifie(uuid)') is null then
    raise exception 'Migration à jouer d''abord : 20261114000022_liste_attente_gardes_creation (et les précédentes, dont 20261006000008)'
      using hint = 'Rien n''a été modifié. Contrôle complet : supabase/EMPREINTE_SCHEMA.sql';
  end if;
end $$;

-- =============================================================================
-- 1. Une seule demande en cours par facture
-- =============================================================================
-- Demandes restées sans réponse plus de 10 minutes : l'application les noterait
-- « expirées » au prochain suivi. Une validation tardive sur le téléphone reste
-- enregistrée (notification de Notch Pay, rapprochement quotidien).
update public.paiements_en_ligne
   set statut = 'expire', message = 'Aucune validation sur le téléphone : la demande a expiré.',
       termine_at = now(), maj_at = now()
 where statut in ('initie', 'en_attente') and created_at < now() - interval '10 minutes';

-- Deux demandes récentes sur une même facture : seule la plus récente reste en cours.
update public.paiements_en_ligne p
   set statut = 'expire', message = 'Remplacée par une demande plus récente.',
       termine_at = now(), maj_at = now()
 where p.statut in ('initie', 'en_attente')
   and exists (select 1 from public.paiements_en_ligne q
                where q.facture_id = p.facture_id and q.statut in ('initie', 'en_attente')
                  and (q.created_at, q.id) > (p.created_at, p.id));

create unique index if not exists paiements_en_ligne_un_en_cours
  on public.paiements_en_ligne (facture_id) where statut in ('initie', 'en_attente');

-- =============================================================================
-- 2. Jamais plus que le reste dû : le trop-perçu est à rembourser
-- =============================================================================
alter table public.paiements_en_ligne add column if not exists a_rembourser_fcfa int not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'paiements_en_ligne_a_rembourser_check') then
    alter table public.paiements_en_ligne add constraint paiements_en_ligne_a_rembourser_check
      check (a_rembourser_fcfa >= 0 and a_rembourser_fcfa <= montant_fcfa);
  end if;
end $$;
comment on column public.paiements_en_ligne.a_rembourser_fcfa is
  'Part d''un paiement réussi qui n''a pas été imputée sur la facture (annulée, déjà réglée, trop-perçu) : à rembourser au payeur.';

create or replace function public.enregistrer_paiement_en_ligne(p_reference text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t public.paiements_en_ligne;
  f public.factures;
  v_deja int;
  v_impute int;
  v_paiement uuid;
begin
  select * into t from public.paiements_en_ligne where reference = p_reference for update;
  if not found then raise exception 'Transaction inconnue'; end if;
  if t.statut = 'reussi' then return t.paiement_id; end if;   -- notification reçue deux fois

  -- Facture verrouillée : un encaissement en espèces ou une annulation
  -- simultanés attendent la fin de cet enregistrement (et inversement).
  select * into f from public.factures where id = t.facture_id for update;
  select coalesce(sum(montant_fcfa), 0) into v_deja
    from public.paiements_clients where facture_id = t.facture_id and statut in ('valide', 'a_valider');
  v_impute := case when f.statut = 'annulee' then 0
                   else least(t.montant_fcfa, greatest(f.montant_fcfa - v_deja, 0)) end;

  if v_impute > 0 then
    insert into public.paiements_clients (facture_id, entreprise_id, client_id, montant_fcfa, methode, reference, statut, created_by)
    values (t.facture_id, t.entreprise_id, t.client_id, v_impute,
            case t.canal when 'cm.mtn' then 'mtn_momo' else 'orange_money' end,
            coalesce(t.fournisseur_reference, t.reference), 'valide', t.initie_par)
    returning id into v_paiement;
    -- Un client suspendu pour impayé qui a réglé redevient actif.
    update public.clients set statut = 'actif' where id = t.client_id and statut = 'suspendu';
  end if;

  update public.paiements_en_ligne
     set statut = 'reussi', paiement_id = v_paiement, a_rembourser_fcfa = t.montant_fcfa - v_impute,
         termine_at = now(), maj_at = now(),
         message = case
           when v_impute = t.montant_fcfa then null
           when f.statut = 'annulee' then 'Facture annulée : paiement à rembourser.'
           when v_impute = 0 then 'Facture déjà réglée : paiement à rembourser.'
           else 'Trop-perçu : ' || (t.montant_fcfa - v_impute) || ' FCFA à rembourser.'
         end
   where id = t.id;
  return v_paiement;
end $$;

revoke all on function public.enregistrer_paiement_en_ligne(text) from public, anon, authenticated;
grant execute on function public.enregistrer_paiement_en_ligne(text) to service_role;

-- Encaissement en espèces : même verrou sur la facture (corps de 20261005000007,
-- seul `for update` est ajouté).
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

  -- La plus ancienne facture à régler, verrouillée jusqu'à la fin de l'encaissement.
  select * into f from public.factures
   where client_id = c.id and statut = 'emise'
   order by echeance, created_at limit 1
   for update;
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

revoke all on function public.encaisser_especes(uuid, integer) from public, anon;
grant execute on function public.encaisser_especes(uuid, integer) to authenticated;

-- =============================================================================
-- 3. Suivi auprès du fournisseur : une interrogation toutes les 2 secondes au plus
-- =============================================================================
alter table public.paiements_en_ligne add column if not exists verifie_at timestamptz not null default now();

-- =============================================================================
-- 4. Demandes par numéro payeur (limite des liens de paiement)
-- =============================================================================
create index if not exists paiements_en_ligne_telephone_idx
  on public.paiements_en_ligne (telephone, created_at desc);

commit;

-- =============================================================================
-- Contrôle (à lire dans le résultat) : « OK » sur les lignes 1 à 5.
-- =============================================================================
select controle, case when ok is null then 'INFO' when ok then 'OK' else 'À VÉRIFIER' end as resultat, detail
from (
  select 1 as n, 'Une seule demande en cours par facture' as controle,
         exists (select 1 from pg_indexes
                  where schemaname = 'public' and indexname = 'paiements_en_ligne_un_en_cours') as ok,
         'index unique partiel sur les demandes « initie » et « en_attente »' as detail
  union all
  select 2, 'Reste dû seulement ; trop-perçu à rembourser',
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'paiements_en_ligne' and column_name = 'a_rembourser_fcfa')
         and (select p.prosrc like '%a_rembourser_fcfa%' from pg_proc p
               where p.oid = 'public.enregistrer_paiement_en_ligne(text)'::regprocedure),
         'facture annulée, déjà réglée ou trop-perçu'
  union all
  select 3, 'Facture verrouillée à l''encaissement (en ligne et espèces)',
         (select bool_and(p.prosrc ~ 'from public\.factures[^;]*for update') from pg_proc p
           where p.oid in ('public.enregistrer_paiement_en_ligne(text)'::regprocedure,
                           'public.encaisser_especes(uuid, integer)'::regprocedure)),
         'deux encaissements simultanés ne dépassent plus le reste dû'
  union all
  select 4, 'Fonctions d''encaissement fermées au visiteur anonyme',
         not has_function_privilege('anon', 'public.enregistrer_paiement_en_ligne(text)', 'execute')
         and not has_function_privilege('authenticated', 'public.enregistrer_paiement_en_ligne(text)', 'execute')
         and not has_function_privilege('anon', 'public.encaisser_especes(uuid, integer)', 'execute')
         and has_function_privilege('authenticated', 'public.encaisser_especes(uuid, integer)', 'execute'),
         'paiement en ligne : serveur seulement ; espèces : équipe connectée'
  union all
  select 5, 'Suivi limité ; index du numéro payeur',
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'paiements_en_ligne' and column_name = 'verifie_at')
         and exists (select 1 from pg_indexes
                      where schemaname = 'public' and indexname = 'paiements_en_ligne_telephone_idx'),
         'verifie_at, paiements_en_ligne_telephone_idx'
  union all
  select 6, 'Paiements en ligne : en cours ; à rembourser',
         null::boolean,
         (select count(*) filter (where statut in ('initie', 'en_attente')) || ' en cours ; '
                 || count(*) filter (where a_rembourser_fcfa > 0) || ' à rembourser ; '
                 || count(*) || ' au total'
            from public.paiements_en_ligne)
) x order by n;
