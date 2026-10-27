import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { titleFacts, tmdbIdDe, tailleMemo, resetMemo as resetTmdb } from "../lib/tmdb.js";
import { resetMemo as resetEpisodes } from "../lib/episodes.js";
import { ratingOf, lireNoteImdb, decodeRatings, resetMemo as resetNotes } from "../lib/notes.js";
import { trendingRank, lireRang, photoTendances, prochaineBascule, secondesAvantBascule, resetMemo as resetTendances } from "../lib/tendances.js";

const env = { TMDB_API_KEY: "k" };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

/** Faux fetch : répond selon l'URL (premier motif trouvé), garde les URL demandées. */
function fauxFetch(routes) {
  const calls = [];
  const f = async (url) => {
    const u = String(url);
    calls.push(u);
    for (const [motif, rep] of routes) if (u.includes(motif)) return typeof rep === "function" ? rep(u) : rep.clone();
    return json({}, 404);
  };
  f.calls = calls;
  return f;
}

const movie = {
  id: 693134, release_date: "2024-02-27", genres: [{ id: 878 }, { id: 12 }], vote_average: 8.1, vote_count: 6000,
  poster_path: "/fr.jpg", backdrop_path: "/bd.jpg", external_ids: { imdb_id: "tt15239678" },
  images: {
    posters: [{ iso_639_1: "fr", file_path: "/fr.jpg" }, { iso_639_1: null, file_path: "/nu.jpg" }, { iso_639_1: null, file_path: "/nu2.jpg" }],
    backdrops: [{ iso_639_1: "en", file_path: "/bden.jpg" }, { iso_639_1: null, file_path: "/bdnu.jpg" }],
    logos: [{ iso_639_1: "en", file_path: "/en.png" }, { iso_639_1: "fr", file_path: "/fr.svg" }],
  },
};

beforeEach(() => { resetTmdb(); resetNotes(); resetTendances(); });

test("film tt lu directement, sans /find", async () => {
  const f = fauxFetch([["/movie/tt15239678", json(movie)], ["/movie/693134", json(movie)]]);
  const facts = await titleFacts(env, { type: "movie", id: "tt15239678", imdb: "" }, f);
  assert.equal(f.calls.length, 1);
  const detail = new URL(f.calls[0]);
  assert.equal(detail.pathname, "/3/movie/tt15239678");
  assert.equal(detail.searchParams.get("append_to_response"), "images,external_ids,release_dates,keywords,watch/providers");
  assert.equal(detail.searchParams.get("include_image_language"), "fr,en,null");
  assert.equal(detail.searchParams.get("language"), "fr-FR");
  assert.equal(facts.tmdbId, 693134);
  assert.equal(facts.imdbId, "tt15239678");
  // La correspondance est retenue : la fois suivante, la fiche par son identifiant TMDB (même adresse qu'avant).
  await titleFacts(env, { type: "movie", id: "tt15239678", imdb: "" }, f);
  assert.equal(new URL(f.calls[1]).pathname, "/3/movie/693134");
  assert.ok(!f.calls.some((u) => u.includes("/find/")));
});

test("série tt résolue par /find", async () => {
  const serie = { ...movie, id: 1396, release_date: undefined, first_air_date: "2008-01-20", external_ids: { imdb_id: "tt0903747" } };
  const f = fauxFetch([["/find/tt0903747", json({ movie_results: [], tv_results: [{ id: 1396 }] })], ["/tv/1396", json(serie)]]);
  const facts = await titleFacts(env, { type: "series", id: "tt0903747", imdb: "" }, f);
  assert.ok(f.calls[0].includes("/find/tt0903747") && f.calls[0].includes("external_source=imdb_id"));
  assert.equal(new URL(f.calls[1]).pathname, "/3/tv/1396");
  assert.equal(facts.tmdbId, 1396);
});

test("film tt inconnu : retenu, plus redemandé", async () => {
  const f = fauxFetch([]);
  assert.equal(await titleFacts(env, { type: "movie", id: "tt7", imdb: "" }, f), null);
  assert.equal(await titleFacts(env, { type: "movie", id: "tt7", imdb: "" }, f), null);
  assert.equal(f.calls.length, 1);
});

test("tmdb:N direct", async () => {
  const serie = { ...movie, id: 94605, release_date: undefined, first_air_date: "2021-11-06", external_ids: { imdb_id: "tt11126994" }, last_episode_to_air: { season_number: 2 } };
  const f = fauxFetch([["/tv/94605", json(serie)]]);
  const facts = await titleFacts(env, { type: "series", id: "tmdb:94605", imdb: "" }, f);
  assert.ok(!f.calls.some((u) => u.includes("/find/")));
  assert.equal(new URL(f.calls[0]).pathname, "/3/tv/94605");
  assert.equal(facts.imdbId, "tt11126994");
  assert.equal(facts.type, "series");
});

