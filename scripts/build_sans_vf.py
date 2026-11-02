"""Les vieux films sans VF (data/sans-vf.json, lu par l'addon et le service d'affiches : « SANS VF » en noir et blanc).

Bad Genius (2017, thaïlandais) n'a pas de VF et n'en aura sans doute jamais, mais passait pour disponible : les sources
ne sont lues que pour les films récents. Une seule règle, car un film marqué à tort coûte plus cher qu'un film oublié :
un film n'entre dans la liste que si tout le dit, deux fois :

1. Candidats : films de plus d'un an, ni français ni anglais, assez connus (VOTES_MIN), les plus populaires d'abord.
2. Aucune plateforme en France, même en location ou à l'achat (TMDB) : sinon le film a peut-être une VF, on ne l'examine
   pas (revu dans REVOIR_DOUTE jours).
3. L'avis de l'addon (/sans-vf/avis, worker/index.js) : Torrentio, Lumio et StreamFusion ont vu des sources et les ont
   toutes écartées. « vf » : gardé tel quel pour toujours. « doute » : revu dans REVOIR_DOUTE jours. Ces demandes passent
   par le compte AllDebrid de la personne : plafond à part, 15 films par nuit (SANSVF_PLAFOND).
4. « non » deux fois, à CONFIRMER_JOURS jours d'écart au moins (un site français en panne le jour de la première lecture
   ne suffit pas) : le film entre dans la liste. Revu tous les REVOIR_NON jours : le moindre doute, une plateforme ou
   une VF l'en retire.

data/sans-vf.json : { "maj", "films": [tt…] }. data/sans-vf-suivi.json : { tt…: { "id", "e", "j", "n" } } : où en est
chaque film (e : etat, j : dernier examen, n : « non » d'affilée). Exécuté chaque nuit par GitHub Actions (secret
TMDB_API_KEY, dont l'addon tire aussi la clé de /sans-vf/avis). Une panne ne change rien aux films déjà lus : le suivi est
écrit avec ce qui a été lu.
"""
import datetime as dt
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "sans-vf.json"
SUIVI = ROOT / "data" / "sans-vf-suivi.json"
ADDON = "https://nuvio-assets.xnzxflix.workers.dev"
AGENT = "catalogue-fr-nuit"
TMDB = "https://api.themoviedb.org/3"
LANGUES = "ko|ja|zh|cn|th|hi|ta|te|ml|tr|es|pt|it|de|ru|fa|id|vi|tl|ar|sv|da|no|pl|nl"
VOTES_MIN = 30
PAGES_MAX = 15
AVIS_MAX = 40            # appels à l'addon par nuit, Torrentio seul compris
CONFIRMER_JOURS = 2
REVOIR_DOUTE = 30
REVOIR_NON = 60


def _json(req, essais=3):
    for essai in range(essais):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except (urllib.error.URLError, TimeoutError, ValueError):
            if essai == essais - 1:
                raise
            time.sleep(2 * (essai + 1))


def tmdb(chemin, **params):
    params["api_key"] = os.environ["TMDB_API_KEY"]
    return _json(f"{TMDB}{chemin}?{urllib.parse.urlencode(params)}")


def cle_interne():
    """La clé des appels internes de l'addon (worker/index.js : triCle), tirée de la clé TMDB."""
    return hashlib.sha256(f"tri:{os.environ['TMDB_API_KEY']}".encode()).hexdigest()[:24]


def avis_addon(imdb):
    req = urllib.request.Request(f"{ADDON}/sans-vf/avis", data=json.dumps({"imdb": imdb}).encode(), method="POST",
                                 # Sans lui, Cloudflare répond 403 (erreur 1010) à l'en-tête par défaut de Python-urllib.
                                 headers={"Content-Type": "application/json", "x-tri": cle_interne(), "User-Agent": AGENT})
    return _json(req, essais=1)


