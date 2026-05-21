# Opérations sensibles — manuel pas à pas

*Ce document décrit ce qu'il faut faire, et dans quel ordre, pour toute opération de maintenance qui peut casser une partie de la plateforme si elle est faite à moitié. Lisez la section concernée du début à la fin avant d'agir, et faites les étapes dans l'ordre indiqué. Cinq minutes de lecture peuvent éviter plusieurs heures de réparation.*

---

## Table des matières

1. [Principe général à retenir](#1-principe-général-à-retenir)
2. [Avant toute opération sensible](#2-avant-toute-opération-sensible)
3. [Changer le mot de passe de la base de données](#3-changer-le-mot-de-passe-de-la-base-de-données)
4. [Régénérer la clé de service Supabase](#4-régénérer-la-clé-de-service-supabase)
5. [Changer le nom de domaine de l'application](#5-changer-le-nom-de-domaine-de-lapplication)
6. [Régénérer la clé JWT](#6-régénérer-la-clé-jwt)
7. [Migrer la plateforme vers un autre compte Supabase](#7-migrer-la-plateforme-vers-un-autre-compte-supabase)
8. [Modifier les variables d'environnement Render ou Netlify](#8-modifier-les-variables-denvironnement-render-ou-netlify)
9. [Désactiver, supprimer ou modifier un utilisateur ou un investisseur](#9-désactiver-supprimer-ou-modifier-un-utilisateur-ou-un-investisseur)
10. [Déployer une modification du code](#10-déployer-une-modification-du-code)
11. [Annuler un déploiement défaillant](#11-annuler-un-déploiement-défaillant)
12. [Restaurer une sauvegarde après un incident](#12-restaurer-une-sauvegarde-après-un-incident)
13. [Modifier la planification des sauvegardes automatiques](#13-modifier-la-planification-des-sauvegardes-automatiques)
14. [Quand tout est cassé et qu'on ne sait plus par où commencer](#14-quand-tout-est-cassé-et-quon-ne-sait-plus-par-où-commencer)

---

## 1. Principe général à retenir

La plateforme Valmere & Co repose sur plusieurs services qui se parlent entre eux : le frontend hébergé chez Netlify, le backend hébergé chez Render, la base de données et le stockage chez Supabase, et le système de sauvegardes hébergé chez GitHub Actions. Ces services ne se connaissent pas directement — chacun connaît son voisin par une URL et un mot de passe ou une clé d'API qu'on appelle des secrets ou des variables d'environnement.

Le principe fondamental à retenir est qu'**un secret existe toujours en plusieurs endroits**. Le mot de passe de la base de données Supabase, par exemple, est connu de Supabase évidemment, mais aussi de Render qui s'en sert pour se connecter, et aussi de GitHub Actions qui s'en sert pour faire les sauvegardes. Le jour où vous changez ce mot de passe sur Supabase, vous devez **immédiatement après** le mettre à jour partout ailleurs, sans quoi tous les services qui dépendaient de l'ancien mot de passe vont commencer à échouer, parfois silencieusement.

C'est pour cette raison que ce document existe : pour vous donner, pour chaque opération sensible, la liste exhaustive des endroits qu'il faut mettre à jour en parallèle, dans l'ordre qui minimise les interruptions de service.

---

## 2. Avant toute opération sensible

Avant de toucher à quoi que ce soit, prenez le réflexe de **déclencher une sauvegarde manuelle** sur GitHub Actions. C'est l'opération la plus simple au monde et elle vous donne un filet de sécurité immédiat.

Ouvrez votre navigateur sur `https://github.com/Valmere/Project/actions`, cliquez sur « Sauvegarde Valmere » dans la liste des workflows à gauche, puis sur **Run workflow** en haut à droite. Choisissez le mode `daily` (peu importe lequel en fait, mais celui-ci est le plus rapide) et cliquez sur le bouton vert. Au bout de deux à trois minutes, un nouvel artifact est créé. Téléchargez-le et conservez-le quelque part de sûr (par exemple sur votre propre Google Drive personnel, ou un disque externe). C'est votre point de retour en arrière au cas où l'opération suivante tournerait mal.

Cette précaution prend cinq minutes et a sauvé des plateformes entières de situations dramatiques. Ne la zappez jamais, même si vous êtes pressé.

---

## 3. Changer le mot de passe de la base de données

C'est l'opération la plus fréquente parmi celles qui nécessitent de la coordination. On change le mot de passe de la base soit parce qu'il a fuité (quelqu'un l'a vu par accident), soit pour une rotation périodique de sécurité (recommandée tous les six à douze mois).

Le mot de passe est connu à quatre endroits : Supabase lui-même (qui le génère et le valide), Render (qui s'en sert pour que le backend se connecte), GitHub Actions (qui s'en sert pour faire les sauvegardes), et éventuellement votre fichier `backend/.env` local sur votre ordinateur si vous testez l'application en développement.

**Étape 1**. Connectez-vous à Supabase, ouvrez le projet Valmere, allez dans **Project Settings → Database**, et trouvez la section **Database Password**. Cliquez sur **Reset database password**, choisissez un nouveau mot de passe **fort sans caractères spéciaux problématiques** (uniquement des lettres, des chiffres et éventuellement les caractères `!`, `_`, `-`, `.`), et validez. **Copiez immédiatement ce nouveau mot de passe dans un endroit sûr** — vous ne pourrez plus jamais le voir après. Notez aussi qu'à partir de cet instant, le backend Render et le système de sauvegardes ne peuvent plus se connecter à la base : la plateforme entre dans une courte fenêtre d'indisponibilité que vous devez fermer le plus vite possible.

**Étape 2**. Sans attendre, allez sur Render, ouvrez le service `valmere-api`, onglet **Environment**. Modifiez la variable `DATABASE_URL` en remplaçant l'ancien mot de passe par le nouveau dans la chaîne de connexion. Faites la même chose pour `DIRECT_URL`. Attention : si le nouveau mot de passe contient un caractère spécial comme `@`, il faut le remplacer par `%40` dans la chaîne de connexion URL — c'est ce qu'on appelle l'encodage URL. Pour cette raison, on recommande de choisir un mot de passe sans `@` pour éviter cette complication. Cliquez sur **Save Changes**. Render redéploie automatiquement le backend avec les nouvelles variables, ce qui prend environ trois minutes. À la fin du redéploiement, la plateforme refonctionne.

**Étape 3**. Allez sur GitHub, dépôt Valmere/Project, onglet **Settings → Secrets and variables → Actions**. Modifiez le secret `DB_PASSWORD` en y collant le nouveau mot de passe (tel quel, **sans** encodage URL — GitHub Actions gère ça lui-même). Sauvegardez. La prochaine sauvegarde planifiée (cette nuit) utilisera la nouvelle credential et tout continuera comme avant.

**Étape 4**, optionnelle. Si vous travaillez encore sur l'application en local sur votre ordinateur, ouvrez `backend/.env` et mettez à jour `DATABASE_URL` et `DIRECT_URL` de la même façon.

**Vérification**. Ouvrez `https://valmere-co.netlify.app` dans votre navigateur, connectez-vous avec un compte existant. Si vous arrivez sur le dashboard et que vous voyez vos chiffres habituels, c'est que la connexion Render → Supabase fonctionne. Pour vérifier que la sauvegarde fonctionne aussi, déclenchez manuellement le workflow GitHub Actions en mode `daily` et vérifiez qu'il se termine sur une coche verte au bout de trois minutes.

**Si quelque chose ne va pas**. Si l'application affiche une erreur 500 ou une erreur de connexion à la base, c'est probablement que la chaîne de connexion Render n'est pas correcte. Allez dans Render, onglet **Logs**, et cherchez une ligne avec « authentication failed » ou « password » : elle vous dira exactement ce qui ne va pas. Le plus souvent c'est un caractère spécial mal encodé ou une espace en trop.

---

## 4. Régénérer la clé de service Supabase

La clé service de Supabase est ce qui permet au backend d'écrire et de lire dans Supabase Storage (uploader le logo, télécharger les rapports). Elle est plus rarement changée que le mot de passe DB, mais on peut être amené à la régénérer si elle fuite ou si on veut couper l'accès à un ancien collaborateur.

Cette clé est connue à trois endroits : Supabase qui la génère, Render qui s'en sert pour le backend, et GitHub Actions qui s'en sert pour télécharger les fichiers Storage lors des sauvegardes.

**Étape 1**. Sur Supabase, ouvrez le projet, allez dans **Project Settings → API Keys**. Trouvez la clé `service_role` (à ne pas confondre avec `anon` qui est la clé publique). Cliquez sur les trois points à côté et choisissez **Reveal** pour la voir, ou **Regenerate** pour en générer une nouvelle. Si vous régénérez, l'ancienne devient immédiatement invalide et la plateforme ne peut plus accéder au Storage.

**Étape 2**. Sur Render, modifiez la variable `SUPABASE_SERVICE_KEY` avec la nouvelle valeur. Sauvegardez. Le backend redéploie.

**Étape 3**. Sur GitHub, modifiez le secret `SUPABASE_SERVICE_KEY` avec la nouvelle valeur.

**Vérification**. Tentez d'uploader un nouveau logo depuis l'interface Paramètres de l'application. Si ça marche, c'est que Render parle correctement à Supabase Storage. Déclenchez un backup manuel pour vérifier que GitHub Actions parle aussi correctement à Supabase Storage.

---

## 5. Changer le nom de domaine de l'application

C'est l'opération la plus délicate des opérations courantes, parce qu'elle touche à la sécurité du système d'authentification et qu'elle a une conséquence inévitable sur les utilisateurs qui utilisent la biométrie.

Le nom de domaine actuel est `https://valmere-co.netlify.app`. Si vous voulez le remplacer par exemple par `https://portail.valmere.com` (un vrai nom de domaine acheté chez un registrar), voici tout ce qui doit changer en cohérence.

**Étape 1**. Achetez et configurez le nouveau nom de domaine. Sur Netlify, allez dans **Site settings → Domain management** et ajoutez le nouveau domaine custom. Netlify vous indique quelles entrées DNS configurer chez votre registrar (Namecheap, GoDaddy, OVH, etc.). Une fois les DNS propagés (de quelques minutes à 48 heures), le certificat HTTPS Let's Encrypt se génère automatiquement et le site devient accessible à la nouvelle URL.

**Étape 2**. Sur Render, ouvrez `valmere-api` puis **Environment**. Modifiez ces trois variables :

- `CORS_ORIGINS` : remplacez l'ancienne URL par la nouvelle, exactement avec `https://` et **sans slash final**.
- `WEBAUTHN_RP_ID` : remplacez par le nouveau domaine **sans** `https://` ni slash. Par exemple `portail.valmere.com`.
- `WEBAUTHN_ORIGIN` : remplacez par la nouvelle URL complète avec `https://`, sans slash final.

Sauvegardez. Render redéploie.

**Étape 3**. Sur Netlify, allez dans **Site settings → Environment variables**. La variable `VITE_API_URL` reste inchangée si l'URL du backend Render ne change pas. Mais déclenchez quand même un nouveau déploiement (onglet Deploys → bouton **Trigger deploy → Deploy site**) pour que le frontend reconstruise avec le nouveau contexte.

**Étape 4**. Mettez à jour le fichier `frontend/index.html` pour que les balises Open Graph (le preview de partage social) pointent vers la nouvelle URL. Cherchez toutes les occurrences de l'ancien domaine et remplacez-les par le nouveau. Committez et poussez sur GitHub : Netlify redéploie automatiquement.

**Étape 5**. Sur UptimeRobot, si vous avez configuré le monitor avec le domaine Netlify direct, vous pouvez changer l'URL surveillée pour pointer vers le nouveau domaine, mais ce n'est pas obligatoire — surveiller `valmere-api.onrender.com` reste valide.

**Conséquence importante pour les utilisateurs**. La biométrie WebAuthn est cryptographiquement liée au domaine. **Tous les utilisateurs qui avaient activé la biométrie sur l'ancien domaine devront la réactiver sur le nouveau**. Concrètement, à leur prochaine tentative de connexion biométrique, ça ne marchera pas. Ils devront se connecter avec leur email et mot de passe, puis aller dans Mon compte et ré-enregistrer leur biométrie. Prévenez-les par email avant le changement pour qu'ils ne soient pas pris au dépourvu.

**Vérification**. Ouvrez la nouvelle URL dans une fenêtre de navigation privée. Connectez-vous. Si le dashboard s'affiche et que les chiffres sont là, le chemin frontend → backend fonctionne. Ouvrez les DevTools (F12) et regardez l'onglet Network : aucune requête ne doit avoir un statut CORS rouge.

---

## 6. Régénérer la clé JWT

La clé JWT (`SECRET_KEY` dans les variables d'environnement Render) sert à signer les jetons de session des utilisateurs connectés. Quand vous la régénérez, **tous les utilisateurs actuellement connectés sont déconnectés instantanément** et devront se reconnecter avec leur mot de passe.

On ne régénère cette clé que dans deux situations : soit la clé a fuité (publication accidentelle sur GitHub, partage involontaire), soit on veut forcer une déconnexion massive (par exemple suite à un incident de sécurité).

**Étape 1**. Générez une nouvelle clé aléatoire forte. Sur votre ordinateur, ouvrez un terminal Python et exécutez `python -c "import secrets; print(secrets.token_urlsafe(64))"`. Ça produit une chaîne aléatoire d'environ 86 caractères. Copiez-la.

**Étape 2**. Sur Render, modifiez la variable `SECRET_KEY` avec la nouvelle valeur. Sauvegardez. Render redéploie. À cet instant précis, tous les jetons émis sous l'ancienne clé deviennent invalides.

**Étape 3**. Avertissez les utilisateurs qu'ils vont devoir se reconnecter, soit avant l'opération, soit immédiatement après. Pour les comptes qui utilisent la biométrie, elle continuera de fonctionner sans accroc (la biométrie ne dépend pas de la clé JWT).

**Vérification**. Aucune vérification particulière — si la plateforme tourne et que les nouveaux logins fonctionnent, c'est gagné.

---

## 7. Migrer la plateforme vers un autre compte Supabase

C'est une opération lourde mais qui peut être nécessaire en cas de changement d'organisation, de fusion d'entreprise, ou simplement pour passer d'un compte personnel à un compte entreprise (ce qui a été fait au moment du déploiement initial).

La procédure générale est la suivante. Vous créez un nouveau projet Supabase dans le nouveau compte. Vous faites un export complet de l'ancienne base avec `pg_dump`. Vous importez l'export dans la nouvelle base avec `psql`. Vous recréez manuellement les buckets Storage dans le nouveau projet. Vous re-uploadez les fichiers Storage (logo, signatures, rapports) depuis votre dernière sauvegarde GitHub Actions. Vous mettez à jour toutes les variables d'environnement Render et tous les secrets GitHub pour pointer vers le nouveau projet. Vous redémarrez Render et vérifiez que tout fonctionne.

Cette procédure a été effectuée en détail lors de la mise en service initiale de la plateforme. Si vous devez la refaire, demandez à votre prestataire technique de vous guider, car les détails importent (encodage des mots de passe dans les URLs, choix entre direct connection et session pooler, version de PostgreSQL côté client). C'est typiquement une opération qui se planifie sur une demi-journée pour pouvoir tester sereinement.

---

## 8. Modifier les variables d'environnement Render ou Netlify

C'est une opération courante et peu risquée en soi, mais qui peut avoir des effets de bord si on touche à la mauvaise variable.

**Sur Render**, ouvrez le service `valmere-api`, onglet **Environment**. Vous voyez la liste de toutes les variables. Pour en modifier une, cliquez sur l'icône crayon, changez la valeur, validez. Pour en ajouter une nouvelle, cliquez sur **Add Environment Variable**. Quand vous cliquez sur **Save Changes**, **Render redéploie automatiquement le service**, ce qui prend environ trois minutes pendant lesquelles l'API est momentanément indisponible.

**Sur Netlify**, ouvrez le site, allez dans **Site settings → Environment variables**. Là aussi, vous pouvez modifier ou ajouter. **Attention** : contrairement à Render, Netlify **ne redéploie pas automatiquement** quand vous changez une variable. Vous devez aller dans l'onglet **Deploys** et cliquer sur **Trigger deploy → Deploy site** pour que le nouveau frontend soit construit avec les nouvelles valeurs.

**Les variables à ne jamais toucher sans raison sérieuse** sont celles qui touchent à la base de données (`DATABASE_URL`, `DIRECT_URL`), à l'authentification (`SECRET_KEY`, `ALGORITHM`), et aux URLs (`CORS_ORIGINS`, `WEBAUTHN_*`). Les autres (durée de session, nom de bucket, etc.) sont des paramètres de confort qu'on peut ajuster plus tranquillement.

Avant chaque modification, **prenez une capture d'écran de la valeur actuelle** (avec le crayon, vous pouvez la révéler temporairement). Comme ça, si la modification casse quelque chose, vous pouvez remettre l'ancienne valeur sans avoir à la chercher.

---

## 9. Désactiver, supprimer ou modifier un utilisateur ou un investisseur

Ces opérations se font depuis l'interface administrateur de la plateforme, sans toucher au code ni aux variables. Elles ont cependant des conséquences à comprendre.

**Désactiver un investisseur** le marque comme inactif. Ses biens sont alors considérés comme liquides (transférés au compte société), et il est exclu des calculs de parts et de distribution. Mais son historique reste consultable et il peut être réactivé plus tard, soit en restaurant tout son historique, soit en repartant à zéro. **C'est l'option à privilégier quand un investisseur quitte temporairement la plateforme**, car elle est complètement réversible.

**Supprimer définitivement un investisseur** est une action lourde qui efface ses transactions, ses portefeuilles, ses rapports, et son lien avec son compte utilisateur. Côté admin, l'action est immédiate. Côté caissier, elle passe en file d'approbation et l'admin doit valider. Cette suppression est **irréversible** sauf via restauration de sauvegarde. Ne l'utilisez que quand vous êtes absolument certain qu'il ne faut plus revenir en arrière, typiquement pour purger des données de test ou pour une clôture définitive de relation.

**Le compte société Valmere & Co** ne peut pas être supprimé : le système le bloque automatiquement. Si vous essayez, vous recevez un message d'erreur.

**Désactiver un utilisateur** (par exemple un caissier qui a quitté l'entreprise) le bloque immédiatement à la connexion. Son historique d'actions reste tracé dans les logs d'audit. C'est l'opération recommandée plutôt que la suppression : vous gardez la trace de qui a fait quoi.

**Supprimer un utilisateur** efface le compte de connexion. Si le compte était lié à un investisseur, l'investisseur reste intact, juste sans accès web. Vous pouvez recréer un nouveau compte utilisateur et le relier au même investisseur plus tard.

Avant toute suppression définitive d'un investisseur, **déclenchez une sauvegarde manuelle** (voir section 2). Si vous changez d'avis dans les heures qui suivent, vous pourrez restaurer.

---

## 10. Déployer une modification du code

C'est l'opération la plus fréquente quand vous évoluez la plateforme. Elle est simple en théorie mais elle peut casser la production si on est négligent.

**Avant de pousser**, testez en local sur votre ordinateur. Lancez le backend avec `uvicorn app.main:app --reload`, le frontend avec `npm run dev`, et naviguez dans l'application. Cliquez sur les fonctionnalités que vous avez modifiées, mais aussi sur celles que vous n'avez pas modifiées : il arrive qu'une modification ait des effets de bord inattendus ailleurs.

Si vous avez ajouté ou modifié des dépendances Python, mettez à jour `backend/requirements.txt`. Si vous avez ajouté ou modifié des dépendances JavaScript, le fichier `frontend/package.json` est mis à jour automatiquement par `npm install`. Vérifiez avec `git status` que ces fichiers sont bien dans votre commit.

Si vous avez modifié la structure de la base (ajout de colonne, nouvelle table), créez une migration Alembic avec `alembic revision -m "description"` et écrivez le code de migration. Testez la migration en local avec `alembic upgrade head` avant de pousser. Sans migration, le backend ne pourra pas démarrer en production parce que la base et le code ne seront pas en phase.

Une fois tout testé, faites `git add`, `git commit` avec un message qui explique ce que vous avez changé (pas juste « update » mais quelque chose comme « ajoute le champ téléphone optionnel sur les investisseurs »), et `git push origin main`. Render et Netlify détectent le push et lancent automatiquement leurs builds. Surveillez les logs : sur Render, onglet Events puis Logs ; sur Netlify, onglet Deploys.

Une fois les deux déploiements terminés (statut « Live » sur Render, « Published » sur Netlify), ouvrez l'application en navigation privée et vérifiez immédiatement que la fonctionnalité que vous avez modifiée fonctionne en production. Si oui, vous avez gagné. Si non, lisez la section suivante.

---

## 11. Annuler un déploiement défaillant

Si après un push, l'application ne marche plus correctement, **vous pouvez revenir en arrière en une minute** sans avoir à comprendre ce qui ne va pas. C'est l'avantage majeur d'avoir un système de déploiement automatique : il garde l'historique de tous les déploiements précédents.

**Sur Render**, allez dans le service `valmere-api`, onglet **Events**. Vous voyez la liste de tous les déploiements, avec leur statut. Trouvez le dernier qui était marqué « Live » avant la cassure (généralement l'avant-dernier de la liste). Cliquez dessus, puis sur **Rollback to this deploy**. En quelques secondes, le service revient sur l'ancienne version du code et fonctionne à nouveau.

**Sur Netlify**, allez dans le site, onglet **Deploys**. Vous voyez la liste avec les statuts. Trouvez le dernier « Published » fonctionnel, cliquez dessus, puis sur **Publish deploy** en haut à droite. Le frontend redevient celui d'avant.

Une fois le rollback effectué, vous pouvez tranquillement corriger votre code en local, le tester à fond, et le repousser. La pression est retombée.

---

## 12. Restaurer une sauvegarde après un incident

C'est la procédure de dernier recours quand une donnée importante a été perdue ou corrompue, et que personne ne s'en est aperçu à temps pour utiliser les sauvegardes Supabase de la dernière semaine.

**Étape 1**. Identifiez la sauvegarde que vous voulez restaurer. Allez sur GitHub, onglet Actions, workflow « Sauvegarde Valmere ». Parcourez les exécutions des derniers jours ou semaines. Pour les sauvegardes mensuelles, passez par l'onglet **Releases** qui les liste explicitement. Trouvez celle qui est antérieure à l'incident, téléchargez l'artifact ZIP, et extrayez-le sur votre ordinateur. Vous obtenez un fichier SQL et un dossier `storage/`.

**Étape 2**. Décidez où restaurer. **Ne restaurez jamais directement sur la production** sans avoir testé d'abord. Créez un nouveau projet Supabase de test (gratuit), notez son mot de passe et son URL, et restaurez-y le dump SQL avec `psql -h NOUVEL_HOTE -p 5432 -U NOUVEL_USER -d postgres -f valmere_db_DATE.sql`. Connectez l'application à ce projet de test (en modifiant temporairement `DATABASE_URL` sur Render, ou en lançant un backend local pointé vers ce projet). Vérifiez visuellement que les données restaurées sont celles que vous attendiez.

**Étape 3**. Si la restauration de test est concluante, vous pouvez passer en production. Idéalement, faites cette opération à un moment de faible activité (tôt le matin, le week-end). Sur Supabase, vous avez le choix entre restaurer dans le projet de production existant (qui écrase les données actuelles) ou basculer définitivement vers le projet de test (qui devient la nouvelle production). La seconde option est plus sûre car elle préserve les données actuelles dans l'ancien projet, qui peut servir de référence si besoin.

**Étape 4**. Une fois la production sur la nouvelle base restaurée, redémarrez le backend Render, re-uploadez les fichiers Storage (logos, rapports) depuis le dossier `storage/` de la sauvegarde, et informez les utilisateurs que leurs données ont été restaurées à telle date.

Cette procédure est lourde, c'est pourquoi on évite d'avoir à la déclencher. Le mieux est de détecter les anomalies rapidement (idéalement dans les sept jours qui permettent d'utiliser les sauvegardes natives Supabase plus rapides à restaurer).

---

## 13. Modifier la planification des sauvegardes automatiques

Les horaires actuels sont définis dans le fichier `.github/workflows/backup.yml`, dans la section `schedule`. Trois expressions cron y sont écrites : une pour la sauvegarde quotidienne, une pour l'hebdomadaire, une pour la mensuelle.

Le format cron a cinq champs : `minute heure jour-du-mois mois jour-de-la-semaine`. Par exemple `0 3 * * *` signifie « tous les jours à 03h00 ». L'étoile veut dire « toutes les valeurs ». Les heures sont exprimées en UTC, donc pour traduire en heure d'Haïti, ajoutez quatre heures à l'heure UTC pour obtenir l'heure locale (ou retirez quatre heures à l'heure locale pour obtenir l'UTC).

Pour modifier l'horaire, deux options. Vous pouvez ouvrir le fichier en local dans votre éditeur, modifier les expressions, committer et pousser. Ou vous pouvez aller directement sur GitHub à l'adresse `https://github.com/Valmere/Project/blob/main/.github/workflows/backup.yml`, cliquer sur le crayon en haut à droite, modifier dans le navigateur, et cliquer sur **Commit changes**. La seconde méthode ne demande aucune installation locale.

Le changement est pris en compte au prochain cycle. Si vous mettez `0 5 * * *` (5h UTC, soit 1h heure d'Haïti) à 22h UTC un soir, la prochaine exécution aura lieu le lendemain à 5h UTC. Si vous le mettez avant 5h UTC le même jour, l'exécution se fera dans les heures qui suivent.

GitHub Actions garantit l'exécution dans les 15 minutes qui suivent l'heure programmée, mais pas à la seconde près. C'est normal.

---

## 14. Quand tout est cassé et qu'on ne sait plus par où commencer

Il arrive parfois qu'une succession de manipulations laisse la plateforme dans un état où plus rien ne marche et où on ne sait plus quelle est la cause originelle. Dans ce cas, ne paniquez pas et suivez cette démarche systématique.

D'abord, **isolez le problème**. Ouvrez `https://valmere-api.onrender.com/health` dans votre navigateur. Si vous voyez `{"status": "ok"}`, l'API tourne et le problème est plus haut (frontend, navigateur, DNS). Sinon, le problème est dans l'API ou dans la base.

Ensuite, **regardez les logs**. Sur Render, ouvrez le service `valmere-api`, onglet **Logs**. Faites défiler jusqu'aux dernières lignes. Cherchez un mot en rouge ou une exception Python (ligne commençant par « Traceback »). La première ligne de l'exception vous donne presque toujours la cause précise.

Ensuite, **vérifiez les variables d'environnement**. Allez dans **Environment** et passez en revue chaque variable. Souvenez-vous des dernières que vous avez modifiées et vérifiez qu'il n'y a pas un caractère en trop, un slash final oublié, ou une faute de frappe.

Si vous ne trouvez toujours pas, **rollback au dernier état connu fonctionnel** (voir section 11). Render et Netlify gardent l'historique de tous les déploiements précédents. En revenant à un déploiement antérieur, vous savez au moins que vous êtes sur une version qui marchait.

Si même le rollback ne suffit pas, c'est probablement que le problème vient de la base de données (Supabase down, mot de passe changé sans propagation, données corrompues). Connectez-vous à Supabase et vérifiez que le projet est bien actif et que la base répond. Vérifiez la chaîne de connexion sur Render. Si vous suspectez une corruption de données, envisagez de restaurer une sauvegarde (voir section 12).

En dernier recours, **demandez de l'aide**. Une plateforme financière n'a pas vocation à être réparée seul dans la panique. Documentez ce qui s'est passé (captures d'écran des erreurs, dernières modifications effectuées), faites une sauvegarde manuelle de l'état actuel pour pouvoir y revenir, et contactez votre prestataire technique ou un développeur de confiance. Une heure de prestation extérieure vaut mieux qu'une journée d'essais qui aggravent la situation.

---

*Ce document est fait pour être consulté au moment où vous allez effectuer une opération sensible, pas en lecture continue. Marquez-le en favori dans votre navigateur. Le jour où vous devrez l'utiliser, vous serez content d'avoir la procédure précise sous les yeux plutôt que d'improviser.*
