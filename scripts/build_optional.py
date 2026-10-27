"""Collections facultatives (décochées par défaut, au choix de chacun) : définitions, affiches, collections.json.

- COLLECTIONS : les 14 collections et leurs tuiles ; chaque tuile = des rangées que Nuvio sait lire (TMDB DISCOVER,
  COLLECTION, PERSON, DIRECTOR) ou des rangées de l'addon (lauréats, moins de 90 minutes, mini-séries : Nuvio ne sait
  pas les faire seul).
- data/optionnelles.json : pour chaque tuile, ses titres les plus vus (affiches de la tuile, fond sans texte) et
  son mur (fond animé). Affiches fixes : refaites seulement quand on relance ce script.
- collections/collections.json : les 14 collections ajoutées à la fin, images lues sur la branche
  tuiles-optionnelles (dessinées par make_optional_tiles.py, workflow optionnelles.yml).

Usage :
  python scripts/build_optional.py               data/optionnelles.json (TMDB_API_KEY ; data/recompenses.json d'abord)
  python scripts/build_optional.py --collection  collections.json depuis data/optionnelles.json (sans réseau)
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from update_addon import tmdb  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "optionnelles.json"
ADDON_ID = "com.xnzx07.catalogue-fr"   # worker/hote.js (une copie : « .perso », réécrit par le Worker)
BRANCH = "https://raw.githubusercontent.com/xnzx07/nuvio-assets/tuiles-optionnelles"
_sagas = ROOT / "data" / "sagas.json"
SAGAS_BY_NAME = {s["title"]: s for t in (json.loads(_sagas.read_text(encoding="utf-8")) if _sagas.exists() else [])
                 for s in t["sagas"]}
AWARDS = json.loads(p.read_text(encoding="utf-8")) if (p := ROOT / "data" / "recompenses.json").exists() else {}
TILE, WALL = 8, 120   # affiches d'une tuile (défilé), du mur (fond)


# ---------- rangées (format des collections Nuvio) ----------
def disc(title: str, media: str = "MOVIE", sort: str = "popularity.desc", **filters) -> dict:
    return {"provider": "tmdb", "tmdbSourceType": "DISCOVER", "title": title, "mediaType": media, "sortBy": sort,
            "filters": filters}


def coll(title: str, tmdb_id: int) -> dict:
    return {"provider": "tmdb", "tmdbSourceType": "COLLECTION", "title": title, "tmdbId": tmdb_id,
            "mediaType": "MOVIE", "sortBy": "original", "filters": {}}


def person(title: str, tmdb_id: int, media: str = "MOVIE", kind: str = "PERSON", sort: str = "popularity.desc") -> dict:
    return {"provider": "tmdb", "tmdbSourceType": kind, "title": title, "tmdbId": tmdb_id, "mediaType": media,
            "sortBy": sort, "filters": {}}


def addon(catalog: str, kind: str, genre: str | None = None) -> dict:
    return {"provider": "addon", "addonId": ADDON_ID, "type": kind, "catalogId": catalog, **({"genre": genre} if genre else {})}


def saga(name: str) -> dict:
    """Une saga de data/sagas.json dans l'ordre de sortie : TMDB en direct si elle y est dans l'ordre (gratuit),
    sinon la rangée de la saga dans l'addon, son catalogue à elle (même règle que la collection Sagas)."""
    s = SAGAS_BY_NAME[name]
    if s.get("in_order"):
        return coll(name, s["id"])
    return addon(f"saga-{s['id']}", "movie", "Saga")


def films_series(**f) -> list[dict]:
    """Les rangées habituelles d'une tuile : films et séries populaires, films les mieux notés."""
    return [disc("Films populaires", "MOVIE", voteCountGte=50, **f), disc("Séries populaires", "TV", voteCountGte=30, **f),
            disc("Films les mieux notés", "MOVIE", "vote_average.desc", voteCountGte=300, **f)]


def tile(id: str, title: str, sources: list[dict], **extra) -> dict:
    return {"id": id, "title": title, "sources": sources, **extra}


def decade(y: int) -> dict:
    span = {"releaseDateGte": f"{y}-01-01", "releaseDateLte": f"{y + 9}-12-31"}
    name = f"Années {str(y)[2:]}" if y < 2000 else f"Années {y}"
    return tile(f"decennie-{y}", name, films_series(**span))


