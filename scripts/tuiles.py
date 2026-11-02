"""Dessin des tuiles des collections Sagas (thèmes) et Plateformes, et encodage de leurs animations.

- Sagas : éventail d'affiches françaises à droite, nom du thème à gauche dans une zone à lui (le texte
  rétrécit, il ne passe jamais sur les affiches) ; animation « défilé » : les cartes glissent d'une place
  et la saga suivante entre à droite.
- Plateformes : logo blanc à gauche sur un dégradé aux couleurs de la marque, 3 titres du moment en
  éventail à droite ; animation « arrivée » : le logo glisse, puis les cartes tombent une à une.
- Toutes les mesures sont des fractions de la taille de la tuile : la même tuile se dessine en 1280x720
  (image fixe) et en 720x405 ou 480x270 (animation).
- Animations encodées par gifski (palettes optimisées image par image), 50 images/s, pour Nuvio TV ; et en vidéo
  H.264 720p à 60 images/s à côté du GIF (<tuile>.mp4), pour AppTV, qui en déduit l'adresse depuis celle du GIF.
"""
import math
import os
import subprocess
import tempfile
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

import make_assets as ma

CARD = (1280, 720)
FPS = 50                 # animations des tuiles : 50 i/s, le plus fluide qu'un GIF permette (2 centièmes)
FRAME_MS = 1000 // FPS
HERO_FPS = 60            # vidéos de fond : 60 i/s, comme l'écran de la TV (pas d'à-coups)
# 640x360 : plus grand que la tuile sur une TV 1080p (environ 420 px de large), et 50 i/s tiennent sous 7 Mo.
GIF_SIZES = ((640, 360), (480, 270))
GIF_MAX_BYTES = 7 * 1024 * 1024         # au-delà, Nuvio TV abandonne l'image (plus de 8 s pour arriver)
GIFSKI_OPTS = ["--quality", "100", "--motion-quality", "90", "--lossy-quality", "90"]   # comme make_intros.py
# Vidéo de la tuile pour AppTV : décodée par la puce de la télé, sans limite de couleurs ni de poids à tenir.
VIDEO_SIZE, VIDEO_FPS = (1280, 720), 60
HERO_X264 = ["-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p"]
# Niveau 4.1 et 4 images de référence : les limites des puces des petites box. Couleurs en BT.709 écrites et annoncées
# (ffmpeg convertit en BT.601 par défaut) : sinon la tuile change de teinte quand la vidéo prend le relais de l'image.
TILE_X264 = ["-vf", "scale=out_color_matrix=bt709:out_range=tv", "-c:v", "libx264", "-profile:v", "high", "-level", "4.1",
             "-refs", "4", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
             "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"]

# ---------- sagas : géométrie (fractions de la largeur W ou de la hauteur H) ----------
TEXT_X, TEXT_W = 0.050, 0.336          # zone du titre
TITLE_MAX, TITLE_MIN = 0.161, 0.075    # taille du titre (H), réduite jusqu'à ce qu'il tienne
SUB_SIZE = 0.053                        # « 29 SAGAS » (H)
FAN_CX, FAN_TOP = 0.722, 0.133          # centre de l'éventail (W), haut des affiches (H)
POSTER_H = 0.570                        # hauteur d'une affiche (H), format 2:3
FAN_STEP, FAN_ANGLE, FAN_DROP = 0.072, 6, 10 / 360   # écart (W), inclinaison (degrés) et descente (H) par place
FAN_HALF = 2                            # places -2 … 2 visibles
FAN_LEFT = 0.43                         # rien de l'éventail à gauche de cette ligne (W)
REST_MS, SLIDE_FRAMES = 1100, 24        # défilé : repos, puis glissement d'une place (0,48 s)


def smooth(t: float) -> float:
    """Départ et arrivée tout en douceur (smootherstep)."""
    t = max(0.0, min(1.0, t))
    return t * t * t * (t * (6 * t - 15) + 10)


