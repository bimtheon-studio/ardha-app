# Ardha — consignes pour les agents

Ce dépôt est la **réécriture intégrale** d'Ardha en logiciel autonome. Avant d'écrire du code, lire
[`docs/reecriture/PLAN.md`](docs/reecriture/PLAN.md) : la cible, la méthode, les lots et les décisions
D-01 à D-12 y sont consignés. Version présentable du même plan :
https://claude.ai/artifact/KQUm6dCoD5azDUCYnu2MEc

**Une décision consignée se rouvre sur un fait nouveau, pas sur une préférence.** Si tu penses qu'une
décision est mauvaise, dis-le au porteur du produit ; ne la contourne pas.

## L'ancien code : lecture seule, par export

- L'ancien dépôt est `~/dev/bimtheon/ardha` (`bimtheon-studio/ardha`). **N'y écris jamais rien** : une
  autre session y travaille en ce moment (branche `claude/plui-extract`, changements non commités). Pas
  de `checkout`, pas de `npm install`, pas de serveur lancé depuis ce répertoire.
- Pour le lire, exporter `origin/main` ailleurs :
  `git -C ~/dev/bimtheon/ardha fetch -q origin && git -C ~/dev/bimtheon/ardha archive origin/main | tar -x -C <dossier-temporaire>`
- Toute affirmation sur l'ancien comportement cite `fichier:ligne` et le SHA exporté.
- L'ancienne base (`bimtheon-core`, Supabase) ne se touche pas. Aucune écriture, jamais. La réécriture
  n'en a pas besoin : on repart de zéro (D-03).

## La méthode, pour chaque fonctionnalité

1. Scanner l'ancien code ; 2. écrire la fiche dans `docs/reecriture/fiches/` (modèle `_MODELE.md`) ;
3. **faire arbitrer** chaque comportement par le porteur du produit (garder, simplifier, abandonner,
reporter) ; 4. concevoir ; 5. écrire les tests d'abord ; 6. coder ; 7. recetter ; 8. clore.

Ce qui est déjà tranché par une décision D-xx n'a pas besoin d'être réarbitré : cite la décision. Pour le
reste, **pose la question et attends la réponse** avant de coder ce qui en dépend ; avance en attendant
sur ce qui n'en dépend pas.

## Règles d'architecture (résumé du plan)

- NestJS, un code, trois points d'entrée : **API**, **worker**, **CLI**. React pour le front.
- PostgreSQL 18 + PostGIS 3.6 + pgvector, accès par **Drizzle**, confiné aux repositories.
- **Base « bête »** : tables, types, index, clés, `UNIQUE`, `NOT NULL`. Jamais de trigger, de fonction
  SQL, de policy, de `pg_cron`. Une migration qui en contient doit faire échouer la CI.
- Jobs : **BullMQ + Redis**. L'état du travail vit dans Postgres ; Redis se reconstruit.
- **Seul le worker appelle l'extérieur** (API publiques, PDF, LLM). L'API ne lit que la base.
- Stockage de fichiers : S3 (MinIO en local).
- **Le code est en anglais** : dossiers, fichiers, identifiants, commandes (pnpm, CLI), options,
  variables d'environnement, routes (API et front), champs JSON, codes d'erreur (DT-19). **Restent en
  français** : le modèle en base (tables et colonnes : `etude`, `parcelle`, `regle`…, nommées
  explicitement dans le schéma Drizzle), les commentaires et les textes affichés à l'utilisateur.

## Environnement de développement

- `docker compose` pour les dépendances (Postgres, Redis, MinIO), **une stack par worktree** (D-09) :
  ports décalés de façon déterministe à partir du nom de branche, fichiers locaux générés et ignorés par
  git, seed par fixtures, tests d'intégration sans Internet. Modèle : `~/dev/windoo/saas/castor.php`
  (à lire, pas à copier tel quel : c'est du PHP, ici on est en Node).
- **Les ports de base peuvent être déjà pris sur cette machine** par d'autres projets : vérifier qu'un
  port est libre avant de s'en servir, et échouer clairement sinon.
- Versions d'outils épinglées (`mise.toml` et champ `engines`).

## Git

- Une branche par lot ou par fonctionnalité, partie de `master`. Commits locaux autorisés, en français.
- **Pas de remote pour l'instant, donc pas de push.** Ne jamais réécrire un historique déjà partagé.
- Terminer chaque message de commit par :
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

## Interdits

- Aucune valeur de secret dans un fichier suivi par git, un commit ou un message.
- Ne rien modifier hors de ce dépôt, sauf les fichiers temporaires de ton propre dossier de travail.
- Ne pas fermer les panes, onglets ou workspaces Herdr que tu n'as pas créés.
