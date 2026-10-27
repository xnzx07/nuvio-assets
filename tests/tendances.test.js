import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";
import { jourTendances, photoDuJour } from "../worker/tendances.js";

// Base D1 simulée : juste les requêtes de tendances.js (INSERT OR IGNORE : le premier enregistré reste).
function fakeD1() {
  const rows = new Map();
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    async run() {
      if (sql.startsWith("CREATE")) return {};
      if (sql.startsWith("INSERT OR IGNORE")) { const [j, k, ids] = args; if (!rows.has(`${j}/${k}`)) rows.set(`${j}/${k}`, ids); return {}; }
      if (sql.startsWith("DELETE")) { for (const cle of [...rows.keys()]) if (cle.split("/")[0] < args[0]) rows.delete(cle); return {}; }
      throw new Error("requête inattendue : " + sql);
    },
    async first() {
      if (sql.startsWith("INSERT INTO sf_budget")) return { n: args[1] };   // plafond de StreamFusion : toujours la place ici
      const ids = rows.get(`${args[0]}/${args[1]}`); return ids ? { ids } : null;
    },
  });
  return { rows, prepare: (sql) => stmt(sql) };
}

// TMDB simulé : un classement qui bouge d'heure en heure (classement[0] devant, puis le suivant…).
let store, calls, classement, env;
beforeEach(() => {
  store = new Map();
  calls = [];
  classement = [1, 2, 3];
  globalThis.caches = {
    default: {
      match: async (req) => (store.has(req.url) ? new Response(store.get(req.url)) : undefined),
      put: async (req, res) => { store.set(req.url, await res.text()); },
    },
  };
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    const page = new URL(u).searchParams.get("page");
    return new Response(JSON.stringify({ results: page === "1" && u.includes("/trending/") ? classement.map((id) => ({ id })) : [] }));
  };
  env = { TMDB_API_KEY: "tmdb", LIENS: fakeD1() };
});
const ctx = { waitUntil: () => {} };
const get = (path, e = env) => worker.fetch(new Request(`https://x${path}`), e, ctx);
// Les 20 places des N° : des 0 quand aucun titre ne les prend (ici, des titres sans date de sortie : rien de sorti).
const vides = (n = 20) => Array(n).fill(0);

// La photo est prise une fois : plus tard dans la journée, le classement a bougé, la photo non.
test("photo_prise_une_fois_par_jour", async () => {
  const res = await get("/tendances/movie.json");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ids: [...vides(), 1, 2, 3] });
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
  assert.ok(calls.every((u) => u.includes("/trending/movie/day")));
  classement = [3, 2, 1];
  store.clear();   // un autre serveur de Cloudflare, sans cache : il la lit dans la base
  assert.deepEqual(await (await get("/tendances/movie.json")).json(), { ids: [...vides(), 1, 2, 3] });
  assert.deepEqual(await photoDuJour(env, "movie"), { ids: [...vides(), 1, 2, 3], vf: {}, provisoire: false });
  assert.deepEqual(await (await get("/tendances/series.json")).json(), { ids: [...vides(), 3, 2, 1] });   // séries : leur propre photo
  assert.ok(calls.some((u) => u.includes("/trending/tv/day")));
});

// La tâche de 4 h UTC prend les deux photos ; celles d'il y a plus d'une semaine sont effacées.
test("tache_de_4h", async () => {
  const quatreHeures = Date.UTC(2026, 9, 22, 4);
  env.LIENS.rows.set("2026-10-01/movie", "[9]");
  const pas = [];
  await worker.scheduled({ scheduledTime: quatreHeures }, env, { waitUntil: (p) => pas.push(p) });
  await Promise.all(pas);
  assert.equal(jourTendances(quatreHeures), "2026-10-22");
  assert.equal(jourTendances(quatreHeures - 1), "2026-10-21");
  assert.deepEqual(JSON.parse(env.LIENS.rows.get("2026-10-22/movie:rangs7")).ids, [...vides(), 1, 2, 3]);
  assert.deepEqual(JSON.parse(env.LIENS.rows.get("2026-10-22/series:rangs6")).ids, [...vides(), 1, 2, 3]);
  assert.ok(!env.LIENS.rows.has("2026-10-01/movie"));
  // Plus tard dans la journée, le classement a bougé : toujours la photo de 4 h.
  classement = [7];
  mock.timers.enable({ apis: ["Date"], now: quatreHeures + 3 * 3600000 });
  try { assert.deepEqual((await photoDuJour(env, "movie")).ids, [...vides(), 1, 2, 3]); } finally { mock.timers.reset(); }
});

