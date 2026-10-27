import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STYLES, parametresDuStyle } from "../lib/styles.js";
import { lireReglages, lireReglagesPaysage, ecrireReglages } from "../lib/lien-affiches.js";
import { cheminValable } from "../lib/statiques.js";

test("styles_le_style_signature_est_garde_tel_quel", () => {
  assert.equal(STYLES.signature.s, "coD1faild1Wc0a10b02do3b13c13e11he1ia3f23h13i13j1");
  assert.equal(STYLES.signature.sp, "coD1xqfaild1Wc0a10b02do3b13c13e11ia3f23h13i13j1");
  const p = parametresDuStyle("signature");
  assert.equal(p.get("s"), "1." + STYLES.signature.s);
  assert.equal(p.get("sp"), "1." + STYLES.signature.sp);
  // Le paysage a bien ses propres réglages (texte plus grand, sans fondu).
  assert.notDeepEqual(lireReglagesPaysage(p), lireReglages(p));
});

test("styles_codes_canoniques", () => {
  // Chaque style s'écrit comme la régie l'écrirait : sinon le service renverrait (308) vers une autre adresse.
  for (const [nom, st] of Object.entries(STYLES)) {
    const p = parametresDuStyle(nom);
    assert.equal(ecrireReglages(lireReglages(p)), st.s, nom);
    if (st.sp) assert.equal(ecrireReglages(lireReglagesPaysage(p)), st.sp, nom);
  }
  assert.equal(parametresDuStyle("maison").toString(), "");
  assert.equal(parametresDuStyle("inconnu"), null);
  // Noms de dossier : des minuscules seulement (l'adresse du Worker les reconnaît ainsi).
  for (const nom of Object.keys(STYLES)) assert.match(nom, /^[a-z]+$/);
});

// Le Worker des affiches absentes, avec la liste des styles comme à sa mise en ligne.
async function worker() {
  const code = readFileSync(new URL("../statique/worker.js", import.meta.url), "utf8").replace("__STYLES__", JSON.stringify(Object.keys(STYLES)));
  return (await import("data:text/javascript," + encodeURIComponent(code))).default;
}
function base() {
  const ecrits = [];
  const DB = { prepare: (sql) => ({ bind: (...v) => ({ run: async () => { ecrits.push({ sql, v }); } }) }) };
  return { ecrits, env: { DB } };
}

test("statique_affiche_absente_mise_en_file", async () => {
  const w = await worker(), { ecrits, env } = base(), attentes = [];
  const ctx = { waitUntil: (p) => attentes.push(p) };
  const r = await w.fetch(new Request("https://a.test/signature/movie/poster/tmdb%3A550.jpg"), env, ctx);
  await Promise.all(attentes);
  assert.equal(r.status, 503);
  assert.equal(r.headers.get("Cache-Control"), "no-store");
  assert.equal(ecrits.length, 1);
  // Le chemin décodé : celui des fichiers publiés.
  assert.equal(ecrits[0].v[0], "/signature/movie/poster/tmdb:550.jpg");
  await w.fetch(new Request("https://a.test/maison/series/landscape/tt0903747.jpg"), env, ctx);
  await Promise.all(attentes);
  assert.equal(ecrits[1].v[0], "/maison/series/landscape/tt0903747.jpg");
});

// Réglages perso : /perso/<code>[-<code du paysage>]/, codes canoniques seulement (un même dessin, une seule adresse).
test("statique_adresses_perso", () => {
  assert.deepEqual(cheminValable("/perso/T0/movie/poster/tt1.jpg"), { s: "T0", sp: null, type: "movie", shape: "poster", id: "tt1" });
  assert.deepEqual(cheminValable("/perso/T0-S0T0G0A0/series/landscape/tmdb:2.jpg"), { s: "T0", sp: "S0T0G0A0", type: "series", shape: "landscape", id: "tmdb:2" });
  assert.deepEqual(cheminValable("/perso/0-T0/movie/landscape/tt1.jpg"), { s: "", sp: "T0", type: "movie", shape: "landscape", id: "tt1" });
  assert.equal(cheminValable("/maison/movie/poster/tt1.jpg").style, "maison");
  for (const c of ["/perso/Q0T0/movie/poster/tt1.jpg", "/perso/T0x/movie/poster/tt1.jpg", "/perso/T0-T0/movie/poster/tt1.jpg", "/perso//movie/poster/tt1.jpg", "/perso/T0-/movie/poster/tt1.jpg", "/perso/T0-S0-T0/movie/poster/tt1.jpg"]) {
    assert.equal(cheminValable(c), null, c);
  }
});

