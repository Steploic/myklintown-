# Charte graphique MyKlinTown V1.0

## Philosophie

Croisement entre **Écologie** (feuilles, vert) et **Haute Technologie** (pixels, bleu). Le logo doit toujours respirer ; ne jamais l'écraser ou modifier le dégradé bleu profond → vert clair.

## Palette

### Couleurs de marque

| Token | Hex | Usage |
|---|---|---|
| `brand-blue` (primaire) | `#1B3F63` | Sidebar, en-têtes, boutons primary |
| `brand-blue-hover` | `#1F4F7A` | Hover sur Bleu Primaire |
| `brand-green` (primaire) | `#4FA36A` | Validation, succès, collecte terminée |
| `brand-green-light` | `#7BC28A` | Badges, tags |
| `brand-green-pale` | `#9ED5A8` | Fonds de graphiques légers |
| `brand-teal` | `#2E7F8E` | Graphiques de données, dashboard secondaire |

### Couleurs d'interface

| Token | Hex | Usage |
|---|---|---|
| `text-primary` | `#222222` | Texte paragraphes et titres |
| `text-muted` | `#666666` | Petites données, statuts |
| `border` | `#DEDEDE` | Bordures cartes, lignes tableaux |
| `background` | `#F8FAFC` | Fond général |
| `surface` | `#FFFFFF` | Cartes, modales |

### Couleurs sémantiques

| Token | Hex | Usage |
|---|---|---|
| `danger` | `#EF4444` | Bac en débordement, erreur scan |
| `warning` | `#F59E0B` | Bac à moitié plein, signalement en cours |
| `success` | `#4FA36A` | Identique à `brand-green` |

## Typographie

**Barlow** (Google Fonts) — unique police du projet.

| Niveau | Poids | Taille | Couleur |
|---|---|---|---|
| H1 (titres de page) | Bold 700 | 24-32px | `#1B3F63` ou `#222222` |
| H2 (titres section) | SemiBold 600 | 18-20px | `#222222` |
| Body | Regular 400 | 14-16px | `#222222` |
| Small (dates, statuts) | Medium 500 | 12px | `#666666` |

## UI Kit

### Border radius

- **Cartes & modales** : `12px` ou `16px` → `rounded-xl` Tailwind
- **Boutons** : `8px` → `rounded-md` Tailwind
- Esprit circulaire du logo conservé partout.

### Boutons

- **Primary** : fond `#4FA36A` ou `#1B3F63`, texte blanc Barlow SemiBold, pas de bordure
- **Secondary/Outline** : fond transparent, bordure 2px `#DEDEDE`, texte `#222222`

### Ombres

Les cartes ne sont pas plates : `box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1)` → `shadow-soft` (token custom).
