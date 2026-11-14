import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker, { oublierInfos } from "../worker/index.js";
import { smartSearch, prepareWords, personSplits, genreQuery, genreParams } from "../worker/search.js";

// Recherche : plusieurs personnes ensemble (« pacino de niro ») et genre + époque (« horreur années 80 »), avec un
// TMDB simulé. Les recherches d'avant (titre, personne seule, studio, année) ne doivent pas changer.

const film = (id, title, year, votes, extra = {}) => ({ id, title, original_title: title, release_date: `${year}-06-01`,
  vote_count: votes, popularity: votes / 100, poster_path: `/${id}.jpg`, genre_ids: [18], ...extra });
const serie = (id, name, year, votes, extra = {}) => ({ id, name, original_name: name, first_air_date: `${year}-01-01`,
  vote_count: votes, popularity: votes / 100, poster_path: `/${id}.jpg`, genre_ids: [18], ...extra });
const personne = (id, name, dept, votes) => ({ id, name, known_for_department: dept, popularity: 5,
  known_for: [{ media_type: "movie", id: id * 10, vote_count: votes }] });

const PACINO = personne(1158, "Al Pacino", "Acting", 20000);
const DE_NIRO = personne(380, "Robert De Niro", "Acting", 25000);
const SCORSESE = personne(1032, "Martin Scorsese", "Directing", 25000);
const HANKS = personne(31, "Tom Hanks", "Acting", 30000);
const RYAN = personne(5344, "Meg Ryan", "Acting", 5000);
const FROST = personne(11108, "Nick Frost", "Acting", 8000);
const NIXON = personne(38025, "Cynthia Nixon", "Acting", 6000);
const NOLAN = personne(525, "Christopher Nolan", "Directing", 35000);
// Un acteur presque inconnu (popularité < 1) avec un petit rôle dans un très gros film (Avengers : L'Ère d'Ultron).
const JULIAN_BLEACH = { ...personne(5000, "Julian Bleach", "Acting", 25000), popularity: 0.99 };
// La chanteuse JoJo (popularité 1,67) et Alfred Hitchcock (3,98).
const JOJO = { ...personne(5001, "JoJo", "Acting", 1854), popularity: 1.67 };
const HITCHCOCK = { ...personne(2636, "Alfred Hitchcock", "Directing", 11367), popularity: 3.98 };

const HEAT = film(949, "Heat", 1995, 8800);
const PARRAIN2 = film(240, "Le Parrain, 2e partie", 1974, 14500);
const IRISHMAN = film(398978, "The Irishman", 2019, 7800);
const SCARFACE = film(111, "Scarface", 1983, 13500);
const CASINO = film(524, "Casino", 1995, 6000);
const SEATTLE = film(858, "Nuits blanches à Seattle", 1993, 2800);
const MESSAGE = film(9489, "Vous avez un mess@ge", 1998, 3400);
const FROST_NIXON = film(11499, "Frost / Nixon, l'heure de vérité", 2009, 2000, { original_title: "Frost/Nixon" });

