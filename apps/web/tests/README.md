# Tests MyKlinTown

Trois étages, du plus rapide au plus complet.

| Commande (depuis `apps/web`) | Quoi | Durée | Touche la base ? |
|---|---|---|---|
| `pnpm test` | **Unitaires** : montants, dates, périodes de facture, relances, rôles, codes QR, zones, erreurs réseau | secondes | non |
| `pnpm test:integration` | **Sécurité (RLS)** table par table et rôle par rôle, avec témoins positifs ; facturation ; terrain ; parcours entre acteurs | ~3 min | **base de test** (CI) |
| `pnpm test:e2e` | **Navigateur réel** : parcours complets, caméra simulée (scan QR, photo, vidéo), accès, téléphone | ~20–35 min (build compris) | **base de test** (CI) |
| `pnpm test:tout` | Les trois + types + build | ~40 min | base de test |

## Première installation

```bash
cd apps/web && pnpm install            # Vitest est dans apps/web
cd ../../e2e && pnpm install --ignore-workspace
```

Playwright vit dans `e2e/`, **hors** de l'espace de travail pnpm : placé dans `apps/web`, il est un
« pair optionnel » de Next.js et forçait pnpm à dupliquer Next.js (≈100 Mo à retélécharger).

## La base de test (depuis le 18/10/2026 : base éphémère, en CI)

Les tests ne touchent **jamais la vraie base**. Le projet Supabase de test `myklintown-tests` a été
supprimé (quota du plan gratuit). La base de test est désormais une **base Supabase locale et
éphémère**, créée par la CLI Supabase dans GitHub Actions (`.github/workflows/tests-base.yml`,
« Tests sur base éphémère ») :

- **Quand** : à chaque pull request et à chaque push sur `main`. Deux tâches tournent en parallèle,
  « Intégration » et « Navigateur (e2e) », chacune avec **sa propre base neuve**.
- **Structure** : la CLI rejoue **toutes les migrations** de `supabase/migrations/`, dans l'ordre
  (`supabase start`, réglages dans `supabase/config.toml`). `seed.sql` n'est pas rejoué. Une
  migration qui ne passe pas fait échouer la CI **avant** d'être jouée en production.
- **Clés** : `apps/web/.env.test.local` est écrit à la volée avec les clés de cette base locale.
  Ce sont les clés publiques de la CLI : aucun secret GitHub n'est nécessaire.
- Les comptes « admin » et « mairie » de test y sont **promus automatiquement** : aucun test Mairie
  ignoré.
- Ni pause, ni quota, ni projet à réveiller.

**Lancer à la main** (une autre branche, un commit précis) : GitHub → *Actions* → « Tests sur base
éphémère » → *Run workflow*, champ « ref » ; ou `gh workflow run tests-base.yml -f ref=<branche>`.

**Lire un échec** : le journal de la tâche. Les journaux de la base (Postgres, Auth, REST, Storage)
s'affichent en fin de tâche. Pour le navigateur, l'artefact **`rapport-playwright`** (rapport HTML
avec traces et captures, gardé 7 jours) : le télécharger, puis
`npx playwright show-report <dossier>`.

**Sur ce poste**, pas de base de test locale (ni Docker ni CLI Supabase) : `pnpm test:integration`
et `pnpm test:e2e` ne se lancent plus en local. Un ancien `apps/web/.env.test.local` qui vise
encore `myklintown-tests` ne donne que des « fetch failed » : le supprimer. Les tests refusent
alors clairement de démarrer. Pour retrouver les tests en local : installer Docker Desktop, puis
depuis la racine `npx supabase start` (mêmes migrations, ports 54321/54322) et recopier les valeurs
de `npx supabase status -o env` dans `apps/web/.env.test.local` :

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>
SUPABASE_SECRET_KEY=<SERVICE_ROLE_KEY>
NEXT_PUBLIC_SITE_URL=http://localhost:3100
```

**Garde-fou** (`tests/support/fixtures.ts`) : sans ce fichier, les tests refusent de démarrer.
Ils refusent aussi un fichier qui viserait la production : le projet du pilote est reconnu à son
identifiant, même sans `.env.local` (worktree, CI), et une copie de `.env.local` est reconnue à son
hôte (une barre finale ne trompe pas la comparaison).

**Exceptionnellement sur la vraie base** (vérifier une migration qu'on vient d'y jouer) :
`TESTS_SUR_PROD=1 pnpm test:integration` ; contre le site en ligne :
`TESTS_SUR_PROD=1 E2E_BASE_URL=https://myklintown-web.vercel.app pnpm test:e2e`. Les comptes
`mkt.test.…` sont alors recréés dans la vraie base, sans rôle admin ni Mairie : passer
`supabase/NETTOYAGE_TESTS.sql` ensuite.

## Prérequis

