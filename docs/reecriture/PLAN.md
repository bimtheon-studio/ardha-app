# Réécriture d'Ardha — plan

> Créé le 29/09/2026. Référence : `bimtheon-studio/ardha` @ `2a7f9a0` (lecture seule).
> Inventaire mesuré de l'ancien code : [`INVENTAIRE.md`](INVENTAIRE.md), régénérable par `tools/`.

## 1. La cible

Décisions prises le 29/09/2026 :

- **Un logiciel autonome**, indépendant de toute la constellation BIMtheon : ni `bimtheon-core`, ni
  BIMtheon ID, ni Rhyzom, ni Supabase, ni Lovable. La galaxie continue d'exister pour expérimenter ;
  Ardha en sort pour devenir un produit.
- **Gratuit en v1**, connexion par **e-mail et mot de passe**. Hors v1, à reprendre ensuite : OAuth et
  SSO, onboarding, organisations, facturation, e-mails transactionnels.
- **Architecture** : un backend **NestJS** avec trois points d'entrée sur le même code — **API**,
  **worker** et **CLI** —, un front **React**, **PostgreSQL 18** avec PostGIS 3.6 et pgvector 0.8, **Redis** et
  BullMQ pour les jobs, un stockage d'objets compatible **S3**.
- **Seul le worker sort vers l'extérieur** (API publiques, PDF, LLM). L'API lit la base, jamais
  Internet. Exception : les tuiles des fonds de carte, chargées par le navigateur.
- **La base est « bête »** : tables, types, index, clés primaires et étrangères, `UNIQUE`,
  `NOT NULL`. Aucun trigger, aucune fonction SQL, aucune policy, aucun `pg_cron`. La CI refuse une
  migration qui en contient.
- **Deux familles de données** : les *données client* (comptes, études) et les *données de
  référence* (cadastre, zonage, règles PLU, risques, marché). Les premières référencent les secondes
  **par version**, jamais l'inverse.
  Le modèle de l'étude n'est qu'une première esquisse : il s'affine en itérant, à partir de L2.
- **L'état du travail vit dans Postgres**, la file Redis ne porte que « quoi faire maintenant ». Une
  réconciliation périodique réenfile ce qui s'est perdu : Redis n'a pas besoin d'être sauvegardé.

## 2. Ce qu'on laisse derrière

**Aucune donnée n'est migrée.** Mesuré le 29/09/2026 sur `bimtheon-core` (lecture seule) :

- `ardha.etudes` : 0 ligne ; `estimations`, annonces, clients, mandats : 0 ;
- `auth.users` : **4 comptes pour toute la constellation**, créés entre le 25 et le 28/09, dont 2 ont
  un droit d'accès à Ardha (`core.entitlements`). Ils se recréeront un compte ;
- les données de référence (141 Mo, 42 499 lignes) seront **reconstruites par le nouveau worker**
  depuis les sources — c'est son meilleur test de recette ;
- `ardha-urbanisme-docs` : 1 991 objets, 10 Go de PDF, tous retéléchargeables depuis le GPU.

## 3. La méthode : une fonctionnalité à la fois

Chaque fonctionnalité suit la même boucle. **Rien n'est recodé sans une fiche arbitrée.**

1. **Scanner** l'ancien code (lecture seule) : écrans, comportements, règles métier, sources
   externes, données lues et écrites, cas limites, bugs connus, tests existants. Chaque affirmation
   cite son `fichier:ligne`.
2. **Écrire la fiche** dans `fiches/`, sur le modèle [`fiches/_MODELE.md`](fiches/_MODELE.md), avec
   des captures de l'ancienne application comme référence visuelle.
3. **Arbitrer** — c'est le geste du porteur du produit, pas de l'assistant : pour chaque
   comportement, *garder*, *simplifier*, *abandonner* ou *reporter*. Ce qui n'est pas arbitré
   n'existe pas.
4. **Concevoir** : données (client ou référence), contrat d'API, jobs du worker, commandes de la CLI,
   écrans.
