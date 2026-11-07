"""Fenêtres salle → sortie numérique des distributeurs américains, et estimations des films sans date
(data/estimations-vod.json, lu par l'addon et le service d'affiches : dispoChezSoi).

Un film arrive chez soi le jour de sa sortie numérique aux États-Unis (Premium VOD). Tant qu'elle n'est pas
annoncée, l'addon l'estimait à la salle américaine + 45 jours pour tout le monde. Or chaque distributeur a son
habitude : Universal sort ses films en numérique 17 à 31 jours après la salle, Disney deux mois plus tard, Vertical
(The Weight : salle le 18 sept., numérique le 20 oct.) un mois. On mesure donc chaque nuit cette fenêtre :

1. Apprentissage : films sortis en salle aux États-Unis (types TMDB 2 ou 3 ; pas les avant-premières, type 1) il y a
   120 jours à 2 ans, assez connus (VOTES_MIN), et déjà sortis en numérique aux États-Unis (type 4). Fenêtre =
   numérique − première salle, en jours ; écartée si négative ou de plus de 200 jours (ressortie, date fausse), et
   aussi sous 7 jours : une sortie simultanée (salle et location le même jour, fréquente chez Vertical ou Lionsgate)
   a sa date numérique annoncée d'emblée, ce film-là ne sera jamais à estimer. Pas les 120 derniers jours : seuls les
   films aux fenêtres courtes y ont déjà leur date, la médiane serait faussée.
2. Distributeur américain d'après Wikidata (« distribué par », P750, sur la fiche qui porte l'identifiant IMDb, P345) :
   d'abord une déclaration pour les États-Unis (qualificatif pays Q30), sinon un distributeur américain, sinon un
   distributeur sans pays ; jamais une plateforme (Netflix, Disney+…) ni une sortie autre qu'en salle. Les marques
   d'un même studio comptent ensemble (Columbia et Screen Gems avec Sony…). Sans distributeur sur Wikidata : les
   sociétés de production TMDB, quand l'une est un distributeur connu (A24 produit et distribue).
3. Par distributeur : médiane et nombre de films ; une médiane générale pour tous. Moins de FILMS_MIN films mesurés :
   la fenêtre par défaut (DEFAUTS, ce qu'on sait des habitudes du studio), sinon la médiane générale.
4. Estimations : films sortis en salle aux États-Unis il y a moins de 150 jours ou dans les 90 prochains, sans sortie
   numérique américaine annoncée : salle + la fenêtre de son distributeur. Un film déjà en salle depuis N jours sans
   date annoncée a forcément une fenêtre plus longue que N : on prend alors la médiane des fenêtres mesurées plus
   longues que N (Resident Evil, Sony : 32 jours d'habitude, mais déjà 34 jours en salle sans date). Un film sans
   distributeur connu n'est écrit que dans ce cas : sinon l'addon prend la salle + la médiane générale du fichier.

Écrit { "maj", "mediane", "mesures", "fenetres": { QID: { nom, jours, films, source } }, "films": { tt…: { date,
distributeur, jours } } }. Exécuté chaque nuit par GitHub Actions (secret TMDB_API_KEY). Une panne (TMDB, Wikidata)
ou un apprentissage trop maigre ne remplace jamais le fichier de la veille : code de sortie 1, fichier inchangé.
"""
import datetime as dt
import http.client
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dates_numeriques import date_annoncee  # noqa: E402
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "estimations-vod.json"
KEY = os.environ.get("TMDB_API_KEY", "").strip()
TODAY = dt.datetime.now(ZoneInfo("Europe/Paris")).date()

