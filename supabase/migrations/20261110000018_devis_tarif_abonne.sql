-- =============================================================================
-- MyKlinTown — Demande de devis et tarif convenu avec chaque abonné
-- =============================================================================
-- Retours de l'équipe du 08/11/2026 (docs/reunions/MyKlinTown_Corrections_
-- Propositions.pdf § 1.3 et § 2 ; fiche « Formulaires de devis » ; messages) :
--
--   • plus de grille tarifaire commune : « le devis se fait par client et
--     généralement au cas par cas ». Le tarif est fixé à l'inscription de
--     l'abonné par le précollecteur, ou proposé en réponse à une demande ;
--   • l'abonné « demande un devis » : catégorie (domicile, commerce,
--     entreprise, institution), tronc commun (contact, quartier, repère exact,
--     accès), fréquence de ramassage, sacs poubelles et volume, questions
--     propres à sa catégorie, position GPS seulement s'il est sur place ;
--   • les précollecteurs VÉRIFIÉS de sa commune ou de son quartier (ou celui
--     qu'il a choisi dans l'annuaire) lui proposent un tarif ; il accepte l'un
--     d'eux et devient son client, à ce tarif ;
--   • liste d'attente jusqu'au lancement officiel : les demandes se déposent
--     dès maintenant, les devis ne s'ouvrent qu'avec l'interrupteur
--     `devis_ouverts` (paramètre de la plateforme, 0 → 1 au lancement).
--
-- Les abonnés existants gardent exactement leurs montants : leur tarif est
-- repris de leur ancienne formule. Les demandes d'abonnement encore en
-- attente sont reprises comme demandes de devis.
--
-- Additive et rejouable. À jouer dans le SQL Editor APRÈS 20261109000017 ; le
-- bloc de contrôle final doit afficher « OK » partout.
-- =============================================================================

begin;

-- =============================================================================
-- 0. Migrations préalables
-- =============================================================================
-- Sans elles, la migration échouerait sur une colonne absente (« column
-- e.devise does not exist »). Arrêt avant toute modification, en nommant ce
-- qu'il faut jouer d'abord. Contrôle : supabase/DIAGNOSTIC_MIGRATIONS.sql.
do $$
declare v_manque text[] := '{}';
begin
  if to_regprocedure('public.parametre_entier(text, integer)') is null
     or to_regprocedure('public.consigne_terrain_calculee(text, numeric, numeric)') is null then
    v_manque := v_manque || '20261019000013_delai_grace_blocage'::text;
  end if;
  if to_regclass('public.documents_legaux') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'entreprises' and column_name = 'niu') then
    v_manque := v_manque || '20261019000014_charte_facture_conforme'::text;
  end if;
  if to_regclass('public.entreprise_communes') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'entreprises' and column_name = 'devise')
     or to_regprocedure('public.cle_quartier(text)') is null then
    v_manque := v_manque || '20261109000017_dossier_precollecteur_annuaire'::text;
  end if;
  if cardinality(v_manque) > 0 then
    raise exception 'Migrations à jouer d''abord, dans l''ordre : %', array_to_string(v_manque, ', ')
      using hint = 'Rien n''a été modifié. Liste complète : supabase/DIAGNOSTIC_MIGRATIONS.sql';
  end if;
end $$;

-- =============================================================================
-- 1. Tarif convenu avec chaque abonné
-- =============================================================================
-- `tarif_fcfa` est le montant de CHAQUE facture, qui couvre `facturation_mois`
-- mois : 3 500 FCFA pour 1 mois, ou 9 500 FCFA pour 3 mois.
alter table public.clients
  add column if not exists tarif_fcfa int,
  add column if not exists facturation_mois int not null default 1,
  add column if not exists passages_semaine int,
  add column if not exists sacs_inclus boolean not null default false,
  add column if not exists sacs_volume_litres int;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_tarif_valide') then
    alter table public.clients add constraint clients_tarif_valide check (
      (tarif_fcfa is null or tarif_fcfa between 0 and 10000000)
      and facturation_mois between 1 and 12
      and (passages_semaine is null or passages_semaine between 1 and 7)
      and (sacs_volume_litres is null or sacs_volume_litres between 1 and 1000));
  end if;
end $$;

comment on column public.clients.tarif_fcfa is
  'Montant de chaque facture, convenu avec l''abonné (devis) ; couvre facturation_mois mois. Remplace le prix de la grille.';

