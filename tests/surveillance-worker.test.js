import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";
import { surveiller, CRON_SURVEILLANCE } from "../worker/surveillance.js";
import { SERVEUR_ADDON } from "../worker/construire/redirections.mjs";

const garde = new Map();
beforeEach(() => {
  garde.clear();
  globalThis.caches = { default: { match: async (k) => garde.get(String(k.url || k)), put: async (k, r) => { garde.set(String(k.url || k), r); } } };
});
const env = { SURVEILLANCE_GITHUB: "jeton" };

function scene({ addon = 307, serveur = 200 }) {
  const appels = [];
  const fetchImpl = async (u, init = {}) => {
    const s = String(u);
    appels.push(s);
    if (s.includes("api.github.com")) return new Response(null, { status: 204 });
    if (s.startsWith(SERVEUR_ADDON)) {
      if (serveur instanceof Error) throw serveur;
      return serveur === 200 ? Response.json({ metas: [{ id: "tt1" }] }) : new Response("", { status: serveur });
    }
    assert.equal(init.redirect, "manual");
    return new Response("", { status: addon });
  };
  return { fetchImpl, appels, github: () => appels.filter((a) => a.includes("api.github.com")) };
}

test("tout_va_bien_github_pas_appele", async () => {
  for (const c of [{ addon: 307, serveur: 200 }, { addon: 200, serveur: 502 }, { addon: 200, serveur: new Error("x") }]) {
    const s = scene(c);
    await surveiller(env, s);
    assert.equal(s.github().length, 0, JSON.stringify(c));
  }
});

test("github_reveille_quand_il_y_a_a_faire", async () => {
  for (const c of [{ addon: 307, serveur: 502 }, { addon: 307, serveur: new Error("x") }, { addon: 200, serveur: 200 }]) {
    garde.clear();
    const s = scene(c);
    await surveiller(env, s);
    assert.deepEqual(s.github(), ["https://api.github.com/repos/xnzx07/nuvio-assets/actions/workflows/surveillance.yml/dispatches"], JSON.stringify(c));
  }
});

// Le passage de GitHub prend plusieurs minutes : pas un nouveau à chaque réveil.
test("un_seul_reveil_par_quart_d_heure", async () => {
  const s = scene({ addon: 307, serveur: 502 });
  await surveiller(env, s);
  await surveiller(env, s);
  assert.equal(s.github().length, 1);
});

test("sans_le_jeton_rien_les_copies", async () => {
  const s = scene({ addon: 307, serveur: 502 });
  await surveiller({}, s);
  assert.equal(s.appels.length, 0);
});

test("etat_de_l_addon_inconnu_rien", async () => {
  const s = scene({ addon: 500, serveur: 502 });
  await surveiller(env, s);
  assert.equal(s.github().length, 0);
});

// La tâche des 5 minutes ne déclenche pas les tâches de la nuit (photos des tendances, tops).
test("le_cron_des_5_minutes_ne_lance_pas_la_nuit", async () => {
  const self = [];
  const attentes = [];
  const envW = { SELF: { fetch: async (u) => { self.push(u); return new Response("{}"); } } };
  await worker.scheduled({ cron: CRON_SURVEILLANCE, scheduledTime: Date.UTC(2026, 10, 2, 16, 5) }, envW, { waitUntil: (p) => attentes.push(p) });
  await Promise.all(attentes);
  assert.deepEqual(self, []);
});

test("le_cron_est_declare", async () => {
  const toml = (await import("node:fs")).readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.ok(toml.includes(`crons = ["0 4 * * *", "${CRON_SURVEILLANCE}"]`));
});
