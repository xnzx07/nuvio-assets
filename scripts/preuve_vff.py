"""Preuve qu'un film a une VF de France, sans passer par le débrideur (utilisée par scripts/build_sans_vf.py).

Une preuve suffit pour classer un film « vf » ; son absence ne prouve rien (le film passe alors par l'avis de l'addon).
1. RS Doublage (rsdoublage.com, ~20 000 films et téléfilms doublés en France) : son index par titre français (54 pages,
   lu une fois par passage, seulement s'il y a un film à examiner), puis la fiche du film, qui doit avoir la même année
   (±1 an) et le même réalisateur : deux films peuvent porter le même titre (« Obsessed » 2009 et 2014). Lu avec
   Scrapling, sans protection à franchir (pas de robots.txt, pas de conditions contre la lecture), une page par seconde.
2. Wikipédia FR (API, CC BY-SA) : la distribution de l'article note le comédien de doublage, « (VF : …) ». « VQ »
   (Québec) seul ne compte pas, ni « VFB » : seule la VF de France compte.
Scrapling absent ou site muet : pas de preuve, jamais d'erreur (le film suit le chemin habituel).
"""
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

RSD = "https://www.rsdoublage.com"
AGENT = {"User-Agent": "catalogue-fr-nuit"}
PAUSE_S = 1.0
_index: dict | None = None


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def mots(nom: str) -> set[str]:
    return {w for w in norm(nom).split() if len(w) >= 3}


def _page(url: str):
    from scrapling.fetchers import Fetcher   # seulement ici : sans Scrapling, pas de preuve RS Doublage
    time.sleep(PAUSE_S)
    p = Fetcher.get(url, stealthy_headers=True, timeout=30)
    return p if p.status == 200 else None


def index_rsdoublage() -> dict:
    """{ titre normalisé: [adresses des fiches] } ; {} si illisible."""
    global _index
    if _index is not None:
        return _index
    _index = {}
    try:
        for genre in ("films", "telefilms"):
            for lettre in ["nb"] + [chr(c) for c in range(97, 123)]:
                p = _page(f"{RSD}/{genre}-{lettre}.html")
                for a in (p.css("p.liste a") if p else []):
                    href = a.attrib.get("href", "")
                    if re.match(r"(?:tele)?film-\d+", href):
                        _index.setdefault(norm(a.css("span::text").get() or ""), []).append(href)
    except Exception as e:  # noqa: BLE001 — Scrapling absent, site muet : pas de preuve
        print(f"RS Doublage illisible ({e})", file=sys.stderr)
        _index = {}
    return _index


def lire_fiche(texte: str) -> dict:
    """Année, réalisation et nombre de voix d'une fiche RS Doublage (son texte, une valeur par ligne)."""
    lignes = [x.strip() for x in texte.splitlines() if x.strip()]
    def apres(cle):
        return lignes[lignes.index(cle) + 1] if cle in lignes and lignes.index(cle) + 1 < len(lignes) else ""
    annee = re.match(r"\d{4}", apres("Année :"))
    voix = 0
    if "Distribution :" in lignes:
        voix = sum(1 for x in lignes[lignes.index("Distribution :") + 1:] if x.startswith("(")) or 0
    return {"annee": int(annee.group()) if annee else 0, "real": apres("Réalisation :"), "voix": voix}


def preuve_rsdoublage(titres: list[str], annee: int, realisateurs: set[str]) -> bool:
    """Le film (un de ses titres, son année, un de ses réalisateurs) a-t-il sa fiche chez RS Doublage ?"""
    if not realisateurs or not annee:
        return False
    idx = index_rsdoublage()
    vues = set()
    for t in titres:
        for href in idx.get(norm(t), []):
            if href in vues:
                continue
            vues.add(href)
            try:
                p = _page(f"{RSD}/{href}")
            except Exception:  # noqa: BLE001
                continue
            if not p:
                continue
            f = lire_fiche(p.get_all_text(separator="\n", strip=True))
            if f["annee"] and abs(f["annee"] - annee) <= 1 and mots(f["real"]) & realisateurs and f["voix"]:
                return True
    return False


# « (VF : José Luccioni ; VQ : …) », « (VQ : … ; VF : …) », « ([[Version française|VF]] : …) ». « VFQ : », « VFB : »
# ne passent pas : après VF ou VFF, le deux-points.
VF_WIKI = re.compile(r"[(;]\s*(?:\[\[[^\]|]*\|)?VFF?(?:\]\])?\s*:")


def a_une_vf(wikitext: str) -> bool:
    """Le texte d'un article Wikipédia FR note-t-il un comédien de VF de France (« VF : », « VFF : ») ?"""
    return bool(VF_WIKI.search(wikitext or ""))


def preuve_wikipedia(wikidata_id: str) -> bool:
    if not wikidata_id:
        return False
    try:
        q = urllib.parse.urlencode({"action": "wbgetentities", "ids": wikidata_id, "props": "sitelinks",
                                    "sitefilter": "frwiki", "format": "json"})
        with urllib.request.urlopen(urllib.request.Request(f"https://www.wikidata.org/w/api.php?{q}", headers=AGENT), timeout=30) as r:
            lien = (((json.load(r).get("entities") or {}).get(wikidata_id) or {}).get("sitelinks") or {}).get("frwiki")
        if not lien:
            return False
        q = urllib.parse.urlencode({"action": "parse", "page": lien["title"], "prop": "wikitext", "format": "json",
                                    "formatversion": 2, "redirects": 1})
        with urllib.request.urlopen(urllib.request.Request(f"https://fr.wikipedia.org/w/api.php?{q}", headers=AGENT), timeout=30) as r:
            return a_une_vf(json.load(r).get("parse", {}).get("wikitext", ""))
    except Exception as e:  # noqa: BLE001 — Wikipédia muet : pas de preuve
        print(f"Wikipédia illisible pour {wikidata_id} ({e})", file=sys.stderr)
        return False


def preuve_vff(fiche: dict) -> str | None:
    """« rsdoublage » ou « wikipedia » si une source prouve la VF de France du film (fiche TMDB avec credits et
    external_ids), sinon None."""
    annee = int((fiche.get("release_date") or "0")[:4] or 0)
    crew = (fiche.get("credits") or {}).get("crew") or []
    reals = set().union(*[mots(c.get("name") or "") for c in crew if c.get("job") == "Director"] or [set()])
    titres = [t for t in dict.fromkeys([fiche.get("title"), fiche.get("original_title")]) if t]
    if preuve_rsdoublage(titres, annee, reals):
        return "rsdoublage"
    if preuve_wikipedia((fiche.get("external_ids") or {}).get("wikidata_id")):
        return "wikipedia"
    return None
