# Sauvegardes automatiques — Valmere & Co

Ce dossier contient tout ce qui sert à protéger les données de la plateforme contre les incidents : panne du fournisseur de base de données, erreur humaine non détectée à temps, ou perte accidentelle de fichiers. Il est composé d'un script Python qui fait le travail réel, de deux lanceurs Windows qui permettent de le déclencher automatiquement, et d'un fichier de configuration où l'on range les mots de passe pour qu'ils ne se retrouvent pas dans le code.

## Comment ça marche

À chaque exécution, le script `backup_valmere.py` enchaîne trois opérations. Il commence par appeler `pg_dump` qui produit un fichier SQL contenant l'intégralité de la base de données — toutes les tables, toutes les transactions actives et celles en corbeille, toutes les écritures comptables avec leurs taux de change historiques, en bref tout. Il continue en téléchargeant les fichiers stockés dans Supabase Storage : le logo de l'entreprise, les signatures, et les éventuels PDF de rapports déjà générés. Il termine en regroupant l'ensemble dans une archive ZIP horodatée, déposée dans un dossier dédié.

Le script supporte trois modes. En mode `daily` (le défaut), il écrit dans le sous-dossier `daily/` et garde les quatorze sauvegardes les plus récentes — au-delà, les anciennes sont effacées automatiquement. En mode `--weekly`, il écrit dans `weekly/` et garde les douze dernières, soit environ trois mois d'historique. En mode `--monthly`, il écrit dans `monthly/` et **ne purge jamais rien** : ces archives s'accumulent et constituent la mémoire longue de l'entreprise.

## Première mise en route sur un poste

Le script est censé tourner sur la machine de la personne qui maintient la plateforme. Avant qu'il puisse s'exécuter, deux conditions doivent être réunies. Premièrement, PostgreSQL 17 doit être installé en local pour que `pg_dump.exe` soit disponible ; sous Windows, l'installation se fait via `winget install PostgreSQL.PostgreSQL.17` puis l'ajout du dossier `C:\Program Files\PostgreSQL\17\bin` au PATH. Deuxièmement, le projet doit être cloné avec son environnement virtuel Python configuré, car le script utilise ce venv pour s'exécuter.

Une fois ces deux prérequis remplis, il faut créer le fichier de configuration. À côté de ce README se trouve un fichier `backup.env.example` qui sert de modèle. Copiez-le en `backup.env` (sans le suffixe) et remplissez les valeurs : le mot de passe de la base de données Supabase, la clé service de Supabase, et éventuellement le chemin où vous voulez stocker les sauvegardes. Le fichier `backup.env` est explicitement exclu du dépôt git, ce qui veut dire que vos mots de passe ne risquent pas de partir accidentellement sur GitHub.

Pour vérifier que tout est en place, lancez une fois le script à la main :

```cmd
"C:\Users\rdameus.AIC\Projects\valmere-investor-portal\backend\venv\Scripts\python.exe" backup_valmere.py
```