test("statique_affiche_perso_absente_mise_en_file", async () => {
  const w = await worker(), { ecrits, env } = base(), attentes = [];
  const ctx = { waitUntil: (p) => attentes.push(p) };
  assert.equal((await w.fetch(new Request("https://a.test/perso/T0-S0T0G0A0/movie/poster/tt1.jpg"), env, ctx)).status, 503);
  await Promise.all(attentes);
  assert.equal(ecrits[0].v[0], "/perso/T0-S0T0G0A0/movie/poster/tt1.jpg");
});

test("statique_adresses_refusees", async () => {
  const w = await worker(), { ecrits, env } = base(), ctx = { waitUntil: () => {} };
  for (const p of ["/inconnu/movie/poster/tt1.jpg", "/maison/movie/poster/kitsu:1.jpg", "/maison/film/poster/tt1.jpg", "/maison/movie/poster/tt1.png", "/", "/maison/movie/poster/%E0%A4%A.jpg", "/perso//movie/poster/tt1.jpg", "/perso/T0_/movie/poster/tt1.jpg"]) {
    assert.equal((await w.fetch(new Request("https://a.test" + p), env, ctx)).status, 404, p);
  }
  assert.equal(ecrits.length, 0);
});

// L'ancienne adresse (Vercel, ?s=…) renvoie vers le même style en fichiers statiques, sans lancer de fonction : un
// style tout prêt vers son dossier, un réglage perso vers /perso/<code>[-<code du paysage>]/, rien vers « maison ».
test("vercel_renvoie_chaque_style_vers_les_fichiers", () => {
  const v = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.ok(!v.rewrites.some((r) => r.destination.startsWith("/api/affiche")), "plus de dessin chez Vercel");
  const r = v.redirects;
  for (const nom of Object.keys(STYLES)) {
    const s = parametresDuStyle(nom).get("s");
    if (!s) continue;
    const reg = r.find((x) => x.has && x.has[0].value === s);
    assert.ok(reg, nom);
    assert.equal(reg.destination, `https://affiches.xnzxflix.workers.dev/${nom}/:type/:shape/:id.jpg`);
    assert.equal(reg.permanent, false);
  }
  const perso = r.filter((x) => x.destination.includes("/perso/")).map((x) => x.destination.replace("https://affiches.xnzxflix.workers.dev", ""));
  assert.deepEqual(perso, ["/perso/:s-:sp/:type/:shape/:id.jpg", "/perso/0-:sp/:type/:shape/:id.jpg", "/perso/:s/:type/:shape/:id.jpg"]);
  const dernier = r[r.length - 1];
  assert.ok(!dernier.has);
  assert.match(dernier.destination, /\/maison\/:type\/:shape\/:id\.jpg$/);
});

// Serveur des affiches présent : une affiche absente est dessinée par lui et renvoyée aussitôt (pas de file) ; serveur
// en panne : la file et 503, comme sans serveur.
test("statique_affiche_absente_dessinee_par_le_serveur", async () => {
  const w = await worker(), { ecrits, env } = base(), attentes = [];
  const ctx = { waitUntil: (p) => attentes.push(p) };
  const avant = globalThis.fetch;
  const appels = [];
  try {
    globalThis.fetch = async (url, init) => {
      appels.push([String(url), new Headers(init.headers).get("X-Relais-Cle")]);
      return new Response(new Uint8Array([255, 216, 255]), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=600" } });
    };
    const e = { ...env, SERVEUR: "https://serveur.test", RELAIS_KEY: "k" };
    const r = await w.fetch(new Request("https://a.test/signature/movie/poster/tmdb%3A550.jpg"), e, ctx);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("Content-Type"), "image/jpeg");
    assert.deepEqual(appels, [["https://serveur.test/statique/signature/movie/poster/tmdb:550.jpg", "k"]]);
    await Promise.all(attentes);
    assert.equal(ecrits.length, 0);
    globalThis.fetch = async () => { throw new Error("injoignable"); };
    assert.equal((await w.fetch(new Request("https://a.test/maison/movie/poster/tt1.jpg"), e, ctx)).status, 503);
    await Promise.all(attentes);
    assert.equal(ecrits.length, 1);
  } finally {
    globalThis.fetch = avant;
  }
});

