-- =============================================================================
-- MyKlinTown — L'autorisation de la commune redevient obligatoire
-- =============================================================================
-- Décision du 27/11/2026 (Steploïc), qui revient sur un point de 0027 : seuls
-- des précollecteurs HABILITÉS sont validés, donc visibles des abonnés
-- (annuaire, demandes de devis). C'est la protection juridique de MyKlinTown :
-- ne jamais mettre un précollecteur clandestin à la disposition de ménages ou
-- d'entreprises. Les Mairies n'agissent toujours pas dans l'application (0027) ;
-- elles délivrent l'autorisation, MyKlinTown la vérifie.
--
--   1. Dossier complet = NIU, siège, au moins une commune d'activité,
--      l'autorisation de CHAQUE commune, le permis environnemental.
--   2. Une autorisation ou un permis remplacé sur un dossier validé : nouvelle
--      vérification (comme avant 0027).
--   3. Un dossier validé depuis 0027 sans l'autorisation d'une de ses communes
--      repart « à compléter », avec le motif : il quitte l'annuaire jusqu'au
--      dépôt de la pièce et à une nouvelle validation.
--
-- Mêmes signatures. Additive et rejouable. À jouer APRÈS 20261126000027 ;
-- « OK » sur les lignes 1 à 3 du contrôle.
-- =============================================================================

begin;

-- =============================================================================
-- 0. Migrations préalables
-- =============================================================================
do $$
begin
  if to_regprocedure('public.mairies_actives()') is null then
    raise exception 'Migration à jouer d''abord : 20261126000027_sans_mairie (et les précédentes)'
      using hint = 'Rien n''a été modifié. Contrôle complet : supabase/EMPREINTE_SCHEMA.sql';
  end if;
end $$;

-- =============================================================================
-- 1. Dossier complet : l'autorisation de chaque commune est exigée
-- =============================================================================
create or replace function public.pieces_manquantes(p_entreprise uuid) returns text[]
language sql stable set search_path = public as $$
  select array_remove(array[
    case when coalesce(btrim(e.niu), '') = '' then 'le NIU' end,
    case when coalesce(btrim(e.siege), '') = '' then 'l''adresse du siège social' end,
    case when not exists (select 1 from public.entreprise_communes ec where ec.entreprise_id = e.id)
         then 'au moins une commune d''activité' end,
    case when exists (select 1 from public.entreprise_communes ec
                       where ec.entreprise_id = e.id and ec.autorisation_path is null)
         then 'l''autorisation territoriale de chaque commune' end,
    case when e.permis_env_path is null then 'le permis environnemental' end
  ], null)
  from public.entreprises e
  where e.id = p_entreprise
    and (public.est_membre(e.id) or public.est_admin())
$$;

-- =============================================================================
-- 2. Une pièce d'habilitation remplacée sur un dossier validé : vérification
-- =============================================================================
create or replace function public.enregistrer_piece_dossier(p_piece text, p_chemin text, p_commune uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_ent uuid := public.mon_entreprise();
begin
  if v_ent is null or not public.est_gerant(v_ent) then
    raise exception 'Réservé au gérant de l''entreprise' using errcode = '42501';
  end if;
  if p_piece is null or p_piece not in ('autorisation', 'permis', 'logo') then
    raise exception 'Pièce inconnue : %', coalesce(p_piece, '(vide)');
  end if;
  if public.dossier_entreprise(p_chemin) is distinct from v_ent or p_chemin !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$' then
    raise exception 'Fichier hors du dossier de l''entreprise' using errcode = '42501';
  end if;

  if p_piece = 'autorisation' then
    update public.entreprise_communes set autorisation_path = p_chemin
     where entreprise_id = v_ent and commune_id = p_commune;
    if not found then raise exception 'Ajoutez d''abord cette commune à vos communes d''activité'; end if;
  elsif p_piece = 'permis' then
    update public.entreprises set permis_env_path = p_chemin where id = v_ent;
  else
    update public.entreprises set logo_path = p_chemin where id = v_ent;
  end if;

  if p_piece <> 'logo' then
    update public.entreprises set dossier_statut = 'soumis', dossier_soumis_at = now()
     where id = v_ent and dossier_statut = 'valide';
  end if;
end $$;

-- =============================================================================
-- 3. Dossiers validés sans l'autorisation d'une de leurs communes
-- =============================================================================
-- Possible seulement entre 0027 et cette migration. Le gérant voit le motif
-- sur sa page Dossier ; il dépose la pièce et renvoie son dossier.
do $$
declare v_n int;
begin
  with renvoyes as (
    update public.entreprises e
       set dossier_statut = 'incomplet',
           dossier_motif = 'L''autorisation de la commune est de nouveau exigée pour chaque commune d''activité : déposez-la, puis renvoyez votre dossier.'
     where e.dossier_statut = 'valide'
       and exists (select 1 from public.entreprise_communes ec
                    where ec.entreprise_id = e.id and ec.autorisation_path is null)
    returning 1
  )
  select count(*) into v_n from renvoyes;
  -- Lu par le contrôle ci-dessous (réglage de la session, rien en base).
  perform set_config('mkt.dossiers_renvoyes_0028', v_n::text, false);
end $$;

commit;

-- =============================================================================
-- Contrôle (à lire dans le résultat) : « OK » sur les lignes 1 à 3.
-- =============================================================================
select controle, case when ok then 'OK' else 'À VÉRIFIER' end as resultat, detail
from (
  select 1 as n, 'Autorisation de chaque commune exigée au dossier' as controle,
         pg_get_functiondef('public.pieces_manquantes(uuid)'::regprocedure) like '%autorisation_path is null%' as ok,
         'NIU, siège, une commune d''activité, l''autorisation de chacune, permis environnemental' as detail
  union all
  select 2, 'Autorisation ou permis remplacé : nouvelle vérification',
         pg_get_functiondef('public.enregistrer_piece_dossier(text, text, uuid)'::regprocedure) like '%p_piece <> ''logo''%',
         'le logo seul ne relance rien'
  union all
  select 3, 'Aucun dossier validé sans autorisation',
         not exists (select 1 from public.entreprises e
                      where e.dossier_statut = 'valide'
                        and exists (select 1 from public.entreprise_communes ec
                                     where ec.entreprise_id = e.id and ec.autorisation_path is null)),
         coalesce(nullif(current_setting('mkt.dossiers_renvoyes_0028', true), ''), '0') || ' dossier(s) renvoyé(s) « à compléter » par cette migration'
) x order by n;
