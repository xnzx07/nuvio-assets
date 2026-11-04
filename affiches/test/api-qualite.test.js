import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { makeQualite } from "../api/qualite.js";

const req = (q) => new Request(`https://affiches.test/api/qualite?${q}`);
const torrentio = (streams, calls = []) => async (u) => { calls.push(String(u)); return new Response(JSON.stringify({ streams })); };

test("qualité d'un film, gardée un jour au CDN", async () => {
  const calls = [];
  const res = await makeQualite({ fetchImpl: torrentio([{ name: "4k DV" }], calls) })(req("type=movie&video=tt15239678"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { uhd: true, extra: "DV", fhd: false, hdr10p: false, atmos: false, vf: false, sources: 1, langue: "vo" });
  assert.equal(res.headers.get("Vercel-CDN-Cache-Control"), "max-age=86400, stale-if-error=86400");
  assert.deepEqual(calls, ["https://torrentio.strem.fun/language=french/stream/movie/tt15239678.json"]);
});

test("épisode d'une série", async () => {
  const calls = [];
  await makeQualite({ fetchImpl: torrentio([], calls) })(req("type=series&video=tt11126994:2:1"));
  assert.deepEqual(calls, ["https://torrentio.strem.fun/language=french/stream/series/tt11126994:2:1.json"]);
});

test("demandes invalides : 404 sans appel", async () => {
  for (const q of ["type=movie&video=tt1:1:1", "type=series&video=tt1", "type=anime&video=tt1", "type=movie&video=../x", "type=series&video=tt1:2:5"]) {
    const calls = [];
    const res = await makeQualite({ fetchImpl: torrentio([], calls) })(req(q));
    assert.equal(res.status, 404, q);
    assert.equal(calls.length, 0, q);
  }
});

// Le CDN de Vercel ne garde jamais une 503 : une panne de Torrentio est une réponse 200 { erreur: true }, gardée
// 30 minutes, pour ne pas redemander Torrentio à chaque affiche.
test("Torrentio en panne : erreur gardée 30 minutes", async () => {
  const res = await makeQualite({ fetchImpl: async () => new Response("", { status: 500 }) })(req("type=movie&video=tt1"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { erreur: true });
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=1800");
  assert.equal(res.headers.get("Vercel-CDN-Cache-Control"), "max-age=1800");
});

// Les affiches lisent { erreur: true } comme « pas de qualité » (null), gardé une heure par l'instance.
test("relais en erreur lu comme un échec", async () => {
  const { qualityOf, resetMemo } = await import("../lib/qualite.js");
  resetMemo();
  const relais = async () => new Response(JSON.stringify({ erreur: true }));
  assert.equal(await qualityOf("movie", "tt1", null, relais, "https://affiches.test"), null);
});

// &sf=1 (titre récent) : le relais demande aussi l'avis de StreamFusion à l'addon (avec la clé), qui corrige
// Torrentio ; sans réponse : Torrentio seul, gardé une heure ; plafond du jour : six heures.
test("relais_avec_streamfusion", async () => {
  const torrentio = { streams: [{ name: "Torrentio 4k", title: "Film.2026.MULTi.VFQ.2160p.WEB" }] };
  const faux = (avis) => async (u, opts) => {
    const s = String(u);
    if (s.includes("torrentio")) return new Response(JSON.stringify(torrentio));
    if (s.startsWith("https://addon.test/sf/movie/tt9.json")) {
      assert.equal(new Headers(opts.headers).get("X-Relais-Cle"), "k");
      return avis === null ? new Response("", { status: 500 }) : new Response(JSON.stringify(avis));
    }
    return new Response("?", { status: 404 });
  };
  const env = { RELAIS_KEY: "k", ADDON_URL: "https://addon.test" };
  const lire = (avis) => makeQualite({ fetchImpl: faux(avis), env })(new Request("https://affiches.test/api/qualite?type=movie&video=tt9&sf=1", { headers: { "X-Relais-Cle": "k" } }));
  const ok = await lire({ vf: true, sources: 3, qualite: { u: 1, x: "DV", p: 0, f: 0, a: 0 } });
  const d = await ok.json();
  assert.deepEqual([d.vf, d.extra, d.langue], [true, "DV", "multi"].map((x, i) => (i === 2 ? "vf" : x)));
  assert.match(ok.headers.get("Cache-Control"), /max-age=86400/);
  const panne = await lire(null);
  assert.equal((await panne.json()).vf, false);   // Torrentio seul : VFQ, pas de VF
  assert.match(panne.headers.get("Cache-Control"), /max-age=3600/);
  assert.match((await lire({ plafond: true })).headers.get("Cache-Control"), /max-age=21600/);
});

// Sans clé, ou avec STREAMFUSION=off : Torrentio seul, l'addon n'est jamais appelé (chaque appel à /sf y compte une
// requête, même refusé).
test("relais_sans_streamfusion_sans_cle", async () => {
  const appels = [];
  const fetchImpl = async (u) => { appels.push(String(u)); return new Response(JSON.stringify({ streams: [{ name: "Torrentio 1080p", title: "Film.2026.MULTi.1080p.WEB" }] })); };
  for (const env of [{ ADDON_URL: "https://addon.test" }, { RELAIS_KEY: "k", STREAMFUSION: "off", ADDON_URL: "https://addon.test" }]) {
    const r = await makeQualite({ fetchImpl, env })(new Request("https://affiches.test/api/qualite?type=movie&video=tt9&sf=1", { headers: { "X-Relais-Cle": "k" } }));
    assert.equal(r.status, 200);
    assert.equal(typeof (await r.json()).vf, "boolean");
  }
  assert.ok(!appels.some((u) => u.includes("addon.test")));
});

// Un film avec une VFQ et un FRENCH de Torrent9 : le relais lit ses dates chez TMDB. Jamais sorti en France (By Any
// Means) ou avant le fichier américain : la VFQ en vue, l'affiche coupée en deux (choix du 2026-11-04).
test("relais_vfq_tranchee_par_les_dates", async () => {
  const torrentio = { streams: [
    { name: "Torrentio\n4k", title: "By.Any.Means.2026.MULTi.VFQ.2160p.WEB.Custom.H265.mkv\n⚙️ ThePirateBay\nMulti Audio / 🇬🇧 / 🇫🇷" },
    { name: "Torrentio\n720p", title: "By Any Means FRENCH WEBRIP 720p 2026\n⚙️ Torrent9\nMulti Audio / 🇬🇧 / 🇫🇷" }] };
  const faux = (releases) => async (u) => {
    const s = String(u);
    if (s.includes("torrentio")) return Response.json(torrentio);
    if (s.includes("api.themoviedb.org/3/movie/tt34379051")) return Response.json({ original_language: "en", release_dates: { results: releases } });
    return new Response("?", { status: 404 });
  };
  const lire = async (releases) => (await makeQualite({ fetchImpl: faux(releases), env: { TMDB_API_KEY: "k" } })(new Request("https://affiches.test/api/qualite?type=movie&video=tt34379051"))).json();
  const jamais = await lire([{ iso_3166_1: "US", release_dates: [{ release_date: "2026-10-20", type: 4 }] }]);
  assert.deepEqual([jamais.vf, jamais.langue, jamais.quebec, jamais.vfqPossible, jamais.vfqDoute], [true, "multi", true, true, undefined]);
  const avant = await lire([{ iso_3166_1: "FR", release_dates: [{ release_date: "2026-08-26", type: 3 }] }, { iso_3166_1: "US", release_dates: [{ release_date: "2026-10-27", type: 4 }] }]);
  assert.deepEqual([avant.vf, avant.quebec, avant.vfqPossible, avant.vfqDoute], [true, true, true, undefined]);
});
