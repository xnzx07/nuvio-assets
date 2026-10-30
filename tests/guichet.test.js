// Le guichet de la salle 2 (worker/guichet.js) : les programmations toutes prêtes et celle des 3 questions sont de
// vrais réglages, que le serveur relit à l'identique depuis l'adresse fabriquée par la page.
import { test } from "node:test";
import assert from "node:assert/strict";
import DEFS from "../catalogs.json" with { type: "json" };
import { configurePage } from "../worker/page.js";
import { creerProgrammations, GUICHET_JS } from "../worker/guichet.js";
import { contenuStatique } from "../worker/statique.js";
import { enLigne } from "./support/en-ligne.mjs";
import { defaults, decodeConfig, PROVIDERS, REGIONS, GENRES, LANGUAGES, SORTS, SEASON_KEYS, MAX_CUSTOM, COLLECTIONS } from "../worker/config.js";

// Les rangées de l'accueil comme les voit index.js (allRows) : la saison en tête, puis celles de catalogs.json.
const rows = [{ id: "accueil-saison", type: "movie", name: "Spécial Halloween", home: true },
  ...DEFS.catalogs.filter((d) => d.home || d.optional || d.defaultHome)];
const page = (cfg = decodeConfig("", rows, DEFS.discover), extra = {}) => enLigne(configurePage({ origin: "https://x", cfg, rows, discover: DEFS.discover,
  providers: PROVIDERS, collections: COLLECTIONS.map((c) => ({ ...c, pos: 0, folders: [] })), defaults: defaults(rows, DEFS.discover),
  regions: REGIONS, genres: GENRES, languages: LANGUAGES, sorts: SORTS, seasons: SEASON_KEYS, maxCustom: MAX_CUSTOM, season: null, ...extra }), /^(salle2|outils)/);
const html = page();
const D = JSON.parse(/const D = (.*);\n/.exec(html)[1]);
const src = /function rowRef[\s\S]*?\nfunction enc\(obj\) \{[\s\S]*?\n\}\n/.exec(html)[0];
const { compact, enc } = new Function("D", "const same = (a, b) => JSON.stringify(a) === JSON.stringify(b); const baseIds = D.rows.map(r => r.id);\n"
  + src + "\nreturn { compact, enc };")(D);
const relu = (st) => { const c = compact(st); const { custom, ...cfg } = decodeConfig(Object.keys(c).length ? enc(c) : "", rows, DEFS.discover); return cfg; };
const PROG = creerProgrammations();

function verifie(st, nom) {
  // Rien de perdu ni de corrigé par le serveur : chaque rangée existe, chaque rangée sur mesure est déjà propre.
  assert.deepEqual(relu(st), st, nom);
  assert.ok(st.r.length >= 5, nom + " : au moins 5 rangées");
  assert.ok(st.x.length <= MAX_CUSTOM, nom);
  assert.ok(st.x.every((x) => x.n && (x.g.length || x.w.length || x.l || x.s || x.v || x.y[0])), nom + " : chaque rangée sur mesure a un nom et un filtre");
  assert.equal(new Set(st.x.map((x) => x.n)).size, st.x.length, nom + " : pas deux rangées du même nom");
  assert.ok(st.x.every((_, i) => st.r.includes("perso-" + i)), nom + " : toutes les rangées sur mesure à l'affiche");
  assert.equal(st.k, "", nom);
}

test("programmations_toutes_pretes_valides", () => {
  assert.deepEqual(Object.keys(PROG.PRETES), ["cinephile", "famille", "binge", "anime"]);
  for (const nom of Object.keys(PROG.PRETES)) verifie(PROG.prete(D, nom), nom);
  assert.equal(PROG.prete(D, "inconnue"), null);
  const famille = PROG.prete(D, "famille");
  assert.ok(famille.f && famille.e.includes("Horreur"));
  assert.ok(PROG.prete(D, "binge").d.every((id) => DEFS.discover.find((d) => d.id === id).type === "series"));
  assert.ok(PROG.prete(D, "anime").p.includes("283"));
  assert.ok(PROG.prete(D, "anime").p.includes("415"));
});

test("programmation_en_3_questions", () => {
  const ids = PROVIDERS.map((p) => p.id);
  for (const quoi of ["films", "series", "deux"]) for (const famille of [false, true]) for (const plateformes of [[], ["8"], ["8", "337", "283"], ["8", "415"], ids]) {
    const st = PROG.depuisReponses(D, { quoi, famille, plateformes });
    const nom = JSON.stringify({ quoi, famille, plateformes });
    verifie(st, nom);
    assert.equal(st.f, famille, nom);
    // Aucun abonnement coché : toutes les plateformes, comme d'origine ; sinon exactement celles-là.
    assert.deepEqual(st.p, plateformes.length ? ids.filter((id) => plateformes.includes(id)) : D.defaults.p, nom);
    assert.ok(st.x.filter((x) => x.n.startsWith("Le meilleur de")).length <= 3, nom);
    if (quoi === "films") assert.ok(!st.r.includes("accueil-tendances-series") && st.r.includes("accueil-top10"), nom);
    if (quoi === "series") assert.ok(!st.r.includes("accueil-top10") && st.r.includes("accueil-tendances-series"), nom);
    if (plateformes.includes("283") || plateformes.includes("415")) assert.ok(st.r.includes("accueil-anime"), nom);
  }
});

test("guichet_dans_la_page", () => {
  assert.match(html, /id="depart-questions"/);
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="guichet-titre"/);
  assert.equal((html.match(/data-prete="/g) || []).length, 4);
  const js = contenuStatique("salle2-guichet.js");
  assert.equal(js, GUICHET_JS);
  assert.doesNotThrow(() => new Function(js));
  // La programmation choisie garde le nom, le pays, la clé Gemini et le jeton d'alerte ; « Annuler » la défait.
  assert.match(js, /Object\.assign\(state, nouveau, \{ n: state\.n, g: state\.g, k: state\.k, al: state\.al \}\)/);
  assert.match(js, /proposeAnnuler\(/);
  // Proposé de lui-même seulement à la première visite : jamais sur un lien fixe, une page avec réglages ou dans le guide.
  assert.match(js, /!D\.fixed && !hashDepart && !document\.documentElement\.classList\.contains\("dans-guide"\)/);
  assert.match(js, /try \{\s*premiere = !localStorage\.getItem\(VU\)/);
});