// Sans base (Docker) : le classement du moment, gardé par Cloudflare jusqu'au changement. TMDB en panne : 503.
test("sans_base_et_tmdb_en_panne", async () => {
  const sansBase = { TMDB_API_KEY: "tmdb" };
  assert.deepEqual(await (await get("/tendances/movie.json", sansBase)).json(), { ids: [...vides(), 1, 2, 3] });
  classement = [3, 2, 1];
  assert.deepEqual(await (await get("/tendances/movie.json", sansBase)).json(), { ids: [...vides(), 1, 2, 3] });
  store.clear();
  globalThis.fetch = async () => new Response("", { status: 500 });
  const res = await get("/tendances/series.json");
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal((await get("/tendances/anime.json")).status, 404);
});

// Le N° est la place dans la rangée : le classement TMDB, dans son ordre, sans ce qu'elle ne montre pas (1 : au cinéma
// seulement ; 4 : pas encore sorti), renuméroté sans trous ; le reste suit, sans N°. Le classement brut n'est jamais
// enregistré : il ne sert que si le classement échoue, 5 minutes.
test("photo_renumerotee_comme_la_rangee", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const film = (id, dates) => ({ id, imdb_id: "tt" + (900 + id), original_language: "en",
    release_dates: { results: dates.map(([pays, type, d]) => ({ iso_3166_1: pays, release_dates: [{ type, release_date: d + "T00:00:00.000Z" }] })) } });
  const fiches = { 1: film(1, [["FR", 3, jour(-5)]]), 2: film(2, [["FR", 3, jour(-80)], ["US", 4, jour(-30)]]), 3: film(3, [["US", 3, "2001-05-01"]]), 4: film(4, []) };
  const dates = { 1: jour(-5), 2: jour(-80), 3: "2001-05-01", 4: jour(30) };
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/trending/movie/day")) return new Response(JSON.stringify({ results: new URL(u).searchParams.get("page") === "1" ? [1, 4, 2, 3].map((id) => ({ id, release_date: dates[id], original_language: "en" })) : [] }));
    const m = /\/movie\/(\d)\?/.exec(u);
    if (m) return new Response(JSON.stringify(fiches[m[1]]));
    return new Response("{}");
  };
  assert.deepEqual(await (await get("/tendances/movie.json")).json(), { ids: [2, 3, ...vides(18), 1, 4] });
  assert.deepEqual(JSON.parse(env.LIENS.rows.get(`${jourTendances()}/movie:rangs7`)).ids, [2, 3, ...vides(18), 1, 4]);
  // Le classement échoue : le classement brut, provisoire (la route le garde 5 minutes), jamais enregistré.
  env.LIENS.rows.clear();
  const brut = await photoDuJour(env, "movie", Date.now(), async () => { throw new Error("TMDB en panne"); });
  assert.deepEqual(brut, { ids: [1, 4, 2, 3], vf: {}, provisoire: true });
  assert.equal(env.LIENS.rows.size, 0);
});

