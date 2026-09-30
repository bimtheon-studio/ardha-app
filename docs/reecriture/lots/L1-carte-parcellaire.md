# L1 · Carte et parcellaire — feuille de route

> À la fin de L1, un utilisateur connecté **cherche une adresse, voit le cadastre sur un fond IGN et
> sélectionne des parcelles contiguës**, avec leur surface ; un développeur (humain ou agent) **pilote
> et débogue la chaîne en CLI** (charger une commune, chercher une adresse, lire une parcelle).
> Branche de travail : `master` (consigne du porteur du produit, 30/09/2026). Fiche :
> [F-01](../fiches/F-01-carte-parcellaire.md).

## Ce qui est déjà tranché (ne pas réarbitrer)

- **Seul le worker sort** (PLAN §3) : le navigateur n'appelle plus ni le WFS de l'IGN ni la BAN ;
  l'API ne lit que la base et dépose des jobs.
- **Cadastre Etalab chargé commune par commune** dans `parcels` (PLAN §4, données de référence), avec
  l'état de la source par commune (`source_states`, l'« etat_source » du PLAN).
- **Fonds de carte IGN en accès direct**, Leaflet conservé en L1, configuration des fonds servie par
  l'API (D-08, PLAN §9).
- Seed par fixtures des communes de référence, tests sans Internet (D-09).
- Hors L1 : l'étude enregistrée et son adresse principale (L2), le zonage PLU (L3), l'altimétrie
  (L4), le rapport PDF (L8).

## Étapes

1. **Scanner** la page Cadastre et sa fermeture (fait : F-01, § Comportements).
2. **Arbitrer** ce que les décisions ne couvrent pas (F-01, § Questions). Le porteur du produit étant
   absent pour la nuit du 30/09, l'agent retient l'option recommandée comme **arbitrage provisoire**,
   code-la de façon à pouvoir la changer à peu de frais, et la signale au réveil.
3. **Sources** (`src/sources`) : un adaptateur par source (géocodage Géoplateforme, geo.api.gouv.fr,
   cadastre Etalab), réponses enregistrées dans `fixtures/http/` pour les tests et le seed. Le lint
   interdit d'importer `src/sources` hors du worker et de la CLI.
4. **Base** : `communes`, `parcels`, `source_states` ; index spatiaux.
5. **Worker** : file `cadastre` (charger une commune, idempotent, état en base), file `lookups`
   (géocodage à la demande, en requête-réponse), réconciliation périodique.
6. **API** : recherche et géocodage inverse d'adresse, état d'une commune, demande de chargement,
   parcelles d'une emprise, parcelles par identifiant, configuration des fonds.
7. **CLI** : `commune:load`, `commune:show`, `commune:list`, `parcel:show`, `parcel:at`,
   `parcel:selection`, `address:search`, `address:reverse`, `source:record`.
8. **Front** : page `/map` (recherche d'adresse, position, carte, parcelles, sélection, surface, fonds).
9. **Tests** : unitaires (domaine, adaptateurs sur réponses enregistrées), intégration (API, worker,
   CLI sur la base du worktree, en parallèle), **e2e** (Playwright sur une stack jetable, sans
   Internet : inscription, connexion, recherche d'adresse, sélection de parcelles).
10. **Clore** : fiche à jour, README, journal du PLAN, décisions techniques de L1.

## État au 30/09/2026

Critères de fin tenus en local (recette de [F-01](../fiches/F-01-carte-parcellaire.md#recette)).
Reste : **confirmer les arbitrages provisoires Q1 à Q11** ; exécuter la CI sur GitHub (pas de
remote) ; captures comparées à l'ancienne application.

## Critères de fin

- Tout le travail sur `master`, en commits locaux.
- `pnpm start` rend la carte avec les trois communes de référence déjà chargées par le seed, sans
  Internet ; une autre commune se charge à la demande quand le worker a Internet.
- Un utilisateur cherche une adresse, sélectionne plusieurs parcelles contiguës, voit la surface totale ;
  la sélection survit à un rechargement de la page.
- Les commandes de la CLI chargent une commune, cherchent une adresse et lisent une parcelle.
- Tests unitaires, d'intégration et e2e, lint, types et doctrine au vert en local.
