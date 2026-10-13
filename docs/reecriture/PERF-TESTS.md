# Performance des tests

La base de tests grossit vite : chaque lot mesure ses suites et les consigne ici
(`pnpm test:perf --e2e --record`). Durées de bout en bout, sans couverture, sur le poste de
développement (20 cœurs) ; la CI sera plus lente. Le détail des fichiers et tests les plus lents
s'affiche à chaque mesure.

Notes (les lignes s'ajoutent en bas du tableau, les notes restent ici) :

- **13/10/2026, `1a0ee99` (DT-20)** : régression des e2e entre `b0d5254` et `master` (`ef88ed2`),
  c'est-à-dire pendant L5 (foncier et marché, risques affichés au fil du calcul), lot fusionné sans
  mesure consignée : **27,2 s → ~40 s** sans qu'aucun fichier `e2e/` ait changé. Le back reste
  stable (17,3 s → 17 à 19 s). Mesuré le même jour dans les mêmes conditions (machine chargée,
  charge moyenne entre 5 et 12), `master` donne 19,7 s · 7,5 s · 43,8 s (71,1 s), et cette branche
  17,0 à 19,0 s · 7,1 à 7,3 s · 38,5 à 40,0 s (62,8 à 66,1 s) : DT-20 ne ralentit pas les tests.
  Une mesure faite plus tôt dans le dépôt principal (back ~34 s, 84,5 s au total) était faussée par
  la charge. Fichiers e2e les plus lents : `map.spec.ts` (6 tests, ~21 s), `study.spec.ts` (~11 s),
  `market.spec.ts` (~9 s).

| Date | Commit | Suites | Total |
|---|---|---|---|
| 01/10/2026 10:11 | `47ef0cf` | back+outils 215 en 6,1 s · front 47 en 5,5 s · e2e 7 en 19,9 s | 31,5 s |
| 01/10/2026 10:15 | `2296d76` | back+outils 215 en 6,8 s · front 47 en 5,4 s · e2e 7 en 17,0 s | 29,1 s |
| 01/10/2026 19:55 | `55a9039` | back+outils 333 en 7,6 s · front 70 en 4,7 s · e2e 11 en 22,6 s | 34,8 s |
| 01/10/2026 23:16 | `96d20c7` | back+outils 394 en 8,4 s · front 79 en 4,7 s · e2e 12 en 26,1 s | 39,2 s |
| 02/10/2026 19:14 | `0fc674f` | back+outils 484 en 14,4 s · front 91 en 5,6 s · e2e 13 en 31,6 s | 51,7 s |
| 02/10/2026 19:21 | `b0d5254` | back+outils 484 en 17,3 s · front 91 en 5,5 s · e2e 13 en 27,2 s | 50,0 s |
| 13/10/2026 14:00 | `1a0ee99` | back+outils 487 en 19,0 s · front 92 en 7,1 s · e2e 13 en 40,0 s | 66,1 s |
