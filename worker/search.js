/**
 * Recherche du Catalogue FR, plus tolérante et mieux classée que celle de TMDB.
 *
 * Plusieurs recherches TMDB partent en même temps (requête telle quelle, nettoyée, corrigée,
 * au pluriel, sigle, année, personne, saga, studio, titres anglais), puis tous les résultats
 * sont classés ensemble : ressemblance du titre (français, original ou anglais) + notoriété
 * (nombre de votes, popularité). Un titre exact mais inconnu (« L'intouchable ») passe donc
 * après un titre presque exact et très connu (« Intouchables »).
 *   - sigles et surnoms : « got » → Game of Thrones, « jeu du calmar » → Squid Game…
 *   - mots en trop : « film barbie », « les films de nolan », « the boys saison 4 », « lupin partie 3 »
 *   - fautes de frappe : chaque mot inconnu est corrigé avec le vocabulaire des titres connus
 *     (data/search-words.json, refait chaque nuit) : « inseption » → inception, « le parain »
 *     → parrain. En dernier recours, débuts de mots (« inters ») que TMDB reconnaît.
 *   - titres anglais : « spirited away » → Le Voyage de Chihiro, « home alone » → Maman, j'ai raté l'avion
 *   - titres composés, au singulier comme au pluriel : « monstre » → les 4 séries Monstre
 *   - année : « dune 2021 » ; suites : « dune 2 », « star wars 4 », « jurassic world 2 »
 *   - acteurs et réalisateurs : « nolan », « omar sy » ; studios et plateformes : « pixar », « netflix »
 *   - plusieurs personnes ensemble : « pacino de niro », « tom hanks et meg ryan », « scorsese de niro »
 *   - genre et époque, sans l'IA : « horreur années 80 », « western 1960 », « comédie française », « animé »
 */
import { GENRES } from "./config.js";

// Sigles et surnoms courants → titre à chercher. Clés en minuscules, sans accents ni ponctuation.
export const ALIASES = {
  got: "Game of Thrones", hotd: "House of the Dragon", hdd: "House of the Dragon",
  twd: "The Walking Dead", bb: "Breaking Bad", bcs: "Better Call Saul",
  tlou: "The Last of Us", himym: "How I Met Your Mother", tbbt: "The Big Bang Theory",
  b99: "Brooklyn Nine-Nine", ahs: "American Horror Story", lcdp: "La Casa de Papel",
  pll: "Pretty Little Liars", oitnb: "Orange Is the New Black", tvd: "The Vampire Diaries",
  soa: "Sons of Anarchy", gg: "Gossip Girl", st: "Stranger Things", ts: "The Sopranos",
  aot: "L'Attaque des Titans", snk: "L'Attaque des Titans", op: "One Piece",
  jjk: "Jujutsu Kaisen", mha: "My Hero Academia", hxh: "Hunter x Hunter",
  dbz: "Dragon Ball Z", dbs: "Dragon Ball Super", fma: "Fullmetal Alchemist", fmab: "Fullmetal Alchemist",
  opm: "One Punch Man", kny: "Demon Slayer", csm: "Chainsaw Man", sl: "Solo Leveling",
  lotr: "Le Seigneur des anneaux", sda: "Le Seigneur des anneaux", sdla: "Le Seigneur des anneaux",
  lsda: "Le Seigneur des anneaux", hp: "Harry Potter", sw: "Star Wars",
  potc: "Pirates des Caraïbes", pdc: "Pirates des Caraïbes", mib: "Men in Black",
  bttf: "Retour vers le futur", rvlf: "Retour vers le futur", ij: "Indiana Jones",
  jp: "Jurassic Park", tdk: "The Dark Knight", gotg: "Les Gardiens de la Galaxie",
  ff: "Fast & Furious", "fast and furious": "Fast & Furious",
  // Titres connus en France sous un autre nom que celui de TMDB.
  "jeu du calmar": "Squid Game", "le jeu du calmar": "Squid Game",
  "money heist": "La casa de papel", "la maison de papier": "La casa de papel",
};

// Studios et plateformes → recherche « discover » TMDB. Clés passées par norm() : « disney+ »,
// « canal+ » et « paramount+ » deviennent « disney », « canal », « paramount ».
const C = (id) => ({ with_companies: id });
const N = (id) => ({ with_networks: id });
const P = (id) => ({ with_watch_providers: id, with_watch_monetization_types: "flatrate" });
const STUDIO_LIST = [
  [["pixar", "disney pixar"], { movie: C("3") }],
  [["ghibli", "studio ghibli"], { movie: C("10342") }],
  [["marvel", "marvel studios", "mcu"], { movie: C("420") }],
  [["dc", "dc comics"], { movie: C("429|128064") }],
  [["dreamworks", "dreamworks animation"], { movie: C("521") }],
  [["illumination"], { movie: C("6704") }],
  [["lucasfilm"], { movie: C("1") }],
  [["warner", "warner bros"], { movie: C("174") }],
  [["universal"], { movie: C("33") }],
  [["a24"], { movie: C("41077") }],
  [["blumhouse"], { movie: C("3172") }],
  [["disney", "walt disney"], { movie: C("2|6125"), series: N("2739") }],
  [["disney plus"], { movie: P("337"), series: N("2739") }],
  [["netflix"], { movie: P("8"), series: N("213") }],
  [["prime video", "amazon", "amazon prime", "amazon prime video"], { movie: P("119"), series: N("1024") }],
  [["hbo", "hbo max"], { movie: P("1899"), series: N("49|3186") }],
  [["apple tv", "apple tv plus"], { movie: P("350"), series: N("2552") }],
  [["paramount", "paramount plus"], { movie: P("531"), series: N("4330") }],
  [["canal", "canal plus"], { movie: P("381"), series: N("285") }],
  [["crunchyroll"], { movie: P("283"), series: P("283") }],
];
export const STUDIOS = Object.fromEntries(STUDIO_LIST.flatMap(([keys, v]) => keys.map((k) => [k, v])));

// ---------- texte ----------
/** Minuscules, sans accents ni ponctuation, espaces simples. */
export function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Distance d'édition avec inversion de deux lettres (« teh » → « the »), arrêtée au-delà de max. */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

/** Ressemblance entre deux mots (0 à 1). Un début de mot tapé en entier compte comme exact. */
function wordSim(q, w) {
  if (w.startsWith(q) && q.length >= 3) return 1;
  return 1 - levenshtein(q, w) / Math.max(q.length, w.length);
}

function bigrams(s) {
  const t = s.replace(/ /g, "");
  const out = new Map();
  for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); out.set(g, (out.get(g) || 0) + 1); }
  return out;
}

function dice(a, b) {
  const A = bigrams(a), B = bigrams(b);
  let inter = 0, total = 0;
  for (const [g, n] of A) { inter += Math.min(n, B.get(g) || 0); total += n; }
  for (const n of B.values()) total += n;
  return total ? (2 * inter) / total : 0;
}

/** Ressemblance entre la requête et un titre (0 à 1) : mot à mot + forme générale. */
export function similarity(query, title) {
  const q = norm(query), t = norm(title);
  if (!q || !t) return 0;
  if (q === t) return 1;
  const tw = t.split(" ");
  const qw = q.split(" ");
  const words = qw.reduce((sum, w) => sum + Math.max(...tw.map((x) => wordSim(w, x))), 0) / qw.length;
  // Le titre commence par la requête (« stranger things » → « Stranger Things : Chroniques… »).
  const prefix = t.startsWith(q) ? 1 : 0;
  return Math.max(0.6 * words + 0.4 * dice(q, t), prefix ? 0.9 + 0.1 * dice(q, t) : 0);
}

/** Titres d'un résultat : français, d'origine et anglais (ajouté par la recherche en anglais). */
const titlesOf = (it) => [it.title || it.name, it.original_title || it.original_name, it.en_title].filter(Boolean);

/** Meilleure ressemblance d'un résultat TMDB, tous titres confondus. */
export function scoreOf(query, it) {
  return Math.max(0, ...titlesOf(it).map((t) => similarity(query, t)));
}

const bare = (s) => norm(s).replace(/^(the|a|an|le|la|les|l|un|une) /, "");

/** Titre identique à la requête, article de tête mis à part (« office » → The Office). */
export function isExact(query, it) {
  const q = bare(query);
  return !!q && titlesOf(it).some((t) => bare(t) === q);
}

