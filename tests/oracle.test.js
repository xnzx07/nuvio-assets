import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { creerCache, avecCacheCf } from "../worker/oracle/cache.mjs";
import { creerD1 } from "../worker/oracle/d1.mjs";
import { creerService, enteteVersRequete, ADRESSES_ADDON } from "../worker/oracle/addon.mjs";
import { redirige, regles, SERVEUR_ADDON } from "../worker/construire/redirections.mjs";

const O = "https://addon.exemple";

function dossier(t) {
  const d = mkdtempSync(join(tmpdir(), "oracle-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}

test("cache_garde_le_temps_de_cache_control", async (t) => {
  let now = 1000000;
  const dir = dossier(t), c = creerCache({ dossier: dir, horloge: () => now });
  await c.put(new Request("https://a.test/x"), new Response("corps", { headers: { "Cache-Control": "public, max-age=60", "X-Y": "z" } }));
  const r = await c.match("https://a.test/x");
  assert.equal(await r.text(), "corps");
  assert.equal(r.headers.get("X-Y"), "z");
  // Retrouvé par un autre cache sur le même dossier : après un redémarrage.
  assert.ok(await creerCache({ dossier: dir, horloge: () => now }).match(new Request("https://a.test/x")));
  now += 60001;
  assert.equal(await c.match("https://a.test/x"), undefined);
  await c.put("https://a.test/sans", new Response("n", { headers: { "Cache-Control": "no-store" } }));
  assert.equal(await c.match("https://a.test/sans"), undefined);
  await c.put("https://a.test/rien", new Response("n"));
  assert.equal(await c.match("https://a.test/rien"), undefined);
  await c.put("https://a.test/d", new Response("n", { headers: { "Cache-Control": "max-age=60" } }));
  assert.equal(await c.delete("https://a.test/d"), true);
  assert.equal(await c.delete("https://a.test/d"), false);
});

test("cache_menage_retire_expire_et_trop_plein", async (t) => {
  let now = 1000000;
  const c = creerCache({ dossier: dossier(t), horloge: () => now, max: 150 });
  const garde = (n) => new Response("x".repeat(100), { headers: { "Cache-Control": `max-age=${n}` } });
  await c.put("https://a.test/court", garde(1));
  now += 2000;
  await c.menage();
  await c.put("https://a.test/1", garde(100));
  await c.put("https://a.test/2", garde(100));
  await c.menage();
  const restes = [await c.match("https://a.test/1"), await c.match("https://a.test/2")].filter(Boolean);
  assert.ok(restes.length <= 1, "au-delà du maximum : les plus anciens partent");
});

test("fetch_cf_garde_seulement_les_reussites", async (t) => {
  let appels = 0, statut = 200;
  const f = avecCacheCf(async () => { appels++; return new Response("corps", { status: statut }); }, creerCache({ dossier: dossier(t) }));
  const cf = { cf: { cacheTtl: 60, cacheEverything: true } };
  assert.equal(await (await f("https://a.test/1", cf)).text(), "corps");
  assert.equal(await (await f("https://a.test/1", cf)).text(), "corps");
  assert.equal(appels, 1);
  await f("https://a.test/sans");
  await f("https://a.test/sans");
  assert.equal(appels, 3);
  statut = 500;
  assert.equal((await f("https://a.test/2", cf)).status, 500);
  assert.equal((await f("https://a.test/2", cf)).status, 500);
  assert.equal(appels, 5);
  // Par statut (cacheTtlByStatus) ; deux demandes en même temps n'en font qu'une.
  statut = 200;
  const par = { cf: { cacheTtlByStatus: { "200-299": 60 } } };
  const [a, b] = await Promise.all([f("https://a.test/3", par), f("https://a.test/3", par)]);
  assert.equal(await a.text(), await b.text());
  assert.equal(appels, 6);
});

test("d1_par_l_api_comme_env_liens", async () => {
  const envois = [];
  const fetchImpl = async (u, init) => {
    envois.push([u, JSON.parse(init.body), init.headers.Authorization]);
    return Response.json({ success: true, result: [{ results: [{ a: 1, b: "x" }], success: true, meta: { changes: 2 } }] });
  };
  const db = creerD1({ jeton: "j", compte: "c", base: "b", fetchImpl });
  const q = db.prepare("SELECT a, b FROM t WHERE c = ?").bind("v");
  assert.deepEqual(await q.first(), { a: 1, b: "x" });
  assert.equal(await q.first("b"), "x");
  assert.deepEqual((await q.all()).results, [{ a: 1, b: "x" }]);
  assert.equal((await q.run()).meta.changes, 2);
  assert.deepEqual(await q.raw(), [[1, "x"]]);
  assert.deepEqual(envois[0], ["https://api.cloudflare.com/client/v4/accounts/c/d1/database/b/query", { sql: "SELECT a, b FROM t WHERE c = ?", params: ["v"] }, "Bearer j"]);
  assert.equal((await db.batch([db.prepare("A"), db.prepare("B").bind(1)])).length, 2);
  assert.deepEqual(envois.slice(-2).map((e) => e[1].sql), ["A", "B"]);
  // Le message de la base reste lisible (noTable, liens fixes).
  const refus = creerD1({ jeton: "j", compte: "c", base: "b", fetchImpl: async () => Response.json({ success: false, errors: [{ message: "no such table: liens" }] }, { status: 400 }) });
  await assert.rejects(refus.prepare("X").first(), /no such table/);
});

const faux = (journal = []) => ({
  fetch: async (req, env, ctx) => {
    journal.push(req.url);
    ctx.waitUntil(Promise.reject(new Error("sans suite")));
    if (new URL(req.url).pathname === "/interne") return new Response("interne");
    return Response.json({ url: req.url, ip: req.headers.get("cf-connecting-ip"), self: !!env.SELF });
  },
});

test("seulement_catalogues_et_fiches", () => {
  for (const p of ["/catalog/movie/x.json", "/abc/catalog/movie/x.json", "/fyDZB4YSohqcngxnA/meta/series/tt1:1:2.json", "/meta/movie/tt1.json"]) assert.ok(ADRESSES_ADDON.test(p), p);
  for (const p of ["/", "/manifest.json", "/abc/manifest.json", "/configure", "/a/b/catalog/x", "/hote", "/catalogue"]) assert.ok(!ADRESSES_ADDON.test(p), p);
});

test("service_repond_sous_l_adresse_de_l_addon", async (t) => {
  t.mock.method(console, "warn", () => {});
  const journal = [];
  const s = creerService({ worker: faux(journal), env: {}, origine: O, fetchImpl: async () => { throw new Error("pas d'appel"); } });
  const r = await s.repondre("GET", "/abc/catalog/movie/x.json?skip=20", { host: "serveur.exemple", "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
  const j = await r.json();
  // Les liens de la réponse restent ceux de l'addon, pas ceux du serveur.
  assert.equal(j.url, `${O}/abc/catalog/movie/x.json?skip=20`);
  assert.equal(j.ip, "1.2.3.4");
  assert.equal(j.self, true);
  assert.equal((await s.repondre("GET", "/manifest.json", {})).status, 404);
  assert.equal((await s.repondre("GET", "/configure", {})).status, 404);
  assert.equal((await s.repondre("POST", "/catalog/movie/x.json", {})).status, 405);
  assert.equal(journal.length, 1);
  assert.equal((await s.repondre("GET", "/sante", {})).status, 200);
});

test("appels_a_soi_meme_et_avis_par_le_worker", async () => {
  const journal = [], sortants = [];
  let reponse = () => Response.json({ avis: { "movie/tt1": { vf: true } } });
  const s = creerService({ worker: faux(journal), env: { TMDB_API_KEY: "k" }, origine: O, fetchImpl: async (u, init) => { sortants.push([u, init]); return reponse(); } });
  assert.equal(await (await s.env.SELF.fetch("https://self/interne")).text(), "interne");
  assert.equal(journal.at(-1), `${O}/interne`);
  // L'avis du jour reste au Worker : c'est lui qui a les liens Lumio et StreamFusion.
  const lot = await s.env.SELF.fetch("https://self/avis/lot", { method: "POST", headers: { "x-tri": "t" }, body: "{}" });
  assert.deepEqual(await lot.json(), { avis: { "movie/tt1": { vf: true } } });
  assert.equal(sortants[0][0], `${O}/avis/lot`);
  assert.equal(sortants[0][1].headers["x-tri"], "t");
  assert.ok(s.env.LUMIO_URL, "les rangées demandent l'avis");
  // Worker injoignable ou coupé : pas d'avis, et surtout pas d'essai ici, sans les liens.
  reponse = () => new Response("", { status: 503 });
  assert.deepEqual(await (await s.env.SELF.fetch("https://self/avis/lot", { method: "POST", headers: {}, body: "{}" })).json(), { avis: {} });
  reponse = () => { throw new Error("réseau"); };
  assert.deepEqual(await (await s.env.SELF.fetch("https://self/avis/lot", { method: "POST", headers: {}, body: "{}" })).json(), { avis: {} });
});

test("entetes_sans_ceux_du_transport", () => {
  const e = enteteVersRequete({ host: "h", connection: "keep-alive", "x-a": "1", "x-forwarded-for": "9.9.9.9", "user-agent": ["a", "b"] });
  assert.equal(e.get("host"), null);
  assert.equal(e.get("connection"), null);
  assert.equal(e.get("x-a"), "1");
  assert.equal(e.get("cf-connecting-ip"), "9.9.9.9");
  assert.equal(e.get("user-agent"), "a, b");
});

// Le déploiement de ce dépôt seulement : wrangler dev et les copies gardent le Worker.
test("redirections_seulement_au_deploiement_de_ce_depot", () => {
  const depot = "https://github.com/xnzx07/nuvio-assets.git\n";
  assert.ok(redirige({ commande: "deploy", depot }));
  assert.ok(redirige({ commande: undefined, depot: "git@github.com:xnzx07/nuvio-assets.git" }));
  assert.ok(!redirige({ commande: "dev", depot }));
  assert.ok(!redirige({ commande: "deploy", depot: "https://github.com/quelquun/nuvio-assets.git" }));
  assert.ok(!redirige({ commande: "deploy", depot: "" }));
  assert.ok(!redirige({ actif: false, commande: "deploy", depot }));
});

test("regles_comme_l_essai_et_comme_le_service", () => {
  const r = regles("https://s.test").trim().split("\n");
  assert.deepEqual(r, ["/:cfg/catalog/* https://s.test/:cfg/catalog/:splat 307", "/catalog/* https://s.test/catalog/:splat 307",
    "/:cfg/meta/* https://s.test/:cfg/meta/:splat 307", "/meta/* https://s.test/meta/:splat 307"]);
  // Sans ? dans la destination : Cloudflare garde les paramètres.
  assert.ok(!regles().includes("?"));
  assert.match(SERVEUR_ADDON, /^https:\/\/[^/]+$/);
  // Tout ce qui est redirigé, le serveur le prend ; et rien du site.
  for (const l of r) assert.ok(ADRESSES_ADDON.test(l.split(" ")[0].replace(":cfg", "abc").replace("*", "x.json")), l);
});
