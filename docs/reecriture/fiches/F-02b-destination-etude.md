# F-02b · Destination de l'étude : la choisir dès la création

> Lot : L2 (complément de [F-02](F-02-etude.md)) · Statut : `recettée` (13/10/2026, en local) ;
> arbitrages Q1 à Q9 rendus par le porteur du produit le 13/10/2026
> Branche : `study-destination` (partie de `master` @ `ef88ed2`)
> Ancien code : `bimtheon-studio/ardha` @ `2a7f9a0` (export de `origin/main`)

Demande du porteur du produit (13/10/2026), telle quelle : « pouvoir choisir la destination de l'étude
(logement, commercial, etc. ?) en amont ? ». Le point d'interrogation compte : ni la liste ni l'effet
ne sont arbitrés.

Sous-fiche de F-02 plutôt que nouvelle fiche : la destination est un attribut de l'étude, choisi au
moment où F-02 la fait naître (« Créer l'étude », Q1), et les numéros F-03, F-06… suivent les lots.

## Ce que voit l'utilisateur

**Dans l'ancienne application, rien.** Aucun écran ne demande la destination, ni à la création ni
après. L'étude naît d'une sélection de parcelles et d'une sauvegarde (F-02, #1), sans autre champ
(table `etudes`, `supabase/migrations/20260303093226_fd875fda-….sql:3-16` : aucune colonne de
destination ni de programme).

Seules traces :

- **Faisabilité** : un paramètre `typeProgramme`, figé à `'logement'` dans les valeurs par défaut
  (`src/pages/Faisabilite.tsx:135`), typé `string` (`src/hooks/useStudyContext.ts:71`). Aucun champ ne
  le modifie (les champs de la page couvrent la surface moyenne, les coûts, la marge, le prix :
  `Faisabilite.tsx:901` et suivantes).
- **État de l'étude** : « Programme : logement » listé dans les détails de l'étape Faisabilité
  (`src/pages/EtatEtude.tsx:216`). En pratique jamais affiché : cette page ne retrouve jamais l'étude
  enregistrée (F-02, bug B3).
- **Zonage** : les destinations CNIG autorisées, sous conditions et interdites de chaque zone, montrées
  sans lien avec un projet (`src/components/urbanisme/ZonesTab.tsx:144,167-172`).

## Comportements

Arbitrage : `D-xx` ou `F-xx Qn` quand une décision le tranche ; `Qn` renvoie aux questions de fin de fiche.

| # | Comportement | Ancien code | Arbitrage | Note |
|---|---|---|---|---|
| 1 | Aucune destination demandée ni enregistrée avec l'étude | `etudes` : `…093226_….sql:3-16` ; création : `src/hooks/useStudyContext.ts:261-342` | Q1, Q2, Q3 | la demande du porteur du produit |
| 2 | `typeProgramme: 'logement'` par défaut, jamais modifiable, jamais lu par un calcul | `Faisabilite.tsx:135` ; type `useStudyContext.ts:71` ; seule lecture `EtatEtude.tsx:216` | Q1 | 3 occurrences dans tout `src/` et `supabase/` |
| 3 | Bilan pensé pour le logement seul : nombre de logements = SDP ÷ surface moyenne (70 m²), densité en logements/ha, places de stationnement par logement | `Faisabilite.tsx:136,553-556,593-596` | reporter (L7) | |
| 4 | Lots du bilan générés en `appartement` seulement ; le type de lot connaît `bureau` et `commerce`, mais seuls Appartement et Garage s'ajoutent | `src/types/bpv1Types.ts:10` ; `Faisabilite.tsx:568-571` ; `src/components/faisabilite/LotsTable.tsx:64-67` | reporter (L7) | la destination choisie pourrait proposer les types de lots |
| 5 | Stationnement du PLU retenu seulement « par logement » (0 < n ≤ 5, sans « m² ») | `Faisabilite.tsx:85-92` | reporter (L3, L7) | règle par m² de bureau ou de commerce ignorée |
| 6 | Zonage GPU : `destoui`, `destcdt`, `destnon` décodés en listes autorisées / sous conditions / interdites, affichées par zone | `supabase/functions/urbanisme/index.ts:131,141-154` ; `src/hooks/useParcelZoning.ts:29-39` ; `ZonesTab.tsx:37,167-172` | reporter (L3, Q6) | jamais confronté à un projet |
| 7 | Nomenclature CNIG (codes 10 à 55, libellés officiels, code inconnu affiché tel quel) et ses tests | `supabase/functions/_shared/cnig-destinations.ts:19-90` ; `…/__tests__/cnig-destinations.test.ts` | porter (PLAN §5) | module pur et testé : se porte dans `src/domain` avec ses tests |
| 8 | Extraction des règles : thème « destinations » (art. R151-27 et suivants) parmi les règles complémentaires | `supabase/functions/analyze-zone-rules/index.ts:59,78,113` ; `ComplementaryRulesSection.tsx:38` | reporter (L3) | |
| 9 | DVF : filtre de carte par type de local (Appartement, Maison, Local commercial, Terrain, Dépendance), indépendant de l'étude | `src/components/foncier/DVFMapFilter.tsx:10,32` ; `src/hooks/useDVFMapData.ts:149` | garder, avec des prix (Q7, Q8) | |
| 10 | ECLN filtré sur `Appartement`, type qui n'existe pas : prix du neuf toujours nul | `Faisabilite.tsx:410-421` | déjà corrigé (F-05 Q6) | |

### Ce que fait déjà la réécriture (`master` @ `ef88ed2`)

- **Étude** : aucune destination (`src/db/schema.ts:300-330`, `src/contracts/studies.ts:32-74`).
- **Marché (L5)** : ne calcule que maison, appartement et terrain (`src/domain/dvf.ts:171-175`,
  `src/domain/market.ts:141`) et **écarte toute vente qui contient un local d'activité**
  (`src/domain/dvf.ts:216-217`, F-05 Q3). Une étude de commerce ou de bureaux verrait donc des prix
  de logement, sans le dire. L'ECLN (logements neufs) et Sitadel (logements autorisés) ne parlent
  aussi que de logement (F-05 Q6, Q7).
- **Zonage** : rien. L3 est mis de côté (PLAN, journal du 02/10/2026) ; aucune table de zones, aucun
  `destoui` en base. Une alerte « destination interdite dans la zone » suppose de charger au moins la
  couche des zones du GPU.

## Règles métier

- **Code de l'urbanisme, art. R151-27** : cinq destinations — exploitation agricole et forestière ;
  habitation ; commerce et activités de service ; équipements d'intérêt collectif et services
  publics ; autres activités des secteurs secondaire ou tertiaire.
- **Art. R151-28** et arrêté du 10 novembre 2016 modifié (en dernier lieu par l'arrêté du 22 mars
  2023, avec le décret n° 2023-195) : sous-destinations. La table de l'ancien code
  (`cnig-destinations.ts:19-57`) en compte **23** (les 20 d'origine, plus « lieux de culte » et
  « cuisine dédiée à la vente en ligne » en 2023, l'hébergement touristique scindé entre « hôtels » et
  « autres hébergements touristiques ») :

  | Destination (code) | Sous-destinations |
  |---|---|
  | Exploitation agricole et forestière (10) | exploitation agricole 11, forestière 12 |
  | Habitation (20) | logement 21, hébergement 22 |
  | Commerce et activités de service (30) | artisanat et commerce de détail 31, restauration 32, commerce de gros 33, activités de services avec accueil d'une clientèle 34, hôtels 35, autres hébergements touristiques 36, cinéma 37 |
  | Équipements d'intérêt collectif et services publics (40) | bureaux des administrations 41, locaux techniques 42, enseignement, santé, action sociale 43, salles d'art et de spectacles 44, équipements sportifs 45, autres équipements recevant du public 46, lieux de culte 47 |
  | Autres activités des secteurs secondaire ou tertiaire (50) | industrie 51, entrepôt 52, bureau 53, centre de congrès et d'exposition 54, cuisine dédiée à la vente en ligne 55 |

- **Zonage CNIG** (standard CNIG PLU, couche `ZONE_URBA`) : `DESTOUI`, `DESTCDT`, `DESTNON` listent des
  codes séparés par des tirets (« 10-22-30 »), destination ou sous-destination. Une destination
  autorisée vaut pour toutes ses sous-destinations, sauf mention contraire.
- **Règle de l'ancien code à garder** : un code inconnu s'affiche tel quel, jamais de libellé inventé
  (`cnig-destinations.ts:10-12`).

## Données

- **Sources externes** : aucune pour choisir la destination. La nomenclature est une constante du
  domaine. L'alerte de zonage (Q4) demanderait la couche `zone_urba` du GPU, que seul le worker peut
  charger (PLAN §3).
- **Lu / écrit** : ancien schéma, rien. Cible : un attribut de `studies` (forme selon Q1 et Q2), copié
  par la duplication (F-02 Q10).

## Cas limites et bugs connus

- Programme mixte (commerce en rez-de-chaussée, logements au-dessus) : le cas courant en ville, que
  ni l'ancien code ni la demande ne traitent (Q2).
- Destination autorisée « sous conditions » : la condition est dans le règlement (L3), pas dans le
  zonage ; l'alerte ne peut dire que « sous conditions, voir le règlement ».
- Terrain à cheval sur plusieurs zones (`ZonesTab.tsx:136-139`) : la destination peut être autorisée
  dans l'une et interdite dans l'autre.
- Codes de zonage inconnus, vides, ou PLU non numérisé au standard CNIG (RNU : Beaumont-Village) :
  aucune alerte possible, il faut le dire.

## Tests existants

`supabase/functions/_shared/__tests__/cnig-destinations.test.ts` (5 tests Deno : familles 10 à 50,
codes d'une zone N réelle de Créteil, ajouts de 2023, code inconnu, décodage « 10-22-30 ») : se portent
en Vitest avec le module. Rien d'autre : aucun test ne touche `typeProgramme`.

## Questions (arbitrées le 13/10/2026)

Posées avec l'interface de questions, option recommandée en premier. Le porteur du produit a suivi la
recommandation partout, a ajouté l'alerte de zonage et les prix des locaux d'activité aux effets
(Q4), puis, devant le fait nouveau mesuré pour Q6, a reporté l'alerte de zonage à L3.

| # | Question | Réponse |
|---|---|---|
| Q1 | Granularité | **liste produit adossée aux codes CNIG** : Logement (21), Résidence gérée (22), Commerce et services (31, 32, 34), Bureaux (53), Hôtellerie (35, 36), Activités et entrepôts (51, 52), Équipement (41 à 47), et « Autre » qui ouvre les 23 sous-destinations |
| Q2 | Une ou plusieurs | **plusieurs, dont une principale, sans répartition** ; la répartition en m² viendra avec la faisabilité (L7) |
| Q3 | Création, défaut, modification | **choisie au bouton « Créer l'étude », Logement par défaut, modifiable sur la page de l'étude** |
| Q4 | Effets dès maintenant | **affichage**, **avertissement sur la page Foncier et marché**, alerte de zonage (puis reportée, Q6), **prix des locaux d'activité** (Q7, Q8) ; le bilan en L7 |
| Q5 | CLI | voir Q9 |
| Q6 | Alerte de zonage | **reportée à L3** : le GPU ne renseigne les destinations que dans une minorité de documents (mesure ci-dessous) ; L3 lira le thème « destinations » du règlement |
| Q7 | Ventes des locaux d'activité | **une vente d'un seul local d'activité, sans logement** (dépendances admises), en €/m² de surface bâtie, bornes 200 à 15 000 €/m² (ancien `_shared/dvf.ts:119-125`), ancien et VEFA séparés, même rayon et mêmes 12 mois que le logement |
| Q8 | Affichage de ces prix | **toujours**, la destination principale décidant de l'ordre des catégories ; avertissement si elle n'a pas de prix DVF (hôtellerie, résidence gérée, équipement…) |
| Q9 | CLI | **comme proposé** : `destination:list`, `study:create --destination`, `study:destination`, destination dans `study:show` et `study:list`, tout en `--json` (sans `zoning:show`, Q6) |

**Mesure du 13/10/2026 (Q6)** : zones de l'API Carto GPU (`/api/gpu/zone-urba`) dans un carré
d'environ 2 km de côté autour de neuf centres-villes ; zones dont `destoui` est rempli.

| Lieu | Document(s) | Zones | Avec destinations |
|---|---|---|---|
| Maisons-Alfort | PLUi Paris Est Marne & Bois (`200057941`) ; PLUi Grand Paris Sud Est Avenir (`200058006`) en bordure | 78 ; 9 | 0 ; 9 |
| Créteil | PLUi Grand Paris Sud Est Avenir (`200058006`) et PLUi voisin (`200058014`) | 27 | 26 |
| Annecy | PLUi (`200066793`) | 60 | 0 |
| Tours | PLU (`37261`) | 15 | 0 |
| Paris 15ᵉ | PLU (`75056`) et PLUi voisin (`200057974`) | 36 | 1 |
| Lyon 3ᵉ, Bordeaux, Nantes, Rennes | PLUi (et PSMV à Nantes, Rennes) | 41, 19, 18, 127 | 0 |

Beaumont-Village (RNU) n'a pas de zonage. Seul le PLUi de Grand Paris Sud Est Avenir renseigne
les destinations de ses zones : une alerte fondée sur le GPU se tairait sur les quatre communes de
référence.

## Conception cible

### Domaine (`src/domain`)

- **`cnig.ts`** : nomenclature CNIG portée de l'ancien code avec ses tests (codes 10 à 55, libellés
  officiels, code inconnu jamais deviné, décodage « 10-22-30 ») ; servira à L3.
- **`destinations.ts`** :
  - `STUDY_DESTINATIONS` : les sept destinations produit, clé anglaise (`housing`,
    `managed-residence`, `retail`, `office`, `hotel`, `industrial`, `public-facility`), libellé,
    codes CNIG ;
  - une destination d'étude est une de ces clés, ou une sous-destination CNIG qu'aucune ne couvre
    (11, 12, 33, 37, 54, 55) : `normalizeDestinations` ramène un code couvert à sa clé (« 31 » →
    `retail`), retire les doublons, garde l'ordre, refuse l'inconnu et la liste vide ;
  - `marketFocus(destinations)` : ordre des catégories de prix et avertissement, selon la
    destination principale (logement : appartements, maisons, locaux, terrains ; activité — commerce,
    bureaux, activités, 33, 54, 55 — : locaux d'abord, avec « DVF ne distingue pas commerces, bureaux
    et locaux d'activité » ; sans prix DVF : « DVF n'a pas de prix pour l'hôtellerie… »).
- **`dvf.ts`** : catégorie de vente `commercial` (Q7) ; `DVF_RULES_VERSION` (2), version des règles
  de classement.

### Données

- `studies.destinations text[] NOT NULL DEFAULT '{housing}'` (migration `0010`), dans l'ordre, la
  principale en tête. Une étude existante prend Logement ; la duplication copie la destination.
- `dvf_mutations.category` peut valoir `commercial`. Les ventes déjà en base se **reclassent sans
  réseau** depuis les locaux enregistrés : le worker le fait de lui-même, une fois par département,
  quand la version des règles (`source_states`, source `dvf-rules`) n'est pas la bonne ;
  `dvf:reclassify` le fait à la demande.
- Analyse `market` : version du résultat 2 (catégorie `commercial`) ; une analyse en version 1 se
  montre « à refaire ».

### API

| Route | Changement |
|---|---|
| `POST /api/studies` | `destinations` facultatif (défaut `["housing"]`) |
| `PATCH /api/studies/:id` | `destinations` (liste complète, la principale en tête) |
| `GET /api/studies`, `GET /api/studies/:id` | `destinations` dans le résumé et le détail |
| `GET /api/studies/:id/market` | indicateurs et historique de la catégorie `commercial` |

Erreurs : « Destination inconnue », « Choisissez au moins une destination » (400).

### CLI

`destination:list`, `study:create --destination housing,retail`, `study:destination <id> <clé…>`
(la première est la principale), destination dans `study:show` et `study:list`, `dvf:reclassify
<département>` ; tout en `--json`.

### Écrans

- **Carte `/map`** : au-dessus de « Créer l'étude », le choix de la destination : les sept
  destinations en boutons à bascule (Logement coché), « Autre… » (les 23 sous-destinations, par
  destination), et le choix de la principale dès que deux sont cochées.
- **Étude `/studies/:id`** : ligne « Destination » (la principale, puis les autres), « Modifier »
  ouvre le même choix.
- **Accueil** : destination principale sur la carte de l'étude.
- **Foncier et marché** : carte « Locaux d'activité » (ancien, neuf) ; ordre des cartes selon la
  destination ; avertissement ; courbe des locaux anciens dans l'historique.

## Recette

Le 13/10/2026, en local, sources enregistrées (`ARDHA_SOURCES=recorded`, DVF du Val-de-Marne 2024
et 2025) :

| Cas | Résultat |
|---|---|
| `destination:list` | 7 destinations avec leurs codes CNIG ; « Autre » : 11, 12, 33, 37, 54, 55 |
| Maisons-Alfort AY96 + AY97, `study:create --destination retail,housing` | « destination : Commerce et services (principale), Logement » |
| Même étude, marché à 500 m | 287 ventes comparables sur 331 (276 avant : 11 ventes de locaux en plus) ; locaux d'activité anciens **3 656 €/m²** (P25 3 109, P75 4 206), 6 ventes, −9,5 % sur un an, « peu de ventes » ; appartements (5 465 €/m²) et maisons (6 056 €/m²) inchangés |
| Même étude, marché à 1 km | 811 ventes comparables sur 1 010 (783 avant) ; locaux anciens 2 941 €/m², 15 ventes |
| Ventes reclassées après coup (catégorie effacée, version des règles remise à 1) | reclassées par le worker à l'analyse suivante, sans recharger les fichiers ; mêmes prix |
| Écran, dans Chromium (Playwright), 1440 px et 375 px | carte : choix sous la sélection, Logement coché, « Autre » et « Principale » ; page de l'étude : ligne Destination, « Modifier la destination » ; marché : locaux en tête et avertissement pour une étude de commerce ; aucun défilement horizontal |

Écarts constatés : aucun bloquant. Les locaux d'activité ont presque toujours peu de ventes dans
un rayon de 500 m (6 à Maisons-Alfort) : l'écran le dit et propose d'élargir.

## Effets en aval

Ce que la destination change, aujourd'hui et dans les lots suivants. Chaque lot reprend sa ligne
au moment de sa fiche ; rien de ce qui est reporté n'est arbitré.

### En place (cette fiche)

| Où | Effet |
|---|---|
| Création de l'étude | Logement coché par défaut ; plusieurs possibles, la première est la principale |
| Page de l'étude | Ligne « Destination », modifiable (pas dans la corbeille) |
| Accueil, corbeille | Destination principale sur la carte : « Commerce et services (+1) » |
| Duplication | La copie garde les destinations |
| Foncier et marché : ordre des prix | Logement : appartements, maisons, locaux d'activité, terrains. Commerce, bureaux, activités, CNIG 33, 54 et 55 : les locaux d'activité en tête |
| Foncier et marché : avertissements | Activité : « DVF ne distingue pas commerces, bureaux et locaux d'activité ». Hôtellerie, résidence gérée, équipement, agricole, cinéma : « DVF n'a pas de prix pour… » |
| Foncier et marché : « peu de ventes » | Le seuil de 20 ventes porte sur les locaux pour une activité, sur les logements sinon |
| CLI | `study:show`, `study:list` ; `study:destination` la modifie, `destination:list` liste les choix |

Les prix des locaux d'activité sont calculés pour toutes les études : seuls leur ordre et
l'avertissement dépendent de la destination.

### Reportés

- **L3 · Urbanisme**
  - Confronter la destination au zonage (autorisée, sous conditions, interdite), en s'appuyant sur
    le règlement extrait : le GPU ne renseigne presque jamais `destoui` (Q6, mesure ci-dessus).
  - Terrain à cheval sur plusieurs zones : signaler une destination autorisée dans l'une et
    interdite dans l'autre.
  - Stationnement : lire la règle de la bonne destination (par logement, par m² de bureau ou de
    commerce). L'ancien code ne retenait que la règle « par logement » (`Faisabilite.tsx:85-92`
    @ `2a7f9a0`).
  - Hauteur, recul : certains PLU les font varier selon la destination.
- **L5 · Marché** (compléments possibles, non arbitrés)
  - L'ECLN (prix du neuf) et Sitadel (logements autorisés) ne parlent que du logement : les
    masquer ou les relativiser pour une étude d'activité.
  - Sitadel : les locaux autorisés, pour une étude d'activité, ne sont pas branchés.
- **L7 · Faisabilité et bilan**
  - Répartition des surfaces entre destinations, hypothèse de chaque variante (Q2).
  - Paramètres propres à chaque destination : surface moyenne et nombre de logements, densité
    (logement seulement) ; types de lots du bilan (appartement, commerce, bureau…) ; prix de
    sortie (VEFA ou ancien pour le logement, prix des locaux pour l'activité).
  - Stationnement requis, calculé par destination.
  - TVA et certains coûts de construction, qui varient selon la destination.
- **L8 · Exports** : la destination dans le rapport PDF et sur sa page de garde.
- **L6 · Estimation** : aucun effet, l'estimation porte sur un bien existant (maison ou
  appartement), pas sur un programme.

## Écarts assumés

- Nouveau : l'ancienne application ne demandait aucune destination ; `typeProgramme` (figé à
  « logement ») n'est pas repris tel quel, la destination de l'étude le remplace.
- Pas d'alerte de zonage avant L3 (Q6) : le GPU ne renseigne les destinations que pour une minorité
  de documents (mesure ci-dessus).
- Un seul prix pour commerces, bureaux et entrepôts : DVF ne les distingue pas (« Local industriel,
  commercial ou assimilé »).
- Pas de répartition des surfaces entre destinations avant L7 (Q2).
- Les études déjà créées prennent Logement (aucune donnée de production, D-03).
