# Guide technique — Portail Investisseur Valmere & Co

*Document de transfert à destination de l'administrateur principal et de toute personne qui sera amenée à maintenir la plateforme.*

Ce guide n'est pas un manuel utilisateur. Il décrit ce qu'est la plateforme, comment elle a été construite, où elle vit, comment elle se comporte au quotidien, et que faire quand quelque chose tourne mal. Il est rédigé en supposant que la personne qui le lit a une culture informatique générale mais ne connaît pas encore ce projet.

---

## 1. Vue d'ensemble

Le Portail Investisseur est l'outil informatique de Valmere & Co qui sert à trois choses : tenir à jour la situation comptable de chaque investisseur, distribuer les profits et pertes périodiquement entre la société et les investisseurs, et donner à chaque investisseur un accès web personnel et sécurisé à ses propres chiffres. Tout ce qui transite par la plateforme est enregistré, daté, et conservé pour des raisons d'audit.

Concrètement, un utilisateur peut être l'une des trois choses suivantes : un administrateur, un caissier, ou un investisseur. L'administrateur peut tout faire. Le caissier peut faire beaucoup de choses mais ses actions sensibles passent par une file d'attente avant que l'administrateur ne les valide ou les rejette. L'investisseur ne voit que ses propres données et ne peut rien modifier.

La plateforme gère trois monnaies (gourde haïtienne, dollar américain, euro) et trois langues d'interface (français, anglais, espagnol). Une opération enregistrée en dollars un jour donné garde **pour toujours** le taux de change qui s'appliquait ce jour-là — ce qui veut dire que même si le taux du dollar change demain, les montants déjà inscrits dans le journal comptable ne bougent pas. C'est une exigence d'audit.

---

## 2. Là où la plateforme vit

L'application accessible aux utilisateurs est servie depuis Netlify, qui distribue le frontend (l'interface visible dans le navigateur) à travers son réseau mondial. L'adresse publique est `https://valmere-co.netlify.app`. C'est l'URL que vous donnez aux investisseurs.

Derrière ce frontend, il y a une API hébergée sur Render, qui s'occupe de toute la logique métier (les calculs de P&L, les écritures comptables, l'authentification, la génération des rapports). On peut y accéder directement à `https://valmere-api.onrender.com` mais il n'y a aucune raison pour un utilisateur normal de le faire. Si vous voulez voir la liste de toutes les routes disponibles, vous pouvez ajouter `/docs` à cette URL : Swagger s'affiche et liste tout.

La base de données et le stockage de fichiers sont chez Supabase. C'est là que sont conservés les investisseurs, les transactions, les écritures comptables, les utilisateurs, ainsi que les logos et les PDF de rapports. Le code source de l'ensemble du projet vit sur GitHub dans le repo `Valmere/Project`, repo privé visible uniquement par les membres de l'organisation GitHub Valmere.

| Élément | Adresse |
|---|---|
| Application publique | https://valmere-co.netlify.app |
| API backend | https://valmere-api.onrender.com |
| Documentation interactive de l'API | https://valmere-api.onrender.com/docs |
| Endpoint de santé (pour le monitoring) | https://valmere-api.onrender.com/health |
| Code source | https://github.com/Valmere/Project |
| Tableau de bord Render | https://dashboard.render.com (service : `valmere-api`) |
| Tableau de bord Netlify | https://app.netlify.com (site : `valmere-co`) |
| Tableau de bord Supabase | https://supabase.com/dashboard (projet : `Valmere`, identifiant `igzcwqmuwuxdysqftomc`) |
| Monitoring | https://uptimerobot.com (compte : `valmere`) |

---

## 3. Comment l'ensemble communique

Quand un investisseur tape l'adresse de l'application dans son navigateur, son téléphone ou son ordinateur va chercher le code du site sur Netlify, qui le lui envoie en quelques dizaines de millisecondes. À ce stade, l'utilisateur voit la page de connexion mais il n'a encore rien fait sur la base de données.

Au moment où il clique sur « Se connecter », son navigateur envoie une requête vers Render. Render exécute le code Python qui consulte la base Supabase pour vérifier l'identifiant et le mot de passe. Si tout va bien, Render renvoie un jeton de session (un JWT) que le navigateur garde et qu'il utilise pour toutes les requêtes suivantes pendant huit heures.

