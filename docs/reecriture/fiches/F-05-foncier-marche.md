# F-05 · Foncier et marché : prix de vente autour d'une étude

> Lot : L5 · Statut : `recettée` en local (02/10/2026) ; arbitrages Q1 à Q10 rendus par le porteur du produit le 02/10/2026 · Branche :
> `l5-land-market` (partie de `master`)
> Ancien code : `bimtheon-studio/ardha` @ `2a7f9a0`

## Ce que voit l'utilisateur

- **`/foncier`**, étape 3 de l'étude (`src/pages/Foncier.tsx`, 263 l.) : tiroir à gauche (sélection
  en lecture, « Périmètre », « Transactions DVF », « Analyse de marché »), carte à droite avec les
  ventes DVF (`Foncier.tsx:190-259`).
- **Périmètre** : rayon 500 m / 1 km / 2 km (`components/foncier/RadiusSlider.tsx`), filtres type de
  bien, neuf / ancien, affichage en points ou en parcelles vendues, carte de chaleur
  (`components/foncier/DVFMapFilter.tsx`, `Foncier.tsx:67-89`).
- **Transactions DVF** : nombre de ventes, prix moyen, prix moyen au m² (`components/DVFPanel.tsx:60-70`).
- **Analyse de marché** : courbe des prix par trimestre, ancien et neuf, avec projections
  (`foncier/PriceHistoryChart.tsx`) ; neuf contre ancien, ECLN, permis Sitadel
  (`foncier/NewBuildAnalysisPanel.tsx`) ; indices INSEE (`foncier/MarketIndicesPanel.tsx`) ; prix
  projeté à 1–5 ans (`foncier/PriceProjectionCard.tsx`) ; PDF « Aperçu rapport Foncier »
  (`Foncier.tsx:162-186`).
- Rien n'est enregistré dans l'étude. Faisabilité relit plus tard le cache de marché de la commune,
  quel que soit le rayon (`pages/Faisabilite.tsx:377-421`).

## Comportements

Arbitrage : `D-xx` / `PLAN §n` quand une décision le tranche ; `Qn` renvoie aux questions de fin de
fiche.

