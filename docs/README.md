# Documents officiels — Valmere & Co

Ce dossier contient les deux documents écrits qui accompagnent la plateforme. Ils sont rédigés en français, lisibles d'une traite, et destinés à des publics différents.

## Guide technique (`GUIDE_ADMIN_DEV.md`)

Ce document s'adresse à l'administrateur principal et à toute personne qui sera amenée à intervenir sur la plateforme. Il décrit l'architecture, les services hébergés, les rôles, le fonctionnement des opérations financières et comptables, la sécurité, le déploiement, le monitoring, les sauvegardes, les coûts, et les procédures à suivre quand quelque chose ne fonctionne pas. C'est un document de transfert : il suppose une culture informatique générale mais ne demande pas d'avoir déjà travaillé sur ce projet.

## Guide investisseur (`GUIDE_INVESTISSEUR.md`)

Ce document est destiné à être remis à chaque nouvel investisseur **avant** son inscription sur le portail. Il lui présente la plateforme, lui explique le déroulement de l'inscription et de la première connexion, lui apprend à lire son tableau de bord, et lui donne les bonnes pratiques de sécurité. Il est rédigé dans un ton accessible, sans jargon technique inutile, et peut être imprimé tel quel ou converti en PDF pour être joint à l'email de bienvenue.

## Convertir en PDF

Les deux documents sont en Markdown, ce qui les rend faciles à lire directement sur GitHub. Pour les transmettre sous forme de PDF, plusieurs solutions existent :

- Ouvrir le fichier directement sur GitHub (le rendu y est propre) et utiliser la fonction « Imprimer en PDF » du navigateur. C'est l'option la plus simple et le résultat est très lisible.
- Utiliser un convertisseur en ligne comme `md-to-pdf.fly.dev` en copiant-collant le contenu.
- Si VS Code est installé, l'extension « Markdown PDF » permet de générer un PDF en deux clics.
- Pour les utilisateurs avancés, `pandoc` en ligne de commande produit un PDF avec une mise en page typographique soignée.

## Mise à jour

Quand la plateforme évolue de façon notable (changement de nom de domaine, nouvelle fonctionnalité importante, modification des règles de gestion), ces documents doivent être mis à jour en conséquence. Un document de référence qui n'est plus aligné avec la réalité est plus nuisible qu'utile.
