import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import worker, { oublierAvis, lireVfPhoto, avecAvisDuJour, tourneeVfq } from "../worker/index.js";
import { fakeD1 } from "./support/d1.mjs";

let store, appels, env;
beforeEach(() => {
  oublierAvis();
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
// La réserve de la photo tombe après 7 h à Paris : ces tests fixent l'heure.
const aHeure = async (iso, fn) => { const h = mock.method(Date, "now", () => Date.parse(iso)); try { return await fn(); } finally { h.mock.restore(); } };
const LA_NUIT = "2026-11-01T02:00:00Z";
const sf = (video, cle = "cle-relais", e = env) => worker.fetch(new Request(`https://x/sf/${video}.json`, { headers: cle ? { "X-Relais-Cle": cle } : {} }), e, ctx);

// L'avis de StreamFusion pour le service d'affiches : seulement avec la clé du relais ; gardé un jour (un titre n'est
// demandé qu'une fois) ; jamais au-delà du plafond du jour (ici 2), même pour un titre nouveau.
test("streamfusion_avis_cle_cache_et_plafond", async () => {
  assert.equal((await sf("movie/tt801", null)).status, 403);
  assert.equal((await sf("movie/tt801", "mauvaise")).status, 403);
  assert.equal(appels.length, 0);
  assert.deepEqual(await (await sf("movie/tt801")).json(), { vf: true, sources: 1, qualite: { u: 1, x: "DV", p: 0, f: 0, a: 0 }, vff: true });
  assert.deepEqual(await (await sf("movie/tt801")).json(), { vf: true, sources: 1, qualite: { u: 1, x: "DV", p: 0, f: 0, a: 0 }, vff: true });
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
  assert.deepEqual(await (await sf("movie/tt812", "cle-relais", e)).json(), { vf: true, sources: 1, qualite: { u: 0, x: null, p: 0, f: 1, a: 0 }, vff: true });
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
        { name: "[AD⚡️] Lumio", description: "4K • WEB-DL • DV | 🇫🇷 🇬🇧 ✓ | 🔎 C411 | 🗂️ Film.2026.MULTi.VF2.2160p.WEB.DV.mkv", url: "https://lumio.test/play/a" },
        { name: "[AD⚡️] Lumio", description: "1080p • WEB-DL | 🇫🇷 ✓ | 🗂️ Film.2026.FRENCH.1080p.WEB.mkv", url: "https://lumio.test/play/b" }] });
      if (u.includes("tt832")) return Response.json({ streams: [{ name: "⚙️ Lumio", description: "68 sources, mais aucune ne passe vos filtres\nAssouplissez « Seulement les langues vérifiées »." }] });
      if (u.includes("tt833")) return new Response("panne", { status: 502 });
      // Rien du tout (film encore au cinéma : Resident Evil, L'Odyssée) : un message sans lien de lecture.
      if (u.includes("tt835")) return Response.json({ streams: [{ name: "🔴 Lumio", description: "Aucune source trouvée pour ce titre", externalUrl: "https://lumio.test/configure" }] });
      // Un fichier MULTI sans français lu dedans (The Mongoose, 4 nov. 2026) : « 🌍 🇬🇧 », pas de 🇫🇷. Pas une VF.
      if (u.includes("tt836")) return Response.json({ streams: [
        { name: "[AD⚡️] Lumio", description: "4K • WEB-DL • DV • HDR10 • 📶 9,9 Mb/s\n🌍 🇬🇧 • 💾 7,4 Go • 🔎 DMM\n🗂️ The.Mongoose.2026.MULTI.2160p.SREENER.WEB.DL.HDR.DV.HEVC.DDP5.1-MAXX.mkv", url: "https://lumio.test/play/m" }] });
      if (u.includes("tt837")) return Response.json({ streams: [
        { name: "[AD⚡️] Lumio", description: "1080p • WEB-DL • 📶 4,4 Mb/s\n🇫🇷 🇬🇧 ✓ • 💾 3,1 Go • 🔎 V3X\n🗂️ Thief.1981.MULTi.1080p.WEB.H265-CHiLL.mkv", url: "https://lumio.test/play/t" }] });
      if (u.includes("tt838")) return Response.json({ streams: [
        { name: "[AD⚡️] Lumio", description: "1080p • WEB-DL\n🇫🇷 🇬🇧 ✓\n🗂️ 1917.2019.MULTi.1080p.BluRay.x264.mkv", url: "https://lumio.test/play/u" }] });
    }
    if (u.includes("api.themoviedb.org/3/find/tt837")) return Response.json({ movie_results: [{ release_date: "2026-07-10" }] });
    if (u.includes("api.themoviedb.org/3/find/tt838")) return Response.json({ movie_results: [{ release_date: "2019-12-25" }] });
    if (u.startsWith("https://lumio.test/p/stream/")) {
      return Response.json({ streams: [{ name: "⚙️ Lumio", description: "Votre clé AllDebrid a expiré." }] });
    }
    if (u.startsWith("https://sf.test/c/stream/")) {
      appels.push(u);
      return Response.json({ streams: [{ name: "instant / AllDebrid / (1080p)", title: "Film.2026.MULTi.VFF.1080p.WEB" }] });
    }
    return new Response("{}");
  };
  const e = { ...env, LUMIO_URL: "https://lumio.test/p/manifest.json", SF_PLAFOND: "10" };
  const parSf = { vf: true, sources: 1, qualite: { u: 0, x: null, p: 0, f: 1, a: 0 }, vff: true };
  assert.deepEqual(await (await sf("movie/tt831", "cle-relais", e)).json(), { vf: true, sources: 2, qualite: { u: 1, x: "DV", p: 0, f: 1, a: 0 }, vff: true });
  assert.deepEqual(await (await sf("movie/tt832", "cle-relais", e)).json(), { vf: false, sources: 68 });
  assert.deepEqual(await (await sf("movie/tt835", "cle-relais", e)).json(), { vf: false, sources: 1 });
  assert.deepEqual(await (await sf("movie/tt836", "cle-relais", e)).json(), { vf: false, sources: 1 });
  // Le seul fichier est celui d'un autre film (The Isolate Thief, 2026 : « Thief.1981 ») : écarté, pas de VF.
  assert.deepEqual(await (await sf("movie/tt837", "cle-relais", e)).json(), { vf: false, sources: 0 });
  // Une année dans le titre (« 1917 », sorti en 2019) : gardé.
  assert.equal((await (await sf("movie/tt838", "cle-relais", e)).json()).vf, true);
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

