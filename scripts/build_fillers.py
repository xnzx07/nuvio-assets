"""Épisodes de remplissage des anime (data/fillers.json, lu par l'addon : « (remplissage) » dans la fiche).

Avant, l'addon devinait l'adresse animefillerlist.com depuis le titre français de TMDB (« L'Attaque des Titans ») et
manquait la plupart des séries, que le site range sous leur titre anglais (« attack-titan »). Ici :
1. La liste des séries du site (/shows), puis chaque page, PAR_NUIT par passage, les plus anciennement lues d'abord
   (un tour complet en moins d'une semaine), une page toutes les PAUSE_S secondes (Crawl-delay du robots.txt).
2. Chaque série est reliée une fois à sa série TMDB : animation, même nom (anglais ou original) que le site et
   nombre d'épisodes plausible, sinon une seule série au nombre d'épisodes presque identique. Pas reliée : rien n'est affiché pour elle (mieux qu'un « remplissage » sur la mauvaise série).
3. Les épisodes « Filler » (numérotation continue, comme le site), gardés en plages : « 26,97,136-140 ».

data/fillers.json : { "maj", "series": { id TMDB: plages },
                      "vus": { slug: { "j": dernier passage, "id": TMDB ou 0, "f": plages, "n": épisodes } } }.
Exécuté chaque nuit par .github/workflows/fillers.yml (secret TMDB_API_KEY ; pip install "scrapling[fetchers]").
"""
import datetime as dt
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from update_addon import tmdb  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "fillers.json"
SITE = "https://www.animefillerlist.com"
PAR_NUIT = 60
PAUSE_S = 10
LANGUES = {"ja", "zh", "ko"}


def plages_en_liste(texte: str) -> list[int]:
    """« 26, 97, 136-140 » → [26, 97, 136, 137, 138, 139, 140]."""
    out = set()
    for a, b in re.findall(r"(\d+)(?:\s*-\s*(\d+))?", texte or ""):
        out.update(range(int(a), min(int(b or a), int(a) + 5000) + 1))
    return sorted(out)


def liste_en_plages(nums: list[int]) -> str:
    """[26, 97, 136, 137, 138] → « 26,97,136-138 »."""
    out, nums = [], sorted(set(nums))
    i = 0
    while i < len(nums):
        j = i
        while j + 1 < len(nums) and nums[j + 1] == nums[j] + 1:
            j += 1
        out.append(str(nums[i]) if i == j else f"{nums[i]}-{nums[j]}")
        i = j + 1
    return ",".join(out)


def titres(nom: str) -> list[str]:
    """« A Certain Magical Index (Toaru Majutsu No Index) » → le titre anglais, puis le japonais."""
    m = re.match(r"^(.*?)\s*\(([^)]+)\)\s*$", nom or "")
    return [x.strip() for x in (m.groups() if m else (nom,)) if x and x.strip()]


def norm(t: str) -> str:
    import unicodedata
    t = unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def relier(nom: str, total: int) -> int:
    """La série TMDB d'une série du site, ou 0. Animation d'Asie de l'Est, et :
    1. le même nom (anglais ou original) qu'un titre du site, avec un nombre d'épisodes plausible ;
    2. sinon, une seule série au nombre d'épisodes presque identique (±10 %).
    Pas d'épisodes connus sur la page (film, OVA) : pas reliée. « Dragon Ball » n'est pas « Dragon Ball Super »."""
    if not total:
        return 0
    noms = {norm(t) for t in titres(nom)}
    proches = []
    for t in titres(nom):
        for r in (tmdb("/search/tv", query=t, language="en-US").get("results") or [])[:8]:
            if 16 not in (r.get("genre_ids") or []) or r.get("original_language") not in LANGUES:
                continue
            n = tmdb(f"/tv/{r['id']}").get("number_of_episodes") or 0
            # Le nom original seulement s'il est tout en lettres latines : « 鋼の錬金術師 FULLMETAL ALCHEMIST »
            # (Brotherhood) n'est pas « Fullmetal Alchemist » (2003).
            orig = r.get("original_name") or ""
            leurs = {norm(r.get("name"))} | ({norm(orig)} if orig.isascii() else set())
            if leurs & noms and 0.75 * total <= n <= 1.5 * total + 5:
                return r["id"]
            # Nombre d'épisodes presque identique : seulement avec un mot du nom en commun (« Noragami » n'est pas
            # « Negima »).
            commun = {w for x in leurs for w in x.split() if len(w) >= 4} & {w for x in noms for w in x.split()}
            if commun and 0.9 * total <= n <= 1.1 * total + 2 and r["id"] not in proches:
                proches.append(r["id"])
    return proches[0] if len(proches) == 1 else 0


