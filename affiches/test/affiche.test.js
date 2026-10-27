import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { makeHandler } from "../api/affiche.js";
import { cleReserve, EMPREINTE_DESSIN } from "../lib/reserve.js";
import { makeQualite } from "../api/qualite.js";
import { makeTendances } from "../api/tendances.js";
import { secondesAvantBascule } from "../lib/tendances.js";
import { secondesAvantMinuitParis, jourParis } from "../lib/jour.js";
import { posterContent, contentKey } from "../lib/contenu.js";
import { resetMemo as r1 } from "../lib/tmdb.js";
import { resetMemo as r2 } from "../lib/notes.js";
import { resetMemo as r3 } from "../lib/tendances.js";
import { resetMemo as r4 } from "../lib/qualite.js";
import { resetMemo as r5 } from "../lib/texte.js";
import { resetMemo as r6 } from "../lib/notes-plus.js";
import { resetMemo as r7 } from "../lib/saga.js";
import { resetMemo as r8 } from "../lib/saison.js";
import { resetMemo as r9, ESTIMATIONS_URL } from "../lib/estimations.js";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import satori from "satori";

beforeEach(() => { r1(); r2(); r3(); r4(); r5(); r6(); r7(); r8(); r9(); });

const json = (o, status = 200) => new Response(JSON.stringify(o), { status });
const film = {
  id: 693134, release_date: "2024-02-27", genres: [{ id: 878 }], vote_average: 8.1, vote_count: 6000,
  poster_path: "/fr.jpg", backdrop_path: "/bd.jpg", external_ids: { imdb_id: "tt15239678" },
  images: { posters: [{ iso_639_1: null, file_path: "/nu.jpg" }], backdrops: [], logos: [{ iso_639_1: "fr", file_path: "/logo.png" }] },
};
const JPG = await sharp({ create: { width: 500, height: 750, channels: 3, background: "#808080" } }).jpeg().toBuffer();
const PNG = await sharp({ create: { width: 300, height: 100, channels: 4, background: "#ffffff" } }).png().toBuffer();

/**
 * Faux internet : TMDB, images, notes, et le relais /qualite/ du service (https://affiches.test), qui lit
 * Torrentio. `torrentio` remplace la réponse de Torrentio.
 */
function internet({ detail = json(film), torrentio, collection, saison } = {}) {
  const calls = [];
  const lireTorrentio = async (u, opts) => { calls.push(String(u)); return torrentio ? torrentio(u, opts) : json({ streams: [{ name: "4k DV" }] }); };
  const f = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes("torrentio")) return lireTorrentio(u, opts);
    calls.push(u);
    const relais = /^https:\/\/affiches\.test\/qualite\/(movie|series)\/(.+)\.json(\?v=[23])?$/.exec(u);
    if (relais) return makeQualite({ fetchImpl: lireTorrentio })(new Request(`https://affiches.test/api/qualite?type=${relais[1]}&video=${relais[2]}`));
    const photo = /^https:\/\/affiches\.test\/tendances\/(movie|series)\.json$/.exec(u);
    if (photo) return makeTendances({ fetchImpl: f, env: { TMDB_API_KEY: "k", ADDON_URL: "https://addon.test" } })(new Request(`https://affiches.test/api/tendances?type=${photo[1]}`));
    // L'addon qui prend la photo du jour : ici, personne de classé.
    if (/^https:\/\/addon\.test\/tendances\/(movie|series)\.json$/.test(u)) return json({ ids: [] });
    if (u.includes("/find/")) return json({ movie_results: [{ id: 693134 }], tv_results: [] });
    if (u.includes("/trending/")) return json({ results: [] });
    if (u.includes("/collection/")) return collection ? collection.clone() : new Response("?", { status: 404 });
    if (u.endsWith("/saison.json")) return saison ? saison.clone() : new Response("?", { status: 404 });
    if (u.includes("api.themoviedb.org") && (u.includes("/movie/") || u.includes("/tv/"))) return detail.clone();
    if (u.includes("image.tmdb.org")) return new Response(u.endsWith(".png") ? PNG : u.includes("/texte") ? TEXTE : JPG);
    if (u.includes("imdb-ratings.bin")) return new Response(new Uint8Array(4));   // fichier des notes IMDb, vide
    return new Response("?", { status: 404 });
  };
  f.calls = calls;
  return f;
}
const env = { TMDB_API_KEY: "k" };

// Une affiche avec un titre et un générique écrits dessus (comme une affiche étrangère rangée « sans langue »).
const TEXTE = await sharp(Buffer.from(await satori(
  { type: "div", props: { style: { width: 342, height: 513, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", background: "#334", color: "#fff", fontFamily: "Inter", padding: 20 },
    children: [["LES DOSSIERS WARREN", 30], ["UN FILM DE JAMES WAN AVEC VERA FARMIGA PATRICK WILSON", 9]].map(([t, fs]) => ({ type: "div", props: { style: { display: "flex", fontSize: fs, marginTop: 6 }, children: t } })) } },
  { width: 342, height: 513, fonts: [{ name: "Inter", data: readFileSync(new URL("../fonts/Inter-SemiBold.ttf", import.meta.url)), weight: 600, style: "normal" }] },
))).jpeg().toBuffer();

test("image_sans_langue_mais_avec_texte_ecartee", async () => {
  const avecTexte = { ...film, images: { ...film.images, posters: [{ iso_639_1: null, file_path: "/texte-lt.jpg" }, { iso_639_1: null, file_path: "/nu.jpg" }] } };
  const f = internet({ detail: json(avecTexte) });
  const res = await makeHandler({ fetchImpl: f, env })(req("type=movie&shape=poster&id=tt15239678"));
  assert.equal(res.status, 200);
  assert.ok(f.calls.includes("https://image.tmdb.org/t/p/w500/nu.jpg"), f.calls.join("\n"));
  assert.ok(!f.calls.includes("https://image.tmdb.org/t/p/w500/texte-lt.jpg"));
  // Seule candidate, avec texte : l'affiche normale, sans logo ni ligne du bas.
  const seule = { ...film, images: { ...film.images, posters: [{ iso_639_1: null, file_path: "/texte-lt.jpg" }] } };
  const g = internet({ detail: json(seule) });
  await makeHandler({ fetchImpl: g, env })(req("type=movie&shape=poster&id=tt15239678"));
  assert.ok(g.calls.includes("https://image.tmdb.org/t/p/w500/fr.jpg"), g.calls.join("\n"));
  assert.ok(!g.calls.some((u) => u.includes("/logo.png")));
});

// Titre éteint : pas de logo à poser, donc rien à vérifier (aucune image analysée).
test("titre_eteint_sans_verification", async () => {
  const f = internet();
  await makeHandler({ fetchImpl: f, env })(req("type=movie&shape=poster&id=tt15239678&s=1.L0"));
  assert.ok(!f.calls.some((u) => u.includes("/w342/")), f.calls.join("\n"));
});
const req = (q, headers = {}) => new Request(`https://affiches.test/api/affiche?${q}`, { headers });

test("affiche OK", async () => {
  const GET = makeHandler({ fetchImpl: internet(), env });
  const res = await GET(req("type=movie&shape=poster&id=tt15239678"));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "image/jpeg");
  assert.match(res.headers.get("ETag"), /^"[0-9a-f]{40}"$/);
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=604800");
  // 7 jours au CDN : chaque affiche vue est redessinée au plus une fois par semaine (limite de calcul gratuite) ;
  // service en panne : l'ancienne resservie un jour de plus.
  assert.equal(res.headers.get("Vercel-CDN-Cache-Control"), "max-age=604800, stale-while-revalidate=604800, stale-if-error=86400");
  assert.equal((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width, 400);
});

test("If-None-Match : 304 sans dessiner", async () => {
  const etag = (await makeHandler({ fetchImpl: internet(), env })(req("type=movie&shape=poster&id=tt15239678"))).headers.get("ETag");
  const f = internet();
  const res = await makeHandler({ fetchImpl: f, env })(req("type=movie&shape=poster&id=tt15239678", { "If-None-Match": etag }));
  assert.equal(res.status, 304);
  assert.equal(res.headers.get("ETag"), etag);
  assert.equal(await res.text(), "");
  assert.ok(!f.calls.some((u) => u.includes("image.tmdb.org")), "le JPEG a été dessiné");
});

test("refusés sans appel TMDB", async () => {
  for (const q of ["type=movie&shape=square&id=tt1", "type=movie&shape=poster&id=kitsu:7442", "type=movie&shape=poster&id=tt12abc", "type=anime&shape=poster&id=tt1"]) {
    const f = internet();
    const res = await makeHandler({ fetchImpl: f, env })(req(q));
    assert.equal(res.status, 404, q);
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=3600");
    assert.equal(res.headers.get("Vercel-CDN-Cache-Control"), "max-age=3600");
    assert.equal(f.calls.length, 0, q);
  }
});

// Trop de dessins sur l'instance (liens au hasard) : une erreur passagère (503, jamais gardée, Retry-After 10 min),
// sans analyser ni dessiner d'image ; l'appli montre l'affiche d'origine. Jamais une redirection vers TMDB : Nuvio la
// garderait un an sous l'adresse de l'affiche (en-têtes de TMDB). Le compte ne porte que sur les dessins.
test("disjoncteur : erreur passagère au-delà de la limite", async () => {
  const GET = makeHandler({ fetchImpl: internet(), env: { ...env, RENDUS_MINUTE: "2" } });
  for (let i = 0; i < 2; i++) assert.equal((await GET(req("type=movie&shape=poster&id=tt15239678"))).status, 200, `dessin ${i}`);
  const f = internet();
  const autre = makeHandler({ fetchImpl: f, env: { ...env, RENDUS_MINUTE: "2" } });
  assert.equal((await autre(req("type=movie&shape=poster&id=tt15239678"))).status, 200, "chaque service a son compteur");
  const res = await GET(req("type=movie&shape=poster&id=tt15239678"));
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("Location"), null);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(res.headers.get("Retry-After"), "600");
  const g = internet();
  const sansDessin = makeHandler({ fetchImpl: g, env: { ...env, RENDUS_MINUTE: "1" } });
  await sansDessin(req("type=movie&shape=poster&id=tt15239678"));
  g.calls.length = 0;
  assert.equal((await sansDessin(req("type=movie&shape=landscape&id=tt15239678"))).status, 503);
  assert.ok(!g.calls.some((u) => u.includes("image.tmdb.org")), g.calls.join("\n"));
});

