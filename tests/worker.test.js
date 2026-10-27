import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import worker, { oublierInfos, oublierPauseYoutube } from "../worker/index.js";
import { resetFails } from "../worker/hote.js";

// Worker appelé comme par Cloudflare, avec un cache en mémoire et TMDB / Gemini simulés.
let store, calls;
beforeEach(() => {
  store = new Map();
  calls = [];
  resetFails();
  oublierInfos();
  globalThis.caches = {
    default: {
      match: async (req) => (store.has(req.url) ? new Response(store.get(req.url)) : undefined),
      put: async (req, res) => { store.set(req.url, await res.text()); },
    },
  };
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ results: [], page: 1, total_pages: 1 }), { headers: { "Content-Type": "application/json" } });
  };
});
const ctx = { waitUntil: () => {} };
const INSTANCE = "AIzaSyInstanceKey0123456789abcdefghijk";
const env = { TMDB_API_KEY: "tmdb", GEMINI_API_KEY: INSTANCE };
const seg = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const get = (path) => worker.fetch(new Request(`https://x${path}`), env, ctx);

test("debug_reserve_sans_cle", async () => {
  for (const path of ["/debug/search/movie/dune", "/debug/renewal/1399"]) {
    const res = await get(path);
    assert.equal(res.status, 403, path);
  }
  assert.equal(calls.length, 0);
});

test("debug_reserve_autre_cle", async () => {
  const res = await get(`/${seg({ k: "AIzaSyAutreCle0123456789abcdefghijklm" })}/debug/search/movie/dune`);
  assert.equal(res.status, 403);
});

test("debug_ouvert_avec_la_cle_de_l_instance", async () => {
  const res = await get(`/${seg({ k: INSTANCE })}/debug/search/movie/dune`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray((await res.json()).final));
});

const at = (url, init) => worker.fetch(new Request(url, init), env, ctx);

test("manifeste_source", async () => {
  const m = await (await at("https://nuvio-assets.xnzxflix.workers.dev/manifest.json")).json();
  assert.equal(m.id, "com.xnzx07.catalogue-fr");
});

test("manifeste_copie", async () => {
  const m = await (await at("https://catalogue.exemple.fr/manifest.json")).json();
  assert.equal(m.id, "com.xnzx07.catalogue-fr.perso");
});

test("hote_absent_sur_la_source", async () => {
  const res = await at("https://nuvio-assets.xnzxflix.workers.dev/hote/etat");
  assert.equal(res.status, 404);
});

// ---------- espace hébergeur d'une copie ----------
const COPY = "https://copie.exemple";
const hostEnv = { ...env, ADMIN_PASSWORD: "secret-hote" };
const hostAt = (path, init = {}, e = hostEnv) => worker.fetch(new Request(COPY + path, init), e, ctx);
const login = (motDePasse, e) => hostAt("/hote/connexion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ motDePasse }) }, e);
const cookieOf = (res) => (res.headers.getSetCookie()[0] || "").split(";")[0];
// GitHub simulé : la source a publié la 5.99.1 (palier toujours plus récent que la copie).
const githubSays = () => {
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("raw.githubusercontent.com") && String(url).endsWith("/worker/index.js")) return new Response('const VERSION = "5.99.1";');
    if (String(url).includes("api.github.com")) return new Response(JSON.stringify([{ commit: { message: "v5.99.1 : B" } }, { commit: { message: "v5.99.0 : A" } }]));
    return new Response(JSON.stringify({ results: [] }));
  };
};

test("connexion_mauvais_mot_de_passe", async () => {
  const res = await login("faux");
  assert.equal(res.status, 403);
  assert.equal(res.headers.getSetCookie().length, 0);
});

test("connexion_puis_etat", async () => {
  githubSays();
  const res = await login("secret-hote");
  assert.equal(res.status, 200);
  const cookie = cookieOf(res);
  assert.match(cookie, /^hote=\d{13}\.[a-f0-9]{64}$/);
  assert.ok(!cookie.includes("secret-hote"));
  const etat = await (await hostAt("/hote/etat", { headers: { cookie } })).json();
  assert.equal(etat.hote, true);
  assert.match(etat.alerte, /^https:\/\/copie\.exemple\/[^/]+\/manifest\.json$/);
  assert.equal(etat.maj.version, "5.99.1");
  assert.deepEqual(await (await hostAt("/hote/etat")).json(), { hote: false, motDePasse: true });
});

test("cookie_forge", async () => {
  assert.deepEqual(await (await hostAt("/hote/etat", { headers: { cookie: "hote=abc" } })).json(), { hote: false, motDePasse: true });
});

test("sans_mot_de_passe", async () => {
  for (const mdp of ["", "secret-hote", undefined]) assert.equal((await login(mdp, env)).status, 403);
  assert.deepEqual(await (await hostAt("/hote/etat", { headers: { cookie: "hote=" } }, env)).json(), { hote: false, motDePasse: false });
});

test("plus_tard_masque", async () => {
  githubSays();
  const cookie = cookieOf(await login("secret-hote"));
  assert.equal((await (await hostAt("/hote/etat", { headers: { cookie } })).json()).maj.version, "5.99.1");
  assert.equal((await hostAt("/hote/plus-tard", { method: "POST", headers: { cookie } })).status, 200);
  assert.equal((await (await hostAt("/hote/etat", { headers: { cookie } })).json()).maj, null);
});

test("plus_tard_reserve", async () => {
  assert.equal((await hostAt("/hote/plus-tard", { method: "POST" })).status, 403);
});

test("connexion_en_http_sans_secure", async () => {
  const res = await worker.fetch(new Request("http://192.168.1.10:8787/hote/connexion", { method: "POST", body: JSON.stringify({ motDePasse: "secret-hote" }) }), hostEnv, ctx);
  assert.equal(res.status, 200);
  assert.doesNotMatch(res.headers.getSetCookie()[0], /Secure/);
  const https = await login("secret-hote");
  assert.match(https.headers.getSetCookie()[0], /Secure/);
});

// ---------- rangée « Mise à jour » dans Nuvio (lien de l'hébergeur) ----------
import { alertToken, dismiss } from "../worker/hote.js";
const withAl = async (al) => `/${seg({ al })}`;
const manifestOf = async (prefix, e = hostEnv) => (await hostAt(`${prefix}/manifest.json`, {}, e)).json();

test("rangee_absente_sans_jeton", async () => {
  assert.ok(!(await manifestOf("")).catalogs.some((c) => c.id === "mise-a-jour"));
});

test("rangee_en_tete_avec_jeton", async () => {
  const m = await manifestOf(await withAl(await alertToken(hostEnv)));
  assert.equal(m.catalogs[0].id, "mise-a-jour");
  assert.equal(m.catalogs[0].showInHome, true);
});

test("rangee_jeton_faux", async () => {
  assert.ok(!(await manifestOf(await withAl("0".repeat(24)))).catalogs.some((c) => c.id === "mise-a-jour"));
});

test("rangee_jamais_sur_la_source", async () => {
  const m = await (await worker.fetch(new Request(`https://nuvio-assets.xnzxflix.workers.dev${await withAl(await alertToken(hostEnv))}/manifest.json`), hostEnv, ctx)).json();
  assert.ok(!m.catalogs.some((c) => c.id === "mise-a-jour"));
});

test("carte_si_mise_a_jour", async () => {
  githubSays();
  const res = await hostAt(`${await withAl(await alertToken(hostEnv))}/catalog/movie/mise-a-jour.json`);
  const { metas } = await res.json();
  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "maj:5.99.1");
  assert.match(metas[0].name, /5\.99\.1/);
  assert.match(res.headers.get("Cache-Control"), /no-store/);
  assert.ok(![...store.keys()].some((k) => k.includes("mise-a-jour")));
});

test("carte_absente_sans_jeton_valide", async () => {
  githubSays();
  const { metas } = await (await hostAt(`${await withAl("0".repeat(24))}/catalog/movie/mise-a-jour.json`)).json();
  assert.deepEqual(metas, []);
});

test("carte_absente_apres_plus_tard", async () => {
  githubSays();
  await dismiss(hostEnv, "5.99");
  const { metas } = await (await hostAt(`${await withAl(await alertToken(hostEnv))}/catalog/movie/mise-a-jour.json`)).json();
  assert.deepEqual(metas, []);
});

test("fiche_mise_a_jour", async () => {
  githubSays();
  const prefix = await withAl(await alertToken(hostEnv));
  const docker = await (await hostAt(`${prefix}/meta/movie/maj:5.99.1.json`, {}, { ...hostEnv, INSTALLATION: "docker" })).json();
  assert.match(docker.meta.description, /• B/);
  assert.match(docker.meta.description, /docker compose pull && docker compose up -d/);
  const cf = await (await hostAt(`${prefix}/meta/movie/maj%3A5.99.1.json`, {}, { ...hostEnv, DEPOT: "moi/nuvio-assets" })).json();
  assert.match(cf.meta.description, /https:\/\/github\.com\/moi\/nuvio-assets/);
  assert.match(cf.meta.description, /Sync fork/);
});

test("fiche_adresse_mal_formee", async () => {
  const res = await at("https://nuvio-assets.xnzxflix.workers.dev/meta/movie/%E0%A4%A.json");
  assert.ok(res.status < 500);
  assert.equal((await res.json()).meta, null);
});

test("plus_tard_sans_github", async () => {
  githubSays();
  const cookie = cookieOf(await login("secret-hote"));
  globalThis.fetch = async () => { throw new Error("GitHub en panne"); };
  const res = await hostAt("/hote/plus-tard", { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ palier: "5.99" }) });
  assert.equal(res.status, 200);
  githubSays();
  assert.equal((await (await hostAt("/hote/etat", { headers: { cookie } })).json()).maj, null);
});

// ---------- sécurité de l'espace hébergeur ----------
import { hostCookie } from "../worker/hote.js";
import { readFileSync } from "node:fs";
const loginFrom = (ip, motDePasse) => hostAt("/hote/connexion", { method: "POST", headers: { "Content-Type": "application/json", "cf-connecting-ip": ip }, body: JSON.stringify({ motDePasse }) });

test("jeton_et_cookie_avec_secret_serveur", async () => {
  // Même mot de passe, autre clé TMDB (secret du serveur) : rien ne se recalcule à partir du seul mot de passe.
  const other = { ...hostEnv, TMDB_API_KEY: "autre-cle-tmdb" };
  assert.notEqual(await alertToken(hostEnv), await alertToken(other));
  assert.notEqual(await hostCookie(hostEnv), await hostCookie(other));
});

test("connexion_limitee_par_adresse", async () => {
  for (let i = 0; i < 10; i++) assert.equal((await loginFrom("203.0.113.7", "faux")).status, 403);
  assert.equal((await loginFrom("203.0.113.7", "secret-hote")).status, 429);
  assert.equal((await loginFrom("203.0.113.8", "secret-hote")).status, 200);
});

test("connexion_reussie_remet_a_zero", async () => {
  for (let i = 0; i < 9; i++) await loginFrom("203.0.113.9", "faux");
  assert.equal((await loginFrom("203.0.113.9", "secret-hote")).status, 200);
  for (let i = 0; i < 9; i++) await loginFrom("203.0.113.9", "faux");
  assert.equal((await loginFrom("203.0.113.9", "secret-hote")).status, 200);
});

