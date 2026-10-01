# F-04 · Risques : analyse des risques d'une étude

> Lot : L4 · Statut : `conçue` (nuit du 01/10/2026) ; **arbitrages provisoires** Q1 à Q14, pris par
> l'agent sur l'option recommandée en l'absence du porteur du produit (même règle que la nuit de L1),
> à confirmer au réveil · Branche : `l4-risks` (partie de `l2-study`, L4 dépend de L2)
> Ancien code : `bimtheon-studio/ardha` @ `2a7f9a0` · Audit de l'ancienne équipe :
> `docs/risques-pipeline-audit.md` (juin 2026, endpoints vérifiés en ligne)

## Ce que voit l'utilisateur

- **`/risques`**, étape 2 de l'étude (`src/pages/Risques.tsx`, 467 l.) : tiroir à gauche (sélection en
  lecture, « Risques & Réglementation », « Altimétrie & Inondation », « Couches cartographiques »,
  `src/components/StudyDrawer.tsx:110-285`), carte à droite avec les couches WMS, les points d'altitude
  et les bornes incendie (`src/components/CadastreMap.tsx:866-1124`).
- **Bandeau « Risques communaux à vérifier »** : inondation, argiles, radon, sismicité, triés par
  sévérité (`src/components/risques/CommunalRisksBanner.tsx:88-185`).
- Listes : PPR, cavités, ICPE, sites et sols pollués (SIS, CASIAS), arrêtés CatNat
  (`src/components/risques/RisquesTab.tsx:101-288`).
- **Altimétrie** : min / moyenne / max, dénivelé, tableau des points ; **analyse TRI** : scénarios et
  hauteurs d'eau par parcelle, « surélévation » (`src/components/risques/ElevationFloodPanel.tsx`).
- Altimétrie aussi sur `/cadastre` (`src/pages/Cadastre.tsx:339-354`), mode démo Île Saint-Louis
  (`Risques.tsx:63,167-215`), PDF « Aperçu rapport Risques » (`src/utils/pdfReports/risquesReport.ts`).

## Comportements

Arbitrage : `D-xx` / `PLAN §n` quand une décision le tranche ; `Qn` renvoie aux questions de fin de
fiche (provisoires cette nuit).