const CREDITS = {
  // Scarface : De Niro y a une voix non créditée (données TMDB) ; un montage d'archives avec les deux.
  "1158/movie": { cast: [{ ...HEAT, character: "Vincent Hanna", order: 0 }, { ...PARRAIN2, character: "Michael", order: 0 },
    { ...IRISHMAN, character: "Jimmy Hoffa", order: 1 }, { ...SCARFACE, character: "Tony Montana", order: 0 },
    { ...film(126314, "Final Cut", 2012, 92), character: "(archive footage)" }] },
  "380/movie": { cast: [{ ...HEAT, character: "Neil McCauley", order: 1 }, { ...PARRAIN2, character: "Vito", order: 1 },
    { ...IRISHMAN, character: "Frank Sheeran", order: 0 }, { ...SCARFACE, character: "Voice (uncredited)" },
    { ...CASINO, character: "Ace", order: 0 }, { ...film(126314, "Final Cut", 2012, 92), character: "(archive footage)" },
    { ...film(77, "Pacino et De Niro : la conversation", 2005, 50, { genre_ids: [99] }), character: "Self" }] },
  "1032/movie": { crew: [{ ...CASINO, job: "Director" }, { ...IRISHMAN, job: "Director" }, { ...film(500, "Shutter Island", 2010, 25000), job: "Director" },
    { ...HEAT, job: "Producer" }] },
  "31/movie": { cast: [{ ...SEATTLE, order: 0 }, { ...MESSAGE, order: 0 }, { ...film(13, "Forrest Gump", 1994, 28000), order: 0 }] },
  "5344/movie": { cast: [{ ...SEATTLE, order: 1 }, { ...MESSAGE, order: 1 }, { ...film(639, "Quand Harry rencontre Sally", 1989, 4000), order: 1 }] },
  "5000/movie": { cast: [{ ...film(99861, "Avengers : L'Ère d'Ultron", 2015, 25000), order: 30 }, { ...film(14784, "The Fall", 2008, 1600), order: 5 }] },
  "5001/tv": { cast: [{ ...serie(9103, "Une série de JoJo", 2010, 300), episode_count: 10 }] },
  "2636/movie": { crew: [{ ...film(539, "Psychose", 1960, 11367), job: "Director" }, { ...film(426, "Sueurs froides", 1958, 6572), job: "Director" }] },
  "11108/movie": { cast: [{ ...film(4638, "Hot Fuzz", 2007, 7000), order: 1 }, { ...film(9999, "Un film ensemble", 2015, 400), order: 2 }] },
  "38025/movie": { cast: [{ ...film(9999, "Un film ensemble", 2015, 400), order: 0 }] },
  "525/movie": { crew: [{ ...film(27205, "Inception", 2010, 38000), job: "Director" }, { ...film(157336, "Interstellar", 2014, 37000), job: "Director" }] },
  // Séries : le talk-show (« Self ») ne compte pas.
  "1158/tv": { cast: [{ ...serie(70, "Angels in America", 2003, 400), episode_count: 6 }, { ...serie(71, "Talk-show", 1990, 300, { genre_ids: [10767] }), character: "Self" }] },
  "380/tv": { cast: [{ ...serie(70, "Angels in America", 2003, 400), episode_count: 1 }, { ...serie(71, "Talk-show", 1990, 300, { genre_ids: [10767] }), character: "Self" },
    { ...serie(72, "Zero Day", 2025, 300), episode_count: 6 }] },
};

const PEOPLE = {
  pacino: [PACINO], "de niro": [DE_NIRO], scorsese: [SCORSESE], "tom hanks": [HANKS], "meg ryan": [RYAN],
  frost: [FROST], nixon: [NIXON], nolan: [NOLAN], bleach: [JULIAN_BLEACH], jojo: [JOJO], hitchcock: [HITCHCOCK],
};

// Résultats des recherches de titres (requête sans accents → résultats).
const TITLES = {
  heat: [HEAT], "frost nixon": [FROST_NIXON], "bonnie and clyde": [film(475, "Bonnie et Clyde", 1968, 2000, { original_title: "Bonnie and Clyde" })],
  "dune 2021": [film(438631, "Dune", 2021, 14000)], dune: [film(438631, "Dune", 2021, 14000), film(841, "Dune", 1985, 3000)],
  thriller: [film(9000, "Thriller", 1983, 900)], "annees 80": [film(8000, "Les Années 80", 1983, 120)],
  1917: [film(530915, "1917", 2020, 13000)], "les annees folles": [film(8001, "Les Années folles", 1960, 40)],
  "harry potter": [film(671, "Harry Potter à l'école des sorciers", 2001, 28000, { original_title: "Harry Potter and the Philosopher's Stone" })],
  "tom et jerry": [film(15602, "Tom et Jerry, le film", 1992, 600)],
  bleach: [film(9100, "Bleach", 2018, 599), film(9101, "Bleach : Memories of Nobody", 2006, 239)],
  jojo: [serie(45790, "JoJo's Bizarre Adventure", 2012, 1686)],
  hitchcock: [film(112336, "Hitchcock", 2012, 1677), film(9102, "Hitchcock : la face cachée du maître du suspense", 2022, 20)],
  // la suite annoncée pour l'an prochain : 0 vote, mais on en parle
  beekeeper: [film(866398, "The Beekeeper", 2024, 3500), film(1300001, "The Beekeeper 2", 2099, 0, { popularity: 6 }),
    film(1300002, "Beekeeper inconnu", 2099, 0, { popularity: 0.3 })],
};