Vous devriez voir défiler les trois étapes (export de la base, téléchargement des fichiers, compression) et, à la fin, un message confirmant que le fichier ZIP a été créé dans `Documents\Valmere_Backups\daily\`.

## Planification automatique sous Windows

L'automatisation passe par le Planificateur de tâches Windows. C'est un outil natif, gratuit, intégré au système, qui sait déclencher des programmes à des moments précis. La configuration prend cinq minutes une fois pour toutes.

### Ouvrir le Planificateur

Tapez « Planificateur de tâches » dans la recherche Windows et lancez l'application. Une fenêtre s'ouvre avec un panneau à gauche, un panneau central, et un panneau d'actions à droite.

### Créer la tâche quotidienne

Dans le panneau de droite, cliquez sur **Créer une tâche** (pas « Créer une tâche de base » qui est plus limité). Une fenêtre de dialogue s'ouvre avec plusieurs onglets.

Dans l'onglet **Général**, donnez un nom à la tâche, par exemple `Valmere - Sauvegarde quotidienne`. Sous l'option de sécurité, cochez **Exécuter même si l'utilisateur n'est pas connecté** : cela garantit que la sauvegarde aura lieu même si vous êtes déconnecté de votre session Windows à l'heure programmée. Cochez aussi **Exécuter avec les autorisations maximales**.

Dans l'onglet **Déclencheurs**, cliquez sur **Nouveau**. Choisissez **À l'heure programmée**, puis **Tous les jours**, et fixez l'heure (par exemple 23h00 — un moment où le PC est généralement allumé mais où personne ne travaille activement sur l'application). Cochez l'option **Activé** et validez.

Dans l'onglet **Actions**, cliquez sur **Nouveau**. Dans **Action**, laissez **Démarrer un programme**. Dans **Programme/script**, indiquez le chemin complet vers le fichier `backup_daily.bat` :

```
C:\Users\rdameus.AIC\Projects\valmere-investor-portal\backend\scripts\backup\backup_daily.bat
```

Laissez les autres champs vides et validez.

Dans l'onglet **Conditions**, **décochez** l'option « Démarrer la tâche uniquement si l'ordinateur est sur secteur » si vous voulez que la sauvegarde tourne aussi sur batterie.

Dans l'onglet **Paramètres**, cochez **Autoriser l'exécution à la demande** et **Si la tâche échoue, redémarrer toutes les 5 minutes** (avec un maximum de 3 tentatives).

Validez l'ensemble. Windows vous demandera votre mot de passe utilisateur pour pouvoir exécuter la tâche en arrière-plan : c'est normal, fournissez-le.

### Créer la tâche hebdomadaire

Recommencez la même procédure, mais cette fois nommez la tâche `Valmere - Sauvegarde hebdomadaire`, configurez le déclencheur sur **Toutes les semaines** (par exemple chaque dimanche à 23h30), et indiquez le chemin vers `backup_weekly.bat` au lieu de `backup_daily.bat`.

### Tester immédiatement

Avant de quitter le Planificateur, sélectionnez votre tâche dans la liste centrale et cliquez sur **Exécuter** dans le panneau de droite. Vérifiez ensuite dans le dossier `Documents\Valmere_Backups\` qu'une nouvelle archive ZIP est bien apparue. Si oui, c'est gagné : le système tournera tout seul à partir de maintenant.

## Synchronisation avec Google Drive ou OneDrive

Pour que les sauvegardes soient à l'abri d'une panne de votre disque dur, elles doivent être copiées sur un cloud externe. La méthode la plus simple consiste à utiliser le client desktop de Google Drive ou OneDrive.

Si vous installez **Google Drive pour ordinateur** depuis `https://www.google.com/drive/download/`, le service vous propose de synchroniser n'importe quel dossier de votre ordinateur avec le cloud. Une fois installé, faites un clic droit sur le dossier `Documents\Valmere_Backups\` et choisissez **Synchroniser avec Google Drive**. À partir de là, chaque nouveau ZIP qui apparaîtra dans ce dossier sera automatiquement uploadé sur votre Google Drive, dans un dossier du même nom.

Avec **OneDrive**, le mécanisme est identique mais encore plus simple : il suffit de déplacer le dossier `Valmere_Backups` à l'intérieur de votre dossier OneDrive, et la synchronisation devient automatique. Vous pouvez modifier la variable `BACKUP_ROOT` dans `backup.env` pour pointer directement vers `C:\Users\rdameus.AIC\OneDrive\Valmere_Backups`, par exemple.

L'avantage de cette approche est qu'elle ne demande aucune configuration côté script. Le script écrit dans un dossier local comme d'habitude, et c'est le client desktop du cloud qui s'occupe du transfert en arrière-plan, de manière transparente.

## Vérifier que tout fonctionne

Une fois la configuration en place, il est important de vérifier régulièrement que les sauvegardes se font bien. Trois habitudes simples suffisent.

D'abord, **regarder de temps en temps le contenu du dossier de sauvegardes**, idéalement une fois par semaine. Vous devriez y voir une archive ZIP datée d'aujourd'hui ou d'hier dans `daily/`, et une archive datée du dernier dimanche dans `weekly/`. Si vous voyez un trou de plusieurs jours dans les dates, c'est qu'une exécution a échoué quelque part.