def clear_caches() -> None:
    for f in (_poster, _backdrop, title_layer, _brand_bg, _tilted, _hero_veil, _wall_canvas, _veil_parts):
        f.cache_clear()


def _rounded(im: Image.Image, r: int) -> Image.Image:
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.width - 1, im.height - 1], r, fill=255)
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.paste(im.convert("RGBA"), (0, 0), mask)
    return out


@lru_cache(maxsize=None)
def _poster(path: str, h: int, radius: int) -> Image.Image:
    img = ma.fetch(path, "w780").convert("RGBA")
    return _rounded(img.resize((round(h * 2 / 3), h), Image.LANCZOS), radius)


def _fade(im: Image.Image, alpha: float) -> Image.Image:
    if alpha >= 1:
        return im
    out = im.copy()
    out.putalpha(im.getchannel("A").point(lambda v: round(v * alpha)))
    return out


def _subpixel(im: Image.Image, x: float, y: float) -> tuple[Image.Image, tuple[int, int]]:
    """L'image décalée de la partie décimale de (x, y) (rééchantillonnée), et où la poser au pixel près : une carte
    qui avance de 1,6 pixel par image n'avance plus par sauts de 1 puis 2 pixels."""
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = x - ix, y - iy
    if fx == 0 and fy == 0:
        return im, (ix, iy)
    # Bordure transparente d'abord : sinon le rééchantillonnage recopie le pixel du bord et le bord reste net.
    padded = Image.new("RGBA", (im.width + 4, im.height + 4), (0, 0, 0, 0))
    padded.paste(im, (2, 2))
    moved = padded.transform(padded.size, Image.AFFINE, (1, 0, -fx, 0, 1, -fy), resample=Image.BICUBIC)
    return moved, (ix - 2, iy - 2)


def _put(base: Image.Image, im: Image.Image, x: float, y: float, alpha: float = 1.0) -> None:
    """Pose une carte avec son ombre portée floue, au sous-pixel près."""
    w = base.width
    im = _fade(im, alpha)
    shadow = Image.new("RGBA", im.size, (0, 0, 0, 0))
    shadow.putalpha(im.getchannel("A").point(lambda v: round(v * 0.7)))
    sh, at = _subpixel(shadow.filter(ImageFilter.GaussianBlur(8 * w / 640)), x + 4 * w / 640, y + 8 * w / 640)
    base.alpha_composite(sh, at) if at[0] >= 0 and at[1] >= 0 else _composite_anywhere(base, sh, at)
    card, at = _subpixel(im, x, y)
    base.alpha_composite(card, at) if at[0] >= 0 and at[1] >= 0 else _composite_anywhere(base, card, at)


def _composite_anywhere(base: Image.Image, im: Image.Image, at: tuple[int, int]) -> None:
    """alpha_composite refuse une position négative : on rogne la partie qui sort à gauche ou en haut."""
    x, y = at
    if -x >= im.width or -y >= im.height or x >= base.width or y >= base.height:
        return                                   # entièrement hors de l'image (une carte qui tombe d'en haut)
    crop = im.crop((max(0, -x), max(0, -y), im.width, im.height))
    base.alpha_composite(crop, (max(0, x), max(0, y)))


def _fan(base: Image.Image, posters: list[str], positions: list[float], cx: float, top: float,
         poster_h: float, step: float, angle: float, half: float) -> None:
    """Cartes en éventail ; place 0 au centre. Au-delà de ±half, la carte s'efface ; à gauche elle
    s'efface sur place (elle ne glisse jamais vers le titre)."""
    W, H = base.size
    ph = round(poster_h * H)
    for o, path in sorted(zip(positions, posters), key=lambda t: t[0]):
        alpha = 1.0 if abs(o) <= half else max(0.0, 1 - (abs(o) - half))
        if alpha <= 0:
            continue
        place = max(o, -half)
        card = _poster(path, ph, round(8 * W / 640)).rotate(-place * angle, expand=True, resample=Image.BICUBIC)
        _put(base, card, cx * W + place * step * W - card.width / 2, top * H + abs(place) * FAN_DROP * H, alpha)