/** Sans article de tête ni « s » final aux mots : « Les Monstres » vaut « monstre ». */
const bareSingular = (s) => norm(s).split(" ").map((w) => (w.length > 3 ? w.replace(/s$/, "") : w)).join(" ")
  .replace(/^(the|a|an|le|la|les|l|un|une) /, "");

/**
 * Le titre est la requête, ou une partie d'un titre composé l'est, au singulier comme au pluriel :
 * « monstre » → « Monstre : L'Histoire d'Ed Gein », « DAHMER - Monstre : … », « Monstres : … ».
 * Un titre simple doit être identique (« cars » ne doit pas donner « The Car »).
 */
export function titleMatch(query, it) {
  if (isExact(query, it)) return true;
  const q = bareSingular(query);
  return !!q && titlesOf(it).some((t) => {
    const parts = String(t).split(/\s*[:–—]\s+|\s+-\s+/);
    return parts.length > 1 && parts.some((part) => bareSingular(part) === q);
  });
}

/**
 * La requête avec son premier mot long au pluriel (ou au singulier), que TMDB ne fait pas
 * correspondre : « monstre » → monstres, « pirate des caraibes » → pirates des caraibes.
 */
export function pluralVariant(query) {
  const words = query.trim().toLowerCase().split(/\s+/);
  const i = words.findIndex((w) => /^[a-zà-ÿ]{4,}$/.test(w));
  if (i < 0) return null;
  words[i] = words[i].endsWith("s") ? words[i].slice(0, -1) : `${words[i]}s`;
  return words.join(" ");
}