test("serveur_exige_la_cle_pour_les_affiches_statiques", async () => {
  const { creerServeur } = await import("../serveur.js");
  const s = creerServeur({ env: { RELAIS_KEY: "k", TMDB_API_KEY: "x", PORT: "8799" }, fetchImpl: async () => new Response("{}", { status: 404 }) });
  const req = (url, cle) => ({ url, headers: cle ? { "x-relais-cle": cle } : {} });
  assert.equal((await s.route(req("/statique/signature/movie/poster/tt1.jpg"))).status, 403);
  assert.equal((await s.route(req("/statique/signature/movie/poster/tt1.jpg", "mauvaise"))).status, 403);
  // Bonne clé, titre inconnu de TMDB : 404 (pas d'affiche à garder).
  assert.equal((await s.route(req("/statique/signature/movie/poster/tt1.jpg", "k"))).status, 404);
  assert.equal((await s.route(req("/inconnu"))).status, 404);
  const etat = await (await s.route(req("/etat"))).json();
  assert.equal(etat.enAttente, 0);
});

// Publication sous verrou : verrou pris ailleurs → rien ; sinon tout ce qui est en ligne part, la file est vidée de ce
// qui est publié.
test("publication_sous_verrou", async () => {
  const { publierEtEnregistrer } = await import("../lib/statiques.js");
  const journal = [];
  const cf = (libre) => ({
    verrouiller: async () => libre, liberer: async () => journal.push("libéré"),
    publier: async (fichiers) => { journal.push(`publié ${fichiers.length}`); return 1; },
    sql: async (s) => { journal.push(s.split(" ").slice(0, 2).join(" ")); return []; },
  });
  const parChemin = () => new Map([["/maison/movie/poster/tt1.jpg", { chemin: "/maison/movie/poster/tt1.jpg", hash: "a".repeat(32), taille: 3, cree: "2026-10-25", change: true }],
    ["/maison/movie/poster/tt2.jpg", { chemin: "/maison/movie/poster/tt2.jpg", hash: "b".repeat(32), taille: 3, cree: "2026-10-24" }]]);
  assert.deepEqual(await publierEtEnregistrer(cf(false), parChemin(), new Map(), { faits: ["/maison/movie/poster/tt1.jpg"] }), { publie: false, envoyes: 0, retirees: 0 });
  assert.deepEqual(journal, []);
  const p = await publierEtEnregistrer(cf(true), parChemin(), new Map(), { faits: ["/maison/movie/poster/tt1.jpg"] });
  assert.equal(p.publie, true);
  assert.deepEqual(journal, ["publié 2", "INSERT INTO", "libéré", "DELETE FROM"]);
});

// Redemandée à chaque passage sur la carte : une seule écriture par instance en 10 minutes, et jamais de lecture de
// toute la file (5 millions de lignes lues par jour pour tout le compte, dépassées le 26 octobre 2026).
test("statique_meme_affiche_absente_une_seule_ecriture", async () => {
  const w = await worker(), { ecrits, env } = base(), attentes = [], ctx = { waitUntil: (p) => attentes.push(p) };
  for (let i = 0; i < 3; i++) assert.equal((await w.fetch(new Request("https://a.test/note/series/poster/tt7654321.jpg"), env, ctx)).status, 503);
  await Promise.all(attentes);
  assert.equal(ecrits.filter((e) => e.v[0] === "/note/series/poster/tt7654321.jpg").length, 1);
  assert.ok(ecrits.every((e) => !/COUNT/i.test(e.sql)));
});