// Candidates sans texte : sans langue, au format d'une affiche (2:3) ou d'un fond (16:9) à 2 % près, 3 au plus.
// Un autre format trahit souvent une affiche étrangère rangée là par erreur (Conjuring : 1433×2048).
test("candidates_sans_texte", async () => {
  const p = (file_path, width, height, iso_639_1 = null) => ({ iso_639_1, file_path, width, height });
  const film = { ...movie, images: { ...movie.images,
    posters: [p("/lt.jpg", 1433, 2048), p("/a.jpg", 2000, 3000), p("/fr2.jpg", 2000, 3000, "fr"), p("/b.jpg", 2000, 2964), p("/c.jpg", 1000, 1500), p("/d.jpg", 1000, 1500)],
    backdrops: [p("/carre.jpg", 1000, 1000), p("/e.jpg", 3840, 2160), p("/f.jpg", 1280, 720)] } };
  const f = await titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" }, fauxFetch([["/movie/693134", json(film)]]));
  assert.deepEqual(f.textlessPosters, ["/a.jpg", "/b.jpg", "/c.jpg"]);
  assert.equal(f.textlessPoster, "/a.jpg");
  assert.deepEqual(f.textlessBackdrops, ["/e.jpg", "/f.jpg"]);
  assert.equal(f.textlessBackdrop, "/e.jpg");
});

test("images choisies", async () => {
  const f = fauxFetch([["/movie/693134", json(movie)]]);
  const facts = await titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" }, f);
  assert.equal(facts.textlessPoster, "/nu.jpg");
  assert.equal(facts.poster, "/fr.jpg");
  assert.equal(facts.logo, "/fr.svg");
  assert.equal(facts.backdrop, "/bd.jpg");
  assert.equal(facts.textlessBackdrop, "/bdnu.jpg");
  assert.deepEqual(facts.genreIds, [878, 12]);
  assert.deepEqual(facts.vote, { average: 8.1, count: 6000 });
});

test("dates pour le statut", async () => {
  const avecDates = { ...movie, original_language: "en", release_dates: { results: [{ iso_3166_1: "FR", release_dates: [{ type: 3, release_date: "2024-02-28T00:00:00.000Z" }] }] } };
  const f = fauxFetch([["/movie/693134", json(avecDates)]]);
  const facts = await titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" }, f);
  assert.equal(new URL(f.calls[0]).searchParams.get("append_to_response"), "images,external_ids,release_dates,keywords,watch/providers");
  assert.deepEqual(facts.releases, avecDates.release_dates.results);
  assert.equal(facts.releaseDate, "2024-02-27");
  assert.equal(facts.originalLanguage, "en");
  const serie = { ...movie, id: 94605, release_date: undefined, first_air_date: "2021-11-06", seasons: [{ season_number: 1, air_date: "2021-11-06", name: "S1" }] };
  const s = await titleFacts(env, { type: "series", id: "tmdb:94605", imdb: "" }, fauxFetch([["/tv/94605", json(serie)]]));
  assert.equal(s.firstAir, "2021-11-06");
  assert.deepEqual(s.seasons, [{ season_number: 1, air_date: "2021-11-06", episode_count: null }]);
});