DIRECTORS = [("nolan", "Christopher Nolan", 525), ("spielberg", "Steven Spielberg", 488), ("tarantino", "Quentin Tarantino", 138),
             ("scorsese", "Martin Scorsese", 1032), ("villeneuve", "Denis Villeneuve", 137427), ("miyazaki", "Hayao Miyazaki", 608),
             ("besson", "Luc Besson", 59), ("fincher", "David Fincher", 7467), ("kubrick", "Stanley Kubrick", 240),
             ("ridley-scott", "Ridley Scott", 578), ("cameron", "James Cameron", 2710), ("jeunet", "Jean-Pierre Jeunet", 2419)]
ACTORS = [("dicaprio", "Leonardo DiCaprio", 6193), ("de-niro", "Robert De Niro", 380), ("hanks", "Tom Hanks", 31),
          ("pitt", "Brad Pitt", 287), ("washington", "Denzel Washington", 5292), ("cruise", "Tom Cruise", 500),
          ("reeves", "Keanu Reeves", 6384), ("chan", "Jackie Chan", 18897), ("johansson", "Scarlett Johansson", 1245),
          ("streep", "Meryl Streep", 5064), ("robbie", "Margot Robbie", 234352), ("cotillard", "Marion Cotillard", 8293),
          ("dujardin", "Jean Dujardin", 56024), ("omar-sy", "Omar Sy", 78423), ("belmondo", "Jean-Paul Belmondo", 3829),
          ("de-funes", "Louis de Funès", 11187)]
# Chaînes : (identifiant, nom, fournisseur TMDB, sombre, couleur). france.tv n'existe sur TMDB que comme
# « France TV Amazon Channel » (même catalogue).
CHANNELS = [("tf1", "TF1+", 1754, (0, 10, 30), (0, 90, 200)), ("francetv", "france.tv", 2535, (5, 5, 30), (40, 60, 200)),
            ("arte", "Arte", 234, (20, 10, 0), (220, 90, 20)), ("m6", "M6+", 147, (5, 10, 25), (50, 110, 210)),
            ("pluto", "Pluto TV", 300, (10, 10, 10), (230, 200, 0)), ("molotov", "Molotov", 1967, (10, 5, 20), (120, 60, 200))]

