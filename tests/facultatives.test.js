// Collections facultatives : absentes par défaut, rangées de l'addon (lauréats, moins de 1 h 30, mini-séries),
// identifiant de l'addon d'une copie, retrait du compte Nuvio quand on les décoche.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";
import { decodeConfig, defaults, COLLECTIONS, FACULTATIVES } from "../worker/config.js";
import { fusionCollections } from "../worker/compte-nuvio.js";
import { resetFails } from "../worker/hote.js";

const rows = [{ id: "a", home: true }];
const seg = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const ctx = { waitUntil: () => {} };
const env = { TMDB_API_KEY: "tmdb" };
const SOURCE = "https://nuvio-assets.xnzxflix.workers.dev";
const AWARDS = { oscars: Array.from({ length: 25 }, (_, i) => ({ id: 100 + i, title: `Film ${i}`, poster_path: `/p${i}.jpg`,
  release_date: "2020-01-01", vote_count: 10, genre_ids: i < 3 ? [27] : [18] })) };   // les 3 premiers : horreur
const COLLS = [
  { id: "genres", title: "Genres", folders: [{ id: "g", title: "G" }] },
  { id: "recompenses", title: "Récompenses", folders: [{ id: "prix-oscars", title: "Oscars", sources: [
    { provider: "addon", addonId: "com.xnzx07.catalogue-fr", type: "movie", catalogId: "fac-oscars" }] },
    { id: "essai", title: "Essai", sources: [
      { provider: "tmdb", tmdbSourceType: "PERSON", tmdbId: 6193, mediaType: "MOVIE", sortBy: "popularity.desc", filters: {} },
      { provider: "tmdb", tmdbSourceType: "DIRECTOR", tmdbId: 525, mediaType: "MOVIE", sortBy: "popularity.desc", filters: {} },
      { provider: "tmdb", tmdbSourceType: "DISCOVER", mediaType: "TV", sortBy: "popularity.desc",
        filters: { withKeywords: "13042", withOriginCountry: "SE|DK", withNetworks: "213" } }] }] },
];

let calls;
beforeEach(() => {
  calls = [];
  resetFails();
  const store = new Map();
  globalThis.caches = { default: {
    match: async (req) => (store.has(req.url) ? new Response(store.get(req.url)) : undefined),
    put: async (req, res) => { store.set(req.url, await res.text()); },
  } };
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    const credits = { cast: [{ id: 1, title: "Titanic", poster_path: "/t.jpg", popularity: 5 }, { id: 2, title: "Inception", popularity: 9 }],
      crew: [{ id: 3, title: "Interstellar", job: "Director", popularity: 7 }, { id: 4, title: "Autre", job: "Writer" }] };
    const rocky = { id: 1575, name: "Rocky - Saga", parts: [
      { id: 1374, title: "Rocky Balboa", release_date: "2006-12-20" }, { id: 1366, title: "Rocky", release_date: "1976-11-21" },
      { id: 1367, title: "Rocky II", release_date: "1979-06-15" }, { id: 9999, title: "Rocky VII", release_date: "" }] };
    const body = u.includes("/collection/1575") ? rocky : u.endsWith("/data/recompenses.json") ? AWARDS : u.endsWith("/collections/collections.json") ? COLLS
      : u.includes("_credits") ? credits
      : u.includes("/external_ids") || u.includes("/movie/1") ? { imdb_id: "tt1", id: 1 } : { results: [], page: 1, total_pages: 1 };
    return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  };
});
const get = (origin, path) => worker.fetch(new Request(`${origin}${path}`), env, ctx);
const ids = (n) => COLLECTIONS.map((c) => c.id).slice(0, n);

