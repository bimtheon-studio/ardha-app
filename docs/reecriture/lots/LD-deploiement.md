# LD · Déploiement sur once — feuille de route

> À la fin de LD, **`master` tourne en production sur le serveur once** du porteur du produit, et
> **chaque PR a son environnement éphémère** (`ardha-pr-<n>.once.florent.cc`), seedé, supprimé à la
> fermeture. Un développeur (humain ou agent) crée, met à jour, inspecte et supprime un environnement
> par **une commande du dépôt**. Branche de travail : `ld-deployment`. Décisions : D-11 (amendée),
> D-13.

## Ce qui est déjà tranché (ne pas réarbitrer)

- **once** (`basecamp/once`) sur le serveur actuel du porteur du produit : `ubuntu@ssh.once.florent.cc`,
  DNS joker `*.once.florent.cc` (D-13).
- **Une image Docker** pour l'application : API, worker et front servis par l'API, dans le même
  conteneur. once impose : HTTP sur le port 80, santé sur `/up`, volume persistant `/storage`, un seul
  conteneur par application. Il injecte `BASE_URL`, `DISABLE_SSL`, `SECRET_KEY_BASE`.
- **PostgreSQL et Redis hors once**, en conteneurs partagés sur le même serveur (`docker compose`),
  branchés sur le réseau Docker `once` (réseau créé par once, `internal/docker/namespace.go`), sans
  port public. Image Postgres = celle du dépôt (`docker/postgres`, D-10, DT-09). **Jamais de Postgres
  dans l'image de l'application** : once démarre la nouvelle version sur le même volume avant
  d'arrêter l'ancienne (`internal/docker/application.go`, `deployWithVolume`, once @ `da130f0`).
- **Une base et un préfixe Redis par environnement** (`ardha_production`, `ardha_pr_123` ; préfixe
  `ardha-pr-123`).
- **Pas de branche `staging`** ; les PR visent `master` (D-11 amendée).
- Migrations en avant seulement, jouées au démarrage du conteneur, **sous verrou consultatif**
  (`pg_advisory_lock`, fonction native : la doctrine « base bête » tient). L'ancien conteneur sert
  encore pendant la migration : ajout puis retrait en deux temps (PLAN §8).
- Sauvegardes : celles de once (`--auto-backup`), avec un `pg_dump` cohérent de la base de
  l'environnement déposé dans `/storage` par `/hooks/pre-backup`, restauré par `/hooks/post-restore`.
  **Hors LD** : copie hors du serveur, test de restauration automatique.
- Hors LD : Sentry, drain de logs, stockage de fichiers (question ouverte du PLAN §12).

## Le serveur est partagé : règles

Le serveur héberge d'autres applications du porteur du produit.

- Ne toucher **que** ce qui porte le nom `ardha` : applications once `ardha*`, conteneurs, volumes et
  projet Compose `ardha-services`, bases `ardha_*`. Jamais de `docker system prune`, de `once remove`
  ou de `docker rm` sur autre chose.
- **Inspecter avant d'agir** : version de once (`once version`), `once list`, `docker network ls`,
  RAM et disque libres (`free -m`, `df -h`). Si la RAM ne permet pas Postgres + Redis + production +
  quelques PR, le dire au porteur du produit avant d'installer quoi que ce soit.
- Aucun secret dans le dépôt : mots de passe tirés au hasard sur le serveur, dans un fichier lisible
  par `ubuntu` seulement.
- Ce qui s'installe sur le serveur (fichier Compose, script) est **versionné dans le dépôt** et copié
  par la commande de déploiement : le serveur se reconstruit depuis le dépôt.

## Étapes

1. **Inspecter le serveur** (lecture seule) et consigner ce qu'on y trouve dans ce fichier.
2. **Code, testable en local et en CI, tests d'abord** :
   - `Dockerfile` en plusieurs étapes (Node 26.10 et pnpm 12.8 au build, comme `mise.toml`) ; image
     finale avec `pg_dump` 18 et `fixtures/http` (seed des communes de référence) ;
   - lanceur : migrations sous verrou, puis API et worker ; relance du worker s'il tombe ; SIGTERM
     transmis, arrêt propre de BullMQ ;
   - contrat once : route `/up` ; écoute sur `0.0.0.0:80` ; `BASE_URL` → `WEB_ORIGIN` ; `DISABLE_SSL`
     → cookie sans `Secure` ; `TRUST_PROXY=1` (kamal-proxy) ;
   - **front servi par l'API** (`frontend/dist` : `/assets` en cache `immutable`, `index.html` sans
     cache, repli SPA hors `/api`) : le cookie `SameSite=Lax` et le contrôle `Origin` supposent une
     même origine ;
   - préfixe Redis unique par environnement : le limiteur l'a en dur
     (`src/routes/http/rate-limit.ts:38`) ;
   - seed au premier démarrage si la base est vide (`ARDHA_SEED_ON_BOOT`), pour les environnements
     de PR ;
   - hooks `/hooks/pre-backup` et `/hooks/post-restore` ;
   - test « image » : construire l'image, la démarrer contre la stack locale, vérifier `/up`, `/`,
     `/map`, une connexion ; l'ajouter à la CI.
3. **Serveur** : `deploy/server/compose.yaml` (Postgres, Redis ; réseau `once`) et un script serveur
   `ardha-env create|update|remove|list <nom>` (base + rôle, `once deploy`/`update`/`remove`,
   clés Redis). La clé SSH de la CI ne pourra lancer que ce script (commande forcée dans
   `authorized_keys`) : à proposer au porteur du produit, pas à poser sans accord.
4. **Commande du dépôt** pour piloter et déboguer : créer, mettre à jour, lire l'état et les logs,
   lancer une commande de la CLI dans le conteneur (`once exec`), supprimer un environnement.
5. **Production** : `ardha.once.florent.cc` (nom à confirmer), `--auto-update=false`, image à tag
   immuable (`sha-…`) ; créer l'administrateur par `once exec … user:create-admin`.
6. **CI/CD et environnements par PR** (GitHub Actions) : image publiée sur ghcr.io (`sha-…`, `pr-N`,
   `master`) ; push sur `master` → production ; PR ouverte ou mise à jour → `ardha-env create|update
   pr-N`, lien de mot de passe de l'admin en commentaire ; base recréée si la PR touche `drizzle/` ;
   PR fermée → `ardha-env remove pr-N` ; balayage nocturne des environnements orphelins.
7. **Clore** : README (section « Déployer »), journal du PLAN, décisions techniques de LD.

## Bloquant connu

**Le dépôt n'a pas de remote** (CLAUDE.md) : pas de GitHub Actions ni de ghcr.io tant qu'il n'existe
pas. Les étapes 1 à 5 avancent sans lui (image construite en local, poussée vers un registre ou
transférée par `docker save | ssh … docker load`, selon ce que once accepte : à vérifier). Demander au
porteur du produit où créer le dépôt (question « Propriété », PLAN §12) avant l'étape 6.

## Critères de fin

- `master` déployé sur once, servi en HTTPS, `/up` au vert, connexion et carte fonctionnelles, une
  commune chargée à la demande par le worker depuis Internet.
- Un environnement de PR se crée, se met à jour et se supprime par la commande du dépôt (puis par la
  CI quand le remote existe), sans rien laisser sur le serveur.
- Une sauvegarde once restaurée sur un environnement jetable rend la même base.
- Tests unitaires, d'intégration, e2e et test de l'image au vert ; lint, types, doctrine ; durées des
  tests remontées (`pnpm test:perf --e2e`).
