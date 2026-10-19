-- =============================================================================
-- MyKlinTown — Charte et contrat acceptés et horodatés ; facture inaltérable
-- et conforme (chantier 3)
-- =============================================================================
-- 3a. Charte du ménage et contrat d'abonnement :
--   • documents versionnés (`documents_legaux`) ; une version publiée ne se
--     modifie plus : on en publie une nouvelle. Une v1 PROVISOIRE de chaque
--     document est publiée ici (textes définitifs à venir de l'équipe) ;
--   • chaque acceptation est tracée (`acceptations_documents`) : en ligne par
--     le ménage, ou remise papier enregistrée par le précollecteur. Aucune
--     écriture directe : tout passe par `accepter_documents()`.
--
-- 3b. Facture :
--   • numérotation par ÉMETTEUR et par exercice, sans trou : F007-2026-00001
--     (préfixe de l'entreprise, année de Douala, rang). Les anciens numéros
--     (F2610-00042) restent valables tels quels ;
--   • ventilation HT / TVA / TTC (taux paramétré, 0 par défaut : décision
--     fiscale D5 en attente) et instantané de l'émetteur (NIU, RCCM, adresse
--     fiscale, mentions) et du client au jour de l'émission ;
--   • inaltérable : numéro, client, période, échéance, montants, instantanés
--     ne changent plus, pour PERSONNE (clé de service comprise). Seul le
--     statut évolue (payée par les encaissements, annulée avec trace) ;
--   • une facture ne se supprime pas (sauf démonstration) ; un client facturé
--     non plus (on le résilie) ;
--   • les données de TEST se purgent par `purger_donnees_de_test()`, réservée
--     à la clé de service et aux entreprises dont tous les membres sont des
--     comptes de test (mkt.test.…).
--
-- Échappatoire de maintenance (SQL Editor uniquement) : dans une transaction,
--   select set_config('myklintown.maintenance_factures', 'on', true);
-- Sans effet pour un appel venant de l'API (rôles anon / authenticated).
--
-- Additive et rejouable : une transaction. Ne touche pas `handle_new_user`
-- (20261019000015) ni la vue `v_clients_statut` (chantier 2) ; aucune colonne
-- ajoutée à `clients`.
-- À jouer sur la base de TEST, puis sur la vraie, dans le SQL Editor (compte
-- postgres), AVANT le déploiement de l'application.
-- =============================================================================

begin;

-- =============================================================================
-- 0. Drapeau de maintenance (factures)
-- =============================================================================
-- Vrai seulement si le drapeau local est posé ET que l'appel ne vient pas
-- directement de l'API. SECURITY INVOKER : `current_user` doit être celui de
-- l'appelant (ou le propriétaire d'une fonction contrôlée qui l'a posé).
create or replace function public.maintenance_factures() returns boolean
language sql stable set search_path = public as $$
  select coalesce(current_setting('myklintown.maintenance_factures', true), '') = 'on'
         and current_user not in ('anon', 'authenticated')
$$;

-- =============================================================================
-- 1. Documents légaux : charte du ménage, contrat d'abonnement
-- =============================================================================
create table if not exists public.documents_legaux (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('charte_menage', 'contrat_menage')),
  version int not null check (version > 0),
  titre text not null check (char_length(titre) between 3 and 200),
  -- Texte simple : « ## Titre », « - élément de liste », paragraphes séparés
  -- par une ligne vide. Jamais de HTML (l'application ne l'interprète pas).
  contenu text not null check (char_length(contenu) between 1 and 100000),
  provisoire boolean not null default false,
  publie_at timestamptz,
  cree_par uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (type, version)
);

drop trigger if exists documents_legaux_updated_at on public.documents_legaux;
create trigger documents_legaux_updated_at before update on public.documents_legaux
  for each row execute function public.set_updated_at();

-- Une version publiée est figée (et ne se supprime pas) : on publie la suivante.
-- Seule exception : son auteur est supprimé (cree_par → null, clé étrangère).
create or replace function public.documents_legaux_fige() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.cree_par is null and old.cree_par is not null
     and (to_jsonb(new) - 'cree_par') = (to_jsonb(old) - 'cree_par')
     and not exists (select 1 from public.profiles p where p.id = old.cree_par) then
    return new;
  end if;
  if old.publie_at is not null then
    raise exception 'Version publiée : elle ne se modifie plus. Rédigez une nouvelle version.'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;
drop trigger if exists documents_legaux_fige on public.documents_legaux;
create trigger documents_legaux_fige before update or delete on public.documents_legaux
  for each row execute function public.documents_legaux_fige();

