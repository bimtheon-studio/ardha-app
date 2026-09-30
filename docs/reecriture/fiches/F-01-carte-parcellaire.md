# F-01 · Carte et parcellaire : adresse, cadastre, sélection de parcelles

> Lot : L1 · Statut : `codée` — **arbitrages provisoires, à confirmer** (30/09/2026)
> Ancien code : `bimtheon-studio/ardha` @ `2a7f9a0` (export de `origin/main` le 30/09/2026)

## Ce que voit l'utilisateur

- **`/cadastre`**, étape 1 d'une étude (`src/App.tsx:92`), atteinte depuis « Nouvelle étude » de
  l'accueil (`src/components/dashboard/DashboardHero.tsx:15-30`, `src/pages/Home.tsx:107`), la barre
  latérale ou l'ouverture d'une étude (`src/pages/Home.tsx:68-80`).
- Un **tiroir** à gauche (colonne de 360 px ; feuille de 85 vw sur mobile, fermée par défaut) et la
  **carte** à droite (`src/pages/Cadastre.tsx:290-465`, `src/components/StudyDrawer.tsx:317-398`).
  Trois accordéons : « Recherche d'adresse », « Parcelles sélectionnées », « Couches cartographiques »
  (`src/components/StudyDrawer.tsx:102-103,153-309`).
- Parcours : taper une adresse → choisir une suggestion → la carte se centre (zoom 16) avec un
  marqueur → les parcelles de ±500 m s'affichent → cliquer des parcelles → liste, nombre, surface
  totale → « Analyser les risques » (`src/pages/Cadastre.tsx:197-288`).
- Sur la carte : parcelles en vecteur (survol : `AB12` et commune), bâtiments BD TOPO en gris, fond OSM
  (option « estompé »), boutons « Recentrer sur la sélection » et « Analyser les risques »
  (`src/components/CadastreMap.tsx:364-448,686-710`, `src/pages/Cadastre.tsx:416-461`).

Pas de capture : l'ancienne application tourne sur la constellation ; écrans décrits depuis le code.

## Comportements

Arbitrage : `D-xx` ou `PLAN §n` quand une décision le tranche ; `Qn` renvoie aux questions de fin de
fiche, **arbitrées provisoirement par l'agent** (porteur du produit absent la nuit du 30/09).

