import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { parseMdblist, lireMdblist, notesPlus, resetMemo } from "../lib/notes-plus.js";
import { makeNotes } from "../api/notes.js";

beforeEach(() => resetMemo());

// Réponse type de MDBList (api/?i=tt…) : une note par site.
const MDB = { title: "Dune", ratings: [
  { source: "imdb", value: 8.5 }, { source: "tomatoes", value: 94, score: 94 }, { source: "popcorn", value: 95 },
  { source: "metacritic", value: 81 }, { source: "letterboxd", value: 4.1 }, { source: "trakt", value: 85 },
] };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status });

test("parse_mdblist", () => {
  assert.deepEqual(parseMdblist(MDB), { rt: 94, mc: 81, lb: 4.1 });
  assert.deepEqual(parseMdblist({ ratings: [{ source: "tomatoes", value: null }, { source: "metacritic", value: 0 }] }), { rt: null, mc: null, lb: null });
  assert.equal(parseMdblist(null), null);
});

test("lire_mdblist", async () => {
  const calls = [];
  const f = async (u) => { calls.push(String(u)); return json(MDB); };
  assert.deepEqual(await lireMdblist({ MDBLIST_API_KEY: "cle" }, "tt15239678", f), { rt: 94, mc: 81, lb: 4.1 });
  const u = new URL(calls[0]);
  assert.equal(u.origin + u.pathname, "https://api.mdblist.com/imdb/movie/tt15239678");
  assert.equal(u.searchParams.get("apikey"), "cle");
  // Une série : d'abord « show » ; pas trouvée dans ce genre, l'autre.
  const g = [];
  const h = async (x) => { g.push(new URL(String(x)).pathname); return g.length === 1 ? json({ error: "Item not found" }, 404) : json(MDB); };
  assert.deepEqual(await lireMdblist({ MDBLIST_API_KEY: "cle" }, "tt12343534", h, "series"), { rt: 94, mc: 81, lb: 4.1 });
  assert.deepEqual(g, ["/imdb/show/tt12343534", "/imdb/movie/tt12343534"]);
  // Sans clé : rien demandé ; quota épuisé ou panne : null.
  assert.equal(await lireMdblist({}, "tt15239678", f), null);
  assert.equal(calls.length, 1);
  assert.equal(await lireMdblist({ MDBLIST_API_KEY: "cle" }, "tt1", async () => json({ error: "limit" }, 429)), null);
  assert.equal(await lireMdblist({ MDBLIST_API_KEY: "cle" }, "tt1", async () => { throw new Error("réseau"); }), null);
});

// Le relais du service : gardé 7 jours au CDN, la même lecture sert à toutes les instances.
test("relais_notes", async () => {
  const req = (q) => new Request(`https://affiches.test/api/notes?${q}`);
  const ok = await makeNotes({ fetchImpl: async () => json(MDB), env: { MDBLIST_API_KEY: "cle" } })(req("imdb=tt15239678"));
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { rt: 94, mc: 81, lb: 4.1 });
  assert.equal(ok.headers.get("Vercel-CDN-Cache-Control"), "max-age=604800, stale-if-error=86400");
  assert.equal(ok.headers.get("Cache-Control"), "public, max-age=86400");
  assert.equal((await makeNotes({ fetchImpl: async () => json(MDB), env: { MDBLIST_API_KEY: "cle" } })(req("imdb=abc"))).status, 404);
  const sansCle = await makeNotes({ fetchImpl: async () => json(MDB), env: {} })(req("imdb=tt15239678"));
  assert.equal(sansCle.status, 200);
});

test("notes_plus_par_le_relais", async () => {
  const calls = [];
  const f = async (u) => { calls.push(String(u)); return json({ rt: 94, mc: null, lb: 4.1 }); };
  assert.deepEqual(await notesPlus("tt15239678", f, "https://affiches.test"), { rt: 94, mc: null, lb: 4.1 });
  assert.deepEqual(await notesPlus("tt15239678", f, "https://affiches.test"), { rt: 94, mc: null, lb: 4.1 });
  assert.deepEqual(calls, ["https://affiches.test/notes/tt15239678.json"]);
  assert.equal(await notesPlus("tt2", async () => new Response("", { status: 503 }), "https://affiches.test"), null);
  assert.equal(await notesPlus("", f, "https://affiches.test"), null);
});

