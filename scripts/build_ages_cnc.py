"""L'âge officiel des films en France, d'après les visas du CNC (data/ages-cnc.json, lu par l'addon : Mode famille).

TMDB n'a la classification française que d'un film récent sur dix : un film sans elle passait le Mode famille sur sa
classification américaine, ou sans aucune. Le CNC délivre un visa à chaque film qui sort en salle en France, avec sa
décision (« Tous publics », « Interdiction aux mineurs -12 ans »…). Reproduction autorisée en citant la source
(https://www.cnc.fr/mentions-legales).

1. Visas : le fichier ouvert du CNC sur data.gouv.fr (Licence Ouverte, figé au 13/11/2025), longs-métrages des visas
   depuis ANNEE_MIN ; puis la recherche du site du CNC par date de sortie (tranches de TRANCHE_JOURS : 100 résultats
   au plus par page), lue avec Scrapling, pour les sorties plus récentes.
2. Chaque visa est relié à son film TMDB : recherche par titre, année proche, et le même réalisateur (les visas n'ont
   aucun identifiant). Pas de réalisateur commun : pas relié (mieux vaut un film sans âge du CNC qu'un âge faux).
3. Âge : 0 (tous publics), 10 (tous publics avec avertissement : prudence pour les plus petits), 12, 13 (ancien
   système), 16, 18. Plusieurs visas pour un film (ressortie) : le plus sévère.

data/ages-cnc.json : { "maj", "source", "films": { id TMDB: âge } }.
data/ages-cnc-suivi.json : { "csv": adresse du fichier ouvert déjà lu, "jusqua": dernier jour de sortie lu sur le
site, "visas": { n° de visa: id TMDB ou 0 (pas relié), …} } : un visa n'est cherché qu'une fois.
Exécuté chaque nuit par GitHub Actions (addon.yml, secret TMDB_API_KEY). Une panne garde ce qui a été lu.

Usage : python scripts/build_ages_cnc.py   (TMDB_API_KEY ; Scrapling : pip install "scrapling[fetchers]")
"""
import csv
import datetime as dt
import io
import json
import re
import sys
import unicodedata
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from update_addon import tmdb  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "ages-cnc.json"
SUIVI = ROOT / "data" / "ages-cnc-suivi.json"
DATASET = "https://www.data.gouv.fr/api/1/datasets/liste-des-visas-dexploitations-cinematographiques-delivres-de-1945-a-2025/"
SITE = "https://www.cnc.fr/professionnels/visas-et-classification"
NS = "_RechercheVisaClassificationControlleur_INSTANCE_bFazQlIweBh2_"
AGENT = {"User-Agent": "catalogue-fr-nuit"}
ANNEE_MIN = 2021              # le Mode famille ne juge film par film que les films récents (voir classifFamille)
SITE_DEPUIS = "2025-11-01"    # le fichier ouvert s'arrête le 13/11/2025 : un peu de recouvrement
TRANCHE_JOURS = 15            # ~40 sorties : sous les 100 résultats par page du site
RELIRE_JOURS = 21             # les derniers jours sont relus (visas publiés avec retard)
STOP = {"les", "des", "del", "van", "von", "der", "den", "dos", "das", "and"}


# Cyrillique → latin : TMDB écrit souvent les réalisateurs russes ou ukrainiens dans leur alphabet (« Кантемир
# Балагов »), le CNC en latin (« BALAGOV Kantemir »). Les écritures coréenne, chinoise… ne se translittèrent pas
# sûrement : ces films restent sans âge du CNC.
CYRILLIQUE = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюяіїєґ",
                      ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s",
                       "t", "u", "f", "kh", "ts", "ch", "sh", "shch", "", "y", "", "e", "yu", "ya", "i", "yi", "ye", "g"]))


def norm(s: str) -> str:
    """Minuscules, sans accents ni ponctuation : « L'Été meurtrier » = « L ETE MEURTRIER »."""
    s = "".join(CYRILLIQUE.get(c, c) for c in (s or "").lower())
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def age_de(decision: str) -> int | None:
    """Âge d'une décision du CNC (fichier ouvert ou site), None si elle n'en donne pas (censure, vide)."""
    d = norm(decision)
    ages = [int(n) for n in re.findall(r"\b(\d{2})\s*ans\b", d)]
    if "interdit mineurs" in d:
        ages.append(18)
    if ages:
        return max(ages)
    if "avertissement" in d:
        return 10
    if "tout public" in d or "tous publics" in d:
        return 0
    return None