À partir de là, chaque action dans l'application (consulter le tableau de bord, charger les transactions, télécharger un rapport) suit le même chemin : navigateur → Render → Supabase → Render → navigateur. Le frontend ne parle jamais directement à Supabase, c'est toujours Render qui sert d'intermédiaire. Cette architecture protège les données : impossible pour un investisseur, même malicieux, d'accéder aux données d'un autre investisseur, parce que Render applique systématiquement les règles de filtrage avant de renvoyer quoi que ce soit.

Les fichiers (logos, signatures, PDF des rapports) sont une exception : ils sont servis directement par Supabase Storage, soit publiquement pour le logo de la société, soit via des liens signés temporaires pour les rapports qui ne doivent être visibles qu'au destinataire.

Quand vous modifiez le code et que vous le poussez sur GitHub avec un `git push`, GitHub prévient automatiquement Render et Netlify, qui reconstruisent et redéploient leurs parties respectives en quelques minutes. Vous n'avez rien d'autre à faire que le `git push`.

---

## 4. Les trois rôles dans l'application

L'administrateur a accès à tout. Il crée les investisseurs, modifie les transactions, lance les distributions de P&L, valide ou rejette les demandes d'approbation des caissiers, génère et publie les rapports, ajuste les paramètres de la société. Il y a au minimum un administrateur dans la plateforme, généralement deux ou trois pour assurer la continuité.

Le caissier est une fonction intermédiaire pensée pour la délégation. Un caissier peut consulter les chiffres, créer des transactions courantes, gérer la messagerie. Mais dès qu'il s'agit d'une action lourde (annuler ou modifier une transaction déjà passée, supprimer un investisseur, créer un autre utilisateur, déclencher une distribution de P&L), sa demande passe en file d'attente et l'administrateur doit la valider depuis la page Approbations. Cette mécanique évite qu'une erreur humaine ou une mauvaise intention puisse modifier silencieusement les chiffres financiers.

L'investisseur est le destinataire de la plateforme. Il se connecte, il regarde ses propres chiffres, il télécharge ses rapports, il écrit un message à l'équipe s'il a une question. Il ne peut rien créer, modifier ou supprimer dans les données financières.

Sept types d'actions sont soumises à approbation lorsqu'elles sont initiées par un caissier : la suppression d'un investisseur, l'annulation d'une transaction, la modification d'une transaction existante, la restauration d'une transaction préalablement annulée, la copie d'une transaction (replay), la création d'un nouvel utilisateur, et la distribution périodique des profits et pertes.

---

## 5. Comment se passent les opérations financières

Toute opération financière dans Valmere & Co est représentée par une « transaction » dans la plateforme. Les transactions ont un type, qui détermine leur effet sur le portefeuille de l'investisseur et sur la comptabilité.

Un **dépôt** augmente le capital investi de l'investisseur. Un **retrait** le diminue. Un **gain** augmente la valeur actuelle du portefeuille sans toucher au capital investi (c'est un profit). Une **perte** fait l'inverse. Les **frais** sont comptés comme une diminution de valeur, comme une perte, mais classés à part pour la lisibilité.

Le **renflouement investisseur** (`bailout`) est un cas particulier. Si à un moment donné, à la suite de pertes successives, la valeur actuelle d'un investisseur devient négative, l'administrateur peut procéder à un renflouement : il fixe une nouvelle valeur cible (par exemple zéro), et le système enregistre automatiquement le montant nécessaire pour ramener le portefeuille à cette cible. Tant que la valeur d'un investisseur reste négative, c'est le seul type d'opération que la plateforme accepte sur son compte : on ne peut pas faire un nouveau dépôt qui « cacherait » la perte, on doit d'abord renflouer.

Le **renflouement société** (`company_bailout`) est l'équivalent pour le compte de la société Valmere & Co elle-même. Il augmente la balance de la société. Le **prélèvement société** (`company_withdrawal`) la diminue.

Chaque transaction génère automatiquement une écriture comptable en double-entrée. Si un investisseur dépose deux cents dollars un jour où le taux est de 130,48 gourdes pour un dollar, la plateforme enregistre une écriture qui débite le compte « Banque » de 26 096 gourdes et qui crédite simultanément le compte de l'investisseur du même montant. À côté, la ligne d'écriture conserve trois informations : le montant d'origine (200), la devise d'origine (USD), et le taux appliqué (130,48). Ces trois données restent inscrites pour toujours et c'est ce qui permet, des années plus tard, de comprendre comment 200 dollars se sont transformés en 26 096 gourdes ce jour-là.

