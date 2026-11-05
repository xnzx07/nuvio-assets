"""Lauréats des grands prix (Oscar et César du meilleur film, Palme d'or) : data/recompenses.json.

- Liste depuis Wikidata : le prix reçu par le film (P166) et les lauréats notés sur le prix lui-même (P1346), réunis ;
  pour les Césars, aussi l'œuvre des producteurs récompensés ; film retrouvé sur TMDB par son identifiant IMDb.
- Césars : Wikidata est en retard (2025 et 2026 jamais ajoutés), la liste de Wikipédia FR, elle, est tenue à jour :
  ses lauréats s'ajoutent à ceux de Wikidata (article → élément Wikidata → identifiant IMDb). Wikipédia muet : Wikidata seul.
- Chaque lauréat est gardé comme une ligne de résultats TMDB en français (titre, affiche, fond…) : le Worker sert
  les rangées « Récompenses » sans appeler TMDB pour chacun (worker/facultatives.js).
- Relancé chaque mois par .github/workflows/recompenses.yml (César fin février, Oscars en mars, Palme fin mai).

Usage : python scripts/build_recompenses.py   (TMDB_API_KEY nécessaire)
"""
import json
import re
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from update_addon import tmdb  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "recompenses.json"
# (élément Wikidata, chercher aussi l'œuvre d'une personne récompensée) : les Césars du meilleur film sont notés sur
# les producteurs ; ailleurs, ce détour ajoutait des films primés pour autre chose (« Mask » : prix d'interprétation).
PRIZES = {"oscars": ("Q102427", False), "palmes": ("Q179808", False), "cesars": ("Q645595", True)}
SPARQL = "https://query.wikidata.org/sparql"
WIKI_FR = "https://fr.wikipedia.org/w/api.php"
WIKIDATA = "https://www.wikidata.org/w/api.php"
AGENT = {"User-Agent": "nuvio-assets (catalogue de films)"}
KEEP = ("id", "title", "original_title", "original_language", "overview", "poster_path", "backdrop_path",
        "release_date", "vote_average", "vote_count", "popularity", "genre_ids")
# Une année commence par « * [[51e cérémonie des César|2026]] : » ; ses lauréats sont en gras italique
# (« '''''[[L'Attachement]] »), sur la même ligne ou, en cas d'ex æquo (1984), sur les lignes « ** » suivantes ;
# les autres nommés sont en italique simple. Écrit souplement : les dernières lignes n'ont pas tout à fait la
# forme des anciennes (« *[[ » collé, « de » au lieu de « réalisé par »).
CESAR_YEAR = re.compile(r"^\*(?!\*)\s*\[\[[^\]|]*c[ée]r[ée]monie des C[ée]sar[^\]|]*\|\s*(\d{4})\s*\]\]", re.M | re.I)
CESAR_WINNER = re.compile(r"'''''\s*\[\[([^\]|#]+)")
# Années lues sur Wikipédia (avec un identifiant IMDb) pour qu'elle fasse foi seule : 51 cérémonies en 2026,
# quelques films sans IMDb tolérés.
CESAR_MIN_YEARS = 45


def get_json(url: str, **params) -> dict:
    req = urllib.request.Request(f"{url}?{urllib.parse.urlencode(params)}", headers=AGENT)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def sparql(query: str) -> list[dict]:
    req = urllib.request.Request(f"{SPARQL}?format=json&query={urllib.parse.quote(query)}", headers=AGENT)
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)["results"]["bindings"]


def cesar_articles(wikitext: str) -> list[tuple[str, int]]:
    """(article Wikipédia du lauréat, année de la cérémonie), lus dans la page « César du meilleur film »."""
    years = list(CESAR_YEAR.finditer(wikitext))
    out = []
    for n, m in enumerate(years):
        # Le bloc de l'année s'arrête à la prochaine ligne « * » de premier niveau (année suivante ou autre liste).
        end = years[n + 1].start() if n + 1 < len(years) else len(wikitext)
        nxt = re.search(r"^\*(?!\*)|^=", wikitext[m.end():end], re.M)
        block = wikitext[m.start():m.end() + nxt.start() if nxt else end]
        out += [(t.strip(), int(m.group(1))) for t in CESAR_WINNER.findall(block)]
    return out


