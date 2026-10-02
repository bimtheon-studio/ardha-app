# L2 · Étude — feuille de route

> À la fin de L2, un utilisateur connecté **crée une étude depuis sa sélection de parcelles, la
> retrouve sur l'accueil, la rouvre, la renomme, en modifie les parcelles, la duplique, la met à la
> corbeille** ; il la consulte sur son téléphone. Un développeur pilote tout en CLI.
> Branche : `l2-study` (consigne du porteur du produit, 01/10/2026). Fiche : [F-02](../fiches/F-02-etude.md).

## Ce qui est déjà tranché (ne pas réarbitrer)

- Données client séparées de la référence ; l'étude copie ses parcelles et cite le millésime du
  cadastre (PLAN §4, DT-21).
- Règles de sélection dans le domaine, partagées par le front et le back (DT-23), plafond de 50
  parcelles (F-01, Q5).
- Vignettes composées par le worker (D-08) ; seul le worker sort (PLAN §3).
- Aucune donnée ne migre de l'ancienne base (D-03).
- Arbitrages Q1 à Q12 de F-02, rendus le 01/10/2026.

## Étapes

1. **Scanner** (fait : F-02, § Comportements) ; **arbitrer** (fait : Q1 à Q12).
2. **Domaine** : nommage, points sondés, classement des adresses, étapes, cadrage de la vignette.
3. **Base** : `studies`, `study_parcels` (migration `0003`).
4. **Magasin de fichiers** (`src/shared/files.ts`) : disque et S3 (Q11) ; `FILES_DRIVER`,
   `FILES_DIR`, `S3_*`.
5. **Service et API** : `StudiesService` (accès réservé à l'auteur), routes `/api/studies`, contrat.
6. **Worker** : file `studies` (adresse, vignette), réconciliation, purge de la corbeille ;
   `Geocoding.reverseAll`, tuiles OSM ; réponses enregistrées dans `fixtures/http`.
7. **CLI** : `study:*`.
8. **Front** : accueil, corbeille, bouton « Créer l'étude », page de l'étude, carte de l'étude.
9. **Tests** : domaine, intégration (API, worker, CLI), e2e (créer, rouvrir, renommer, modifier les
   parcelles, corbeille, vue mobile).
10. **Clore** : fiche, README, journal du PLAN, décisions techniques, perf des tests consignée.

## État au 01/10/2026

Étapes 1 à 9 faites sur `l2-study`, critères de fin tenus en local (recette de
[F-02](../fiches/F-02-etude.md#recette)). Reste : pousser la branche et ouvrir la PR (sur demande du
porteur du produit) ; CI et environnement de PR à vérifier à ce moment-là.

## Critères de fin

- Sur Maisons-Alfort, la parcelle de l'adresse de référence (AY146) donne une étude nommée « 2 Rue
  Etienne Dolet, Maisons-Alfort » une fois l'adresse trouvée (la BAN écrit « Etienne »), sans Internet
  (sources enregistrées) ; AY96 + AY97 donnent « 6 Rue Pasteur, Maisons-Alfort (+1 parcelle) ».
- L'accueil liste les études avec leur vignette ; la recherche trouve par nom et par commune.
- Modifier les parcelles d'une étude recalcule adresse et vignette ; le nom ne bouge pas.
- Une étude supprimée se restaure depuis la corbeille ; la purge l'efface après 30 jours.
- La page de l'étude se lit sur un écran de 375 px sans défilement horizontal.
- Les commandes `study:*` font tout ce que fait l'écran.
- Tests unitaires, d'intégration et e2e, lint, types et doctrine au vert ; perf des tests consignée.
