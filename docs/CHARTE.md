# Charte graphique MyKlinTown V3 (novembre 2026)

Référence visuelle de l'application, tirée du logo d'octobre 2026. Elle est appliquée par `packages/config/tailwind.preset.ts` et présentée sur la page `/marque` du site.

## Logo

- Version couleur sur fond clair, version blanche sur fond sombre, symbole seul pour les icônes et les petits formats.
- Ne jamais déformer le logo, ni le recolorer, ni poser la version couleur sur un fond sombre.
- Fichiers servis : `apps/web/public/brand/` (horizontal, empilé, symbole, icônes d'application). Les sources de l'équipe sont rangées dans `docs/identite-visuelle/logos-2026-10/`, hors dépôt.

## Palette

### Couleurs du logo : accents

Ces trois couleurs servent au décor, aux dégradés et aux accents sur fond sombre. Ne jamais les mettre sous un texte blanc : le contraste tombe entre 2,2:1 et 2,5:1.

| Token | Hex | Usage |
|---|---|---|
| `brand-blue-pixel` | `#2563EB` | Pixels du logo (sert aussi de bleu d'action) |
| `brand-teal-vif` | `#17B8A4` | Turquoise du logo : décor, dégradés |
| `brand-leaf` / `brand-green-light` | `#5DC36C` | Vert feuille : accents sur fond sombre, badges |

Dégradé signature (`bg-brand-gradient`) : `#2563EB` → `#17B8A4` → `#5DC36C`.

### Couleurs d'action et de texte

| Token | Hex | Contraste avec le blanc | Usage |
|---|---|---|---|
| `brand-green` | `#30823A` | 4,8:1 | Bouton principal, validation, succès |
| `brand-green-hover` | `#276C30` | 6,4:1 | Survol du bouton principal |
| `brand-blue` | `#2563EB` | 5,2:1 | Liens, boutons secondaires, focus |
| `brand-blue-hover` | `#1D4ED8` | 6,7:1 | Survol |
| `brand-teal` | `#0E8574` | 4,5:1 | Icônes et graphiques sur fond clair |
| `brand-ink` | `#0B1E3B` | 16,6:1 | Nuit : fonds sombres, barres latérales, titres |
| `brand-blue-clair`, `brand-teal-clair` | `#7FA6F5`, `#5ED6C3` | — | Texte et accents **sur fond sombre** (6,9:1 et 9,4:1 sur la nuit) |

### Code terrain (inchangé depuis la V2)

Réservé aux états de service et de paiement, jamais décoratif.

| Token | Hex | Sens |
|---|---|---|
| `terrain-ok` | `#1F8A4C` | Servir : à jour, réalisé, résolu |
| `terrain-relance` | `#B86E00` | Relancer : échéance proche, à facturer |
| `terrain-stop` | `#C8372D` | Ne pas servir : impayé, non réalisé, incident |

### Interface

| Token | Hex | Usage |
|---|---|---|
| `background` | `#F4F7F5` | Fond d'application (« brume ») |
| `surface` | `#FFFFFF` | Cartes, modales |
| `foreground` | `#1A2330` | Texte courant |
| `muted-foreground` | `#5B6673` | Textes secondaires |
| `border` | `#DDE4E1` | Bordures, lignes de tableau |

## Typographie

**Barlow** (Google Fonts), une seule famille. Chiffres à chasse fixe (`num`) pour les montants et les compteurs.

| Niveau | Poids | Taille |
|---|---|---|
| H1 | 700 | 24-32 px |
| H2 | 600 | 18-20 px |
| Texte | 400 | 14-16 px |
| Petit | 500 | 12 px |

## Composants

- Boutons d'au moins 44 px de haut (cible de pouce), coins arrondis à 8 px ; cartes à 16 px.
- Ombre douce des cartes (`card-soft`, `shadow-elevated`).
- Motif signature : quelques pixels du logo qui s'échappent (`PixelDots`), toujours peu nombreux, toujours dans un angle.
