"""Collections facultatives (scripts/build_optional.py), sans réseau : python -m unittest discover -s tests/python"""
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
sys.path.insert(0, str(SCRIPTS))

import build_optional as bo  # noqa: E402
import build_recompenses as br  # noqa: E402
import make_optional_tiles as mo  # noqa: E402

ROOT = SCRIPTS.parent
BRANCH = "https://raw.githubusercontent.com/xnzx07/nuvio-assets/tuiles-optionnelles"
IDS = ["decennies", "monde", "realisateurs", "acteurs", "recompenses", "univers", "chaines", "enfants", "cultes",
       "adaptations", "temps", "animes-genres", "documentaires", "sport"]


def item(id, votes, poster="/p.jpg", backdrop="/b.jpg"):
    return {"id": id, "vote_count": votes, "poster_path": poster, "backdrop_path": backdrop}


class Definitions(unittest.TestCase):
    def test_quatorze_collections(self):
        self.assertEqual([c["id"] for c in bo.COLLECTIONS], IDS)
        folders = [f["id"] for c in bo.COLLECTIONS for f in c["folders"]]
        self.assertEqual(len(folders), len(set(folders)))
        self.assertGreaterEqual(len(folders), 80)
        for c in bo.COLLECTIONS:
            self.assertIn(c["style"], ("saga", "plateforme"))
            for f in c["folders"]:
                self.assertTrue(f["sources"], f["id"])

    def test_acteurs_sans_emissions_tele(self):
        """Les séries d'un acteur sur TMDB comptent ses passages en émission (« Sacrée soirée ») : films seulement."""
        acteurs = next(c for c in bo.COLLECTIONS if c["id"] == "acteurs")
        for f in acteurs["folders"]:
            self.assertTrue(all(s["mediaType"] == "MOVIE" for s in f["sources"]), f["id"])

    def test_univers_dans_l_ordre(self):
        """Sagas des grands univers : même règle que la collection Sagas (TMDB en direct si elle y est dans l'ordre,
        sinon la rangée de la saga dans l'addon : catalogue « saga-<id TMDB> »)."""
        sagas = [s for t in json.loads((ROOT / "data" / "sagas.json").read_text(encoding="utf-8")) for s in t["sagas"]]
        par_nom, par_cat = {s["title"]: s for s in sagas}, {f"saga-{s['id']}": s for s in sagas}
        univers = next(c for c in bo.COLLECTIONS if c["id"] == "univers")
        for s in (s for f in univers["folders"] for s in f["sources"]):
            if s.get("provider") == "addon":
                self.assertFalse(par_cat[s["catalogId"]]["in_order"], s["catalogId"])
                self.assertNotIn("genre", s)
            elif s.get("tmdbSourceType") == "COLLECTION":
                self.assertTrue(par_nom[s["title"]]["in_order"], s["title"])
        star_wars = f"saga-{par_nom['Star Wars']['id']}"                                         # dans le désordre
        self.assertIn(star_wars, [s.get("catalogId") for f in univers["folders"] for s in f["sources"]])

    def test_rangees_addon_de_l_addon(self):
        """Récompenses, moins de 1 h 30, mini-séries : rangées de l'addon (Nuvio ne sait pas les faire seul)."""
        addon = [s for c in bo.COLLECTIONS for f in c["folders"] for s in f["sources"] if s.get("provider") == "addon"]
        self.assertEqual({s["catalogId"] for s in addon if not s["catalogId"].startswith("saga-")},
                         {"fac-oscars", "fac-palmes", "fac-cesars", "fac-moins-90", "fac-mini-series"})
        self.assertTrue(all(s["addonId"] == bo.ADDON_ID for s in addon))


