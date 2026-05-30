# MyKlinTown

Plateforme de digitalisation de la chaîne de valeur de gestion des déchets pour la **Mairie de Yaoundé III** (Cameroun).

## Vision

Suivre 100 000+ ménages, optimiser les tournées de collecte, et fournir une marketplace B2B aux recycleurs — en partant des structures de pré-collecte existantes.

## Architecture

Monorepo Turborepo. Une seule application Next.js avec route groups par portail :

| Route | Portail | Cible |
|---|---|---|
| `/` | Landing publique | Visiteurs |
| `/citoyen` | App Citoyen | Ménages abonnés |
| `/collecteur` | App Collecteur | Éboueurs / chauffeurs |
| `/dashboard` | Dashboard Mairie | Chef de service Hygiène |
| `/enterprise` | Plateforme B2B | Recycleurs partenaires |

```
myklintown/
├── apps/
│   └── web/                  # Next.js 15 — toutes les apps web
├── packages/
│   ├── ui/                   # Composants partagés (shadcn/ui)
│   ├── db/                   # Client Supabase typé
│   ├── types/                # Types domaine
│   └── config/               # Tailwind preset, ESLint, TS config
└── supabase/
    ├── migrations/           # Schéma SQL versionné
    └── seed.sql              # Données de démo
```

## Stack

- **Next.js 15** (App Router) + TypeScript
- **Tailwind CSS** + **shadcn/ui** + **Barlow**
- **Supabase** : Postgres (PostGIS) + Auth + Realtime + Storage
- **Leaflet + OpenStreetMap** pour la cartographie
- **Turborepo** + **pnpm**

## Démarrage

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local  # remplir les clés Supabase
pnpm dev
```

L'app démarre sur http://localhost:3000.

## Charte graphique

Voir [docs/CHARTE.md](docs/CHARTE.md). Couleurs principales :

- Bleu Primaire `#1B3F63` (Confiance/Mairie)
- Vert Primaire `#4FA36A` (Écologie/Succès)
- Police : Barlow (Google Fonts)

## Équipe

- **PETNGA** — Développement web
- ESSOMBA — Web (binôme)
- TSANGA, MAMIA, FABRICE — Mobile Flutter
- MEYONG, MFOULOU — Dashboard (collaboration initiale)