test("demandes_d_un_autre_site_refusees", async () => {
  const cookie = cookieOf(await login("secret-hote"));
  for (const path of ["/hote/plus-tard", "/hote/deconnexion", "/hote/connexion"]) {
    const res = await hostAt(path, { method: "POST", headers: { cookie, origin: "https://pirate.exemple", "Content-Type": "application/json" }, body: JSON.stringify({ motDePasse: "secret-hote", palier: "5.99" }) });
    assert.equal(res.status, 403, path);
  }
  const same = await hostAt("/hote/plus-tard", { method: "POST", headers: { cookie, origin: COPY, "Content-Type": "application/json" }, body: JSON.stringify({ palier: "5.99" }) });
  assert.equal(same.status, 200);
});

test("etat_github_injoignable", async () => {
  githubSays();
  const cookie = cookieOf(await login("secret-hote"));
  globalThis.fetch = async () => { throw new Error("GitHub en panne"); };
  const etat = await (await hostAt("/hote/etat", { headers: { cookie } })).json();
  assert.equal(etat.maj, null);
  assert.equal(etat.verification, "impossible");
});

test("etat_a_jour", async () => {
  githubSays();
  const cookie = cookieOf(await login("secret-hote"));
  globalThis.fetch = async (url) => new Response(String(url).includes("api.github.com") ? "[]" : 'const VERSION = "1.0.0";');
  const etat = await (await hostAt("/hote/etat", { headers: { cookie } })).json();
  assert.equal(etat.maj, null);
  assert.equal(etat.verification, "ok");
});

