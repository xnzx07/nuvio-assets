"""Tuiles des plateformes avec les 3 titres du moment : refaites chaque semaine (workflow plateformes.yml).

- <dossier>/plateformes/<slug>-fond.jpg et <slug>-fond.mp4 : fond (mur incliné des nouveautés de l'année, puis
  des titres populaires) et sa vidéo de 8 s, jouée une fois par Nuvio TV (ffmpeg : FFMPEG=chemin, sinon PATH).
- <dossier>/plateformes/<slug>.jpg (1280x720), <slug>.gif (arrivée, 7 Mo au plus) et <slug>.mp4 (AppTV) pour chaque
  plateforme de assets.json (platform_tiles) : logo blanc sur la couleur de la marque, affiches françaises
  des 2 films et de la série les plus populaires du moment en France sur la plateforme (TMDB).
- Le workflow range ces images sur la branche « tuiles-vivantes », réécrite en entier à chaque fois (un seul
  commit) : rien ne s'accumule dans l'historique de main. collections.json les lit à adresse fixe.
- Une plateforme en panne (ou avec moins de 3 affiches) garde ses images de la semaine d'avant, déjà dans
  le dossier : une tuile n'est jamais publiée trouée.

Usage : python scripts/make_platform_tiles.py <dossier>   (TMDB_API_KEY ; GIFSKI=chemin de gifski sinon PATH)
        python scripts/make_platform_tiles.py --collection   (une fois : collections.json lit la branche)
Code de sortie : 0 tout refait ; 3 au moins une tuile gardée de la semaine d'avant ; 2 une tuile sans images
d'avant n'a pas pu être faite (le reste est publié, puis le workflow signale l'échec) ; 1 clé refusée (rien
n'est modifié).
"""
import datetime as dt
import itertools
import json
import shutil
import sys
import tempfile
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from update_addon import TMDBAuthError, TMDBError, tmdb  # noqa: E402
import make_assets as ma  # noqa: E402
import tuiles  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
TILES = json.loads((ROOT / "assets.json").read_text(encoding="utf-8"))["platform_tiles"]
SLUGS = [t[0] for t in TILES]
HERO = (1920, 1080)   # fond (heroBackdropUrl) et vidéo de fond (heroVideoUrl)
MIN_WALL = 12         # en dessous, le mur du fond serait fait de quelques affiches géantes
WITHOUT_KEYWORDS = "9716|362573"   # mêmes mots-clés écartés que les rangées de films des plateformes
NOT_SHOWS = "10763|10764|10767"    # infos, téléréalité, talk-shows : pas des séries qui représentent une plateforme


def _poster(images: list[dict], fallback: str | None) -> str | None:
    for lang in ("fr", None):
        hit = next((i["file_path"] for i in images if i.get("iso_639_1") == lang), None)
        if hit:
            return hit
    return fallback


def pick_posters(movies: list[dict], shows: list[dict], images) -> list[str]:
    """Film n°1, film n°2, série n°1 (listes déjà classées par TMDB, sans doublon) ; s'il manque un film ou une
    série, le reste complète (séries, puis films). images(kind, id) → affiches TMDB du titre."""
    seen, used = set(), set()

    def posters(kind: str, titles: list[dict]):
        for t in titles:
            if (kind, t["id"]) in seen:
                continue
            seen.add((kind, t["id"]))
            poster = _poster(images(kind, t["id"]), t.get("poster_path"))
            if poster and poster not in used:
                used.add(poster)
                yield poster

    films, series = posters("movie", movies), posters("tv", shows)
    out = [p for _, p in zip(range(2), films)] + [p for _, p in zip(range(1), series)]
    for rest in (series, films):
        out += [p for _, p in zip(range(3 - len(out)), rest)]
    return out


def _images(kind: str, id: int) -> list[dict]:
    return tmdb(f"/{kind}/{id}/images", include_image_language="fr,null", language="").get("posters") or []


def today() -> dt.date:
    return dt.date.today()


