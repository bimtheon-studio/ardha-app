# Réécriture d'Ardha — plan

> Créé le 29/09/2026, révision 6. Ancien code : `bimtheon-studio/ardha` @ `2a7f9a0` (lecture seule).
> Inventaire mesuré de l'ancien code : [`INVENTAIRE.md`](INVENTAIRE.md), régénérable par `tools/`.
> Version présentable du même plan : [`plan.html`](plan.html), publiée sur
> https://claude.ai/artifact/KQUm6dCoD5azDUCYnu2MEc. **Ce fichier fait foi** ; la page le suit.

## 1. En bref

Ardha sort de la constellation BIMtheon pour devenir un produit autonome, avec un outillage
professionnel : CI, couverture de tests, déploiement continu, base gérée, sauvegardes. La galaxie
continue d'exister pour expérimenter ; Ardha, lui, doit devenir stable et fiable avant qu'on travaille à
nouveau sa partie SaaS.

- **Réécriture intégrale**, fonctionnalité par fonctionnalité, à partir d'une fiche arbitrée par le
  porteur du produit. Rien n'est recodé sans arbitrage.
- **Repartir de zéro** : aucune donnée à migrer. Les données de référence sont reconstruites par le
  nouveau worker.
- **Trois priorités** : le modèle de données d'une étude, le stockage local des données externes,
  l'alimentation périodique des règles PLU.
- **Hors v1** : OAuth et SSO, onboarding, organisations, facturation, e-mails, volet agent immobilier.

## 2. D'où on part

État mesuré le 29/09/2026 (base : requêtes `SELECT` en transaction lecture seule via la CLI Supabase ;
code : `tools/inventaire-ancien.mjs` sur `origin/main`).

Ardha tourne sur `bimtheon-core`, le projet Supabase partagé par six produits, dans le schéma `ardha`.
Ses comptes viennent de BIMtheon ID, ses migrations appartiennent au dépôt `core`, et Rhyzom consomme
deux de ses edge functions.

| Mesure | Valeur |
|---|---|
| Études, estimations en base | 0, 0 |
| Comptes (`auth.users`), toute la constellation | 4, dont 2 avec accès Ardha |
| Données de référence | 141 Mo, 42 499 lignes, 34 tables |
| PDF d'urbanisme (`ardha-urbanisme-docs`) | 1 991 objets, 10 Go |
| Jobs d'extraction | 21 en échec sur 30, dont 19 `texte_pdf_indisponible` |
| Edge functions, crons | 31 fonctions Deno, 6 crons `pg_cron` |
| Sécurité et logique en base | 85 policies RLS, 14 fonctions SQL |
| CI qui lance les tests | aucune |

Trois conséquences : **rien à migrer côté client**, donc la bascule ne met personne en risque ; la chaîne
PLU **bute sur la lecture des PDF, pas sur le LLM** ; le front dépend directement des API publiques
(21 fichiers les appellent depuis le navigateur), si bien que chaque panne externe devient une panne de
l'écran.

## 3. La situation visée

### Architecture

```
  Navigateur                                        Claude / MCP
      │ HTTPS                                             │ commandes
  Front React ┄┄ tuiles de fond (IGN en direct, surveillé) ┄┄► IGN
      │ REST typé (OpenAPI)                               │
┌─────▼──────────── NestJS : un code, trois points d'entrée ──▼──────┐
│   API                    Worker                        CLI         │
│   e-mail + mot de passe  SEUL à sortir :               commandes   │
│   études, estimations    API publiques, PDF, LLM       métier      │
│   jamais d'appel externe un adaptateur par source      prod en     │
│                          fraîcheur par source          lecture     │
└─────┬───────── enfile ───► Redis ───► consomme ─────────┬──────────┘
      │                                                    │
┌─────▼────────────────────────────────────────────────────▼──┐  ┌──────────────┐
│ PostgreSQL 18 + PostGIS + pgvector · « bête »                │  │ Stockage S3  │
│  données client ── version ──► données de référence          │  │ PDF · CSV DVF│
│  comptes, sessions,             cadastre, zonage, règles,    │  │ exports      │
│  études, estimations, audit     risques, DVF, ECLN + état    │  └──────────────┘
└──────────────────────────────────────────────────────────────┘
```

Seul le worker franchit la frontière vers l'extérieur. L'API ne lit que la base ; elle dépose des jobs
dans Redis, que le worker consomme. Une étude pointe vers la *version* des données de référence qu'elle
a utilisées. Seule exception : les tuiles des fonds de carte, chargées directement chez IGN par le
navigateur, avec leurs erreurs mesurées (D-08).

### Les règles qui tiennent l'ensemble

- **Seul le worker sort.** Reprises, disjoncteur, limite de débit et métriques vivent en un seul
  endroit. Une panne d'IGN ne casse plus un écran : on sert la dernière copie, avec sa date.
- **La base est « bête ».** Tables, types, index, clés primaires et étrangères, `UNIQUE`, `NOT NULL`.
  Aucun trigger, aucune fonction SQL, aucune policy, aucun `pg_cron`. La CI refuse une migration qui en
  contient.
- **L'état du travail vit dans Postgres.** Redis ne porte que « quoi faire maintenant ». Une
  réconciliation périodique réenfile ce qui s'est perdu, donc Redis n'a pas besoin de sauvegarde.
- **Les références se font par version.** Une analyse retient le PLU, le millésime DVF et la date des
  risques qu'elle a utilisés : on sait ce qui a produit un résultat, et quand le recalculer.
