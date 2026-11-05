import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";

// Base D1 simulée : juste les requêtes de fixe.js.
function fakeD1() {
  const rows = new Map();
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    async run() {
      if (sql.startsWith("CREATE")) return {};
      if (sql.startsWith("UPDATE liens SET vu")) return {};   // lecture par Nuvio notée (voir recu.test.js)
      if (sql.startsWith("INSERT")) { const [h, c, e, t] = args; rows.set(h, { c, e, t }); return {}; }
      if (sql.startsWith("UPDATE")) { const [c, t, h] = args; rows.set(h, { ...rows.get(h), c, t }); return {}; }
      throw new Error("requête inattendue : " + sql);
    },
    async first() {
      const r = rows.get(args[0]);
      if (!r) return null;
      return sql.startsWith("SELECT c, e") ? { c: r.c, e: r.e } : { e: r.e };
    },
  });
  return { rows, prepare: (sql) => stmt(sql) };
}

let store, env;
beforeEach(() => {
  store = new Map();
  globalThis.caches = {
    default: {
      match: async (req) => (store.has(req.url) ? new Response(store.get(req.url)) : undefined),
      put: async (req, res) => { store.set(req.url, await res.text()); },
    },
  };
  globalThis.fetch = async (url) => new Response(String(url).endsWith("collections.json") ? "[]" : JSON.stringify({ results: [] }));
  env = { TMDB_API_KEY: "tmdb", LIENS: fakeD1() };
});
const ctx = { waitUntil: () => {} };
const O = "https://nuvio-assets.xnzxflix.workers.dev";
const at = (path, init) => worker.fetch(new Request(O + path, init), env, ctx);
const post = (path, body) => at(path, { method: "POST", headers: { "Content-Type": "application/json", Origin: O }, body: JSON.stringify(body) });
const seg = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");

test("lien_fixe_cree_puis_lu_par_nuvio", async () => {
  const res = await post("/lien-fixe", { c: seg({ n: "Salon", k: "AIzaSyCleSecreteDeTest0123456789abcdefg" }) });
  assert.equal(res.status, 200);
  const { id, modif } = await res.json();
  assert.match(id, /^f[0-9A-Za-z]{16}$/);
  assert.match(modif, /^[0-9A-Za-z]{22}$/);
  const m = await (await at(`/${id}/manifest.json`)).json();
  assert.equal(m.name, "Salon");
  // Rien de lisible dans la base : ni l'identifiant, ni les réglages, ni la clé Gemini.
  const dump = JSON.stringify([...env.LIENS.rows]);
  for (const s of [id, modif, "Salon", "AIzaSy", seg({ n: "Salon" }).slice(0, 8)]) assert.ok(!dump.includes(s), s);
});

test("lien_fixe_modifie_sans_changer_d_adresse", async () => {
  const { id, modif } = await (await post("/lien-fixe", { c: seg({ n: "Avant" }) })).json();
  assert.equal((await (await at(`/${id}/manifest.json`)).json()).name, "Avant");
  const res = await post(`/lien-fixe/${id}`, { c: seg({ n: "Après" }), modif });
  assert.equal(res.status, 200);
  assert.equal((await (await at(`/${id}/manifest.json`)).json()).name, "Après");
});

test("lien_fixe_refuse_sans_la_bonne_cle", async () => {
  const { id } = await (await post("/lien-fixe", { c: seg({ n: "A moi" }) })).json();
  const res = await post(`/lien-fixe/${id}`, { c: seg({ n: "Pirate" }), modif: "x".repeat(22) });
  assert.equal(res.status, 403);
  assert.equal((await (await at(`/${id}/manifest.json`)).json()).name, "A moi");
});

test("lien_fixe_reglages_par_defaut", async () => {
  const { id } = await (await post("/lien-fixe", { c: "" })).json();
  assert.equal((await (await at(`/${id}/manifest.json`)).json()).name, "Catalogue FR");
  const page = await at(`/${id}/configure`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), new RegExp(`"fixed":"${id}"`));
  assert.equal(page.headers.get("Cache-Control"), "no-store");
});

// Les rangées d'un lien fixe gardent leur adresse quand ses réglages changent : 30 min dans Nuvio seulement
// (« Actualiser les addons » doit suivre) ; celles d'un lien habituel, 1 h.
test("lien_fixe_rangees_gardees_peu_de_temps_par_nuvio", async () => {
  const { id } = await (await post("/lien-fixe", { c: "" })).json();
  assert.equal((await at(`/${id}/catalog/movie/accueil-top10.json`)).headers.get("Cache-Control"), "public, max-age=1800");
  assert.equal((await at(`/catalog/movie/accueil-top10.json`)).headers.get("Cache-Control"), "public, max-age=3600, stale-while-revalidate=3600");
  assert.equal((await at(`/${seg({ n: "X" })}/catalog/movie/accueil-top10.json`)).headers.get("Cache-Control"), "public, max-age=3600, stale-while-revalidate=3600");
});

