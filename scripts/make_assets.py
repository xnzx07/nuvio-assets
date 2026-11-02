"""Génère toutes les images des collections Nuvio à partir de assets.json.

- genres/<slug>.jpg et seasons/<slug>.jpg : cartes 1280x720 (image + dégradé + titre)
- gifs/<groupe>/<slug>.gif : animations jouées au survol (480x270)
    * genres, saisons : un reflet lumineux traverse la carte
    * plateformes, studios : vraies intros des marques, faites par scripts/make_intros.py
- sagas/<slug>.jpg et gifs/sagas/<slug>.gif : les 8 thèmes de data/sagas.json (éventail d'affiches,
  défilé), dessinés par scripts/tuiles.py ; GIF encodé par gifski (GIFSKI=chemin, sinon dans le PATH),
  7 Mo au plus, et gifs/sagas/<slug>.mp4 pour AppTV. titles/sagas/<slug>.png : nom du thème pour l'écran ouvert.
  sagas/<slug>-fond.jpg et .mp4 : fond (mur incliné des affiches des films du thème) et sa vidéo de 8 s
  (ffmpeg : FFMPEG=chemin, sinon dans le PATH), jouée une fois par Nuvio TV.
- studios/<slug>.jpg, .gif, .mp4, -fond.jpg, -fond.mp4 : les studios de data/studios.json (logo sur la couleur du
  studio, ses 3 films les plus vus en éventail, arrivée ; fond : mur incliné de ses films).

Usage : python scripts/make_assets.py [dossier_images_locales]
Sans argument, les images sont téléchargées depuis TMDB.
"""
import http.client
import io
import json
import math
import sys
import time
import urllib.error
import urllib.request
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "fonts" / "BebasNeue-Regular.ttf"
ASSETS = json.loads((ROOT / "assets.json").read_text(encoding="utf-8"))
# Données des sagas et des studios (build_sagas.py, build_studios.py) : absentes, rien à dessiner (ce module est
# aussi importé chaque nuit par update_addon.py, qui n'en a pas besoin).
_data = lambda name: json.loads(p.read_text(encoding="utf-8")) if (p := ROOT / "data" / name).exists() else []
SAGAS, STUDIOS = _data("sagas.json"), _data("studios.json")
LOCAL: Path | None = None   # dossier d'images locales (tests), défini dans main()

CARD = (1280, 720)
HERO = (1920, 1080)  # fonds des sagas (heroBackdropUrl, heroVideoUrl)
GIF = (480, 270)
FRAMES = 36          # ~2,9 s par boucle
FRAME_MS = 80


# ---------- chargement ----------
@lru_cache(maxsize=None)
def fetch(path: str, size: str = "w1280") -> Image.Image:
    if LOCAL:
        return Image.open(LOCAL / path.lstrip("/")).convert("RGBA")
    # Image TMDB (« /xxx.png »), ou adresse complète pour un logo absent de TMDB (Crunchyroll).
    url = path if path.startswith("http") else f"https://image.tmdb.org/t/p/{size}{path}"
    req = urllib.request.Request(url, headers={"User-Agent": "nuvio-assets"})
    # Quelques essais : un raté passager du CDN de TMDB ne doit pas faire échouer toute la génération.
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return Image.open(io.BytesIO(r.read())).convert("RGBA")
        except urllib.error.HTTPError as e:
            if attempt == 3 or (e.code != 429 and e.code < 500):
                raise
        except (OSError, http.client.HTTPException):
            if attempt == 3:
                raise
        time.sleep(2 ** attempt)
    raise AssertionError("inaccessible")


def cover(img: Image.Image, w: int, h: int, zoom: float = 1.0) -> Image.Image:
    scale = max(w / img.width, h / img.height) * zoom
    img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    left, top = (img.width - w) // 2, (img.height - h) // 2
    return img.crop((left, top, left + w, top + h)).convert("RGB")


# ---------- habillage ----------
@lru_cache(maxsize=None)
def shade_mask(w: int, h: int) -> Image.Image:
    col = Image.new("L", (1, h))
    for y in range(h):
        t = y / h
        col.putpixel((0, y), int(70 + 150 * max(0.0, (t - 0.35) / 0.65) ** 1.4))
    return col.resize((w, h))


def shade(img: Image.Image) -> Image.Image:
    w, h = img.size
    return Image.composite(Image.new("RGB", (w, h)), img, shade_mask(w, h))


@lru_cache(maxsize=None)
def title_layer(text: str, w: int, h: int) -> Image.Image:
    k = w / CARD[0]
    text = text.upper()
    size = int(150 * k)
    font = ImageFont.truetype(str(FONT), size)
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    while probe.textlength(text, font=font) > w - 140 * k:
        size -= 4
        font = ImageFont.truetype(str(FONT), size)
    tw = probe.textlength(text, font=font)
    x, y = (w - tw) / 2, h - size - 60 * k

    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((x, y + 4 * k), text, font=font, fill=(0, 0, 0, 200))
    layer = layer.filter(ImageFilter.GaussianBlur(10 * k))
    ImageDraw.Draw(layer).text((x, y), text, font=font, fill=(255, 255, 255, 255))
    return layer


