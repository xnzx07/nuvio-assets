"""Tests des scripts de génération (scripts/*.py), sans réseau : python -m unittest discover -s tests/python

Pillow est nécessaire (scripts/make_assets.py, importé par update_addon.py) : pip install pillow.
"""
import datetime as dt
import gzip
import io
import json
import shutil
import struct
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
sys.path.insert(0, str(SCRIPTS))

import build_imdb_ratings as ratings  # noqa: E402
import build_search_words as words  # noqa: E402
import update_addon as ua  # noqa: E402


def http_error(code: int) -> urllib.error.HTTPError:
    return urllib.error.HTTPError("https://api.themoviedb.org", code, "x", {}, io.BytesIO(b""))


class Reponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class TMDB(unittest.TestCase):
    def setUp(self):
        sleep = mock.patch.object(ua.time, "sleep")
        sleep.start()
        self.addCleanup(sleep.stop)

    def test_panne_leve_une_erreur_au_lieu_d_une_liste_vide(self):
        with mock.patch.object(ua.urllib.request, "urlopen", side_effect=urllib.error.URLError("hors ligne")) as op:
            with self.assertRaises(ua.TMDBError):
                ua.tmdb("/discover/movie")
        self.assertEqual(op.call_count, 5)

    def test_cle_refusee_arrete_tout_de_suite(self):
        with mock.patch.object(ua.urllib.request, "urlopen", side_effect=http_error(401)) as op:
            with self.assertRaises(ua.TMDBAuthError):
                ua.tmdb("/discover/movie")
        self.assertEqual(op.call_count, 1)

    def test_erreur_serveur_puis_reponse(self):
        effects = [http_error(503), Reponse(b'{"results": [1]}')]
        with mock.patch.object(ua.urllib.request, "urlopen", side_effect=effects):
            self.assertEqual(ua.tmdb("/x"), {"results": [1]})

    def test_titre_disparu_reste_vide(self):
        with mock.patch.object(ua.urllib.request, "urlopen", side_effect=http_error(404)):
            self.assertEqual(ua.tmdb("/movie/1"), {})


class CacheIMDb(unittest.TestCase):
    def setUp(self):
        patch = mock.patch.dict(ua.CACHE, {}, clear=True)
        patch.start()
        self.addCleanup(patch.stop)

    def test_echec_jamais_mis_en_cache(self):
        with mock.patch.object(ua, "tmdb", side_effect=ua.TMDBError("panne")):
            with self.assertRaises(ua.TMDBError):
                ua.imdb_id("movie", 1)
        self.assertNotIn("movie:1", ua.CACHE)

    def test_sans_imdb_garde_avec_la_date_puis_redemande(self):
        with mock.patch.object(ua, "tmdb", return_value={"imdb_id": None}) as t:
            self.assertIsNone(ua.imdb_id("movie", 2))
            self.assertEqual(ua.CACHE["movie:2"], f"?{ua.TODAY.isoformat()}")
            self.assertIsNone(ua.imdb_id("movie", 2))
            self.assertEqual(t.call_count, 1)   # moins de 7 jours : pas redemandé
        ua.CACHE["movie:2"] = f"?{(ua.TODAY - dt.timedelta(days=8)).isoformat()}"
        with mock.patch.object(ua, "tmdb", return_value={"imdb_id": "tt123"}):
            self.assertEqual(ua.imdb_id("movie", 2), "tt123")
        self.assertEqual(ua.CACHE["movie:2"], "tt123")

    def test_ancien_format_vide_redemande(self):
        ua.CACHE["series:3"] = ""
        with mock.patch.object(ua, "tmdb", return_value={"imdb_id": "tt9"}):
            self.assertEqual(ua.imdb_id("series", 3), "tt9")

    def test_identifiant_connu_sans_appel(self):
        ua.CACHE["movie:4"] = "tt4"
        with mock.patch.object(ua, "tmdb", side_effect=AssertionError("appel inutile")):
            self.assertEqual(ua.imdb_id("movie", 4), "tt4")


