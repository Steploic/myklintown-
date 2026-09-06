-- =============================================================================
-- MyKlinTown — COMPLÉMENT DE SÉCURITÉ (Row Level Security)
-- À coller dans le SQL Editor Supabase JUSTE APRÈS setup_all.sql.
-- =============================================================================
--
-- Pourquoi ce fichier ?
--   setup_all.sql laisse le schéma dans un état intermédiaire assumé
--   (« D'autres policies seront ajoutées au fur et à mesure ») :
--
--     • 5 tables sans RLS du tout  -> lisibles ET modifiables avec la clé anon,
--       qui est publique par conception : communes, secteurs, structures,
--       camions, capteurs_iot.
--     • 10 tables avec RLS activée mais AUCUNE politique -> Postgres refuse
--       tout accès, y compris en lecture. Concerne notamment `abonnements`
--       et `paiements`, c'est-à-dire tout le socle du chantier paiement.
--
--   Tant que l'application ne touchait que profiles / signalements /
--   incidents_terrain, rien ne se voyait. Dès qu'on branche les tableaux de
--   bord sur les vraies données, les écrans reviennent vides — et le symptôme
--   ressemble à un bug de données alors que c'est un refus de droits.
--
-- Principes retenus :
--   • Référentiel (communes, secteurs, structures) : lecture pour tout compte
--     connecté, écriture réservée à mairie/admin.
--   • Exploitation (camions, capteurs, tournées, scans) : visible par la
--     mairie et par le collecteur concerné, pas par les citoyens.
--   • Données du ménage (abonnements, paiements) : le ménage voit les
--     siennes ; la mairie voit tout ; l'écriture reste à la mairie et, plus
--     tard, au service_role pour le webhook du prestataire de paiement.
--   • Aucune politique n'est ouverte au rôle `anon` : tout passe par
--     `to authenticated`.
--
-- Ce fichier est ré-exécutable sans risque (drop policy if exists).
-- =============================================================================


-- =============================================================================
-- 1. Activer RLS sur les 5 tables qui en étaient dépourvues
-- =============================================================================

alter table public.communes     enable row level security;
alter table public.secteurs     enable row level security;
alter table public.structures   enable row level security;
alter table public.camions      enable row level security;
alter table public.capteurs_iot enable row level security;


-- =============================================================================
-- 2. Référentiel géographique — lecture ouverte aux comptes connectés
-- =============================================================================

drop policy if exists "communes_read" on public.communes;
create policy "communes_read"
  on public.communes for select to authenticated
  using (true);

drop policy if exists "communes_write_mairie" on public.communes;
create policy "communes_write_mairie"
  on public.communes for all to authenticated
  using (public.current_user_role() in ('mairie', 'admin'))
  with check (public.current_user_role() in ('mairie', 'admin'));

drop policy if exists "secteurs_read" on public.secteurs;
create policy "secteurs_read"
  on public.secteurs for select to authenticated
  using (true);

drop policy if exists "secteurs_write_mairie" on public.secteurs;
create policy "secteurs_write_mairie"
  on public.secteurs for all to authenticated
  using (public.current_user_role() in ('mairie', 'admin'))
  with check (public.current_user_role() in ('mairie', 'admin'));

drop policy if exists "structures_read" on public.structures;
create policy "structures_read"
  on public.structures for select to authenticated
  using (true);

drop policy if exists "structures_write_mairie" on public.structures;
create policy "structures_write_mairie"
  on public.structures for all to authenticated
  using (public.current_user_role() in ('mairie', 'admin'))
  with check (public.current_user_role() in ('mairie', 'admin'));


-- =============================================================================
-- 3. Flotte et capteurs — mairie et collecteurs uniquement
-- =============================================================================

drop policy if exists "camions_read_ops" on public.camions;
create policy "camions_read_ops"
  on public.camions for select to authenticated
  using (
    public.current_user_role() in ('mairie', 'admin', 'collecteur')
    or chauffeur_user_id = auth.uid()
  );

drop policy if exists "camions_write_mairie" on public.camions;
create policy "camions_write_mairie"
  on public.camions for all to authenticated
  using (public.current_user_role() in ('mairie', 'admin'))
  with check (public.current_user_role() in ('mairie', 'admin'));

drop policy if exists "capteurs_read_ops" on public.capteurs_iot;
create policy "capteurs_read_ops"
  on public.capteurs_iot for select to authenticated
  using (public.current_user_role() in ('mairie', 'admin', 'collecteur'));

drop policy if exists "capteurs_write_mairie" on public.capteurs_iot;
create policy "capteurs_write_mairie"
  on public.capteurs_iot for all to authenticated
  using (public.current_user_role() in ('mairie', 'admin'))
  with check (public.current_user_role() in ('mairie', 'admin'));


-- =============================================================================
-- 4. Abonnements et paiements — le socle du chantier paiement
-- =============================================================================
-- Le ménage voit ce qui le concerne, la mairie voit tout, le collecteur voit
-- l'abonnement (il en a besoin pour savoir s'il doit servir le ménage) mais
-- PAS les paiements.