test("inconnu de TMDB : 404", async () => {
  const res = await makeHandler({ fetchImpl: internet({ detail: json({}, 404) }), env })(req("type=movie&shape=poster&id=tmdb:5"));
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=3600");
});

test("TMDB en panne : 502 sans cache", async () => {
  const res = await makeHandler({ fetchImpl: internet({ detail: json({}, 500) }), env })(req("type=movie&shape=poster&id=tmdb:5"));
  assert.equal(res.status, 502);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
});

test("Torrentio en panne : affiche sans badge qualité, à temps", async () => {
  const jamais = (u, opts) => new Promise((_, reject) => opts.signal.addEventListener("abort", () => reject(opts.signal.reason)));
  const t0 = Date.now();
  const res = await makeHandler({ fetchImpl: internet({ torrentio: jamais }), env })(req("type=movie&shape=poster&id=tt15239678"));
  assert.equal(res.status, 200);
  assert.ok(Date.now() - t0 < 3000, `trop long : ${Date.now() - t0} ms`);
  const facts = { tmdbId: 693134, type: "movie", imdbId: "tt15239678", genreIds: [878], year: "2024", vote: { average: 8.1, count: 6000 },
    poster: "/fr.jpg", textlessPoster: "/nu.jpg", backdrop: "/bd.jpg", textlessBackdrop: null, logo: "/logo.png", lastSeason: null,
    releases: [], releaseDate: "2024-02-27", firstAir: "", seasons: [] };
  const attendu = contentKey(posterContent(facts, { imdbRating: undefined, rank: null, quality: null }, "poster"));
  assert.equal(res.headers.get("ETag"), `"${attendu}"`);
});

const lent = (ms, corps) => () => new Promise((ok) => setTimeout(() => ok(json(corps)), ms));

test("Torrentio lent : pas plus d'1 s d'attente, cache court", async () => {
  const t0 = Date.now();
  const res = await makeHandler({ fetchImpl: internet({ torrentio: lent(2000, { streams: [{ name: "4k" }] }) }), env })(req("type=movie&shape=poster&id=tt15239678"));
  assert.equal(res.status, 200);
  assert.ok(Date.now() - t0 < 1500, `trop long : ${Date.now() - t0} ms`);
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=3600");
  // Redessinée 10 min plus tard ; l'ancienne servie pendant qu'on la redessine.
  assert.equal(res.headers.get("Vercel-CDN-Cache-Control"), "max-age=600, stale-while-revalidate=3600");
});

// Aperçu de la régie (en-tête X-Apercu) : Torrentio attendu jusqu'à 4 s, l'affiche part complète avec son badge ;
// sans l'en-tête (une carte de Nuvio), 1 s au plus et « retard ». L'état est dit dans X-Affiche-Etat.
test("apercu_de_la_regie_attend_la_qualite", async () => {
  const fetchImpl = internet({ torrentio: lent(2000, { streams: [{ name: "4k" }] }) });
  const r = req("type=movie&shape=poster&id=tt15239678");
  const apercu = await makeHandler({ fetchImpl, env })(new Request(r.url, { headers: { "X-Apercu": "1" } }));
  assert.equal(apercu.status, 200);
  assert.equal(apercu.headers.get("X-Affiche-Etat"), "complete");
  assert.equal(apercu.headers.get("Cache-Control"), "public, max-age=604800");
  assert.match(apercu.headers.get("Access-Control-Expose-Headers") || "", /X-Affiche-Etat/);
});
test("carte_de_nuvio_en_retard_le_dit", async () => {
  const res = await makeHandler({ fetchImpl: internet({ torrentio: lent(2000, { streams: [{ name: "4k" }] }) }), env })(req("type=movie&shape=poster&id=tt15239678"));
  assert.equal(res.headers.get("X-Affiche-Etat"), "retard");
});

// En échec (et pas seulement en retard) : cache normal sans badge. Le relais garde l'échec 30 min ; un cache court
// ferait redessiner chaque affiche toutes les 10 minutes pendant toute la panne.
test("Torrentio en échec : cache normal sans badge", async () => {
  const refus = async () => new Response("interdit", { status: 403 });
  const res = await makeHandler({ fetchImpl: internet({ torrentio: refus }), env })(req("type=movie&shape=poster&id=tt15239678"));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=604800");
  assert.equal(res.headers.get("Vercel-CDN-Cache-Control"), "max-age=604800, stale-while-revalidate=604800, stale-if-error=86400");
  // Relais injoignable (erreur, réponse vite) : pareil.
  const base = internet();
  const muet = async (url, opts) => (String(url).includes("/qualite/") ? new Response("", { status: 500 }) : base(url, opts));
  const res2 = await makeHandler({ fetchImpl: muet, env })(req("type=movie&shape=poster&id=tt15239678"));
  assert.equal(res2.headers.get("Cache-Control"), "public, max-age=604800");
});

// Une donnée qui manque pour une panne passagère n'est jamais gardée des jours : cache court, puis l'affiche complète.
const court = (res) => res.headers.get("Vercel-CDN-Cache-Control") === "max-age=600, stale-while-revalidate=3600";
const avecPanne = (motif, reponse) => { const base = internet(); return async (url, opts) => (String(url).includes(motif) ? reponse(url, opts) : base(url, opts)); };

