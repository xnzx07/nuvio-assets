"""Dates annoncées de dvdsreleasedates.com (scripts/dates_numeriques.py), sans réseau."""
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

import dates_numeriques as dn  # noqa: E402

RESULTATS = ("<td class='dvdcell'><a href='/movies/12597/street-fighter'><img/></a><br/><a href='/movies/12597/street-fighter'>"
             "Street Fighter</a><table><tr><td class='imdblink left'>imdb: <a href='http://www.imdb.com/title/tt27419420/'>6</a>"
             "</td></tr></table></td><td class='dvdcell'><a href='/movies/999/street-fighter-1994'>Street Fighter</a>"
             "<td class='imdblink left'>imdb: <a href='http://www.imdb.com/title/tt0111301/'>4</a></td>")
FICHE = ("<td class='imdblink'><a href='http://www.imdb.com/title/tt27419420/'>6</a></td> ... "
         "<td>Digital HD Release Date</td><td>December&nbsp;1, 2026</td> ... DVD Release Date not announced")


class Lecture(unittest.TestCase):
    def test_bon_film_par_son_identifiant(self):
        self.assertEqual(dn.fiche_de(RESULTATS, "tt0111301"), "/movies/999/street-fighter-1994")
        self.assertEqual(dn.fiche_de(RESULTATS, "tt27419420"), "/movies/12597/street-fighter")
        self.assertIsNone(dn.fiche_de(RESULTATS, "tt1"))

    def test_date(self):
        self.assertEqual(dn.date_numerique(FICHE), "2026-12-01")
        self.assertIsNone(dn.date_numerique("Digital HD Release Date not announced"))

    def test_titre_exact_redirige_vers_la_fiche(self):
        with mock.patch.object(dn, "_lire", return_value=("https://www.dvdsreleasedates.com/movies/12597/street-fighter", FICHE)):
            self.assertEqual(dn.date_annoncee("Street Fighter", "tt27419420"), "2026-12-01")
            self.assertIsNone(dn.date_annoncee("Street Fighter", "tt0111301"))     # autre film : rien

    def test_site_muet(self):
        with mock.patch.object(dn, "_lire", side_effect=OSError("panne")):
            self.assertIsNone(dn.date_annoncee("Street Fighter", "tt27419420"))


if __name__ == "__main__":
    unittest.main()
