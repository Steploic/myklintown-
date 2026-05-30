# MyKlinTown — Spec Application Mobile

> Document destiné à Claude Code pour la reproduction fidèle de l'application web sur mobile.  
> Contexte : MyKlinTown est une plateforme de digitalisation de la gestion des déchets pour la Mairie de Yaoundé III (Cameroun).

---

## 1. Vue d'ensemble

### 1.1 Produit
Quatre portails distincts, une seule application mobile :

| Portail | Utilisateur cible | Priorité mobile |
|---|---|---|
| **Citoyen** | Ménages abonnés | ⭐⭐⭐ Priorité maximale |
| **Collecteur** | Agents de collecte (terrain) | ⭐⭐⭐ Priorité maximale |
| **Mairie** | Service Hygiène Yaoundé III | ⭐⭐ Consultation & alertes |
| **Partenaire B2B** | EcoCycle SARL et autres recycleurs | ⭐ Consultation catalogue |

> Les portails Citoyen et Collecteur sont conçus pour être utilisés principalement sur mobile. La Mairie et le B2B sont secondaires (tableau de bord de suivi).

### 1.2 Chaîne de valeur
```
Ménages → Collecteurs → Centres de tri → Entreprises B2B (recycleurs)
```

---

## 2. Stack technique recommandée

### 2.1 Framework
- **React Native + Expo SDK 51+** (managed workflow)
- **TypeScript** strict mode
- **Expo Router v3** (file-based routing, équivalent Next.js App Router)

### 2.2 Dépendances clés

```json
{
  "expo": "~51.0.0",
  "expo-router": "~3.5.0",
  "react-native": "0.74.x",
  "react-native-maps": "^1.14.0",
  "expo-camera": "~15.0.0",
  "expo-barcode-scanner": "~13.0.0",
  "expo-location": "~17.0.0",
  "expo-sqlite": "~14.0.0",
  "expo-notifications": "~0.28.0",
  "expo-file-system": "~17.0.0",
  "@supabase/supabase-js": "^2.x",
  "lucide-react-native": "^0.400.0",
  "@tanstack/react-query": "^5.x",
  "zustand": "^4.x",
  "react-native-mmkv": "^3.x",
  "nativewind": "^4.x",
  "@shopify/flash-list": "^1.x",
  "react-native-reanimated": "~3.x",
  "react-native-gesture-handler": "~2.x",
  "react-native-safe-area-context": "4.x",
  "react-native-screens": "~3.x",
  "expo-print": "~12.0.0",
  "react-native-qrcode-svg": "^6.x"
}
```

### 2.3 Architecture de l'état
- **Zustand** : état global (utilisateur connecté, portail actif, mode hors-ligne)
- **React Query** : cache réseau, synchronisation serveur
- **expo-sqlite** : stockage local (scans QR offline, incidents en attente)
- **react-native-mmkv** : préférences utilisateur persistantes

---

## 3. Système de design

### 3.1 Couleurs (identiques au web)

```ts
// constants/colors.ts
export const Colors = {
  brand: {
    blue:       '#1B3F63',  // Primaire — confiance / mairie
    blueHover:  '#1F4F7A',
    green:      '#4FA36A',  // Écologie / succès
    greenLight: '#7BC28A',
    greenPale:  '#9ED5A8',
    teal:       '#2E7F8E',  // Graphiques secondaires
  },
  background:   '#F8FAFC',
  foreground:   '#222222',
  surface:      '#FFFFFF',
  border:       '#DEDEDE',
  muted:        '#F1F5F9',
  mutedFg:      '#666666',
  danger:       '#EF4444',
  warning:      '#F59E0B',
  success:      '#4FA36A',
} as const;
```

### 3.2 Typographie

Police principale : **Barlow** (Google Fonts — charger via `expo-font` ou `@expo-google-fonts/barlow`).

```ts
// constants/typography.ts
export const Typography = {
  h1:     { fontSize: 32, lineHeight: 40, fontWeight: '700' },
  h1sm:   { fontSize: 24, lineHeight: 32, fontWeight: '700' },
  h2:     { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  h2sm:   { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body:   { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodySm: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  small:  { fontSize: 12, lineHeight: 16, fontWeight: '500' },
} as const;
```

### 3.3 Rayons et ombres

```ts
export const Radius = {
  md: 8,   // boutons
  lg: 12,  // cartes petites
  xl: 16,  // cartes principales
  full: 999,
};

export const Shadows = {
  soft: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  elevated: {
    shadowColor: '#1B3F63',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
};
```

### 3.4 Composants de base à créer

#### `<Card />` — équivalent `.card-soft`
```tsx
// Fond blanc, bordure #DEDEDE, radius 16, ombre soft
<View style={{ backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1,
  borderColor: '#DEDEDE', ...Shadows.soft }} />
```

#### `<Button />` — trois variantes
```tsx
// primary  : bg #4FA36A, texte blanc
// secondary: bg #1B3F63, texte blanc
// outline  : bg transparent, bordure #DEDEDE, texte #222
// Taille minimale tap target : 44×44 (iOS HIG)
// Padding : horizontal 16, vertical 10
```

#### `<Badge />` — quatre variantes
```tsx
// success : bg #4FA36A/10, texte #4FA36A
// warning : bg #F59E0B/10, texte #F59E0B
// danger  : bg #EF4444/10, texte #EF4444
// info    : bg #1B3F63/10, texte #1B3F63
// Border-radius full, padding H 10 V 2, font small (12px medium)
```

