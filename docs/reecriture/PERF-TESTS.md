# Performance des tests

La base de tests grossit vite : chaque lot mesure ses suites et les consigne ici
(`pnpm test:perf --e2e --record`). Durées de bout en bout, sans couverture, sur le poste de
développement (20 cœurs) ; la CI sera plus lente. Le détail des fichiers et tests les plus lents
s'affiche à chaque mesure.

| Date | Commit | Suites | Total |
|---|---|---|---|
| 01/10/2026 10:11 | `47ef0cf` | back+outils 215 en 6,1 s · front 47 en 5,5 s · e2e 7 en 19,9 s | 31,5 s |
| 01/10/2026 10:15 | `2296d76` | back+outils 215 en 6,8 s · front 47 en 5,4 s · e2e 7 en 17,0 s | 29,1 s |
| 01/10/2026 19:55 | `55a9039` | back+outils 333 en 7,6 s · front 70 en 4,7 s · e2e 11 en 22,6 s | 34,8 s |
| 01/10/2026 23:16 | `96d20c7` | back+outils 394 en 8,4 s · front 79 en 4,7 s · e2e 12 en 26,1 s | 39,2 s |
| 02/10/2026 19:14 | `0fc674f` | back+outils 484 en 14,4 s · front 91 en 5,6 s · e2e 13 en 31,6 s | 51,7 s |
