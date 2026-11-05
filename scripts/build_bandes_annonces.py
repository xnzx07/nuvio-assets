"""Bandes-annonces en VF, préparées la nuit par l'API YouTube officielle (data/bandes-annonces-vf.json, lu par l'addon).

Avant, l'addon lisait en direct la page d'AlloCiné puis la page de recherche de YouTube à l'ouverture d'une fiche : deux
lectures que leurs conditions interdisent, et YouTube bloquait souvent (« pas un robot », pause de 10 minutes). Ici,
seulement l'API YouTube Data v3 (clé gratuite, 10 000 unités par jour) :
1. Les titres : ceux des rangées de l'addon (addon/catalog, refaites cette nuit), l'accueil d'abord. Ceux dont TMDB a
   déjà une bande-annonce VF sont laissés de côté (l'addon la prend chez TMDB) ; TMDB revu tous les REVOIR_TMDB jours.
2. Les vidéos des chaînes françaises des distributeurs et des plateformes (CHAINES), lues en entier chaque nuit :
   1 unité pour 50 vidéos (~1 300 unités).
3. Pour les titres encore sans VF, les plus en vue d'abord : une recherche YouTube (compteur à part, 100 par jour,
   RECHERCHES gardées), refaite au plus tous les REVOIR_RECHERCHE jours.
4. Une vidéo convient si son titre dit VF (pas VOST), bande-annonce ou teaser, nomme l'œuvre, et pour la bonne année
   (les règles qu'avait l'addon). Les vidéos gardées sont revérifiées chaque nuit (supprimées, privées : retirées).

data/bandes-annonces-vf.json : { "maj", "source", "titres": { "movie:tt…": { "k": id YouTube, "t": titre, "hd" } } }.
data/bandes-annonces-suivi.json : { "tmdb": { clé: [jour, VF chez TMDB, fin de diffusion] }, "cherche": { clé: jour } }.
Exécuté chaque nuit par GitHub Actions (addon.yml, secrets YOUTUBE_API_KEY et TMDB_API_KEY). Sans clé YouTube : rien.
"""
import datetime as dt
import glob
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from update_addon import tmdb  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "bandes-annonces-vf.json"
SUIVI = ROOT / "data" / "bandes-annonces-suivi.json"
IMDB_CACHE = ROOT / "data" / "imdb_cache.json"
API = "https://www.googleapis.com/youtube/v3"
RECHERCHES = 90
UNITES_MAX = 8000          # garde de la marge sur les 10 000 unités du jour
# Chaînes qui reprennent les bandes-annonces de tous les distributeurs : l'année reste exigée dans le titre.
REPRISES = {"UC_i8X3p8oZNaik8X513Zn1Q"}
# Chaînes des plateformes : une série sans année ni saison dans le titre n'est acceptée que d'elles (celles des studios
# de cinéma publient surtout des films : « Les Gardiens de la Galaxie » de Marvel n'est pas la série animée).
PLATEFORMES = {"UCroNr00O68n25IqSNapMK8w", "UC4YtyYW5RpGBgQqChMyjfIg", "UCfrLPVjIxAJzNFu_TsevXVw", "UCdyJtenRnSPnmcUq8FtSPHg",
               "UCrZ9ku2VGO3DoaCZBPymlcw", "UCb4UAZwZqS4a35FrBcLlMXA", "UCh4o9ioiqbUveUrCLP8Wv6A", "UCf2L21tpe1P-Y4QjOXkCIvQ",
               "UCguBmD8D2uN6Sn6Ch-cVk_g"}
