import json
import re
import unicodedata
from functools import lru_cache
from urllib.parse import urlencode
from urllib.request import Request, urlopen


SUPPORTED_LANGS = {"fr", "en", "es"}


def lang_code(lang: str | None) -> str:
    normalized = (lang or "fr").lower()[:2]
    return normalized if normalized in SUPPORTED_LANGS else "fr"


def as_translations(value: str | None) -> dict[str, str]:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
        if isinstance(parsed, dict):
            return {str(k)[:2].lower(): str(v or "") for k, v in parsed.items()}
    except (TypeError, ValueError):
        pass
    return {"fr": value}


def store_translation(current: str | None, lang: str, value: str | None) -> str | None:
    active_lang = lang_code(lang)
    translations = as_translations(current)
    translations[active_lang] = value or ""
    translations = _fill_missing_translations(translations, active_lang)
    if set(translations.keys()) == {"fr"}:
        return translations.get("fr") or None
    return json.dumps(translations, ensure_ascii=False)


def _norm(text: str | None) -> str:
    raw = unicodedata.normalize("NFKD", text or "")
    ascii_text = "".join(ch for ch in raw if not unicodedata.combining(ch))
    ascii_text = ascii_text.replace("&", " et ")
    ascii_text = re.sub(r"[^a-zA-Z0-9]+", " ", ascii_text.lower())
    return re.sub(r"\s+", " ", ascii_text).strip()


EXACT_TRANSLATIONS: dict[str, dict[str, str]] = {
    _norm("Pourquoi tu as fait choix de Valmere & co ?"): {
        "en": "Why did you choose Valmere & Co?",
        "es": "Por que elegiste Valmere & Co?",
    },
    _norm("Pourquoi tu as fait choix de Valmere & Co ?"): {
        "en": "Why did you choose Valmere & Co?",
        "es": "Por que elegiste Valmere & Co?",
    },
    _norm("Service rapide"): {
        "en": "Fast service",
        "es": "Servicio rapido",
    },
    _norm("Investisseurs"): {
        "en": "Investors",
        "es": "Inversores",
    },
    _norm("Commercial"): {
        "en": "Commercial",
        "es": "Comercial",
    },
}


PHRASE_TRANSLATIONS: dict[str, list[tuple[str, str]]] = {
    "en": [
        ("valmere & co", "Valmere & Co"),
        ("valmere et co", "Valmere & Co"),
        ("service rapide", "fast service"),
        ("investisseurs", "investors"),
        ("investisseur", "investor"),
        ("choix", "choice"),
        ("pourquoi", "why"),
        ("rapide", "fast"),
        ("service", "service"),
        ("mission", "mission"),
        ("vision", "vision"),
        ("equipe", "team"),
        ("historique", "history"),
        ("histoire", "history"),
        ("contact", "contact"),
    ],
    "es": [
        ("valmere & co", "Valmere & Co"),
        ("valmere et co", "Valmere & Co"),
        ("service rapide", "servicio rapido"),
        ("investisseurs", "inversores"),
        ("investisseur", "inversor"),
        ("choix", "eleccion"),
        ("pourquoi", "por que"),
        ("rapide", "rapido"),
        ("service", "servicio"),
        ("mission", "mision"),
        ("vision", "vision"),
        ("equipe", "equipo"),
        ("historique", "historial"),
        ("histoire", "historia"),
        ("contact", "contacto"),
    ],
}


def _fallback_translate(text: str | None, target_lang: str) -> str | None:
    if not text:
        return ""
    target = lang_code(target_lang)
    if target == "fr":
        return text

    lines = str(text).splitlines()
    translated_lines = []
    changed = False
    for line in lines:
        stripped = line.strip()
        exact = EXACT_TRANSLATIONS.get(_norm(stripped), {}).get(target)
        if exact:
            translated_lines.append(line.replace(stripped, exact))
            changed = True
            continue

        translated = stripped
        lowered = _norm(translated)
        for src, dst in PHRASE_TRANSLATIONS.get(target, []):
            src_norm = _norm(src)
            if src_norm == lowered:
                translated = dst
                changed = True
                break
        translated_lines.append(line.replace(stripped, translated) if stripped else line)

    return "\n".join(translated_lines) if changed else None


@lru_cache(maxsize=1024)
def _remote_translate_cached(text: str, target_lang: str) -> str | None:
    """
    Traduction automatique générique.

    On utilise l'endpoint public Google Translate `gtx` pour éviter d'ajouter
    une clé API au projet. Si l'utilisateur est hors ligne ou si le service est
    indisponible, on retourne None et l'appelant retombe sur le texte source.
    """
    target = lang_code(target_lang)
    if target == "fr" or not text.strip():
        return text

    try:
        query = urlencode({
            "client": "gtx",
            "sl": "auto",
            "tl": target,
            "dt": "t",
            "q": text,
        })
        request = Request(
            f"https://translate.googleapis.com/translate_a/single?{query}",
            headers={"User-Agent": "ValmereInvestorPortal/1.0"},
        )
        with urlopen(request, timeout=6) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return None

    try:
        chunks = payload[0] or []
        translated = "".join(str(part[0] or "") for part in chunks if part)
        translated = translated.strip()
    except Exception:
        translated = ""

    if translated:
        return translated

    try:
        query = urlencode({
            "q": text,
            "langpair": f"fr|{target}",
        })
        request = Request(
            f"https://api.mymemory.translated.net/get?{query}",
            headers={"User-Agent": "ValmereInvestorPortal/1.0"},
        )
        with urlopen(request, timeout=6) as response:
            payload = json.loads(response.read().decode("utf-8"))
        translated = str((payload.get("responseData") or {}).get("translatedText") or "").strip()
        return translated or None
    except Exception:
        return None


def translate_text(text: str | None, target_lang: str) -> str:
    if not text:
        return ""
    target = lang_code(target_lang)
    if target == "fr":
        return text

    remote = _remote_translate_cached(str(text), target)
    if remote:
        return remote

    fallback = _fallback_translate(text, target)
    return fallback if fallback is not None else text


def try_translate_text(text: str | None, target_lang: str) -> str | None:
    if not text:
        return ""
    target = lang_code(target_lang)
    if target == "fr":
        return text

    remote = _remote_translate_cached(str(text), target)
    if remote:
        return remote
    return _fallback_translate(text, target)


def _fill_missing_translations(translations: dict[str, str], source_lang: str) -> dict[str, str]:
    source = translations.get(source_lang) or next((v for v in translations.values() if v), "")
    if not source:
        return translations

    for target in SUPPORTED_LANGS - {source_lang}:
        if translations.get(target):
            continue
        translated = try_translate_text(source, target)
        if translated:
            translations[target] = translated
    return translations


def localized(value: str | None, lang: str, *, auto_translate: bool = True) -> str | None:
    translations = as_translations(value)
    active_lang = lang_code(lang)
    if translations.get(active_lang):
        return translations[active_lang]

    source = (
        translations.get("fr")
        or translations.get("en")
        or translations.get("es")
        or next((v for v in translations.values() if v), None)
    )
    if not source:
        return None
    if auto_translate and active_lang != "fr":
        return translate_text(source, active_lang)
    return source