COLLECTIONS = [
    {"id": "decennies", "title": "Décennies", "style": "saga", "folders": [decade(y) for y in range(1970, 2030, 10)]},
    {"id": "monde", "title": "Cinéma du monde", "style": "saga", "folders": [
        tile("monde-coree", "Corée du Sud", films_series(withOriginalLanguage="ko")),
        tile("monde-japon", "Japon", films_series(withOriginalLanguage="ja", withoutGenres="16")),
        tile("monde-inde", "Inde", films_series(withOriginalLanguage="hi")),
        tile("monde-espagne", "Espagne", films_series(withOriginCountry="ES")),
        tile("monde-italie", "Italie", films_series(withOriginalLanguage="it")),
        tile("monde-nordique", "Pays nordiques", films_series(withOriginCountry="SE|DK|NO|FI|IS")),
        tile("monde-latino", "Amérique latine", films_series(withOriginCountry="MX|AR|BR|CO|CL")),
        tile("monde-royaume-uni", "Royaume-Uni", films_series(withOriginCountry="GB")),
        tile("monde-france", "France", films_series(withOriginalLanguage="fr"))]},
    {"id": "realisateurs", "title": "Réalisateurs", "style": "saga", "folders": [
        tile(f"real-{k}", n, [person("Ses films", i, kind="DIRECTOR"),
                              person("Les mieux notés", i, kind="DIRECTOR", sort="vote_average.desc")]) for k, n, i in DIRECTORS]},
    {"id": "acteurs", "title": "Acteurs et actrices", "style": "saga", "folders": [
        # Films seulement : sur TMDB, les « séries » d'un acteur comptent ses passages en émission (Sacrée soirée…).
        tile(f"acteur-{k}", n, [person("Ses films", i), person("Les mieux notés", i, sort="vote_average.desc")])
        for k, n, i in ACTORS]},
    {"id": "recompenses", "title": "Récompenses", "style": "saga", "folders": [
        tile("prix-oscars", "Oscars du meilleur film", [addon("fac-oscars", "movie", "Lauréats")]),
        tile("prix-palmes", "Palmes d'or", [addon("fac-palmes", "movie", "Lauréats")]),
        tile("prix-cesars", "Césars du meilleur film", [addon("fac-cesars", "movie", "Lauréats")])]},
    {"id": "univers", "title": "Grands univers", "style": "saga", "folders": [
        tile("univers-marvel", "Marvel", [disc("Films", withKeywords="180547"), disc("Séries", "TV", withKeywords="180547")]),
        tile("univers-dc", "DC", [disc("Films", withKeywords="229266"), disc("Séries", "TV", withCompanies="429|128064")]),
        tile("univers-star-wars", "Star Wars", [saga("Star Wars"), disc("Séries", "TV", withCompanies="1")]),
        tile("univers-wizarding", "Harry Potter", [saga("Harry Potter"), saga("Les Animaux fantastiques")]),
        tile("univers-terre-du-milieu", "Terre du Milieu", [saga("Le Seigneur des anneaux"), saga("Le Hobbit")]),
        tile("univers-monsterverse", "Monsterverse", [disc("Films", withKeywords="380322"), disc("Séries", "TV", withKeywords="380322")]),
        tile("univers-conjuring", "Conjuring", [saga("Conjuring"), saga("Annabelle")]),
        tile("univers-jurassic", "Jurassic Park", [saga("Jurassic Park")])]},
    {"id": "chaines", "title": "Chaînes françaises", "style": "plateforme", "folders": [
        tile(f"chaine-{k}", n, [disc("Films", watchRegion="FR", withWatchProviders=str(p)),
                                disc("Séries", "TV", watchRegion="FR", withWatchProviders=str(p))],
             provider=p, colors=[list(d), list(c)]) for k, n, p, d, c in CHANNELS]},
    {"id": "enfants", "title": "Pour les enfants", "style": "saga", "folders": [
        tile("enfants-petits", "Tout-petits", [disc("Séries", "TV", withGenres="10762"),
                                               disc("Films", withGenres="16,10751", voteCountGte=200)]),
        tile("enfants-6-10", "6-10 ans", [disc("Films", withGenres="10751", withoutGenres="27|53", voteCountGte=300),
                                          disc("Séries", "TV", withGenres="10751|10762", withoutGenres="10764|10767")]),
        tile("enfants-ados", "Ados", [disc("Films", withKeywords="296608|10683", withoutGenres="27", voteCountGte=100),
                                      disc("Séries", "TV", withKeywords="296608|10683")])]},
    {"id": "cultes", "title": "Cultes et classiques", "style": "saga", "folders": [
        tile("culte-classiques", "Grands classiques", [disc("Films", "MOVIE", "vote_average.desc", releaseDateLte="1979-12-31",
                                                            voteAverageGte=7.5, voteCountGte=1500)]),
        tile("culte-80-90", "Cultes des années 80-90", [disc("Films", "MOVIE", "vote_count.desc", releaseDateGte="1980-01-01",
                                                              releaseDateLte="1999-12-31", voteAverageGte=7.2, voteCountGte=3000)]),
        tile("culte-series", "Séries cultes", [disc("Séries", "TV", "vote_average.desc", voteAverageGte=8.2, voteCountGte=2500)]),
        tile("culte-nanars", "Nanars cultes", [disc("Films", withKeywords="323812|383390")])]},
    {"id": "adaptations", "title": "Adaptations", "style": "saga", "folders": [
        tile("adapt-romans", "Tirés de romans", films_series(withKeywords="818")),
        tile("adapt-jeux", "Tirés de jeux vidéo", films_series(withKeywords="41645")),
        tile("adapt-comics", "Tirés de comics", films_series(withKeywords="9717")),
        tile("adapt-mangas", "Tirés de mangas", films_series(withKeywords="13141")),
        tile("adapt-vrai", "Histoires vraies", films_series(withKeywords="9672")),
        tile("adapt-biopics", "Biopics", films_series(withKeywords="5565"))]},
    {"id": "temps", "title": "Selon le temps", "style": "saga", "folders": [
        tile("temps-court", "Moins de 90 minutes", [addon("fac-moins-90", "movie", "Populaires")]),
        tile("temps-mini-series", "Mini-séries", [addon("fac-mini-series", "series", "Bien notées")])]},
    {"id": "animes-genres", "title": "Animés par genre", "style": "saga", "folders": [
        tile("anime-shonen", "Shōnen", [disc("Séries", "TV", withKeywords="207826"), disc("Films", withKeywords="207826")]),
        tile("anime-isekai", "Isekai", [disc("Séries", "TV", withKeywords="237451", withGenres="16")]),
        tile("anime-mecha", "Mecha", [disc("Séries", "TV", withKeywords="10046", withGenres="16"),
                                     disc("Films", withKeywords="10046", withGenres="16")]),
        tile("anime-romance", "Romance", [disc("Séries", "TV", withGenres="16", withOriginalLanguage="ja", withKeywords="9840")]),
        tile("anime-films", "Films d'animation japonais", [disc("Films", withGenres="16", withOriginalLanguage="ja", voteCountGte=100)])]},
    {"id": "documentaires", "title": "Documentaires", "style": "saga", "folders": [
        tile("doc-nature", "Nature", films_series(withGenres="99", withKeywords="18330|221355|9902")),
        tile("doc-true-crime", "True crime", films_series(withGenres="99", withKeywords="33722")),
        tile("doc-sport", "Sport", films_series(withGenres="99", withKeywords="6075")),
        tile("doc-musique", "Musique", [disc("Films", withGenres="99,10402", voteCountGte=30)]),
        tile("doc-histoire", "Histoire", [disc("Films", withGenres="99,36", voteCountGte=30)]),
        tile("doc-science", "Science et espace", films_series(withGenres="99", withKeywords="287067|9882"))]},
    {"id": "sport", "title": "Sport", "style": "saga", "folders": [
        tile("sport-foot", "Football", films_series(withKeywords="13042")),
        tile("sport-boxe", "Boxe", films_series(withKeywords="209476")),
        tile("sport-auto", "Sports mécaniques", films_series(withKeywords="233981|830")),
        tile("sport-basket", "Basket", films_series(withKeywords="6496")),
        tile("sport-arts-martiaux", "Arts martiaux", films_series(withKeywords="779"))]},
]