// Revue : réponse MDBList sans notes (clé refusée, quota, titre inconnu) : null, pas des notes vides gardées 7 jours.
test("revue_mdblist_reponse_bizarre", async () => {
  assert.equal(parseMdblist({ response: false, error: "Invalid API key" }), null);
  assert.equal(parseMdblist({ title: "x" }), null);
  assert.equal(await lireMdblist({ MDBLIST_API_KEY: "cle" }, "tt1", async () => json({ response: false, error: "limit" })), null);
});

// Revue : sans clé, le relais répond « aucune note » gardé 1 h (pas un échec en boucle) ; une panne répond
// { erreur: true } gardé 1 h (le CDN de Vercel ne garde jamais une 503), que les affiches lisent comme un échec.
test("revue_relais_sans_cle_et_panne", async () => {
  const req = (q) => new Request("https://affiches.test/api/notes?" + q);
  const sansCle = await makeNotes({ fetchImpl: async () => json(MDB), env: {} })(req("imdb=tt15239678"));
  assert.equal(sansCle.status, 200);
  assert.deepEqual(await sansCle.json(), { rt: null, mc: null, lb: null });
  assert.equal(sansCle.headers.get("Vercel-CDN-Cache-Control"), "max-age=3600");
  const panne = await makeNotes({ fetchImpl: async () => json({}, 500), env: { MDBLIST_API_KEY: "cle" } })(req("imdb=tt15239678"));
  assert.equal(panne.status, 200);
  assert.deepEqual(await panne.json(), { erreur: true });
  assert.equal(panne.headers.get("Cache-Control"), "public, max-age=3600");
  assert.equal(panne.headers.get("Vercel-CDN-Cache-Control"), "max-age=3600");
  assert.equal(await notesPlus("tt3", async () => json({ erreur: true }), "https://affiches.test"), null);
});

// 1 000 lectures par jour chez MDBList : le quota épuisé (429 et Retry-After, jusqu'à minuit UTC), plus aucun appel
// avant la reprise. Le 1er novembre 2026 : 5 533 appels refusés en 24 h.
test("quota_mdblist_plus_aucun_appel_avant_la_reprise", async (t) => {
  let appels = 0, now = 1000000;
  t.mock.method(Date, "now", () => now);
  const f = async () => { appels++; return new Response("{}", { status: 429, headers: { "Retry-After": "600" } }); };
  const env = { MDBLIST_API_KEY: "cle" };
  assert.equal(await lireMdblist(env, "tt1", f), null);
  assert.equal(await lireMdblist(env, "tt2", f), null);
  assert.equal(appels, 1);
  now += 599 * 1000;
  assert.equal(await lireMdblist(env, "tt3", f), null);
  assert.equal(appels, 1);
  now += 2 * 1000;
  assert.deepEqual(await lireMdblist(env, "tt4", async () => { appels++; return json(MDB); }), { rt: 94, mc: 81, lb: 4.1 });
  assert.equal(appels, 2);
});

// Sur le serveur, les notes restent sur le disque : les mêmes titres, redessinés chaque nuit, ne repassent pas par MDBList.
test("relais_notes_garde_du_serveur", async () => {
  const req = () => new Request("https://affiches.test/api/notes?imdb=tt15239678", { headers: { "X-Relais-Cle": "k" } });
  const gardees = new Map();
  const garde = { lire: (i) => gardees.get(i) || null, ecrire: (i, n) => gardees.set(i, n) };
  let appels = 0;
  const f = async () => { appels++; return json(MDB); };
  const env = { MDBLIST_API_KEY: "cle", RELAIS_KEY: "k" };
  const notes = makeNotes({ fetchImpl: f, env, garde });
  assert.deepEqual(await (await notes(req())).json(), { rt: 94, mc: 81, lb: 4.1 });
  assert.deepEqual(await (await notes(req())).json(), { rt: 94, mc: 81, lb: 4.1 });
  assert.equal(appels, 1);
  // Une panne n'est pas gardée.
  gardees.clear();
  const panne = makeNotes({ fetchImpl: async () => json({}, 500), env, garde });
  assert.deepEqual(await (await panne(req())).json(), { erreur: true });
  assert.equal(gardees.size, 0);
});