test("facultatives_absentes_par_defaut", () => {
  assert.ok(FACULTATIVES.length >= 14);
  assert.deepEqual(defaults(rows, []).c, COLLECTIONS.filter((c) => !c.optional).map((c) => c.id));
  assert.ok(!decodeConfig("", rows, []).c.some((id) => FACULTATIVES.includes(id)));
  // Lien d'avant avec un masque à 5 collections (dont une décochée) : aucune facultative.
  assert.deepEqual(decodeConfig(seg({ c: 0b11011 }), rows, []).c, ["plateformes-streaming", "envies", "sagas", "studios"]);
  // Cochée : son bit (position dans COLLECTIONS) est lu.
  const pos = COLLECTIONS.findIndex((c) => c.id === "recompenses");
  assert.ok(decodeConfig(seg({ c: 0b11111 | (1 << pos) }), rows, []).c.includes("recompenses"));
  // Les facultatives sont en fin de liste : les positions des liens d'avant ne bougent pas.
  assert.deepEqual(ids(5), ["plateformes-streaming", "envies", "genres", "sagas", "studios"]);
});

test("rangees_de_l_addon_seulement_si_cochees", async () => {
  const catalogs = async (cfg) => (await (await get(SOURCE, `/${seg(cfg)}/manifest.json`)).json()).catalogs.map((c) => c.id);
  assert.ok(!(await catalogs({})).includes("fac-oscars"));
  const pos = COLLECTIONS.findIndex((c) => c.id === "recompenses");
  const avec = await catalogs({ c: 0b11111 | (1 << pos) });
  assert.ok(avec.includes("fac-oscars") && avec.includes("fac-cesars"));
  assert.ok(!avec.includes("fac-moins-90"));                       // « Selon le temps » n'est pas cochée
});

test("page_de_laureats", async () => {
  const res = await get(SOURCE, "/catalog/movie/fac-oscars.json");
  const { metas } = await res.json();
  assert.equal(metas.length, 20);
  const suite = (await (await get(SOURCE, "/catalog/movie/fac-oscars/skip=20.json")).json()).metas;
  assert.equal(suite.length, 5);
  assert.ok(calls.some((u) => u.endsWith("/data/recompenses.json")));
});

test("rangees_addon_de_la_copie", async () => {
  const pos = COLLECTIONS.findIndex((c) => c.id === "recompenses");
  const cfg = seg({ c: 0b11111 | (1 << pos) });
  const source = async (origin) => (await (await get(origin, `/${cfg}/collections.json`)).json())
    .find((c) => c.id === "recompenses").folders[0].sources[0].addonId;
  assert.equal(await source(SOURCE), "com.xnzx07.catalogue-fr");
  assert.equal(await source("https://ma-copie.example"), "com.xnzx07.catalogue-fr.perso");
});

test("facultative_decochee_retiree", () => {
  // Le compte avait « decennies » (cochée avant) et une collection perso ; elle est décochée maintenant.
  const avant = [{ id: "decennies" }, { id: "perso" }];
  const nos = [{ id: "genres" }];
  const liste = fusionCollections(avant, nos, ["genres", ...FACULTATIVES]);
  assert.deepEqual(liste.map((c) => c.id), ["genres", "perso"]);
});

// Aperçu du site (/dossier/…) : comme Nuvio TV, filmographie, mots-clés, pays, chaînes, rangées de l'addon.
const apercu = async (n) => {
  const pos = COLLECTIONS.findIndex((c) => c.id === "recompenses");
  return (await get(SOURCE, `/${seg({ c: 0b11111 | (1 << pos) })}/dossier/recompenses/${n === "addon" ? "prix-oscars/0" : `essai/${n}`}.json`)).json();
};

test("apercu_filmographie_d_une_personne", async () => {
  const { metas } = await apercu(0);
  assert.deepEqual(metas.map((m) => m.name), ["Inception", "Titanic"]);          // la plus populaire d'abord
  assert.ok(calls.some((u) => u.includes("/person/6193/movie_credits")));
});

test("apercu_films_d_un_realisateur", async () => {
  const { metas } = await apercu(1);
  assert.deepEqual(metas.map((m) => m.name), ["Interstellar"]);
});

