-- =============================================================================
-- MyKlinTown — Facturation : ni trop-perçu, ni facture en double
-- =============================================================================
-- Revue du 09/11/2026 :
--   • un encaissement saisi par le gérant n'avait pas de plafond : 35 000 au
--     lieu de 3 500 réglait la facture et gonflait le chiffre du mois, sans un
--     mot (seules les espèces de terrain étaient plafonnées) ;
--   • deux factures « émises » pouvaient coexister pour un même abonné (deux
--     onglets, ou « Générer » pendant une émission à la main) : il devait le
--     double et, blocage au passage allumé, risquait de ne plus être servi.
--
-- Désormais :
--   • un encaissement saisi depuis l'application ne dépasse jamais le reste dû
--     de sa facture (encaissements validés et espèces à valider déduits). Les
--     fonctions contrôlées gardent leurs propres règles : les espèces de terrain
--     étaient déjà plafonnées, et un paiement Mobile Money confirmé par Notch
--     Pay est toujours enregistré (l'argent est reçu) ;
--   • une seule facture « émise » à la fois par abonné (démonstration exceptée).
--
-- Additive et rejouable. Si des abonnés ont DÉJÀ plusieurs factures émises, elle
-- s'arrête sans rien modifier et donne la requête qui les retrouve : annuler les
-- factures en trop (avec un motif), puis la rejouer.
-- À jouer dans le SQL Editor APRÈS 20261111000019 ; « OK » sur les lignes 1 à 3.
-- =============================================================================

begin;

-- =============================================================================
-- 0. Migrations préalables
-- =============================================================================
do $$
begin
  if to_regprocedure('public.demandes_devis_a_orienter()') is null then
    raise exception 'Migration à jouer d''abord : 20261111000019_devis_routage (et les précédentes)'
      using hint = 'Rien n''a été modifié. Contrôle complet : supabase/EMPREINTE_SCHEMA.sql';
  end if;
end $$;

-- =============================================================================
-- 1. Pas d'encaissement au-delà du reste dû
-- =============================================================================
-- SECURITY INVOKER, comme les autres gardes : elle doit voir QUI écrit
-- (`current_user`). Un gérant voit toutes les factures et tous les paiements de
-- son entreprise : le calcul est complet.
create or replace function public.paiements_clients_plafond() returns trigger
language plpgsql set search_path = public as $$
declare
  v_montant int;
  v_deja int;
begin
  -- Fonctions contrôlées (espèces de terrain, validation, paiement en ligne),
  -- clé service, administrateur : leurs propres règles s'appliquent.
  if current_user not in ('anon', 'authenticated') or public.est_admin() then
    return new;
  end if;
  if new.statut not in ('valide', 'a_valider') then
    return new;
  end if;
  -- Verrou sur la facture : deux saisies simultanées ne passent pas toutes les deux.
  select f.montant_fcfa into v_montant from public.factures f where f.id = new.facture_id for update;
  if not found then
    raise exception 'Facture introuvable' using errcode = '42501';
  end if;
  select coalesce(sum(p.montant_fcfa), 0) into v_deja
    from public.paiements_clients p
   where p.facture_id = new.facture_id and p.statut in ('valide', 'a_valider') and p.id <> new.id;
  if v_deja + new.montant_fcfa > v_montant then
    raise exception 'Montant supérieur au reste dû : il reste % FCFA à régler sur cette facture', greatest(v_montant - v_deja, 0);
  end if;
  return new;
end $$;

drop trigger if exists paiements_clients_plafond on public.paiements_clients;
create trigger paiements_clients_plafond before insert on public.paiements_clients
  for each row execute function public.paiements_clients_plafond();

-- =============================================================================
-- 2. Une seule facture « émise » à la fois par abonné
-- =============================================================================
do $$
declare v_doublons int;
begin
  select count(*) into v_doublons
    from (select client_id from public.factures
           where statut = 'emise' and not est_demo
           group by client_id having count(*) > 1) x;
  if v_doublons > 0 then
    raise exception '% abonné(s) ont déjà plusieurs factures « émises » : annulez celles en trop (avec un motif), puis rejouez cette migration', v_doublons
      using hint = 'Rien n''a été modifié. Les retrouver : select c.nom, f.numero, f.periode_debut, f.montant_fcfa from public.factures f join public.clients c on c.id = f.client_id where f.statut = ''emise'' and not f.est_demo and f.client_id in (select client_id from public.factures where statut = ''emise'' and not est_demo group by client_id having count(*) > 1) order by c.nom, f.periode_debut;';
  end if;
end $$;

create unique index if not exists factures_une_emise_par_client
  on public.factures (client_id) where statut = 'emise' and not est_demo;

-- =============================================================================
-- 3. Droits : la garde est un déclencheur, personne ne l'appelle
-- =============================================================================
revoke all on function public.paiements_clients_plafond() from public, anon, authenticated;

commit;

-- =============================================================================
-- Contrôle (à lire dans le résultat) : « OK » sur les lignes 1 à 3. La ligne 4
-- compte les factures déjà réglées au-delà de leur montant (avant ce correctif).
-- =============================================================================
select controle, case when ok then 'OK' else 'À VÉRIFIER' end as resultat, detail
from (
  select 1 as n, 'Encaissement saisi plafonné au reste dû' as controle,
         exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.paiements_clients'::regclass and t.tgname = 'paiements_clients_plafond'
                    and not t.tgisinternal) as ok,
         'espèces de terrain et paiement en ligne : leurs propres règles' as detail
  union all
  select 2, 'Une seule facture « émise » à la fois par abonné',
         exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
                  where c.relname = 'factures_une_emise_par_client' and i.indisunique and i.indisvalid),
         'index unique partiel (démonstration exceptée)'
  union all
  select 3, 'Aucun abonné avec plusieurs factures « émises »',
         not exists (select 1 from public.factures where statut = 'emise' and not est_demo
                      group by client_id having count(*) > 1),
         'l''application refuse désormais la seconde'
  union all
  select 4, 'Factures déjà réglées au-delà de leur montant (avant ce correctif)', true,
         (select count(*) || ' facture(s)'
            from (select f.id from public.factures f
                    join public.paiements_clients p on p.facture_id = f.id and p.statut = 'valide'
                   group by f.id, f.montant_fcfa having sum(p.montant_fcfa) > f.montant_fcfa) x)
) x order by n;
