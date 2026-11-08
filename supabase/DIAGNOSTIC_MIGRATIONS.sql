-- =============================================================================
-- MyKlinTown — Quelles migrations sont jouées sur cette base ?
-- =============================================================================
-- Lecture seule : ne modifie rien. À coller dans le SQL Editor AVANT de jouer
-- une nouvelle migration. Chaque migration suppose les précédentes : elles se
-- jouent dans l'ordre des numéros, sans en sauter.
-- =============================================================================
select m.migration,
       case when m.jouee then 'jouée' else 'ABSENTE' end as etat
from (values
  (-3, '20261006000008_paiement_en_ligne',
      to_regclass('public.paiements_en_ligne') is not null),
  (-2, '20261011000009_audit_securite',
      to_regclass('securite.politiques_restreintes') is not null),
  (-1, '20261012000010_terrain_hors_ligne',
      to_regprocedure('public.heure_terrain(timestamp with time zone)') is not null),
  (0, '20261013000011_indicateurs_pilote',
      to_regclass('public.couts_exploitation') is not null),
  (1, '20261013000012_codes_agrement',
      to_regclass('public.codes_agrement') is not null),
  (2, '20261019000013_delai_grace_blocage',
      to_regprocedure('public.parametre_entier(text, integer)') is not null),
  (3, '20261019000014_charte_facture_conforme',
      to_regclass('public.documents_legaux') is not null
      and exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'entreprises' and column_name = 'niu')),
  (4, '20261019000015_nettoyage_demo_douala',
      to_regclass('securite.roles_retires') is not null),
  (5, '20261019000016_mairie_par_commune',
      to_regclass('public.mairie_communes') is not null),
  (6, '20261109000017_dossier_precollecteur_annuaire',
      to_regclass('public.entreprise_communes') is not null),
  (7, '20261110000018_devis_tarif_abonne',
      to_regclass('public.demandes_devis') is not null)
) as m(n, migration, jouee)
order by m.n;
