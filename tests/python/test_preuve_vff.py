"""Preuve de VF de France (scripts/preuve_vff.py), sans réseau : python -m unittest discover -s tests/python"""
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

import build_sans_vf as sansvf  # noqa: E402
import preuve_vff as pv  # noqa: E402

HEAT = """Heat
Titre original :
Heat
Année :
1995
Réalisation :
Michael Mann
Distribution :
De Niro Robert
(Neil McCauley)
Frantz Jacques
Pacino Al
(Lt. Vincent Hanna)
Luccioni José
Top"""


class Page:
    def __init__(self, texte):
        self.texte = texte

    def get_all_text(self, **_):
        return self.texte


class Fiche(unittest.TestCase):
    def test_lire_fiche(self):
        self.assertEqual(pv.lire_fiche(HEAT), {"annee": 1995, "real": "Michael Mann", "voix": 2})

    def test_homonyme_ecarte(self):
        """« Obsessed » : la fiche RS Doublage est celle de 2009 (Steve Shill), pas le film coréen de 2014."""
        obsessed = HEAT.replace("1995", "2009").replace("Michael Mann", "Steve Shill")
        with mock.patch.object(pv, "_index", {"obsessed": ["film-2970-Obsessed.html"]}), \
                mock.patch.object(pv, "_page", return_value=Page(obsessed)) as lire:
            self.assertFalse(pv.preuve_rsdoublage(["Obsessed"], 2014, {"kim", "dae", "woo"}))
            self.assertTrue(pv.preuve_rsdoublage(["Obsessed"], 2009, {"steve", "shill"}))
        self.assertEqual(lire.call_count, 2)

    def test_sans_annee_ni_realisateur_pas_de_lecture(self):
        with mock.patch.object(pv, "index_rsdoublage") as idx:
            self.assertFalse(pv.preuve_rsdoublage(["Heat"], 0, {"mann"}))
            self.assertFalse(pv.preuve_rsdoublage(["Heat"], 1995, set()))
        idx.assert_not_called()


class Wikipedia(unittest.TestCase):
    def test_vf_de_france_seulement(self):
        self.assertTrue(pv.a_une_vf("* [[Al Pacino]] (VF : [[José Luccioni]] ; VQ : [[Luis de Cespedes]])"))
        self.assertTrue(pv.a_une_vf("* Al Pacino (VQ : Luis de Cespedes ; VF : José Luccioni)"))
        self.assertTrue(pv.a_une_vf("* Al Pacino ([[Version française|VF]] : José Luccioni)"))
        self.assertTrue(pv.a_une_vf("* Al Pacino (VFF : José Luccioni)"))
        self.assertFalse(pv.a_une_vf("* Al Pacino (VQ : Luis de Cespedes)"))
        self.assertFalse(pv.a_une_vf("* Al Pacino (VFQ : Luis de Cespedes ; VFB : X)"))
        self.assertFalse(pv.a_une_vf("Le film est sorti en VF en 2003."))


class SansVf(unittest.TestCase):
    def test_preuve_sans_debrideur(self):
        """Une VF prouvée : « vf » avec sa source, et l'addon (le débrideur) n'est pas appelé."""
        suivi = {}
        with mock.patch.object(sansvf, "preuve_vff", return_value="rsdoublage"), \
                mock.patch.object(sansvf, "avis_addon") as avis:
            self.assertTrue(sansvf.examiner(suivi, "tt1", 1, {}, "2026-11-05"))
        avis.assert_not_called()
        self.assertEqual(suivi["tt1"], {"id": 1, "e": "vf", "j": "2026-11-05", "n": 0, "p": "rsdoublage"})

    def test_series_a_part(self):
        """Une série notée « s » ; les films et les séries sans VF sortent dans deux listes."""
        suivi = {}
        for j in ("2026-11-01", "2026-11-04"):
            sansvf.noter(suivi, "tt1", 1, "non", j)
            sansvf.noter(suivi, "tt2", 2, "non", j, serie=True)
        self.assertEqual(sansvf.films_de(suivi), ["tt1"])
        self.assertEqual(sansvf.films_de(suivi, series=True), ["tt2"])
        sansvf.noter(suivi, "tt2", 2, "doute", "2026-12-01")     # revue plus tard : reste une série
        self.assertEqual(suivi["tt2"]["s"], 1)

    def test_addon_pas_a_jour_pour_les_series(self):
        """Un addon qui ne renvoie pas type « series » a jugé la série comme un film : « doute », rien de marqué."""
        with mock.patch.dict("os.environ", {"TMDB_API_KEY": "x"}), mock.patch.object(sansvf, "_json", return_value={"etat": "non"}) as lire:
            self.assertEqual(sansvf.avis_addon("tt2", serie=True), {"etat": "doute"})
            self.assertIn(b'"type": "series"', lire.call_args[0][0].data)
        with mock.patch.dict("os.environ", {"TMDB_API_KEY": "x"}), mock.patch.object(sansvf, "_json", return_value={"etat": "non", "type": "series"}):
            self.assertEqual(sansvf.avis_addon("tt2", serie=True)["etat"], "non")

    def test_sans_preuve_avis_habituel(self):
        suivi = {}
        with mock.patch.object(sansvf, "preuve_vff", return_value=None), \
                mock.patch.object(sansvf, "avis_addon", return_value={"etat": "non"}):
            sansvf.examiner(suivi, "tt1", 1, {}, "2026-11-05")
        self.assertEqual(suivi["tt1"], {"id": 1, "e": "non", "j": "2026-11-05", "n": 1})


if __name__ == "__main__":
    unittest.main()