APPRENTISSAGE_JOURS = 730   # films sortis en salle aux États-Unis ces 2 dernières années…
RECUL_JOURS = 120           # … sauf les 120 derniers jours (voir 1. ci-dessus)
VOTES_MIN = 20              # assez connus : leurs dates TMDB sont tenues à jour
FENETRE_MIN = 7             # en deçà : sortie simultanée, date numérique connue d'avance (voir 1. ci-dessus)
FENETRE_MAX = 200           # au-delà : ressortie ou date fausse, pas une fenêtre
FILMS_MIN = 4               # films mesurés pour qu'une médiane de distributeur l'emporte sur la valeur par défaut
PLUS_LONGUES_MIN = 3        # fenêtres plus longues que le temps déjà passé en salle, pour en prendre la médiane…
PLUS_LONGUES_PART = 0.1     # … et au moins un film sur dix (au-delà, TMDB a plus sûrement manqué la date)
ESTIM_AVANT, ESTIM_APRES = 150, 90   # films à estimer : salle américaine entre J-150 et J+90
ESTIM_PAGES = 20            # 400 films les plus populaires de cette période au plus
MESURES_MIN = 150           # garde-fou : un apprentissage plus maigre (panne partielle) n'est pas écrit…
PART_MIN = 0.6              # … ni un apprentissage de moins de 60 % du précédent
ESTIMATIONS_MIN = 10        # … ni moins de 10 films estimés
SECOURS_JOURS = 45          # médiane générale sans aucune mesure (jamais écrite : garde-fou ci-dessus)

WIKIDATA = "https://query.wikidata.org/sparql"
# Comme WIKI_HEADERS dans worker/index.js : Wikidata demande un User-Agent qui dit qui appelle.
WIKI_HEADERS = {"User-Agent": "CatalogueFR/1.0 (+https://github.com/xnzx07/nuvio-assets)",
                "Accept": "application/sparql-results+json"}
WIKI_LOT = 150              # identifiants IMDb par requête
WIKI_PAUSE_S = 1.0          # entre deux requêtes : Wikidata est un service partagé
USA = "Q30"
EN_SALLE = "Q47544021"      # « sortie en salle » (qualificatif « mode de distribution », P437)
# Plateformes et services en ligne (nature de l'élément, P31) : distribuer sur Netflix n'est pas sortir en salle.
PLATEFORMES = {"Q59152282", "Q63241860", "Q723685", "Q1668024"}
# Distributeurs qui ne sortent pas les films en salle (vidéo, chaînes, plateformes sans nature P31 ci-dessus).
PAS_EN_SALLE = {
    "Q907311", "Q116452644",  # Netflix
    "Q4740856",               # Amazon Prime Video
    "Q54958752",              # Disney+
    "Q62446736",              # Apple TV
    "Q1630304",               # Hulu
    "Q65359104", "Q23633",    # HBO Max, HBO
    "Q27903045",              # Paramount+
    "Q515869",                # Starz
    "Q28137015",              # Shudder
    "Q21189826", "Q866",      # Tubi, YouTube
    "Q8043977", "Q5371838",   # Xfinity Streampix, Fandango
    "Q7135332", "Q4005797", "Q2084961",   # éditions vidéo de Paramount, Universal, 20th Century
}

# Marques d'un même studio, comptées ensemble (sa fenêtre est une décision du studio).
MARQUES = {
    "Q126399": "Q8016302", "Q79202": "Q8016302",        # Warner Bros. Entertainment, New Line → Warner Bros.
    "Q822314": "Q40266137", "Q2065128": "Q40266137",    # Sony Pictures, Sony Pictures Motion Picture Group → Sony
    "Q186941": "Q40266137", "Q651454": "Q40266137",     # Columbia, TriStar → Sony
    "Q1370297": "Q40266137",                            # Screen Gems → Sony
    "Q191224": "Q1323594", "Q7414": "Q1323594",          # Walt Disney Pictures, The Walt Disney Company → Disney
    "Q47695407": "Q1323594",                            # Walt Disney Studios Motion Pictures International → Disney
    "Q5009280": "Q159846",                              # Paramount Global Content Distribution → Paramount
    "Q192557": "Q168383",                               # DreamWorks (distribué par Universal) → Universal
    "Q179200": "Q4740868", "Q219400": "Q4740868",       # MGM, United Artists → Amazon MGM Studios
    "Q3277355": "Q135831077",                           # Saban Capital Group → Saban Films
    "Q2724557": "Q17985957",                            # Bleecker Street (doublon) → Bleecker Street
}