const HORREUR_80 = [film(4488, "Vendredi 13", 1980, 3500, { genre_ids: [27] }), film(694, "Shining", 1980, 18000, { genre_ids: [27] }),
  film(1091, "The Thing", 1982, 7500, { genre_ids: [27] })];
const WESTERNS = [film(68718, "Django Unchained", 2012, 27000, { genre_ids: [37] }), film(429, "Le Bon, la Brute et le Truand", 1966, 9000, { genre_ids: [37] })];

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
let calls;
beforeEach(() => { calls = []; });

/** search et api comme runSearch (index.js), budget compris, avec le TMDB simulé ci-dessus. */
function fakeTmdb(budget = 22) {
  let left = budget;
  const search = async (q, page, extra = {}) => {
    calls.push({ path: "search", q, page, extra });
    if (left-- <= 0) return {};
    if (extra.language || page > 1) return { results: [] };
    return { results: (TITLES[norm(q)] || []).map((it) => ({ ...it })), total_pages: 1 };
  };
  const api = async (path, params = {}) => {
    calls.push({ path, params });
    if (left-- <= 0) return {};
    if (path === "/search/person") return { results: PEOPLE[norm(params.query)] || [] };
    const c = /^\/person\/(\d+)\/(movie|tv)_credits$/.exec(path);
    if (c) return CREDITS[`${c[1]}/${c[2]}`] || { cast: [], crew: [] };
    if (path === "/discover/movie" && params.with_genres === "27" && params["primary_release_date.gte"] === "1980-01-01") {
      return { results: Number(params.page) > 1 ? [film(9377, "La Mouche", 1986, 4000)] : HORREUR_80, total_pages: 3 };
    }
    if (path === "/discover/movie" && params.with_genres === "37") return { results: WESTERNS, total_pages: 5 };
    if (path === "/discover/movie" && params.with_genres === "53") return { results: [film(807, "Seven", 1995, 20000, { genre_ids: [53] })], total_pages: 5 };
    if (path === "/discover/tv" && params.with_keywords === "315058") return { results: [serie(1622, "Supernatural", 2005, 8700)], total_pages: 5 };
    return { results: [] };
  };
  return { search, api, left: () => left };
}

const VOCAB = prepareWords({ star: 200, wars: 100, fight: 80, club: 90, pacino: 1, niro: 1, scorsese: 1, dicaprio: 1, winslet: 1,
  frost: 2, nixon: 2, harry: 67, potter: 42, guerre: 91, haine: 10, kramer: 3, contre: 50 });
async function cherche(q, kind = "movie", page = 1, budget = 22) {
  const t = fakeTmdb(budget), trace = {}, stats = {};
  const out = await smartSearch(q, page, t.search, kind, t.api, { words: async () => VOCAB, trace, stats });
  return { out, names: out.map((it) => it.title || it.name), trace, stats, used: budget - t.left() };
}
const personSearches = () => calls.filter((c) => c.path === "/search/person").map((c) => norm(c.params.query));

// ---------- découpage en personnes ----------
test("decoupage_en_plusieurs_personnes", () => {
  assert.deepEqual(personSplits("pacino de niro", VOCAB), [["pacino", "de niro"]]);
  assert.deepEqual(personSplits("De Niro et Pacino", VOCAB), [["de niro", "pacino"]]);
  assert.deepEqual(personSplits("tom hanks meg ryan", VOCAB), [["tom hanks", "meg ryan"]]);
  assert.deepEqual(personSplits("Leonardo DiCaprio Kate Winslet", VOCAB), [["leonardo dicaprio", "kate winslet"]]);
  assert.deepEqual(personSplits("scorsese de niro", VOCAB), [["scorsese", "de niro"]]);
  assert.deepEqual(personSplits("samuel l jackson, john travolta", VOCAB), [["samuel l jackson", "john travolta"]]);
  assert.deepEqual(personSplits("pacino, de niro & pesci", VOCAB), [["pacino", "de niro", "pesci"]]);
  assert.deepEqual(personSplits("jean-paul belmondo alain delon", VOCAB)[0], ["jean paul belmondo", "alain delon"]);
  assert.deepEqual(personSplits("dicaprio winslet", VOCAB), [["dicaprio", "winslet"]]);
  // Jamais plus de 4 noms à chercher.
  for (const q of ["jennifer aniston courteney cox", "tommy lee jones will smith", "keanu reeves laurence fishburne carrie anne moss"]) {
    assert.ok(new Set(personSplits(q, VOCAB).flat()).size <= 4, q);
  }
});