def titled(bg: Image.Image, text: str) -> Image.Image:
    base = shade(bg).convert("RGBA")
    return Image.alpha_composite(base, title_layer(text, *bg.size)).convert("RGB")


# ---------- animations ----------
def save_gif(frames: list[Image.Image], out: Path, durations, palette_from: Image.Image) -> None:
    # Palette commune : pas de scintillement, et seules les zones qui bougent pèsent.
    out.parent.mkdir(parents=True, exist_ok=True)
    pal = palette_from.quantize(colors=255, method=Image.Quantize.MAXCOVERAGE)
    # La couleur de fond (coin de l'image) doit être reproduite exactement,
    # sinon un fond blanc devient blanc cassé et la tuile change de teinte au survol.
    bg = palette_from.convert("RGB").getpixel((0, 0))
    entries = pal.getpalette()[:255 * 3]
    nearest = min(range(255), key=lambda k: sum((entries[3 * k + c] - bg[c]) ** 2 for c in range(3)))
    entries[3 * nearest:3 * nearest + 3] = list(bg)
    pal.putpalette(entries)
    # Pillow arrondit la correspondance couleur -> palette : on force donc les pixels
    # exactement égaux au fond à utiliser l'entrée exacte.
    solid = Image.new("RGB", frames[0].size, bg)
    q = []
    for f in frames:
        p = f.quantize(palette=pal, dither=Image.Dither.NONE)
        exact = ImageChops.difference(f.convert("RGB"), solid).convert("L").point(lambda v: 255 if v == 0 else 0)
        p.paste(nearest, mask=exact)
        q.append(p)
    q[0].save(out, save_all=True, append_images=q[1:], duration=durations, loop=0, optimize=True, disposal=1)


def light_band(cx: float, w: int, h: int) -> Image.Image:
    mask = Image.new("L", (w, h), 0)
    bw = 70 * w / GIF[0]
    ImageDraw.Draw(mask).polygon(
        [(cx - bw, h), (cx, h), (cx + h * 0.5, 0), (cx + h * 0.5 - bw, 0)], fill=110)
    return mask.filter(ImageFilter.GaussianBlur(18 * w / GIF[0]))