drop policy if exists "abonnements_read" on public.abonnements;
create policy "abonnements_read"
  on public.abonnements for select to authenticated
  using (
    exists (
      select 1 from public.menages m
      where m.id = abonnements.menage_id and m.user_id = auth.uid()
    )
    or public.current_user_role() in ('mairie', 'admin', 'collecteur')
  );

drop policy if exists "abonnements_write_mairie" on public.abonnements;
create policy "abonnements_write_mairie"
  on public.abonnements for all to authenticated
  using (public.current_user_role() in ('mairie', 'admin'))
  with check (public.current_user_role() in ('mairie', 'admin'));

drop policy if exists "paiements_read" on public.paiements;
create policy "paiements_read"
  on public.paiements for select to authenticated
  using (
    exists (
      select 1 from public.menages m
      where m.id = paiements.menage_id and m.user_id = auth.uid()
    )
    or public.current_user_role() in ('mairie', 'admin')
  );

drop policy if exists "paiements_write_mairie" on public.paiements;
create policy "paiements_write_mairie"
  on public.paiements for all to authenticated
  using (public.current_user_role() in ('mairie', 'admin'))
  with check (public.current_user_role() in ('mairie', 'admin'));


-- =============================================================================
-- 5. Bacs
-- =============================================================================

drop policy if exists "bacs_read" on public.bacs;
create policy "bacs_read"
  on public.bacs for select to authenticated
  using (
    exists (
      select 1 from public.menages m
      where m.id = bacs.menage_id and m.user_id = auth.uid()
    )
    or public.current_user_role() in ('mairie', 'admin', 'collecteur')
  );

drop policy if exists "bacs_write_ops" on public.bacs;
create policy "bacs_write_ops"
  on public.bacs for all to authenticated
  using (public.current_user_role() in ('mairie', 'admin', 'collecteur'))
  with check (public.current_user_role() in ('mairie', 'admin', 'collecteur'));


-- =============================================================================
-- 6. Tournées, scans, rapports QHSE — le poste de travail du collecteur
-- =============================================================================

drop policy if exists "tournees_read" on public.tournees;
create policy "tournees_read"
  on public.tournees for select to authenticated
  using (
    collecteur_user_id = auth.uid()
    or public.current_user_role() in ('mairie', 'admin')
  );

drop policy if exists "tournees_update_assigne" on public.tournees;
create policy "tournees_update_assigne"
  on public.tournees for update to authenticated
  using (collecteur_user_id = auth.uid())
  with check (collecteur_user_id = auth.uid());

drop policy if exists "tournees_write_mairie" on public.tournees;
create policy "tournees_write_mairie"
  on public.tournees for all to authenticated
  using (public.current_user_role() in ('mairie', 'admin'))
  with check (public.current_user_role() in ('mairie', 'admin'));

-- Scan : le collecteur n'écrit que sur SA tournée. Le ménage voit les passages
-- qui le concernent, ce qui rend le service vérifiable de son côté.
drop policy if exists "scans_read" on public.scans;
create policy "scans_read"
  on public.scans for select to authenticated
  using (
    exists (
      select 1 from public.tournees t
      where t.id = scans.tournee_id and t.collecteur_user_id = auth.uid()
    )
    or exists (
      select 1 from public.menages m
      where m.id = scans.menage_id and m.user_id = auth.uid()
    )
    or public.current_user_role() in ('mairie', 'admin')
  );

drop policy if exists "scans_insert_collecteur" on public.scans;
create policy "scans_insert_collecteur"
  on public.scans for insert to authenticated
  with check (
    exists (
      select 1 from public.tournees t
      where t.id = scans.tournee_id and t.collecteur_user_id = auth.uid()
    )
    or public.current_user_role() in ('mairie', 'admin')
  );

