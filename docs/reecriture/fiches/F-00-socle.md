# F-00 · Socle : compte, connexion, coquille de l'application

> Lot : L0 · Statut : `recettée` (30/09/2026)
> Ancien code : `bimtheon-studio/ardha` @ `2a7f9a0` (export de `origin/main` le 30/09/2026)

## Ce que voit l'utilisateur

- **Déconnecté**, `/` affiche une page d'accueil minimale : logo, « Ardha », une phrase d'accroche et un
  bouton « Se connecter » vers `/auth` (`src/pages/Home.tsx:27-55`, `:292`).
- **`/auth`** : une carte unique qui bascule entre « Connexion » et « Inscription » par un lien (« Pas de
  compte ? S'inscrire »), champs e-mail et mot de passe (`src/pages/Auth.tsx:96-169`). Sur
  `*.bimtheon.com`, cet écran est remplacé par une redirection vers BIMtheon ID
  (`src/pages/Auth.tsx:36-45`, `:88-94`).
- **Connecté**, une coquille : barre latérale, en-tête, barre du bas sur mobile
  (`src/App.tsx:52-83`). Le menu de l'avatar (initiales tirées de l'e-mail) propose le profil,
  l'administration (admins) et « Se déconnecter » (`src/components/AppHeader.tsx:148-151`, `:285-354`).
- **Premier passage** : un parcours d'onboarding en 4 étapes (profil, métier foncier/immobilier,
  spécialité, récapitulatif) bloque l'accès tant qu'il n'est pas fini (`src/pages/Onboarding.tsx:14-19`,
  `src/components/RequireOnboarding.tsx:63-65`).
- **Route inconnue** : une page 404 en anglais (« Oops! Page not found ») (`src/pages/NotFound.tsx:14-24`).

Pas de capture : l'ancienne application tourne sur la constellation, la connexion y passe par
BIMtheon ID ; les écrans ci-dessus sont décrits depuis le code.

## Comportements

Arbitrage : `D-xx` quand une décision le tranche déjà ; `Qn` renvoie aux questions arbitrées le
30/09/2026 (fin de fiche).

