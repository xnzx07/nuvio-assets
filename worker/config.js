/**
 * Configuration personnalisée de l'addon.
 *
 * La config tient dans l'adresse elle-même (comme les addons Stremio « configurables ») :
 *   https://…/<config>/manifest.json
 * où <config> est un petit JSON encodé en base64url. Sans config, l'addon garde
 * les réglages par défaut. Rien n'est stocké côté serveur.
 *
 * IMPORTANT : toutes les listes ci-dessous sont référencées par leur POSITION dans
 * les adresses déjà données. On n'ajoute donc des éléments qu'EN FIN de liste.
 */

/** Plateformes proposées (identifiants TMDB des fournisseurs). */
export const PROVIDERS = [
  { id: "8", name: "Netflix", folder: "netflix" },
  { id: "119", name: "Prime Video", folder: "prime-video" },
  { id: "337", name: "Disney+", folder: "disney-plus" },
  { id: "531", name: "Paramount+", folder: "paramount-plus" },
  { id: "1899", name: "HBO Max", folder: "hbo-max" },
  { id: "350", name: "Apple TV+", folder: "apple-tv-plus" },
  { id: "381", name: "Canal+", folder: "canal-plus" },
  { id: "283", name: "Crunchyroll", folder: "crunchyroll" },
  // Plateformes françaises (TF1+, france.tv — sur TMDB « France TV Amazon Channel », même catalogue —, M6+) :
  // décochées par défaut, en fin de liste (les liens repèrent les plateformes par position).
  { id: "1754", name: "TF1+", folder: "tf1-plus" },
  { id: "2535", name: "france.tv", folder: "france-tv" },
  { id: "147", name: "M6+", folder: "m6-plus" },
  // Animation Digital Network : décochée par défaut, comme Crunchyroll.
  { id: "415", name: "ADN", folder: "adn" },
];

/** Collections du fichier collections.json (dans l'ordre du fichier). */
export const COLLECTIONS = [
  { id: "plateformes-streaming", name: "Plateformes de streaming" },
  { id: "envies", name: "J'ai envie de…" },
  { id: "genres", name: "Genres" },
  { id: "sagas", name: "Sagas" },
  { id: "studios", name: "Studios" },
  // Facultatives (scripts/build_optional.py) : décochées par défaut, toujours en fin de liste (positions des liens).
  { id: "decennies", name: "Décennies", optional: true },
  { id: "monde", name: "Cinéma du monde", optional: true },
  { id: "realisateurs", name: "Réalisateurs", optional: true },
  { id: "acteurs", name: "Acteurs et actrices", optional: true },
  { id: "recompenses", name: "Récompenses", optional: true },
  { id: "univers", name: "Grands univers", optional: true },
  { id: "chaines", name: "Chaînes françaises", optional: true },
  { id: "enfants", name: "Pour les enfants", optional: true },
  { id: "cultes", name: "Cultes et classiques", optional: true },
  { id: "adaptations", name: "Adaptations", optional: true },
  { id: "temps", name: "Selon le temps", optional: true },
  { id: "animes-genres", name: "Animés par genre", optional: true },
  { id: "documentaires", name: "Documentaires", optional: true },
  { id: "sport", name: "Sport", optional: true },
];
/** Identifiants des collections facultatives (le compte Nuvio les retire quand on les décoche). */
export const FACULTATIVES = COLLECTIONS.filter((c) => c.optional).map((c) => c.id);

/** Pays : région des plateformes et langue des titres. */
export const REGIONS = [
  { id: "FR", name: "France", lang: "fr-FR" },
  { id: "BE", name: "Belgique", lang: "fr-FR" },
  { id: "CH", name: "Suisse", lang: "fr-FR" },
  { id: "CA", name: "Québec", lang: "fr-CA" },
  { id: "LU", name: "Luxembourg", lang: "fr-FR" },
];

