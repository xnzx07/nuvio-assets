/**
 * Ce que TMDB dit d'un titre, pour dessiner son affiche : images (avec et sans texte), logo, genres,
 * année, note TMDB et dernière saison. Nuvio envoie « tt… » ou « tmdb:N » ; une série « tt… » passe par /find.
 */
import { videosCinemeta, decoupageCinemeta, faitsRecomptes } from "./episodes.js";

export const TMDB = "https://api.themoviedb.org/3";
const DELAI_MS = 3000;
const ANIMATION = 16;   // genre TMDB

// Correspondances « tt… » → identifiant TMDB, gardées en mémoire de l'instance (elles ne changent pas),
// 5 000 au plus : les plus anciennes sortent.
const MAX_MEMO = 5000;
let memoFind = new Map();
export function resetMemo() { memoFind = new Map(); }
export const tailleMemo = () => memoFind.size;

/** Appel TMDB : objet JSON, null si 404, erreur levée pour tout autre échec (réseau, 5xx…). */
export async function tmdbGet(env, path, params, fetchImpl) {
  const url = new URL(TMDB + path);
  url.searchParams.set("api_key", env.TMDB_API_KEY || "");
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  const res = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(DELAI_MS) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TMDB ${res.status} sur ${path}`);
  return res.json();
}

function retenir(key, id) {
  memoFind.set(key, id);
  while (memoFind.size > MAX_MEMO) memoFind.delete(memoFind.keys().next().value);
}

/** Identifiant TMDB d'un titre « tt… » (null s'il n'existe pas chez TMDB). */
export async function tmdbIdDe(env, type, imdbId, fetchImpl = fetch) {
  const key = `${type}:${imdbId}`;
  if (memoFind.has(key)) return memoFind.get(key);
  const d = await tmdbGet(env, `/find/${imdbId}`, { external_source: "imdb_id" }, fetchImpl);
  const hit = d && (type === "series" ? d.tv_results : d.movie_results) || [];
  const id = hit.length ? hit[0].id : null;
  retenir(key, id);
  return id;
}

/** Âge conseillé en France (« 10 », « 12 », « 16 », « 18 »), ou null : tous publics ou inconnu. */
function ageDe(type, d) {
  const brut = type === "series"
    ? ((d.content_ratings && d.content_ratings.results) || []).filter((r) => r.iso_3166_1 === "FR").map((r) => r.rating)
    : ((d.release_dates && d.release_dates.results) || []).filter((r) => r.iso_3166_1 === "FR")
        .flatMap((r) => r.release_dates || []).sort((a, b) => (a.type === 3 ? -1 : b.type === 3 ? 1 : 0)).map((r) => r.certification);
  const age = brut.map((c) => (/^-?(10|12|16|18)$/.exec(String(c || "").trim()) || [])[1]).find(Boolean);
  return age || null;
}

/**
 * Images sans langue au bon format (2:3 ou 16:9, à 2 % près ; sans dimensions connues : gardées), 3 au plus.
 * lib/texte.js vérifie ensuite qu'elles n'ont vraiment pas de texte.
 */
const sansLangue = (list, ratio) => (list || [])
  .filter((x) => x.iso_639_1 === null && (!x.width || !x.height || Math.abs(x.width / x.height - ratio) / ratio <= 0.02))
  .slice(0, 3).map((x) => x.file_path);

// Langues demandées pour les images : français, anglais, sans langue, et les langues d'origine les plus courantes
// (pour le logo « langue d'origine »).
const LANGUES_IMAGES = "fr,en,null,ja,ko,es,it,de,zh,hi,pt,ru,sv,da,no,tr,th,nl,pl";

/** La plateforme d'abonnement où le titre est en France (la première selon TMDB), ou null. */
function plateformeDe(d) {
  const fr = ((d["watch/providers"] || {}).results || {}).FR;
  const liste = ((fr && fr.flatrate) || []).filter((p) => p.logo_path).sort((a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99));
  return liste.length ? { name: liste[0].provider_name || "", logo: liste[0].logo_path } : null;
}

/**
 * Le titre (film ou série) est-il en VF sur une plateforme (abonnement, gratuit, pub, location, achat) en France, même avant
 * sa sortie numérique américaine (films Netflix sortis partout le même jour, sans date chez TMDB) ? Oui pour un film en anglais ou en
 * français ; un autre film étranger seulement sur Netflix ou Disney+ en abonnement, qui doublent presque tout (EB,
 * néerlandais, est sur Prime Video en VO seulement). La France seule : en Suisse ou au Canada, la plateforme peut
 * n'avoir que l'allemand ou l'anglais. Sert au statut (lib/statut.js).
 */
function plateformeFrance(d) {
  const fr = ((d["watch/providers"] || {}).results || {}).FR || {};
  if (standUp(d) || !["flatrate", "free", "ads", "rent", "buy"].some((k) => (fr[k] || []).length > 0)) return false;
  return ["en", "fr"].includes(d.original_language) || (fr.flatrate || []).some((p) => /netflix|disney/i.test(p.provider_name || ""));
}

// Spectacle de stand-up étranger (mots-clés TMDB « stand-up comedy », « comedy special ») : jamais doublé, même sur
// Netflix. Un spectacle en français est déjà en VF.
const STAND_UP = [9716, 362573];
const standUp = (d) => d.original_language !== "fr" && ((d.keywords && d.keywords.keywords) || []).some((k) => STAND_UP.includes(k.id));

// Grandes plateformes d'abonnement qui doublent ce qu'elles diffusent (identifiants TMDB) : Netflix (avec ou sans pub),
// Prime Video, Disney+, Paramount+, HBO Max, Apple TV+, Canal+. Pas MUBI ni les petites, souvent en VOSTFR.
const DOUBLEURS = new Set([8, 1796, 119, 337, 531, 1899, 350, 381]);
const DOUBLENT_TOUT = new Set([8, 1796, 337]);   // Netflix, Disney+ : aussi les films étrangers

/**
 * Film en abonnement en France sur une plateforme qui le double : en VF même si ses sources n'ont que la VO (les
 * documentaires Netflix, Turning Point, L'Envers du sport : personne ne publie la VF, Netflix l'a). Film en anglais ou
 * en français ; un autre film étranger seulement sur Netflix ou Disney+. Jamais un spectacle de stand-up.
 */
function abonnementVf(d) {
  const fr = ((d["watch/providers"] || {}).results || {}).FR || {};
  const ids = ["flatrate", "free", "ads"].flatMap((k) => fr[k] || []).map((p) => p.provider_id);
  if (standUp(d)) return false;
  return ids.some((id) => (["en", "fr"].includes(d.original_language) ? DOUBLEURS : DOUBLENT_TOUT).has(id));
}

// En français, l'image de France (iso_3166_1 « FR »), sinon une sans pays : jamais celle du Canada (Toy Story 4 y
// devient « Histoire de jouets 4 ») ni d'un autre pays ; il reste alors l'anglais ou la langue d'origine.
// Logos québécois que TMDB marque « France » par erreur (relevés à la main, le même relevé dans worker/index.js) :
// « Rapides et dangereux 6 » (Fast & Furious 6), « Rapides et dangereux présentent : Hobbs et Shaw ».
export const LOGOS_QUEBEC = new Set(["/4wNoTeDnpnwxKNydVoq2B8MCMLI.png", "/cRh4wmVSb9GF02ifaZXGL17bgZA.png"]);
const first = (list, langs) => {
  for (const lang of langs) {
    const dans = (list || []).filter((x) => x.iso_639_1 === lang && !LOGOS_QUEBEC.has(x.file_path));
    const it = lang === "fr" ? dans.find((x) => x.iso_3166_1 === "FR") || dans.find((x) => !x.iso_3166_1) : dans[0];
    if (it) return it.file_path;
  }
  return null;
};

/**
 * Les faits d'un titre, ou null si TMDB ne le connaît pas. options : { plateforme, vo } pour demander aussi les
 * plateformes (réglage Plateforme) et les logos dans les langues d'origine (logo « d'origine ») ; sans eux, la
 * réponse de TMDB reste légère.
 */
export async function titleFacts(env, { type, id, imdb }, fetchImpl = fetch, options = {}) {
  // Un film « tt… » pas encore vu par l'instance : TMDB lit sa fiche directement par l'identifiant IMDb (pour les
  // films seulement, pas les séries), sans /find avant : un appel de moins, 110 à 260 ms mesurés le 2026-10-23.
  const memoCle = `${type}:${id}`;
  const direct = type !== "series" && id.startsWith("tt") && !memoFind.has(memoCle);
  const demande = id.startsWith("tmdb:") ? Number(id.slice(5)) : direct ? id : await tmdbIdDe(env, type, id, fetchImpl);
  if (!demande) return null;
  const d = await tmdbGet(env, `/${type === "series" ? "tv" : "movie"}/${demande}`, {
    // Films : les dates de sortie détaillées servent au statut (« En salle », « Nouveau »…) et à l'âge conseillé ;
    // séries : les classifications par pays, pour l'âge.
    // Plateformes (watch/providers) : toujours (VF disponible ?, et le logo de plateforme) ; logos dans les langues
    // d'origine courantes.
    // Mots-clés (films) : un spectacle de stand-up n'est jamais doublé (abonnementVf).
    language: "fr-FR", append_to_response: (type === "series" ? "images,external_ids,content_ratings" : "images,external_ids,release_dates,keywords") + ",watch/providers" + (options.credits && type !== "series" ? ",credits" : ""),
    include_image_language: options.vo ? LANGUES_IMAGES : "fr,en,null",
    // Une copie de moins d'une heure : TMDB garde ses réponses dans son CDN, par adresse, et la nôtre (avec la clé du
    // service) pouvait dater d'avant l'arrivée d'une série sur une plateforme française (Phony sur Disney+ : grise et
    // « BIENTÔT » deux jours après sa sortie, alors qu'elle était doublée).
    frais: new Date().toISOString().slice(0, 13),
  }, fetchImpl);
  const tmdbId = direct ? (d && Number.isInteger(d.id) ? d.id : null) : demande;
  if (direct) retenir(memoCle, tmdbId);
  if (!d || !tmdbId) return null;
  const images = d.images || {};
  // Ni logo français ni anglais (« On va s'arrêter là » : seulement en espagnol) : les logos de toutes les langues,
  // pour ne pas laisser l'affiche sans titre (un appel de plus, pour ces titres seulement ; en échec, pas de logo).
  let tousLogos = images.logos || [];
  if (!first(tousLogos, ["fr", "en"])) {
    const autres = await tmdbGet(env, `/${type === "series" ? "tv" : "movie"}/${tmdbId}/images`, {}, fetchImpl).catch(() => null);
    tousLogos = (autres && autres.logos) || [];
  }
  const logoSansLangue = tousLogos.find((x) => !x.iso_639_1);
  const date = (type === "series" ? d.first_air_date : d.release_date) || "";
  const facts = {
    tmdbId,
    type,
    imdbId: (d.external_ids && d.external_ids.imdb_id) || (id.startsWith("tt") ? id : null) || (/^tt\d+$/.test(imdb || "") ? imdb : null),
    genreIds: (d.genres || []).map((g) => g.id),
    // Le titre (en français s'il existe), écrit à la place du logo quand TMDB n'en a aucun.
    titre: d.title || d.name || null,
    year: /^\d{4}/.test(date) ? date.slice(0, 4) : null,
    vote: { average: d.vote_average || 0, count: d.vote_count || 0 },
    poster: d.poster_path || null,
    textlessPosters: sansLangue(images.posters, 2 / 3),
    textlessPoster: sansLangue(images.posters, 2 / 3)[0] || null,
    backdrop: d.backdrop_path || null,
    textlessBackdrops: sansLangue(images.backdrops, 16 / 9),
    textlessBackdrop: sansLangue(images.backdrops, 16 / 9)[0] || null,
    logo: first(images.logos, ["fr", "en"]),
    logos: { fr: first(images.logos, ["fr"]), en: first(images.logos, ["en"]), vo: d.original_language ? first(images.logos, [d.original_language]) : null,
      // Langue d'origine, sinon sans langue ; jamais une langue tierce (le titre français est alors écrit à la place).
      autre: (d.original_language && first(tousLogos, [d.original_language])) || (logoSansLangue ? logoSansLangue.file_path : null) },
    runtime: type === "series" ? null : d.runtime || null,
    seasonsCount: type === "series" ? (d.seasons || []).filter((x) => x.season_number >= 1).length || null : null,
    provider: plateformeDe(d),
    // Régie v3 : accroche, studio (ou chaîne d'une série), réalisateur (ou créateurs), dernier épisode diffusé.
    tagline: d.tagline || null,
    // Série : sa chaîne d'abord (AMC, HBO…) ; film : sa première société de production.
    studio: (type === "series" ? ((d.networks || [])[0] || {}).name : null) || ((d.production_companies || [])[0] || {}).name || null,
    director: (type === "series"
      ? (d.created_by || []).map((c) => c.name)
      : ((d.credits && d.credits.crew) || []).filter((c) => c.job === "Director").map((c) => c.name)).slice(0, 2).join(" et ") || null,
    lastEpisode: type === "series" && d.last_episode_to_air ? d.last_episode_to_air.air_date || null : null,
    lastSeason: type === "series" && d.last_episode_to_air ? d.last_episode_to_air.season_number : null,
    // Fin et avancement d'une série (réglages Fin et Avancement, lib/statut.js) : statut TMDB (Ended, Canceled…),
    // numéro du dernier épisode diffusé, date du prochain.
    status: type === "series" ? d.status || null : null,
    lastEpisodeNumber: type === "series" && d.last_episode_to_air ? d.last_episode_to_air.episode_number ?? null : null,
    nextEpisode: type === "series" && d.next_episode_to_air ? d.next_episode_to_air.air_date || null : null,
    // Prochain épisode : sa saison et son numéro (« SAISON 3 BIENTÔT » quand c'est le 1er d'une nouvelle saison).
    nextSeason: type === "series" && d.next_episode_to_air ? d.next_episode_to_air.season_number ?? null : null,
    nextEpisodeNumber: type === "series" && d.next_episode_to_air ? d.next_episode_to_air.episode_number ?? null : null,
    // Pour le statut (lib/statut.js).
    releases: type === "series" ? [] : (d.release_dates && d.release_dates.results) || [],
    releaseDate: type === "series" ? "" : d.release_date || "",
    // Saga du film (réglage Saga, lib/saga.js) : l'identifiant de sa collection TMDB.
    collection: type !== "series" && d.belongs_to_collection ? d.belongs_to_collection.id || null : null,
    // Le fond de sa saga : celui d'une carte « annoncée » (film sans aucune image, lib/contenu.js).
    fondSaga: type !== "series" && d.belongs_to_collection ? d.belongs_to_collection.backdrop_path || null : null,
    originalLanguage: d.original_language || "",
    plateformeFrance: plateformeFrance(d),
    abonnementVf: type !== "series" && abonnementVf(d),
    // Pour le diagnostic (X-Affiche-Sortie) : ce que TMDB dit des plateformes en France, et sa langue d'origine.
    plateformesVues: Object.entries(((d["watch/providers"] || {}).results || {}).FR || {}).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k}:${v.length}`).join("+")
      + (d["watch/providers"] ? "" : "(absent)") + `/${d.original_language || "?"}`,
    age: ageDe(type, d),
    firstAir: type === "series" ? d.first_air_date || "" : "",
    seasons: type === "series" ? (d.seasons || []).map((s) => ({ season_number: s.season_number, air_date: s.air_date || "", episode_count: s.episode_count ?? null })) : [],
  };
  // Série d'animation : les saisons de Cinemeta quand TMDB les découpe autrement (lib/episodes.js). En panne : TMDB.
  if (type !== "series" || !facts.imdbId || !facts.genreIds.includes(ANIMATION)) return facts;
  const videos = await videosCinemeta(facts.imdbId, fetchImpl);
  const decoupage = videos && decoupageCinemeta(facts.seasons, videos);
  return decoupage ? faitsRecomptes(facts, decoupage) : facts;
}