@lru_cache(maxsize=None)
def _backdrop(path: str, size: tuple[int, int]) -> Image.Image:
    W, H = size
    bg = ma.cover(ma.fetch(path), W, H).filter(ImageFilter.GaussianBlur(14 * W / 640)).convert("RGBA")
    bg.alpha_composite(Image.new("RGBA", size, (0, 0, 0, 140)))
    veil = Image.new("L", size)
    d = ImageDraw.Draw(veil)
    for x in range(W):
        t = x / W
        a = 235 - (235 - 150) * t / 0.42 if t < 0.42 else (150 * (0.5 - t) / 0.08 if t < 0.5 else 0)
        d.line([(x, 0), (x, H)], fill=round(a))
    black = Image.new("RGBA", size, (0, 0, 0, 255))
    black.putalpha(veil)
    bg.alpha_composite(black)
    return bg


@lru_cache(maxsize=None)
def title_layer(title: str, subtitle: str, size: tuple[int, int], kicker: str = "") -> Image.Image:
    """Nom en Bebas Neue, coupé en 1 à 3 lignes et réduit jusqu'à tenir dans la zone du titre ; sur-titre
    (« J'AI ENVIE DE ») au-dessus et sous-titre (« 29 SAGAS ») en dessous, en petit, s'il y en a."""
    W, H = size
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    max_w = TEXT_W * W
    words = title.upper().split()
    px = round(TITLE_MAX * H)
    while True:
        font = ImageFont.truetype(str(ma.FONT), px)
        lines, cur = [], ""
        for word in words:
            test = f"{cur} {word}".strip()
            if cur and d.textlength(test, font=font) > max_w:
                lines.append(cur)
                cur = word
            else:
                cur = test
        lines.append(cur)
        fits = len(lines) <= 3 and all(d.textlength(l, font=font) <= max_w for l in lines)
        if fits or px <= TITLE_MIN * H:
            break
        px -= max(1, round(H / 360))
    line_h = px * 0.92
    sub_px = round(SUB_SIZE * H)
    sub = ImageFont.truetype(str(ma.FONT), sub_px)
    spacing = 3 * W / 640

    def spaced(text: str, y: float) -> None:
        x = TEXT_X * W + 2 * W / 640
        for ch in text:
            d.text((x, y), ch, font=sub, fill=(255, 255, 255, 205), anchor="ls")
            x += d.textlength(ch, font=sub) + spacing

    block = len(lines) * line_h + (sub_px * 1.6 if subtitle else 0) + (sub_px * 1.4 if kicker else 0)
    y = H / 2 - block / 2 + (sub_px * 1.4 if kicker else 0) + px * 0.8
    if kicker:
        spaced(kicker, y - px * 0.8 - sub_px * 0.5)
    for line in lines:
        d.text((TEXT_X * W, y), line, font=font, fill=(255, 255, 255, 255), anchor="ls")
        y += line_h
    if subtitle:
        spaced(subtitle, y + sub_px * 0.5)
    return layer


def title_box(title: str, subtitle: str, size: tuple[int, int], kicker: str = "") -> tuple[int, int, int, int]:
    return title_layer(title, subtitle, size, kicker).getchannel("A").getbbox()


def _titled(base: Image.Image, title: str, subtitle: str, kicker: str = "") -> None:
    layer = title_layer(title, subtitle, base.size, kicker)
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    shadow.putalpha(layer.getchannel("A").point(lambda v: round(v * 0.8)))
    base.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(6 * base.width / 640)))
    base.alpha_composite(layer)


def saga_frame(title: str, subtitle: str, background: str, posters: list[str], positions: list[float],
               size: tuple[int, int], half: float = FAN_HALF, kicker: str = "") -> Image.Image:
    base = _backdrop(background, size).copy()
    _fan(base, posters, positions, FAN_CX, FAN_TOP, POSTER_H, FAN_STEP, FAN_ANGLE, half)
    _titled(base, title, subtitle, kicker)
    return base.convert("RGB")