def titres(titre: str) -> list[str]:
    """Titres à chercher : « Joker. Wild card » → les deux ; « Les musiciens (ex. Le sommet) » → sans la parenthèse."""
    t = re.sub(r"\s*\((?:ex\.?|ex-)[^)]*\)", "", titre or "", flags=re.I).strip()
    out = [t] + [p.strip() for p in re.split(r"\.\s+", t) if p.strip()]
    return list(dict.fromkeys(x for x in out if norm(x)))


def noms(realisation: str) -> set[str]:
    """Les mots des noms des réalisateurs (« SISSAKO Abderrahmane », « Pierre Seguin ») de 3 lettres ou plus."""
    return {w for w in norm(realisation).split() if len(w) >= 3 and w not in STOP}


def visas_csv(texte: str) -> list[dict]:
    """Longs-métrages du fichier ouvert depuis ANNEE_MIN, avec un âge."""
    out = []
    for r in csv.DictReader(io.StringIO(texte), delimiter=";"):
        annee = (r.get("Date") or "")[-4:]
        if r.get("Format") != "Long-métrage" or not annee.isdigit() or int(annee) < ANNEE_MIN:
            continue
        age = age_de(r.get("Décision") or "")
        visa = (r.get("N° de visa") or "").strip()
        if age is None or not visa.isdigit():
            continue
        out.append({"visa": visa, "titre": r.get("Titre") or "", "real": r.get("Réalisation") or "",
                    "annee": int(annee), "age": age})
    return out


def lire_csv(suivi: dict) -> list[dict]:
    """Visas du fichier ouvert, s'il n'a pas déjà été lu (même adresse) ; [] sinon."""
    with urllib.request.urlopen(urllib.request.Request(DATASET, headers=AGENT), timeout=60) as r:
        res = [x for x in json.load(r)["resources"] if x.get("format") == "csv" or x["url"].endswith(".csv")]
    if not res or res[0]["url"] == suivi.get("csv"):
        return []
    with urllib.request.urlopen(urllib.request.Request(res[0]["url"], headers=AGENT), timeout=120) as r:
        texte = r.read().decode("utf-8-sig")
    suivi["csv_lu"] = res[0]["url"]      # noté seulement quand tous ses visas sont traités (voir main)
    return visas_csv(texte)


def lignes_site(lignes: list[list[str]]) -> list[dict]:
    """Lignes du tableau du site [titre, réalisateur, visa, mentions, pays, date de sortie JJ/MM/AAAA] → visas."""
    out = []
    for c in lignes:
        if len(c) < 6 or not c[2].strip().isdigit():
            continue
        age = age_de(c[3])
        m = re.match(r"(\d{2})/(\d{2})/(\d{4})", c[5].strip())
        if age is None or not m:
            continue
        out.append({"visa": c[2].strip(), "titre": c[0], "real": c[1], "annee": int(m.group(3)), "age": age,
                    "sortie": f"{m.group(3)}-{m.group(2)}-{m.group(1)}"})
    return out


def lire_site(debut: dt.date, fin: dt.date) -> list[dict]:
    """Visas des films sortis entre deux dates, d'après la recherche du site du CNC (Scrapling)."""
    from scrapling.fetchers import Fetcher   # seulement ici : le reste du script (et ses tests) s'en passe
    out, jour = [], debut
    while jour <= fin:
        bout = min(fin, jour + dt.timedelta(days=TRANCHE_JOURS - 1))
        params = {"p_p_id": NS.strip("_"), "p_p_lifecycle": "0", "p_p_state": "normal", "p_p_mode": "view",
                  NS + "executeRechercheMultiCriteres": "executeRechercheMultiCriteres",
                  NS + "dateDebut": jour.strftime("%d/%m/%Y"), NS + "dateFin": bout.strftime("%d/%m/%Y")}
        page = Fetcher.get(SITE, params=params, stealthy_headers=True, timeout=60)
        if page.status != 200:
            raise RuntimeError(f"site du CNC : réponse {page.status}")
        lignes = [[c.get_all_text(strip=True) for c in tr.css("td")] for tr in page.css("table tr")]
        lignes = [x for x in lignes if x]
        if len(lignes) >= 100:      # page pleine : des sorties manqueraient, la tranche est trop longue
            raise RuntimeError(f"site du CNC : 100 résultats du {jour} au {bout}, tranche à raccourcir")
        out += lignes_site(lignes)
        jour = bout + dt.timedelta(days=1)
    return out


def noms_personne(pid: int, nom: str) -> set[str]:
    """Les mots du nom d'une personne TMDB ; nom pas en alphabet latin (« Кантемир Балагов », « 홍상수 ») : aussi
    ses autres noms (also_known_as : « Kantemir Balagov »)."""
    mots = noms(nom)
    if mots:
        return mots
    return set().union(*[noms(a) for a in tmdb(f"/person/{pid}").get("also_known_as") or []] or [set()])


