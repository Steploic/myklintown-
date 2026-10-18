# Tests MyKlinTown

Trois étages, du plus rapide au plus complet.

| Commande (depuis `apps/web`) | Quoi | Durée | Touche la base ? |
|---|---|---|---|
| `pnpm test` | **Unitaires** : montants, dates, périodes de facture, relances, rôles, codes QR, zones, erreurs réseau | secondes | non |
| `pnpm test:integration` | **Sécurité (RLS)** table par table et rôle par rôle, avec témoins positifs ; facturation ; terrain ; parcours entre acteurs | ~3 min | **base de test** |
| `pnpm test:e2e` | **Navigateur réel** : parcours complets, caméra simulée (scan QR, photo, vidéo), accès, téléphone | ~20–35 min (build compris) | **base de test** |
| `pnpm test:tout` | Les trois + types + build | ~40 min | base de test |

## Première installation

```bash
cd apps/web && pnpm install            # Vitest est dans apps/web
cd ../../e2e && pnpm install --ignore-workspace
```

Playwright vit dans `e2e/`, **hors** de l'espace de travail pnpm : placé dans `apps/web`, il est un
« pair optionnel » de Next.js et forçait pnpm à dupliquer Next.js (≈100 Mo à retélécharger).

## La base de test (depuis le 11/10/2026)

Les tests ne touchent **plus la vraie base** : ils tournent sur un projet Supabase séparé,
**`myklintown-tests`**, dont les clés sont dans `apps/web/.env.test.local` (ignoré par git) :

```
NEXT_PUBLIC_SUPABASE_URL=https://<projet-de-test>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_…
SUPABASE_SECRET_KEY=sb_secret_…
NEXT_PUBLIC_SITE_URL=http://localhost:3100
```

- **Sans ce fichier, les tests refusent de démarrer** ; un fichier qui pointerait sur la production
  est refusé aussi.
- La structure de la base de test = toutes les migrations de `supabase/migrations/`, collées dans
  l'ordre dans le SQL Editor **du projet de test**. Une nouvelle migration se joue sur la base de
  test **avant** la production.
- Les comptes « admin » et « mairie » de test y sont **promus automatiquement** (clé secrète du
  projet de test) : plus aucun test Mairie ignoré.
- Plan gratuit : le projet de test se met **en pause après 7 jours sans activité**. Tests en échec
  « fetch failed » → Supabase → projet `myklintown-tests` → *Resume project*.

**Exceptionnellement sur la vraie base** (vérifier une migration qu'on vient d'y jouer) :
`TESTS_SUR_PROD=1 pnpm test:integration` ; contre le site en ligne :
`TESTS_SUR_PROD=1 E2E_BASE_URL=https://myklintown-web.vercel.app pnpm test:e2e`. Les comptes
`mkt.test.…` sont alors recréés dans la vraie base, sans rôle admin ni Mairie : passer
`supabase/NETTOYAGE_TESTS.sql` ensuite.

## Prérequis

- `test:e2e` construit l'application branchée sur la base de test dans `apps/web/.next-tests`
  (le build habituel `.next` n'est pas touché), puis la lance sur le port **3100** (jamais sur un
  serveur de développement déjà ouvert). `E2E_SANS_BUILD=1` réutilise le dernier build de test.
- Ne pas lancer `test:integration` et `test:e2e` **en même temps** : ils remettent à zéro les
  mêmes comptes de test.

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

`.github/workflows/verification.yml` : à chaque push et pull request, types + tests unitaires +
build. Les tests d'intégration et navigateur tournent en local (ils écrivent dans la base du pilote).