- **Un seul code, trois points d'entrée.** API, worker et CLI partagent les mêmes services. Claude pilote
  des commandes métier, jamais du SQL brut.
- **Tout au nom du produit.** Dépôt, cloud, domaine, compte LLM, Sentry : au nom de l'entité qui porte
  Ardha, avec au moins deux propriétaires.

### La pile

| Brique | Choix | Pourquoi |
|---|---|---|
| Backend | NestJS · TypeScript | API, worker et CLI sur les mêmes services ; module officiel pour BullMQ (D-04) |
| Accès aux données | Drizzle | SQL spatial dans des requêtes typées, pgvector natif, migrations en SQL ; confiné aux repositories, donc réversible (D-06) |
| Base | PostgreSQL 18 · PostGIS 3.6 · pgvector 0.8 | « Dans quelle zone tombe cette parcelle ? » devient une requête locale ; supportée jusqu'en novembre 2030 (D-10) |
| Jobs | BullMQ · Redis | toute la logique dans Node, une limite de débit par source, des flux parent-enfant pour la chaîne PLU (D-05) |
| Fichiers | S3 (MinIO en local) | n'importe quel fournisseur, URL signées |
| Front | React · Vite · TanStack Query | client généré depuis le contrat OpenAPI de l'API |
| Carte | Leaflet | conservé en L1, parcelles et zonage servis en GeoJSON par l'API ; MapLibre GL si les tuiles vectorielles deviennent nécessaires (D-08) |
| CLI | nest-commander | troisième point d'entrée ; exposé plus tard en outils MCP |
| Local | docker compose | Postgres 18 (image PostGIS + pgvector), Redis, MinIO ; une stack par worktree (D-09) |

## 4. Le modèle de données visé

Aujourd'hui, une étude est une ligne de `etudes` avec six blocs JSON typés `any`, complétée par neuf
clés `localStorage`. Les données publiques y sont recopiées au moment de l'étude, sans dire d'où elles
viennent. Le modèle visé sépare les deux familles, et le calcul retient ce qu'il a utilisé.

**C'est une première esquisse**, rédigée en français ; en base, les noms seront en anglais (DT-19). Le modèle de l'étude évoluera en itérant dessus, à partir de L2 ; ce qui
est acquis, c'est la séparation des deux familles et le lien par version.

**Données client** — appartiennent à l'utilisateur ; sauvegardées, jamais reconstruites.

| Entité | Contenu |
|---|---|
| `utilisateur`, `session` | e-mail, mot de passe (argon2id), nom, rôle (admin, utilisateur) |
| `etude` | auteur, nom, statut, commune, adresse principale |
| `etude_parcelle` | référence cadastrale (IDU), géométrie, surface, rôle |
| `etude_variante` | hypothèses de faisabilité, en JSON validé par un schéma versionné |
| `etude_analyse` | type (urbanisme, risques, foncier, faisabilité), entrées = versions des sources, résultat, date du calcul |
| `estimation` | bien (adresse, type, surfaces, pièces, DPE, état…), étape du parcours, fourchette de prix |
| `estimation_comparable`, `estimation_photo` | mutation DVF retenue, score, ajustements ; photo rangée dans S3 |
| `journal_audit` | qui a fait quoi, quand |

**Données de référence** — alimentées par le worker ; reconstructibles depuis les sources.

| Entité | Contenu |
|---|---|
| `commune`, `parcelle` | référentiel des communes ; cadastre Etalab, chargé commune par commune |
| `zonage_version`, `zone` | zonage et prescriptions du GPU en PostGIS, par version du document |
| `document_urba`, `document_version` | identifiant GPU, date d'approbation, empreinte, statut dans la chaîne |
| `reglement_segment` | sortie de l'extracteur déterministe : zone, secteur, commune, article, texte, pages |
| `regle` | thème, valeur, unité, condition, citation vérifiée, fiabilité, statut ; une ligne par règle |
| `dvf_mutation` | mutations brutes par millésime, géolocalisées : analyses à rayon fin en local |
| `risque`, `ecln`, `indice_insee` | caches à la demande et séries publiées |
| `etat_source` | par source et par commune : version connue, date, état (frais, à vérifier, périmé) |

**Le lien qui change tout** : `etude_analyse.entrees` cite la version du PLU, le millésime DVF et la date
des risques. Quand une source bouge, l'étude affiche « données plus récentes disponibles » et propose de
recalculer. Les références vont toujours du client vers la référence, jamais l'inverse.

## 5. Les migrations prévues

Aucune donnée ne migre (D-03). Ce qui migre, ce sont des fonctions, réécrites dans une autre
architecture. Aujourd'hui, le navigateur et les edge functions sortent vers Internet, et les crons
s'appellent eux-mêmes en HTTP avec un secret ; demain, seul le worker sort.

### La plateforme

| Aujourd'hui | Demain |
|---|---|
| Supabase Auth, BIMtheon ID | e-mail et mot de passe, sessions en base |
| PostgREST : 110 `.from()` dans le front | API REST typée (OpenAPI) |
| 85 policies RLS, 14 fonctions SQL | guards et services NestJS |
| 31 edge functions, 6 crons `pg_cron` | jobs BullMQ, routes de l'API, commandes de la CLI |
| Supabase Storage, 10 Go | S3, URL signées |
| 21 fichiers du front qui appellent les API publiques | le worker, un adaptateur par source |
| cartes PDF et vignettes capturées dans le navigateur | composées par le worker |
| Netlify et Lovable, fusion = production | `master` → production, un environnement éphémère par PR (D-11, D-13) |