def a_revoir(suivi, jour):
    """Les films déjà suivis dont le prochain examen est arrivé, les confirmations d'abord. Jamais un film en VF."""
    def ecart(x):
        return (dt.date.fromisoformat(jour) - dt.date.fromisoformat(x["j"])).days

    confirmer = [t for t, x in suivi.items() if x["e"] == "non" and x["n"] == 1 and ecart(x) >= CONFIRMER_JOURS]
    non = [t for t, x in suivi.items() if x["e"] == "non" and x["n"] >= 2 and ecart(x) >= REVOIR_NON]
    doute = [t for t, x in suivi.items() if x["e"] in ("doute", "plateforme") and ecart(x) >= REVOIR_DOUTE]
    return confirmer + non + doute


def noter(suivi, imdb, tmdb_id, etat, jour):
    """L'état d'un film après son examen. Un « non » ne compte que s'il suit un autre « non »."""
    avant = suivi.get(imdb, {})
    n = avant.get("n", 0) + 1 if etat == "non" and avant.get("e") == "non" else 1 if etat == "non" else 0
    suivi[imdb] = {"id": tmdb_id, "e": etat, "j": jour, "n": n}


def films_de(suivi):
    """La liste : deux « non » d'affilée, rien d'autre."""
    return sorted(t for t, x in suivi.items() if x["e"] == "non" and x["n"] >= 2)


def plateforme_en_france(fiche):
    fr = (fiche.get("watch/providers") or {}).get("results", {}).get("FR") or {}
    return any(fr.get(k) for k in ("flatrate", "free", "ads", "rent", "buy"))


def nouveaux(suivi, jour):
    """Les films pas encore suivis, du plus populaire au moins populaire (itérateur : lus au fur et à mesure)."""
    limite = (dt.date.fromisoformat(jour) - dt.timedelta(days=365)).isoformat()
    vus = {x["id"] for x in suivi.values()}
    for page in range(1, PAGES_MAX + 1):
        d = tmdb("/discover/movie", with_original_language=LANGUES, sort_by="popularity.desc", page=page,
                 **{"vote_count.gte": VOTES_MIN, "primary_release_date.lte": limite})
        for it in d.get("results", []):
            if it["id"] not in vus:
                yield it["id"]
        if page >= d.get("total_pages", 0):
            return


def examiner(suivi, imdb, tmdb_id, fiche, jour):
    """Un film examiné. False : le plafond de la nuit est atteint, rien n'a été noté."""
    if plateforme_en_france(fiche):
        noter(suivi, imdb, tmdb_id, "plateforme", jour)
        return True
    avis = avis_addon(imdb)
    if avis.get("plafond"):
        return False
    noter(suivi, imdb, tmdb_id, avis.get("etat") if avis.get("etat") in ("non", "vf") else "doute", jour)
    return True


def fiche_de(tmdb_id):
    return tmdb(f"/movie/{tmdb_id}", append_to_response="external_ids,watch/providers")


def passer(suivi, jour):
    appels = 0
    # Les films déjà suivis d'abord : confirmer une lecture, ou retirer de la liste un film qui a changé.
    for imdb in a_revoir(suivi, jour):
        if appels >= AVIS_MAX:
            return
        appels += 1
        if not examiner(suivi, imdb, suivi[imdb]["id"], fiche_de(suivi[imdb]["id"]), jour):
            return
    for tmdb_id in nouveaux(suivi, jour):
        if appels >= AVIS_MAX:
            return
        fiche = fiche_de(tmdb_id)
        imdb = (fiche.get("external_ids") or {}).get("imdb_id")
        if not imdb:
            continue
        appels += 1
        if not examiner(suivi, imdb, tmdb_id, fiche, jour):
            return


def main():
    jour = dt.date.today().isoformat()
    suivi = json.loads(SUIVI.read_text(encoding="utf-8")) if SUIVI.exists() else {}
    code = 0
    try:
        passer(suivi, jour)
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        print(f"Panne, le reste attendra demain : {e}", file=sys.stderr)
        code = 1
    SUIVI.write_text(json.dumps(suivi, indent=0, sort_keys=True) + "\n", encoding="utf-8")
    films = films_de(suivi)
    avant = json.loads(OUT.read_text(encoding="utf-8")).get("films") if OUT.exists() else None
    if films != avant:
        OUT.write_text(json.dumps({"maj": jour, "films": films}, indent=0) + "\n", encoding="utf-8")
    print(f"{len(suivi)} films suivis, {len(films)} sans VF.")
    return code


if __name__ == "__main__":
    sys.exit(main())