test("fichier des notes IMDb illisible : note TMDB, cache court", async () => {
  const res = await makeHandler({ fetchImpl: avecPanne("imdb-ratings.bin", () => new Response("", { status: 503 })), env })(req("type=movie&shape=poster&id=tt15239678&s=1.T0Q0"));
  assert.equal(res.status, 200);
  assert.ok(court(res), res.headers.get("Vercel-CDN-Cache-Control"));
});

// Instance qui démarre : le fichier des notes (8 s au pire) n'est pas attendu plus d'1,5 s ; la lecture continue.
test("fichier des notes IMDb lent : pas attendu, cache court", async () => {
  const t0 = Date.now();
  const lent = () => new Promise((ok) => setTimeout(() => ok(new Response(new Uint8Array(4))), 2500));
  const res = await makeHandler({ fetchImpl: avecPanne("imdb-ratings.bin", lent), env })(req("type=movie&shape=poster&id=tt15239678&s=1.T0Q0"));
  assert.equal(res.status, 200);
  assert.ok(Date.now() - t0 < 2300, `trop long : ${Date.now() - t0} ms`);
  assert.ok(court(res), res.headers.get("Vercel-CDN-Cache-Control"));
});

test("photo des tendances illisible : sans N°, cache court", async () => {
  const res = await makeHandler({ fetchImpl: avecPanne("/tendances/", () => new Response("", { status: 503 })), env })(req("type=movie&shape=poster&id=tt15239678&s=1.Q0"));
  assert.equal(res.status, 200);
  assert.ok(court(res), res.headers.get("Vercel-CDN-Cache-Control"));
});

test("image sans texte pas vérifiée (réseau) : cache court", async () => {
  // Seule candidate pas vérifiée : l'affiche d'origine (rien d'autre à poser ici), mais pas pour une semaine.
  const res = await makeHandler({ fetchImpl: avecPanne("/w342/", () => Promise.reject(new Error("réseau"))), env })(req("type=movie&shape=poster&id=tt15239678&s=1.Q0"));
  assert.equal(res.status, 302);
  assert.ok(court(res), res.headers.get("Vercel-CDN-Cache-Control"));
  // Le réseau revenu, la même instance vérifie l'image (l'échec n'a pas été gardé) et dessine l'affiche avec son logo.
  const ok = await makeHandler({ fetchImpl: internet(), env })(req("type=movie&shape=poster&id=tt15239678&s=1.Q0"));
  assert.equal(ok.status, 200);
});

test("images téléchargées pendant qu'on attend Torrentio", async () => {
  let torrentioFini = null, premiereImage = null;
  const base = internet();
  const f = async (url, opts) => {
    const u = String(url);
    if (u.includes("/qualite/")) { await new Promise((ok) => setTimeout(ok, 400)); torrentioFini = Date.now(); return json({ uhd: false, extra: null }); }
    if (u.includes("image.tmdb.org") && !premiereImage) premiereImage = Date.now();
    return base(url, opts);
  };
  const res = await makeHandler({ fetchImpl: f, env })(req("type=movie&shape=poster&id=tt15239678"));
  assert.equal(res.status, 200);
  assert.ok(premiereImage && premiereImage < torrentioFini, "les images attendent Torrentio");
});

test("notes et tendances demandées en même temps que TMDB", async () => {
  const f = internet();
  await makeHandler({ fetchImpl: f, env })(req("type=movie&shape=poster&id=tt15239678"));
  const ordre = (motif) => f.calls.findIndex((u) => u.includes(motif));
  assert.ok(ordre("imdb-ratings.bin") < ordre("/3/movie/"), f.calls.join("\n"));
  assert.ok(ordre("/tendances/") < ordre("/3/movie/"), f.calls.join("\n"));
});

test("qualité désactivée : Torrentio jamais appelé", async () => {
  const f = internet();
  const res = await makeHandler({ fetchImpl: f, env: { ...env, QUALITE: "off" } })(req("type=movie&shape=poster&id=tt15239678"));
  assert.equal(res.status, 200);
  assert.ok(!f.calls.some((u) => u.includes("torrentio")));
});

test("imdb en paramètre pour un id tmdb", async () => {
  const sansImdb = { ...film, external_ids: {} };
  const f = internet({ detail: json(sansImdb) });
  await makeHandler({ fetchImpl: f, env })(req("type=series&shape=poster&id=tmdb:94605&imdb=tt11126994"));
  assert.ok(f.calls.some((u) => u.includes("torrentio") && u.includes("tt11126994")));
});

test("options : appels évités", async () => {
  const f = internet();
  const res = await makeHandler({ fetchImpl: f, env })(req("type=movie&shape=poster&id=tt15239678&s=1.T0Q0N0"));
  assert.equal(res.status, 200);
  assert.ok(!f.calls.some((u) => u.includes("torrentio")), "Torrentio appelé");
  assert.ok(!f.calls.some((u) => u.includes("/trending/") || u.includes("/tendances/")), "tendances appelées");
  assert.ok(!f.calls.some((u) => u.includes("imdb-ratings.bin")), "notes IMDb lues");
});

test("options : note TMDB sans lire les notes IMDb", async () => {
  const f = internet();
  await makeHandler({ fetchImpl: f, env })(req("type=movie&shape=poster&id=tt15239678&s=1.nt"));
  assert.ok(!f.calls.some((u) => u.includes("imdb-ratings.bin")));
});

test("qualité demandée au relais du service, pas à Torrentio directement", async () => {
  const f = internet();
  await makeHandler({ fetchImpl: f, env })(req("type=movie&shape=poster&id=tt15239678"));
  assert.ok(f.calls.includes("https://affiches.test/qualite/movie/tt15239678.json?v=3"), f.calls.join("\n"));
});

// Rien à dessiner (pas de titre maison, ni rang ni qualité) : l'image d'origine de TMDB, sans la redessiner.
test("rien à dessiner : redirection vers l'image TMDB", async () => {
  const f = internet();
  const res = await makeHandler({ fetchImpl: f, env })(req("type=movie&shape=poster&id=tt15239678&s=1.S0T0Q0L0B0"));
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("Location"), "https://image.tmdb.org/t/p/w500/fr.jpg");
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=604800");
  assert.ok(!f.calls.some((u) => u.includes("image.tmdb.org")), "image téléchargée pour rien");
  const pays = await makeHandler({ fetchImpl: internet(), env })(req("type=movie&shape=landscape&id=tt15239678&s=1.S0T0Q0L0B0"));
  assert.equal(pays.headers.get("Location"), "https://image.tmdb.org/t/p/w780/bd.jpg");
});

// Une affiche classée garde son « N° » à jour : elle expire au changement de photo des tendances (appli et CDN),
// comme une affiche presque classée (21e à 60e), qui prendra son N° le jour où elle entre dans le top 20.
const photoAvec = (place) => Array.from({ length: 60 }, (_, i) => (i === place - 1 ? 693134 : 1 + i));
const age = (res, h) => Number(/max-age=(\d+)/.exec(res.headers.get(h))[1]);
test("affiche classée : cache jusqu'au changement de photo", async () => {
  for (const place of [1, 30]) {
    r3();
    const base = internet();
    const f = async (url, opts) => (String(url).includes("/tendances/") ? json({ ids: photoAvec(place) }) : base(url, opts));
    const res = await makeHandler({ fetchImpl: f, env })(req("type=movie&shape=poster&id=tt15239678&s=1.Q0"));
    assert.equal(res.status, 200);
    const s = secondesAvantBascule();
    assert.ok(Math.abs(age(res, "Cache-Control") - s) <= 2, res.headers.get("Cache-Control"));
    assert.ok(Math.abs(age(res, "Vercel-CDN-Cache-Control") - s) <= 2, res.headers.get("Vercel-CDN-Cache-Control"));
    // Après le changement, la première demande reçoit encore l'ancienne pendant qu'on la redessine.
    assert.match(res.headers.get("Vercel-CDN-Cache-Control"), /, stale-while-revalidate=3600, stale-if-error=86400$/);
  }
});