5. **Tester d'abord** : cas de référence tirés de l'ancien comportement (même parcelle → même zone,
   mêmes règles, mêmes chiffres), tests unitaires du domaine, tests d'autorisation.
6. **Coder**, dans une PR par fonctionnalité.
7. **Recetter** sur les communes de référence (§ 6) : captures de l'ancien et du nouveau côte à côte,
   écarts chiffrés. Un écart est soit un bug, soit une décision consignée dans la fiche.
8. **Clore** : CI verte, seuil de couverture tenu, fiche mise à jour avec ses *écarts assumés*.

## 4. Les lots, dans l'ordre

Chaque lot livre une **tranche verticale** : quelque chose qu'un utilisateur peut faire de bout en
bout. Les tailles sont celles de l'ancien code ([`INVENTAIRE.md`](INVENTAIRE.md)) : un ordre de
grandeur, pas un devis. La vélocité se mesure sur L1, puis on projette.

| Lot | Ce que l'utilisateur sait faire à la fin | Dépend de | Ancien code |
|---|---|---|---|
| **L0 · Socle** | créer un compte, se connecter, se déconnecter ; stack de dev par worktree (§ 7 bis) | — | ~300 lignes + l'infrastructure |
| **L1 · Carte et parcellaire** | chercher une adresse, voir le cadastre, sélectionner des parcelles | L0 | 1 306 + carte partagée |
| **L2 · Étude** | enregistrer, retrouver, rouvrir une étude ; la consulter sur mobile | L1 | 1 818 |
| **L3 · Chaîne PLU et urbanisme** | voir la zone d'une parcelle, ses règles vérifiées et leurs citations, les documents, les OAP | L1, extracteur voisin | 5 563 front + 20 functions (6 623) |
| **L4 · Risques** | voir Géorisques, argiles, altimétrie, PPRI, poteaux incendie | L2 | 1 611 |
| **L5 · Foncier et marché** | voir les mutations DVF, les prix du neuf, Sitadel, les indices | L2 | 1 862 front + 5 functions (1 608) |
| **L6 · Estimation** | mener une estimation en 6 étapes jusqu'au dossier PDF | L5 | 6 690 front + 1 function (260) |
| **L7 · Faisabilité et résultats** | calculer l'enveloppe 3D, le bilan, les variantes, la synthèse | L3, L4, L5 | 5 712 |
| **L8 · Exports** | exporter en PDF, GeoPackage, Shapefile, CityJSON, LandXML, OBJ | L6, L7 | 7 385 |
| **L9 · Administration → CLI** | piloter la chaîne PLU et les modèles en ligne de commande | L3 | 3 564 + 2 functions (417) |
| Hors v1 · Volet agent | annonces, clients, mandats, fiche commerciale, profil professionnel — **non repris (D-12)** | — | 2 572 + 1 function (154) |
| Hors v1 · SaaS | onboarding, OAuth et SSO, organisations, facturation, e-mails | — | 916 |

S'y ajoutent **~12 000 lignes partagées** entre les pages (carte, hooks d'appel aux API,
utilitaires) : elles ne se réécrivent pas en tant que telles. Les hooks d'API disparaissent au profit
du client typé ; la carte est reconstruite en L1.

**Chemin critique** : L0 → L1 → L3 → L7 → L8.

**Remarques sur l'ordre :**
- **L1 et L2 démarrent tout de suite.** L3 attend l'extracteur déterministe de la session voisine
  (`claude/plui-extract`) : 19 des 21 échecs d'extraction mesurés le 29/09 disent
  `texte_pdf_indisponible` — la lecture du PDF est le goulet, pas le LLM.
