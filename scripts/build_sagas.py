"""Sagas rangées en 8 thèmes : data/sagas.json, et la collection « Sagas » de collections/collections.json.

- data/sagas.json : pour chaque thème, ses sagas (collections TMDB) avec le nom français, les votes des
  films déjà sortis (pour l'ordre), l'affiche française du premier film (pas celle du coffret, pleine de
  « Collection ») et un fond sans texte.
  Lu par make_assets.py (tuiles des thèmes) et par --collection ci-dessous.
- Les thèmes et leurs sagas sont choisis à la main (THEMES) ; TITLES impose un nom quand celui de TMDB
  est ambigu (deux sagas du même nom) ou en anglais.

Usage :
  python scripts/build_sagas.py               refait data/sagas.json (TMDB_API_KEY nécessaire) ;
                                              à relancer seulement quand la liste change.
  python scripts/build_sagas.py --collection  réécrit la collection « Sagas » de collections/collections.json
                                              depuis data/sagas.json (sans réseau).
"""
import datetime as dt
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from update_addon import tmdb  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "sagas.json"
TODAY = dt.date.today().isoformat()

THEMES = [
    ("action", "Action et aventure", [645, 9485, 87359, 404609, 84, 295, 230, 31562, 1570, 2883, 391860, 1575, 304, 1069584, 102322, 135483, 14890, 5039, 495527, 126125, 531330, 523855, 553717, 945, 90863, 1733, 9518, 85861, 70068, 2467, 64751, 1657, 257960]),
    ("super-heros", "Super-héros", [86311, 748, 263, 131292, 131296, 131295, 531241, 284433, 448150, 556, 422834, 558216, 529892, 468552, 120794, 573436, 735, 17235, 8537, 248534]),
    ("sf", "Science-fiction et fantastique", [1241, 10, 328, 119, 131635, 528, 2344, 87096, 33514, 121938, 264, 8650, 8945, 173710, 295130, 86055, 435259, 399, 283579, 422837, 115575, 420, 726871, 2980, 2794, 63043, 151, 1709]),
    ("horreur", "Horreur", [656, 8091, 313086, 2602, 477962, 17255, 91361, 256322, 8864, 2326, 228446, 9735, 2366, 41437, 8581, 402074, 10455, 1960, 111751, 357173, 115762, 1100788, 1240438, 425175]),
    ("animation", "Animation et famille", [10194, 2150, 8354, 86066, 137697, 468222, 137696, 77816, 1022790, 87118, 386382, 94032, 14740, 185103, 544669, 94602, 762512, 229932, 489724, 134897, 720879, 85943, 488924]),
    ("comedie", "Comédie et romance", [86119, 344830, 9888, 4246, 2806, 702624, 306031, 8936, 458558, 298820, 86024]),
    ("francais", "Cinéma français", [2396, 211721, 85817, 579870, 1413999, 10517, 52888, 389544, 331841, 52835, 629597, 913258, 377491, 52097, 103001, 85945, 442352, 303872, 115840, 579012, 455123, 1076903, 105764]),
    ("animes", "Animés", [23616, 925155, 620873, 23456, 23026, 39199, 133352, 34055, 210303, 1189668, 96850, 386410, 196753]),
]
TITLES = {
    9485: "Fast & Furious", 645: "James Bond 007", 556: "Spider-Man (Sam Raimi)", 120794: "Batman (1989-1997)",
    151: "Star Trek : les films originaux", 1709: "La Planète des singes (1968)", 762512: "Le Roi Lion (2019)",
    425175: "Massacre à la tronçonneuse (remake)", 210303: "Evangelion (Rebuild)", 96850: "Evangelion (films)",
    913258: "Les Trois Mousquetaires (2023)", 64751: "Hyper Tension",
}


def clean_title(name: str) -> str:
    """« Harry Potter - Saga » → « Harry Potter » ; « … Collection » → « … »."""
    return re.sub(r"\s*-\s*Saga\b.*$|\s+Collection$", "", name).strip()


def _first(images: list[dict], lang) -> str | None:
    return next((i["file_path"] for i in images if i.get("iso_639_1") == lang), None)


def _released(collection: dict) -> list[dict]:
    return sorted((p for p in collection.get("parts") or [] if p.get("release_date") and p["release_date"] <= TODAY),
                  key=lambda p: p["release_date"])


def _in_order(parts: list[dict]) -> bool:
    dates = [p.get("release_date") or "9999" for p in parts]
    return dates == sorted(dates)


def first_film(collection: dict) -> dict | None:
    """Premier film sorti de la saga (son affiche représente la saga, pas celle du coffret)."""
    released = _released(collection)
    return released[0] if released else None


def saga_entry(collection: dict, images: dict, override: str | None) -> dict | None:
    """Entrée de data/sagas.json ; None sans aucune affiche (la saga est écartée).
    images : {"posters": affiches du premier film, "backdrops": fonds de la saga}."""
    posters = images.get("posters") or []
    first = first_film(collection) or {}
    poster = _first(posters, "fr") or _first(posters, None) or first.get("poster_path")
    if not poster:
        return None
    released = _released(collection)
    return {
        "id": collection["id"],
        "title": override or clean_title(collection.get("name") or ""),
        "votes": sum(p.get("vote_count") or 0 for p in released),
        "poster": poster,
        "backdrop": _first(images.get("backdrops") or [], None),
        "films": [p["poster_path"] for p in released if p.get("poster_path")],   # affiches (VF) de chaque film : fonds
        # TMDB rend-il la saga dans l'ordre de sortie (films annoncés sans date à la fin) ? Sinon, rangée de l'addon.
        "in_order": _in_order(collection.get("parts") or []),
    }