// La mémoire commune (D1) : un titre demandé dans un centre de données Cloudflare ne l'est plus dans un autre (chacun
// a sa propre Cache API). Le 27 octobre, le même titre partait chez Lumio depuis Paris, Francfort, Londres…
test("avis_gardes_pour_tous_les_centres_de_donnees", async () => {
  assert.equal((await (await sf("movie/tt851")).json()).vf, true);
  assert.equal(appels.length, 1);
  assert.ok(env.LIENS.avis.has("movie/tt851"), "écrit dans la mémoire commune");
  store.clear(); // un autre centre de données : sa Cache API est vide
  assert.equal((await (await sf("movie/tt851")).json()).vf, true);
  assert.equal(appels.length, 1, "lu dans la mémoire commune, pas redemandé");
});

// Une VF trouvée ne disparaît pas : gardée 7 jours. « Pas de VF » : 3 heures pendant les 7 premiers jours où le titre est
// vu sans VF (elle arrive souvent le jour de la sortie numérique), puis un jour (sorti depuis longtemps sans VF).
test("vf_gardee_sept_jours_pas_de_vf_trois_heures_puis_un_jour", async () => {
  let vf = false;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (!u.startsWith("https://sf.test/c/stream/")) return new Response("{}");
    appels.push(u);
    return Response.json({ streams: vf ? [{ name: "instant / AllDebrid / (1080p)", title: "Film.2026.MULTi.VFF.1080p.WEB" }]
      : [{ name: "Stream-Fusion", title: "Aucun résultat trouvé, 3 exclus" }] });
  };
  const e = { ...env, SF_PLAFOND: "100" };
  const h = 3600000, debut = Date.parse("2026-10-20T10:00:00Z");
  const horloge = mock.method(Date, "now", () => debut);
  const lire = async (decalage) => { horloge.mock.mockImplementation(() => debut + decalage); return (await (await sf("movie/tt861", "cle-relais", e)).json()).vf; };
  try {
    assert.equal(await lire(0), false);
    assert.equal(await lire(2 * h), false);
    assert.equal(appels.length, 1, "gardé moins de 3 h");
    assert.equal(await lire(3 * h + 1000), false);
    assert.equal(appels.length, 2, "redemandé après 3 h");
    // Sept jours sans VF : plus qu'une fois par jour.
    assert.equal(await lire(7 * 24 * h + 1000), false);
    assert.equal(appels.length, 3);
    assert.equal(await lire(7 * 24 * h + 5 * h), false);
    assert.equal(appels.length, 3, "vu sans VF depuis 7 jours : gardé un jour");
    vf = true;
    assert.equal(await lire(8 * 24 * h + 2000), true);
    assert.equal(appels.length, 4, "redemandé le lendemain : la VF est là");
    vf = false;
    assert.equal(await lire(14 * 24 * h), true, "une VF trouvée reste 7 jours");
    assert.equal(appels.length, 4);
    assert.equal(await lire(15 * 24 * h + 3000), false);
    assert.equal(appels.length, 5, "redemandée après 7 jours");
  } finally { horloge.mock.restore(); }
});