-- Lecture : les versions publiées sont publiques (pages /legal/charte et
-- /legal/contrat, lisibles avant inscription) ; l'administrateur voit tout.
-- Écriture : administrateur seulement (calqué sur la grille tarifaire).
alter table public.documents_legaux enable row level security;
drop policy if exists documents_legaux_lecture on public.documents_legaux;
create policy documents_legaux_lecture on public.documents_legaux for select to anon, authenticated
  using (publie_at is not null or public.est_admin());
drop policy if exists documents_legaux_admin on public.documents_legaux;
create policy documents_legaux_admin on public.documents_legaux for all to authenticated
  using (public.est_admin()) with check (public.est_admin());
revoke insert, update, delete, truncate on public.documents_legaux from anon;

-- v1 PROVISOIRES, publiées pour que l'acceptation fonctionne dès maintenant.
-- Les textes définitifs viendront de l'équipe (nouvelle version, à faire
-- accepter de nouveau).
insert into public.documents_legaux (type, version, titre, contenu, provisoire, publie_at)
values
  ('charte_menage', 1, 'Charte du ménage abonné', $txt$## Objet
Cette charte rappelle les engagements du ménage abonné et de son précollecteur dans le service de précollecte des déchets ménagers proposé avec MyKlinTown.

## Engagements du ménage
- Sortir ses déchets aux jours de passage convenus, dans un contenant fermé.
- Prévenir son précollecteur avant de confier des déchets inhabituels ou dangereux.
- Régler son abonnement à l'échéance indiquée sur la facture.
- Signaler tout problème depuis l'application ou auprès de son précollecteur.

## Engagements du précollecteur
- Assurer les passages prévus par la formule choisie et prévenir en cas d'empêchement.
- Remettre une facture ou un reçu pour chaque paiement.
- Traiter les signalements du ménage.

## Version provisoire
Ce texte est provisoire. La version définitive sera publiée par l'équipe MyKlinTown : il vous sera alors demandé de l'accepter.$txt$, true, now()),
  ('contrat_menage', 1, 'Contrat d''abonnement à la précollecte', $txt$## Parties
Ce contrat lie le ménage abonné (le client) et l'entreprise de précollecte qui le dessert (le précollecteur). MyKlinTown fournit l'application.

## Prestation
Le précollecteur collecte les déchets ménagers du client à l'adresse indiquée, selon la formule choisie dans la grille tarifaire commune.

## Prix et paiement
- Le prix est celui de la grille tarifaire en vigueur au jour de la facture.
- Chaque période est facturée et se règle au plus tard à l'échéance indiquée sur la facture, en espèces ou par Mobile Money, auprès du précollecteur.

## Données personnelles
Les données du client servent à l'exécution du service, dans les conditions décrites dans les mentions légales.

## Version provisoire
Ce texte est provisoire. La version définitive sera publiée par l'équipe MyKlinTown : il vous sera alors demandé de l'accepter.$txt$, true, now())
on conflict (type, version) do nothing;

-- =============================================================================
-- 2. Acceptations, horodatées
-- =============================================================================
create table if not exists public.acceptations_documents (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents_legaux(id) on delete restrict,
  -- Compte du ménage (acceptation en ligne, ou fiche déjà rattachée à un compte).
  user_id uuid references public.profiles(id) on delete set null,
  -- Fiche client concernée (remise papier, ou abonnement en cours au moment de l'acceptation).
  client_id uuid references public.clients(id) on delete set null,
  entreprise_id uuid references public.entreprises(id) on delete set null,
  mode text not null check (mode in ('en_ligne', 'remise_papier')),
  -- Qui a enregistré l'acceptation (le ménage lui-même, ou le gérant / l'agent).
  auteur_id uuid references public.profiles(id) on delete set null default auth.uid(),
  accepte_at timestamptz not null default now()
);
create index if not exists acceptations_documents_user_idx on public.acceptations_documents (user_id);
create index if not exists acceptations_documents_client_idx on public.acceptations_documents (client_id);
create index if not exists acceptations_documents_document_idx on public.acceptations_documents (document_id);

-- Lecture : soi-même, le gérant de l'entreprise, l'administrateur. AUCUNE
-- politique d'écriture : seule `accepter_documents()` écrit.
alter table public.acceptations_documents enable row level security;
drop policy if exists acceptations_documents_lecture on public.acceptations_documents;
create policy acceptations_documents_lecture on public.acceptations_documents for select to authenticated
  using (user_id = auth.uid() or public.est_gerant(entreprise_id) or public.est_admin());
revoke all on public.acceptations_documents from anon;
revoke insert, update, delete, truncate on public.acceptations_documents from authenticated;