def _subtitle(theme: dict) -> str:
    if "subtitle" in theme:          # genres, envies : pas de compte de sagas
        return theme["subtitle"]
    n = len(theme["sagas"])
    return f"{n} SAGA{'S' if n > 1 else ''}"


def _background(theme: dict) -> str:
    """Fond sans texte de la saga la plus vue qui en a un ; à défaut, son affiche (floutée, ça passe)."""
    return next((s["backdrop"] for s in theme["sagas"] if s.get("backdrop")), theme["sagas"][0]["poster"])


def saga_card(theme: dict, size: tuple[int, int] = CARD) -> Image.Image:
    """Tuile fixe : les 5 sagas les plus vues du thème en éventail."""
    posters = [s["poster"] for s in theme["sagas"][:2 * FAN_HALF + 1]]
    k = len(posters)
    return saga_frame(theme["title"], _subtitle(theme), _background(theme), posters,
                      [i - (k - 1) / 2 for i in range(k)], size, (k - 1) / 2, theme.get("kicker", ""))


def defile_frame(theme: dict, steps: int, offset: float, size: tuple[int, int]) -> Image.Image:
    """Image du défilé après « offset » glissements (offset = steps : retour au départ)."""
    loop = [s["poster"] for s in theme["sagas"][:steps]]
    half = (min(2 * FAN_HALF + 1, len(loop)) - 1) / 2      # moins de 5 sagas : éventail plus étroit, comme la tuile
    posters = [loop[i % len(loop)] for i in range(len(loop) + 2 * FAN_HALF + 2)]
    positions = [i - offset - half for i in range(len(posters))]
    return saga_frame(theme["title"], _subtitle(theme), _background(theme), posters, positions, size, half,
                      theme.get("kicker", ""))


def saga_frames(theme: dict, steps: int, size: tuple[int, int], fps: int = FPS) -> tuple[list[Image.Image], list[int]]:
    """Défilé des « steps » premières sagas : repos, glissement d'une place, et ainsi de suite."""
    frames, durations = [], []
    slide = round(SLIDE_FRAMES * fps / FPS)
    for step in range(steps):
        frames.append(defile_frame(theme, steps, step, size))
        durations.append(REST_MS)
        for f in range(1, slide + 1):
            frames.append(defile_frame(theme, steps, step + smooth(f / (slide + 1)), size))
            durations.append(1000 // fps)
    return frames, durations


# ---------- plateformes : logo à gauche sur la couleur de la marque, 3 titres du moment en éventail ----------
LOGO_X, LOGO_W, LOGO_H = 0.0625, 0.328, 0.25      # emplacement du logo (W, W, H)
LOGO_H_SQUARE = 0.42                               # hauteur permise à un logo presque carré (H)
P_CX, P_TOP, P_POSTER_H = 0.734, 0.144, 0.597     # éventail (W, H, H)
P_STEP, P_ANGLE = 0.106, 8
ARRIVAL_FRAMES, ARRIVAL_HOLD_MS = 68, 2500   # 1,36 s à 50 i/s, puis la tuile (jouée une seule fois)


def text_logo(name: str) -> Image.Image:
    """Nom en blanc (Bebas Neue), pour une marque sans logo propre : sur TMDB, ceux des chaînes et plateformes
    françaises sont des icônes d'appli carrées (celui de france.tv porte « prime video channels »)."""
    font = ImageFont.truetype(str(ma.FONT), 200)
    text = name.upper()
    w = int(ImageDraw.Draw(Image.new("L", (1, 1))).textlength(text, font=font)) + 20
    img = Image.new("RGBA", (w, 230), (255, 255, 255, 0))
    ImageDraw.Draw(img).text((10, 210), text, font=font, fill=(255, 255, 255, 255), anchor="ls")
    return img


def white_logo(logo: Image.Image) -> Image.Image:
    """Logo en blanc pur ; un logo dans un cadre plein (Canal+) reste tel quel."""
    alpha = logo.getchannel("A")
    opaque = alpha.point(lambda v: 255 if v > 200 else 0).histogram()[255]
    if opaque > 0.9 * logo.width * logo.height:
        return logo
    out = Image.new("RGBA", logo.size, (255, 255, 255, 255))
    out.putalpha(alpha)
    return out


@lru_cache(maxsize=None)
def _brand_bg(dark: tuple, brand: tuple, size: tuple[int, int]) -> Image.Image:
    """Dégradé en diagonale : sombre en haut à gauche, couleur de la marque en bas à droite."""
    sw, sh = 160, 90
    small = Image.new("RGB", (sw, sh))
    px = small.load()
    for y in range(sh):
        for x in range(sw):
            t = min(1.0, (0.6 * x / sw + 0.4 * y / sh)) ** 1.6
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(dark, brand))
    return small.resize(size, Image.BICUBIC).convert("RGBA")


