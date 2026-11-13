import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { tmdbGet, resetMemo } from "../lib/tmdb.js";
import { envDuService } from "../serveur.js";

beforeEach(() => resetMemo());

// Le serveur des affiches garde une heure ce que TMDB a répondu : un titre dessiné dans plusieurs styles, un seul appel.
test("tmdb_garde_sur_le_serveur", async () => {
  let appels = 0;
  const f = async () => { appels++; return Response.json({ id: 1, titre: "X" }); };
  const env = envDuService({ TMDB_API_KEY: "k" });
  assert.equal(env.TMDB_GARDE, "on");
  const a = await tmdbGet(env, "/movie/1", { frais: "2026-11-14T10" }, f);
  a.titre = "abîmé par l'appelant";
  assert.deepEqual(await tmdbGet(env, "/movie/1", { frais: "2026-11-14T10" }, f), { id: 1, titre: "X" });
  assert.equal(appels, 1);
  // Une autre heure (paramètre frais) : redemandé.
  await tmdbGet(env, "/movie/1", { frais: "2026-11-14T11" }, f);
  assert.equal(appels, 2);
  // Ailleurs (Vercel, machine GitHub) : rien de gardé.
  await tmdbGet({ TMDB_API_KEY: "k" }, "/movie/2", {}, f);
  await tmdbGet({ TMDB_API_KEY: "k" }, "/movie/2", {}, f);
  assert.equal(appels, 4);
});

test("tmdb_echec_pas_garde_et_pause_apres_refus", async () => {
  const env = { TMDB_API_KEY: "k", TMDB_GARDE: "on" };
  let n = 0;
  const f = async () => (n++ === 0 ? new Response("", { status: 429, headers: { "Retry-After": "1" } }) : Response.json({ ok: 1 }));
  await assert.rejects(tmdbGet(env, "/movie/3", {}, f), /TMDB 429/);
  const t0 = Date.now();
  assert.deepEqual(await tmdbGet(env, "/movie/3", {}, f), { ok: 1 });
  assert.ok(Date.now() - t0 >= 900, "attend la reprise donnée par TMDB");
  assert.equal(n, 2);
});