# Fenêtres par défaut, quand un distributeur a moins de FILMS_MIN films mesurés : ce qu'on sait de ses habitudes
# (accords avec les salles, sorties récentes). Une médiane mesurée sur assez de films l'emporte toujours.
DEFAUTS = {
    "Q168383": ("Universal", 17),            # accord de 2020 avec les salles : 17 jours, 31 pour un gros succès
    "Q649649": ("Focus Features", 17),       # filiale d'Universal, même accord
    "Q8016302": ("Warner Bros.", 45),        # 45 jours depuis la fin des sorties simultanées sur Max (2022)
    "Q1323594": ("Disney", 60),              # Disney et Marvel : deux mois, parfois plus
    "Q434841": ("20th Century", 45),         # studio de Disney, fenêtre un peu plus courte
    "Q953040": ("Searchlight", 45),          # studio de Disney, films d'auteur
    "Q159846": ("Paramount", 45),            # 45 jours, parfois 30 pour un film qui marche moins
    "Q774682": ("Republic Pictures", 30),    # petites sorties de Paramount
    "Q40266137": ("Sony", 50),               # 45 à 60 jours (pas de plateforme maison)
    "Q1320443": ("Sony Pictures Classics", 60),   # films d'auteur, longue carrière en salle
    "Q17076072": ("Lionsgate", 30),          # numérique un mois après la salle
    "Q16248298": ("A24", 35),                # 4 à 6 semaines
    "Q30603559": ("Neon", 45),               # films de festival, carrière en salle plus longue
    "Q4740868": ("Amazon MGM", 30),          # vite en location, puis sur Prime Video
    "Q18395323": ("Vertical", 30),           # fenêtre très courte, 30 à 45 jours (The Weight : 32)
    "Q3843364": ("Magnolia", 21),            # souvent le même jour ; sinon 2 à 4 semaines
    "Q2910457": ("IFC Films", 21),           # souvent le même jour ; sinon 2 à 4 semaines
    "Q17985957": ("Bleecker Street", 30),    # un mois
    "Q7339672": ("Roadside Attractions", 30),   # un mois
    "Q113659629": ("Angel Studios", 60),     # longue carrière en salle (financement participatif)
}

# Sans distributeur sur Wikidata : une société de production TMDB qui est aussi un distributeur connu.
SOCIETES_TMDB = {
    33: "Q168383", 10146: "Q649649", 174: "Q8016302", 12: "Q8016302", 2: "Q1323594", 3: "Q1323594",
    127928: "Q434841", 25: "Q434841", 127929: "Q953040", 43: "Q953040", 4: "Q159846", 5: "Q40266137",
    34: "Q40266137", 3045: "Q40266137", 3287: "Q40266137", 58: "Q1320443", 1632: "Q17076072",
    41077: "Q16248298", 90733: "Q30603559", 210099: "Q4740868", 21: "Q4740868", 88606: "Q18395323",
    1030: "Q3843364", 307: "Q2910457", 167986: "Q17985957", 911: "Q7339672", 165435: "Q113659629",
}


class SourceError(RuntimeError):
    """TMDB ou Wikidata injoignable après plusieurs essais : rien n'est écrit (jamais un fichier troué)."""


def _lire(req: urllib.request.Request, quoi: str, essais: int = 5) -> dict:
    """Réponse JSON, après quelques essais (erreurs 429 et 5xx, réseau) ; {} pour une page qui n'existe pas (404)."""
    last = None
    for attempt in range(essais):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {}
            if e.code != 429 and e.code < 500:
                raise SourceError(f"{quoi} : erreur {e.code}") from e
            last = f"erreur {e.code}"
            attente = e.headers.get("Retry-After") if e.headers else None
            if attente and attente.isdigit() and attempt < essais - 1:
                time.sleep(min(int(attente), 60))
                continue
        except (OSError, ValueError, http.client.HTTPException) as e:   # réseau, délai, réponse tronquée
            last = type(e).__name__
        if attempt < essais - 1:
            time.sleep(2 ** attempt)
    raise SourceError(f"{quoi} : injoignable après {essais} essais ({last})")


