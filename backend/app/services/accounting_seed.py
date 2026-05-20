"""
Plan comptable par défaut pour Valmere — orienté gestion d'investisseurs.

Structure codifiée à 2 / 3 niveaux, inspirée du plan SYSCOHADA / français
mais allégée. Idempotent : rejouable sans dupliquer.

Comptes-clés pour Valmere :
  • 512x : banques par devise (HTG / USD / EUR / CAD)
  • 421  : comptes investisseurs (passif — ce que l'entreprise leur doit)
  • 706  : revenus de gestion / commissions
  • 766  : gains financiers sur placements
  • 767  : gains financiers investisseurs
  • 666  : pertes financières sur placements
  • 667  : pertes financières investisseurs
"""
from sqlalchemy.orm import Session
from app.models.account import Account


# (code, name, type, is_postable, parent_code)
# is_postable=False → compte "header" (n'accueille pas d'écritures directes,
# sert de totalisation).
DEFAULT_COA: list[tuple[str, str, str, bool, str | None]] = [
    # ── 1. CAPITAUX PROPRES ────────────────────────────────────────────────
    ("1",    "Capitaux propres",             "equity",    False, None),
    ("101",  "Capital social",               "equity",    True,  "1"),
    ("106",  "Réserves",                     "equity",    True,  "1"),
    ("120",  "Résultat de l'exercice",       "equity",    True,  "1"),
    ("110",  "Résultats reportés",           "equity",    True,  "1"),

    # ── 2. IMMOBILISATIONS (Actif non courant) ─────────────────────────────
    ("2",    "Immobilisations",              "asset",     False, None),
    ("215",  "Installations & matériel",     "asset",     True,  "2"),
    ("218",  "Matériel informatique",        "asset",     True,  "2"),

    # ── 4. TIERS ───────────────────────────────────────────────────────────
    ("4",    "Tiers",                        "liability", False, None),
    ("401",  "Fournisseurs",                 "liability", True,  "4"),
    ("411",  "Clients",                      "asset",     True,  "4"),
    ("421",  "Comptes investisseurs",        "liability", True,  "4"),
    ("445",  "Taxes à reverser",             "liability", True,  "4"),
    ("467",  "Autres créanciers",            "liability", True,  "4"),

    # ── 5. TRÉSORERIE (Actif courant) ──────────────────────────────────────
    ("5",    "Trésorerie",                   "asset",     False, None),
    ("512",  "Banque",                       "asset",     False, "5"),
    ("5121", "Banque HTG",                   "asset",     True,  "512"),
    ("5122", "Banque USD",                   "asset",     True,  "512"),
    ("5123", "Banque EUR",                   "asset",     True,  "512"),
    ("5124", "Banque CAD",                   "asset",     True,  "512"),
    ("530",  "Caisse",                       "asset",     True,  "5"),

    # ── 6. CHARGES ─────────────────────────────────────────────────────────
    ("6",    "Charges",                      "expense",   False, None),
    ("601",  "Achats & prestations",         "expense",   True,  "6"),
    ("621",  "Personnel",                    "expense",   True,  "6"),
    ("627",  "Services bancaires",           "expense",   True,  "6"),
    ("666",  "Pertes financières",           "expense",   True,  "6"),
    ("667",  "Pertes financières investisseurs", "expense", True, "6"),
    ("668",  "Pertes de change",             "expense",   True,  "6"),

    # ── 7. PRODUITS ────────────────────────────────────────────────────────
    ("7",    "Produits",                     "revenue",   False, None),
    ("706",  "Commissions de gestion",       "revenue",   True,  "7"),
    ("766",  "Gains financiers",             "revenue",   True,  "7"),
    ("767",  "Gains financiers investisseurs", "revenue", True,  "7"),
    ("768",  "Gains de change",              "revenue",   True,  "7"),
]


def seed_default_coa(db: Session, *, overwrite: bool = False) -> dict:
    """
    Crée les comptes par défaut s'ils n'existent pas. Rejouable.
    Retourne un petit résumé {created, skipped}.
    """
    existing = {a.code: a for a in db.query(Account).all()}
    created = 0
    skipped = 0

    # Premier passage : créer tous les comptes (sans parent), pour pouvoir
    # ensuite résoudre les parent_id par code.
    for code, name, a_type, is_postable, _parent in DEFAULT_COA:
        if code in existing and not overwrite:
            skipped += 1
            continue
        acc = Account(
            code=code,
            name=name,
            type=a_type,
            is_postable=is_postable,
            is_active=True,
            currency="HTG",
            sort_order=int(code[:3]) if code[:3].isdigit() else 0,
        )
        db.add(acc)
        db.flush()  # pour obtenir l'id
        existing[code] = acc
        created += 1

    # Deuxième passage : brancher les parents
    for code, _name, _a_type, _is_postable, parent_code in DEFAULT_COA:
        if parent_code and code in existing:
            child = existing[code]
            parent = existing.get(parent_code)
            if parent and child.parent_id != parent.id:
                child.parent_id = parent.id

    db.commit()
    return {"created": created, "skipped": skipped}
