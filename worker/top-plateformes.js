/**
 * Le top de chaque plateforme en France (Streaming Availability API, classements donnés par les plateformes). Une seule
 * lecture par jour, tâche planifiée de 4 h UTC, pour tout le monde : 12 appels sur les 1 000 par mois de l'offre gratuite.
 * Une demande de Nuvio n'appelle jamais l'API. Sans le secret TOP_10_KEY (copies) : rien de lu, les rangées restent vides.
 * Une liste que l'API ne rend pas ce jour-là : celle d'avant, entière, jamais un mélange de deux jours ; au-delà de
 * GARDE_JOURS, plus rien plutôt qu'un vieux classement. Les plateformes sans classement gardent leurs rangées « populaires ».
 */
import { jourTendances, secondesAvantBascule } from "./tendances.js";

const API = "https://api.movieofthenight.com/v4";
const GARDE_JOURS = 7;
const MAX = 10;
const PLATEFORMES = [
  { service: "netflix", provider: "8", nom: "Netflix" },
  { service: "prime", provider: "119", nom: "Prime Video" },
  { service: "disney", provider: "337", nom: "Disney+" },
  { service: "apple", provider: "350", nom: "Apple TV+" },
  { service: "hbo", provider: "1899", nom: "HBO Max" },
  { service: "paramount", provider: "531", nom: "Paramount+" },
];
export const TOPS = PLATEFORMES.flatMap(({ service, provider, nom }) => [
  { id: `top-${service}-films`, type: "movie", service, provider, name: `Top films ${nom}` },
  { id: `top-${service}-series`, type: "series", service, provider, name: `Top séries ${nom}` },
]);

/**
 * Catalogues du manifest : plateformes cochées, en France seulement (le classement est celui de la France). Un filtre
 * exigé (genre « Top », donné par les collections) : l'appli Nuvio sur ordinateur ignore showInHome et met sur l'accueil
 * tout catalogue qui n'en exige pas.
 */
export function topCatalogs(cfg, pageSize) {
  if (cfg.g !== "FR" || !cfg.c.includes("plateformes-streaming")) return [];
  return TOPS.filter((t) => cfg.p.includes(t.provider)).map((t) => ({ type: t.type, id: t.id, name: t.name, showInHome: false, pageSize, genres: ["Top"],
    extra: [{ name: "genre", isRequired: true, options: ["Top"] }, { name: "skip" }], extraRequired: ["genre"], extraSupported: ["genre", "skip"] }));
}

/** Une liste de l'API : les identifiants TMDB, dans son ordre, sans ce qui n'en a pas ; null si elle ne rend rien. */
async function lireListe(env, { service, type }) {
  try {
    const q = new URLSearchParams({ country: "fr", service, show_type: type, output_language: "fr" });
    const res = await fetch(`${API}/shows/top?${q}`, { headers: { "X-API-Key": env.TOP_10_KEY }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) { console.warn(`top ${service} ${type} : HTTP ${res.status}`); return null; }
    const d = await res.json();
    const prefixe = type === "series" ? "tv/" : "movie/";
    const ids = (Array.isArray(d) ? d : []).map((x) => String((x && x.tmdbId) || ""))
      .filter((t) => t.startsWith(prefixe) && /^\d+$/.test(t.slice(prefixe.length))).map((t) => Number(t.slice(prefixe.length)));
    return ids.length ? [...new Set(ids)].slice(0, MAX) : null;
  } catch (e) { console.warn(`top ${service} ${type} : ${e && e.message}`); return null; }
}

const dernierJour = (env) => env.LIENS.prepare("SELECT j, tops FROM tops ORDER BY j DESC LIMIT 1").first();
const limite = (now) => jourTendances(now - GARDE_JOURS * 86400000);

/** Tâche planifiée de 4 h UTC : les listes du jour, une seule fois (déjà prises : aucun appel de plus). */
export async function prendreTops(env, now = Date.now()) {
  if (!env.TOP_10_KEY || !env.LIENS) return;
  const jour = jourTendances(now);
  await env.LIENS.prepare("CREATE TABLE IF NOT EXISTS tops (j TEXT PRIMARY KEY, tops TEXT NOT NULL)").run();
  const avant = await dernierJour(env);
  if (avant && avant.j === jour) return;
  const anciens = avant ? JSON.parse(avant.tops) : {};
  const lues = await Promise.all(TOPS.map((t) => lireListe(env, t)));
  // Rien de lu (API en panne, quota du mois atteint) : pas de ligne, on reste sur la précédente.
  if (!lues.some(Boolean)) return;
  const tops = {};
  TOPS.forEach((t, i) => {
    const ancien = anciens[t.id];
    if (lues[i]) tops[t.id] = { j: jour, ids: lues[i] };
    else if (ancien && ancien.j >= limite(now)) tops[t.id] = ancien;
  });
  await env.LIENS.prepare("INSERT OR IGNORE INTO tops (j, tops) VALUES (?, ?)").bind(jour, JSON.stringify(tops)).run();
  await env.LIENS.prepare("DELETE FROM tops WHERE j < ?").bind(limite(now)).run();
}

/** Les listes en base, gardées par Cloudflare : pas une lecture D1 par rangée. Celles d'un autre jour : 5 minutes. */
async function lireTops(env, now) {
  const jour = jourTendances(now);
  const cle = new Request(`https://tops.cache/v1/${jour}`);
  const hit = await caches.default.match(cle);
  if (hit) return hit.json();
  let tops = {}, duJour = false;
  try {
    const r = env.LIENS ? await dernierJour(env) : null;
    if (r) { tops = JSON.parse(r.tops); duJour = r.j === jour; }
  } catch (e) { /* table pas encore créée (avant la première tâche planifiée) */ }
  await caches.default.put(cle, new Response(JSON.stringify(tops), { headers: { "Cache-Control": `public, max-age=${duJour ? secondesAvantBascule(now) : 300}` } }));
  return tops;
}

/** Les identifiants TMDB d'un top, dans son ordre ; [] s'il n'y a rien ou si la liste est trop vieille. */
export async function listeDuTop(env, id, now = Date.now()) {
  const l = (await lireTops(env, now))[id];
  return l && l.j >= limite(now) ? l.ids : [];
}
