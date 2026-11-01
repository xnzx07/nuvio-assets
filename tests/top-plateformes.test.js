// Le top des plateformes : une lecture par jour, l'ordre de l'API sans trous ni ajouts, la liste d'avant si l'API échoue.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";
import { TOPS, prendreTops, listeDuTop } from "../worker/top-plateformes.js";
import { COLLECTIONS } from "../worker/config.js";

const JOUR = Date.UTC(2026, 10, 2, 5);
const AUJOURDHUI = new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 10);
const ctx = { waitUntil: () => {} };
const SOURCE = "https://nuvio-assets.xnzxflix.workers.dev";
const seg = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

/** Base simulée de la table tops. */
function baseTops(depart = []) {
  const lignes = new Map(depart);
  const stmt = (sql, a = []) => ({
    bind: (...x) => stmt(sql, x),
    async run() {
      if (sql.startsWith("INSERT OR IGNORE")) { if (!lignes.has(a[0])) lignes.set(a[0], a[1]); }
      if (sql.startsWith("DELETE")) for (const j of [...lignes.keys()]) if (j < a[0]) lignes.delete(j);
      return {};
    },
    async first() {
      const j = [...lignes.keys()].sort().pop();
      return j ? { j, tops: lignes.get(j) } : null;
    },
  });
  return { lignes, prepare: (sql) => stmt(sql) };
}

let api, reponse, fiches, collections;
const rep = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
beforeEach(() => {
  api = [];
  fiches = {};
  collections = [];
  reponse = (u) => { const t = u.searchParams.get("show_type") === "series" ? "tv" : "movie"; return rep([{ tmdbId: `${t}/3` }, { tmdbId: `${t}/1` }, { title: "sans identifiant" }, { tmdbId: `${t}/2` }]); };
  const store = new Map();
  globalThis.caches = { default: {
    match: async (req) => (store.has(req.url) ? new Response(store.get(req.url)) : undefined),
    put: async (req, res) => { store.set(req.url, await res.text()); },
  } };
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.hostname === "api.movieofthenight.com") { api.push({ u, cle: init.headers["X-API-Key"] }); return reponse(u); }
    if (u.pathname.endsWith("/collections/collections.json")) return rep(collections);
    const m = /\/3\/(movie|tv)\/(\d+)$/.exec(u.pathname);
    if (m && fiches[m[2]] !== undefined) return fiches[m[2]] ? rep(fiches[m[2]]) : new Response("{}", { status: 500 });
    return rep({});
  };
});
const film = (id, extra = {}) => ({ id, title: `Film ${id}`, release_date: "1999-01-01", original_language: "en", genres: [{ id: 18 }], vote_average: 8,
  release_dates: { results: [{ iso_3166_1: "US", release_dates: [{ type: 4, release_date: "1999-06-01T00:00:00.000Z" }] }] }, ...extra });
const env = (lignes) => ({ TMDB_API_KEY: "tmdb", TOP_10_KEY: "cle", LIENS: baseTops(lignes) });
const uneListe = (ids, j = "2026-11-02") => Object.fromEntries(TOPS.map((t) => [t.id, { j, ids }]));
const duJour = (ids) => [[AUJOURDHUI, JSON.stringify(uneListe(ids, AUJOURDHUI))]];

test("douze_listes_une_fois_par_jour", async () => {
  const e = env();
  await prendreTops(e, JOUR);
  assert.equal(api.length, 12);
  assert.ok(api.every((a) => a.cle === "cle" && a.u.pathname === "/v4/shows/top" && a.u.searchParams.get("country") === "fr"));
  await prendreTops(e, JOUR + 3600000);
  assert.equal(api.length, 12, "déjà prise : aucun appel de plus");
  // L'ordre de l'API ; ce qui n'a pas d'identifiant ne laisse pas de trou.
  assert.deepEqual(await listeDuTop(e, "top-netflix-films", JOUR), [3, 1, 2]);
});