def cesars_wikipedia() -> list[tuple[str, int]]:
    """(identifiant IMDb, année) des Césars du meilleur film d'après Wikipédia FR."""
    page = get_json(WIKI_FR, action="parse", page="César du meilleur film", prop="wikitext", format="json",
                    formatversion=2)
    articles = cesar_articles(page["parse"]["wikitext"])
    years = {}
    for title, year in articles:
        years[title] = max(years.get(title, 0), year)
    # Article → élément Wikidata (redirections suivies), puis élément → IMDb (P345) ; par lots de 50.
    qid_of, titles = {}, list(years)
    for i in range(0, len(titles), 50):
        q = get_json(WIKI_FR, action="query", prop="pageprops", ppprop="wikibase_item", redirects=1,
                     titles="|".join(titles[i:i + 50]), format="json", formatversion=2)["query"]
        suite = {r["from"]: r["to"] for r in q.get("normalized", []) + q.get("redirects", [])}
        qid_page = {p["title"]: (p.get("pageprops") or {}).get("wikibase_item") for p in q.get("pages", [])}
        for asked in titles[i:i + 50]:
            title = asked
            for _ in range(5):              # titre normalisé, puis redirection(s)
                if title not in suite:
                    break
                title = suite[title]
            qid = qid_page.get(title)
            if qid:
                qid_of[qid] = max(qid_of.get(qid, 0), years[asked])
    out, qids = {}, list(qid_of)
    for i in range(0, len(qids), 50):
        ents = get_json(WIKIDATA, action="wbgetentities", ids="|".join(qids[i:i + 50]), props="claims",
                        format="json")["entities"]
        for qid, ent in ents.items():
            for c in (ent.get("claims") or {}).get("P345", []):
                imdb = ((c.get("mainsnak") or {}).get("datavalue") or {}).get("value", "")
                if imdb.startswith("tt"):
                    out[imdb] = max(out.get(imdb, 0), qid_of[qid])
    return list(out.items())


def merge(*lists: list[tuple[str, int]]) -> list[tuple[str, int]]:
    """Réunit des listes (IMDb, année) sans doublon, la plus haute année gardée ; les plus récents d'abord."""
    best = {}
    for items in lists:
        for imdb, year in items:
            best[imdb] = max(best.get(imdb, 0), year)
    return sorted(best.items(), key=lambda kv: -kv[1])


def winners(rows_received: list[dict], rows_listed: list[dict]) -> list[tuple[str, int]]:
    """(identifiant IMDb, année) des lauréats, sans doublon, les plus récents d'abord ; année inconnue : à la fin."""
    best = {}
    for row in rows_received + rows_listed:
        imdb = row.get("imdb", {}).get("value")
        if not imdb or not imdb.startswith("tt"):    # « nm… » : une personne (producteur), pas un film
            continue
        year = int(row["t"]["value"][:4]) if row.get("t") else 0
        best[imdb] = max(best.get(imdb, 0), year)
    return sorted(best.items(), key=lambda kv: -kv[1])


def prize_rows(q: str, works: bool) -> tuple[list[dict], list[dict]]:
    """Le film récompensé, noté sur le film (P166) ou sur le prix (P1346) ; avec works, aussi l'œuvre (P1686) d'une
    personne récompensée (les Césars vont aux producteurs)."""
    via = lambda a, b: f" UNION {{ {a} }}" if works else ""
    received = sparql(f"""SELECT ?imdb ?t WHERE {{
      {{ ?f p:P166 ?s. ?s ps:P166 wd:{q}. }}{via(f"?x p:P166 ?s. ?s ps:P166 wd:{q}; pq:P1686 ?f.", "")}
      OPTIONAL {{ ?s pq:P585 ?t. }} ?f wdt:P345 ?imdb. }}""")
    listed = sparql(f"""SELECT ?imdb ?t WHERE {{
      {{ wd:{q} p:P1346 ?s. ?s ps:P1346 ?f. }}{via(f"wd:{q} p:P1346 ?s. ?s pq:P1686 ?f.", "")}
      OPTIONAL {{ ?s pq:P585 ?t. }} ?f wdt:P345 ?imdb. }}""")
    return received, listed


def tmdb_row(imdb: str) -> dict | None:
    hits = tmdb(f"/find/{imdb}", external_source="imdb_id").get("movie_results") or []
    return {k: hits[0].get(k) for k in KEEP} if hits else None


def main() -> None:
    out = {}
    for name, (q, works) in PRIZES.items():
        found = winners(*prize_rows(q, works))
        if name == "cesars":
            # Wikipédia fait foi quand sa liste est complète : Wikidata y ajoute des erreurs (« Aya de Yopougon »,
            # « Larry le liquidateur » notés lauréats). Liste incomplète ou page illisible : les deux réunies.
            try:
                wiki = cesars_wikipedia()
                complete = len({y for _, y in wiki}) >= CESAR_MIN_YEARS
                print(f"cesars : {len(wiki)} lauréats lus sur Wikipédia ({'fait foi' if complete else 'incomplet'})")
                found = merge(wiki) if complete else merge(found, wiki)
            except Exception as e:  # noqa: BLE001 — Wikipédia muet : la liste de Wikidata suffit
                print(f"cesars : Wikipédia illisible ({e}), Wikidata seul", file=sys.stderr)
        ids = [imdb for imdb, _year in found]
        with ThreadPoolExecutor(8) as ex:
            rows = [r for r in ex.map(tmdb_row, ids) if r]
        out[name] = rows
        print(f"{name} : {len(rows)} films")
    DATA.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