// Le serveur des affiches (Oracle, Paris) : Torrentio le refuse, la VF et la qualité passent par le relais /qualite de
// Vercel aux États-Unis (QUALITE_RELAIS), avec la clé, et jamais avec StreamFusion (pas de &sf=1).
test("serveur_lit_la_qualite_chez_le_relais_americain", async () => {
  const { creerServeur } = await import("../serveur.js");
  const appels = [];
  const fetchImpl = async (url, init) => {
    appels.push([String(url), new Headers((init && init.headers) || {}).get("X-Relais-Cle")]);
    return Response.json({ uhd: false, extra: null, vf: true, sources: 3, langue: "multi" });
  };
  const s = creerServeur({ env: { RELAIS_KEY: "k", TMDB_API_KEY: "x", PORT: "8798", QUALITE_RELAIS: "https://relais.test" }, fetchImpl });
  const r = await s.route({ url: "/vf.json?v=movie/tt7777777", headers: { "x-relais-cle": "k" } });
  assert.deepEqual(await r.json(), { "movie/tt7777777": { vf: true, sources: 3, langue: "multi" } });
  assert.deepEqual(appels, [["https://relais.test/qualite/movie/tt7777777.json?v=3", "k"]]);
});

// La file se lit par l'index sur apres, sans OR (qui relisait toute la table à chaque passage, 26 octobre 2026) ; une
// adresse qui ne se dessinera jamais en sort aussitôt.
test("file_lue_par_index", async () => {
  const { lireEtat } = await import("../lib/statiques.js");
  const lus = [];
  const cf = { sql: async (s) => {
    lus.push(s);
    if (/apres IS NULL/.test(s)) return [{ chemin: "/maison/movie/poster/tt1.jpg", essais: 0 }, { chemin: "/perso/zz/movie/poster/tt2.jpg", essais: 0 }];
    if (/apres <= \?/.test(s)) return [{ chemin: "/note/series/poster/tt3.jpg", essais: 2 }];
    return [];
  } };
  const { aFaire } = await lireEtat(cf, { connu: new Map() });
  assert.deepEqual([...aFaire], [["/maison/movie/poster/tt1.jpg", 0], ["/note/series/poster/tt3.jpg", 2]]);
  assert.ok(lus.every((s) => !/ OR /.test(s)));
  assert.ok(lus.some((s) => s.startsWith("DELETE FROM demandes WHERE chemin IN ('/perso/zz/movie/poster/tt2.jpg')")));
});

// Titre inconnu : redemandé le lendemain, et au troisième essai il sort de la file.
test("inconnue_sort_de_la_file", async () => {
  const { dessinerTout } = await import("../lib/statiques.js");
  const r = await dessinerTout([["/maison/movie/poster/tt1.jpg", 0], ["/maison/movie/poster/tt2.jpg", 2]], async () => ({ statut: 404 }), new Map());
  assert.deepEqual(r.reessais, [["/maison/movie/poster/tt1.jpg", 1, 24 * 60]]);
  assert.deepEqual(r.faits, ["/maison/movie/poster/tt2.jpg"]);
});

// Les aperçus des pages du site (/affiche/…) : servis par le serveur sans clé, comme le relais de l'addon (qui comptait
// une requête de plus par aperçu chez Cloudflare) ; titre inconnu : 404 lisible par la page (CORS), gardé une heure.
test("serveur_apercus_du_site", async () => {
  const { creerServeur } = await import("../serveur.js");
  const s = creerServeur({ env: { TMDB_API_KEY: "x", PORT: "8797" }, fetchImpl: async () => new Response("{}", { status: 404 }) });
  const r = await s.route({ url: "/affiche/movie/poster/tmdb%3A550?imdb=tt0137523&s=1.Q0N0G0A03c1&v=3&essai=1", headers: {} });
  assert.equal(r.status, 404);
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal(r.headers.get("Cache-Control"), "public, max-age=3600");
  assert.equal((await s.route({ url: "/affiche/movie/poster/kitsu:1", headers: {} })).status, 404);
});

// La nuit (tout redessiner après la photo des tendances) passait par le disjoncteur de l'adresse publique (300 dessins
// par minute) : le 27 octobre 2026, il a sauté après ~1 400 affiches, les autres ont gardé les N° de la veille (Bleach
// N°15, N°2 du jour). Les passages du serveur ont leur propre service, sans ce plafond.
test("passages_du_serveur_sans_disjoncteur", async () => {
  const { envDesPassages } = await import("../serveur.js");
  const { disjoncteurDe } = await import("../lib/disjoncteur.js");
  const public_ = disjoncteurDe({ RENDUS_MINUTE: "300", RENDUS_HEURE: "6000" });
  const passages = disjoncteurDe(envDesPassages({ RENDUS_MINUTE: "300", RENDUS_HEURE: "6000", TMDB_API_KEY: "x" }));
  for (let i = 0; i < 9000; i++) { public_.compte(); passages.compte(); }
  assert.ok(public_.plein());
  assert.ok(!passages.plein());
  assert.equal(envDesPassages({ TMDB_API_KEY: "x" }).TMDB_API_KEY, "x");
});

