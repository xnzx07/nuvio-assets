import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker, { oublierInfos } from "../worker/index.js";
import { capQuery, correctQuery, prepareWords } from "../worker/search.js";

// Addon appelé comme par Cloudflare (cache en mémoire, TMDB simulé) : adresses piégées, erreurs, budget d'appels.
let store, calls;
beforeEach(() => {
  store = new Map();
  calls = [];
  oublierInfos();
  globalThis.caches = {
    default: {
      match: async (req) => (store.has(req.url) ? new Response(store.get(req.url)) : undefined),
      put: async (req, res) => { store.set(req.url, await res.text()); },
    },
  };
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ results: [], page: 1, total_pages: 1 }));
  };
});
const ctx = { waitUntil: () => {} };
const env = { TMDB_API_KEY: "tmdb" };
const get = (path, e = env) => worker.fetch(new Request(`https://x${path}`), e, ctx);

test("fiche_identifiant_tmdb_piege", async () => {
  for (const id of ["tmdb:1%2F..%2F..%2Ftv%2F1396", "tmdb:1%2Fvideos", "tmdb:12abc", "tt1%2F..%2F1396", "tmdb:%2F1396"]) {
    const res = await get(`/meta/movie/${id}.json`);
    assert.equal((await res.json()).meta, null, id);
  }
  // Aucune adresse TMDB autre que celle d'un titre : rien de « /tv/1396 », rien de « .. ».
  assert.ok(!calls.some((u) => /\.\.|%2E%2E|\/tv\/1396|videos/i.test(u)), calls.join("\n"));
});

test("fiche_identifiant_tmdb_valide", async () => {
  await get("/meta/series/tmdb:1396.json");
  await get("/meta/series/tmdb:1396:1:2.json");
  const lus = calls.filter((u) => u.includes("api.themoviedb.org")).map((u) => new URL(u).pathname);
  assert.ok(lus.length >= 2 && lus.every((p) => p.startsWith("/3/tv/1396")), lus.join("\n"));
});

test("adresses_mal_encodees_sans_erreur_500", async () => {
  for (const path of [
    "/catalog/movie/recherche-films/search=%C3%28.json",
    "/catalog/movie/%E0%A4%A.json",
    "/catalog/movie/accueil-top10/skip=%ZZ.json",
    "/meta/movie/tt%E0%A4%A.json",
    "/trailer/movie/%C3%28.json",
  ]) {
    const res = await get(path);
    assert.ok(res.status < 500, `${path} → ${res.status}`);
    await res.json();
  }
  const { metas } = await (await get("/catalog/movie/recherche-films/search=%C3%28.json")).json();
  assert.deepEqual(metas, []);
});

// Une mise à jour de l'addon ne vide plus les caches : leurs clés suivent CACHE_V, pas VERSION.
test("cles_de_cache_sans_la_version", async () => {
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const u = String(url);
    if (u.includes("/discover/")) return new Response(JSON.stringify({ results: [{ id: 5, name: "Série", first_air_date: "2020-01-01" }], page: 1, total_pages: 1 }));
    if (/\/movie\/5\b/.test(u)) return new Response(JSON.stringify({ id: 5, title: "Film", imdb_id: "tt0000005" }));
    return new Response(JSON.stringify({ results: [] }));
  };
  await get("/catalog/series/accueil-series-a-devorer.json");
  await get("/meta/movie/tmdb:5.json");
  const version = /const VERSION = "([\d.]+)"/.exec(await import("node:fs").then((fs) => fs.readFileSync(new URL("../worker/index.js", import.meta.url), "utf8")))[1];
  const cles = [...store.keys()].filter((k) => /\/(catalog|meta)\//.test(k));
  assert.ok(cles.some((k) => k.includes("/catalog/")) && cles.some((k) => k.includes("/meta/")), cles.join("\n"));
  for (const k of cles) assert.ok(!k.includes(version), k);
});

