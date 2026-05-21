# 📚 Documentation Valmere & Co

Ce dossier contient les documents officiels pour les utilisateurs de la plateforme.

## 📘 [GUIDE_ADMIN_DEV.md](./GUIDE_ADMIN_DEV.md)

**Destinataires** : administrateurs, équipe technique, développeurs.

Document complet sur :
- Architecture et stack technique
- URLs et identifiants
- Fonctionnalités admin (transactions, distribution P&L, comptabilité)
- Workflow d'approbation pour les caissiers
- Sécurité (JWT, WebAuthn, CORS, audit)
- Maintenance, déploiement, logs, backups
- Coûts mensuels et seuils d'upgrade
- Procédures d'urgence

## 🌟 [GUIDE_INVESTISSEUR.md](./GUIDE_INVESTISSEUR.md)

**Destinataires** : nouveaux investisseurs (à transmettre **avant** leur inscription).

Document de bienvenue expliquant :
- À quoi sert la plateforme
- Comment se déroule l'inscription
- Comment se connecter et utiliser le portail
- Lecture du tableau de bord (capital investi, VA, P&L, ROI)
- Gestion des transactions, rapports, paramètres
- Sécurité et bonnes pratiques
- Glossaire des termes financiers

---

## 📄 Conversion en PDF

Pour partager ces documents en PDF avec un investisseur :

### Option 1 — Pandoc (ligne de commande)
```bash
pandoc GUIDE_INVESTISSEUR.md -o GUIDE_INVESTISSEUR.pdf --pdf-engine=xelatex
```

### Option 2 — VS Code
- Installer l'extension **Markdown PDF**
- Clic droit sur le fichier `.md` → **Markdown PDF: Export (pdf)**

### Option 3 — En ligne
- https://md-to-pdf.fly.dev
- https://www.markdowntopdf.com

### Option 4 — Print to PDF
- Ouvrir le fichier dans GitHub (rendu Markdown joli)
- Ctrl+P → choisir **Enregistrer en PDF**
