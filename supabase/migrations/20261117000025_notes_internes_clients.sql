-- =============================================================================
-- MyKlinTown — Notes internes du précollecteur : hors de la fiche lue par
-- l'abonné
-- =============================================================================
-- Revue du 10/11/2026 (suite).
--
-- L'abonné lit sa propre fiche client. Les « notes internes » du précollecteur
-- s'y trouvaient : elles passent dans une table à part, `clients_notes`, lue
-- par l'équipe de l'entreprise et écrite par son gérant.
--
--   • les notes existantes y sont copiées, puis retirées des fiches ;
--   • une note écrite sur la fiche (par l'application, ou à l'acceptation d'un
--     devis) y est déplacée dans la même transaction : l'abonné ne la voit
--     jamais, et l'application d'avant comme celle d'après fonctionnent.
--
-- Additive et rejouable. À jouer APRÈS 20261116000024 ; « OK » sur les lignes
-- 1 à 3 du contrôle ; la ligne 4 est une information.
-- =============================================================================

begin;

-- =============================================================================
-- 0. Migrations préalables
-- =============================================================================
do $$
begin
  if to_regprocedure('public.contour_zone_valide(jsonb)') is null then
    raise exception 'Migration à jouer d''abord : 20261116000024_zones_depots_dossier (et les précédentes)'
      using hint = 'Rien n''a été modifié. Contrôle complet : supabase/EMPREINTE_SCHEMA.sql';
  end if;
end $$;

-- =============================================================================
-- 1. Table des notes internes
-- =============================================================================
create table if not exists public.clients_notes (
  client_id uuid primary key references public.clients(id) on delete cascade,
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  notes text not null check (char_length(notes) between 1 and 4000),
  updated_at timestamptz not null default now()
);
create index if not exists clients_notes_entreprise_idx on public.clients_notes (entreprise_id);

alter table public.clients_notes enable row level security;
revoke all on public.clients_notes from anon;
grant select, insert, update, delete on public.clients_notes to authenticated;

-- Lecture : l'équipe de l'entreprise. Écriture : son gérant, pour ses clients.
drop policy if exists clients_notes_lecture on public.clients_notes;
create policy clients_notes_lecture on public.clients_notes for select to authenticated
  using (public.est_membre(entreprise_id) or public.est_admin());

drop policy if exists clients_notes_ecriture on public.clients_notes;
create policy clients_notes_ecriture on public.clients_notes for all to authenticated
  using (public.est_gerant(entreprise_id) or public.est_admin())
  with check (
    (public.est_gerant(entreprise_id) or public.est_admin())
    and exists (select 1 from public.clients c
                where c.id = clients_notes.client_id and c.entreprise_id = clients_notes.entreprise_id)
  );

drop trigger if exists clients_notes_updated_at on public.clients_notes;
create trigger clients_notes_updated_at before update on public.clients_notes
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 2. Une note écrite sur la fiche est déplacée
-- =============================================================================
-- Une note vide ou absente ne change rien : pour retirer une note, on supprime
-- sa ligne dans `clients_notes`.
create or replace function public.clients_notes_deplacer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.notes is not null then
    if btrim(new.notes) <> '' then
      insert into public.clients_notes (client_id, entreprise_id, notes)
      values (new.id, new.entreprise_id, left(btrim(new.notes), 4000))
      on conflict (client_id) do update
        set notes = excluded.notes, entreprise_id = excluded.entreprise_id;
    end if;
    update public.clients set notes = null where id = new.id;
  end if;
  return null;
end $$;

revoke all on function public.clients_notes_deplacer() from public, anon, authenticated;

drop trigger if exists clients_notes_deplacer on public.clients;
create trigger clients_notes_deplacer after insert or update of notes on public.clients
  for each row execute function public.clients_notes_deplacer();

-- =============================================================================
-- 3. Notes existantes : copiées, puis retirées des fiches
-- =============================================================================
insert into public.clients_notes (client_id, entreprise_id, notes)
select c.id, c.entreprise_id, left(btrim(c.notes), 4000)
from public.clients c
where c.notes is not null and btrim(c.notes) <> ''
on conflict (client_id) do nothing;

-- Fiche par fiche : une fiche qu'une autre règle empêcherait de modifier ne
-- bloque pas les autres ; le contrôle la signale.
do $$
declare
  v_client uuid;
begin
  for v_client in select id from public.clients where notes is not null loop
    begin
      update public.clients set notes = null where id = v_client;
    exception when others then
      raise notice 'Note non retirée de la fiche % : %', v_client, sqlerrm;
    end;
  end loop;
end $$;

commit;

-- =============================================================================
-- Contrôle (à lire dans le résultat) : « OK » sur les lignes 1 à 3.
-- =============================================================================
select controle, case when ok is null then 'INFO' when ok then 'OK' else 'À VÉRIFIER' end as resultat, detail
from (
  select 1 as n, 'Notes internes dans une table réservée à l''équipe' as controle,
         (select relrowsecurity from pg_class where oid = 'public.clients_notes'::regclass)
         and not has_table_privilege('anon', 'public.clients_notes', 'select')
         and (select count(*) = 2 from pg_policies
               where schemaname = 'public' and tablename = 'clients_notes'
                 and policyname in ('clients_notes_lecture', 'clients_notes_ecriture')) as ok,
         'lecture : équipe de l''entreprise ; écriture : gérant' as detail
  union all
  select 2, 'Une note écrite sur la fiche est déplacée',
         exists (select 1 from pg_trigger
                  where tgrelid = 'public.clients'::regclass and tgname = 'clients_notes_deplacer' and not tgisinternal),
         'dans la même transaction'
  union all
  select 3, 'Aucune note ne reste sur les fiches lues par les abonnés',
         not exists (select 1 from public.clients where notes is not null),
         (select count(*) || ' fiche(s) portent encore une note' from public.clients where notes is not null)
  union all
  select 4, 'Notes internes conservées',
         null::boolean,
         (select count(*) || ' note(s)' from public.clients_notes)
) x order by n;
