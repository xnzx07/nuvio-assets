"""Âges du CNC (scripts/build_ages_cnc.py), sans réseau : python -m unittest discover -s tests/python"""
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

import build_ages_cnc as ba  # noqa: E402


class Decisions(unittest.TestCase):
    def test_ages(self):
        """Fichier ouvert (« Interdit -12 ans ») et site (« Interdiction aux mineurs -12ans avec avertissement »)."""
        cas = {"Tout public": 0, "Tous publics": 0, "Avertissement": 10, "Tous publics avec avertissement": 10,
               "Interdit -12 ans": 12, "Interdiction aux mineurs -12ans avec avertissement": 12,
               "Interdit -13 ans": 13, "Interdiction aux mineurs -16 ans": 16, "Interdit -18 ans": 18,
               "Interdit mineurs": 18, "Interdit mineurs - Interdit -13 ans": 18, "Censure": None, "": None}
        for decision, age in cas.items():
            self.assertEqual(ba.age_de(decision), age, decision)


class Titres(unittest.TestCase):
    def test_titres_a_chercher(self):
        self.assertEqual(ba.titres("Joker. Wild card"), ["Joker. Wild card", "Joker", "Wild card"])
        self.assertEqual(ba.titres("Les musiciens (ex. Le sommet)"), ["Les musiciens"])
        self.assertEqual(ba.titres("AU FIL DE L EAU"), ["AU FIL DE L EAU"])

    def test_noms_des_realisateurs(self):
        """Ordre et casse indifférents ; cyrillique translittéré (TMDB écrit « Кантемир Балагов »)."""
        self.assertEqual(ba.noms("BALAGOV Kantemir\nSTEPNOVA Marina"), {"balagov", "kantemir", "stepnova", "marina"})
        self.assertEqual(ba.noms("Кантемир Балагов"), {"kantemir", "balagov"})
        self.assertEqual(ba.noms("Grégory Magne"), {"gregory", "magne"})
        self.assertEqual(ba.noms("Jean-Pierre Jeunet"), {"jean", "pierre", "jeunet"})


class Lectures(unittest.TestCase):
    def test_fichier_ouvert(self):
        """Longs-métrages depuis ANNEE_MIN avec un âge ; courts, vieux films et censure laissés de côté."""
        texte = ("Titre;Réalisation;Production;Format;Date;Nationalité;N° de visa;Décision;Localisation du dossier visa\n"
                 "Joker : Folie à deux;Todd Phillips;Warner;Long-métrage;2024;États-Unis;162947;Interdit -12 ans;CNC\n"
                 "Court;Quelqu'un;X;Court-métrage;2024;France;1;Tout public;CNC\n"
                 "Joker;Todd Phillips;Warner;Long-métrage;2019;États-Unis;151541;Interdit -12 ans;CNC\n"
                 "Interdit;Quelqu'un;X;Long-métrage;2023;France;2;Censure;CNC\n")
        with mock.patch.object(ba, "ANNEE_MIN", 2021):
            self.assertEqual(ba.visas_csv(texte), [{"visa": "162947", "titre": "Joker : Folie à deux",
                                                    "real": "Todd Phillips", "annee": 2024, "age": 12}])

    def test_tableau_du_site(self):
        lignes = [["BUTTERFLY JAM", "BALAGOV Kantemir\nSTEPNOVA Marina", "162189", "Interdiction aux mineurs -12 ans",
                   "ALLEMAGNE, BELGIQUE, FRANCE", "07/10/2026"],
                  ["SANS MENTION", "X Y", "168000", "", "FRANCE", "07/10/2026"],
                  ["Titre", "Réalisateur", "Visa", "Mentions", "Pays", "Date de sortie"]]
        self.assertEqual(ba.lignes_site(lignes), [{"visa": "162189", "titre": "BUTTERFLY JAM",
                                                   "real": "BALAGOV Kantemir\nSTEPNOVA Marina", "annee": 2026,
                                                   "age": 12, "sortie": "2026-10-07"}])


class Relier(unittest.TestCase):
    def test_meme_realisateur_obligatoire(self):
        """Le bon titre mais un autre réalisateur : pas relié ; le bon réalisateur à ±2 ans : relié."""
        reponses = {
            "/search/movie": {"results": [{"id": 1, "release_date": "2019-10-04"}, {"id": 2, "release_date": "2019-01-01"}]},
            "/movie/1/credits": {"crew": [{"id": 10, "job": "Director", "name": "Todd Phillips"}]},
            "/movie/2/credits": {"crew": [{"id": 11, "job": "Director", "name": "Autre Personne"}]},
            "/search/person": {"results": []},
        }
        with mock.patch.object(ba, "tmdb", side_effect=lambda path, **_: reponses.get(path, {})):
            self.assertEqual(ba.relier({"titre": "Joker", "real": "Todd Phillips", "annee": 2019}), 1)
            self.assertEqual(ba.relier({"titre": "Joker", "real": "Simon West", "annee": 2019}), 0)
            self.assertEqual(ba.relier({"titre": "Joker", "real": "Todd Phillips", "annee": 2025}), 0)   # trop loin


if __name__ == "__main__":
    unittest.main()
