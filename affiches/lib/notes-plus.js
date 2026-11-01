/**
 * Notes des autres sites (Rotten Tomatoes, Metacritic, Letterboxd), pour les affiches qui en demandent.
 * Elles viennent de MDBList (clé gratuite MDBLIST_API_KEY, quota par jour) et passent par le relais
 * /notes/{imdb}.json du service, gardé 7 jours par le CDN de Vercel : une lecture sert à toutes les instances.
 * Sans clé, quota épuisé ou panne : null, et l'affiche ne montre que les notes IMDb ou TMDB.
 */
import { enteteRelais } from "./relais.js";

const DELAI_MS = 2500, GARDE_MS = 86400 * 1000, GARDE_ECHEC_MS = 3600 * 1000, MAX_MEMO = 5000;
const SOURCES = { tomatoes: "rt", metacritic: "mc", letterboxd: "lb" };

let memo = new Map();   // imdb → { promesse, until }
// Quota du jour épuisé (429) : plus aucun appel avant la reprise que donne MDBList (Retry-After, minuit UTC).
let pauseJusqua = 0;
export function resetMemo() { memo = new Map(); pauseJusqua = 0; }

/**
 * { rt (%), mc (sur 100), lb (sur 5) } d'une réponse MDBList (null pour une note absente) ; null pour une réponse
 * sans tableau de notes (clé refusée, quota, titre inconnu) : elle ne doit pas être gardée comme « aucune note ».
 */
export function parseMdblist(d) {
  if (!d || d.response === false || !Array.isArray(d.ratings)) return null;
  const out = { rt: null, mc: null, lb: null };
  for (const r of d.ratings) {
    const cle = SOURCES[r && r.source], v = Number(r && r.value);
    if (cle && v > 0) out[cle] = v;
  }
  return out;
}

/**
 * Les notes lues chez MDBList pour un « tt… », ou null (pas de clé, quota, panne). L'API (api.mdblist.com ; l'ancienne
 * adresse mdblist.com/api/ répond 503 depuis octobre 2026) veut le genre : un film (movie) ou une série (show), essayé
 * d'abord d'après type (« series » : une série), puis l'autre si MDBList ne le trouve pas.
 */
export async function lireMdblist(env, imdb, fetchImpl = fetch, type = "movie") {
  if (!env.MDBLIST_API_KEY || Date.now() < pauseJusqua) return null;
  try {
    for (const genre of type === "series" ? ["show", "movie"] : ["movie", "show"]) {
      const url = new URL(`https://api.mdblist.com/imdb/${genre}/${imdb}`);
      url.searchParams.set("apikey", env.MDBLIST_API_KEY);
      const res = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(DELAI_MS) });
      if (res.status === 404) continue;
      if (res.status === 429) {
        const attente = Math.min(Number(res.headers.get("Retry-After")) || 3600, 86400);
        pauseJusqua = Date.now() + attente * 1000;
        console.warn(`MDBList : quota épuisé, repris dans ${Math.round(attente / 60)} min`);
        return null;
      }
      if (!res.ok) { console.warn(`MDBList ${res.status} pour ${imdb}`); return null; }
      const d = await res.json();
      if (d && /not found/i.test(d.error || "")) continue;
      return parseMdblist(d);
    }
    return { rt: null, mc: null, lb: null };
  } catch (e) { console.warn(`MDBList injoignable pour ${imdb} : ${e && e.message}`); return null; }
}

async function lireRelais(relais, imdb, fetchImpl, cle, type) {
  try {
    const res = await fetchImpl(`${relais}/notes/${imdb}.json${type === "series" ? "?type=series" : ""}`, { headers: enteteRelais(cle), signal: AbortSignal.timeout(DELAI_MS + 500) });
    if (!res.ok) return null;
    const d = await res.json();
    const nombre = (v) => (typeof v === "number" && v > 0 ? v : null);
    // { erreur: true } : MDBList en panne ou quota épuisé (pas « aucune note », qui serait gardé un jour).
    return d && !d.erreur ? { rt: nombre(d.rt), mc: nombre(d.mc), lb: nombre(d.lb) } : null;
  } catch { return null; }
}

/**
 * Les notes d'un titre par le relais du service, gardées un jour en mémoire de l'instance (un échec : une heure).
 * cle : RELAIS_KEY, envoyée au relais (lib/relais.js).
 */
export function notesPlus(imdb, fetchImpl = fetch, relais, cle = null, type = "movie") {
  if (!/^tt\d{1,10}$/.test(imdb || "")) return Promise.resolve(null);
  const now = Date.now(), hit = memo.get(imdb);
  if (hit && now < hit.until) return hit.promesse;
  const entry = { promesse: lireRelais(relais, imdb, fetchImpl, cle, type), until: now + GARDE_MS };
  memo.delete(imdb);
  memo.set(imdb, entry);
  while (memo.size > MAX_MEMO) memo.delete(memo.keys().next().value);
  entry.promesse.then((n) => { if (!n) entry.until = Date.now() + GARDE_ECHEC_MS; });
  return entry.promesse;
}
