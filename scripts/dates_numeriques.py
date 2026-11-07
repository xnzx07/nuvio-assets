"""Dates de sortie numérique américaine annoncées, d'après dvdsreleasedates.com (utilisé par build_fenetres_vod.py).

TMDB n'a souvent la sortie numérique américaine qu'une fois passée : avant, l'addon n'avait qu'une estimation (Street
Fighter « vers le 17 nov. », annoncé pour le 1er déc. ; The Social Reckoning, Klara et le Soleil). dvdsreleasedates.com
publie les dates annoncées par les studios (« Digital HD Release Date December 1, 2026 ») avec l'identifiant IMDb du film :
on cherche le titre, on garde le résultat qui a le même identifiant IMDb (aucun autre film ne passe), puis on lit sa
fiche. robots.txt : tout permis sauf l'administration ; une page par PAUSE_S secondes. Rien de trouvé, ou site muet :
None (l'estimation reste).
"""
import datetime as dt
import re
import time
import urllib.error
import urllib.parse
import urllib.request

SITE = "https://www.dvdsreleasedates.com"
AGENT = {"User-Agent": "catalogue-fr-nuit (dates de sortie numérique)"}
PAUSE_S = 1.0
MOIS = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august", "september",
                                    "october", "november", "december"], 1)}


def _lire(url: str, data: bytes | None = None) -> tuple[str, str]:
    """(adresse finale, page) : une recherche au titre exact redirige directement vers la fiche du film."""
    time.sleep(PAUSE_S)
    req = urllib.request.Request(url, data=data, headers=AGENT)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.geturl(), r.read().decode("utf-8", "replace")


def fiche_de(html: str, imdb: str) -> str | None:
    """L'adresse de la fiche du film dans une page de résultats, d'après son identifiant IMDb (« imdb: <a href=…/tt…/ »)."""
    for m in re.finditer(r"href='(/movies/\d+/[^']+)'.{0,800}?imdb\.com/title/(tt\d+)/", html, re.S):
        if m.group(2) == imdb:
            return m.group(1)
    return None


def imdb_de_la_fiche(html: str) -> str | None:
    """L'identifiant IMDb d'une fiche de film (le premier lien IMDb de la page, celui du film)."""
    m = re.search(r"imdb\.com/title/(tt\d+)/", html)
    return m.group(1) if m else None


def date_numerique(html: str) -> str | None:
    """« Digital HD Release Date December 1, 2026 » → « 2026-12-01 » ; None si pas annoncée."""
    texte = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)).replace("&nbsp;", " ")
    m = re.search(r"Digital HD Release Date\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})", texte)
    if not m or m.group(1).lower() not in MOIS:
        return None
    try:
        return dt.date(int(m.group(3)), MOIS[m.group(1).lower()], int(m.group(2))).isoformat()
    except ValueError:
        return None


def date_annoncee(titre: str, imdb: str) -> str | None:
    """La sortie numérique américaine annoncée d'un film (AAAA-MM-JJ), ou None."""
    if not titre or not imdb:
        return None
    try:
        url, page = _lire(f"{SITE}/search/", urllib.parse.urlencode({"searchStr": titre}).encode())
        if "/movies/" in url:      # titre exact : la fiche directement
            return date_numerique(page) if imdb_de_la_fiche(page) == imdb else None
        lien = fiche_de(page, imdb)
        return date_numerique(_lire(SITE + lien)[1]) if lien else None
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        return None