#### `<StatCard />` — carte KPI
```tsx
interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  accent: 'blue' | 'green' | 'teal' | 'warning';
  delta?: { value: string; positive?: boolean };
}
// Fond blanc, icône colorée selon accent, valeur en h2, label en small muted
// Delta en small : vert si positive, rouge sinon
```

### 3.5 Logo
Asset : `assets/images/logo-myklintown.png` (fond blanc, dimensions 2136×1868).

```tsx
// Sur fond sombre (headers bleus) : entourer d'un container bg white, radius 8, padding 2
// Sur fond clair : afficher directement (le fond blanc se fond)
```

---

## 4. Navigation

### 4.1 Architecture globale

```
app/
├── (auth)/
│   ├── login.tsx          # Écran connexion
│   ├── signup.tsx         # Inscription
│   └── forgot.tsx         # Mot de passe oublié
├── (portals)/
│   ├── citoyen/           # Tab navigator Citoyen
│   ├── collecteur/        # Tab navigator Collecteur
│   ├── dashboard/         # Tab navigator Mairie
│   └── enterprise/        # Tab navigator B2B
└── index.tsx              # Redirection selon rôle
```

### 4.2 Navigation de portail
Chaque portail utilise un **Tab Navigator** en bas de l'écran (`@react-navigation/bottom-tabs` ou Expo Router tabs).

**Header commun** (tous portails) :
- Logo MyKlinTown (32px) à gauche
- Nom du portail + rôle (texte) au centre
- Cloche notifications (badge rouge) + avatar utilisateur à droite
- Fond `#1B3F63` (bleu) avec texte blanc

---

## 5. Portail Citoyen

**Utilisateur** : Famille TSANGA · m.tsanga@orange.cm  
**Nav tabs** : Accueil · Abonnement · QR Code · Signaler · Marketplace · Recyclages

### 5.1 Écran Accueil (`/citoyen`)

**KPI cards** (scroll horizontal ou grille 2×2) :
| Label | Valeur | Accent |
|---|---|---|
| Statut abonnement | "À jour" | green |
| Foyer enregistré | "Nsam · Bloc C" | blue |
| Prochaine collecte | "Mardi 27" | teal |
| Mes points écolo | "1 240" | warning |

**Section QR Code** (card) :
- Affichage QR Code (composant `react-native-qrcode-svg`, taille 160×160)
- ID en mono : `MKT-YDE3-NSAM-C0427`
- Lien "Imprimer" → écran QR Code complet

**Section Prochaines collectes** (liste) :
```
Mardi 27 mai   | Matin (06:00-09:00) | Secteur Nsam
Vendredi 30 mai| Matin (06:00-09:00) | Secteur Nsam
Mardi 03 juin  | Matin (06:00-09:00) | Secteur Nsam
```

**Section Activité récente** (liste) :
```
Hier · 06:42    | Collecte effectuée      | Scan QR par Agent #C-217      | ✓
24 mai · 14:30  | Paiement reçu           | Abonnement 3 500 FCFA MTN MoMo| ℹ
22 mai · 09:10  | Signalement traité      | Bac plein rue de la Joie · ✓  | ✓
20 mai · 18:55  | +50 points              | Tri valorisé · 3 kg plastique | ★
```

**CTA Marketplace** (card gradient vert/vert-clair) :
- Titre : "Vos déchets ont de la valeur"
- Texte : "Triez plastique, métal et carton — proposez-les à un recycleur partenaire"
- Bouton primary "Voir la marketplace"

### 5.2 Écran QR Code (`/citoyen/qr-code`)

**Section principale** :
- QR Code grand format (220×220), bordure 4px foreground, fond blanc, radius 16
- Halo dégradé derrière le QR (brand-gradient-soft)
- ID : `MKT-YDE3-NSAM-C0427` en mono
- Infos identité : "Famille TSANGA · Nsam-Efoulan · Yaoundé III"
- Boutons : [Imprimer en A5] [Télécharger PNG]
  - "Imprimer" → `expo-print` avec format A5
  - "Télécharger" → `expo-file-system` + partage natif

**Statut du QR Code** (liste clé-valeur) :
```
Activé le       | 14 mars 2026
Dernier scan    | Hier · 06:42
Scans 30 jours  | 8 passages
État            | [badge vert "Actif"]
```
Bouton outline "Demander un duplicata"

**Mode d'emploi** (3 étapes) :
1. Imprimer → Format A5 optimal
2. Plastifier → Résiste pluie et soleil
3. Fixer → À hauteur d'homme, côté rue

### 5.3 Écran Signaler (`/citoyen/signaler`)

**Formulaire en étapes** :

**Étape 1 — Type de problème** (radio cards 2×2) :
| Type | Description |
|---|---|
| Bac débordant | Bac plein, déchets qui débordent |
| Dépôt sauvage | Tas d'ordures hors bac, voie publique |
| Retard collecte | Le passage prévu n'a pas eu lieu |
| Incident collecteur | Comportement inapproprié, bac endommagé |
Sélection → bordure verte + fond vert/5

**Étape 2 — Description** : `TextInput` multiline (4 lignes)

**Étape 3 — Photo** :
- Bouton zone pointillée → `expo-camera` (prendre) ou `expo-image-picker` (galerie)
- Format JPG/PNG max 10 Mo

**Étape 4 — Localisation** :
- Auto-détection via `expo-location`
- Affichage : "Nsam-Efoulan, Yaoundé III · 3.8324, 11.5067"
- Bouton "Modifier" → sélecteur sur carte