| # | Comportement | Ancien code | Arbitrage | Note |
|---|---|---|---|---|
| 1 | Recherche d'adresse : Géoplateforme `geocodage/search`, repli `api-adresse.data.gouv.fr`, 5 résultats, sans filtre | `src/lib/banGeocode.ts:8-48`, `src/hooks/useGeocoding.ts:33` | garder, **par le worker** (PLAN §3, Q1) ; repli abandonné | `api-adresse` en fin de vie depuis le 31/01/2026 (`docs/geo-foundation-audit.md:22-28`) |
| 2 | Suggestions après 300 ms, au-delà de 2 caractères ; Entrée prend la 1ʳᵉ ; libellé + contexte | `src/components/AddressSearch.tsx:32-63,182-202` | garder | |
| 3 | Réponses en retard qui écrasent les plus récentes (pas d'annulation) | `src/components/AddressSearch.tsx:32-49` | corriger | clé de requête par saisie (TanStack Query) |
| 4 | « Utiliser ma position » : géolocalisation puis géocodage inverse, messages d'erreur par cas | `src/components/AddressSearch.tsx:65-107`, `src/hooks/useGeocoding.ts:55-86` | garder (Q2) | |
| 5 | Adresse choisie : sonde « commune » (contour téléchargé pour tester `length > 0`) puis parcelles à ±0,005° | `src/pages/Cadastre.tsx:197-230` | simplifier : la BAN donne le code commune ; on charge **la commune entière** (PLAN §4) | sonde inutile (#6 du scan) |
| 6 | Parcelles lues **dans le navigateur** au WFS Géoplateforme par boîte, plafond silencieux de 5 000 | `src/hooks/useCadastreAPI.ts:18-30,259-283` | remplacer : cadastre Etalab chargé par le worker, parcelles servies par l'API (PLAN §3-4) | millésime connu et affiché |
| 7 | Parcelles chargées en naviguant, au zoom ≥ 16, bloqué après une recherche d'adresse | `src/pages/Cadastre.tsx:241-277`, `src/config/mapConfig.ts:10` | garder (zoom ≥ 16) ; blocage corrigé ; commune inconnue chargée d'elle-même (Q3) | |
| 8 | Recharge ±500 m autour de la sélection, fusion, 4 000 parcelles en mémoire | `src/pages/Cadastre.tsx:85-136` | abandonner | l'emprise visible suffit, la base répond vite |
| 9 | `fitBounds` intempestif sur toutes les parcelles chargées | `src/components/CadastreMap.tsx:444-448` | corriger | la vue ne bouge que sur une adresse ou « Recentrer » |
| 10 | Clic sur une parcelle : ajoute ou retire ; clic à vide : rien ; survol : `AB12` + commune | `src/components/CadastreMap.tsx:408-434`, `src/hooks/useParcelleSelection.ts:102-135` | garder | |
| 11 | Une parcelle ajoutée doit toucher la sélection ; test **sommet à sommet**, tolérance 0,00005° | `src/hooks/useParcelleSelection.ts:111-129`, `src/utils/geometryUtils.ts:358-375` | garder la règle (Q4) ; test **par distance entre bords**, 1 m | l'ancien test rejetait deux parcelles qui partagent un bord sans sommet commun |
| 12 | Retirer une parcelle du milieu laisse une sélection en morceaux, sans avertissement | `src/hooks/useParcelleSelection.ts:106-108` | corriger : retrait permis, avertissement « en N morceaux » (Q4) | |
| 13 | Aucun plafond de sélection | — | simplifier : 50 parcelles au plus (Q5) | |
| 14 | Sélection sur plusieurs communes, si contiguë | implicite (`src/pages/Risques.tsx:84-95` déduplique les codes) | garder (Q6) | |
| 15 | Surface : contenance cadastrale, sinon estimation plane sans les trous ; total = somme | `src/hooks/useCadastreAPI.ts:51-73,100`, `src/hooks/useParcelleSelection.ts:153-155` | garder la contenance ; surface géométrique **avec les trous**, affichée à côté | `calculatePolygonArea` était faux (sans cos φ) |
| 16 | Affichage `< 10 000` → « N m² », sinon « X.XX ha » | `src/components/ParcelSelectionContent.tsx:24-29` | garder, format français (« 1,25 ha ») | |
| 17 | Identifiant maison `insee_prefixe_section_numero` ; IDU seulement dans le PDF | `src/hooks/useCadastreAPI.ts:76-103`, `src/utils/geometryUtils.ts:154-162` | remplacer : **IDU officiel à 14 caractères** partout, affiché dans le détail | |
| 18 | Arrondissements de Paris, Lyon, Marseille (`code_arr`) | `src/hooks/useCadastreAPI.ts:85-90` | garder : le cadastre Etalab est publié par arrondissement ; la BAN donne le code d'arrondissement | |
| 19 | Corse refusée par `/^\d{5}$/` | `supabase/functions/fetch-gpu-layers/index.ts:352` | corriger : `2A`/`2B` acceptés | |
| 20 | Sélection en `localStorage` (géométries complètes), expirée après 2 h d'inactivité, synchronisée entre onglets | `src/hooks/useParcelleSelection.ts:18-93` | simplifier : **dans l'URL** (`/map?parcels=…`) jusqu'à l'étude enregistrée (L2) ; expiration abandonnée (Q7) | |
| 21 | Vue de carte en `localStorage` (`mapViewState`), France au zoom 6 par défaut | `src/components/CadastreMap.tsx:177-233` | garder, dans l'URL (`at=lat,lon,zoom`) | |
| 22 | Clé `searchLocation` lue partout, jamais écrite : restauration morte | `src/pages/Cadastre.tsx:144-195` | abandonner | |
| 23 | Fond OSM seul, option « estompé » | `src/config/mapConfig.ts:177-182`, `src/index.css:188-191` | remplacer : Plan IGN et photographies aériennes IGN (D-08, Q8) ; « estompé » gardé | |
| 24 | Bâtiments BD TOPO lus au WFS dans le navigateur, repli Overpass, cache IndexedDB | `src/hooks/useIGNAPI.ts:133-298`, `src/lib/wfsCache.ts` | reporter (Q9) | le Plan IGN montre déjà le bâti |
| 25 | Adresses dérivées de la sélection (géocodage inverse de 12 points, tri par hiérarchie de voie) | `src/hooks/useParcelAddresses.ts` | reporter en L2 (adresse principale de l'étude) | filtre défaillant : boîte au lieu du polygone (#5 du scan) |
| 26 | Altimétrie : résumé, mires, isolignes | `src/pages/Cadastre.tsx:332-356` | reporter en L4 (PLAN §6 : altimétrie dans Risques) | |
| 27 | « Aperçu rapport Cadastre » (PDF capturé dans le navigateur) | `src/pages/Cadastre.tsx:362-376`, `src/utils/pdfReports/cadastreReport.ts` | reporter en L8 (D-08 : cartes des PDF composées par le worker) | |
| 28 | « Analyser les risques », étapes 1 à 7 de l'étude, bouton « Recentrer » | `src/pages/Cadastre.tsx:279-288,416-437`, `src/components/StudyDrawer.tsx:38-46` | « Recentrer » gardé ; enchaînement des étapes reporté en L2 | |
| 29 | Accès conditionné à l'abonnement (`requiredFeature="cadastre"`) | `src/App.tsx:92` | abandonner (D-02) | |
| 30 | Mobile : tiroir en feuille, bandeau d'aide selon le contexte | `src/components/StudyDrawer.tsx:317-364`, `src/pages/Cadastre.tsx:403-413` | garder (Q10) | panneau en bas d'écran sur mobile |
| 31 | Toasts « N parcelles trouvées / chargées » | `src/pages/Cadastre.tsx:221,272` | abandonner | remplacé par l'état de la commune (chargement, millésime) |
| 32 | Erreurs avalées (`catch {}`, `console.warn`) | voir scan §6.10 | corriger : chaque échec a un message et « Réessayer » | |

## Règles métier

- **IDU** (identifiant de parcelle) : 14 caractères = code commune INSEE (5, `2A`/`2B` en Corse,
  `97x` outre-mer) + préfixe (3, `000` sauf commune absorbée) + section (2, complétée par `0` à
  gauche) + numéro (4). Libellé affiché : section et numéro sans les zéros (`AB 12`), précédés du
  préfixe s'il n'est pas `000`.
- **Contiguïté** : deux parcelles se touchent quand la distance entre leurs bords est d'au plus
  **1 m** (tolérance aux imprécisions du plan cadastral). Une parcelle ajoutée doit toucher au moins
  une parcelle déjà sélectionnée. Le nombre de morceaux d'une sélection est le nombre de composantes
  connexes de cette relation.
- **Surfaces** : la *contenance* est la surface cadastrale (m², donnée de la DGFiP) ; la *surface
  calculée* est l'aire géodésique approchée du polygone, trous déduits (projection locale
  équirectangulaire, écart < 0,1 % à l'échelle d'une parcelle). Totaux : sommes.
- **Emprise des parcelles** servies par l'API : au plus 0,03° de côté (≈ 3,3 × 2,2 km), au plus
  5 000 parcelles, et le front ne les demande qu'au zoom ≥ 16.

## Données

- **Sources externes**, appelées par le worker seul :
  - géocodage Géoplateforme `https://data.geopf.fr/geocodage/search` et `/reverse` (BAN) ; limite
    publiée : 50 requêtes/s par IP ; réponses gardées 24 h en cache ;
  - `https://geo.api.gouv.fr/communes/{code}` (nom, codes postaux, centre, contour) et
    `/communes?lat&lon` (commune d'un point) ;
  - cadastre Etalab, par millésime : `https://cadastre.data.gouv.fr/data/etalab-cadastre/<millésime>/geojson/communes/<dép>/<code>/cadastre-<code>-parcelles.json.gz`
    (liste des millésimes : l'index du répertoire). Trimestriel.
- **Lu / écrit** : l'ancien code n'écrivait rien en base pour L1 (tout en `localStorage`, voir le scan
  §5) ; la sélection finissait dans `etudes.parcelles` (L2). Cible (données de référence) :
  `communes`, `parcels`, `source_states`.

## Cas limites et bugs connus

Tirés du scan (`2a7f9a0`) : `searchLocation` jamais écrite (#22) ; `fitBounds` intempestif (#9) ;
chargement par navigation bloqué après une recherche (#7) ; contiguïté sommet à sommet (#11) et
sélection en morceaux (#12) ; plafond silencieux de 5 000 parcelles (#6) ; ordre des axes des boîtes
incohérent entre cadastre et BD TOPO ; courses entre recherches (#3) ; surface sans les trous et
`calculatePolygonArea` faux (#15) ; Corse refusée (#19) ; erreurs avalées (#32).

## Tests existants

- `src/utils/__tests__/geometryUtils.test.ts` (centroïde, surface, contiguïté, formatage) : pur ;
  les cas de contiguïté et de formatage sont repris, adaptés à la nouvelle règle.
- `src/hooks/__tests__/useParcelleSelection.test.ts` : les règles (1ʳᵉ parcelle libre, rejet non
  contigu, bascule, total) sont reprises en tests du domaine.
- Rien sur `useCadastreAPI`, `banGeocode`, `AddressSearch` ni la page : réécrits avec la page.

## Questions (arbitrages provisoires)

| # | Question | Arbitrage provisoire de l'agent | Pour changer |
|---|---|---|---|
| Q1 | La recherche d'adresse passe par le worker (l'API attend sa réponse, 5 s au plus) : acceptable pour une autocomplétion ? | oui : ~50 ms de plus qu'un appel direct, cache 24 h, et « seul le worker sort » tient | faire sortir l'API pour le seul géocodage (exception à PLAN §3) |
| Q2 | Garder « Utiliser ma position » ? | garder | retirer le bouton |
| Q3 | Commune pas encore chargée quand on navigue : la charger d'elle-même ? | oui, au zoom ≥ 16 (une commune ≈ 0,5 à 3 Mo, une fois par trimestre) | bouton « Charger le cadastre de … » |
| Q4 | Contiguïté exigée à l'ajout ; retrait libre avec avertissement ? | oui aux deux | sélection libre (avertissement seul), ou retrait refusé |
| Q5 | Plafond de sélection ? | 50 parcelles | `SELECTION_MAX` dans `src/domain/selection.ts` |
| Q6 | Sélection sur plusieurs communes ? | permise si contiguë | la limiter à une commune |
| Q7 | Où vit la sélection avant L2 ? | dans l'URL, partageable et rechargeable ; plus d'expiration | `localStorage` |
| Q8 | Quels fonds ? | Plan IGN (par défaut), photographies aériennes ; option « estompé » | la configuration est servie par l'API (`/api/map/layers`) |
| Q9 | Bâtiments en surimpression ? | reporter : le Plan IGN les montre ; le cadastre Etalab publie des bâtiments par commune si on en veut en vecteur | charger `cadastre-<code>-batiments` avec les parcelles |
| Q10 | Mobile ? | même page, panneau en bas d'écran | |
| Q11 | Petite commune de recette (question ouverte du PLAN) ? | **Beaumont-Village (37023)**, au RNU selon l'API Carto du GPU le 30/09/2026 | en choisir une autre |

## Conception cible

- **Données** (référence, reconstructibles) : `communes` (code INSEE, nom, département, codes postaux,
  centre, contour) ; `parcels` (IDU, commune, préfixe, section, numéro, contenance, géométrie
  MultiPolygon 4326, millésime) ; `source_states` (source, périmètre, état `queued` / `loading` /
  `ready` / `failed`, millésime, date, nombre d'éléments, erreur, tentatives).
- **Worker** : file `cadastre` (`cadastre:load-commune`, idempotent, une commune à la fois par
  commune, remplacement en une transaction) ; file `lookups` (`address:search`, `address:reverse`,
  `commune:locate`, en requête-réponse, débit limité) ; réconciliation toutes les 5 min (réenfile ce
  qui est resté `queued` ou `loading`).
- **API** : `GET /api/addresses/search`, `GET /api/addresses/reverse`, `GET /api/communes/locate`,
  `GET /api/communes/:code`, `POST /api/communes/:code/cadastre`, `GET /api/parcels?bbox=`,
  `GET /api/parcels?ids=`, `GET /api/map/layers`.
- **CLI** : `commune:load`, `commune:show`, `commune:list`, `parcel:show`, `parcel:at`,
  `parcel:selection`, `address:search`, `address:reverse`, `source:record`.
- **Écran** : `/map` ; règles de sélection et de surface dans le domaine, partagées par le front et
  l'API.

## Recette

À faire : voir la feuille de route.

## Écarts assumés

- La sélection vit dans l'URL, plus dans `localStorage` (Q7) ; plus d'expiration à 2 h.
- L'IDU officiel remplace l'identifiant maison (#17).
- Le fond OSM laisse la place aux fonds IGN (#23) ; les bâtiments BD TOPO ne sont plus superposés
  (#24, Q9).