// Presque classée et sans rien d'autre à poser : redirigée vers l'image TMDB, mais seulement jusqu'au changement.
test("presque classée sans rien à poser : redirection courte", async () => {
  const base = internet();
  const f = async (url, opts) => (String(url).includes("/tendances/") ? json({ ids: photoAvec(30) }) : base(url, opts));
  const res = await makeHandler({ fetchImpl: f, env })(req("type=movie&shape=poster&id=tt15239678&s=1.S0Q0L0B0"));
  assert.equal(res.status, 302);
  assert.ok(age(res, "Cache-Control") <= secondesAvantBascule());
  assert.ok(age(res, "Vercel-CDN-Cache-Control") <= secondesAvantBascule());
});

// Le titre ne doit jamais manquer : logo introuvable sur une image sans texte → une erreur passagère (503, Retry-After
// une heure), l'appli montre l'affiche d'origine (avec son titre), jamais une affiche sans nom. Pas de redirection
// vers TMDB : Nuvio la garderait un an.
test("logo introuvable : erreur passagère, l'affiche d'origine dans l'appli", async () => {
  const base = internet();
  const f = async (url, opts) => (String(url).endsWith("/logo.png") ? new Response("non", { status: 404 }) : base(url, opts));
  const res = await makeHandler({ fetchImpl: f, env })(req("type=movie&shape=poster&id=tt15239678"));
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(res.headers.get("Retry-After"), "3600");
  const avecFond = internet({ detail: json({ ...film, images: { ...film.images, backdrops: [{ iso_639_1: null, file_path: "/bdnu.jpg" }] } }) });
  const g = async (url, opts) => (String(url).endsWith("/logo.png") ? new Response("non", { status: 404 }) : avecFond(url, opts));
  const pays = await makeHandler({ fetchImpl: g, env })(req("type=movie&shape=landscape&id=tt15239678"));
  assert.equal(pays.status, 503);
  assert.equal(pays.headers.get("Location"), null);
});

// Lien bricolé (paramètre en trop, lettres dans le désordre ou inconnues, imdb qui contredit l'id) : redirigé
// vers sa forme normale sans rien dessiner, pour qu'il ne crée pas une copie de plus dans le cache.
test("lien non canonique : redirection sans appel", async () => {
  const cas = [
    ["type=movie&shape=poster&id=tt15239678&x=1", "/movie/poster/tt15239678.jpg"],
    // Anciens liens (o, r) : convertis dans le format de la régie.
    ["type=movie&shape=poster&id=tt15239678&imdb=tt15239678&o=qt", "/movie/poster/tt15239678.jpg?imdb=tt15239678&s=1.T0Q0"],
    ["type=movie&shape=poster&id=tt15239678&o=zq", "/movie/poster/tt15239678.jpg?s=1.Q0"],
    ["type=movie&shape=poster&id=tt15239678&r=imdb", "/movie/poster/tt15239678.jpg"],
    ["type=movie&shape=poster&id=tt15239678&o=n&r=tmdb", "/movie/poster/tt15239678.jpg?s=1.N0"],
    ["type=movie&shape=poster&id=tt15239678&imdb=tt999", "/movie/poster/tt15239678.jpg?imdb=tt15239678"],
    ["type=series&shape=landscape&id=tmdb:94605&imdb=abc", "/series/landscape/tmdb:94605.jpg"],
    // Format de la régie : codes remis dans l'ordre, sous-réglages d'une voie éteinte retirés.
    ["type=movie&shape=poster&id=tt15239678&s=1.Q0T0", "/movie/poster/tt15239678.jpg?s=1.T0Q0"],
    ["type=movie&shape=poster&id=tt15239678&s=1.N0nt", "/movie/poster/tt15239678.jpg?s=1.N0"],
    ["type=movie&shape=poster&id=tt15239678&s=", "/movie/poster/tt15239678.jpg"],
  ];
  for (const [q, cible] of cas) {
    const f = internet();
    const res = await makeHandler({ fetchImpl: f, env })(req(q));
    assert.equal(res.status, 308, q);
    // Gardée 7 jours : la forme normale ne change qu'avec une mise en ligne (qui vide le cache).
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=604800", q);
    assert.equal(res.headers.get("Vercel-CDN-Cache-Control"), "max-age=604800", q);
    const loc = new URL(res.headers.get("Location"), "https://affiches.test");
    assert.equal(decodeURIComponent(loc.pathname) + loc.search, cible, q);
    assert.equal(f.calls.length, 0, q);
  }
});

test("liens normaux : pas de redirection", async () => {
  for (const q of ["type=movie&shape=poster&id=tt15239678&imdb=tt15239678", "type=movie&shape=poster&id=tt15239678&imdb=",
    "type=series&shape=poster&id=tmdb:94605&imdb=tt11126994&s=1.T0Q0nt", "type=movie&shape=landscape&id=tt15239678"]) {
    const res = await makeHandler({ fetchImpl: internet(), env })(req(q));
    assert.notEqual(res.status, 308, q);
  }
});

test("ancien_lien_redirige_puis_servi", async () => {
  const res = await makeHandler({ fetchImpl: internet(), env })(req("type=movie&shape=poster&id=tt15239678&imdb=tt15239678&o=tga&r=tmdb"));
  assert.equal(res.status, 308);
  const loc = new URL(res.headers.get("Location"), "https://affiches.test");
  assert.equal(loc.search, "?imdb=tt15239678&s=1.T0ntG0A0");
  const suite = await makeHandler({ fetchImpl: internet(), env })(req("type=movie&shape=poster&id=tt15239678&imdb=tt15239678&s=1.T0ntG0A0"));
  assert.equal(suite.status, 200);
});

const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const avecSorties = (...dates) => json({ ...film, release_dates: { results: [{ iso_3166_1: "FR", release_dates: dates.map(([type, d]) => ({ type, release_date: d })) }] } });

// Jours comptés depuis aujourd'hui à Paris (le jour des statuts), pas en UTC : le soir, les deux diffèrent.
const jourParisDans = (n) => new Date(Date.parse(jourParis()) + n * 86400000).toISOString().slice(0, 10);

test("statut_cache_court", async () => {
  // Avec un statut (« Nouveau », une date…) : jusqu'au changement quotidien de la photo des tendances, dans l'appli
  // comme au CDN. « NOUVEAU » depuis 5 jours le sera encore demain : pas besoin de le redessiner à minuit.
  const res = await makeHandler({ fetchImpl: internet({ detail: avecSorties([4, jourParisDans(-5)]) }), env })(req("type=movie&shape=poster&id=tt15239678"));
  assert.equal(res.status, 200);
  const s = secondesAvantBascule();
  assert.ok(Math.abs(age(res, "Cache-Control") - s) <= 2, res.headers.get("Cache-Control"));
  assert.ok(Math.abs(age(res, "Vercel-CDN-Cache-Control") - s) <= 2);
});

test("statut_qui_change_demain_expire_a_minuit", async () => {
  // Dispo demain : sa date sur l'affiche aujourd'hui, plus demain. L'affiche expire à minuit à Paris (ou au
  // changement de photo s'il vient avant). Dispo après-demain : rien ne change demain, seulement la photo.
  const res = await makeHandler({ fetchImpl: internet({ detail: avecSorties([4, jourParisDans(1)]) }), env })(req("type=movie&shape=poster&id=tt15239678"));
  assert.equal(res.status, 200);
  const s = Math.min(secondesAvantBascule(), secondesAvantMinuitParis());
  assert.ok(Math.abs(age(res, "Cache-Control") - s) <= 2, res.headers.get("Cache-Control"));
  assert.ok(Math.abs(age(res, "Vercel-CDN-Cache-Control") - s) <= 2);
  const plusTard = await makeHandler({ fetchImpl: internet({ detail: avecSorties([4, jourParisDans(3)]) }), env })(req("type=movie&shape=poster&id=tt15239678"));
  assert.ok(Math.abs(age(plusTard, "Cache-Control") - secondesAvantBascule()) <= 2, plusTard.headers.get("Cache-Control"));
});

