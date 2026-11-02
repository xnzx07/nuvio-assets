"""Dessin des tuiles (scripts/tuiles.py), sans réseau : python -m unittest discover -s tests/python

Les images TMDB sont remplacées par des aplats : affiches magenta, fonds verts, pour repérer où tombe chaque chose.
"""
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
sys.path.insert(0, str(SCRIPTS))

import make_assets as ma  # noqa: E402
import tuiles  # noqa: E402

MAGENTA = (255, 0, 255)


def fake_fetch(path, size="w1280"):
    if path.startswith("/p"):
        return Image.new("RGBA", (500, 750), MAGENTA + (255,))
    return Image.new("RGBA", (1280, 720), (0, 128, 0, 255))


def theme(n=8, title="Science-fiction et fantastique"):
    return {"slug": "sf", "title": title,
            "sagas": [{"id": i, "title": f"S{i}", "votes": 100 - i, "poster": f"/p{i}.jpg", "backdrop": "/bd.jpg"}
                      for i in range(n)]}


def poster_pixels_left_of(img, x_max):
    """Pixels nettement magenta (affiche, même à moitié effacée) à gauche de x_max."""
    px = img.convert("RGB").load()
    return [(x, y) for x in range(int(x_max)) for y in range(0, img.height, 2)
            if px[x, y][0] > 110 and px[x, y][2] > 110 and px[x, y][1] < 60]


class Base(unittest.TestCase):
    def setUp(self):
        p = mock.patch.object(ma, "fetch", side_effect=fake_fetch)
        p.start()
        self.addCleanup(p.stop)
        tuiles.clear_caches()


class Courbe(unittest.TestCase):
    def test_smooth(self):
        self.assertEqual(tuiles.smooth(0), 0)
        self.assertEqual(tuiles.smooth(1), 1)
        self.assertAlmostEqual(tuiles.smooth(0.5), 0.5)
        pts = [tuiles.smooth(i / 10) for i in range(11)]
        self.assertEqual(pts, sorted(pts))


class Sagas(Base):
    def test_titre_jamais_sur_l_eventail(self):
        for size in ((1280, 720), (720, 405)):
            for title in ("Science-fiction et fantastique", "Super-héros", "Animés"):
                box = tuiles.title_box(title, "34 SAGAS", size)
                self.assertLess(box[2], tuiles.FAN_LEFT * size[0], (title, size))

    def test_sur_titre_et_sous_titre_au_choix(self):
        """Envies : « J'AI ENVIE DE » au-dessus du nom ; genres : pas de sous-titre ; jamais sur l'éventail."""
        t = theme(6, "Rire")
        t.update(kicker="J'AI ENVIE DE", subtitle="")
        plain = tuiles.title_box("Rire", "", (1280, 720))
        box = tuiles.title_box("Rire", "", (1280, 720), kicker="J'AI ENVIE DE")
        self.assertLess(box[1], plain[1])                    # le sur-titre monte au-dessus du nom
        self.assertLess(box[2], tuiles.FAN_LEFT * 1280)
        self.assertEqual(tuiles.saga_card(t).size, (1280, 720))

    def test_eventail_a_droite(self):
        card = tuiles.saga_card(theme())
        self.assertEqual(poster_pixels_left_of(card, tuiles.FAN_LEFT * card.width), [])
        self.assertTrue(poster_pixels_left_of(card, card.width))  # les affiches sont bien là

    def test_carte_taille_et_mode(self):
        card = tuiles.saga_card(theme())
        self.assertEqual(card.size, (1280, 720))
        self.assertEqual(card.mode, "RGB")

    def test_defile_boucle_sans_saut(self):
        frames, d = tuiles.saga_frames(theme(), steps=8, size=(720, 405))
        self.assertEqual(tuiles.FPS, 50)                        # 50 images/s : le maximum d'un GIF (2 centièmes)
        self.assertEqual(len(frames), 8 * 25)
        self.assertEqual(d.count(1100), 8)
        self.assertEqual(d.count(20), 8 * 24)
        after = tuiles.defile_frame(theme(), 8, 8, (720, 405))
        self.assertEqual(after.tobytes(), frames[0].tobytes())

    def test_defile_ne_passe_jamais_sous_le_titre(self):
        frames, _d = tuiles.saga_frames(theme(), steps=3, size=(480, 270))
        for f in frames:
            self.assertEqual(poster_pixels_left_of(f, tuiles.FAN_LEFT * f.width), [])

    def test_theme_sans_fond(self):
        t = theme(4)
        for s in t["sagas"]:
            s["backdrop"] = None
        self.assertEqual(tuiles.saga_card(t).size, (1280, 720))

    def test_defile_peu_de_sagas_commence_comme_la_tuile(self):
        for n in (3, 4):
            frames, _d = tuiles.saga_frames(theme(n), steps=n, size=(480, 270))
            self.assertEqual(frames[0].tobytes(), tuiles.saga_card(theme(n), (480, 270)).tobytes(), n)

    def test_defile_avec_peu_de_sagas(self):
        frames, _d = tuiles.saga_frames(theme(3), steps=3, size=(480, 270))
        self.assertEqual(len(frames), 3 * 25)
        self.assertEqual(tuiles.saga_card(theme(3)).size, (1280, 720))