def lire_serie(page) -> tuple[list[int], int]:
    """(épisodes de remplissage, nombre d'épisodes connus du site) d'une page de série."""
    def nums(cls):
        return [n for d in page.css(f"div.{cls} span.Episodes") for n in plages_en_liste(d.get_all_text(strip=True))]
    tous = [n for cls in ("manga_canon", "mixed_canon\\/filler", "filler", "anime_canon") for n in nums(cls)]
    return nums("filler"), max(tous, default=0)


def fusion(vus: dict) -> dict:
    """{ id TMDB: plages }. Deux pages pour une même série TMDB (liste « définitive » à part, « Negima! » et
    « Negima!? ») : celle qui a du remplissage, puis celle qui compte le plus d'épisodes."""
    series = {}
    for v in sorted(vus.values(), key=lambda v: (bool(v.get("f")), v.get("n", 0))):
        if v.get("id"):
            series[str(v["id"])] = v.get("f", "")
    return series


def main() -> None:
    from scrapling.fetchers import Fetcher   # ici seulement : les tests du reste s'en passent
    etat = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    vus = etat.get("vus", {})
    jour = dt.date.today().isoformat()
    liste = Fetcher.get(f"{SITE}/shows", stealthy_headers=True, timeout=30)
    if liste.status != 200:
        sys.exit(f"animefillerlist : réponse {liste.status}")
    # Une série peut apparaître deux fois (vignette sans texte des plus populaires) : le premier nom non vide.
    shows = {}
    for a in liste.css("a"):
        if re.match(r"^/shows/[\w-]+$", a.attrib.get("href", "")):
            slug, texte = a.attrib["href"].rsplit("/", 1)[1], a.get_all_text(strip=True)
            if texte or slug not in shows:
                shows[slug] = shows.get(slug) or texte
    if len(shows) < 100:
        sys.exit(f"animefillerlist : {len(shows)} séries seulement, page refaite ?")
    ordre = sorted(shows, key=lambda s: (vus.get(s, {}).get("j", ""), s))[:PAR_NUIT]
    erreurs = 0
    for slug in ordre:
        time.sleep(PAUSE_S)
        try:
            page = Fetcher.get(f"{SITE}/shows/{slug}", stealthy_headers=True, timeout=30)
            if page.status != 200:
                raise RuntimeError(f"réponse {page.status}")
            fillers, total = lire_serie(page)
            tid = vus.get(slug, {}).get("id")
            if tid is None:
                tid = relier(shows[slug], total)
            vus[slug] = {"j": jour, "id": tid, "f": liste_en_plages(fillers), "n": total}
        except Exception as e:  # noqa: BLE001 — une page ratée sera relue au prochain tour
            erreurs += 1
            print(f"{slug} : {e}", file=sys.stderr)
    series = fusion(vus)
    OUT.write_text(json.dumps({"maj": jour, "series": dict(sorted(series.items(), key=lambda kv: int(kv[0]))),
                               "vus": dict(sorted(vus.items()))}, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    relies = sum(1 for v in vus.values() if v.get("id"))
    print(f"{len(ordre)} séries lues ({erreurs} en échec), {relies} reliées sur {len(vus)} vues, "
          f"{sum(1 for v in series.values() if v)} avec du remplissage")
    if erreurs > len(ordre) // 2:
        sys.exit(1)


if __name__ == "__main__":
    main()