# ---------- affiches : les titres les plus vus d'une rangée ----------
FILTERS = {"withGenres": "with_genres", "withoutGenres": "without_genres", "voteCountGte": "vote_count.gte",
           "voteAverageGte": "vote_average.gte", "withOriginalLanguage": "with_original_language",
           "withOriginCountry": "with_origin_country", "withKeywords": "with_keywords", "withCompanies": "with_companies",
           "withNetworks": "with_networks", "watchRegion": "watch_region", "withWatchProviders": "with_watch_providers"}
# Rangées de l'addon : même chose que le Worker (worker/facultatives.js), pour les affiches.
ADDON_DISCOVER = {"fac-moins-90": ("movie", {"with_runtime.lte": 90, "with_runtime.gte": 60, "vote_count.gte": 300}),
                  "fac-mini-series": ("tv", {"with_type": "2", "vote_average.gte": 7.3, "vote_count.gte": 200})}
ADDON_AWARDS = {"fac-oscars": "oscars", "fac-palmes": "palmes", "fac-cesars": "cesars"}


def request(src: dict) -> tuple[str, dict]:
    """Rangée DISCOVER → (adresse TMDB, paramètres), triée par nombre de votes (les plus vus)."""
    tv = src.get("mediaType") == "TV"
    params = {}
    for k, v in src.get("filters", {}).items():
        if k == "releaseDateGte":
            params["first_air_date.gte" if tv else "primary_release_date.gte"] = v
        elif k == "releaseDateLte":
            params["first_air_date.lte" if tv else "primary_release_date.lte"] = v
        elif k in FILTERS:
            params[FILTERS[k]] = v
    params["sort_by"] = "vote_count.desc"
    return f"/discover/{'tv' if tv else 'movie'}", params


def _titles(results: list[dict]) -> list[dict]:
    ranked = sorted((r for r in results if r.get("poster_path")), key=lambda r: -(r.get("vote_count") or 0))
    return [{"poster": r["poster_path"], "backdrop": r.get("backdrop_path")} for r in ranked]