class Construction(unittest.TestCase):
    def test_selection_du_jour_sans_aucune_page(self):
        with mock.patch.object(ua, "tmdb", return_value={"total_pages": 0, "results": []}):
            self.assertEqual(ua.build({"type": "movie", "discover": {}, "rotateDaily": True}), [])


def page(path: Path, metas) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"metas": metas}), encoding="utf-8")


class Publication(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(self.tmp, ignore_errors=True))
        self.catalog = self.tmp / "catalog"
        page(self.catalog / "movie/une.json", ["vieux"])
        page(self.catalog / "movie/une/skip=20.json", ["vieux2"])
        page(self.catalog / "movie/annees/genre=2024.json", ["2024"])
        page(self.catalog / "movie/annees/genre=2024&skip=20.json", ["2024b"])
        page(self.catalog / "movie/annees/genre=2023.json", ["2023"])
        page(self.catalog / "movie/disparue.json", ["x"])

    def read(self, rel):
        return json.loads((self.catalog / rel).read_text(encoding="utf-8"))["metas"]

    def test_liste_en_echec_garde_ses_pages_de_la_veille(self):
        kept = ua.publish_catalog({"movie/annees/genre=2023.json": ["neuf"], "movie/annees.json": []},
                                  [("movie", "une", None), ("movie", "annees", "2024")], self.catalog)
        self.assertEqual(kept, 4)
        self.assertEqual(self.read("movie/une.json"), ["vieux"])
        self.assertEqual(self.read("movie/une/skip=20.json"), ["vieux2"])
        self.assertEqual(self.read("movie/annees/genre=2024&skip=20.json"), ["2024b"])
        self.assertEqual(self.read("movie/annees/genre=2023.json"), ["neuf"])
        self.assertFalse((self.catalog / "movie/disparue.json").exists())
        self.assertFalse((self.tmp / "catalog.new").exists())
        self.assertFalse((self.tmp / "catalog.old").exists())