/** Genres (nom, id TMDB films, id TMDB séries). Sert aux filtres et aux rangées sur mesure. */
export const GENRES = [
  ["Action", 28, 10759], ["Aventure", 12, 10759], ["Animation", 16, 16], ["Comédie", 35, 35],
  ["Crime", 80, 80], ["Documentaire", 99, 99], ["Drame", 18, 18], ["Famille", 10751, 10751],
  ["Fantastique", 14, 10765], ["Histoire", 36, null], ["Horreur", 27, null], ["Musique", 10402, null],
  ["Mystère", 9648, 9648], ["Romance", 10749, null], ["Science-fiction", 878, 10765], ["Thriller", 53, null],
  ["Guerre", 10752, 10768], ["Western", 37, 37], ["Enfants", null, 10762], ["Téléfilm", 10770, null],
  // Toujours en fin de liste : les liens enregistrent les genres par leur place.
  ["Téléréalité", null, 10764],
];

/** Langues d'origine proposées pour les rangées sur mesure. */
export const LANGUAGES = [
  ["", "Toutes"], ["fr", "Français"], ["en", "Anglais"], ["ko", "Coréen"], ["ja", "Japonais"],
  ["es", "Espagnol"], ["it", "Italien"], ["de", "Allemand"], ["hi", "Indien (hindi)"], ["tr", "Turc"],
  ["zh", "Chinois"], ["sv", "Suédois"], ["da", "Danois"], ["no", "Norvégien"], ["pt", "Portugais"],
];

/** Tris proposés pour les rangées sur mesure. */
export const SORTS = ["Les plus populaires", "Les mieux notés", "Les plus récents", "Sélection du jour"];

/** Fêtes que peut suivre la rangée « Spécial … » (hors fête : films à l'affiche). */
export const SEASON_KEYS = [
  ["halloween", "Halloween"], ["noel", "Noël"], ["saint-valentin", "Saint-Valentin"],
  ["paques", "Pâques"], ["ete", "Été"],
];

export const DEFAULT_NAME = "Catalogue FR";
export const MAX_CUSTOM = 12;

/** Réglages par défaut, construits à partir des définitions (rangées « home »). */
export function defaults(rows, discover) {
  return {
    n: DEFAULT_NAME,
    // Rangées affichées par défaut : « home » (ordre du fichier) et « defaultHome »,
    // placées selon « homeRank » (10 × position ; la saison est en tête).
    r: rows
      .map((d, i) => ({ d, rank: d.homeRank ?? (d.id === "accueil-saison" ? 0 : (i + 1) * 10) }))
      .filter(({ d }) => d.home || d.defaultHome)
      .sort((a, b) => a.rank - b.rank)
      .map(({ d }) => d.id),
    p: ["8", "119", "337", "531", "1899", "350", "381"],
    d: discover.map((d) => d.id),
    c: COLLECTIONS.filter((c) => !c.optional).map((c) => c.id),
    o: {},            // noms personnalisés : { idRangée: "Nom" }
    x: [],            // rangées sur mesure
    g: "FR",          // pays
    e: [],            // genres masqués partout (noms)
    m: 0,             // note minimale partout
    a: 0,             // année minimale partout (0 = aucune limite)
    f: false,         // mode famille
    h: SEASON_KEYS.map(([k]) => k),   // fêtes suivies
    t: {},            // tuiles masquées par collection : { idCollection: [positions] }
    to: {},           // ordre des tuiles par collection : { idCollection: [positions dans l'ordre voulu] }
    u: false,         // titres pas encore regardables dans les Tendances (masqués par défaut)
    ca: false,        // collections affichées comme l'accueil (bandes-annonces sur Nuvio TV) plutôt qu'en onglets
    ac: [],           // place des collections sur l'accueil : [{ id, n: rangées avant elle }] (les autres après les rangées)
    k: "",            // clé Gemini personnelle (IA avec le quota de l'utilisateur)
    al: "",           // jeton d'alerte : lien de l'hébergeur d'une copie (rangée « Mise à jour »)
  };
}

function b64urlDecode(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
}

/**
 * Clé Gemini collée par l'utilisateur, nettoyée ; "" si elle n'en a pas la forme. Large exprès :
 * Google change de format (« AIza… », puis « AQ.… ») ; seuls les espaces, guillemets et caractères
 * de contrôle sont refusés (la clé part dans un en-tête HTTP).
 */
const geminiKeyOf = (v) => (typeof v === "string" && /^[A-Za-z0-9._~+/=:-]{20,200}$/.test(v.trim()) ? v.trim() : "");
const cleanName = (v) => (typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 40) : "");
const int = (v, lo, hi) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : null);