REVOIR_TMDB = 30
REVOIR_RECHERCHE = 30
# Chaînes YouTube officielles en France (distributeurs, plateformes, FilmsActu qui reprend leurs bandes-annonces).
CHAINES = {
    "UCZ0o1IeuSSceEixZbSATWtw": "Warner Bros. France", "UChbOoefuXz17nioY3sgvZxQ": "Universal Pictures France",
    "UC2I1RkNIDzTCAWB8M7BbAQw": "Sony Pictures France", "UCakQLdwrxuo0KhJ49Sq2csA": "Disney FR",
    "UCmLpWGO9eyDugKPxLSYW3kQ": "20th Century Studios FR", "UCWeGmNiIrrqcDYdLh9sjVDg": "Marvel FR",
    "UCGZne2t_gD1huYFdv9mR5Gw": "Paramount France", "UCGVrjz7s7ui-c4BHZ155Ylg": "Pathé",
    "UCKnyzIyfL5Zj7cHhcC6bTyg": "Gaumont", "UCCKPoUe4nvn6H-HaoY2UM0g": "STUDIOCANAL France",
    "UCHzqRMGxW953fchyYhteCfw": "SND", "UCl01THIfTUqU2lMVgNG7mBQ": "Metropolitan Films",
    "UCY6zLKMdauZgU8BvqQipKcg": "Wild Bunch", "UCaZUvpMg89m1ZesJ_Hx30dA": "Mars Films",
    "UCIMVZBs4uegC9eM-CqGSlfA": "UGC Distribution", "UCZ-TP7kN2zasu9f_ORRXUfw": "Bac Films",
    "UCf9ebFD0v4xJNTshVXZOycw": "Apollo Films", "UCT4EwnjIB8Iclg0TbsdD53w": "ARP Sélection",
    "UCXmtohIiPCcbW0OJsEYYMpg": "The Jokers", "UCroNr00O68n25IqSNapMK8w": "Netflix France",
    "UC4YtyYW5RpGBgQqChMyjfIg": "Prime Video France", "UCfrLPVjIxAJzNFu_TsevXVw": "Disney+ FR",
    "UCdyJtenRnSPnmcUq8FtSPHg": "Paramount+ France", "UCrZ9ku2VGO3DoaCZBPymlcw": "HBO Max France",
    "UCb4UAZwZqS4a35FrBcLlMXA": "CANAL+", "UCh4o9ioiqbUveUrCLP8Wv6A": "france.tv",
    "UCf2L21tpe1P-Y4QjOXkCIvQ": "Crunchyroll FR", "UCguBmD8D2uN6Sn6Ch-cVk_g": "ADN",
    "UC_i8X3p8oZNaik8X513Zn1Q": "FilmsActu",
}
# Mots permis avant le nom de l'œuvre dans le titre de la vidéo (« Bande-annonce VF : Dune ») : ceux de l'addon.
TRAILER_WORDS = set("bande annonce d trailer teaser vf officielle officiel nouvelle new la le les l fx netflix disney "
                    "prime video apple tv hbo max canal paramount".split())
# Le mot qui suit le nom de l'œuvre : un de ceux-là (ou une année, ou rien). Sinon c'est une autre œuvre de la même
# famille : « Jumanji : Next Level », « Godzilla x Kong », « Dune 2 », « Les Bisounours et les Cousinours ».
APRES_LE_NOM = set("bande ba trailer teaser vf officielle officiel nouvelle new saison season version en final finale "
                   "netflix disney prime apple hbo max canal paramount".split())
unites = 0


def norm(s: str) -> str:
    """Comme l'addon (worker/search.js) : minuscules, sans accents ni ponctuation, « & » = « and »."""
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c)).replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def convient(titre: str, nom: str, annee: int | None, serie: bool, officielle: bool | str = False, publiee: str = "",
             fin: int | None = None) -> bool:
    """Le titre d'une vidéo est-il celui d'une bande-annonce VF de l'œuvre ? Les règles qu'avait l'addon (youtubeVf),
    resserrées après le premier passage :
    - le mot qui suit le nom de l'œuvre dit bande-annonce, VF, saison… (« Jumanji : Next Level » n'est pas « Jumanji ») ;
    - année du titre : celle du film (±1), ou entre la première et la dernière année de la série (fin ; None : encore
      diffusée) : le remake de Netflix n'est pas « Perdus dans l'espace » de 1965 ;
    - sans année dans le titre, la date de publication (publiee : « 2021-06-01… ») en tient lieu : à 2 ans près pour un
      film d'une chaîne officielle (officielle : True, ou « plateforme ») ; pendant sa diffusion pour une série qui dit sa
      saison, ou venue d'une plateforme."""
    t = norm(titre)
    want = f" {norm(nom)} "
    if (not re.search(r"\bvf\b|version francaise", t) or re.search(r"\bvost", t)
            or not re.search(r"\b(bande d? ?annonce|ba|trailer|teaser|nouvelle saison)\b", t) or want not in f" {t} "):
        return False
    suite = f" {t} "[f" {t} ".index(want) + len(want):].split()
    if suite and suite[0] not in APRES_LE_NOM and not re.fullmatch(r"(?:19|20)\d\d", suite[0]):
        return False
    if not annee:
        return True
    avant = f" {t} "[:f" {t} ".index(want)].split()
    if any(w not in TRAILER_WORDS for w in avant):
        return False
    annees = [int(x) for x in re.findall(r"\b(?:19|20)\d\d\b", t)]
    mots_serie = bool(re.search(r"\b(saison|season|serie|series|episode)\b", t))
    if (re.search(r"\b(film|cinema|movie)\b", t) if serie else mots_serie):
        return False
    derniere = ((fin + 1) if fin else dt.date.today().year + 1) if serie else annee + 1
    if annees:
        if serie:
            return any(n == annee or (mots_serie and annee < n <= derniere) for n in annees)
        return any(abs(n - annee) <= 1 for n in annees)
    pub = int(publiee[:4]) if publiee[:4].isdigit() else None
    if pub is None:
        return False
    if serie:
        return annee - 2 <= pub <= derniere and (mots_serie or officielle == "plateforme")
    return bool(officielle) and annee - 2 <= pub <= annee + 2