// Pas encore sorti : dessiné en gris, jamais redirigé vers l'image TMDB en couleur.
test("bientot_jamais_redirige", async () => {
  const sansRien = await makeHandler({ fetchImpl: internet({ detail: avecSorties([3, jour(40)]) }), env })(req("type=movie&shape=poster&id=tt15239678&s=1.S0T0Q0L0"));
  assert.equal(sansRien.status, 200);
  assert.equal(sansRien.headers.get("Content-Type"), "image/jpeg");
});

test("voies_eteintes_sans_appel", async () => {
  const f = internet();
  await makeHandler({ fetchImpl: f, env })(req("type=movie&shape=poster&id=tt15239678&s=1.T0Q0"));
  assert.ok(!f.calls.some((u) => u.includes("/trending/") || u.includes("/tendances/") || u.includes("/qualite/")), f.calls.join("\n"));
});

// ---------- Régie v2 ----------
test("v2_paysage_a_part_canonique", async () => {
  const GET = makeHandler({ fetchImpl: internet(), env });
  // sp identique à s : retiré.
  const meme = await GET(req("type=movie&shape=poster&id=tt15239678&s=1.T0&sp=1.T0"));
  assert.equal(meme.status, 308);
  assert.equal(meme.headers.get("Location"), "/movie/poster/tt15239678.jpg?s=1.T0");
  // sp différent : gardé, dans sa forme canonique.
  const autre = await GET(req("type=movie&shape=poster&id=tt15239678&s=1.T0&sp=1.Q0T0"));
  assert.equal(autre.status, 308);
  assert.equal(autre.headers.get("Location"), "/movie/poster/tt15239678.jpg?s=1.T0&sp=1.T0Q0");
  assert.equal((await GET(req("type=movie&shape=poster&id=tt15239678&s=1.T0&sp=1.T0Q0"))).status, 200);
});

test("v2_paysage_lit_sp", async () => {
  const avecFond = json({ ...film, images: { ...film.images, backdrops: [{ iso_639_1: null, file_path: "/bdnu.jpg" }] } });
  const f = internet({ detail: avecFond });
  // Portrait sans titre, paysage avec : seul le paysage télécharge le logo.
  await makeHandler({ fetchImpl: f, env })(req("type=movie&shape=landscape&id=tt15239678&s=1.L0&sp=1.T0"));
  assert.ok(f.calls.some((u) => u.includes("/logo.png")), f.calls.join("\n"));
  const g = internet({ detail: avecFond });
  await makeHandler({ fetchImpl: g, env })(req("type=movie&shape=poster&id=tt15239678&s=1.L0&sp=1.T0"));
  assert.ok(!g.calls.some((u) => u.includes("/logo.png")));
});

test("v2_notes_seulement_si_demandees", async () => {
  const f = internet();
  await makeHandler({ fetchImpl: f, env })(req("type=movie&shape=poster&id=tt15239678"));
  assert.ok(!f.calls.some((u) => u.includes("/notes/")));
  const g = internet();
  const base = g;
  const avecNotes = async (url, opts) => (String(url).includes("/notes/") ? (base.calls.push(String(url)), json({ rt: 94, mc: null, lb: null })) : base(url, opts));
  avecNotes.calls = base.calls;
  const res = await makeHandler({ fetchImpl: avecNotes, env })(req("type=movie&shape=poster&id=tt15239678&s=1.R1"));
  assert.equal(res.status, 200);
  assert.ok(base.calls.includes("https://affiches.test/notes/tt15239678.json"), base.calls.join("\n"));
});

// Notes des autres sites en échec (MDBList en panne ou quota épuisé : le relais le garde une heure) : l'affiche part
// sans elles, avec le cache normal (pas redessinée toutes les 10 minutes pendant la panne).
test("v2_notes_en_echec_cache_normal", async () => {
  for (const reponse of [() => json({ erreur: true }), () => new Response("", { status: 503 })]) {
    r6();
    const base = internet();
    const f = async (url, opts) => (String(url).includes("/notes/") ? reponse() : base(url, opts));
    const res = await makeHandler({ fetchImpl: f, env })(req("type=movie&shape=poster&id=tt15239678&s=1.Q0R1"));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=604800");
  }
});

test("v2_image_du_film_recadree_verifiee", async () => {
  const film2 = { ...film, images: { ...film.images, backdrops: [{ iso_639_1: null, file_path: "/texte-bd.jpg" }, { iso_639_1: null, file_path: "/bdnu.jpg" }] } };
  const f = internet({ detail: json(film2) });
  await makeHandler({ fetchImpl: f, env })(req("type=movie&shape=poster&id=tt15239678&s=1.Uf"));
  assert.ok(f.calls.includes("https://image.tmdb.org/t/p/w1280/bdnu.jpg"), f.calls.join("\n"));
});

test("v2_plateforme_en_coin_seule_pas_redirigee", async () => {
  // Rien d'autre que la plateforme en coin : l'affiche est dessinée, pas renvoyée vers TMDB.
  const film3 = { ...film, "watch/providers": { results: { FR: { flatrate: [{ display_priority: 1, provider_name: "Netflix", logo_path: "/n.png" }] } } } };
  const res = await makeHandler({ fetchImpl: internet({ detail: json(film3) }), env })(req("type=movie&shape=poster&id=tt15239678&s=1.S0T0Q0L0P1vcB0"));
  assert.equal(res.status, 200);
});

// Revue : un bandeau qui porte le statut (une date) expire au changement quotidien, comme le statut lui-même.
test("revue_bandeau_statut_cache_court", async () => {
  const res = await makeHandler({ fetchImpl: internet({ detail: avecSorties([4, jour(-5)]) }), env })(req("type=movie&shape=poster&id=tt15239678&s=1.J1"));
  assert.equal(res.status, 200);
  assert.ok(age(res, "Cache-Control") <= secondesAvantBascule() + 2, res.headers.get("Cache-Control"));   // deux lectures de l'heure, à une seconde près
});

// Revue : les autres notes ne sont pas demandées quand elles ne seraient pas dessinées (note en grand chiffre,
// ou titre pas encore sorti avec la note cachée) ; la plateforme fait demander les plateformes à TMDB (un film les
// demande toujours, pour la VF : test faits « plateforme_en_france »).
test("revue_notes_et_plateformes_seulement_si_utiles", async () => {
  const grand = internet();
  await makeHandler({ fetchImpl: grand, env })(req("type=movie&shape=poster&id=tt15239678&s=1.egR1"));
  assert.ok(!grand.calls.some((u) => u.includes("/notes/")), "notes demandées en grand chiffre");
  const pasSorti = internet({ detail: avecSorties([3, jour(40)]) });
  await makeHandler({ fetchImpl: pasSorti, env })(req("type=movie&shape=poster&id=tt15239678&s=1.R1"));
  assert.ok(!pasSorti.calls.some((u) => u.includes("/notes/")), "notes demandées pour un titre pas sorti");
  const plat = internet();
  await makeHandler({ fetchImpl: plat, env })(req("type=movie&shape=poster&id=tt15239678&s=1.P1"));
  assert.ok(plat.calls.some((u) => u.includes("watch%2Fproviders") || u.includes("watch/providers")), plat.calls.join("\n"));
});

// Revue : bandeau seul (le statut dans le coin, rien d'autre) : dessiné, pas renvoyé vers TMDB.
test("revue_bandeau_seul_pas_redirige", async () => {
  const res = await makeHandler({ fetchImpl: internet({ detail: avecSorties([4, jour(-5)]) }), env })(req("type=movie&shape=poster&id=tt15239678&s=1.T0Q0J1L0B0"));
  assert.equal(res.status, 200);
});