// Recherches : gardées sous la version de l'addon (une mise en ligne qui corrige la recherche se voit tout de suite),
// et une minute seulement dans Nuvio (cache disque de Nuvio TV, qui suit max-age) : « bleach » resservi corrigé.
test("recherche_cle_avec_la_version_et_une_minute_dans_nuvio", async () => {
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("/search/tv")) return new Response(JSON.stringify({ results: [{ id: 5, name: "Bleach", first_air_date: "2004-10-05", vote_count: 2306, poster_path: "/b.jpg" }], total_pages: 1 }));
    return new Response(JSON.stringify({ results: [] }));
  };
  const res = await get("/catalog/series/recherche-series/search=bleach.json");
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=60");
  const version = /const VERSION = "([\d.]+)"/.exec(await import("node:fs").then((fs) => fs.readFileSync(new URL("../worker/index.js", import.meta.url), "utf8")))[1];
  assert.ok([...store.keys()].some((k) => k.includes("/catalog/series/recherche-series/") && k.includes(version)), [...store.keys()].join("\n"));
  // Relue dans le cache de Cloudflare : toujours une minute.
  assert.equal((await get("/catalog/series/recherche-series/search=bleach.json")).headers.get("Cache-Control"), "public, max-age=60");
});

// Survol d'une affiche dans l'aperçu du site (?leger=1) : l'IA relit son cache, jamais d'appel à Gemini.
test("fiche_legere_sans_appel_gemini", async () => {
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (/\/movie\/7\b/.test(String(url))) return new Response(JSON.stringify({ id: 7, title: "Film", imdb_id: "tt0000007", overview: "…" }));
    return new Response(JSON.stringify({}));
  };
  const avecCle = `/${Buffer.from(JSON.stringify({ k: "AIzaSyCleDeTest0123456789abcdefghijkl" })).toString("base64url")}`;
  await get(`${avecCle}/meta/movie/tmdb:7.json?leger=1`);
  assert.ok(!calls.some((u) => u.includes("generativelanguage")), "Gemini appelé pour une fiche légère");
  await get(`${avecCle}/meta/movie/tmdb:7.json`);
  assert.ok(calls.some((u) => u.includes("generativelanguage")), "fiche complète : Gemini pas appelé");
});

// Recherche d'un texte collé au hasard : coupée à 100 caractères, correction sur les 10 premiers mots seulement.
test("recherche_tres_longue_coupee", async () => {
  assert.equal(capQuery("dune"), "dune");
  const long = Array.from({ length: 60 }, (_, i) => `motinconnu${i}x`).join(" ");
  const cut = capQuery(long);
  assert.ok(cut.length <= 100 && long.startsWith(cut) && !cut.endsWith(" "), cut);
  const vocab = prepareWords({ inception: 50, interstellar: 40 });
  const fautes = Array.from({ length: 30 }, () => "inseption").join(" ");
  assert.deepEqual(correctQuery(fautes, vocab).split(" ").map((w) => w === "inception"), Array.from({ length: 30 }, (_, i) => i < 10));
  await get(`/catalog/movie/recherche-films/search=${encodeURIComponent(long)}.json`);
  const tmdb = calls.filter((u) => u.includes("/search/")).map((u) => new URL(u).searchParams.get("query") || "");
  assert.ok(tmdb.length && tmdb.every((q) => q.length <= 100), tmdb.join("\n"));
});

// TMDB refuse des fiches (429) : la page part quand même, mais n'est gardée que 5 minutes (pas 3 heures).
test("page_incomplete_gardee_peu_de_temps", async () => {
  const gardes = new Map();
  globalThis.caches.default.put = async (req, res) => { gardes.set(req.url, res.headers.get("Cache-Control") + (res.headers.get("X-Partiel") ? " partiel" : "")); store.set(req.url, await res.text()); };
  const refuse = new Set();
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    const p = Number(new URL(u).searchParams.get("page")) || 1;
    if (u.includes("/discover/")) return new Response(JSON.stringify({ results: Array.from({ length: 20 }, (_, i) => ({ id: p * 100 + i, name: `S${i}`, first_air_date: "2020-01-01" })), page: p, total_pages: 5 }));
    const m = /\/tv\/(\d+)\?/.exec(u);
    if (m && refuse.has(Number(m[1]))) return new Response("{}", { status: 429 });
    if (m) return new Response(JSON.stringify({ id: Number(m[1]), external_ids: { imdb_id: `tt${m[1]}` } }));
    return new Response(JSON.stringify({ results: [] }));
  };
  const page = (path) => get(path).then(async (r) => ({ cc: r.headers.get("Cache-Control"), n: (await r.json()).metas.length }));
  // 1 fiche refusée sur 20 : page normale.
  refuse.add(100);
  assert.deepEqual(await page("/catalog/series/accueil-series-a-devorer.json"), { cc: "public, max-age=3600, stale-while-revalidate=3600", n: 20 });
  assert.match([...gardes.values()][0], /max-age=10800$/);
  // 5 sur 20 : page incomplète, 5 min dans le cache Cloudflare, 1 min dans Nuvio, même relue depuis le cache.
  gardes.clear();
  [200, 201, 202, 203, 204].forEach((id) => refuse.add(id));
  assert.deepEqual(await page("/catalog/series/accueil-series-a-devorer/skip=20.json"), { cc: "public, max-age=60", n: 20 });
  assert.match([...gardes.values()][0], /max-age=300 partiel$/);
});