def platform_frame(logo: Image.Image, dark: tuple, brand: tuple, posters: list[str], logo_dx: float,
                   logo_alpha: float, lifts: list[float], size: tuple[int, int]) -> Image.Image:
    W, H = size
    base = _brand_bg(tuple(dark), tuple(brand), size).copy()
    ph = round(P_POSTER_H * H)
    for i, (path, lift) in enumerate(zip(posters, lifts)):
        o = i - (len(posters) - 1) / 2
        card = _poster(path, ph, round(8 * W / 640)).rotate(-o * P_ANGLE, expand=True, resample=Image.BICUBIC)
        _put(base, card, P_CX * W + o * P_STEP * W - card.width / 2, P_TOP * H + abs(o) * FAN_DROP * H + lift)
    lg = logo.copy()
    tall = LOGO_H if logo.width >= 1.6 * logo.height else LOGO_H_SQUARE   # écusson presque carré : plus haut
    lg.thumbnail((round(LOGO_W * W), round(tall * H)), Image.LANCZOS)
    base.alpha_composite(_fade(lg, logo_alpha), (round(LOGO_X * W + logo_dx), round((H - lg.height) / 2)))
    return base.convert("RGB")


def platform_card(logo: Image.Image, dark: tuple, brand: tuple, posters: list[str],
                  size: tuple[int, int] = CARD) -> Image.Image:
    return platform_frame(logo, dark, brand, posters, 0, 1.0, [0] * len(posters), size)