/** Une rangée sur mesure, nettoyée (toute valeur inconnue est ignorée). */
function cleanCustom(x) {
  if (!x || typeof x !== "object") return null;
  const idx = (list, n) => (Array.isArray(list) ? [...new Set(list.map(Number))].filter((i) => Number.isInteger(i) && i >= 0 && i < n) : []);
  const y = Array.isArray(x.y) ? x.y.map((v) => int(v, 1900, 2100)) : [];
  return {
    n: cleanName(x.n),
    t: [0, 1, 2].includes(x.t) ? x.t : 0,                 // 0 films, 1 séries, 2 les deux
    g: idx(x.g, GENRES.length),                            // genres (l'un ou l'autre)
    w: idx(x.w, PROVIDERS.length),                         // plateformes
    l: LANGUAGES.some(([c]) => c === x.l) ? x.l : "",      // langue d'origine
    y: [y[0] || 0, y[1] || 0],                             // années de … à …
    v: Math.min(9.5, Math.max(0, Number(x.v) || 0)),       // note minimale
    s: [0, 1, 2, 3].includes(x.s) ? x.s : 0,               // tri
  };
}

/**
 * Marvel Studios, Warner Bros et DC Comics (positions 7, 8 et 9 des Plateformes) sont passés à la
 * fin des Studios (9, 10 et 11), et Crunchyroll de 10 à 7. Les liens d'avant (sans « tv ») sont
 * traduits : une tuile masquée le reste à sa nouvelle place, l'ordre choisi des Plateformes est gardé.
 */
const MOVED_TO_STUDIOS = { 7: 9, 8: 10, 9: 11 };
function oldTiles(t, to) {
  const P = "plateformes-streaming";
  const now = (i) => (i === 10 ? 7 : i);
  if (t[P]) {
    const extra = t[P].filter((i) => MOVED_TO_STUDIOS[i]).map((i) => MOVED_TO_STUDIOS[i]);
    if (extra.length) t.studios = [...new Set([...(t.studios || []), ...extra])].sort((a, b) => a - b);
    t[P] = t[P].filter((i) => !MOVED_TO_STUDIOS[i]).map(now);
    if (!t[P].length) delete t[P];
  }
  if (to[P]) {
    to[P] = to[P].filter((i) => !MOVED_TO_STUDIOS[i]).map(now);
    if (!to[P].length) delete to[P];
  }
}

/**
 * Lit une config depuis l'adresse. Format compact : seules les différences avec les
 * réglages par défaut sont présentes, et les listes sont des numéros (position dans
 * les listes de référence) pour garder une adresse courte :
 *   n nom · r rangées (positions ou « p0 », « p1 »… pour les rangées sur mesure)
 *   p plateformes · d Découvrir (masque) · c collections (masque) · o noms personnalisés
 *   x rangées sur mesure · g pays · e genres masqués · m note mini · a année mini
 *   f mode famille · h fêtes (masque) · t tuiles masquées par collection
 *   to ordre des tuiles par collection (positions dans le fichier ; les autres suivent dans l'ordre habituel)
 *   tv 1 = positions des tuiles d'après le passage de Marvel, Warner et DC aux Studios (voir oldTiles)
 *   tv 2 = de plus, Sagas rangées en 8 thèmes (les positions de sagas d'avant sont oubliées)
 *   u titres pas encore regardables gardés dans les Tendances
 *   ac place des collections sur l'accueil : [[position de la collection, rangées avant elle], …] dans l'ordre voulu ;
 *      les autres viennent après toutes les rangées (Plateformes, épinglée, reste en tête)
 *   k clé Gemini personnelle (l'IA tourne avec le quota de l'utilisateur ; hors clé de cache)
 *   al jeton d'alerte de l'hébergeur d'une copie (voir hote.js ; hors clé de cache)
 * Toute valeur abîmée est ignorée : une adresse ne peut jamais casser l'addon.
 */