### Les données : 34 tables

| Sort | Anciennes tables | Deviennent |
|---|---|---|
| Refondu | `etudes`, `estimations`, `user_roles` | `etude` (parcelles, variantes, analyses), `estimation` (comparables, photos), `utilisateur` |
| Reconstruit | `communes_referentiel`, `gpu_layers_cache`, `documents_*`, `archive_entrees`, `texte_reglement_cache`, `articles_urbanisme`, `extraction_job_chapters`, `regles_*`, `oap_analyses`, `dvf_price_aggregates`, `market_data_cache`, `ecln_prix_neufs`, `commune_data_status` | `commune`, `zone`, `document_version`, `reglement_segment`, `regle`, `dvf_mutation`, `ecln`, `etat_source` |
| Absorbé | `extraction_jobs`, `pipeline_jobs`, `import_jobs`, `corpus_targets`, `extraction_settings`, `model_catalog`, `admin_audit_log`, `purge_audit_log` | file BullMQ et statuts, configuration versionnée, `journal_audit` |
| Abandonné | `subscription_plans`, `user_subscriptions`, `_remap_comptes` | — |
| Non repris (D-12) | `agent_profiles`, `agent_clients`, `agent_listings`, `agent_mandates` | volet agent |

### Le code

| Geste | Quoi | Condition |
|---|---|---|
| **Porter** dans `src/domain` | les 22 modules purs de `supabase/functions/_shared/` (vérification des citations, consensus, segmentation, file d'extraction, fraîcheur, DVF…), l'extracteur `plui-extract` de la session voisine, les utilitaires géométriques et les formats d'export déjà testés | relus ligne à ligne, **avec leurs tests** ; un module sans test se réécrit |
| **Réécrire** | tout accès aux données, les 31 edge functions, les pages, les hooks d'appel aux API | selon la fiche arbitrée |
| **Reprendre tel quel** | les primitives shadcn/ui (4 754 lignes) | code de bibliothèque |

## 6. Les lots, dans l'ordre

Chaque lot livre une **tranche verticale** : quelque chose qu'un utilisateur peut faire de bout en bout.
Les tailles sont celles de l'ancien code ([`INVENTAIRE.md`](INVENTAIRE.md)) : un ordre de grandeur, pas
un devis. La vélocité se mesure sur L1, puis on projette. Feuilles de route détaillées : `lots/`.

| Lot | Livre | Dépend de | Ancien code |
|---|---|---|---|
| **L0 · Socle** ([feuille de route](lots/L0-socle.md)) | compte, connexion ; stack de dev par worktree | — | 265 + infra |
| **L1 · Carte et parcellaire** ([feuille de route](lots/L1-carte-parcellaire.md)) | adresse, cadastre, sélection de parcelles | L0 | 1 306 + partagé |
| **L2 · Étude** ([feuille de route](lots/L2-etude.md)) | enregistrer, rouvrir, consulter sur mobile | L1 | 1 818 |
| **L3 · Chaîne PLU et urbanisme** | zone, règles vérifiées et citations, documents, OAP | L1, extracteur voisin | 5 563 + 20 functions (6 623) |
| **L4 · Risques** | Géorisques, argiles, altimétrie, PPRI, poteaux incendie | L2 | 1 611 |
| **L5 · Foncier et marché** | DVF, prix du neuf, Sitadel, indices | L2 | 1 862 + 5 functions (1 608) |
| **L6 · Estimation** | parcours en 6 étapes, dossier PDF | L5 | 6 690 + 1 function (260) |
| **L7 · Faisabilité et résultats** | enveloppe 3D, bilan, variantes, synthèse | L3, L4, L5 | 5 712 |
| **L8 · Exports** | PDF (cartes composées par le worker), GeoPackage, Shapefile, CityJSON, LandXML, OBJ | L6, L7 | 7 385 |
| **L9 · Administration → CLI** | piloter la chaîne PLU et les modèles en ligne de commande | L3 | 3 564 + 2 functions (417) |
| Hors v1 | volet agent (non repris, D-12), briques SaaS | — | 2 726 · 916 |

S'y ajoutent **~12 000 lignes partagées** entre les pages (carte, hooks d'appel aux API, utilitaires) :
elles ne se réécrivent pas en tant que telles. Les hooks d'API disparaissent au profit du client typé ; la
carte est reconstruite en L1.

**Chemin critique** : L0 → L1 → L3 → L7 → L8. L1 et L2 démarrent sans attendre personne. L3 attend
l'extracteur déterministe de la session voisine (`claude/plui-extract`) : 19 des 21 échecs
d'extraction mesurés le 29/09 disent `texte_pdf_indisponible`, la lecture du PDF est le goulet.

**L6 · Ce qui manque à l'estimation** (le parcours existe en 6 étapes : sélection, photos, marché,
estimation, coûts, dossier) :
- comparables sans nombre de pièces, rayon fin dépendant des sources en direct : réglés par
  `dvf_mutation` en base ;
