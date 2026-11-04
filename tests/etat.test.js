import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../worker/index.js";
import { oublierEtat, etatPage } from "../worker/etat.js";
import { hallPage } from "../worker/hall.js";
import { guidePage } from "../worker/guide.js";
import { verifier, CONTROLES } from "../scripts/canari.mjs";

// Les machines simulées : chacune peut tomber en panne (panne.tmdb = true…).
let store, calls, selfCalls, panne, nuit;
const jour = (j) => new Date(Date.now() + j * 86400000).toISOString().slice(0, 10);
beforeEach(() => {
  store = new Map(); calls = []; selfCalls = []; panne = {}; nuit = { date: jour(0), label: "Spécial Halloween", failed: [] };
  oublierEtat();
  globalThis.caches = { default: {
    match: async (req) => (store.has(req.url) ? new Response(store.get(req.url)) : undefined),
    put: async (req, res) => { store.set(req.url, await res.text()); },
  } };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push((init.method || "GET") + " " + u);
    if (u.includes("/3/configuration")) return panne.tmdb ? new Response("non", { status: 503 }) : new Response(JSON.stringify({ images: {} }));
    if (u === "https://serveur.test/etat") return panne.serveur ? new Response("non", { status: 502 }) : new Response(JSON.stringify({ dessinees: 3, enAttente: 0, dernierePublication: new Date().toISOString(), erreur: null }));
    if (u.endsWith("/movie/poster/tt0111161.jpg")) return panne.affiches ? new Response("non", { status: 502 }) : new Response(new Uint8Array([1]), { headers: { "Content-Type": "image/jpeg" } });
    if (u.endsWith("/collections/collections.json")) return new Response(JSON.stringify([{ folders: [{ coverImageUrl: "https://raw.githubusercontent.com/a/b/tuile.png" }] }]));
    if (u.endsWith("/tuile.png")) return new Response(null, { status: panne.tuiles ? 404 : 200 });
    if (u.endsWith("/addon/state.json")) return new Response(JSON.stringify(nuit));
    return new Response(JSON.stringify({ results: [] }));
  };
});
// L'addon lui-même, appelé par la liaison SELF (comme sur Cloudflare).
const SELF = { fetch: async (req) => {
  const p = new URL(req.url).pathname;
  selfCalls.push(p);
  if (p === "/manifest.json") return new Response(JSON.stringify({ catalogs: panne.manifest ? [] : [{ id: "a" }] }));
  if (p.includes("recherche-films")) return new Response(JSON.stringify({ metas: panne.recherche ? [] : [{ id: "tt1" }] }));
  return new Response(JSON.stringify({ metas: [{ id: "tt1" }, { id: "tt2" }] }));
} };
const ctx = { waitUntil: () => {} };
const etat = async (env = { TMDB_API_KEY: "k", RELAIS_URL: "https://serveur.test", SELF, LIENS: { prepare: () => ({ first: async () => ({ 1: 1 }) }) } }) => (await worker.fetch(new Request("https://x.exemple/etat.json"), env, ctx)).json();