| # | Comportement | Ancien code | Arbitrage | Note |
|---|---|---|---|---|
| 1 | Connexion par e-mail et mot de passe | `src/pages/Auth.tsx:60-70`, `src/hooks/useAuth.ts:82-86` | garder (D-02) | sessions en base, cookie `httpOnly` (feuille L0) |
| 2 | Inscription libre depuis l'écran de connexion (bascule connexion ↔ inscription) | `src/pages/Auth.tsx:24`, `:156-164` | garder : ouverte à tous (Q1) | l'accès réel était filtré ensuite par `core.acces_produit` (#12) |
| 3 | Mot de passe d'au moins 6 caractères, e-mail validé par zod | `src/pages/Auth.tsx:13-16`, `:129` | simplifier : 12 à 128 caractères, mots de passe courants refusés (Q2) | aucune longueur maximale, aucune liste de mots de passe courants |
| 4 | Confirmation de l'e-mail avant la première connexion | `src/pages/Auth.tsx:65-66`, `:80`, `src/hooks/useAuth.ts:89-93` | abandonner (feuille L0 : aucun e-mail en v1) | |
| 5 | Messages d'erreur en français : identifiants incorrects, e-mail déjà utilisé | `src/pages/Auth.tsx:63-77` | garder | « déjà utilisé » révèle qu'un compte existe : voir Q7 |
| 6 | Erreurs inconnues affichées brutes (`error.message` de Supabase, en anglais) | `src/pages/Auth.tsx:68`, `:77` | abandonner | message générique, détail dans les logs |
| 7 | Connecté qui ouvre `/auth` : renvoyé vers `/` | `src/pages/Auth.tsx:32-34` | garder | |
| 8 | Après connexion, retour à `/` — la page demandée (`state.from`) est **perdue** hors connexion centrale | `src/components/ProtectedRoute.tsx:149`, `src/pages/Auth.tsx:33` | corriger : retour à la page demandée (Q6) | bug de l'ancien code |
| 9 | Connexion centrale BIMtheon ID sur `*.bimtheon.com`, garde anti-boucle de 15 s | `src/lib/connexionCentrale.ts:19-60`, `src/pages/Auth.tsx:36-45` | abandonner (D-01) | |
| 10 | Session Supabase : JWT rafraîchi automatiquement, persisté en `localStorage` (ou cookie `.bimtheon.com` de 400 jours) | `src/integrations/supabase/client.ts:56-63`, `src/integrations/supabase/sessionPartagee.ts:29` | simplifier : sessions en base, cookie `httpOnly`, 30 jours glissants, 90 jours au plus (Q3) | pas d'expiration effective côté utilisateur |
| 11 | Rôles `user`, `admin`, `platform_admin`, hiérarchie `platform_admin ⊃ admin` | `src/hooks/useAuth.ts:25-35`, `supabase/functions/_shared/admin-auth` (test `src/utils/__tests__/adminAuth.test.ts:10-20`) | simplifier (PLAN §4 : rôle admin ou utilisateur) | `platform_admin` fusionne dans `admin` |
| 12 | Accès au produit refusé (`core.acces_produit = 'refuse'`) : écran « Votre compte n'a pas accès à Ardha », contact `support@bimtheon.com` | `src/components/ProtectedRoute.tsx:60-103`, `:152-154` | abandonner (D-01) ; remplacé par `user:deactivate` en CLI (Q5) | |
| 13 | Modules conditionnés à l'abonnement (`requiredFeature`), écran « n'est pas inclus dans votre abonnement » | `src/components/ProtectedRoute.tsx:20-58`, `:161-163`, `src/App.tsx:92-107` | abandonner (D-02 : v1 gratuite) | |
| 14 | Route réservée aux admins (`requireAdmin`), sinon écran d'accès refusé | `src/components/ProtectedRoute.tsx:155-160`, `src/App.tsx:108-112` | garder | l'écran d'admin lui-même devient la CLI (L9) |
| 15 | Garde de route : écran de chargement tant que session et droits ne sont pas résolus ; « pas encore résolu » n'est jamais « refusé » | `src/components/ProtectedRoute.tsx:142-146`, `src/hooks/useAuth.ts:105-106` | garder | |
| 16 | Aiguillage d'onboarding : tout utilisateur non admin sans profil complet est renvoyé vers `/onboarding` | `src/components/RequireOnboarding.tsx:21-68`, `src/hooks/useOnboardingStatus.ts:42-80` | abandonner (Q4) | le profil pro n'est pas repris (D-12) |
| 17 | Migration silencieuse des anciens comptes vers un profil déduit de l'abonnement | `src/hooks/useOnboardingStatus.ts:105-158` | abandonner (D-03) | |
| 18 | Profil « foncier » ou « immobilier » choisi à l'onboarding, qui oriente l'accueil (études ou estimations) | `src/pages/Onboarding.tsx:14-19`, `src/hooks/useOnboardingStatus.ts:9` | abandonner (Q4) | le nom est demandé, obligatoire, à l'inscription |
| 19 | Page d'accueil publique quand on est déconnecté | `src/pages/Home.tsx:27-55` | abandonner : `/` mène à la connexion (Q8) | |
| 20 | Coquille (barre latérale, en-tête) masquée sur les pages d'authentification | `src/App.tsx:52-69` | garder | |
| 21 | Menu de l'avatar : initiales tirées de l'e-mail, « Se déconnecter », lien d'administration | `src/components/AppHeader.tsx:114-156`, `:345-348` | garder ; « Profil » abandonné (D-12) | |
| 22 | Page 404 en anglais, `console.error` de la route | `src/pages/NotFound.tsx:1-27` | simplifier : en français, lien vers l'accueil | |
| 23 | Frontière d'erreur racine (« Une erreur est survenue », Réessayer / Recharger) et une par route | `src/main.tsx:10-39`, `src/App.tsx:59-65` | garder | |
| 24 | Pages chargées à la demande (`lazy`) sauf accueil et connexion | `src/App.tsx:21-44` | garder | technique |
| 25 | Utilisateur et événements `sign_in`, `sign_up`, `sign_out` envoyés à Sentry | `src/hooks/useAuth.ts:55-63`, `:94` | reporter (compte Sentry au nom du produit : question ouverte « Propriété » du PLAN) | les événements vont dans `journal_audit` en attendant |
| 26 | Mot de passe oublié, changement de mot de passe | absents de l'ancien code (aucun `resetPasswordForEmail` ni `updateUser` dans `src/`) | oublié : lien à usage unique créé par la CLI ; changement : reporter (Q9) | sans e-mail en v1 |
| 27 | Limitation des tentatives de connexion | déléguée à Supabase Auth, rien dans `src/` | garder : `@nestjs/throttler`, par IP et par e-mail (Q7) | |

## Règles métier

Aucune règle métier d'urbanisme dans ce lot. Règles de sécurité retenues ou proposées :

- mot de passe haché en **argon2id** (feuille L0) ; paramètres par défaut de la bibliothèque
  `@node-rs/argon2` ou recommandations OWASP (19 Mio, 2 itérations, parallélisme 1) ;
- cookie de session `httpOnly`, `SameSite=Lax`, `Secure` hors développement, nom suffixé par le
  worktree (D-09) ;
- le jeton de session n'est stocké en base que haché (SHA-256) : une fuite de la table `session` ne
  donne pas de sessions valides.

## Données

- **Sources externes** : aucune.
- **Lu / écrit** : `auth.users` (Supabase), `ardha.user_roles`, `ardha.agent_profiles`,
  `ardha.user_subscriptions`, `core.acces_produit` → `users`, `sessions`, `password_resets`, `audit_logs`
  (données client, PLAN §4).

## Cas limites et bugs connus

- La page demandée avant la connexion est perdue (#8).
- Un profil illisible (réseau, RLS) affiche une erreur au lieu de renvoyer vers l'onboarding
  (`src/components/RequireOnboarding.tsx:47-61`) : le principe « illisible n'est pas refusé » se garde.
- Les erreurs Supabase non prévues s'affichent en anglais (#6).
- Une adresse e-mail en majuscules crée-t-elle un second compte ? Supabase normalise en minuscules ; la
  réécriture doit le faire aussi (unicité sur l'e-mail normalisé).

## Tests existants

- `src/lib/__tests__/connexionCentrale.test.ts`, `src/integrations/supabase/sessionPartagee.test.ts`,
  `src/lib/__tests__/accesProduit.test.ts` : portent sur des comportements abandonnés (D-01), rien à
  porter.
- `src/utils/__tests__/adminAuth.test.ts` : hiérarchie des rôles et masquage des charges utiles d'audit ;
  la hiérarchie disparaît (#11), l'idée du masquage des secrets dans le journal se reprend.
- Aucun test de `Auth.tsx`, `useAuth.ts`, `ProtectedRoute.tsx`.

## Conception cible

- **Données** (client, `src/db/schema.ts`, migration `drizzle/0001_accounts.sql`) :
  `users` (e-mail normalisé unique, nom, hash argon2id — nul tant qu'un compte créé par la CLI
  n'a pas choisi son mot de passe —, rôle `admin` ou `user`, date de désactivation) ;
  `sessions` (empreinte SHA-256 du jeton, échéance glissante, échéance absolue, IP, agent) ;
  `password_resets` (empreinte, échéance, date d'utilisation) ; `audit_logs` (origine `api`, `cli`
  ou `worker`, acteur, action, cible, détails sans secret, IP).
- **Règles pures** (`src/domain`) : politique de mot de passe, normalisation de l'e-mail, échéances de
  session, lien de réinitialisation.
- **Contrat** (`src/contracts`) : `POST /api/auth/signup`, `POST /api/auth/login`,
  `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/password-reset`,
  `GET /api/health` ; document OpenAPI sur `GET /api/openapi.json`.
- **API** : toute route exige une session sauf `@Publique()` ; `@RoleRequis('admin')` pour les routes
  d'administration ; limiteur sur la connexion (IP et e-mail), l'inscription et la réinitialisation
  (IP) ; contrôle d'origine sur toute requête qui modifie.
- **Worker** : file `maintenance`, purge quotidienne (4 h, Europe/Paris) des sessions expirées et des
  liens périmés ou utilisés.
- **CLI** : `user:create-admin`, `user:reset-password`,
  `user:deactivate`, `user:reactivate`, `user:list`, `migrate`, `seed`.
- **Écrans** : `/login`, `/signup`, `/forgot-password`, `/reset-password#<jeton>`,
  accueil protégé dans la coquille (menu du compte, déconnexion), 404.

## Recette

Pas de commune de référence pour ce lot : la recette porte sur les parcours. Faite le 30/09/2026 dans
Chromium (headless), sur le clone principal (ports +0) **et**, en même temps, sur un worktree
`essai-worktree` (décalage +285, base, Redis, MinIO et cookie `ardha_session_ardha_essai` distincts) :

| Étape | Clone | Worktree |
|---|---|---|
| `/` sans session mène à `/login` | ✓ | ✓ |
| inscription : mot de passe trop court refusé avant l'envoi | ✓ | ✓ |
| inscription réussie, accueil « Bonjour Camille Recette » | ✓ | ✓ |
| session conservée au rechargement ; cookie `httpOnly`, `SameSite=Lax` | ✓ | ✓ |
| déconnexion par le menu du compte | ✓ | ✓ |
| mauvais mot de passe refusé, bon mot de passe accepté | ✓ | ✓ |
| 404 en français | ✓ | ✓ |
| administrateur créé par `user:create-admin`, mot de passe choisi par le lien, connexion | ✓ | ✓ |
| le lien ne sert qu'une fois | ✓ | ✓ |
| les comptes d'une stack sont invisibles depuis l'autre | ✓ | ✓ |

`ARDHA_PORT_OFFSET=0 pnpm start` depuis le worktree, pendant que le clone tourne : refus avec la liste
des ports pris et la commande pour en sortir, sans toucher à la configuration en place.

Aucun écart de comportement hors des écarts assumés ci-dessous.

## Écarts assumés

- Plus de confirmation d'e-mail (aucun e-mail en v1) : un compte est utilisable dès l'inscription.
- Minimum du mot de passe relevé de 6 à 12 caractères (Q2) ; un ancien mot de passe court reste
  saisissable à la connexion, la politique ne s'applique qu'aux nouveaux.
- Le nom est obligatoire à l'inscription ; les initiales de l'avatar viennent du nom, plus de l'e-mail.
- Plus d'onboarding, de profil foncier/immobilier, d'abonnement ni d'accès produit (Q4, D-01, D-02).
- `/` sans session mène à la connexion ; plus de page d'accueil publique (Q8).
- La page demandée est retrouvée après la connexion (Q6, corrige un bug).
- Le limiteur compte les tentatives de connexion, réussies comprises (DT-12).
- Une erreur imprévue n'affiche plus le message brut du serveur, en anglais, mais un message générique.
- Sentry reporté (question ouverte « Propriété ») ; les événements d'authentification vont dans
  `journal_audit`.

## Questions d'arbitrage

Posées au porteur du produit et arbitrées le 30/09/2026.

| Q | Question | Arbitrage |
|---|---|---|
| Q1 | Inscription ouverte à tous, ou comptes créés uniquement par un admin (CLI) ? | ouverte à tous ; pas d'interrupteur de fermeture tant qu'on n'en a pas besoin |
| Q2 | Règles de mot de passe | 12 caractères minimum, 128 maximum, aucune règle de composition, refus des mots de passe les plus courants |
| Q3 | Durée de session | 30 jours glissants (prolongée à chaque usage), 90 jours maximum |
| Q4 | Onboarding et profil foncier/immobilier | abandonner les deux ; le nom est demandé à l'inscription, obligatoire |
| Q5 | Désactiver un compte (remplace « accès refusé ») | commande CLI `user:deactivate`, qui coupe aussi ses sessions |
| Q6 | Retour à la page demandée après connexion | oui (corrige #8) |
| Q7 | Anti-force brute et énumération des comptes | `@nestjs/throttler` (module officiel de Nest), compteurs dans Redis : 5 échecs par e-mail et par IP en 15 min puis attente ; « e-mail déjà utilisé » gardé à l'inscription |
| Q8 | Page d'accueil publique quand on est déconnecté | non : `/` renvoie directement vers la connexion |
| Q9 | Mot de passe oublié, changement de mot de passe | oublié : la CLI génère un lien à usage unique (24 h) que l'admin transmet ; changement depuis le menu du compte : reporter |