test("titres_qui_ne_sont_pas_des_personnes", () => {
  for (const q of ["harry potter", "tom et jerry", "thelma et louise", "harry et sally", "bonnie and clyde", "jules et jim",
    "romeo et juliette", "la haine", "kramer contre kramer", "star wars", "fight club", "omar sy", "robert de niro", "al pacino",
    "1917", "dune 2", "the boys saison 4", "max et les ferrailleurs", "le diner de cons", "nolan", "la guerre des mondes"]) {
    assert.deepEqual(personSplits(q, VOCAB), [], q);
  }
  // Sans vocabulaire : pas de noms de famille seuls (on ne sait pas si ce sont des mots de titres).
  assert.deepEqual(personSplits("dicaprio winslet", null), []);
});

// ---------- genre et époque ----------
test("genre_et_epoque_reconnus", () => {
  const g = (q, kind = "movie") => {
    const r = genreQuery(q, kind);
    return r && { genres: r.with_genres, kw: r.with_keywords, from: r.from, to: r.to, country: r.country, lang: r.lang, bare: r.bare };
  };
  const base = { kw: "", country: null, lang: null, bare: false };
  assert.deepEqual(g("horreur années 80"), { ...base, genres: "27", from: 1980, to: 1989 });
  assert.deepEqual(g("les films d'horreur des années 80"), { ...base, genres: "27", from: 1980, to: 1989 });
  assert.deepEqual(g("comédie des années 90"), { ...base, genres: "35", from: 1990, to: 1999 });
  assert.deepEqual(g("film de guerre 70s"), { ...base, genres: "10752", from: 1970, to: 1979 });
  assert.deepEqual(g("thriller 80's"), { ...base, genres: "53", from: 1980, to: 1989 });
  assert.deepEqual(g("western 1960"), { ...base, genres: "37", from: 1960, to: 1960 });
  assert.deepEqual(g("science-fiction 2010"), { ...base, genres: "878", from: 2010, to: 2010 });
  assert.deepEqual(g("SF années 2000"), { ...base, genres: "878", from: 2000, to: 2009 });
  assert.deepEqual(g("comédie romantique années 1990"), { ...base, genres: "35,10749", from: 1990, to: 1999 });
  assert.deepEqual(g("polar français"), { ...base, genres: "80", from: null, to: null, country: "FR" });
  assert.deepEqual(g("horreur coréen"), { ...base, genres: "27", from: null, to: null, country: "KR" });
  assert.deepEqual(g("animé années 2000", "series"), { ...base, genres: "16", from: 2000, to: 2009, lang: "ja" });
  assert.deepEqual(g("séries policières années 90", "series"), { ...base, genres: "80", from: 1990, to: 1999 });
  assert.deepEqual(g("dessin animé"), { ...base, genres: "16", from: null, to: null, bare: true });
  // Séries sans genre TMDB « horreur » : le mot-clé horror.
  assert.deepEqual(g("horreur", "series"), { ...base, genres: "", kw: "315058", from: null, to: null, bare: true });
  // Pas des genres : titres, époque seule, décennie bancale, genre sans équivalent pour ce type.
  for (const q of ["1917", "Les Années folles", "Années 80", "la guerre des mondes", "guerre des étoiles", "the boys saison 4",
    "dune 2021", "horreur années 85", "horreur années 80 1990", "nolan", "comédie la haine", "française"]) {
    assert.equal(genreQuery(q, "movie"), null, q);
  }
  assert.equal(genreQuery("enfants", "movie"), null);
});

