"""Preuve qu'un film ou une série a une VF de France, sans passer par le débrideur (utilisée par scripts/build_sans_vf.py).

Une preuve suffit pour classer un titre « vf » ; son absence ne prouve rien (le titre passe alors par l'avis de
l'addon). Ces sources ne servent jamais à dire « pas de VF » : une édition récente en VO seule ne dit rien d'une VF plus
ancienne (Les Sept Samouraïs), et aucune d'elles ne connaît tout.
1. RS Doublage (rsdoublage.com, films, téléfilms et séries doublés en France) : son index par titre français (81 pages,
   lu une fois par passage, seulement s'il y a un titre à examiner), puis la fiche, qui doit avoir la même année
   (±1 an) et le même réalisateur (le créateur pour une série) : deux films peuvent porter le même titre (« Obsessed »
   2009 et 2014). Lu avec Scrapling, sans protection à franchir (pas de robots.txt, pas de conditions contre la
   lecture), une page par seconde. Les séries depuis le 2026-11-09 (Le Protecteur, The IT Crowd).
2. Wikipédia FR (API, CC BY-SA) : la distribution de l'article note le comédien de doublage, « (VF : …) » ou
   « {{Doublage|VF=…}} ». « VQ » (Québec) seul ne compte pas, ni « VFB » : seule la VF de France compte.
3. Catalogue de la BnF (API SRU, libre d'accès) : le dépôt légal de chaque édition vidéo parue en France (VHS, DVD,
   Blu-ray), avec ses pistes son (UNIMARC 101 $a ; $j : les sous-titres). Une édition au même titre, d'un des
   réalisateurs, parue l'année du film ou après, avec une piste « fre » : la VF existe. « mul » (plusieurs langues sans
   détail) ne compte pas. Les notices des séries n'ont souvent pas de réalisateur : elles ne passent pas.
Scrapling absent ou site muet : pas de preuve, jamais d'erreur (le titre suit le chemin habituel).
"""
import html
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

RSD = "https://www.rsdoublage.com"
BNF = "https://catalogue.bnf.fr/api/SRU"
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
        for genre in ("films", "telefilms", "series"):
            for lettre in ["nb"] + [chr(c) for c in range(97, 123)]:
                p = _page(f"{RSD}/{genre}-{lettre}.html")
                for a in (p.css("p.liste a") if p else []):
                    href = a.attrib.get("href", "")
                    if re.match(r"(?:(?:tele)?film|serie)-\d+", href):
                        _index.setdefault(norm(a.css("span::text").get() or ""), []).append(href)
    except Exception as e:  # noqa: BLE001 — Scrapling absent, site muet : pas de preuve
        print(f"RS Doublage illisible ({e})", file=sys.stderr)
        _index = {}
    return _index


def lire_fiche(texte: str) -> dict:
    """Année, réalisation (création pour une série) et nombre de voix d'une fiche RS Doublage (son texte, une valeur
    par ligne). Une série : « Année : 2006/2013 », la première compte."""
    lignes = [x.strip() for x in texte.splitlines() if x.strip()]
    def apres(cle):
        return lignes[lignes.index(cle) + 1] if cle in lignes and lignes.index(cle) + 1 < len(lignes) else ""
    annee = re.match(r"\d{4}", apres("Année :"))
    voix = 0
    if "Distribution :" in lignes:
        voix = sum(1 for x in lignes[lignes.index("Distribution :") + 1:] if x.startswith("(")) or 0
    return {"annee": int(annee.group()) if annee else 0, "real": apres("Réalisation :") or apres("Création :"), "voix": voix}


def preuve_rsdoublage(titres: list[str], annee: int, realisateurs: set[str], serie: bool = False) -> bool:
    """Le titre (un de ses titres, son année, un de ses réalisateurs) a-t-il sa fiche chez RS Doublage ? Une série
    seulement parmi les séries, un film parmi les films et téléfilms."""
    if not realisateurs or not annee:
        return False
    idx = index_rsdoublage()
    vues = set()
    for t in titres:
        for href in idx.get(norm(t), []):
            if href in vues or href.startswith("serie-") != serie:
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
# ne passent pas : après VF ou VFF, le deux-points. Et le modèle « {{Doublage|VF=Thierry Ragueneau}} », celui des
# séries surtout (Le Protecteur, The IT Crowd : passés pour « sans VF » à l'essai du 2026-11-08) ; « VQ= », « VF_lien= »
# ne passent pas.
VF_WIKI = re.compile(r"[(;]\s*(?:\[\[[^\]|]*\|)?VFF?(?:\]\])?\s*:|\{\{\s*[Dd]oublage\s*(?:\|[^{}|]*)*?\|\s*VFF?\s*=\s*[^|}\s]")