drop policy if exists "qhse_read" on public.rapports_qhse;
create policy "qhse_read"
  on public.rapports_qhse for select to authenticated
  using (
    collecteur_user_id = auth.uid()
    or public.current_user_role() in ('mairie', 'admin')
  );

drop policy if exists "qhse_insert_collecteur" on public.rapports_qhse;
create policy "qhse_insert_collecteur"
  on public.rapports_qhse for insert to authenticated
  with check (collecteur_user_id = auth.uid());


-- =============================================================================
-- 7. Recycleurs, marketplace, demandes, stock
-- =============================================================================

-- Annuaire des recycleurs : visible par les comptes connectés (les ménages
-- doivent pouvoir choisir à qui proposer leurs déchets triés).
drop policy if exists "recycleurs_read" on public.recycleurs;
create policy "recycleurs_read"
  on public.recycleurs for select to authenticated
  using (true);

drop policy if exists "recycleurs_write_own" on public.recycleurs;
create policy "recycleurs_write_own"
  on public.recycleurs for all to authenticated
  using (user_id = auth.uid() or public.current_user_role() in ('mairie', 'admin'))
  with check (user_id = auth.uid() or public.current_user_role() in ('mairie', 'admin'));

-- Correctif : la politique de lecture de la marketplace créée par setup_all.sql
-- utilise `using (true)` SANS restriction de rôle, ce qui l'ouvre aussi au rôle
-- `anon`. Le commentaire d'origine disait « toute personne authentifiée » :
-- on remet le code en accord avec l'intention.
drop policy if exists "articles_marketplace_public_read" on public.articles_marketplace;
create policy "articles_marketplace_public_read"
  on public.articles_marketplace for select to authenticated
  using (true);

drop policy if exists "demandes_read" on public.demandes_collecte;
create policy "demandes_read"
  on public.demandes_collecte for select to authenticated
  using (
    demandeur_user_id = auth.uid()
    or exists (
      select 1 from public.recycleurs r
      where r.id = demandes_collecte.recycleur_id and r.user_id = auth.uid()
    )
    or public.current_user_role() in ('mairie', 'admin')
  );

drop policy if exists "demandes_insert_demandeur" on public.demandes_collecte;
create policy "demandes_insert_demandeur"
  on public.demandes_collecte for insert to authenticated
  with check (demandeur_user_id = auth.uid());

drop policy if exists "demandes_update_recycleur" on public.demandes_collecte;
create policy "demandes_update_recycleur"
  on public.demandes_collecte for update to authenticated
  using (
    exists (
      select 1 from public.recycleurs r
      where r.id = demandes_collecte.recycleur_id and r.user_id = auth.uid()
    )
    or public.current_user_role() in ('mairie', 'admin')
  );

drop policy if exists "stock_read" on public.mouvements_stock;
create policy "stock_read"
  on public.mouvements_stock for select to authenticated
  using (
    created_by_user_id = auth.uid()
    or exists (
      select 1 from public.recycleurs r
      where r.id = mouvements_stock.destination_recycleur_id and r.user_id = auth.uid()
    )
    or public.current_user_role() in ('mairie', 'admin')
  );

drop policy if exists "stock_insert" on public.mouvements_stock;
create policy "stock_insert"
  on public.mouvements_stock for insert to authenticated
  with check (
    created_by_user_id = auth.uid()
    and public.current_user_role() in ('mairie', 'admin', 'enterprise', 'collecteur')
  );


-- =============================================================================
-- 8. Gamification — chacun la sienne
-- =============================================================================

drop policy if exists "gamification_read_own" on public.profils_gamification;
create policy "gamification_read_own"
  on public.profils_gamification for select to authenticated
  using (
    user_id = auth.uid()
    or public.current_user_role() in ('mairie', 'admin')
  );

drop policy if exists "gamification_write_own" on public.profils_gamification;
create policy "gamification_write_own"
  on public.profils_gamification for all to authenticated
  using (user_id = auth.uid() or public.current_user_role() in ('mairie', 'admin'))
  with check (user_id = auth.uid() or public.current_user_role() in ('mairie', 'admin'));


-- =============================================================================
-- 9. Contrôle : aucune table applicative ne doit rester sans RLS ni politique
-- =============================================================================
-- Exécuter cette requête après coup. Elle doit renvoyer ZÉRO ligne.
-- (`spatial_ref_sys`, installée par PostGIS, est écartée : elle appartient à
--  l'extension, on ne peut pas lui appliquer de RLS et ce n'est pas un défaut.)