test("genre_parametres_discover", () => {
  const p = genreParams(genreQuery("horreur années 80", "movie"), "movie");
  assert.equal(p.with_genres, "27");
  assert.equal(p["primary_release_date.gte"], "1980-01-01");
  assert.equal(p["primary_release_date.lte"], "1989-12-31");
  assert.equal(p.sort_by, "popularity.desc");
  assert.ok(p["vote_count.gte"] >= 100);                         // des titres connus
  assert.deepEqual(p.without_genres.split("|").sort(), ["16", "99"]);   // ni documentaires ni dessins animés
  const tv = genreParams(genreQuery("animé années 2000", "series"), "series", 2);
  assert.equal(tv["first_air_date.gte"], "2000-01-01");
  assert.equal(tv.with_original_language, "ja");
  assert.equal(tv.page, 2);
  assert.ok(!tv.without_genres.split("|").includes("16"));
  assert.ok(tv.without_genres.split("|").includes("10767"));
  const doc = genreParams(genreQuery("documentaire", "movie"), "movie");
  assert.ok(!(doc.without_genres || "").split("|").includes("99"));
  // Une seule année, un autre pays : moins de votes exigés.
  assert.ok(genreParams(genreQuery("western 1960", "movie"), "movie")["vote_count.gte"] < p["vote_count.gte"]);
});

// ---------- recherche complète ----------
test("deux_acteurs_ensemble", async () => {
  for (const q of ["pacino de niro", "de niro et pacino", "films avec pacino et de niro"]) {
    calls = [];
    const r = await cherche(q);
    assert.match(r.trace.head, /^ensemble /, q);
    // Les plus connus d'abord ; ni rôle non crédité (Scarface), ni archives, ni documentaire.
    assert.deepEqual(r.names.slice(0, 3), ["Le Parrain, 2e partie", "Heat", "The Irishman"], q);
    assert.ok(!r.names.includes("Scarface") && !r.names.includes("Final Cut") && !r.names.some((n) => /conversation/.test(n)), q);
    assert.ok(r.stats.sure, q);                                   // pas besoin de Gemini
    assert.ok(r.used <= 12, `${q} : ${r.used} appels`);
    assert.ok(calls.every((c) => !String(c.path).startsWith("/discover")), q);
  }
  const r = await cherche("tom hanks meg ryan");
  assert.deepEqual(r.names.slice(0, 2), ["Vous avez un mess@ge", "Nuits blanches à Seattle"]);
});

test("acteur_et_realisateur", async () => {
  const r = await cherche("scorsese de niro");
  assert.equal(r.trace.head, "ensemble Martin Scorsese + Robert De Niro");
  // Réalisés par Scorsese, joués par De Niro : pas Heat (Scorsese n'y est que producteur… dans ce TMDB simulé).
  assert.deepEqual(r.names.slice(0, 2), ["The Irishman", "Casino"]);
  assert.ok(!r.names.includes("Heat") && !r.names.includes("Shutter Island"));
});

test("deux_acteurs_ensemble_series", async () => {
  const r = await cherche("pacino de niro", "series");
  assert.equal(r.names[0], "Angels in America");
  assert.ok(!r.names.includes("Talk-show"));
  assert.ok(calls.some((c) => c.path === "/person/1158/tv_credits"));
});

test("titre_avant_les_personnes", async () => {
  // « frost nixon » : deux personnes connues avec un film en commun, mais le titre Frost/Nixon reste devant.
  const r = await cherche("frost nixon");
  assert.equal(r.names[0], "Frost / Nixon, l'heure de vérité");
  assert.equal(r.names[1], "Un film ensemble");
  // Prénoms seuls : pas même une recherche de personnes.
  for (const q of ["bonnie and clyde", "tom et jerry", "harry potter"]) {
    calls = [];
    const t = await cherche(q);
    assert.equal(t.trace.head, null, q);
    assert.deepEqual(personSearches().filter((n) => n !== norm(q)), [], q);
    assert.equal(t.names[0], TITLES[norm(q)][0].title, q);
  }
});

// « bleach » : l'animé (et ses films), pas la filmographie de Julian Bleach, que seul un petit rôle dans un très gros
// film rendait « connu ». Une personne peu populaire ne passe plus devant un titre exact vu (300 votes et plus).
test("titre_avant_une_personne_peu_connue", async () => {
  const r = await cherche("bleach");
  assert.equal(r.trace.head, null);
  assert.equal(r.names[0], "Bleach");
});

