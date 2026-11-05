"""Épisodes de remplissage (scripts/build_fillers.py), sans réseau : python -m unittest discover -s tests/python"""
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

import build_fillers as bf  # noqa: E402


class Plages(unittest.TestCase):
    def test_aller_retour(self):
        nums = bf.plages_en_liste("Filler Episodes: 26 , 97 , 136-140")
        self.assertEqual(nums, [26, 97, 136, 137, 138, 139, 140])
        self.assertEqual(bf.liste_en_plages(nums), "26,97,136-140")
        self.assertEqual(bf.liste_en_plages([]), "")

    def test_titres(self):
        self.assertEqual(bf.titres("A Certain Magical Index (Toaru Majutsu No Index)"),
                         ["A Certain Magical Index", "Toaru Majutsu No Index"])
        self.assertEqual(bf.titres("One Piece"), ["One Piece"])


class Fusion(unittest.TestCase):
    def test_page_avec_remplissage_d_abord(self):
        vus = {"magister-negi-magi": {"id": 8859, "f": "23-26", "n": 26}, "noragami-aragoto": {"id": 8859, "f": "", "n": 26},
               "boruto": {"id": 1, "f": "1-2", "n": 200}, "boruto-liste": {"id": 1, "f": "1-5", "n": 293}, "film": {"id": 0, "f": "1"}}
        self.assertEqual(bf.fusion(vus), {"8859": "23-26", "1": "1-5"})


class Relier(unittest.TestCase):
    def reponses(self, series):
        def tmdb(path, **_):
            if path == "/search/tv":
                return {"results": [{k: v for k, v in x.items() if k != "n"} for x in series]}
            return {"number_of_episodes": next((x["n"] for x in series if f"/tv/{x['id']}" == path), 0)}
        return mock.patch.object(bf, "tmdb", side_effect=tmdb)

    def test_meme_nom_d_abord(self):
        """« Dragon Ball » (153 épisodes) : pas Dragon Ball Super (131), même si son nombre d'épisodes passe."""
        anime = {"genre_ids": [16], "original_language": "ja"}
        with self.reponses([{"id": 2, "name": "Dragon Ball Super", "n": 131, **anime},
                            {"id": 1, "name": "Dragon Ball", "n": 153, **anime}]):
            self.assertEqual(bf.relier("Dragon Ball", 153), 1)
        with self.reponses([{"id": 2, "name": "Dragon Ball Super", "n": 131, **anime}]):
            self.assertEqual(bf.relier("Dragon Ball", 153), 0)

    def test_nom_original_en_lettres_latines_seulement(self):
        anime = {"genre_ids": [16], "original_language": "ja"}
        with self.reponses([{"id": 9, "name": "Fullmetal Alchemist: Brotherhood", "original_name": "鋼の錬金術師 FULLMETAL ALCHEMIST",
                             "n": 64, **anime}]):
            self.assertEqual(bf.relier("Fullmetal Alchemist", 51), 0)

    def test_prises_de_vue_reelles_et_pages_sans_episodes(self):
        with self.reponses([{"id": 1, "name": "Naruto Shippuden", "n": 500, "genre_ids": [18], "original_language": "ja"}]):
            self.assertEqual(bf.relier("Naruto Shippuden", 500), 0)
        with self.reponses([{"id": 1, "name": "Naruto", "n": 220, "genre_ids": [16], "original_language": "ja"}]):
            self.assertEqual(bf.relier("Naruto", 0), 0)

    def test_nombre_d_episodes_presque_identique_et_seul(self):
        anime = {"genre_ids": [16], "original_language": "ja"}
        with self.reponses([{"id": 3, "name": "Shingeki no Kyojin: Attack", "n": 89, **anime}]):
            self.assertEqual(bf.relier("Attack on Titan", 89), 3)
        with self.reponses([{"id": 5, "name": "Negima!", "n": 13, **anime}]):
            self.assertEqual(bf.relier("Noragami Aragoto", 13), 0)        # aucun mot en commun
        with self.reponses([{"id": 3, "name": "A", "n": 26, **anime}, {"id": 4, "name": "B", "n": 26, **anime}]):
            self.assertEqual(bf.relier("Negima!", 26), 0)


if __name__ == "__main__":
    unittest.main()
