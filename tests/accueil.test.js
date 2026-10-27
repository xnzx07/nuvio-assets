// L'ordre de l'accueil choisi sur le site : collections placées entre les rangées du Catalogue FR (champ « ac » du
// lien), servi sur /accueil.json et écrit dans le compte Nuvio (réglages de l'accueil, sync_push_home_catalog_settings).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";
import { decodeConfig, COLLECTIONS } from "../worker/config.js";
import { fusionAccueil } from "../worker/compte-nuvio.js";
import { resetFails } from "../worker/hote.js";

const rows = [{ id: "a", home: true }, { id: "b", home: true }];
const seg = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const pos = (id) => COLLECTIONS.findIndex((c) => c.id === id);
const ctx = { waitUntil: () => {} };
const env = { TMDB_API_KEY: "tmdb" };
const SOURCE = "https://nuvio-assets.xnzxflix.workers.dev";
const tuile = { id: "t", title: "T", sources: [] };
const COLLS = [
  { id: "plateformes-streaming", title: "Plateformes", pinToTop: true, folders: [tuile] },
  { id: "genres", title: "Genres", folders: [tuile] },
  { id: "envies", title: "Envies", folders: [tuile] },
  { id: "sagas", title: "Sagas", folders: [tuile] },
  { id: "studios", title: "Studios", folders: [tuile] },
];

beforeEach(() => {
  resetFails();
  const store = new Map();
  globalThis.caches = { default: {
    match: async (req) => (store.has(req.url) ? new Response(store.get(req.url)) : undefined),
    put: async (req, res) => { store.set(req.url, await res.text()); },
  } };
  globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).endsWith("/collections/collections.json") ? COLLS : { results: [] }),
    { headers: { "Content-Type": "application/json" } });
});
const get = async (path) => (await worker.fetch(new Request(`${SOURCE}${path}`), env, ctx)).json();
const rangees = async (cfg) => (await get(`/${seg(cfg)}/manifest.json`)).catalogs.filter((c) => c.showInHome).map((c) => ({ type: c.type, id: c.id }));

test("lien_place_des_collections", () => {
  const cfg = decodeConfig(seg({ ac: [[pos("sagas"), 2], [pos("genres"), 0], [999, 1], [pos("envies"), -3], "x"] }), rows, []);
  assert.deepEqual(cfg.ac, [{ id: "sagas", n: 2 }, { id: "genres", n: 0 }]);
  assert.deepEqual(decodeConfig("", rows, []).ac, []);
  assert.deepEqual(decodeConfig(seg({ c: 1 }), rows, []).ac, []);
});

test("accueil_par_defaut_plateformes_rangees_puis_collections", async () => {
  const cfg = { c: 0b11111 };
  const r = await rangees(cfg);
  const a = await get(`/${seg(cfg)}/accueil.json`);
  assert.equal(a.addon, "com.xnzx07.catalogue-fr");
  assert.deepEqual(a.ordre, [{ collection: "plateformes-streaming" }, ...r,
    { collection: "genres" }, { collection: "envies" }, { collection: "sagas" }, { collection: "studios" }]);
});

test("accueil_collections_placees_entre_les_rangees", async () => {
  const cfg = { c: 0b11111, ac: [[pos("sagas"), 1], [pos("genres"), 0], [pos("studios"), 1]] };
  const r = await rangees(cfg);
  assert.ok(r.length >= 2);
  const a = await get(`/${seg(cfg)}/accueil.json`);
  assert.deepEqual(a.ordre, [{ collection: "plateformes-streaming" }, { collection: "genres" }, r[0],
    { collection: "sagas" }, { collection: "studios" }, ...r.slice(1), { collection: "envies" }]);
});

test("fusion_avec_les_reglages_du_compte", () => {
  const ADDON = "com.xnzx07.catalogue-fr";
  const ordre = [{ collection: "plateformes-streaming" }, { type: "movie", id: "accueil-top10" }, { collection: "sagas" }, { type: "series", id: "accueil-tendances-series" }];
  const distants = [
    { addon_id: "autre.addon", type: "movie", catalog_id: "pop", enabled: false, order: 0, custom_title: "", is_collection: false, collection_id: "" },
    { addon_id: "", type: "", catalog_id: "", enabled: true, order: 1, custom_title: "", is_collection: true, collection_id: "ma-collection" },
    { addon_id: ADDON, type: "movie", catalog_id: "accueil-top10", enabled: true, order: 2, custom_title: "Top", is_collection: false, collection_id: "" },
    { addon_id: "", type: "", catalog_id: "", enabled: true, order: 3, custom_title: "", is_collection: true, collection_id: "sagas" },
  ];
  const items = fusionAccueil(distants, ordre, ADDON);
  const cle = (it) => (it.is_collection ? "c:" + it.collection_id : `${it.addon_id}/${it.type}/${it.catalog_id}`);
  assert.deepEqual(items.map(cle), ["c:plateformes-streaming", `${ADDON}/movie/accueil-top10`, "c:sagas", `${ADDON}/series/accueil-tendances-series`,
    "autre.addon/movie/pop", "c:ma-collection"]);
  assert.deepEqual(items.map((it) => it.order), [0, 1, 2, 3, 4, 5]);
  // Ce que la personne a réglé dans Nuvio reste : rangée masquée, titre renommé.
  assert.equal(items[1].custom_title, "Top");
  assert.equal(items[4].enabled, false);
  assert.ok(items.slice(0, 4).every((it) => it.enabled));
  assert.deepEqual(items[0], { addon_id: "", type: "", catalog_id: "", enabled: true, order: 0, custom_title: "", is_collection: true, collection_id: "plateformes-streaming" });
  // Rien dans le compte : notre ordre seul.
  assert.equal(fusionAccueil(null, ordre, ADDON).length, 4);
});
