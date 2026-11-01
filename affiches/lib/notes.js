/**
 * Vraies notes IMDb, d'après data/imdb-ratings.bin du dépôt (refait chaque jour par GitHub Actions).
 * Le fichier est lu sur GitHub au lieu d'être intégré au service : les commits de chaque nuit ne
 * redéploient donc pas le service et ne vident pas le cache des affiches. Même format que worker/ratings.js.
 */
export const NOTES_URL = "https://raw.githubusercontent.com/xnzx07/nuvio-assets/main/data/imdb-ratings.bin";
// 3 h : le passage de 4 h 17 UTC doit voir le fichier du soir, pour les notes des nouveautés.
const GARDE_MS = 3 * 3600 * 1000;

let memo = null;   // { lire (ou null), until, promesse (lecture en cours, ou null) }
export function resetMemo() { memo = null; }

/** Fonction « tt… » → « 7.9 » (ou undefined) à partir du contenu du fichier. */
export function decodeRatings(bytes) {
  const count = (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
  const ids = new Uint32Array(count);
  let pos = 4;
  for (let i = 0, id = 0; i < count; i++) {
    let gap = 0, shift = 0, c;
    do { c = bytes[pos++]; gap += (c & 0x7f) * 2 ** shift; shift += 7; } while (c & 0x80);
    id += gap;
    ids[i] = id;
  }
  const notes = bytes.subarray(pos, pos + count);
  return (imdbId) => {
    const m = /^tt(\d+)$/.exec(imdbId || "");
    if (!m) return undefined;
    const id = Number(m[1]);
    let lo = 0, hi = count - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (ids[mid] < id) lo = mid + 1;
      else if (ids[mid] > id) hi = mid - 1;
      else return (notes[mid] / 10).toFixed(1);
    }
    return undefined;
  };
}

async function charger(fetchImpl) {
  try {
    const res = await fetchImpl(NOTES_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return decodeRatings(new Uint8Array(await res.arrayBuffer()));
  } catch { return null; }
}

/**
 * Lance la lecture du fichier s'il le faut (jamais lu, ou gardé depuis plus de 3 h). Pendant une nouvelle lecture,
 * et si elle échoue, l'ancien fichier sert encore : seul un fichier bien lu remplace le précédent. Échec : on
 * réessaiera dans 10 min, pas à chaque affiche.
 */
function demarrer(fetchImpl) {
  if (memo && (memo.promesse || Date.now() <= memo.until)) return memo;
  const ancien = memo ? memo.lire : null;
  const promesse = charger(fetchImpl);
  const etat = { lire: ancien, until: Infinity, promesse };
  memo = etat;
  promesse.then((lire) => { if (memo === etat) memo = { lire: lire || ancien, until: Date.now() + (lire ? GARDE_MS : 10 * 60 * 1000), promesse: null }; });
  return etat;
}

/** La promesse, ou undefined si elle n'a pas abouti dans le délai. */
function avant(promesse, ms) {
  if (!Number.isFinite(ms)) return promesse;
  let timer;
  return Promise.race([promesse, new Promise((ok) => { timer = setTimeout(ok, ms); })]).finally(() => clearTimeout(timer));
}

/**
 * { note : note IMDb d'un titre (« 8.4 »), undefined si IMDb n'en a pas ou si le fichier manque ; manque : le fichier
 * n'est pas là (illisible, ou pas encore lu après attenteMs) — l'affiche prend alors la note TMDB et le cache court }.
 * Une instance qui démarre n'attend donc pas les 8 s d'une lecture lente : la lecture continue pour les suivantes.
 */
export async function lireNoteImdb(imdbId, fetchImpl = fetch, attenteMs = Infinity) {
  const m = demarrer(fetchImpl);
  const lire = m.lire || (m.promesse ? await avant(m.promesse, attenteMs) : null);
  return lire ? { note: lire(imdbId), manque: false } : { note: undefined, manque: true };
}

/** Note IMDb d'un titre (« 8.4 »), undefined si IMDb n'en a pas ou si le fichier est illisible. */
export const ratingOf = async (imdbId, fetchImpl = fetch) => (await lireNoteImdb(imdbId, fetchImpl)).note;