def realisateurs(tmdb_id: int) -> set[str]:
    crew = tmdb(f"/movie/{tmdb_id}/credits").get("crew") or []
    return set().union(*[noms_personne(c["id"], c.get("name") or "") for c in crew if c.get("job") == "Director"]
                       or [set()])


def relier(v: dict) -> int:
    """Identifiant TMDB du film d'un visa, ou 0.
    1. Titre cherché, année à ±2 ans (ou pas encore de date chez TMDB : film de festival), même réalisateur.
    2. Sinon (titre français absent de TMDB) : les films du réalisateur, s'il n'en a qu'un à ±1 an du visa."""
    attendus = noms(v["real"])
    if not attendus:
        return 0
    vus = set()
    for t in titres(v["titre"]):
        for r in (tmdb("/search/movie", query=t, include_adult="false").get("results") or [])[:6]:
            annee = int((r.get("release_date") or "0")[:4] or 0)
            if r["id"] in vus or (annee and abs(annee - v["annee"]) > 2):
                continue
            vus.add(r["id"])
            if realisateurs(r["id"]) & attendus:
                return r["id"]
    for nom in [n for n in re.split(r"\n|,| et ", v["real"]) if n.strip()][:2]:
        gens = tmdb("/search/person", query=nom.strip()).get("results") or []
        for p in gens[:2]:
            if not noms_personne(p["id"], p.get("name") or "") & attendus:
                continue
            films = {c["id"] for c in tmdb(f"/person/{p['id']}/movie_credits").get("crew") or []
                     if c.get("job") == "Director" and (c.get("release_date") or "")[:4].isdigit()
                     and abs(int(c["release_date"][:4]) - v["annee"]) <= 1}
            if len(films) == 1:
                return films.pop()
            if films:
                return 0    # plusieurs films ces années-là : impossible de choisir sans le titre
    return 0


def main() -> None:
    suivi = json.loads(SUIVI.read_text(encoding="utf-8")) if SUIVI.exists() else {}
    suivi.setdefault("visas", {})
    nouveaux, ages = [], {}
    try:
        nouveaux += lire_csv(suivi)
    except Exception as e:  # noqa: BLE001 — data.gouv muet : le site suffit pour les sorties récentes
        print(f"fichier ouvert du CNC illisible ({e})", file=sys.stderr)
    aujourd = dt.date.today()
    depuis = dt.date.fromisoformat(suivi.get("jusqua") or SITE_DEPUIS) - dt.timedelta(days=RELIRE_JOURS)
    site_ok = True
    try:
        nouveaux += lire_site(max(depuis, dt.date.fromisoformat(SITE_DEPUIS)), aujourd)
    except Exception as e:  # noqa: BLE001 — site muet ou refait : on garde ce qu'on a, essai demain
        site_ok = False
        print(f"site du CNC illisible ({e})", file=sys.stderr)
    a_relier = {v["visa"]: v for v in nouveaux if v["visa"] not in suivi["visas"]}
    print(f"{len(nouveaux)} visas lus, {len(a_relier)} à relier")
    with ThreadPoolExecutor(8) as ex:
        for v, tid in zip(a_relier.values(), ex.map(relier, a_relier.values())):
            suivi["visas"][v["visa"]] = tid
    # Âge de chaque visa relié : celui lu cette nuit, sinon celui gardé.
    gardes = suivi.setdefault("ages", {})
    for v in nouveaux:
        gardes[v["visa"]] = v["age"]
    for visa, tid in suivi["visas"].items():
        if tid and visa in gardes:
            ages[str(tid)] = max(ages.get(str(tid), 0), gardes[visa])
    csv_lu = suivi.pop("csv_lu", None)
    if csv_lu:
        suivi["csv"] = csv_lu
    if site_ok:
        suivi["jusqua"] = aujourd.isoformat()
    relies = sum(1 for t in suivi["visas"].values() if t)
    print(f"{relies} visas reliés sur {len(suivi['visas'])}, {len(ages)} films avec un âge")
    OUT.write_text(json.dumps({"maj": aujourd.isoformat(), "source": "CNC (visas et classification)",
                               "films": dict(sorted(ages.items(), key=lambda kv: int(kv[0])))},
                              separators=(",", ":")) + "\n", encoding="utf-8")
    SUIVI.write_text(json.dumps(suivi, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8")
    if not site_ok:
        sys.exit(1)     # fichiers écrits avec ce qui a été lu ; le bilan de la nuit passe en rouge


if __name__ == "__main__":
    main()