-- Abonnés existants : leur formule devient leur tarif, à l'identique.
update public.clients c
   set tarif_fcfa = p.prix_fcfa,
       facturation_mois = p.duree_mois,
       passages_semaine = coalesce(c.passages_semaine, p.passages_semaine)
  from public.plans_tarifaires p
 where p.id = c.plan_id
   and c.tarif_fcfa is null;

-- =============================================================================
-- 2. La vue des fiches : le prix affiché est le tarif de l'abonné
-- =============================================================================
-- `c.*` y est figé à la création de la vue : pour y faire entrer les nouvelles
-- colonnes, on la recrée. Aucune autre vue n'en dépend ; les fonctions qui la
-- lisent (20261005000007, 20261012000010) la retrouvent par son nom.
-- `plan_prix` et `plan_duree_mois` gardent leur nom (l'application les lit),
-- mais viennent désormais du tarif de l'abonné.
drop view if exists public.v_clients_statut;
create view public.v_clients_statut with (security_invoker = true) as
select
  c.*,
  p.nom as plan_nom,
  coalesce(c.tarif_fcfa, p.prix_fcfa) as plan_prix,
  coalesce(c.facturation_mois, p.duree_mois) as plan_duree_mois,
  z.nom as zone_nom,
  cov.couverture_fin,
  coalesce(imp.nb_impayees, 0) as nb_impayees,
  coalesce(imp.montant_impaye, 0) as montant_impaye,
  imp.plus_ancienne_echeance,
  st.statut_abonnement,
  cov.couverture_fin + prm.grace as fin_grace,
  coalesce(imp.montant_a_valider, 0) as montant_a_valider,
  public.consigne_terrain_calculee(st.statut_abonnement, imp.montant_impaye, imp.montant_a_valider) as consigne_terrain
from public.clients c
cross join lateral (
  select public.jour_douala() as jour,
         public.parametre_entier('delai_grace_jours', 7) as grace,
         public.parametre_entier('rappel_echeance_jours', 7) as rappel
) prm
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
         count(*) filter (where f.echeance < prm.jour) as nb_retard,
         sum((select coalesce(sum(pc.montant_fcfa), 0) from public.paiements_clients pc
               where pc.facture_id = f.id and pc.statut = 'a_valider')) as montant_a_valider
  from public.factures f where f.client_id = c.id and f.statut = 'emise'
) imp on true
cross join lateral (
  select public.statut_abonnement_calcule(c.statut, imp.nb_retard, cov.couverture_fin, prm.jour, prm.grace, prm.rappel) as statut_abonnement
) st;

-- =============================================================================
-- 3. Liste d'attente jusqu'au lancement : l'interrupteur des devis
-- =============================================================================
insert into public.parametres_plateforme (cle, valeur, description) values
  ('devis_ouverts', '0',
   'Les précollecteurs vérifiés peuvent répondre aux demandes de devis (1) ; sinon les demandes attendent le lancement officiel (0).')
on conflict (cle) do nothing;