// Mots en trop autour du titre : « film barbie », « barbie le film », « les films de nolan ».
const NOISE_HEAD = /^(?:(?:le|la|les|un|une|des|the)\s+)?(?:films?|movies?|s[ée]ries?|animes?|anim[ée]s?|dessins? anim[ée]s?|documentaires?)\s+(?:(?:de|du|des|avec)\s+|d['’]\s*)?/i;
const NOISE_TAIL = /\s+(?:(?:le|la|the)\s+)?(?:film|movie|s[ée]rie|series|anime)$/i;
// Séries : la saison ou l'épisode n'aide pas TMDB (« the boys saison 4 », « lupin partie 3 », « the witcher s3 »).
const SEASON_TAIL = /\s+(?:(?:saison|season|partie|part|livre|book|s)\s*\d{1,2}(?:\s*(?:e|ep|[ée]pisode)\s*\d{1,3})?|s\d{1,2}\s*e\d{1,3}|\d{1,2})$/i;

/** La requête sans les mots en trop, ou null si rien n'a changé. */
export function cleanQuery(query, kind) {
  const q = query.trim();
  let s = q.replace(NOISE_HEAD, "").replace(NOISE_TAIL, "");
  if (kind === "series") s = s.replace(SEASON_TAIL, "");
  s = s.trim();
  return s.length >= 2 && s.toLowerCase() !== q.toLowerCase() ? s : null;
}

// ---------- fautes de frappe ----------
/**
 * Vocabulaire des titres connus ({ mot: poids }) préparé pour la correction : rangé par
 * première lettre puis par longueur, pour ne comparer qu'une petite partie des mots.
 */
export function prepareWords(data) {
  const weights = new Map(Object.entries(data || {}));
  const byFirst = new Map();
  for (const w of weights.keys()) {
    if (!byFirst.has(w[0])) byFirst.set(w[0], new Map());
    const byLen = byFirst.get(w[0]);
    if (!byLen.has(w.length)) byLen.set(w.length, []);
    byLen.get(w.length).push(w);
  }
  return { weights, byFirst };
}

const sorted = (w) => [...w].sort().join("");

/**
 * Les mots connus les plus proches de w parmi ceux qui commencent par une des lettres données, le meilleur d'abord
 * (au plus `n`).
 */
function closestWords(w, vocab, firsts, n = 1) {
  const max = w.length <= 5 ? 1 : 2;
  const found = [], sortedW = sorted(w);
  for (const f of firsts) {
    const byLen = vocab.byFirst.get(f);
    if (!byLen) continue;
    for (let len = w.length - max; len <= w.length + max; len++) {
      for (const c of byLen.get(len) || []) {
        // Les mêmes lettres dans un autre ordre (« bounia » → boiuna) : une seule faute, et préférée à une lettre
        // changée (« bodnia ») ; mesuré, c'était deux fautes.
        const anagram = c.length === w.length && sorted(c) === sortedW;
        const d = anagram ? 1 : editDistance(w, c, max);
        if (d > max) continue;
        // À distance égale : une lettre oubliée plutôt qu'ajoutée (« pice » → piece, pas pie),
        // le pluriel (« blinder » → blinders), puis le mot le plus présent dans les titres connus.
        const score = d - (c.length >= w.length ? 0.2 : 0) - (c === `${w}s` ? 0.3 : 0) - (anagram ? 0.3 : 0)
          - 0.1 * Math.log10(1 + vocab.weights.get(c));
        found.push({ c, score });
      }
    }
  }
  return found.sort((a, b) => a.score - b.score).slice(0, n).map((x) => x.c);
}
const closestWord = (w, vocab, firsts) => closestWords(w, vocab, firsts)[0] || null;

// Requête très longue (un texte collé au hasard) : coupée à 100 caractères, et la correction ne regarde que ses
// 10 premiers mots (de 30 lettres au plus). Chaque mot inconnu est comparé à une bonne part du vocabulaire :
// au-delà, le temps de calcul permis par Cloudflare était dépassé (erreur 1102).
export const MAX_QUERY = 100;
const MAX_FIX_WORDS = 10;

/** Requête ramenée à MAX_QUERY caractères, coupée entre deux mots si possible. */
export function capQuery(text) {
  const s = String(text || "").trim();
  if (s.length <= MAX_QUERY) return s;
  const cut = s.slice(0, MAX_QUERY), space = cut.lastIndexOf(" ");
  return (space > MAX_QUERY / 2 ? cut.slice(0, space) : cut).trim();
}

/**
 * Corrige les mots inconnus du vocabulaire : le mot connu le plus proche (1 faute jusqu'à
 * 5 lettres, 2 au-delà). On cherche d'abord parmi les mots qui commencent par la même lettre
 * (la faute est rarement sur la première), puis parmi tous. null si rien n'est corrigé.
 */
export function correctQuery(text, vocab) {
  return correctQueries(text, vocab)[0] || null;
}

/**
 * Comme correctQuery, plus une 2e correction : le premier mot corrigé remplacé par son 2e mot le plus proche
 * (« beware bounia » → « beware bodnia », à une faute, et « beware boiuna », à deux : Beware Boiúna). Les deux
 * sont cherchées ; le classement garde le titre qui ressemble le plus à la requête. [] si rien n'est corrigé.
 */
export function correctQueries(text, vocab) {
  if (!vocab || !vocab.weights.size) return [];
  let changed = false, alt = null;
  const words = norm(text).split(" ").filter(Boolean);
  const out = words.map((w, i) => {
    if (i >= MAX_FIX_WORDS || w.length < 4 || w.length > 30 || /\d/.test(w) || vocab.weights.has(w)) return w;
    let best = closestWords(w, vocab, [w[0]], 2);
    if (!best.length) best = closestWords(w, vocab, [...vocab.byFirst.keys()].filter((f) => f !== w[0]), 2);
    if (!best.length) return w;
    changed = true;
    if (alt === null && best[1]) alt = { i, w: best[1] };
    return best[0];
  });
  if (!changed) return [];
  const first = out.join(" ");
  if (!alt) return [first];
  const second = out.map((w, i) => (i === alt.i ? alt.w : w)).join(" ");
  return [first, second];
}

/** Requêtes de secours pour une faute que le vocabulaire n'a pas su corriger : débuts de mots. */
export function fallbackQueries(query) {
  const words = norm(query).split(" ").filter(Boolean);
  const out = [];
  const add = (s) => { if (s && s.length >= 3 && !out.includes(s) && s !== norm(query)) out.push(s); };
  add(words.join(" "));                                            // sans accents ni ponctuation
  // Chaque mot significatif seul, les plus longs d'abord (« things » → Stranger Things).
  [...words].filter((w) => w.length >= 4).sort((a, b) => b.length - a.length).slice(0, 2).forEach(add);
  // Débuts du premier mot long : la faute est souvent au milieu ou à la fin.
  const long = words.find((w) => w.length >= 5) || words[0] || "";
  add(long.slice(0, Math.ceil(long.length / 2)));
  add(long.slice(0, 3));
  return out.slice(0, 4);
}

// ---------- suites et sagas ----------
const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix"];

/** « dune 2 », « rocky iv », « john wick chapitre 4 » → { base, n }. De 1 à 20 (I à IX en chiffres romains). */
export function sequelOf(query) {
  const m = query.trim().toLowerCase()
    .match(/^(.+?)[\s:,-]+(?:(?:partie|part|[ée]pisode|chapitre|chapter|vol(?:ume)?\.?)\s*)?([1-9]|1\d|20|i{1,3}|iv|vi{0,3}|ix)$/);
  if (!m) return null;
  return { base: m[1].trim(), n: /\d/.test(m[2]) ? Number(m[2]) : ROMAN.indexOf(m[2]) + 1 };
}

/** Nom d'une saga TMDB sans « - Saga », « Collection »… */
const sagaName = (s) => String(s || "").replace(/\s*[-–:]?\s*(la )?(saga|collection|trilogie|trilogy)\s*$/i, "");

const SPIN_OFF = /\b(presents|a .+ story)\b/i;

/**
 * Le n-ième film d'une saga. Un film numéroté dans son titre garde son numéro (« Toy Story 4 »,
 * « épisode I ») ; les autres prennent les places libres dans l'ordre de sortie : Star Wars,
 * dont seuls les épisodes I à III sont numérotés sur TMDB, donne bien « La Guerre des étoiles »
 * pour 4. « 2e partie » / « Part 2 » n'est pas un numéro de suite (Harry Potter 7 et 8), ni un
 * chiffre du nom de la saga (« Les 4 Fantastiques »). Les courts-métrages (peu de votes) et les
 * spin-offs (« Presents: Hobbs & Shaw », « A Star Wars Story ») ne prennent pas de numéro.
 * explicit : le film trouvé porte le numéro dans son titre.
 */
export function nthPart(parts, n, sagaTitle = "") {
  const dated = parts.filter((p) => p.release_date).sort((a, b) => a.release_date.localeCompare(b.release_date));
  const top = Math.max(0, ...dated.map((p) => p.vote_count || 0));
  const counted = dated.filter((p) => (p.vote_count || 0) >= 0.1 * top && !SPIN_OFF.test(p.original_title || ""));
  const inSaga = new Set(norm(sagaTitle).split(" "));
  const numberOf = (p) => {
    for (const t of [p.title, p.original_title]) {
      const w = norm(t).split(" ");
      for (let i = 0; i < w.length; i++) {
        const k = /^\d{1,2}$/.test(w[i]) ? Number(w[i]) : ROMAN.indexOf(w[i]) + 1;
        if (k >= 1 && !inSaga.has(w[i]) && !["part", "partie"].includes(w[i - 1]) && w[i + 1] !== "partie") return k;
      }
    }
    return 0;
  };
  const slots = new Map();
  for (const p of counted) { const k = numberOf(p); if (k && !slots.has(k)) slots.set(k, p); }
  const numbered = new Set(slots.values());
  const explicit = slots.has(n);
  let free = 1;
  for (const p of counted) {
    if (numbered.has(p)) continue;
    while (slots.has(free)) free++;
    slots.set(free, p);
  }
  // Toute la saga pour la suite des résultats, spin-offs compris, sans les courts-métrages.
  return { hit: slots.get(n) || null, explicit, dated: dated.filter((p) => (p.vote_count || 0) >= 0.1 * top) };
}

// ---------- personnes ----------
/** Le nom de la personne correspond à la requête (« nolan » → Christopher Nolan, pas Nolan Gould). */
export function personMatch(query, name) {
  const qw = norm(query).split(" ").filter(Boolean);
  const nw = norm(name).split(" ").filter(Boolean);
  if (!qw.length || !nw.length) return false;
  const close = (a, b) => 1 - levenshtein(a, b) / Math.max(a.length, b.length) >= 0.8;
  // Un seul mot : c'est le nom de famille (« tom » ne doit pas donner Tom Hanks).
  if (qw.length === 1) return close(qw[0], nw[nw.length - 1]);
  return qw.every((w) => nw.some((x) => close(w, x)));
}

// Apparitions en tant que soi-même, émissions et documentaires : pas une filmographie.
const SELF = /\b(self|himself|herself|themselves|lui[- ]m[eê]me|elle[- ]m[eê]me)\b/i;
const NOT_FICTION = new Set([99, 10763, 10764, 10767]);   // documentaire, actualités, télé-réalité, talk-show

/**
 * Films (ou séries) d'une personne : réalisés (ou écrits) pour un réalisateur ou un scénariste,
 * joués pour un acteur. D'abord ses titres phares selon TMDB (« known_for » de la recherche de
 * personnes : The Last of Us avant Mentalist pour Pedro Pascal), puis les premiers rôles
 * (4 premiers noms au générique, ou 5 épisodes et plus quand TMDB les compte), puis le reste ;
 * à égalité, le plus connu.
 */
export function filmography(person, credits, kind) {
  const dept = person.known_for_department;
  const behind = dept === "Directing" || dept === "Writing";
  const list = behind
    ? (credits.crew || []).filter((c) => c.job === "Director" || (dept === "Writing" && c.department === "Writing"))
    : (credits.cast || []).filter((c) => !SELF.test(c.character || ""));
  const media = kind === "series" ? "tv" : "movie";
  const famous = new Set((person.known_for || []).filter((k) => k.media_type === media).map((k) => k.id));
  const lead = (c) => behind || (c.episode_count !== undefined ? c.episode_count >= 5 : (c.order ?? 99) <= 3);
  return list
    .filter((c) => !(c.genre_ids || []).some((g) => NOT_FICTION.has(g)))
    .sort((a, b) => famous.has(b.id) - famous.has(a.id) || lead(b) - lead(a) || byPop(a, b));
}

/** Votes du titre phare le plus vu d'une personne (« known_for » de la recherche de personnes). */
const topVotes = (p) => Math.max(0, ...(p.known_for || []).map((k) => k.vote_count || 0));
/** Acteur, réalisateur ou scénariste assez connu pour que la requête le désigne. */
const knownPerson = (p) => ["Acting", "Directing", "Writing"].includes(p.known_for_department)
  && ((p.popularity || 0) >= PERSON_POP || topVotes(p) >= PERSON_VOTES);

// ---------- plusieurs personnes ensemble ----------
// Prénoms courants (sans accents) : un prénom commence un nom (« tom hanks meg ryan » → Tom Hanks + Meg Ryan) et,
// seul, n'est pas une personne : « tom et jerry », « harry et sally », « thelma et louise » restent des titres.
const FIRST_NAMES = new Set(`
  aaron adam adele adrien adrian agnes al alain alan albert alec alejandro alessandro alex alexander alexandra alexandre
  alfred alfredo alice alicia alison amanda amber amy ana andre andrea andrew andy angela angelina anna anne annie
  anthony antoine antonio anya ariana arnold ashley audrey ava barbara ben benedict benicio benjamin benoit bernard
  bette bill billy blake bob bonnie brad bradley brendan brian brie brigitte bruce bruno bryan cameron camille carey
  carl carole caroline cary cate catherine cecile charles charlie charlize charlotte chris christian christina
  christine christoph christopher chuck cillian claire clara claude claudia clint clyde colin cyril daisy damien
  dan daniel danny david dakota demi denis dennis denzel diane dominique don donald dustin dwayne ed eddie edward
  elisabeth elizabeth ella elle elodie elsa emilia emily emma emmanuel emmanuelle eric ethan eva eve fabrice fanny
  florence francis francois frank frankie fred gabriel gael gary gene george georges gerard gilles gillian glenn
  grace greta guillaume guillermo gwyneth hal harrison harry heath helen helena henry hugh hugo isabelle isaac jack
  jackie jacques jake james jamie jane jared jason javier jean jeanne jeff jeffrey jennifer jenna jeremy jerry jesse
  jessica jim jimmy joan joaquin jodie joe joel johnny john jonah jonathan jordan jose joseph josh jude jules julia
  julian julianne julie juliette justin karin kate katherine keanu keira ken kevin kiefer kim kirsten kristen kurt
  lambert lana laura laurence laurent lea leonardo leo liam lily linda lindsay lisa louis louise luc lucas lucy luke
  mads maggie marcel margot maria marie marilyn marion mark martin mary mathieu matt matthew max meg mel melanie
  meryl michael michel michelle mickey mila miles milla mira monica morgan nathalie natalie nicolas nicole nick
  oliver olivia omar orlando owen pamela pascal patrick paul pedro penelope peter philip philippe pierce pierre quentin
  rachel ralph ray reese richard rick ridley riz robert robin roger romain romeo ron rosamund russell ruth ryan
  salma sam samuel sandra sarah scarlett sean sebastien sergio sharon sigourney simon sofia sophie sophia stanley
  stephane stephen steve steven susan sylvester sylvie tessa thelma thierry thomas tilda tim timothee tobey tom
  tommy tony uma val valerie vanessa victor vin vincent viola virginie walter wes whoopi will willem william woody
  yves zac zach zoe morty
`.split(/\s+/).filter(Boolean));
// Particules d'un nom de famille (« de niro », « del toro », « van damme », « de la rocha », « von trier »).
const PARTICLES = new Set(["de", "di", "da", "del", "della", "van", "von", "dos", "mc"]);
const PARTICLE_NEXT = new Set(["la", "le", "der", "den", "los"]);
// Mots qui ne sont pas des noms : la requête est alors un titre (« la haine », « kramer contre kramer »).
const NOT_NAME = new Set(`le la les l un une des du de d au aux en sur sous dans pour par the a an of in on at to qui que
  ou mon ma mes ton ta tes son sa ses ce ces cette il elle je tu nous vous ils film films movie serie series saison
  season partie part contre vs versus chez sans est pas plus tout tous vie mort nuit jour monde amour guerre`.split(/\s+/));
const JOIN = new Set(["et", "and", "avec", "with"]);
const RARE_WORD = 3;          // nom de famille seul : mot (presque) absent des titres connus
const PEOPLE_SEARCHES = 4;    // recherches de personnes au plus pour une requête à plusieurs noms

/** Mots d'un nom → morceaux : particule rattachée au mot qui suit, initiale au mot d'avant. null : pas des noms. */
function nameTokens(words) {
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (PARTICLES.has(w) && i + 1 < words.length) {
      const parts = [w];
      let j = i + 1;
      while (PARTICLE_NEXT.has(words[j]) && j + 1 < words.length) parts.push(words[j++]);
      if (NOT_NAME.has(words[j]) || /\d/.test(words[j])) return null;
      parts.push(words[j]);
      out.push({ text: parts.join(" "), particle: true });
      i = j;
      continue;
    }
    if (w.length === 1 && /[a-z]/.test(w) && out.length && out[out.length - 1].first && i + 1 < words.length) {
      out[out.length - 1].text += ` ${w}`;  // initiale après un prénom : « samuel l jackson », « michael j fox »
      continue;
    }
    if (/\d/.test(w) || NOT_NAME.has(w) || w.length === 1) return null;
    out.push({ text: w, first: FIRST_NAMES.has(w) });
  }
  return out;
}

/** Vraisemblance d'un découpage en noms (plus c'est haut, mieux c'est), null s'il est exclu. */
function splitScore(segs, vocab) {
  let s = segs.length === 3 ? -1 : 0, named = false;
  for (const seg of segs) {
    if (seg.length === 1) {
      if (seg[0].first) return null;     // un prénom seul n'est pas une personne (« tom et jerry »)
      s += 0.5;
      named = named || !!seg[0].particle;
      continue;
    }
    // Prénom(s) + nom : « tom hanks », « jean paul belmondo », « tommy lee jones » ; que des prénoms (« jean paul »,
    // « meg ryan ») : possible, sans plus ; trois morceaux sans prénom devant : peu probable.
    let k = 0;
    while (k < seg.length && seg[k].first) k++;
    const rest = seg.length - k;
    if (k) { s += rest === 1 ? 2 : rest === 2 ? 1.5 : 0; named = true; } else if (seg.length === 3) s -= 0.5;
    // Un prénom après le nom commence plutôt un autre nom (« tom hanks meg » + « ryan » : peu probable).
    for (let i = k + 1; i < seg.length; i++) if (seg[i].first) s -= 1.5;
  }
  // Rien que des noms de famille (« dicaprio winslet ») : seulement des mots presque absents des titres connus,
  // pour ne pas chercher deux personnes à chaque titre de deux mots (« star wars », « fight club »).
  const weight = (w) => (vocab && vocab.weights.get(w)) || 0;
  if (!named && !(vocab && segs.flat().every((t) => t.text.length >= 4 && weight(t.text) <= RARE_WORD))) return null;
  return s;
}

/**
 * Découpages possibles d'une requête en 2 ou 3 noms de personnes, du plus vraisemblable au moins vraisemblable :
 * « pacino de niro » → [["pacino", "de niro"]], « de niro et pacino » → [["de niro", "pacino"]],
 * « leonardo dicaprio kate winslet » → [["leonardo dicaprio", "kate winslet"]]. Au plus PEOPLE_SEARCHES noms
 * différents en tout (une recherche TMDB chacun). [] : pas une requête de plusieurs personnes.
 */
export function personSplits(query, vocab) {
  const words = norm(String(query || "").replace(/[,+&]/g, " et ")).split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 9) return [];
  const groups = [[]];
  for (const w of words) { if (JOIN.has(w)) groups.push([]); else groups[groups.length - 1].push(w); }
  const text = (seg) => seg.map((t) => t.text).join(" ");
  // « de niro et pacino », « tom hanks, meg ryan » : les noms sont déjà séparés.
  if (groups.length > 1) {
    if (groups.length > 3) return [];
    const segs = groups.map((g) => (g.length ? nameTokens(g) : null));
    if (segs.some((t) => !t || !t.length || t.length > 3 || (t.length === 1 && t[0].first))) return [];
    return [segs.map(text)];
  }
  const toks = nameTokens(words);
  if (!toks || toks.length < 2 || toks.length > 6) return [];
  const splits = [];
  const walk = (start, acc) => {
    if (start === toks.length) { if (acc.length >= 2) splits.push(acc); return; }
    if (acc.length === 3) return;
    for (let n = 1; n <= 3 && start + n <= toks.length; n++) walk(start + n, [...acc, toks.slice(start, start + n)]);
  };
  walk(0, []);
  const scored = splits.map((segs) => ({ segs, s: splitScore(segs, vocab) })).filter((x) => x.s !== null)
    .sort((a, b) => b.s - a.s || a.segs.length - b.segs.length);   // à égalité : deux personnes plutôt que trois
  const out = [], names = new Set();
  for (const { segs, s } of scored) {
    if (s < scored[0].s - 1) break;      // seulement les découpages presque aussi vraisemblables que le meilleur
    const texts = segs.map(text);
    if (new Set([...names, ...texts]).size > PEOPLE_SEARCHES) continue;
    texts.forEach((t) => names.add(t));
    out.push(texts);
  }
  return out;
}