WHITE = (255, 255, 255)
POSTERS = ["/p1.jpg", "/p2.jpg", "/p3.jpg"]


def logo_rouge():
    img = Image.new("RGBA", (900, 240), (0, 0, 0, 0))
    img.paste((229, 9, 20, 255), (0, 40, 900, 200))
    return img


def pixels(img, keep):
    px = img.convert("RGB").load()
    return [(x, y) for x in range(0, img.width, 2) for y in range(0, img.height, 2) if keep(px[x, y])]


class Plateformes(Base):
    def test_logo_blanc_sauf_cadre_plein(self):
        white = tuiles.white_logo(logo_rouge())
        self.assertEqual(white.getpixel((450, 120)), (255, 255, 255, 255))
        self.assertEqual(white.getpixel((450, 10))[3], 0)
        boxed = Image.new("RGBA", (300, 100), (0, 0, 0, 255))
        self.assertEqual(tuiles.white_logo(boxed).getpixel((5, 5)), (0, 0, 0, 255))

    def test_logo_a_gauche_affiches_a_droite(self):
        card = tuiles.platform_card(tuiles.white_logo(logo_rouge()), (20, 0, 0), (60, 0, 0), POSTERS)
        W = card.width
        logo = pixels(card, lambda c: c == WHITE)
        self.assertTrue(logo)
        self.assertLess(max(x for x, _ in logo), 0.40 * W)
        mag = pixels(card, lambda c: c[0] > 110 and c[2] > 110 and c[1] < 60)
        self.assertTrue(mag)
        self.assertGreaterEqual(min(x for x, _ in mag), 0.45 * W)

    def test_logo_carre_plus_haut(self):
        """Écusson (Warner, DC) : presque carré, il a droit à plus de hauteur qu'un logo en longueur."""
        shield = Image.new("RGBA", (300, 320), (255, 255, 255, 255))
        card = tuiles.platform_card(shield, (20, 0, 0), (60, 0, 0), POSTERS, (640, 360))
        ys = [y for _x, y in pixels(card, lambda c: c == WHITE)]
        self.assertGreater(max(ys) - min(ys), 0.33 * 360)

    def test_arrivee_finit_sur_la_tuile_fixe(self):
        logo = tuiles.white_logo(logo_rouge())
        frames, _d = tuiles.platform_frames(logo, (20, 0, 0), (60, 0, 0), POSTERS, (480, 270))
        card = tuiles.platform_card(logo, (20, 0, 0), (60, 0, 0), POSTERS, (480, 270))
        diff = max(abs(a - b) for a, b in zip(frames[-1].tobytes(), card.tobytes()))
        self.assertLessEqual(diff, 2)

    def test_arrivee_durees(self):
        _f, d = tuiles.platform_frames(tuiles.white_logo(logo_rouge()), (20, 0, 0), (60, 0, 0), POSTERS, (240, 135))
        self.assertEqual(len(d), 68)
        self.assertEqual(d[-1], 2500)
        self.assertTrue(all(x == 20 for x in d[:-1]))