// Relancer « tout » à la main (une nuit ratée) : avec la clé seulement, sans attendre la fin.
test("serveur_relance_tout_avec_la_cle", async () => {
  const { creerServeur } = await import("../serveur.js");
  const s = creerServeur({ env: { RELAIS_KEY: "k", TMDB_API_KEY: "x", PORT: "8796" }, fetchImpl: async () => new Response("{}", { status: 404 }) });
  const req = (cle) => ({ url: "/passage?tout=1", headers: cle ? { "x-relais-cle": cle } : {} });
  assert.equal((await s.route(req())).status, 403);
  assert.equal((await s.route(req("mauvaise"))).status, 403);
  assert.equal((await s.route(req("k"))).status, 202);
});

// Titre récent sans VF d'après l'avis du jour (« revoir ») : publié tel quel, et redessiné 6 heures plus tard (The
// Dog Stars : sans VF à 4 h, en VF dans la journée, resté gris jusqu'au lendemain). Chaque passage : sans compter
// d'essai, il reste à revoir tant que la VF n'est pas là.
test("a_revoir_redessinee_six_heures_plus_tard", async () => {
  const { dessinerTout, dessinerStatique } = await import("../lib/statiques.js");
  const r = await dessinerTout([["/maison/movie/poster/tt1.jpg", 0], ["/maison/movie/poster/tt2.jpg", null]], async () => ({ jpg: Buffer.from("x"), revoir: true }), new Map());
  assert.deepEqual(r.reessais, [["/maison/movie/poster/tt1.jpg", 0, 360], ["/maison/movie/poster/tt2.jpg", 0, 360]]);
  assert.deepEqual(r.faits, []);
  assert.equal(r.nouveaux.size, 1);
  const affiche = async () => new Response(Buffer.from("jpg"), { headers: { "Content-Type": "image/jpeg", "X-Affiche-Etat": "revoir" } });
  const d = await dessinerStatique(affiche, "https://s.test", "/maison/movie/poster/tt1.jpg");
  assert.equal(d.revoir, true);
  assert.equal(d.retard, false);
});

// Le service du serveur demande l'avis VF du jour à l'addon (Lumio, sinon StreamFusion), jamais StreamFusion lui-même.
test("serveur_avec_l_avis_du_jour", async () => {
  const { envDuService } = await import("../serveur.js");
  const e = envDuService({ TMDB_API_KEY: "x", RELAIS_KEY: "k" });
  assert.equal(e.AVIS_DU_JOUR, "on");
  assert.equal(e.STREAMFUSION, "off");
  assert.equal(e.RESERVE, "off");
});

// Un réessai entre dans la file même s'il n'y était pas (affiche redessinée la nuit, « revoir » ou « retard ») : avant,
// seule une demande déjà en file était repoussée, les autres n'étaient jamais redessinées avant la nuit suivante.
// Par lots de 25 (100 valeurs au plus par requête D1).
test("reessai_mis_en_file_meme_absent", async () => {
  const { publierEtEnregistrer } = await import("../lib/statiques.js");
  const requetes = [];
  const cf = { verrouiller: async () => true, liberer: async () => {}, publier: async () => 1,
    sql: async (s, v = []) => { requetes.push([s, v]); return []; } };
  const reessais = Array.from({ length: 30 }, (_, i) => [`/maison/movie/poster/tt${i}.jpg`, 0, 360]);
  await publierEtEnregistrer(cf, new Map(), new Map(), { reessais });
  const mises = requetes.filter(([s]) => s.startsWith("INSERT INTO demandes"));
  assert.equal(mises.length, 2);
  assert.match(mises[0][0], /ON CONFLICT\(chemin\) DO UPDATE SET essais = excluded\.essais, apres = excluded\.apres/);
  assert.equal(mises[0][1].length, 100);
  assert.equal(mises[1][1].length, 20);
  assert.equal(mises[0][1][0], "/maison/movie/poster/tt0.jpg");
});
