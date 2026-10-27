/**
 * La photo du jour des tendances TMDB : les 100 premiers (identifiants TMDB, dans l'ordre), prise une seule fois par
 * jour, à 4 h UTC (tâche planifiée de Cloudflare, voir wrangler.toml), et gardée dans la base D1 (LIENS). Le premier
 * enregistrement du jour gagne : tous ceux qui la lisent ont la même, quelle que soit l'heure. Le service d'affiches
 * la publie sur /tendances/{movie|series}.json (N° des affiches) en la lisant ici, et les rangées « Tendances du
 * jour » s'y rangent. Avant, chacun la prenait à sa première demande de la journée, sur un classement qui bouge
 * d'heure en heure : les N° et l'ordre des rangées ne se suivaient plus.
 * Le N° est la place dans la rangée : le classement TMDB, dans son ordre, sans ce que la rangée ne montre pas (au
 * cinéma seulement, pas encore en VF… : classer, dans worker/index.js), renuméroté sans trous ; le reste suit, sans N°.
 * Classement impossible (TMDB, sources) : le classement brut, gardé 5 minutes seulement et jamais enregistré.
 * Sans base (Docker, ou base pas encore prête) : le classement du moment, gardé par Cloudflare jusqu'au changement.
 */
export const BASCULE_UTC_H = 4;
// 100 : assez de films pour en trouver 20 déjà en VF chez soi (sur les 30 premiers, 9 seulement un jour d'octobre).
const TOP = 100, GARDE_JOURS = 7;
// Clé de la photo en base : « movie:rangs5 » ({ ids, vf, q } : renumérotée, avec l'avis VF et la qualité) ; celles d'avant ne sont plus lues.
// Films : « rangs6 » depuis le 24 octobre, pour reprendre ce jour-là la photo qui classait des films sans VF (v5.38.21) ;
// « rangs7 » depuis le 25 octobre : celle de ce jour-là classait 空枪 N°4 (aucune source, v5.38.24). Séries : « rangs6 »
// depuis le même jour, celle-ci classait Oh! My Guard N°10 (sans identifiant IMDb, v5.38.25).
const VERSION_PHOTO = { movie: "rangs7", series: "rangs6" };
const CLE = (kind) => `${kind}:${VERSION_PHOTO[kind]}`;

export function secondesAvantBascule(now = Date.now()) {
  const d = new Date(now), b = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), BASCULE_UTC_H);
  return Math.max(60, Math.ceil(((b > now ? b : b + 86400000) - now) / 1000));
}
/** Le jour de la photo en cours (elle change à 4 h UTC). */
export const jourTendances = (now = Date.now()) => new Date(now - BASCULE_UTC_H * 3600000).toISOString().slice(0, 10);

/** Le classement TMDB du moment (5 pages, sans doublon : les titres, dans l'ordre), lu sans cache ; null si TMDB ne répond pas. */
async function lireTmdb(env, kind) {
  try {
    const pages = await Promise.all([1, 2, 3, 4, 5].map(async (page) => {
      const url = new URL(`https://api.themoviedb.org/3/trending/${kind === "series" ? "tv" : "movie"}/day`);
      url.search = new URLSearchParams({ api_key: env.TMDB_API_KEY, language: "fr-FR", page: String(page) });
      const res = await fetch(url);
      if (!res.ok) throw new Error(`TMDB ${res.status}`);
      return res.json();
    }));
    const titres = pages.flatMap((d) => (d && d.results) || []).filter((it, i, all) => all.findIndex((x) => x.id === it.id) === i);
    return titres.length ? titres.slice(0, TOP) : null;
  } catch (e) { return null; }
}

let ready = null;
const table = (env) => (ready = ready || env.LIENS.prepare(
  "CREATE TABLE IF NOT EXISTS tendances (j TEXT NOT NULL, k TEXT NOT NULL, ids TEXT NOT NULL, PRIMARY KEY (j, k))").run()
  .catch((e) => { ready = null; throw e; }));

/** La photo enregistrée : { ids, vf } (une liste seule : sans avis VF), ou null. */
async function lueEnBase(env, jour, kind) {
  const r = await env.LIENS.prepare("SELECT ids FROM tendances WHERE j = ? AND k = ?").bind(jour, kind).first();
  if (!r) return null;
  const d = JSON.parse(r.ids);
  return Array.isArray(d) ? { ids: d, vf: {} } : d;
}