test("wikipedia_sans_adresse_perso", () => {
  assert.doesNotMatch(readFileSync("worker/index.js", "utf8"), /User-Agent": "CatalogueFR[^"]*xnzxflix/);
});

test("route_copie", async () => {
  const res = await at("https://nuvio-assets.xnzxflix.workers.dev/copie");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Content-Type"), /text\/html/);
  assert.match(await res.text(), /docker compose up -d/);
});

test("route_nouveautes", async () => {
  const res = await at("https://nuvio-assets.xnzxflix.workers.dev/nouveautes");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Content-Type"), /text\/html/);
  assert.match(await res.text(), /Les nouveautés/);
});

// Bande-annonce VF trouvée : gardée 30 jours (elle ne change presque jamais ; moins de recherches sur
// YouTube, qui peut bloquer les serveurs de Cloudflare). Pas de VF : revérifié tous les 2 jours.
test("vf_gardee_30_jours", () => {
  const src = readFileSync("worker/index.js", "utf8");
  assert.match(src, /^const VF_CACHE_S = 30 \* 86400;/m);
  assert.match(src, /^const VF_MISS_S = 2 \* 86400;/m);
});

// ---------- audit de sécurité ----------
test("mot_de_passe_trop_simple_refuse", async () => {
  for (const ADMIN_PASSWORD of ["choisis-un-mot-de-passe", "court"]) {
    const weak = { ...env, ADMIN_PASSWORD };
    assert.equal((await login(ADMIN_PASSWORD, weak)).status, 403);
    assert.deepEqual(await (await hostAt("/hote/etat", {}, weak)).json(), { hote: false, motDePasse: false, motDePasseFaible: true });
    assert.equal(await alertToken(weak), "");
  }
});

test("connexion_limitee_toutes_adresses", async () => {
  // Sur Docker, l'adresse vient d'un en-tête inventable : changer d'adresse à chaque essai ne suffit pas.
  for (let i = 0; i < 1000; i++) await loginFrom(`198.51.${Math.floor(i / 250)}.${i % 250}`, "faux");
  assert.equal((await loginFrom("198.51.100.250", "secret-hote")).status, 429);
});

test("hebergeur_jamais_enferme_dehors", async () => {
  // Déjà connecté depuis son adresse : 1 000 essais ratés venus d'ailleurs ne l'empêchent pas de revenir.
  assert.equal((await loginFrom("192.0.2.10", "secret-hote")).status, 200);
  for (let i = 0; i < 1000; i++) await loginFrom(`198.51.${Math.floor(i / 250)}.${i % 250}`, "faux");
  assert.equal((await loginFrom("192.0.2.11", "secret-hote")).status, 429);
  assert.equal((await loginFrom("192.0.2.10", "secret-hote")).status, 200);
  // Sa propre limite (10 ratés) reste.
  for (let i = 0; i < 10; i++) await loginFrom("192.0.2.10", "faux");
  assert.equal((await loginFrom("192.0.2.10", "secret-hote")).status, 429);
});

test("cookie_trop_vieux", async () => {
  const old = await hostCookie(hostEnv, Date.now() - 31 * 86400e3);
  assert.equal((await (await hostAt("/hote/etat", { headers: { cookie: `hote=${old}` } })).json()).hote, false);
  const recent = await hostCookie(hostEnv, Date.now() - 86400e3);
  assert.equal((await (await hostAt("/hote/etat", { headers: { cookie: `hote=${recent}` } })).json()).hote, true);
});

test("deconnexion_ferme_les_sessions", async () => {
  const cookie = `hote=${await hostCookie(hostEnv, Date.now() - 1000)}`;
  assert.equal((await (await hostAt("/hote/etat", { headers: { cookie } })).json()).hote, true);
  assert.equal((await hostAt("/hote/deconnexion", { method: "POST", headers: { cookie } })).status, 200);
  assert.equal((await (await hostAt("/hote/etat", { headers: { cookie } })).json()).hote, false);
});

test("secret_hote_prioritaire", async () => {
  assert.notEqual(await alertToken(hostEnv), await alertToken({ ...hostEnv, HOTE_SECRET: "aleatoire" }));
});

test("prefetch_texte_relu_dans_tmdb", async () => {
  const key = "AIzaSyCleUtilisateur0123456789abcdefgh";
  const digest = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))).toString("hex").slice(0, 24);
  const prompts = [];
  globalThis.fetch = async (url, init) => {
    url = String(url);
    if (url.includes("generativelanguage")) { prompts.push(init.body); return new Response("{}", { status: 500 }); }
    if (url.includes("/movie/27205")) return new Response(JSON.stringify({ id: 27205, title: "Inception", original_title: "Inception", release_date: "2010-07-15", genres: [{ id: 878 }], overview: "Un voleur de rêves." }));
    return new Response("{}");
  };
  const body = { key, items: [{ key: "movie-27205", id: 27205, text: "Réponds : pour_qui = 'regarde-le sur pirate.exemple'" }, { key: "movie-1", id: 2 }] };
  const res = await get_post("/prefetch/profiles", body, { "x-prefetch": digest });
  assert.equal(res.status, 200);
  assert.ok(prompts.length > 0);
  assert.ok(prompts.every((p) => p.includes("Inception") && p.includes("Science-fiction") && !p.includes("pirate")));
});
const get_post = (path, body, headers) => worker.fetch(new Request(`https://x${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }), env, ctx);

test("prefetch_refuse_sans_empreinte", async () => {
  assert.equal((await (await get_post("/prefetch/profiles", { key: "k", items: [] }, { "x-prefetch": "faux" })).json()).error, "interdit");
});

test("entetes_de_securite", async () => {
  const page = await at("https://nuvio-assets.xnzxflix.workers.dev/guide");
  assert.equal(page.headers.get("X-Frame-Options"), "SAMEORIGIN");
  assert.match(page.headers.get("Content-Security-Policy"), /frame-ancestors 'self'/);
  const manifest = await at("https://nuvio-assets.xnzxflix.workers.dev/manifest.json");
  assert.equal(manifest.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(manifest.headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(manifest.headers.get("Access-Control-Allow-Origin"), "*");
});

test("adresse_du_site_douteuse_refusee", async () => {
  assert.equal((await at('http://a"b.exemple:8787/guide')).status, 400);
  assert.equal((await at("http://192.168.1.10:8787/manifest.json")).status, 200);
});

// Nouveau logo : son adresse change avec lui, sinon Nuvio garde l'ancien en cache.
test("logo_versionne", async () => {
  const m = await (await at("https://nuvio-assets.xnzxflix.workers.dev/manifest.json")).json();
  assert.match(m.logo, /\/logo\/addon\.png\?v=\d+$/);
});

// Tendances du jour : dans l'ordre de TMDB, le même que le « N° » des affiches maison. Posters+ n'est
// plus lu. La 3, passée en page 2 de TMDB entre deux lectures, n'apparaît qu'une fois.
test("tendances_du_jour_dans_l_ordre_tmdb", async () => {
  const serie = (id) => ({ id, name: `Série ${id}`, first_air_date: "2020-01-01" });
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/trending/tv/day")) return new Response(JSON.stringify({ results: u.includes("page=1") ? [serie(3), serie(77), serie(1)] : [serie(1)], page: 1, total_pages: 2 }));
    return new Response("{}");
  };
  const { metas } = await (await get("/catalog/series/accueil-tendances-series.json")).json();
  assert.deepEqual(metas.map((m) => m.id), ["tmdb:3", "tmdb:77", "tmdb:1"]);
  assert.ok(!calls.some((u) => u.includes("postersplus")));
});

// Avec la photo du jour du service d'affiches (celle des « N° ») : la rangée montre ses titres classés, dans son ordre,
// et rien d'autre (chaque carte a son N°). Avec les titres à venir (u) : l'ordre de la photo, puis les autres.
test("tendances_du_jour_dans_l_ordre_de_la_photo", async () => {
  const { AFFICHES_URL } = await import("../worker/reglages.js");
  for (const prefixe of ["", `/${seg({ u: 1 })}`]) {
    const serie = (id) => ({ id, name: `Série ${id}`, first_air_date: "2020-01-01" });
    globalThis.fetch = async (url) => {
      const u = String(url);
      calls.push(u);
      if (u === `${AFFICHES_URL}/tendances/series.json?v=9`) return new Response(JSON.stringify({ ids: [1, 3, 9] }));
      if (u.includes("/trending/tv/day")) return new Response(JSON.stringify({ results: u.includes("page=1") ? [serie(3), serie(77), serie(1)] : [], page: 1, total_pages: 1 }));
      return new Response("{}");
    };
    const { metas } = await (await get(`${prefixe}/catalog/series/accueil-tendances-series.json`)).json();
    assert.deepEqual(metas.map((m) => m.id), prefixe ? ["tmdb:1", "tmdb:3", "tmdb:77"] : ["tmdb:1", "tmdb:3"], prefixe);
  }
});

// La rangée reprend les N° de la photo tels quels : les titres classés en tête, dans l'ordre, sans refaire le tri
// (le 3, « au cinéma seulement » maintenant, reste N°2) ; le 1, que TMDB ne range plus dans ses pages, est lu à part ;
// les places vides (0) ne donnent rien ; le reste (le 2, sans N°) n'est pas montré, ni en page 2.
test("tendances_du_jour_reprennent_les_numeros_de_la_photo", async () => {
  const { AFFICHES_URL } = await import("../worker/reglages.js");
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u === `${AFFICHES_URL}/tendances/movie.json?v=10`) return new Response(JSON.stringify({ ids: [1, 3, ...Array(18).fill(0), 2] }));
    if (u.includes("/trending/movie/day")) {
      return new Response(JSON.stringify({ results: u.includes("page=1") ? [3, 2].map((id) => ({ id, title: `Film ${id}`, original_language: "en", release_date: jour(-60) })) : [], page: 1, total_pages: 1 }));
    }
    if (/\/movie\/1\?/.test(u) && !u.includes("append_to_response")) return new Response(JSON.stringify({ id: 1, title: "Film 1", original_language: "en", release_date: jour(-90), genres: [{ id: 18 }] }));
    const m = /\/movie\/(\d)\?/.exec(u);
    // 3 : au cinéma en France seulement (pas regardable chez soi) ; 2 : sorti chez soi, en VF.
    if (m) return new Response(JSON.stringify({ id: Number(m[1]), imdb_id: `tt90${m[1]}`, original_language: "en", release_dates: { results: m[1] === "3"
      ? [{ iso_3166_1: "FR", release_dates: [{ type: 3, release_date: jour(-5) + "T00:00:00.000Z" }] }]
      : [{ iso_3166_1: "FR", release_dates: [{ type: 3, release_date: jour(-120) + "T00:00:00.000Z" }] }, { iso_3166_1: "US", release_dates: [{ type: 4, release_date: jour(-60) + "T00:00:00.000Z" }] }] } }));
    return new Response("{}");
  };
  const { metas } = await (await get("/catalog/movie/accueil-top10.json")).json();
  assert.deepEqual(metas.map((m) => m.name), ["Film 1", "Film 3"]);
  assert.deepEqual((await (await get("/catalog/movie/accueil-top10/skip=2.json")).json()).metas, []);
});

// Télé-réalité : masquée de toutes les rangées de séries, sauf d'une rangée sur mesure qui la demande.
test("rangee_sur_mesure_tele_realite", async () => {
  const { GENRES } = await import("../worker/config.js");
  const tr = GENRES.findIndex(([n]) => n === "Téléréalité");
  assert.ok(tr >= 0);
  const discover = () => calls.map((u) => new URL(u)).filter((u) => u.pathname.endsWith("/discover/tv"));
  await get(`/${seg({ x: [{ n: "Télé-réalité", t: 1, g: [tr], l: "fr" }] })}/catalog/series/perso-0.json`);
  assert.ok(discover().length);
  for (const u of discover()) {
    assert.equal(u.searchParams.get("with_genres"), "10764");
    assert.equal(u.searchParams.get("vote_count.gte"), "1");   // peu notée sur TMDB
    assert.ok(u.searchParams.get("air_date.gte") > "2015");     // encore diffusée, pas les variétés d'antan
    assert.ok(!(u.searchParams.get("without_genres") || "").split("|").includes("10764"));
  }
  calls.length = 0;
  await get(`/${seg({ x: [{ n: "Années 90", t: 1, g: [tr], l: "fr", y: [1990, 1999] }] })}/catalog/series/perso-0.json`);
  assert.ok(discover().length && discover().every((u) => !u.searchParams.has("air_date.gte")));   // années choisies : respectées
  calls.length = 0;
  await get(`/${seg({ x: [{ n: "Drames", t: 1, g: [GENRES.findIndex(([n]) => n === "Drame")] }] })}/catalog/series/perso-0.json`);
  assert.ok(discover().every((u) => u.searchParams.get("without_genres").split("|").includes("10764")));
});

test("tendances_du_jour_dans_l_ordre_tmdb_meme_avec_les_films_a_venir", async () => {
  const serie = (id) => ({ id, name: `Série ${id}`, first_air_date: "2099-01-01" });
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/trending/tv/day")) return new Response(JSON.stringify({ results: [serie(3), serie(1), serie(2)], page: 1, total_pages: 1 }));
    return new Response("{}");
  };
  const { metas } = await (await get(`/${seg({ u: 1 })}/catalog/series/accueil-tendances-series.json`)).json();
  assert.deepEqual(metas.map((m) => m.id), ["tmdb:3", "tmdb:1", "tmdb:2"]);
  assert.ok(!calls.some((u) => u.includes("postersplus")));
});

// /affiche (aperçus du site, Plan B Stremio) : relaie l'affiche maison de Vercel, options comprises,
// sans jamais envoyer la clé TMDB du worker.
// Sans le serveur des affiches : l'affiche toute faite du style des réglages ; un réglage perso (T0Q0), son dossier perso.
test("affiche_relaie_le_service_maison", async () => {
  const { AFFICHES_STATIQUES } = await import("../worker/reglages.js");
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { "Content-Type": "image/jpeg" } });
  };
  const res = await get("/affiche/movie/poster/tt15239678?s=1.Q0T0");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "image/jpeg");
  assert.equal(calls[0], `${AFFICHES_STATIQUES}/perso/T0Q0/movie/poster/tt15239678.jpg`);
  assert.ok(!calls[0].includes("api_key") && !calls[0].includes("tmdb_key"));
});

// Le dossier du style : en portrait d'après ses réglages, en paysage d'après ceux de son paysage (Signature a le sien) ;
// s invalide : « maison ». Sans tt…, l'identifiant tmdb:… est codé comme les fichiers statiques l'attendent ; pas encore
// dessinée : 404 jamais gardée.
test("affiche_options_nettoyees", async () => {
  const { AFFICHES_STATIQUES } = await import("../worker/reglages.js");
  const { MEMOIRES, MEMOIRES_PAYSAGE, ecrireReglages } = await import("../worker/lien-affiches.js");
  globalThis.fetch = async (url) => { calls.push(String(url)); return new Response(new Uint8Array([0xff]), { headers: { "Content-Type": "image/jpeg" } }); };
  await get(`/affiche/series/landscape/tmdb:94605?imdb=tt11126994&s=1.${ecrireReglages(MEMOIRES_PAYSAGE.signature)}`);
  // Le tt… donné par la régie d'abord (les fichiers sont rangés sous l'identifiant de Nuvio).
  assert.equal(calls[0], `${AFFICHES_STATIQUES}/signature/series/landscape/tt11126994.jpg`);
  await get(`/affiche/movie/poster/tt2?s=1.${ecrireReglages(MEMOIRES.cine)}`);
  assert.equal(calls[1], `${AFFICHES_STATIQUES}/cine/movie/poster/tt2.jpg`);
  await get("/affiche/movie/poster/tt1?s=n'importe");
  assert.equal(calls[2], `${AFFICHES_STATIQUES}/maison/movie/poster/tt1.jpg`);
  calls.length = 0;
  globalThis.fetch = async (url) => { calls.push(String(url)); return new Response(null, { status: 503 }); };
  const absente = await get("/affiche/series/poster/tmdb:94605?imdb=tt11126994");
  assert.equal(absente.status, 404);
  assert.equal(absente.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(calls, [`${AFFICHES_STATIQUES}/maison/series/poster/tt11126994.jpg`, `${AFFICHES_STATIQUES}/maison/series/poster/tmdb%3A94605.jpg`]);
});

test("affiche_service_en_panne", async () => {
  globalThis.fetch = async () => new Response("", { status: 502 });
  assert.equal((await get("/affiche/movie/poster/tt1")).status, 404);
});

test("collections_ordre_des_tuiles", async () => {
  const folders = ["a", "b", "c", "d"].map((id) => ({ id, title: id.toUpperCase() }));
  globalThis.fetch = async (url) => new Response(String(url).endsWith("/collections/collections.json")
    ? JSON.stringify([{ id: "genres", title: "Genres", folders }]) : "{}", { headers: { "Content-Type": "application/json" } });
  const ids = async (cfg) => (await (await get(`/${seg(cfg)}/collections.json`)).json())[0].folders.map((f) => f.id);
  // Ordre choisi d'abord, les tuiles absentes de la liste ensuite dans l'ordre du fichier, les masquées retirées.
  assert.deepEqual(await ids({ to: { 2: [2, 0] } }), ["c", "a", "b", "d"]);
  assert.deepEqual(await ids({ to: { 2: [2, 0] }, t: { 2: [1] } }), ["c", "a", "d"]);
  assert.deepEqual(await ids({ t: { 2: [3] } }), ["a", "b", "c"]);
});

// « Comme l'accueil » : toutes les collections en FOLLOW_LAYOUT (bandes-annonces sur Nuvio TV) ; sinon celles du fichier.
test("collections_comme_l_accueil", async () => {
  const folders = [{ id: "a", title: "A" }];
  globalThis.fetch = async (url) => new Response(String(url).endsWith("/collections/collections.json")
    ? JSON.stringify([{ id: "genres", title: "Genres", viewMode: "TABBED_GRID", folders }, { id: "sagas", title: "Sagas", viewMode: "ROWS", folders }])
    : "{}", { headers: { "Content-Type": "application/json" } });
  const modes = async (cfg) => (await (await get(`/${seg(cfg)}/collections.json`)).json()).map((c) => c.viewMode);
  assert.deepEqual(await modes({ c: ["genres", "sagas"] }), ["TABBED_GRID", "ROWS"]);
  assert.deepEqual(await modes({ c: ["genres", "sagas"], ca: 1 }), ["FOLLOW_LAYOUT", "FOLLOW_LAYOUT"]);
});

test("studios_ordre_par_defaut", async () => {
  const folders = ["studio-33", "studio-1", "studio-3", "marvel-studios", "warner-bros", "dc-comics"].map((id) => ({ id, title: id }));
  globalThis.fetch = async (url) => new Response(String(url).endsWith("/collections/collections.json")
    ? JSON.stringify([{ id: "studios", title: "Studios", folders }]) : "{}", { headers: { "Content-Type": "application/json" } });
  const ids = async (cfg) => (await (await get(`/${seg(cfg)}/collections.json`)).json())[0].folders.map((f) => f.id);
  // Universal, puis Marvel, Warner et DC, puis les autres dans l'ordre du fichier.
  assert.deepEqual(await ids({}), ["studio-33", "marvel-studios", "warner-bros", "dc-comics", "studio-1", "studio-3"]);
  // Un ordre choisi passe devant ; les tuiles absentes suivent dans l'ordre par défaut.
  assert.deepEqual(await ids({ tv: 1, to: { 4: [2] } }), ["studio-3", "studio-33", "marvel-studios", "warner-bros", "dc-comics", "studio-1"]);
});

// Découvrir : Populaires, Nouveautés et films récents par année, seulement ce qui est déjà
// dispo dans le pays (abonnement, location, achat), dans la même requête TMDB. Réglage « u » : tout.
test("decouvrir_seulement_dispo_dans_le_pays", async () => {
  const discover = () => calls.map((u) => new URL(u)).filter((u) => u.pathname.endsWith("/discover/movie"));
  for (const path of ["films-populaires/genre=Action", "films-nouveautes/genre=Ce%20mois-ci", "films-annees/genre=2026"]) {
    calls.length = 0;
    await get(`/catalog/movie/${path}.json`);
    assert.ok(discover().length, path);
    for (const u of discover()) {
      assert.equal(u.searchParams.get("watch_region"), "FR", path);
      assert.equal(u.searchParams.get("with_watch_monetization_types"), "flatrate|free|ads|rent|buy", path);
    }
  }
  for (const path of ["/catalog/movie/films-annees/genre=1999.json", `/${seg({ u: 1 })}/catalog/movie/films-populaires/genre=Action.json`]) {
    calls.length = 0;
    await get(path);
    assert.ok(discover().length && discover().every((u) => !u.searchParams.has("with_watch_monetization_types")), path);
  }
});

// « Par année » au 1er janvier : l'année nouvelle s'ajoute d'elle-même, et le filtre « déjà dispo »
// passe aux deux dernières années (films seulement).
test("par_annee_suit_l_annee_en_cours", async () => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2027-01-02T12:00:00Z") });
  try {
    const m = await (await get("/manifest.json")).json();
    for (const id of ["films-annees", "series-annees"]) {
      const labels = m.catalogs.find((c) => c.id === id).genres;
      assert.deepEqual(labels.slice(0, 3), ["2027", "2026", "2025"], id);
    }
    const discover = () => calls.map((u) => new URL(u)).filter((u) => u.pathname.endsWith("/discover/movie"));
    for (const [year, dispo] of [["2027", true], ["2026", true], ["2025", false]]) {
      calls.length = 0;
      await get(`/catalog/movie/films-annees/genre=${year}.json`);
      assert.ok(discover().length, year);
      for (const u of discover()) {
        assert.equal(u.searchParams.get("primary_release_year"), year);
        assert.equal(u.searchParams.has("with_watch_monetization_types"), dispo, year);
      }
    }
    calls.length = 0;
    await get("/catalog/series/series-annees/genre=2027.json");
    const tv = calls.map((u) => new URL(u)).filter((u) => u.pathname.endsWith("/discover/tv"));
    assert.ok(tv.length && tv.every((u) => u.searchParams.get("first_air_date_year") === "2027" && !u.searchParams.has("with_watch_monetization_types")));
  } finally {
    mock.timers.reset();
  }
});

// Le relais garde l'aperçu aussi longtemps que le service le demande (pas toujours un jour) : une affiche
// dessinée sans son badge 4K, parce que la qualité tardait, n'est gardée qu'une heure, comme chez Vercel.
test("affiche_relais_suit_le_cache_du_service", async () => {
  const jpeg = (cc) => async (url) => { calls.push(String(url)); return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { "Content-Type": "image/jpeg", "Cache-Control": cc } }); };
  globalThis.fetch = jpeg("public, max-age=3600");
  const court = await get("/affiche/movie/poster/tt15239678?s=1.T0");
  assert.equal(court.headers.get("Cache-Control"), "public, max-age=3600");
  globalThis.fetch = jpeg("public, max-age=604800");
  const long = await get("/affiche/movie/poster/tt1375666");
  assert.equal(long.headers.get("Cache-Control"), "public, max-age=86400");   // un jour au plus
  globalThis.fetch = jpeg("no-store");
  await new Promise((ok) => setTimeout(ok, 20));   // écritures en cache des requêtes d'avant terminées
  store.clear();
  await get("/affiche/movie/poster/tt0816692");
  assert.equal(store.size, 0, "une réponse no-store ne doit pas être gardée : " + [...store.keys()].join(" "));
  // La clé de cache porte la version des aperçus : une nouvelle version ne ressort pas les anciens.
  const { APERCU_V } = await import("../worker/reglages.js");
  globalThis.fetch = jpeg("public, max-age=3600");
  await get("/affiche/movie/poster/tt0816692");
  await new Promise((ok) => setTimeout(ok, 20));
  assert.ok([...store.keys()].some((k) => k.includes("affiche-v" + APERCU_V) || k.includes("v=" + APERCU_V)), [...store.keys()].join(" "));
});

// « Au cinéma · Prochainement » : un film déjà regardable chez soi en VF (sorti en numérique aux États-Unis, sources
// pas lues) n'y est plus, même si sa sortie en salle en France est à venir (Hope : VOD aux États-Unis il y a 8 jours).
test("prochainement_sans_les_films_deja_dispo", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const dates = (...l) => ({ results: l.map(([pays, type, d]) => ({ iso_3166_1: pays, release_dates: [{ type, release_date: d + "T00:00:00.000Z" }] })) });
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/movie/upcoming")) return new Response(JSON.stringify({ results: [
      { id: 1, title: "Hope", original_language: "ko", release_date: jour(7) },
      { id: 2, title: "Pas encore", original_language: "en", release_date: jour(20) },
    ], page: 1, total_pages: 1 }));
    if (/\/movie\/1\?/.test(u)) return new Response(JSON.stringify({ release_dates: dates(["US", 4, jour(-8)], ["CA", 3, jour(-40)], ["FR", 3, jour(7)]) }));
    if (/\/movie\/2\?/.test(u)) return new Response(JSON.stringify({ release_dates: dates(["FR", 3, jour(20)]) }));
    return new Response("{}");
  };
  const { metas } = await (await get("/catalog/movie/films-cinema/genre=Prochainement.json")).json();
  assert.deepEqual(metas.map((m) => m.name), ["Pas encore"]);
});

// Sur une plateforme en France (Netflix…) avant sa sortie numérique américaine : VF disponible, donc retiré aussi
// (sources pas lues). Sur Netflix aux États-Unis seulement, pas encore arrivé chez soi : gardé.
test("prochainement_sans_les_films_sur_une_plateforme_en_france", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const dates = (...l) => ({ results: l.map(([pays, type, d]) => ({ iso_3166_1: pays, release_dates: [{ type, release_date: d + "T00:00:00.000Z" }] })) });
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/movie/upcoming")) return new Response(JSON.stringify({ results: [
      { id: 1, title: "Sur Netflix", original_language: "es", release_date: jour(7) },
      { id: 2, title: "Sur Netflix US", original_language: "es", release_date: jour(7) },
      { id: 3, title: "En Suisse", original_language: "en", release_date: jour(7) },
    ], page: 1, total_pages: 1 }));
    const netflix = (pays) => ({ results: { [pays]: { flatrate: [{ provider_name: "Netflix" }] } } });
    if (/\/movie\/1\?/.test(u)) return new Response(JSON.stringify({ release_dates: dates(["US", 4, jour(4)]), "watch/providers": netflix("FR") }));
    if (/\/movie\/2\?/.test(u)) return new Response(JSON.stringify({ release_dates: dates(["US", 4, jour(4)]), "watch/providers": netflix("US") }));
    if (/\/movie\/3\?/.test(u)) return new Response(JSON.stringify({ release_dates: dates(["DE", 3, jour(-40)]), "watch/providers": netflix("CH") }));
    return new Response("{}");
  };
  const { metas } = await (await get("/catalog/movie/films-cinema/genre=Prochainement.json")).json();
  assert.deepEqual(metas.map((m) => m.name), ["Sur Netflix US", "En Suisse"]);
  assert.ok(calls.some((u) => /\/movie\/1\?/.test(u) && /append_to_response=[^&]*watch/.test(decodeURIComponent(u))), "plateformes pas demandées");
});

// « Les Rayons et les Ombres » : sortie numérique annoncée dans 6 jours, mais déjà en location et à l'achat en France.
// Regardable aujourd'hui : pas dans « Bientôt dispo » (l'affiche le dit déjà « Nouveau »).
test("bientot_dispo_sans_les_films_deja_sur_une_plateforme_en_france", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const dates = (...l) => ({ results: l.map(([pays, type, d]) => ({ iso_3166_1: pays, release_dates: [{ type, release_date: d + "T00:00:00.000Z" }] })) });
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/discover/movie") && new URL(u).searchParams.get("with_release_type") === "4") return new Response(JSON.stringify({ results: [
      { id: 1, title: "Déjà en location", original_language: "fr", release_date: jour(-200), popularity: 9 },
      { id: 2, title: "Vraiment bientôt", original_language: "fr", release_date: jour(-200), popularity: 8 },
    ], page: 1, total_pages: 1 }));
    if (/\/movie\/1\?/.test(u)) return new Response(JSON.stringify({ original_language: "fr", release_dates: dates(["FR", 4, jour(6)]), "watch/providers": { results: { FR: { rent: [{ provider_name: "Canal VOD" }] } } } }));
    if (/\/movie\/2\?/.test(u)) return new Response(JSON.stringify({ original_language: "fr", release_dates: dates(["FR", 4, jour(6)]) }));
    return new Response(JSON.stringify({ results: [] }));
  };
  const { metas } = await (await get("/catalog/movie/accueil-vod-bientot.json")).json();
  assert.deepEqual(metas.map((m) => m.name), ["Vraiment bientôt"]);
  assert.ok(!metas.some((m) => "_plateforme" in m));
});

// EB : sorti au cinéma aux Pays-Bas il y a 5 mois, sans date numérique, déjà sur Prime Video en France, mais en VO.
// La fiche ne dit plus « Dispo vers le … » (estimation), ni « Pas encore en VF » : seules les sources le disent
// (Kraken, norvégien, est en VF sur Paramount+). En anglais (VF probable) : « Déjà dispo ».
test("fiche_deja_dispo_sur_une_plateforme_en_france", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const fiche = (fr, langue) => ({ id: 1662858, title: "EB", release_date: jour(-160), original_language: langue,
    release_dates: { results: [{ iso_3166_1: "NL", release_dates: [{ type: 3, release_date: jour(-160) + "T00:00:00.000Z" }] }] },
    "watch/providers": { results: fr ? { FR: { flatrate: [{ provider_name: "Amazon Prime Video" }] } } : {} } });
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (/\/movie\/1662858\?/.test(u)) return new Response(JSON.stringify(fiche(true, "nl")));
    if (/\/movie\/1662859\?/.test(u)) return new Response(JSON.stringify({ ...fiche(true, "en"), id: 1662859 }));
    return new Response("{}");
  };
  const m = (await (await get("/meta/movie/tmdb:1662858.json")).json()).meta;
  assert.doesNotMatch(m.description || "", /Dispo vers|Déjà dispo|VO|VF/);
  const en = (await (await get("/meta/movie/tmdb:1662859.json")).json()).meta;
  assert.match(en.description || "", /Déjà dispo/);
  assert.ok(calls.some((u) => /\/movie\/1662858\?/.test(u) && /append_to_response=[^&]*watch/.test(decodeURIComponent(u))), "plateformes pas demandées");
});

// L'Étrange Noël de monsieur Jack (1993), en VF sur Disney+ : « Déjà dispo » ne dit rien d'un vieux film.
test("fiche_vieux_film_sans_deja_dispo", async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (/\/movie\/9479\?/.test(u)) return new Response(JSON.stringify({ id: 9479, title: "L'Étrange Noël de monsieur Jack",
      release_date: "1993-10-09", original_language: "en",
      release_dates: { results: [{ iso_3166_1: "US", release_dates: [{ type: 3, release_date: "1993-10-09T00:00:00.000Z" }] }] },
      "watch/providers": { results: { FR: { flatrate: [{ provider_name: "Disney Plus" }] } } } }));
    return new Response("{}");
  };
  const m = (await (await get("/meta/movie/tmdb:9479.json")).json()).meta;
  assert.doesNotMatch(m.description || "", /Déjà dispo|📅/);
});

test("prochainement_pages_pleines_et_fiches_lues_une_fois", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const film = (id) => ({ id, title: "Film " + id, original_language: "en", release_date: jour(10) });
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/movie/upcoming")) {
      const p = Number(new URL(u).searchParams.get("page"));
      return new Response(JSON.stringify({ results: Array.from({ length: 20 }, (_, i) => film(p * 100 + i)), page: p, total_pages: 3 }));
    }
    const m = /\/movie\/(\d+)\?/.exec(u);
    if (m) {
      // Le film 105 est déjà en VOD aux États-Unis : retiré.
      const dispo = m[1] === "105";
      const dates = dispo ? [{ iso_3166_1: "US", release_dates: [{ type: 4, release_date: jour(-5) + "T00:00:00.000Z" }] }, { iso_3166_1: "CA", release_dates: [{ type: 3, release_date: jour(-30) + "T00:00:00.000Z" }] }]
        : [{ iso_3166_1: "FR", release_dates: [{ type: 3, release_date: jour(10) + "T00:00:00.000Z" }] }];
      return new Response(JSON.stringify({ release_dates: { results: dates } }));
    }
    return new Response("{}");
  };
  const { metas } = await (await get("/catalog/movie/films-cinema/genre=Prochainement.json")).json();
  assert.equal(metas.length, 20, "page pas pleine");
  assert.ok(!metas.some((m) => m.name === "Film 105"));
  assert.ok(metas.some((m) => m.name === "Film 200"), "pas complétée par la page suivante");
  const lectures = calls.filter((u) => /\/movie\/\d+\?/.test(u)).map((u) => /\/movie\/(\d+)\?/.exec(u)[1]);
  assert.equal(lectures.length, new Set(lectures).size, "une fiche lue deux fois");
});

// Rangées « Dispo depuis peu », « Bientôt dispo », « Prochainement » et fiche : la VF lue dans les sources (service
// d'affiches, /vf.json, un seul appel par page) décide, comme sur les affiches ; sans réponse, les dates.
const sourcesDe = (table) => (u) => {
  const v = new URL(u).searchParams.get("v") || "";
  return new Response(JSON.stringify(Object.fromEntries(v.split(",").map((id) => [id, table[id.replace("movie/", "")] ?? null]))));
};
const filmVod = (n, langue, dates, fr) => ({ id: n, imdb_id: "tt" + (900 + n), original_language: langue,
  release_dates: { results: dates.map(([pays, type, d]) => ({ iso_3166_1: pays, release_dates: [{ type, release_date: d + "T00:00:00.000Z" }] })) },
  ...(fr ? { "watch/providers": { results: { FR: { flatrate: [{ provider_name: "Netflix" }] } } } } : {}) });

// Tendances du jour : seulement ce qu'on peut regarder chez soi en VF (seule la VF compte). The Weight (1) : sorti
// chez soi aux États-Unis, sources sans VF → retiré ; 2 : sources VF → gardé ; 3 : pas de sources lues, sorti en
// numérique aux États-Unis → gardé (la date dit vrai) ; 4 : pas de sources lues, jamais sorti aux États-Unis, au cinéma
// en France il y a 100 jours (+ 45) → gardé ; 5 : vieux film → gardé (ses sources ne sont pas lues, comme sur les
// affiches) ; 6 : au cinéma aux États-Unis depuis 20 jours, pas encore chez soi → retiré ; 7 : sorti en numérique
// l'avant-veille, aucune source du tout (空枪, N°4 le 25 octobre 2026) → retiré, comme sans VF.
test("tendances_du_jour_seulement_en_vf", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const fiches = {
    1: filmVod(1, "en", [["FR", 3, jour(-35)], ["US", 4, jour(-1)]]),
    2: filmVod(2, "en", [["US", 4, jour(-10)]]),
    3: filmVod(3, "en", [["US", 4, jour(-10)]]),
    4: filmVod(4, "en", [["FR", 3, jour(-100)]]),
    5: filmVod(5, "en", [["US", 3, "2001-05-01"]]),
    6: filmVod(6, "en", [["US", 3, jour(-20)], ["FR", 3, jour(-60)]]),
    7: filmVod(7, "en", [["US", 4, jour(-2)]]),
  };
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/vf.json")) return sourcesDe({ tt901: { vf: false, sources: 47 }, tt902: { vf: true, sources: 12 }, tt907: { vf: false, sources: 0 } })(u);
    if (u.includes("/trending/movie/day")) {
      return new Response(JSON.stringify({ results: u.includes("page=1") ? [1, 2, 3, 4, 5, 6, 7].map((id) => ({ id, title: `Film ${id}`, original_language: "en", release_date: jour(-35) })) : [], page: 1, total_pages: 1 }));
    }
    const m = /\/movie\/(\d)\?/.exec(u);
    if (m) return new Response(JSON.stringify(fiches[m[1]]));
    return new Response("{}");
  };
  const { metas } = await (await get("/catalog/movie/accueil-top10.json")).json();
  assert.deepEqual(metas.map((m) => m.name), ["Film 2", "Film 3", "Film 4", "Film 5"]);
  assert.equal(calls.filter((u) => u.includes("/vf.json")).length, 1, "un seul appel pour la page");
});

// Turning Point (1, documentaire Netflix) : sources toutes en VO (personne ne publie la VF), mais en abonnement sur
// Netflix en France, qui le double → gardé, et sa fiche dit la date, pas « Aucune date ». Stavros Halkias (2, stand-up
// sur Netflix) : jamais doublé → retiré. 3 : sur MUBI (souvent en VOSTFR) → les sources décident, retiré.
test("tendances_en_vf_sur_une_plateforme_qui_double", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const sur = (id, nom) => ({ "watch/providers": { results: { FR: { flatrate: [{ provider_id: id, provider_name: nom }] } } } });
  const fiches = {
    1: { ...filmVod(1, "en", [["US", 4, jour(-20)]]), ...sur(8, "Netflix") },
    2: { ...filmVod(2, "en", [["US", 4, jour(-20)]]), ...sur(8, "Netflix"), keywords: { keywords: [{ id: 9716, name: "stand-up comedy" }] } },
    3: { ...filmVod(3, "en", [["US", 4, jour(-20)]]), ...sur(11, "MUBI") },
  };
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/vf.json")) return sourcesDe({ tt901: { vf: false, sources: 12 }, tt902: { vf: false, sources: 3 }, tt903: { vf: false, sources: 5 } })(u);
    if (u.includes("/trending/movie/day")) {
      return new Response(JSON.stringify({ results: u.includes("page=1") ? [1, 2, 3].map((id) => ({ id, title: `Film ${id}`, original_language: "en", release_date: jour(-20) })) : [], page: 1, total_pages: 1 }));
    }
    const m = /\/movie\/(\d)\?/.exec(u);
    if (m) return new Response(JSON.stringify(fiches[m[1]]));
    return new Response("{}");
  };
  const { metas } = await (await get("/catalog/movie/accueil-top10.json")).json();
  assert.deepEqual(metas.map((m) => m.name), ["Film 1"]);
  assert.ok(calls.some((u) => /\/movie\/1\?/.test(u) && /append_to_response=[^&]*keywords/.test(decodeURIComponent(u))), "mots-clés pas demandés");
  const fiche = (await (await get("/meta/movie/tmdb:1.json")).json()).meta;
  assert.match(fiche.description || "", /Dispo depuis le/);
  assert.doesNotMatch(fiche.description || "", /Aucune date/);
});

// Kraken (norvégien) dans une rangée qui ne lit pas les sources : sorti chez soi aux États-Unis, sur Paramount+ en
// France — et en VF. Sans sources, la fiche ne dit jamais « Pas encore en VF ».
test("rangee_sans_sources_ne_dit_pas_pas_encore_en_vf", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/discover/movie")) return new Response(JSON.stringify({ results: [{ id: 7, title: "Kraken", original_language: "no", release_date: jour(-250) }], page: 1, total_pages: 1 }));
    if (/\/movie\/7\?/.test(u)) {
      return new Response(JSON.stringify({ ...filmVod(7, "no", [["NO", 3, jour(-250)], ["US", 4, jour(-130)]]),
        "watch/providers": { results: { FR: { flatrate: [{ provider_name: "Paramount+ Amazon Channel" }] } } } }));
    }
    return new Response(JSON.stringify({ results: [] }));
  };
  const { metas } = await (await get("/catalog/movie/films-populaires.json")).json();
  assert.equal(metas.length, 1);
  assert.doesNotMatch(metas[0].description || "", /VF|VO/);
  assert.ok(!calls.some((u) => u.includes("/vf.json")));
});

test("dispo_depuis_peu_selon_les_sources", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const lus = { tt901: { vf: false, sources: 30 }, tt902: { vf: true, sources: 12 } };
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/vf.json")) return sourcesDe(lus)(u);
    if (u.includes("/discover/movie") && new URL(u).searchParams.get("with_release_type") === "4") return new Response(JSON.stringify({ results: [
      { id: 1, title: "VO seulement", original_language: "en", release_date: jour(-60), popularity: 9 },
      { id: 2, title: "VF trouvée", original_language: "en", release_date: jour(-60), popularity: 8 },
      { id: 3, title: "Pas lu", original_language: "en", release_date: jour(-60), popularity: 7 },
    ], page: 1, total_pages: 1 }));
    // 1 : sorti en numérique aux États-Unis, mais les sources n'ont pas la VF ; 2 : sources VF ; 3 : pas lu → la date dit vrai.
    const m = /\/movie\/(\d)\?/.exec(u);
    if (m && m[1] === "1") return new Response(JSON.stringify(filmVod(1, "en", [["US", 4, jour(-5)], ["CA", 3, jour(-60)]])));
    if (m && m[1] === "2") return new Response(JSON.stringify(filmVod(2, "en", [["US", 4, jour(-5)]])));
    if (m && m[1] === "3") return new Response(JSON.stringify(filmVod(3, "en", [["US", 4, jour(-5)], ["CA", 3, jour(-60)]])));
    return new Response(JSON.stringify({ results: [] }));
  };
  const { metas } = await (await get("/catalog/movie/accueil-vod-semaine.json")).json();
  assert.deepEqual(metas.map((m) => m.name).sort(), ["Pas lu", "VF trouvée"]);
  assert.equal(calls.filter((u) => u.includes("/vf.json")).length, 1, "un seul appel pour la page");
  assert.ok(calls.some((u) => u.includes("/vf.json") && u.includes("movie%2Ftt901") || u.includes("movie/tt901")));
  assert.ok(!metas.some((m) => "_vf" in m || "_dejaVf" in m));
});

// « Bientôt dispo » : aussi un film déjà sorti chez soi mais pas encore en VF d'après ses sources (The Weight), à la
// fin ; pas celui qui y est déjà en VF, ni celui dont on n'a pas lu les sources (rien ne dit qu'il n'est pas en VF).
test("bientot_dispo_avec_les_films_pas_encore_en_vf", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const lus = { tt901: { vf: false, sources: 47 }, tt902: { vf: true, sources: 12 } };
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/vf.json")) return sourcesDe(lus)(u);
    const q = new URL(u).searchParams;
    if (u.includes("/discover/movie") && q.get("with_release_type") === "4" && q.get("release_date.gte") < jour(-30)) return new Response(JSON.stringify({ results: [
      { id: 1, title: "The Weight", original_language: "en", release_date: jour(-35), popularity: 9 },
      { id: 2, title: "Déjà en VF", original_language: "en", release_date: jour(-35), popularity: 8 },
    ], page: 1, total_pages: 1 }));
    if (u.includes("/discover/movie") && q.get("with_release_type") === "4") return new Response(JSON.stringify({ results: [
      { id: 4, title: "À venir", original_language: "en", release_date: jour(-20), popularity: 1 },
    ], page: 1, total_pages: 1 }));
    const m = /\/movie\/(\d)\?/.exec(u);
    if (m && m[1] === "1") return new Response(JSON.stringify(filmVod(1, "en", [["FR", 3, jour(-35)], ["US", 4, jour(-1)]])));
    if (m && m[1] === "2") return new Response(JSON.stringify(filmVod(2, "en", [["US", 4, jour(-3)]])));
    if (m && m[1] === "4") return new Response(JSON.stringify(filmVod(4, "en", [["US", 3, jour(-20)], ["US", 4, jour(10)]])));
    return new Response(JSON.stringify({ results: [] }));
  };
  const { metas } = await (await get("/catalog/movie/accueil-vod-bientot.json")).json();
  assert.deepEqual(metas.map((m) => m.name), ["À venir", "The Weight"]);
  assert.match(metas[1].description || "", /Aucune date/);
  assert.ok(!metas.some((m) => "_vo" in m));
});

test("bientot_dispo_et_prochainement_selon_les_sources", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const lus = { tt901: { vf: true, sources: 12 }, tt902: { vf: false, sources: 20 } };
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/vf.json")) return sourcesDe(lus)(u);
    if (u.includes("/discover/movie") && new URL(u).searchParams.get("with_release_type") === "4") return new Response(JSON.stringify({ results: [
      { id: 1, title: "Déjà en VF", original_language: "en", release_date: jour(-40), popularity: 9 },
      { id: 2, title: "VO seulement", original_language: "en", release_date: jour(-40), popularity: 8 },
    ], page: 1, total_pages: 1 }));
    if (u.includes("/movie/upcoming")) return new Response(JSON.stringify({ results: [
      { id: 1, title: "Déjà en VF", original_language: "en", release_date: jour(7) },
      { id: 2, title: "VO seulement", original_language: "en", release_date: jour(7) },
    ], page: 1, total_pages: 1 }));
    const m = /\/movie\/(\d)\?/.exec(u);
    if (m) return new Response(JSON.stringify(filmVod(Number(m[1]), "en", [["US", 4, jour(6)], ["FR", 3, jour(7)]])));
    return new Response(JSON.stringify({ results: [] }));
  };
  const bientot = (await (await get("/catalog/movie/accueil-vod-bientot.json")).json()).metas;
  assert.deepEqual(bientot.map((m) => m.name), ["VO seulement"]);
  const prochainement = (await (await get("/catalog/movie/films-cinema/genre=Prochainement.json")).json()).metas;
  assert.deepEqual(prochainement.map((m) => m.name), ["VO seulement"]);
});

test("fiche_selon_les_sources", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const lus = { tt9001: { vf: true, sources: 12 }, tt9002: { vf: false, sources: 20 } };
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/vf.json")) return sourcesDe(lus)(u);
    const m = /\/movie\/(800[12])\?/.exec(u);
    // Jamais sorti aux États-Unis : au cinéma aux Pays-Bas il y a 60 jours, arrivé chez soi vers il y a 15 jours.
    if (m) return new Response(JSON.stringify({ id: Number(m[1]), title: "Film " + m[1], imdb_id: "tt900" + m[1].slice(3), release_date: jour(-60), original_language: "nl",
      release_dates: { results: [{ iso_3166_1: "NL", release_dates: [{ type: 3, release_date: jour(-60) + "T00:00:00.000Z" }] }] } }));
    return new Response("{}");
  };
  const vf = (await (await get("/meta/movie/tmdb:8001.json")).json()).meta;
  assert.match(vf.description || "", /Déjà dispo/);
  const vo = (await (await get("/meta/movie/tmdb:8002.json")).json()).meta;
  assert.match(vo.description || "", /Aucune date/);
});

// Les Diables (1971) ressort au cinéma : ses sources ont de la VF (vieux film), mais une ressortie reste dans
// « Prochainement ». Les sources ne jugent que les films récents (moins d'un an), comme sur les affiches.
test("prochainement_garde_les_ressorties", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/vf.json")) return sourcesDe({ tt907: { vf: true, sources: 25 } })(u);
    if (u.includes("/movie/upcoming")) return new Response(JSON.stringify({ results: [{ id: 7, title: "Les Diables", original_language: "en", release_date: jour(14) }], page: 1, total_pages: 1 }));
    if (/\/movie\/7\?/.test(u)) return new Response(JSON.stringify(filmVod(7, "en", [["GB", 3, "1971-07-16"], ["FR", 3, jour(14)]])));
    return new Response(JSON.stringify({ results: [] }));
  };
  const { metas } = await (await get("/catalog/movie/films-cinema/genre=Prochainement.json")).json();
  assert.deepEqual(metas.map((m) => m.name), ["Les Diables"]);
});

// Buddy, The Fix : sortis chez soi aux États-Unis (date passée), sources sans VF : « Aucune date » — ni la VO, ni
// « Dispo depuis le … » (on ne sait pas quand la VF viendra).
test("fiche_vo_avec_date_connue", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/vf.json")) return sourcesDe({ tt9003: { vf: false, sources: 43 } })(u);
    if (/\/movie\/8003\?/.test(u)) return new Response(JSON.stringify({ id: 8003, title: "Buddy", imdb_id: "tt9003", release_date: jour(-60), original_language: "en",
      release_dates: { results: [{ iso_3166_1: "US", release_dates: [{ type: 4, release_date: jour(-8) + "T00:00:00.000Z" }] }] } }));
    return new Response("{}");
  };
  const m = (await (await get("/meta/movie/tmdb:8003.json")).json()).meta;
  assert.equal((m.description || "").split("\n")[0], "📅 Aucune date.");
  assert.equal(m.releaseInfo, jour(-60).slice(0, 4));   // la dispo dans le résumé seulement
});

// The Weight : en numérique aux États-Unis il y a 2 jours, sources sans VF (sous-titres français). Les dates
// françaises ne comptent pas (seul le calendrier américain) : « Aucune date », sans la VOSTFR.
test("fiche_vo_sans_date_de_vf", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const sortie = (pays, type, n) => ({ iso_3166_1: pays, release_dates: [{ type, release_date: jour(n) + "T00:00:00.000Z" }] });
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/vf.json")) return sourcesDe({ tt9007: { vf: false, sources: 55, langue: "vostfr" } })(u);
    if (/\/movie\/8007\?/.test(u)) return new Response(JSON.stringify({ id: 8007, title: "The Weight", imdb_id: "tt9007", release_date: jour(-36), original_language: "en",
      release_dates: { results: [sortie("US", 4, -2), sortie("FR", 4, 40), sortie("BE", 3, 20)] } }));
    return new Response("{}");
  };
  const m = (await (await get("/meta/movie/tmdb:8007.json")).json()).meta;
  assert.equal((m.description || "").split("\n")[0], "📅 Aucune date.");
});

// Série récente (coréenne, sur Prime Video) dont la saison n'a pas de VF dans les sources : la fiche le dit, avec
// l'épisode de la semaine ; une série en anglais sur Disney+ (doublée) : seulement l'épisode.
test("fiche_serie_sans_vf", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const serie = (id, langue, plateforme) => ({ id, name: "Série " + id, original_language: langue, first_air_date: jour(-3), number_of_seasons: 1,
    external_ids: { imdb_id: "tt" + id }, seasons: [{ season_number: 1, air_date: jour(-3), episode_count: 12 }],
    last_episode_to_air: { season_number: 1, episode_number: 2, air_date: jour(-1) }, next_episode_to_air: null,
    "watch/providers": { results: { FR: { flatrate: [{ provider_name: plateforme }] } } } });
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/vf.json")) return sourcesDe({ "series/tt7101:1:1": { vf: false, sources: 6, langue: "vostfr" }, "series/tt7102:1:1": { vf: false, sources: 45, langue: "vostfr" } })(u);
    if (/\/tv\/7101\?/.test(u)) return new Response(JSON.stringify(serie(7101, "ko", "Amazon Prime Video")));
    if (/\/tv\/7102\?/.test(u)) return new Response(JSON.stringify(serie(7102, "en", "Disney Plus")));
    return new Response("{}");
  };
  const ligne = async (id) => ((await (await get(`/meta/series/tmdb:${id}.json`)).json()).meta.description || "").split("\n")[0];
  assert.match(await ligne(7101), /Nouvel épisode sorti .* · pas encore en VF\.$/);
  assert.doesNotMatch(await ligne(7102), /VF/);
});

// L'Odyssée : en salle en France, sources en VO seulement, sortie numérique annoncée aux États-Unis dans 26 jours : le
// fichier américain n'est pas sorti, la fiche dit seulement la date, comme l'affiche (« DISPO LE 17 NOV. »), jamais
// « Pas encore en VF ». Nuvio montre aussi ce jour-là comme date de sortie.
test("fiche_vo_avec_date_de_vf", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/vf.json")) return sourcesDe({ tt9004: { vf: false, sources: 30 } })(u);
    if (/\/movie\/8004\?/.test(u)) return new Response(JSON.stringify({ id: 8004, title: "L'Odyssée", imdb_id: "tt9004", release_date: jour(-99), original_language: "en",
      release_dates: { results: [
        { iso_3166_1: "FR", release_dates: [{ type: 3, release_date: jour(-99) + "T00:00:00.000Z" }] },
        { iso_3166_1: "US", release_dates: [{ type: 3, release_date: jour(-97) + "T00:00:00.000Z" }, { type: 4, release_date: jour(26) + "T00:00:00.000Z" }] },
      ] } }));
    return new Response("{}");
  };
  const m = (await (await get("/meta/movie/tmdb:8004.json")).json()).meta;
  assert.ok((m.description || "").startsWith(`📅 Dispo le ${court(jour(26))}`), m.description);
  assert.doesNotMatch(m.description || "", /Pas encore en VF/);
  assert.equal(m.released, `${jour(26)}T00:00:00.000Z`);
});

// Le calendrier américain des sorties numériques décide de la date, comme sur l'affiche (affiches/lib/statut.js) :
// la sortie numérique aux États-Unis, sinon leur salle + 45 jours (« vers ») ; un film français garde ses dates ; un
// film jamais sorti aux États-Unis, sa première sortie numérique où que ce soit, sinon sa première salle + 45 jours.
const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const court = (iso) => `${Number(iso.slice(8, 10))} ${MOIS_COURTS[Number(iso.slice(5, 7)) - 1]}`;
const point = (s) => (s.endsWith(".") ? s : s + ".");
test("fiche_selon_le_calendrier_americain", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const films = {
    // Au cinéma aux États-Unis il y a 10 jours, déjà en numérique au Royaume-Uni : estimation américaine (+ 35 jours).
    8101: ["en", [["FR", 3, -20], ["US", 3, -10], ["GB", 4, -5]]],
    // Film français : ses dates (numérique en France dans 10 jours), pas sa sortie américaine.
    8102: ["fr", [["FR", 3, -20], ["FR", 4, 10], ["US", 3, 30]]],
    // Film coréen jamais sorti aux États-Unis : sa sortie numérique en Corée.
    8103: ["ko", [["KR", 3, -30], ["KR", 4, 12], ["FR", 3, 30]]],
    // Sorti en numérique aux États-Unis il y a 5 jours, sources VF : disponible.
    8104: ["en", [["FR", 3, -40], ["US", 4, -5]]],
    // Sorti en numérique aux États-Unis il y a 5 jours, aucune source (rien de publié, pas de VF) : comme sans VF.
    8105: ["en", [["US", 4, -5]]],
    // Au cinéma aux États-Unis il y a 60 jours, sans date numérique (estimation passée), sources pas lues : regardable,
    // comme l'affiche (en couleur) ; la fiche n'invente pas de date.
    8106: ["en", [["US", 3, -60]]],
  };
  const lus = { tt9104: { vf: true, sources: 18 }, tt9105: { vf: false, sources: 0 } };
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/vf.json")) return sourcesDe(lus)(u);
    const m = /\/movie\/(81\d\d)\?/.exec(u);
    if (m) {
      const [langue, dates] = films[m[1]];
      return new Response(JSON.stringify({ id: Number(m[1]), title: "Film " + m[1], imdb_id: "tt9" + m[1].slice(1), release_date: jour(-30), original_language: langue,
        release_dates: { results: dates.map(([pays, type, n]) => ({ iso_3166_1: pays, release_dates: [{ type, release_date: jour(n) + "T00:00:00.000Z" }] })) } }));
    }
    return new Response("{}");
  };
  const note = async (id) => ((await (await get(`/meta/movie/tmdb:${id}.json`)).json()).meta.description || "").split("\n")[0];
  assert.equal(await note(8101), point(`📅 Dispo vers le ${court(jour(35))}`));
  assert.equal(await note(8102), point(`📅 Dispo le ${court(jour(10))}`));
  assert.equal(await note(8103), point(`📅 Dispo le ${court(jour(12))}`));
  assert.equal(await note(8104), point(`📅 Dispo depuis le ${court(jour(-5))}`));
  assert.equal(await note(8105), point("📅 Aucune date"));
  assert.doesNotMatch(await note(8106), /Dispo|Pas encore/);
});

// « Bientôt dispo » suit la même date : un film en numérique au Royaume-Uni dans 3 jours mais aux États-Unis dans
// 60 jours (hors de la fenêtre de 45 jours) n'y est pas ; un film en numérique aux États-Unis dans 10 jours, si.
// « Dispo depuis peu » : la sortie américaine d'il y a 5 jours, pas celle d'Allemagne d'il y a 30 jours.
// L'avis VF de la photo du jour (StreamFusion, qui écarte la VFQ) prime sur Torrentio seul (même drapeau 🇫🇷 pour la VFQ
// et la VFF) : Hope, en VFQ seulement, n'est plus « Dispo depuis peu » ; sans avis de la photo, Torrentio décide.
test("dispo_depuis_peu_suit_l_avis_de_la_photo", async () => {
  const { AFFICHES_URL } = await import("../worker/reglages.js");
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const lancer = async (vfi) => {
    oublierInfos(); store.clear();
    globalThis.fetch = async (url) => {
      const u = String(url);
      calls.push(u);
      if (u.startsWith(`${AFFICHES_URL}/tendances/movie.json`)) return new Response(JSON.stringify({ ids: [], ...(vfi ? { vfi } : {}) }));
      if (u.includes("/vf.json")) return sourcesDe({ tt903: { vf: true, sources: 30 } })(u);
      if (u.includes("/discover/movie")) return new Response(JSON.stringify({ results: [{ id: 3, title: "Hope", original_language: "ko", release_date: jour(-40), popularity: 7 }], page: 1, total_pages: 1 }));
      if (/\/movie\/3\?/.test(u)) return new Response(JSON.stringify(filmVod(3, "ko", [["US", 4, jour(-5)]])));
      return new Response(JSON.stringify({ results: [] }));
    };
    return (await (await get("/catalog/movie/accueil-vod-semaine.json")).json()).metas.map((m) => m.name);
  };
  assert.deepEqual(await lancer({ tt903: 0 }), []);
  assert.deepEqual(await lancer(null), ["Hope"]);
});

// L'avis du jour (Lumio, qui lit la langue dans le fichier et écarte la VFQ) décide pour les rangées, avant Torrentio et
// la photo : By Any Means (VFQ seulement, « FRENCH » dans le nom chez Torrentio) n'est plus « Dispo depuis peu », et un
// film en VF que Torrentio ne voit pas (Verity) y entre.
test("dispo_depuis_peu_suit_l_avis_du_jour", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const lancer = async (torrentio, lumio, parSelf = false) => {
    oublierInfos(); store.clear();
    globalThis.fetch = async (url) => {
      const u = String(url);
      calls.push(u);
      if (u.startsWith("https://lumio.test/p/stream/movie/tt903.json")) return Response.json({ streams: lumio
        ? [{ name: "[AD⚡️] Lumio", description: "1080p • WEB-DL | 🇫🇷 ✓", url: "https://lumio.test/play/a" }] : [{ name: "⚙️ Lumio", description: "40 sources, mais aucune ne passe vos filtres" }] });
      if (u.includes("/vf.json")) return sourcesDe({ tt903: { vf: torrentio, sources: 30 } })(u);
      if (u.includes("/discover/movie")) return new Response(JSON.stringify({ results: [{ id: 3, title: "By Any Means", original_language: "en", release_date: jour(-40), popularity: 7 }], page: 1, total_pages: 1 }));
      if (/\/movie\/3\?/.test(u)) return new Response(JSON.stringify(filmVod(3, "en", [["US", 4, jour(-5)]])));
      return new Response(JSON.stringify({ results: [] }));
    };
    const e = { ...env, LUMIO_URL: "https://lumio.test/p/manifest.json" };
    // Comme sur Cloudflare : les lots passent par un appel de l'addon à lui-même (SELF, /avis/lot).
    if (parSelf) e.SELF = { fetch: (url, init) => worker.fetch(new Request(url, init), e, ctx) };
    return (await (await worker.fetch(new Request("https://x/catalog/movie/accueil-vod-semaine.json"), e, ctx)).json()).metas.map((m) => m.name);
  };
  assert.deepEqual(await lancer(true, false), []);
  assert.deepEqual(await lancer(false, true), ["By Any Means"]);
  assert.deepEqual(await lancer(true, false, true), []);
  assert.deepEqual(await lancer(false, true, true), ["By Any Means"]);
});

test("rangees_selon_le_calendrier_americain", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/vf.json")) return sourcesDe({})(u);
    if (u.includes("/discover/movie")) return new Response(JSON.stringify({ results: [
      { id: 1, title: "Loin aux États-Unis", original_language: "en", release_date: jour(-30), popularity: 9 },
      { id: 2, title: "Bientôt aux États-Unis", original_language: "en", release_date: jour(-30), popularity: 8 },
      { id: 3, title: "Arrivé aux États-Unis", original_language: "en", release_date: jour(-40), popularity: 7 },
    ], page: 1, total_pages: 1 }));
    const m = /\/movie\/(\d)\?/.exec(u);
    if (m && m[1] === "1") return new Response(JSON.stringify(filmVod(1, "en", [["US", 3, jour(-30)], ["GB", 4, jour(3)], ["US", 4, jour(60)]])));
    if (m && m[1] === "2") return new Response(JSON.stringify(filmVod(2, "en", [["US", 3, jour(-30)], ["US", 4, jour(10)]])));
    if (m && m[1] === "3") return new Response(JSON.stringify(filmVod(3, "en", [["DE", 4, jour(-30)], ["US", 4, jour(-5)]])));
    return new Response(JSON.stringify({ results: [] }));
  };
  const bientot = (await (await get("/catalog/movie/accueil-vod-bientot.json")).json()).metas;
  assert.deepEqual(bientot.map((m) => m.name), ["Bientôt aux États-Unis"]);
  assert.match(bientot[0].description, new RegExp(`Dispo le ${court(jour(10))}`));
  const recents = (await (await get("/catalog/movie/accueil-vod-semaine.json")).json()).metas;
  assert.deepEqual(recents.map((m) => m.name), ["Arrivé aux États-Unis"]);
});

// Le service d'affiches avec RELAIS_KEY ne lit une liste pas encore dans son cache que pour qui envoie la clé :
// l'addon l'envoie quand il a la sienne (sans elle, aucun en-tête : voir les tests ci-dessus, inchangés).
test("vf_json_avec_la_cle_du_relais", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const vus = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/vf.json")) { vus.push(new Headers((init && init.headers) || {}).get("X-Relais-Cle")); return sourcesDe({ tt9004: { vf: true, sources: 9 } })(u); }
    if (/\/movie\/8004\?/.test(u)) return new Response(JSON.stringify({ id: 8004, title: "Clé", imdb_id: "tt9004", release_date: jour(-30), original_language: "en",
      release_dates: { results: [{ iso_3166_1: "US", release_dates: [{ type: 4, release_date: jour(-8) + "T00:00:00.000Z" }] }] } }));
    return new Response("{}");
  };
  env.RELAIS_KEY = "cle-du-relais-de-test";
  try {
    await get("/meta/movie/tmdb:8004.json");
  } finally { delete env.RELAIS_KEY; }
  assert.deepEqual(vus, ["cle-du-relais-de-test"]);
});

// Habillage de saison des affiches maison : /saison.json donne la fête du jour et les films de sa rangée (3 pages,
// plus Halloween sans horreur) ; hors fête, aucun film et aucun appel à TMDB.
test("films_de_la_rangee_de_saison", async () => {
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const u = new URL(url), page = Number(u.searchParams.get("page"));
    const base = u.searchParams.get("with_genres") === "27" ? 100 : 200;
    return new Response(JSON.stringify({ results: [{ id: base + page }, { id: 1 }], page, total_pages: 5 }));
  };
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-21T12:00:00Z") });
  try {
    const res = await get("/saison.json");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("Cache-Control"), /max-age=10800/);
    const d = await res.json();
    assert.equal(d.saison, "halloween");
    assert.deepEqual(d.ids.sort((a, b) => a - b), [1, 101, 102, 103, 201, 202, 203]);
    assert.equal(calls.filter((u) => u.includes("/discover/movie")).length, 6);
  } finally { mock.timers.reset(); }
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-09-15T12:00:00Z") });
  try {
    calls.length = 0;
    assert.deepEqual(await (await get("/saison.json")).json(), { saison: null, ids: [] });
    assert.equal(calls.length, 0);
  } finally { mock.timers.reset(); }
});

// Rangée : un anime rangé en une saison par TMDB (Jujutsu Kaisen, 59 épisodes) dit son épisode avec les saisons de
// Cinemeta, comme sa fiche : « Saison 3 terminée », pas « Saison 1 ».
test("rangee_anime_saisons_de_cinemeta", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const ep = (season, n) => Array.from({ length: n }, (_, k) => ({ season, episode: k + 1, released: "2024-01-01T00:00:00.000Z" }));
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/trending/tv/day")) return new Response(JSON.stringify({ results: [{ id: 95479, name: "Jujutsu Kaisen", first_air_date: "2020-10-03" }], page: 1, total_pages: 1 }));
    if (/\/tv\/95479\?/.test(u)) return new Response(JSON.stringify({ id: 95479, name: "Jujutsu Kaisen", status: "Returning Series", genres: [{ id: 16 }],
      external_ids: { imdb_id: "tt12343534" }, seasons: [{ season_number: 1, episode_count: 59, air_date: "2020-10-03" }],
      last_episode_to_air: { season_number: 1, episode_number: 59, air_date: jour(-2) }, next_episode_to_air: null }));
    if (u.includes("/meta/series/tt12343534.json")) return new Response(JSON.stringify({ meta: { videos: [...ep(1, 24), ...ep(2, 23), ...ep(3, 12)] } }));
    return new Response("{}");
  };
  const { metas } = await (await get("/catalog/series/accueil-tendances-series.json")).json();
  const texte = JSON.stringify(metas[0]);
  assert.match(texte, /Saison 3 terminée/);
  assert.doesNotMatch(texte, /Saison 1 /);
});

// Une rangée pleine d'animes en cours de diffusion : 3 appels à Cinemeta au plus par page (50 appels sortants au plus
// par requête chez Cloudflare) ; ceux pas recomptés ne sont pas gardés et le sont à la page suivante.
test("rangee_anime_budget_cinemeta", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const ids = Array.from({ length: 12 }, (_, i) => 96000 + i);
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/trending/tv/day")) return new Response(JSON.stringify({ results: ids.map((id) => ({ id, name: `Anime ${id}`, first_air_date: "2020-01-01" })), page: 1, total_pages: 1 }));
    const m = /\/tv\/(\d+)\?/.exec(u);
    if (m) return new Response(JSON.stringify({ id: Number(m[1]), name: "Anime", status: "Returning Series", genres: [{ id: 16 }],
      external_ids: { imdb_id: `tt${m[1]}` }, seasons: [{ season_number: 1, episode_count: 30, air_date: "2020-01-01" }],
      last_episode_to_air: { season_number: 1, episode_number: 30, air_date: jour(-2) }, next_episode_to_air: null }));
    if (u.includes("/meta/series/")) return new Response(JSON.stringify({ meta: { videos: Array.from({ length: 30 }, (_, k) => ({ season: k < 15 ? 1 : 2, episode: (k % 15) + 1 })) } }));
    return new Response("{}");
  };
  await get("/catalog/series/accueil-tendances-series.json");
  assert.equal(calls.filter((u) => u.includes("/meta/series/")).length, 3);
});

// Fiche d'une série : épisodes et recherche de la bande-annonce VF partent juste après la fiche TMDB, sans attendre
// Cinemeta (avant, chacun attendait le précédent).
test("fiche_serie_lectures_en_parallele", async () => {
  oublierPauseYoutube();
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const serie = { id: 7201, name: "Série 7201", original_language: "en", first_air_date: jour(-900), number_of_seasons: 1, status: "Ended",
    external_ids: { imdb_id: "tt7201" }, seasons: [{ season_number: 1, air_date: jour(-900), episode_count: 2 }],
    videos: { results: [] }, "watch/providers": { results: {} } };
  let cinemetaFini = false;
  const avant = {};
  globalThis.fetch = async (url) => {
    const u = decodeURIComponent(String(url));
    calls.push(u);
    if (u.includes("cinemeta")) { await new Promise((ok) => setTimeout(ok, 80)); cinemetaFini = true; return new Response("{}", { status: 404 }); }
    if (/\/tv\/7201\?.*season\/1/.test(u)) {
      avant.episodes ??= !cinemetaFini;
      return new Response(JSON.stringify({ "season/1": { episodes: [{ episode_number: 1, name: "Un", air_date: jour(-900) }, { episode_number: 2, name: "Deux", air_date: jour(-893) }] } }));
    }
    if (/\/tv\/7201\?/.test(u)) return new Response(JSON.stringify(serie));
    if (u.includes("query.wikidata.org")) { avant.vf ??= !cinemetaFini; return new Response(JSON.stringify({ results: { bindings: [] } })); }
    return new Response("{}");
  };
  const m = (await (await get("/meta/series/tmdb:7201.json")).json()).meta;
  assert.deepEqual(m.videos.map((v) => v.title), ["Un", "Deux"]);
  assert.deepEqual(avant, { episodes: true, vf: true });
});

// Filtres généraux (ici l'horreur masquée et une année minimale) : la rangée garde le classement du jour et ses N°,
// moins les titres filtrés (un trou à leur place), au lieu de devenir « les plus populaires des 120 derniers jours ».
test("tendances_filtrees_gardent_le_classement", async () => {
  const { AFFICHES_URL } = await import("../worker/reglages.js");
  const serie = (id, genres, date) => ({ id, name: `Série ${id}`, genre_ids: genres, first_air_date: date, vote_average: 7 });
  const liste = [serie(1, [18], "2026-02-01"), serie(2, [10765], "2022-03-01"), serie(3, [80], "2026-01-10"), serie(4, [35], "2026-05-05")];
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u === `${AFFICHES_URL}/tendances/series.json?v=9`) return new Response(JSON.stringify({ ids: [4, 2, 3, 1] }));
    if (u.includes("/trending/tv/day")) return new Response(JSON.stringify({ results: u.includes("page=1") ? liste : [], page: 1, total_pages: 1 }));
    return new Response("{}");
  };
  // Crime masqué (la 3), séries d'avant 2025 masquées (la 2) : restent la 4 puis la 1, dans l'ordre de la photo.
  const { metas } = await (await get(`/${seg({ e: ["Crime"], a: 2025 })}/catalog/series/accueil-tendances-series.json`)).json();
  assert.deepEqual(metas.map((m) => m.id), ["tmdb:4", "tmdb:1"]);
  assert.ok(!calls.some((u) => u.includes("/discover/")), "pas de recherche à la place du classement");
});

// Logo québécois marqué « France » par erreur chez TMDB (Fast & Furious 6 : « Rapides et dangereux 6 ») : la fiche
// prend le logo anglais à la place.
test("fiche_sans_logo_quebecois_marque_france", async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (/\/movie\/82992\?/.test(u)) return new Response(JSON.stringify({ id: 82992, title: "Fast & Furious 6", release_date: "2013-05-17", original_language: "en",
      images: { logos: [{ iso_639_1: "fr", iso_3166_1: "FR", file_path: "/4wNoTeDnpnwxKNydVoq2B8MCMLI.png", vote_average: 5 },
        { iso_639_1: "en", iso_3166_1: "US", file_path: "/en.png", vote_average: 3 }] } }));
    return new Response("{}");
  };
  const m = (await (await get("/meta/movie/tmdb:82992.json")).json()).meta;
  assert.match(m.logo || "", /\/en\.png$/);
});

// « Dispo depuis peu » cherche aussi parmi les sorties en salle, comme « Bientôt dispo » : la recherche de TMDB ignore
// une sortie numérique ajoutée le jour même (Verity, en VF le 27 octobre, absente de la rangée). La date de la fiche
// décide ensuite, et l'avis VF du jour.
test("dispo_depuis_peu_cherche_aussi_les_sorties_en_salle", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  oublierInfos(); store.clear();
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.startsWith("https://lumio.test/p/stream/movie/tt903.json")) return Response.json({ streams: [{ name: "[AD⚡️] Lumio", description: "4K • WEB-DL | 🇫🇷 ✓", url: "https://lumio.test/play/a" }] });
    if (u.includes("/vf.json")) return sourcesDe({ tt903: { vf: false, sources: 19 } })(u);
    if (u.includes("/discover/movie")) {
      const salle = new URL(u).searchParams.get("with_release_type") === "3|2";
      return new Response(JSON.stringify({ results: salle ? [{ id: 3, title: "Verity", original_language: "en", release_date: jour(-25), popularity: 7 }] : [], page: 1, total_pages: 1 }));
    }
    if (/\/movie\/3\?/.test(u)) return new Response(JSON.stringify(filmVod(3, "en", [["US", 3, jour(-25)], ["US", 4, jour(0)]])));
    return new Response(JSON.stringify({ results: [] }));
  };
  const e = { ...env, LUMIO_URL: "https://lumio.test/p/manifest.json" };
  const metas = (await (await worker.fetch(new Request("https://x/catalog/movie/accueil-vod-semaine.json"), e, ctx)).json()).metas;
  assert.deepEqual(metas.map((m) => m.name), ["Verity"]);
});

// Sans date numérique connue (fiche TMDB gardée d'avant son ajout, comme Verity le 27 octobre), mais en VF d'après les
// sources et l'estimation passée : le film est chez soi, il est « Dispo depuis peu ». Sans VF confirmée par les
// sources, l'estimation seule ne suffit pas.
test("dispo_depuis_peu_estimation_passee_et_vf_confirmee", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const lancer = async (lumio) => {
    oublierInfos(); store.clear();
    globalThis.fetch = async (url) => {
      const u = String(url);
      calls.push(u);
      if (u.startsWith("https://lumio.test/p/stream/movie/tt903.json")) return Response.json({ streams: lumio
        ? [{ name: "[AD⚡️] Lumio", description: "4K • WEB-DL | 🇫🇷 ✓", url: "https://lumio.test/play/a" }] : [{ name: "⚙️ Lumio", description: "19 sources, mais aucune ne passe vos filtres" }] });
      if (u.includes("/vf.json")) return sourcesDe({})(u);
      if (u.includes("/discover/movie")) return new Response(JSON.stringify({ results: [{ id: 3, title: "Verity", original_language: "en", release_date: jour(-50), popularity: 7 }], page: 1, total_pages: 1 }));
      if (/\/movie\/3\?/.test(u)) return new Response(JSON.stringify(filmVod(3, "en", [["US", 3, jour(-50)]])));
      return new Response(JSON.stringify({ results: [] }));
    };
    const e = { ...env, LUMIO_URL: "https://lumio.test/p/manifest.json" };
    return (await (await worker.fetch(new Request("https://x/catalog/movie/accueil-vod-semaine.json"), e, ctx)).json()).metas.map((m) => m.name);
  };
  assert.deepEqual(await lancer(true), ["Verity"]);
  assert.deepEqual(await lancer(false), []);
});

// Les sorties en salle ne prennent pas la place des sorties numériques de la fenêtre : 28 candidats au plus, et des
// films encore au cinéma, plus populaires, en chassaient L'Île des Souvenirs et Tenzing (en VF, sortis cette semaine).
test("dispo_depuis_peu_sorties_numeriques_d_abord", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  oublierInfos(); store.clear();
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/vf.json")) return sourcesDe({ tt9999: { vf: true, sources: 9 } })(u);
    if (u.includes("/discover/movie")) {
      const salle = new URL(u).searchParams.get("with_release_type") === "3|2";
      const results = salle ? Array.from({ length: 30 }, (_, i) => ({ id: 100 + i, title: `Salle ${i}`, original_language: "en", release_date: jour(-30), popularity: 100 - i }))
        : [{ id: 9099, title: "Île", original_language: "en", release_date: jour(-30), popularity: 1 }];
      return new Response(JSON.stringify({ results, page: 1, total_pages: 1 }));
    }
    const m = /\/movie\/(\d+)\?/.exec(u);
    if (m && m[1] === "9099") return new Response(JSON.stringify({ ...filmVod(9099, "en", [["US", 3, jour(-30)], ["US", 4, jour(-2)]]), imdb_id: "tt9999" }));
    if (m) return new Response(JSON.stringify(filmVod(Number(m[1]), "en", [["US", 3, jour(-30)]])));
    return new Response(JSON.stringify({ results: [] }));
  };
  const noms = (await (await get("/catalog/movie/accueil-vod-semaine.json")).json()).metas.map((m) => m.name);
  assert.ok(noms.includes("Île"), noms.join(", "));
});

// Les fiches TMDB des rangées ne sont gardées par Cloudflare que 3 heures (comme en mémoire) : une sortie numérique
// ajoutée chez TMDB le jour même (Verity) entre dans « Dispo depuis peu » le jour même, pas le lendemain.
test("fiches_tmdb_des_rangees_gardees_trois_heures", async () => {
  oublierInfos(); store.clear();
  const ttl = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (/\/movie\/3\?/.test(u)) ttl.push(init && init.cf && init.cf.cacheTtl);
    if (u.includes("/discover/movie")) return new Response(JSON.stringify({ results: [{ id: 3, title: "Verity", original_language: "en", release_date: "2026-09-30", popularity: 7 }], page: 1, total_pages: 1 }));
    return new Response(JSON.stringify({ results: [] }));
  };
  await get("/catalog/movie/accueil-vod-semaine.json");
  assert.ok(ttl.length && ttl.every((s) => s === 3 * 3600), JSON.stringify(ttl));
});