// Lumio a son plafond (LUMIO_PLAFOND, 50 par défaut) : au-delà, StreamFusion, dans le sien. Un plafond atteint est
// retenu : plus de demande ni d'écriture en base pour rien.
test("lumio_plafonne_et_plafond_retenu", async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.startsWith("https://lumio.test/p/stream/")) {
      appels.push(u);
      return Response.json({ streams: [{ name: "[AD⚡️] Lumio", description: "1080p • WEB-DL | 🇫🇷 ✓", url: "https://lumio.test/play/x" }] });
    }
    if (u.startsWith("https://sf.test/c/stream/")) {
      appels.push(u);
      return Response.json({ streams: [{ name: "instant / AllDebrid / (1080p)", title: "Film.2026.MULTi.VFF.1080p.WEB" }] });
    }
    return new Response("{}");
  };
  // 5 au total : 3 réservés à la photo, 2 pour les affiches.
  const e = { ...env, LUMIO_URL: "https://lumio.test/p/manifest.json", LUMIO_PLAFOND: "5", SF_PLAFOND: "1" };
  await aHeure(LA_NUIT, async () => {
    for (const id of ["tt871", "tt872", "tt873"]) assert.equal((await (await sf(`movie/${id}`, "cle-relais", e)).json()).vf, true);
    assert.equal(appels.filter((u) => u.startsWith("https://lumio.test")).length, 2, "Lumio : 2 au plus");
    assert.ok(appels.includes("https://sf.test/c/stream/movie/tt873.json"), "le troisième chez StreamFusion");
    assert.deepEqual(await (await sf("movie/tt874", "cle-relais", e)).json(), { plafond: true });
    const ecrites = e.LIENS.ecritures.length;
    assert.deepEqual(await (await sf("movie/tt875", "cle-relais", e)).json(), { plafond: true });
    assert.deepEqual(await (await sf("movie/tt876", "cle-relais", e)).json(), { plafond: true });
    assert.equal(e.LIENS.ecritures.length, ecrites, "plafonds atteints : plus rien d'écrit");
    assert.equal(appels.length, 3);
    const jour = [...e.LIENS.budget.keys()].find((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
    assert.equal(e.LIENS.budget.get(`lumio:${jour}`), 2);
    assert.equal(e.LIENS.budget.get(jour), 1);
    // Plusieurs titres d'un coup, plafond presque atteint : ce qui reste, pas rien.
    oublierAvis();
    const f = { ...e, LUMIO_PLAFOND: "6", SF_PLAFOND: "1" };
    appels.length = 0;
    assert.equal((await (await sf("movie/tt877", "cle-relais", f)).json()).vf, true);
    assert.equal(f.LIENS.budget.get(`lumio:${jour}`), 3);
  });
});