// « Dispo depuis peu » : 3 titres sur la page 1. Nuvio demande ensuite skip = 3 : c'est la page 2 de TMDB, pas la 1.
test("rangee_triee_apres_coup_page_suivante", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const pages = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/discover/movie")) {
      const p = Number(new URL(u).searchParams.get("page"));
      pages.push(p);
      return new Response(JSON.stringify({ results: [1, 2, 3].map((i) => ({ id: p * 10 + i, title: `F${p}-${i}`, original_language: "fr", release_date: jour(-60), popularity: 10 - i })), page: p, total_pages: 3 }));
    }
    const m = /\/movie\/(\d+)\?/.exec(u);
    if (m) return new Response(JSON.stringify({ id: Number(m[1]), original_language: "fr", release_dates: { results: [{ iso_3166_1: "FR", release_dates: [{ type: 4, release_date: jour(-3) + "T00:00:00.000Z" }] }] } }));
    return new Response(JSON.stringify({ results: [] }));
  };
  const noms = async (path) => (await (await get(path)).json()).metas.map((m) => m.name);
  assert.deepEqual(await noms("/catalog/movie/accueil-vod-semaine.json"), ["F1-1", "F1-2", "F1-3"]);
  assert.deepEqual(await noms("/catalog/movie/accueil-vod-semaine/skip=3.json"), ["F2-1", "F2-2", "F2-3"]);
  // Deux recherches par page (sorties numériques, sorties en salle) : toujours la même page TMDB.
  assert.deepEqual([...new Set(pages)], [1, 2]);
});

// ---------- budget d'appels (50 par requête chez Cloudflare) ----------
// TMDB simulé : des pages pleines, 15 films sur 20 sortis il y a 10 jours au cinéma (pas encore regardables : les
// Tendances en examinent le plus possible), chaque appel sortant et chaque accès au cache comptés.
function compteur() {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const n = { sortants: 0, cache: 0, self: [] };
  const match = globalThis.caches.default.match, put = globalThis.caches.default.put;
  globalThis.caches.default.match = (...a) => { n.cache++; return match(...a); };
  globalThis.caches.default.put = (...a) => { n.cache++; return put(...a); };
  globalThis.fetch = async (url) => {
    n.sortants++;
    const u = String(url), p = Number(new URL(u).searchParams.get("page")) || 1;
    // VF des sources (service d'affiches) : tous en VF, pour que les Tendances gardent leurs titres.
    if (u.includes("/vf.json")) return new Response(JSON.stringify(Object.fromEntries((new URL(u).searchParams.get("v") || "").split(",").map((v) => [v, { vf: true, sources: 5 }]))));
    if (/\/(discover|trending|movie\/upcoming)/.test(u)) {
      return new Response(JSON.stringify({ results: Array.from({ length: 20 }, (_, i) => ({ id: p * 100 + i, title: `T${p}-${i}`, name: `T${p}-${i}`,
        original_language: "en", release_date: jour(u.includes("upcoming") ? 10 : -10), first_air_date: jour(-10), popularity: 100 - i })), page: p, total_pages: 20 }));
    }
    const m = /\/(movie|tv)\/(\d+)\?/.exec(u);
    const vod = m && Number(m[2]) % 100 >= 15;
    if (m) return new Response(JSON.stringify({ id: Number(m[2]), imdb_id: `tt${m[2]}`, original_language: "en",
      release_dates: { results: [{ iso_3166_1: "US", release_dates: [{ type: vod ? 4 : 3, release_date: jour(vod ? -100 : -10) + "T00:00:00.000Z" }] }] } }));
    return new Response(JSON.stringify({ results: [] }));
  };
  return n;
}
// Liaison SELF simulée : la moitié d'une rangée mélangée, et la préparation des « pour qui » (clé Gemini du lien).
const avecSelf = (n) => ({ ...env, SELF: { fetch: async (url) => {
  n.sortants++;
  if (!String(url).includes("/catalog/")) return new Response("{}");
  n.self.push(String(url));
  return new Response(JSON.stringify({ metas: [{ id: "tmdb:1", type: "series", name: "Série d'à côté" }] }));
} } });
const cle = `/${Buffer.from(JSON.stringify({ k: "AIzaSyCleDeTest0123456789abcdefghijkl" })).toString("base64url")}`;

