-- =============================================================================
-- MyKlinTown — Paiement en ligne (Mobile Money via Notch Pay)
-- =============================================================================
-- Décisions (05/10/2026) :
--   • l'argent du ménage arrive DIRECTEMENT sur le compte Notch Pay du
--     précollecteur (compte « connecté ») ; la commission MyKlinTown est
--     prélevée à la source. MyKlinTown ne détient jamais les fonds ;
--   • trois usages : le ménage depuis son espace, un lien de paiement envoyé
--     par WhatsApp, une demande sur le téléphone du ménage pendant la tournée.
--
-- Sécurité :
--   • les transactions ne s'écrivent QUE côté serveur (clé service, jamais
--     exposée au navigateur) : aucune politique d'écriture pour les comptes ;
--   • un paiement n'est enregistré comme payé qu'une fois confirmé par Notch
--     Pay (notification signée ou vérification) — et une seule fois ;
--   • le statut du compte de paiement d'une entreprise ne se modifie pas
--     depuis l'application (seul le serveur, après vérification chez Notch Pay).
--
-- Script ADDITIF et IDEMPOTENT. À exécuter APRÈS 20261005000007 ; il peut
-- aussi être joué après 20261011000009 (base montée depuis main) : il pose
-- alors lui-même les contrôles de cohérence prévus par l'audit (§5).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Compte de paiement de l'entreprise (compte connecté Notch Pay)
-- -----------------------------------------------------------------------------
alter table public.entreprises add column if not exists paiement_compte_id text;
alter table public.entreprises add column if not exists paiement_statut text not null default 'inactif';
alter table public.entreprises add column if not exists paiement_maj_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'entreprises_paiement_statut_check') then
    alter table public.entreprises
      add constraint entreprises_paiement_statut_check
      check (paiement_statut in ('inactif', 'en_verification', 'actif', 'refuse'));
  end if;
end $$;

-- Ces colonnes ne bougent que côté serveur (clé service), après vérification
-- chez Notch Pay : un gérant ne peut pas « s'activer » lui-même.
create or replace function public.garde_paiement_entreprise() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_claims jsonb;
begin
  if new.paiement_compte_id is not distinct from old.paiement_compte_id
     and new.paiement_statut is not distinct from old.paiement_statut then
    return new;
  end if;
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    v_claims := null;
  end;
  if v_claims is null or (v_claims ->> 'role') = 'service_role' then
    return new;
  end if;
  raise exception 'Le compte de paiement se configure côté serveur, après vérification chez Notch Pay'
    using errcode = '42501';
end $$;
drop trigger if exists entreprises_garde_paiement on public.entreprises;
create trigger entreprises_garde_paiement
  before update of paiement_compte_id, paiement_statut on public.entreprises
  for each row execute function public.garde_paiement_entreprise();

-- -----------------------------------------------------------------------------
-- 2. Transactions en ligne
-- -----------------------------------------------------------------------------
create table if not exists public.paiements_en_ligne (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  facture_id uuid not null references public.factures(id) on delete cascade,
  reference text not null unique,
  fournisseur text not null default 'notchpay' check (fournisseur in ('notchpay', 'simulation')),
  fournisseur_reference text unique,
  canal text not null check (canal in ('cm.mtn', 'cm.orange')),
  telephone text not null,
  montant_fcfa int not null check (montant_fcfa > 0),
  commission_fcfa int not null default 0 check (commission_fcfa >= 0),
  origine text not null check (origine in ('menage', 'lien', 'tournee')),
  statut text not null default 'initie'
    check (statut in ('initie', 'en_attente', 'reussi', 'echoue', 'annule', 'expire')),
  message text,
  initie_par uuid references public.profiles(id) on delete set null,
  paiement_id uuid references public.paiements_clients(id) on delete set null,
  created_at timestamptz not null default now(),
  maj_at timestamptz not null default now(),
  termine_at timestamptz
);
create index if not exists paiements_en_ligne_facture_idx on public.paiements_en_ligne (facture_id, created_at desc);
create index if not exists paiements_en_ligne_entreprise_idx on public.paiements_en_ligne (entreprise_id, created_at desc);

