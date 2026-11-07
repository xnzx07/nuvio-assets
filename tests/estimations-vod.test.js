import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker, { oublierInfos, dispoChezSoi } from "../worker/index.js";
import { dispoChezSoi as dispoAffiche, estimationDe, tableVod } from "../affiches/lib/statut.js";

// Sans date numérique américaine annoncée, la sortie numérique est estimée d'après la fenêtre habituelle du
// distributeur américain du film (data/estimations-vod.json, scripts/build_fenetres_vod.py), plus la salle + 45 jours.
// La fiche, les rangées et l'affiche disent le même jour.
const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const court = (iso) => `${Number(iso.slice(8, 10))} ${MOIS[Number(iso.slice(5, 7)) - 1]}`;
// La ligne de la fiche finit par un point (pas deux après « déc. »).
const point = (s) => (s.endsWith(".") ? s : s + ".");
const pays = (p, ...dates) => ({ iso_3166_1: p, release_dates: dates.map(([type, d]) => ({ type, release_date: d + "T00:00:00.000Z" })) });
const VOD_URL = "https://raw.githubusercontent.com/xnzx07/nuvio-assets/main/data/estimations-vod.json";
const TABLE = {
  maj: jour(0), mediane: 32, mesures: 505,
  fenetres: {
    Q1323594: { nom: "Disney", jours: 60, films: 13, source: "mesure" },
    Q168383: { nom: "Universal", jours: 18, films: 25, source: "mesure" },
  },
  films: {
    tt901: { date: jour(10), distributeur: "Q1323594", jours: 60 },
    tt902: { date: jour(8), distributeur: "Q168383", jours: 18 },
  },
};

let store, calls;
beforeEach(() => {
  store = new Map();
  calls = [];
  oublierInfos();
  globalThis.caches = { default: {
    match: async (req) => (store.has(req.url) ? new Response(store.get(req.url)) : undefined),
    put: async (req, res) => { store.set(req.url, await res.text()); },
  } };
});
const env = { TMDB_API_KEY: "tmdb" };
const get = (path) => worker.fetch(new Request(`https://x${path}`), env, { waitUntil: () => {} });
const filmVod = (n, dates) => ({ id: n, title: `Film ${n}`, imdb_id: "tt" + (900 + n), original_language: "en", release_date: jour(-30),
  release_dates: { results: dates } });

/** TMDB, le service d'affiches (/vf.json : rien de lu) et le dépôt (la table) simulés. */
function internet(fiches, { table = TABLE, discover = [] } = {}) {
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u === VOD_URL) return new Response(JSON.stringify(table));
    if (u.includes("/vf.json")) return new Response("{}");
    if (u.includes("/discover/movie")) return new Response(JSON.stringify({ results: discover, page: 1, total_pages: 1 }));
    const m = /\/movie\/(\d+)\?/.exec(u);
    if (m && fiches[m[1]]) return new Response(JSON.stringify(fiches[m[1]]));
    return new Response(JSON.stringify({ results: [] }));
  };
}

