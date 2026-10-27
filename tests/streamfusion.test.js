import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";

// Base D1 simulée : juste le plafond de StreamFusion (sf_budget, INSERT … ON CONFLICT … RETURNING).
function fakeD1() {
  const budget = new Map();
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    async run() {
      if (sql.startsWith("CREATE")) return {};
      // Compte par origine (« jour:photo », « jour:affiches », « jour:refus ») : sans plafond.
      if (sql.startsWith("INSERT INTO sf_budget")) { const [j, n] = args; budget.set(j, (budget.get(j) || 0) + n); return {}; }
      throw new Error("requête inattendue : " + sql);
    },
    async first() {
      if (!sql.startsWith("INSERT INTO sf_budget")) throw new Error("requête inattendue : " + sql);
      const [j, n, plafond] = args, avant = budget.get(j);
      if (avant === undefined) { budget.set(j, n); return { n }; }
      if (avant + n > plafond) return null;
      budget.set(j, avant + n);
      return { n: avant + n };
    },
  });
  return { budget, prepare: (sql) => stmt(sql) };
}

let store, appels, env;
beforeEach(() => {
  store = new Map();
  appels = [];
  globalThis.caches = { default: {
    match: async (req) => (store.has(req.url) ? new Response(store.get(req.url)) : undefined),
    put: async (req, res) => { store.set(req.url, await res.text()); },
  } };
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.startsWith("https://sf.test/c/stream/")) {
      appels.push(u);
      return new Response(JSON.stringify({ streams: u.includes("tt802") ? [{ name: "Stream-Fusion", title: "Aucun résultat trouvé, 4 exclus" }]
        : [{ name: "instant / AllDebrid / (2160p)", title: "Film.2026.MULTi.VFF.2160p.WEB.DV" }] }));
    }
    return new Response("{}");
  };
  env = { TMDB_API_KEY: "tmdb", RELAIS_KEY: "cle-relais", STREAMFUSION_URL: "https://sf.test/c/manifest.json", SF_PLAFOND: "2", LIENS: fakeD1() };
});
const ctx = { waitUntil: () => {} };
const sf = (video, cle = "cle-relais", e = env) => worker.fetch(new Request(`https://x/sf/${video}.json`, { headers: cle ? { "X-Relais-Cle": cle } : {} }), e, ctx);

// L'avis de StreamFusion pour le service d'affiches : seulement avec la clé du relais ; gardé un jour (un titre n'est
// demandé qu'une fois) ; jamais au-delà du plafond du jour (ici 2), même pour un titre nouveau.
test("streamfusion_avis_cle_cache_et_plafond", async () => {
  assert.equal((await sf("movie/tt801", null)).status, 403);
  assert.equal((await sf("movie/tt801", "mauvaise")).status, 403);
  assert.equal(appels.length, 0);
  assert.deepEqual(await (await sf("movie/tt801")).json(), { vf: true, sources: 1, qualite: { u: 1, x: "DV", p: 0, f: 0, a: 0 } });
  assert.deepEqual(await (await sf("movie/tt801")).json(), { vf: true, sources: 1, qualite: { u: 1, x: "DV", p: 0, f: 0, a: 0 } });
  assert.equal(appels.length, 1, "gardé : pas redemandé");
  assert.deepEqual(await (await sf("series/tt802:1:1")).json(), { vf: false, sources: 4 });
  assert.deepEqual(await (await sf("movie/tt803")).json(), { plafond: true });
  assert.equal(appels.length, 2, "plafond : StreamFusion pas appelé");
  // Sans clé du relais réglée, ou sans StreamFusion : rien.
  assert.equal((await sf("movie/tt804", "cle-relais", { ...env, RELAIS_KEY: "" })).status, 403);
  assert.deepEqual(await (await sf("movie/tt805", "cle-relais", { ...env, STREAMFUSION_URL: "" })).json(), { plafond: true });
});

