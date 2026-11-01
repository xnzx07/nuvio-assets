/**
 * Les vieux films que Torrentio, Lumio et StreamFusion voient tous sans VF, d'après data/sans-vf.json du dépôt (refait
 * chaque nuit par scripts/build_sans_vf.py). Le même fichier que l'addon (worker/index.js : sansVfListe), lu sur le dépôt
 * principal comme les estimations (lib/estimations.js). Gardé 1 h en mémoire ; pendant une nouvelle lecture, et si elle
 * échoue, l'ancienne liste sert encore. Illisible : aucun film marqué.
 */
export const SANS_VF_URL = "https://raw.githubusercontent.com/xnzx07/nuvio-assets/main/data/sans-vf.json";
const GARDE_MS = 3600 * 1000, ECHEC_MS = 5 * 60 * 1000, DELAI_MS = 4000;

let memo = null;   // { films (ou null), until, promesse (lecture en cours, ou null) }
export function resetMemo() { memo = null; }

async function charger(fetchImpl) {
  try {
    const res = await fetchImpl(SANS_VF_URL, { signal: AbortSignal.timeout(DELAI_MS) });
    const d = res.ok ? await res.json() : null;
    return d && Array.isArray(d.films) ? new Set(d.films) : null;
  } catch { return null; }
}

function demarrer(fetchImpl) {
  if (memo && (memo.promesse || Date.now() <= memo.until)) return memo;
  const anciens = memo ? memo.films : null;
  const promesse = charger(fetchImpl);
  const etat = { films: anciens, until: Infinity, promesse };
  memo = etat;
  promesse.then((films) => { if (memo === etat) memo = { films: films || anciens, until: Date.now() + (films ? GARDE_MS : ECHEC_MS), promesse: null }; });
  return etat;
}

/**
 * { films : Set de tt… ; manque : pas de liste (illisible, ou pas encore lue après attenteMs) : l'affiche garde alors son
 * état habituel et le cache court, pour la voir ensuite }.
 */
export async function lireSansVf(fetchImpl = fetch, attenteMs = Infinity) {
  const m = demarrer(fetchImpl);
  let films = m.films;
  if (!films && m.promesse) {
    let timer;
    films = await Promise.race([m.promesse, new Promise((ok) => { timer = setTimeout(ok, attenteMs); })]).finally(() => clearTimeout(timer));
  }
  return films ? { films, manque: false } : { films: new Set(), manque: true };
}