export function decodeConfig(segment, rows, discover) {
  const base = defaults(rows, discover);
  if (!segment) return { ...base, custom: false };
  let raw;
  try { raw = JSON.parse(b64urlDecode(segment)); } catch { return null; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const x = (Array.isArray(raw.x) ? raw.x : []).slice(0, MAX_CUSTOM).map(cleanCustom).filter(Boolean);
  const customIds = x.map((_, i) => `perso-${i}`);
  const rowIds = [...rows.map((d) => d.id), ...customIds];
  const fromList = (v, ref, alias) => {
    if (!Array.isArray(v)) return null;
    const ids = v.map((it) => (typeof it === "number" ? ref[it] : alias ? alias(String(it)) : String(it))).filter((it) => ref.includes(it));
    return [...new Set(ids)];
  };
  const fromMask = (v, ref) => (Number.isInteger(v) ? ref.filter((_, i) => v & (1 << i)) : fromList(v, ref));
  const rowAlias = (s) => (/^p\d+$/.test(s) ? `perso-${s.slice(1)}` : s);
  const rowKey = (k) => (/^\d+$/.test(k) ? rows[Number(k)]?.id : rowAlias(k));

  const o = {};
  if (raw.o && typeof raw.o === "object") {
    for (const [k, v] of Object.entries(raw.o)) {
      const id = rowKey(k); const name = cleanName(v);
      if (id && rowIds.includes(id) && name) o[id] = name;
    }
  }
  // Tuiles par collection : { position de la collection: [positions des tuiles dans le fichier] }.
  const tiles = (v) => {
    const out = {};
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [k, list] of Object.entries(v)) {
        const col = COLLECTIONS[Number(k)];
        if (col && Array.isArray(list)) out[col.id] = [...new Set(list.map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < 64))];
      }
    }
    return out;
  };
  const t = tiles(raw.t), to = tiles(raw.to);
  if (raw.tv !== 1 && raw.tv !== 2) oldTiles(t, to);
  // Avant tv 2, la collection Sagas avait 24 tuiles (une par saga) : ces positions ne veulent plus rien dire.
  if (raw.tv !== 2) { delete t.sagas; delete to.sagas; }
  // Place des collections sur l'accueil : chacune une fois, après 0 à 99 rangées.
  const ac = (Array.isArray(raw.ac) ? raw.ac : [])
    .filter((v) => Array.isArray(v) && Number.isInteger(v[0]) && COLLECTIONS[v[0]] && Number.isInteger(v[1]) && v[1] >= 0 && v[1] < 100)
    .map(([i, n]) => ({ id: COLLECTIONS[i].id, n }))
    .filter((v, i, all) => all.findIndex((w) => w.id === v.id) === i);
  const region = REGIONS.find((r) => r.id === raw.g);
  const genreNames = GENRES.map(([n]) => n);

  return {
    n: cleanName(raw.n) || base.n,
    r: fromList(raw.r, rowIds, rowAlias) ?? [...base.r, ...customIds],
    p: fromList(raw.p, PROVIDERS.map((it) => it.id)) ?? base.p,
    d: fromMask(raw.d, discover.map((it) => it.id)) ?? base.d,
    c: fromMask(raw.c, COLLECTIONS.map((it) => it.id)) ?? base.c,
    o, x, t, to, ac,
    g: region ? region.id : base.g,
    e: fromList(raw.e, genreNames) ?? base.e,
    m: Math.min(9, Math.max(0, Number(raw.m) || 0)),
    a: int(raw.a, 0, 2100) || 0,
    f: raw.f === 1 || raw.f === true,
    h: fromMask(raw.h, SEASON_KEYS.map(([k]) => k)) ?? base.h,
    u: raw.u === 1 || raw.u === true,
    ca: raw.ca === 1 || raw.ca === true,
    k: geminiKeyOf(raw.k),
    al: typeof raw.al === "string" && /^[a-f0-9]{24}$/.test(raw.al) ? raw.al : "",
    custom: true,
  };
}

/** Langue TMDB des titres pour cette config. */
export const langOf = (cfg) => (REGIONS.find((r) => r.id === cfg.g) || REGIONS[0]).lang;

/** Les réglages qui changent le CONTENU des listes (pour la clé de cache). L'ordre des plateformes ne change que
 * celui des tuiles de Plateformes : il ne compte pas (pas de cache en double, quotas). */
export const contentKey = (cfg) => JSON.stringify([[...cfg.p].sort(), cfg.g, cfg.e, cfg.m, cfg.a, cfg.f, cfg.h, cfg.x, cfg.u]);

/** Des filtres globaux sont-ils actifs ? */
export const hasGlobalFilters = (cfg) => cfg.e.length > 0 || cfg.m > 0 || cfg.a > 0 || cfg.f;