test("lien_fixe_inconnu", async () => {
  const res = await at("/f0123456789abcdef/manifest.json");
  assert.match((await res.json()).error, /introuvable/);
  const page = await at("/f0123456789abcdef/configure");
  assert.equal(page.status, 302);
  assert.equal(page.headers.get("Location"), O + "/configure");
});

test("lien_fixe_reglages_illisibles_refuses", async () => {
  assert.equal((await post("/lien-fixe", { c: "pas-du-base64-json" })).status, 400);
  assert.equal((await post("/lien-fixe", { c: "a".repeat(7000) })).status, 400);
});

test("lien_fixe_depuis_un_autre_site_refuse", async () => {
  const res = await at("/lien-fixe", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://ailleurs.exemple" }, body: JSON.stringify({ c: "" }) });
  assert.equal(res.status, 403);
});

// La base qui ne répond pas : jamais « introuvable » (on referait son lien et perdrait l'ancien), rien de gardé.
test("lien_fixe_base_en_panne_pas_introuvable", async () => {
  env.LIENS.prepare = () => ({ bind: () => ({ first: async () => { throw new Error("D1_ERROR: network connection lost"); } }) });
  for (const path of ["/manifest.json", "/catalog/movie/accueil-top10.json", "/configure", ""]) {
    const res = await at(`/f0123456789abcdef${path}`);
    assert.equal(res.status, 503, path);
    assert.equal(res.headers.get("Cache-Control"), "no-store", path);
    assert.doesNotMatch(await res.text(), /introuvable/, path);
  }
});

test("lien_fixe_table_absente_introuvable", async () => {
  env.LIENS.prepare = () => ({ bind: () => ({ first: async () => { throw new Error("D1_ERROR: no such table: liens: SQLITE_ERROR"); } }) });
  assert.match((await (await at("/f0123456789abcdef/manifest.json")).json()).error, /introuvable/);
});

test("lien_fixe_copie_de_secours_si_la_base_ne_repond_pas", async () => {
  const { id } = await (await post("/lien-fixe", { c: seg({ n: "Secours" }) })).json();
  assert.equal((await (await at(`/${id}/manifest.json`)).json()).name, "Secours");
  // Une heure plus tard (copie plus fraîche), la base tombe : la copie gardée sert encore.
  for (const [k, v] of store) if (k.includes("/lien-fixe/")) store.set(k, JSON.stringify({ ...JSON.parse(v), lu: Date.now() - 3600e3 }));
  env.LIENS.prepare = () => ({ bind: () => ({ first: async () => { throw new Error("D1_ERROR: overloaded"); } }) });
  const res = await at(`/${id}/manifest.json`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).name, "Secours");
});

test("lien_fixe_relu_dans_la_base_apres_5_minutes", async () => {
  const { id } = await (await post("/lien-fixe", { c: seg({ n: "Base" }) })).json();
  await at(`/${id}/manifest.json`);
  // Copie de ce centre de Cloudflare vieille de plus de 5 min (modifiée ailleurs depuis) : la base fait foi.
  for (const [k, v] of store) if (k.includes("/lien-fixe/")) store.set(k, JSON.stringify({ ...JSON.parse(v), c: "périmé", lu: Date.now() - 301e3 }));
  assert.equal((await (await at(`/${id}/manifest.json`)).json()).name, "Base");
});