// ---------- Régie v3 ----------
test("v3_service", async () => {
  // Réalisateur : le générique est demandé à TMDB (seulement dans ce cas).
  const real = internet();
  await makeHandler({ fetchImpl: real, env })(req("type=movie&shape=poster&id=tt15239678&s=1.3ar"));
  assert.ok(real.calls.some((u) => /append_to_response=[^&]*credits/.test(u)), real.calls.join("\n"));
  const sans = internet();
  await makeHandler({ fetchImpl: sans, env })(req("type=movie&shape=poster&id=tt15239678"));
  assert.ok(!sans.calls.some((u) => /append_to_response=[^&]*credits/.test(u)));
  // Incontournable : la note IMDb est lue même si la note n'est pas affichée.
  r2();   // notes IMDb pas encore chargées (les requêtes d'avant les ont mises en mémoire)
  const culte = internet();
  await makeHandler({ fetchImpl: culte, env })(req("type=movie&shape=poster&id=tt15239678&s=1.N03b1"));
  assert.ok(culte.calls.some((u) => u.includes("imdb-ratings.bin")), culte.calls.join("\n"));
  // Retouches ou cadre seuls : l'affiche est dessinée, pas renvoyée vers TMDB.
  for (const s of ["S0T0Q0L0B01am", "S0T0Q0L0B01fb"]) {
    const res = await makeHandler({ fetchImpl: internet(), env })(req("type=movie&shape=poster&id=tt15239678&s=1." + s));
    assert.equal(res.status, 200, s);
  }
});

test("revue_v3_nouvel_episode_cache_quotidien", async () => {
  const serie = { ...film, id: 94605, release_date: undefined, first_air_date: "2020-01-01", seasons: [], last_episode_to_air: { air_date: "2020-02-01" } };
  const res = await makeHandler({ fetchImpl: internet({ detail: json(serie) }), env })(req("type=series&shape=poster&id=tmdb:94605&s=1.3c1"));
  assert.equal(res.status, 200);
  assert.ok(age(res, "Cache-Control") <= secondesAvantBascule() + 2, res.headers.get("Cache-Control"));
});

// Titre récent : les sources sont lues même sans le badge de qualité (elles disent s'il est en VF) ; vieux titre ou
// QUALITE=off : jamais.
test("sources_lues_pour_un_titre_recent", async () => {
  const recent = () => internet({ detail: avecSorties([4, jour(-20)]) });
  const f = recent();
  const res = await makeHandler({ fetchImpl: f, env })(req("type=movie&shape=poster&id=tt15239678&s=1.Q0"));
  assert.equal(res.status, 200);
  assert.ok(f.calls.some((u) => u.includes("/qualite/movie/tt15239678.json?v=3")), f.calls.join("\n"));
  const off = recent();
  await makeHandler({ fetchImpl: off, env: { ...env, QUALITE: "off" } })(req("type=movie&shape=poster&id=tt15239678&s=1.Q0"));
  assert.ok(!off.calls.some((u) => u.includes("/qualite/")));
  const vieux = internet();
  await makeHandler({ fetchImpl: vieux, env })(req("type=movie&shape=poster&id=tt15239678&s=1.Q0"));
  assert.ok(!vieux.calls.some((u) => u.includes("/qualite/")));
});

// Fin d'une série : « TERMINÉE » ne change pas avec le jour, cache normal (pas redessinée chaque jour pour elle).
// Avancement : jusqu'au lendemain du prochain épisode.
test("serie_fin_et_avancement_caches", async () => {
  const base = { ...film, id: 94605, release_date: undefined, first_air_date: "2020-01-01", last_episode_to_air: { air_date: "2025-02-01", season_number: 2, episode_number: 5 },
    seasons: [{ season_number: 2, air_date: "2025-01-01", episode_count: 8 }] };
  const finie = await makeHandler({ fetchImpl: internet({ detail: json({ ...base, status: "Ended" }) }), env })(req("type=series&shape=poster&id=tmdb:94605&s=1.3h1"));
  assert.equal(finie.status, 200);
  assert.equal(finie.headers.get("Cache-Control"), "public, max-age=604800");
  const sansFin = await makeHandler({ fetchImpl: internet({ detail: json({ ...base, status: "Ended" }) }), env })(req("type=series&shape=poster&id=tmdb:94605"));
  assert.notEqual(finie.headers.get("ETag"), sansFin.headers.get("ETag"));
  const prochain = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const enCours = { ...base, status: "Returning Series", next_episode_to_air: { air_date: prochain } };
  const res = await makeHandler({ fetchImpl: internet({ detail: json(enCours) }), env })(req("type=series&shape=poster&id=tmdb:94605&s=1.3i1"));
  assert.equal(res.status, 200);
  assert.ok(age(res, "Cache-Control") <= 5 * 86400 && age(res, "Cache-Control") >= 2 * 86400, res.headers.get("Cache-Control"));
  // Sans le réglage : cache normal.
  const sans = await makeHandler({ fetchImpl: internet({ detail: json(enCours) }), env })(req("type=series&shape=poster&id=tmdb:94605"));
  assert.equal(sans.headers.get("Cache-Control"), "public, max-age=604800");
});

// Rang dans la saga : un appel /collection/ seulement avec le réglage, pour un film d'une saga ; TMDB en panne : cache court.
test("rang_dans_la_saga_lu_chez_tmdb", async () => {
  const deSaga = json({ ...film, belongs_to_collection: { id: 726871, name: "Dune" } });
  const parts = json({ parts: [{ id: 438631, release_date: "2021-09-15" }, { id: 693134, release_date: "2024-02-27" }, { id: 1170608, release_date: "2026-12-16" }] });
  const f = internet({ detail: deSaga, collection: parts });
  const res = await makeHandler({ fetchImpl: f, env })(req("type=movie&shape=poster&id=tt15239678&s=1.3j1"));
  assert.equal(res.status, 200);
  assert.equal(f.calls.filter((u) => u.includes("/collection/726871")).length, 1);
  const sans = internet({ detail: deSaga, collection: parts });
  const res2 = await makeHandler({ fetchImpl: sans, env })(req("type=movie&shape=poster&id=tt15239678"));
  assert.ok(!sans.calls.some((u) => u.includes("/collection/")));
  assert.notEqual(res.headers.get("ETag"), res2.headers.get("ETag"));
  // Film hors saga : aucun appel.
  const seul = internet({ collection: parts });
  await makeHandler({ fetchImpl: seul, env })(req("type=movie&shape=poster&id=tt15239678&s=1.3j1"));
  assert.ok(!seul.calls.some((u) => u.includes("/collection/")));
  // Collection illisible : l'affiche part sans badge, redemandée bientôt.
  r7();
  const panne = await makeHandler({ fetchImpl: internet({ detail: deSaga, collection: json({}, 500) }), env })(req("type=movie&shape=poster&id=tt15239678&s=1.3j1"));
  assert.equal(panne.status, 200);
  assert.equal(panne.headers.get("Cache-Control"), "public, max-age=3600");
});