// Filmé dans une salle de cinéma (CAM, TS) : pas une sortie, ni VF ni sources (Tombé du ciel, au cinéma : « FRENCH
// CAM » seulement). Les vraies sources à côté comptent seules.
test("streamfusion_sans_les_flux_filmes_en_salle", async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (!u.startsWith("https://sf.test/c/stream/")) return new Response("{}");
    return new Response(JSON.stringify({ streams: u.includes("tt811")
      ? [{ name: "instant / AllDebrid / (1080p)", title: "Tombe.Du.Ciel.2026.1080p.FRENCH.CAM.x264-FS" }, { name: "instant / AllDebrid / (720p)", title: "Tombe.du.Ciel.2026.FRENCH.HDTS" }]
      : [{ name: "instant / AllDebrid / (1080p)", title: "Film.2026.FRENCH.CAM" }, { name: "instant / AllDebrid / (1080p)", title: "Film.2026.MULTi.VFF.1080p.WEB" }] }));
  };
  const e = { ...env, SF_PLAFOND: "10" };
  assert.deepEqual(await (await sf("movie/tt811", "cle-relais", e)).json(), { vf: false, sources: 0 });
  assert.deepEqual(await (await sf("movie/tt812", "cle-relais", e)).json(), { vf: true, sources: 1, qualite: { u: 0, x: null, p: 0, f: 1, a: 0 } });
});

// « Aucun résultat » sans source écartée (film sorti en numérique la veille, pas encore de fichier : 空枪) : pas de VF,
// compté comme une source en VO, pour que la date ne décide pas seule. Et le compte par origine.
test("streamfusion_aucun_resultat_veut_dire_sans_vf", async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (!u.startsWith("https://sf.test/c/stream/")) return new Response("{}");
    appels.push(u);
    return new Response(JSON.stringify({ streams: [{ name: "Stream-Fusion", title: "Aucun résultat trouvé" }] }));
  };
  const e = { ...env, SF_PLAFOND: "1" };
  assert.deepEqual(await (await sf("movie/tt821", "cle-relais", e)).json(), { vf: false, sources: 1 });
  assert.deepEqual(await (await sf("movie/tt822", "cle-relais", e)).json(), { plafond: true });
  const jour = [...e.LIENS.budget.keys()].find((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
  assert.equal(e.LIENS.budget.get(jour), 1);
  assert.equal(e.LIENS.budget.get(`${jour}:affiches`), 1);
  assert.equal(e.LIENS.budget.get(`${jour}:refus`), 1);
});