def rang(titre: str) -> int:
    """Une bande-annonce avant un teaser ou une annonce de saison."""
    t = norm(titre)
    return 0 if re.search(r"\b(bande d? ?annonce|trailer)\b", t) and not re.search(r"\bteaser\b", t) else 1


def yt(chemin: str, cout: int = 1, **params) -> dict:
    global unites
    unites += cout
    q = urllib.parse.urlencode({**params, "key": os.environ["YOUTUBE_API_KEY"]})
    with urllib.request.urlopen(f"{API}/{chemin}?{q}", timeout=30) as r:
        return json.load(r)


def videos_des_chaines() -> list[tuple[str, str, str, bool]]:
    """(id, titre, publiée le, officielle) de toutes les vidéos des CHAINES (la liste « uploads » de chacune)."""
    out = []
    for cid, nom in CHAINES.items():
        jeton, n = None, 0
        while unites < UNITES_MAX:
            p = {"part": "snippet", "playlistId": "UU" + cid[2:], "maxResults": 50}
            if jeton:
                p["pageToken"] = jeton
            d = None
            for essai in range(3):      # YouTube répond parfois 500 en passant : deux nouveaux essais
                try:
                    d = yt("playlistItems", **p)
                    break
                except urllib.error.HTTPError as e:
                    if e.code < 500 or essai == 2:
                        print(f"{nom} : erreur {e.code}", file=sys.stderr)
                        break
                    time.sleep(5 * (essai + 1))
            if d is None:
                break
            for it in d.get("items", []):
                s = it["snippet"]
                vid = (s.get("resourceId") or {}).get("videoId")
                if vid and s.get("title") not in ("Private video", "Deleted video"):
                    sorte = "plateforme" if cid in PLATEFORMES else cid not in REPRISES
                    out.append((vid, s["title"], s.get("publishedAt", ""), sorte))
                    n += 1
            jeton = d.get("nextPageToken")
            if not jeton:
                break
        print(f"{nom} : {n} vidéos")
    return out


class Index:
    """Vidéos VF candidates, retrouvées par les mots de leur titre."""
    def __init__(self, videos):
        self.videos = [v for v in videos if re.search(r"\bvf\b|version francaise", norm(v[1])) and not re.search(r"\bvost", norm(v[1]))]
        self.par_mot = {}
        for i, v in enumerate(self.videos):
            titre = v[1]
            for w in set(norm(titre).split()):
                self.par_mot.setdefault(w, set()).add(i)

    def chercher(self, nom: str, annee: int | None, serie: bool, fin: int | None = None):
        mots = norm(nom).split()
        if not mots:
            return None
        ids = set.intersection(*[self.par_mot.get(w, set()) for w in mots])
        bons = [v for v in (self.videos[i] for i in ids) if convient(v[1], nom, annee, serie, v[3] if len(v) > 3 else False, v[2], fin)]
        # La plus récente des bandes-annonces (les teasers ensuite).
        bons.sort(key=lambda v: (rang(v[1]), -int(re.sub(r"\D", "", v[2])[:14] or 0)))
        return bons[0] if bons else None