-- =============================================================================
-- 4. Demandes de devis
-- =============================================================================
create table if not exists public.demandes_devis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  categorie text not null check (categorie in ('residentiel', 'commerce', 'entreprise', 'institution')),
  -- Tronc commun
  nom text not null check (char_length(nom) <= 120),
  telephone text not null check (char_length(telephone) <= 30),
  whatsapp text check (char_length(whatsapp) <= 30),
  commune_id uuid references public.communes(id) on delete set null,
  quartier text not null check (char_length(quartier) <= 80),
  repere text not null check (char_length(repere) <= 500),
  acces_voie text check (acces_voie in ('goudronnee', 'non_bitumee', 'piste_etroite', 'pente_raide')),
  gabarit_max text check (gabarit_max in ('camion', 'camionnette', 'tricycle', 'brouette')),
  inaccessible_pluies boolean not null default false,
  passages_semaine int not null check (passages_semaine between 1 and 7),
  sacs_besoin boolean not null default false,
  sacs_volume_litres int check (sacs_volume_litres between 1 and 1000),
  -- Réponses propres à la catégorie (fiche « Formulaires de devis »).
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  -- Position enregistrée seulement depuis le lieu de collecte.
  lat double precision,
  lng double precision,
  position_sur_place boolean not null default false,
  -- Précollecteur choisi dans l'annuaire ; vide = ceux de la commune ou du quartier.
  entreprise_cible uuid references public.entreprises(id) on delete set null,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'devis_recu', 'acceptee', 'annulee')),
  entreprise_id uuid references public.entreprises(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists demandes_devis_une_ouverte
  on public.demandes_devis (user_id) where statut in ('en_attente', 'devis_recu');
create index if not exists demandes_devis_commune_idx on public.demandes_devis (commune_id) where statut in ('en_attente', 'devis_recu');

drop trigger if exists demandes_devis_updated_at on public.demandes_devis;
create trigger demandes_devis_updated_at before update on public.demandes_devis
  for each row execute function public.set_updated_at();

-- L'abonné voit SA demande ; les précollecteurs passent par une fonction qui
-- masque son identité. Aucune écriture directe : seules les fonctions écrivent.
alter table public.demandes_devis enable row level security;
drop policy if exists demandes_devis_lecture on public.demandes_devis;
create policy demandes_devis_lecture on public.demandes_devis for select to authenticated
  using (user_id = auth.uid() or public.est_admin());

-- =============================================================================
-- 5. Devis : la proposition d'un précollecteur
-- =============================================================================
create table if not exists public.devis (
  id uuid primary key default gen_random_uuid(),
  demande_id uuid not null references public.demandes_devis(id) on delete cascade,
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  tarif_fcfa int not null check (tarif_fcfa between 0 and 10000000),
  facturation_mois int not null default 1 check (facturation_mois between 1 and 12),
  passages_semaine int not null check (passages_semaine between 1 and 7),
  sacs_inclus boolean not null default false,
  sacs_volume_litres int check (sacs_volume_litres between 1 and 1000),
  note text check (char_length(note) <= 500),
  statut text not null default 'propose' check (statut in ('propose', 'accepte', 'refuse', 'retire', 'caduc')),
  propose_par uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  repondu_at timestamptz,
  unique (demande_id, entreprise_id)
);
create index if not exists devis_entreprise_idx on public.devis (entreprise_id);

-- Lecture : l'équipe du précollecteur (ses devis), l'abonné (ceux de sa
-- demande), l'administrateur. Aucune écriture directe.
alter table public.devis enable row level security;
drop policy if exists devis_lecture on public.devis;
create policy devis_lecture on public.devis for select to authenticated
  using (public.est_membre(entreprise_id)
         or exists (select 1 from public.demandes_devis d where d.id = demande_id and d.user_id = auth.uid())
         or public.est_admin());

-- =============================================================================
-- 6. L'abonné dépose sa demande
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
  if v_commune is not null and not exists (select 1 from public.communes where id = v_commune) then
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

create or replace function public.annuler_demande_devis() returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  update public.demandes_devis set statut = 'annulee'
   where user_id = auth.uid() and statut in ('en_attente', 'devis_recu')
  returning id into v_id;
  if v_id is null then raise exception 'Aucune demande en cours'; end if;
  update public.devis set statut = 'caduc', repondu_at = now() where demande_id = v_id and statut = 'propose';
end $$;

-- Les devis reçus par l'abonné, avec la vitrine du précollecteur (nom, logo,
-- devise) : il n'est pas encore son client, il ne lit pas sa fiche.
create or replace function public.mes_devis()
returns table (devis_id uuid, statut text, tarif_fcfa int, facturation_mois int, passages_semaine int,
               sacs_inclus boolean, sacs_volume_litres int, note text, created_at timestamptz,
               entreprise_nom text, entreprise_devise text, entreprise_logo text)
language sql stable security definer set search_path = public as $$
  select v.id, v.statut, v.tarif_fcfa, v.facturation_mois, v.passages_semaine, v.sacs_inclus, v.sacs_volume_litres,
         v.note, v.created_at, e.nom, e.devise, e.logo_path
    from public.devis v
    join public.demandes_devis d on d.id = v.demande_id
    join public.entreprises e on e.id = v.entreprise_id
   where d.user_id = auth.uid()
     and d.statut in ('en_attente', 'devis_recu')
     and v.statut in ('propose', 'refuse')
   order by v.tarif_fcfa, v.created_at
$$;