/** La photo renumérotée : { ids, provisoire } (provisoire : le classement brut, le classement ayant échoué), ou null. */
async function prendre(env, kind, classer) {
  const titres = await lireTmdb(env, kind);
  if (!titres) return null;
  const ids = titres.map((it) => it.id);
  const classe = classer ? await classer(env, kind, titres).catch((e) => { console.warn(`classement des tendances : ${e && e.message}`); return null; }) : null;
  // classer rend { ids, vf, q, vfi } (ou les identifiants seuls).
  const rangs = Array.isArray(classe) ? classe : classe && classe.ids;
  if (!Array.isArray(rangs)) return { ids, vf: {}, provisoire: true };
  const premiers = new Set(rangs);
  const q = classe && classe.q && Object.keys(classe.q).length ? { q: classe.q } : {};
  const vfi = classe && classe.vfi && Object.keys(classe.vfi).length ? { vfi: classe.vfi } : {};
  return { ids: [...rangs, ...ids.filter((id) => !premiers.has(id))], vf: (classe && classe.vf) || {}, ...q, ...vfi, provisoire: false };
}

/**
 * La photo du jour (prise maintenant si personne ne l'a encore prise) : { ids, provisoire }, ou null si TMDB ne répond
 * pas. classer(env, kind, titres) : les identifiants qui portent un N°, dans l'ordre (worker/index.js).
 */
export async function photoDuJour(env, kind, now = Date.now(), classer = null) {
  const jour = jourTendances(now);
  if (!env.LIENS) return prendre(env, kind, classer);
  try {
    await table(env);
    const deja = await lueEnBase(env, jour, CLE(kind));
    if (deja) return { ...deja, provisoire: false };
    const photo = await prendre(env, kind, classer);
    if (!photo || photo.provisoire) return photo;
    // Une autre demande a pu la prendre entre-temps : la sienne reste, et c'est elle qu'on rend.
    await env.LIENS.prepare("INSERT OR IGNORE INTO tendances (j, k, ids) VALUES (?, ?, ?)").bind(jour, CLE(kind), JSON.stringify({ ids: photo.ids, vf: photo.vf, ...(photo.q ? { q: photo.q } : {}), ...(photo.vfi ? { vfi: photo.vfi } : {}) })).run();
    await env.LIENS.prepare("DELETE FROM tendances WHERE j < ?").bind(jourTendances(now - GARDE_JOURS * 86400000)).run();
    return { ...((await lueEnBase(env, jour, CLE(kind))) || photo), provisoire: false };
  } catch (e) {
    console.warn(`photo des tendances : ${e && e.message}`);
    return prendre(env, kind, classer);
  }
}

/** Tâche planifiée de 4 h UTC : la photo des films et celle des séries. */
export const prendrePhotos = (env, now = Date.now(), classer = null) => Promise.all(["movie", "series"].map((kind) => photoDuJour(env, kind, now, classer)));

/** /tendances/{movie|series}.json : { ids }, gardé par Cloudflare (et ceux qui la lisent) jusqu'au changement. */
export async function routeTendances(env, kind, headers, classer = null) {
  if (!["movie", "series"].includes(kind)) return new Response(JSON.stringify({ error: "introuvable" }), { status: 404, headers: { ...headers, "Cache-Control": "public, max-age=3600" } });
  const cle = new Request(`https://tendances.cache/${VERSION_PHOTO[kind]}/${jourTendances()}/${kind}.json`);
  const rendre = (corps, s = secondesAvantBascule()) => new Response(corps, { headers: { ...headers, "Cache-Control": `public, max-age=${s}` } });
  const hit = await caches.default.match(cle);
  if (hit) return rendre(await hit.text());
  const photo = await photoDuJour(env, kind, Date.now(), classer);
  if (!photo) return new Response(JSON.stringify({ error: "TMDB injoignable" }), { status: 503, headers: { ...headers, "Cache-Control": "no-store" } });
  // vf : l'avis VF des titres examinés (tmdbId → 1 ou 0), seulement s'il y en a.
  // q : la qualité des sources VF de StreamFusion (tmdbId → { u, x, p, f, a }), seulement s'il y en a.
  // vfi : le même avis VF par identifiant IMDb (tt… → 1 ou 0), pour les rangées et les fiches de l'addon.
  const corps = JSON.stringify({ ids: photo.ids, ...(photo.vf && Object.keys(photo.vf).length ? { vf: photo.vf } : {}), ...(photo.q && Object.keys(photo.q).length ? { q: photo.q } : {}),
    ...(photo.vfi && Object.keys(photo.vfi).length ? { vfi: photo.vfi } : {}) });
  // Classement brut (le classement a échoué) : 5 minutes, pour reprendre la vraie photo ensuite.
  if (photo.provisoire) return rendre(corps, Math.min(300, secondesAvantBascule()));
  await caches.default.put(cle, new Response(corps, { headers: { "Cache-Control": `public, max-age=${secondesAvantBascule()}` } }));
  return rendre(corps);
}
