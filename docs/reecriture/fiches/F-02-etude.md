# F-02 · Étude : enregistrer, rouvrir, consulter sur mobile

> Lot : L2 · Statut : `conçue` (01/10/2026) ; arbitrages Q1 à Q12 rendus par le porteur du produit le 01/10/2026
> Branche : `l2-study`
> Ancien code : `bimtheon-studio/ardha` @ `2a7f9a0` (export de `origin/main`)

## Ce que voit l'utilisateur

- **Accueil `/`** (`src/pages/Home.tsx`, 336 l.) : salutation selon l'heure, bouton « Nouvelle étude »
  vers `/cadastre` (`src/components/dashboard/DashboardHero.tsx:10-32`), quatre compteurs (études, en
  cours, surface cumulée, communes : `Home.tsx:237-254`), grille « Mes études (n) » triée par date de
  modification (`src/hooks/useStudyContext.ts:196`). Chaque carte : nom, « commune · n parc. · surface
  m² », badge Complète/Brouillon, date relative, vignette (couverture, sinon tuile IGN, sinon OSM), menu
  Ouvrir / Changer l'image / Supprimer (`src/components/dashboard/SavedItemCard.tsx:38-220`).
- **Menu Fichier** de l'en-tête (`src/components/FileMenu.tsx`, 343 l.) : Nouvelle étude (avec « Sauvegarder
  puis continuer / Continuer sans sauvegarder », `:159-161,310-338`), Charger une étude… (recherche par nom,
  `:133-137,243-292`), Sauvegarder, Exporter, Toutes mes études.
