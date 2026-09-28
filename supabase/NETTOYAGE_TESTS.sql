-- =============================================================================
-- MyKlinTown — Nettoyage des comptes et données de TEST
-- =============================================================================
-- Supprime tout ce qu'ont créé les tests automatisés :
--   • comptes « mkt.test.…@gmail.com » (tests du pivot, 28/09/2026)
--   • compte « smoketest.a-supprimer.…@gmail.com » (smoke-test du 31/08/2026)
--   • leurs entreprises (et en cascade : clients, factures, paiements,
--     relances, flotte, tournées, collectes, incidents, affectations)
--   • les zones « Zone test … »
--
-- Ne touche à AUCUN autre compte. Section 0 = aperçu (lecture seule) : lancez-la
-- d'abord seule si vous voulez voir ce qui va partir.
-- =============================================================================

-- 0. Aperçu -------------------------------------------------------------------
select u.email, p.role, e.nom as entreprise
from auth.users u
left join public.profiles p on p.id = u.id
left join public.entreprise_membres m on m.user_id = u.id
left join public.entreprises e on e.id = m.entreprise_id
where u.email like 'mkt.test.%@gmail.com'
   or u.email like 'smoketest.a-supprimer.%@gmail.com'
order by u.email;

-- 1. Preuves photo déposées par les tests (le stockage peut refuser la
--    suppression directe : dans ce cas on continue, ce sont 2 images de 150 o).
do $$
begin
  delete from storage.objects
  where bucket_id = 'preuves'
    and split_part(name, '/', 2) in (
      select id::text from auth.users
      where email like 'mkt.test.%@gmail.com' or email like 'smoketest.a-supprimer.%@gmail.com'
    );
exception when others then
  raise notice 'Preuves de test non supprimées (%). Sans conséquence.', sqlerrm;
end $$;

-- 2. Entreprises de test (tout le reste suit par cascade).
delete from public.entreprises
where id in (
  select m.entreprise_id
  from public.entreprise_membres m
  join auth.users u on u.id = m.user_id
  where u.email like 'mkt.test.%@gmail.com'
);

-- 3. Zones de test.
delete from public.zones where nom like 'Zone test %';

-- 4. Comptes de test (profils et signalements suivent par cascade).
delete from auth.users
where email like 'mkt.test.%@gmail.com'
   or email like 'smoketest.a-supprimer.%@gmail.com';

-- 5. Contrôle : doit renvoyer 0.
select count(*) as comptes_de_test_restants
from auth.users
where email like 'mkt.test.%@gmail.com' or email like 'smoketest.a-supprimer.%@gmail.com';