- Sitadel pas encore branché (la source actuelle interroge les DPE neufs de l'ADEME) : à faire en L5 ;
- photos cassées (bucket `agent-listings` inexistant, `getPublicUrl` sur bucket privé) : S3 et URL
  signées ;
- drapeaux d'abonnement supprimés ; la suite « annonce, mandat » n'est pas reprise (D-12).

**L9 change de nature** : l'essentiel de l'écran d'administration devient des commandes de la CLI
(`plu:extraire`, `commune:preparer`, `modeles:lister`…), que Claude pilote aussi par MCP.

## 7. La méthode : une fonctionnalité à la fois

**Rien n'est recodé sans une fiche arbitrée.**

1. **Scanner** l'ancien code (lecture seule, par export) : écrans, comportements, règles métier,
   sources externes, données lues et écrites, cas limites, bugs connus, tests existants. Chaque
   affirmation cite son `fichier:ligne`.
2. **Écrire la fiche** dans `fiches/`, sur le modèle [`fiches/_MODELE.md`](fiches/_MODELE.md), avec des
   captures de l'ancienne application comme référence visuelle.
3. **Arbitrer** : c'est le geste du porteur du produit, pas de l'assistant. Pour chaque comportement,
   *garder*, *simplifier*, *abandonner* ou *reporter*. Ce qui n'est pas arbitré n'existe pas.
4. **Concevoir** : données (client ou référence), contrat d'API, jobs du worker, commandes de la CLI,
   écrans.
5. **Tester d'abord** : cas de référence tirés de l'ancien comportement (même parcelle → même zone,
   mêmes règles, mêmes chiffres), tests unitaires du domaine, tests d'autorisation.
6. **Coder**, une PR par fonctionnalité.
7. **Recetter** sur les communes de référence : captures de l'ancien et du nouveau côte à côte, écarts
   chiffrés. Un écart est soit un bug, soit une décision consignée dans la fiche.
8. **Clore** : CI verte, seuil de couverture tenu, fiche mise à jour avec ses *écarts assumés*.

**Communes de référence** : Maisons-Alfort (94046, PLUi Paris Est Marne & Bois à secteurs et blocs
communaux, fixtures de l'extracteur voisin), Annecy (74010), Tours (37261, PLU de grande ville,
couches vides corrigées le 28/09, #71), et Beaumont-Village (37023, au RNU) : le cas sans règlement.
**Adresses de référence** (adresses des fondateurs) : 2 rue Étienne Dolet à Maisons-Alfort, 18 rue de
Morette à Annecy. Arbitré le 01/10/2026 (F-01, Q11).

## 8. Worktrees et outillage

### Une stack par worktree

Chaque copie de travail du dépôt, clone principal ou worktree git, démarre sa propre stack complète et
isolée, avec la même commande. Mécanisme repris de `castor.php` dans `~/dev/windoo/saas`, porté en
tâches Node. Livré en L0 (D-09).

| Au démarrage | Comment |
|---|---|
| Reconnaître un worktree | racine de la copie ≠ racine du dépôt principal (`git rev-parse`) |
| Isoler la stack | projet Compose nommé d'après le dossier : conteneurs et volumes séparés |
| Décaler les ports | `crc32(branche) % 400 + 5` ajouté au port de base de Postgres, Redis, MinIO, de l'API et du front ; `docker-compose.override.yaml` et `.env.local` générés, ignorés par git |
| Séparer les sessions | cookie de session suffixé par le worktree (un cookie ignore le port) |
| Remplir la base | seed déterministe depuis les fixtures des trois communes de référence, sans appel externe |
| Tester sans Internet | tests d'intégration sur la base du worktree ; réponses des API publiques enregistrées |

- **Des agents en parallèle** : chacun code dans son worktree, avec sa base, ses ports et ses tests, sans
  gêner les autres.
- **À terme, des instances éphémères** : la même commande démarre une stack sur une machine vierge (agent
  dans le cloud, environnement éphémère par branche), puisque rien ne dépend d'une base partagée ni d'un
  service externe.
- **Vigilance** : 400 décalages possibles, donc deux branches peuvent tomber sur les mêmes ports. Le
  démarrage vérifie qu'ils sont libres et le dit clairement sinon.

### Le reste de l'outillage

| Volet | Ce qu'on met en place |
|---|---|
| CI | types, lint, tests unitaires et d'intégration, migrations rejouées depuis zéro, contrôle « base bête », build |
| Couverture | seuil à cliquet par package, au moins 90 % sur le domaine |
| CD | les PR visent `master`, qui déploie la production ; chaque PR a son environnement éphémère, supprimé à la fermeture ; pas de branche `staging` (D-11, D-13) |
| Migrations | SQL versionné, en avant seulement, appliqué uniquement par la CD ; ajout puis retrait en deux temps pour ne pas couper le service |
| Sauvegardes | sauvegarde automatique de once, avec un dump cohérent de la base déposé dans `/storage` par le hook `pre-backup` (D-13) ; *plus tard* : copie chiffrée chez un autre fournisseur et test de restauration automatique, dès qu'il y aura des données client ; les règles issues du LLM se sauvegardent comme les données client |
| Observabilité | Sentry, logs structurés, alertes sur le retard de la file, le coût LLM et les erreurs de tuiles, métriques par source externe |

## 9. Risques

| Risque | Parade |
|---|---|
| Une réécriture longue qui ne livre rien | tranches verticales, déployées dès le lot LD (production et environnements par PR) ; l'ancienne application tourne jusqu'à la bascule |
| Des comportements perdus en route | fiches arbitrées, recette comparée |
| L3 bloqué par l'extracteur voisin | L1, L2, L4 et L5 avancent sans lui |
| Le coût LLM de reconstruction | n'extraire que les segments modifiés, par ordre de priorité des communes |
| Drizzle encore en 0.x | version épinglée, montée de version délibérée, accès confiné aux repositories |
| Une panne des fonds IGN plus fréquente que prévu | erreurs de tuiles mesurées ; la configuration des fonds est servie par l'API, passer par un proxy revient à changer une URL |
| Une API publique qui change | un adaptateur par source, des tests de contrat |

## 10. Fini, c'est quoi

**Pour une fonctionnalité** : fiche arbitrée et à jour, tests écrits avant le code, CI verte, seuil de
couverture tenu, recette faite sur les communes de référence.

**Pour la v1** : L0 → L8 clos, L9 en CLI ; `docker compose up` rend une application complète avec seed ;
`master` déploie la production, chaque PR son environnement éphémère ; sauvegarde nocturne et test de
restauration hebdomadaire au vert ; aucune référence à Supabase ni à la constellation dans le dépôt.

## 11. Décisions prises

Toutes prises le 29/09/2026. Chacune dit ce qu'elle a écarté et sur quoi elle repose : elle se rouvre
sur un fait nouveau, pas sur une préférence.

| N° | Décision | Plutôt que | Sur quoi elle repose |
|---|---|---|---|
| D-01 | Ardha devient un logiciel autonome | rester sur `bimtheon-core` et la constellation | posséder toute la chaîne technique ; la galaxie reste un terrain d'expérimentation |
| D-02 | v1 gratuite, connexion par e-mail et mot de passe | OAuth, SSO, organisations, facturation dès la v1 | des bases stables d'abord ; ces briques s'ajoutent ensuite |
| D-03 | Réécriture intégrale, fonctionnalité par fonctionnalité, en repartant de zéro | migrer le code ou les données | 0 étude et 0 estimation en base ; la référence se reconstruit depuis les sources |
| D-04 | NestJS, avec API, worker et CLI sur le même code | Sails.js | injection de dépendances, TypeScript natif, module BullMQ officiel ; Waterline ne connaît pas PostGIS |
| D-05 | Base « bête », jobs par BullMQ et Redis | pg-boss | pg-boss 12.35 installe son schéma et 5 fonctions SQL et fait de la base la file |
| D-06 | Drizzle pour l'accès aux données | Prisma | SQL spatial dans des requêtes typées, pgvector natif ; Prisma 7.10 sans type géométrique. Risque accepté : Drizzle en 0.45, version épinglée, accès confiné aux repositories |
| D-07 | L'estimation entre dans la v1 (L6), migrée et terminée | la reporter avec le volet agent | partie clé du produit ; les mutations DVF en base règlent une partie de ce qui manque |
| D-08 | Fonds de carte chez IGN en accès direct, sous surveillance (*amendée le 01/10/2026 par le porteur du produit : OpenStreetMap par défaut, fonds IGN au choix, F-01 Q8*) ; cartes des PDF et vignettes composées par le worker | un proxy de tuiles dès maintenant | aucune panne des tuiles de fond dans l'historique, contrairement aux API de données ; erreurs mesurées dans Sentry, proxy déclenché sur critère ; Leaflet conservé en L1 |
| D-09 | Une stack par worktree : ports déterministes par branche, seed par fixtures, tests sans Internet | une stack locale unique | faire coder des agents en parallèle, puis sur des instances éphémères |
| D-10 | PostgreSQL 18 (18.6), PostGIS 3.6, pgvector 0.8.5 | PostgreSQL 17 | dernière majeure, supportée jusqu'au 14/11/2030 ; images `postgis/postgis:18-3.6` et `pgvector/pgvector:0.8.5-pg18` disponibles |
| D-11 | Déploiement par branches : `master` → production, `staging` → serveur de staging ; environnements éphémères par branche dans un second temps (*amendée le 01/10/2026 par le porteur du produit : branche `staging` abandonnée, un environnement éphémère par PR dès le lot LD, supprimé à la fermeture*) | staging automatique et production sur tag | les PR visent `master` ; `staging` est une copie de `master` dans laquelle on pré-fusionne les branches en cours, reprise régulièrement depuis `master` |
| D-12 | Volet agent non repris au départ : clients, annonces, mandats, rapprochement acquéreurs, fiche commerciale IA, profil professionnel (logo, agence) | le porter en v1 | un autre métier (la transaction), sans usage (tables vides) ; le mandat de vente pèse réglementairement (loi n° 70-9 du 2 janvier 1970, décret n° 72-678 du 20 juillet 1972), à instruire si on y revient |
| D-13 | Hébergement sur un serveur **once** (37signals), d'abord celui du porteur du produit (`*.once.florent.cc`) : l'application en **une image Docker** (API + worker), PostgreSQL et Redis en **conteneurs partagés sur le même serveur, hors once**, branchés sur le réseau Docker `once` ; une base et un préfixe Redis par environnement (01/10/2026) | Clever Cloud (étudié le 01/10 : faisable, ~60 €/mois) ; Postgres dans l'image ; passer à SQLite | coût marginal nul, environnements par PR sous le DNS joker existant ; once lance la nouvelle version **sur le même volume avant d'arrêter l'ancienne** (`basecamp/once@da130f0`, `internal/docker/application.go`, `deployWithVolume`) : un Postgres dans `/storage` serait corrompu ; SQLite rouvrirait D-05, D-06 et D-10. Écart assumé avec « tout au nom du produit » (§3) tant qu'il n'y a pas de client |

Mesures du 29/09 : registre npm (`prisma` latest = 8.0.0-rc.19, stable 7.10.0 ; `drizzle-orm` 0.45.3 ;
`pg-boss` 12.35.0), postgresql.org (18.6, pas de 19), Docker Hub (`postgis/postgis:18-3.6`,
`pgvector/pgvector:0.8.5-pg18`), historique git d'`ardha`.

### Décisions techniques de L0 (à relire)

Prises en route pendant L0, le 30/09/2026, par l'agent de réécriture. Elles ne sont pas arbitrées :
à relire par le porteur du produit, et à rouvrir sur un fait nouveau comme les autres.

| N° | Décision | Plutôt que | Sur quoi elle repose |
|---|---|---|---|
| DT-01 | Node 26.10 (`mise.toml`, `engines`) | Node 24 | Node 26 devient LTS fin octobre 2026, supporté jusqu'en avril 2029 ; ESM, `require(esm)` et exécution native du TypeScript effaçable (outils) |
| DT-02 | pnpm 12.8 ; le back est le paquet racine, `frontend/` le seul autre paquet | npm, monorepo à paquets | structure revue par le porteur du produit le 30/09 : le back à la racine, API, worker et CLI comme entrées-sorties (`src/routes`, `src/worker`, `src/cli`), le cœur à côté ; ni build de paquets ni `dist/` intermédiaire |
| DT-03 | TypeScript 6.0 | TypeScript 7 (compilateur natif) | typescript-eslint 8.71 exige TypeScript < 6.1 |
| DT-04 | ESM partout ; back compilé par swc (décorateurs et métadonnées de Nest), outils exécutés tels quels par Node | CommonJS, tsc, tsx | NestJS 12 est publié en ESM ; esbuild et tsx n'émettent pas les métadonnées de décorateurs |
| DT-05 | Express, plateforme par défaut de Nest | Fastify | aucun besoin de performance qui le justifie en L0 |
| DT-06 | Contrat = schémas zod de `src/contracts`, décrivant chaque route ; client du front tiré de ces routes ; document OpenAPI 3.1 **dérivé** et servi sur `/api/openapi.json` | client généré depuis un document OpenAPI | une seule source, les mêmes messages de validation côté front et côté API ; l'OpenAPI reste disponible pour la CLI, MCP ou un tiers |
| DT-07 | Vitest 5 partout ; couverture v8 à cliquet (`autoUpdate` en local, seuils bloquants en CI) ; domaine et contrat à 100 % | Jest | un seul lanceur pour Node et le navigateur ; le cliquet ne fait que monter |
| DT-08 | Ports de base 13000 (API), 14000 (front), 15432, 16379, 19000/19500 | 3000, 5173, 5432, 6379, 9000 | sur cette machine, d'autres stacks suivent le même décalage `crc32 % 400 + 5` à partir de 5432 et 6379 : partager la base mènerait à des collisions systématiques |
| DT-09 | pgvector **0.8.5 compilé depuis son tag** dans une image dérivée de `postgis/postgis:18-3.6` | le paquet PGDG | le dépôt PGDG ne garde que la dernière version (0.8.6 au 30/09) : l'image ne serait pas reproductible. Passer en 0.8.6 est une montée de correctif à décider |
| DT-10 | MinIO local : fork communautaire `pgsty/minio`, version épinglée | `minio/minio` | l'image officielle n'est plus publiée sur Docker Hub (fait constaté le 30/09). Sans effet sur la production : l'API parle S3 |
| DT-11 | Mots de passe locaux (Postgres, MinIO) tirés au hasard au premier `pnpm start`, dans les fichiers ignorés | mots de passe de développement dans `docker-compose.yaml` | aucune valeur de secret dans un fichier suivi ; ports publiés sur 127.0.0.1 seulement |
| DT-12 | Limiteur : `@nestjs/throttler` avec un stockage Redis écrit pour Ardha, fenêtre fixe de 15 min | stockage `@nest-lab/throttler-storage-redis` | celui-ci ne déclare pas Nest 12. Le module compte les **tentatives** (réussies comprises), pas seulement les échecs |
| DT-13 | Session : jeton opaque de 32 octets, seule son empreinte SHA-256 en base ; CSRF : cookie `SameSite=Lax`, contrôle `Origin` et `Sec-Fetch-Site`, corps JSON obligatoire | JWT | révocable immédiatement (déconnexion, désactivation, réinitialisation) |
| DT-14 | argon2id par `@node-rs/argon2`, paramètres de l'OWASP (19 Mio, 2 passes) ; vérification leurre quand le compte n'existe pas | bcrypt | la feuille de route demande argon2id ; durée de réponse identique, compte existant ou non |
| DT-15 | Identifiants `uuidv7()`, natif de PostgreSQL 18 | `gen_random_uuid()`, identifiants générés par l'application | ordonnés dans le temps, index compacts ; fonction native, pas une fonction à nous (doctrine tenue) |
| DT-16 | Front : React 19.3, React Router 8, Vite 8, Tailwind 4 ; primitives shadcn/ui reprises, polices auto-hébergées (`@fontsource`) | Tailwind 3 ; Google Fonts | versions courantes ; le front ne charge rien hors d'Ardha sauf les tuiles IGN (D-08) |
| DT-17 | Logs structurés par pino (`nestjs-pino`), cookies et en-têtes d'authentification masqués | logger de Nest | logs JSON exploitables en production (PLAN §8) |
| DT-18 | ESLint 10 + typescript-eslint ; frontières d'architecture en `no-restricted-imports` | règles de revue | la CI fait respecter le domaine pur, Drizzle confiné, le front limité au contrat |
| DT-19 | **Tout en anglais** : dossiers, fichiers, identifiants, commandes pnpm (`start`, `stop`, `destroy`, `status`, `migrate`, `seed`) et CLI (`user:create-admin`…), options, variables (`ARDHA_PORT_OFFSET`), routes (`/api/auth/login`, `/login`…), champs JSON (`name`, `password`, `token`, `fields`), codes d'erreur, actions du journal, **tables et colonnes** (au pluriel : `users`, `sessions`, `password_resets`, `audit_logs` ; `user` est un mot réservé de PostgreSQL). Restent en français : les commentaires et les textes affichés. Les noms d'entités de §4 (`etude`, `parcelle`…) se traduisent à la conception de chaque lot | tout en français | consigne du porteur du produit, 30/09/2026 (arbitrée) ; CLAUDE.md mis à jour |

### Décisions techniques de L1 (à relire)

Prises en route pendant L1, le 30/09/2026, par l'agent de réécriture, porteur du produit absent.
Les arbitrages fonctionnels, rendus le 01/10/2026, sont dans [F-01](fiches/F-01-carte-parcellaire.md#questions-arbitrées-le-01102026) (Q1 à Q11).

| N° | Décision | Plutôt que | Sur quoi elle repose |
|---|---|---|---|
| DT-20 | Recherches à la demande (adresse, commune d'un point) **par le worker en requête-réponse** : l'API dépose un job `lookups` et attend sa réponse 5 s au plus ; cache Redis 24 h ; débit limité à 40/s | l'API qui appelle la BAN | « seul le worker sort » (PLAN §3) tient sans exception ; ~50 ms de plus mesurés, sans effet sur l'autocomplétion (F-01, Q1) |
| DT-21 | Cadastre : fichier **Etalab par commune et par millésime**, remplacé en une transaction ; IDU officiel à 14 caractères comme clé ; tables `communes`, `parcels`, `source_states` | WFS de la Géoplateforme par emprise | PLAN §4 ; une commune pèse 0,5 à 3 Mo et se charge en 1 à 3 s ; millésime connu, donc version citable par l'étude (L2) |
| DT-22 | Adaptateurs de sources dans `src/sources`, chargeurs dans `src/ingestion`, **interdits hors du worker et de la CLI par le lint** (`fetch` compris) ; réponses réelles enregistrées dans `fixtures/http` (`pnpm cli source:record`, ou `ARDHA_SOURCES=record` devant n'importe quelle commande), rejouées par `ARDHA_SOURCES=recorded` | simulations écrites à la main | D-09 : seed, tests et e2e sans Internet, sur le format réellement servi |
| DT-23 | Règles de sélection et aire géodésique **dans le domaine**, en TypeScript pur (écart < 10⁻⁵ avec PostGIS), partagées par le front et le back | calculs PostGIS seulement | réponse immédiate au clic, sans aller-retour ; mêmes règles à l'enregistrement de l'étude (L2) |
| DT-24 | Carte : react-leaflet 5, rendu canvas, parcelles demandées **par cases de 0,01°** (cache réutilisé), au zoom ≥ 16 ; sélection et vue dans l'URL | un GeoJSON par déplacement de carte | D-08 (Leaflet en L1) ; milliers de polygones sans ralentir |
| DT-25 | Tests d'intégration **en parallèle** : une base par worker de Vitest, clonée d'une base modèle migrée | une base unique, fichiers en série | 8,4 s → 3,5 s pour le back de L0 ; isolement des files BullMQ par préfixe de test |
| DT-26 | **e2e Playwright** sur une stack jetable (`e2e/stack.ts` : base `ardha_e2e`, sources enregistrées, tuiles interceptées), ports e2e décalés par worktree (17000, 18000), Chromium du système ou de Playwright | e2e contre la stack de dev | reproductible, sans Internet, en parallèle d'une stack de dev ; 12 s tout compris |
| DT-27 | **Lint obligatoire en pre-commit** : hook versionné `tools/hooks/pre-commit` (`core.hooksPath`, posé par `prepare` à l'installation), fichiers indexés seulement, tout le dépôt si la configuration change | husky, lint-staged | consigne du porteur du produit (01/10/2026) ; aucune dépendance de plus ; ~2 s par commit |
| DT-28 | **Perf des tests suivie** : `pnpm test:perf` (durée par suite, fichiers et tests les plus lents), journal `docs/reecriture/PERF-TESTS.md` ; front testé sous **happy-dom** | jsdom | consigne du porteur du produit (01/10/2026) : la base de tests va grossir vite ; happy-dom : front 5,1 → 4,3 s |

## 12. Questions ouvertes

| Sujet | Question |
|---|---|
| Propriété | À quel nom ouvrir le dépôt, le cloud, le domaine, le compte LLM, Sentry ? |
| ~~Hébergeur~~ | ~~Lequel ?~~ Tranché le 01/10/2026 : once (D-13) |
| ~~Fichiers sous once~~ | Tranché le 01/10/2026 (F-02, Q11) : magasin de fichiers disque (`/storage`) en production, S3 (MinIO) en local et en test ; S3 en production par configuration plus tard |
| LLM | Garder Azure OpenAI sur un compte propre, ou changer ? |
| Extracteur voisin | Caler le format de sortie de `plui-extract` sur `reglement_segment` (conditionne L3) |
| Fonds de carte | Quel taux d'erreurs de tuiles déclenche le proxy ? À fixer après quelques semaines de mesure |
| ~~Recette~~ | ~~Quelle petite commune en carte communale ou au RNU ?~~ Tranché le 01/10/2026 : Beaumont-Village (37023, RNU) ; Annecy ajoutée (F-01, Q11) |

*Pour mémoire* : 5 études de l'ancienne base Lovable avaient été *différées* au transport du 13/09 (FK
vers des comptes pas encore recréés) ; aucune migration ne les a réinjectées depuis, et l'ancienne base a
été supprimée le 27/09. Sans conséquence pour la réécriture, qui repart de zéro.

## Journal

- **01/10/2026** — **L2 lancé** sur la branche `l2-study` ; arbitrages F-02 Q1 à Q12 rendus :
  enregistrement automatique après « Créer l'étude », nom proposé puis stable, adresse calculée par
  le worker, statut remplacé par les étapes, corbeille de 30 jours, duplication, pages uniques pour
  le mobile, vignette OSM composée par le worker, fichiers sur disque (`/storage`) en production et
  S3 en local. Feuille de route : [`lots/L2-etude.md`](lots/L2-etude.md).

- **01/10/2026** — **hébergement : once** (D-13), après étude de Clever Cloud ; branche `staging`
  abandonnée au profit d'un environnement éphémère par PR (D-11 amendée). Feuille de route :
  [`lots/LD-deploiement.md`](lots/LD-deploiement.md).

- **01/10/2026** — fond de carte par défaut : **OpenStreetMap** (porteur du produit), fonds IGN au
  choix ; D-08 annotée. Tuiles OSM soumises à une politique d'usage : fournisseur ou proxy à prévoir
  avant un trafic important.

- **01/10/2026** — lint obligatoire en pre-commit (DT-27) ; perf des tests mesurée et consignée
  (DT-28, [`PERF-TESTS.md`](PERF-TESTS.md)) : 269 tests, 27 s tout compris. L'e2e construisait le
  front en mode développement : corrigé (front de production), et ne sème plus que les communes des
  adresses de référence (19,9 → 16,4 s).

- **01/10/2026** — arbitrages de F-01 rendus par le porteur du produit (Q1 à Q11) : Q1 à Q3, Q5 à Q7,
  Q9, Q10 confirmés ; **sélection libre** avec avertissement (Q4) ; **OpenStreetMap** ajouté aux
  fonds IGN (Q8) ; **Annecy** ajoutée aux communes de référence, avec deux adresses de référence
  (Q11). Appliqués et recettés (e2e sur les deux adresses).

- **30/09/2026** — **L1 livré sur `master`** (6f6b26a, 75d807b et suivants), porteur du produit absent :
  arbitrages Q1 à Q11 de F-01 **provisoires, à confirmer**. Cadastre Etalab par commune, recherche
  d'adresse par le worker, page `/map`, sélection de parcelles contiguës, CLI de la carte ; seed des
  trois communes de référence sans Internet ; tests unitaires, d'intégration (en parallèle) et e2e
  (Playwright). Décisions techniques DT-20 à DT-26. En passant : `.env.local` n'accumule plus de
  blocs, dernières valeurs françaises du code L0 passées en anglais.

- **30/09/2026** — code puis base en anglais (DT-19) : identifiants renommés par l'arbre syntaxique ;
  tables `users`, `sessions`, `password_resets`, `audit_logs`. Migration `0001` régénérée
  (`0001_accounts.sql`), jamais appliquée hors des postes de développement.
- **30/09/2026** — surfaces en anglais (DT-19) : commandes pnpm et CLI, options, routes de l'API et du
  front ; `pnpm status` affiche des liens cliquables et l'état de chaque service. Recette rejouée.
- **30/09/2026** — **L0 livré sur `master`** (b86d58d et suivant). Fiche F-00 scannée, arbitrée (Q1 à Q9),
  codée, recettée dans le clone et dans un worktree en même temps. Structure revue par le porteur du
  produit : back à la racine, `frontend/` à part. Décisions techniques DT-01 à DT-18 consignées, à
  relire. Faits nouveaux : pgvector 0.8.6 publié (on reste en 0.8.5, DT-09), image officielle MinIO
  retirée (DT-10). 154 tests, doctrine et CI rejouées en local ; pas encore de remote, donc CI jamais
  exécutée sur GitHub.
- **30/09/2026** — plan complet reporté dans le dépôt (sections de l'artefact ajoutées) ; `plan.html`
  versionné ; feuille de route de L0 écrite ; agent de réécriture lancé sur L0 (workspace Herdr
  `ardha-app`).
- **29/09/2026** — volet agent non repris (D-12), profil professionnel compris ; artefact en révision 6.
- **29/09/2026** — D-11 : les PR visent `master` ; `staging` = copie de `master` + branches
  pré-fusionnées, reprise régulièrement depuis `master`.
- **29/09/2026** — PostgreSQL 18 (D-10) ; modèle de l'étude marqué comme esquisse à itérer.
- **29/09/2026** — stack par worktree (D-09) ; seconde moitié de l'artefact compactée.
- **29/09/2026** — décisions D-01 à D-08 consignées.
- **29/09/2026** — l'estimation entre dans la v1 (L6) ; lots renumérotés.
- **29/09/2026** — plan créé ; inventaire mesuré sur `2a7f9a0` ; état de `bimtheon-core` relevé en
  lecture seule.
