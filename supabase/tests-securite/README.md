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

**Ajouter une migration** : rien à faire, elle est rejouée automatiquement. Si elle
crée une table sans RLS, une fonction `security definer` sans `search_path` ou
ouverte aux visiteurs, ou une politique d'écriture pour `anon`, la CI échoue.

**Ajouter une fonctionnalité sensible** : ajouter son attaque dans `ATTAQUES` et son
usage normal dans `PARCOURS`.

Migration jouée en production mais pas encore fusionnée (branche ouverte) :
`MIGRATIONS_EN_PLUS=chemin/vers/fichier.sql npm test`.

Limite connue : ici le compte qui installe PostGIS est superutilisateur, ce qui
n'est pas le cas sur Supabase. Le test « spatial_ref_sys quand on n'en est pas
propriétaire » rejoue donc à part le montage réel.
