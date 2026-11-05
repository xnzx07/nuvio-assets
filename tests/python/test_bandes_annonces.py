"""Bandes-annonces VF (scripts/build_bandes_annonces.py), sans réseau : python -m unittest discover -s tests/python"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

import build_bandes_annonces as ba  # noqa: E402


class Convient(unittest.TestCase):
    def test_vf_seulement(self):
        self.assertTrue(ba.convient("HEAT - Bande Annonce Officielle (VF) - Al Pacino", "Heat", 1995, False, True, "1996-01-01"))
        # Remise en ligne bien après la sortie, sans année : pas sûr (la recherche, qui exige l'année, prend le relais).
        self.assertFalse(ba.convient("HEAT - Bande Annonce Officielle (VF) - Al Pacino", "Heat", 1995, False, True, "2012-05-01"))
        self.assertFalse(ba.convient("Heat - Bande-annonce originale de 1995 (VOSTFR)", "Heat", 1995, False))
        self.assertFalse(ba.convient("Heat (1995)(Film complet)(VFQ)", "Heat", 1995, False))
        self.assertFalse(ba.convient("Dune - Extrait VF", "Dune", None, False))     # pas une bande-annonce

    def test_nomme_l_oeuvre_et_rien_devant(self):
        self.assertTrue(ba.convient("Bande-annonce VF : Dune 2021", "Dune", 2021, False))
        self.assertFalse(ba.convient("Le Retour de Dune - Bande-annonce VF 2021", "Dune", 2021, False))
        self.assertFalse(ba.convient("Dunes - Bande-annonce VF 2021", "Dune", 2021, False))

    def test_annee(self):
        self.assertTrue(ba.convient("Dune Bande Annonce VF (2020)", "Dune", 2021, False))     # ±1 an
        self.assertFalse(ba.convient("Dune Bande Annonce VF (1984)", "Dune", 2021, False))
        self.assertFalse(ba.convient("Dune Bande Annonce VF", "Dune", 2021, False))           # pas d'année : pas sûr
        self.assertTrue(ba.convient("Dune Bande Annonce VF", "Dune", 2021, False, True, "2021-07-01"))   # sauf chaîne officielle
        self.assertFalse(ba.convient("Dune Bande Annonce VF", "Dune", 2021, False, True))                 # date inconnue
        self.assertFalse(ba.convient("Dune Bande Annonce VF (1984)", "Dune", 2021, False, True))
        self.assertFalse(ba.convient("Dune Bande Annonce VF", "Dune", 2021, False, True, "2015-03-01T00:00:00Z"))
        self.assertTrue(ba.convient("Dune Bande Annonce VF", "Dune", 2021, False, True, "2020-09-09T00:00:00Z"))

    def test_serie_ou_film(self):
        """Une série et un film du même nom (Bleach) : la vidéo doit être du bon côté."""
        self.assertFalse(ba.convient("Bleach - Le film - Bande-annonce VF 2018", "Bleach", 2004, True))
        self.assertFalse(ba.convient("Bleach - Saison 1 Bande-annonce VF 2018", "Bleach", 2018, False))
        self.assertTrue(ba.convient("Black Clover - Saison 1 en VF : Bande-annonce", "Black Clover", 2017, True, False, "2018-01-01"))
        self.assertTrue(ba.convient("The Bear Saison 3 Bande-annonce VF 2024", "The Bear", 2022, True))

    def test_bande_annonce_avant_teaser(self):
        idx = ba.Index([("t1", "Dune Teaser VF 2021", "2021-03-01T00:00:00Z"),
                        ("b1", "Dune Bande-annonce VF 2021", "2021-06-01T00:00:00Z"),
                        ("b2", "Dune Bande-annonce 2 VF 2021", "2021-08-01T00:00:00Z"),
                        ("v1", "Dune Bande-annonce VOSTFR 2021", "2021-09-01T00:00:00Z")])
        self.assertEqual(idx.chercher("Dune", 2021, False)[0], "b2")
        self.assertIsNone(idx.chercher("Arrival", 2016, False))


class AutreOeuvre(unittest.TestCase):
    """Cas relevés au premier passage : une autre œuvre de la même famille."""
    def test_suite_ou_derive(self):
        self.assertFalse(ba.convient("Jumanji : Next Level - Bande-annonce Finale - VF", "Jumanji", 1996, False, True, "2019-06-01"))
        self.assertFalse(ba.convient("Godzilla x Kong : Le Nouvel Empire | Bande-annonce officielle 2 (VF)", "Godzilla", 2018, False, True, "2024-01-01"))
        self.assertFalse(ba.convient("Les Bisounours Et Les Cousinours | Bande-annonce VF | Netflix France", "Les Bisounours", 1985, True, True, "2020-01-01"))
        self.assertFalse(ba.convient("IP MAN LE COMBAT FINAL Bande Annonce VF", "Ip Man", 2008, False, True, "2013-01-01"))
        self.assertFalse(ba.convient("Dragon Ball Super: SUPER HERO | TRAILER VF", "Dragon Ball Super", 2015, True, True, "2022-01-01"))
        self.assertFalse(ba.convient("Luther : Soleil déchu | Bande-annonce officielle VF | Netflix France", "Luther", 2010, True, True, "2023-01-01"))

    def test_remake_et_cinema(self):
        titre = "Le Choc des Titans - Bande Annonce Officielle (VF) - Sam Worthington"
        self.assertFalse(ba.convient(titre, "Le Choc des Titans", 1981, False, True, "2010-01-15"))
        self.assertTrue(ba.convient(titre, "Le Choc des Titans", 2010, False, True, "2010-01-15"))
        self.assertFalse(ba.convient("Firestarter - Bande-annonce VF [Au cinéma le 1er juin]", "Firestarter", 2002, True, True, "2022-03-01"))

    def test_toujours_bons(self):
        self.assertTrue(ba.convient("LE JEU DE LA DAME Bande Annonce VF (NETFLIX, 2020) Anya Taylor-Joy", "Le Jeu de la dame", 2020, True))
        self.assertTrue(ba.convient("SEVERANCE Saison 2 Bande Annonce VF (2024)", "Severance", 2022, True))
        self.assertTrue(ba.convient("The Big Bang Theory - Bande Annonce Officielle Saison 5 (VF)", "The Big Bang Theory", 2007, True, True, "2012-01-01"))


class Series(unittest.TestCase):
    """Deuxième contrôle : remakes de séries, série et film du même nom."""
    def test_remake_apres_la_fin(self):
        titre = "Perdus dans l'espace | Bande-annonce officielle VF | Dernière saison | Netflix France"
        self.assertFalse(ba.convient(titre, "Perdus dans l'espace", 1965, True, "plateforme", "2021-11-01", fin=1968))
        self.assertTrue(ba.convient(titre, "Perdus dans l'espace", 2018, True, "plateforme", "2021-11-01", fin=2021))
        self.assertFalse(ba.convient("KINGDOM Bande Annonce VF (Série Netflix, 2019)", "Kingdom", 2014, True, fin=2017))
        self.assertTrue(ba.convient("KINGDOM Bande Annonce VF (Série Netflix, 2019)", "Kingdom", 2019, True))

    def test_serie_sans_saison_seulement_d_une_plateforme(self):
        titre = "Les Gardiens de la Galaxie - Bande-annonce VF - Marvel Officiel | HD"
        self.assertFalse(ba.convient(titre, "Les Gardiens de la Galaxie", 2015, True, True, "2014-03-01"))
        self.assertTrue(ba.convient("FX Adults - Bande annonce officielle (VF) l Disney+", "Adults", 2025, True, "plateforme", "2025-05-01"))
        self.assertFalse(ba.convient('BATMAN Bande Annonce VF ("Batman : The Movie " - 1966)', "Batman", 1966, True))


class Divers(unittest.TestCase):
    def test_norm_comme_l_addon(self):
        self.assertEqual(ba.norm("L'Été & Moi"), "l ete and moi")


if __name__ == "__main__":
    unittest.main()
