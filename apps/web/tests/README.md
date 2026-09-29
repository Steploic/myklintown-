# Tests MyKlinTown

Trois étages, du plus rapide au plus complet.

| Commande (depuis `apps/web`) | Quoi | Durée | Touche la base ? |
|---|---|---|---|
| `pnpm test` | **Unitaires** : montants, dates, périodes de facture, relances, rôles, codes QR, zones, erreurs réseau | secondes | non |
| `pnpm test:integration` | **Sécurité (RLS)** table par table et rôle par rôle, avec témoins positifs ; facturation ; terrain ; parcours entre acteurs | ~2 min | **oui** |
| `pnpm test:e2e` | **Navigateur réel** : parcours complets, caméra simulée (scan QR, photo, vidéo), accès, téléphone | ~15–30 min | **oui** |
| `pnpm test:tout` | Les trois + types + build | ~30 min | oui |

## Première installation

```bash
cd apps/web && pnpm install            # Vitest est dans apps/web
cd ../../e2e && pnpm install --ignore-workspace
```

Playwright vit dans `e2e/`, **hors** de l'espace de travail pnpm : placé dans `apps/web`, il est un
« pair optionnel » de Next.js et forçait pnpm à dupliquer Next.js (≈100 Mo à retélécharger).

## Prérequis

- `apps/web/.env.local` avec `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `test:e2e` contre le build local : `pnpm build` d'abord ; le serveur est lancé sur le port **3100**
  (jamais sur un serveur de développement déjà ouvert).
- Contre un déploiement : `E2E_BASE_URL=https://myklintown-web.vercel.app pnpm test:e2e`.
- Ne pas lancer `test:integration` et `test:e2e` **en même temps** : ils remettent à zéro les
  mêmes comptes de test.

## Comptes de test

Créés automatiquement : `mkt.test.<clé>.<suffixe>@gmail.com`. Identifiants dans
`apps/web/tests/.fixtures.local.json` (**ignoré par git**, le dépôt est public).
Chaque exécution remet à zéro les deux entreprises de test (« Test Propreté A », « Test
Concurrent B ») et clôt leurs anciens incidents. Les zones de test sont tracées **en mer, au large
de Kribi** : aucun vrai ménage ne peut y tomber.

**Mairie** : les tests Mairie sont ignorés (la commande est affichée) tant que le compte de test
n'est pas promu :

```sql
select public.promouvoir_utilisateur('mkt.test.mairie.<suffixe>@gmail.com', 'mairie');
```

**Nettoyage** : `supabase/NETTOYAGE_TESTS.sql` supprime tous les comptes `mkt.test.…` et leurs
données (y compris la promotion Mairie, à refaire ensuite).

## Caméra simulée

Chromium reçoit une caméra factice qui filme un QR code (`e2e/.media/qr.y4m`, fabriqué à chaque
lancement). Scan en tournée, photo et vidéo de preuve sont testés de bout en bout, sans téléphone.
Ce que ça ne remplace pas : un essai sur de vrais téléphones Android d'entrée de gamme, en plein soleil.

## Règles de la suite navigateur

- Un test **échoue** si la page produit la moindre erreur JavaScript ou erreur console.
- Une **reprise** automatique absorbe une coupure réseau ponctuelle ; un test repris est signalé
  « flaky » dans le rapport (`e2e/playwright-report/`) — rien n'est masqué.

## Intégration continue

`.github/workflows/verification.yml` : à chaque push et pull request, types + tests unitaires +
build. Les tests d'intégration et navigateur tournent en local (ils écrivent dans la base du pilote).