def a_une_vf(wikitext: str) -> bool:
    """Le texte d'un article Wikipédia FR note-t-il un comédien de VF de France (« VF : », « VFF : ») ?"""
    return bool(VF_WIKI.search(wikitext or ""))


def preuve_wikipedia(wikidata_id: str) -> bool:
    if not wikidata_id:
        return False
    try:
        time.sleep(PAUSE_S)   # Wikimedia répond 429 aux demandes trop rapprochées
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


def _champs(notice: str, tag: str) -> list[dict]:
    """Les zones UNIMARC `tag` d'une notice (unimarcxchange) : { sous-zone: [valeurs] }."""
    zones = []
    for bloc in re.findall(r'<mxc:datafield tag="%s"[^>]*>(.*?)</mxc:datafield>' % tag, notice, re.S):
        z: dict = {}
        for code, val in re.findall(r'<mxc:subfield code="(.)">([^<]*)</mxc:subfield>', bloc):
            z.setdefault(code, []).append(html.unescape(val))
        zones.append(z)
    return zones


def edition_bnf_vf(notice: str, titre: str, annee: int, realisateurs: set[str]) -> bool:
    """Une notice de la BnF est-elle une édition vidéo de ce film (même titre, un de ses réalisateurs, parue l'année du
    film ou après) avec une piste son française ?"""
    z200 = (_champs(notice, "200") or [{}])[0]
    if norm((z200.get("a") or [""])[0]) != norm(titre):
        return False
    if not mots(" ".join(z200.get("f", []) + z200.get("g", []))) & realisateurs:
        return False
    parue = [int(x) for z in _champs(notice, "210") + _champs(notice, "214") for d in z.get("d", [])
             for x in re.findall(r"(?:19|20)\d{2}", d)]
    if parue and annee and max(parue) < annee - 1:
        return False
    return any("fre" in z.get("a", []) for z in _champs(notice, "101"))


def preuve_bnf(titres: list[str], annee: int, realisateurs: set[str]) -> bool:
    """Une édition vidéo française du film avec une piste française a-t-elle été déposée à la BnF ?"""
    if not realisateurs:
        return False
    for titre in titres:
        q = urllib.parse.urlencode({"version": "1.2", "operation": "searchRetrieve", "recordSchema": "unimarcxchange",
                                    "maximumRecords": 50,
                                    "query": f'bib.title all "{titre.replace(chr(34), " ")}" and bib.doctype any "h"'})
        try:
            time.sleep(PAUSE_S)
            with urllib.request.urlopen(urllib.request.Request(f"{BNF}?{q}", headers=AGENT), timeout=30) as r:
                xml = r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001 — BnF muette : pas de preuve
            print(f"BnF illisible pour {titre} ({e})", file=sys.stderr)
            return False
        if any(edition_bnf_vf(n, titre, annee, realisateurs) for n in xml.split("<srw:record>")[1:]):
            return True
    return False


def preuve_vff(fiche: dict, serie: bool = False) -> str | None:
    """« rsdoublage », « wikipedia » ou « bnf » si une source prouve la VF de France du titre (fiche TMDB avec credits
    et external_ids), sinon None. Une série : son nom, sa première diffusion, ses créateurs."""
    if serie:
        annee = int((fiche.get("first_air_date") or "0")[:4] or 0)
        noms = [c.get("name") or "" for c in fiche.get("created_by") or []]
        titres = [t for t in dict.fromkeys([fiche.get("name"), fiche.get("original_name")]) if t]
    else:
        annee = int((fiche.get("release_date") or "0")[:4] or 0)
        noms = [c.get("name") or "" for c in (fiche.get("credits") or {}).get("crew") or [] if c.get("job") == "Director"]
        titres = [t for t in dict.fromkeys([fiche.get("title"), fiche.get("original_title")]) if t]
    reals = set().union(*[mots(n) for n in noms] or [set()])
    if preuve_rsdoublage(titres, annee, reals, serie):
        return "rsdoublage"
    if preuve_wikipedia((fiche.get("external_ids") or {}).get("wikidata_id")):
        return "wikipedia"
    if preuve_bnf(titres, annee, reals):
        return "bnf"
    return None