Quand une transaction est supprimée (envoyée à la corbeille), elle n'est pas effacée de la base. Son statut passe à « voided » et le système enregistre automatiquement une contre-écriture qui annule les effets de l'écriture initiale. Si plus tard l'administrateur veut la restaurer, il a deux choix : la restaurer comme avant (les chiffres reviennent comme s'il n'y avait jamais eu de suppression), ou la rejouer (une nouvelle transaction identique est créée, avec ses propres écritures, et l'originale reste à la corbeille à des fins d'audit). Cette mécanique de corbeille fait que les chiffres sont toujours réversibles et traçables.

---

## 6. La distribution périodique des profits et pertes

À intervalles réguliers (mensuels, trimestriels, selon la décision de la société), l'administrateur lance une distribution. C'est une opération qui répartit le résultat net de la période entre la société et les investisseurs, selon une règle convenue : 80 % pour la société, 20 % pour les investisseurs au prorata de leur valeur actuelle.

L'administrateur arrive sur la page Transactions, clique sur le bouton « Distribuer P&L », et choisit la période. Le système affiche immédiatement un aperçu : combien chaque investisseur va recevoir (ou supporter, si c'est une perte). L'aperçu se met à jour en temps réel quand l'administrateur ajuste les paramètres. Tant qu'il n'a pas validé, rien n'est inscrit en base.

Une fois la validation faite, le système crée une transaction de type « gain » ou « loss » pour chaque investisseur concerné, plus une transaction équivalente sur le compte de la société. Toutes ces transactions sont marquées avec un identifiant de distribution commun, ce qui permet plus tard de les retrouver ensemble et de les traiter en bloc si besoin.

Il y a deux subtilités importantes. Premièrement, lorsque la période est globalement déficitaire, un investisseur dont la valeur actuelle est déjà négative ou nulle est exclu de la répartition. La logique est que s'il a déjà perdu son capital, on ne peut pas lui imputer une perte supplémentaire (il sera renfloué séparément si nécessaire). Deuxièmement, les transactions issues d'une distribution ne peuvent pas être éditées individuellement : si on veut annuler une distribution, il faut traiter l'ensemble du groupe.

---

## 7. La sécurité

L'authentification utilise un système de jetons de session (JWT) signés avec une clé secrète qui réside uniquement dans les variables d'environnement de Render. Cette clé n'apparaît nulle part dans le code source ni dans la base de données. Les mots de passe des utilisateurs ne sont jamais stockés en clair : ce qu'on stocke en base, c'est une empreinte cryptographique (bcrypt) qui ne permet pas de retrouver le mot de passe même si on a accès à la base. Conséquence pratique : si un utilisateur oublie son mot de passe, même l'administrateur ne peut pas le lui dire — il peut seulement en générer un nouveau temporaire.

La biométrie (Touch ID sur iPhone, Windows Hello, empreinte Android) est gérée par le standard WebAuthn. Quand un utilisateur active la biométrie sur son téléphone, son appareil génère localement une paire de clés cryptographiques. Seule la clé publique est envoyée au serveur ; la clé privée ne quitte jamais l'appareil. Pour s'authentifier, l'utilisateur fait son geste biométrique, l'appareil signe un défi avec la clé privée, et le serveur vérifie la signature avec la clé publique. Aucune donnée biométrique (empreinte, image faciale) ne transite par Internet ni par notre serveur.

Une particularité de WebAuthn à connaître : un enregistrement biométrique est lié au domaine sur lequel il a été créé. Si demain on déplace l'application de `valmere-co.netlify.app` vers `app.valmere.com`, tous les enregistrements biométriques précédents seront invalidés et les utilisateurs devront recommencer la procédure. Cela vaut la peine d'y penser avant tout changement de nom de domaine.