Boutons bas de form : [Annuler] [Envoyer le signalement →]

**Section "Mes signalements"** (sidebar condensée sur mobile = section séparée en bas) :
```
SIG-1438 | Bac plein         | Rue 1.234    | [Résolu]
SIG-1411 | Dépôt sauvage     | Av. C-Atang. | [En traitement]
SIG-1372 | Retard collecte   | Famille TSANGA | [Résolu]
```

**Note** : +20 points écolo par signalement validé (afficher dans la confirmation)

### 5.4 Écran Abonnement (`/citoyen/abonnement`)
> Page existante — reproduire le contenu de `apps/web/app/citoyen/abonnement/page.tsx`

### 5.5 Écran Marketplace (`/citoyen/marketplace`)
> Page existante — reproduire le contenu de `apps/web/app/citoyen/marketplace/page.tsx`

### 5.6 Écran Recyclages (`/citoyen/recyclage`)
> Page existante — reproduire le contenu de `apps/web/app/citoyen/recyclage/page.tsx`

---

## 6. Portail Collecteur

**Utilisateur** : Jean Fabrice · agent-c217@myklintown.cm  
**Nav tabs** : Tournée · Scanner QR · Itinéraire · Incidents · QHSE · Performance

> ⚠️ Ce portail est critique sur mobile. L'agent est en déplacement toute la journée. Priorité : ergonomie, contraste élevé, grands tap targets, mode hors-ligne.

### 6.1 Écran Tournée (`/collecteur`)

**Header contextuel** :
```
Ma tournée en cours
Secteur Nsam-Efoulan · Camion Δ-217 · démarrée à 06:14
```

**Boutons d'action rapide** (full-width sur mobile, côte à côte en paysage) :
- [📷 Signaler incident] → `/collecteur/incidents`
- [📱 Scanner un QR] → `/collecteur/scan` (tab direct)

**KPI cards** (2×2 grille) :
| Label | Valeur | Accent |
|---|---|---|
| Ménages collectés | "42 / 68" | green |
| Temps écoulé | "2 h 14" | blue |
| Distance parcourue | "8,3 km" | teal |
| Incidents signalés | "1" | warning |

**Carte de tournée** (`react-native-maps`) :
- Coordonnées centre : `[3.8324, 11.5067]` (Yaoundé III)
- Couche Plan (défaut) + Couche Satellite (toggle bouton)
- Satellite : Esri World Imagery `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`
- Markers custom (5 types) :

```ts
const MARKER_ICONS = {
  collecte:  { emoji: '🏠', bg: '#4FA36A' },  // Ménage collecté
  attente:   { emoji: '🏠', bg: '#EF4444' },  // En attente
  camion:    { emoji: '🚛', bg: '#1B3F63' },  // Camion
  bac_plein: { emoji: '🗑️', bg: '#EF4444' },  // Bac plein
  incident:  { emoji: '⚠️', bg: '#F59E0B' },  // Incident
};
// Marker = cercle coloré 36×36, bordure blanche 2px, emoji centré
// Utiliser react-native-maps Marker avec vue custom (CustomMarker component)
```

Points demo à afficher :
```ts
[
  { id:'1', coord:{lat:3.8330, lng:11.5072}, label:'Ménage TSANGA · OK',      type:'collecte'  },
  { id:'2', coord:{lat:3.8318, lng:11.5061}, label:'Ménage MFOULOU · OK',     type:'collecte'  },
  { id:'3', coord:{lat:3.8341, lng:11.5085}, label:'Ménage ABENA · attente',  type:'attente'   },
  { id:'4', coord:{lat:3.8298, lng:11.5043}, label:'Bac débordant rue Joie',  type:'bac_plein' },
  { id:'5', coord:{lat:3.8350, lng:11.5095}, label:'Camion Δ-217',            type:'camion'    },
  { id:'6', coord:{lat:3.8312, lng:11.5078}, label:'Ménage NDJOM · attente',  type:'attente'   },
]
```

Légende carte (ligne horizontale en bas de la carte) :
`🏠 Collectés · 🏠 En attente · 🚛 Camion · ⚠️ Incident`

**Prochains arrêts** (liste ordonnée) :
```
#12 | Famille ABENA   | Rue 1.234 · Nsam-Efoulan | 180 m
#13 | Famille NDJOM   | Rue 1.236 · Nsam-Efoulan | 320 m
#14 | Famille NGUEMA  | Rue 1.238 · Nsam-Efoulan | 410 m
#15 | École pub. Nsam | Av. Charles-Atangana      | 620 m
```
Chaque item : numéro dans cercle bleu, nom en gras, adresse en muted, distance à droite.

**Mode hors-ligne** (card verte en bas) :
```
✓ 42 scans synchronisés · 0 en attente · dernière synchro il y a 1 min
```

### 6.2 Écran Scanner QR (`/collecteur/scan`)

> Page critique — interface principale du travail terrain.

**Composant caméra** (`expo-camera` ou `expo-barcode-scanner`) :
- Plein écran caméra (ratio 4:3 ou plein)
- Overlay viewfinder :
  - Rectangle arrondi avec bords colorés (4 coins verts `#4FA36A`)
  - Ligne de scan animée (slide de haut en bas, couleur verte avec glow)
  - Texte centré en bas : "Centrez le QR Code dans le cadre…"