// « jojo » : l'animé (1 686 votes) passe devant la chanteuse JoJo, pas assez populaire pour que ses titres phares
// (1 854 votes) comptent. « hitchcock » : Alfred Hitchcock est bien plus connu que le film Hitchcock (2012), qui reste
// en tête, suivi de ses films (pas des documentaires sur lui).
test("titre_proche_et_personne", async () => {
  assert.equal((await cherche("jojo", "series")).names[0], "JoJo's Bizarre Adventure");
  const h = await cherche("hitchcock");
  assert.deepEqual(h.names.slice(0, 3), ["Hitchcock", "Psychose", "Sueurs froides"]);
  assert.equal(h.trace.head, "titre puis personne Alfred Hitchcock");
});

test("une_seule_personne_inchangee", async () => {
  const r = await cherche("nolan");
  assert.equal(r.trace.head, "personne Christopher Nolan");
  assert.deepEqual(r.names, ["Inception", "Interstellar"]);
  assert.deepEqual(personSearches(), ["nolan"]);
  assert.ok(!calls.some((c) => String(c.path).startsWith("/discover")));
});

test("pas_de_noms_ni_de_genre_pour_un_titre", async () => {
  for (const q of ["dune 2021", "dune", "heat", "1917", "les annees folles", "annees 80"]) {
    calls = [];
    const r = await cherche(q);
    assert.equal(r.trace.head, null, q);
    assert.equal(r.names[0], TITLES[norm(q)][0].title, q);
    assert.ok(!calls.some((c) => String(c.path).startsWith("/discover")), q);
    assert.ok(personSearches().every((n) => n === norm(q)), q);
  }
});

test("genre_et_decennie", async () => {
  const r = await cherche("horreur années 80");
  assert.equal(r.trace.head, "genre horreur 1980-1989");
  assert.deepEqual(r.names.slice(0, 3), ["Vendredi 13", "Shining", "The Thing"]);
  assert.ok(r.stats.sure);
  // Pas de recherche de secours ni de personne : un appel discover en plus de la recherche habituelle.
  assert.ok(r.used <= 8, `${r.used} appels`);
  assert.equal(calls.filter((c) => c.path === "/discover/movie").length, 1);
  // Page suivante : la suite de la liste du genre, pas la recherche de titres.
  calls = [];
  const p2 = await cherche("horreur années 80", "movie", 2);
  assert.deepEqual(p2.names, ["La Mouche"]);
  assert.equal(calls.find((c) => c.path === "/discover/movie").params.page, 2);
});

test("genre_seul", async () => {
  // « western » : la liste des westerns (avant : un acteur nommé Western, des titres inconnus).
  const w = await cherche("western");
  assert.equal(w.trace.head, "genre western");
  assert.equal(w.names[0], "Django Unchained");
  // « thriller » : un titre connu porte exactement ce nom, la recherche reste celle d'avant.
  const t = await cherche("thriller");
  assert.equal(t.trace.head, null);
  assert.deepEqual(t.names, ["Thriller"]);
  calls = [];
  const t2 = await cherche("thriller", "movie", 2);
  assert.deepEqual(t2.names, []);
  assert.ok(!calls.some((c) => String(c.path).startsWith("/discover")));
  // Séries d'horreur : le mot-clé TMDB, faute de genre.
  const s = await cherche("horreur", "series");
  assert.equal(s.names[0], "Supernatural");
});

test("budget_des_nouvelles_recherches", async () => {
  // Au pire : 4 noms cherchés, 3 filmographies, la recherche de secours… toujours dans les 22 appels de runSearch.
  for (const [q, kind] of [["pacino, de niro et pesci", "movie"], ["jennifer aniston courteney cox", "series"],
    ["tommy lee jones will smith", "movie"], ["comédie romantique années 90", "movie"], ["animé", "series"]]) {
    calls = [];
    const r = await cherche(q, kind);
    assert.ok(r.used <= 20, `${q} : ${r.used} appels`);
  }
});