/** La personne que désigne ce nom parmi les résultats TMDB (« deniro » attaché vaut « De Niro »), sinon null. */
function findPerson(q, list) {
  const compact = q.replace(/ /g, "");
  return (list || []).slice(0, 5).find((p) => knownPerson(p)
    && (personMatch(q, p.name) || (!q.includes(" ") && q.length >= 5 && norm(p.name).replace(/ /g, "").endsWith(compact)))) || null;
}

// Rôles qui ne comptent pas pour « ensemble » : images d'archives, rôle non crédité (De Niro, voix non créditée
// dans Scarface ; les montages faits d'archives de tous les acteurs).
const NOT_TOGETHER = /uncredited|non cr[ée]dit[ée]|archive/i;

/**
 * Titres où ces personnes se retrouvent, les plus connus d'abord : ceux communs à leurs filmographies (un appel
 * TMDB par personne, le même que pour une personne seule, donc souvent déjà en cache). Rôles joués pour un acteur,
 * réalisés (ou écrits) pour un réalisateur (ou un scénariste) : « scorsese de niro » → les films de Scorsese avec
 * De Niro. Pas « discover » avec with_cast : il compte les rôles non crédités et les images d'archives.
 */
export async function jointWorks(people, kind, api) {
  const credits = await Promise.all(people.map((p) => api(`/person/${p.id}/${kind === "series" ? "tv" : "movie"}_credits`)));
  const lists = people.map((p, i) => filmography(p, credits[i] || {}, kind).filter((c) => !NOT_TOGETHER.test(c.character || "")));
  const others = lists.slice(1).map((l) => new Set(l.map((c) => c.id)));
  return dedupe(usable(lists[0].filter((c) => others.every((ids) => ids.has(c.id))))).sort((a, b) => fame(b) - fame(a));
}