--  select c.relname as table_sans_protection,
--         c.relrowsecurity as rls_active,
--         count(p.polname) as nb_politiques
--    from pg_class c
--    join pg_namespace n on n.oid = c.relnamespace
--    left join pg_policy p on p.polrelid = c.oid
--   where n.nspname = 'public' and c.relkind = 'r'
--     and not exists (select 1 from pg_depend d
--                      where d.objid = c.oid and d.deptype = 'e')
--   group by c.relname, c.relrowsecurity
--  having c.relrowsecurity = false or count(p.polname) = 0
--   order by 1;


-- =============================================================================
-- 10. Élévation de privilèges — fermeture des deux chemins
-- =============================================================================
--
-- Chemin A : `handle_new_user()` recopiait tel quel le rôle transmis dans les
--   métadonnées d'inscription. Or ces métadonnées viennent du client : il
--   suffisait d'appeler l'API d'inscription avec la clé anon (publique) en
--   demandant `role = 'admin'`. Le formulaire n'y est pour rien, le corriger
--   n'aurait rien fermé.
--
-- Chemin B : la politique `profiles_update_own` autorisait l'UPDATE de sa
--   propre ligne sans `with check` ni restriction de colonne. Un seul appel
--   REST suffisait à se promouvoir :
--       patch /rest/v1/profiles?id=eq.<moi>   {"role":"admin"}
--   C'est le plus grave des deux, et il est impossible à corriger côté
--   interface : seule la base peut refuser.
--
-- Enjeu : toutes les politiques écrites plus haut s'appuient sur
-- `current_user_role()`. Si le rôle est auto-attribuable, elles ne protègent
-- rien.
-- =============================================================================

-- --- A. L'inscription publique ne peut plus accorder que des rôles sans pouvoir

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_demande text := new.raw_user_meta_data ->> 'role';
  v_role    user_role;
begin
  -- Seuls ces rôles s'obtiennent en s'inscrivant soi-même. `collecteur`,
  -- `mairie` et `admin` s'attribuent, ils ne se demandent pas : ils donnent
  -- accès aux données des ménages, aux tournées et aux encaissements.
  -- Toute autre valeur — y compris une valeur forgée — retombe sur 'citoyen'.
  if v_demande in ('citoyen', 'enterprise') then
    v_role := v_demande::user_role;
  else
    v_role := 'citoyen';
  end if;

  insert into public.profiles (id, email, nom_complet, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nom_complet', split_part(new.email, '@', 1)),
    v_role
  );
  return new;
end $$;

-- --- B. Le rôle d'un profil ne peut plus être modifié par son porteur

create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_claims jsonb;
begin
  if new.role is not distinct from old.role then
    return new;                        -- pas de changement de rôle : rien à contrôler
  end if;

  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    v_claims := null;
  end;

  -- Connexion SQL directe (SQL Editor, migrations, maintenance) : pas de jeton
  -- de requête. Y accéder suppose déjà le mot de passe de la base.
  if v_claims is null then
    return new;
  end if;

  -- Clé serveur (service_role), jamais exposée au navigateur.
  if (v_claims ->> 'role') = 'service_role' then
    return new;
  end if;

  -- Un administrateur déjà en place peut promouvoir.
  if public.current_user_role() = 'admin' then
    return new;
  end if;

  raise exception
    'Changement de rôle refusé (% : % -> %). Un rôle se promeut côté serveur, jamais par le porteur du compte.',
    new.id, old.role, new.role
    using errcode = '42501';
end $$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update of role on public.profiles
  for each row execute function public.guard_profile_role();

-- --- B bis. La politique d'UPDATE reçoit le `with check` qui lui manquait

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- --- Promotion : le chemin légitime, tracé et réservé
-- À exécuter depuis le SQL Editor (ou avec la clé service_role).

create or replace function public.promouvoir_utilisateur(p_email text, p_role user_role)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select id into v_id from public.profiles where lower(email) = lower(p_email);
  if v_id is null then
    raise exception 'Aucun profil pour %', p_email using errcode = 'P0002';
  end if;
  update public.profiles set role = p_role where id = v_id;
  raise notice 'Profil % promu au rôle %', p_email, p_role;
end $$;

revoke all on function public.promouvoir_utilisateur(text, user_role) from public, anon, authenticated;

-- Exemple :
--   select public.promouvoir_utilisateur('demo.mairie@myklintown.cm', 'mairie');