// ---------- par l'addon ----------
test("addon_genre_sans_gemini", async () => {
  oublierInfos();
  const store = new Map(), urls = [];
  globalThis.caches = { default: {
    match: async (req) => (store.has(req.url) ? new Response(store.get(req.url)) : undefined),
    put: async (req, res) => { store.set(req.url, await res.text()); },
  } };
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    urls.push(u);
    if (u.pathname === "/3/discover/movie" && u.searchParams.get("with_genres") === "27") return new Response(JSON.stringify({ results: HORREUR_80, total_pages: 1 }));
    const m = /^\/3\/movie\/(\d+)$/.exec(u.pathname);
    if (m) return new Response(JSON.stringify({ id: Number(m[1]), imdb_id: `tt${m[1]}` }));
    return new Response(JSON.stringify({ results: [] }));
  };
  // Avec une clé Gemini dans le lien : « horreur années 80 » ressemble à une description, mais c'est un genre.
  const cfg = Buffer.from(JSON.stringify({ k: "AIzaSyCleDeTest0123456789abcdefghijkl" })).toString("base64url");
  const res = await worker.fetch(new Request(`https://x/${cfg}/catalog/movie/recherche-films/search=${encodeURIComponent("horreur années 80")}.json`),
    { TMDB_API_KEY: "tmdb" }, { waitUntil: () => {} });
  const { metas } = await res.json();
  assert.deepEqual(metas.slice(0, 3).map((m) => [m.id, m.name, m.type]), [["tt4488", "Vendredi 13", "movie"], ["tt694", "Shining", "movie"], ["tt1091", "The Thing", "movie"]]);
  assert.ok(metas[0].poster);
  assert.ok(!urls.some((u) => u.hostname.includes("generativelanguage")), "Gemini appelé pour un genre");
  // 50 appels sortants au plus par requête (Cloudflare) : recherche + fiches.
  assert.ok(urls.length < 50, `${urls.length} appels`);
});

// « ichigo » : seulement des titres obscurs qui contiennent le mot (Ichigo 100%, 17 votes). C'est le héros de Bleach :
// Gemini est consulté, ses titres passent devant.
test("addon_titres_obscurs_gemini_consulte", async () => {
  oublierInfos();
  const store = new Map(), urls = [];
  globalThis.caches = { default: {
    match: async (req) => (store.has(req.url) ? new Response(store.get(req.url)) : undefined),
    put: async (req, res) => { store.set(req.url, await res.text()); },
  } };
  const BLEACH = serie(30984, "Bleach", 2004, 2306, { genre_ids: [16] });
  const ICHIGO = serie(20200, "Ichigo 100%", 2005, 17, { genre_ids: [16] });
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    urls.push(u);
    if (u.hostname.includes("generativelanguage")) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ titles: [
      { title: "Bleach", title_fr: "Bleach", title_en: "Bleach", year: 2004, type: "serie", saga: false }] }) }] } }] }));
    if (u.pathname === "/3/search/tv") {
      const q = norm(u.searchParams.get("query"));
      return new Response(JSON.stringify({ results: q === "bleach" ? [BLEACH] : q === "ichigo" && u.searchParams.get("page") === "1" ? [ICHIGO] : [], total_pages: 1 }));
    }
    const m = /^\/3\/tv\/(\d+)$/.exec(u.pathname);
    if (m) return new Response(JSON.stringify({ id: Number(m[1]), external_ids: { imdb_id: `tt${m[1]}` } }));
    return new Response(JSON.stringify({ results: [] }));
  };
  const cfg = Buffer.from(JSON.stringify({ k: "AIzaSyCleDeTest0123456789abcdefghijkl" })).toString("base64url");
  const res = await worker.fetch(new Request(`https://x/${cfg}/catalog/series/recherche-series/search=ichigo.json`), { TMDB_API_KEY: "tmdb" }, { waitUntil: () => {} });
  const { metas } = await res.json();
  assert.deepEqual(metas.map((m) => m.name), ["Bleach", "Ichigo 100%"]);
  assert.ok(urls.some((u) => u.hostname.includes("generativelanguage")));
});

