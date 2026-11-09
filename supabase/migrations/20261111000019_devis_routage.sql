-- =============================================================================
-- MyKlinTown — Demandes de devis : elles arrivent à ceux que l'annuaire montre
-- =============================================================================
-- Revue du 09/11/2026. Une demande de devis pouvait n'arriver à AUCUN
-- précollecteur :
--   • la commune était facultative ;
--   • le quartier de la demande était comparé à l'identique aux quartiers que
--     déclarent les précollecteurs (« Nsam » ≠ « Nsam Efoulan »), alors que
--     l'annuaire cherche par « contient » : l'abonné voyait un précollecteur
--     qui ne recevait pas sa demande, sauf à le choisir ;
--   • personne ne voyait les demandes restées sans destinataire.
--
-- Désormais :
--   • UNE règle de quartier, pour l'annuaire comme pour les demandes
--     (`quartier_correspond`) : chaque mot du nom le plus court commence un mot
--     de l'autre. « Nsam » et « Nsam-Efoulan », « Efoulan » et « Nsam Efoulan »
--     se reconnaissent ; « Bi » et « Mvog-Mbi », « Mvog-Mbi » et « Mvog-Ada », non ;
--   • la commune est obligatoire dans une nouvelle demande : elle part au moins
--     aux précollecteurs vérifiés qui y travaillent ;
--   • l'équipe MyKlinTown voit les demandes qu'aucun précollecteur vérifié ne
--     reçoit, et les oriente (commune précisée, ou précollecteur désigné).
--
-- Mêmes signatures et mêmes colonnes qu'en 20261110000018 : l'application et
-- les droits restent inchangés. Aucune donnée modifiée.
--
-- Additive et rejouable. À jouer dans le SQL Editor APRÈS 20261110000018 ; le
-- bloc de contrôle final doit afficher « OK » sur les lignes 1 à 3.
-- =============================================================================

begin;

-- =============================================================================
-- 0. Migrations préalables
-- =============================================================================
do $$
begin
  if to_regclass('public.demandes_devis') is null
     or to_regprocedure('public.cle_quartier(text)') is null
     or to_regprocedure('public.demandes_devis_ouvertes()') is null then
    raise exception 'Migration à jouer d''abord : 20261110000018_devis_tarif_abonne (et les précédentes)'
      using hint = 'Rien n''a été modifié. Contrôle complet : supabase/EMPREINTE_SCHEMA.sql';
  end if;
end $$;

-- =============================================================================
-- 1. Une seule règle de quartier
-- =============================================================================
-- Mots de deux lettres au moins, sans accents ni ponctuation (`cle_quartier`) :
-- vrai si chaque mot du nom le plus court commence un mot de l'autre.
create or replace function public.quartier_correspond(p_a text, p_b text) returns boolean
language sql immutable set search_path = public as $$
  with a as (select t from unnest(string_to_array(public.cle_quartier(p_a), ' ')) t where char_length(t) >= 2),
       b as (select t from unnest(string_to_array(public.cle_quartier(p_b), ' ')) t where char_length(t) >= 2)
  select exists (select 1 from a) and exists (select 1 from b)
     and (not exists (select 1 from b where not exists (select 1 from a where starts_with(a.t, b.t)))
          or not exists (select 1 from a where not exists (select 1 from b where starts_with(b.t, a.t))))
$$;

-- Le précollecteur travaille-t-il là ? Commune d'activité déclarée, ou quartier desservi.
create or replace function public.secteur_couvre(p_entreprise uuid, p_quartiers text[], p_commune uuid, p_quartier text)
returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from public.entreprise_communes ec
                  where ec.entreprise_id = p_entreprise and ec.commune_id = p_commune)
      or exists (select 1 from unnest(coalesce(p_quartiers, '{}')) q where public.quartier_correspond(q, p_quartier))
$$;

-- =============================================================================
-- 2. L'annuaire public (reprise de 20261109000017 : la règle commune)
-- =============================================================================
create or replace function public.annuaire_precollecteurs(p_recherche text)
returns table (id uuid, nom text, devise text, logo_path text)
language sql stable security definer set search_path = public as $$
  with r as (select public.cle_quartier(p_recherche) as cle)
  select e.id, e.nom, e.devise, e.logo_path
    from public.entreprises e, r
   where char_length(coalesce(r.cle, '')) >= 2
     and e.dossier_statut = 'valide'
     and e.statut <> 'suspendu'
     and (exists (select 1 from unnest(e.quartiers) q where public.quartier_correspond(q, p_recherche))
          or exists (select 1 from public.entreprise_communes ec
                       join public.communes c on c.id = ec.commune_id
                      where ec.entreprise_id = e.id and public.cle_quartier(c.nom) = r.cle))
   order by e.nom
   limit 30