// ---------- genre et époque ----------
// Genres de config.js (GENRES) par leur nom sans accents : « science fiction » → films 878, séries 10765.
const GENRE_IDS = Object.fromEntries(GENRES.map(([name, movie, series]) => [norm(name), { movie, series }]));
// Pas de genre TMDB pour ces séries : un mot-clé TMDB à la place (horror, thriller, romance, musical).
const TV_KEYWORDS = { horreur: "315058", thriller: "316362", romance: "9840", musique: "4344" };
// Mots tapés → genres de GENRES (tous à la fois). « animé » seul : l'animation japonaise.
const GENRE_LIST = [
  [["action"], ["action"]],
  [["aventure", "aventures", "adventure"], ["aventure"]],
  [["animation", "dessin anime", "dessins animes", "serie animee", "series animees", "film d animation",
    "films d animation", "film anime", "films animes", "cartoon", "cartoons"], ["animation"]],
  [["anime", "animes", "animee", "animees", "manga", "mangas", "japanimation"], ["animation"], { lang: "ja" }],
  [["comedie", "comedies", "comique", "comiques", "humour", "comedy"], ["comedie"]],
  [["comedie romantique", "comedies romantiques", "romcom", "romcoms"], ["comedie", "romance"]],
  [["comedie dramatique", "comedies dramatiques"], ["comedie", "drame"]],
  [["comedie musicale", "comedies musicales", "musical", "musicals", "musicale", "musicales", "musique"], ["musique"]],
  [["policier", "policiers", "policiere", "policieres", "polar", "polars", "crime", "criminel", "criminels",
    "criminelle", "criminelles", "gangster", "gangsters", "mafia"], ["crime"]],
  [["documentaire", "documentaires", "docu", "docus", "documentary"], ["documentaire"]],
  [["drame", "drames", "dramatique", "dramatiques", "drama"], ["drame"]],
  [["famille", "familial", "familiaux", "familiale", "familiales", "family"], ["famille"]],
  [["fantastique", "fantastiques", "fantasy", "heroic fantasy"], ["fantastique"]],
  [["historique", "historiques", "histoire", "history", "peplum", "peplums"], ["histoire"]],
  [["horreur", "epouvante", "horror", "gore", "slasher", "slashers"], ["horreur"]],
  [["mystere", "mysteres", "mystery"], ["mystere"]],
  [["romance", "romances", "romantique", "romantiques"], ["romance"]],
  [["science fiction", "sf", "scifi", "sci fi", "anticipation"], ["science fiction"]],
  [["thriller", "thrillers", "suspense"], ["thriller"]],
  [["guerre", "war"], ["guerre"]],
  [["western", "westerns"], ["western"]],
  [["enfants", "jeunesse"], ["enfants"]],
];
const GENRE_WORDS = new Map(GENRE_LIST.flatMap(([words, genres, extra]) => words.map((w) => [w, { genres, ...extra }])));
// Pays d'origine (« horreur coréen », « comédie française ») : masculin, féminin, pluriels.
const ORIGIN_LIST = [
  ["KR", "coreen korean"], ["JP", "japonais japanese"], ["FR", "francais french"], ["US", "americain"],
  ["GB", "anglais britannique british"], ["IT", "italien"], ["ES", "espagnol"], ["DE", "allemand"], ["IN", "indien bollywood"],
  ["CN", "chinois"], ["HK", "hongkongais"], ["TR", "turc"], ["MX", "mexicain"], ["BE", "belge"], ["CA", "canadien quebecois"],
  ["DK", "danois"], ["SE", "suedois"], ["NO", "norvegien"], ["TH", "thailandais"], ["BR", "bresilien"], ["AU", "australien"],
  ["IE", "irlandais"], ["RU", "russe"], ["PL", "polonais"], ["AR", "argentin"], ["NZ", "neozelandais"],
];
const LANGUE_DU_PAYS = { KR: "ko", JP: "ja", FR: "fr", IT: "it", ES: "es", DE: "de", CN: "zh", TR: "tr", MX: "es", DK: "da",
  SE: "sv", NO: "no", TH: "th", BR: "pt", RU: "ru", PL: "pl", AR: "es" };
const ORIGINS = new Map(ORIGIN_LIST.flatMap(([code, words]) => words.split(" ")
  .flatMap((w) => [w, `${w}s`, `${w}e`, `${w}es`, `${w}ne`, `${w}nes`, `${w}que`, `${w}ques`].map((f) => [f, code]))));
// Mots sans importance autour du genre : « les films d'horreur des années 80 ».
const GENRE_FILLER = new Set(["film", "films", "movie", "movies", "serie", "series", "show", "shows", "les", "le", "la",
  "l", "un", "une", "des", "de", "d", "du", "en", "et", "a"]);
const ERA_WORDS = new Set(["annees", "annee", "decennie", "years"]);

/** « 80 » → 1980, « 1980 » → 1980, « 00 » → 2000, « 10 » → 2010 ; null si ce n'est pas une décennie. */
function decadeOf(s) {
  const m = /^(\d{2}|(?:19|20)\d0)s?$/.exec(s || "");
  if (!m) return null;
  const n = Number(m[1]);
  if (m[1].length === 4) return n;
  return n % 10 ? null : n >= 20 ? 1900 + n : 2000 + n;
}

/**
 * Requête faite seulement d'un ou plusieurs genres, et au plus d'une époque et d'un pays : « horreur années 80 »,
 * « comédie des années 90 », « film de guerre 70s », « western 1960 » (une année), « horreur coréen », « animé ».
 * → { genres, from, to, country, lang, bare, with_genres, with_keywords } pour ce type, sinon null (titre, autre
 * chose, ou genre sans équivalent TMDB pour ce type). bare : le genre seul, sans époque ni pays.
 */
export function genreQuery(query, kind) {
  const w = norm(query).split(" ").filter(Boolean);
  if (!w.length || w.length > 8) return null;
  const g = { genres: [], from: null, to: null, country: null, lang: null };
  const era = (from, to) => { if (g.from) return false; g.from = from; g.to = to; return true; };
  for (let i = 0; i < w.length;) {
    // Expression de genre la plus longue d'abord (« comedie romantique » avant « comedie »).
    let n = 3;
    for (; n >= 1; n--) {
      const hit = i + n <= w.length && GENRE_WORDS.get(w.slice(i, i + n).join(" "));
      if (hit) { g.genres.push(...hit.genres); if (hit.lang) g.lang = hit.lang; break; }
    }
    if (n >= 1) { i += n; continue; }
    if (ERA_WORDS.has(w[i])) {                               // « années 80 », « années 1980 »
      const d = decadeOf(w[i + 1]);
      if (d === null || !era(d, d + 9)) return null;
      i += 2;
      continue;
    }
    const d = /s$/.test(w[i]) ? decadeOf(w[i]) : w[i + 1] === "s" ? decadeOf(w[i]) : null;
    if (d !== null) {                                        // « 80s », « 1980s », « 80's »
      if (!era(d, d + 9)) return null;
      i += w[i + 1] === "s" && !/s$/.test(w[i]) ? 2 : 1;
      continue;
    }
    if (/^(?:19|20)\d{2}$/.test(w[i])) {                     // une année : « western 1960 »
      if (!era(Number(w[i]), Number(w[i]))) return null;
      i++;
      continue;
    }
    if (ORIGINS.has(w[i]) && !g.country) { g.country = ORIGINS.get(w[i]); i++; continue; }
    if (GENRE_FILLER.has(w[i])) { i++; continue; }
    return null;
  }
  if (!g.genres.length) return null;
  const tv = kind === "series";
  const ids = [], keywords = [];
  for (const name of new Set(g.genres)) {
    const id = GENRE_IDS[name] && GENRE_IDS[name][tv ? "series" : "movie"];
    if (id) ids.push(String(id));
    else if (tv && TV_KEYWORDS[name]) keywords.push(TV_KEYWORDS[name]);
    else return null;                                        // « horreur » sans genre TMDB pour ce type
  }
  return { ...g, genres: [...new Set(g.genres)], bare: !g.from && !g.country && !g.lang,
    with_genres: [...new Set(ids)].join(","), with_keywords: keywords.join(",") };
}

/**
 * Paramètres « discover » d'une requête de genre : les titres les plus populaires de ce genre et de cette époque,
 * avec assez de votes pour être connus (moins pour les vieux titres et les autres pays, moins vus sur TMDB).
 */