def tmdb(path: str, **params) -> dict:
    params = {"api_key": KEY, **params}
    url = f"https://api.themoviedb.org/3{path}?{urllib.parse.urlencode(params)}"
    return _lire(urllib.request.Request(url, headers={"User-Agent": "nuvio-assets"}), path)


# ---------- calculs (sans réseau, testés) ----------
def dates_us(release_dates: list) -> tuple[str | None, str | None]:
    """(première salle, première sortie numérique) aux États-Unis, AAAA-MM-JJ ou None. Pas les avant-premières."""
    salle, numerique = [], []
    for pays in release_dates or []:
        if pays.get("iso_3166_1") != "US":
            continue
        for r in pays.get("release_dates") or []:
            jour = (r.get("release_date") or "")[:10]
            if not jour:
                continue
            if r.get("type") in (2, 3):
                salle.append(jour)
            elif r.get("type") == 4:
                numerique.append(jour)
    return (min(salle) if salle else None, min(numerique) if numerique else None)


def ecart(debut: str, fin: str) -> int:
    return (dt.date.fromisoformat(fin) - dt.date.fromisoformat(debut)).days


def fenetre(salle: str | None, numerique: str | None) -> int | None:
    """Jours entre la salle et le numérique ; None sans l'une des deux, ou hors de [FENETRE_MIN, FENETRE_MAX]
    (sortie simultanée, ressortie, date fausse)."""
    if not salle or not numerique:
        return None
    jours = ecart(salle, numerique)
    return jours if FENETRE_MIN <= jours <= FENETRE_MAX else None


def mediane(valeurs: list[int]) -> int:
    """Médiane arrondie au jour (la moitié vers le haut)."""
    return int(statistics.median(valeurs) + 0.5)


def choisir_distributeur(declarations: list[dict]) -> str | None:
    """Le distributeur américain (QID, marques regroupées) parmi les déclarations « distribué par » d'un film :
    { dist, qualif_pays: set, formats: set, pays: set, plateforme: bool }. Pour les États-Unis (qualificatif Q30)
    d'abord, puis un distributeur américain sans qualificatif, puis un distributeur sans pays connu ; à égalité, un
    distributeur connu (DEFAUTS), puis le plus petit numéro (le plus ancien sur Wikidata) : toujours le même choix."""
    def rang(d):
        if d["qualif_pays"]:
            return 0 if USA in d["qualif_pays"] else None
        if not d["pays"]:
            return 2
        return 1 if USA in d["pays"] else None
    candidats = []
    for d in declarations:
        qid = MARQUES.get(d["dist"], d["dist"])
        if d["plateforme"] or d["dist"] in PAS_EN_SALLE or qid in PAS_EN_SALLE:
            continue
        if d["formats"] and EN_SALLE not in d["formats"]:
            continue
        r = rang(d)
        if r is not None:
            candidats.append((r, qid not in DEFAUTS, int(qid[1:]), qid))
    return min(candidats)[3] if candidats else None


def distributeur_tmdb(societes: list) -> str | None:
    """Sans distributeur sur Wikidata : la première société de production TMDB qui est un distributeur connu."""
    for s in societes or []:
        if s.get("id") in SOCIETES_TMDB:
            return SOCIETES_TMDB[s["id"]]
    return None


def calculer_fenetres(mesures: dict[str, list[int]], noms: dict[str, str]) -> dict:
    """{ QID: { nom, jours, films, source } } : la médiane mesurée d'un distributeur s'il a FILMS_MIN films ou plus,
    sinon sa fenêtre par défaut ; un distributeur sans l'un ni l'autre n'y est pas (médiane générale)."""
    out = {}
    for qid in sorted(set(mesures) | set(DEFAUTS), key=lambda q: int(q[1:])):
        js = mesures.get(qid, [])
        nom = DEFAUTS[qid][0] if qid in DEFAUTS else noms.get(qid) or qid
        if len(js) >= FILMS_MIN:
            out[qid] = {"nom": nom, "jours": mediane(js), "films": len(js), "source": "mesure"}
        elif qid in DEFAUTS:
            out[qid] = {"nom": nom, "jours": DEFAUTS[qid][1], "films": len(js), "source": "defaut"}
    return out