-- =============================================================================
-- 7. Les précollecteurs vérifiés voient les demandes de leur secteur
-- =============================================================================
-- Commune déclarée (entreprise_communes) ou quartier desservi ; ou la demande
-- qui les a choisis dans l'annuaire. Identité de l'abonné MASQUÉE (ni nom,
-- ni téléphone, ni repère, ni position) jusqu'à ce qu'il accepte un devis.
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
          or (d.entreprise_cible is null
              and (exists (select 1 from public.entreprise_communes ec
                            where ec.entreprise_id = moi.id and ec.commune_id = d.commune_id)
                   or exists (select 1 from unnest(moi.quartiers) q
                               where public.cle_quartier(q) = public.cle_quartier(d.quartier)))))
   order by d.created_at
$$;

create or replace function public.proposer_devis(
  p_demande uuid, p_tarif int, p_facturation_mois int, p_passages int,
  p_sacs boolean default false, p_volume int default null, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ent uuid := public.mon_entreprise();
  v_id uuid;
begin
  if v_ent is null or not public.est_gerant(v_ent) then
    raise exception 'Réservé au gérant de l''entreprise' using errcode = '42501';
  end if;
  if not exists (select 1 from public.entreprises where id = v_ent and dossier_statut = 'valide' and statut <> 'suspendu') then
    raise exception 'Votre dossier doit être vérifié par MyKlinTown avant de proposer un devis';
  end if;
  if public.parametre_entier('devis_ouverts', 0) <> 1 then
    raise exception 'Les devis s''ouvrent au lancement officiel : la demande reste en liste d''attente';
  end if;
  perform 1 from public.demandes_devis where id = p_demande and statut in ('en_attente', 'devis_recu') for update;
  if not found then raise exception 'Cette demande n''est plus ouverte'; end if;
  if not exists (select 1 from public.demandes_devis_ouvertes() o where o.id = p_demande) then
    raise exception 'Cette demande ne vous est pas adressée' using errcode = '42501';
  end if;
  if p_tarif is null or p_tarif not between 0 and 10000000 then raise exception 'Indiquez le montant de chaque facture'; end if;
  if p_facturation_mois is null or p_facturation_mois not between 1 and 12 then raise exception 'Période facturée : de 1 à 12 mois'; end if;
  if p_passages is null or p_passages not between 1 and 7 then raise exception 'Passages par semaine : de 1 à 7'; end if;
  if coalesce(p_sacs, false) and (p_volume is null or p_volume not between 1 and 1000) then
    raise exception 'Indiquez le volume des sacs fournis';
  end if;

  insert into public.devis as v (demande_id, entreprise_id, tarif_fcfa, facturation_mois, passages_semaine,
                                 sacs_inclus, sacs_volume_litres, note)
  values (p_demande, v_ent, p_tarif, p_facturation_mois, p_passages, coalesce(p_sacs, false),
          case when coalesce(p_sacs, false) then p_volume end, nullif(btrim(left(coalesce(p_note, ''), 500)), ''))
  on conflict (demande_id, entreprise_id) do update
     set tarif_fcfa = excluded.tarif_fcfa, facturation_mois = excluded.facturation_mois,
         passages_semaine = excluded.passages_semaine, sacs_inclus = excluded.sacs_inclus,
         sacs_volume_litres = excluded.sacs_volume_litres, note = excluded.note,
         statut = 'propose', propose_par = auth.uid(), created_at = now(), repondu_at = null
   where v.statut in ('propose', 'retire', 'refuse')
  returning v.id into v_id;
  if v_id is null then raise exception 'Ce devis a déjà été accepté ou n''est plus valable'; end if;

  update public.demandes_devis set statut = 'devis_recu' where id = p_demande;
  return v_id;
end $$;

create or replace function public.retirer_devis(p_devis uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v public.devis;
begin
  select * into v from public.devis where id = p_devis for update;
  if not found or not public.est_gerant(v.entreprise_id) then
    raise exception 'Réservé au gérant de l''entreprise' using errcode = '42501';
  end if;
  if v.statut <> 'propose' then raise exception 'Ce devis n''est plus en attente de réponse'; end if;
  update public.devis set statut = 'retire', repondu_at = now() where id = v.id;
  update public.demandes_devis d set statut = 'en_attente'
   where d.id = v.demande_id and d.statut = 'devis_recu'
     and not exists (select 1 from public.devis x where x.demande_id = d.id and x.statut = 'propose');
end $$;

-- =============================================================================
-- 8. L'abonné répond : il accepte un devis (et devient client à ce tarif) ou le refuse
-- =============================================================================
create or replace function public.accepter_devis(p_devis uuid) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v public.devis;
  d public.demandes_devis;
  v_client uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  select * into v from public.devis where id = p_devis for update;
  if not found then raise exception 'Devis introuvable'; end if;
  select * into d from public.demandes_devis where id = v.demande_id for update;
  if d.user_id is distinct from auth.uid() then
    raise exception 'Ce devis ne vous est pas adressé' using errcode = '42501';
  end if;
  if v.statut <> 'propose' or d.statut not in ('en_attente', 'devis_recu') then
    raise exception 'Ce devis n''est plus valable';
  end if;
  if exists (select 1 from public.clients where user_id = auth.uid() and statut <> 'resilie') then
    raise exception 'Vous avez déjà un abonnement en cours';
  end if;

  insert into public.clients (entreprise_id, user_id, nom, telephone, adresse, quartier, lat, lng, zone_id,
                              tarif_fcfa, facturation_mois, passages_semaine, sacs_inclus, sacs_volume_litres,
                              statut, notes)
  values (v.entreprise_id, d.user_id, d.nom, d.telephone, d.repere, d.quartier, d.lat, d.lng,
          case when d.lat is not null then public.zone_du_point(d.lat, d.lng) end,
          v.tarif_fcfa, v.facturation_mois, v.passages_semaine, v.sacs_inclus, v.sacs_volume_litres,
          'actif', case when d.whatsapp is not null then 'WhatsApp : ' || d.whatsapp end)
  returning id into v_client;

  update public.devis set statut = 'accepte', repondu_at = now() where id = v.id;
  update public.devis set statut = 'caduc', repondu_at = now()
   where demande_id = d.id and id <> v.id and statut = 'propose';
  update public.demandes_devis
     set statut = 'acceptee', client_id = v_client, entreprise_id = v.entreprise_id
   where id = d.id;
  return v_client;
end $$;

create or replace function public.refuser_devis(p_devis uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v public.devis;
  d public.demandes_devis;
begin
  if auth.uid() is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  select * into v from public.devis where id = p_devis for update;
  if not found then raise exception 'Devis introuvable'; end if;
  select * into d from public.demandes_devis where id = v.demande_id;
  if d.user_id is distinct from auth.uid() then
    raise exception 'Ce devis ne vous est pas adressé' using errcode = '42501';
  end if;
  if v.statut <> 'propose' then raise exception 'Ce devis n''est plus en attente de réponse'; end if;
  update public.devis set statut = 'refuse', repondu_at = now() where id = v.id;
  update public.demandes_devis x set statut = 'en_attente'
   where x.id = d.id and x.statut = 'devis_recu'
     and not exists (select 1 from public.devis y where y.demande_id = x.id and y.statut = 'propose');
end $$;

-- =============================================================================
-- 9. Les demandes d'abonnement encore en attente deviennent des demandes de devis
-- =============================================================================
insert into public.demandes_devis (user_id, categorie, nom, telephone, commune_id, quartier, repere,
                                   passages_semaine, lat, lng, position_sur_place, created_at)
select da.user_id, 'residentiel', da.nom, da.telephone, z.commune_id,
       coalesce(nullif(btrim(da.quartier), ''), 'À préciser'),
       coalesce(nullif(btrim(da.adresse), ''), 'À préciser'),
       coalesce(p.passages_semaine, 2), da.lat, da.lng, false, da.created_at
  from public.demandes_abonnement da
  left join public.zones z on z.id = da.zone_id
  left join public.plans_tarifaires p on p.id = da.plan_id
 where da.statut = 'en_attente'
   and not exists (select 1 from public.demandes_devis dd
                    where dd.user_id = da.user_id and dd.statut in ('en_attente', 'devis_recu'))
   and not exists (select 1 from public.clients c where c.user_id = da.user_id and c.statut <> 'resilie');

-- Reprises (ou déjà abonnées entre-temps) : retirées de l'ancienne file.
update public.demandes_abonnement da set statut = 'annulee'
 where da.statut = 'en_attente'
   and (exists (select 1 from public.demandes_devis dd
                 where dd.user_id = da.user_id and dd.statut in ('en_attente', 'devis_recu'))
        or exists (select 1 from public.clients c where c.user_id = da.user_id and c.statut <> 'resilie'));

-- =============================================================================
-- 10. Droits
-- =============================================================================
revoke all on function public.deposer_demande_devis(jsonb) from public, anon;
revoke all on function public.annuler_demande_devis() from public, anon;
revoke all on function public.mes_devis() from public, anon;
revoke all on function public.demandes_devis_ouvertes() from public, anon;
revoke all on function public.proposer_devis(uuid, int, int, int, boolean, int, text) from public, anon;
revoke all on function public.retirer_devis(uuid) from public, anon;
revoke all on function public.accepter_devis(uuid) from public, anon;
revoke all on function public.refuser_devis(uuid) from public, anon;

grant execute on function public.deposer_demande_devis(jsonb) to authenticated;
grant execute on function public.annuler_demande_devis() to authenticated;
grant execute on function public.mes_devis() to authenticated;
grant execute on function public.demandes_devis_ouvertes() to authenticated;
grant execute on function public.proposer_devis(uuid, int, int, int, boolean, int, text) to authenticated;
grant execute on function public.retirer_devis(uuid) to authenticated;
grant execute on function public.accepter_devis(uuid) to authenticated;
grant execute on function public.refuser_devis(uuid) to authenticated;

commit;

-- =============================================================================
-- Contrôle (à lire dans le résultat) : chaque ligne doit afficher « OK ».
-- =============================================================================
select controle, case when ok then 'OK' else 'À VÉRIFIER' end as resultat, detail
from (
  select 1 as n, 'Tarif de chaque abonné : repris de sa formule' as controle,
         not exists (select 1 from public.clients where plan_id is not null and tarif_fcfa is null) as ok,
         (select count(*) filter (where tarif_fcfa is not null) || ' abonné(s) avec un tarif, '
                 || count(*) filter (where tarif_fcfa is null) || ' sans (à fixer par leur précollecteur)' from public.clients) as detail
  union all
  select 2, 'Vue des fiches : tarif de l''abonné, droits de l''appelant',
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'v_clients_statut' and column_name = 'tarif_fcfa')
         and coalesce((select c.reloptions::text from pg_class c where c.oid = 'public.v_clients_statut'::regclass), '') like '%security_invoker=true%',
         'plan_prix = tarif_fcfa ; plan_duree_mois = facturation_mois'
  union all
  select 3, 'Demandes de devis et devis : RLS active, aucune écriture directe',
         (select bool_and(relrowsecurity) from pg_class where oid in ('public.demandes_devis'::regclass, 'public.devis'::regclass))
         and not exists (select 1 from pg_policies where schemaname = 'public'
                          and tablename in ('demandes_devis', 'devis') and cmd <> 'SELECT'),
         'écritures par deposer_demande_devis, proposer_devis, accepter_devis, refuser_devis, retirer_devis, annuler_demande_devis'
  union all
  select 4, 'Fonctions des devis fermées au visiteur sans compte',
         not has_function_privilege('anon', 'public.deposer_demande_devis(jsonb)', 'execute')
         and not has_function_privilege('anon', 'public.demandes_devis_ouvertes()', 'execute')
         and not has_function_privilege('anon', 'public.proposer_devis(uuid, int, int, int, boolean, int, text)', 'execute')
         and not has_function_privilege('anon', 'public.accepter_devis(uuid)', 'execute')
         and not has_function_privilege('anon', 'public.mes_devis()', 'execute'),
         'réservées aux comptes connectés'
  union all
  select 5, 'Interrupteur des devis', exists (select 1 from public.parametres_plateforme where cle = 'devis_ouverts'),
         case when public.parametre_entier('devis_ouverts', 0) = 1 then 'OUVERTS : les précollecteurs vérifiés proposent leurs tarifs'
              else 'liste d''attente (lancement : update parametres_plateforme set valeur = ''1'' where cle = ''devis_ouverts'')' end
  union all
  select 6, 'Anciennes demandes d''abonnement en attente reprises comme demandes de devis',
         not exists (select 1 from public.demandes_abonnement where statut = 'en_attente'),
         (select count(*) || ' demande(s) de devis ouverte(s)' from public.demandes_devis where statut in ('en_attente', 'devis_recu'))
) x order by n;