export function genreParams(g, kind, page = 1) {
  const tv = kind === "series";
  const old = g.to && g.to < (tv ? 1990 : 1960) ? 0.15 : g.to && g.to < (tv ? 2010 : 1990) ? 0.5 : 1;
  const abroad = (g.country && g.country !== "US") || g.lang ? 0.5 : 1;
  const year = g.from && g.from === g.to ? 0.3 : 1;          // une seule année : moins de titres
  const p = {
    sort_by: "popularity.desc", include_adult: "false", page,
    "vote_count.gte": Math.max(10, Math.round((tv ? 100 : 300) * old * abroad * year)),
  };
  if (g.with_genres) p.with_genres = g.with_genres;
  if (g.with_keywords) p.with_keywords = g.with_keywords;
  // Pas de documentaires (films), ni d'émissions ou de programmes pour enfants (séries), sauf si c'est ce que l'on
  // cherche ; pas de dessins animés non plus (Toy Story dans « comédie des années 90 »), sauf en famille.
  const asked = new Set(g.with_genres.split(","));
  const noise = [...(tv ? ["10762", "10763", "10764", "10766", "10767"] : ["99"]), ...(asked.has("10751") ? [] : ["16"])]
    .filter((id) => !asked.has(id));
  if (noise.length) p.without_genres = noise.join("|");
  if (g.from) {
    p[tv ? "first_air_date.gte" : "primary_release_date.gte"] = `${g.from}-01-01`;
    p[tv ? "first_air_date.lte" : "primary_release_date.lte"] = `${g.to}-12-31`;
  }
  if (g.country) p.with_origin_country = g.country;
  // Un pays à langue principale : aussi tourné dans cette langue (« comédie française » sans Bridget Jones,
  // coproduction anglaise). Pas pour les pays à plusieurs langues (Inde, Belgique, Canada…) ni anglophones.
  if (g.country && !g.lang && LANGUE_DU_PAYS[g.country]) p.with_original_language = LANGUE_DU_PAYS[g.country];
  if (g.lang) p.with_original_language = g.lang;
  return p;
}

// ---------- classement ----------
const GOOD = 0.75;      // ressemblance d'un titre qui correspond vraiment à la requête
const KEEP = 0.5;       // en dessous, le titre n'a pas grand-chose à voir
const EXACT = 0.95;     // titre quasi identique
const PEN_DERIVED = 0.03; // requête retouchée (nettoyée, sigle, sans l'année) : un peu moins sûre
const PEN_FIXED = 0.06;   // requête corrigée (faute de frappe supposée)
const FIRST_PAGE = 20;
const PERSON_POP = 2;     // popularité TMDB d'une personne connue…
const PERSON_VOTES = 1000; // …ou un de ses titres phares avec au moins autant de votes
const PERSON_MAX = 15;    // films de la personne en tête, puis les titres qui correspondent
const FAMOUS = 300;       // un titre exact avec autant de votes l'emporte sur un studio (ou une personne peu connue)
const STRONG_VOTES = 100; // titre qui correspond à la requête gardé devant les titres d'un genre ou de plusieurs personnes
const HEAD_MAX = 15;

/**
 * Un titre montrable : une affiche, et des votes, ou bien pas encore sorti mais dont on parle un peu (« The Beekeeper 2 »,
 * annoncé pour l'an prochain : 0 vote, il disparaissait de la recherche ; même seuil que sansObscurs).
 */
const aVenir = (it) => {
  const date = it.release_date || it.first_air_date || "";
  return !!date && date > new Date().toISOString().slice(0, 10) && (it.popularity || 0) >= OBSCUR_NEUF_POPULARITE;
};
const usable = (list) => (list || []).filter((it) => it && it.poster_path && (it.vote_count > 0 || aVenir(it)));
const byPop = (a, b) => (b.popularity || 0) - (a.popularity || 0);
const dedupe = (list) => { const seen = new Set(); return list.filter((it) => it && !seen.has(it.id) && seen.add(it.id)); };
/** Notoriété : surtout le nombre de votes (stable), un peu la popularité du moment. */
const fame = (it) => 0.08 * Math.log10(1 + (it.vote_count || 0)) + 0.03 * Math.log10(1 + (it.popularity || 0));
const yearOf = (it) => (it.release_date || it.first_air_date || "").slice(0, 4);

/** Ressemblance d'un résultat avec la meilleure des formes de la requête (moins sa pénalité). */
function textScore(forms, it) {
  let best = 0;
  for (const f of forms) best = Math.max(best, (titleMatch(f.q, it) ? 1 : scoreOf(f.q, it)) - f.pen);
  return best;
}

/**
 * Saga de la requête → { films: [le n-ième film, puis toute la saga dans l'ordre], name }.
 * Sagas candidates : les 3 plus proches par leur nom, plus celle du film le plus connu qui
 * correspond (« jurassic world » → saga Jurassic Park, dont on ne garde que les Jurassic World).
 * Parmi celles qui ont un n-ième film : celle dont le film porte le numéro dans son titre
 * (« spider man 2 » → Spider-Man 2 de Sam Raimi), sinon la plus vue.
 */
async function sagaFilms({ sagas, base, n, api, pool, trace }) {
  const picks = (sagas.results || [])
    .map((c) => ({ c, s: Math.max(similarity(base, sagaName(c.name)), similarity(base, sagaName(c.original_name))) }))
    .filter((x) => x.s >= GOOD)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map((x) => x.c);
  const anchor = pool.filter((it) => scoreOf(base, it) >= GOOD).sort((a, b) => fame(b) - fame(a))[0];
  const [details, movie] = await Promise.all([
    Promise.all(picks.map((c) => api(`/collection/${c.id}`))),
    anchor ? api(`/movie/${anchor.id}`) : null,
  ]);
  const cands = picks.map((c, i) => ({ c, parts: details[i].parts || [] }));
  const own = movie && movie.belongs_to_collection;
  if (own && !picks.some((c) => c.id === own.id)) cands.push({ c: own, parts: (await api(`/collection/${own.id}`)).parts || [] });

  const found = cands
    .map(({ c, parts }) => {
      // Saga au nom différent : seulement les films dont le titre commence par la requête (les
      // Jurassic World, pas « The Lost World: Jurassic Park », qui contient pourtant les deux mots).
      const named = Math.max(similarity(base, sagaName(c.name)), similarity(base, sagaName(c.original_name))) >= GOOD;
      const sub = named ? parts : parts.filter((p) => titlesOf(p).some((t) => bare(t).startsWith(bare(base))));
      const list = sub.length >= n ? sub : parts;
      return { name: c.name, ...nthPart(list, n, `${sagaName(c.name)} ${sagaName(c.original_name)}`), votes: list.reduce((t, p) => t + (p.vote_count || 0), 0) };
    })
    .filter((x) => usable([x.hit]).length);
  // Le numéro dans le titre ne départage que des sagas de notoriété comparable : pas la saga
  // indienne « Avatara Purusha » (son film « 2 ») devant Avatar.
  const top = Math.max(0, ...found.map((x) => x.votes));
  const strong = (x) => x.explicit && x.votes >= 0.2 * top;
  found.sort((a, b) => strong(b) - strong(a) || b.votes - a.votes);
  if (trace) trace.sagas = found.map((x) => ({ name: x.name, hit: x.hit.title, explicit: x.explicit, votes: x.votes, films: x.dated.map((p) => p.title) }));
  return found[0] ? { films: [found[0].hit, ...usable(found[0].dated)], name: found[0].name } : null;
}

/**
 * Résultats TMDB bruts d'une page de recherche.
 * search(q, page, extra) → réponse TMDB de /search/movie ou /search/tv (extra.language pour une autre langue).
 * api(path, params) → autre appel TMDB (sagas, personnes, studios) ; sans lui, ces recherches sont sautées.
 * opts.words() → vocabulaire préparé (prepareWords) ; opts.region → pays des plateformes ;
 * opts.trace → objet rempli avec le détail de la recherche (adresse /debug/search).
 * opts.stats → objet rempli avec { strong, sure } : titres proches (identifiants), requête reconnue.
 */