def plus_longues(fenetres_mesurees: list[int], ecoule: int) -> int | None:
    """Médiane des fenêtres plus longues que les jours déjà passés en salle sans date numérique, ou None s'il y en a
    trop peu. Avant la sortie en salle (ecoule négatif), toutes comptent : la médiane ordinaire. Moins d'un film sur
    dix encore sans date à cet âge (au-delà de 75 jours environ) : TMDB a plus sûrement manqué sa date qu'il n'attend
    encore, pas d'estimation (le film compte comme arrivé chez soi, comme avant ; ses sources disent la VF)."""
    longues = [j for j in fenetres_mesurees if j > ecoule]
    assez = len(longues) >= PLUS_LONGUES_MIN and len(longues) >= PLUS_LONGUES_PART * len(fenetres_mesurees)
    return mediane(longues) if assez else None


def estimer(salle: str, distributeur: str | None, fenetres: dict, mesures: dict[str, list[int]], toutes: list[int],
            aujourdhui: dt.date) -> dict | None:
    """L'estimation d'un film sans sortie numérique annoncée : { date, jours } et son distributeur s'il a une fenêtre
    (fenetres), ou None quand la salle + la médiane générale suffit (ce que l'addon fait sans entrée).
    La fenêtre doit dépasser les jours déjà passés en salle (sinon la date serait annoncée) : médiane des fenêtres plus
    longues du distributeur s'il est mesuré, sa fenêtre par défaut si elle tient encore, sinon celles de tous les films."""
    f = fenetres.get(distributeur) if distributeur else None
    ecoule = (aujourdhui - dt.date.fromisoformat(salle)).days
    jours = None
    if f and f["source"] == "mesure":
        jours = plus_longues(mesures.get(distributeur, []), ecoule)
    elif f and f["jours"] > ecoule:
        jours = f["jours"]
    if jours is None:
        jours = plus_longues(toutes, ecoule)
        if jours is None or (not f and jours == mediane(toutes)):
            return None
    date = dt.date.fromisoformat(salle) + dt.timedelta(days=jours)
    return {"date": date.isoformat(), **({"distributeur": distributeur} if f else {}), "jours": jours}


def verifier(nouveau: dict, ancien: dict | None) -> None:
    """Garde-fous : un apprentissage maigre (panne partielle de TMDB ou de Wikidata) ne remplace pas la veille."""
    if nouveau["mesures"] < MESURES_MIN:
        raise SourceError(f"apprentissage trop maigre ({nouveau['mesures']} films, {MESURES_MIN} au moins)")
    if ancien and isinstance(ancien.get("mesures"), int) and nouveau["mesures"] < ancien["mesures"] * PART_MIN:
        raise SourceError(f"apprentissage en chute ({nouveau['mesures']} films, la veille {ancien['mesures']})")
    if len(nouveau["films"]) < ESTIMATIONS_MIN:
        raise SourceError(f"trop peu d'estimations ({len(nouveau['films'])}, {ESTIMATIONS_MIN} au moins)")
    if not sum(1 for f in nouveau["fenetres"].values() if f["source"] == "mesure"):
        raise SourceError("aucun distributeur mesuré (Wikidata muet ?)")


# ---------- lectures ----------
def decouvrir(debut: dt.date, fin: dt.date, votes_min: int, pages_max: int = 500) -> list[dict]:
    """Films sortis en salle aux États-Unis entre debut et fin (discover TMDB), les plus populaires d'abord."""
    params = {"region": "US", "with_release_type": "2|3", "release_date.gte": debut.isoformat(),
              "release_date.lte": fin.isoformat(), "vote_count.gte": votes_min, "sort_by": "popularity.desc",
              "include_adult": "false", "language": "en-US"}
    out, page, total = [], 1, 1
    while page <= min(total, pages_max):
        d = tmdb("/discover/movie", page=page, **params)
        out += d.get("results") or []
        total = d.get("total_pages") or 0
        page += 1
    return out


