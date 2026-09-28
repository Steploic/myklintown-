-- =============================================================================
-- MyKlinTown — Rattachement d'un compte ménage à sa fiche client
-- =============================================================================
-- Un précollecteur enregistre ses clients existants et leur remet une étiquette
-- portant un code « MKT-XXXXXXXX ». Le ménage qui crée ensuite son compte doit
-- pouvoir retrouver SA fiche, sans attendre que la Mairie ait tracé les zones.
--
-- Preuve demandée : le code (8 caractères hexadécimaux, ~4 milliards de
-- possibilités) ET le téléphone enregistré par le précollecteur (9 derniers
-- chiffres). Une fiche déjà rattachée ne peut pas l'être une seconde fois.
--
-- Script ADDITIF et IDEMPOTENT.
-- =============================================================================

create or replace function public.rattacher_mon_compte(p_code text, p_telephone text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_tel  text;
  v_saisi text := right(regexp_replace(coalesce(p_telephone, ''), '\D', '', 'g'), 9);
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;

  if exists (select 1 from public.clients where user_id = auth.uid() and statut <> 'resilie') then
    raise exception 'Votre compte est déjà rattaché à un abonnement';
  end if;

  select id, right(regexp_replace(coalesce(telephone, ''), '\D', '', 'g'), 9)
    into v_id, v_tel
  from public.clients
  where code = upper(trim(p_code)) and user_id is null and statut <> 'resilie';

  -- Même message pour « code inconnu » et « téléphone faux » : on ne confirme
  -- pas l'existence d'un code à qui ne connaît pas le téléphone.
  if v_id is null or length(v_saisi) < 9 or v_tel is distinct from v_saisi then
    raise exception 'Code ou téléphone incorrect. Vérifiez votre étiquette, ou demandez à votre précollecteur.';
  end if;

  update public.clients
     set user_id = auth.uid(),
         email = coalesce(email, (select email from public.profiles where id = auth.uid()))
   where id = v_id;
  return v_id;
end $$;

revoke all on function public.rattacher_mon_compte(text, text) from public, anon;
grant execute on function public.rattacher_mon_compte(text, text) to authenticated;