export async function smartSearch(query, page, search, kind, api, opts = {}) {
  const trace = opts.trace;
  const raw = capQuery(query);
  const clean = cleanQuery(raw, kind);                     // « film barbie » → « barbie »
  const base = clean || raw;
  const alias = ALIASES[norm(base)];
  const yearKey = kind === "series" ? "first_air_date_year" : "year";
  const ym = alias ? null : base.match(/^(.+?)\s+((?:19|20)\d{2})$/);
  const sq = !alias && !ym && kind !== "series" ? sequelOf(base) : null;
  const main = alias || (ym ? ym[1] : base);               // ce que l'on cherche vraiment
  // « horreur années 80 », « western 1960 », « animé » : les titres de ce genre (et de cette époque).
  const genre = api && !alias ? genreQuery(raw, kind) : null;
  const genreDiscover = (p) => api(`/discover/${kind === "series" ? "tv" : "movie"}`, genreParams(genre, kind, p));
  const famousIn = (list) => list.some((it) => titleMatch(main, it) && it.vote_count >= FAMOUS);

  // Pages suivantes : on continue simplement la recherche principale (ou la liste du genre, comme en page 1).
  if (page > 1 && genre && (!genre.bare || !famousIn(usable((await search(main, 1)).results)))) {
    const d = await genreDiscover(page);
    return page > ((d && d.total_pages) || 0) ? [] : usable(d.results);
  }
  if (page > 1) {
    const d = await search(main, page, ym ? { [yearKey]: ym[2] } : {});
    if (!d.results || page > (d.total_pages || 0)) return [];
    return usable(d.results).sort(byPop);
  }

  const vocab = opts.words ? await opts.words().catch(() => null) : null;
  // « inseption » → « inception » ; fixed2 : la 2e correction possible (« bounia » → bodnia, puis boiuna)
  const [fixed = null, fixed2 = null] = alias ? [] : correctQueries(main, vocab);
  const sagaBase = sq ? (ALIASES[norm(sq.base)] || correctQuery(sq.base, vocab) || sq.base) : null;
  const studio = !alias && !ym && !sq ? (STUDIOS[norm(base)] || {})[kind === "series" ? "series" : "movie"] : null;
  const variant = !alias && !ym && !sq ? pluralVariant(main) : null;   // « monstre » → « monstres »

  const forms = [{ q: raw, pen: 0 }];
  if (clean) forms.push({ q: clean, pen: PEN_DERIVED });
  if (alias) forms.push({ q: alias, pen: PEN_DERIVED });
  if (ym) forms.push({ q: ym[1], pen: PEN_DERIVED });
  if (fixed) forms.push({ q: fixed, pen: PEN_FIXED });
  if (fixed2) forms.push({ q: fixed2, pen: PEN_FIXED });
  // « pacino de niro », « tom hanks et meg ryan » : chaque nom cherché à part (au plus PEOPLE_SEARCHES).
  const splits = api && !alias && !ym && !sq && !studio && !genre ? personSplits(main, vocab) : [];
  const names = [...new Set(splits.flat())];

  const none = Promise.resolve(null);
  const [rawRes, cleanRes, aliasRes, yearRes, fixedRes, fixed2Res, pluralRes, enRes, people, sagas, studioRes, otherRes, genreRes, ...namesRes] = await Promise.all([
    search(raw, 1),
    clean ? search(clean, 1) : none,
    alias ? search(alias, 1) : none,
    ym ? search(ym[1], 1, { [yearKey]: ym[2] }) : none,
    fixed ? search(fixed, 1) : none,
    fixed2 ? search(fixed2, 1) : none,
    variant ? search(variant, 1) : none,
    // Titres anglais des résultats (« spirited away » → Le Voyage de Chihiro) ; pas affichés.
    search(main, 1, { language: "en-US" }),
    api && !alias && !ym && !sq && !studio && !genre ? api("/search/person", { query: main, include_adult: "false" }) : none,
    api && sq ? api("/search/collection", { query: sagaBase }) : none,
    api && studio ? api(`/discover/${kind === "series" ? "tv" : "movie"}`, {
      ...studio, sort_by: "popularity.desc", "vote_count.gte": kind === "series" ? 300 : 200,
      include_adult: "false", watch_region: opts.region || "FR",
      ...(kind === "series" ? { without_genres: "10762,10763,10764,10767" } : {}),
    }) : none,
    // La même requête dans l'autre type : « ted lasso » dans Films est une série connue.
    api && !sq && !studio ? api(`/search/${kind === "series" ? "movie" : "tv"}`, { query: main, include_adult: "false" }) : none,
    genre ? genreDiscover(1) : none,
    ...names.map((n) => api("/search/person", { query: n, include_adult: "false" })),
  ]);
  const results = (d) => (d && d.results) || [];
  const exactVotesIn = (list) => Math.max(0, ...list.filter((it) => titleMatch(main, it)).map((it) => it.vote_count || 0));
  const en = new Map(results(enRes).map((it) => [it.id, it.title || it.name]));

  let pool = dedupe(usable([
    ...results(rawRes), ...results(cleanRes), ...results(aliasRes), ...results(yearRes), ...results(fixedRes), ...results(fixed2Res),
    ...results(pluralRes).filter((it) => titleMatch(main, it)),
  ]));
  pool.forEach((it) => { if (en.has(it.id)) it.en_title = en.get(it.id); });
  const text = new Map();
  const scoreAll = (list) => list.forEach((it) => { if (!text.has(it.id)) text.set(it.id, textScore(forms, it)); });
  scoreAll(pool);

  // Titre connu de l'autre type, plus connu que tout titre identique ici : on ne garde que les
  // titres qui ressemblent vraiment à la requête (pas « Lasso » ni « Slow West » dans Films), sans
  // recherche de secours ni Gemini, et sans la personne (« Bart the Bear » pour « the bear »).
  const exactVotes = exactVotesIn(pool);
  const otherVotes = exactVotesIn(usable(results(otherRes)));
  const otherKind = otherVotes >= FAMOUS && otherVotes > exactVotes;

  // Plusieurs personnes ensemble : le premier découpage dont chaque nom désigne une personne connue (toutes
  // différentes), puis les titres où elles se retrouvent. Rien en commun : la recherche habituelle.
  const found = new Map(names.map((n, i) => [n, findPerson(n, results(namesRes[i]))]));
  const together = splits.map((s) => s.map((n) => found.get(n)))
    .find((ps) => ps.every(Boolean) && new Set(ps.map((p) => p.id)).size === ps.length);
  const joint = together ? (await jointWorks(together, kind, api)).slice(0, HEAD_MAX) : [];
  // Un genre seul (« horreur », « western ») : sa liste, sauf si un titre connu porte exactement ce nom (« Amour »).
  const genreList = usable(results(genreRes));
  const genreHead = genreList.length && !(genre.bare && famousIn(pool));

  // Toujours rien de proche : débuts de mots que TMDB reconnaît (« inters » → Interstellar).
  const best = Math.max(0, ...pool.map((it) => text.get(it.id)));
  const good = pool.filter((it) => text.get(it.id) >= GOOD).length;
  let fallback = [];
  if (!sq && !studio && !otherKind && !joint.length && !genreHead && (best < GOOD || (good < 3 && best < EXACT))) {
    fallback = fallbackQueries(fixed || main);
    const more = usable((await Promise.all(fallback.map((s) => search(s, 1)))).flatMap(results));
    scoreAll(more);
    pool = dedupe([...pool, ...more.filter((it) => text.get(it.id) >= KEEP)]);
  }

  const rank = (it) => {
    const t = text.get(it.id);
    return t + fame(it) + (ym && t >= GOOD && yearOf(it) === ym[2] ? 0.3 : 0);
  };
  let ranked = [...pool].sort((a, b) => rank(b) - rank(a));
  // Les titres sans rapport avec la requête (trouvés par TMDB via un titre étranger) ne
  // restent que s'il n'y a pas assez de vrais résultats.
  const tmdbTop = new Set(usable(results(rawRes)).slice(0, 5).map((it) => it.id));
  if (otherKind) ranked = ranked.filter((it) => text.get(it.id) >= GOOD);
  else if (ranked.filter((it) => text.get(it.id) >= KEEP).length >= 5) ranked = ranked.filter((it) => text.get(it.id) >= KEEP || tmdbTop.has(it.id));

  const famousExact = pool.some((it) => titleMatch(main, it) && it.vote_count >= FAMOUS);
  let head = [], headKind = null;

  // « dune 2 » : le bon film de la saga, puis toute la saga. Un titre identique et assez connu
  // reste devant (« ocean's 8 ») ; pas un nanar au titre d'origine « Terminator 2 ».
  if (sagas) {
    const saga = await sagaFilms({ sagas, base: sagaBase, n: sq.n, api, pool, trace });
    if (saga) {
      const hit = saga.films[0];
      const exact = pool.filter((it) => it.id !== hit.id && isExact(raw, it) && it.vote_count >= 0.3 * hit.vote_count);
      head = [...exact, ...saga.films];
      headKind = `saga ${saga.name}`;
      ranked = ranked.filter((it) => scoreOf(sq.base, it) >= GOOD || scoreOf(sagaBase, it) >= GOOD);
    }
  }

  // « pixar », « netflix » : les titres du studio ou de la plateforme, les plus populaires.
  if (studio && !famousExact && results(studioRes).length) {
    head = usable(results(studioRes)).slice(0, HEAD_MAX);
    headKind = "studio";
  }

  // Un acteur ou un réalisateur (« nolan », « omar sy ») : ses films d'abord, puis les titres.
  // Pas quand un titre connu porte exactement ce nom (« lupin », « dune »).
  // Un titre qui correspond l'emporte s'il est connu au regard de la personne : le documentaire
  // « Spielberg » (300 votes) ne cache pas les films de Spielberg, mais Super Mario Bros.
  // (11 000 votes) passe devant le chanteur Mario (titres phares à 4 000 votes).
  // Les votes de ses titres phares ne comptent que pour une personne populaire : Julian Bleach (popularité 0,99) a un
  // petit rôle dans Avengers : L'Ère d'Ultron (25 000 votes), sa filmographie passait devant l'animé Bleach.
  // Pareil face à un titre proche : la chanteuse JoJo (1,67) passait devant JoJo's Bizarre Adventure (1 686 votes).
  const nearVotes = Math.max(0, ...pool.filter((it) => text.get(it.id) >= 0.7).map((it) => it.vote_count || 0));
  const renom = (p) => ((p.popularity || 0) >= PERSON_POP ? topVotes(p) : 0);
  // Un titre exact connu, mais moins que la personne : il reste en tête, sa filmographie suit (« hitchcock » : le film
  // Hitchcock, 1 700 votes, puis Psychose, Fenêtre sur cour… d'Alfred Hitchcock, titres phares à 11 000 votes).
  const titres = Math.max(exactVotes, otherVotes);
  let personId = null;
  if (people && !joint.length) {
    const person = results(people).slice(0, 5).find((p) => knownPerson(p) && personMatch(main, p.name)
      && (titres < Math.max(FAMOUS, 0.1 * renom(p)) || titres < renom(p))
      && nearVotes < Math.max(FAMOUS, 2 * renom(p)));
    if (person) {
      const credits = await api(`/person/${person.id}/${kind === "series" ? "tv" : "movie"}_credits`);
      const films = dedupe(usable(filmography(person, credits, kind))).slice(0, PERSON_MAX);
      const avant = titres < Math.max(FAMOUS, 0.1 * renom(person)) ? []
        : pool.filter((it) => isExact(main, it)).sort((a, b) => fame(b) - fame(a));
      if (films.length) { head = dedupe([...avant, ...films]); headKind = `${avant.length ? "titre puis " : ""}personne ${person.name}`; personId = person.id; }
    }
  }

  // Un titre qui est la requête et assez vu reste devant (« bonnie and clyde », « frost nixon ») ; un titre qui
  // commence par elle, s'il est très connu. Devant un genre : seulement un titre identique et très connu (pas
  // « Horreur dans la ville », ni « Science Fiction Volume One » pour « science fiction »).
  const strongTitles = (onlyExact) => pool.filter((it) => (titleMatch(raw, it) && it.vote_count >= (onlyExact ? FAMOUS : STRONG_VOTES))
    || (!onlyExact && scoreOf(raw, it) >= EXACT && it.vote_count >= FAMOUS)).sort((a, b) => fame(b) - fame(a));
  if (joint.length) {
    head = dedupe([...strongTitles(false), ...joint]);
    headKind = `ensemble ${together.map((p) => p.name).join(" + ")}`;
  }
  // « horreur années 80 » : les titres de ce genre et de cette époque, les plus populaires (pas « Miles Western »).
  if (genreHead) {
    head = dedupe([...strongTitles(true), ...genreList]);
    headKind = `genre ${genre.genres.join(" + ")}${genre.from ? ` ${genre.from}-${genre.to}` : ""}${genre.country ? ` ${genre.country}` : ""}`;
  }

  const out = dedupe([...head, ...ranked]).slice(0, FIRST_PAGE);
  // Pour la recherche par IA (ai.js) : titres qui ressemblent vraiment à la requête, et « sûr »
  // quand la requête est clairement un titre connu, une personne, une saga ou un studio.
  if (opts.stats) {
    opts.stats.strong = new Set(out.filter((it) => head.includes(it) || text.get(it.id) >= GOOD).map((it) => it.id));
    opts.stats.sure = !!headKind || otherKind || out.some((it) => text.get(it.id) >= EXACT && it.vote_count >= FAMOUS);
    opts.stats.personne = personId;   // la personne mise en tête (runSearch la compare à celle de Wikidata)
    // Aucun titre ne contient les mots tapés (ou des mots qui commencent par eux), seulement des titres approchants
    // (« luffy » → Buffy par la correction d'orthographe, « eren » → Eden, « vegeta » → Vegas) : peut-être un nom
    // que TMDB ne connaît pas, un personnage d'anime. runSearch demande alors aussi à AniList.
    const mots = norm(raw).split(" ").filter(Boolean);
    const contient = (it) => titlesOf(it).some((t) => { const toks = norm(t).split(" "); return mots.every((w) => toks.some((x) => x.startsWith(w))); });
    // Un titre obscur qui contient le mot ne compte pas (« Eren the Southpaw », 13 votes, pour le héros de L'Attaque des Titans).
    opts.stats.devine = !headKind && mots.length > 0 && !out.some((it) => contient(it) && it.vote_count >= STRONG_VOTES);
  }
  if (trace) {
    Object.assign(trace, {
      forms, fixed, variant, alias: alias || null, year: ym ? ym[2] : null, sequel: sq, sagaBase, studio: studio || null,
      fallback, head: headKind, otherKind, people: splits, genre: genre ? genreParams(genre, kind) : null,
      results: out.map((it) => ({
        name: it.title || it.name, original: it.original_title || it.original_name, en: it.en_title, year: yearOf(it),
        votes: it.vote_count, text: text.has(it.id) ? +text.get(it.id).toFixed(3) : null,
        fame: +fame(it).toFixed(3), rank: text.has(it.id) ? +rank(it).toFixed(3) : null,
      })),
    });
  }
  // Une page à la fois : chaque titre coûte un appel TMDB de plus (fiche, logo, dates).
  return out;
}