def platform_frames(logo: Image.Image, dark: tuple, brand: tuple, posters: list[str],
                    size: tuple[int, int], fps: int = FPS) -> tuple[list[Image.Image], list[int]]:
    """Arrivée : le logo glisse depuis la gauche en apparaissant, puis les cartes tombent une à une."""
    W, H = size
    frames = []
    k = 25 / fps   # les temps ci-dessous sont comptés en images à 25 i/s
    count = round(ARRIVAL_FRAMES * fps / FPS)
    for f in range(count):
        a = smooth(f * k / 12)
        lifts = []
        for i in range(len(posters)):
            u = max(0.0, min(1.0, (f * k - 6 - 5 * i) / 12))
            bounce = math.sin(math.pi * u) * 10 / 360 * H if u > 0.6 else 0.0
            lifts.append(-(1 - smooth(u)) * 0.89 * H - bounce)
        frames.append(platform_frame(logo, dark, brand, posters, -0.094 * W * (1 - a), a, lifts, size))
    return frames, [1000 // fps] * (count - 1) + [ARRIVAL_HOLD_MS]


# ---------- fonds (heroBackdropUrl / heroVideoUrl) : mur d'affiches incliné qui glisse ----------
WALL_ANGLE, WALL_GAP, WALL_DRIFT = 12, 0.013, 0.296   # inclinaison (degrés), écart (H), glissement total (H)
WALL_POSTER_H = 0.29                                 # hauteur d'affiche de départ (H), agrandie s'il en manque
WALL_MAX_H = 0.9                                     # sans dépasser cette hauteur (H)
HERO_FOCUS = (0.70, 0.35)                            # zone que Nuvio montre le mieux : les premiers titres y vont
HERO_SECONDS = 8


def theme_wall_posters(theme: dict) -> list[str]:
    """Affiches du mur d'un thème de sagas : un film de chaque saga à tour de rôle, les sagas les plus vues
    d'abord (elles tombent au milieu du fond), sans doublon."""
    out, seen = [], set()
    films = [s.get("films") or [] for s in theme["sagas"]]
    for rank in range(max((len(f) for f in films), default=0)):
        for f in films:
            if rank < len(f) and f[rank] not in seen:
                seen.add(f[rank])
                out.append(f[rank])
    return out


def wall_layout(n: int, size: tuple[int, int], angle: float = WALL_ANGLE) -> dict:
    """Cases du mur visibles pendant l'animation, chacune avec une affiche différente (index < n).
    Trop peu d'affiches : elles grandissent jusqu'à ce que chaque case visible ait la sienne.
    → {"poster_h", "box": taille de l'affiche inclinée, "cells": [{"index", "start", "end"}]}"""
    if n <= 0:
        raise ValueError("mur sans affiche")
    W, H = size
    drift = WALL_DRIFT * H
    a = math.radians(angle)
    ph = WALL_POSTER_H * H
    while True:
        pw, gap = ph * 2 / 3, WALL_GAP * H
        bw = pw * math.cos(a) + ph * math.sin(a)
        bh = pw * math.sin(a) + ph * math.cos(a)
        su, sv = pw + gap, ph + gap
        reach = int((math.hypot(W, H) + drift) / min(su, sv)) + 3
        cells = []
        for v in range(-reach, reach + 1):
            for u in range(-reach, reach + 1):
                x = u * su + (su / 2 if v % 2 else 0)
                y = v * sv
                cx = W / 2 + x * math.cos(a) + y * math.sin(a)        # rotation comme Image.rotate(angle)
                cy = H / 2 - x * math.sin(a) + y * math.cos(a)
                end = (cx - bw / 2, cy - bh / 2)
                start = (end[0] - drift / 2, end[1] - drift / 2)
                left, top = min(start[0], end[0]), min(start[1], end[1])
                if left + drift / 2 + bw > 0 and top + drift / 2 + bh > 0 and left < W and top < H:
                    cells.append({"start": start, "end": end, "_d": math.hypot(cx - HERO_FOCUS[0] * W, cy - HERO_FOCUS[1] * H)})
        if len(cells) <= n or ph * 1.12 > WALL_MAX_H * H:
            break
        ph *= 1.12
    cells.sort(key=lambda c: c.pop("_d"))
    for i, c in enumerate(cells):
        c["index"] = i % n          # plafond atteint (très peu d'affiches) : elles reviennent, loin l'une de l'autre
    return {"poster_h": round(ph), "box": (round(bw) + 1, round(bh) + 1), "cells": cells}


@lru_cache(maxsize=None)
def _tilted(path: str, h: int, radius: int, angle: float) -> Image.Image:
    return _poster(path, h, radius).rotate(angle, expand=True, resample=Image.BICUBIC)


@lru_cache(maxsize=None)
def _hero_veil(tint: tuple, size: tuple[int, int]) -> Image.Image:
    """Voile de couleur plus fort à gauche (là où Nuvio pose le logo) qu'à droite."""
    W, H = size
    mask = Image.linear_gradient("L").rotate(-90, expand=True).resize(size)    # 255 à gauche → 0 à droite
    veil = Image.new("RGBA", size, tuple(tint) + (255,))
    veil.putalpha(mask.point(lambda v: round(70 + 130 * v / 255)))
    return veil


@lru_cache(maxsize=4)
def _wall_canvas(posters: tuple, size: tuple[int, int]) -> tuple[Image.Image, int]:
    """Le mur entier dessiné une seule fois, avec une marge pour le glissement : chaque image n'en est qu'un
    déplacement (au sous-pixel), au lieu de reposer 50 affiches arrondies au pixel."""
    layout = wall_layout(len(posters), size)
    margin = math.ceil(WALL_DRIFT * size[1] / 2) + 2
    canvas = Image.new("RGBA", (size[0] + 2 * margin, size[1] + 2 * margin), (13, 13, 13, 255))
    for c in layout["cells"]:
        img = _tilted(posters[c["index"]], round(layout["poster_h"]), round(10 * size[0] / 1920), WALL_ANGLE)
        _composite_anywhere(canvas, img, (round(c["end"][0]) + margin, round(c["end"][1]) + margin))
    return canvas.convert("RGB"), margin


@lru_cache(maxsize=4)
def _veil_parts(tint: tuple, size: tuple[int, int]) -> tuple[Image.Image, Image.Image]:
    """Le voile en deux morceaux prêts à l'emploi (couleur, masque) : 480 images à composer, chaque ms compte."""
    veil = _hero_veil(tint, size)
    return Image.new("RGB", size, tint), veil.getchannel("A")


def _hero_frame(posters: list[str], tint: tuple, excursion: float, size: tuple[int, int]) -> Image.Image:
    """Le mur décalé de « excursion » (0 = image fixe, 1 = le plus loin), voile de couleur par-dessus. Simple
    glissement : bilinéaire suffit (et va deux fois plus vite que bicubique, en RVB)."""
    canvas, margin = _wall_canvas(tuple(posters), size)
    e = excursion * WALL_DRIFT * size[1] / 2
    frame = canvas.transform(size, Image.AFFINE, (1, 0, margin - e, 0, 1, margin - e), resample=Image.BILINEAR)
    color, mask = _veil_parts(tuple(tint), size)
    return Image.composite(color, frame, mask)


def save_if_changed(img: Image.Image, out: Path, **options) -> bool:
    """Enregistre l'image seulement si ses octets changent (pas de commit pour rien) ; True si écrite."""
    import io
    buf = io.BytesIO()
    img.save(buf, format=Image.registered_extensions()[out.suffix.lower()], **options)
    data = buf.getvalue()
    if out.exists() and out.read_bytes() == data:
        return False
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    return True


def hero_still(posters: list[str], tint: tuple, size: tuple[int, int]) -> Image.Image:
    """Image fixe du fond : la première et la dernière image de la vidéo (Nuvio la montre avant et après)."""
    return _hero_frame(posters, tint, 0.0, size)


def hero_frames(posters: list[str], tint: tuple, size: tuple[int, int], seconds: float = HERO_SECONDS):
    """Images de la vidéo à 60 i/s (générateur : 480 images en 1080p ne tiennent pas en mémoire) : le mur part de
    l'image fixe, glisse et y revient, départ et arrivée adoucis : aucun saut quand Nuvio passe de l'une à l'autre."""
    n = round(HERO_FPS * seconds)
    for i in range(n):
        yield _hero_frame(posters, tint, (1 - math.cos(2 * math.pi * i / (n - 1))) / 2, size)


def encode_mp4(frames, size: tuple[int, int], out: Path, fps: int = HERO_FPS, x264: list[str] = HERO_X264) -> int:
    """Vidéo H.264 (par défaut, le fond lu par Nuvio TV : heroVideoUrl), muette, démarrage rapide (faststart)."""
    out.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.Popen([os.environ.get("FFMPEG", "ffmpeg"), "-y", "-loglevel", "error", "-f", "rawvideo",
                             "-pix_fmt", "rgb24", "-s", f"{size[0]}x{size[1]}", "-r", str(fps), "-i", "-",
                             *x264, "-movflags", "+faststart", "-an", str(out)], stdin=subprocess.PIPE)
    try:
        for f in frames:
            proc.stdin.write(f.convert("RGB").tobytes())
        proc.stdin.close()
    except BaseException:
        # Une image manque (affiche introuvable…) : ffmpeg ne doit pas rester ouvert ni laisser une vidéo coupée.
        proc.kill()
        proc.wait()
        out.unlink(missing_ok=True)
        raise
    if proc.wait():
        out.unlink(missing_ok=True)
        raise RuntimeError(f"ffmpeg a échoué pour {out.name}")
    return out.stat().st_size


# ---------- encodage ----------
def encode_gif(frames: list[Image.Image], durations: list[int], out: Path, once: bool = False) -> int:
    """GIF par gifski à 50 i/s : une image tenue plus longtemps est répétée (gifski fusionne les doublons).
    once : joué une seule fois, puis arrêté sur la dernière image (arrivée des plateformes et studios)."""
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        names = []
        for img, ms in zip(frames, durations):
            first = f"{len(names):05d}.png"
            img.convert("RGB").save(Path(tmp) / first, compress_level=1)
            names.append(first)
            for _ in range(max(1, round(ms / FRAME_MS)) - 1):
                copy = f"{len(names):05d}.png"
                try:
                    os.link(Path(tmp) / first, Path(tmp) / copy)
                except OSError:
                    (Path(tmp) / copy).write_bytes((Path(tmp) / first).read_bytes())
                names.append(copy)
        # Noms courts lancés depuis le dossier : la ligne de commande reste courte (limite de Windows).
        subprocess.run([os.environ.get("GIFSKI", "gifski"), "-q", *GIFSKI_OPTS, "--fps", str(FPS),
                        *(["--repeat", "-1"] if once else []), "-o", str(out.resolve()), *names], check=True, cwd=tmp)
    if once:
        _hold_last_frame(out)
    return out.stat().st_size


def _hold_last_frame(out: Path) -> None:
    """Dernière image tenue 655 s (le plus long qu'un GIF permette) : même une appli qui fait boucler tous les GIF
    reste sur la tuile. On réécrit le délai du dernier bloc « Graphic Control Extension » (21 F9 04)."""
    data = bytearray(out.read_bytes())
    i = data.rfind(b"\x21\xf9\x04")
    if i >= 0:
        data[i + 4:i + 6] = (65535).to_bytes(2, "little")
        out.write_bytes(bytes(data))


def encode_tile_video(frames: list[Image.Image], durations: list[int], out: Path) -> int:
    """Vidéo de la tuile (VIDEO_SIZE, VIDEO_FPS) : une image tenue plus longtemps est répétée."""
    held = (f for f, ms in zip(frames, durations) for _ in range(max(1, round(ms * VIDEO_FPS / 1000))))
    return encode_mp4(held, VIDEO_SIZE, out, VIDEO_FPS, TILE_X264)


def fit_gif(attempts, render, out: Path, once: bool = False, video: bool = True):
    """Premier essai (taille, réglage) dont le GIF tient sous GIF_MAX_BYTES ; render(taille, réglage[, i/s]) donne
    (images, durées). Renvoie (octets, taille, réglage) ; lève RuntimeError si rien ne tient. once : joué une fois.
    video : aussi la vidéo de la tuile à côté du GIF, toujours au meilleur réglage : la limite de poids est celle du GIF."""
    for size, setting in attempts:
        frames, durations = render(size, setting)
        n = encode_gif(frames, durations, out, once=once)
        del frames
        if n <= GIF_MAX_BYTES:
            if video:
                encode_tile_video(*render(VIDEO_SIZE, attempts[0][1], VIDEO_FPS), out.with_suffix(".mp4"))
            return n, size, setting
    out.unlink(missing_ok=True)
    raise RuntimeError(f"{out.name} : plus de {GIF_MAX_BYTES // (1024 * 1024)} Mo même en petit")


def saga_gif(theme: dict, out: Path) -> tuple[int, tuple[int, int], int]:
    """Défilé du thème : 8 sagas au plus, moins si trop lourd (4 au minimum), puis en 480x270."""
    top = min(8, len(theme["sagas"]))
    attempts = [(size, steps) for size in GIF_SIZES for steps in range(top, min(top, 4) - 1, -1)]
    return fit_gif(attempts, lambda size, steps, fps=FPS: saga_frames(theme, steps, size, fps), out)