Les communications entre le navigateur et le serveur sont chiffrées en HTTPS (certificat Let's Encrypt automatiquement renouvelé par Netlify et par Render). Le serveur n'accepte les requêtes que depuis le domaine de l'application (`https://valmere-co.netlify.app`) : un script tiers hébergé ailleurs ne pourrait pas se brancher sur l'API. Ce filtre s'appelle CORS et il est piloté par la variable d'environnement `CORS_ORIGINS` sur Render.

Enfin, chaque action sensible (suppression, modification, restauration, distribution) est tracée dans une table d'audit qui conserve qui a fait quoi et quand. Cette table n'est jamais purgée, même quand les données métier sont supprimées par ailleurs.

---

## 8. Le quotidien : déployer une modification

Le scénario standard est le suivant. Vous modifiez quelque chose dans le code (un libellé, une couleur, un calcul), vous le testez en local sur votre machine, et quand vous êtes satisfait vous le poussez sur GitHub. Le push déclenche en cascade deux choses : Render reconstruit le backend, Netlify reconstruit le frontend. Au bout de quelques minutes, vos modifications sont visibles publiquement à `https://valmere-co.netlify.app`.

En pratique, depuis le dossier du projet sur votre ordinateur, ça donne ces trois commandes :

```bash
git add .
git commit -m "Description courte de ce que vous avez changé"
git push origin main
```

C'est tout. Pas de FTP, pas de configuration manuelle de serveur, pas de redémarrage à faire. Si vous voulez voir où en est le déploiement, vous ouvrez les onglets « Events » de Render ou « Deploys » de Netlify, et vous verrez le statut en direct.

Si le build échoue (par exemple, une erreur de syntaxe Python ou une dépendance manquante), le service tourne toujours sur l'ancienne version. Vous ne risquez pas de casser la production en poussant une erreur : la plateforme continuera de fonctionner sur le dernier déploiement réussi pendant que vous corrigez votre code et que vous repoussez.

Pour toute opération qui touche les mots de passe, les clés d'API, le nom de domaine ou tout autre paramètre sensible de la plateforme, **consultez impérativement le document `OPERATIONS_SENSIBLES.md`** dans ce même dossier `docs/`. Il décrit pas à pas ce qui doit être mis à jour en parallèle dans chacun de ces cas, et comment vérifier ensuite que tout fonctionne encore.

---

## 9. Les bases de données et leurs sauvegardes

La base de données Supabase fait l'objet de sauvegardes automatiques quotidiennes côté Supabase, conservées sept jours sur le plan gratuit. Cela signifie que si une corruption ou une erreur humaine arrive un mardi, on a jusqu'au mardi suivant pour s'en apercevoir et restaurer une version antérieure depuis l'interface Supabase. Au-delà de sept jours, ces sauvegardes plus anciennes sont effacées par Supabase.

Pour disposer d'un deuxième niveau de sauvegarde indépendant de Supabase et conserver un historique plus long, la plateforme dispose d'un système d'export automatique hébergé dans GitHub Actions. Le workflow est défini dans `.github/workflows/backup.yml` et il s'exécute entièrement sur les serveurs de GitHub, sans dépendre d'aucune machine physique. Concrètement, GitHub Actions se charge tous les jours d'exécuter `pg_dump` contre la base Supabase, de télécharger les fichiers du Storage (logos, signatures, PDF de rapports), de compresser le tout dans une archive ZIP horodatée, et de la stocker dans GitHub où elle est consultable depuis l'onglet Actions du dépôt.

Trois fréquences cohabitent. La sauvegarde quotidienne tourne tous les jours à 03h00 UTC (soit environ 22h00 heure d'Haïti) et est conservée pendant 90 jours dans les artifacts GitHub. La sauvegarde hebdomadaire tourne tous les lundis et obéit aux mêmes règles de rétention. La sauvegarde mensuelle, qui tourne le premier de chaque mois, est en plus publiée comme **GitHub Release** permanente : ces Releases ne sont jamais supprimées et constituent l'archive longue de l'entreprise.

Pour récupérer une sauvegarde, ouvrez le dépôt sur GitHub, allez dans l'onglet **Actions**, sélectionnez le workflow « Sauvegarde Valmere », choisissez l'exécution qui vous intéresse dans la liste, et téléchargez l'artifact ZIP attaché. Pour les sauvegardes mensuelles, vous pouvez aussi passer par l'onglet **Releases** du dépôt qui les liste explicitement.

Pour déclencher une sauvegarde immédiatement (par exemple avant une opération risquée), allez dans l'onglet Actions, ouvrez le workflow « Sauvegarde Valmere », cliquez sur **Run workflow** en haut à droite, choisissez le mode (daily, weekly ou monthly), et lancez. La sauvegarde se termine en deux à trois minutes et apparaît immédiatement dans la liste des artifacts.

La configuration de ce système nécessite que six secrets soient définis dans les paramètres GitHub du dépôt (Settings → Secrets and variables → Actions) : `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, et accessoirement le nom des buckets. Ces secrets sont chiffrés par GitHub et invisibles dans les logs. Si vous changez le mot de passe de la base Supabase, n'oubliez pas de mettre à jour le secret `DB_PASSWORD` correspondant, sinon les sauvegardes commenceront à échouer silencieusement (GitHub envoie un email d'alerte au propriétaire du dépôt en cas d'échec d'un workflow planifié).

---

## 10. Le monitoring

UptimeRobot surveille en continu que l'API répond. Il ping `https://valmere-api.onrender.com/health` toutes les cinq minutes. Cet endpoint est volontairement très léger (il ne consulte pas la base de données) pour ne pas surcharger le serveur. Si la réponse ne revient pas dans les trente secondes, ou si elle revient avec un code d'erreur, UptimeRobot considère le service comme « Down » et, après deux échecs consécutifs, envoie un email aux contacts configurés.

Un effet secondaire bénéfique de ce ping régulier est qu'il maintient le backend Render éveillé. Le plan gratuit de Render endort automatiquement les services après quinze minutes sans trafic, et le premier visiteur qui revient après une pause attend cinquante secondes que le service redémarre. Avec UptimeRobot qui tape toutes les cinq minutes, le service ne s'endort jamais en heures ouvrables et les utilisateurs n'ont jamais à attendre.

La configuration actuelle utilise la méthode GET (la méthode HEAD posait initialement un problème de compatibilité, désormais résolu côté code, mais GET reste préférable car plus universel). En cas d'incident, UptimeRobot vous enverra un email avec le titre du genre « Monitor is DOWN » et reprendra contact quand le service sera revenu, avec un email « Monitor is back UP » indiquant la durée de la panne.

---

## 11. Les coûts mensuels et les seuils de croissance

À ce jour, l'ensemble de la plateforme tourne sur des plans gratuits : Render Free pour l'API, Netlify Free pour le frontend, Supabase Free pour la base de données et le stockage, UptimeRobot Free pour le monitoring, GitHub Free pour le code. Le coût mensuel est de zéro.

Cette situation est confortable mais elle a des limites. Le plan gratuit Supabase plafonne à 500 mégaoctets de base de données et un gigaoctet de stockage. Au rythme des transactions, on touchera ces limites quand la plateforme aura accumulé plusieurs milliers de transactions et plusieurs centaines de rapports PDF — concrètement après six à dix-huit mois d'usage actif. À ce moment-là il faudra passer Supabase au plan Pro (vingt-cinq dollars par mois), qui multiplie les limites par cent et offre des sauvegardes plus anciennes.

Le plan gratuit Render endort le service après inactivité, mais avec UptimeRobot qui le réveille toutes les cinq minutes ce n'est plus un problème en pratique. Si l'usage augmente au point que cinq cents heures par mois ne suffisent plus (le quota gratuit), il faudra passer Render au plan Starter à sept dollars par mois.

Netlify et UptimeRobot resteront probablement gratuits longtemps : les limites sont très larges pour notre usage.

Au total, si l'on doit prévoir un budget de croissance, on parlera de quinze à trente-cinq dollars par mois quand on dépassera les seuils. C'est un coût opérationnel parfaitement raisonnable pour une plateforme financière professionnelle.

---

## 12. Que faire quand ça ne marche pas

Le cas le plus fréquent est que la plateforme semble inaccessible. Avant de paniquer, prenez trente secondes pour identifier où se situe le problème. Ouvrez `https://valmere-api.onrender.com/health` dans votre navigateur. Si vous voyez `{"status": "ok"}`, l'API tourne correctement et le problème est ailleurs (peut-être le frontend, peut-être votre connexion Internet). Si vous voyez une page d'erreur Render ou si le navigateur attend longtemps puis renonce, c'est que l'API est tombée ou qu'elle est en redémarrage.

Dans ce dernier cas, allez dans le tableau de bord de Render, ouvrez le service `valmere-api`, et regardez l'onglet « Logs ». Les vingt à trente dernières lignes vous diront généralement ce qui s'est passé : une erreur de connexion à la base, un module Python manquant, une erreur dans le code. Les erreurs Python sont reconnaissables à leurs lignes qui finissent par un nom de fichier et un numéro de ligne, suivies du message d'erreur en bas.

Si l'erreur est due à un déploiement récent qui a cassé quelque chose, vous pouvez revenir en arrière. Dans Render, onglet « Events », trouvez le dernier déploiement qui était marqué comme « Live » avant la cassure, et cliquez sur « Rollback to this deploy ». En une minute, le service revient sur l'ancienne version. Vous pourrez ensuite corriger tranquillement le code et redéployer.

Sur Netlify, la procédure est équivalente : onglet « Deploys », trouvez l'ancien déploiement fonctionnel, et cliquez sur « Publish deploy ».

Si l'erreur vient de la base de données, vérifiez d'abord le statut de Supabase sur `https://status.supabase.com`. Les pannes Supabase sont rares mais elles arrivent, et dans ce cas il n'y a rien à faire d'autre qu'attendre la résolution côté Supabase (généralement moins d'une heure). Vérifiez aussi que la connection string dans les variables d'environnement de Render est toujours valide : si quelqu'un a réinitialisé le mot de passe Supabase sans mettre à jour Render, l'API ne pourra plus se connecter.

Pour les cas vraiment graves (corruption de données, suppression accidentelle massive), la procédure de restauration depuis une sauvegarde Supabase prend une vingtaine de minutes. Allez dans le tableau de bord Supabase, projet `Valmere`, section Database puis Backups. Choisissez une sauvegarde antérieure à l'incident et lancez une restauration. Pendant la restauration, l'application ne fonctionnera pas pour les utilisateurs, mais à la fin la base retrouvera son état au moment de la sauvegarde sélectionnée.

---

## 13. Les comptes et les identifiants à conserver

Plusieurs comptes en ligne sont nécessaires pour administrer la plateforme. Tous ont été créés avec l'adresse email officielle de l'entreprise. Les mots de passe doivent être conservés dans un gestionnaire de mots de passe (Bitwarden, 1Password, Dashlane, ou équivalent) et **jamais** dans un fichier texte ou un email.

Le compte GitHub donne accès au code source. Le compte Render gère le backend déployé. Le compte Netlify gère le frontend déployé. Le compte Supabase gère la base de données et le stockage. Le compte UptimeRobot gère le monitoring. Et bien sûr, il y a au moins un compte administrateur dans l'application elle-même, qui sert à se connecter sur `https://valmere-co.netlify.app`.

| Service | Type d'accès | Identifiant utilisé |
|---|---|---|
| GitHub | OAuth depuis le compte personnel ou organisation | Organisation Valmere |
| Render | Email + mot de passe | Email entreprise |
| Netlify | OAuth via GitHub ou email | Email entreprise ou GitHub Valmere |
| Supabase | Email + mot de passe | Email entreprise |
| UptimeRobot | OAuth via GitHub | Via GitHub Valmere |
| Application Valmere | Email + mot de passe d'administrateur | À choisir par l'admin |

Les variables d'environnement sensibles sont stockées dans Render et invisibles depuis l'extérieur. Ce sont notamment la chaîne de connexion à la base, la clé de signature des jetons de session, et la clé d'API Supabase. Pour les consulter ou les modifier, il faut se connecter à Render avec un compte autorisé.

---

## 14. Pour aller plus loin

Les calculs financiers les plus délicats sont concentrés dans quelques fichiers du backend. Le calcul de la valeur actuelle d'un investisseur, du capital investi, du gain ou de la perte cumulés, vit dans `backend/app/services/portfolio_math.py`. C'est volontairement le seul endroit où ces formules sont écrites — toutes les autres pages qui affichent des chiffres passent par ce module, ce qui garantit la cohérence. Si un jour vous devez changer la définition de quelque chose (par exemple modifier la règle de répartition 80/20), c'est ici qu'il faut intervenir.

Le posting comptable automatique est dans `backend/app/services/accounting_posting.py`. C'est ce qui transforme chaque transaction métier en une paire d'écritures comptables avec leurs taux de change historiques. La logique de distribution périodique est dans `backend/app/services/distribution_service.py`. Le workflow d'approbation des actions de caissier est dans `backend/app/services/approvals_service.py`.

Pour le frontend, les pages les plus complexes sont celles des transactions et des rapports. Les composants réutilisables (cartes dépliables, badges, sélecteurs) sont dans `frontend/src/components/ui/`. L'internationalisation (français, anglais, espagnol) est gérée par les trois fichiers `frontend/src/i18n/fr.js`, `en.js`, `es.js` qui contiennent toutes les traductions.

Pour comprendre une fonctionnalité spécifique, le mieux est généralement de partir de l'URL de la page concernée, de chercher le composant React correspondant dans `frontend/src/pages/`, puis de remonter jusqu'à l'API Python concernée dans `backend/app/routers/`. La structure du code suit volontairement cette logique de miroir entre frontend et backend.

---

*Ce document est à conserver dans le repo, à côté du code. Quand quelque chose change durablement (nouvelle plateforme d'hébergement, nouveau workflow, nouvelle règle métier), il faut le mettre à jour. Un document de transfert qui n'est plus à jour est pire qu'un document absent : il fait perdre du temps en donnant de fausses certitudes.*