| # | Comportement | Ancien code | Arbitrage | Note |
|---|---|---|---|---|
| 1 | DVF : Cerema `apidf` d'abord (bbox, 10 ans), geo-DVF par commune en repli | `_shared/dvf.ts:6-16,184-216`, `market-analysis/index.ts:204-236` | remplacer : **`dvf_mutations` en base**, chargée par le worker depuis geo-DVF (PLAN §4) ; périmètre du chargement (Q1) | Cerema répond 503 (vérifié le 02/10/2026) |
| 2 | Repli geo-DVF : la commune seule, ventes sans coordonnées gardées, rayon × 2 | `market-analysis/index.ts:225-231` | corriger : requête spatiale en base, rayon exact, ventes sans coordonnées exclues | |
| 3 | Paris, Lyon, Marseille : arrondissement du point, ou le 1ᵉʳ par défaut | `market-analysis/index.ts:371-416`, `dvf-archive/plm.ts` | simplifier : sans objet, le chargement est départemental | |
| 4 | Dédoublonnage des lignes geo-DVF par `id_mutation` (locaux, terrains par culture) | `_shared/dvf.ts:347-434` | **garder** (domaine, test porté) | une vente multi-lots compte une fois |
| 5 | Exclusions : valeur < 5 000 €, bâti < 9 m², €/m² hors bornes par type ; IQR 1,5 dès 4 ventes | `_shared/dvf.ts:117-139,448-455` | garder (domaine, tests portés) ; filtres de ventes (Q3) | |
| 6 | Aucun filtre sur la nature : adjudications, échanges, expropriations comptés | `_shared/dvf.ts:304-321`, `market-analysis/index.ts:123-130` | corriger (Q3) | 185 de 46 312 lignes en 2025 dans le 94 |
| 7 | Rayon adaptatif : 500 → 1 000 → 2 000 m tant que moins de 20 ventes | `market-analysis/index.ts:240-263` | Q2 | le rayon affiché n'est plus celui demandé |
| 8 | Centre : 1ʳᵉ parcelle pour l'analyse, centre de toutes pour la carte | `hooks/useMarketAnalysis.ts:105-109`, `hooks/useDVFMapData.ts:72-90` | corriger : un seul centre, celui des parcelles de l'étude (Q2) | |
| 9 | Médiane par trimestre et par type, seulement si prix au m² bâti | `_shared/dvf.ts:457-494` | Q4 | « Terrain » n'a jamais d'agrégat (#16) |
| 10 | Tendance : moindres carrés pondérés sur 12 trimestres, mêlée à 60/40 avec INSEE, bornée à ±15 % ; projections à 1–5 ans | `market-analysis/index.ts:600-708` | Q4, Q5 | les séries INSEE sont fausses (#12) |
| 11 | Prix courant = médiane du **dernier** trimestre | `market-analysis/index.ts:652` | Q4 | souvent quelques ventes seulement |
| 12 | Indices INSEE « prix de l'ancien » `001565183`, `001565207`, IRL `001515333` | `market-analysis/index.ts:20-24,420-459` | Q8 | `001565183` est un indice du coût du travail, `001565207` une balance commerciale (vérifié sur bdm.insee.fr le 02/10/2026) ; « −4 » suppose des trimestres sur une série mensuelle |
| 13 | ECLN : import DiDo du SDES, table `ecln_prix_neufs` (trimestre, département, type, prix moyen, réservations) | `import-ecln/index.ts:11,47-85` | Q6 | 24 667 lignes, 2005-T1 à 2026-T2, 1,6 Mo ; pas de DOM |
| 14 | Neuf contre ancien : moyenne des médianes trimestrielles VEFA et ancien ; « nb_transactions » = nombre de trimestres | `market-analysis/index.ts:463-525` | Q6 | |
| 15 | Sitadel : logements autorisés par an et par commune (DiDo), repli sur les DPE neufs de l'ADEME | `market-analysis/index.ts:527-598` | Q7 | DiDo répond (vérifié le 02/10/2026) ; le repli ADEME cherche le code en texte libre |
| 16 | Faisabilité : `prixTerrainM2` lu sur « Terrain », toujours nul → coût du terrain 0 € | `Faisabilite.tsx:394-399,513-514` | corriger : prix du terrain au m² de terrain (Q3) ; consommé en L7 | |
| 17 | Faisabilité : ECLN filtré sur `Appartement`, qui n'existe pas (`Collectif`, `Individuel`, `Tous logements`) → prix du neuf toujours nul | `Faisabilite.tsx:410-421` | corriger (Q6) ; consommé en L7 | |
| 18 | Faisabilité relit le cache de la commune au dernier rayon calculé, quel qu'il soit | `Faisabilite.tsx:379-386` | remplacer : l'analyse de l'étude (Q9) | |
| 19 | Cache `market_data_cache` 30 jours par commune et rayon, pas de cache si 0 vente | `market-analysis/index.ts:82-98,171-184` | remplacer : les données sont en base, rien à cacher | |
| 20 | Archive `dvf_price_aggregates` : agrégats par commune au-delà de la fenêtre de 5 ans | `dvf-archive/index.ts`, `market-analysis/index.ts:265-316` | remplacer : on **garde les millésimes passés** de `dvf_mutations` (Q1) | |
| 21 | Communes voisines (rayon ≥ 2 km) : 8 points du cercle sur geo.api.gouv.fr | `market-analysis/index.ts:100-105,318-369` | simplifier : communes des ventes retenues, lues en base | |
| 22 | Carte : points ou parcelles vendues colorés par €/m² (échelle P10–P90), carte de chaleur IDW | `utils/dvfPriceScale.ts`, `utils/idwPriceHeatmap.ts`, `CadastreMap.tsx:1141-1230` | Q10 | parcelles vendues : géométries Cerema seulement |
| 23 | Popup de vente en HTML non échappé (adresse, nature) | `CadastreMap.tsx:1141-1160` | corriger : composant React | |
| 24 | Erreurs avalées : sources en échec → 0 vente sans le dire | `market-analysis/index.ts:221-235,453-455` | corriger : état par source, l'indisponibilité est dite (comme F-04) | |
| 25 | Indices de la construction ICC `000008630`, BT01 `001710986`, sans cache | `construction-indices/index.ts:9-10` | Q8 | séries justes (vérifié le 02/10/2026) |
| 26 | Tendance × 100 sur mobile et dans le PDF (déjà en %) | `pages/mobile/MobileStudyView.tsx:144`, `pdfReports/foncierReport.ts:57` | corriger | 3,2 % affiché 320 % |
| 27 | PDF Foncier : clés d'indices qui n'existent pas → « — » partout | `Foncier.tsx:168-185` | reporter en L8 (D-08) | |
| 28 | Couverture : 57, 67, 68, 976 exclus ; Corse refusée (`^\d{5}$`) ; département DOM pris sur 2 chiffres | `_shared/dvf.ts:27,53-56`, `market-analysis/index.ts:63,115`, `useMarketAnalysis.ts:107` | corriger : Alsace-Moselle et Mayotte « non couverts par DVF », dits ; 2A/2B acceptés ; DOM sur 3 chiffres | |
| 29 | Profondeur d'historique 1–10 ans, horizon de projection 1–5 ans | `Foncier.tsx:34-35`, `foncier/HorizonSlider.tsx` | Q4, Q5 | |

## Règles métier

- **Dédoublonnage geo-DVF** (`_shared/dvf.ts:347-434`) : geo-DVF publie une ligne par disposition ×
  parcelle × local × nature de culture, chacune avec la valeur foncière entière. Une mutation =
  un `id_mutation` ; locaux dédoublonnés par (parcelle, type, surface, pièces), terrain par
  (parcelle, culture, surface) ; type dominant : maison, appartement, local, dépendance, sinon
  terrain ; pièces seulement si un seul logement.
- **VEFA** : nature « Vente en l'état futur d'achèvement » (`_shared/dvf.ts:76-79`).
- **Bornes de prix au m² bâti** (`_shared/dvf.ts:119-128`) : appartement 500–25 000 €, maison
  500–20 000 €, local 200–15 000 €, dépendance 200–10 000 €, autres 100–30 000 € ; valeur ≥ 5 000 € ;
  bâti ≥ 9 m².
- **IQR** (`_shared/dvf.ts:448-455`) : dès 4 prix, on garde [Q1 − 1,5 IQR ; Q3 + 1,5 IQR].
- **Calendrier DVF** (`_shared/fraicheur.ts:24-27`) : la DGFiP publie en avril et en octobre et
  remplace les fichiers entiers. Fichiers geo-DVF du 18/05/2026 (vérifié le 02/10/2026) ; 5
  millésimes, 2021 à 2025, 2025 complet au 31/12.
- **Rayon** (`market-analysis/rayon.ts`) : arrondi à 100 m, borné à 100–2 000 m.

## Données

- **Sources externes** (toutes vérifiées le 02/10/2026) :
  - geo-DVF d'Etalab : `files.data.gouv.fr/geo-dvf/latest/csv/{année}/departements/{dép}.csv.gz`.
    Environ 1 à 2 Mo par département et par an (94 en 2025 : 46 312 lignes, 19 057 mutations).
    France entière : 93 Mo par an. Mis à jour 2 fois par an ; `Last-Modified` sert de version.
  - ECLN (SDES, DiDo `95e4190c-…`) : CSV complet de 1,6 Mo, trimestriel, par département et par
    type (collectif, individuel, tous) : mises en vente, réservations, stock, délai, prix au m².
  - Sitadel (SDES, DiDo `9c90a880-…`) : par commune et par an, logements et surfaces autorisés et
    commencés, par type (individuel pur, groupé, collectif, résidence).
  - INSEE BDM : ICC `000008630` (trimestriel), BT01 `001710986` (mensuel), IRL `001515333`.
  - Cerema `apidf` : HTTP 503, abandonné.
- **Lu / écrit** : `market_data_cache`, `dvf_price_aggregates`, `ecln_prix_neufs`,
  `etudes.donnees_foncier` → `dvf_mutations` (référence, par millésime), `new_build_prices`
  (référence), `source_states` (version par département et par millésime), analyse `market` de
  l'étude (`study_analyses`, DT-33).

## Cas limites et bugs connus

Bugs déjà listés dans le tableau : #2, #6, #8, #11, #12, #14, #16, #17, #18, #23, #24, #26, #27, #28.
Restent :

- **Ventes de plusieurs logements** (immeuble entier, lot de 5 appartements) : le prix au m²
  porte sur la somme des surfaces, et la vente compte comme un seul appartement (`_shared/dvf.ts:390-397`).
- **Maison avec terrain** : le prix au m² bâti contient la valeur du terrain. C'est l'usage DVF ;
  à dire à l'écran.
- **Une même vente sur deux communes** : un `id_mutation` unique dans le fichier départemental.
  Le chargement par commune pouvait la compter deux fois.
- **Rayon à cheval sur deux départements** : il faut charger les deux.

## Tests existants

Dans `supabase/functions/_shared/__tests__/` :

- `dvf.test.ts` (122 l.) : dédoublonnage, bornes, IQR, agrégats. **Porté.**
- `dvf-plm.test.ts` : sans objet (#3).
- `dvf-cache.test.ts` : sans objet (#19).
- `insee-bdm.test.ts` : lecture SDMX ; porté si Q8 garde ICC et BT01.
- `market-rayon.test.ts` : porté si Q2 garde une grille de rayons.
- `fraicheur.test.ts` : la règle « calendrier » est portée pour DVF.

Dans `src/utils/__tests__/` : `dvfPriceScale.test.ts`, porté avec l'échelle P10–P90 (Q10).

## Questions (arbitrées le 02/10/2026)

| # | Question | Réponse |
|---|---|---|
| Q1 | Chargement DVF | **Par département, à la demande** : la 1ʳᵉ étude d'un département charge ses millésimes, un rayon à cheval charge les deux ; rechargé au calendrier DGFiP quand le fichier change ; **les millésimes sortis de la fenêtre restent en base** |
| Q2 | Périmètre | **Centre des parcelles de l'étude**, rayon 250 m / 500 m / 1 km / 2 km (500 m par défaut) gardé dans l'étude ; **jamais d'élargissement automatique**, un message le propose sous 20 ventes |
| Q3 | Ventes retenues | **Ventes et VEFA** (adjudications, échanges, expropriations exclues) ; bâti : **une seule maison ou un seul appartement** (dépendances admises), maison et appartement séparés, ancien et VEFA séparés ; **terrain** : ventes de terrain à bâtir et ventes sans bâti, en € par m² de terrain ; bornes et IQR gardés |
| Q4 | Statistique | **Médiane des 12 derniers mois** disponibles, nombre de ventes, P25–P75 ; historique par année, par trimestre quand il y a assez de ventes ; tendance = 12 derniers mois contre les 12 précédents ; avertissement sous 20 ventes |
| Q5 | Projections | **Reportées en L7** (avec le bilan) |
| Q6 | Prix du neuf | **Les deux côte à côte** : médiane VEFA du rayon et ECLN du département (collectif, individuel, 4 derniers trimestres, réservations), chacun avec sa source et sa date ; écart neuf / ancien |
| Q7 | Sitadel | **Oui, sans repli ADEME** : logements autorisés et commencés par an et par type, 8 ans, commune de l'étude, gardés 30 jours |
| Q8 | Indices INSEE | **ICC, BT01 et les vrais indices des prix des logements anciens** (INSEE-Notaires) ; séries de prix fausses et IRL abandonnées |
| Q9 | Persistance | **Une analyse `market` par étude** (DT-33), pour ses parcelles et son rayon, citant millésimes DVF et trimestre ECLN ; « données plus récentes » quand un millésime arrive ; filtres de la carte calculés à la volée |
| Q10 | Carte et liste | **Points, liste des ventes et parcelles vendues** (contours tirés de notre cadastre par l'IDU de la vente) ; carte de chaleur reportée |

## Conception cible

### Données de référence (worker)

- **`dvf_mutations`** : une ligne par mutation dédoublonnée (règle de `_shared/dvf.ts:347-434`).
  Colonnes : `id` (`id_mutation`), `year` (millésime du fichier), `department_code`,
  `commune_code`, `date`, `nature`, `vefa`, `price`, `property_type` (`house`, `apartment`,
  `land`, `commercial`, `outbuilding`, `other`), `dwelling_count`, `built_area`, `land_area`,
  `rooms`, `parcel_ids text[]`, `address`, `postcode`, `point`, `locals jsonb` (type, surface,
  pièces de chaque local). Index GiST sur `point`, index sur (`department_code`, `year`).
- Un chargement **remplace les lignes d'un (département, millésime)** dans une transaction. Un
  millésime absent de la source n'est jamais effacé (Q1). L'état vit dans `source_states` (source
  `dvf`, périmètre `94/2025`, version = date du fichier lue dans l'index de geo-DVF, qui donne taille
  et date de chaque fichier). Le nombre de millésimes chargés se règle (`DVF_YEARS`, tous par
  défaut ; 2 en test pour garder les enregistrements légers).
- **Fraîcheur** : règle « calendrier » de `_shared/fraicheur.ts` portée. Après le 1ᵉʳ avril ou le
  1ᵉʳ octobre, l'index est relu ; un fichier dont la date a changé est rechargé.
- **`new_build_prices`** (ECLN, Q6) : (`department_code`, `quarter`, `housing_type` `collective` /
  `individual` / `all`), mises en vente, réservations, annulations, stock, délai d'écoulement, prix
  au m², prix moyen d'un logement individuel. Fichier complet (1,6 Mo) chargé d'un coup ; relu une
  fois par trimestre.
- **`index_values`** (Q8) : (`series`, `period`, `value`). Le catalogue des séries est dans le domaine :
  - ICC `000008630`, BT01 `001710986` ;
  - prix des logements anciens CVS :
    - France métropolitaine `010567057` (appartements) et `010567061` (maisons) ;
    - Province `010567063` et `010567075` ;
    - départements d'Île-de-France (appartements et maisons), Paris appartements `010567013`.
  - Une étude lit la série de sa zone (son département en Île-de-France, la province ailleurs) et la
    série France. Pas d'indice local pour les DOM. Les séries sont relues une fois par mois.
- **`housing_permits`** (Sitadel, Q7) : (`commune_code`, `year`, `housing_type`), logements et
  surfaces autorisés et commencés ; état par commune dans `source_states` (`sitadel`), 30 jours,
  donnée ancienne servie si DiDo se tait (comme DT-38).

### Analyse de l'étude

- `studies.market_radius_m` (250, 500, 1 000, 2 000 ; 500 par défaut). L'analyse `market` de
  `study_analyses` est périmée si les parcelles ou le rayon changent. Si un millésime plus récent
  est chargé, l'écran dit « données plus récentes disponibles ».
- **Job `market:analyze`** :
  1. centre = centroïde de l'union des parcelles ;
  2. départements touchés par le cercle (centre et 8 points du cercle, `commune:locate`) ;
  3. DVF de ces départements chargé s'il manque ou si une publication est passée ;
  4. ECLN, indices, Sitadel ;
  5. statistiques ;
  6. cadastre des communes des ventes demandé à la file existante, pour les parcelles vendues
     (sans bloquer : une vente dont la parcelle n'est pas encore chargée reste un point).
  - Chaque étape écrit sa progression, comme en L4.
- **Résultat** (schéma zod versionné, `MARKET_VERSION`) :
  - centre, rayon ;
  - couverture (`covered`, `not-covered` pour 57, 67, 68, 976) ;
  - par type (maison, appartement, terrain) et segment (ancien, VEFA) : médiane, P25, P75, nombre,
    période couverte, tendance, médiane précédente ;
  - historique annuel, et trimestriel si l'effectif suffit ;
  - neuf : VEFA, ECLN des 4 derniers trimestres, écart ;
  - Sitadel ; indices (dernière valeur, évolution sur 1 an) ;
  - communes des ventes ;
  - sources (millésimes et dates de fichier DVF, trimestre ECLN, dates des indices et de Sitadel),
    chacune `ok` ou `unavailable` (DT-34).
- **Ventes** : `GET /studies/:id/market/sales` lit `dvf_mutations` dans le cercle, avec les filtres
  type, segment et période, et joint les contours de `parcels` par l'IDU. L'API ne lit que la base.

### API, CLI, écran

- **API** : `GET /studies/:id/market`, `POST /studies/:id/market` (recalculer),
  `PATCH /studies/:id` (`marketRadiusM`), `GET /studies/:id/market/sales`.
- **CLI** :
  - `dvf:load <département> [--year] [--inline]`, `dvf:status [département]`,
    `dvf:sales --lon --lat --radius` ;
  - `market:analyze <étude> [--inline]`, `market:show <étude>` ;
  - `ecln:load`, `index:load`, `sitadel:show <commune>` ;
  - toutes avec `--json`.
- **Écran `/studies/:id/market`** (« Foncier et marché »), étape après Risques :
  - choix du rayon ;
  - cartes de prix (maison, appartement, terrain ; ancien, neuf) avec effectifs et avertissement ;
  - historique (graphique SVG maison, sans bibliothèque) ;
  - neuf (VEFA contre ECLN), Sitadel, indices ;
  - carte : cercle, points et parcelles vendues colorés par €/m² (échelle P10–P90 portée, légende) ;
  - filtres ; liste des ventes, triée par date ou distance, dont un clic centre la carte ;
  - fiche de vente en React (#23).

## Recette

Recette du 02/10/2026, en local.

**Maisons-Alfort AY96 + AY97, réponses enregistrées** (2 millésimes, 2024-2025 ; tests d'intégration,
e2e et CLI).

| Rayon | Ventes du cercle | Comparables | Appartements anciens | Maisons anciennes | Appartements VEFA |
|---|---|---|---|---|---|
| 500 m | 331 | 276 | 5 465 €/m² (131 ventes, −1,3 % sur un an) | 6 056 €/m² (11 ventes, peu de ventes) | aucune vente sur 12 mois |
| 1 km | 1 010 | 783 | 5 263 €/m² (339 ventes, −1,5 %) | 5 965 €/m² (38 ventes, −2,8 %) | 7 131 €/m² (40 ventes) |

Les autres sources :
- **ECLN du Val-de-Marne** : 2026-T2, collectif 5 739 €/m², 957 réservations.
- **Sitadel de Maisons-Alfort** : 95 logements autorisés en 2025.
- **Indices** : ICC 2 103 (2026-Q2, +0,8 % sur un an) ; appartements anciens du Val-de-Marne 114,7
  (−0,9 %).

**En direct, base de développement** : Val-de-Marne, 5 millésimes (2021-2025) chargés en 5,7 s. À
500 m : 791 ventes comparables sur 946.

- **Analyse de bout en bout** : 7,7 s au premier passage, dont 2,1 s pour l'ECLN et 4,1 s pour
  Sitadel.
- **Analyses suivantes** : moins de 0,5 s, tout est en base.
- **Départements du cercle** : 9 points interrogés en parallèle, moins de 0,3 s ; c'était 2,7 à 5 s
  à la suite.

**Hors couverture et sources muettes** (tests d'intégration) :
- une parcelle à Metz donne « DVF ne couvre pas l'Alsace-Moselle », et l'ECLN suit ;
- toutes les sources muettes : chaque partie est « indisponible », et l'analyse aboutit ;
- l'index de geo-DVF muet, sans rien en base : aucun millésime, échec dit ;
- l'ECLN vieux de 31 jours, DiDo muet : la copie est servie, avec sa date.

**Navigateur** (Chromium, 1 360 px et 375 px) :
- prix, historique, neuf, Sitadel, indices et carte (cercle, points colorés, parcelles vendues) ;
- liste filtrable et triable ; choisir une vente centre la carte ;
- passage à 1 km ;
- aucune erreur dans la console.
- Un débordement de 174 px à 375 px, dû au tableau caché du graphique, a été corrigé.

**Bugs trouvés et corrigés pendant la recette** :
- liste des ventes vide à la première ouverture : elle était lue avant le chargement de DVF ;
- graduation du haut du graphique sous la valeur maximale ;
- clonage concurrent des bases de test (échecs au hasard, antérieurs à L5).

## Écarts assumés

- **Pas de projection de prix** en L5 : elles sont reportées en L7, où elles seront des hypothèses
  du bilan (Q5).
- **Pas de rayon adaptatif** : le rayon est celui que l'utilisateur choisit (Q2).
- **Prix au m² sur les ventes simples** : les chiffres diffèrent de l'ancien écran, qui mêlait
  ventes multiples, adjudications et échanges (Q3).
- **Historique** : 5 millésimes au départ, au lieu des 10 ans de Cerema. Il s'allonge à chaque
  publication, puisque rien n'est effacé (Q1).
- **Carte de chaleur reportée** (Q10) ; **PDF reporté en L8** (D-08).