- Boutons bas : [↺ Basculer caméra] [# Saisir manuellement]

Sur scan réussi → modal/sheet de confirmation :
```
✓ SCAN EFFECTUÉ
Famille ABENA — Rue 1.234 · Nsam-Efoulan
Type : [Collecte OK ▼]  (sélecteur : Collecte OK / Bac vide / Absent / Inaccessible)
[Confirmer]  [Annuler]
```

**Section état synchronisation** (card latérale ou en bas si mobile) :
```
Scans aujourd'hui : 42
Synchronisés      : 42  [vert]
En attente        : 0
Dernière synchro  : il y a 1 min
[↺ Forcer la synchro]
```

**Toggle mode hors-ligne** :
```
⊗ Forcer hors-ligne    [toggle switch]
```

**Historique scans récents** (liste) :
```
⏱ Famille NDJOM    | Rue 1.236 | 08:42 | [Collecte OK]
⏱ Famille NGUEMA   | Rue 1.238 | 08:38 | [Collecte OK]
⏱ École pub. Nsam  | Av. C-A.  | 08:31 | [Collecte OK] 📱offline
⏱ Famille ABENA    | Rue 1.234 | 08:25 | [Absent]      📱offline
⏱ Famille TSANGA   | Rue 1.230 | 08:18 | [Collecte OK]
```

### 6.3 Écran Incidents (`/collecteur/incidents`)

**Formulaire "Nouveau signalement"** :
1. **Type** (select) : Bac détruit / Bac inaccessible / Bac introuvable / Camion en panne / Accident / Autre
2. **Description** : `TextInput` multiline 3 lignes
3. **Photo** (preuve) : zone pointillée → `expo-camera`
4. **Position** : auto-géolocalisée via `expo-location` (afficher coordonnées + quartier)
5. Boutons : [Annuler] [📤 Transmettre]

**Aide "Quand signaler ?"** (card aside) :
- ✓ Bac absent ou détruit
- ✓ Bac inaccessible (véhicule garé, travaux…)
- ✓ Incident matériel sur le camion
- ✓ Tout fait justifiant un non-passage

**Incidents transmis aujourd'hui** (liste) :
```
⚠ Bac inaccessible | Rue 1.234 · Famille ABENA | 07:22 | 📷 Photo | [Transmis]
```

### 6.4 Écran Itinéraire (`/collecteur/itineraire`)
> Reproduire `apps/web/app/collecteur/itineraire/page.tsx`

### 6.5 Écran Rapport QHSE (`/collecteur/qhse`)
> Reproduire `apps/web/app/collecteur/qhse/page.tsx`

### 6.6 Écran Performance (`/collecteur/performance`)
> Reproduire `apps/web/app/collecteur/performance/page.tsx`

---

## 7. Portail Mairie (Dashboard)

**Utilisateur** : Chef Service · hygiene@yaounde3.cm  
**Nav tabs** : Vue d'ensemble · Territoire · Ménages · Tournées · Recouvrement · Transformation · Signalements · Rapports

### 7.1 Écran Vue d'ensemble (`/dashboard`)

**Header** :
```
Vue d'ensemble · 26 mai 2026
Indicateurs consolidés en temps réel pour Yaoundé III
```

**Actions** : [📄 Exporter PDF] [📊 Rapport mensuel]

**KPI cards** (scroll horizontal ou grille 2×2) :
| Label | Valeur | Delta |
|---|---|---|
| Ménages actifs | "4 218" | +184 ce mois |
| Tournées en cours | "7 / 12" | Couverture 78% |
| Tonnage du jour | "14,2 t" | +9% vs hier |
| Recouvrement | "91 %" | +4 pts |

**Carte territoriale Yaoundé III** (`react-native-maps`) :
- Centre : `[3.8324, 11.5067]`
- Toggle Plan/Satellite (même config que collecteur)
- Markers (9 points) :
```ts
[
  { id:'c1', coord:{lat:3.8324,lng:11.5067}, label:'Camion Δ-217 · Nsam',          type:'camion'    },
  { id:'c2', coord:{lat:3.8401,lng:11.5158}, label:'Camion Δ-184 · Mvog-Mbi',      type:'camion'    },
  { id:'c3', coord:{lat:3.8270,lng:11.4988}, label:'Camion Δ-093 · Efoulan',       type:'camion'    },
  { id:'b1', coord:{lat:3.8312,lng:11.5078}, label:'Bac débordant rue Joie',        type:'bac_plein' },
  { id:'b2', coord:{lat:3.8388,lng:11.5142}, label:'Bac débordant marché central', type:'bac_plein' },
  { id:'b3', coord:{lat:3.8265,lng:11.5021}, label:'Bac débordant école Nsam',     type:'bac_plein' },
  { id:'s1', coord:{lat:3.8351,lng:11.5106}, label:'Secteur Nsam · 94% collecté',  type:'collecte'  },
  { id:'s2', coord:{lat:3.8295,lng:11.5184}, label:'Secteur Efoulan · attente',    type:'attente'   },
  { id:'s3', coord:{lat:3.8410,lng:11.5031}, label:'Signalement dépôt sauvage',    type:'incident'  },
]
```
Légende : `🚛 Camion · 🏠 Collecté · 🏠 En attente · 🗑️ Bac plein · ⚠️ Signalement`

**Top secteurs** (barres de progression) :
```
Nsam-Efoulan  : 94% · 4,1 t  [barre verte 94%]
Mvog-Mbi      : 87% · 3,8 t  [barre verte 87%]
Obobogo       : 81% · 2,9 t  [barre verte 81%]
Etoa-Meki     : 73% · 2,4 t  [barre verte 73%]
```

**Signalements ouverts** (liste avec lien "Voir tout") :
```
⚠️ Bac débordant marché central  | Mvog-Mbi · 42 min · 3 citoyens
🔴 Dépôt sauvage av. C-Atangana  | Photo · 2h · à affecter
⚠️ Retard collecte Obobogo       | 5 ménages · camion Δ-093
```

**Flux entrepôt — semaine** (grille 2×2) :
```
Entrées brutes    | 68,4 t  | ↑12% vs S-1
Plastique trié    | 14,7 t  | → Granulés PET
Métal trié        | 4,1 t   | → Vente recycleurs
Taux transformation| 31%    | Cible 40%
```

**Opérateurs sur le territoire** (deux sections) :

Section "Collecteurs · engins" :
```
Δ-217 | Jean Fabrice | MKT Nsam SARL  | [En service]
Δ-184 | Paul Mvondo  | EcoCycle SARL  | [En service]
Δ-093 | Simon Abena  | MKT Nsam SARL  | [En retard]
Δ-112 | Marie Ngo    | GreenCity CM   | [Hors service]
```

Section "Entreprises partenaires" :
```
MKT Nsam SARL | Pré-collecte     | [Δ-217][Δ-093] | 2 zones
EcoCycle SARL | Collecte + tri   | [Δ-184]        | 1 zone
GreenCity CM  | Collecte         | [Δ-112]        | 1 zone
```

### 7.2 Autres écrans Mairie
> Reproduire les pages existantes :
- `/dashboard/territoire` — `apps/web/app/dashboard/territoire/page.tsx`
- `/dashboard/menages` — `apps/web/app/dashboard/menages/page.tsx`
- `/dashboard/tournees` — `apps/web/app/dashboard/tournees/page.tsx`
- `/dashboard/recouvrement` — `apps/web/app/dashboard/recouvrement/page.tsx`
- `/dashboard/transformation` — `apps/web/app/dashboard/transformation/page.tsx`
- `/dashboard/signalements` — `apps/web/app/dashboard/signalements/page.tsx`
- `/dashboard/rapports` — `apps/web/app/dashboard/rapports/page.tsx`

---

## 8. Portail Partenaire B2B (Enterprise)

**Utilisateur** : Paul Essomba · p.essomba@ecocycle.cm  
**Nav tabs** : Tableau de bord · Centres de tri · Stock · Marketplace · Livraisons · Facturation

### 8.1 Écran Tableau de bord (`/enterprise`)

**KPI cards** (scroll horizontal ou grille 2×2) :
| Label | Valeur | Delta |
|---|---|---|
| Volume entrant (mois) | "14,8 t" | +22% vs M-1 |
| Produits transformés | "9,6 t" | Rendement 65% |
| CA marketplace (mois) | "3,9 M FCFA" | +18% |
| Centres de tri actifs | "3" | — |

**Matières disponibles** (tableau / liste scrollable) :
```
CT-Nsam     | Plastique mélangé | 3,2 t | 45 FCFA/kg   | [Disponible] [Commander]
CT-Mvog-Mbi | Métal mélangé     | 0,8 t | 120 FCFA/kg  | [Disponible] [Commander]
CT-Nsam     | Papier / Carton   | 1,1 t | 25 FCFA/kg   | [Disponible] [Commander]
CT-Obobogo  | Compost organique | 4,2 t | 35 FCFA/kg   | [Réservé]
```

**Top acheteurs** :
```
Plastica Cameroun | 4,2 t | Plastique
CIMENCAM Recycling| 2,8 t | Métal
Papeterie Mvolyé  | 1,9 t | Carton
```

**Engagements ESG** :
```
✓ 9,6 t détournées de la décharge   [fond vert]
🏢 12 structures partenaires actives [fond bleu]
🚛 87 collectes effectuées           [fond teal]
```

**Articles marketplace** (grille 2 colonnes) :
```
Granulés PET cristal    | 2 400 kg | 385 FCFA/kg | 142 vues
Granulés PEHD couleur   |   850 kg | 310 FCFA/kg |  81 vues
Aluminium concassé      |   320 kg | 1200 FCFA/kg|  56 vues
Carton ondulé compacté  | 1 100 kg |  85 FCFA/kg |  38 vues
```

### 8.2 Écran Centres de tri (`/enterprise/centres-tri`)

**Chaîne de valeur visuelle** (scroll horizontal) :
```
🏠 Ménages        →  🚛 Collecteurs    →  🏭 Centres de tri  →  🏢 Vous (B2B)
déposent déchets     ramassent/livrent    trient/stockent       achetez/transformez
```

**Stats** :
```
Centres actifs : 2/3  |  Lots disponibles : 7  |  Volume total : 12,3 t
```

**Cards par centre** (3 cards) :

Centre CT-001 "Centre de tri Nsam" — **[Ouvert]** :
- Adresse : Av. Charles-Atangana · Nsam-Efoulan
- Tél : +237 2 22 12 45 · Distance : 1,2 km
- Matières :

| Matière | Catégorie | Quantité | Prix | Dispo |
|---|---|---|---|---|
| Plastique mélangé | [Plastique] | 3 200 kg | 45 FCFA/kg | [Disponible] → **Commander** |
| Métal mélangé | [Métal] | 820 kg | 120 FCFA/kg | [Disponible] → **Commander** |
| Papier / Carton | [Papier] | 1 100 kg | 25 FCFA/kg | [Disponible] → **Commander** |

Centre CT-002 "Centre de tri Mvog-Mbi" — **[Ouvert]** :
- Adresse : Rue du Marché · Mvog-Mbi · Tél : +237 6 90 34 67 · 3,1 km
- Plastique mélangé 1 800 kg / 45 FCFA → [Disponible]
- Verre brun 300 kg / 15 FCFA → [Réservé]

Centre CT-003 "Centre de tri Obobogo" — **[Fermé]** :
- Adresse : Zone industrielle · Obobogo · +237 6 53 88 14 · 5,4 km
- Compost organique 4 200 kg / 35 FCFA → [Disponible]
- Métal mélangé 1 200 kg / 120 FCFA → [Disponible]

**Couleurs badges catégorie** :
```ts
Plastique → badge-info (bleu)
Métal     → badge-warning (orange)
Papier    → badge-success (vert)
Verre     → badge-info (bleu)
Organique → badge-success (vert)
```

### 8.3 Autres écrans B2B
> Reproduire :
- `/enterprise/stock` — `apps/web/app/enterprise/stock/page.tsx`
- `/enterprise/marketplace` — `apps/web/app/enterprise/marketplace/page.tsx`
- `/enterprise/livraisons` — `apps/web/app/enterprise/livraisons/page.tsx`
- `/enterprise/facturation` — `apps/web/app/enterprise/facturation/page.tsx`

---

## 9. Authentification

### 9.1 Écran Login (`/login`)

**Layout** :
- Fond dégradé `brand-gradient` en haut (35% de l'écran) avec logo et quote
- Formulaire blanc en bas (65%)

**Contenu form** :
- Logo (40px) visible uniquement si petit écran (le dégradé prend toute la place)
- Champ "E-mail ou téléphone" (`TextInput` type email/phone)
- Champ "Mot de passe" (`TextInput` secureTextEntry)
- Toggle "Se souvenir de moi"
- Lien "Mot de passe oublié ?"
- Bouton secondary (bleu) "Se connecter" — pleine largeur
- Lien "Créer un compte"

**Quote** (sur fond dégradé) :
> « MyKlinTown a transformé notre vision : nous ne supervisons plus la collecte, nous la pilotons. »  
> — Chef de Service Hygiène, Mairie Yaoundé III

### 9.2 Redirection après login
Selon le rôle de l'utilisateur (`user.role`) :
```ts
citoyen    → /citoyen
collecteur → /collecteur
mairie     → /dashboard
enterprise → /enterprise
```

---

## 10. Fonctionnalités spéciales

### 10.1 Scanner QR Code

**Permissions requises** :
- `expo-camera` → `Camera.requestCameraPermissionsAsync()`
- Afficher une UI de demande de permission explicite avant d'ouvrir la caméra

**Flux** :
1. Ouvrir caméra
2. Détecter QR Code (`BarCodeScanner.onBarCodeScanned`)
3. Parser le code → format `MKT-YDE3-{secteur}-{id}`
4. Afficher modal de confirmation avec sélecteur de type (Collecte OK / Bac vide / Absent / Inaccessible)
5. Si online → POST vers Supabase immédiatement
6. Si offline → Stocker dans SQLite (`expo-sqlite`) avec timestamp et position GPS
7. Synchro automatique au retour du réseau (`NetInfo` listener)

### 10.2 Mode Hors-ligne (Collecteur)

**Stockage local** (`expo-sqlite`) :
```sql
CREATE TABLE scans_offline (
  id TEXT PRIMARY KEY,
  qr_code TEXT NOT NULL,
  foyer_nom TEXT,
  type TEXT NOT NULL,  -- collecte_ok | bac_vide | absent | inaccessible
  latitude REAL,
  longitude REAL,
  timestamp INTEGER NOT NULL,
  synced INTEGER DEFAULT 0
);

CREATE TABLE incidents_offline (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  description TEXT,
  photo_uri TEXT,
  latitude REAL,
  longitude REAL,
  timestamp INTEGER NOT NULL,
  synced INTEGER DEFAULT 0
);
```

**Synchronisation** :
```ts
// Écouter le retour de la connectivité
import NetInfo from '@react-native-community/netinfo';

NetInfo.addEventListener(state => {
  if (state.isConnected) {
    syncPendingScans();    // flush scans_offline WHERE synced = 0
    syncPendingIncidents(); // flush incidents_offline WHERE synced = 0
  }
});
```

### 10.3 Géolocalisation

**Permissions** :
```ts
import * as Location from 'expo-location';
const { status } = await Location.requestForegroundPermissionsAsync();
```

**Usage** :
- Incidents collecteur → position auto-détectée
- Signalements citoyen → position auto-détectée
- Carte de tournée → centrage initial sur position agent

**Fallback** si pas de permission : afficher saisie manuelle de l'adresse.

### 10.4 Caméra (Photo d'incident)

```ts
import * as ImagePicker from 'expo-image-picker';

const pickImage = async () => {
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
    allowsEditing: false,
  });
  if (!result.canceled) {
    setPhotoUri(result.assets[0].uri);
  }
};
```

Upload vers Supabase Storage :
```ts
const { data, error } = await supabase.storage
  .from('incident-photos')
  .upload(`${incidentId}.jpg`, formData);
```

### 10.5 Notifications Push

Via `expo-notifications` :
- Citoyen : rappel la veille d'une collecte, confirmation quand signalement résolu
- Collecteur : nouveau point de tournée ajouté, alerte bac débordant sur son secteur
- Mairie : nouveau signalement d'urgence, camion en panne

```ts
// Enregistrer le device token au login
const token = await Notifications.getExpoPushTokenAsync();
await supabase.from('user_push_tokens').upsert({ user_id, token });
```

---

## 11. Backend — Supabase

### 11.1 Tables principales

```sql
-- Utilisateurs (extends auth.users)
users (
  id uuid references auth.users,
  role text, -- citoyen | collecteur | mairie | enterprise
  nom text,
  email text,
  tel text,
  secteur text,
  avatar_url text
)

-- Ménages
menages (
  id uuid,
  nom text,
  adresse text,
  secteur text,
  qr_code text unique, -- format MKT-YDE3-{secteur}-{id}
  abonnement_statut text, -- actif | expire | suspendu
  abonnement_expire_at timestamptz,
  points_ecolo integer default 0,
  created_at timestamptz
)

-- Collectes
collectes (
  id uuid,
  menage_id uuid references menages,
  agent_id uuid references users,
  camion_id text,
  type text, -- collecte_ok | bac_vide | absent | inaccessible
  latitude real,
  longitude real,
  synced_at timestamptz,
  created_at timestamptz
)

-- Incidents
incidents (
  id text, -- INC-XXXX
  agent_id uuid references users,
  type text,
  description text,
  photo_url text,
  latitude real,
  longitude real,
  statut text, -- transmis | en_traitement | resolu
  created_at timestamptz
)

-- Signalements citoyens
signalements (
  id text, -- SIG-XXXX
  menage_id uuid references menages,
  type text, -- bac_plein | depot_sauvage | retard_collecte | incident_collecteur
  description text,
  photo_url text,
  latitude real,
  longitude real,
  statut text, -- nouveau | en_traitement | resolu
  created_at timestamptz
)

-- Centres de tri
centres_tri (
  id text, -- CT-001
  nom text,
  adresse text,
  tel text,
  statut text, -- ouvert | ferme
  latitude real,
  longitude real
)

-- Matières disponibles
matieres_dispo (
  id uuid,
  centre_id text references centres_tri,
  type text,
  categorie text,
  quantite_kg integer,
  prix_fcfa_kg integer,
  disponible boolean
)
```

### 11.2 Authentification
```ts
// Login
const { data, error } = await supabase.auth.signInWithPassword({
  email, password
});

// Après login, récupérer le rôle
const { data: profile } = await supabase
  .from('users')
  .select('role, nom')
  .eq('id', session.user.id)
  .single();

// Rediriger selon profile.role
```

### 11.3 Realtime (optionnel V2)
Pour le dashboard mairie (carte temps réel) :
```ts
supabase.channel('collectes_live')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'collectes' }, 
    (payload) => updateMap(payload.new))
  .subscribe();
```

---

## 12. Paiement Mobile Money

### 12.1 Providers concernés
- **MTN Mobile Money** (MTN MoMo)
- **Orange Money**

### 12.2 Flux paiement abonnement citoyen
1. Citoyen choisit son abonnement (mensuel indicatif)
2. Saisit son numéro MTN/Orange
3. Reçoit une demande de paiement sur son téléphone (USSD push)
4. Confirme avec son PIN
5. Backend reçoit le webhook de confirmation → met à jour `abonnement_statut`

> ⚠️ Pour la démo / MVP : afficher le flow UI sans intégration réelle. Utiliser l'API Campay (agrégateur MTN+Orange Cameroun) pour la prod.
> URL : https://campay.net — nécessite un compte business camerounais.

---

## 13. Structure de fichiers recommandée

```
MyKlinTown-Mobile/
├── app/
│   ├── (auth)/
│   │   ├── login.tsx
│   │   ├── signup.tsx
│   │   └── forgot.tsx
│   ├── (portals)/
│   │   ├── citoyen/
│   │   │   ├── _layout.tsx          # Tab navigator citoyen
│   │   │   ├── index.tsx            # Accueil citoyen
│   │   │   ├── abonnement.tsx
│   │   │   ├── qr-code.tsx
│   │   │   ├── signaler.tsx
│   │   │   ├── marketplace.tsx
│   │   │   └── recyclages.tsx
│   │   ├── collecteur/
│   │   │   ├── _layout.tsx
│   │   │   ├── index.tsx            # Tournée
│   │   │   ├── scan.tsx             # Scanner QR
│   │   │   ├── itineraire.tsx
│   │   │   ├── incidents.tsx
│   │   │   ├── qhse.tsx
│   │   │   └── performance.tsx
│   │   ├── dashboard/
│   │   │   ├── _layout.tsx
│   │   │   ├── index.tsx            # Vue d'ensemble
│   │   │   ├── territoire.tsx
│   │   │   ├── menages.tsx
│   │   │   ├── tournees.tsx
│   │   │   ├── recouvrement.tsx
│   │   │   ├── transformation.tsx
│   │   │   ├── signalements.tsx
│   │   │   └── rapports.tsx
│   │   └── enterprise/
│   │       ├── _layout.tsx
│   │       ├── index.tsx            # Tableau de bord
│   │       ├── centres-tri.tsx
│   │       ├── stock.tsx
│   │       ├── marketplace.tsx
│   │       ├── livraisons.tsx
│   │       └── facturation.tsx
│   ├── _layout.tsx                  # Root layout (fonts, providers)
│   └── index.tsx                    # Redirect selon auth state
├── components/
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Badge.tsx
│   │   ├── StatCard.tsx
│   │   ├── Logo.tsx
│   │   └── MapMarker.tsx
│   ├── PortalHeader.tsx             # Header commun tous portails
│   ├── MapView.tsx                  # Carte réutilisable (Plan/Satellite)
│   ├── QRScanner.tsx                # Scanner avec overlay
│   └── OfflineBanner.tsx            # Bandeau mode hors-ligne
├── constants/
│   ├── colors.ts
│   ├── typography.ts
│   ├── shadows.ts
│   └── portals.ts                   # Config nav (équiv. portal-config.ts)
├── store/
│   ├── auth.ts                      # Zustand: user, role, token
│   ├── offline.ts                   # Zustand: mode offline, queue
│   └── map.ts                       # Zustand: état cartes
├── lib/
│   ├── supabase.ts                  # Client Supabase
│   ├── sqlite.ts                    # Helpers expo-sqlite
│   └── sync.ts                      # Logique de synchronisation offline
├── assets/
│   ├── images/
│   │   └── logo-myklintown.png
│   └── fonts/                       # Barlow (si non Google Fonts)
├── app.json
├── package.json
└── tsconfig.json
```

---

## 14. Configuration Expo (`app.json`)

```json
{
  "expo": {
    "name": "MyKlinTown",
    "slug": "myklintown",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/logo-myklintown.png",
    "scheme": "myklintown",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/images/logo-myklintown.png",
      "resizeMode": "contain",
      "backgroundColor": "#1B3F63"
    },
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "cm.myklintown.app",
      "infoPlist": {
        "NSCameraUsageDescription": "Scanner les QR Codes des ménages et photographier les incidents.",
        "NSLocationWhenInUseUsageDescription": "Géolocaliser les signalements et suivre l'itinéraire de collecte.",
        "NSPhotoLibraryUsageDescription": "Téléverser des photos d'incidents."
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/logo-myklintown.png",
        "backgroundColor": "#1B3F63"
      },
      "package": "cm.myklintown.app",
      "permissions": [
        "CAMERA",
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "INTERNET"
      ]
    },
    "plugins": [
      "expo-router",
      "expo-camera",
      "expo-location",
      "expo-notifications",
      ["expo-barcode-scanner", { "cameraPermission": "Scanner les QR Codes des ménages." }]
    ]
  }
}
```

---

## 15. Données de démo (mock)

Toutes les données affichées sont fictives et représentent Yaoundé III. Pour la démo mobile sans backend :

```ts
// constants/demo-data.ts
export const DEMO_USERS = {
  citoyen:    { id: 'u1', nom: 'Marie Tsanga',  email: 'm.tsanga@orange.cm',       role: 'citoyen'    },
  collecteur: { id: 'u2', nom: 'Jean Fabrice',  email: 'agent-c217@myklintown.cm', role: 'collecteur' },
  mairie:     { id: 'u3', nom: 'Chef Service',  email: 'hygiene@yaounde3.cm',      role: 'mairie'     },
  enterprise: { id: 'u4', nom: 'Paul Essomba',  email: 'p.essomba@ecocycle.cm',    role: 'enterprise' },
};

// Pour la démo login : tout email avec password "demo123" → connecté
// Utiliser l'email pour déduire le portail :
// *@orange.cm ou *@gmail.com → citoyen
// *@myklintown.cm → collecteur
// *@yaounde3.cm → mairie
// *@ecocycle.cm ou *@*sarl.cm → enterprise
```

---

## 16. Points d'attention spécifiques mobile

1. **Tap targets minimum 44×44pt** — particulièrement pour les boutons "Commander" dans les tableaux
2. **Contraste élevé** pour le portail Collecteur (utilisé en plein soleil)
3. **Gestion du notch / safe area** via `react-native-safe-area-context` — appliquer `<SafeAreaView>` sur tous les écrans
4. **Carte en plein écran** sur l'écran de scan (pas de bordures, overlay transparent)
5. **Scroll horizontal** pour les tableaux à 5+ colonnes (pas de tableaux HTML → utiliser `ScrollView horizontal`)
6. **Feedback haptique** sur scan QR réussi (`expo-haptics`)
7. **Mode sombre** : pas supporté dans la V1 (forcer `userInterfaceStyle: "light"` dans app.json)
8. **Connexions lentes** : skeleton loaders sur toutes les listes, pas de spinners bloquants
9. **Taille d'image logo** : le PNG est 2.3 Mo — créer des versions redimensionnées pour l'app (256×256 icon, 512×512 splash)
10. **Polices Barlow** : charger uniquement les graisses utilisées (400, 600, 700) via `@expo-google-fonts/barlow`

---

## 17. Ordre de développement recommandé

1. **Setup** : Expo + Expo Router + NativeWind + Supabase client
2. **Design system** : Colors, Typography, Button, Badge, Card, StatCard, Logo
3. **Auth** : Login → redirect portail selon rôle
4. **PortalHeader** : composant header commun (logo + titre + cloche + avatar)
5. **Portail Citoyen** : index → QR Code → Signaler (dans cet ordre)
6. **Portail Collecteur** : index (tournée + carte) → Scanner QR → Incidents
7. **Mode offline** : SQLite + sync listener (pour Collecteur)
8. **Portail Mairie** : index (carte + KPIs + signalements)
9. **Portail B2B** : index + Centres de tri
10. **Notifications push** : token registration + notifications locales
11. **Pages secondaires** restantes (abonnement, marketplace, itinéraire, etc.)
