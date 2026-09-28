# 🔧 Restauration du backend MyKlinTown

> ## ⚠️ Lire ceci d'abord — deux situations très différentes
>
> **Cas A — le projet Supabase existe encore, en pause.** C'est le cas de
> `myklintown` (constaté le 2026-08-31 : bandeau « Project is paused », données
> et sauvegardes conservées, reprise possible jusqu'au 17 juillet 2027).
> Un projet en pause ne résout plus son sous-domaine — c'est ce `NXDOMAIN` qui
> avait été pris à tort pour une suppression le 2026-08-09.
> 👉 **Suivre « Cas A » ci-dessous. Ne PAS exécuter `setup_all.sql`** : il ne
> comporte aucun `if not exists` et échouerait dès le premier `create type`.
>
> **Cas B — projet neuf et vide.** Suivre les étapes 1 à 9, dans l'ordre.

---

## Cas A — Reprendre un projet mis en pause

1. Dashboard Supabase → bouton **Resume project**. Gratuit, rien n'est perdu.
   Compter quelques minutes de réveil.
2. **SQL Editor** → coller `supabase/DIAGNOSTIC.sql` → **Run**. Il ne modifie
   rien. Il répond à quatre questions : le schéma est-il complet, qui possède
   quel rôle, y a-t-il des données à préserver, quelles tables sont sans
   protection.
3. Selon le résultat de la première requête :

   | `tables_publiques` | Ce qu'il faut exécuter |
   |---|---|
   | **20** (schéma intact) | **`setup_rls.sql` uniquement.** Puis `seed.sql` seulement si `communes` est vide — il est protégé par `on conflict do nothing`. |
   | **0** (base vide) | Passer au Cas B : `setup_all.sql` → `setup_rls.sql` → `seed.sql`. |
   | autre chose | Ne rien exécuter, analyser d'abord. |

4. Reprendre ensuite aux **étapes 4 à 9** (authentification, clés, `.env.local`,
   Vercel, comptes de démo, smoke-test).

> 💡 Une offre gratuite met en pause après 7 jours d'inactivité. Tant que le
> développement est quotidien, le risque est faible ; il redevient réel dès une
> semaine de silence. **Passer en Pro avant le 1er octobre 2026** — un pilote qui
> encaisse de l'argent ne peut pas se permettre une mise en pause.

---

## Cas B — Installer sur un projet neuf


> À faire **une seule fois**, sur un **projet Supabase neuf et vide**.
> `setup_all.sql` n'est pas rejouable : 20 `create table` et 23 `create type`
> sans `if not exists`. Sur une base déjà peuplée, il échoue immédiatement.

---

## Étape 1 — Créer un nouveau projet Supabase

1. Aller sur https://supabase.com → **New project**.
2. Nom : `myklintown` · Région : **West EU (Ireland)** (la plus proche/rapide pour le Cameroun sur l'offre gratuite).
3. Choisir un **mot de passe de base de données** (le noter, il sert rarement mais on ne peut pas le récupérer).
4. Attendre ~2 min que le projet soit provisionné.

## Étape 2 — Installer le schéma (tables + sécurité RLS + triggers)

1. Menu de gauche → **SQL Editor** → **New query**.
2. Ouvrir `supabase/setup_all.sql`, **tout copier**, **coller**, puis **Run**.
3. Résultat attendu : `Success. No rows returned`.
   - Ce fichier crée les extensions (`uuid-ossp`, `postgis`), les 20 tables, les 5 rôles,
     la sécurité par ligne (RLS) et le trigger qui crée automatiquement un profil à l'inscription.

## Étape 2 bis — Compléter la sécurité (⚠️ ne pas sauter)

1. **SQL Editor** → **New query** → coller `supabase/setup_rls.sql` → **Run**.
2. Résultat attendu : `Success. No rows returned`.

**Pourquoi.** `setup_all.sql` reflète l'état des migrations d'origine, qui laissait
la sécurité à moitié posée (le fichier le dit lui-même : « d'autres policies seront
ajoutées au fur et à mesure ») :

- **5 tables sans RLS du tout** — `communes`, `secteurs`, `structures`, `camions`,
  `capteurs_iot` : lisibles **et modifiables** par quiconque possède la clé anon,
  qui est publique par conception.
- **10 tables avec RLS activée mais aucune politique** — Postgres refuse alors
  *tout* accès, lecture comprise. Cela concerne `abonnements` et `paiements`,
  c'est-à-dire le socle du chantier paiement.

Tant que l'application ne touchait que `profiles`, `signalements` et
`incidents_terrain`, rien ne se voyait. Dès qu'on branche les tableaux de bord sur
les vraies données, les écrans reviennent vides — et le symptôme ressemble à un bug
de données alors que c'est un refus de droits.

Après exécution : **20 tables sur 20** protégées, 41 politiques, aucun accès ouvert
au rôle `anon`. La requête de contrôle commentée en fin de fichier doit renvoyer
zéro ligne.


## Étape 3 — Charger les données de base

1. Toujours dans **SQL Editor** → **New query**.
2. Coller le contenu de `supabase/seed.sql` → **Run**.
   - (Communes / secteurs / structures de base. Les données « démo » riches des
     tableaux de bord sont dans le frontend, pas ici — c'est normal.)

## Étape 4 — Configurer l'authentification (⚠️ souvent oublié)

Dans **Authentication → Sign In / Providers → Email** (et **URL Configuration**) :

1. **Confirm email** : le **désactiver** pour la phase démo → l'inscription connecte
   directement, sans passer par la boîte mail. (À réactiver avant le vrai lancement.)
2. **Site URL** : mettre l'URL Vercel de production (ex. `https://myklintown.vercel.app`).
3. **Redirect URLs** : ajouter `http://localhost:3000/**` **et**
   `https://myklintown-web.vercel.app/**`. Sans ça, les redirections après
   connexion échouent en production — et **le lien de réinitialisation de mot de
   passe ne mène nulle part**, car il revient sur `/auth/callback`.

4. **⚠️ Service d'envoi d'e-mails (SMTP) — indispensable avant le pilote.**
   Le mot de passe oublié repose entièrement dessus. Le service intégré à
   Supabase est prévu pour la mise au point : quelques messages par heure, et
   sur les projets récents il ne livre qu'aux membres de l'équipe. Avec
   2 000 ménages, il ne tiendra pas.
   → **Project Settings → Authentication → SMTP Settings**, y brancher un
   prestataire (Resend, Brevo, SendGrid, Mailgun…) avec un domaine d'envoi
   vérifié. Sans cela, un ménage qui perd son mot de passe est bloqué, et la
   seule issue est une intervention manuelle en base.

## Étape 5 — Récupérer les clés

**Project Settings → API** :

| Valeur | Où | Sert à |
|---|---|---|
| **Project URL** | `https://xxxx.supabase.co` | `NEXT_PUBLIC_SUPABASE_URL` |
| **anon / public key** | `eyJhbGci...` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **service_role key** | `eyJhbGci...` (secret) | plus tard, pour l'import Excel — **jamais** côté client |

## Étape 6 — Rebrancher en local

Dans `apps/web/.env.local`, remplacer les 2 valeurs Supabase par les nouvelles
(le fichier contient déjà des repères `A_REMPLIR`). Puis :

```bash
pnpm install
pnpm dev
```

→ tester `http://localhost:3000` : l'inscription et la connexion doivent marcher.

## Étape 7 — Rebrancher en production (Vercel)

> ⚠️ **Ordre impératif : pousser le code AVANT de déployer.** Vercel construit ce
> qui est sur la branche distante, pas ce qui est sur votre disque. Déployer sans
> avoir poussé les correctifs de sécurité remettrait en ligne la version d'avant.

**1. Poser les variables** — Vercel → projet → **Settings → Environment Variables**.
Trois variables, et trois seulement : ce sont les seules que le code lit.
Les cocher pour **Production** *et* **Preview**.

| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xglomngvjsgbwobiwfqp.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la clé `anon` (Project Settings → API) |
| `NEXT_PUBLIC_SITE_URL` | l'URL de production, **jamais `localhost`** |

> **Ne pas ajouter** `SUPABASE_SERVICE_ROLE_KEY` ni les variables `MOMO_*` :
> aucun code ne les lit aujourd'hui. Une clé de service posée « au cas où » est
> une clé exposée pour rien — elle contourne toute la sécurité par ligne.

**2. Autoriser le domaine côté Supabase** — sinon la connexion échouera en
production alors qu'elle marche en local. Authentication → **URL Configuration** :

- **Site URL** : l'URL de production ;
- **Redirect URLs** : y ajouter `https://<domaine-de-prod>/**` (garder
  `http://localhost:3000/**` pour le développement).

**3. Reconstruire, pas seulement redéployer.** Les variables `NEXT_PUBLIC_*` sont
**figées dans le code au moment de la compilation**. Un redéploiement qui réutilise
le cache de build conserve les anciennes valeurs et donne l'illusion que rien n'a
changé. Deployments → ⋯ → **Redeploy** → **décocher « Use existing Build Cache »**.

**4. Vérifier en ligne** : ouvrir `/login`, se connecter, et confirmer l'arrivée
sur le portail correspondant au rôle. Puis tenter un portail interdit (par exemple
`/dashboard` avec un compte citoyen) : la redirection doit ramener à son propre
portail.

## Étape 8 — Comptes de démo (pour montrer les 4 portails)

> ⚠️ Depuis le correctif d'élévation de privilèges (étape 2 bis, section 10),
> `/signup` n'accorde plus que les rôles **citoyen** et **enterprise**. Les rôles
> `collecteur`, `mairie` et `admin` ne s'obtiennent **que** par promotion — et un
> déclencheur en base refuse qu'un compte modifie son propre rôle.

1. Sur le site, s'inscrire via `/signup` pour chaque compte de démo souhaité
   (le rôle attribué sera `citoyen` ou `enterprise`).
2. Promouvoir ensuite depuis le **SQL Editor** :

   ```sql
   select public.promouvoir_utilisateur('demo.mairie@myklintown.cm', 'mairie');
   select public.promouvoir_utilisateur('demo.collecteur@myklintown.cm', 'collecteur');
   ```

   La fonction vérifie que le profil existe et échoue proprement sinon. Elle est
   révoquée pour `anon` et `authenticated` : elle ne s'appelle que depuis le SQL
   Editor ou avec la clé `service_role`.

## Étape 9 — Smoke-test avant tout rendez-vous

- [ ] Inscription « Entreprise » → arrive bien sur `/enterprise`
- [ ] Connexion / déconnexion OK
- [ ] Les 4 portails s'ouvrent sans page cassée (`/citoyen`, `/collecteur`, `/dashboard`, `/enterprise`)
- [ ] Un signalement créé côté citoyen apparaît côté mairie (chemin réel en base)
- [ ] Testé sur mobile (les entreprises regarderont souvent sur téléphone)

**Contrôles de sécurité** (à faire une fois, après l'étape 2 bis) :

- [ ] `/signup` ne propose que **Citoyen** et **Recycleur / Entreprise**
- [ ] Aucune table sans protection — la requête de contrôle en fin de
      `setup_rls.sql` renvoie **zéro ligne**
- [ ] Un compte citoyen ne peut pas se promouvoir. Connecté en citoyen, depuis la
      console du navigateur :

      ```js
      const { error } = await supabase.from('profiles')
        .update({ role: 'admin' }).eq('id', (await supabase.auth.getUser()).data.user.id);
      console.log(error);   // doit renvoyer une erreur 42501, PAS null
      ```

- [ ] Une inscription forgée en `mairie` retombe sur `citoyen` :

      ```sql
      select email, role from public.profiles order by created_at desc limit 5;
      ```

---

### ⚠️ À durcir avant le vrai lancement (pas bloquant pour la démo)

> Corrigé depuis (étape 2 bis) : les trous de RLS, la lecture de la marketplace qui
> était ouverte au rôle `anon` alors que le commentaire annonçait « authentifiée »,
> et les deux chemins d'élévation de privilèges (rôle réclamé à l'inscription,
> rôle modifiable par son porteur).

- ~~La page `/signup` laisse choisir le rôle librement.~~ **Corrigé** (étape 2 bis,
  section 10) : l'inscription publique n'accorde plus que `citoyen` et `enterprise`,
  et un déclencheur interdit à un compte de modifier son propre rôle.
- Le middleware (`apps/web/middleware.ts`) est en **échec ouvert** : si les variables
  Supabase manquent, la protection des routes est désactivée et tous les portails
  s'ouvrent sans compte. Acceptable en maquette, à fermer avant le pilote.
- Réactiver la confirmation e-mail.
- Passer l'hébergement Supabase en offre payante **avant** d'avoir de vrais clients
  (l'offre gratuite se met en pause après 7 jours d'inactivité — ce qui a causé cette panne).