- **En-tête** : bouton « Sauvegarder l'étude », masqué sans parcelle (`src/components/HeaderSaveStudyButton.tsx:55-79`),
  pastille d'état de la sauvegarde automatique (`:88-118`), badge « étude courante » `nom · commune ·
  surface` (`src/components/AppHeader.tsx:182-199`).
- **État de l'étude `/etat`** (`src/pages/EtatEtude.tsx`, 429 l.) : avancement en pourcentage et statut
  de chacune des 7 étapes (complète, partielle, manquante), avec Revoir / Compléter / Démarrer.
- **Mobile `/m`, `/m/etude/:id`, `/m/etude/:id/carte`** (`src/App.tsx:115-150`), atteint seulement par
  l'URL : liste des 100 dernières études (`src/pages/mobile/MobileStudyList.tsx:33-37`), fiche en lecture
  avec KPI et onglets Urba / Risques / Foncier / Bilan (`src/pages/mobile/MobileStudyView.tsx:94-165`),
  carte OSM des parcelles (`src/components/mobile/MobileMapLeaflet.tsx`).

Pas de capture : écrans décrits depuis le code.

## Comportements

Arbitrage : `D-xx` ou `PLAN §n` quand une décision le tranche ; `Qn` renvoie aux questions de fin de fiche.

| # | Comportement | Ancien code | Arbitrage | Note |
|---|---|---|---|---|
| 1 | Une étude n'existe qu'après une sauvegarde explicite ; la sélection de parcelles ne crée rien | `src/hooks/useStudyContext.ts:296-309` | Q1 | |
| 2 | Sauvegarde manuelle depuis l'en-tête ou le menu Fichier ; automatique seulement sur Faisabilité (1,8 s) | `HeaderSaveStudyButton.tsx:55-77`, `FileMenu.tsx:74-101`, `src/hooks/useStudyAutosave.ts` | Q1 | |
| 3 | « Sauvegarde rapide » : remet à zéro urbanisme, risques, foncier, faisabilité, résultats et statut | `useStudyContext.ts:272-290,327-341` | corriger | bug B1 : un clic efface le bilan |
| 4 | « Étude active » globale en `localStorage` (`activeStudyId`, `activeStudyMeta`) ; la sauvegarde suivante écrase cette étude | `src/lib/studySession.ts:157-183`, `useStudyContext.ts:284` | Q8 | |
| 5 | « Nouvelle étude » de l'accueil ne vide pas l'étude active : la sauvegarde suivante écrase l'étude précédente | `DashboardHero.tsx:65`, `Home.tsx:107`, `src/pages/Cadastre.tsx:305-315` | corriger | bug B2 |
| 6 | Nom recalculé à chaque sauvegarde : « N° voie, ville » > « Lieu-dit X, ville » > « Commune — SECTION NUM » > « Étude du JJ/MM/AAAA », suffixe « (+N parcelles) » | `src/utils/studyNaming.ts:63-100`, `useStudyContext.ts:325` | Q2 | instable (B15), faux « Lieu-dit Rue X » (B14) |
| 7 | Noms hérités renommés silencieusement en base à chaque lecture de la liste | `useStudyContext.ts:147-174` | abandonner (D-03) | aucune donnée ne migre |
| 8 | Adresse principale : géocodage inverse BAN de 12 points (centroïde + milieux des bords), filtre, tri par hiérarchie de voie (bd 6 > av 5 > route 4 > rue 3 > chemin 2 > autres 1) | `src/hooks/useParcelAddresses.ts:33-236` | Q3 | filtre réduit à une boîte (B13) ; jamais enregistrée dans l'étude |
| 9 | Panneau des adresses : principale (badge « Lieu-dit »), « N autres adresses » repliables | `src/components/StudyAddressesPanel.tsx` | Q3 | |
| 10 | Statut `brouillon` / `complète` en texte libre, posé à « complète » dès qu'un `margeBrute` existe | `useStudyContext.ts:271-275` | Q4 | faux dès la 1ʳᵉ sauvegarde automatique (B7) |
| 11 | Compteurs de l'accueil : surface et communes toujours à 0 sur le format courant | `Home.tsx:237-247` | Q5 | bug B4 |
| 12 | Grille sans recherche ni tri ; une erreur de chargement affiche « Aucune étude » | `SavedItemsGrid.tsx:38-65`, `useStudyContext.ts:201-207` | Q5 ; erreur affichée | |
| 13 | Recherche par nom dans « Charger une étude… » | `FileMenu.tsx:133-137` | Q5 | |
| 14 | Vignette : tuile z17 contenant le centroïde du 1ᵉʳ polygone (IGN, sinon OSM), calculée dans le navigateur | `src/lib/thumbnails.ts:18-91` | Q6 | D-08 : vignettes composées par le worker |
| 15 | Image de couverture envoyée par l'utilisateur, URL signée d'un an enregistrée | `SavedItemCard.tsx:76-96`, `src/lib/storage-signee.ts:9-63` | Q6 | bucket incohérent, pas de limite de taille (B12) |
| 16 | Rouvrir : recopie les parcelles en `localStorage`, recentre la carte, purge le contexte risques/urbanisme et l'adresse | `studySession.ts:9-19,157-183` | Q8 | les étapes étaient à rejouer |
| 17 | Rouvrir une étude sans parcelle : « Cette étude ne contient aucune parcelle exploitable. » | `studySession.ts:161-169` | garder : une étude a toujours au moins une parcelle | |
| 18 | Supprimer : `confirm()` natif ; toast de succès même en cas d'échec | `Home.tsx:82-86`, `useStudyContext.ts:350-357` | Q9 ; erreur affichée | |
| 19 | Pas de renommage, de duplication ni d'archivage | — | Q10 | |
| 20 | Dernier écrit gagne, entre onglets comme entre composants ; aucune version | `useStudyContext.ts:261-342` | corriger : version de l'étude, conflit signalé | |
| 21 | Toute sauvegarde relit toutes les études avec leurs géométries (`select('*')`), 4 fois par page | `useStudyContext.ts:294,307` ; B6 | corriger | liste légère, détail à la demande |
| 22 | État de l'étude : 7 étapes, avancement `(complètes + ½ partielles) / total` ; ne retrouve jamais l'étude enregistrée | `src/pages/EtatEtude.tsx:90-273` | Q7 | bug B3 ; les étapes 2 à 7 arrivent avec L3 à L8 |
| 23 | Mobile : routes `/m` séparées, lecture seule, accessibles par l'URL seulement | `src/App.tsx:115-150`, `src/components/mobile/MobileShell.tsx:56` | Q7 | |
| 24 | Carte mobile : centre = moyenne des centroïdes, zoom 17, pas de cadrage sur l'emprise | `MobileMapLeaflet.tsx:70-79` | corriger : cadrage sur l'emprise | |
| 25 | Tendance du foncier ×100 sur mobile (3,2 % → 320 %) | `MobileStudyView.tsx:144` | sans objet en L2 | bug B10, à éviter en L5 |
| 26 | Données d'étape en blocs JSON `any` (`donnees_risques`, `donnees_urbanisme`, `donnees_foncier`, `parametres_faisabilite`, `resultats`) | `supabase/migrations/20260303093226_…sql:3-16` | remplacer (PLAN §4) : `study_analyses` et `study_variants` aux lots L3 à L7 | |
| 27 | Accueil selon le profil (foncier, immobilier, admin), modules filtrés par abonnement | `Home.tsx:225-327`, `src/hooks/useSubscription.ts` | abandonner (D-02, D-12) ; onglet Estimations en L6 | |

## Règles métier

- **Nommage** (`studyNaming.ts:63-100`) : adresse avec numéro et voie → « 2 rue Étienne Dolet,
  Maisons-Alfort » ; voie sans numéro ou toponyme → « Lieu-dit X, ville » ; sinon « Commune — AY 96 » sur
  la 1ʳᵉ parcelle ; repli « Étude du 01/10/2026 ». Suffixe « (+2 parcelles) » au-delà d'une parcelle.
- **Adresse principale** (`useParcelAddresses.ts`) : 12 points sondés au plus, BAN `reverse`
  `limit=15`, dédoublonnage par identifiant BAN ; tri par hiérarchie de voie décroissante, puis numéro
  croissant, puis score BAN ; 1ʳᵉ adresse avec voie, sinon la 1ʳᵉ.
- **Surface de l'étude** : somme des contenances (`useStudyContext.ts:124-143`) ; en L1 on affiche
  contenance et surface calculée (F-01, #15).
- **Statut** : `complète` si `resultats.margeBrute` existe, sinon `brouillon`.

## Données

- **Sources externes** : géocodage inverse Géoplateforme (déjà branché en L1, file `lookups`), tuiles
  OSM ou IGN pour la vignette.
- **Lu / écrit** : table `etudes` (12 colonnes, dont 6 blocs JSON, `cover_image_url`), 4 policies RLS
  (UPDATE sans `WITH CHECK` : le propriétaire peut être réaffecté), trigger `updated_at`, aucun index
  sur `user_id`. Neuf clés `localStorage` pour l'état de travail (`selectedParcelles`, `activeStudyId`,
  `studyPrincipalAddress`, `georisquesContext`, `urbanismeContext`…). Cible : `studies`,
  `study_parcels` (PLAN §4), plus tard `study_analyses` et `study_variants`.
- Chaque parcelle était recopiée en entier dans l'étude (géométrie GeoJSON comprise) : PLAN §4 garde
  cette copie (`etude_parcelle` : IDU, géométrie, surface, rôle), avec le millésime du cadastre cité.

## Cas limites et bugs connus

B1 sauvegarde rapide destructrice ; B2 « Nouvelle étude » qui écrase la précédente ; B3 état de
l'étude jamais relié ; B4 compteurs à 0 ; B5 sélection figée au montage ; B6 hook recopié 4 fois
(une étude supprimée reste affichée) ; B7 statut « complète » à tort ; B8 écouteur jamais retiré ;
B10 tendance ×100 ; B11 ancien format mal lu sur mobile ; B12 couverture (bucket, URL qui expire) ;
B13 filtre d'adresse par boîte ; B14 faux « Lieu-dit » ; B15 nom instable ; B18 erreurs avalées
partout (sauvegarde, suppression, liste, carte mobile).

## Tests existants

Aucun sur ce périmètre (69 fichiers de test, aucun ne touche `etudes`, le nommage, les adresses ou
l'accueil). Les règles de nommage et de choix d'adresse se portent en tests du domaine.

## Questions (arbitrées le 01/10/2026)

Posées avec l'interface de questions, option recommandée en premier. Le porteur du produit a suivi la
recommandation partout, sauf pour Q9, Q10 et Q12.

| # | Question | Réponse |
|---|---|---|
| Q1 | Quand l'étude naît-elle ? | **bouton « Créer l'étude »** sur la carte dès une parcelle, puis **enregistrement automatique** de chaque modification ; plus de bouton Sauvegarder |
| Q2 | Le nom | **proposé selon les règles** (rue sans numéro ≠ « Lieu-dit »), puis **stable** : il ne change que par un renommage |
| Q3 | L'adresse principale | **calculée par le worker** (adresses qui touchent vraiment les parcelles, même classement), enregistrée avec les autres adresses trouvées ; **l'utilisateur peut en choisir une autre** ; recalculée quand les parcelles changent |
| Q4 | Le statut | **abandonné** : l'étude montre ses étapes, chacune cochée quand son analyse existe |
| Q5 | L'accueil | **grille + recherche** (nom, commune), triée par modification ; pas de compteurs ; plus de menu Fichier |
| Q6 | Vignette, couverture | **vignette composée par le worker** (fond + contour, cadrée sur l'emprise) ; couverture personnelle reportée (L6) |
| Q7 | Mobile, état de l'étude | **pages uniques adaptées à l'écran** ; la page de l'étude `/studies/:id` remplace `/etat` et `/m` |
| Q8 | Rouvrir et modifier | **carte de l'étude** `/studies/:id/map` : chaque clic enregistre ; plus d'« étude active » globale ; « Nouvelle étude » ouvre `/map` vide |
| Q9 | Supprimer | **corbeille 30 jours** (choix du porteur du produit), restaurable, puis purge par le worker |
| Q10 | Renommer, dupliquer | **les deux** (choix du porteur du produit) : la copie reprend nom « (copie) », adresse et parcelles |
| Q11 | Fichiers en production | **magasin de fichiers à deux implémentations** : disque (`/storage` sous once, sauvegardé) en production, S3 (MinIO) en local et en test ; S3 en production par configuration plus tard |
| Q12 | Fond de la vignette | **OSM** (choix du porteur du produit), User-Agent identifié, faible volume ; à revoir avec le fournisseur de tuiles prévu avant la production |

## Conception cible

### Données (client, PLAN §4)

- **`studies`** : `id`, `owner_id` (→ `users`, cascade), `name`, `name_is_provisional` (vrai tant que
  le worker n'a pas proposé le nom à partir de l'adresse ; faux après proposition ou renommage),
  `commune_code`, `commune_name` (commune qui porte la plus grande surface de l'étude), `address`
  (jsonb, adresse retenue), `addresses` (jsonb, adresses trouvées), `address_chosen` (l'utilisateur
  a choisi), `parcels_key` (empreinte des IDU triés, changée avec les parcelles dans la même
  transaction), `address_key` et `thumbnail_key` (empreinte pour laquelle l'adresse et la vignette ont
  été calculées : en retard quand elles diffèrent de `parcels_key`), `deleted_at` (corbeille),
  `created_at`, `updated_at`. Index : `(owner_id, updated_at)`, `deleted_at`.
- **`study_parcels`** : `(study_id, parcel_id)` en clé, `position`, `commune_code`, `prefix`,
  `section`, `number`, `contenance`, `area` (m², géodésique, domaine), `geometry` (copie), `version`
  (millésime du cadastre cité, DT-21). **Pas de clé étrangère vers `parcels`** : la référence se
  remplace à chaque millésime, la copie reste (les références vont du client vers la référence).
- Pas de colonne `version` d'étude : les écritures sont **commutatives** (ajouter ou retirer *une*
  parcelle, renommer) ; deux onglets ne s'écrasent pas, l'étude est verrouillée (`FOR UPDATE`)
  le temps d'une modification de parcelles. Le rôle d'une parcelle (PLAN §4) attend L7.

### Règles (domaine pur, `src/domain`)

- `proposeStudyName(address, parcels, communeName)` : « 2 Rue Étienne Dolet, Maisons-Alfort », « Rue
  X, Ville » (voie sans numéro), « Lieu-dit X, Ville » (toponyme), sinon « Maisons-Alfort — AY 96 » ;
  suffixe « (+N parcelle(s)) ».
- `probePoints(parcels)` : centre et milieux des bords de chaque parcelle, 12 au plus.
- `rankAddresses(candidates, parcels)` : garde les adresses à moins de 10 m d'une parcelle (distance
  au polygone, pas à la boîte : B13), dédoublonne, trie par hiérarchie de voie, numéro, score.
- `studySteps(study)` : Parcelles (faite), Urbanisme (L3), Risques (L4), Foncier et marché (L5),
  Faisabilité (L7), Rapport (L8) — « à venir » tant que le lot n'est pas livré.
- `thumbnailFrame(bbox, size)` : zoom, tuiles et projection des contours (Web Mercator).

### API (`/api/studies`, réservée à l'auteur : une étude d'un autre répond 404)

| Route | Rôle |
|---|---|
| `GET /api/studies?q=&trash=` | liste légère (sans géométries), recherche nom et commune |
| `POST /api/studies` `{parcelIds}` | crée à partir de la sélection (1 à 50 parcelles chargées) |
| `GET /api/studies/:id` | étude complète : parcelles, adresses, étapes, état du calcul |
| `PATCH /api/studies/:id` `{name?, addressId?}` | renommer, choisir l'adresse |
| `PUT` / `DELETE /api/studies/:id/parcels/:parcelId` | ajouter, retirer une parcelle (jamais la dernière) |
| `POST /api/studies/:id/duplicate` | copie |
| `DELETE /api/studies/:id` · `POST /api/studies/:id/restore` | corbeille, restauration |
| `GET /api/studies/:id/thumbnail` | PNG, depuis le magasin de fichiers |

### Worker (file `studies`)

- `resolve-address` et `render-thumbnail`, jobId `<nom>-<étude>-<parcels_key>` : une nouvelle
  sélection donne un nouveau job ; un job dont l'empreinte n'est plus la bonne ne fait rien, et
  n'écrit que si l'empreinte n'a pas bougé entre-temps.
- Adresse : géocodage inverse des points sondés (`Geocoding.reverseAll`, 15 résultats), classement,
  choix (celui de l'utilisateur s'il est toujours trouvé), nom proposé si provisoire.
- Vignette : tuiles OSM + contours en SVG, composées par `sharp` en PNG 480 × 300, rangées dans le
  magasin de fichiers (`studies/<id>/thumbnail.png`).
- Réconciliation (5 min) : réenfile les études en retard de plus d'une minute ; purge quotidienne
  des études en corbeille depuis plus de 30 jours (et de leur vignette).

### CLI

`study:list [--user] [--trash]`, `study:show`, `study:create --user <e-mail> <IDU…>`, `study:rename`,
`study:address`, `study:add-parcel`, `study:remove-parcel`, `study:duplicate`, `study:delete`,
`study:restore`, `study:refresh [--inline]`, `study:thumbnail --out`, `study:purge` ; toutes en
`--json`. `--inline` fait le calcul du worker dans la CLI.

### Écrans

- **Accueil `/`** : « Nouvelle étude » (→ `/map`), recherche, grille (vignette, nom, commune,
  parcelles, surface, « modifiée il y a 2 h »), menu Ouvrir / Dupliquer / Supprimer, lien Corbeille.
- **Corbeille `/studies/trash`** : études supprimées, date de purge, Restaurer.
- **Carte `/map`** : bouton « Créer l'étude » sous la sélection.
- **Étude `/studies/:id`** : nom (renommer), adresse (changer parmi les adresses trouvées), commune,
  parcelles et surface, carte cadrée sur l'emprise, étapes ; Modifier les parcelles, Dupliquer,
  Supprimer. Une colonne sur mobile.
- **Carte de l'étude `/studies/:id/map`** : la carte de L1, la sélection est celle de l'étude, chaque
  clic s'enregistre (« Enregistré »).

## Recette

À faire : Maisons-Alfort (2 rue Étienne Dolet), Annecy (18 rue de Morette).

## Écarts assumés

- Plus de statut ni d'avancement saisi : les étapes se déduisent des analyses (Q4).
- Plus de menu Fichier, d'« étude active » globale ni de bouton Sauvegarder (Q1, Q5, Q8).
- Plus de version mobile séparée (Q7).
- Couverture personnelle reportée (Q6) ; vignette composée côté serveur (D-08).
- Le nom ne suit plus les parcelles une fois proposé (Q2).
