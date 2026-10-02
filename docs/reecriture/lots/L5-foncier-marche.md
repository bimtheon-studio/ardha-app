# L5 · Foncier et marché — feuille de route

> À la fin de L5, un utilisateur ouvre l'étape **Foncier et marché** de son étude. Il y lit, sources
> et dates à l'appui :
> - les prix au m² des maisons, des appartements et des terrains autour de ses parcelles, ancien et
>   neuf, avec leur tendance ;
> - le prix du neuf du département ;
> - les logements autorisés dans la commune ;
> - les indices de la construction et des prix ;
> - sur la carte, les ventes et les parcelles vendues.
>
> Un développeur charge, lit et débogue les ventes DVF en CLI.
>
> Branche : `l5-land-market`, lancée le 02/10/2026, partie de `master`. Fiche :
> [F-05](../fiches/F-05-foncier-marche.md).

## Ce qui est déjà tranché

- Seul le worker sort (PLAN §3). Les mutations DVF sont en base, par millésime (PLAN §4).
- Une analyse par étude dans `study_analyses` (DT-33), un état `ok` / `unavailable` par source
  (DT-34).
- PDF composé par le worker en L8 (D-08).
- Arbitrages Q1 à Q10 rendus le 02/10/2026 (F-05).

## Étapes

1. Scanner, fiche, arbitrages (fait).
2. Domaine : dédoublonnage geo-DVF, classement des ventes, bornes, IQR, médiane et quantiles,
   tendance, historique, calendrier DVF, département d'une commune, couverture, catalogue des indices.
3. Sources :
   - index et fichiers de geo-DVF, ECLN et Sitadel (DiDo), INSEE BDM ;
   - réponses enregistrées (94 sur 2 millésimes, ECLN, indices, Sitadel de Maisons-Alfort).
4. Base :
   - tables `dvf_mutations`, `new_build_prices`, `index_values`, `housing_permits` ;
   - `studies.market_radius_m` ; type d'analyse `market`.
5. Worker : chargeurs DVF, ECLN, indices, Sitadel ; job `market:analyze` ; réconciliation.
6. API, puis CLI `dvf:*`, `market:*`, `ecln:load`, `index:load`, `sitadel:show`.
7. Front :
   - page Foncier et marché, rayon, prix, historique, neuf, Sitadel, indices ;
   - carte des ventes et parcelles vendues, liste.
8. Tests unitaires, intégration, e2e ; recette au navigateur (ordinateur et 375 px) ; perf
   consignée ; clore.

## Critères de fin

- **Maisons-Alfort AY96 + AY97, à 500 m**, sans Internet (réponses enregistrées) : médianes maison
  et appartement, ancien et VEFA, avec effectifs ; ECLN du Val-de-Marne ; Sitadel de la commune ;
  indices.
- **Rayon** : passer à 1 km rend l'analyse périmée, et le recalcul suit.
- **Couverture et sources** : une étude en Moselle dit « non couvert par DVF », sans erreur. Une
  source en panne donne « indisponible », jamais 0 vente.
- **Parcelles vendues** : celles dont le cadastre est chargé s'affichent en contours.
- **Fin du lot** : tests au vert, perf consignée.