def posters_for(provider: str) -> list[str]:
    """Films disponibles sortis depuis un an ; séries avec un épisode depuis deux mois, les originales de la
    plateforme (sa chaîne TMDB) d'abord, puis les autres séries disponibles. Sans les originales, le vieux
    catalogue domine (New York Unité Spéciale sur trois plateformes) ; Crunchyroll n'a pas de chaîne TMDB."""
    networks = next((t[4] for t in TILES if t[1] == provider), "")
    common = {"watch_region": "FR", "sort_by": "popularity.desc"}
    year_ago = (today() - dt.timedelta(days=365)).isoformat()
    recent = {"air_date.gte": (today() - dt.timedelta(days=60)).isoformat(), "without_genres": NOT_SHOWS}
    movies = tmdb("/discover/movie", without_keywords=WITHOUT_KEYWORDS, with_watch_providers=provider,
                  **{"primary_release_date.gte": year_ago}, **common).get("results") or []
    originals = (tmdb("/discover/tv", with_networks=networks, **recent, **common).get("results") or []) if networks else []
    others = tmdb("/discover/tv", with_watch_providers=provider, **recent, **common).get("results") or []
    return pick_posters(movies, originals + others, _images)


FILTERS = {"withGenres": "with_genres", "withoutGenres": "without_genres", "voteCountGte": "vote_count.gte",
           "voteAverageGte": "vote_average.gte", "withOriginalLanguage": "with_original_language",
           "withCompanies": "with_companies", "withoutKeywords": "without_keywords"}
MIN_VOTES = 50    # affiches d'une tuile de genre : pas de titres inconnus de tous
COLLECTIONS = json.loads((ROOT / "collections" / "collections.json").read_text(encoding="utf-8"))
PLATFORM_NAMES = {f["id"]: f["title"] for c in COLLECTIONS if c["id"] == "plateformes-streaming" for f in c["folders"]}


def source_params(source: dict) -> tuple[str, dict]:
    """Rangée « DISCOVER » de collections.json → (movie|tv, paramètres TMDB), mêmes filtres que la rangée."""
    kind = "tv" if source.get("mediaType") == "TV" else "movie"
    return kind, {FILTERS[k]: v for k, v in (source.get("filters") or {}).items() if k in FILTERS}


def folder_titles(folder: dict, pages: int = 1) -> list[dict]:
    """Titres du moment d'une tuile de genre ou d'envie : ses rangées « populaires », en alternance, sans doublon.
    → [{"poster", "backdrop"}]"""
    sources = [s for s in folder["sources"] if s.get("tmdbSourceType", "DISCOVER") == "DISCOVER"
               and s.get("sortBy") == "popularity.desc"]
    out, seen = [], set()
    for page in range(1, pages + 1):
        lists = []
        for src in sources:
            kind, params = source_params(src)
            params["vote_count.gte"] = max(params.get("vote_count.gte", 0), MIN_VOTES)
            if "16" not in str(params.get("with_genres", "")).replace(",", "|").split("|"):
                # Hors animation : ni dessins animés ni séries pour enfants (Doraemon classé « Action et aventure »).
                params["without_genres"] = "|".join(dict.fromkeys(filter(None, [*str(params.get("without_genres", "")).split("|"), "16", "10762"])))
            lists.append(tmdb(f"/discover/{kind}", sort_by="popularity.desc", page=page, **params).get("results") or [])
        for t in itertools.chain.from_iterable(itertools.zip_longest(*lists)):
            poster = (t or {}).get("poster_path")
            if poster and poster not in seen:
                seen.add(poster)
                out.append({"poster": poster, "backdrop": t.get("backdrop_path")})
    return out


def jobs() -> list[dict]:
    """Tout ce que la branche tuiles-vivantes contient : plateformes, puis genres et envies."""
    out = [{"family": "plateformes", "slug": t[0], "entry": t} for t in TILES]
    for col in COLLECTIONS:
        if col["id"] in ("genres", "envies"):
            for f in col["folders"]:
                out.append({"family": "genres", "slug": f["id"], "title": f["title"], "folder": f,
                            "kicker": "J'AI ENVIE DE" if col["id"] == "envies" else ""})
    return out