/** Recherche : en dessous, un titre est obscur (« Avatar », 2006, 60 votes, à côté de celui de 2009). */
export const OBSCUR_MIN_VOTES = 100;
/** Un titre français obscur reste avec ce minimum de votes (« Kaamelott » : un film peu noté, mais d'ici). */
const OBSCUR_FR_VOTES = 10;
/** Pas encore sorti (ou sorti dans l'année) : gardé si on en parle un peu (« Avatar 4 », popularité 2,7). */
const OBSCUR_NEUF_POPULARITE = 2;
const AN_MS = 365 * 24 * 3600 * 1000;

/**
 * Les résultats d'une recherche sans les titres obscurs, quand un titre connu porte le nom cherché (« avatar » : plus
 * le film espagnol de 2006, 60 votes, à côté de celui de 2009). Sans titre connu de ce nom, rien ne change : « ichigo »
 * garde Ichigo 100% (17 votes), c'est peut-être lui qu'on cherche ; « avatar 2006 » aussi. Gardés : au moins
 * OBSCUR_MIN_VOTES votes, un titre français un peu noté, un titre sorti depuis moins d'un an ou à venir dont on parle,
 * un titre sans nombre de votes connu. Une recherche ne se vide jamais à cause de ce tri.
 */
export function sansObscurs(results, query, today) {
  const connu = (it) => typeof it.vote_count === "number" && it.vote_count >= OBSCUR_MIN_VOTES;
  if (!results.some((it) => connu(it) && titleMatch(query, it))) return results;
  const maintenant = Date.parse(today) || Date.now();
  const garde = (it) => {
    const votes = it.vote_count;
    if (typeof votes !== "number" || votes >= OBSCUR_MIN_VOTES) return true;
    const date = it.release_date || it.first_air_date || "";
    if (it.original_language === "fr" && votes >= OBSCUR_FR_VOTES) return true;
    const sortie = Date.parse(date);
    return !!date && sortie > maintenant - AN_MS && (it.popularity || 0) >= OBSCUR_NEUF_POPULARITE;
  };
  const gardes = results.filter(garde);
  return gardes.length ? gardes : results;
}
