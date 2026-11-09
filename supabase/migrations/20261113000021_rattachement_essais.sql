-- =============================================================================
-- MyKlinTown — Rattachement d'un compte à sa fiche : essais limités et tracés
-- =============================================================================
-- Revue du 09/11/2026. Un abonné déjà servi retrouve sa fiche avec le code de
-- son étiquette (MKT-…) et le téléphone donné à son précollecteur. Le nombre
-- d'essais n'était pas limité.
--
-- Désormais :
--   • chaque essai est tracé (`rattachements_essais`) ; le gérant voit, sur la
--     fiche de son client, les essais refusés sur son code ; l'équipe
--     MyKlinTown voit tout ;
--   • 5 échecs en 24 h pour un compte, ou 10 pour un même code (tous comptes
--     confondus) : le rattachement est suspendu pour 24 h ;
--   • un échec ne lève plus d'erreur : la fonction renvoie NULL, pour que sa
--     trace reste (une erreur annulerait l'écriture). L'application affiche le
--     même message qu'avant, « Code ou téléphone incorrect ».
--
-- Même signature. Additive et rejouable. À jouer APRÈS 20261112000020 ; « OK »
-- sur les lignes 1 à 3 du contrôle.
-- =============================================================================

begin;

-- =============================================================================
-- 0. Migrations préalables
-- =============================================================================
do $$
begin
  if to_regclass('public.factures_une_emise_par_client') is null then
    raise exception 'Migration à jouer d''abord : 20261112000020_facturation_plafond_unicite (et les précédentes)'
      using hint = 'Rien n''a été modifié. Contrôle complet : supabase/EMPREINTE_SCHEMA.sql';
  end if;
end $$;

-- =============================================================================
-- 1. Trace des essais
-- =============================================================================
create table if not exists public.rattachements_essais (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  code text not null check (char_length(code) <= 40),
  reussi boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists rattachements_essais_compte_idx on public.rattachements_essais (user_id, created_at);
create index if not exists rattachements_essais_code_idx on public.rattachements_essais (code, created_at);

-- Lecture : l'équipe MyKlinTown ; le gérant, pour les codes de SES clients.
-- Aucune écriture directe : seule `rattacher_mon_compte` écrit.
alter table public.rattachements_essais enable row level security;
drop policy if exists rattachements_essais_lecture on public.rattachements_essais;
create policy rattachements_essais_lecture on public.rattachements_essais for select to authenticated
  using (public.est_admin()
         or exists (select 1 from public.clients c
                     where c.code = rattachements_essais.code and public.est_gerant(c.entreprise_id)));
revoke all on public.rattachements_essais from anon;

-- =============================================================================
-- 2. Rattachement : essais limités (reprise de 20260928000005)
-- =============================================================================
create or replace function public.rattacher_mon_compte(p_code text, p_telephone text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id    uuid;
  v_tel   text;
  v_code  text := left(upper(btrim(coalesce(p_code, ''))), 40);
  v_saisi text := right(regexp_replace(coalesce(p_telephone, ''), '\D', '', 'g'), 9);
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;

  if exists (select 1 from public.clients where user_id = auth.uid() and statut <> 'resilie') then
    raise exception 'Votre compte est déjà rattaché à un abonnement';
  end if;

  -- 5 échecs en 24 h pour ce compte, 10 pour ce code (tous comptes confondus).
  if (select count(*) from public.rattachements_essais
       where user_id = auth.uid() and not reussi and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Trop d''essais : réessayez demain, ou demandez à votre précollecteur de vérifier votre code et votre téléphone';
  end if;
  if (select count(*) from public.rattachements_essais
       where code = v_code and not reussi and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'Trop d''essais sur ce code : réessayez demain, ou demandez à votre précollecteur';
  end if;

  select id, right(regexp_replace(coalesce(telephone, ''), '\D', '', 'g'), 9)
    into v_id, v_tel
  from public.clients
  where code = v_code and user_id is null and statut <> 'resilie';

  -- Même réponse pour « code inconnu » et « téléphone faux » : on ne confirme
  -- pas l'existence d'un code à qui ne connaît pas le téléphone. NULL plutôt
  -- qu'une erreur : la trace de l'essai doit rester.
  if v_id is null or length(v_saisi) < 9 or v_tel is distinct from v_saisi then
    insert into public.rattachements_essais (user_id, code) values (auth.uid(), v_code);
    return null;
  end if;

  update public.clients
     set user_id = auth.uid(),
         email = coalesce(email, (select email from public.profiles where id = auth.uid()))
   where id = v_id;
  insert into public.rattachements_essais (user_id, code, reussi) values (auth.uid(), v_code, true);
  return v_id;
end $$;

revoke all on function public.rattacher_mon_compte(text, text) from public, anon;
grant execute on function public.rattacher_mon_compte(text, text) to authenticated;

commit;

-- =============================================================================
-- Contrôle (à lire dans le résultat) : « OK » sur les lignes 1 à 3.
-- =============================================================================
select controle, case when ok then 'OK' else 'À VÉRIFIER' end as resultat, detail
from (
  select 1 as n, 'Essais de rattachement tracés, sans écriture directe' as controle,
         (select relrowsecurity from pg_class where oid = 'public.rattachements_essais'::regclass)
         and not exists (select 1 from pg_policies where schemaname = 'public'
                          and tablename = 'rattachements_essais' and cmd <> 'SELECT') as ok,
         'lecture : équipe MyKlinTown, et gérant pour les codes de ses clients' as detail
  union all
  select 2, 'Essais limités : 5 échecs par compte, 10 par code, sur 24 h',
         (select p.prosrc like '%interval ''24 hours''%' and p.prosrc like '%>= 5%' and p.prosrc like '%>= 10%'
            from pg_proc p where p.oid = 'public.rattacher_mon_compte(text, text)'::regprocedure),
         'au-delà : rattachement suspendu 24 h'
  union all
  select 3, 'Rattachement réservé aux comptes connectés',
         not has_function_privilege('anon', 'public.rattacher_mon_compte(text, text)', 'execute')
         and has_function_privilege('authenticated', 'public.rattacher_mon_compte(text, text)', 'execute'),
         'un échec renvoie NULL (tracé) ; l''application affiche « Code ou téléphone incorrect »'
) x order by n;
