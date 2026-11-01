/**
 * Vraies notes IMDb des films et séries, d'après les fichiers publics d'IMDb.
 *
 * data/imdb-ratings.bin est refait chaque jour par scripts/build_imdb_ratings.py et intégré à
 * l'addon à sa mise en ligne : lire une note ne coûte aucun appel réseau (l'offre gratuite de
 * Cloudflare en limite le nombre). Tous les titres notés y sont, même sur peu de votes.
 */
import RAW from "../data/imdb-ratings.bin";

// Décodé une fois, au démarrage de l'addon (pas pendant une requête) : numéros IMDb triés, notes × 10.
const bytes = new Uint8Array(RAW);
const count = (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
const IDS = new Uint32Array(count);
let pos = 4;
for (let i = 0, id = 0; i < count; i++) {
  let gap = 0, shift = 0, c;
  do { c = bytes[pos++]; gap += (c & 0x7f) * 2 ** shift; shift += 7; } while (c & 0x80);
  id += gap;
  IDS[i] = id;
}
const NOTES = bytes.subarray(pos, pos + count);

/** Note IMDb (« 7.9 ») d'un identifiant « tt… », ou undefined si IMDb n'en a pas. */
export function imdbRating(imdbId) {
  const m = /^tt(\d+)$/.exec(imdbId || "");
  if (!m) return undefined;
  const id = Number(m[1]);
  let lo = 0, hi = count - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (IDS[mid] < id) lo = mid + 1;
    else if (IDS[mid] > id) hi = mid - 1;
    else return (NOTES[mid] / 10).toFixed(1);
  }
  return undefined;
}