def titres_des_rangees() -> list[dict]:
    """Les titres des rangées de l'addon, ceux de l'accueil d'abord : { cle, type, imdb, nom, annee }."""
    fichiers = sorted(glob.glob(str(ROOT / "addon" / "catalog" / "**" / "*.json"), recursive=True),
                      key=lambda f: (not Path(f).name.startswith("accueil-"), f))
    vus, out = set(), []
    for f in fichiers:
        try:
            metas = json.loads(Path(f).read_text(encoding="utf-8")).get("metas") or []
        except ValueError:
            continue
        for m in metas:
            cle = f"{m.get('type')}:{m.get('id')}"
            if cle in vus or not str(m.get("id", "")).startswith("tt") or m.get("type") not in ("movie", "series"):
                continue
            vus.add(cle)
            an = re.match(r"\d{4}", str(m.get("releaseInfo") or ""))
            out.append({"cle": cle, "type": m["type"], "imdb": m["id"], "nom": m.get("name") or "",
                        "annee": int(an.group()) if an else None})
    return out


def vf_chez_tmdb(t: dict, tmdb_ids: dict) -> tuple[bool, int | None]:
    """(TMDB a-t-il une bande-annonce VF, pas VOST, sur YouTube ? l'addon la prend alors chez lui ; dernière année de
    diffusion d'une série terminée, None sinon). Un seul appel : la fiche avec ses vidéos."""
    tid = tmdb_ids.get(t["cle"])
    if not tid:
        r = tmdb(f"/find/{t['imdb']}", external_source="imdb_id")
        hit = (r.get("movie_results" if t["type"] == "movie" else "tv_results") or [{}])[0]
        tid = hit.get("id")
    if not tid:
        return False, None
    d = tmdb(f"/{'movie' if t['type'] == 'movie' else 'tv'}/{tid}", append_to_response="videos")
    vids = (d.get("videos") or {}).get("results") or []
    fin = None
    if t["type"] == "series" and d.get("status") in ("Ended", "Canceled") and (d.get("last_air_date") or "")[:4].isdigit():
        fin = int(d["last_air_date"][:4])
    return any(v.get("site") == "YouTube" and v.get("type") in ("Trailer", "Teaser") and v.get("iso_639_1") == "fr"
               and not re.search(r"\bVOST", v.get("name") or "", re.I) for v in vids), fin


def hd(vid: str) -> bool:
    """YouTube n'a l'image « maxresdefault » que pour les vidéos d'au moins 720p."""
    try:
        req = urllib.request.Request(f"https://i.ytimg.com/vi/{vid}/maxresdefault.jpg", method="HEAD")
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status == 200
    except (urllib.error.URLError, TimeoutError):
        return False


def encore_en_ligne(ids: list[str]) -> set[str]:
    """Les vidéos qui existent encore, publiques et intégrables (videos.list, 50 par appel)."""
    ok = set()
    for i in range(0, len(ids), 50):
        d = yt("videos", part="status", id=",".join(ids[i:i + 50]), maxResults=50)
        ok |= {v["id"] for v in d.get("items", [])
               if v["status"].get("privacyStatus") == "public" and v["status"].get("embeddable", True)}
    return ok


