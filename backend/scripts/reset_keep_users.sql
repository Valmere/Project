-- ════════════════════════════════════════════════════════════════════
-- RESET de la plateforme Valmere & Co
-- ────────────────────────────────────────────────────────────────────
-- Garde : users, webauthn_credentials, accounts (plan comptable),
--         currency_rates, company_settings, about_page, faq_items
-- Supprime : tout le reste (transactions, investisseurs, comptabilité,
--            rapports, approbations, messages, audit, performances)
--
-- À exécuter dans une transaction : tout passe ou rien ne passe.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Délie les users de leurs investisseurs (on va supprimer les investors)
UPDATE users SET investor_id = NULL WHERE investor_id IS NOT NULL;

-- 2. Suppression dans l'ordre inverse des dépendances FK
--    (enfants d'abord, parents ensuite)

-- Reports → dépendent d'investors
TRUNCATE TABLE reports CASCADE;

-- Messages → dépendent d'users mais on garde les users, donc on truncate
TRUNCATE TABLE messages CASCADE;

-- Pending actions (approbations) → peuvent référencer plein de choses
TRUNCATE TABLE pending_actions CASCADE;

-- Audit logs
TRUNCATE TABLE audit_logs CASCADE;

-- Performances
TRUNCATE TABLE performances CASCADE;

-- Journal comptable : lines d'abord, entries ensuite
TRUNCATE TABLE journal_lines CASCADE;
TRUNCATE TABLE journal_entries CASCADE;

-- Transactions
TRUNCATE TABLE transactions CASCADE;

-- Investments (portefeuilles)
TRUNCATE TABLE investments CASCADE;

-- Investors (en dernier car parent de tout ce qui précède)
TRUNCATE TABLE investors CASCADE;

-- 3. Vérification : combien d'enregistrements restent ?
SELECT
  (SELECT COUNT(*) FROM users)                AS users_kept,
  (SELECT COUNT(*) FROM webauthn_credentials) AS webauthn_kept,
  (SELECT COUNT(*) FROM accounts)             AS chart_of_accounts_kept,
  (SELECT COUNT(*) FROM currency_rates)       AS rates_kept,
  (SELECT COUNT(*) FROM investors)            AS investors_remaining,
  (SELECT COUNT(*) FROM transactions)         AS transactions_remaining,
  (SELECT COUNT(*) FROM journal_entries)      AS journal_remaining,
  (SELECT COUNT(*) FROM reports)              AS reports_remaining;

-- Si la vérif ci-dessus montre 0 partout sauf users/webauthn/accounts/rates :
-- COMMIT;
-- Sinon :
-- ROLLBACK;

-- ⚠️ Décommente l'une des deux lignes ci-dessous APRÈS avoir vu le résultat
-- de la vérification :
--
-- COMMIT;
-- ROLLBACK;