test("sans_cle_aucun_appel", async () => {
  await prendreTops({ LIENS: baseTops() }, JOUR);
  await prendreTops({ TOP_10_KEY: "cle" }, JOUR);
  assert.equal(api.length, 0);
});

test("tache_planifiee_lit_les_listes", async () => {
  const attentes = [];
  await worker.scheduled({ scheduledTime: JOUR }, env(), { waitUntil: (p) => attentes.push(p) });
  await Promise.all(attentes);
  assert.equal(api.length, 12);
});

test("liste_en_echec_celle_d_avant_entiere", async () => {
  const e = env([["2026-11-01", JSON.stringify(uneListe([7, 8, 9], "2026-11-01"))]]);
  reponse = (u) => (u.searchParams.get("service") === "prime" ? new Response("{}", { status: 500 })
    : u.searchParams.get("service") === "disney" ? rep([]) : rep([{ tmdbId: u.searchParams.get("show_type") === "series" ? "tv/1" : "movie/1" }]));
  await prendreTops(e, JOUR);
  assert.deepEqual(await listeDuTop(e, "top-prime-films", JOUR), [7, 8, 9]);
  assert.deepEqual(await listeDuTop(e, "top-disney-series", JOUR), [7, 8, 9]);
  assert.deepEqual(await listeDuTop(e, "top-netflix-films", JOUR), [1]);
});

test("api_en_panne_pas_de_ligne_vide", async () => {
  const e = env([["2026-11-01", JSON.stringify(uneListe([7], "2026-11-01"))]]);
  reponse = () => new Response("{}", { status: 429 });
  await prendreTops(e, JOUR);
  assert.deepEqual([...e.LIENS.lignes.keys()], ["2026-11-01"]);
  assert.deepEqual(await listeDuTop(e, "top-apple-films", JOUR), [7]);
});

test("trop_vieille_plus_rien", async () => {
  const e = env([["2026-10-20", JSON.stringify(uneListe([7], "2026-10-20"))]]);
  assert.deepEqual(await listeDuTop(e, "top-apple-films", JOUR), []);
  reponse = (u) => (u.searchParams.get("service") === "apple" ? rep([]) : rep([{ tmdbId: u.searchParams.get("show_type") === "series" ? "tv/1" : "movie/1" }]));
  await prendreTops(e, JOUR);
  assert.equal(JSON.parse(e.LIENS.lignes.get("2026-11-02"))["top-apple-films"], undefined);
});

const lireCatalogues = async (chemin) => (await (await worker.fetch(new Request(`${SOURCE}${chemin}/manifest.json`), env(), ctx)).json()).catalogs;

test("manifest_plateformes_cochees_en_france", async () => {
  const ids = (cats) => cats.filter((c) => c.id.startsWith("top-")).map((c) => c.id);
  assert.deepEqual(ids(await lireCatalogues(`/${seg({ p: [0, 7] })}`)), ["top-netflix-films", "top-netflix-series"]);  // Netflix, Crunchyroll
  assert.deepEqual(ids(await lireCatalogues(`/${seg({ p: [0], g: "BE" })}`)), []);                                        // Belgique
});

test("manifest_filtre_exige", async () => {
  const c = (await lireCatalogues("")).find((x) => x.id === "top-netflix-series");
  assert.equal(c.type, "series");
  assert.equal(c.showInHome, false);
  assert.deepEqual(c.extraRequired, ["genre"]);
  assert.deepEqual(c.extra[0].options, ["Top"]);
});

const rangee = async (e, id, q = "") => (await (await worker.fetch(new Request(`${SOURCE}${q}/catalog/movie/${id}/genre=Top.json`), e, ctx)).json()).metas;