// Torrentio sûr (un fichier TRUEFRENCH, VFF… : vff) : ni Lumio ni StreamFusion pour ce titre, sa qualité VF suffit.
test("torrentio_sur_pas_de_demande_au_debrideur", async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/vf.json")) return Response.json({
      "movie/tt881": { vf: true, sources: 3, langue: "multi", vff: true, vfq: { u: 1, x: "DV", p: 0, f: 1, a: 1 } },
      "movie/tt882": { vf: true, sources: 2, langue: "vf" },
      "movie/tt883": { vf: false, sources: 4, langue: "vo" } });
    if (u.startsWith("https://lumio.test/p/stream/")) {
      appels.push(u);
      return Response.json({ streams: [{ name: "⚙️ Lumio", description: "9 sources, mais aucune ne passe vos filtres" }] });
    }
    return new Response("{}");
  };
  const e = { ...env, LUMIO_URL: "https://lumio.test/p/manifest.json", AFFICHES_URL: "https://affiches.test" };
  const lus = await lireVfPhoto(e, ["movie/tt881", "movie/tt882", "movie/tt883"]);
  assert.deepEqual(appels.sort(), ["https://lumio.test/p/stream/movie/tt882.json", "https://lumio.test/p/stream/movie/tt883.json"]);
  assert.equal(lus.get("movie/tt881").vf, true);
  assert.deepEqual(lus.get("movie/tt881").qualite, { u: 1, x: "DV", p: 0, f: 1, a: 1 });
  assert.equal(lus.get("movie/tt882").vf, false, "FRENCH seul : Lumio a lu la piste (VFQ)");
  // Les rangées et les fiches : pareil.
  appels.length = 0;
  const rangee = new Map([["tt881", { vf: true, sources: 3, vff: true }], ["tt884", { vf: true, sources: 1 }]]);
  await avecAvisDuJour(e, rangee, [["tt881", "movie/tt881"], ["tt884", "movie/tt884"]]);
  assert.deepEqual(appels, ["https://lumio.test/p/stream/movie/tt884.json"]);
  assert.equal(rangee.get("tt881").vf, true);
  assert.equal(rangee.get("tt884").vf, false);
});

// Une part de chaque plafond réservée à la photo des tendances (60 % de Lumio) : le 28 octobre, les rangées de minuit
// avaient pris les 50 demandes Lumio et les 100 StreamFusion avant la photo de 4 h UTC, jugée par Torrentio seul.
test("part_du_plafond_reservee_a_la_photo", async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/vf.json")) return Response.json({});
    if (u.startsWith("https://lumio.test/p/stream/")) {
      appels.push(u);
      return Response.json({ streams: [{ name: "[AD⚡️] Lumio", description: "1080p • WEB-DL | 🇫🇷 ✓", url: "https://lumio.test/play/x" }] });
    }
    return new Response("{}");
  };
  const e = { ...env, LUMIO_URL: "https://lumio.test/p/manifest.json", LUMIO_PLAFOND: "5", STREAMFUSION_URL: "", AFFICHES_URL: "https://affiches.test" };
  await aHeure(LA_NUIT, async () => {
    for (const id of ["tt891", "tt892", "tt893"]) await sf(`movie/${id}`, "cle-relais", e);
    assert.equal(appels.length, 2, "les affiches : 2 sur 5");
    const lus = await lireVfPhoto(e, ["movie/tt894", "movie/tt895", "movie/tt896", "movie/tt897"]);
    assert.equal(appels.length, 5, "la photo : les 3 réservés");
    assert.equal([...lus.values()].filter((x) => x.vf).length, 3);
    const jour = [...e.LIENS.budget.keys()].find((k) => /^lumio:\d{4}-\d{2}-\d{2}$/.test(k));
    assert.equal(e.LIENS.budget.get(jour), 5);
    assert.equal(e.LIENS.budget.get(`${jour}:photo`), 3);
  });
});

// La photo passée, ce qu'elle n'a pas pris sert aux rangées et aux affiches : le 29 octobre, 17 demandes Lumio et 40
// StreamFusion réservées sont restées sans emploi, et les affiches n'ont eu aucun avis de la journée.
test("reserve_de_la_photo_liberee_le_matin", async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (!u.startsWith("https://lumio.test/p/stream/")) return new Response("{}");
    appels.push(u);
    return Response.json({ streams: [{ name: "[AD⚡️] Lumio", description: "1080p • WEB-DL | 🇫🇷 ✓", url: "https://lumio.test/play/x" }] });
  };
  const e = { ...env, LUMIO_URL: "https://lumio.test/p/manifest.json", LUMIO_PLAFOND: "5", STREAMFUSION_URL: "" };
  const demander = (id) => sf(`movie/${id}`, "cle-relais", e).then((r) => r.json());
  await aHeure(LA_NUIT, async () => {
    assert.equal((await demander("tt901")).vf, true);
    assert.equal((await demander("tt902")).vf, true);
    assert.deepEqual(await demander("tt903"), { plafond: true }, "la nuit : 2 sur 5");
  });
  // 6 h 30 à Paris (5 h 30 UTC) : la photo n'est peut-être pas finie, la réserve tient.
  await aHeure("2026-11-01T05:30:00Z", async () => assert.deepEqual(await demander("tt904"), { plafond: true }));
  // 7 h à Paris : le reste est libre, jusqu'au plafond total.
  await aHeure("2026-11-01T06:00:00Z", async () => {
    for (const id of ["tt905", "tt906", "tt907"]) assert.equal((await demander(id)).vf, true);
    assert.deepEqual(await demander("tt908"), { plafond: true }, "jamais plus que le total");
  });
  assert.equal(appels.length, 5);
});