class Donnees(unittest.TestCase):
    def test_platform_tiles_complet(self):
        import json
        import re
        root = SCRIPTS.parent
        tiles = json.loads((root / "assets.json").read_text(encoding="utf-8"))["platform_tiles"]
        cols = json.loads((root / "collections" / "collections.json").read_text(encoding="utf-8"))
        folders = next(c for c in cols if c["id"] == "plateformes-streaming")["folders"]
        self.assertEqual([t[0] for t in tiles], [f["id"] for f in folders])
        providers = dict((f, i) for i, f in re.findall(r'id: "(\d+)", .*folder: "([^"]+)"',
                                                       (root / "worker" / "config.js").read_text(encoding="utf-8")))
        self.assertEqual({t[0]: t[1] for t in tiles}, {t[0]: providers[t[0]] for t in tiles})
        for t in tiles:
            self.assertEqual(len(t), 5)                       # slug, fournisseur, sombre, marque, chaînes
            self.assertTrue(all(len(c) == 3 for c in t[2:4]))
            self.assertRegex(t[4], r"^(\d+(\|\d+)*)?$")


class Poids(unittest.TestCase):
    """Un GIF de plus de 7 Mo n'arrive pas à temps sur la TV : moins de sagas dans le défilé, puis plus petit."""

    def setUp(self):
        frames = mock.patch.object(tuiles, "saga_frames", side_effect=lambda theme, steps, size, fps=tuiles.FPS: ([steps], [size]))
        frames.start()
        self.addCleanup(frames.stop)
        video = mock.patch.object(tuiles, "encode_tile_video", return_value=1)
        self.video = video.start()
        self.addCleanup(video.stop)

    def test_saga_gif_reste_sous_7_mo(self):
        def encode(frames, durations, out, once=False):
            return 9_000_000 if durations[0] == tuiles.GIF_SIZES[0] and frames[0] >= 6 else 5_000_000
        with mock.patch.object(tuiles, "encode_gif", side_effect=encode):
            self.assertEqual(tuiles.saga_gif(theme(), Path("x.gif")), (5_000_000, tuiles.GIF_SIZES[0], 5))

    def test_saga_gif_passe_en_petit(self):
        def encode(frames, durations, out, once=False):
            return 5_000_000 if durations[0] == tuiles.GIF_SIZES[1] else 9_000_000
        with mock.patch.object(tuiles, "encode_gif", side_effect=encode):
            self.assertEqual(tuiles.saga_gif(theme(), Path("x.gif")), (5_000_000, tuiles.GIF_SIZES[1], 8))

    def test_la_video_est_au_meilleur_reglage_a_cote_du_gif(self):
        """La limite de poids est celle du GIF : un GIF réduit à 5 sagas n'en retire pas à la vidéo."""
        def encode(frames, durations, out, once=False):
            return 9_000_000 if durations[0] == tuiles.GIF_SIZES[0] and frames[0] >= 6 else 5_000_000
        with mock.patch.object(tuiles, "encode_gif", side_effect=encode):
            tuiles.saga_gif(theme(), Path("x.gif"))
        frames, durations, out = self.video.call_args.args
        self.assertEqual((frames, durations, out), ([8], [tuiles.VIDEO_SIZE], Path("x.mp4")))

    def test_pas_de_video_sur_demande(self):
        with mock.patch.object(tuiles, "encode_gif", return_value=1):
            tuiles.fit_gif([((64, 36), None)], lambda s, _, fps=tuiles.FPS: ([], []), Path("x.gif"), video=False)
        self.video.assert_not_called()

    def test_saga_gif_trop_lourd_partout(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "x.gif"
            def encode(frames, durations, o, once=False):
                o.write_bytes(b"x")
                return 9_000_000
            with mock.patch.object(tuiles, "encode_gif", side_effect=encode):
                with self.assertRaises(RuntimeError):
                    tuiles.saga_gif(theme(), out)
            self.assertFalse(out.exists())


class Fonds(Base):
    """Fond animé : mur d'affiches incliné qui glisse puis s'arrête sur l'image fixe, sans affiche en double."""

    def visible(self, cell, box, size):
        W, H = size
        (x0, y0), (x1, y1) = cell["start"], cell["end"]
        left, top = min(x0, x1), min(y0, y1)
        right, bottom = max(x0, x1) + box[0], max(y0, y1) + box[1]
        return right > 0 and bottom > 0 and left < W and top < H

    def test_mur_sans_doublon_visible(self):
        for n in (25, 40, 130):
            lay = tuiles.wall_layout(n, (1920, 1080))
            seen = [c["index"] for c in lay["cells"] if self.visible(c, lay["box"], (1920, 1080))]
            self.assertTrue(seen)
            self.assertEqual(len(seen), len(set(seen)), n)
            self.assertTrue(all(0 <= i < n for i in seen))

    def test_affiches_du_mur_d_un_theme(self):
        """Un film de chaque saga à tour de rôle (les plus vues d'abord), sans doublon."""
        t = {"sagas": [{"films": ["/a1", "/a2", "/a3"]}, {"films": ["/b1"]}, {"films": ["/c1", "/c2", "/a1"]}]}
        self.assertEqual(tuiles.theme_wall_posters(t), ["/a1", "/b1", "/c1", "/a2", "/c2", "/a3"])

    def test_mur_vide_refuse(self):
        with self.assertRaises(ValueError):
            tuiles.wall_layout(0, (1920, 1080))

    def test_mur_minuscule_borne(self):
        """Deux affiches : elles ne grandissent pas à l'infini (plafond), quitte à revenir."""
        lay = tuiles.wall_layout(2, (1920, 1080))
        self.assertLessEqual(lay["poster_h"], 0.9 * 1080)
        self.assertTrue(all(0 <= c["index"] < 2 for c in lay["cells"]))

    def test_ecrit_seulement_si_change(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "x.jpg"
            img = Image.new("RGB", (40, 30), (10, 20, 30))
            self.assertTrue(tuiles.save_if_changed(img, out, quality=88))
            stamp = out.stat().st_mtime_ns
            self.assertFalse(tuiles.save_if_changed(img, out, quality=88))
            self.assertEqual(out.stat().st_mtime_ns, stamp)
            self.assertTrue(tuiles.save_if_changed(Image.new("RGB", (40, 30), (99, 0, 0)), out, quality=88))

    def test_peu_d_affiches_plus_grandes(self):
        self.assertGreater(tuiles.wall_layout(12, (1920, 1080))["poster_h"],
                           tuiles.wall_layout(130, (1920, 1080))["poster_h"])

    def test_fond_part_et_revient_sur_l_image_fixe(self):
        """Nuvio montre l'image fixe, puis la vidéo : elle part de cette image et y revient (aucun saut), à 60 i/s."""
        posters = [f"/p{i}.jpg" for i in range(30)]
        frames = list(tuiles.hero_frames(posters, (20, 0, 0), (320, 180), seconds=1))
        self.assertEqual(len(frames), 60)
        still = tuiles.hero_still(posters, (20, 0, 0), (320, 180)).tobytes()
        self.assertEqual(frames[0].tobytes(), still)
        self.assertEqual(frames[-1].tobytes(), still)
        self.assertNotEqual(frames[30].tobytes(), still)

    def test_carte_au_sous_pixel(self):
        """Une carte posée à x = 10,5 tombe entre x = 10 et x = 11 (pas d'à-coups d'un pixel entier)."""
        card = Image.new("RGBA", (20, 20), (255, 255, 255, 255))
        def at(x):
            base = Image.new("RGBA", (60, 40), (0, 0, 0, 255))
            tuiles._put(base, card, x, 10)
            return base.getpixel((10, 15))[0]
        self.assertGreater(at(10), at(10.5))
        self.assertGreater(at(10.5), at(11))


@unittest.skipUnless(shutil.which(os.environ.get("FFMPEG", "ffmpeg")), "ffmpeg introuvable")
class Video(unittest.TestCase):
    def test_encode_mp4(self):
        frames = (Image.new("RGB", (64, 36), (i * 20, 0, 0)) for i in range(10))
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "x.mp4"
            n = tuiles.encode_mp4(frames, (64, 36), out)
            self.assertEqual(out.read_bytes()[4:8], b"ftyp")
            self.assertEqual(n, out.stat().st_size)

    def test_encode_mp4_arrete_ffmpeg_si_erreur(self):
        def frames():
            yield Image.new("RGB", (64, 36))
            raise ValueError("affiche introuvable")
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "x.mp4"
            with self.assertRaises(ValueError):
                tuiles.encode_mp4(frames(), (64, 36), out)
            self.assertFalse(out.exists())

    def test_video_de_la_tuile_duree_et_couleurs(self):
        """Une image tenue 1 s dure 1 s à 60 i/s, et les couleurs sont annoncées : pas de saut de teinte avec l'image fixe."""
        frames = [Image.new("RGB", tuiles.VIDEO_SIZE, c) for c in ((10, 10, 10), (200, 0, 0))]
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "x.mp4"
            tuiles.encode_tile_video(frames, [1000, 1000 // 60], out)
            probe = shutil.which("ffprobe", path=str(Path(shutil.which(os.environ.get("FFMPEG", "ffmpeg"))).parent))
            info = subprocess.run([probe, "-v", "error", "-select_streams", "v", "-count_frames", "-show_entries",
                                   "stream=nb_read_frames,width,height,color_space,profile,level", "-of", "default=nw=1", str(out)],
                                  capture_output=True, text=True, check=True).stdout
        for line in ("width=1280", "height=720", "color_space=bt709", "profile=High", "level=41", "nb_read_frames=61"):
            self.assertIn(line, info)

    def test_les_images_suivent_la_cadence(self):
        """À 60 i/s, le mouvement dure le même temps qu'à 50 : plus d'images, pas plus de secondes."""
        with mock.patch.object(tuiles, "defile_frame", return_value="image"):
            frames, durations = tuiles.saga_frames(theme(), 2, (64, 36), 60)
        self.assertEqual(len(frames), 2 * (1 + 29))
        with mock.patch.object(tuiles, "platform_frame", return_value="image"):
            frames, durations = tuiles.platform_frames(None, (0, 0, 0), (0, 0, 0), ["a"], (64, 36), 60)
        self.assertEqual(len(frames), 82)
        self.assertEqual(durations[-1], tuiles.ARRIVAL_HOLD_MS)


@unittest.skipUnless(shutil.which(os.environ.get("GIFSKI", "gifski")), "gifski introuvable")
class Encodage(unittest.TestCase):
    def test_encode_gif(self):
        frames = [Image.new("RGB", (72, 40), c) for c in ((10, 10, 10), (200, 0, 0), (0, 0, 200))]
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "x.gif"
            n = tuiles.encode_gif(frames, [40, 40, 1100], out)
            with Image.open(out) as im:
                self.assertEqual(im.format, "GIF")
            self.assertEqual(n, out.stat().st_size)

    def test_une_seule_fois(self):
        """Arrivée des plateformes et studios : jouée une fois, puis arrêtée sur la tuile (dernière image tenue)."""
        frames = [Image.new("RGB", (72, 40), c) for c in ((10, 10, 10), (200, 0, 0), (0, 0, 200))]
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "x.gif"
            tuiles.encode_gif(frames, [20, 20, 2500], out, once=True)
            with Image.open(out) as im:
                im.seek(im.n_frames - 1)
                self.assertGreaterEqual(im.info["duration"], 600_000)
                self.assertNotEqual(im.info.get("loop"), 0)


if __name__ == "__main__":
    unittest.main()