def details(film_id: int) -> dict:
    d = tmdb(f"/movie/{film_id}", append_to_response="release_dates,external_ids", language="en-US")
    salle, numerique = dates_us((d.get("release_dates") or {}).get("results"))
    imdb = d.get("imdb_id") or (d.get("external_ids") or {}).get("imdb_id")
    return {"id": film_id, "imdb": imdb, "titre": d.get("title"), "langue": d.get("original_language"),
            "salle": salle, "numerique": numerique, "societes": d.get("production_companies") or []}


def sparql(imdbs: list[str]) -> str:
    valeurs = " ".join(f'"{i}"' for i in imdbs)
    return f"""SELECT ?imdb ?st ?dist ?nom ?qpays ?format ?pays ?nature WHERE {{
  VALUES ?imdb {{ {valeurs} }}
  ?item wdt:P345 ?imdb ; p:P750 ?st .
  ?st ps:P750 ?dist ; wikibase:rank ?rang . FILTER(?rang != wikibase:DeprecatedRank)
  OPTIONAL {{ ?st pq:P17 ?qpays }}
  OPTIONAL {{ ?st pq:P437 ?format }}
  OPTIONAL {{ ?dist wdt:P17 ?pays }}
  OPTIONAL {{ ?dist wdt:P31 ?nature . VALUES ?nature {{ {" ".join("wd:" + q for q in sorted(PLATEFORMES))} }} }}
  OPTIONAL {{ ?dist rdfs:label ?nom . FILTER(LANG(?nom) = "en") }}
}}"""


def declarations_wikidata(lignes: list[dict]) -> tuple[dict[str, list[dict]], dict[str, str]]:
    """Réponse SPARQL → ({ tt…: [déclarations] }, { QID: nom anglais })."""
    qid = lambda b, k: b[k]["value"].rsplit("/", 1)[-1] if k in b else None  # noqa: E731
    par_st, noms = {}, {}
    for b in lignes:
        st = b["st"]["value"]
        d = par_st.setdefault(st, {"imdb": b["imdb"]["value"], "dist": qid(b, "dist"), "qualif_pays": set(),
                                   "formats": set(), "pays": set(), "plateforme": False})
        for cle, champ in (("qpays", "qualif_pays"), ("format", "formats"), ("pays", "pays")):
            if cle in b:
                d[champ].add(qid(b, cle))
        d["plateforme"] = d["plateforme"] or "nature" in b
        if "nom" in b:
            noms[d["dist"]] = b["nom"]["value"]
    films: dict[str, list[dict]] = {}
    for d in par_st.values():
        films.setdefault(d["imdb"], []).append(d)
    return films, noms


def distributeurs_wikidata(imdbs: list[str]) -> tuple[dict[str, str], dict[str, str]]:
    """({ tt…: QID du distributeur américain }, { QID: nom }) ; SourceError si Wikidata ne répond pas."""
    choix, noms = {}, {}
    imdbs = sorted(set(imdbs))
    for i in range(0, len(imdbs), WIKI_LOT):
        if i:
            time.sleep(WIKI_PAUSE_S)
        corps = urllib.parse.urlencode({"query": sparql(imdbs[i:i + WIKI_LOT]), "format": "json"}).encode()
        req = urllib.request.Request(WIKIDATA, data=corps, headers={**WIKI_HEADERS,
                                     "Content-Type": "application/x-www-form-urlencoded"})
        d = _lire(req, "Wikidata")
        films, lot_noms = declarations_wikidata((d.get("results") or {}).get("bindings") or [])
        noms.update(lot_noms)
        for imdb, decl in films.items():
            q = choisir_distributeur(decl)
            if q:
                choix[imdb] = q
    return choix, noms


def lire_tous(ids: list[int]) -> list[dict]:
    with ThreadPoolExecutor(8) as pool:
        return list(pool.map(details, ids))