test("budget_rangee_melangee_moitie_par_self", async () => {
  const n = compteur();
  const { metas } = await (await get(`${cle}/catalog/movie/accueil-nouveautes-plateformes.json`, avecSelf(n))).json();
  assert.equal(n.self.length, 1);
  assert.equal(n.self[0], `https://self${cle}/catalog/movie/accueil-nouveautes-plateformes/partie=1&page=1.json`);
  assert.equal(metas.length, 21);
  assert.deepEqual(metas.slice(0, 2).map((m) => m.name), ["T1-0", "Série d'à côté"]);
  assert.ok(n.sortants + n.cache <= 37, `${n.sortants} appels sortants + ${n.cache} accès au cache`);
});

test("rangee_melangee_moitie_demandee_par_l_addon", async () => {
  compteur();
  const { metas } = await (await get("/catalog/movie/accueil-nouveautes-plateformes/partie=1&page=2.json")).json();
  assert.equal(metas.length, 20);
  assert.ok(metas.every((m) => m.type === "series" && /^T2-/.test(m.name)));
  // Autre chose qu'une moitié existante : rien.
  for (const x of ["partie=2&page=1", "partie=0&page=1", "partie=1&page=0", "partie=1&page=x"]) {
    assert.deepEqual((await (await get(`/catalog/movie/accueil-nouveautes-plateformes/${x}.json`)).json()).metas, [], x);
  }
});

test("rangee_melangee_sans_self_lue_ici", async () => {
  const n = compteur();
  const { metas } = await (await get("/catalog/movie/accueil-nouveautes-plateformes.json")).json();
  assert.equal(metas.length, 40);
  assert.equal(n.self.length, 0);
});

// Au pire 38 (appels sortants, SELF et cache comptés) : de quoi relire un lien fixe (cache, base) sous 40. Dont un pour
// la table des estimations (data/estimations-vod.json), lue au plus une fois par requête, gardée ensuite une heure.
test("budget_pire_cas_des_rangees", async () => {
  for (const path of ["/catalog/movie/accueil-top10.json", "/catalog/movie/accueil-vod-bientot.json", "/catalog/movie/accueil-vod-semaine.json",
    "/catalog/movie/films-cinema/genre=Prochainement.json", "/catalog/movie/accueil-attendus.json", "/catalog/series/accueil-series-a-devorer.json"]) {
    store.clear();
    oublierInfos();
    const n = compteur();
    const { metas } = await (await get(cle + path, avecSelf(n))).json();
    assert.ok(n.sortants + n.cache <= 38, `${path} : ${n.sortants} appels sortants + ${n.cache} accès au cache`);
    if (path.includes("top10")) assert.ok(metas.length > 0 && n.sortants >= 33, `${path} : pire cas pas atteint (${n.sortants})`);
  }
});

// Une page relue pour un autre lien (autre clé de cache) : les fiches TMDB déjà lues par cette instance ne sont ni
// redemandées ni relues, et la page est la même.
test("fiches_gardees_en_memoire", async () => {
  compteur();
  const lues = [], listes = [];
  const tmdbFetch = globalThis.fetch;
  globalThis.fetch = (url) => { (/\/tv\/\d+\?/.test(String(url)) ? lues : listes).push(String(url)); return tmdbFetch(url); };
  const a = (await (await get("/catalog/series/accueil-series-a-devorer.json")).json()).metas;
  const autreLien = `/${Buffer.from(JSON.stringify({ m: 5 })).toString("base64url")}`;
  const b = (await (await get(`${autreLien}/catalog/series/accueil-series-a-devorer.json`)).json()).metas;
  assert.equal(a.length, 20);
  assert.deepEqual(b, a);
  assert.equal(listes.filter((u) => u.includes("/discover/")).length, 2, "la 2e page n'a pas été refaite");
  assert.equal(lues.length, 20);
});

test("erreur_imprevue_reponse_propre", async () => {
  // Cache en panne : l'erreur remonte jusqu'en haut ; la réponse reste du JSON, jamais gardée, sans le détail.
  globalThis.caches = { default: { match: async () => { throw new Error("cache cassé https://x/?api_key=secret"); }, put: async () => {} } };
  const res = await get("/catalog/movie/accueil-top10.json");
  assert.equal(res.status, 500);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  const body = await res.text();
  assert.ok(!/at |secret|cassé/.test(body), body);
  assert.ok(JSON.parse(body).error);
});