// Âge conseillé en France : la classification FR du film (sortie en salle d'abord), ou celle de la série.
test("age_conseille_france", async () => {
  const film = { ...movie, release_dates: { results: [
    { iso_3166_1: "US", release_dates: [{ type: 3, certification: "R" }] },
    { iso_3166_1: "FR", release_dates: [{ type: 4, certification: "" }, { type: 3, certification: "12" }] },
  ] } };
  const f = await titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" }, fauxFetch([["/movie/693134", json(film)]]));
  assert.equal(f.age, "12");
  const tousPublics = { ...movie, release_dates: { results: [{ iso_3166_1: "FR", release_dates: [{ type: 3, certification: "U" }] }] } };
  assert.equal((await titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" }, fauxFetch([["/movie/693134", json(tousPublics)]]))).age, null);
  const serie = { ...movie, id: 94605, release_date: undefined, first_air_date: "2021-11-06", content_ratings: { results: [{ iso_3166_1: "US", rating: "TV-14" }, { iso_3166_1: "FR", rating: "-16" }] } };
  const fs = fauxFetch([["/tv/94605", json(serie)]]);
  const s = await titleFacts(env, { type: "series", id: "tmdb:94605", imdb: "" }, fs);
  assert.equal(new URL(fs.calls[0]).searchParams.get("append_to_response"), "images,external_ids,content_ratings,watch/providers");
  assert.equal(s.age, "16");
  assert.equal((await titleFacts(env, { type: "series", id: "tmdb:94605", imdb: "" }, fauxFetch([["/tv/94605", json({ ...serie, content_ratings: { results: [{ iso_3166_1: "FR", rating: "TP" }] } })]]))).age, null);
});

// « On va s'arrêter là », « Friends Sex and Games » : un logo seulement en espagnol. Ni français ni anglais : on
// demande les logos de toutes les langues (un appel de plus, pour ces titres seulement) : celui de la langue
// d'origine, sinon un logo sans langue (logos.autre). Pas celui d'une langue tierce (EB, film néerlandais : un logo
// portugais « Maré Escura ») : le titre français sera écrit à la place.
test("logo_dans_une_autre_langue", async () => {
  const sansFrEn = { ...movie, original_language: "es", images: { ...movie.images, logos: [] } };
  const f = fauxFetch([["/movie/693134/images", json({ logos: [{ iso_639_1: "de", file_path: "/de.png" }, { iso_639_1: "es", file_path: "/es.png" }] })], ["/movie/693134", json(sansFrEn)]]);
  const facts = await titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" }, f);
  assert.equal(facts.logos.autre, "/es.png");
  const g = fauxFetch([["/movie/693134/images", json({ logos: [{ iso_639_1: "de", file_path: "/de.png" }] })], ["/movie/693134", json(sansFrEn)]]);
  assert.equal((await titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" }, g)).logos.autre, null);
  const n = fauxFetch([["/movie/693134/images", json({ logos: [{ iso_639_1: "pt", file_path: "/pt.png" }, { iso_639_1: null, file_path: "/nul.png" }] })], ["/movie/693134", json(sansFrEn)]]);
  assert.equal((await titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" }, n)).logos.autre, "/nul.png");
  // « The Musical » : un logo sans langue seulement (dans la première réponse, sans appel de plus).
  const sansLangue = { ...sansFrEn, images: { ...movie.images, logos: [{ iso_639_1: null, file_path: "/nul.png" }] } };
  const m = fauxFetch([["/movie/693134/images", json({ logos: [{ iso_639_1: null, file_path: "/nul.png" }] })], ["/movie/693134", json(sansLangue)]]);
  assert.equal((await titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" }, m)).logos.autre, "/nul.png");
  // Un logo français : pas d'appel de plus.
  const h = fauxFetch([["/movie/693134", json(movie)]]);
  await titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" }, h);
  assert.equal(h.calls.length, 1);
  // L'appel de plus échoue : pas de logo, l'affiche se fait quand même.
  const k = fauxFetch([["/movie/693134/images", json({}, 500)], ["/movie/693134", json(sansFrEn)]]);
  assert.equal((await titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" }, k)).logos.autre, null);
});

// Sur une plateforme (abonnement, gratuit, pub, location, achat) en France : VF disponible. Pas ailleurs : en Suisse
// (Bad Apples, avec l'Allemagne et l'Autriche) ou au Canada, la plateforme peut n'avoir que l'allemand ou l'anglais.
test("plateforme_en_france", async () => {
  const sur = (results, langue = "en") => titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" }, fauxFetch([["/movie/693134", json({ ...movie, original_language: langue, "watch/providers": { results } })]]));
  assert.equal((await sur({ FR: { flatrate: [{ provider_name: "Netflix" }] } })).plateformeFrance, true);
  assert.equal((await sur({ FR: { rent: [{ provider_name: "Apple TV" }] } })).plateformeFrance, true);
  // Film étranger (ni anglais ni français) : seulement sur Netflix ou Disney+, qui doublent presque tout. EB
  // (néerlandais) sur Prime Video : en VO seulement.
  assert.equal((await sur({ FR: { flatrate: [{ provider_name: "Amazon Prime Video" }], rent: [{ provider_name: "Amazon Video" }] } }, "nl")).plateformeFrance, false);
  assert.equal((await sur({ FR: { flatrate: [{ provider_name: "Netflix" }] } }, "es")).plateformeFrance, true);
  assert.equal((await sur({ FR: { flatrate: [{ provider_name: "Disney Plus" }] } }, "ko")).plateformeFrance, true);
  assert.equal((await sur({ FR: { rent: [{ provider_name: "Canal VOD" }] } }, "fr")).plateformeFrance, true);
  assert.equal((await sur({ FR: { buy: [{ provider_name: "Netflix" }] } }, "nl")).plateformeFrance, false);
  assert.equal((await sur({ CH: { flatrate: [{ provider_name: "Sky" }] }, CA: { rent: [{ provider_name: "Apple TV" }] } })).plateformeFrance, false);
  assert.equal((await sur({ US: { flatrate: [{ provider_name: "Disney Plus" }] }, DE: { flatrate: [{ provider_name: "Disney Plus" }] } })).plateformeFrance, false);
  assert.equal((await sur({ FR: { link: "https://…" } })).plateformeFrance, false);
  assert.equal((await titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" }, fauxFetch([["/movie/693134", json(movie)]]))).plateformeFrance, false);
});

// En abonnement sur une grande plateforme qui double (Turning Point, documentaire Netflix) : en VF même si les sources
// n'ont que la VO. Pas MUBI, pas la location, pas un film étranger sur Prime Video, jamais un stand-up étranger.
test("abonnement_vf", async () => {
  const sur = (results, langue = "en", keywords = []) => titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" },
    fauxFetch([["/movie/693134", json({ ...movie, original_language: langue, keywords: { keywords }, "watch/providers": { results } })]]));
  const netflix = { FR: { flatrate: [{ provider_id: 8, provider_name: "Netflix" }] } };
  assert.equal((await sur(netflix)).abonnementVf, true);
  assert.equal((await sur(netflix, "es")).abonnementVf, true);
  assert.equal((await sur({ FR: { flatrate: [{ provider_id: 119, provider_name: "Amazon Prime Video" }] } })).abonnementVf, true);
  assert.equal((await sur({ FR: { flatrate: [{ provider_id: 119, provider_name: "Amazon Prime Video" }] } }, "nl")).abonnementVf, false);
  assert.equal((await sur({ FR: { flatrate: [{ provider_id: 11, provider_name: "MUBI" }] } })).abonnementVf, false);
  assert.equal((await sur({ FR: { rent: [{ provider_id: 2, provider_name: "Apple TV Store" }] } })).abonnementVf, false);
  // Stand-up (Stavros Halkias: Uncle Stav) : ni VF d'abonnement, ni VF de plateforme ; un spectacle français, si.
  const standUp = [{ id: 9716, name: "stand-up comedy" }, { id: 362573, name: "comedy special" }];
  const stav = await sur(netflix, "en", standUp);
  assert.equal(stav.abonnementVf, false);
  assert.equal(stav.plateformeFrance, false);
  assert.equal((await sur(netflix, "fr", standUp)).abonnementVf, true);
  // Mots-clés demandés avec la fiche d'un film (un seul appel).
  const f = fauxFetch([["/movie/693134", json(movie)]]);
  await titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" }, f);
  assert.match(f.calls[0], /append_to_response=[^&]*keywords/);
});

// Régie v2 : durée, saisons, logo dans chaque langue (français, anglais, langue d'origine), plateforme en France.
test("faits_v2", async () => {
  const film = { ...movie, runtime: 166, original_language: "ja",
    images: { ...movie.images, logos: [{ iso_639_1: "en", file_path: "/en.png" }, { iso_639_1: "fr", file_path: "/fr.svg" }, { iso_639_1: "ja", file_path: "/ja.png" }] },
    "watch/providers": { results: { FR: { flatrate: [{ display_priority: 5, provider_name: "Prime Video", logo_path: "/p.jpg" }, { display_priority: 1, provider_name: "Netflix", logo_path: "/n.jpg" }] }, US: { flatrate: [{ display_priority: 0, provider_name: "Hulu", logo_path: "/h.jpg" }] } } } };
  const f = fauxFetch([["/movie/693134", json(film)]]);
  const facts = await titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" }, f, { plateforme: true, vo: true });
  assert.equal(facts.runtime, 166);
  assert.equal(facts.seasonsCount, null);
  assert.deepEqual(facts.logos, { fr: "/fr.svg", en: "/en.png", vo: "/ja.png", autre: "/ja.png" });
  assert.equal(facts.logo, "/fr.svg");
  assert.deepEqual(facts.provider, { name: "Netflix", logo: "/n.jpg" });
  const q = new URL(f.calls[0]).searchParams;
  assert.equal(q.get("append_to_response"), "images,external_ids,release_dates,keywords,watch/providers");
  assert.equal(q.get("include_image_language"), "fr,en,null,ja,ko,es,it,de,zh,hi,pt,ru,sv,da,no,tr,th,nl,pl");
  const serie = { ...movie, id: 94605, release_date: undefined, first_air_date: "2021-11-06", runtime: undefined, episode_run_time: [42],
    seasons: [{ season_number: 0 }, { season_number: 1 }, { season_number: 2 }, { season_number: 3 }] };
  const s2 = await titleFacts(env, { type: "series", id: "tmdb:94605", imdb: "" }, fauxFetch([["/tv/94605", json(serie)]]), { plateforme: true });
  assert.equal(s2.seasonsCount, 3);
  assert.equal(s2.provider, null);
  assert.equal(s2.runtime, null);
});

test("logo anglais si pas de français, sinon rien", async () => {
  const en = { ...movie, images: { ...movie.images, logos: [{ iso_639_1: "de", file_path: "/de.png" }, { iso_639_1: "en", file_path: "/en.png" }] } };
  const sans = { ...movie, images: { ...movie.images, logos: [{ iso_639_1: "de", file_path: "/de.png" }] } };
  assert.equal((await titleFacts(env, { type: "movie", id: "tmdb:1", imdb: "" }, fauxFetch([["/movie/1", json(en)]]))).logo, "/en.png");
  assert.equal((await titleFacts(env, { type: "movie", id: "tmdb:2", imdb: "" }, fauxFetch([["/movie/2", json(sans)]]))).logo, null);
});

test("année et saison", async () => {
  const film = await titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" }, fauxFetch([["/movie/693134", json(movie)]]));
  assert.equal(film.year, "2024");
  assert.equal(film.lastSeason, null);
  const serie = { ...movie, id: 94605, release_date: undefined, first_air_date: "2021-11-06", last_episode_to_air: { season_number: 2 } };
  const s = await titleFacts(env, { type: "series", id: "tmdb:94605", imdb: "" }, fauxFetch([["/tv/94605", json(serie)]]));
  assert.equal(s.year, "2021");
  assert.equal(s.lastSeason, 2);
});

// Fin et avancement d'une série : statut TMDB, dernier épisode diffusé, prochain, épisodes par saison.
test("fin_et_avancement_serie", async () => {
  const serie = { ...movie, id: 94605, release_date: undefined, first_air_date: "2021-11-06", status: "Returning Series",
    last_episode_to_air: { season_number: 2, episode_number: 5, air_date: "2026-10-15" }, next_episode_to_air: { air_date: "2026-10-22" },
    seasons: [{ season_number: 1, air_date: "2021-11-06", episode_count: 9 }, { season_number: 2, air_date: "2026-09-24", episode_count: 8 }] };
  const s = await titleFacts(env, { type: "series", id: "tmdb:94605", imdb: "" }, fauxFetch([["/tv/94605", json(serie)]]));
  assert.deepEqual([s.status, s.lastSeason, s.lastEpisodeNumber, s.nextEpisode], ["Returning Series", 2, 5, "2026-10-22"]);
  assert.equal(s.seasons[1].episode_count, 8);
  const film = await titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" }, fauxFetch([["/movie/693134", json({ ...movie, status: "Released" })]]));
  assert.deepEqual([film.status, film.lastEpisodeNumber, film.nextEpisode], [null, null, null]);
});

test("mémoire des correspondances plafonnée", async () => {
  const f = async (u) => json({ movie_results: [{ id: 1 }], tv_results: [] });
  for (let i = 0; i < 5005; i++) await tmdbIdDe(env, "movie", "tt" + (200000 + i), f);
  assert.ok(tailleMemo() <= 5000, `taille ${tailleMemo()}`);
});

test("inconnu : 404 → null, 500 → erreur", async () => {
  assert.equal(await titleFacts(env, { type: "movie", id: "tmdb:9", imdb: "" }, fauxFetch([["/movie/9", json({}, 404)]])), null);
  assert.equal(await titleFacts(env, { type: "series", id: "tt9", imdb: "" }, fauxFetch([["/find/tt9", json({ movie_results: [], tv_results: [] })]])), null);
  assert.equal(await titleFacts(env, { type: "movie", id: "tt9", imdb: "" }, fauxFetch([["/movie/tt9", json({}, 404)]])), null);
  await assert.rejects(titleFacts(env, { type: "movie", id: "tmdb:8", imdb: "" }, fauxFetch([["/movie/8", json({}, 500)]])));
});

/** Tampon au format de data/imdb-ratings.bin : nombre (uint32 LE), écarts en varint, notes × 10. */
function binNotes(entries) {
  const out = [entries.length & 255, (entries.length >> 8) & 255, (entries.length >> 16) & 255, (entries.length >>> 24) & 255];
  let prev = 0;
  for (const [id] of entries) {
    let gap = id - prev; prev = id;
    do { let c = gap & 0x7f; gap = Math.floor(gap / 128); if (gap) c |= 0x80; out.push(c); } while (gap);
  }
  for (const [, note] of entries) out.push(note);
  return new Uint8Array(out);
}

test("notes", () => {
  const lire = decodeRatings(binNotes([[1, 55], [3, 79], [400000, 84]]));
  assert.equal(lire("tt0000003"), "7.9");
  assert.equal(lire("tt0400000"), "8.4");
  assert.equal(lire("tt0000002"), undefined);
  assert.equal(lire("pas-un-id"), undefined);
});

test("notes en mémoire", async () => {
  const f = fauxFetch([["imdb-ratings.bin", new Response(binNotes([[3, 79]]))]]);
  assert.equal(await ratingOf("tt0000003", f), "7.9");
  assert.equal(await ratingOf("tt0000004", f), undefined);
  assert.equal(f.calls.filter((u) => u.includes("imdb-ratings.bin")).length, 1);
});

test("notes illisibles : pas de note", async () => {
  const f = fauxFetch([["imdb-ratings.bin", new Response("", { status: 503 })]]);
  assert.equal(await ratingOf("tt0000003", f), undefined);
});

// Le fichier qui manque (illisible, ou pas encore lu après le délai donné) est signalé : l'affiche prend le cache court.
// Lent : on n'attend pas, mais la lecture continue et sert ensuite.
test("notes_imdb_manquantes_signalees", async () => {
  resetNotes();
  assert.deepEqual(await lireNoteImdb("tt0000003", async () => new Response("", { status: 503 }), 100), { note: undefined, manque: true });
  resetNotes();
  const lent = async () => { await new Promise((ok) => setTimeout(ok, 300)); return new Response(binNotes([[3, 79]])); };
  assert.deepEqual(await lireNoteImdb("tt0000003", lent, 50), { note: undefined, manque: true });
  await new Promise((ok) => setTimeout(ok, 400));
  assert.deepEqual(await lireNoteImdb("tt0000003", lent, 50), { note: "7.9", manque: false });
  assert.deepEqual(await lireNoteImdb("tt0000004", lent, 50), { note: undefined, manque: false });
});

// La photo du jour : les 60 premiers des tendances (3 pages TMDB), sans doublon. Le N° des affiches s'arrête
// à 20 ; les suivants, presque classés, ont seulement un cache qui s'arrête au changement de photo.
test("tendances", async () => {
  const page = (n) => json({ results: Array.from({ length: 20 }, (_, i) => ({ id: 100 + (n - 1) * 20 + i })) });
  const f = async (url) => {
    const u = String(url);
    f.calls.push(u);
    if (u.includes("/trending/tv/day")) return json({ results: [{ id: 5 }] });
    return page(Number(new URL(u).searchParams.get("page")));
  };
  f.calls = [];
  assert.equal(await trendingRank(env, "movie", 103, f), 4);
  assert.equal(await trendingRank(env, "movie", 145, f), 46);
  assert.equal(await trendingRank(env, "movie", 999, f), null);
  assert.equal(await trendingRank(env, "series", 5, f), 1);
  const pages = f.calls.filter((u) => u.includes("/trending/movie/day")).map((u) => new URL(u).searchParams.get("page"));
  assert.deepEqual(pages.sort(), ["1", "2", "3"]);
  assert.deepEqual(await photoTendances(env, "series", f), [5]);
});

test("tendances par le relais du service", async () => {
  const calls = [];
  const f = async (url) => { calls.push(String(url)); return json({ ids: [7, 8, 9] }); };
  assert.equal(await trendingRank(env, "movie", 8, f, "https://affiches.test"), 2);
  assert.deepEqual(calls, ["https://affiches.test/tendances/movie.json"]);
});

// La photo change chaque jour à 4 h UTC (6 h à Paris l'été, 5 h l'hiver).
test("bascule_quotidienne", () => {
  const t = (h, m = 0) => Date.UTC(2026, 9, 21, h, m);
  assert.equal(prochaineBascule(t(3, 59)), t(4));
  assert.equal(prochaineBascule(t(4)), Date.UTC(2026, 9, 22, 4));
  assert.equal(prochaineBascule(t(23)), Date.UTC(2026, 9, 22, 4));
  assert.equal(secondesAvantBascule(t(3)), 3600);
  assert.equal(secondesAvantBascule(t(3, 59) + 50000), 60);   // jamais moins d'une minute
});

test("tendances en panne : null sans erreur", async () => {
  const f = async () => { throw new Error("réseau"); };
  assert.equal(await trendingRank(env, "movie", 1, f), null);
  // Photo illisible : signalée (cache court), à la différence d'un titre absent de la photo.
  resetTendances();
  assert.deepEqual(await lireRang(env, "movie", 1, f), { rang: null, illisible: true, vf: null, qualite: null });
  resetTendances();
  assert.deepEqual(await lireRang(env, "movie", 9, async () => json({ ids: [7, 8] }), "https://affiches.test"), { rang: null, illisible: false, vf: null, qualite: null });
});

// Revue : langues d'origine demandées à TMDB seulement quand un réglage s'en sert ; les plateformes, toujours pour
// un film (elles disent s'il est en France, donc en VF : lib/statut.js).
test("revue_tmdb_selon_les_reglages", async () => {
  const f = fauxFetch([["/movie/693134", json(movie)]]);
  await titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" }, f);
  const q = new URL(f.calls[0]).searchParams;
  assert.equal(q.get("append_to_response"), "images,external_ids,release_dates,keywords,watch/providers");
  assert.equal(q.get("include_image_language"), "fr,en,null");
  const g = fauxFetch([["/movie/693134", json(movie)]]);
  await titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" }, g, { plateforme: true });
  assert.equal(new URL(g.calls[0]).searchParams.get("append_to_response"), "images,external_ids,release_dates,keywords,watch/providers");
  assert.equal(new URL(g.calls[0]).searchParams.get("include_image_language"), "fr,en,null");
});

// Régie v3 : accroche, studio, réalisateur (films : générique demandé seulement si besoin ; séries : créateurs), dernier épisode.
test("faits_v3", async () => {
  const film = { ...movie, tagline: "Le destin d'un peuple.", production_companies: [{ name: "Legendary" }, { name: "Warner" }],
    credits: { crew: [{ job: "Producer", name: "X" }, { job: "Director", name: "Denis Villeneuve" }] } };
  const f = fauxFetch([["/movie/693134", json(film)]]);
  const a = await titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" }, f, { credits: true });
  assert.deepEqual([a.tagline, a.studio, a.director], ["Le destin d'un peuple.", "Legendary", "Denis Villeneuve"]);
  assert.match(new URL(f.calls[0]).searchParams.get("append_to_response"), /,credits/);
  const g = fauxFetch([["/movie/693134", json(film)]]);
  await titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" }, g);
  assert.doesNotMatch(new URL(g.calls[0]).searchParams.get("append_to_response"), /credits/);
  const serie = { ...movie, id: 94605, release_date: undefined, first_air_date: "2021-11-06", tagline: "", created_by: [{ name: "Vince Gilligan" }],
    networks: [{ name: "AMC" }], production_companies: [{ name: "Sony Pictures Television" }], last_episode_to_air: { air_date: "2026-10-18", season_number: 2 } };
  const s = await titleFacts(env, { type: "series", id: "tmdb:94605", imdb: "" }, fauxFetch([["/tv/94605", json(serie)]]));
  assert.deepEqual([s.tagline, s.studio, s.director, s.lastEpisode], [null, "AMC", "Vince Gilligan", "2026-10-18"]);
});

// Jujutsu Kaisen : une « saison 1 » de 59 épisodes chez TMDB, 24 + 23 + 12 et la saison 4 annoncée chez Cinemeta.
// Le statut (« SAISON 4 BIENTÔT », « S3 · ÉP. 4/12 », « 3 saisons ») et la qualité prennent les saisons de Cinemeta.
test("anime_saisons_de_cinemeta", async () => {
  resetEpisodes();
  const jjk = { ...movie, id: 95479, release_date: undefined, first_air_date: "2020-10-03", genres: [{ id: 16 }, { id: 10759 }],
    external_ids: { imdb_id: "tt12343534" },
    seasons: [{ season_number: 0, episode_count: 10, air_date: "2020-01-01" }, { season_number: 1, episode_count: 59, air_date: "2020-10-03" }],
    last_episode_to_air: { season_number: 1, episode_number: 59, air_date: "2026-03-26" },
    next_episode_to_air: { season_number: 1, episode_number: 60, air_date: "2027-01-08" } };
  const ep = (season, n, released) => Array.from({ length: n }, (_, k) => ({ season, episode: k + 1, released }));
  const videos = [...ep(1, 24, "2020-10-03T00:00:00.000Z"), ...ep(2, 23, "2023-07-06T00:00:00.000Z"), ...ep(3, 12, "2026-01-08T00:00:00.000Z"), ...ep(4, 1, null)];
  const f = fauxFetch([["/tv/95479", json(jjk)], ["/meta/series/tt12343534.json", json({ meta: { videos } })]]);
  const facts = await titleFacts(env, { type: "series", id: "tmdb:95479", imdb: "" }, f);
  assert.equal(facts.seasonsCount, 3);   // la saison 4 est annoncée, pas encore datée
  assert.deepEqual([facts.lastSeason, facts.lastEpisodeNumber, facts.nextSeason, facts.nextEpisodeNumber], [3, 12, 4, 1]);
  assert.deepEqual(facts.seasons.map((s) => [s.season_number, s.episode_count, s.air_date]),
    [[0, 10, "2020-01-01"], [1, 24, "2020-10-03"], [2, 23, "2023-07-06"], [3, 12, "2026-01-08"], [4, 1, ""]]);
  // Cinemeta en panne : les saisons de TMDB, sans erreur.
  resetEpisodes();
  const panne = await titleFacts(env, { type: "series", id: "tmdb:95479", imdb: "" }, fauxFetch([["/tv/95479", json(jjk)], ["/meta/series/", json({}, 503)]]));
  assert.equal(panne.seasonsCount, 1);
  // Pas une série d'animation : Cinemeta n'est pas lu.
  const g = fauxFetch([["/tv/95479", json({ ...jjk, genres: [{ id: 18 }] })]]);
  await titleFacts(env, { type: "series", id: "tmdb:95479", imdb: "" }, g);
  assert.ok(!g.calls.some((u) => u.includes("cinemeta")));
});

// Le relais a servi un secours (le classement brut de TMDB, l'addon n'ayant pas répondu à temps) : pas de N°, plutôt
// qu'un faux gardé toute la journée ; « illisible », pour un cache court.
test("tendances : un secours du relais ne donne pas de N°", async () => {
  resetTendances();
  const f = async () => json({ ids: [7, 8, 9], secours: true });
  assert.deepEqual(await lireRang(env, "movie", 8, f, "https://affiches.test"), { rang: null, illisible: true, vf: null, qualite: null });
  resetTendances();
  const g = async () => json({ ids: [7, 8, 9] });
  assert.deepEqual(await lireRang(env, "movie", 8, g, "https://affiches.test"), { rang: 2, illisible: false, vf: null, qualite: null });
});

// L'avis VF de l'addon (photo du jour : StreamFusion) pour un titre qu'il a examiné : true, false ; sinon null.
test("tendances : l'avis VF de la photo", async () => {
  resetTendances();
  const f = async () => json({ ids: [7, 8, 9], vf: { 7: 1, 8: 0 } });
  assert.deepEqual(await lireRang(env, "movie", 7, f, "https://affiches.test"), { rang: 1, illisible: false, vf: true, qualite: null });
  assert.deepEqual(await lireRang(env, "movie", 8, f, "https://affiches.test"), { rang: 2, illisible: false, vf: false, qualite: null });
  assert.deepEqual(await lireRang(env, "movie", 9, f, "https://affiches.test"), { rang: 3, illisible: false, vf: null, qualite: null });
});

// La qualité des sources VF de StreamFusion, publiée avec la photo : 4K DV en VF.
test("tendances : la qualité VF de la photo", async () => {
  resetTendances();
  const f = async () => json({ ids: [7], vf: { 7: 1 }, q: { 7: { u: 1, x: "DV", p: 0, f: 1, a: 1 } } });
  assert.deepEqual((await lireRang(env, "movie", 7, f, "https://affiches.test")).qualite, { uhd: true, extra: "DV", hdr10p: false, fhd: true, atmos: true });
});

// Toy Story 4 : TMDB a un logo français du Canada (« Histoire de jouets 4 ») et un de France (« Toy Story 4 ») : celui de
// France ; un logo français d'un autre pays seulement, jamais (l'anglais à sa place).
test("logo_francais_de_france", async () => {
  const logos = [{ iso_639_1: "en", iso_3166_1: "US", file_path: "/en.png" }, { iso_639_1: "fr", iso_3166_1: "CA", file_path: "/ca.png" }, { iso_639_1: "fr", iso_3166_1: "FR", file_path: "/fr.png" }];
  const f = fauxFetch([["/movie/693134", json({ ...movie, images: { ...movie.images, logos } })]]);
  const facts = await titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" }, f);
  assert.equal(facts.logo, "/fr.png");
  assert.equal(facts.logos.fr, "/fr.png");
  resetTmdb();
  const g = fauxFetch([["/movie/693134", json({ ...movie, images: { ...movie.images, logos: logos.slice(0, 2) } })]]);
  const seulCanada = await titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" }, g);
  assert.equal(seulCanada.logo, "/en.png");
  assert.equal(seulCanada.logos.fr, null);
});

// Logos québécois marqués « France » par erreur chez TMDB (Fast & Furious 6 : « Rapides et dangereux 6 », son seul
// logo français) : jamais pris, l'anglais à leur place.
test("logo_quebecois_marque_france_ecarte", async () => {
  const logos = [{ iso_639_1: "en", iso_3166_1: "US", file_path: "/en.png" }, { iso_639_1: "fr", iso_3166_1: "FR", file_path: "/4wNoTeDnpnwxKNydVoq2B8MCMLI.png" }];
  const f = fauxFetch([["/movie/693134", json({ ...movie, images: { ...movie.images, logos } })]]);
  const facts = await titleFacts(env, { type: "movie", id: "tmdb:693134", imdb: "" }, f);
  assert.equal(facts.logo, "/en.png");
  assert.equal(facts.logos.fr, null);
});