// De la VFQ seulement chez Torrentio (quebec) : Lumio est demandé, mais il prend la VFQ pour de la VF (Hope, N°5 des
// Tendances le 28 octobre 2026) : seule une VFF prouvée par ses noms (TRUEFRENCH, VFF, VF2) change l'avis (Resident
// Evil, le 11 novembre 2026 : « MULTi.VFQ » chez Torrentio, TRUEFRENCH chez Lumio).
test("vfq_seulement_seule_la_vff_prouvee_la_change", async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/vf.json")) return Response.json({ "movie/tt891": { vf: false, sources: 9, langue: "vo", quebec: true },
      "movie/tt892": { vf: true, sources: 9, langue: "multi", quebec: true, vfqPossible: true, vffLe: "2027-01-16", vffVers: true } });
    if (u.startsWith("https://lumio.test/p/stream/")) {
      appels.push(u);
      const nom = u.includes("tt892") ? "Film.2026.MULTi.TRUEFRENCH.2160p.WEB-DL.mkv" : "Film.2026.MULTi.1080p.WEB.mkv";
      return Response.json({ streams: [{ name: "[AD⚡️] Lumio", description: `1080p • WEB-DL | 🇫🇷 ✓ | 🔎 C411 | 🗂️ ${nom}`, url: "https://lumio.test/play/x" }] });
    }
    return new Response("{}");
  };
  const e = { ...env, LUMIO_URL: "https://lumio.test/p/manifest.json", AFFICHES_URL: "https://affiches.test", LIENS: fakeD1() };
  const lus = await lireVfPhoto(e, ["movie/tt891", "movie/tt892"]);
  assert.equal(lus.get("movie/tt891").vf, false, "VF sans preuve : la VFQ de Torrentio reste");
  assert.equal(lus.get("movie/tt891").quebec, true);
  assert.equal(lus.get("movie/tt892").vff, true, "TRUEFRENCH chez Lumio : la VFF");
  assert.equal(lus.get("movie/tt892").vfqPossible, undefined);
  const rangee = new Map([["tt891", { vf: false, sources: 9, quebec: true }], ["tt892", { vf: true, sources: 9, quebec: true, vfqPossible: true, vffLe: "2027-01-16" }]]);
  await avecAvisDuJour(e, rangee, [["tt891", "movie/tt891"], ["tt892", "movie/tt892"]]);
  assert.deepEqual(rangee.get("tt891"), { vf: false, sources: 9, quebec: true });
  const jour = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  assert.deepEqual(rangee.get("tt892"), { vf: true, vff: true, sources: 1, vffVu: jour });
});

// Le doute dans l'addon : Lumio est encore demandé pour vffImpossible (« non » : pas de VF ; « oui » : le doute).
test("doute_vfq_lumio_decide", async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/vf.json")) return Response.json({
      "movie/tt911": { vf: true, sources: 8, vffImpossible: true, vfqPossible: true, vffLe: "2026-11-17" },
      "movie/tt912": { vf: true, sources: 8, vffImpossible: true, vfqPossible: true },
      "movie/tt914": { vf: false, sources: 4, vffImpossible: true } });
    if (u.startsWith("https://lumio.test/p/stream/")) {
      appels.push(u);
      return Response.json({ streams: u.includes("tt912") ? [{ name: "⚙️ Lumio", description: "9 sources, mais aucune ne passe vos filtres" }]
        : [{ name: "[AD⚡️] Lumio", description: "1080p • WEB-DL | 🇫🇷 ✓", url: "https://lumio.test/play/x" }] });
    }
    return new Response("{}");
  };
  const e = { ...env, LUMIO_URL: "https://lumio.test/p/manifest.json", STREAMFUSION_URL: "" };
  const lus = await lireVfPhoto(e, ["movie/tt911", "movie/tt912", "movie/tt914"]);
  assert.equal(appels.length, 3);
  assert.deepEqual([lus.get("movie/tt911").vf, lus.get("movie/tt911").vfqPossible, lus.get("movie/tt911").vffLe], [true, true, "2026-11-17"]);
  assert.deepEqual([lus.get("movie/tt912").vf, lus.get("movie/tt912").vfqPossible], [false, undefined]);
  assert.deepEqual([lus.get("movie/tt914").vf, lus.get("movie/tt914").vfqPossible], [true, true], "rien chez Torrentio, Lumio dit VF : le doute");
});

