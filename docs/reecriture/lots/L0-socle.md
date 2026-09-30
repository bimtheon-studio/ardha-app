# L0 · Socle — feuille de route

> À la fin de L0, l'utilisateur sait **créer un compte, se connecter, se déconnecter**, et un développeur
> (humain ou agent) sait **démarrer une stack complète et isolée par worktree** en une commande.
> Branche de travail : `master` directement (consigne du porteur du produit, 30/09/2026).

## Ce qui est déjà tranché (ne pas réarbitrer)

D-01 à D-12 dans [`../PLAN.md`](../PLAN.md). En particulier : NestJS (API, worker, CLI), PostgreSQL 18 +
PostGIS 3.6 + pgvector, Drizzle, BullMQ + Redis, base « bête », une stack par worktree, v1 gratuite avec
connexion par e-mail et mot de passe, **aucun e-mail envoyé en v1**, pas de profil professionnel.

## Étapes

1. **Scanner** dans l'ancien code (export de `origin/main`) ce qui relève de L0 : `src/pages/Auth.tsx`,
   `src/hooks/useAuth.ts`, `src/components/ProtectedRoute.tsx`, `src/components/RequireOnboarding.tsx`,
   `src/pages/NotFound.tsx`, et la mise en place du front (Vite, Tailwind, primitives shadcn/ui).
   Écrire la fiche `fiches/F-00-socle.md` sur le modèle.
2. **Faire arbitrer** ce que les décisions ne couvrent pas. Exemples attendus : inscription ouverte à
   tous ou non ; règles de mot de passe ; durée de session ; mot de passe oublié (sans e-mail en v1 :
   commande CLI d'administration ?) ; que devient l'aiguillage d'onboarding. **Poser les questions au
   porteur du produit dans ce pane et attendre ses réponses** avant de coder ce qui en dépend ; avancer
   en attendant sur l'infrastructure (étapes 3 à 6), qui n'en dépend pas.
3. **Structure du dépôt** (revue par le porteur du produit le 30/09/2026) : le back NestJS **à la
   racine** — `src/domain` (règles pures), `src/contracts` (schémas partagés front ↔ API), le cœur
   (services, repositories), et `src/{routes,worker,cli}`, simples entrées-sorties — et le front
   dans `frontend/` (React, Vite, TanStack Query, Tailwind, primitives shadcn/ui reprises telles
   quelles). Versions épinglées (`mise.toml`, `engines`).
4. **Stack locale compatible worktree** : `docker compose` avec Postgres 18 (image PostGIS 3.6 à laquelle
   on ajoute pgvector), Redis, MinIO. Une commande de démarrage qui reconnaît un worktree, isole le projet
   Compose, décale les ports de façon déterministe à partir de la branche (modèle :
   `~/dev/windoo/saas/castor.php`), génère `docker-compose.override.yaml` et `.env.local` (ignorés par
   git), suffixe le cookie de session, **vérifie que les ports sont libres** et le dit clairement sinon,
   puis joue les migrations et le seed.
5. **Base** : configuration Drizzle, première migration (`users`, `sessions`, `audit_logs` — noms en anglais, DT-19), et
   un **contrôle de la doctrine « base bête »** qui échoue si une migration contient `CREATE FUNCTION`,
   `CREATE TRIGGER` ou `CREATE POLICY`.
6. **CI** : un workflow GitHub Actions (types, lint, tests unitaires et d'intégration sur un Postgres de
   service, migrations rejouées depuis zéro, contrôle de doctrine, build). Il n'y a pas encore de remote :
   l'écrire, et en jouer localement tout ce qui peut l'être.
7. **Authentification** (après arbitrage) : inscription, connexion, déconnexion, « qui suis-je » ; mot de
   passe haché en argon2id, sessions en base, cookie `httpOnly`. Commandes CLI : créer un administrateur,
   réinitialiser un mot de passe. Côté front : pages de connexion et d'inscription, route protégée, 404.
8. **Tests d'abord** : unitaires sur le domaine, intégration de l'API contre le Postgres du worktree,
   seuil de couverture à cliquet posé à la mesure initiale.
9. **Clore** : fiche à jour avec ses écarts assumés, `README.md` (comment démarrer), journal du
   `PLAN.md` complété. Les choix techniques faits en route (gestionnaire de paquets, version de Node,
   lanceur de tests…) sont consignés dans `PLAN.md` comme **décisions techniques de L0**, à relire.

## État au 30/09/2026

Critères de fin tenus, en local : voir la recette de [F-00](../fiches/F-00-socle.md#recette) et le journal
du [PLAN](../PLAN.md#journal). Reste hors de ce lot : exécuter la CI sur GitHub (pas de remote), choisir
l'hébergeur (question ouverte du PLAN).

## Critères de fin

- Tout le travail sur `master`, en commits locaux.
- Depuis un clone **et** depuis un worktree, la commande de démarrage rend une stack qui marche, sur des
  ports différents, en même temps.
- Un utilisateur crée un compte, se connecte, se déconnecte ; un administrateur est créé par la CLI.
- Tests et contrôle de doctrine au vert en local.
