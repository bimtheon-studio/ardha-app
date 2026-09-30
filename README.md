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

## Commandes

| Commande | Effet |
|---|---|
| `pnpm start [--infra]` | stack complète ; `--infra` s'arrête après migrations et seed |
| `pnpm stop` · `pnpm destroy` · `pnpm status` | arrêter ; supprimer conteneurs et volumes ; ports et conteneurs |
| `pnpm test` | tests des outils, du back (intégration sur la base `ardha_test` du worktree) et du front, avec couverture |
| `pnpm lint` · `pnpm typecheck` | lint (dont les frontières de l'architecture) ; types |
| `pnpm doctrine [--base]` | contrôle « base bête » des migrations ; `--base` : aussi le schéma migré |
| `pnpm migration:generate` | nouvelle migration SQL depuis `src/base/schema.ts` |
| `pnpm cli <commande>` | CLI métier (`pnpm cli --help`) |

## Structure

```
src/                   le back (NestJS)
  domaine/             règles pures, sans framework
  contrats/            schémas zod des routes, partagés avec le front ; OpenAPI dérivé
  comptes/ journal/ base/ commun/ config/     cœur du back : services, repositories, Drizzle
  entrees/api|worker|cli/                     points d'entrée : simples entrées-sorties
drizzle/               migrations SQL, en avant seulement
test/                  tests d'intégration du back
frontend/              le front (React, Vite, TanStack Query, Tailwind, shadcn/ui)
tools/                 stack par worktree, contrôle de doctrine, inventaire de l'ancien code
```

Règles tenues par le lint : le domaine n'importe rien hors de son dossier ; le contrat ne dépend que
du domaine et de zod ; Drizzle reste dans `src/base` et les repositories ; le front n'importe du back
que `@contrats` et `@domaine`. La base est « bête » : ni trigger, ni fonction SQL, ni policy — la CI
refuse une migration qui en contient.