class Requetes(unittest.TestCase):
    def test_discover_series_avec_dates(self):
        src = bo.disc("Séries", "TV", releaseDateGte="1980-01-01", releaseDateLte="1989-12-31", withKeywords="1|2",
                      withOriginCountry="SE|DK")
        self.assertEqual(bo.request(src), ("/discover/tv", {"first_air_date.gte": "1980-01-01", "first_air_date.lte": "1989-12-31",
                                                            "with_keywords": "1|2", "with_origin_country": "SE|DK",
                                                            "sort_by": "vote_count.desc"}))

    def test_discover_films_avec_dates(self):
        path, params = bo.request(bo.disc("Films", "MOVIE", releaseDateGte="1970-01-01"))
        self.assertEqual((path, params["primary_release_date.gte"]), ("/discover/movie", "1970-01-01"))

    def test_titres_d_une_personne(self):
        calls = []

        def call(path, **params):
            calls.append(path)
            return {"cast": [item(1, 5, "/a"), item(2, 50, "/b"), item(3, 9, None)], "crew": [
                {**item(4, 99, "/d"), "job": "Director"}, {**item(5, 80, "/e"), "job": "Writer"}]}
        with mock.patch.object(bo, "tmdb", side_effect=call):
            self.assertEqual([t["poster"] for t in bo.titles(bo.person("Films", 6193))], ["/b", "/a"])
            self.assertEqual([t["poster"] for t in bo.titles(bo.person("Films", 525, kind="DIRECTOR"))], ["/d"])
        self.assertEqual(calls, ["/person/6193/movie_credits", "/person/525/movie_credits"])

    def test_titres_d_une_saga(self):
        with mock.patch.object(bo, "tmdb", return_value={"parts": [item(1, 5, "/a"), item(2, 50, "/b")]}):
            self.assertEqual([t["poster"] for t in bo.titles(bo.coll("Films", 10))], ["/b", "/a"])

    def test_titres_des_laureats(self):
        data = {"oscars": [item(1, 5, "/a"), item(2, 50, "/b")]}
        with mock.patch.object(bo, "AWARDS", data):
            self.assertEqual([t["poster"] for t in bo.titles(bo.addon("fac-oscars", "movie"))], ["/b", "/a"])