// Lumio (LUMIO_URL : un profil réglé sur les langues vérifiées, sans VFQ) donne l'avis VF en premier : il lit la langue
// dans le fichier (By Any Means, en VFQ seulement : « aucune ne passe vos filtres »). StreamFusion n'est demandé, et
// compté dans son plafond, que si Lumio ne répond pas (panne, ou un message qui ne dit rien de la VF).
test("lumio_d_abord_streamfusion_en_secours", async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.startsWith("https://lumio.test/p/stream/")) {
      appels.push(u);
      if (u.includes("tt831")) return Response.json({ streams: [
        { name: "[AD⚡️] Lumio", description: "4K • WEB-DL • DV | 🇫🇷 🇬🇧 ✓ | 🗂️ Film.2026.MULTi.VF2.2160p.WEB.DV.mkv", url: "https://lumio.test/play/a" },
        { name: "[AD⚡️] Lumio", description: "1080p • WEB-DL | 🇫🇷 ✓ | 🗂️ Film.2026.FRENCH.1080p.WEB.mkv", url: "https://lumio.test/play/b" }] });
      if (u.includes("tt832")) return Response.json({ streams: [{ name: "⚙️ Lumio", description: "68 sources, mais aucune ne passe vos filtres\nAssouplissez « Seulement les langues vérifiées »." }] });
      if (u.includes("tt833")) return new Response("panne", { status: 502 });
      // Rien du tout (film encore au cinéma : Resident Evil, L'Odyssée) : un message sans lien de lecture.
      if (u.includes("tt835")) return Response.json({ streams: [{ name: "🔴 Lumio", description: "Aucune source trouvée pour ce titre", externalUrl: "https://lumio.test/configure" }] });
      return Response.json({ streams: [{ name: "⚙️ Lumio", description: "Votre clé AllDebrid a expiré." }] });
    }
    if (u.startsWith("https://sf.test/c/stream/")) {
      appels.push(u);
      return Response.json({ streams: [{ name: "instant / AllDebrid / (1080p)", title: "Film.2026.MULTi.VFF.1080p.WEB" }] });
    }
    return new Response("{}");
  };
  const e = { ...env, LUMIO_URL: "https://lumio.test/p/manifest.json", SF_PLAFOND: "10" };
  const parSf = { vf: true, sources: 1, qualite: { u: 0, x: null, p: 0, f: 1, a: 0 } };
  assert.deepEqual(await (await sf("movie/tt831", "cle-relais", e)).json(), { vf: true, sources: 2, qualite: { u: 1, x: "DV", p: 0, f: 1, a: 0 } });
  assert.deepEqual(await (await sf("movie/tt832", "cle-relais", e)).json(), { vf: false, sources: 68 });
  assert.deepEqual(await (await sf("movie/tt835", "cle-relais", e)).json(), { vf: false, sources: 1 });
  assert.ok(!appels.some((u) => u.startsWith("https://sf.test")), "Lumio a répondu : StreamFusion pas demandé");
  assert.deepEqual(await (await sf("movie/tt833", "cle-relais", e)).json(), parSf);
  assert.deepEqual(await (await sf("series/tt834:2:1", "cle-relais", e)).json(), parSf);
  assert.equal(appels.filter((u) => u.startsWith("https://sf.test")).length, 2);
  assert.ok(appels.includes("https://lumio.test/p/stream/series/tt834:2:1.json"));
});

// Un « pas de VF » ne tient que 3 heures : la VF sort souvent le jour même de la sortie numérique (The Dog Stars, gris
// toute la journée du 27 octobre avec l'avis de 4 h). Une VF trouvée, elle, n'est pas redemandée dans la journée.
test("pas_de_vf_redemande_trois_heures_plus_tard", async () => {
  let vf = false;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (!u.startsWith("https://lumio.test/p/stream/")) return new Response("{}");
    appels.push(u);
    return Response.json({ streams: vf ? [{ name: "[AD⚡️] Lumio", description: "1080p • WEB-DL | 🇫🇷 ✓", url: "https://lumio.test/play/c" }]
      : [{ name: "⚙️ Lumio", description: "12 sources, mais aucune ne passe vos filtres" }] });
  };
  const e = { ...env, LUMIO_URL: "https://lumio.test/p/manifest.json" };
  const debut = Date.parse("2026-10-27T04:00:00Z");
  const horloge = mock.method(Date, "now", () => debut);
  try {
    assert.equal((await (await sf("movie/tt841", "cle-relais", e)).json()).vf, false);
    vf = true;
    horloge.mock.mockImplementation(() => debut + 2 * 3600000);
    assert.equal((await (await sf("movie/tt841", "cle-relais", e)).json()).vf, false, "gardé moins de 3 h");
    horloge.mock.mockImplementation(() => debut + 3 * 3600000 + 1000);
    assert.equal((await (await sf("movie/tt841", "cle-relais", e)).json()).vf, true, "redemandé après 3 h");
    vf = false;
    horloge.mock.mockImplementation(() => debut + 13 * 3600000);
    assert.equal((await (await sf("movie/tt841", "cle-relais", e)).json()).vf, true, "une VF trouvée reste dans la journée");
    assert.equal(appels.length, 2);
  } finally { horloge.mock.restore(); }
});