def main() -> None:
    if not KEY:
        raise SystemExit("TMDB_API_KEY manquant")
    # 1. Apprentissage, par tranches de 3 mois (discover s'arrête à 500 pages).
    debut, fin = TODAY - dt.timedelta(days=APPRENTISSAGE_JOURS), TODAY - dt.timedelta(days=RECUL_JOURS)
    vus, ids = set(), []
    tranche = debut
    while tranche <= fin:
        bout = min(tranche + dt.timedelta(days=91), fin)
        for it in decouvrir(tranche, bout, VOTES_MIN):
            if it["id"] not in vus:
                vus.add(it["id"])
                ids.append(it["id"])
        tranche = bout + dt.timedelta(days=1)
    appris = [f for f in lire_tous(ids)
              if f["imdb"] and f["salle"] and debut.isoformat() <= f["salle"] <= fin.isoformat()
              and fenetre(f["salle"], f["numerique"]) is not None]
    # 2. Films à estimer : en salle aux États-Unis, sans sortie numérique américaine. Les films en français gardent
    # leurs propres dates (dispoChezSoi) : inutile de les estimer.
    e_debut, e_fin = TODAY - dt.timedelta(days=ESTIM_AVANT), TODAY + dt.timedelta(days=ESTIM_APRES)
    candidats = [it["id"] for it in decouvrir(e_debut, e_fin, 0, ESTIM_PAGES) if it.get("original_language") != "fr"]
    a_estimer = [f for f in lire_tous(list(dict.fromkeys(candidats)))
                 if f["imdb"] and f["salle"] and not f["numerique"] and f["langue"] != "fr"
                 and e_debut.isoformat() <= f["salle"] <= e_fin.isoformat()]
    # 3. Distributeurs, puis fenêtres.
    wd, noms = distributeurs_wikidata([f["imdb"] for f in appris + a_estimer])
    dist = lambda f: wd.get(f["imdb"]) or distributeur_tmdb(f["societes"])  # noqa: E731
    mesures: dict[str, list[int]] = {}
    toutes = []
    for f in appris:
        j = fenetre(f["salle"], f["numerique"])
        toutes.append(j)
        q = dist(f)
        if q:
            mesures.setdefault(q, []).append(j)
    generale = mediane(toutes) if toutes else SECOURS_JOURS
    fenetres = calculer_fenetres(mesures, noms)
    films = {}
    for f in sorted(a_estimer, key=lambda f: f["imdb"]):
        e = estimer(f["salle"], dist(f), fenetres, mesures, toutes, TODAY)
        if e:
            films[f["imdb"]] = e
    # Les dates déjà annoncées par les studios que TMDB n'a pas encore (dvdsreleasedates.com) : « Dispo le … », plus une
    # estimation. L'estimation (jours) reste à côté, pour les lecteurs qui ne connaissent pas « annonce ».
    annoncees = 0
    for f in a_estimer:
        if f["imdb"] in films:
            d = date_annoncee(f["titre"], f["imdb"])
            if d and d >= f["salle"]:
                films[f["imdb"]]["annonce"] = d
                annoncees += 1
    print(f"{annoncees} dates de sortie numérique annoncées (dvdsreleasedates.com)")
    nouveau = {"maj": TODAY.isoformat(), "mediane": generale, "mesures": len(appris), "fenetres": fenetres,
               "films": films}
    ancien = None
    if OUT.exists():
        try:
            ancien = json.loads(OUT.read_text(encoding="utf-8"))
        except ValueError:
            ancien = None
    verifier(nouveau, ancien)
    OUT.write_text(json.dumps(nouveau, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    avec = sum(1 for e in films.values() if "distributeur" in e)
    print(f"{len(appris)} films mesurés (médiane {generale} j), {sum(len(v) for v in mesures.values())} avec un "
          f"distributeur ; {len(a_estimer)} films sans date numérique : {avec} estimés d'après leur distributeur, "
          f"{len(films) - avec} d'après les fenêtres plus longues de tous, {len(a_estimer) - len(films)} laissés à la "
          f"médiane générale")
    for q, f in sorted(fenetres.items(), key=lambda x: -x[1]["films"]):
        print(f"  {f['nom']:<28} {f['jours']:>4} j  {f['films']:>4} films  {f['source']}")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")   # noms des distributeurs (accents) sur une console Windows
    try:
        main()
    except SourceError as e:
        sys.exit(f"fenêtres non refaites, fichier inchangé : {e}")