test("etat_tout_vert", async () => {
  const b = await etat();
  assert.equal(b.global, "vert");
  assert.match(b.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(b.controles.map((c) => c.id), ["tmdb", "manifest", "rangee", "recherche", "affiches", "serveur", "tuiles", "base"]);
  // L'adresse du serveur (un secret) n'apparaît jamais dans le bilan.
  assert.doesNotMatch(JSON.stringify(b), /serveur\.test/);
  assert.ok(b.controles.every((c) => c.etat === "vert"), JSON.stringify(b.controles));
  assert.equal(b.nuit.etat, "vert");
  assert.equal(b.nuit.saison, "Spécial Halloween");
  assert.ok(calls.some((c) => c === "HEAD https://raw.githubusercontent.com/a/b/tuile.png"));
  // La clé TMDB n'apparaît jamais dans le bilan.
  assert.doesNotMatch(JSON.stringify(b), /api_key|"k"/);
});

test("etat_garde_cinq_minutes", async () => {
  await etat();
  const n = calls.length;
  await etat();
  assert.equal(calls.length, n, "deuxième lecture : rien n'est retesté");
  oublierEtat();
  await etat();
  assert.equal(calls.length, n, "le cache de Cloudflare suffit aussi");
});

test("etat_panne_essentielle_rouge", async () => {
  panne.tmdb = true;
  const b = await etat();
  assert.equal(b.global, "rouge");
  assert.equal(b.controles.find((c) => c.id === "tmdb").etat, "rouge");
});

test("etat_panne_secondaire_orange", async () => {
  panne.affiches = true; panne.recherche = true;
  const b = await etat();
  assert.equal(b.global, "orange");
  assert.equal(b.controles.find((c) => c.id === "affiches").etat, "rouge");
  assert.equal(b.controles.find((c) => c.id === "recherche").etat, "orange");
});

test("etat_nuit_en_retard", async () => {
  nuit.date = jour(-2);
  let b = await etat();
  assert.equal(b.nuit.etat, "orange");
  assert.equal(b.global, "orange");
  oublierEtat(); store.clear(); nuit.date = jour(-6);
  b = await etat();
  assert.equal(b.nuit.etat, "rouge");
});

test("etat_copie_sans_base_ni_self", async () => {
  // Docker : pas de base (voyant éteint, sans effet sur le bilan), l'addon appelé ici même.
  const b = await etat({ TMDB_API_KEY: "k" });
  assert.equal(b.controles.find((c) => c.id === "base").etat, "eteint");
  assert.equal(selfCalls.length, 0);
  assert.equal(b.controles.find((c) => c.id === "manifest").etat, "vert");
});

test("etat_page_et_liens", () => {
  const html = etatPage({ origin: "https://x.exemple", version: "9.9.9" });
  assert.match(html, /9\.9\.9/);
  for (const id of ["tmdb", "manifest", "rangee", "recherche", "affiches", "tuiles", "base"]) assert.ok(html.includes(`data-id="${id}"`), id);
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Function(m[1]));
  assert.match(hallPage({ origin: "https://x.exemple", season: null }), /<a href="https:\/\/x\.exemple\/etat">Salle des machines<\/a>/);
  assert.match(guidePage({ origin: "https://x.exemple", season: null }), /<details data-moment="accueil fiche recherche" id="panne-chez-qui">[^]*?href="\/etat"/);
});

// Serveur des affiches en panne : orange pour l'addon (pas essentiel), mais le canari le signale.
test("etat_serveur_des_affiches", async () => {
  panne.serveur = true;
  const b = await etat();
  assert.equal(b.global, "orange");
  assert.equal(b.controles.find((c) => c.id === "serveur").etat, "rouge");
  const [, , test] = CONTROLES.find(([nom]) => nom === "salle des machines");
  const reponse = new Response(JSON.stringify(b));
  await assert.rejects(() => test(reponse), /serveur des affiches/);
});

// ---------- Le canari ----------
const site = (pannes = {}) => {
  const vus = [];
  const f = async (u) => {
    vus.push(u);
    if (u.endsWith("/manifest.json")) return new Response(JSON.stringify({ catalogs: [{}] }));
    if (u.includes("recherche-films")) return new Response(JSON.stringify({ metas: pannes.recherche ? [] : [{}] }));
    if (u.includes("/catalog/")) return new Response(JSON.stringify({ metas: [{}] }));
    if (u.includes("/affiche/")) return pannes.affiche ? new Response("x", { status: 404 }) : new Response(new Uint8Array([1]), { headers: { "Content-Type": "image/jpeg" } });
    if (u.endsWith("/etat.json")) return new Response(JSON.stringify({ global: pannes.etat ? "rouge" : "orange", controles: [{ nom: "TMDB", etat: pannes.etat ? "rouge" : "vert" }] }));
    throw new Error("inattendu " + u);
  };
  return { f, vus };
};

test("canari_tout_repond", async () => {
  const { f, vus } = site();
  assert.deepEqual(await verifier("https://s", f, 0), []);
  assert.equal(vus.length, CONTROLES.length);
});