-- Dernière version publiée de chaque document.
-- Sans client : le compte connecté accepte EN LIGNE (rattaché à son
--   abonnement en cours s'il en a un).
-- Avec client : le gérant ou un agent de l'entreprise enregistre une REMISE
--   PAPIER (charte remise et signée au domicile).
-- Rejouer ne crée pas de doublon. Renvoie le nombre d'acceptations ajoutées.
create or replace function public.accepter_documents(p_types text[], p_client uuid default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  c public.clients;
  v_type text;
  v_doc uuid;
  v_n int := 0;
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if p_types is null or cardinality(p_types) = 0 then
    raise exception 'Aucun document à accepter';
  end if;

  if p_client is not null then
    select * into c from public.clients where id = p_client;
    if not found or not (public.est_gerant(c.entreprise_id) or public.est_agent(c.entreprise_id)) then
      raise exception 'Réservé à l''équipe du précollecteur de ce client' using errcode = '42501';
    end if;
  else
    select * into c from public.clients
     where user_id = v_uid and statut <> 'resilie'
     order by created_at desc limit 1;
  end if;

  foreach v_type in array (select array_agg(distinct t) from unnest(p_types) t) loop
    if v_type is null or v_type not in ('charte_menage', 'contrat_menage') then
      raise exception 'Document inconnu : %', coalesce(v_type, '(vide)');
    end if;
    select id into v_doc from public.documents_legaux
     where type = v_type and publie_at is not null
     order by version desc limit 1;
    if v_doc is null then
      raise exception 'Aucune version publiée de ce document (%)', v_type;
    end if;

    if p_client is null then
      continue when exists (select 1 from public.acceptations_documents where document_id = v_doc and user_id = v_uid);
      insert into public.acceptations_documents (document_id, user_id, client_id, entreprise_id, mode, auteur_id)
      values (v_doc, v_uid, c.id, c.entreprise_id, 'en_ligne', v_uid);
    else
      continue when exists (select 1 from public.acceptations_documents where document_id = v_doc and client_id = c.id);
      insert into public.acceptations_documents (document_id, user_id, client_id, entreprise_id, mode, auteur_id)
      values (v_doc, c.user_id, c.id, c.entreprise_id, 'remise_papier', v_uid);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Documents dont le compte connecté n'a pas accepté la dernière version
-- publiée (en ligne, ou par remise papier sur une de ses fiches client).
create or replace function public.documents_a_accepter()
returns table (document_id uuid, type text, version integer, titre text, provisoire boolean)
language sql stable security definer set search_path = public as $$
  select d.id, d.type, d.version, d.titre, d.provisoire
  from (
    select distinct on (dl.type) dl.*
    from public.documents_legaux dl
    where dl.publie_at is not null
    order by dl.type, dl.version desc
  ) d
  where auth.uid() is not null
    and not exists (
      select 1 from public.acceptations_documents a
       where a.document_id = d.id
         and (a.user_id = auth.uid()
              or a.client_id in (select cl.id from public.clients cl where cl.user_id = auth.uid()))
    )
  order by d.type
$$;

-- État de la charte et du contrat pour une fiche client : dernière version
-- publiée, et la plus récente acceptée par ce ménage (fiche ou compte).
-- Visible par l'équipe de l'entreprise, le ménage lui-même, l'administrateur ;
-- vide pour tout autre compte.
create or replace function public.charte_du_client(p_client uuid)
returns table (type text, document_id uuid, version integer, titre text, provisoire boolean,
               acceptee boolean, version_acceptee integer, accepte_at timestamptz, mode text)
language sql stable security definer set search_path = public as $$
  with c as (
    select cl.id, cl.user_id
      from public.clients cl
     where cl.id = p_client
       and (public.est_gerant(cl.entreprise_id) or public.est_agent(cl.entreprise_id) or public.est_admin()
            or (cl.user_id is not null and cl.user_id = auth.uid()))
  ),
  courant as (
    select distinct on (dl.type) dl.*
      from public.documents_legaux dl
     where dl.publie_at is not null
     order by dl.type, dl.version desc
  ),
  acc as (
    select distinct on (dl.type) dl.type, dl.version, a.accepte_at, a.mode
      from public.acceptations_documents a
      join public.documents_legaux dl on dl.id = a.document_id
      join c on a.client_id = c.id or (c.user_id is not null and a.user_id = c.user_id)
     order by dl.type, dl.version desc, a.accepte_at desc
  )
  select k.type, k.id, k.version, k.titre, k.provisoire,
         coalesce(acc.version = k.version, false), acc.version, acc.accepte_at, acc.mode
    from courant k
   cross join c
    left join acc on acc.type = k.type
   order by k.type
$$;

-- =============================================================================
-- 3. Entreprises : identité fiscale et préfixe de facturation
-- =============================================================================
alter table public.entreprises
  add column if not exists niu text check (char_length(niu) <= 30),
  add column if not exists rccm text check (char_length(rccm) <= 60),
  add column if not exists adresse_fiscale text check (char_length(adresse_fiscale) <= 300),
  add column if not exists prefixe_facture text;
comment on column public.entreprises.niu is 'Numéro d''identifiant unique (DGI), imprimé sur les factures.';
comment on column public.entreprises.rccm is 'Numéro au registre du commerce et du crédit mobilier, imprimé sur les factures.';
comment on column public.entreprises.prefixe_facture is
  'Préfixe des numéros de facture (F001, F002…), attribué une fois pour toutes : il ne se change pas depuis l''application.';

create sequence if not exists public.entreprises_prefixe_seq;
revoke all on sequence public.entreprises_prefixe_seq from anon, authenticated;

-- Entreprises existantes : F001, F002… par ordre d'inscription. Celles qui en
-- ont déjà un le gardent ; la séquence ne revient jamais en arrière.
do $$
declare
  v_max int;
  v_dernier bigint;
  v_appele boolean;
  r record;
begin
  select coalesce(max(substring(prefixe_facture from '^F(\d+)$')::int), 0) into v_max from public.entreprises;
  select last_value, is_called into v_dernier, v_appele from public.entreprises_prefixe_seq;
  if v_max > (case when v_appele then v_dernier else v_dernier - 1 end) then
    perform setval('public.entreprises_prefixe_seq', v_max, true);
  end if;
  for r in select id from public.entreprises where prefixe_facture is null order by created_at, id loop
    update public.entreprises
       set prefixe_facture = 'F' || lpad(nextval('public.entreprises_prefixe_seq')::text, 3, '0')
     where id = r.id;
  end loop;
end $$;

alter table public.entreprises
  alter column prefixe_facture set default ('F' || lpad(nextval('public.entreprises_prefixe_seq')::text, 3, '0')),
  alter column prefixe_facture set not null;
create unique index if not exists entreprises_prefixe_facture_key on public.entreprises (prefixe_facture);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'entreprises_prefixe_facture_format') then
    alter table public.entreprises
      add constraint entreprises_prefixe_facture_format check (prefixe_facture ~ '^[A-Z0-9]{2,8}$');
  end if;
end $$;

-- Le préfixe rejoint les colonnes « système » de l'entreprise (garde de 0009).
drop trigger if exists entreprises_colonnes_systeme on public.entreprises;
create trigger entreprises_colonnes_systeme before update on public.entreprises
  for each row execute function public.garde_colonnes_systeme('statut', 'proprietaire_id', 'prefixe_facture');

-- Une fiche réelle ne devient pas « démo » (ses factures deviendraient
-- supprimables) : le marqueur ne se pose qu'à la création.
drop trigger if exists clients_colonnes_systeme on public.clients;
create trigger clients_colonnes_systeme before update on public.clients
  for each row execute function public.garde_colonnes_systeme('user_id', 'est_demo');

-- =============================================================================
-- 4. Paramètres de facturation (décision fiscale D5 en attente : rien en dur)
-- =============================================================================
insert into public.parametres_plateforme (cle, valeur, description) values
  ('facturation_tva_taux', '0',
   'Taux de TVA appliqué aux nouvelles factures (0,1925 = 19,25 %). 0 tant que la décision fiscale D5 n''est pas prise.'),
  ('facturation_mention_tva', '"TVA non applicable"',
   'Mention TVA imprimée sur les nouvelles factures (décision fiscale D5).'),
  ('facturation_mentions_legales', '""',
   'Mentions légales complémentaires imprimées en pied des nouvelles factures (décision fiscale D5). Vide : aucune.')
on conflict (cle) do nothing;

-- =============================================================================
-- 5. Factures : ventilation, instantanés, exercice, annulation tracée
-- =============================================================================
alter table public.factures
  add column if not exists montant_ht_fcfa int,
  add column if not exists tva_taux numeric(6, 4),
  add column if not exists montant_tva_fcfa int,
  add column if not exists emetteur jsonb,
  add column if not exists destinataire jsonb,
  add column if not exists exercice int,
  add column if not exists sequence int,
  add column if not exists est_demo boolean not null default false,
  add column if not exists annulee_at timestamptz,
  add column if not exists annulee_par uuid references public.profiles(id) on delete set null,
  add column if not exists motif_annulation text;
comment on column public.factures.montant_fcfa is 'Montant TTC, celui que le ménage paie (tous les encaissements se comparent à lui).';
comment on column public.factures.emetteur is 'Instantané de l''émetteur au jour de la facture (nom, NIU, RCCM, adresse fiscale, mentions).';
comment on column public.factures.destinataire is 'Instantané du client au jour de la facture (nom, code, adresse, téléphone).';
comment on column public.factures.sequence is 'Rang dans la numérotation de l''émetteur pour l''exercice (sans trou). Nul pour les anciens numéros et la démonstration.';

-- Instantanés : ce que la facture imprimera, figé au jour de l'émission.
create or replace function public.instantane_emetteur(p_entreprise uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'nom', e.nom, 'telephone', e.telephone, 'email', e.email, 'siege', e.siege,
    'adresse_fiscale', e.adresse_fiscale, 'niu', e.niu, 'rccm', e.rccm,
    'commune', (select cm.nom from public.communes cm where cm.id = e.commune_id),
    'mention_tva', (select p.valeur #>> '{}' from public.parametres_plateforme p where p.cle = 'facturation_mention_tva'),
    'mentions_legales', nullif((select p.valeur #>> '{}' from public.parametres_plateforme p where p.cle = 'facturation_mentions_legales'), ''))
  from public.entreprises e where e.id = p_entreprise
$$;

create or replace function public.instantane_destinataire(p_client uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'nom', c.nom, 'code', c.code, 'telephone', c.telephone, 'email', c.email,
    'adresse', c.adresse, 'quartier', c.quartier)
  from public.clients c where c.id = p_client
$$;

-- Reprise de l'existant : HT = TTC, TVA 0, instantanés actuels, exercice de
-- l'émission, marqueur démo repris du client. Le drapeau laisse passer la
-- reprise si la migration est rejouée (le verrou du §7 existe alors déjà).
select set_config('myklintown.maintenance_factures', 'on', true);
update public.factures f
   set montant_ht_fcfa = coalesce(f.montant_ht_fcfa, f.montant_fcfa),
       tva_taux = coalesce(f.tva_taux, 0),
       montant_tva_fcfa = coalesce(f.montant_tva_fcfa, 0),
       exercice = coalesce(f.exercice, extract(year from (f.created_at at time zone 'Africa/Douala'))::int),
       est_demo = c.est_demo,
       emetteur = coalesce(f.emetteur, public.instantane_emetteur(f.entreprise_id)),
       destinataire = coalesce(f.destinataire, public.instantane_destinataire(f.client_id))
  from public.clients c
 where c.id = f.client_id
   and (f.montant_ht_fcfa is null or f.tva_taux is null or f.montant_tva_fcfa is null
        or f.exercice is null or f.emetteur is null or f.destinataire is null);
select set_config('myklintown.maintenance_factures', 'off', true);

alter table public.factures
  alter column montant_ht_fcfa set not null,
  alter column tva_taux set not null,
  alter column montant_tva_fcfa set not null,
  alter column emetteur set not null,
  alter column destinataire set not null,
  alter column exercice set not null,
  -- Le numéro est attribué par le déclencheur d'émission (§6), jamais saisi.
  alter column numero drop default;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'factures_ventilation_ttc') then
    alter table public.factures
      add constraint factures_ventilation_ttc check (montant_ht_fcfa + montant_tva_fcfa = montant_fcfa);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'factures_tva_taux_borne') then
    alter table public.factures
      add constraint factures_tva_taux_borne check (tva_taux >= 0 and tva_taux < 1);
  end if;
end $$;
create unique index if not exists factures_numerotation_emetteur
  on public.factures (entreprise_id, exercice, sequence) where sequence is not null;

-- =============================================================================
-- 6. Numérotation par émetteur et par exercice, sans trou
-- =============================================================================
-- Un compteur par (entreprise, exercice), incrémenté DANS la transaction de
-- l'émission : verrouillé jusqu'à la fin, annulé avec elle. Aucun compte n'y
-- accède (RLS sans politique) ; seul le déclencheur l'écrit.
create table if not exists public.factures_compteurs (
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  exercice int not null,
  dernier int not null default 0 check (dernier >= 0),
  primary key (entreprise_id, exercice)
);
alter table public.factures_compteurs enable row level security;
revoke all on public.factures_compteurs from anon, authenticated;

-- Émission : le numéro envoyé est ignoré ; ventilation HT / TVA / TTC et
-- instantanés calculés ici. Démonstration : DEMO-…, hors numérotation réelle.
create or replace function public.factures_emission() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_prefixe text;
  v_taux numeric;
  v_rang int;
begin
  select prefixe_facture into v_prefixe from public.entreprises where id = new.entreprise_id;
  if v_prefixe is null then
    raise exception 'Facture refusée : entreprise inconnue';
  end if;
  select est_demo into new.est_demo from public.clients where id = new.client_id;
  if new.est_demo is null then
    raise exception 'Facture refusée : client inconnu';
  end if;

  new.exercice := extract(year from (now() at time zone 'Africa/Douala'))::int;
  if new.est_demo then
    new.sequence := null;
    new.numero := 'DEMO-' || v_prefixe || '-' || new.exercice || '-'
                  || lpad(nextval('public.factures_numero_seq')::text, 5, '0');
  else
    insert into public.factures_compteurs as k (entreprise_id, exercice, dernier)
    values (new.entreprise_id, new.exercice, 1)
    on conflict (entreprise_id, exercice) do update set dernier = k.dernier + 1
    returning k.dernier into v_rang;
    new.sequence := v_rang;
    new.numero := v_prefixe || '-' || new.exercice || '-' || lpad(v_rang::text, 5, '0');
  end if;

  select coalesce((p.valeur #>> '{}')::numeric, 0) into v_taux
    from public.parametres_plateforme p where p.cle = 'facturation_tva_taux';
  v_taux := coalesce(v_taux, 0);
  if v_taux < 0 or v_taux >= 1 then
    raise exception 'Paramètre facturation_tva_taux invalide (%) : attendu entre 0 et 1 (0,1925 = 19,25 %%)', v_taux;
  end if;
  new.tva_taux := v_taux;
  new.montant_ht_fcfa := round(new.montant_fcfa / (1 + v_taux))::int;
  new.montant_tva_fcfa := new.montant_fcfa - new.montant_ht_fcfa;

  new.emetteur := public.instantane_emetteur(new.entreprise_id);
  new.destinataire := public.instantane_destinataire(new.client_id);
  new.annulee_at := null;
  new.annulee_par := null;
  new.motif_annulation := null;
  -- Date d'émission : celle du serveur (sauf reprise de données en maintenance).
  if not public.maintenance_factures() then
    new.created_at := now();
  end if;
  return new;
end $$;
drop trigger if exists factures_emission on public.factures;
create trigger factures_emission before insert on public.factures
  for each row execute function public.factures_emission();

-- =============================================================================
-- 7. Inaltérabilité
-- =============================================================================
-- 7.a Ce qui est imprimé ne change plus, pour personne (clé de service
-- comprise). Le statut évolue : payée / émise par les encaissements
-- (maj_statut_facture), annulée par le gérant, avec trace. Une facture
-- annulée le reste : on en émet une nouvelle.
create or replace function public.factures_inalterable() returns trigger
language plpgsql set search_path = public as $$
declare
  v_colonne text;
  v_avant jsonb := to_jsonb(old);
  v_apres jsonb := to_jsonb(new);
begin
  if public.maintenance_factures() then
    return new;
  end if;
  foreach v_colonne in array array[
    'numero', 'entreprise_id', 'client_id', 'plan_id', 'libelle', 'periode_debut', 'periode_fin', 'echeance',
    'montant_fcfa', 'montant_ht_fcfa', 'tva_taux', 'montant_tva_fcfa', 'emetteur', 'destinataire',
    'exercice', 'sequence', 'est_demo', 'created_at'
  ] loop
    if (v_avant -> v_colonne) is distinct from (v_apres -> v_colonne) then
      raise exception 'Facture % inaltérable : « % » ne se modifie pas. Annulez-la et émettez-en une nouvelle.',
        old.numero, v_colonne using errcode = '42501';
    end if;
  end loop;

  if old.statut = 'annulee' and new.statut <> 'annulee' then
    raise exception 'Facture % annulée : elle le reste. Émettez-en une nouvelle.', old.numero using errcode = '42501';
  end if;

  if new.statut = 'annulee' and old.statut <> 'annulee' then
    new.annulee_at := now();
    new.annulee_par := auth.uid();
    new.motif_annulation := nullif(btrim(coalesce(new.motif_annulation, '')), '');
  elsif new.annulee_at is distinct from old.annulee_at
        or new.motif_annulation is distinct from old.motif_annulation
        or (new.annulee_par is distinct from old.annulee_par
            -- seule exception : le compte qui a annulé est supprimé (clé étrangère → null)
            and not (new.annulee_par is null
                     and not exists (select 1 from public.profiles p where p.id = old.annulee_par))) then
    raise exception 'Facture % : la trace d''annulation ne se modifie pas.', old.numero using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists factures_inalterable on public.factures;
create trigger factures_inalterable before update on public.factures
  for each row execute function public.factures_inalterable();

-- 7.b Une facture ne se supprime pas (démonstration exceptée) : on l'annule.
create or replace function public.factures_suppression() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.est_demo or public.maintenance_factures() then
    return old;
  end if;
  raise exception 'La facture % ne se supprime pas : annulez-la, avec un motif.', old.numero
    using errcode = '42501';
end $$;
drop trigger if exists factures_suppression on public.factures;
create trigger factures_suppression before delete on public.factures
  for each row execute function public.factures_suppression();

-- 7.c Un client facturé ne se supprime pas (il emporterait ses factures) : on le résilie.
-- SECURITY DEFINER : le contrôle voit toutes les factures, quels que soient
-- les droits de lecture de celui qui supprime.
create or replace function public.clients_suppression() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.est_demo or public.maintenance_factures() then
    return old;
  end if;
  if exists (select 1 from public.factures f where f.client_id = old.id and not f.est_demo) then
    raise exception 'Le client « % » a des factures : il ne se supprime pas. Résiliez-le.', old.nom
      using errcode = '42501';
  end if;
  return old;
end $$;
drop trigger if exists clients_suppression on public.clients;
create trigger clients_suppression before delete on public.clients
  for each row execute function public.clients_suppression();

-- =============================================================================
-- 8. Droits du gérant sur les factures : par opération, sans suppression
-- =============================================================================
-- Remplace `factures_membres` (FOR ALL, 20261005000007) : lire, émettre,
-- mettre à jour (le statut seulement, §7) ; plus de DELETE par l'API.
drop policy if exists factures_membres on public.factures;
drop policy if exists factures_gerant_lecture on public.factures;
create policy factures_gerant_lecture on public.factures for select to authenticated
  using (public.est_gerant(entreprise_id) or public.est_admin());
drop policy if exists factures_gerant_emission on public.factures;
create policy factures_gerant_emission on public.factures for insert to authenticated
  with check (public.est_gerant(entreprise_id) or public.est_admin());
drop policy if exists factures_gerant_maj on public.factures;
create policy factures_gerant_maj on public.factures for update to authenticated
  using (public.est_gerant(entreprise_id) or public.est_admin())
  with check (public.est_gerant(entreprise_id) or public.est_admin());

-- =============================================================================
-- 9. Purge des données de TEST (clé de service seulement)
-- =============================================================================
-- Refusée si un seul membre de l'entreprise n'est pas un compte de test
-- (adresse mkt.test.…) : une vraie entreprise ne se purge jamais ainsi.
-- Sans liste : toute l'exploitation (clients et leurs factures, tournées,
-- employés, tricycles, compteurs) ; avec une liste : ces fiches client-là.
create or replace function public.purger_donnees_de_test(p_entreprise uuid, p_clients uuid[] default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_membres int;
  v_hors_test int;
  v_n int;
begin
  select count(*), count(*) filter (where coalesce(u.email, '') not like 'mkt.test.%')
    into v_membres, v_hors_test
    from public.entreprise_membres m
    left join auth.users u on u.id = m.user_id
   where m.entreprise_id = p_entreprise;
  if v_membres = 0 or v_hors_test > 0 then
    raise exception 'Purge refusée : cette entreprise n''est pas une entreprise de test (comptes mkt.test.… uniquement)'
      using errcode = '42501';
  end if;

  perform set_config('myklintown.maintenance_factures', 'on', true);
  if p_clients is null then
    delete from public.clients where entreprise_id = p_entreprise;
    get diagnostics v_n = row_count;
    delete from public.tournees_precollecte where entreprise_id = p_entreprise;
    delete from public.employes where entreprise_id = p_entreprise;
    delete from public.tricycles where entreprise_id = p_entreprise;
    delete from public.factures_compteurs where entreprise_id = p_entreprise;
  else
    delete from public.clients where entreprise_id = p_entreprise and id = any(p_clients);
    get diagnostics v_n = row_count;
  end if;
  perform set_config('myklintown.maintenance_factures', 'off', true);
  return v_n;
end $$;

-- =============================================================================
-- 10. Droits d'exécution (droits par défaut retirés en 20261011000009 §7.a)
-- =============================================================================
do $$
declare
  f text;
begin
  -- Internes (déclencheurs, aides) : aucun compte de l'API.
  foreach f in array array[
    'public.documents_legaux_fige()', 'public.instantane_emetteur(uuid)',
    'public.instantane_destinataire(uuid)', 'public.factures_emission()', 'public.factures_inalterable()',
    'public.factures_suppression()', 'public.clients_suppression()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  -- Comptes connectés (chaque fonction vérifie ensuite qui appelle).
  foreach f in array array[
    'public.accepter_documents(text[], uuid)', 'public.documents_a_accepter()', 'public.charte_du_client(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
-- Évaluée par les déclencheurs SECURITY INVOKER (§7) sous le rôle de
-- l'appelant : les comptes connectés doivent pouvoir l'exécuter (elle leur
-- répond toujours « non »).
revoke all on function public.maintenance_factures() from public, anon;
grant execute on function public.maintenance_factures() to authenticated, service_role;
-- Purge : serveur des tests seulement (clé de service du projet de test).
revoke all on function public.purger_donnees_de_test(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.purger_donnees_de_test(uuid, uuid[]) to service_role;

commit;

-- =============================================================================
-- Contrôle (à lire dans le résultat) : chaque ligne doit afficher « OK ».
-- =============================================================================
select controle, case when ok then 'OK' else 'À VÉRIFIER' end as resultat, detail
from (
  select 1 as n, 'RLS sur documents_legaux, acceptations_documents, factures_compteurs' as controle,
         (select bool_and(relrowsecurity) from pg_class
           where oid in ('public.documents_legaux'::regclass, 'public.acceptations_documents'::regclass,
                         'public.factures_compteurs'::regclass)) as ok,
         '' as detail
  union all
  select 2, 'Charte et contrat : une version publiée chacun',
         (select count(distinct type) = 2 from public.documents_legaux where publie_at is not null),
         coalesce((select string_agg(type || ' v' || version || case when provisoire then ' (provisoire)' else '' end, ', ' order by type, version)
                     from public.documents_legaux where publie_at is not null), 'aucune')
  union all
  select 3, 'Acceptations : aucune politique d''écriture (fonction accepter_documents seulement)',
         not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'acceptations_documents' and cmd <> 'SELECT'),
         coalesce((select string_agg(policyname, ', ') from pg_policies where schemaname = 'public' and tablename = 'acceptations_documents'), 'aucune')
  union all
  select 4, 'Chaque entreprise a son préfixe de facture, unique',
         (select count(*) = count(distinct prefixe_facture) and count(*) filter (where prefixe_facture is null) = 0 from public.entreprises),
         (select count(*) || ' entreprises, ' || coalesce(min(prefixe_facture) || ' → ' || max(prefixe_facture), '—') from public.entreprises)
  union all
  select 5, 'Factures existantes reprises (HT + TVA = TTC, instantanés, exercice)',
         not exists (select 1 from public.factures
                      where montant_ht_fcfa + montant_tva_fcfa <> montant_fcfa or emetteur is null or destinataire is null or exercice is null),
         (select count(*) || ' factures, dont ' || count(*) filter (where est_demo) || ' de démonstration' from public.factures)
  union all
  select 6, 'Numéro de facture attribué par le déclencheur (plus de valeur par défaut)',
         (select column_default is null from information_schema.columns
           where table_schema = 'public' and table_name = 'factures' and column_name = 'numero'),
         ''
  union all
  select 7, 'Déclencheurs : émission, inaltérabilité, suppressions refusées, documents figés',
         (select count(*) = 5 from pg_trigger
           where not tgisinternal and tgname in ('factures_emission', 'factures_inalterable', 'factures_suppression',
                                                 'clients_suppression', 'documents_legaux_fige')),
         (select string_agg(tgname, ', ' order by tgname) from pg_trigger
           where not tgisinternal and tgname in ('factures_emission', 'factures_inalterable', 'factures_suppression',
                                                 'clients_suppression', 'documents_legaux_fige'))
  union all
  select 8, 'Factures : plus de politique FOR ALL ni DELETE pour les comptes',
         not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'factures' and cmd in ('ALL', 'DELETE')),
         (select string_agg(policyname || ' (' || cmd || ')', ', ' order by policyname) from pg_policies
           where schemaname = 'public' and tablename = 'factures')
  union all
  select 9, 'purger_donnees_de_test : clé de service seulement',
         has_function_privilege('service_role', 'public.purger_donnees_de_test(uuid, uuid[])', 'execute')
         and not has_function_privilege('authenticated', 'public.purger_donnees_de_test(uuid, uuid[])', 'execute')
         and not has_function_privilege('anon', 'public.purger_donnees_de_test(uuid, uuid[])', 'execute'),
         ''
  union all
  select 10, 'Acceptation et état de la charte : comptes connectés seulement',
         has_function_privilege('authenticated', 'public.accepter_documents(text[], uuid)', 'execute')
         and not has_function_privilege('anon', 'public.accepter_documents(text[], uuid)', 'execute')
         and has_function_privilege('authenticated', 'public.documents_a_accepter()', 'execute')
         and not has_function_privilege('anon', 'public.documents_a_accepter()', 'execute')
         and has_function_privilege('authenticated', 'public.charte_du_client(uuid)', 'execute')
         and not has_function_privilege('anon', 'public.charte_du_client(uuid)', 'execute'),
         ''
  union all
  select 11, 'Paramètres de facturation (TVA, mentions)',
         (select count(*) = 3 from public.parametres_plateforme
           where cle in ('facturation_tva_taux', 'facturation_mention_tva', 'facturation_mentions_legales')),
         coalesce((select string_agg(cle || ' = ' || valeur::text, ' ; ' order by cle) from public.parametres_plateforme
                     where cle in ('facturation_tva_taux', 'facturation_mention_tva', 'facturation_mentions_legales')), '')
) x order by n;