// La tournée de nuit des films « VFQ possible » de « Bientôt dispo » : Lumio relu même avec un avis « VF » gardé (sans
// VFF prouvée), dans son plafond à part (VFQ_PLAFOND) ; seuls ceux-là. Resident Evil, le 11 novembre 2026.
test("tournee_vfq_relit_lumio_pour_trouver_la_vff", async () => {
  let vff = false;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.startsWith("https://lumio.test/p/stream/")) {
      appels.push(u);
      const nom = vff ? "Film.2026.MULTi.TRUEFRENCH.2160p.WEB-DL.mkv" : "Film.2026.MULTi.2160p.WEB.mkv";
      return Response.json({ streams: [{ name: "[AD⚡️] Lumio", description: `4K • WEB-DL | 🇫🇷 🇨🇦 ✓ | 🔎 C411 | 🗂️ ${nom}`, url: "https://lumio.test/play/x" }] });
    }
    return new Response("{}");
  };
  const rangee = { metas: [
    { id: "tt951", description: "📅 VFQ possible · VFF vers le 16 janv.\nRésumé" },
    { id: "tt952", description: "📅 Dispo le 20 nov.\nRésumé" },
    { id: "tmdb:9", description: "📅 VFQ possible\nRésumé" } ] };
  const lus = [];
  const lire = async (p) => { lus.push(p); return rangee; };
  const e = { ...env, LUMIO_URL: "https://lumio.test/p/manifest.json", VFQ_PLAFOND: "5" };
  const premier = await tourneeVfq(e, lire);
  assert.deepEqual(premier, { vus: 1, relus: 1, vff: [] });
  assert.deepEqual(lus, ["/catalog/movie/accueil-vod-bientot.json"], "moins de 20 : une page");
  // Le lendemain, la VFF est sortie : l'avis « VF » gardé 7 jours est relu quand même.
  vff = true;
  assert.deepEqual(await tourneeVfq(e, lire), { vus: 1, relus: 1, vff: ["movie/tt951"] });
  assert.equal(appels.length, 2);
  assert.ok(!appels.some((u) => u.startsWith("https://sf.test")), "pas StreamFusion");
  // Une VFF prouvée gardée : pas relue.
  await tourneeVfq(e, lire);
  assert.equal(appels.length, 2);
});

// Le jour où la VFF prouvée arrive (vffDepuis) : vu seulement après un avis qui disait autre chose ; un premier avis
// déjà en VFF ne sait pas depuis quand.
test("vff_depuis_vue_seulement_au_changement", async () => {
  let nom = "Film.2026.MULTi.1080p.WEB.mkv";
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/vf.json")) return Response.json({});
    if (u.startsWith("https://lumio.test/p/stream/")) {
      appels.push(u);
      return Response.json({ streams: [{ name: "[AD⚡️] Lumio", description: `1080p • WEB-DL | 🇫🇷 ✓ | 🔎 C411 | 🗂️ ${nom}`, url: "https://lumio.test/play/x" }] });
    }
    return new Response("{}");
  };
  const e = { ...env, LUMIO_URL: "https://lumio.test/p/manifest.json", AFFICHES_URL: "https://affiches.test", VFQ_PLAFOND: "9" };
  const jour = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  const rangee = { metas: [{ id: "tt961", description: "📅 VFQ possible\nRésumé" }, { id: "tt962", description: "📅 VFQ possible\nRésumé" }] };
  // tt962 : déjà en VFF au premier avis.
  const premier = await aHeure(LA_NUIT, () => tourneeVfq(e, async () => ({ metas: [rangee.metas[0]] })));
  assert.deepEqual(premier.vff, []);
  nom = "Film.2026.MULTi.TRUEFRENCH.1080p.WEB.mkv";
  await tourneeVfq(e, async () => rangee);
  const lus = await lireVfPhoto(e, ["movie/tt961", "movie/tt962"]);
  assert.equal(lus.get("movie/tt961").vff, true);
  assert.equal(lus.get("movie/tt961").vffDepuis, jour, "VF sans preuve, puis TRUEFRENCH : arrivée vue aujourd'hui");
  assert.equal(lus.get("movie/tt962").vff, true);
  assert.equal(lus.get("movie/tt962").vffDepuis, undefined, "premier avis : on ne sait pas depuis quand");
  // Le premier jour vu (vffVu), lui, est toujours là : la date d'une VFF en avance dans l'Agenda d'AppTV.
  assert.equal(lus.get("movie/tt962").vffVu, jour);
  assert.equal(lus.get("movie/tt961").vffVu, jour);
});