Ensuite, **consulter le fichier `backup_daily.log`** qui se trouve dans ce même dossier. Il contient le résultat de chaque exécution : ce qui a été sauvegardé, combien de temps ça a pris, et surtout les éventuelles erreurs. Si tout va bien, vous y verrez des « Sauvegarde terminée avec succès ». Sinon, vous y verrez le message d'erreur précis, ce qui aide énormément à diagnostiquer.

Enfin, **tester la restauration une fois par trimestre**. C'est la seule façon de s'assurer qu'une sauvegarde est réellement utilisable. Prenez une archive ZIP au hasard, extrayez-la dans un dossier temporaire, et vérifiez que vous arrivez à ouvrir le fichier SQL avec un éditeur de texte et à voir des `CREATE TABLE` et des `INSERT INTO`. Si vous voulez aller plus loin, vous pouvez restaurer ce fichier dans une base de test (par exemple un nouveau projet Supabase de développement) pour confirmer que les données sont bien là.

## Comment restaurer en cas d'incident

Si jamais quelque chose tourne mal en production et qu'il faut restaurer une sauvegarde, voici la marche à suivre.

Identifiez d'abord l'archive ZIP la plus proche dans le temps de l'état que vous voulez retrouver. Si l'incident a eu lieu ce matin, prenez le ZIP daily d'hier soir. Si l'incident remonte à deux semaines, prenez le ZIP weekly correspondant. Extrayez le ZIP : vous obtenez un dossier contenant un fichier `valmere_db_DATE.sql`, un sous-dossier `storage/`, et un fichier `backup_info.txt`.

Pour restaurer la base, lancez `psql` en pointant vers le projet Supabase de destination et en lui donnant le fichier SQL à exécuter :

```cmd
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -h aws-1-us-west-1.pooler.supabase.com -p 5432 -U postgres.igzcwqmuwuxdysqftomc -d postgres -f valmere_db_DATE.sql
```

Le mot de passe DB de Supabase vous sera demandé. L'opération prend généralement quelques dizaines de secondes pour une base de taille moyenne. À la fin, la base aura retrouvé exactement l'état qu'elle avait au moment de cette sauvegarde.

Pour restaurer les fichiers Storage, ouvrez le tableau de bord Supabase, allez dans la section Storage, et re-uploadez manuellement chaque fichier du dossier extrait dans le bucket correspondant. C'est manuel mais ça n'arrive pas souvent et le volume est faible : un logo, quelques PDF.

Une fois la restauration terminée, redémarrez le backend Render (depuis son dashboard, onglet Settings, bouton « Restart » au bas de la page) pour vous assurer qu'il prend bien en compte le nouvel état de la base.

## Sécurité et rotation des mots de passe

Le fichier `backup.env` contient le mot de passe de la base de données Supabase. Si vous changez ce mot de passe (ce qu'il faut faire de temps en temps, idéalement tous les six mois), n'oubliez pas de mettre à jour `backup.env` en parallèle, sinon les sauvegardes échoueront silencieusement. Vous vous en apercevriez en regardant `backup_daily.log` qui afficherait alors des erreurs d'authentification.

Le fichier `backup.env` doit rester strictement local à votre machine et ne jamais être partagé. Il est protégé par le `.gitignore` du projet, donc il ne partira pas sur GitHub par accident, mais il est de votre responsabilité de ne pas le copier-coller ailleurs sans précaution.

Si vous transférez la responsabilité de la maintenance à quelqu'un d'autre, ne lui envoyez pas `backup.env` par email. Communiquez les mots de passe via un canal sécurisé (gestionnaire de mots de passe partagé, communication verbale en personne, ou outil dédié comme Bitwarden Send), et laissez la personne créer son propre fichier `backup.env` sur sa propre machine à partir de `backup.env.example`.

---

*Ce dispositif de sauvegarde est volontairement simple : pas d'infrastructure dédiée, pas de service tiers payant, juste un script qui s'exécute sur la machine du mainteneur. Il fonctionnera tant que cette machine fonctionne et que le mainteneur veille au grain. Pour une plateforme de la taille actuelle de Valmere & Co, c'est largement suffisant. Si à l'avenir l'activité croît significativement, on pourra envisager de migrer ce dispositif vers une exécution en cloud (par exemple un worker Render ou une fonction planifiée), mais ce n'est pas la priorité aujourd'hui.*