def sheen(card: Image.Image, out: Path) -> None:
    """Un reflet lumineux traverse la carte, puis pause."""
    w, h = card.size
    white = Image.new("RGB", (w, h), (255, 255, 255))
    steps = 32                     # 25 images/s pendant le passage (~1,3 s)

    def ease(t: float) -> float:   # accélère puis ralentit
        return 0.5 - 0.5 * math.cos(math.pi * t)

    start, end = -h * 0.5 - 70 * w / GIF[0] - 40, w + 40   # du bord gauche au bord droit, sans image perdue
    frames = [Image.composite(white, card, light_band(start + (end - start) * ease(i / (steps - 1)), w, h))
              for i in range(steps)]
    frames.append(card)
    # Palette construite à partir de la carte ET d'une image avec le reflet :
    # les tons éclaircis ont leurs propres couleurs, sans cassure.
    sample = Image.new("RGB", (w * 2, h))
    sample.paste(card, (0, 0))
    sample.paste(frames[steps // 2], (w, 0))
    save_gif(frames, out, [40] * steps + [1500], sample)


# ---------- logos et titres pour le grand carrousel ----------
KEEP_COLORS = set(ASSETS.get("keep_logo_colors", []))
LIGHTEN_DARK = set(ASSETS.get("lighten_dark_logos", []))


def hero_logo(slug: str, path: str, out: Path) -> None:
    """Logo lisible sur un fond sombre : blanc, sauf logos déjà colorés."""
    logo = fetch(path, "original")
    logo = logo.crop(logo.getbbox() or (0, 0, logo.width, logo.height))
    if slug in LIGHTEN_DARK:
        # Garde les couleurs vives, passe en blanc les zones sombres (illisibles sur fond noir).
        rgb = logo.convert("RGB")
        r, g, b = rgb.split()
        brightest = ImageChops.lighter(ImageChops.lighter(r, g), b)
        lum = brightest.point(lambda v: 255 if v < 80 else 0)  # quasi-noir seulement
        white = Image.new("RGBA", logo.size, (255, 255, 255, 255))
        white.putalpha(logo.getchannel("A"))
        logo = Image.composite(white, logo, lum)
    elif slug not in KEEP_COLORS:
        alpha = logo.getchannel("A")
        logo = Image.new("RGBA", logo.size, (255, 255, 255, 255))
        logo.putalpha(alpha)
    logo.thumbnail((900, 300), Image.LANCZOS)
    out.parent.mkdir(parents=True, exist_ok=True)
    logo.save(out, optimize=True)


def hero_title(text: str, out: Path) -> None:
    """Titre en Bebas Neue blanc, ombre douce, fond transparent."""
    text = text.upper()
    font = ImageFont.truetype(str(FONT), 200)
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    l, t, r, b = probe.textbbox((0, 0), text, font=font)
    pad = 30
    w, h = r - l + 2 * pad, b - t + 2 * pad
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((pad - l, pad - t + 5), text, font=font, fill=(0, 0, 0, 170))
    layer = layer.filter(ImageFilter.GaussianBlur(12))
    ImageDraw.Draw(layer).text((pad - l, pad - t), text, font=font, fill=(255, 255, 255, 255))
    layer.thumbnail((1000, 300), Image.LANCZOS)
    out.parent.mkdir(parents=True, exist_ok=True)
    layer.save(out, optimize=True)


# ---------- programme ----------
def main() -> None:
    global LOCAL
    LOCAL = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    for group in ("platforms", "studios"):
        for slug, _label, path in ASSETS[group]:
            hero_logo(slug, path, ROOT / "logos" / f"{slug}.png")
    for group in ("genres", "seasons", "moods"):
        for slug, label, _path in ASSETS[group]:
            hero_title(label, ROOT / "titles" / group / f"{slug}.png")
    for theme in SAGAS:
        hero_title(theme["title"], ROOT / "titles" / "sagas" / f"{theme['slug']}.png")
    print("ok logos et titres")
    for group in ("genres", "seasons", "moods"):
        (ROOT / group).mkdir(exist_ok=True)
        for slug, label, path in ASSETS[group]:
            titled(cover(fetch(path), *CARD), label).save(
                ROOT / group / f"{slug}.jpg", quality=88, optimize=True, progressive=True)
            sheen(titled(cover(fetch(path), *GIF), label), ROOT / "gifs" / group / f"{slug}.gif")
            print("ok", group, slug)
    import tuiles   # ici : tuiles importe ce module
    tuiles.ma.LOCAL = LOCAL
    (ROOT / "sagas").mkdir(exist_ok=True)
    for theme in SAGAS:
        tuiles.saga_card(theme).save(ROOT / "sagas" / f"{theme['slug']}.jpg", quality=90, optimize=True, progressive=True)
        n, size, steps = tuiles.saga_gif(theme, ROOT / "gifs" / "sagas" / f"{theme['slug']}.gif")
        wall = tuiles.theme_wall_posters(theme)
        still = tuiles.hero_still(wall, (0, 0, 0), HERO)
        mp4 = ROOT / "sagas" / f"{theme['slug']}-fond.mp4"
        # Fond inchangé : la vidéo non plus (une autre version de ffmpeg réécrirait 20 Mo de vidéos pour rien).
        fond = ROOT / "sagas" / f"{theme['slug']}-fond.jpg"
        if tuiles.save_if_changed(still, fond, quality=88, optimize=True, progressive=True) or not mp4.exists():
            tuiles.encode_mp4(tuiles.hero_frames(wall, (0, 0, 0), HERO), HERO, mp4)
        print(f"ok sagas {theme['slug']} : {size[0]}x{size[1]}, {steps} sagas, {n / 1e6:.1f} Mo ; fond {mp4.stat().st_size / 1e6:.1f} Mo")
        tuiles.clear_caches()   # les affiches d'un thème ne servent plus : mémoire rendue
    (ROOT / "studios").mkdir(exist_ok=True)
    for studio in STUDIOS:
        slug, (dark, brand) = studio["slug"], ASSETS["studio_tiles"][studio["slug"]]
        dark, brand = tuple(dark), tuple(brand)
        logo = Image.open(ROOT / "logos" / f"{slug}.png").convert("RGBA")   # déjà lisible sur fond sombre
        tiles = studio["posters"][:3]
        tuiles.save_if_changed(tuiles.platform_card(logo, dark, brand, tiles), ROOT / "studios" / f"{slug}.jpg",
                               quality=90, optimize=True, progressive=True)
        tuiles.fit_gif([(size, None) for size in tuiles.GIF_SIZES],
                       lambda size, _, fps=tuiles.FPS: tuiles.platform_frames(logo, dark, brand, tiles, size, fps),
                       ROOT / "studios" / f"{slug}.gif",
                       once=True)   # l'arrivée se joue une fois, puis la tuile reste
        mp4 = ROOT / "studios" / f"{slug}-fond.mp4"
        fond = tuiles.hero_still(studio["posters"], dark, HERO)
        if tuiles.save_if_changed(fond, ROOT / "studios" / f"{slug}-fond.jpg", quality=88, optimize=True, progressive=True) \
                or not mp4.exists():
            tuiles.encode_mp4(tuiles.hero_frames(studio["posters"], dark, HERO), HERO, mp4)
        print(f"ok studios {slug} : {len(studio['posters'])} affiches")
        tuiles.clear_caches()


if __name__ == "__main__":
    main()