test("canari_pannes_reessayees", async () => {
  const { f, vus } = site({ recherche: true, affiche: true, etat: true });
  const p = await verifier("https://s", f, 0);
  assert.deepEqual(p.map((x) => x.nom), ["recherche", "affiche", "salle des machines"]);
  assert.match(p[2].erreur, /TMDB/);
  assert.equal(vus.filter((u) => u.includes("recherche-films")).length, 2, "un second essai avant de crier à la panne");
});

// Les requêtes du jour : la somme de tous les Workers du compte ; une réponse refusée (jeton sans l'autorisation) lève.
test("canari_requetes_du_jour", async () => {
  const { requetesDuJour } = await import("../scripts/canari.mjs");
  const ok = async () => new Response(JSON.stringify({ data: { viewer: { accounts: [{ workersInvocationsAdaptive: [{ sum: { requests: 70000 } }, { sum: { requests: 12000 } }] }] } } }));
  assert.equal(await requetesDuJour("j", ok, "2026-10-26"), 82000);
  const refus = async () => new Response(JSON.stringify({ errors: [{ message: "not authorized" }] }));
  await assert.rejects(() => requetesDuJour("j", refus), /not authorized/);
});

test("canari_workflow", () => {
  const wf = readFileSync(new URL("../.github/workflows/canari.yml", import.meta.url), "utf8");
  const tests = readFileSync(new URL("../.github/workflows/tests.yml", import.meta.url), "utf8");
  assert.match(wf, /if: github\.repository == 'xnzx07\/nuvio-assets'/);
  assert.match(wf, /issues: write/);
  assert.match(wf, /workflow_dispatch/);
  assert.match(wf, /cron: "7,37 \* \* \* \*"/);
  for (const [, action, sha] of wf.matchAll(/uses: ([\w/-]+)@(\S+)/g)) {
    assert.match(sha, /^[0-9a-f]{40}$/, action);
    assert.ok(tests.includes(`${action}@${sha}`), `${action} épinglée comme dans tests.yml`);
  }
  // Le titre de l'issue passe par une variable, jamais recopié dans le script.
  assert.doesNotMatch(wf, /\$\{\{ steps\.verif\.outputs\.pannes \}\}"/);
  assert.match(wf, /PANNES: \$\{\{ steps\.verif\.outputs\.pannes \}\}/);
  // Les issues ouvertes par ce workflow : leur auteur s'écrit github-actions[bot] pour gh issue list (« app/github-actions »
  // ne trouvait rien, et aucune ne se fermait : quatre ouvertes en novembre 2026) ; toutes fermées quand tout répond.
  assert.match(wf, /--author "github-actions\[bot\]"/);
  assert.doesNotMatch(wf, /--author "app\/github-actions"/);
  assert.match(wf, /for n in \$nums; do/);
});

// Depuis la bascule du 1er novembre 2026, le serveur Oracle sert les rangées. Les recalculer ici dépassait les 50 appels
// sortants du Worker : rangée, recherche et nuit en rouge, alors que tout marchait.
test("etat_rangees_lues_chez_le_serveur_oracle", async () => {
  const { SERVEUR_ADDON } = await import("../worker/construire/redirections.mjs");
  const { SOURCE_HOST } = await import("../worker/hote.js");
  const avant = globalThis.fetch, lues = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith(SERVEUR_ADDON)) { lues.push(u.slice(SERVEUR_ADDON.length)); return new Response(JSON.stringify({ metas: [{ id: "tt1" }] })); }
    return avant(url, init);
  };
  selfCalls.length = 0;
  store.clear();
  const env = { TMDB_API_KEY: "k", RELAIS_URL: "https://serveur.test", SELF, LIENS: { prepare: () => ({ first: async () => ({ 1: 1 }) }) } };
  const b = await (await worker.fetch(new Request(`https://${SOURCE_HOST}/etat.json`), env, ctx)).json();
  assert.deepEqual(lues.sort(), ["/catalog/movie/accueil-top10.json", "/catalog/movie/recherche-films/search=dune.json"]);
  assert.ok(!selfCalls.some((p) => p.startsWith("/catalog/")), "pas recalculées ici");
  assert.equal(b.controles.find((c) => c.id === "rangee").etat, "vert");
  assert.equal(b.controles.find((c) => c.id === "recherche").etat, "vert");
});
