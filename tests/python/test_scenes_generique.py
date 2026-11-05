"""Scènes du générique (scripts/build_scenes_generique.py), sans réseau : python -m unittest discover -s tests/python"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

import build_scenes_generique as bs  # noqa: E402


class Codes(unittest.TestCase):
    def test_categories(self):
        """14 pendant, 15 après, 16 les deux, 7 une scène, 6 aucune ; 8 inconnu et 10 télévision : rien."""
        self.assertEqual(bs.code_de([5, 7, 14]), "p")
        self.assertEqual(bs.code_de([5, 7, 15]), "a")
        self.assertEqual(bs.code_de([5, 7, 16]), "pa")
        self.assertEqual(bs.code_de([5, 14, 15]), "pa")
        self.assertEqual(bs.code_de([5, 7]), "s")
        self.assertEqual(bs.code_de([5, 6]), "0")
        self.assertIsNone(bs.code_de([5, 624, 8]))
        self.assertIsNone(bs.code_de([10, 15]))
        self.assertIsNone(bs.code_de([]))

    def test_pas_une_scene(self):
        """« Pas de scène » l'emporte ; un son ou des photos seuls ne sont pas une scène ; une scène bonus, si."""
        self.assertEqual(bs.code_de([14, 5, 6, 624]), "0")
        self.assertEqual(bs.code_de([15, 3779, 5, 7]), "0")
        self.assertEqual(bs.code_de([3779, 2674, 16, 5, 7]), "pa")     # Avengers: Endgame
        self.assertEqual(bs.code_de([14, 5, 624, 7]), "p")             # pas de précision : une scène

    def test_imdb_du_lien(self):
        html = '<a href="https://www.imdb.com/title/tt14129116/">IMDb</a> tt0000001'
        self.assertEqual(bs.imdb_de(html), "tt14129116")
        self.assertIsNone(bs.imdb_de("pas de lien"))


if __name__ == "__main__":
    unittest.main()
