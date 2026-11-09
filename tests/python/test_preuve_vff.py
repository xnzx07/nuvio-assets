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


PROTECTEUR = """Le Protecteur
Titre original :
The Guardian
Année :
2001/2004
Création :
David Hollander
Distribution :
Baker Simon
(Nick Fallin)
67 ép.
Ragueneau Thierry"""


class Series(unittest.TestCase):
    def test_fiche_de_serie(self):
        self.assertEqual(pv.lire_fiche(PROTECTEUR), {"annee": 2001, "real": "David Hollander", "voix": 1})

    def test_serie_parmi_les_series_seulement(self):
        """« Le Protecteur » : la série (2001) chez les séries ; un film du même nom ne compte pas pour elle."""
        idx = {"le protecteur": ["film-1-Le+Protecteur.html", "serie-7187-Le+Protecteur.html"]}
        with mock.patch.object(pv, "_index", idx), mock.patch.object(pv, "_page", return_value=Page(PROTECTEUR)) as lire:
            self.assertTrue(pv.preuve_rsdoublage(["Le Protecteur"], 2001, {"david", "hollander"}, serie=True))
        self.assertEqual([c.args[0] for c in lire.call_args_list], [f"{pv.RSD}/serie-7187-Le+Protecteur.html"])
        with mock.patch.object(pv, "_index", idx), mock.patch.object(pv, "_page", return_value=Page(PROTECTEUR)) as lire:
            self.assertTrue(pv.preuve_rsdoublage(["Le Protecteur"], 2001, {"david", "hollander"}))
        self.assertEqual([c.args[0] for c in lire.call_args_list], [f"{pv.RSD}/film-1-Le+Protecteur.html"])

    def test_preuve_vff_d_une_serie(self):
        """Une série : son nom, sa première diffusion et ses créateurs (pas de réalisateur chez TMDB)."""
        fiche = {"name": "Le Protecteur", "original_name": "The Guardian", "first_air_date": "2001-09-25",
                 "created_by": [{"name": "David Hollander"}], "external_ids": {}}
        with mock.patch.object(pv, "preuve_rsdoublage", return_value=True) as rsd:
            self.assertEqual(pv.preuve_vff(fiche, serie=True), "rsdoublage")
        rsd.assert_called_once_with(["Le Protecteur", "The Guardian"], 2001, {"david", "hollander"}, True)


def notice(titre, resp, audio, parue="2017", st=("fre",)):
    sz = lambda code, v: f'<mxc:subfield code="{code}">{v}</mxc:subfield>'  # noqa: E731
    return ('<mxc:datafield tag="101" ind1="0" ind2=" ">' + "".join(sz("a", a) for a in audio) + "".join(sz("j", j) for j in st)
            + '</mxc:datafield><mxc:datafield tag="200" ind1="1" ind2=" ">' + sz("a", titre) + sz("b", "Images animées")
            + sz("f", resp) + '</mxc:datafield><mxc:datafield tag="214" ind1=" " ind2="0">' + sz("a", "Paris") + sz("d", parue)
            + "</mxc:datafield>")


class Bnf(unittest.TestCase):
    PARK = {"park", "chan", "wook"}

    def test_piste_francaise(self):
        # Le titre doit être le même (le titre français et le titre original sont cherchés tous les deux).
        self.assertFalse(pv.edition_bnf_vf(notice("Old boy", "Park Chan-Wook, réal.", ["fre", "kor"], "2004"), "Oldboy", 2003, self.PARK))
        self.assertTrue(pv.edition_bnf_vf(notice("Old boy", "Park Chan-Wook, réal.", ["fre", "kor"], "2004"), "Old Boy", 2003, self.PARK))

    def test_vo_seule_rien(self):
        """Stalker chez Potemkine : russe, sous-titres français. Pas une preuve (ni dans un sens ni dans l'autre)."""
        self.assertFalse(pv.edition_bnf_vf(notice("Stalker", "Andrei Tarkovski, réal.", ["rus"]), "Stalker", 1979, {"andrei", "tarkovski"}))

    def test_plusieurs_langues_sans_detail(self):
        self.assertFalse(pv.edition_bnf_vf(notice("Oldboy", "Park Chan-Wook, réal.", ["mul", "kor"]), "Oldboy", 2003, self.PARK))

    def test_homonymes_ecartes(self):
        """Le remake de Spike Lee (VF) ne prouve rien pour le film de Park ; un titre voisin non plus."""
        spike = notice("Oldboy", "Spike Lee, réal. Mark Protosevich, scénario", ["fre", "eng"], "2014")
        self.assertFalse(pv.edition_bnf_vf(spike, "Oldboy", 2003, self.PARK))
        self.assertFalse(pv.edition_bnf_vf(notice("Andreï Tarkovski", "Andreï Tarkovski, réal.", ["fre", "rus"]), "Stalker", 1979, {"andrei", "tarkovski"}))

    def test_edition_d_avant_le_film(self):
        """Une édition parue avant le film est celle d'un autre (même titre, même nom de réalisateur)."""
        self.assertFalse(pv.edition_bnf_vf(notice("Bad genius", "J. C. Lee, réal.", ["fre"], "[DL 2010]"), "Bad Genius", 2024, {"lee"}))
        self.assertTrue(pv.edition_bnf_vf(notice("Bad genius", "J. C. Lee, réal.", ["fre"], "[DL 2025]"), "Bad Genius", 2024, {"lee"}))

    def test_sans_realisateur_pas_de_lecture(self):
        with mock.patch.object(pv.urllib.request, "urlopen") as lire:
            self.assertFalse(pv.preuve_bnf(["Stalker"], 1979, set()))
        lire.assert_not_called()


class Wikipedia(unittest.TestCase):
    def test_vf_de_france_seulement(self):
        self.assertTrue(pv.a_une_vf("* [[Al Pacino]] (VF : [[José Luccioni]] ; VQ : [[Luis de Cespedes]])"))
        self.assertTrue(pv.a_une_vf("* Al Pacino (VQ : Luis de Cespedes ; VF : José Luccioni)"))
        self.assertTrue(pv.a_une_vf("* Al Pacino ([[Version française|VF]] : José Luccioni)"))
        self.assertTrue(pv.a_une_vf("* Al Pacino (VFF : José Luccioni)"))
        self.assertFalse(pv.a_une_vf("* Al Pacino (VQ : Luis de Cespedes)"))
        self.assertFalse(pv.a_une_vf("* Al Pacino (VFQ : Luis de Cespedes ; VFB : X)"))
        self.assertFalse(pv.a_une_vf("Le film est sorti en VF en 2003."))

    def test_modele_doublage(self):
        """Le modèle des séries : Le Protecteur, The IT Crowd."""
        self.assertTrue(pv.a_une_vf("* [[Simon Baker]] {{Doublage|VF=Thierry Ragueneau}} : Nick Fallin"))
        self.assertTrue(pv.a_une_vf("* X {{Doublage|VQ=Untel|VF=Éric Aubrahn|VF_lien=non}} : Jake"))
        self.assertTrue(pv.a_une_vf("* X {{doublage | VFF = Untel}}"))
        self.assertFalse(pv.a_une_vf("* X {{Doublage|VQ=Untel}} : Jake"))
        self.assertFalse(pv.a_une_vf("* X {{Doublage|VQ=Untel|VF_lien=non}}"))
        self.assertFalse(pv.a_une_vf("* X {{Doublage|VF=}}"))


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