def wall_posters(provider: str, pages: int = 3) -> list[str]:
    """Affiches du fond (mur incliné) : les nouveautés de l'année d'abord (films sortis, séries lancées depuis
    un an ; elles tombent au milieu du fond), puis les titres populaires sur la plateforme pour compléter.
    Films et séries en alternance, sans doublon (une centaine : aucune affiche ne revient à l'écran)."""
    year_ago = (today() - dt.timedelta(days=365)).isoformat()
    common = {"watch_region": "FR", "with_watch_providers": provider, "sort_by": "popularity.desc"}
    out = []
    for movie_filter, show_filter in (({"primary_release_date.gte": year_ago}, {"first_air_date.gte": year_ago}), ({}, {})):
        for page in range(1, pages + 1):
            movies = tmdb("/discover/movie", without_keywords=WITHOUT_KEYWORDS, page=page, **movie_filter, **common).get("results") or []
            shows = tmdb("/discover/tv", without_genres=NOT_SHOWS, page=page, **show_filter, **common).get("results") or []
            for t in itertools.chain.from_iterable(itertools.zip_longest(movies, shows)):
                path = (t or {}).get("poster_path")
                if path and path not in out:
                    out.append(path)
    return out


def render(entry: list, posters: list[str], wall: list[str], folder: Path) -> None:
    """Tuile fixe, animation « arrivée », fond (mur incliné) et sa vidéo de 8 s."""
    slug, _provider, dark, brand, _networks = entry
    path = ROOT / "logos" / f"{slug}.png"
    # Sans logo propre (TF1+, france.tv, M6+ : icônes d'appli sur TMDB) : le nom de la plateforme en blanc.
    logo = tuiles.white_logo(Image.open(path).convert("RGBA")) if path.exists() else tuiles.text_logo(PLATFORM_NAMES[slug])
    if not path.exists():   # pas de logo sur main pour l'écran ouvert : le nom, dessiné ici
        ma.hero_title(PLATFORM_NAMES[slug], folder / f"{slug}-titre.png")
    tuiles.platform_card(logo, tuple(dark), tuple(brand), posters).convert("RGB").save(
        folder / f"{slug}.jpg", quality=90, optimize=True, progressive=True)
    tuiles.fit_gif([(size, None) for size in tuiles.GIF_SIZES],
                   lambda size, _, fps=tuiles.FPS: tuiles.platform_frames(logo, tuple(dark), tuple(brand), posters, size, fps),
                   folder / f"{slug}.gif", once=True)   # l'arrivée se joue une fois, puis la tuile reste
    tuiles.hero_still(wall, tuple(dark), HERO).save(folder / f"{slug}-fond.jpg", quality=88, optimize=True, progressive=True)
    tuiles.encode_mp4(tuiles.hero_frames(wall, tuple(dark), HERO), HERO, folder / f"{slug}-fond.mp4")


def render_genre(job: dict, titles: list[dict], wall: list[str], folder: Path) -> None:
    """Tuile façon sagas (éventail des titres du moment, nom à gauche), défilé, fond et vidéo de fond."""
    slug = job["slug"]
    theme = {"title": job["title"], "subtitle": "", "kicker": job["kicker"],
             "sagas": [{"poster": t["poster"], "backdrop": t["backdrop"]} for t in titles]}
    tuiles.saga_card(theme).save(folder / f"{slug}.jpg", quality=90, optimize=True, progressive=True)
    tuiles.saga_gif(theme, folder / f"{slug}.gif")
    tuiles.hero_still(wall, (0, 0, 0), HERO).save(folder / f"{slug}-fond.jpg", quality=88, optimize=True, progressive=True)
    tuiles.encode_mp4(tuiles.hero_frames(wall, (0, 0, 0), HERO), HERO, folder / f"{slug}-fond.mp4")