test("rangee_dans_l_ordre_sans_trous_ni_ajouts", async () => {
  fiches = { 3: film(3), 1: film(1), 2: film(2, { release_date: "2999-01-01" }) };   // 2 : pas encore sorti
  const e = env(duJour([3, 1, 2]));
  assert.deepEqual((await rangee(e, "top-netflix-films")).map((m) => m.name), ["Film 3", "Film 1"]);
  // Pas de page 2.
  const suite = await (await worker.fetch(new Request(`${SOURCE}/catalog/movie/top-netflix-films/genre=Top&skip=20.json`), e, ctx)).json();
  assert.deepEqual(suite.metas, []);
});

test("rangee_vide_sans_liste", async () => {
  assert.deepEqual(await rangee(env(), "top-netflix-films"), []);
});

test("rangee_suit_les_filtres_du_lien", async () => {
  fiches = { 3: film(3, { genres: [{ id: 27 }] }), 1: film(1) };
  const e = env(duJour([3, 1]));
  assert.deepEqual((await rangee(e, "top-netflix-films", `/${seg({ f: 1 })}`)).map((m) => m.name), ["Film 1"]);
});

test("fiche_pas_lue_page_pas_gardee", async () => {
  fiches = { 3: film(3), 1: null };
  const e = env(duJour([3, 1]));
  assert.deepEqual((await rangee(e, "top-netflix-films")).map((m) => m.name), ["Film 3"]);
  fiches = { 3: film(3), 1: film(1) };
  assert.deepEqual((await rangee(e, "top-netflix-films")).map((m) => m.name), ["Film 3", "Film 1"]);
});

test("autre_pays_rangee_vide", async () => {
  fiches = { 3: film(3) };
  assert.deepEqual(await rangee(env(duJour([3])), "top-netflix-films", `/${seg({ g: "BE" })}`), []);
});

test("collections_sans_top_hors_de_france", async () => {
  collections = [{ id: "plateformes-streaming", title: "P", folders: [{ id: "netflix", title: "Netflix", sources: [
    { provider: "addon", addonId: "com.xnzx07.catalogue-fr", type: "movie", catalogId: "top-netflix-films", genre: "Top" },
    { provider: "tmdb", tmdbSourceType: "DISCOVER", mediaType: "MOVIE", filters: { watchRegion: "FR", withWatchProviders: "8" } }] }] }];
  const sources = async (o) => (await (await worker.fetch(new Request(`${SOURCE}/${seg(o)}/collections.json`), env(), ctx)).json())
    .find((c) => c.id === "plateformes-streaming").folders[0].sources;
  const c = 2 ** COLLECTIONS.findIndex((x) => x.id === "plateformes-streaming");
  assert.equal((await sources({ c, p: [0] })).length, 2);
  assert.deepEqual((await sources({ c, p: [0], g: "BE" })).map((s) => s.provider), ["tmdb"]);
});

test("chaque_top_est_en_tete_de_sa_tuile", async () => {
  const { readFileSync } = await import("node:fs");
  const dossiers = JSON.parse(readFileSync(new URL("../collections/collections.json", import.meta.url), "utf8")).find((c) => c.id === "plateformes-streaming").folders;
  const cats = await lireCatalogues(`/${seg({ p: [0, 1, 2, 3, 4, 5] })}`);
  const tops = dossiers.flatMap((f) => (f.sources || []).filter((s) => s.provider === "addon" && s.catalogId.startsWith("top-")));
  assert.equal(tops.length, TOPS.length);
  for (const s of tops) {
    const cat = cats.find((c) => c.id === s.catalogId && c.type === s.type);
    assert.ok(cat, s.catalogId);
    assert.ok(cat.extra[0].options.includes(s.genre));
  }
  for (const f of dossiers.filter((d) => (d.sources || []).some((s) => s.provider === "addon"))) {
    assert.deepEqual(f.sources.slice(0, 2).map((s) => s.type), ["movie", "series"], f.id);
    assert.ok(f.sources.slice(2).every((s) => s.provider === "tmdb"), f.id);
  }
});
