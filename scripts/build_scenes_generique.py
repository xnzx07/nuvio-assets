"""Scènes pendant ou après le générique (data/scenes-generique.json, lu par l'addon : ligne « 🎬 » de la fiche).

Avant, seuls les mots-clés TMDB (aftercreditsstinger, duringcreditsstinger) le disaient, souvent absents, et jamais
« pas de scène ». aftercredits.com, site dédié, note chaque film : son API WordPress est ouverte (wp-json, pas de clé,
pas de robots.txt contre elle), chaque article porte l'identifiant IMDb du film et une catégorie :
14 pendant, 15 après, 16 les deux, 7 une scène sans précision, 6 aucune ; 8 (inconnu) et 10 (télévision) ignorés.

data/scenes-generique.json : { "maj", "source", "films": { id TMDB: "p" | "a" | "pa" | "s" | "0" } }.
data/scenes-generique-suivi.json : { "jusqua": dernière modification lue, "films": { tt…: { "c": code, "t": TMDB } } }.
Exécuté chaque nuit par GitHub Actions (addon.yml, secret TMDB_API_KEY) : seuls les articles modifiés depuis la veille
sont relus. Une panne garde ce qui a été lu.
"""
import datetime as dt
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from update_addon import tmdb  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "scenes-generique.json"
SUIVI = ROOT / "data" / "scenes-generique-suivi.json"
API = "https://aftercredits.com/wp-json/wp/v2/posts"
AGENT = {"User-Agent": "catalogue-fr-nuit"}
RELIRE_JOURS = 3
IMDB = re.compile(r"imdb\.com/title/(tt\d{7,9})")


# Ce qu'il y a dans le générique. Une vraie scène : scène bonus, bêtisier, chutes, suite annoncée, quatrième mur,
# extrait. Sans elle, seulement un son, des photos, une dédicace, un générique drôle ou musical : pas une scène.
SCENES = {2674, 2672, 2673, 2675, 2677, 5686}
PETITS_RIENS = {3779, 5459, 2431, 5211, 2678, 2676, 189}


def code_de(categories: list[int]) -> str | None:
    """Code d'un article d'après ses catégories ; None : rien de sûr (inconnu, télévision, autre). « Pas de scène »
    l'emporte (« Obsession » 2025 : pendant le générique ET pas de scène) ; un son ou des photos seuls : pas de scène."""
    c = set(categories or [])
    if 10 in c:
        return None
    if 6 in c or ({14, 15, 16} & c and not SCENES & c and PETITS_RIENS & c):
        return "0"
    if 16 in c or {14, 15} <= c:
        return "pa"
    if 14 in c:
        return "p"
    if 15 in c:
        return "a"
    if 7 in c:
        return "s"
    return None


def imdb_de(html: str) -> str | None:
    m = IMDB.search(html or "")
    return m.group(1) if m else None


def articles(depuis: str | None):
    """Les articles (id, modifié le, catégories, IMDb), modifiés après « depuis » (tous si None), 100 par page."""
    page = 1
    while True:
        q = {"per_page": 100, "page": page, "orderby": "modified", "order": "asc", "_fields": "id,modified,categories,content"}
        if depuis:
            q["modified_after"] = depuis
        req = urllib.request.Request(f"{API}?{urllib.parse.urlencode(q)}", headers=AGENT)
        for essai in range(3):
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    lot, total = json.load(r), int(r.headers.get("X-WP-TotalPages") or 1)
                break
            except urllib.error.HTTPError as e:
                if e.code == 400:      # au-delà de la dernière page
                    return
                if essai == 2:
                    raise
            except (OSError, ValueError):
                if essai == 2:
                    raise
            time.sleep(5 * (essai + 1))
        for a in lot:
            yield a["modified"], code_de(a.get("categories")), imdb_de((a.get("content") or {}).get("rendered"))
        if page >= total:
            return
        page += 1


def tmdb_de(imdb: str) -> int:
    return ((tmdb(f"/find/{imdb}", external_source="imdb_id").get("movie_results") or [{}])[0]).get("id") or 0


def main() -> None:
    suivi = json.loads(SUIVI.read_text(encoding="utf-8")) if SUIVI.exists() else {}
    films = suivi.setdefault("films", {})
    depuis = suivi.get("jusqua")
    if depuis:
        depuis = (dt.datetime.fromisoformat(depuis) - dt.timedelta(days=RELIRE_JOURS)).isoformat(timespec="seconds")
    code, dernier, lus = 0, suivi.get("jusqua"), 0
    try:
        for modifie, c, imdb in articles(depuis):
            lus += 1
            dernier = max(dernier or modifie, modifie)
            if imdb and c:
                films.setdefault(imdb, {})["c"] = c
            elif imdb and imdb in films:
                films[imdb].pop("c", None)      # devenu inconnu : plus rien d'affiché
    except Exception as e:  # noqa: BLE001 — aftercredits muet : ce qui a été lu est gardé
        print(f"aftercredits.com : panne ({e})", file=sys.stderr)
        code = 1
    a_relier = [t for t, x in films.items() if "t" not in x and x.get("c")]
    with ThreadPoolExecutor(8) as ex:
        for imdb, tid in zip(a_relier, ex.map(tmdb_de, a_relier)):
            films[imdb]["t"] = tid
    if code == 0 and dernier:
        suivi["jusqua"] = dernier
    sortie = {str(x["t"]): x["c"] for x in films.values() if x.get("t") and x.get("c")}
    OUT.write_text(json.dumps({"maj": dt.date.today().isoformat(), "source": "aftercredits.com",
                               "films": dict(sorted(sortie.items(), key=lambda kv: int(kv[0])))},
                              separators=(",", ":")) + "\n", encoding="utf-8")
    SUIVI.write_text(json.dumps(suivi, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8")
    print(f"{lus} articles lus, {len(sortie)} films notés")
    sys.exit(code)


if __name__ == "__main__":
    main()