$$;

-- =============================================================================
-- 3. Les demandes que reçoit un précollecteur vérifié (reprise de 20261110000018)
-- =============================================================================
create or replace function public.demandes_devis_ouvertes()
returns table (id uuid, categorie text, commune text, quartier text, acces_voie text, gabarit_max text,
               inaccessible_pluies boolean, passages_semaine int, sacs_besoin boolean, sacs_volume_litres int,
               details jsonb, ciblee boolean, created_at timestamptz,
               mon_devis_id uuid, mon_devis_statut text, mon_tarif_fcfa int, mon_facturation_mois int, nb_devis int)
language sql stable security definer set search_path = public as $$
  with moi as (
    select e.id, e.quartiers from public.entreprises e
     where e.id = public.mon_entreprise() and public.est_gerant(e.id)
       and e.dossier_statut = 'valide' and e.statut <> 'suspendu'
  )
  select d.id, d.categorie, c.nom, d.quartier, d.acces_voie, d.gabarit_max, d.inaccessible_pluies,
         d.passages_semaine, d.sacs_besoin, d.sacs_volume_litres, d.details, d.entreprise_cible is not null, d.created_at,
         dv.id, dv.statut, dv.tarif_fcfa, dv.facturation_mois,
         (select count(*)::int from public.devis x where x.demande_id = d.id and x.statut = 'propose')
    from public.demandes_devis d
    cross join moi
    left join public.communes c on c.id = d.commune_id
    left join public.devis dv on dv.demande_id = d.id and dv.entreprise_id = moi.id
   where d.statut in ('en_attente', 'devis_recu')
     and (d.entreprise_cible = moi.id
          or (d.entreprise_cible is null and public.secteur_couvre(moi.id, moi.quartiers, d.commune_id, d.quartier)))
   order by d.created_at
$$;

