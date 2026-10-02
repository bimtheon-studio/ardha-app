# L4 · Risques — feuille de route

> À la fin de L4, un utilisateur ouvre l'étape **Risques** de son étude et lit, sources et dates à
> l'appui : inondation (PPR, hauteurs d'eau TRI), argiles, radon, sismicité, altitudes de ses
> parcelles, cavités, installations et sols pollués alentour, bornes incendie ; un développeur lance et
> lit l'analyse en CLI. Branche : `l4-risks` (lancée la nuit du 01/10/2026, partie de `l2-study`).
> Fiche : [F-04](../fiches/F-04-risques.md).

## Ce qui est déjà tranché

- Seul le worker sort (PLAN §3) ; l'analyse est en base, liée à l'étude, et cite ses sources (PLAN §4).
- Caches de risques « à la demande » (PLAN §4) ; PDF composé par le worker en L8 (D-08).
- Arbitrages **provisoires** Q1 à Q14 (F-04), pris la nuit sur l'option recommandée, à confirmer.

## Étapes

1. Scanner (fait) ; fiche et arbitrages provisoires (fait).
2. Domaine : point intérieur, périmètre, aléa TRI, synthèse des axes, distances.
3. Sources : Géorisques v1, hauteurs d'eau TRI (GML), altimétrie IGN, Overpass ; réponses enregistrées.
4. Base : `study_analyses` (migration `0004`).
5. Worker : job d'analyse ; API ; CLI `risk:*`.
6. Front : page Risques de l'étude, étape reliée, couches de risques.
7. Tests unitaires, intégration, e2e ; recette ; clore.

## État au matin du 02/10/2026

Étapes 1 à 7 faites sur `l4-risks` (commits locaux, rien de poussé), critères de fin tenus en local
(recette de [F-04](../fiches/F-04-risques.md#recette)). **À faire par le porteur du produit** :
confirmer ou changer les arbitrages provisoires Q1 à Q14 ; décider du push et de la PR (après la
fusion de L2, dont `l4-risks` part).

## Critères de fin

- Maisons-Alfort AY96 + AY97 : PPRI « Marne et Seine » et ses zones, hauteurs d'eau TRI, argiles
  moyen, radon 1, sismicité 1, sans Internet (réponses enregistrées).
- Une source en panne donne « indisponible » sur son axe, jamais « aucun risque ».
- Modifier les parcelles rend l'analyse périmée ; « Recalculer » la refait.
- Tests au vert, perf consignée.