| # | Comportement | Ancien code | Arbitrage | Note |
|---|---|---|---|---|
| 1 | Tout part du navigateur, sans clé : Géorisques v1, WMS BRGM, IGN Altimétrie, Overpass | `src/hooks/useGeorisquesAPI.ts:10`, `usePPRIFloodZone.ts:16`, `useElevationAPI.ts:5`, `useFireHydrants.ts:17-22` | remplacer : **le worker** interroge (PLAN §3) | aucune edge function, aucun cache en base |
| 2 | Analyse relancée à chaque visite de `/risques`, rien en base hors `donnees_risques` partiel | `Risques.tsx:265-303`, `Faisabilite.tsx:440-447` | remplacer : **une analyse en base par étude**, pour une empreinte de parcelles, avec ses sources et dates (PLAN §4, Q1) | |
| 3 | Radon, sismicité : par commune, pire classe des communes | `useGeorisquesAPI.ts:263-276` | garder (Q2) | |
| 4 | GASPAR risques, PPRN/PPRT (un appel par commune, `codeInsee`), CatNat, ICPE, SIS, CASIAS par commune | `useGeorisquesAPI.ts:203-301` | garder (Q2) ; ICPE, SIS, CASIAS **classés par distance à l'emprise** (Q10) | `code_insee` ignoré par `pprn` (audit l.29-30) |
| 5 | États et dates d'approbation des PPR jamais renseignés (v1) ; contraintes PPRI d'Urbanisme mortes | `useGeorisquesAPI.ts:160-169`, `UrbanismeSummary.tsx:119-122` | simplifier : ce que donne v1 (modèle, date de modification, **zones réglementaires**) ; v2 reportée (Q12) | v1 renvoie `zonageReglementaire.listTypeReg` |
| 6 | Argiles (RGA) au centroïde de chaque parcelle ; échec = « hors zone » | `useArgilesHazard.ts:9-49` | corriger : point **intérieur** à la parcelle ; échec = « indisponible » (Q3, Q4) | |
| 7 | TRI : GetFeatureInfo multi-couches au centroïde, GML, échec = « hors zone » | `usePPRIFloodZone.ts:73-142` | garder par le worker, point intérieur ; échec = « indisponible » (Q3, Q4) | le WFS du BRGM n'expose pas les hauteurs d'eau (vérifié le 01/10/2026) |
| 8 | Aléa TRI : fréquent → fort, moyen/MCC → moyen, extrême seul → faible ; pire des parcelles | `usePPRIFloodZone.ts:120-126,192-203` | garder (domaine) | test réel porté |
| 9 | « Surélévation » = borne haute de la classe de hauteur d'eau, max de tous les scénarios ; cote = moyenne globale + hauteur | `usePPRIFloodZone.ts:159-162`, `Risques.tsx:294-300` | simplifier : hauteurs d'eau **par scénario et par parcelle** affichées telles quelles ; cote indicative = altitude de la parcelle + hauteur du scénario moyen (Q5) | |
| 10 | Panneau TRI masqué si GASPAR ne dit pas « inondation » | `ElevationFloodPanel.tsx:132` | corriger : toujours affiché | |
| 11 | Libellés trompeurs (« PPRI » pour un résultat TRI, « TRI 2020 ») | `CommunalRisksBanner.tsx:103-106`, `ElevationFloodPanel.tsx:152-163` | corriger | |
| 12 | Bandeau : 4 axes, sévérités, ELAN (G1/G2) si argile moyen/fort, radon ≥ 3, EC8 si zone ≥ 3 | `CommunalRisksBanner.tsx:88-185` | garder (domaine, tests portés) | |
| 13 | Altimétrie : centroïde + périmètre tous les ~15 m (≤ 160), grille ±500 m au pas de 75 m, isolignes à 1 m | `useElevationAPI.ts:68-173`, `utils/contourUtils.ts` | simplifier : points de la parcelle par le worker, stats par parcelle et globales ; grille et isolignes reportées (Q6) | `mean ||` à 0 m (B), grille décimée irrégulière |
| 14 | Cavités : 1 km autour du centroïde de la 1ʳᵉ parcelle | `useGeorisquesAPI.ts:312-314` | corriger : autour du centre de l'emprise de toutes les parcelles (Q10) | |
| 15 | Bornes incendie : OSM Overpass, 4 miroirs, rayons 400 m (carte) et « conforme ≤ 200 m » (PDF) | `useFireHydrants.ts`, `mapConfig.ts:69-84`, `risquesReport.ts:116` | simplifier : OSM par le worker, **indicatif** : bornes à moins de 400 m et distance de la plus proche ; pas de « conformité » (Q7) | |
| 16 | Couches WMS d'affichage (zonage PPR inondation, argiles, cavités, SIS), `maxNativeZoom` 13 | `GeorisquesLayerControl.tsx:26-72`, `CadastreMap.tsx:877-904` | garder en tuiles dans le navigateur, comme les fonds (Q8) ; zoom natif non bridé | |
| 17 | Clic sur la carte : HTML tiers de GetFeatureInfo injecté dans le popup | `CadastreMap.tsx:907-969` | abandonner (XSS) | |
| 18 | Préférences de couches recopiées dans `donnees_risques.layerPreferences`, jamais relues | `Risques.tsx:138-158` | simplifier : préférence locale (`localStorage`) (Q13) | |
| 19 | `georisquesContext` en `localStorage`, pont vers Faisabilité, Enveloppe, Urbanisme ; jamais purgé à bon escient | `Risques.tsx:279-303` | remplacer : l'analyse en base (Q1) | |
| 20 | Surcoûts Faisabilité (inondation 150 €/m² sur l'indicateur communal, radon 15 €/m², sismique 1,5/3 %) | `Faisabilite.tsx:431-484` | reporter en L7 (Q9) ; l'analyse fournit les entrées | |
| 21 | PDF Risques (capture `html2canvas`, « Donnée non disponible » partout) | `risquesReport.ts`, `Risques.tsx:341-342` | reporter en L8 (D-08 : cartes composées par le worker) | |
| 22 | Mode démo (Île Saint-Louis, `?demo=1`) | `Risques.tsx:63,167-215` | abandonner (Q11) | |
| 23 | Référentiel géodésique (badge EPSG, NGF-IGN69 / IGN78 Corse) | `utils/geodeticReference.ts` | simplifier : mention « altitudes NGF-IGN69 (IGN78 en Corse) » ; DOM ajoutés | |
| 24 | Échecs partiels avalés (`console.warn`) ; échec total masque argiles et TRI | `useGeorisquesAPI.ts:229-233,327-329`, `RisquesTab.tsx:61-68` | corriger : état par source, l'indisponibilité est dite (Q4) | |
| 25 | Export : rappels directs, mapping cassé | `useEnrichedExport.ts:399-600` | reporter en L8 : l'export lira l'analyse | |

## Règles métier

- **Aléa TRI** (`usePPRIFloodZone.ts:120-126`) : inondé au scénario fréquent (`01FOR`) → **fort** ;
  au moyen (`02MOY`) ou moyen + changement climatique (`03MCC`) → **moyen** ; à l'extrême seul
  (`04FAI`) → **faible**. Types : 01 débordement de cours d'eau, 02 cours d'eau endigué, 03 submersion
  marine.
- **Argiles** (RGA) : `codeExposition` 1/2/3 → faible/moyen/fort ; étude géotechnique G1/G2
  obligatoire en aléa moyen ou fort (loi n° 2018-1021 du 23 novembre 2018, dite ELAN, art. 68 ; code
  de la construction et de l'habitation, art. L. 132-4 et suivants).
- **Radon** : classes 1, 2, 3 (arrêté du 27 juin 2018 portant délimitation des zones à potentiel
  radon) ; mesures au rez-de-chaussée en classe 3.
- **Sismicité** : zones 1 à 5 (code de l'environnement, art. R. 563-4, décret n° 2010-1255) ; règles
  parasismiques (Eurocode 8) à partir de la zone 2 pour certains bâtiments, de la zone 3 pour le
  logement courant (arrêté du 22 octobre 2010) — l'ancien code disait « zone ≥ 3 », gardé.
- **Altitudes** : RGE ALTI (IGN), ressource `ign_rge_alti_wld`, m NGF-IGN69 (IGN78 en Corse), 0,01 m ;
  `z ≤ -99` = pas de donnée.

## Données

- **Sources externes** (sans clé) : Géorisques API v1 (`https://www.georisques.gouv.fr/api/v1` :
  `radon`, `zonage_sismique`, `gaspar/risques`, `gaspar/pprn`, `gaspar/pprt`, `gaspar/catnat`,
  `installations_classees`, `ssp/conclusions_sis`, `ssp/casias`, `cavites`, `rga`) ; WMS BRGM
  `https://mapsref.brgm.fr/wxs/georisques/risques` (hauteurs d'eau TRI `ISO_HT_*`, GetFeatureInfo en
  GML) ; IGN Altimétrie (`data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json`, GET) ;
  OpenStreetMap Overpass (`overpass-api.de`, GET).
- **Lu / écrit** : `etudes.donnees_risques` (jsonb, partiel), `localStorage` (`georisquesContext`,
  `risquesLayerPrefs`). Cible : `study_analyses` (PLAN §4 : type, entrées = versions des sources,
  résultat, date du calcul).

## Cas limites et bugs connus

Erreurs avalées qui rassurent (PPR, TRI, argiles, bornes : « rien » au lieu de « indisponible ») ;
libellés « PPRI » pour du TRI ; panneau TRI masqué ; surélévation sur le scénario extrême ; cote sur
la moyenne globale ; `mean ||` à 0 m ; cavités sur la 1ʳᵉ parcelle ; XSS GetFeatureInfo ; WMS flous
au-delà du zoom 13 ; `georisquesContext` d'une autre sélection ; `layerPreferences` jamais relu ;
contraintes PPRI mortes ; PDF toujours « non disponible » ; export qui lit mal les champs.

## Tests existants

`src/hooks/__tests__/usePPRIFloodZone.test.ts` (GML réel, aléa) : **porté** (parseur du worker,
domaine). `CommunalRisksBanner.test.tsx` (sévérités) : règles portées dans le domaine.
`estimationDiagnostics.test.ts` : L6. `buildEnvelope.test.ts` : L7.

## Questions (arbitrages provisoires, nuit du 01/10/2026)

| # | Question | Arbitrage provisoire (option recommandée) | Autres options |
|---|---|---|---|
| Q1 | Quand l'analyse se fait-elle ? | **à la demande** (ouverture de la page Risques ou « Recalculer »), par le worker, enregistrée pour l'empreinte des parcelles ; **périmée** quand les parcelles changent | automatique à chaque modification de parcelles |
| Q2 | Données communales (radon, sismicité, GASPAR, PPR, CatNat, ICPE, SIS, CASIAS) | **appel à la demande** par le worker, copié dans l'analyse avec la date (PLAN §4 : « caches à la demande ») | import en masse dans des tables de référence |
| Q3 | Argiles et TRI | **par parcelle, en un point intérieur** (pas au centroïde), pire classe | intersection surfacique (pas de WFS pour le TRI) |
| Q4 | Une source qui échoue | **« indisponible », dit à l'écran**, jamais « hors zone » ; l'analyse est enregistrée avec ses trous | refuser l'analyse entière |
| Q5 | Cote d'inondation | **hauteurs d'eau par scénario et par parcelle**, telles quelles ; cote indicative = altitude de la parcelle + hauteur max du **scénario moyen** | max de tous les scénarios (ancien) |
| Q6 | Altimétrie | **points de la parcelle** (intérieur + périmètre ~15 m), stats par parcelle et globales ; grille et isolignes **reportées** | grille ±500 m et isolignes dès L4 |
| Q7 | Bornes incendie | **OSM, indicatif** : bornes à moins de 400 m de l'emprise, distance de la plus proche, sans « conformité » | règle RDDECI par département ; PEI officiels |
| Q8 | Couches de risques sur la carte | **tuiles WMS dans le navigateur**, comme les fonds (D-08), sans clic d'information | servies par le worker (proxy) ; pas de couche |
| Q9 | Surcoûts de faisabilité | **reportés en L7** | dès L4 |
| Q10 | Cavités, ICPE, SIS, CASIAS | **classés par distance à l'emprise**, cavités à 1 km du centre de l'emprise | par commune seulement (ancien) |
| Q11 | Mode démo | **abandonné** | garder |
| Q12 | Géorisques v2 (états et dates des PPR) | **reporté** (jeton à demander) ; v1 donne les zones réglementaires | dès L4 |
| Q13 | Préférences de couches | **locales au navigateur** | dans l'étude |
| Q14 | Altimétrie sur la carte de sélection (`/map`) | **reportée** : elle est dans la page Risques de l'étude | dès L4 |

## Conception cible

- **Table** `study_analyses` : étude, type (`risks`), empreinte des parcelles calculée, état
  (`queued`, `running`, `ready`, `failed`), résultat (jsonb validé par un schéma zod versionné),
  sources (source, date d'interrogation, état), erreur, dates ; une ligne par étude et par type.
- **Domaine** : point intérieur, points du périmètre, aléa TRI, synthèse des 4 axes (sévérité,
  libellé, détail), cote indicative, distances.
- **Worker** : job `study:analyze-risks` (file `studies`), sources interrogées par commune et par
  parcelle, état par source.
- **API** : `GET /api/studies/:id/risks` (analyse, périmée ou non), `POST /api/studies/:id/risks`
  (demande) ; couches de risques dans `/api/map/layers`.
- **CLI** : `risk:analyze <étude> [--inline]`, `risk:show <étude>`, `risk:commune <code>`,
  `risk:point <lon> <lat>`.
- **Écran** : `/studies/:id/risks` : synthèse des 4 axes, par parcelle (argiles, inondation, altitudes),
  commune (PPR et zones, CatNat), alentours (cavités, ICPE, SIS, CASIAS, bornes), carte avec couches,
  sources et dates ; étape « Risques » de l'étude reliée.

## Recette

À faire : Maisons-Alfort (AY96 + AY97 : PPRI Marne et Seine, TRI, argiles moyen), Annecy (AS71),
Beaumont-Village (ZA1, rural).

## Écarts assumés

À écrire en fin de lot.