alter table public.paiements_en_ligne enable row level security;
-- Lecture : le gérant, le ménage concerné, l'employé qui l'a lancée. Aucune
-- écriture par les comptes : tout passe par le serveur.
drop policy if exists paiements_en_ligne_lecture on public.paiements_en_ligne;
create policy paiements_en_ligne_lecture on public.paiements_en_ligne for select to authenticated
  using (
    public.est_gerant(entreprise_id)
    or public.est_admin()
    or exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid())
    or (public.est_agent(entreprise_id) and initie_par = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 3. Liens de paiement (envoyés par WhatsApp, payables sans compte)
-- -----------------------------------------------------------------------------
create table if not exists public.liens_paiement (
  jeton text primary key,
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  facture_id uuid not null references public.factures(id) on delete cascade,
  cree_par uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  expire_at timestamptz not null default now() + interval '30 days'
);
create index if not exists liens_paiement_facture_idx on public.liens_paiement (facture_id);
alter table public.liens_paiement enable row level security;
drop policy if exists liens_paiement_lecture on public.liens_paiement;
create policy liens_paiement_lecture on public.liens_paiement for select to authenticated
  using (public.est_gerant(entreprise_id) or public.est_admin());

-- Lien d'une facture à régler (le même tant qu'il est valable).
create or replace function public.creer_lien_paiement(p_facture uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  f public.factures;
  v_jeton text;
begin
  select * into f from public.factures where id = p_facture;
  if not found or not (public.est_gerant(f.entreprise_id) or public.est_agent(f.entreprise_id)) then
    raise exception 'Facture introuvable' using errcode = '42501';
  end if;
  if f.statut <> 'emise' then raise exception 'Cette facture n''est plus à régler'; end if;
  select jeton into v_jeton from public.liens_paiement
   where facture_id = f.id and expire_at > now() + interval '1 day'
   order by created_at desc limit 1;
  if v_jeton is not null then return v_jeton; end if;
  v_jeton := replace(gen_random_uuid()::text, '-', '');
  insert into public.liens_paiement (jeton, entreprise_id, facture_id) values (v_jeton, f.entreprise_id, f.id);
  return v_jeton;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Paiement confirmé : enregistré UNE fois (appelé par le serveur)
-- -----------------------------------------------------------------------------
create or replace function public.enregistrer_paiement_en_ligne(p_reference text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t public.paiements_en_ligne;
  v_paiement uuid;
begin
  select * into t from public.paiements_en_ligne where reference = p_reference for update;
  if not found then raise exception 'Transaction inconnue'; end if;
  if t.statut = 'reussi' then return t.paiement_id; end if;   -- notification reçue deux fois

  insert into public.paiements_clients (facture_id, entreprise_id, client_id, montant_fcfa, methode, reference, statut, created_by)
  values (t.facture_id, t.entreprise_id, t.client_id, t.montant_fcfa,
          case t.canal when 'cm.mtn' then 'mtn_momo' else 'orange_money' end,
          coalesce(t.fournisseur_reference, t.reference), 'valide', t.initie_par)
  returning id into v_paiement;

  update public.paiements_en_ligne
     set statut = 'reussi', paiement_id = v_paiement, termine_at = now(), maj_at = now(), message = null
   where id = t.id;
  -- Un client suspendu pour impayé qui a réglé redevient actif.
  update public.clients set statut = 'actif' where id = t.client_id and statut = 'suspendu';
  return v_paiement;
end $$;

-- Droits : les deux fonctions d'écriture côté serveur ne sont ouvertes à
-- aucun compte ; le lien de paiement se crée depuis l'application.
revoke all on function public.enregistrer_paiement_en_ligne(text) from public, anon, authenticated;
grant execute on function public.enregistrer_paiement_en_ligne(text) to service_role;
revoke all on function public.creer_lien_paiement(uuid) from public, anon;
grant execute on function public.creer_lien_paiement(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Cohérence des références (audit du 11/10/2026)
-- -----------------------------------------------------------------------------
-- 20261011000009 pose ces déclencheurs sur les deux tables si elles existent.
-- Jouée APRÈS lui (base montée depuis main), cette migration les pose
-- elle-même ; jouée avant (production), elle les remet à l'identique.
do $$
declare
  t text;
begin
  if to_regprocedure('public.verifier_coherence_entreprise()') is null then return; end if;
  foreach t in array array['paiements_en_ligne', 'liens_paiement'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_coherence_entreprise', t);
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function public.verifier_coherence_entreprise()',
      t || '_coherence_entreprise', t);
  end loop;
end $$;

commit;

-- Contrôle : 6 lignes « OK » attendues (la ligne 4 dit « sans objet » avant 20261011000009).
select controle, resultat
from (
  select 1 as n, 'Colonnes paiement_* sur entreprises (3)' as controle,
         case when (select count(*) from information_schema.columns
                     where table_schema = 'public' and table_name = 'entreprises'
                       and column_name in ('paiement_compte_id', 'paiement_statut', 'paiement_maj_at')) = 3
              then 'OK' else 'À VÉRIFIER' end as resultat
  union all
  select 2, 'RLS active sur paiements_en_ligne et liens_paiement',
         case when (select bool_and(relrowsecurity) from pg_class
                     where oid in ('public.paiements_en_ligne'::regclass, 'public.liens_paiement'::regclass))
              then 'OK' else 'À VÉRIFIER' end
  union all
  select 3, 'Déclencheur entreprises_garde_paiement',
         case when exists (select 1 from pg_trigger where tgname = 'entreprises_garde_paiement'
                            and tgrelid = 'public.entreprises'::regclass)
              then 'OK' else 'À VÉRIFIER' end
  union all
  select 4, 'Déclencheurs de cohérence sur les deux tables',
         case when to_regprocedure('public.verifier_coherence_entreprise()') is null then 'OK (sans objet avant 20261011000009)'
              when (select count(*) from pg_trigger
                     where tgname in ('paiements_en_ligne_coherence_entreprise', 'liens_paiement_coherence_entreprise')) = 2
              then 'OK' else 'À VÉRIFIER' end
  union all
  select 5, 'enregistrer_paiement_en_ligne fermée aux comptes (serveur seulement)',
         case when not has_function_privilege('authenticated', 'public.enregistrer_paiement_en_ligne(text)', 'execute')
               and not has_function_privilege('anon', 'public.enregistrer_paiement_en_ligne(text)', 'execute')
              then 'OK' else 'À VÉRIFIER' end
  union all
  select 6, 'creer_lien_paiement fermée au visiteur anonyme',
         case when not has_function_privilege('anon', 'public.creer_lien_paiement(uuid)', 'execute')
               and has_function_privilege('authenticated', 'public.creer_lien_paiement(uuid)', 'execute')
              then 'OK' else 'À VÉRIFIER' end
) x order by n;
