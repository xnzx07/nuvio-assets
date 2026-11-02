"""Tuiles des collections facultatives (data/optionnelles.json) : dessinées pour la branche tuiles-optionnelles.

- <dossier>/<collection>/<tuile>.jpg, .gif, .mp4, -fond.jpg, -fond.mp4, -titre.png : tuile fixe, animation (défilé
  façon sagas ; arrivée façon plateformes pour les chaînes) en GIF et en vidéo (AppTV), fond (mur incliné), vidéo de
  fond, nom pour l'écran ouvert. Mêmes dessins que les collections principales (tuiles.py).
- --part i/n : seulement une tuile sur n (tâches en parallèle du workflow optionnelles.yml) ; --avant <dossier> :
  images de la fabrication d'avant, reprises pour une tuile qui ne peut pas être faite (jamais de tuile grise).
- --leger : secours si GitHub ralentit ces adresses : animation 480x270 sans vidéo (AppTV reprend alors le GIF), vidéo
  de fond réduite à une image fixe, aux mêmes adresses (rien à réimporter).

Usage : python scripts/make_optional_tiles.py <dossier> [--part i/n] [--avant <dossier>] [--leger]
Code de sortie : 0 tout fait ; 3 au moins une tuile reprise d'avant ; 2 une tuile sans image d'avant n'a pas pu
être faite (le reste est écrit ; le workflow publie puis signale l'échec) ; 1 arguments invalides.
"""
import json
import shutil
import sys
import tempfile
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_assets as ma  # noqa: E402
import tuiles  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "optionnelles.json"
FILES = ["{}.jpg", "{}.gif", "{}-fond.jpg", "{}-fond.mp4", "{}-titre.png", "{}.mp4"]
HERO = (1920, 1080)


def jobs() -> list[dict]:
    data = json.loads(DATA.read_text(encoding="utf-8")) if DATA.exists() else []
    return [{"family": c["id"], "slug": f["id"], "title": f["title"], "style": c["style"], "folder": f}
            for c in data for f in c["folders"]]


def part(all_jobs: list[dict], i: int, n: int) -> list[dict]:
    """Une tuile sur n, à partir de la i-ième : des parties de même taille, toutes les tuiles une seule fois."""
    return all_jobs[i - 1::n]


def channel_logo(name: str) -> Image.Image:
    """Nom de la chaîne en blanc (voir tuiles.text_logo)."""
    return tuiles.text_logo(name)


def render(job: dict, tile: list[dict], wall: list[str], folder: Path, leger: bool = False) -> None:
    slug, f = job["slug"], job["folder"]
    sizes = [(480, 270)] if leger else list(tuiles.GIF_SIZES)
    if job["style"] == "plateforme":
        dark, brand = (tuple(c) for c in f["colors"])
        logo, posters = channel_logo(job["title"]), [t["poster"] for t in tile[:3]]
        tuiles.platform_card(logo, dark, brand, posters).save(folder / f"{slug}.jpg", quality=90, optimize=True, progressive=True)
        tuiles.fit_gif([(s, None) for s in sizes], lambda s, _, fps=tuiles.FPS: tuiles.platform_frames(logo, dark, brand, posters, s, fps),
                       folder / f"{slug}.gif", once=True, video=not leger)   # arrivée jouée une fois
        tint = dark
    else:
        theme = {"title": job["title"], "subtitle": "", "sagas": tile}
        tuiles.saga_card(theme).save(folder / f"{slug}.jpg", quality=90, optimize=True, progressive=True)
        top = min(8, len(tile))
        tuiles.fit_gif([(s, k) for s in sizes for k in range(top, min(top, 4) - 1, -1)],
                       lambda s, k, fps=tuiles.FPS: tuiles.saga_frames(theme, k, s, fps), folder / f"{slug}.gif", video=not leger)
        tint = (0, 0, 0)
    ma.hero_title(job["title"], folder / f"{slug}-titre.png")
    still = tuiles.hero_still(wall, tint, HERO)
    still.save(folder / f"{slug}-fond.jpg", quality=88, optimize=True, progressive=True)
    if leger:   # une seule image, une seconde : la vidéo pèse presque rien
        small = still.resize((1280, 720), Image.LANCZOS)
        tuiles.encode_mp4((small for _ in range(tuiles.FPS)), (1280, 720), folder / f"{slug}-fond.mp4")
    else:
        tuiles.encode_mp4(tuiles.hero_frames(wall, tint, HERO), HERO, folder / f"{slug}-fond.mp4")


def run(out: Path, selected: list[dict], avant: Path, leger: bool) -> int:
    code, holes = 0, []
    with tempfile.TemporaryDirectory() as tmp:
        staging = Path(tmp)
        for job in selected:
            f, slug = job["folder"], job["slug"]
            tile = [{"poster": p, "backdrop": f.get("backdrop")} for p in f.get("posters") or []]
            folder = staging / job["family"] / slug
            folder.mkdir(parents=True)
            try:
                if not tile or not f.get("wall"):
                    raise ValueError("aucune affiche")
                render(job, tile, f["wall"], folder, leger)
                print(f"ok {slug}", flush=True)
            except Exception as e:   # affiche introuvable, gifski, ffmpeg… : seulement cette tuile
                shutil.rmtree(folder)
                folder.mkdir(parents=True)
                old = [avant / job["family"] / n.format(slug) for n in FILES]
                print(f"{slug} : dessin impossible ({type(e).__name__} : {e}), images d'avant reprises")
                code = 3
                if not all(p.exists() for p in old[:4]):
                    holes.append(slug)
                    continue
                for p in old:
                    if p.exists():
                        shutil.copy(p, folder / p.name)
            tuiles.clear_caches()
        for family in staging.iterdir():
            for folder in family.iterdir():
                (out / family.name).mkdir(parents=True, exist_ok=True)
                for f in folder.iterdir():
                    shutil.move(str(f), out / family.name / f.name)
    if holes:
        # Une tuile nouvelle sans images reste grise, mais le reste est publié ; le workflow signale l'échec.
        print(f"pas d'images pour {', '.join(holes)} : tuile(s) grise(s)")
        return 2
    return code


def main(argv: list[str]) -> int:
    if not argv or argv[0].startswith("--"):
        print(__doc__.split("Usage : ")[1].split("\n")[0], file=sys.stderr)
        return 1
    out, i, n, avant, leger = Path(argv[0]), 1, 1, None, "--leger" in argv
    if "--part" in argv:
        i, n = (int(x) for x in argv[argv.index("--part") + 1].split("/"))
    if "--avant" in argv:
        avant = Path(argv[argv.index("--avant") + 1])
    out.mkdir(parents=True, exist_ok=True)
    return run(out, part(jobs(), i, n), avant or out, leger)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