def main() -> None:
    if not os.environ.get("YOUTUBE_API_KEY"):
        print("Pas de clé YouTube (YOUTUBE_API_KEY) : rien à faire.")
        return
    jour = dt.date.today()
    suivi = json.loads(SUIVI.read_text(encoding="utf-8")) if SUIVI.exists() else {}
    deja = json.loads(OUT.read_text(encoding="utf-8")).get("titres", {}) if OUT.exists() else {}
    vu_tmdb, cherche = suivi.setdefault("tmdb", {}), suivi.setdefault("cherche", {})
    code = 0

    # 1. Les titres, sans ceux qui ont déjà une VF chez TMDB.
    titres = titres_des_rangees()
    cache = json.loads(IMDB_CACHE.read_text(encoding="utf-8")) if IMDB_CACHE.exists() else {}
    tmdb_ids = {f"{k.split(':')[0]}:{v}": int(k.split(":")[1]) for k, v in cache.items()
                if isinstance(v, str) and v.startswith("tt") and k.split(":")[1].isdigit()}

    def a_revoir(t):
        x = vu_tmdb.get(t["cle"])
        return not x or len(x) < 3 or (dt.date.fromisoformat(x[0]) + dt.timedelta(days=REVOIR_TMDB * (3 if x[1] else 1))) <= jour
    revoir = [t for t in titres if a_revoir(t)]
    with ThreadPoolExecutor(8) as ex:
        for t, (vf, fin) in zip(revoir, ex.map(lambda t: vf_chez_tmdb(t, tmdb_ids), revoir)):
            vu_tmdb[t["cle"]] = [jour.isoformat(), vf, fin]
    a_trouver = [t for t in titres if not vu_tmdb[t["cle"]][1]]
    print(f"{len(titres)} titres, {len(revoir)} relus chez TMDB, {len(a_trouver)} sans VF chez TMDB")

    # 2. Les vidéos des chaînes officielles.
    trouves = {}
    try:
        index = Index(videos_des_chaines())
        for t in a_trouver:
            serie, fin = t["type"] == "series", vu_tmdb[t["cle"]][2] if len(vu_tmdb[t["cle"]]) > 2 else None
            # Le nom entier : sans son sous-titre, « La casa de papel : Le phénomène » prendrait celle de la série.
            v = index.chercher(t["nom"], t["annee"], serie, fin)
            if v:
                trouves[t["cle"]] = {"k": v[0], "t": v[1]}
        print(f"chaînes : {len(index.videos)} vidéos en VF, {len(trouves)} titres trouvés ({unites} unités)")
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        print(f"chaînes YouTube : panne ({e})", file=sys.stderr)
        code = 1

    # 3. Recherches pour les titres encore sans VF, les plus en vue d'abord.
    faites = 0
    for t in a_trouver:
        if faites >= RECHERCHES or t["cle"] in trouves or t["cle"] in deja:
            continue
        c = cherche.get(t["cle"])
        if c and dt.date.fromisoformat(c) + dt.timedelta(days=REVOIR_RECHERCHE) > jour:
            continue
        serie = t["type"] == "series"
        q = f"{t['nom']} {'série ' if serie else ''}bande annonce VF {t['annee'] or ''}".strip()
        try:
            d = yt("search", cout=0, part="snippet", q=q, type="video", maxResults=10, regionCode="FR", relevanceLanguage="fr")
        except urllib.error.HTTPError as e:
            print(f"recherche YouTube : erreur {e.code} (quota du jour ?)", file=sys.stderr)
            break
        faites += 1
        cherche[t["cle"]] = jour.isoformat()
        for it in d.get("items", []):
            titre = it["snippet"]["title"].replace("&#39;", "'").replace("&quot;", '"').replace("&amp;", "&")
            cid = it["snippet"].get("channelId")
            officielle = "plateforme" if cid in PLATEFORMES else (cid in CHAINES and cid not in REPRISES)
            fin = vu_tmdb[t["cle"]][2] if len(vu_tmdb[t["cle"]]) > 2 else None
            if convient(titre, t["nom"], t["annee"], serie, officielle, it["snippet"].get("publishedAt", ""), fin):
                trouves[t["cle"]] = {"k": it["id"]["videoId"], "t": titre}
                break
    print(f"recherches : {faites}, {sum(1 for k in trouves if k in cherche and cherche[k] == jour.isoformat())} trouvées")

    # 4. Garder les anciennes encore en ligne, ajouter les nouvelles (avec leur définition).
    titres_vus = {t["cle"] for t in titres}
    garde = {k: v for k, v in deja.items() if k in titres_vus and not vu_tmdb.get(k, [0, False])[1]}
    try:
        en_ligne = encore_en_ligne(sorted({v["k"] for v in garde.values()}))
        garde = {k: v for k, v in garde.items() if v["k"] in en_ligne}
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        print(f"vérification des vidéos : panne ({e}), toutes gardées", file=sys.stderr)
    nouveaux = {k: v for k, v in trouves.items() if garde.get(k, {}).get("k") != v["k"]}
    with ThreadPoolExecutor(8) as ex:
        for (k, v), h in zip(nouveaux.items(), ex.map(lambda v: hd(v["k"]), nouveaux.values())):
            garde[k] = {**v, "hd": h}
    for k, v in trouves.items():
        garde.setdefault(k, {**v, "hd": True})

    OUT.write_text(json.dumps({"maj": jour.isoformat(), "source": "YouTube (API officielle)",
                               "titres": dict(sorted(garde.items()))}, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    suivi["tmdb"] = {k: v for k, v in vu_tmdb.items() if k in titres_vus}
    suivi["cherche"] = {k: v for k, v in cherche.items() if k in titres_vus}
    SUIVI.write_text(json.dumps(suivi, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8")
    print(f"{len(garde)} titres avec une bande-annonce VF de YouTube ({unites} unités)")
    sys.exit(code)


if __name__ == "__main__":
    main()
