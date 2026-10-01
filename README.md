# Ardha

Analyse de terrain pour l'urbanisme : du parcellaire cadastral aux règles du PLU, aux risques, au
marché foncier et au bilan de faisabilité.

Ce dépôt est la **réécriture intégrale** d'Ardha en logiciel autonome. Le plan, la méthode et
l'inventaire de l'ancien code sont dans [`docs/reecriture/`](docs/reecriture/PLAN.md).

## Démarrer

Prérequis : [mise](https://mise.jdx.dev) (il installe Node et pnpm aux versions de `mise.toml`) et
Docker avec Compose.

```bash
mise install
pnpm install
pnpm start          # dépendances Docker, migrations, seed, puis API + worker + front au premier plan
```

Le front s'ouvre sur l'adresse affichée (`http://127.0.0.1:14000` dans le clone principal).
Ctrl-C arrête l'API, le worker et le front ; les conteneurs restent (`pnpm stop` pour les arrêter).

Le seed charge le cadastre des communes de référence (Maisons-Alfort, Annecy, Tours,
Beaumont-Village) depuis les réponses enregistrées de `fixtures/http`, sans Internet. Une autre
commune se charge d'elle-même quand on la regarde sur la carte : c'est le worker qui va chercher son
cadastre (il lui faut Internet ; `ARDHA_SOURCES=recorded` l'en prive).

`pnpm install` installe aussi le hook git `pre-commit` (lint obligatoire des fichiers indexés).

Créer un administrateur (la commande affiche un lien pour choisir son mot de passe) :

```bash
pnpm cli user:create-admin --email admin@exemple.fr --name "Prénom Nom"
```

### Une stack par worktree

Chaque copie de travail (clone principal ou `git worktree`) a sa propre stack : conteneurs, volumes,
base, ports et cookie de session. `pnpm start` reconnaît un worktree et décale tous les ports de
`crc32(branche) % 400 + 5` ; le clone principal garde les ports de base. Il génère
`docker-compose.override.yaml` et `.env.local` (ignorés par git ; mots de passe locaux tirés au
hasard) et vérifie que les ports sont libres. En cas de collision :
`ARDHA_PORT_OFFSET=<0..404> pnpm start`.

| Service | Clone principal | Worktree |
|---|---|---|
| API | 13000 | 13000 + décalage |
| Front | 14000 | 14000 + décalage |
| PostgreSQL 18 + PostGIS 3.6 + pgvector | 15432 | 15432 + décalage |
| Redis | 16379 | 16379 + décalage |
| MinIO (S3) · console | 19000 · 19500 | + décalage |
| API · front des tests e2e | 17000 · 18000 | + décalage |

## Commandes

| Commande | Effet |
|---|---|
| `pnpm start [--infra]` | stack complète ; `--infra` s'arrête après migrations et seed |
| `pnpm stop` · `pnpm destroy` · `pnpm status` | arrêter ; supprimer conteneurs et volumes ; ports et conteneurs |
| `pnpm test` | tests unitaires et d'intégration (bases `ardha_test_w*` du worktree, en parallèle) des outils, du back et du front, avec couverture à cliquet |
| `pnpm test:e2e` | parcours dans Chromium sur une stack jetable (base `ardha_e2e`, ports e2e, sans Internet) |
| `pnpm test:perf [--e2e] [--record]` | durée de chaque suite, fichiers et tests les plus lents ; `--record` consigne dans [`docs/reecriture/PERF-TESTS.md`](docs/reecriture/PERF-TESTS.md) |
| `pnpm lint` · `pnpm typecheck` | lint (dont les frontières de l'architecture) ; types |
| `pnpm doctrine [--base]` | contrôle « base bête » des migrations ; `--base` : aussi le schéma migré |
| `pnpm migration:generate` | nouvelle migration SQL depuis `src/db/schema.ts` |
| `pnpm cli <commande>` | CLI métier (`pnpm cli --help`) ; `--json` pour une sortie lisible par une machine |

La CLI pilote et débogue la chaîne sans le front :

| Commande | Effet |
|---|---|
| `commune:load <codes…> [--inline] [--force]` | demande le chargement du cadastre (le worker le fait) ; `--inline` sur place |
| `commune:show <code>` · `commune:list` | état du cadastre (millésime, parcelles, erreur) |
| `parcel:show <IDU…>` · `parcel:at <lon> <lat>` | une parcelle : libellé, contenance, surface calculée, emprise |
| `parcel:selection <IDU…>` | rejoue une sélection clic par clic (contiguïté, plafond), avec son résumé |
| `address:search <texte…> [--inline]` · `address:reverse <lon> <lat>` | géocodage, par le worker ou sur place |
| `source:record <url…>` | enregistre la réponse réelle d'une source dans `fixtures/http` |
| `seed [codes…]` | sème les communes de référence, ou celles données |
| `study:create --user <e-mail> <IDU…> [--inline]` | crée une étude ; adresse et vignette par le worker, ou sur place avec `--inline` |
| `study:list [--user] [-q <texte>] [--trash]` · `study:show <id>` | études (ou corbeille), recherche ; une étude : parcelles, adresses, étapes |
| `study:rename` · `study:address` · `study:add-parcel` · `study:remove-parcel` | renommer, choisir l'adresse (identifiant BAN), modifier les parcelles |
| `study:duplicate` · `study:delete` · `study:restore` · `study:purge [--days]` | copie ; corbeille ; restauration ; purge (le worker la fait chaque nuit, après 30 jours) |
| `study:refresh <id> [--inline]` · `study:thumbnail <id> --out <png>` | recalcule adresse et vignette ; écrit la vignette dans un fichier |
| `risk:analyze <étude> [--inline] [--force]` · `risk:show <étude>` | analyse des risques (par le worker, ou sur place) ; lecture |
| `risk:commune <code>` · `risk:point <lon> <lat>` | interroge Géorisques sur une commune, argiles et hauteurs d'eau TRI en un point |

Pour enregistrer d'un coup tout ce dont une commande a besoin :
`ARDHA_SOURCES=record pnpm cli commune:load --inline 74010`, ou, pour l'adresse et la vignette d'une
étude (BAN, tuiles OSM) : `ARDHA_SOURCES=record pnpm cli study:create --user <e-mail> --inline <IDU…>`.

Fichiers (vignettes d'étude) : magasin S3 en local et en test (MinIO du worktree, `FILES_DRIVER=s3`
dans `.env.local`), disque en production (`FILES_DRIVER=disk`, `FILES_DIR=/storage/files`, sauvegardé
avec le volume de once).

## Structure

```
src/                   le back (NestJS)
  domain/              règles pures, sans framework
  contracts/           schémas zod des routes, partagés avec le front ; OpenAPI dérivé
  accounts/            comptes : services et repositories
  geo/                 carte et parcellaire : communes, parcelles, état des sources, recherches
  sources/             adaptateurs des sources publiques (worker et CLI seulement)
  ingestion/           chargement des données de référence depuis les sources (worker et CLI)
  audit/               journal d'audit
  db/                  schéma Drizzle, connexion, migrations
  shared/ config/      briques communes, configuration
  routes/              point d'entrée API : contrôleurs et couche HTTP (gardes, limiteur, erreurs)
  worker/              point d'entrée worker : files BullMQ
  cli/                 point d'entrée CLI : commandes
drizzle/               migrations SQL, en avant seulement
fixtures/http/         réponses réelles enregistrées des sources publiques (seed, tests, e2e)
test/                  tests d'intégration du back
e2e/                   tests e2e (Playwright) et leur stack jetable
frontend/              le front (React, Vite, TanStack Query, Tailwind, shadcn/ui)
tools/                 stack par worktree, contrôle de doctrine, inventaire de l'ancien code
```

Règles tenues par le lint : le domaine n'importe rien hors de son dossier ; le contrat ne dépend que
du domaine et de zod ; Drizzle reste dans `src/db` et les repositories ; seuls le worker et la CLI
touchent aux sources publiques (`src/sources`, `src/ingestion`, `fetch`) ; le front n'importe du
back que `@contracts` et `@domain`. La base est « bête » : ni trigger, ni fonction SQL, ni policy — la CI
refuse une migration qui en contient.