class Construction(unittest.TestCase):
    def test_tuile_sans_affiche_ecartee(self):
        c = {"id": "x", "title": "X", "style": "saga", "folders": [
            {"id": "x-vide", "title": "Vide", "sources": [bo.disc("Films", "MOVIE")]},
            {"id": "x-ok", "title": "Ok", "sources": [bo.disc("Films", "MOVIE", withGenres="28")]}]}

        def call(path, **params):
            return {"results": [item(i, 10 - i, f"/p{i}") for i in range(5)] if params.get("with_genres") else []}
        with mock.patch.object(bo, "tmdb", side_effect=call):
            built = bo.build_collection(c)
        self.assertEqual([f["id"] for f in built["folders"]], ["x-ok"])
        self.assertEqual(built["folders"][0]["posters"][:2], ["/p0", "/p1"])
        self.assertEqual(built["folders"][0]["backdrop"], "/b.jpg")

    def test_ecriture_des_collections(self):
        data = [{"id": "decennies", "title": "Décennies", "style": "saga",
                 "folders": [{"id": "decennie-80", "title": "Années 80", "sources": [bo.disc("Films", "MOVIE")],
                              "posters": ["/a"], "wall": ["/a"], "backdrop": "/b"}]}]
        src = ROOT / "collections" / "collections.json"
        before = json.loads(src.read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "collections.json"
            shutil.copy(src, path)
            bo.write_collections(path, data)
            once = path.read_bytes()
            bo.write_collections(path, data)
            self.assertEqual(path.read_bytes(), once)
            after = json.loads(once)
        main = [c for c in before if c["id"] not in IDS]
        self.assertEqual(after[:len(main)], main)                      # les autres, intactes et devant
        c = after[-1]
        self.assertEqual((c["id"], c["title"]), ("decennies", "Décennies"))
        f = c["folders"][0]
        self.assertEqual(f["coverImageUrl"], f"{BRANCH}/decennies/decennie-80.jpg")
        self.assertEqual(f["focusGifUrl"], f"{BRANCH}/decennies/decennie-80.gif")
        self.assertEqual(f["heroBackdropUrl"], f"{BRANCH}/decennies/decennie-80-fond.jpg")
        self.assertEqual(f["heroVideoUrl"], f"{BRANCH}/decennies/decennie-80-fond.mp4")
        self.assertEqual(f["titleLogoUrl"], f"{BRANCH}/decennies/decennie-80-titre.png")   # nom sur l'écran ouvert
        self.assertTrue(f["hideTitle"])
        self.assertNotIn("posters", f)


class Laureats(unittest.TestCase):
    def test_deux_sources_reunies(self):
        """Prix noté sur le film (P166) ou sur le prix (P1346) : réunis, sans doublon, plus récents d'abord."""
        recu = [{"imdb": {"value": "tt1"}, "t": {"value": "1990-02-01T00:00:00Z"}}, {"imdb": {"value": "tt2"}}]
        liste = [{"imdb": {"value": "tt3"}, "t": {"value": "2020-02-01T00:00:00Z"}},
                 {"imdb": {"value": "tt1"}, "t": {"value": "1990-02-01T00:00:00Z"}}, {"t": {"value": "2000"}}]
        self.assertEqual(br.winners(recu, liste), [("tt3", 2020), ("tt1", 1990), ("tt2", 0)])

    def test_identifiants_des_prix(self):
        """Q900494 est le César du meilleur acteur : le meilleur film est Q645595. L'œuvre d'une personne récompensée
        (P1686) seulement pour les Césars (remis aux producteurs) : pour la Palme, elle ajoutait « Mask » (Cher)."""
        self.assertEqual(br.PRIZES, {"oscars": ("Q102427", False), "palmes": ("Q179808", False), "cesars": ("Q645595", True)})

    def test_personnes_ignorees(self):
        """César : souvent noté sur le producteur (« nm… ») ; seuls les films (« tt… ») comptent."""
        self.assertEqual(br.winners([{"imdb": {"value": "nm0536095"}}, {"imdb": {"value": "tt9"}}], []), [("tt9", 0)])


def fake_render(job, tile, wall, folder, leger=False):
    for name in mo.FILES:
        (folder / name.format(job["slug"])).write_bytes(b"leger" if leger else b"neuve")


class Fabrication(unittest.TestCase):
    """Les tuiles facultatives : en parties (tâches en parallèle), jamais de tuile grise, version légère de secours."""

    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(self.dir, ignore_errors=True))
        p = mock.patch.object(mo, "render", side_effect=fake_render)
        p.start()
        self.addCleanup(p.stop)
        self.jobs = mo.jobs()

    def test_parties_couvrent_tout(self):
        parts = [mo.part(self.jobs, i, 6) for i in range(1, 7)]
        slugs = [j["slug"] for p in parts for j in p]
        self.assertEqual(sorted(slugs), sorted(j["slug"] for j in self.jobs))
        self.assertEqual(len(slugs), len(set(slugs)))
        self.assertGreaterEqual(min(len(p) for p in parts), len(self.jobs) // 6)

    def test_une_partie_seulement_ses_tuiles(self):
        out = self.dir / "out"
        self.assertEqual(mo.main([str(out), "--part", "2/6"]), 0)
        made = {f.name for f in out.rglob("*.jpg") if not f.name.endswith("-fond.jpg")}
        self.assertEqual(made, {f"{j['slug']}.jpg" for j in mo.part(self.jobs, 2, 6)})

    def test_panne_reprend_les_images_d_avant(self):
        avant = self.dir / "avant"
        job = mo.part(self.jobs, 1, 6)[0]
        (avant / job["family"]).mkdir(parents=True)
        for name in mo.FILES:
            (avant / job["family"] / name.format(job["slug"])).write_bytes(b"ancienne")
        def render(j, tile, wall, folder, leger=False):
            if j["slug"] == job["slug"]:
                raise RuntimeError("gifski")
            fake_render(j, tile, wall, folder, leger)
        out = self.dir / "out"
        with mock.patch.object(mo, "render", side_effect=render):
            self.assertEqual(mo.main([str(out), "--part", "1/6", "--avant", str(avant)]), 3)
        self.assertEqual((out / job["family"] / f"{job['slug']}.gif").read_bytes(), b"ancienne")

    def test_sans_images_d_avant_signale(self):
        job = mo.part(self.jobs, 1, 6)[0]
        def render(j, tile, wall, folder, leger=False):
            if j["slug"] == job["slug"]:
                raise RuntimeError("gifski")
            fake_render(j, tile, wall, folder, leger)
        out = self.dir / "out"
        with mock.patch.object(mo, "render", side_effect=render):
            self.assertEqual(mo.main([str(out), "--part", "1/6"]), 2)
        # Les autres tuiles de la partie sont là quand même (une seule grise, pas toutes).
        other = mo.part(self.jobs, 1, 6)[1]
        self.assertEqual((out / other["family"] / f"{other['slug']}.jpg").read_bytes(), b"neuve")

    def test_logo_d_une_chaine_est_son_nom(self):
        """Les logos TMDB des chaînes sont des icônes d'appli (france.tv : « prime video channels ») : le nom en blanc."""
        logo = mo.channel_logo("france.tv")
        self.assertEqual(logo.mode, "RGBA")
        self.assertGreater(logo.getchannel("A").getbbox()[2], 50)
        opaque = [px[:3] for px in logo.getdata() if px[3] > 200]
        self.assertTrue(opaque and all(rgb == (255, 255, 255) for rgb in opaque))

    def test_version_legere(self):
        out = self.dir / "out"
        self.assertEqual(mo.main([str(out), "--part", "3/6", "--leger"]), 0)
        self.assertTrue(all(f.read_bytes() == b"leger" for f in out.rglob("*.gif")))


if __name__ == "__main__":
    unittest.main()