// « shingeki no kyojin » sans clé Gemini : TMDB ne connaît pas ce nom, AniList le traduit (Attack on Titan, 2013).
test("addon_anime_par_son_nom_japonais_sans_gemini", async () => {
  oublierInfos();
  const store = new Map(), urls = [];
  globalThis.caches = { default: {
    match: async (req) => (store.has(req.url) ? new Response(store.get(req.url)) : undefined),
    put: async (req, res) => { store.set(req.url, await res.text()); },
  } };
  const AOT = serie(1429, "L'Attaque des Titans", 2013, 7000, { original_name: "進撃の巨人", genre_ids: [16] });
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    urls.push(u);
    // AniList par le relais du service d'affiches (AniList refuse Cloudflare).
    if (u.pathname === "/anilist.json" && u.searchParams.get("q") === "shingeki no kyojin") return new Response(JSON.stringify({ data: {
      a: { media: [{ title: { english: "Attack on Titan", romaji: "Shingeki no Kyojin" }, synonyms: [], format: "TV", startDate: { year: 2013 }, popularity: 1069303 }] },
      c: { characters: [] } } }));
    if (u.pathname === "/3/search/tv") {
      const q = norm(u.searchParams.get("query"));
      return new Response(JSON.stringify({ results: q === "attack on titan" && u.searchParams.get("language") === "en-US" ? [{ ...AOT, name: "Attack on Titan" }]
        : q === "l attaque des titans" || u.searchParams.get("query") === "進撃の巨人" ? [AOT] : [], total_pages: 1 }));
    }
    const m = /^\/3\/tv\/(\d+)$/.exec(u.pathname);
    if (m) return new Response(JSON.stringify({ id: Number(m[1]), external_ids: { imdb_id: `tt${m[1]}` } }));
    return new Response(JSON.stringify({ results: [] }));
  };
  const res = await worker.fetch(new Request(`https://x/catalog/series/recherche-series/search=${encodeURIComponent("shingeki no kyojin")}.json`), { TMDB_API_KEY: "tmdb" }, { waitUntil: () => {} });
  const { metas } = await res.json();
  assert.equal(metas[0] && metas[0].name, "L'Attaque des Titans");
  assert.ok(!urls.some((u) => u.hostname.includes("generativelanguage")));
});

// « walter white » : ni un titre ni une personne pour TMDB. Wikidata : le personnage de Breaking Bad (identifiant TMDB 1396).
test("addon_personnage_par_wikidata", async () => {
  oublierInfos();
  const store = new Map();
  globalThis.caches = { default: {
    match: async (req) => (store.has(req.url) ? new Response(store.get(req.url)) : undefined),
    put: async (req, res) => { store.set(req.url, await res.text()); },
  } };
  const BB = { id: 1396, name: "Breaking Bad", original_name: "Breaking Bad", first_air_date: "2008-01-20", vote_count: 16000, popularity: 300, poster_path: "/bb.jpg", genres: [{ id: 18 }] };
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    if (u.hostname === "www.wikidata.org" && u.searchParams.get("action") === "wbsearchentities")
      return new Response(JSON.stringify({ search: [{ id: "Q23554", label: "Walter White", match: { type: "label", text: "Walter White" } }] }));
    if (u.hostname === "www.wikidata.org") return new Response(JSON.stringify({ query: { search: [] } }));
    if (u.hostname === "query.wikidata.org") return new Response(JSON.stringify({ results: { bindings: [
      { item: { value: "http://www.wikidata.org/entity/Q23554" }, itemLabel: { value: "Walter White" }, isl: { value: "40" },
        w: { value: "http://www.wikidata.org/entity/Q1079" }, wtv: { value: "1396" }, sl: { value: "120" } }] } }));
    if (u.pathname === "/3/tv/1396") return new Response(JSON.stringify({ ...BB, external_ids: { imdb_id: "tt0903747" } }));
    const m = /^\/3\/tv\/(\d+)$/.exec(u.pathname);
    if (m) return new Response(JSON.stringify({ id: Number(m[1]) }));
    return new Response(JSON.stringify({ results: [] }));
  };
  const res = await worker.fetch(new Request(`https://x/catalog/series/recherche-series/search=${encodeURIComponent("walter white")}.json`), { TMDB_API_KEY: "tmdb" }, { waitUntil: () => {} });
  const { metas } = await res.json();
  assert.equal(metas[0] && metas[0].name, "Breaking Bad");
});

test("un_film_a_venir_dont_on_parle_est_trouve", async () => {
  const { names } = await cherche("beekeeper");
  assert.ok(names.includes("The Beekeeper"), names.join(", "));
  assert.ok(names.includes("The Beekeeper 2"), names.join(", "));
  // à venir mais dont personne ne parle : toujours écarté
  assert.ok(!names.includes("Beekeeper inconnu"), names.join(", "));
});