def fetch_saga(cid: int) -> dict | None:
    collection = tmdb(f"/collection/{cid}")
    if not collection:
        print(f"saga {cid} introuvable sur TMDB : écartée")
        return None
    backdrops = tmdb(f"/collection/{cid}/images", include_image_language="null", language="").get("backdrops")
    first = first_film(collection)
    posters = tmdb(f"/movie/{first['id']}/images", include_image_language="fr,null", language="").get("posters") if first else []
    entry = saga_entry(collection, {"posters": posters, "backdrops": backdrops}, TITLES.get(cid))
    if entry is None:
        print(f"saga {cid} ({collection.get('name')}) sans affiche : écartée")
    return entry


def build() -> list[dict]:
    with ThreadPoolExecutor(8) as ex:
        out = []
        for slug, title, ids in THEMES:
            sagas = [s for s in ex.map(fetch_saga, ids) if s]
            out.append({"slug": slug, "title": title, "sagas": sorted(sagas, key=lambda s: -s["votes"])})
    return out


RAW = "https://raw.githubusercontent.com/xnzx07/nuvio-assets/main"
ADDON_ID = "com.xnzx07.catalogue-fr"   # worker/hote.js (une copie : « .perso », réécrit par le Worker)


def saga_source(s: dict) -> dict:
    if s.get("in_order", True):
        return {"provider": "tmdb", "tmdbSourceType": "COLLECTION", "title": s["title"], "tmdbId": s["id"],
                "mediaType": "MOVIE", "sortBy": "original", "filters": {}}
    # Un catalogue par saga : Nuvio TV reconnaît une rangée à son catalogue (titre, défilement, « Charger plus »).
    # Genre « Saga » : le filtre que le catalogue exige (sans lui, l'appli sur ordinateur le met sur l'accueil).
    return {"provider": "addon", "addonId": ADDON_ID, "type": "movie", "catalogId": f"saga-{s['id']}", "genre": "Saga"}


def first_row_direct(sagas: list[dict]) -> list[dict]:
    """La première saga lue en direct chez TMDB passe en tête. Nuvio TV se place sur la première rangée une fois
    chargée : une rangée de l'addon arrive après celles de TMDB, Nuvio est déjà descendu plus bas et le dossier ne
    s'ouvre pas en haut."""
    i = next((k for k, s in enumerate(sagas) if s.get("in_order", True)), 0)
    return [sagas[i], *sagas[:i], *sagas[i + 1:]]


def sagas_collection(themes: list[dict]) -> dict:
    """Collection « Sagas » : une tuile par thème, une rangée par saga (films dans l'ordre de sortie)."""
    folders = []
    for t in themes:
        slug = t["slug"]
        folders.append({
            "id": f"sagas-{slug}",
            "title": t["title"],
            "tileShape": "LANDSCAPE",
            "hideTitle": True,
            "focusGifEnabled": True,
            # Saga dans l'ordre chez TMDB : Nuvio la lit en direct (gratuit). Dans le désordre (53 sur 175 : Rocky
            # Balboa avant Rocky…), rangée de l'addon, dans l'ordre de sortie (Nuvio ne sait pas trier du plus ancien
            # au plus récent) ; le nom de la saga la désigne (worker/facultatives.js).
            "sources": [saga_source(s) for s in first_row_direct(t["sagas"])],
            "coverImageUrl": f"{RAW}/sagas/{slug}.jpg?v=1",
            "focusGifUrl": f"{RAW}/gifs/sagas/{slug}.gif?v=1",
            "heroBackdropUrl": f"{RAW}/sagas/{slug}-fond.jpg?v=1",
            "heroVideoUrl": f"{RAW}/sagas/{slug}-fond.mp4?v=1",
            "titleLogoUrl": f"{RAW}/titles/sagas/{slug}.png?v=1",
        })
    return {"id": "sagas", "title": "Sagas", "pinToTop": False, "focusGlowEnabled": True, "viewMode": "ROWS",
            "showAllTab": False, "folders": folders}


def write_collection(path: Path, themes: list[dict]) -> None:
    """Remplace la collection « Sagas » à sa place, sans toucher aux autres (même format que le fichier)."""
    collections = json.loads(path.read_text(encoding="utf-8"))
    i = next(k for k, c in enumerate(collections) if c["id"] == "sagas")
    collections[i] = sagas_collection(themes)
    path.write_text(json.dumps(collections, indent=2), encoding="utf-8", newline="\n")


def main() -> None:
    if "--collection" in sys.argv:
        write_collection(ROOT / "collections" / "collections.json", json.loads(DATA.read_text(encoding="utf-8")))
        return
    themes = build()
    DATA.write_text(json.dumps(themes, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(", ".join(f"{t['title']} {len(t['sagas'])}" for t in themes))


if __name__ == "__main__":
    main()
