import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { makeVf } from "../api/vf.js";
import { resetMemo } from "../lib/qualite.js";

beforeEach(() => resetMemo());
const req = (q) => new Request(`https://affiches.test/api/vf?${q}`);

// /vf.json?v=movie/tt1,movie/tt2… : la VF des sources de plusieurs titres en un appel (l'addon n'a que 50 appels
// sortants par requête). Chaque titre est lu au relais /qualite/ (gardé un jour au CDN, comme pour les affiches).
test("vf_de_plusieurs_titres_en_un_appel", async () => {
  const calls = [];
  const relais = async (u) => {
    calls.push(String(u));
    if (u.includes("tt1.json")) return new Response(JSON.stringify({ uhd: false, extra: null, vf: true, sources: 12 }));
    if (u.includes("tt2.json")) return new Response(JSON.stringify({ uhd: false, extra: null, vf: false, sources: 30 }));
    if (u.includes("tt3:2:1.json")) return new Response(JSON.stringify({ uhd: false, extra: null, vf: true, sources: 4 }));
    return new Response("", { status: 503 });
  };
  const res = await makeVf({ fetchImpl: relais })(req("v=movie/tt1,movie/tt2,series/tt3:2:1,movie/tt4,pas-un-id,movie/tt1"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { "movie/tt1": { vf: true, sources: 12 }, "movie/tt2": { vf: false, sources: 30 }, "series/tt3:2:1": { vf: true, sources: 4 }, "movie/tt4": null });
  assert.deepEqual(calls.sort(), [
    "https://affiches.test/qualite/movie/tt1.json?v=3", "https://affiches.test/qualite/movie/tt2.json?v=3",
    "https://affiches.test/qualite/movie/tt4.json?v=3", "https://affiches.test/qualite/series/tt3:2:1.json?v=3",
  ]);
  // Un titre pas lu : cache court, pour réessayer.
  assert.equal(res.headers.get("Vercel-CDN-Cache-Control"), "max-age=600");
});

test("vf_cache_et_limites", async () => {
  const relais = async () => new Response(JSON.stringify({ uhd: false, extra: null, vf: true, sources: 1 }));
  const res = await makeVf({ fetchImpl: relais })(req("v=movie/tt1"));
  assert.equal(res.headers.get("Vercel-CDN-Cache-Control"), "max-age=3600");
  assert.equal(res.headers.get("Content-Type"), "application/json");
  // 40 titres au plus.
  const beaucoup = Array.from({ length: 50 }, (_, i) => `movie/tt${100 + i}`).join(",");
  assert.equal(Object.keys(await (await makeVf({ fetchImpl: relais })(req("v=" + beaucoup))).json()).length, 40);
  // Rien de valable : 404.
  assert.equal((await makeVf({ fetchImpl: relais })(req("v=bonjour"))).status, 404);
});

// VF sûre chez Torrentio (vff, vfq : TRUEFRENCH, VFF…) : transmise à l'addon, qui ne demande alors pas Lumio.
test("vf_sure_transmise", async () => {
  const relais = async (u) => new Response(JSON.stringify(u.includes("tt1.json")
    ? { uhd: true, extra: "DV", vf: true, sources: 5, langue: "multi", vff: true, vfq: { u: 1, x: "DV", p: 0, f: 1, a: 0 } }
    : { uhd: false, extra: null, vf: true, sources: 2, langue: "vf" }));
  const res = await makeVf({ fetchImpl: relais })(req("v=movie/tt1,movie/tt2"));
  assert.deepEqual(await res.json(), {
    "movie/tt1": { vf: true, sources: 5, langue: "multi", vff: true, vfq: { u: 1, x: "DV", p: 0, f: 1, a: 0 } },
    "movie/tt2": { vf: true, sources: 2, langue: "vf" } });
});
