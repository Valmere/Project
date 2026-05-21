# 📘 Guide Administrateur & Développeur — Valmere & Co Portail Investisseur

> Document interne — réservé aux administrateurs et au support technique.
> Dernière mise à jour : mai 2026

---

## Table des matières

1. [Présentation de la plateforme](#1-présentation-de-la-plateforme)
2. [Accès et URLs](#2-accès-et-urls)
3. [Architecture technique](#3-architecture-technique)
4. [Rôles et permissions](#4-rôles-et-permissions)
5. [Fonctionnalités admin](#5-fonctionnalités-admin)
6. [Workflow comptable](#6-workflow-comptable)
7. [Distribution des P&L](#7-distribution-des-pl)
8. [Sécurité](#8-sécurité)
9. [Maintenance et exploitation](#9-maintenance-et-exploitation)
10. [Coûts et limites](#10-coûts-et-limites)
11. [Procédures d'urgence](#11-procédures-durgence)
12. [Comptes et identifiants critiques](#12-comptes-et-identifiants-critiques)

---

## 1. Présentation de la plateforme

**Valmere & Co — Portail Investisseur** est une plateforme web complète permettant à Valmere & Co de :

- Suivre la valeur des investissements de chaque investisseur en temps réel
- Enregistrer toutes les transactions (dépôts, retraits, gains, pertes, frais, renflouements)
- Gérer la comptabilité en double-entrée (journal général, plan comptable, états financiers)
- Distribuer les profits/pertes selon une règle 80 % société / 20 % investisseurs au prorata
- Générer des rapports PDF signés pour chaque investisseur
- Offrir à chaque investisseur un accès sécurisé à **ses propres données uniquement**

La plateforme est **multilingue** (FR / EN / ES) et **multi-devise** (HTG / USD / EUR), avec des taux de change historiques figés à la date de la transaction pour préserver l'audit.

---

## 2. Accès et URLs

| Élément | URL / Accès |
|---|---|
| **Application publique** | https://valmere-co.netlify.app |
| **API backend** | https://valmere-api.onrender.com |
| **Documentation API (Swagger)** | https://valmere-api.onrender.com/docs |
| **Repo GitHub** | https://github.com/Valmere/Project |
| **Dashboard Render** | https://dashboard.render.com (service : `valmere-api`) |
| **Dashboard Netlify** | https://app.netlify.com (site : `valmere-co`) |
| **Dashboard Supabase** | https://supabase.com (projet : `Valmere` / `igzcwqmuwuxdysqftomc`) |
| **Monitoring (UptimeRobot)** | https://uptimerobot.com (à configurer) |

---

## 3. Architecture technique

```
┌────────────────────────────────────────────────────────────┐
│  Frontend React + Vite + Tailwind                          │
│  Hébergé sur Netlify (CDN mondial, HTTPS auto)             │
│  https://valmere-co.netlify.app                            │
└─────────────────────┬──────────────────────────────────────┘
                      │ HTTPS (appels REST)
                      ▼
┌────────────────────────────────────────────────────────────┐
│  Backend FastAPI (Python 3.11)                             │
│  Hébergé sur Render (Free tier)                            │
│  https://valmere-api.onrender.com                          │
│                                                            │
│  - SQLAlchemy + Alembic (migrations)                       │
│  - pg8000 (driver PostgreSQL pur Python)                   │
│  - JWT pour l'authentification                             │
│  - WebAuthn pour la biométrie                              │
└─────────────────────┬──────────────────────────────────────┘
                      │ PostgreSQL via pooler
                      ▼
┌────────────────────────────────────────────────────────────┐
│  Supabase                                                  │
│   ├─ PostgreSQL 17 (base de données principale)            │
│   ├─ Storage : 2 buckets (`logos` public, `reports` privé) │
│   └─ Backups quotidiens automatiques                       │
└────────────────────────────────────────────────────────────┘
```

### Stack détaillée

| Couche | Technologie | Version |
|---|---|---|
| Frontend | React 19, Vite 8, Tailwind 3 | — |
| Backend | FastAPI, SQLAlchemy 2, Alembic | — |
| Base de données | PostgreSQL | 17.6 |
| Driver Python | pg8000 (pas psycopg2) | 1.31 |
| Auth | JWT (HS256) + WebAuthn 2.7 | — |
| Comptabilité | Double-entrée (33 comptes pré-amorcés) | — |
| Devises | HTG, USD, EUR avec FX historique figé | — |
| Langues | FR / EN / ES | — |

### Déploiement continu

- **Push sur `main`** → Render redéploie le backend (~3-5 min)
- **Push sur `main`** → Netlify redéploie le frontend (~2-3 min)

---

## 4. Rôles et permissions

La plateforme distingue **3 rôles** :

| Rôle | Description | Permissions |
|---|---|---|
| **admin** | Gestionnaire principal | Accès total — peut TOUT faire sans approbation |
| **cashier** | Caissier | Peut créer/modifier transactions, mais les actions sensibles passent en file d'approbation admin |
| **investor** | Investisseur | Voit UNIQUEMENT ses propres données — pas de modification |

### Actions sensibles soumises à approbation pour les cashiers

1. Suppression d'un investisseur
2. Annulation d'une transaction
3. Modification d'une transaction
4. Restauration d'une transaction supprimée
5. Replay d'une transaction
6. Création d'un utilisateur
7. Distribution de P&L

→ Le caissier déclenche l'action, l'admin valide depuis **Admin → Approbations**.

---

## 5. Fonctionnalités admin

### 5.1 Gestion des investisseurs (`/admin/investors`)

- **Créer** un investisseur (nom, email, téléphone, date d'entrée, durée d'engagement, capital initial)
- Si email fourni → un compte de connexion est auto-généré avec mot de passe temporaire
- **Modifier** un investisseur
- **Activer / Désactiver** (l'inactif est exclu des calculs, ses biens sont considérés liquides)
- **Réactiver** avec deux modes :
  - **Restaurer** : remet tout son historique
  - **Repartir à zéro** : nouveau départ
- **Supprimer** (admin seulement, cascade sur transactions/investments/reports)

### 5.2 Gestion des utilisateurs (`/admin/users`)

- Créer admin, caissier, ou investisseur
- Lier un utilisateur à un investisseur (pour les comptes investor)
- Reset mot de passe (génère un nouveau mot de passe temporaire)
- Activer / désactiver / supprimer

### 5.3 Transactions (`/admin/transactions`)

8 types de transactions supportés :

| Type | Effet | Cible |
|---|---|---|
| `deposit` | +capital investi | Investisseur |
| `withdrawal` | −capital investi | Investisseur |
| `gain` | +valeur actuelle | Investisseur |
| `loss` | −valeur actuelle | Investisseur |
| `fee` | −valeur actuelle | Investisseur |
| `bailout` | Recapitalise un investisseur à une VA cible | Investisseur |
| `company_withdrawal` | −balance société | Société |
| `company_bailout` | +balance société | Société |

#### Workflow particulier — quand un investisseur a une VA négative

→ Seul un `bailout` est autorisé tant que la VA n'est pas remise positive.
Tous les autres types sont bloqués (côté UI et backend).

#### Trash / Restore / Replay

- **Trash** (poubelle) : un admin peut "supprimer" une transaction → elle bascule en `status='voided'` et tous ses effets sont reversés (solde, comptabilité)
- **Restore** : remet la transaction en `active` et réapplique ses effets
- **Replay** : copie la transaction en une nouvelle (pratique pour les corrections)

### 5.4 Rapports (`/admin/reports`)

- Génération de relevés PDF par investisseur (toutes périodes ou intervalle)
- Programmation de publication différée
- Signature numérique (logo + signature admin)
- Partage par lien signé (expire après X jours)

### 5.5 Approbations (`/admin/approvals`)

File d'attente des actions sensibles demandées par les caissiers. L'admin :
- Voit le détail de la demande (qui, quoi, quand, raison)
- Peut **Approuver** (l'action est exécutée immédiatement)
- Peut **Rejeter** (avec justification)

### 5.6 Comptabilité (`/admin/accounting/*`)

- **Plan comptable** (`/chart`) : 33 comptes pré-amorcés selon les normes haïtiennes
- **Journal général** (`/journal`) : toutes les écritures comptables, posting manuel ou auto, audit FX
- **États financiers** (`/statements`) :
  - Balance de vérification (Trial Balance)
  - Compte de résultat (Income Statement)
  - Bilan (Balance Sheet)
- Devise d'affichage configurable (HTG, USD, EUR)

### 5.7 Paramètres (`/admin/settings`)

- Logo entreprise (upload vers Supabase Storage)
- Nom officiel
- Signature admin (canvas drawing ou upload)
- Taux de change personnalisés (`/admin/currency-rates`)

### 5.8 Messagerie (`/admin/messages`)

- Boîte de réception des messages envoyés par les investisseurs
- Réponse directe
- Broadcast email à tous les investisseurs actifs (via mailto bcc)

---

## 6. Workflow comptable

### Double-entrée automatique

Chaque transaction métier génère **automatiquement** une écriture comptable :

```
Exemple : un dépôt de 200 USD d'un investisseur (taux 130.48 USD→HTG)

  Journal entry #1 (date du dépôt)
  ─────────────────────────────────────────────────
  Compte 512 (Banque)             DÉBIT  26 096 HTG
  Compte 419 (Compte investisseur) CRÉDIT 26 096 HTG
  
  + Audit FX :
    original_amount = 200
    original_currency = USD
    fx_rate = 130.48 (figé à cette transaction)
```

### Taux FX historique figé

Quand une transaction est postée, le taux de change utilisé est **enregistré dans la ligne d'écriture**. Si demain le taux change à 135 USD→HTG, l'historique reste à 130.48. C'est ce qui permet l'audit fiscal/légal.

Un triangle d'avertissement `≈` apparaît dans le journal si la conversion a utilisé le taux courant (pas le taux historique) — typiquement pour les anciens enregistrements avant cette feature.

### Statuts des écritures

- `draft` : brouillon, modifiable, n'impacte pas les états financiers
- `posted` : validée, impacte les états financiers, irrémédiable sauf void
- `voided` : annulée (avec contre-écriture)

---

## 7. Distribution des P&L

Quand l'admin clique **Distribuer P&L** depuis Transactions :

1. Le système calcule le **P&L net** sur la période (gains − pertes − frais)
2. Si négatif → les investisseurs avec VA ≤ 0 sont **exclus** (ils ne participent pas à la perte au-delà de leur exposition)
3. La répartition se fait :
   - **80 %** pour la société (Valmere & Co)
   - **20 %** pour les investisseurs **au prorata de leur VA**
4. Aperçu en temps réel avant validation (debounce 400 ms)
5. Validation → création automatique de N transactions de type `gain` ou `loss`, chacune marquée `distribution_id`
6. Les transactions issues d'une distribution sont **non éditables individuellement**

→ Si une distribution est rejouée ou annulée, tous les enfants sont traités ensemble.

---

## 8. Sécurité

### Authentification

- **JWT HS256** avec rotation (`SECRET_KEY` en variable d'environnement)
- Durée de vie du token : 480 minutes (8 heures)
- Refresh manuel via re-login

### Biométrie (WebAuthn)

- Compatible Touch ID (Mac/iPhone), Windows Hello, empreinte Android
- Lié au domaine : `valmere-co.netlify.app`
- Si le domaine change, les enregistrements existants sont invalidés (sécurité standard WebAuthn)

### Mots de passe

- Hashés avec **bcrypt** (rounds par défaut)
- Force minimum non imposée côté backend — recommandation : 12+ caractères

### CORS

- Origine autorisée : `https://valmere-co.netlify.app` uniquement
- Modifié via la variable d'env `CORS_ORIGINS` sur Render
- Pour ajouter un domaine : `CORS_ORIGINS=https://valmere-co.netlify.app,https://autre-domaine.com`

### Audit logs

- Chaque action sensible est loggée dans la table `audit_logs`
- Trash/restore/replay tracés avec `voided_by`, `voided_at`, `restored_by`, `restored_at`, `replayed_by`, `replayed_at`
- Editions multiples comptabilisées via `edit_count` + `last_edit_reason`

---

## 9. Maintenance et exploitation

### Déployer une mise à jour

```bash
# 1. Cloner le repo (1ère fois seulement)
git clone https://github.com/Valmere/Project.git
cd Project

# 2. Faire les modifications dans le code
# 3. Commit + push
git add .
git commit -m "description du changement"
git push origin main

# 4. Render redéploie automatiquement le backend (~3-5 min)
# 5. Netlify redéploie automatiquement le frontend (~2-3 min)
```

### Voir les logs

| Plateforme | Où regarder |
|---|---|
| **Backend (Render)** | Dashboard Render → `valmere-api` → onglet **Logs** |
| **Frontend (Netlify)** | Dashboard Netlify → site → onglet **Deploys** → log du build |
| **DB (Supabase)** | Dashboard Supabase → projet → **Logs** → choisir Postgres/Auth/Storage |

### Backups

- **Supabase** : backups quotidiens automatiques, rétention 7 jours sur le plan gratuit
- Pour un export manuel : `pg_dump` depuis ton PC (commande dans la procédure d'urgence)

### Cold-start Render Free

Le tier gratuit met le backend en pause après 15 min d'inactivité. Le 1ᵉʳ visiteur après pause attend **50 secondes**.

**Solution** : configurer UptimeRobot (gratuit) pour ping `https://valmere-api.onrender.com/` toutes les 5 min → le backend ne s'endort jamais en heures ouvrables.

---

## 10. Coûts et limites

### Plans gratuits actuels

| Service | Plan | Limite |
|---|---|---|
| Render | Free | 750 h/mois (suffisant si UptimeRobot ping), 512 MB RAM |
| Netlify | Free | 100 GB bande passante/mois, builds illimités |
| Supabase | Free | 500 MB DB, 1 GB Storage, 2 GB bande passante, 50k MAU |
| GitHub | Free | Repos privés illimités |
| UptimeRobot | Free | 50 monitors, ping 5 min |

**Coût total mensuel : 0 €/$**

### Quand upgrader

Surveille ces seuils :

| Seuil | Action recommandée |
|---|---|
| DB Supabase > 400 MB | Upgrader Supabase Pro (~25 $/mois) |
| Bande passante Netlify > 80 GB/mois | Upgrader Netlify Pro (19 $/mois) ou ajouter Cloudflare CDN |
| Cold-start trop gênant pour les utilisateurs | Upgrader Render Starter (7 $/mois) — pas de spin down |
| Plus de 50 utilisateurs simultanés | Backend Render Standard (25 $/mois) |

### Estimation à 100-200 investisseurs actifs

Approximativement **25-40 $/mois** total (Render Starter + Supabase Pro).

---

## 11. Procédures d'urgence

### 🚨 La plateforme est inaccessible

1. Vérifier https://valmere-api.onrender.com/ → si 502/504 = Render down ou en cold-start
2. Vérifier https://app.netlify.com → status du dernier déploiement
3. Vérifier https://status.supabase.com pour incident DB

### 🚨 Erreur en production

1. **Logs Render** (onglet Logs) → chercher le traceback Python
2. **Sentry** (si configuré) → erreurs frontend + backend regroupées
3. Si erreur DB → vérifier connection string et statut Supabase

### 🚨 Restaurer un backup

```bash
# 1. Sur Supabase, créer un nouveau projet (ou utiliser un projet de staging)
# 2. Récupérer un backup quotidien (Supabase Dashboard → Database → Backups)
# 3. Restaurer le backup sur le nouveau projet
# 4. Mettre à jour DATABASE_URL sur Render avec la nouvelle URL
# 5. Redéployer
```

### 🚨 Rollback d'un déploiement

**Render** : Dashboard → service → onglet Events → trouver l'ancien déploiement OK → bouton **Rollback**

**Netlify** : Dashboard → site → onglet Deploys → trouver l'ancien déploiement OK → **Publish deploy**

### 🚨 Reset mot de passe d'un admin

Connexion à un autre compte admin → Admin → Utilisateurs → cliquer **Reset mot de passe** sur la ligne concernée → un nouveau mot de passe temporaire est généré.

Si **plus aucun admin n'est accessible** : connexion directe à la base via Supabase SQL Editor :

```sql
UPDATE users 
SET password_hash = '$2b$12$EXAMPLE_HASH_HERE'  -- nouveau hash bcrypt
WHERE email = 'admin@valmere.com';
```

(Le hash bcrypt peut être généré via Python : `import bcrypt; bcrypt.hashpw(b'mot_de_passe', bcrypt.gensalt())`)

---

## 12. Comptes et identifiants critiques

> ⚠️ **À garder dans un coffre-fort numérique** (Bitwarden, 1Password, etc.) — **JAMAIS** dans un fichier git.

### Liste des accès à transmettre au nouvel admin

| Service | Type | Détail |
|---|---|---|
| GitHub | OAuth | Compte `Valmere` |
| Render | Email + password | `email@entreprise.com` |
| Netlify | Email + password (ou GitHub) | `email@entreprise.com` |
| Supabase | Email + password | `email@entreprise.com` |
| UptimeRobot | Email + password | `email@entreprise.com` |
| Compte admin app | Email + password | `admin@valmere.com` (à reset au 1er login) |

### Variables sensibles dans `Render → Environment`

```
DATABASE_URL          : connection string PostgreSQL
DIRECT_URL            : connection string PostgreSQL (port 5432)
SECRET_KEY            : clé JWT (64 chars random)
SUPABASE_SERVICE_KEY  : clé service Supabase (préfixe sb_secret_)
CORS_ORIGINS          : domaines autorisés
WEBAUTHN_RP_ID        : domaine pour la biométrie
WEBAUTHN_ORIGIN       : URL complète pour la biométrie
```

→ Ces variables sont visibles dans Render Environment. Pour les remplacer, modifier la valeur + Save Changes → Render redéploie automatiquement.

---

## 📞 Support technique

En cas de problème non couvert par ce guide :

- **Documentation Render** : https://render.com/docs
- **Documentation Netlify** : https://docs.netlify.com
- **Documentation Supabase** : https://supabase.com/docs
- **Documentation FastAPI** : https://fastapi.tiangolo.com

Pour le code métier (calculs P&L, distribution, comptabilité), consulter :
- `backend/app/services/portfolio_math.py` (source de vérité pour VA / P&L / capital investi)
- `backend/app/services/distribution_service.py` (logique de distribution 80/20)
- `backend/app/services/accounting_posting.py` (posting automatique en comptabilité)
- `backend/app/services/approvals_service.py` (workflow d'approbation)

---

*Document interne — Valmere & Co — Reproduction et diffusion réservées à l'équipe technique.*
