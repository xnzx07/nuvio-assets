import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STYLES } from "../lib/styles.js";
import { creerCloudflare, publierEtEnregistrer, PREFIXE, LISTE, reglesRedirection } from "../lib/statiques.js";
import { creerServeur } from "../serveur.js";

// Une publication vers une fausse API de Cloudflare : la liste des fichiers envoyée et la configuration du Worker.
async function publication(parServeur) {
  const vu = {};
  const fetchImpl = async (u, init = {}) => {
    const s = String(u);
    if (s.endsWith("/assets-upload-session")) { vu.manifest = JSON.parse(init.body).manifest; return Response.json({ success: true, result: { jwt: "j", buckets: [] } }); }
    if (s.endsWith("/workers/scripts/affiches") && init.method === "PUT") { vu.metadata = JSON.parse(await init.body.get("metadata").text()); return Response.json({ success: true, result: {} }); }
    return Response.json({ success: true, result: {} });
  };
  const cf = creerCloudflare({ jeton: "j", compte: "c", base: "b", fetchImpl, parServeur });
  await cf.publier([{ chemin: "/maison/movie/poster/tt1.jpg", hash: "a".repeat(32), taille: 3 }, { chemin: LISTE, hash: "b".repeat(32), taille: 2 }], new Map());
  return vu;
}

// Servies par le serveur : les fichiers sous /f (Cloudflare suit une redirection même quand le fichier existe), et une
// règle par style et pour les réglages perso, qui renvoie au serveur sans lancer le Worker.
test("publication_affiches_par_le_serveur", async () => {
  const vu = await publication("https://srv.test");
  assert.deepEqual(Object.keys(vu.manifest).sort(), [LISTE, `${PREFIXE}/maison/movie/poster/tt1.jpg`].sort());
  const regles = vu.metadata.assets.config._redirects.trim().split("\n");
  assert.equal(regles.length, Object.keys(STYLES).length + 1);
  assert.ok(regles.includes("/maison/* https://srv.test/maison/:splat 302"));
  assert.ok(regles.includes("/perso/* https://srv.test/perso/:splat 302"));
  // Rien sous /f ni la liste : pas de boucle.
  for (const r of regles) assert.doesNotMatch(r.split(" ")[0], /^\/(f|_liste)/);
  assert.match(vu.metadata.assets.config._headers, /Access-Control-Allow-Origin/);
});

// Coupé (serveur absent, machine GitHub) : comme avant, les fichiers à leur adresse, sans redirection.
test("publication_affiches_sans_le_serveur", async () => {
  const vu = await publication(null);
  assert.deepEqual(Object.keys(vu.manifest).sort(), [LISTE, "/maison/movie/poster/tt1.jpg"].sort());
  assert.equal(vu.metadata.assets.config._redirects, undefined);
  assert.equal(reglesRedirection("https://s.test").includes("?"), false);
});

// Forcée : republiée même sans rien de nouveau (changement de mode).
test("publication_forcee_sans_changement", async () => {
  let publiees = 0;
  const cf = { verrouiller: async () => true, liberer: async () => {}, publier: async () => { publiees++; return 0; }, sql: async () => [] };
  const parChemin = new Map([["/maison/movie/poster/tt1.jpg", { chemin: "/maison/movie/poster/tt1.jpg", hash: "a", taille: 1, cree: "2026-11-01" }]]);
  assert.equal((await publierEtEnregistrer(cf, parChemin, new Map())).publie, false);
  assert.equal((await publierEtEnregistrer(cf, parChemin, new Map(), { forcer: true })).publie, true);
  assert.equal(publiees, 1);
});

// Le Worker : un fichier sous /f absent (publication en cours) se traite comme l'adresse sans /f.
test("worker_affiche_sous_f", async () => {
  const code = readFileSync(new URL("../statique/worker.js", import.meta.url), "utf8").replace("__STYLES__", JSON.stringify(Object.keys(STYLES)));
  const w = (await import("data:text/javascript," + encodeURIComponent(code))).default;
  const ecrits = [], attentes = [];
  const env = { DB: { prepare: (sql) => ({ bind: (...v) => ({ run: async () => { ecrits.push(v); } }) }) } };
  await w.fetch(new Request(`https://a.test${PREFIXE}/maison/movie/poster/tt0133093.jpg`), env, { waitUntil: (p) => attentes.push(p) });
  await Promise.all(attentes);
  assert.equal(ecrits[0][0], "/maison/movie/poster/tt0133093.jpg");
});

// Le serveur, à l'adresse d'une affiche : déjà en ligne (ou liste pas encore lue), renvoyée au fichier statique ; en
// attente de publication, servie d'ici ; inconnue, dessinée ici (sans le Worker).
test("serveur_aiguille_les_affiches", async () => {
  const s = creerServeur({ env: { TMDB_API_KEY: "x", PORT: "8798", SERVEUR_URL: "https://srv.test", AFFICHES_PAR_SERVEUR: "on", AFFICHES_STATIQUES: "https://statiques.test" },
    fetchImpl: async () => new Response("{}", { status: 404 }) });
  const req = (url) => ({ url, headers: {} });
  const r = await s.route(req("/maison/movie/poster/tmdb%3A550.jpg"));
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("Location"), `https://statiques.test${PREFIXE}/maison/movie/poster/tmdb%3A550.jpg`);
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), "*");
  s.enAttente.set("/maison/movie/poster/tt2.jpg", { jpg: Buffer.from("jpg"), hash: "h", retard: false });
  const a = await s.route(req("/maison/movie/poster/tt2.jpg"));
  assert.equal(a.status, 200);
  assert.equal(await a.text(), "jpg");
  s.enLigne.connu = new Map();
  // Titre inconnu chez TMDB (ici, tout répond 404) : dessiné ici, donc 404, pas une redirection.
  assert.equal((await s.route(req("/maison/movie/poster/tt3.jpg"))).status, 404);
  assert.equal((await s.route(req("/inconnu/movie/poster/tt3.jpg"))).status, 404);
});

// Un fichier que Cloudflare n'a pas et qu'on ne sait plus relire : écarté, la publication passe quand même (le 11 novembre
// 2026, il les bloquait toutes pendant 20 heures).
test("publication_ecarte_un_fichier_sans_contenu", async () => {
  const sessions = [];
  const fetchImpl = async (u, init = {}) => {
    const s = String(u);
    if (s.endsWith("/assets-upload-session")) {
      const m = JSON.parse(init.body).manifest;
      sessions.push(Object.keys(m));
      return Response.json({ success: true, result: { jwt: "j", buckets: sessions.length === 1 ? [["a".repeat(32)]] : [] } });
    }
    if (s.endsWith("/workers/subdomain")) return Response.json({ success: true, result: { subdomain: "x" } });
    if (s.includes(".workers.dev/")) return new Response("", { status: s.includes("/f/") ? 503 : 302 });
    return Response.json({ success: true, result: {} });
  };
  const cf = creerCloudflare({ jeton: "j", compte: "c", base: "b", fetchImpl, parServeur: "https://srv.test" });
  const ecartes = [];
  await cf.publier([{ chemin: "/perso/Q0Hv/movie/poster/tt1.jpg", hash: "a".repeat(32), taille: 3 }, { chemin: "/maison/movie/poster/tt2.jpg", hash: "c".repeat(32), taille: 3 }], new Map(), [], ecartes);
  assert.deepEqual(ecartes, ["/perso/Q0Hv/movie/poster/tt1.jpg"]);
  assert.deepEqual(sessions[1], [`${PREFIXE}/maison/movie/poster/tt2.jpg`]);
});
