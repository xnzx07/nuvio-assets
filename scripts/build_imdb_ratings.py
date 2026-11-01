"""Vraies notes IMDb des films et séries, pour l'addon (worker/ratings.js).

Télécharge les fichiers publics d'IMDb (gratuits, sans clé, refaits chaque jour par IMDb) :
title.ratings (note et votes de chaque titre) et title.episode (pour écarter les épisodes).
Garde tous les films et séries notés et écrit data/imdb-ratings.bin :
  - nombre de titres (uint32, petit-boutiste) ;
  - leurs numéros IMDb (tt0111161 → 111161), triés, en écarts codés en varint ;
  - une note par titre, dans le même ordre (un octet : note × 10).
Environ 1,7 Mo, intégré à l'addon : lire une note ne coûte aucun appel réseau.

Exécuté chaque jour par GitHub Actions (.github/workflows/imdb.yml). En local :
python scripts/build_imdb_ratings.py [dossier contenant déjà les deux fichiers .tsv.gz]
"""
import gzip
import struct
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "imdb-ratings.bin"
BASE = "https://datasets.imdbws.com/"
FILES = ["title.ratings.tsv.gz", "title.episode.tsv.gz"]
# Garde-fous : un fichier d'IMDb tronqué ou vide ne remplace pas les notes (≈ 830 000 titres en 2026).
MIN_TITLES = 200_000
MIN_SHARE = 0.8  # et au moins 80 % des titres du fichier actuel


def check(count: int) -> None:
    """Arrête tout (fichier non modifié) si le nouveau fichier a trop peu de titres."""
    previous = struct.unpack("<I", OUT.read_bytes()[:4])[0] if OUT.exists() and OUT.stat().st_size >= 4 else 0
    minimum = max(MIN_TITLES, int(previous * MIN_SHARE))
    if count < minimum:
        raise SystemExit(f"trop peu de titres ({count}, {minimum} au moins), {OUT.name} non modifié")


def fetch(folder: Path) -> None:
    for name in FILES:
        if not (folder / name).exists():
            print("Téléchargement de", name)
            urllib.request.urlretrieve(BASE + name, folder / name)


def build(folder: Path) -> None:
    episodes = set()
    with gzip.open(folder / "title.episode.tsv.gz", "rt", encoding="utf-8") as f:
        next(f)
        for line in f:
            episodes.add(line.split("\t", 1)[0])
    rows = []
    with gzip.open(folder / "title.ratings.tsv.gz", "rt", encoding="utf-8") as f:
        next(f)
        for line in f:
            tconst, rating, _votes = line.rstrip("\n").split("\t")
            if tconst not in episodes and tconst.startswith("tt"):
                rows.append((int(tconst[2:]), round(float(rating) * 10)))
    rows.sort()
    check(len(rows))
    out = bytearray(struct.pack("<I", len(rows)))
    prev = 0
    for num, _ in rows:
        gap, prev = num - prev, num
        while gap >= 0x80:
            out.append((gap & 0x7F) | 0x80)
            gap >>= 7
        out.append(gap)
    out += bytes(r for _, r in rows)
    OUT.write_bytes(out)
    print(f"{len(rows)} titres, {len(out) / 1e6:.2f} Mo, dans {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        build(Path(sys.argv[1]))
    else:
        with tempfile.TemporaryDirectory() as tmp:
            fetch(Path(tmp))
            build(Path(tmp))