// Habillage de la saison : pendant une fête, un film de la rangée « Spécial … » (liste de l'addon) est habillé, un
// autre pas ; tous deux gardés jusqu'au prochain changement de fête. Une série, le réglage éteint, ou hors fête : la
// liste n'est pas lue.
test("habillage_de_saison", async () => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-30T12:00:00Z") });   // 13 h à Paris, Halloween
  try {
    const liste = (ids) => json({ saison: "halloween", ids });
    const dedans = internet({ saison: liste([693134]) });
    const res = await makeHandler({ fetchImpl: dedans, env })(req("type=movie&shape=poster&id=tt15239678&s=1.3k1"));
    assert.equal(res.status, 200);
    assert.equal(dedans.calls.filter((u) => u.endsWith("/saison.json")).length, 1);
    assert.equal(age(res, "Cache-Control"), 3 * 86400 + 11 * 3600);         // jusqu'au 3 novembre, minuit à Paris
    r8();
    const dehors = await makeHandler({ fetchImpl: internet({ saison: liste([1]) }), env })(req("type=movie&shape=poster&id=tt15239678&s=1.3k1"));
    assert.equal(age(dehors, "Cache-Control"), 3 * 86400 + 11 * 3600);
    assert.notEqual(res.headers.get("ETag"), dehors.headers.get("ETag"));
    const defaut = await makeHandler({ fetchImpl: internet({ saison: liste([693134]) }), env })(req("type=movie&shape=poster&id=tt15239678"));
    assert.equal(defaut.headers.get("ETag"), (await makeHandler({ fetchImpl: internet(), env })(req("type=movie&shape=poster&id=tt15239678"))).headers.get("ETag"));
    for (const q of ["type=movie&shape=poster&id=tt15239678", "type=series&shape=poster&id=tmdb:94605&s=1.3k1"]) {
      const g = internet({ saison: liste([693134, 94605]) });
      await makeHandler({ fetchImpl: g, env })(req(q));
      assert.ok(!g.calls.some((u) => u.endsWith("/saison.json")), q);
    }
    // Addon injoignable : pas d'habillage, redemandée bientôt.
    r8();
    const panne = await makeHandler({ fetchImpl: internet(), env })(req("type=movie&shape=poster&id=tt15239678&s=1.3k1"));
    assert.equal(panne.headers.get("Cache-Control"), "public, max-age=3600");
  } finally { mock.timers.reset(); }
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-09-15T12:00:00Z") });
  try {
    const g = internet({ saison: json({ saison: null, ids: [] }) });
    await makeHandler({ fetchImpl: g, env })(req("type=movie&shape=poster&id=tt15239678&s=1.3k1"));
    assert.ok(!g.calls.some((u) => u.endsWith("/saison.json")));
  } finally { mock.timers.reset(); }
});

// Badge Langue : les sources sont lues pour lui, même sans le badge de qualité ni titre récent ; pas avec QUALITE=off.
test("langue_lue_dans_les_sources", async () => {
  const multi = () => internet({ torrentio: async () => json({ streams: [{ name: "Torrentio\n1080p", title: "Dune.Part.Two.2024.MULTi.VFF.1080p" }] }) });
  const f = multi();
  const res = await makeHandler({ fetchImpl: f, env })(req("type=movie&shape=poster&id=tt15239678&s=1.Q03g1"));
  assert.equal(res.status, 200);
  assert.ok(f.calls.some((u) => u.includes("/qualite/movie/tt15239678.json")), f.calls.join("\n"));
  const sans = await makeHandler({ fetchImpl: multi(), env })(req("type=movie&shape=poster&id=tt15239678&s=1.Q0"));
  assert.notEqual(res.headers.get("ETag"), sans.headers.get("ETag"));
  // Rien d'autre à poser que la langue : l'affiche est quand même dessinée.
  const seule = await makeHandler({ fetchImpl: multi(), env })(req("type=movie&shape=poster&id=tt15239678&s=1.S0T0Q0L0B03g1"));
  assert.equal(seule.status, 200);
  const off = multi();
  await makeHandler({ fetchImpl: off, env: { ...env, QUALITE: "off" } })(req("type=movie&shape=poster&id=tt15239678&s=1.Q03g1"));
  assert.ok(!off.calls.some((u) => u.includes("/qualite/")));
});

// En salle aux États-Unis depuis 10 jours, sans date numérique : la date estimée d'après la fenêtre de son distributeur
// américain (data/estimations-vod.json : Disney, 60 jours), la même que la fiche de l'addon. Table illisible : la salle
// + 45 jours, et le cache court pour l'avoir ensuite.
test("dispo_estimee_d_apres_le_distributeur", async () => {
  const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const enSalle = { ...film, release_date: jour(-10), original_language: "en",
    release_dates: { results: [{ iso_3166_1: "US", release_dates: [{ type: 3, release_date: jour(-10) + "T00:00:00.000Z" }] }] } };
  const table = { maj: jour(0), mediane: 32, fenetres: {}, films: { tt15239678: { date: jour(50), distributeur: "Q1323594", jours: 60 } } };
  const avec = (reponse) => {
    const base = internet({ detail: json(enSalle) });
    const f = async (u, o) => { if (String(u) !== ESTIMATIONS_URL) return base(u, o); base.calls.push(String(u)); return reponse(); };
    f.calls = base.calls;
    return f;
  };
  const f = avec(() => json(table));
  const res = await makeHandler({ fetchImpl: f, env })(req("type=movie&shape=poster&id=tt15239678"));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("X-Affiche-Sortie"), new RegExp(` dispo=${jour(50)}~ `));
  assert.equal(res.headers.get("X-Affiche-Etat"), "complete");
  assert.equal(f.calls.filter((u) => u === ESTIMATIONS_URL).length, 1);
  r9();
  const sans = await makeHandler({ fetchImpl: avec(() => new Response("?", { status: 404 })), env })(req("type=movie&shape=poster&id=tt15239678"));
  assert.match(sans.headers.get("X-Affiche-Sortie"), new RegExp(` dispo=${jour(35)}~ `));
  assert.equal(sans.headers.get("X-Affiche-Etat"), "retard");
});

// Réserve de l'addon (lib/reserve.js) : un faux addon devant le faux internet. cpuMs : le total des 31 jours qu'il
// annonce au budget (lib/budget.js).
function avecAddon({ gardees = new Map(), cpuMs = 0 } = {}) {
  const net = internet(), rangees = [];
  const f = async (url, opts = {}) => {
    const u = new URL(String(url));
    if (u.pathname === "/cpu") return json({ ms: cpuMs, jours: 31 });
    const r = /^\/reserve\/([0-9a-f]{40})$/.exec(u.pathname);
    if (!r) return net(url, opts);
    if (opts.method === "PUT") { rangees.push([r[1], Buffer.from(opts.body)]); return new Response(null, { status: 204 }); }
    return gardees.has(r[1]) ? new Response(gardees.get(r[1]), { headers: { "Content-Type": "image/jpeg" } }) : new Response(null, { status: 404 });
  };
  return { f, rangees };
}
const envAddon = { ...env, RELAIS_KEY: "cle" };

test("reserve_dessin_range", async () => {
  const { f, rangees } = avecAddon();
  const res = await makeHandler({ fetchImpl: f, env: envAddon })(req("type=movie&shape=poster&id=tt15239678"));
  assert.equal(res.status, 200);
  const jpg = Buffer.from(await res.arrayBuffer());
  assert.equal(rangees.length, 1);
  assert.equal(rangees[0][0], cleReserve(res.headers.get("ETag").slice(1, -1)));   // rangée sous la clé de son contenu
  assert.ok(rangees[0][1].equals(jpg));
});

test("reserve_relue_sans_dessiner", async () => {
  // Une première fois pour connaître la clé, puis l'addon la garde : la suivante est relue telle quelle.
  const premier = avecAddon();
  const res = await makeHandler({ fetchImpl: premier.f, env: envAddon })(req("type=movie&shape=poster&id=tt15239678"));
  const cle = cleReserve(res.headers.get("ETag").slice(1, -1));
  const marque = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("gardée")]);
  const { f, rangees } = avecAddon({ gardees: new Map([[cle, marque]]) });
  const relue = await makeHandler({ fetchImpl: f, env: envAddon })(req("type=movie&shape=poster&id=tt15239678"));
  assert.equal(relue.status, 200);
  assert.equal(relue.headers.get("X-Affiche-Reserve"), "lue");
  assert.equal(relue.headers.get("ETag"), res.headers.get("ETag"));
  assert.ok(Buffer.from(await relue.arrayBuffer()).equals(marque));
  assert.equal(rangees.length, 0);
});