def titles(src: dict, pages: int = 1) -> list[dict]:
    """Titres d'une rangée, les plus vus d'abord → [{"poster", "backdrop"}]."""
    kind = src.get("tmdbSourceType")
    if src.get("provider") == "addon":
        cat = src["catalogId"]
        if cat.startswith("saga-"):
            return _titles(tmdb(f"/collection/{cat.removeprefix('saga-')}").get("parts") or [])
        if cat in ADDON_AWARDS:
            return _titles(AWARDS.get(ADDON_AWARDS[cat], []))
        media, params = ADDON_DISCOVER[cat]
        return _titles([r for p in range(1, pages + 1)
                        for r in tmdb(f"/discover/{media}", sort_by="vote_count.desc", page=p, **params).get("results") or []])
    if kind == "COLLECTION":
        return _titles(tmdb(f"/collection/{src['tmdbId']}").get("parts") or [])
    if kind in ("PERSON", "DIRECTOR"):
        media = "tv" if src.get("mediaType") == "TV" else "movie"
        credits = tmdb(f"/person/{src['tmdbId']}/{media}_credits")
        rows = [c for c in credits.get("crew") or [] if c.get("job") == "Director"] if kind == "DIRECTOR" else credits.get("cast") or []
        return _titles(rows)
    path, params = request(src)
    return _titles([r for p in range(1, pages + 1) for r in tmdb(path, page=p, **params).get("results") or []])


def _merge(lists: list[list[dict]], limit: int) -> list[dict]:
    """Les rangées à tour de rôle, sans doublon."""
    out, seen = [], set()
    for rank in range(max((len(x) for x in lists), default=0)):
        for x in lists:
            if rank < len(x) and x[rank]["poster"] not in seen:
                seen.add(x[rank]["poster"])
                out.append(x[rank])
    return out[:limit]


def build_collection(c: dict) -> dict:
    """Affiches de chaque tuile (les plus vues) et de son mur ; une tuile sans affiche est écartée."""
    folders = []
    for f in c["folders"]:
        tile_titles = _merge([titles(s) for s in f["sources"]], TILE)
        if not tile_titles:
            print(f"{f['id']} : aucune affiche, tuile écartée")
            continue
        wall = _merge([titles(s, pages=3) for s in f["sources"]], WALL)
        folders.append({**f, "posters": [t["poster"] for t in tile_titles],
                        "backdrop": next((t["backdrop"] for t in tile_titles if t["backdrop"]), None),
                        "wall": [t["poster"] for t in wall]})
        print(f"ok {f['id']} : {len(wall)} affiches")
    return {**c, "folders": folders}


# ---------- collections.json ----------
def nuvio_collection(c: dict) -> dict:
    folders = []
    for f in c["folders"]:
        base = f"{BRANCH}/{c['id']}/{f['id']}"
        folders.append({"id": f["id"], "title": f["title"], "tileShape": "LANDSCAPE", "hideTitle": True,
                        "focusGifEnabled": True, "sources": f["sources"], "coverImageUrl": f"{base}.jpg",
                        "focusGifUrl": f"{base}.gif", "heroBackdropUrl": f"{base}-fond.jpg",
                        "heroVideoUrl": f"{base}-fond.mp4", "titleLogoUrl": f"{base}-titre.png"})
    return {"id": c["id"], "title": c["title"], "pinToTop": False, "focusGlowEnabled": True, "viewMode": "TABBED_GRID",
            "showAllTab": False, "folders": folders}


def write_collections(path: Path, data: list[dict]) -> None:
    """Les collections facultatives en fin de fichier (remplacées si déjà là), les autres intactes devant."""
    ids = {c["id"] for c in COLLECTIONS}
    collections = [c for c in json.loads(path.read_text(encoding="utf-8")) if c["id"] not in ids]
    collections += [nuvio_collection(c) for c in data]
    path.write_text(json.dumps(collections, indent=2), encoding="utf-8", newline="\n")


def main() -> None:
    if "--collection" in sys.argv:
        write_collections(ROOT / "collections" / "collections.json", json.loads(DATA.read_text(encoding="utf-8")))
        return
    data = [build_collection(c) for c in COLLECTIONS]
    DATA.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(", ".join(f"{c['title']} {len(c['folders'])}" for c in data))


if __name__ == "__main__":
    main()