- **L6 · Estimation est une partie clé, migrée et terminée** (décision du 29/09). Le parcours existe
  en 6 étapes (sélection, photos, marché, estimation, coûts, dossier). Ce qui reste à finir, dont une
  partie se règle avec le nouveau modèle de référence :
  - comparables sans nombre de pièces (le DVF du Cerema ne l'expose pas ; les mutations brutes le
    portent) ;
  - analyses à rayon fin dépendantes des sources vivantes (l'archive ne garde que des agrégats par
    commune ; `dvf_mutation` en PostGIS règle la question) ;
  - Sitadel pas encore branché (la source actuelle interroge les DPE neufs de l'ADEME) → L5 ;
  - photos cassées (bucket `agent-listings` inexistant, `getPublicUrl` sur bucket privé) → S3 et URL
    signées ;
  - drapeaux d'abonnement supprimés (v1 gratuite) ;
  - la suite côté agent (transformer en annonce, rentrer en mandat) n'est pas reprise (D-12).
- **L9 change de nature** : l'essentiel de l'écran d'administration devient des commandes de la CLI
  (`plu:extraire`, `commune:preparer`, `modeles:lister`…), que Claude pilote aussi par MCP.

## 5. Porter, réécrire, reprendre

| Ce qu'on fait | Quoi | Condition |
|---|---|---|
| **Porter** dans `packages/domain` | les 22 modules purs de `supabase/functions/_shared/` (citations, consensus, segmentation, file d'extraction, fraîcheur, DVF…), l'extracteur `plui-extract` de la session voisine, les utilitaires géométriques et les formats d'export déjà testés | relus ligne à ligne, **avec leurs tests** ; un module sans test se réécrit |
| **Réécrire** | tout accès aux données (110 `.from()`, 25 `functions.invoke`), les 21 fichiers qui appellent des API publiques depuis le navigateur, les 31 edge functions, les pages | selon la fiche arbitrée |
| **Reprendre tel quel** | les primitives shadcn/ui (4 754 lignes) | c'est du code de bibliothèque |

## 6. Recette : les communes de référence

La recette se joue toujours sur les mêmes territoires, pour comparer l'ancien et le nouveau :

- **Maisons-Alfort (94046)** — PLUi Paris Est Marne & Bois : ce sont les fixtures de l'extracteur
  voisin ;
- **Tours (37261)** — dont les couches PLU vides ont été corrigées le 28/09 (#71) ;
- **une petite commune en carte communale ou au RNU** — à choisir : le cas sans règlement.

## 7. Fini, c'est quoi

**Pour une fonctionnalité** : fiche arbitrée et à jour, tests écrits avant le code, CI verte, seuil
de couverture tenu, recette faite sur les communes de référence.

**Pour la v1** : L0 → L8 clos, L9 en CLI ; `docker compose up` rend une application
complète avec seed ; `master` déploie la production (les PR le visent) et `staging`, copie de `master` régulièrement reprise où l'on pré-fusionne les branches en cours, le serveur de staging ; sauvegarde nocturne et
test de restauration hebdomadaire au vert ; aucune référence à Supabase ni à la constellation dans le
dépôt.

## 7 bis. Une stack par worktree

Chaque copie de travail du dépôt (clone principal ou worktree git) démarre sa propre stack complète et
isolée, avec la même commande. Mécanisme repris de `castor.php` dans `windoo/saas`, porté en tâches
Node. Livré en L0.

| Au démarrage | Comment |
|---|---|
| Reconnaître un worktree | racine de la copie ≠ racine du dépôt principal (`git rev-parse`) |
| Isoler la stack | projet Compose nommé d'après le dossier : conteneurs et volumes séparés |
| Décaler les ports | `crc32(branche) % 400 + 5` ajouté au port de base de Postgres, Redis, MinIO, de l'API et du front ; `docker-compose.override.yaml` et `.env.local` générés, ignorés par git |
| Séparer les sessions | cookie de session suffixé par le worktree (un cookie ignore le port) |
| Remplir la base | seed déterministe depuis les fixtures des trois communes de référence, sans appel externe |
| Tester sans Internet | tests d'intégration sur la base du worktree, réponses des API publiques enregistrées |

- **Des agents en parallèle** : chacun code dans son worktree, avec sa base, ses ports et ses tests.
- **À terme, des instances éphémères** : la même commande démarre une stack sur une machine vierge
  (agent dans le cloud, environnement éphémère par branche), puisque rien ne dépend d'une base partagée ni
  d'un service externe.
- **Vigilance** : 400 décalages possibles ; le démarrage vérifie que ses ports sont libres et le dit
  clairement sinon.

## 8. Décisions prises

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
| D-08 | Fonds de carte chez IGN en accès direct, sous surveillance ; cartes des PDF et vignettes composées par le worker | un proxy de tuiles dès maintenant | aucune panne des tuiles de fond dans l'historique, contrairement aux API de données ; erreurs mesurées dans Sentry, proxy déclenché sur critère ; Leaflet conservé en L1 |
| D-09 | Une stack par worktree : ports déterministes par branche, seed par fixtures, tests sans Internet | une stack locale unique | faire coder des agents en parallèle, puis sur des instances éphémères |
| D-10 | PostgreSQL 18 (18.6), PostGIS 3.6, pgvector 0.8.5 | PostgreSQL 17 | dernière majeure, supportée jusqu'au 14/11/2030 ; images `postgis/postgis:18-3.6` et `pgvector/pgvector:0.8.5-pg18` disponibles |
| D-11 | Déploiement par branches : `master` → production, `staging` → serveur de staging ; environnements éphémères par branche dans un second temps | staging automatique et production sur tag | les PR visent `master` ; `staging` est une copie de `master` dans laquelle on pré-fusionne les branches en cours pour les essayer sur le serveur de staging, reprise régulièrement depuis `master` |
| D-12 | Volet agent non repris au départ : clients, annonces, mandats, rapprochement acquéreurs, fiche commerciale IA, profil professionnel (logo, agence) | le porter en v1 | un autre métier (la transaction), sans usage (tables vides) ; le mandat de vente pèse réglementairement (loi n° 70-9 du 2 janvier 1970, décret n° 72-678 du 20 juillet 1972), à instruire si on y revient |

Mesures du 29/09 : registre npm (`prisma` latest = 8.0.0-rc.19, stable 7.10.0 ; `drizzle-orm` 0.45.3 ;
`pg-boss` 12.35.0), historique git d'`ardha`.

## 9. Questions ouvertes

- **Propriété** : nom définitif du dépôt, organisation GitHub, comptes cloud au nom de l'entité qui
  portera le produit.
- **Hébergement** : à choisir en fin de L0 ; le compose tourne partout d'ici là.
- **Fonds de carte** : le seuil d'erreurs qui déclenche le proxy, à fixer après quelques semaines de
  mesure en usage réel.
- **Session voisine** : caler le format de sortie de `plui-extract` sur `reglement_segment`
  (conditionne L3).
- **Pour mémoire** : 5 études de l'ancienne base Lovable avaient été *différées* au transport du
  13/09 (FK vers des comptes pas encore recréés) ; aucune migration ne les a réinjectées depuis, et
  l'ancienne base a été supprimée le 27/09. Sans conséquence pour la réécriture, qui repart de zéro.

## Journal

- **29/09/2026** — plan créé ; inventaire mesuré sur `2a7f9a0` ; état de `bimtheon-core` relevé en
  lecture seule.
- **29/09/2026** — volet agent non repris (D-12), profil professionnel compris ; artefact en révision 6.
- **29/09/2026** — D-11 corrigée : les PR visent `master` ; `staging` = copie de `master` + branches pré-fusionnées.
- **29/09/2026** — déploiement par branches (D-11) ; branche par défaut du dépôt : `master` ; artefact en révision 5.
- **29/09/2026** — PostgreSQL 18 (D-10) ; modèle de l'étude marqué comme esquisse à itérer ; artefact en révision 4.
- **29/09/2026** — stack par worktree (§ 7 bis, D-09) ; artefact en révision 3, seconde moitié compactée.
- **29/09/2026** — décisions D-01 à D-08 consignées (§ 8) ; artefact en révision 2.
- **29/09/2026** — l'estimation entre dans la v1 (L6) ; lots renumérotés ; le volet agent passe
  hors v1, à arbitrer. Version présentable : artefact « Réécriture d'Ardha ».