test("apercu_mots_cles_pays_chaines", async () => {
  await apercu(2);
  const u = calls.find((x) => x.includes("/discover/tv"));
  assert.match(u, /with_keywords=13042/);
  assert.match(u, /with_origin_country=SE%7CDK/);
  assert.match(u, /with_networks=213/);
});

test("apercu_rangee_de_l_addon", async () => {
  const { metas } = await apercu("addon");
  assert.equal(metas.length, 20);
});

test("laureats_suivent_les_filtres", async () => {
  // Mode famille : ni horreur ni thriller (mêmes règles que les autres rangées).
  const { metas } = await (await get(SOURCE, `/${seg({ f: 1 })}/catalog/movie/fac-oscars.json`)).json();
  assert.equal(metas.length, 20);
  assert.ok(!metas.some((m) => ["Film 0", "Film 1", "Film 2"].includes(m.name)));
});

// Sagas : TMDB rend certaines sagas dans le désordre (Rocky Balboa avant Rocky) et Nuvio ne sait pas trier du plus
// ancien au plus récent : l'addon sert chaque saga dans l'ordre de sortie (catalogue « saga », genre = la saga).
test("saga_dans_l_ordre_de_sortie", async () => {
  const { metas } = await (await get(SOURCE, "/catalog/movie/saga/genre=Rocky.json")).json();
  assert.deepEqual(metas.map((m) => m.name), ["Rocky", "Rocky II", "Rocky Balboa", "Rocky VII"]);   // sans date : à la fin
});

// Un catalogue par saga servie par l'addon : Nuvio TV reconnaît une rangée à son catalogue (titre, défilement,
// « Charger plus »). Avec le seul catalogue « saga », les rangées d'un thème s'appelaient toutes « Saga » et défilaient
// ensemble.
test("un_catalogue_par_saga", async () => {
  const cats = (await (await get(SOURCE, `/${seg({})}/manifest.json`)).json()).catalogs;
  const rocky = cats.find((c) => c.id === "saga-1575");
  assert.deepEqual(rocky && { type: rocky.type, name: rocky.name, showInHome: rocky.showInHome }, { type: "movie", name: "Rocky", showInHome: false });
  // Un filtre exigé : l'appli Nuvio sur ordinateur ignore showInHome et met sur l'accueil tout catalogue sans filtre
  // exigé (les 53 sagas y étaient). Les collections le donnent (genre « Saga »).
  assert.deepEqual(rocky.extra, [{ name: "genre", isRequired: true, options: ["Saga"] }, { name: "skip" }]);
  assert.deepEqual(rocky.extraRequired, ["genre"]);
  assert.ok(!cats.some((c) => c.id === "saga-119"));   // Le Seigneur des anneaux : dans l'ordre chez TMDB, lu en direct
  const { metas } = await (await get(SOURCE, "/catalog/movie/saga-1575/genre=Saga.json")).json();
  assert.deepEqual(metas.map((m) => m.name), ["Rocky", "Rocky II", "Rocky Balboa", "Rocky VII"]);
  assert.deepEqual((await (await get(SOURCE, "/catalog/movie/saga-424242.json")).json()).metas, []);
});

test("catalogue_des_sagas_dans_le_manifest", async () => {
  const cat = async (cfg) => (await (await get(SOURCE, `/${seg(cfg)}/manifest.json`)).json()).catalogs.find((c) => c.id === "saga");
  const saga = await cat({});
  assert.ok(saga && saga.extra[0].name === "genre" && saga.extra[0].options.includes("Rocky"));
  assert.equal(saga.showInHome, false);
  const sansSagas = COLLECTIONS.filter((c) => !c.optional && c.id !== "sagas").reduce((m, c) => m | (1 << COLLECTIONS.indexOf(c)), 0);
  assert.equal(await cat({ c: sansSagas }), undefined);
  // Grands univers cochés sans Sagas : le catalogue est là aussi (leurs sagas passent par lui).
  assert.ok(await cat({ c: sansSagas | (1 << COLLECTIONS.findIndex((c) => c.id === "univers")) }));
});