// La VFF prouvée par les noms : deux équipes, ou une seule trouvée sur un tracker torrent. L'Odyssée, le 11 novembre
// 2026 : un seul fichier « MULTI.VF2 » de CZHD, sur des sites de téléchargement direct seulement : pas une preuve.
test("vff_prouvee_par_deux_equipes_ou_un_tracker", async () => {
  const f = (desc) => ({ name: "[AD⚡️] Lumio", description: desc, url: "https://lumio.test/play/x" });
  const odyssee = [
    f("1080p • WEB-DL • 📶 2,9 Mb/s\n🇫🇷 🇨🇦 🇬🇧 ✓ • 💾 3,8 Go • 🔎 GenerationFree\n🎧 H264 • AAC 5.1 • CZHD\n🗂️ The.Odyssey.2026.WEB.1080p.MULTI.VF2.H264-CZHD.mkv"),
    f("1080p • WEB-DL • 📶 2,9 Mb/s\n🌍 🇫🇷 🇨🇦 • 💾 3,8 Go • 🔎 Free-Telecharger • 🔗 turbobit · 1fichier\n🎧 H264 • CZHD\n🗂️ The.Odyssey.2026.WEB.1080p.MULTI.VF2.H264-CZHD.mkv"),
    f("1080p • WEB-DL\n🇫🇷 🇨🇦 🇬🇧 ✓ • 🔎 V3X\n🗂️ The.Odyssey.2026.MULTi.1080p.WEB.H265-SUPERFLU.mkv"),
  ];
  const tableau = {
    tt971: odyssee,
    // la même équipe sur un tracker torrent : prouvée
    tt972: [f("4K • WEB-DL\n🌍 🇫🇷 🇬🇧 • 💾 17,6 Go • 🔎 C411\n🎧 HEVC • AC3 5.1 • Slay3R\n🗂️ Resident.Evil.2026.MULTi.TRUEFRENCH.2160p.HDR.DV.WEB-DL.H265-Slay3R.mkv")],
    // deux équipes, en téléchargement direct seulement : prouvée
    tt973: [f("🇫🇷 ✓ • 🔎 Wawacity • 🔗 rapidgator\n🗂️ Film.2026.MULTi.VFF.1080p.WEB-AAA.mkv"), f("🇫🇷 ✓ • 🔎 Tirexo • 🔗 1fichier\n🗂️ Film.2026.MULTi.VF2.1080p.WEB-BBB.mkv")],
  };
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/vf.json")) return Response.json({});
    const m = /lumio\.test\/p\/stream\/movie\/(tt\d+)\.json/.exec(u);
    if (m) return Response.json({ streams: tableau[m[1]] || [] });
    return new Response("{}");
  };
  const e = { ...env, LUMIO_URL: "https://lumio.test/p/manifest.json", AFFICHES_URL: "https://affiches.test" };
  const lus = await lireVfPhoto(e, ["movie/tt971", "movie/tt972", "movie/tt973"]);
  assert.equal(lus.get("movie/tt971").vf, true);
  assert.equal(lus.get("movie/tt971").vff, undefined, "L'Odyssée : un seul fichier CZHD, hors tracker");
  assert.equal(lus.get("movie/tt972").vff, true, "Slay3R sur C411");
  assert.equal(lus.get("movie/tt973").vff, true, "deux équipes");
});