-- =============================================================================
-- 4. La commune devient obligatoire (reprise de 20261110000018)
-- =============================================================================
create or replace function public.deposer_demande_devis(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_cat text := p ->> 'categorie';
  v_nom text := public.normaliser_nom(left(p ->> 'nom', 120));
  v_tel text := nullif(btrim(coalesce(p ->> 'telephone', '')), '');
  v_wa text := nullif(btrim(coalesce(p ->> 'whatsapp', '')), '');
  v_commune uuid := nullif(p ->> 'commune_id', '')::uuid;
  v_quartier text := public.normaliser_nom(left(p ->> 'quartier', 80));
  v_repere text := nullif(btrim(left(coalesce(p ->> 'repere', ''), 500)), '');
  v_voie text := nullif(p ->> 'acces_voie', '');
  v_gabarit text := nullif(p ->> 'gabarit_max', '');
  v_passages int := nullif(p ->> 'passages_semaine', '')::int;
  v_sacs boolean := coalesce((p ->> 'sacs_besoin')::boolean, false);
  v_volume int := nullif(p ->> 'sacs_volume_litres', '')::int;
  v_lat double precision := nullif(p ->> 'lat', '')::double precision;
  v_lng double precision := nullif(p ->> 'lng', '')::double precision;
  v_cible uuid := nullif(p ->> 'entreprise_cible', '')::uuid;
  v_details jsonb := coalesce(p -> 'details', '{}'::jsonb);
begin
  if auth.uid() is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if exists (select 1 from public.clients where user_id = auth.uid() and statut <> 'resilie') then
    raise exception 'Vous avez déjà un abonnement en cours';
  end if;
  if exists (select 1 from public.demandes_devis where user_id = auth.uid() and statut in ('en_attente', 'devis_recu')) then
    raise exception 'Votre demande est déjà enregistrée : vous serez prévenu dès qu''un devis arrive';
  end if;
  if v_cat is null or v_cat not in ('residentiel', 'commerce', 'entreprise', 'institution') then
    raise exception 'Choisissez le type de lieu à collecter';
  end if;
  if v_nom is null then raise exception 'Indiquez votre nom ou celui de la structure'; end if;
  if v_tel is null then raise exception 'Le téléphone est obligatoire'; end if;
  if v_commune is null then
    raise exception 'Choisissez votre arrondissement (commune) : la demande part aux précollecteurs qui y travaillent';
  end if;
  if v_quartier is null then raise exception 'Indiquez votre quartier'; end if;
  if v_repere is null then raise exception 'Indiquez un repère précis (carrefour, bâtiment, couleur du portail…)'; end if;
  if v_passages is null or v_passages not between 1 and 7 then raise exception 'Choisissez la fréquence de ramassage'; end if;
  if v_sacs and (v_volume is null or v_volume not between 1 and 1000) then
    raise exception 'Indiquez le volume des sacs poubelles souhaités';
  end if;
  if v_voie is not null and v_voie not in ('goudronnee', 'non_bitumee', 'piste_etroite', 'pente_raide') then
    raise exception 'Type de voie inconnu';
  end if;
  if v_gabarit is not null and v_gabarit not in ('camion', 'camionnette', 'tricycle', 'brouette') then
    raise exception 'Gabarit de véhicule inconnu';
  end if;
  if jsonb_typeof(v_details) <> 'object' or pg_column_size(v_details) > 4000 then
    raise exception 'Réponses illisibles';
  end if;
  if (v_lat is null) <> (v_lng is null)
     or (v_lat is not null and (v_lat not between -90 and 90 or v_lng not between -180 and 180)) then
    raise exception 'Position illisible';
  end if;
  if not exists (select 1 from public.communes where id = v_commune) then
    raise exception 'Commune inconnue';
  end if;
  if v_cible is not null and not exists (select 1 from public.entreprises
                                          where id = v_cible and dossier_statut = 'valide' and statut <> 'suspendu') then
    raise exception 'Ce précollecteur ne reçoit pas encore de demandes';
  end if;

  insert into public.demandes_devis (
    user_id, categorie, nom, telephone, whatsapp, commune_id, quartier, repere, acces_voie, gabarit_max,
    inaccessible_pluies, passages_semaine, sacs_besoin, sacs_volume_litres, details, lat, lng, position_sur_place,
    entreprise_cible)
  values (
    auth.uid(), v_cat, v_nom, v_tel, v_wa, v_commune, v_quartier, v_repere, v_voie, v_gabarit,
    coalesce((p ->> 'inaccessible_pluies')::boolean, false), v_passages, v_sacs, case when v_sacs then v_volume end,
    v_details, v_lat, v_lng, v_lat is not null and coalesce((p ->> 'position_sur_place')::boolean, false),
    v_cible)
  returning id into v_id;
  return v_id;
end $$;

-- =============================================================================
-- 5. Les demandes que personne ne reçoit : l'équipe MyKlinTown les oriente
-- =============================================================================
-- En attente, et aucun précollecteur vérifié ne la reçoit : ni celui que
-- l'abonné a choisi (dossier repassé en vérification, compte suspendu), ni
-- ceux de sa commune ou de son quartier. `precollecteurs_secteur` compte ceux
-- qui y travaillent sans être encore vérifiés : valider leur dossier suffit.
create or replace function public.demandes_devis_a_orienter()
returns table (id uuid, created_at timestamptz, categorie text, nom text, telephone text, whatsapp text,
               commune_id uuid, commune text, quartier text, repere text, passages_semaine int,
               cible text, precollecteurs_secteur int)
language sql stable security definer set search_path = public as $$
  select d.id, d.created_at, d.categorie, d.nom, d.telephone, d.whatsapp, d.commune_id, c.nom, d.quartier, d.repere,
         d.passages_semaine, t.nom,
         (select count(*)::int from public.entreprises e
           where e.statut <> 'suspendu' and public.secteur_couvre(e.id, e.quartiers, d.commune_id, d.quartier))
    from public.demandes_devis d
    left join public.communes c on c.id = d.commune_id
    left join public.entreprises t on t.id = d.entreprise_cible
   where public.est_admin()
     and d.statut = 'en_attente'
     and not exists (
       select 1 from public.entreprises e
        where e.dossier_statut = 'valide' and e.statut <> 'suspendu'
          and (d.entreprise_cible = e.id
               or (d.entreprise_cible is null and public.secteur_couvre(e.id, e.quartiers, d.commune_id, d.quartier))))
   order by d.created_at
$$;

-- Préciser la commune (la demande part alors à ses précollecteurs vérifiés), ou
-- désigner un précollecteur vérifié. Un choix devenu caduc (dossier repassé en
-- vérification, compte suspendu) est oublié quand on précise la commune.
create or replace function public.orienter_demande_devis(p_demande uuid, p_commune uuid default null, p_entreprise uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''équipe MyKlinTown' using errcode = '42501';
  end if;
  if p_commune is null and p_entreprise is null then
    raise exception 'Choisissez la commune de la demande, ou un précollecteur vérifié';
  end if;
  if p_commune is not null and not exists (select 1 from public.communes where id = p_commune) then
    raise exception 'Commune inconnue';
  end if;
  if p_entreprise is not null and not exists (select 1 from public.entreprises
                                                where id = p_entreprise and dossier_statut = 'valide' and statut <> 'suspendu') then
    raise exception 'Ce précollecteur ne reçoit pas de demandes : son dossier n''est pas vérifié';
  end if;
  update public.demandes_devis d
     set commune_id = coalesce(p_commune, d.commune_id),
         entreprise_cible = case
           when p_entreprise is not null then p_entreprise
           when exists (select 1 from public.entreprises t
                         where t.id = d.entreprise_cible and t.dossier_statut = 'valide' and t.statut <> 'suspendu')
             then d.entreprise_cible
           else null end
   where d.id = p_demande and d.statut in ('en_attente', 'devis_recu');
  if not found then raise exception 'Cette demande n''est plus ouverte'; end if;
end $$;

-- =============================================================================
-- 6. Droits
-- =============================================================================
-- Règles internes : appelées par les fonctions ci-dessus seulement.
revoke all on function public.quartier_correspond(text, text) from public, anon, authenticated;
revoke all on function public.secteur_couvre(uuid, text[], uuid, text) from public, anon, authenticated;

revoke all on function public.demandes_devis_a_orienter() from public, anon;
revoke all on function public.orienter_demande_devis(uuid, uuid, uuid) from public, anon;
grant execute on function public.demandes_devis_a_orienter() to authenticated;
grant execute on function public.orienter_demande_devis(uuid, uuid, uuid) to authenticated;

-- Fonctions reprises : droits rappelés à l'identique.
revoke all on function public.annuaire_precollecteurs(text) from public;
grant execute on function public.annuaire_precollecteurs(text) to anon, authenticated;
revoke all on function public.demandes_devis_ouvertes() from public, anon;
grant execute on function public.demandes_devis_ouvertes() to authenticated;
revoke all on function public.deposer_demande_devis(jsonb) from public, anon;
grant execute on function public.deposer_demande_devis(jsonb) to authenticated;

commit;

-- =============================================================================
-- Contrôle (à lire dans le résultat) : « OK » sur les lignes 1 à 3. Les lignes
-- 4 et 5 comptent ce que l'équipe doit orienter (tableau de bord → Précollecteurs).
-- =============================================================================
select controle, case when ok then 'OK' else 'À VÉRIFIER' end as resultat, detail
from (
  select 1 as n, 'Une seule règle de quartier, pour l''annuaire et pour les demandes' as controle,
         public.quartier_correspond('Nsam Efoulan', 'Nsam') and public.quartier_correspond('Nsam', 'Nsam-Efoulan')
         and public.quartier_correspond('Biyem-Assi', 'biyem assi') and not public.quartier_correspond('Mvog-Mbi', 'Bi')
         and not public.quartier_correspond('Mvog-Mbi', 'Mvog-Ada') as ok,
         '« Nsam » et « Nsam-Efoulan » : oui ; « Mvog-Mbi » et « Mvog-Ada » : non' as detail
  union all
  select 2, 'Commune obligatoire dans une nouvelle demande',
         (select p.prosrc like '%v_commune is null then%' from pg_proc p where p.oid = 'public.deposer_demande_devis(jsonb)'::regprocedure),
         'deposer_demande_devis refuse une demande sans commune'
  union all
  select 3, 'Demandes à orienter : équipe MyKlinTown seulement ; annuaire toujours public',
         not has_function_privilege('anon', 'public.demandes_devis_a_orienter()', 'execute')
         and not has_function_privilege('anon', 'public.orienter_demande_devis(uuid, uuid, uuid)', 'execute')
         and has_function_privilege('authenticated', 'public.orienter_demande_devis(uuid, uuid, uuid)', 'execute')
         and not has_function_privilege('authenticated', 'public.secteur_couvre(uuid, text[], uuid, text)', 'execute')
         and not has_function_privilege('anon', 'public.quartier_correspond(text, text)', 'execute')
         and has_function_privilege('anon', 'public.annuaire_precollecteurs(text)', 'execute'),
         'le contrôle d''administrateur est fait dans chaque fonction'
  union all
  select 4, 'Demandes ouvertes sans commune (à préciser)', true,
         (select count(*) || ' demande(s)' from public.demandes_devis
           where statut in ('en_attente', 'devis_recu') and commune_id is null)
  union all
  select 5, 'Demandes qu''aucun précollecteur vérifié ne reçoit (à orienter)', true,
         (select count(*) || ' demande(s)' from public.demandes_devis d
           where d.statut = 'en_attente'
             and not exists (select 1 from public.entreprises e
                              where e.dossier_statut = 'valide' and e.statut <> 'suspendu'
                                and (d.entreprise_cible = e.id
                                     or (d.entreprise_cible is null
                                         and public.secteur_couvre(e.id, e.quartiers, d.commune_id, d.quartier)))))
) x order by n;