// Séries : seulement ce qui est en VF chez soi, comme leurs affiches. 1 : nouvelle série japonaise, sources sans VF →
// écartée ; 2 : nouvelle, mêmes sources, mais sur Netflix en France (qui double) → gardée ; 3 : vieille série, dernière
// saison sans VF → gardée ; 4 : nouvelle, sources VF → gardée ; 5 : pas encore diffusée → écartée ; 7 : nouvelle, sans
// identifiant IMDb (Oh! My Guard, coréenne, N°10 le 25 octobre 2026) : aucune source à lire → écartée ; 8 : pareil, mais en
// français (elle a sa VF) → gardée.
test("photo_des_series_seulement_en_vf", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const premiere = { 1: jour(-20), 2: jour(-40), 3: "2009-01-01", 4: jour(-60), 5: jour(15), 6: jour(-2), 7: jour(-1), 8: jour(-5) };
  const langue = { 1: "ja", 2: "ko", 3: "en", 4: "zh", 5: "en", 6: "zh", 7: "ko", 8: "fr" };
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/trending/tv/day")) return new Response(JSON.stringify({ results: new URL(u).searchParams.get("page") === "1" ? [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id, first_air_date: premiere[id], original_language: langue[id] })) : [] }));
    if (u.includes("/vf.json")) {
      const v = (new URL(u).searchParams.get("v") || "").split(",");
      // 6 : nouvelle aussi, aucune source du tout → écartée.
      return new Response(JSON.stringify(Object.fromEntries(v.map((k) => [k, { vf: k.startsWith("series/tt804:"), sources: k.startsWith("series/tt806:") ? 0 : 12 }]))));
    }
    const m = /\/tv\/(\d)\?/.exec(u);
    if (m) {
      const id = Number(m[1]);
      return new Response(JSON.stringify({ id, first_air_date: premiere[id], original_language: langue[id], external_ids: { imdb_id: id >= 7 ? null : `tt80${id}` },
        last_episode_to_air: { season_number: 1, episode_number: 3, air_date: jour(-2) },
        "watch/providers": { results: id === 2 ? { FR: { flatrate: [{ provider_name: "Netflix" }] } } : {} } }));
    }
    return new Response("{}");
  };
  const { ids } = await (await get("/tendances/series.json")).json();
  assert.deepEqual(ids.slice(0, 4), [2, 3, 4, 8]);
  assert.ok(![1, 5, 6, 7].some((id) => ids.slice(0, 20).includes(id)));
});

// StreamFusion (STREAMFUSION_URL, réglé sans anglais ni VOSTFR) décide de la VF pour la photo : 1 a des sources (VF) ;
// 2 « Aucun résultat, 6 exclus » (VO) → écarté ; 3 : StreamFusion ne répond pas → Torrentio (vf.json), qui a la VF.
test("photo_avec_streamfusion_et_torrentio_en_secours", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const film = (id) => ({ id, imdb_id: `tt97${id}`, original_language: "en",
    release_dates: { results: [{ iso_3166_1: "US", release_dates: [{ type: 3, release_date: jour(-80) + "T00:00:00.000Z" }, { type: 4, release_date: jour(-20) + "T00:00:00.000Z" }] }] } });
  const appels = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/trending/movie/day")) return new Response(JSON.stringify({ results: new URL(u).searchParams.get("page") === "1" ? [71, 72, 73].map((id) => ({ id, release_date: jour(-80), original_language: "en" })) : [] }));
    if (u.startsWith("https://sf.test/config/stream/")) {
      appels.push(u);
      if (u.includes("tt9773")) throw new Error("délai dépassé");
      return new Response(JSON.stringify({ streams: u.includes("tt9772")
        ? [{ name: "Stream-Fusion", title: "Aucun résultat trouvé, 6 exclus en raison du ou des paramètre(s) suivant(s) : exclusion langues (en, vostfr)" }]
        : [{ name: "instant / AllDebrid / (2160p)", title: "Film.2026.MULTi.VFF.2160p.WEB.DV.HDR" }, { name: "instant / AllDebrid / (1080p)", title: "Film.2026.MULTi.VFF.1080p.WEB" }] }));
    }
    if (u.includes("/vf.json")) return new Response(JSON.stringify({ "movie/tt9773": { vf: true, sources: 30 } }));
    const m = /\/movie\/(7\d)\?/.exec(u);
    if (m) return new Response(JSON.stringify(film(Number(m[1]))));
    return new Response("{}");
  };
  const { ids, q } = await (await get("/tendances/movie.json", { ...env, STREAMFUSION_URL: "https://sf.test/config/manifest.json" })).json();
  assert.deepEqual(ids.slice(0, 2), [71, 73]);
  // La qualité des sources VF de StreamFusion, publiée pour les affiches (pas pour 73, vu par Torrentio seulement).
  assert.deepEqual(q, { 71: { u: 1, x: "DV", p: 0, f: 1, a: 0 } });
  assert.ok(!ids.slice(0, 20).includes(72));
  assert.equal(appels.length, 3);
  // Torrentio d'abord pour tous (il n'est sûr d'aucun : pas de vff), puis StreamFusion.
  assert.ok(calls.some((u) => u.includes("/vf.json") && u.includes("tt9773") && u.includes("tt9771")));
});

