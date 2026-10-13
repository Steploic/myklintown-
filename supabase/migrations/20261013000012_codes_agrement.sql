-- =============================================================================
-- MyKlinTown — Code d'agrément des précollecteurs (retours de l'équipe, 13/10/2026)
-- =============================================================================
-- Exercer dans une collectivité demande l'autorisation de la Mairie. Jusqu'ici,
-- n'importe qui pouvait créer un espace précollecteur (il restait invisible des
-- ménages tant que la Mairie ne lui confiait pas de zone, mais il existait).
--
-- Désormais : la Mairie (ou un administrateur MyKlinTown) délivre un CODE
-- D'AGRÉMENT à usage unique, valable 30 jours ; le précollecteur le saisit à
-- « Créer mon espace ». Sans code valide, pas d'espace.
--
--   • les entreprises existantes ne sont pas touchées ;
--   • un administrateur crée un espace sans code (dépannage, démonstration) ;
--   • un code se révoque tant qu'il n'a pas servi ;
--   • le message de refus est le même que le code soit inconnu, expiré, révoqué
--     ou déjà utilisé : il ne renseigne pas un curieux.
--
-- ⚠️ Ordre de mise en production : cette migration AVANT le déploiement du code
-- (l'application envoie `p_code`). Entre les deux, une nouvelle inscription de
-- précollecteur est refusée faute de code : c'est le comportement voulu.
--
-- Script ADDITIF et IDEMPOTENT.
-- =============================================================================

create table if not exists public.codes_agrement (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  -- À qui la Mairie le remet (nom de la personne ou de l'entreprise prévue).
  destinataire text not null check (char_length(destinataire) between 2 and 120),
  telephone text check (char_length(telephone) <= 30),
  commune_id uuid references public.communes(id) on delete set null,
  cree_par uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  expire_at timestamptz not null default now() + interval '30 days',
  revoque_at timestamptz,
  utilise_at timestamptz,
  utilise_par uuid references public.profiles(id) on delete set null,
  entreprise_id uuid references public.entreprises(id) on delete set null
);
create index if not exists codes_agrement_created_idx on public.codes_agrement (created_at desc);

-- Lecture : la Mairie et les administrateurs. Écriture : par les fonctions seulement.
alter table public.codes_agrement enable row level security;
drop policy if exists codes_agrement_lecture on public.codes_agrement;
create policy codes_agrement_lecture on public.codes_agrement for select to authenticated
  using (public.est_superviseur());
revoke all on public.codes_agrement from anon;
revoke insert, update, delete, truncate on public.codes_agrement from authenticated;

-- La Mairie délivre un code (10 caractères de Crockford, ≈ 50 bits).
create or replace function public.creer_code_agrement(
  p_destinataire text, p_telephone text default null, p_commune uuid default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  if not public.est_superviseur() then
    raise exception 'Réservé à la Mairie' using errcode = '42501';
  end if;
  if char_length(coalesce(trim(p_destinataire), '')) < 2 then
    raise exception 'Indiquez à qui ce code est destiné';
  end if;
  loop
    v_code := public.nouveau_code_invitation();
    exit when not exists (select 1 from public.codes_agrement where code = v_code);
  end loop;
  insert into public.codes_agrement (code, destinataire, telephone, commune_id)
  values (v_code, left(trim(p_destinataire), 120), nullif(left(trim(coalesce(p_telephone, '')), 30), ''), p_commune);
  return v_code;
end $$;

-- Un code pas encore utilisé peut être retiré.
create or replace function public.revoquer_code_agrement(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_superviseur() then
    raise exception 'Réservé à la Mairie' using errcode = '42501';
  end if;
  update public.codes_agrement set revoque_at = now()
   where id = p_id and utilise_at is null and revoque_at is null;
  if not found then raise exception 'Code introuvable, déjà utilisé ou déjà révoqué'; end if;
end $$;

-- Création de l'espace : le code devient obligatoire (sauf administrateur).
-- L'ancienne signature est retirée : deux versions rendraient l'appel ambigu.
drop function if exists public.creer_mon_entreprise(text, text, text, uuid);

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
          coalesce(p_commune, v_agrement.commune_id), auth.uid())
  returning id into v_id;

  insert into public.entreprise_membres (entreprise_id, user_id, role_membre)
  values (v_id, auth.uid(), 'gerant');

  if v_agrement.id is not null then
    update public.codes_agrement set utilise_at = now(), utilise_par = auth.uid(), entreprise_id = v_id
     where id = v_agrement.id;
  end if;
  return v_id;
end $$;

revoke all on function public.creer_code_agrement(text, text, uuid) from public, anon;
revoke all on function public.revoquer_code_agrement(uuid) from public, anon;
revoke all on function public.creer_mon_entreprise(text, text, text, uuid, text) from public, anon;
grant execute on function public.creer_code_agrement(text, text, uuid) to authenticated;
grant execute on function public.revoquer_code_agrement(uuid) to authenticated;
grant execute on function public.creer_mon_entreprise(text, text, text, uuid, text) to authenticated;

-- =============================================================================
-- Contrôle final
-- =============================================================================
select 'codes d''agrément protégés (RLS)' as controle, relrowsecurity as ok
  from pg_class where oid = 'public.codes_agrement'::regclass
union all
select 'une seule version de « créer mon entreprise »',
       (select count(*) = 1 from pg_proc where proname = 'creer_mon_entreprise' and pronamespace = 'public'::regnamespace)
union all
select 'fonctions fermées aux visiteurs',
       not has_function_privilege('anon', 'public.creer_code_agrement(text, text, uuid)', 'execute')
       and not has_function_privilege('anon', 'public.creer_mon_entreprise(text, text, text, uuid, text)', 'execute');
