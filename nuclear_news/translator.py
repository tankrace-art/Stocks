"""
English to Korean news title translator.
Uses Google Translate via deep-translator.
"""

from deep_translator import GoogleTranslator


_translator = None


def _get_translator():
    global _translator
    if _translator is None:
        _translator = GoogleTranslator(source="en", target="ko")
    return _translator


def translate_to_korean(text: str) -> str:
    """Translate English text to Korean. Returns original on failure."""
    if not text:
        return text
    try:
        result = _get_translator().translate(text)
        return result if result else text
    except Exception:
        return text


def batch_translate(texts: list[str]) -> list[str]:
    """Translate a list of texts to Korean."""
    results = []
    for text in texts:
        results.append(translate_to_korean(text))
    return results