test("reserve_seule_quand_le_budget_est_depense", async () => {
  // Entre le budget (140 min) et la marge (160) : plus de dessin, mais la réserve sert encore.
  const ms = 150 * 60000;
  const premier = avecAddon();
  const cle = cleReserve((await makeHandler({ fetchImpl: premier.f, env: envAddon })(req("type=movie&shape=poster&id=tt15239678"))).headers.get("ETag").slice(1, -1));
  const vide = avecAddon({ cpuMs: ms });
  const h = makeHandler({ fetchImpl: vide.f, env: envAddon });
  await h(req("type=movie&shape=poster&id=tt0816692"));   // le total arrive avec le premier envoi
  const sans = await h(req("type=movie&shape=poster&id=tt15239678"));
  assert.equal(sans.status, 503);
  const pleine = avecAddon({ cpuMs: ms, gardees: new Map([[cle, JPG]]) });
  const h2 = makeHandler({ fetchImpl: pleine.f, env: envAddon });
  await h2(req("type=movie&shape=poster&id=tt0816692"));
  const avec = await h2(req("type=movie&shape=poster&id=tt15239678"));
  assert.equal(avec.status, 200);
  assert.equal(avec.headers.get("X-Affiche-Reserve"), "lue");
});

test("reserve_sans_cle_dessine_comme_avant", async () => {
  const { f, rangees } = avecAddon();
  const res = await makeHandler({ fetchImpl: f, env })(req("type=movie&shape=poster&id=tt15239678"));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("X-Affiche-Reserve"), null);
  assert.equal(rangees.length, 0);
});

test("reserve_cle_suit_le_code_du_dessin", () => {
  // L'empreinte lit vraiment les fichiers du dessin (aucun « absent ») et la clé change avec elle.
  assert.match(EMPREINTE_DESSIN, /^[0-9a-f]{40}$/);
  assert.match(cleReserve("abc"), /^[0-9a-f]{40}$/);
  assert.notEqual(cleReserve("abc"), cleReserve("abd"));
  assert.notEqual(cleReserve("abc"), "abc");
});

test("reserve_rangee_apres_la_reponse", async () => {
  // Sur Vercel (contexte de requête présent) : l'affiche part sans attendre l'addon, le rangement est confié à waitUntil.
  const { f, rangees } = avecAddon();
  let lacher;
  const retenu = new Promise((ok) => { lacher = ok; });
  const lent = async (url, opts = {}) => { if (opts.method === "PUT") await retenu; return f(url, opts); };
  const confies = [], symbole = Symbol.for("@vercel/request-context");
  globalThis[symbole] = { get: () => ({ waitUntil: (p) => confies.push(p) }) };
  try {
    const res = await makeHandler({ fetchImpl: lent, env: envAddon })(req("type=movie&shape=poster&id=tt15239678"));
    assert.equal(res.status, 200);
    assert.equal(rangees.length, 0);   // pas encore rangée : la réponse ne l'a pas attendue
    assert.ok(confies.length >= 1);
    lacher();
    await Promise.all(confies);
    assert.equal(rangees.length, 1);
  } finally {
    delete globalThis[symbole];
  }
});

test("qualite_lue_pendant_la_verification_des_images", async () => {
  // La vérification des images sans texte (w342) et la qualité partent ensemble, plus l'une après l'autre.
  const net = internet();
  let qualiteVue = false, avantImages = null;
  const f = async (url, opts) => {
    const u = String(url);
    if (u.includes("/qualite/")) qualiteVue = true;
    if (u.includes("/t/p/w342/")) { await new Promise((ok) => setTimeout(ok, 50)); if (avantImages === null) avantImages = qualiteVue; }
    return net(url, opts);
  };
  const res = await makeHandler({ fetchImpl: f, env })(req("type=movie&shape=poster&id=tt15239678&s=1.T0"));
  assert.equal(res.status, 200);
  assert.equal(avantImages, true);
});

test("server_timing_donne_chaque_etape", async () => {
  // De quoi voir en ligne ce qui fait attendre une affiche hors cache (curl -D -, ou les outils du navigateur).
  const { f } = avecAddon();
  const res = await makeHandler({ fetchImpl: f, env: envAddon })(req("type=movie&shape=poster&id=tt15239678"));
  assert.equal(res.status, 200);
  const etapes = Object.fromEntries(res.headers.get("Server-Timing").split(", ").map((x) => [x.split(";")[0], Number(x.split("dur=")[1])]));
  for (const nom of ["tmdb", "sans-texte", "qualite", "lectures", "reserve", "dessin", "total"]) assert.ok(Number.isInteger(etapes[nom]), `${nom} : ${res.headers.get("Server-Timing")}`);
  assert.ok(etapes.total >= etapes.dessin);
  assert.match(res.headers.get("Access-Control-Expose-Headers"), /Server-Timing/);
});

// L'avis VF du jour de l'addon (/sf : Lumio, sinon StreamFusion ; serveur des affiches, AVIS_DU_JOUR=on) prime sur
// Torrentio et sur la photo de 4 h, pour un titre récent : By Any Means (« FRENCH » chez Torrentio, VFQ seulement) est
// gris, The Dog Stars (VF sortie dans la journée) en couleur. Sans VF : « revoir », redessinée quelques heures plus tard.
test("avis_du_jour_de_l_addon_prime", async () => {
  const lancer = async (torrentioVf, avis, e = { ...env, RESERVE: "off", STREAMFUSION: "off", RELAIS_KEY: "cle", ADDON_URL: "https://addon.test", AVIS_DU_JOUR: "on" }, nom = null) => {
    r4();   // l'avis est gardé 30 minutes par vidéo : chaque cas repart de rien
    const cles = [];
    const base = internet({ detail: avecSorties([4, jour(-20)]),
      torrentio: () => json({ streams: [{ name: "Torrentio\n1080p", title: nom || (torrentioVf ? "Film.2026.TRUEFRENCH.1080p.WEB" : "Film.2026.1080p.WEB") }] }) });
    const f = async (url, opts = {}) => {
      if (String(url) === "https://addon.test/sf/movie/tt15239678.json") { cles.push(new Headers(opts.headers || {}).get("X-Relais-Cle")); return json(avis); }
      return base(url, opts);
    };
    const res = await makeHandler({ fetchImpl: f, env: e })(req("type=movie&shape=poster&id=tt15239678"));
    assert.equal(res.status, 200);
    return { vf: /vf=(\w+)/.exec(res.headers.get("X-Affiche-Sortie"))[1], etat: res.headers.get("X-Affiche-Etat"), cles, image: createHash("sha1").update(Buffer.from(await res.arrayBuffer())).digest("hex") };
  };
  const { image: sansVf, ...vu } = await lancer(true, { vf: false, sources: 68 });
  assert.deepEqual(vu, { vf: "false", etat: "revoir", cles: ["cle"] });
  assert.partialDeepStrictEqual(await lancer(false, { vf: true, sources: 9, qualite: { u: 1, x: "DV", p: 0, f: 1, a: 0 } }), { vf: "true", etat: "complete", cles: ["cle"] });
  // L'addon sans avis (plafond, panne) : Torrentio.
  assert.partialDeepStrictEqual(await lancer(true, { plafond: true }), { vf: "true", etat: "complete", cles: ["cle"] });
  // Ailleurs que sur le serveur (Vercel, machine GitHub) : jamais demandé.
  assert.partialDeepStrictEqual(await lancer(true, { vf: false, sources: 3 }, { ...env, RESERVE: "off", STREAMFUSION: "off", RELAIS_KEY: "cle", ADDON_URL: "https://addon.test" }), { vf: "true", etat: "complete", cles: [] });
  // Sans VF, pas de badge de qualité : celle de Torrentio (4K DV) est celle d'un fichier VFQ ou VO. La même affiche
  // qu'avec un Torrentio sans aucune qualité.
  const torrentio4k = await lancer(true, { vf: false, sources: 68 }, undefined, "Film.2026.TRUEFRENCH.2160p.WEB.DV");
  assert.equal(torrentio4k.image, sansVf);
  // En VF, le badge 4K DV est bien dessiné.
  assert.notEqual((await lancer(true, { vf: true, sources: 3 }, undefined, "Film.2026.TRUEFRENCH.2160p.WEB.DV")).image, (await lancer(true, { vf: true, sources: 3 })).image);
});