def build(out: Path) -> int:
    all_jobs = jobs()
    for family in {j["family"] for j in all_jobs}:
        (out / family).mkdir(parents=True, exist_ok=True)
    code, holes = 0, []
    with tempfile.TemporaryDirectory() as tmp:
        staging = Path(tmp)

        def keep(job: dict, why: str) -> None:
            nonlocal code
            print(f"{job['slug']} : {why}, images de la semaine d'avant gardées")
            code = 3
            if not (out / job["family"] / f"{job['slug']}.jpg").exists():
                holes.append(job["slug"])

        for job in all_jobs:
            slug, platform = job["slug"], job["family"] == "plateformes"
            try:
                if platform:
                    tile = posters_for(job["entry"][1])
                    wall = wall_posters(job["entry"][1])
                else:
                    tile = folder_titles(job["folder"], pages=3)     # la 1re page en tête : la tuile prend le début
                    wall = [t["poster"] for t in tile]
            except TMDBAuthError as e:
                print(f"{slug} : {e}")
                return 1
            except TMDBError as e:
                keep(job, f"TMDB en panne ({e})")
                continue
            if len(tile) < (3 if platform else 5) or len(wall) < MIN_WALL:
                keep(job, f"{len(tile)} affiche(s) pour la tuile, {len(wall)} pour le fond")
                continue
            folder = staging / job["family"] / slug
            folder.mkdir(parents=True)
            try:
                if platform:
                    render(job["entry"], tile, wall, folder)
                else:
                    render_genre(job, tile, wall, folder)
            except Exception as e:   # affiche introuvable, gifski, ffmpeg… : seulement cette tuile
                shutil.rmtree(folder)
                keep(job, f"dessin impossible ({type(e).__name__} : {e})")
                continue
            print(f"ok {slug}")
            tuiles.clear_caches()   # les affiches d'une tuile ne servent plus : mémoire rendue
        # Tout est dessiné : on remplace seulement maintenant, tuile par tuile (jeux complets).
        for family in staging.iterdir():
            for folder in family.iterdir():
                for f in folder.iterdir():
                    shutil.move(str(f), out / family.name / f.name)
    # Tuile retirée (assets.json, collections.json) : ses images quittent la branche.
    for family in {j["family"] for j in all_jobs}:
        slugs = {j["slug"] for j in all_jobs if j["family"] == family}
        for f in (out / family).iterdir():
            if f.name.split(".")[0].removesuffix("-fond").removesuffix("-titre") not in slugs:
                f.unlink()
    if holes:
        # Une tuile nouvelle sans images : elle reste grise, mais le reste est publié (sinon toutes les nouvelles
        # le seraient) ; le workflow publie puis signale l'échec.
        print(f"pas d'images pour {', '.join(holes)} : tuile(s) grise(s)")
        return 2
    return code


BRANCH = "https://raw.githubusercontent.com/xnzx07/nuvio-assets/tuiles-vivantes"
LIVE = {"plateformes-streaming": "plateformes", "genres": "genres", "envies": "genres"}


def point_platforms(path: Path) -> None:
    """Tuiles et fonds des plateformes, genres et envies lus sur la branche tuiles-vivantes, à adresse fixe
    (pas de ?v= : la TV revérifie l'image, la mise à jour du lundi arrive sans réimporter). Rien d'autre ne change."""
    collections = json.loads(path.read_text(encoding="utf-8"))
    for col in collections:
        if col["id"] not in LIVE:
            continue
        base = f"{BRANCH}/{LIVE[col['id']]}"
        for folder in col["folders"]:
            slug = folder["id"]
            folder.update(coverImageUrl=f"{base}/{slug}.jpg", focusGifUrl=f"{base}/{slug}.gif",
                          heroBackdropUrl=f"{base}/{slug}-fond.jpg", heroVideoUrl=f"{base}/{slug}-fond.mp4")
            if not folder.get("titleLogoUrl"):   # sans logo sur main (TF1+, france.tv, M6+) : le nom dessiné ici
                folder["titleLogoUrl"] = f"{base}/{slug}-titre.png"
    path.write_text(json.dumps(collections, indent=2), encoding="utf-8", newline="\n")


def main(argv: list[str]) -> int:
    if not argv:
        print("Usage : python scripts/make_platform_tiles.py <dossier> | --collection", file=sys.stderr)
        return 2
    if argv[0] == "--collection":     # une fois : brancher collections.json sur la branche
        point_platforms(ROOT / "collections" / "collections.json")
        return 0
    return build(Path(argv[0]))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