- `test:e2e` construit l'application branchée sur la base de test dans `apps/web/.next-tests`
  (le build habituel `.next` n'est pas touché), puis la lance sur le port **3100** (jamais sur un
  serveur de développement déjà ouvert). `E2E_SANS_BUILD=1` réutilise le dernier build de test.
- Ne pas lancer `test:integration` et `test:e2e` **en même temps sur une même base** : ils
  remettent à zéro les mêmes comptes de test. (En CI, chaque suite a sa propre base.)

## Comptes de test

Créés automatiquement : `mkt.test.<clé>.<suffixe>@gmail.com`. Identifiants dans
`apps/web/tests/.fixtures.test.local.json` (base de test) ou `.fixtures.local.json` (vraie base,
`TESTS_SUR_PROD=1`) — **ignorés par git**, le dépôt est public.
Chaque exécution remet à zéro les deux entreprises de test (« Test Propreté A », « Test
Concurrent B ») et clôt leurs anciens incidents. Les zones de test sont tracées **en mer, au large
de Kribi** : aucun vrai ménage ne peut y tomber.

**Mairie et administrateur** : promus automatiquement sur la base de test. Sur la vraie base
(`TESTS_SUR_PROD=1`), ces tests sont ignorés : on n'y crée plus de compte de test à rôle élevé.

**Retours d'équipe** (liste d'attente des ménages hors zone, accès Mairie sur demande) : ces tests
sont ignorés, avec la consigne, tant que `supabase/migrations/20261004000006_retours_tests_equipe.sql`
n'est pas exécutée. Les demandes de test sont déposées **en mer** et retirées en fin de test.

**Espace employé** (`20261005000007_espace_employe.sql`) : le compte de test `mkt.test.employe.…`
rejoint l'entreprise A par une vraie invitation, puis perd son accès en fin de parcours. La remise à
zéro de l'entreprise A supprime ses fiches employé, ce qui libère le compte (déclencheur en base) :
chaque exécution repart d'un compte ménage ordinaire. Tests ignorés, avec la consigne, tant que la
migration n'est pas exécutée.

**Paiement en ligne** (`20261006000008_paiement_en_ligne.sql`) : les tests navigateur tournent en
**mode simulation** (`PAIEMENT_SIMULATION=1`, posé par `e2e/playwright.config.ts` ; jamais actif sur
Vercel, production comme préversion) : un numéro finissant par `000001` a un « solde insuffisant », les autres paient au
bout de 5 s. Ils demandent aussi la « secret key » du **projet de test** dans
`apps/web/.env.test.local` (`SUPABASE_SECRET_KEY=sb_secret_…`, la même qui sert à créer les
comptes) : sans elle, ils sont ignorés avec la consigne. Ils ne tournent jamais contre la
production (la clé de `.env.local` n'est pas lue).

**Nettoyage** : `supabase/NETTOYAGE_TESTS.sql` supprime tous les comptes `mkt.test.…` et leurs
données (y compris la promotion Mairie, à refaire ensuite).

## Caméra simulée

Chromium reçoit une caméra factice qui filme un QR code (`e2e/.media/qr.y4m`, fabriqué à chaque
lancement). Scan en tournée, photo et vidéo de preuve sont testés de bout en bout, sans téléphone.
Ce que ça ne remplace pas : un essai sur de vrais téléphones Android d'entrée de gamme, en plein soleil.

## Règles de la suite navigateur

- Un test **échoue** si la page produit la moindre erreur JavaScript ou erreur console.
  **Une seule exception, connue et ouverte** : l'erreur d'hydratation React **#418**. Intermittente
  (1 à 3 fois par exécution complète, 0 sur 65 chargements isolés en développement comme en
  production), sans effet fonctionnel : React reconstruit la page dans le navigateur et le test
  vérifie ensuite que tout fonctionne. Elle est **signalée** (annotation dans le rapport + ligne
  `⚠️ Hydratation #418` dans la sortie) au lieu de faire échouer le test : dans un groupe de tests
  enchaînés, un échec fait sauter tous les suivants.
- **À ne pas réintroduire** (mesuré le 04/10/2026) : des fichiers `loading.tsx` (21 changements de
  filtre ou d'onglet perdus sur 30 avec, 0 sur 30 sans) et le middleware en `runtime: 'nodejs'`
  (pages figées après un enregistrement). Le retour visuel de chargement passe par
  `components/ui/barre-navigation.tsx`.
- Une **reprise** automatique absorbe une coupure réseau ponctuelle ; un test repris est signalé
  « flaky » dans le rapport (`e2e/playwright-report/`) — rien n'est masqué.

## Intégration continue

- `.github/workflows/verification.yml` : à chaque push et pull request, types + tests unitaires +
  build, et le banc hors ligne de la base (`supabase/tests-securite`, PGlite).
- `.github/workflows/tests-base.yml` : à chaque pull request et push sur `main`, intégration et
  navigateur sur une base Supabase éphémère (voir « La base de test »).