test("estimation_d_apres_le_distributeur", () => {
  const salle = [pays("US", [3, jour(-10)])];
  const vod = estimationDe(tableVod(TABLE), "tt901");
  // Disney : 60 jours après la salle, pas 45.
  assert.deepEqual(dispoChezSoi(salle, "en", vod), { date: jour(50), vers: true });
  // Pas dans la table (sans distributeur connu) : la médiane de tous les films mesurés.
  assert.deepEqual(dispoChezSoi(salle, "en", estimationDe(tableVod(TABLE), "tt999")), { date: jour(22), vers: true });
  // Sans table (fichier illisible) : la salle + 45 jours, comme avant.
  assert.deepEqual(dispoChezSoi(salle, "en", null), { date: jour(35), vers: true });
  assert.deepEqual(dispoChezSoi(salle, "en", estimationDe(tableVod({ films: {} }), "tt901")), { date: jour(35), vers: true });
  // Une sortie numérique américaine annoncée l'emporte toujours sur l'estimation.
  assert.deepEqual(dispoChezSoi([pays("US", [3, jour(-10)], [4, jour(5)])], "en", vod), { date: jour(5), vers: false });
  // Film français : ses propres dates, la table n'y change rien ; la VOD 4 mois après la salle en France.
  const plusMois = (n, m) => { const d = new Date(`${n}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + m); return d.toISOString().slice(0, 10); };
  assert.deepEqual(dispoChezSoi([pays("FR", [3, jour(-20)])], "fr", vod), { date: plusMois(jour(-20), 4), vers: true });
  // Date annoncée par le studio (dvdsreleasedates.com) : sûre, à la place de l'estimation.
  assert.deepEqual(dispoChezSoi(salle, "en", { film: { jours: 60, annonce: jour(41) }, mediane: 32 }), { date: jour(41), vers: false });
  assert.deepEqual(dispoChezSoi(salle, "en", { film: { jours: 60, annonce: "bientôt" }, mediane: 32 }), { date: jour(50), vers: true });
  // Table abîmée : ignorée.
  assert.equal(tableVod({ mediane: 32 }), null);
  assert.equal(tableVod({ films: {}, mediane: -3 }).mediane, null);
  assert.equal(estimationDe(tableVod(TABLE), "constructor").film, null);
  assert.deepEqual(dispoChezSoi(salle, "en", { film: { jours: "60" }, mediane: 999 }), { date: jour(35), vers: true });
});

test("addon_et_affiche_d_accord", () => {
  const t = tableVod(TABLE);
  const cas = [
    [[pays("US", [3, jour(-10)])], "en", "tt901"],
    [[pays("US", [3, jour(-10)])], "en", "tt902"],
    [[pays("US", [3, jour(-10)])], "en", "tt999"],
    [[pays("US", [1, jour(-200)], [3, jour(-10)], [4, jour(20)])], "en", "tt901"],
    [[pays("FR", [3, jour(-20)]), pays("US", [3, jour(5)])], "fr", "tt901"],
    [[pays("KR", [3, jour(-30)])], "ko", "tt901"],
    [[], "en", "tt901"],
  ];
  for (const [releases, langue, imdb] of cas) {
    for (const table of [t, null]) {
      const vod = estimationDe(table, imdb);
      assert.deepEqual(dispoChezSoi(releases, langue, vod), dispoAffiche(releases, langue, vod), `${imdb} ${JSON.stringify(releases)}`);
    }
  }
});

// La fiche dit seulement « Dispo vers le … », sans nommer le distributeur ; la table n'est lue qu'une fois.
test("fiche_estimee_d_apres_le_distributeur", async () => {
  internet({ 8201: filmVod(1, [pays("US", [3, jour(-10)])]), 8202: filmVod(99, [pays("US", [3, jour(-10)])]),
    8203: filmVod(2, [pays("US", [3, jour(-10)], [4, jour(12)])]) });
  const fiche = async (id) => (await (await get(`/meta/movie/tmdb:${id}.json`)).json()).meta;
  const disney = await fiche(8201);
  assert.equal(disney.description.split("\n")[0], point(`📅 Dispo vers le ${court(jour(50))}`));
  assert.doesNotMatch(disney.description, /Disney|d'après|≈/);
  assert.equal(disney.released, `${jour(50)}T00:00:00.000Z`);
  // Sans distributeur connu : la médiane générale (32 jours).
  assert.equal((await fiche(8202)).description.split("\n")[0], point(`📅 Dispo vers le ${court(jour(22))}`));
  // Date numérique annoncée : inchangé.
  assert.equal((await fiche(8203)).description.split("\n")[0], point(`📅 Dispo le ${court(jour(12))}`));
  assert.equal(calls.filter((u) => u === VOD_URL).length, 1, "table lue une fois, gardée ensuite");
});

// « Bientôt dispo » : 1 (Disney, salle il y a 50 jours) arrive dans 10 jours, alors que la salle + 45 jours le disait
// déjà là ; 2 (Universal, salle il y a 10 jours) dans 8 jours ; 3 (sans distributeur, salle il y a 40 jours) : la
// médiane (32 jours) le dit déjà là, il n'y est pas. Les salles cherchées vont de la plus longue fenêtre à la plus courte.
test("bientot_dispo_avec_la_fenetre_du_distributeur", async () => {
  internet({
    1: filmVod(1, [pays("US", [3, jour(-50)])]),
    2: filmVod(2, [pays("US", [3, jour(-10)])]),
    3: filmVod(3, [pays("US", [3, jour(-40)])]),
  }, { discover: [1, 2, 3].map((id) => ({ id, title: `Film ${id}`, original_language: "en", release_date: jour(-50), popularity: 10 - id })) });
  const metas = (await (await get("/catalog/movie/accueil-vod-bientot.json")).json()).metas;
  assert.deepEqual(metas.map((m) => m.name), ["Film 2", "Film 1"]);
  assert.match(metas[0].description, new RegExp(`Dispo vers le ${court(jour(8))}`));
  assert.match(metas[1].description, new RegExp(`Dispo vers le ${court(jour(10))}`));
  const salles = calls.find((u) => u.includes("/discover/movie") && u.includes("with_release_type=3%7C2"));
  assert.ok(salles, calls.join("\n"));
  const q = new URL(salles).searchParams;
  // Comptées depuis la date de Paris (parisToday) : entre minuit et 2 h, elle a un jour d'avance sur jour(0), en UTC.
  const paris = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  const jourParis = (n) => new Date(Date.parse(paris) + n * 86400000).toISOString().slice(0, 10);
  assert.equal(q.get("release_date.gte"), jourParis(1 - 60));
  assert.equal(q.get("release_date.lte"), jourParis(45 - 18));
  assert.equal(calls.filter((u) => u === VOD_URL).length, 1, "un seul appel pour la page");
});

// Fichier illisible : les dates d'avant (salle + 45 jours), et la page s'affiche quand même.
test("sans_table_la_salle_plus_45_jours", async () => {
  internet({ 8201: filmVod(1, [pays("US", [3, jour(-10)])]) }, { table: { erreur: "introuvable" } });
  const m = (await (await get("/meta/movie/tmdb:8201.json")).json()).meta;
  assert.equal(m.description.split("\n")[0], point(`📅 Dispo vers le ${court(jour(35))}`));
});
