"""
Réinitialisation complète des données dynamiques de la plateforme.

Effet par défaut :
  - Supprime toutes les `transactions`
  - Supprime tous les `journal_entries` (cascade → journal_lines)
  - Supprime toutes les `performances` (snapshots dérivés)
  - Supprime tous les `reports` (PDF générés, listés dans la section Rapports)
  - Réinitialise chaque `investments.current_value = initial_capital`

Avec --zero-balances en plus :
  - Met aussi `initial_capital = 0` ET `current_value = 0` pour TOUS les
    investments. Idéal pour repartir sur une plateforme « complètement vide » :
    AUM dashboard = 0, et chaque investisseur recommence sans capital.
    (Les investisseurs eux-mêmes restent — pas leurs soldes.)

Conserve dans tous les cas :
  - Investisseurs (dont la personne morale Valmere & Co)
  - Investments (entités), mais leurs soldes peuvent être remis à zéro
  - Utilisateurs et leurs comptes de connexion
  - Plan comptable (`accounts`), taux de change, paramètres société, FAQ, etc.

Usage (depuis backend/, venv activé) :

    python -m scripts.reset_transactions --dry-run
    python -m scripts.reset_transactions --confirm
    python -m scripts.reset_transactions --confirm --zero-balances

Sans --confirm le script ne touche RIEN, c'est volontaire.
"""
from __future__ import annotations

import argparse
import sys

from sqlalchemy import func

# Imports relatifs au module app/ (le backend doit être dans le PYTHONPATH —
# c'est le cas quand on lance `python -m scripts.reset_transactions` depuis
# le dossier backend/).
from app.database import SessionLocal
from app.models.investment import Investment
from app.models.investor import Investor
from app.models.journal_entry import JournalEntry, JournalLine
from app.models.performance import Performance
from app.models.report import Report
from app.models.transaction import Transaction


def main() -> int:
    parser = argparse.ArgumentParser(description="Reset platform dynamic data.")
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Confirme l'opération (requis — sans ce flag, dry-run uniquement).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Affiche ce qui serait fait, sans rien modifier.",
    )
    parser.add_argument(
        "--zero-balances",
        action="store_true",
        help=(
            "En plus du reset par défaut, remet `initial_capital` ET "
            "`current_value` à 0 pour tous les investments. Permet d'avoir "
            "AUM = 0 sur le dashboard."
        ),
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        # ─── Inventaire ──────────────────────────────────────────────
        n_tx = db.query(func.count(Transaction.id)).scalar() or 0
        n_je = db.query(func.count(JournalEntry.id)).scalar() or 0
        n_jl = db.query(func.count(JournalLine.id)).scalar() or 0
        n_perf = db.query(func.count(Performance.id)).scalar() or 0
        n_reports = db.query(func.count(Report.id)).scalar() or 0
        n_inv = db.query(func.count(Investment.id)).scalar() or 0
        n_investors = db.query(func.count(Investor.id)).scalar() or 0

        print("─" * 60)
        print("État actuel de la base :")
        print(f"  • {n_investors} investisseurs (préservés)")
        print(f"  • {n_inv} investments (préservés)")
        print(f"  • {n_tx} transactions       → suppression")
        print(f"  • {n_je} journal_entries    → suppression")
        print(f"  • {n_jl} journal_lines      → suppression (cascade)")
        print(f"  • {n_perf} performances     → suppression")
        print(f"  • {n_reports} reports         → suppression")
        if args.zero_balances:
            print(f"  • Soldes investments       → remis à 0 (initial_capital + current_value)")
        else:
            print(f"  • Soldes investments       → current_value = initial_capital")
        print("─" * 60)

        if not args.confirm:
            print("\nMode dry-run (aucune écriture en base).")
            print("Pour exécuter pour de vrai :")
            print("  • Reset standard           : --confirm")
            print("  • Reset complet (AUM = 0)  : --confirm --zero-balances")
            return 0

        # ─── Exécution ────────────────────────────────────────────────
        # Ordre important : enfants avant parents.
        deleted_tx = db.query(Transaction).delete(synchronize_session=False)
        deleted_perf = db.query(Performance).delete(synchronize_session=False)
        deleted_reports = db.query(Report).delete(synchronize_session=False)
        # Lignes du journal d'abord (cascade DB pas garantie sur tous setups),
        # puis les en-têtes.
        deleted_jl = db.query(JournalLine).delete(synchronize_session=False)
        deleted_je = db.query(JournalEntry).delete(synchronize_session=False)

        # Reset des soldes des investments.
        investments = db.query(Investment).all()
        reset_count = 0
        for inv in investments:
            if args.zero_balances:
                # Plateforme totalement vide : capital initial ET balance = 0.
                # L'investisseur existe, mais sans aucun argent au pot.
                if float(inv.initial_capital or 0) != 0 or float(inv.current_value or 0) != 0:
                    inv.initial_capital = 0
                    inv.current_value = 0
                    reset_count += 1
            else:
                # Reset standard : on revient au capital initial d'origine.
                old = float(inv.current_value or 0)
                new = float(inv.initial_capital or 0)
                if old != new:
                    inv.current_value = new
                    reset_count += 1

        db.commit()

        print("\n✅ Réinitialisation terminée.")
        print(f"  • {deleted_tx} transactions supprimées")
        print(f"  • {deleted_perf} performances supprimées")
        print(f"  • {deleted_reports} reports supprimés")
        print(f"  • {deleted_je} journal_entries supprimées")
        print(f"  • {deleted_jl} journal_lines supprimées")
        print(f"  • {reset_count} investments mis à jour")
        if args.zero_balances:
            print("\nAUM = 0 sur le dashboard. Plateforme prête pour des tests à neuf.")
        else:
            print("\nLes balances sont revenues à leur capital initial.")
            print("Si vous voulez aussi AUM = 0, relancez avec --zero-balances.")
        return 0

    except Exception as e:
        db.rollback()
        print(f"\n❌ Erreur : {e}", file=sys.stderr)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
