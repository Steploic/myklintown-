# Tests de sécurité de la base (hors ligne)

Toutes les migrations de `supabase/migrations/` sont rejouées sur une copie locale
de Postgres — [PGlite](https://pglite.dev) avec PostGIS — habillée comme Supabase
(rôles `anon` / `authenticated` / `service_role`, `auth.uid()`, stockage). Aucune
connexion à la vraie base, aucune donnée de production.

```bash
npm ci
npm test              # attaques refusées, parcours normaux, invariants (≈ 1 min)
npm run avant-apres   # chaque attaque jouée SANS puis AVEC la migration d'audit
```

| Fichier | Contenu |
|---|---|
| `banc.mjs` | la base locale, l'habillage Supabase, `comme(db, qui, …)` pour jouer une requête en tant que visiteur anonyme, compte connecté ou clé service |
| `scenario.mjs` | deux précollecteurs concurrents, la Mairie, un admin, des ménages, un employé ; le catalogue d'**attaques** (`true` = faille ouverte) et de **parcours** normaux |
| `securite.test.mjs` | la suite lancée par la CI (job `securite-base`) |
| `empreinte.mjs` · `empreinte.test.mjs` | l'empreinte attendue du schéma et le script de contrôle de la production qu'elle génère ; ses tests (à jour, muet sur une base conforme, précis sur une migration manquante ou une retouche à la main) |
| `indicateurs.test.mjs` | les 8 indicateurs du pilote vérifiés **au chiffre près** sur un jeu de données construit à la main (un ménage par règle : délai de grâce, paiement après le jour de mesure, démo, résilié…), les relevés historisés et leurs droits |

**Ajouter une migration** : elle est rejouée automatiquement. Si elle
crée une table sans RLS, une fonction `security definer` sans `search_path` ou
ouverte aux visiteurs, ou une politique d'écriture pour `anon`, la CI échoue.
Puis `npm run empreinte` : régénère `supabase/EMPREINTE_SCHEMA.sql` (la CI échoue
tant qu'il n'est pas à jour).

**Contrôler la production** (`empreinte.mjs`, `empreinte.test.mjs`) : les migrations
rejouées une à une donnent l'empreinte attendue du schéma (fonctions, tables et vues,
politiques, déclencheurs, index, contraintes, types, stockage), embarquée dans
`supabase/EMPREINTE_SCHEMA.sql`. Ce script, en lecture seule, se colle dans le SQL
Editor : « OK », ou un écart par ligne (ABSENT, DIFFÉRENT, EN PLUS) rattaché à la
migration en cause. Il complète `supabase/DIAGNOSTIC_MIGRATIONS.sql`, qui ne teste
qu'un objet par migration. La CI le passe aussi sur une base Supabase neuve
(job « Intégration ») : il doit y répondre « OK ».

**Ajouter une fonctionnalité sensible** : ajouter son attaque dans `ATTAQUES` et son
usage normal dans `PARCOURS`.

Migration jouée en production mais pas encore fusionnée (branche ouverte) :
`MIGRATIONS_EN_PLUS=chemin/vers/fichier.sql npm test`.

Limite connue : ici le compte qui installe PostGIS est superutilisateur, ce qui
n'est pas le cas sur Supabase. Le test « spatial_ref_sys quand on n'en est pas
propriétaire » rejoue donc à part le montage réel.