test("lien_fixe_sans_origin_refuse", async () => {
  const res = await at("/lien-fixe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ c: "" }) });
  assert.equal(res.status, 403);
  assert.equal(env.LIENS.rows.size, 0);
});

test("lien_fixe_creations_limitees_par_adresse", async () => {
  const vus = [];
  let reste = 2;
  env.LIMITE_LIENS = { limit: async ({ key }) => { vus.push(key); return { success: reste-- > 0 }; } };
  const de = (ip, path = "/lien-fixe", body = { c: "" }) => at(path, { method: "POST", headers: { "Content-Type": "application/json", Origin: O, "cf-connecting-ip": ip }, body: JSON.stringify(body) });
  assert.equal((await de("203.0.113.7")).status, 200);
  const { id, modif } = await (await de("203.0.113.7")).json();
  assert.equal((await de("203.0.113.7")).status, 429);
  assert.deepEqual(vus, ["203.0.113.7", "203.0.113.7", "203.0.113.7"]);
  // Les modifications (enregistrées à chaque réglage) ne comptent pas.
  assert.equal((await de("203.0.113.7", `/lien-fixe/${id}`, { c: seg({ n: "Encore" }), modif })).status, 200);
  assert.equal(vus.length, 3);
});

test("lien_fixe_indisponible_sans_base", async () => {
  delete env.LIENS;
  assert.equal((await post("/lien-fixe", { c: "" })).status, 501);
  assert.match((await (await at("/configure")).text()), /"fixedOk":false/);
});

// La page d'un lien fixe se montre à quiconque a le lien : jamais sa clé Gemini ni son jeton d'alerte. Seule la
// page qui a la clé de modification les relit (POST /lien-fixe/<id>/lire).
test("lien_fixe_page_sans_cle_gemini", async () => {
  const k = "AIzaSyCleSecreteDeTest0123456789abcdefg", al = "0123456789abcdef01234567";
  const { id, modif } = await (await post("/lien-fixe", { c: seg({ n: "Salon", k, al }) })).json();
  const html = await (await at(`/${id}/configure`)).text();
  assert.match(html, /"n":"Salon"/);
  assert.ok(!html.includes(k) && !html.includes("AIzaSy") && !html.includes(al));
  // Un lien habituel porte déjà la clé dans son adresse : sa page la reprend, comme avant.
  assert.ok((await (await at(`/${seg({ n: "Salon", k })}/configure`)).text()).includes(k));

  const lire = await post(`/lien-fixe/${id}/lire`, { modif });
  assert.equal(lire.status, 200);
  assert.equal(lire.headers.get("Cache-Control"), "no-store");
  // Avec, l'heure de la dernière lecture par Nuvio et du dernier enregistrement (« Ta TV l'a reçu », recu.test.js).
  const { vu, t, maintenant, ...secrets } = await lire.json();
  assert.deepEqual(secrets, { k, al, pf: [], n: "Salon" });
  assert.ok(typeof vu === "number" && typeof t === "number" && maintenant > 0);
  // Sans la bonne clé de modification, sans Origin, ou pour un lien inconnu : rien.
  const refus = await post(`/lien-fixe/${id}/lire`, { modif: "x".repeat(22) });
  assert.equal(refus.status, 403);
  assert.ok(!(await refus.text()).includes("AIzaSy"));
  assert.equal((await post(`/lien-fixe/${id}/lire`, {})).status, 404);
  assert.equal((await post(`/lien-fixe/f0123456789abcdef/lire`, { modif })).status, 404);
  const sansOrigin = await at(`/lien-fixe/${id}/lire`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modif }) });
  assert.equal(sansOrigin.status, 403);
  assert.equal((await at(`/lien-fixe/${id}/lire`)).status, 405);
});

test("lien_fixe_lecture_base_en_panne", async () => {
  const { id, modif } = await (await post("/lien-fixe", { c: seg({ n: "X" }) })).json();
  env.LIENS.prepare = () => ({ bind: () => ({ first: async () => { throw new Error("D1_ERROR: overloaded"); } }) });
  assert.equal((await post(`/lien-fixe/${id}/lire`, { modif })).status, 503);
});

// « Actualiser les addons » relit le manifest d'un lien fixe à chaque fois ; celui d'un lien habituel reste 5 min.
test("lien_fixe_manifest_jamais_garde", async () => {
  const { id } = await (await post("/lien-fixe", { c: seg({ n: "Frais" }) })).json();
  assert.equal((await at(`/${id}/manifest.json`)).headers.get("Cache-Control"), "no-cache, max-age=0, must-revalidate");
  assert.equal((await at(`/${seg({ n: "X" })}/manifest.json`)).headers.get("Cache-Control"), "public, max-age=300");
  assert.equal((await at(`/manifest.json`)).headers.get("Cache-Control"), "public, max-age=300");
});

// Mes profils (profils.js) : le lien principal garde les liens et les clés de ses autres profils, secrets comme la clé
// Gemini : jamais dans sa page, relus seulement avec sa clé de modification.
test("lien_fixe_profils_secrets", async () => {
  const enfant = await (await post("/lien-fixe", { c: seg({ n: "Léo", f: 10 }) })).json();
  const pf = [{ i: enfant.id, m: enfant.modif }];
  const principal = await (await post("/lien-fixe", { c: seg({ n: "Moi", pf }) })).json();
  const html = await (await at(`/${principal.id}/configure`)).text();
  assert.ok(!html.includes(enfant.id) && !html.includes(enfant.modif));
  const lu = await (await post(`/lien-fixe/${principal.id}/lire`, { modif: principal.modif })).json();
  assert.deepEqual([lu.pf, lu.n], [pf, "Moi"]);
  // Le nom de chaque profil : celui de son lien.
  assert.equal((await (await post(`/lien-fixe/${enfant.id}/lire`, { modif: enfant.modif })).json()).n, "Léo");
  // Les profils ne changent rien aux rangées du principal.
  assert.equal((await (await at(`/${principal.id}/manifest.json`)).json()).name, "Moi");
});

test("profils_mal_formes_ignores", async () => {
  const { decodeConfig, MAX_PROFILS } = await import("../worker/config.js");
  const bon = (n) => ({ i: "f" + String(n).padStart(16, "0"), m: "A".repeat(22) });
  const cfg = (pf) => decodeConfig(seg({ pf }), [], []).pf;
  assert.deepEqual(cfg([bon(1), bon(1), { i: "x", m: "A".repeat(22) }, { i: bon(2).i, m: "court" }, "texte", null]), [bon(1)]);
  assert.equal(cfg(Array.from({ length: 20 }, (_, n) => bon(n))).length, MAX_PROFILS);
  assert.deepEqual(cfg("pas une liste"), []);
});