// La photo publie l'avis VF des titres examinés (tmdbId → 1 ou 0) : les affiches s'en servent à la place de Torrentio.
test("photo_publie_l_avis_vf", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const film = (id) => ({ id, imdb_id: `tt96${id}`, original_language: "en",
    release_dates: { results: [{ iso_3166_1: "US", release_dates: [{ type: 3, release_date: jour(-80) + "T00:00:00.000Z" }, { type: 4, release_date: jour(-20) + "T00:00:00.000Z" }] }] } });
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/trending/movie/day")) return new Response(JSON.stringify({ results: new URL(u).searchParams.get("page") === "1" ? [61, 62].map((id) => ({ id, release_date: jour(-80), original_language: "en" })) : [] }));
    if (u.includes("/vf.json")) return new Response(JSON.stringify({ "movie/tt9661": { vf: true, sources: 9 }, "movie/tt9662": { vf: false, sources: 14 } }));
    const m = /\/movie\/(6\d)\?/.exec(u);
    if (m) return new Response(JSON.stringify(film(Number(m[1]))));
    return new Response("{}");
  };
  const d = await (await get("/tendances/movie.json")).json();
  assert.deepEqual(d.vf, { 61: 1, 62: 0 });
  // Le même avis par identifiant IMDb, pour les rangées et les fiches (il se perdait en route avant le 27 octobre).
  assert.deepEqual(d.vfi, { tt9661: 1, tt9662: 0 });
  assert.deepEqual(d.ids.slice(0, 2), [61, 0]);
});

// Films : beaucoup encore au cinéma (un sur quatre seulement regardable en VF ici). La photo les examine par lots de 20,
// chaque lot dans un appel de l'addon à lui-même (SELF, son budget de 50 appels), jusqu'à remplir les 20 N° : 4 lots
// sur les 5 pages de TMDB. Sans la clé de l'instance, /tendances/tri refuse (StreamFusion ne se dépense pas d'ailleurs).
test("photo_des_films_remplie_par_lots", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const regardable = (id) => id % 4 === 0;
  const date = (type, d, pays) => ({ iso_3166_1: pays, release_dates: [{ type, release_date: jour(d) + "T00:00:00.000Z" }] });
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/trending/movie/day")) {
      const p = Number(new URL(u).searchParams.get("page"));
      return new Response(JSON.stringify({ results: Array.from({ length: 20 }, (_, k) => 1000 + (p - 1) * 20 + k)
        .map((id) => ({ id, release_date: regardable(id) ? jour(-80) : jour(-5), original_language: "en" })) }));
    }
    if (u.includes("/vf.json")) return new Response(JSON.stringify(Object.fromEntries((new URL(u).searchParams.get("v") || "").split(",").map((k) => [k, { vf: true, sources: 5 }]))));
    const m = /\/movie\/(\d+)\?/.exec(u);
    if (m) {
      const id = Number(m[1]);
      return new Response(JSON.stringify({ id, imdb_id: `tt5${id}`, original_language: "en", release_dates: { results: regardable(id)
        ? [date(3, -80, "US"), date(4, -20, "US")] : [date(3, -5, "FR")] } }));
    }
    return new Response("{}");
  };
  const lots = [];
  const e = { ...env };
  e.SELF = { fetch: (url, init) => { lots.push(init.headers["x-tri"]); return worker.fetch(new Request(url, init), e, ctx); } };
  const { ids } = await (await get("/tendances/movie.json", e)).json();
  const attendus = Array.from({ length: 100 }, (_, k) => 1000 + k).filter(regardable).slice(0, 20);
  assert.deepEqual(ids.slice(0, 20), attendus);
  assert.equal(lots.length, 4);
  assert.ok(lots.every((h) => h && h === lots[0]));
  const refus = await worker.fetch(new Request("https://x/tendances/tri", { method: "POST", headers: { "x-tri": "faux" },
    body: JSON.stringify({ items: [{ id: 1000, release_date: jour(-80), original_language: "en" }] }) }), e, ctx);
  assert.deepEqual(await refus.json(), { error: "interdit" });
});