class Nuit(unittest.TestCase):
    """main() avec TMDB simulé, dans un dossier temporaire."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(self.tmp, ignore_errors=True))
        addon = self.tmp / "addon"
        page(addon / "catalog/movie/accueil-top10.json", ["veille"])
        for p in (mock.patch.object(ua, "ADDON", addon), mock.patch.object(ua, "CACHE_FILE", self.tmp / "cache.json"),
                  mock.patch.object(ua, "KEY", "cle"), mock.patch.object(ua, "season_images", return_value="Saison"),
                  mock.patch.object(sys, "argv", ["update_addon.py", "halloween"]),
                  mock.patch.object(sys, "stdout", io.StringIO())):
            p.start()
            self.addCleanup(p.stop)
        self.addon = addon

    def test_panne_generale_rien_n_est_modifie(self):
        with mock.patch.object(ua, "build", side_effect=ua.TMDBError("panne")):
            with self.assertRaises(SystemExit) as e:
                ua.main()
        self.assertIn("Rien n'est modifié", str(e.exception.code))
        self.assertFalse((self.addon / "manifest.json").exists())
        self.assertTrue((self.addon / "catalog/movie/accueil-top10.json").exists())

    def test_cle_refusee_rien_n_est_modifie(self):
        with mock.patch.object(ua, "build", side_effect=ua.TMDBAuthError("401")):
            with self.assertRaises(SystemExit) as e:
                ua.main()
        self.assertNotEqual(e.exception.code, 0)
        self.assertFalse((self.addon / "manifest.json").exists())

    def test_quelques_echecs_ecrit_le_reste_et_sort_en_3(self):
        meta = {"_tmdb": 1, "id": "tt1", "type": "movie", "name": "Film"}

        def build(defn):
            if defn.get("id") == "accueil-top10":
                raise ua.TMDBError("panne")
            return [dict(meta)]

        with mock.patch.object(ua, "build", side_effect=build):
            with self.assertRaises(SystemExit) as e:
                ua.main()
        self.assertEqual(e.exception.code, ua.PARTIAL_EXIT)
        tendances = json.loads((self.addon / "catalog/movie/accueil-top10.json").read_text(encoding="utf-8"))
        self.assertEqual(tendances["metas"], ["veille"])
        state = json.loads((self.addon / "state.json").read_text(encoding="utf-8"))
        self.assertEqual(len(state["failed"]), 1)
        self.assertTrue((self.addon / "manifest.json").exists())


class ImagesDeSaison(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(self.tmp, ignore_errors=True))
        sleep = mock.patch.object(ua.m.time, "sleep")
        sleep.start()
        self.addCleanup(sleep.stop)

    def test_image_injoignable_garde_celle_de_la_veille(self):
        card = self.tmp / "seasons" / "current.jpg"
        card.parent.mkdir()
        card.write_bytes(b"veille")
        with mock.patch.object(ua, "ROOT", self.tmp), mock.patch.object(sys, "stdout", io.StringIO()), \
             mock.patch.object(ua, "tmdb", return_value={}), \
             mock.patch.object(ua.m, "fetch", side_effect=urllib.error.URLError("hors ligne")):
            self.assertEqual(ua.season_images("a-laffiche"), "À l'affiche")
            self.assertEqual(ua.season_images("halloween"), "Spécial Halloween")
        self.assertEqual(card.read_bytes(), b"veille")

    def test_telechargement_reessaye(self):
        png = io.BytesIO()
        ua.m.Image.new("RGB", (2, 2)).save(png, "PNG")
        effects = [urllib.error.URLError("raté"), http_error(502), Reponse(png.getvalue())]
        with mock.patch.object(ua.m.urllib.request, "urlopen", side_effect=effects):
            self.assertEqual(ua.m.fetch.__wrapped__("/image.jpg").size, (2, 2))


class GardeFous(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(self.tmp, ignore_errors=True))

    def test_vocabulaire_80_pour_cent_du_precedent(self):
        out = self.tmp / "search-words.json"
        out.write_text(json.dumps({f"m{i}": 1 for i in range(15000)}), encoding="utf-8")
        with mock.patch.object(words, "OUT", out):
            self.assertEqual(words.minimum_words(True), 12000)
            self.assertEqual(words.minimum_words(False), 1000)
            with mock.patch.object(words, "KEY", "cle"), \
                 mock.patch.object(words, "from_tmdb", return_value={f"m{i}": 1.0 for i in range(5000)}):
                with self.assertRaises(SystemExit):
                    words.main()
        self.assertEqual(len(json.loads(out.read_text(encoding="utf-8"))), 15000)

    def test_notes_imdb_minimum(self):
        out = self.tmp / "imdb-ratings.bin"
        out.write_bytes(struct.pack("<I", 340_000))
        with mock.patch.object(ratings, "OUT", out):
            with self.assertRaises(SystemExit):
                ratings.check(250_000)          # moins de 80 % du précédent
            ratings.check(300_000)
            out.unlink()
            with self.assertRaises(SystemExit):
                ratings.check(150_000)          # moins de 200 000
            ratings.check(210_000)

    def test_notes_imdb_sans_minimum_de_votes(self):
        # The Perfect Lie (7 votes, le 1er novembre 2026) : une note, même sur peu de votes. Les épisodes restent écartés.
        with gzip.open(self.tmp / "title.ratings.tsv.gz", "wt", encoding="utf-8") as f:
            f.write("tconst\taverageRating\tnumVotes\ntt0000007\t7.5\t7\ntt0000009\t8.0\t900\n")
        with gzip.open(self.tmp / "title.episode.tsv.gz", "wt", encoding="utf-8") as f:
            f.write("tconst\tparentTconst\tseasonNumber\tepisodeNumber\ntt0000009\ttt0000001\t1\t1\n")
        out = self.tmp / "imdb-ratings.bin"
        with mock.patch.object(ratings, "OUT", out), mock.patch.object(ratings, "ROOT", self.tmp), mock.patch.object(ratings, "check"):
            ratings.build(self.tmp)
        self.assertEqual(out.read_bytes(), struct.pack("<I", 1) + bytes([7, 75]))


if __name__ == "__main__":
    unittest.main()
