/**
 * « Catalogue FR » — addon Nuvio/Stremio en direct (Cloudflare Workers).
 *
 * Répond aux requêtes de Nuvio en interrogeant TMDB à la volée : pas de fichiers
 * précalculés, défilement sans limite (pagination TMDB), contenu toujours à jour.
 *
 *   /                           le hall : on choisit sa salle
 *   /guide                      guide de A à Z (salle 1)
 *   /configure                  page de personnalisation (salle 2)
 *   /lien#u=…                   page « Sur ton téléphone » ouverte par les QR codes du guide
 *   /manifest.json              réglages par défaut
 *   /<config>/manifest.json     réglages personnalisés (config encodée dans l'adresse)
 *   /f<id>/manifest.json        lien fixe : les mêmes réglages, gardés dans la base (voir fixe.js)
 *   /lien-fixe[/<id>]           création et modification d'un lien fixe (POST, page de personnalisation)
 *   /<config>/collections.json  collections Nuvio filtrées selon la config
 *   /<config>/accueil.json      l'ordre de l'accueil (collections et rangées), écrit dans le compte Nuvio par le site
 *   /catalog/<type>/<id>.json
 *   /catalog/<type>/<id>/<genre=…&skip=…>.json
 *   /seance/<code>              le guide demande si « séance <code> » a été tapé dans Nuvio (voir seance.js)
 *   /diagnostic                 photo de l'écran lue par Gemini, rangée parmi les pannes du guide (POST, diagnostic.js)
 *
 * Définitions des rangées et de Découvrir : ../catalogs.json (le même fichier qu'avant).
 * Secret requis : TMDB_API_KEY (clé API TMDB v3). L'IA (voir ai.js) tourne avec la clé Gemini que chacun
 * colle dans la salle 2. Facultatif : GEMINI_API_KEY, clé de l'instance pour /debug et, avec la
 * variable GEMINI_PUBLIC=on, pour tous les liens sans clé.
 *   /meta/<type>/<id>.json      fiche détaillée (résumé, casting, saisons, épisodes) en français
 *   /cinemeta/<type>/<id>.json  rangées de Nuvio tel qu'installé (Cinemeta), pour l'avant / après des aperçus
 *   /jeu                        le film du jour à deviner (image, indices et essais sur /jeu/<date>/…)
 *   /etat, /etat.json           la salle des machines : l'état du site (TMDB, addon, recherche, affiches…)
 */
import DEFS from "../catalogs.json";
import {
  PROVIDERS, COLLECTIONS, REGIONS, GENRES, LANGUAGES, SORTS, SEASON_KEYS, MAX_CUSTOM,
  decodeConfig, defaults, langOf, contentKey, hasGlobalFilters,
} from "./config.js";
import { configurePage } from "./page.js";
import { guidePage, NUVIO_TV_APK } from "./guide.js";
import { AFFICHES_STATIQUES, APERCU_V, apercusDe, relaisUrl } from "./reglages.js";
import { lireReglages, ecrireReglages, dossierDe, MEMOIRES, MEMOIRES_PAYSAGE } from "./lien-affiches.js";
import { lienPage } from "./lien.js";
import { compteNuvioPage } from "./compte-nuvio.js";
import { copiePage } from "./copie.js";
import { nouveautesPage } from "./nouveautes.js";
import { hallPage } from "./hall.js";
import { routeCinemeta } from "./cinemeta.js";
import { animesDe } from "./anilist.js";
import { wikidataDe } from "./wikidata.js";
import { videosCinemeta, videosReduites, oublierCinemeta, decoupageCinemeta, ficheRecomptee } from "./episodes.js";
import { routeJeu } from "./jeu.js";
import { routeEtat } from "./etat.js";
import { statique } from "./statique.js";
import { smartSearch, prepareWords, isExact, norm, capQuery, genreQuery, filmography } from "./search.js";
import { imdbRating } from "./ratings.js";
import { ROWS as FAC_ROWS, facultativeCatalogs, laureats, SAGA_IDS, SAGA_CATALOGS, sagaCatalog, inReleaseOrder } from "./facultatives.js";
import { isCopy, addonId, hostRoute, hasAlerts, pendingUpdate, updateInfo, updateCard, same, UPDATE_CATALOG } from "./hote.js";
import { SEANCE_ID, carteSeance, rechercheSeance, routeSeance } from "./seance.js";
import { routeDiagnostic } from "./diagnostic.js";
import { isFixedId, readFixed, fixedRoute, fixedAvailable, noteLecture } from "./fixe.js";
import { sha256 } from "./outils-serveur.js";
import { programmationPublique } from "./soiree.js";
import { galerieRoute } from "./galerie.js";
import { secondesAvantBascule, jourTendances, routeTendances, prendrePhotos } from "./tendances.js";
import { routeCpu } from "./cpu.js";
import { routeReserve, nettoyerReserve } from "./reserve.js";
import { looksDescriptive, aiTitles, aiMiss, resolveTitles, aiRecap, aiProfile, aiProfiles, aiRenewal, aiEnv, AI_WAIT_MS } from "./ai.js";

const VERSION = "5.43.3";
// Format des réponses gardées dans le cache Cloudflare (pages de rangées, fiches) : à augmenter seulement quand
// ce qu'elles contiennent change (champ ajouté, règle d'affichage…). Avec VERSION dans les clés, chaque mise à jour
// vidait tous les caches d'un coup : pic d'appels TMDB et Gemini. Les réponses de Gemini ont leurs propres clés (ai.js).
const CACHE_V = 15;
const PAGE = 20;                    // taille d'une page TMDB = taille d'une page de l'addon
const AI_MAX = 20;                  // 1re page d'une recherche par IA (sagas entières comprises)
const OBSCUR_VOTES = 100;           // recherche : en dessous, un titre trouvé mot à mot ne suffit pas, Gemini est consulté
// Cloudflare (offre gratuite) : 50 appels sortants au plus par requête, sinon tout échoue. Une
// recherche en garde 20 pour les fiches (un appel par titre affiché), quelques-uns pour le cache et
// Gemini, et SEARCH_BUDGET pour chercher dans TMDB : au-delà, ses appels renvoient vide.
const SEARCH_BUDGET = 22;
const ASSETS = "https://raw.githubusercontent.com/xnzx07/nuvio-assets/main";
// Version du logo (logo/addon.png) : Nuvio garde les images en cache selon leur adresse, donc un nouveau
// logo n'apparaît que si son adresse change. À augmenter à chaque nouveau logo.
const LOGO_V = 2;
const NOISE_TV = ["10763", "10764", "10766", "10767"]; // actualité, téléréalité, soap, talk-show

const CACHE_CATALOG_S = 3 * 3600;  // une page de catalogue reste 3 h dans le cache Cloudflare
const CACHE_CLIENT_S = 300;        // et 5 min seulement dans le cache de Nuvio (manifest, collections)
// Rangées d'un lien habituel : 1 h dans Nuvio (qui les relit à chaque expiration). Leur adresse change avec les
// réglages, rien à attendre pour voir un changement. Celles d'un lien fixe gardent leur adresse quand les réglages
// changent : 30 min, le temps que le nouveau contenu d'une rangée se voie après « Actualiser les addons » (une rangée
// ajoutée a une nouvelle adresse : tout de suite). À 5 et 15 min, Nuvio redemandait sans cesse les mêmes rangées :
// 74 000 appels le 24 octobre 2026, pour 100 000 permis par jour par l'offre gratuite de Cloudflare.
const CACHE_CLIENT_LONG_S = 3600;
const CACHE_CLIENT_FIXE_S = 1800;
const CACHE_CLIENT_SEARCH_S = 60;   // une recherche : 1 min dans Nuvio (lettres tapées puis effacées), voir la route des rangées
const CACHE_DEGRADE_S = 300;       // page incomplète (fiches refusées par TMDB) : 5 min seulement
const CACHE_IMDB_S = 30 * 86400;    // correspondance TMDB → IMDb : 30 jours

// ---------- saisons ----------
const SEASONS = {
  // Halloween : uniquement de l'horreur (pas d'animation ni de films familiaux).
  halloween: { title: "Spécial Halloween", discover: { with_genres: "27", without_genres: "16|10751", "vote_count.gte": 300 } },
  noel: { title: "Spécial Noël", keywords: "207317|5570|260365" },
  "saint-valentin": { title: "Spécial Saint-Valentin", keywords: "160404" },
  paques: { title: "Spécial Pâques", keywords: "9921|9923" },
  ete: { title: "Spécial été", keywords: "14714" },
  "a-laffiche": { title: "À l'affiche" },
};

/** Date du jour à Paris, au format AAAA-MM-JJ. */
function parisToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Date de Pâques (algorithme de Meeus/Jones/Butcher). */
function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function pickSeason(today) {
  const year = Number(today.slice(0, 4)), md = today.slice(5);
  const e = easter(year);
  if (today >= addDays(e, -15) && today <= addDays(e, 8)) return "paques";
  if (md >= "10-01" && md <= "11-02") return "halloween";
  if (md >= "11-20" || md <= "01-06") return "noel";
  if (md >= "01-25" && md <= "02-15") return "saint-valentin";
  if (md >= "06-20" && md <= "08-31") return "ete";
  return "a-laffiche";
}

/** Décor du site : la saison du jour, ou celle demandée avec ?saison=… pour la prévisualiser. */
function decorSaison(url, today) {
  const voulu = url.searchParams.get("saison");
  return voulu && (voulu in SEASONS) ? voulu : pickSeason(today);
}

function seasonDef(today, cfg) {
  let key = pickSeason(today);
  if (cfg && key !== "a-laffiche" && !cfg.h.includes(key)) key = "a-laffiche";
  // Horreur masquée ou mode famille : Halloween version « citrouilles », sans horreur.
  if (cfg && key === "halloween" && (cfg.f || cfg.e.includes("Horreur"))) {
    return { id: "accueil-saison", type: "movie", name: SEASONS.halloween.title, home: true,
      discover: { sort_by: "popularity.desc", with_keywords: "3335|9694|232795", without_genres: "27", "vote_count.gte": 100 } };
  }
  const s = SEASONS[key];
  const source = key === "a-laffiche"
    ? { endpoint: "/movie/now_playing", params: { region: "FR" } }
    : { discover: { sort_by: "popularity.desc", ...(s.discover || { with_keywords: s.keywords }) } };
  return { id: "accueil-saison", type: "movie", name: s.title, home: true, ...source };
}

/**
 * /saison.json : { saison, ids } — la fête du jour et les films de sa rangée (identifiants TMDB des 3 premières pages,
 * réglages par défaut, plus la version sans horreur d'Halloween), pour l'habillage de saison des affiches maison
 * (affiches/lib/saison.js) : Nuvio ne dit pas au service de quelle rangée vient une affiche. Hors fête : aucun film.
 */
async function filmsDeSaison(env, today, cfg) {
  const saison = pickSeason(today);
  if (saison === "a-laffiche") return { saison: null, ids: [] };
  const defs = [seasonDef(today, cfg), ...(saison === "halloween" ? [seasonDef(today, { ...cfg, e: [...cfg.e, "Horreur"] })] : [])];
  const opts = { cfg, region: cfg.g };
  const pages = await Promise.all(defs.flatMap((def) => [1, 2, 3].map((page) =>
    tmdb(env, "/discover/movie", { ...discoverParams(def, "movie", today, opts), page }, langOf(cfg)))));
  return { saison, ids: [...new Set(pages.flatMap((d) => (d.results || []).map((it) => it.id)))] };
}

// ---------- définitions ----------
/** Toutes les rangées possibles : saison, rangées par défaut puis rangées facultatives. */
function allRows(today, cfg) {
  return [seasonDef(today, cfg), ...DEFS.catalogs.filter((d) => d.home || d.optional || d.defaultHome)];
}

/** Applique les plateformes choisies à une rangée (« Nouveautés sur tes plateformes »). */
function withProviders(def, providers) {
  const uses = (x) => x.discover && x.discover.with_watch_providers;
  if (!(def.mix || [def]).some(uses)) return def;
  if (!providers.length) return null;
  const set = (x) => (uses(x) ? { ...x, discover: { ...x.discover, with_watch_providers: providers.join("|") } } : x);
  return def.mix ? { ...def, mix: def.mix.map(set) } : set(def);
}

/** Une rangée sur mesure → définition TMDB « discover ». */
function customDef(x, i) {
  const kinds = x.t === 2 ? ["movie", "series"] : [x.t === 1 ? "series" : "movie"];
  const sub = (kind) => {
    const col = kind === "series" ? 2 : 1;
    const genres = x.g.map((gi) => GENRES[gi][col]).filter(Boolean);
    if (x.g.length && !genres.length) return null;           // genre qui n'existe pas pour ce type
    const d = {};
    if (genres.length) d.with_genres = [...new Set(genres)].join("|");
    if (x.w.length) {
      d.with_watch_providers = x.w.map((wi) => PROVIDERS[wi].id).join("|");
      d.watch_region = "FR";
      d.with_watch_monetization_types = "flatrate";
    }
    if (x.l) d.with_original_language = x.l;
    if (x.v) d["vote_average.gte"] = x.v;
    const out = { type: kind, discover: d };
    if (x.s === 1) { d.sort_by = "vote_average.desc"; d["vote_count.gte"] = kind === "series" ? 150 : 300; }
    else if (x.s === 2) { d.sort_by = kind === "series" ? "first_air_date.desc" : "primary_release_date.desc"; d["vote_count.gte"] = 20; out.untilToday = true; }
    else if (x.s === 3) { d.sort_by = "popularity.desc"; d["vote_count.gte"] = 100; out.rotateDaily = true; }
    else d.sort_by = "popularity.desc";
    // Téléréalité d'une langue : peu notée sur TMDB (Koh-Lanta, Les Marseillais…), le seuil habituel
    // la viderait. Toutes langues : seuil habituel, sinon des émissions coréennes au titre non traduit.
    if (genres.includes(10764) && x.l) d["vote_count.gte"] = x.s === 1 ? 10 : 1;
    // Téléréalité sans années choisies : émissions encore diffusées ces 5 dernières années, pas les
    // variétés d'antan que TMDB range aussi là (La Chance aux chansons, Midi Première…).
    if (genres.includes(10764) && !x.y[0] && !x.y[1]) out.airedSince = 5 * 365;
    if (x.y[0]) out.fromYear = x.y[0];
    if (x.y[1]) out.toYear = x.y[1];
    return out;
  };
  const subs = kinds.map(sub).filter(Boolean);
  if (!subs.length) return null;
  const base = { id: `perso-${i}`, name: x.n || `Ma rangée ${i + 1}`, custom: true };
  return subs.length > 1 ? { ...base, type: "movie", mix: subs } : { ...base, ...subs[0] };
}

/** Rangées d'accueil de cette config, dans l'ordre choisi, avec les noms choisis. */
function homeDefs(today, cfg) {
  const all = [...allRows(today, cfg), ...cfg.x.map(customDef)].filter(Boolean);
  return cfg.r
    .map((id) => all.find((d) => d.id === id))
    .filter(Boolean)
    .map((d) => withProviders(d, cfg.p))
    .filter(Boolean)
    .map((d) => (cfg.o[d.id] ? { ...d, name: cfg.o[d.id] } : d));
}

/** Taille d'une page : 20, ou 40 pour une rangée qui mélange films et séries (20 + 20). */
const pageSizeOf = (def) => (def.mix ? PAGE * def.mix.length : PAGE);

/**
 * Catalogues de Découvrir pour aujourd'hui. « Par année » (yearly) commence toujours à l'année
 * en cours : au 1er janvier, elle s'ajoute d'elle-même sur le modèle de la plus récente de
 * catalogs.json. Films de l'année et de l'an dernier : seulement ceux déjà dispo dans le pays.
 */
let discoverMemo = { year: 0, defs: [] };
function discoverDefs(today) {
  const year = Number(today.slice(0, 4));
  if (discoverMemo.year === year) return discoverMemo.defs;
  const defs = DEFS.discover.map((d) => {
    if (!d.yearly) return d;
    const key = d.type === "series" ? "first_air_date_year" : "primary_release_year";
    const model = d.options[0].def;
    const added = [];
    for (let y = year; y > model.discover[key]; y--) added.push({ label: String(y), def: { ...model, discover: { ...model.discover, [key]: y } } });
    const options = [...added, ...d.options].filter((o) => o.def.discover[key] <= year).map((o) => {
      const { availableHere, ...def } = o.def;
      return d.type === "movie" && o.def.discover[key] >= year - 1 ? { ...o, def: { ...def, availableHere: true } } : { ...o, def };
    });
    return { ...d, options };
  });
  discoverMemo = { year, defs };
  return defs;
}

function manifest(today, cfg, url, alerts) {
  const paging = { name: "skip" };
  const discover = discoverDefs(today).filter((d) => cfg.d.includes(d.id)).map((d) => {
    const labels = d.options.map((o) => o.label);
    return {
      type: d.type, id: d.id, name: d.name, showInHome: false, pageSize: PAGE,
      // Filtre obligatoire : l'appli choisit d'office le 1er filtre (pas de liste vide « Tous les genres »).
      extra: [{ name: "genre", isRequired: true, options: labels }, paging],
      extraRequired: ["genre"], extraSupported: ["genre", "skip"], genres: labels,
    };
  });
  const home = homeDefs(today, cfg).map((d) => ({
    type: d.type, id: d.id, name: d.name, showInHome: true,
    pageSize: pageSizeOf(d), extra: [paging], extraSupported: ["skip"],
  }));
  return {
    id: addonId(url),
    version: VERSION,
    name: cfg.n,
    description: "Rangées d'accueil, Découvrir et saison en cours, en français, en direct depuis TMDB.",
    logo: `${ASSETS}/logo/addon.png?v=${LOGO_V}`,
    resources: ["catalog", { name: "meta", types: ["movie", "series"], idPrefixes: ["tt", "tmdb:", "catfr-", ...(alerts ? ["maj:"] : [])] }],
    types: ["movie", "series"],
    idPrefixes: ["tt", "tmdb:"],
    // Recherche : deux catalogues « Films » et « Séries » (titres en français), à la place
    // des « TMDB Search » de Discover Plus dont le nom ne se change pas.
    // Lien de l'hébergeur d'une copie : la rangée « Mise à jour » en tête (vide, donc masquée, sans mise à jour).
    catalogs: [...(alerts ? [UPDATE_CATALOG] : []), ...discover, ...home, ...sagaCatalog(cfg, PAGE), ...facultativeCatalogs(cfg, PAGE), ...SEARCH.map((c) => ({
      type: c.type, id: c.id, name: c.name, showInHome: false,
      extra: [{ name: "search", isRequired: true }, paging], extraRequired: ["search"], extraSupported: ["search", "skip"],
    }))],
    behaviorHints: { configurable: true, configurationRequired: false },
  };
}

// ---------- TMDB ----------
async function tmdb(env, path, params = {}, lang = "fr-FR") {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.search = new URLSearchParams({ api_key: env.TMDB_API_KEY, language: lang, ...params });
  // Erreur réseau ou limite d'appels de Cloudflare atteinte : une réponse vide, pas une page en erreur.
  try {
    const res = await fetch(url, { cf: { cacheTtl: CACHE_CATALOG_S, cacheEverything: true } });
    return res.ok ? await res.json() : {};
  } catch (e) {
    return {};
  }
}

/**
 * Infos complémentaires d'un titre : identifiant IMDb et, pour les films, dates de sortie
 * (cinéma et numérique) par pays ; pour les séries, dernier et prochain épisode. Un seul appel
 * TMDB par titre, gardé 1 jour par Cloudflare (dates numériques et épisodes bougent).
 *
 * Le résumé (quelques champs) reste aussi 3 h dans la mémoire de cette instance du Worker : une page relue (autre
 * lien, autre rangée, autre page) ne relit pas la grosse fiche TMDB (images, vidéos, dates de tous les pays), longue
 * à décoder, et ne refait pas l'appel. Les réponses ratées ne sont pas gardées.
 */
const INFOS = new Map();
const INFOS_MAX = 3000, INFOS_MS = 3 * 3600e3;
/** Pour les tests : oublie les résumés gardés en mémoire, et la table des estimations. */
export const oublierInfos = () => { INFOS.clear(); avisLu.clear(); oublierEstimations(); oublierCinemeta(); };

async function extraInfo(env, kind, tmdbId, budget) {
  const k = `${kind}:${tmdbId}`, memo = INFOS.get(k);
  if (memo && Date.now() - memo.at < INFOS_MS) return avecEstimation(memo.info);
  const info = await lireInfo(env, kind, tmdbId, budget);
  // Saisons pas recomptées faute de budget (voir lireInfo) : pas gardé, recompté à une prochaine page.
  if (info.lu && !info.provisoire) {
    INFOS.delete(k);
    INFOS.set(k, { at: Date.now(), info });
    if (INFOS.size > INFOS_MAX) INFOS.delete(INFOS.keys().next().value);   // le plus ancien
  }
  return avecEstimation(info);
}

/**
 * Un film en salle aux États-Unis sans date numérique : ses infos avec son estimation (vod, voir estimationDe), pour
 * dispoChezSoi. Ajoutée à chaque lecture, pas gardée avec le résumé : la table change chaque nuit. Les autres titres
 * ne lisent pas la table (aucun appel pour une page qui n'en a pas besoin).
 */
async function avecEstimation(info) {
  if (!info.releases || !besoinEstimation(info.releases)) return info;
  return { ...info, vod: estimationDe(await estimationsVod(), info.imdb) };
}

/** Ce qui sert d'un épisode TMDB (episodeNote, isFinale). */
const slimEpisode = (e) => e && { air_date: e.air_date, season_number: e.season_number, episode_number: e.episode_number, episode_type: e.episode_type };

async function lireInfo(env, kind, tmdbId, budget) {
  const movie = kind !== "series";
  const url = new URL(`https://api.themoviedb.org/3/${movie ? "movie" : "tv"}/${tmdbId}`);
  // Même appel qu'avant, avec en plus les images : logo (en français si possible) et fond
  // sans texte en pleine définition pour le grand carrousel et le mode ambiant.
  url.search = new URLSearchParams({
    api_key: env.TMDB_API_KEY, language: "fr-FR", include_image_language: "fr,en,null", include_video_language: "fr,en",
    // Vidéos : la bande-annonce de l'accueil (Nuvio la prend dans la rangée, sans ouvrir la fiche).
    // Plateformes (films) : en France = VF disponible, même avant la sortie numérique américaine (enVfChezSoi).
    // Séries : les plateformes aussi (une nouvelle série sur une plateforme en France qui la double : en VF).
    // Mots-clés (films) : un spectacle de stand-up n'est jamais doublé (abonnementVf).
    append_to_response: movie ? "release_dates,images,videos,watch/providers,keywords" : "external_ids,images,videos,watch/providers",
  });
  // Sans réponse (limite d'appels de Cloudflare ou de TMDB…) : le titre s'affiche quand même, sans ces infos, et la
  // page est marquée incomplète (rate). Un titre retiré de TMDB (404) n'y changera rien : pas compté.
  let rate = false;
  let j = await fetch(url, { cf: { cacheTtl: 86400, cacheEverything: true } })
    .then((res) => { if (res.ok) return res.json(); rate = res.status !== 404; return null; })
    .catch(() => { rate = true; return null; });
  if (!j) return { imdb: null, rate };
  const logo = bestImage(j.images && j.images.logos, "fr");
  const backdrop = bestImage((j.images && j.images.backdrops || []).filter((b) => !b.iso_639_1), "fr");
  // Dates de sortie : seulement pays, type et date (releaseDates), pas les certifications ni les notes.
  const releases = movie ? ((j.release_dates && j.release_dates.results) || []).map((r) => ({ iso_3166_1: r.iso_3166_1,
    release_dates: (r.release_dates || []).map((x) => ({ type: x.type, release_date: x.release_date })) })) : null;
  // Série d'animation dont la rangée dira l'épisode (sorti ce mois-ci, ou dans la semaine) : saison et numéro comptés
  // comme Cinemeta (voir episodes.js), comme sa fiche. Seulement celles-là, et quelques appels par page (budget).
  const imdbSerie = !movie && j.external_ids && j.external_ids.imdb_id;
  let provisoire = false;
  const jour = new Date().toISOString().slice(0, 10);
  const proche = (e, avant, apres) => e && e.air_date && e.air_date >= addDays(jour, -avant) && e.air_date <= addDays(jour, apres);
  if (imdbSerie && (j.genres || []).some((g) => g.id === 16) && (proche(j.last_episode_to_air, 31, 0) || proche(j.next_episode_to_air, 0, 8))) {
    const cine = await videosReduites(imdbSerie, budget);
    provisoire = cine === undefined;
    const decoupage = cine && decoupageCinemeta(j.seasons, cine);
    if (decoupage) j = ficheRecomptee(j, decoupage);
  }
  return {
    lu: true,
    provisoire,
    imdb: (movie ? j.imdb_id : j.external_ids && j.external_ids.imdb_id) || null,
    releases,
    plateformeFr: movie && vfSurPlateforme(j["watch/providers"], j.original_language, j.keywords),
    plateformeVo: movie && plateformeFrance(j["watch/providers"]),
    abonnementVf: movie && abonnementVf(j["watch/providers"], j.original_language, j.keywords),
    // Série : de quoi savoir si elle est en VF chez soi (seriesRegardables), comme ses affiches.
    serie: movie ? null : { firstAir: j.first_air_date || "", lastSeason: (j.last_episode_to_air && j.last_episode_to_air.season_number) || 1,
      plateformeFr: vfSurPlateforme(j["watch/providers"], j.original_language) },
    episode: movie ? null : { next: slimEpisode(j.next_episode_to_air), last: slimEpisode(j.last_episode_to_air), counts: seasonCounts(j.seasons), status: j.status },
    logo: logo ? `${IMG}w500${logo.file_path.replace(/\.svg$/, ".png")}` : undefined,
    backdrop: backdrop ? backdrop.file_path : null,
    trailers: trailersOf(j.videos && j.videos.results).slice(0, 2),
  };
}

/**
 * Un onglet d'une tuile de collection (une source TMDB), chargé comme Nuvio TV le fait
 * (TmdbCollectionSourceResolver) : « discover » page par page, ou les films d'une saga. Sert à l'aperçu du site.
 */
async function dossierSource(env, src, lang, page) {
  const tv = src.mediaType === "TV", kind = tv ? "series" : "movie";
  const toMeta = (it) => {
    const name = it.title || it.name || it.original_title || it.original_name;
    if (!name) return null;
    const date = (tv ? it.first_air_date : it.release_date) || "";
    return {
      id: `tmdb:${it.id}`, type: kind, name,
      poster: it.poster_path ? `${IMG}w500${it.poster_path}` : it.backdrop_path ? `${IMG}w780${it.backdrop_path}` : undefined,
      background: it.backdrop_path ? `${IMG}w1280${it.backdrop_path}` : undefined,
      description: it.overview || undefined, releaseInfo: date.slice(0, 4) || undefined, released: date ? `${date}T00:00:00.000Z` : undefined,
    };
  };
  if (src.tmdbSourceType === "COLLECTION") {
    if (page > 1) return { metas: [], hasMore: false };
    const d = await tmdb(env, `/collection/${Number(src.tmdbId)}`, {}, lang);
    return { metas: (d.parts || []).map(toMeta).filter(Boolean), hasMore: false };
  }
  if (src.tmdbSourceType === "PERSON" || src.tmdbSourceType === "DIRECTOR") {
    // Filmographie (une seule page, comme Nuvio TV) : rôles, ou films réalisés ; les plus populaires d'abord.
    if (page > 1) return { metas: [], hasMore: false };
    const d = await tmdb(env, `/person/${Number(src.tmdbId)}/${tv ? "tv" : "movie"}_credits`, {}, lang);
    const rows = src.tmdbSourceType === "DIRECTOR" ? (d.crew || []).filter((c) => c.job === "Director") : d.cast || [];
    const seen = new Set();
    const metas = rows.filter((it) => !seen.has(it.id) && seen.add(it.id))
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).map(toMeta).filter(Boolean);
    return { metas, hasMore: false };
  }
  const f = src.filters || {};
  const sort = src.sortBy || "popularity.desc";
  const p = { page: String(page), sort_by: tv ? sort.replace("primary_release_date.desc", "first_air_date.desc") : sort.replace("first_air_date.desc", "primary_release_date.desc") };
  const set = (k, v) => { if (v != null && v !== "") p[k] = String(v); };
  set("with_companies", f.withCompanies); set("vote_count.gte", f.voteCountGte); set("with_genres", f.withGenres); set("without_genres", f.withoutGenres); set("without_keywords", f.withoutKeywords);
  set("vote_average.gte", f.voteAverageGte); set("with_original_language", f.withOriginalLanguage);
  set("with_keywords", f.withKeywords); set("with_origin_country", f.withOriginCountry); set("with_networks", f.withNetworks);
  set(tv ? "first_air_date.gte" : "primary_release_date.gte", f.releaseDateGte); set(tv ? "first_air_date.lte" : "primary_release_date.lte", f.releaseDateLte);
  if (f.withWatchProviders) { set("watch_region", f.watchRegion || "US"); set("with_watch_providers", f.withWatchProviders); set("with_watch_monetization_types", "flatrate|free|ads|rent|buy"); }
  const d = await tmdb(env, `/discover/${tv ? "tv" : "movie"}`, p, lang);
  const seen = new Set();
  const metas = (d.results || []).map(toMeta).filter((m) => m && !seen.has(m.id) && seen.add(m.id));
  return { metas, hasMore: (d.page || page) < (d.total_pages || page) && metas.length > 0 };
}

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const shortDate = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
/** Ce qu'il faut savoir des épisodes d'une série TMDB, pour episodeNote et betweenSeasons. */
const episodeOf = (d) => ({ next: d.next_episode_to_air, last: d.last_episode_to_air, counts: seasonCounts(d.seasons), status: d.status });
/** { numéro de saison: nombre d'épisodes } d'après la liste des saisons TMDB. */
const seasonCounts = (seasons) => Object.fromEntries((seasons || []).map((x) => [x.season_number, x.episode_count]));
const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const dayName = (iso) => DAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];

/**
 * Épisode d'une série à signaler :
 *   - saison finie (son dernier épisode est sorti, il y a moins d'un mois) : « Saison 1 terminée le
 *     15 oct. », ou « Série terminée le 7 oct. (dernier épisode) » si TMDB dit la série finie ;
 *   - épisode sorti ces 3 derniers jours : « Nouvel épisode sorti jeudi 15 oct. (S1 É8) » ;
 *   - épisode prévu dans les 7 prochains : « Prochain épisode mardi 20 oct. (S1 É3) », « Dernier
 *     épisode de la saison 1 mardi… », « Saison 3 : 1er épisode vendredi 7 nov. ».
 * ep = { next, last } de TMDB, counts = { saison: nombre d'épisodes }, status = statut TMDB.
 */
function episodeNote(ep, today) {
  if (!ep) return "";
  const { next, last, status } = ep;
  const when = (e) => (e.air_date === today ? "aujourd'hui" : `${dayName(e.air_date)} ${shortDate(e.air_date)}`);
  const tag = (e) => `(S${e.season_number} É${e.episode_number})`;
  if (betweenSeasons(ep, today) && last.air_date >= addDays(today, -30)) {
    if (status === "Ended") return `Série terminée le ${shortDate(last.air_date)} (dernier épisode)`;
    if (status === "Canceled") return `Série annulée, dernier épisode le ${shortDate(last.air_date)}`;
    return `Saison ${last.season_number} terminée le ${shortDate(last.air_date)}`;
  }
  if (last && last.air_date && last.air_date <= today && last.air_date >= addDays(today, -3)) {
    if (last.episode_number === 1) return `Saison ${last.season_number} : 1er épisode sorti ${when(last)}`;
    return `Nouvel épisode sorti ${when(last)} ${tag(last)}`;
  }
  if (next && next.air_date && next.air_date >= today && next.air_date <= addDays(today, 7)) {
    if (next.episode_number === 1) return `Saison ${next.season_number} : 1er épisode ${when(next)}`;
    if (isFinale(next, ep.counts)) return `Dernier épisode de la saison ${next.season_number} ${when(next)} ${tag(next)}`;
    return `Prochain épisode ${when(next)} ${tag(next)}`;
  }
  return "";
}

/**
 * La ligne d'une série dans sa fiche : l'épisode de la semaine, et pour une série récente (moins d'un an, comme
 * l'affiche) dont la dernière saison n'a pas de VF dans les sources : « pas encore en VF » — sauf sur une
 * plateforme en France qui la double (série en anglais ou en français, Netflix, Disney+ : comme l'affiche).
 */
async function noteSerie(env, d, imdb, wp, today) {
  const ep = episodeNote(episodeOf(d), today);
  const debut = d.first_air_date || "";
  if (!debut || debut > today || debut < addDays(today, -365) || vfSurPlateforme(wp, d.original_language)) return ep;
  const saison = (d.last_episode_to_air && d.last_episode_to_air.season_number) || d.number_of_seasons || 1;
  const lu = await sourcesSerie(env, imdb, saison);
  if (!sansVf(lu)) return ep;
  return ep ? `${ep} · pas encore en VF` : "Pas encore en VF";
}

/** Dernier épisode de sa saison (TMDB le marque « finale », sinon son numéro = nombre d'épisodes). */
const isFinale = (e, counts = {}) => e.episode_type === "finale" || (e.episode_number > 1 && e.episode_number === counts[e.season_number]);

/** La saison en cours est finie (son dernier épisode est sorti) et la suivante n'a pas commencé. */
function betweenSeasons(ep, today) {
  const { next, last, counts } = ep || {};
  return !!(last && last.air_date && last.air_date <= today && isFinale(last, counts)
    && !(next && next.season_number === last.season_number));
}

// ---------- Fenêtres salle → numérique des distributeurs américains ----------
// data/estimations-vod.json, refait chaque nuit par scripts/build_fenetres_vod.py : la fenêtre habituelle de chaque
// distributeur (mesurée sur ses films des deux dernières années) et l'estimation des films en salle aux États-Unis
// sans sortie numérique annoncée. Lu sur le dépôt principal (ASSETS), comme les copies : rien à régler chez elles.
// Gardé 1 h dans la mémoire de l'instance (et par Cloudflare) : au plus un appel par requête, aucun d'habitude.
// Illisible : la salle + 45 jours, comme avant. Le service d'affiches lit le même fichier (affiches/lib/estimations.js).
const VOD_URL = `${ASSETS}/data/estimations-vod.json`;
const VOD_MS = 3600e3, VOD_ECHEC_MS = 5 * 60e3, VOD_DELAI_MS = 3000;
const SALLE_JOURS = 45;   // sans le fichier : le délai habituel d'avant (salle + 45 jours)
let VOD = null;           // { table (ou null), until, promesse (lecture en cours, ou null) }

const joursValides = (n) => Number.isInteger(n) && n >= 0 && n <= 200;
/** Le fichier lu, vérifié : { mediane (ou null), films, fenetres }, ou null s'il n'a pas la bonne forme. */
function tableVod(d) {
  if (!d || typeof d !== "object" || !d.films || typeof d.films !== "object") return null;
  return { mediane: joursValides(d.mediane) ? d.mediane : null, films: d.films, fenetres: d.fenetres && typeof d.fenetres === "object" ? d.fenetres : {} };
}

/**
 * La table des estimations, ou null (pas lue, illisible). Une seule lecture à la fois pour toute l'instance ; une
 * requête qui arrive pendant celle d'une autre ne l'attend pas plus de VOD_DELAI_MS (l'autre requête peut finir avant).
 * Échec : l'ancienne table sert encore, nouvel essai dans 5 minutes.
 */
function estimationsVod() {
  const now = Date.now();
  if (!VOD || (!VOD.promesse && now >= VOD.until)) {
    const ancienne = VOD ? VOD.table : null;
    const etat = { table: ancienne, until: Infinity, promesse: null };
    etat.promesse = fetch(VOD_URL, { signal: AbortSignal.timeout(VOD_DELAI_MS), cf: { cacheTtl: 3600, cacheEverything: true } })
      .then((r) => (r.ok ? r.json() : null)).then(tableVod).catch(() => null)
      .then((t) => {
        etat.table = t || ancienne;
        etat.until = Date.now() + (t ? VOD_MS : VOD_ECHEC_MS);
        etat.promesse = null;
        return etat.table;
      });
    VOD = etat;
  }
  const etat = VOD;
  if (!etat.promesse) return Promise.resolve(etat.table);
  let timer;
  return Promise.race([etat.promesse, new Promise((ok) => { timer = setTimeout(() => ok(etat.table), VOD_DELAI_MS + 500); })])
    .finally(() => clearTimeout(timer));
}

/** L'entrée d'un film (identifiant IMDb) dans la table, et la médiane générale, pour dispoChezSoi ; null sans table. */
function estimationDe(table, imdb) {
  if (!table) return null;
  return { film: imdb && Object.hasOwn(table.films, imdb) ? table.films[imdb] : null, mediane: table.mediane };
}

/**
 * Jours entre la salle américaine et l'estimation de la sortie numérique : la fenêtre du distributeur du film (table),
 * sinon la médiane de tous les films mesurés, sinon 45 jours. On ajoute les jours de la table à la salle connue
 * aujourd'hui (pas sa date toute faite) : une sortie en salle repoussée depuis la nuit décale l'estimation aussi.
 */
function fenetreVod(vod) {
  const f = vod && vod.film;
  if (f && joursValides(f.jours)) return f.jours;
  return vod && joursValides(vod.mediane) ? vod.mediane : SALLE_JOURS;
}

/**
 * [plus courte, plus longue] fenêtre de la table (distributeurs, films estimés, médiane générale) ; [45, 45] sans
 * table. Un film resté longtemps en salle sans date a une estimation plus lointaine que la fenêtre de son distributeur.
 */
function bornesVod(table) {
  const jours = table ? [table.mediane, ...[...Object.values(table.fenetres), ...Object.values(table.films)].map((f) => f && f.jours)].filter(joursValides) : [];
  return jours.length ? [Math.min(...jours), Math.max(...jours)] : [SALLE_JOURS, SALLE_JOURS];
}

/** Une estimation à faire : sortie en salle aux États-Unis, sans sortie numérique américaine annoncée. */
const besoinEstimation = (releases) => releaseDates(releases, [2, 3], ["US"]).length > 0 && !releaseDates(releases, [4], ["US"]).length;

/** Pour les tests : oublie la table gardée en mémoire. */
const oublierEstimations = () => { VOD = null; };

/** Dates de sortie (AAAA-MM-JJ, triées) des types demandés, dans les pays demandés (tous sans pays). */
function releaseDates(releases, types, countries) {
  return (releases || [])
    .filter((r) => !countries || countries.includes(r.iso_3166_1))
    .flatMap((r) => r.release_dates || [])
    .filter((r) => types.includes(r.type))
    .map((r) => (r.release_date || "").slice(0, 10))
    .filter(Boolean)
    .sort();
}

/**
 * Le jour où un film arrive chez soi, et si ce n'est qu'une estimation (vers) : { date, vers }, date vide sans aucune
 * sortie. Le calendrier américain des sorties numériques (Premium VOD) seulement : c'est le fichier américain qui fait
 * apparaître les sources, souvent déjà avec la VF (les sources le disent ensuite) ; la chronologie des médias française
 * ne compte pas.
 *   - sa sortie numérique aux États-Unis, annoncée (L'Odyssée : le 17 nov., même en salle en France depuis juillet) ;
 *   - sinon sa sortie en salle aux États-Unis + la fenêtre habituelle de son distributeur américain, en estimation
 *     (vod = estimationDe : Universal 18 jours, Disney 60…, voir fenetreVod) ;
 *   - film français (rarement sorti aux États-Unis), ou film étranger jamais sorti aux États-Unis : ses propres dates,
 *     la première sortie numérique (vidéo, télé) où que ce soit, sinon la première salle + 45 jours.
 * La même fonction que dispoChezSoi dans affiches/lib/statut.js : la fiche et l'affiche disent le même jour.
 */
export function dispoChezSoi(releases, langue, vod = null) {
  if (langue !== "fr") {
    const numerique = releaseDates(releases, [4], ["US"])[0];
    if (numerique) return { date: numerique, vers: false };
    const salle = releaseDates(releases, [2, 3], ["US"])[0];
    if (salle) return { date: addDays(salle, fenetreVod(vod)), vers: true };
  }
  const connu = releaseDates(releases, [4, 5, 6])[0];
  if (connu) return { date: connu, vers: false };
  const salle = releaseDates(releases, [2, 3])[0];
  return salle ? { date: addDays(salle, SALLE_JOURS), vers: true } : { date: "", vers: false };
}

/**
 * Sur une plateforme (abonnement, gratuit, pub, location, achat) en France (watch/providers TMDB). La France seule :
 * en Suisse ou au Canada, la plateforme peut n'avoir que l'allemand ou l'anglais.
 */
function plateformeFrance(wp) {
  const fr = (wp && wp.results && wp.results.FR) || {};
  return ["flatrate", "free", "ads", "rent", "buy"].some((k) => (fr[k] || []).length > 0);
}

/**
 * … et en VF : film en anglais ou en français, ou autre film étranger sur Netflix ou Disney+ en abonnement (ils
 * doublent presque tout). EB (néerlandais) est sur Prime Video en VO seulement. Même règle que les affiches.
 */
function vfSurPlateforme(wp, originalLanguage, kw) {
  if (!plateformeFrance(wp) || standUp(kw, originalLanguage)) return false;
  const fr = wp.results.FR;
  return ["en", "fr"].includes(originalLanguage) || (fr.flatrate || []).some((p) => /netflix|disney/i.test(p.provider_name || ""));
}

// Spectacle de stand-up étranger (mots-clés TMDB « stand-up comedy », « comedy special ») : jamais doublé, même sur
// Netflix. Un spectacle en français est déjà en VF.
const STAND_UP = [9716, 362573];
const standUp = (kw, langue) => langue !== "fr" && ((kw && kw.keywords) || []).some((k) => STAND_UP.includes(k.id));
// Grandes plateformes d'abonnement qui doublent ce qu'elles diffusent (identifiants TMDB) : Netflix (avec ou sans pub),
// Prime Video, Disney+, Paramount+, HBO Max, Apple TV+, Canal+. Pas MUBI ni les petites, souvent en VOSTFR.
const DOUBLEURS = new Set([8, 1796, 119, 337, 531, 1899, 350, 381]);
const DOUBLENT_TOUT = new Set([8, 1796, 337]);   // Netflix, Disney+ : aussi les films étrangers

/**
 * Film en abonnement en France sur une plateforme qui le double : en VF même si ses sources n'ont que la VO (les
 * documentaires Netflix, Turning Point, L'Envers du sport : personne ne publie la VF, Netflix l'a). Film en anglais ou
 * en français ; un autre film étranger seulement sur Netflix ou Disney+. Jamais un spectacle de stand-up. Même règle
 * que les affiches (affiches/lib/tmdb.js).
 */
function abonnementVf(wp, originalLanguage, kw) {
  const fr = (wp && wp.results && wp.results.FR) || {};
  const ids = ["flatrate", "free", "ads"].flatMap((k) => fr[k] || []).map((p) => p.provider_id);
  if (standUp(kw, originalLanguage)) return false;
  return ids.some((id) => (["en", "fr"].includes(originalLanguage) ? DOUBLEURS : DOUBLENT_TOUT).has(id));
}

/** Les sources lues, en VF si le film est en abonnement sur une plateforme qui le double (abonnementVf). */
const avecAbonnement = (lu, abonnement) => (lu && !lu.vf && abonnement ? { ...lu, vf: true } : lu);

/**
 * Les sources lues n'ont pas la VF : des sources en VO seulement, ou aucune source (rien de publié, pas de VF non
 * plus : 空枪, N°4 des Tendances le 25 octobre 2026, « Dispo depuis le 23 oct. » sans une seule source).
 */
const sansVf = (lu) => !!lu && !lu.vf;

/**
 * Regardable chez soi en VF aujourd'hui (la règle des affiches, affiches/lib/statut.js) : des sources VF (même avant la
 * date), sinon la date de dispoChezSoi passée — le fichier américain est sorti —, sauf si ses sources n'ont pas la VF
 * ou s'il n'en a aucune (rien de publié : pas de VF non plus) ; sans sources lues (vieux film, service muet), la date
 * dit vrai. Sources pas lues : une plateforme en France (en VF, vfSurPlateforme) suffit, même avant la date.
 * lu = { vf, sources } des sources (ou rien), plateformeFr = vfSurPlateforme, vod = estimationDe (voir dispoChezSoi).
 */
function enVfChezSoi(releases, langue, today, lu, plateformeFr = false, vod = null) {
  if (lu && lu.vf) return true;
  const { date } = dispoChezSoi(releases, langue, vod);
  // Sources lues sans VF : en VO, ou aucune (空枪, N°4 des Tendances le 25 octobre 2026, « Dispo depuis le 23 oct. »).
  if (date && date <= today) return !lu;
  return !lu && !!plateformeFr;
}

/**
 * La VF lue dans les sources (Torrentio, via le service d'affiches : /vf.json, gardé un jour) pour des films :
 * Map tt… → { vf, sources }. Un seul appel pour toute une page (50 appels sortants au plus par requête). Les
 * titres pas lus, ou le service muet : absents de la Map, et les dates décident (enVfChezSoi).
 */
/**
 * L'avis VF de la photo du jour (vfi : tt… → 1 ou 0), StreamFusion qui lit les sites français et écarte la VFQ, sinon
 * Torrentio : il prime sur Torrentio seul, qui met le même drapeau 🇫🇷 sur la VFQ et la VFF (Hope et By Any Means, en VFQ
 * seulement, étaient « Dispo depuis le 13 oct. » sur la fiche et BIENTÔT sur l'affiche, qui suit déjà cet avis).
 * Aucune demande de plus à StreamFusion : l'avis est pris une fois, à 4 h. Photo illisible : rien.
 */
// L'avis lu avec la photo (photoTendances) : pas relu dans la même requête (50 appels sortants au plus par requête).
const avisLu = new Map(), AVIS_MS = 10 * 60000;
async function avisPhoto(env, kind) {
  const deja = avisLu.get(kind);
  if (deja && Date.now() - deja.t < AVIS_MS) return deja.vfi;
  try {
    const res = await fetch(`${relaisUrl(env)}/tendances/${kind === "series" ? "series.json?v=9" : "movie.json?v=10"}`, { cf: { cacheEverything: true } });
    const d = res.ok ? await res.json() : {};
    const vfi = d && d.vfi && !d.secours ? d.vfi : {};
    avisLu.set(kind, { vfi, t: Date.now() });
    return vfi;
  } catch (e) { return {}; }
}
/** Les sources lues, corrigées par l'avis de la photo (pas pendant la photo elle-même : lireVfPhoto). */
async function avecAvisPhoto(env, kind, lus, lire) {
  if (lire !== lireVf || !lus.size) return lus;
  const avis = await avisPhoto(env, kind);
  for (const [imdb, lu] of lus) {
    if (avis[imdb] === 0 || avis[imdb] === 1) lus.set(imdb, { ...lu, vf: avis[imdb] === 1, sources: Math.max(1, lu.sources || 0) });
  }
  return lus;
}

async function sourcesVf(env, imdbs, lire = lireVf) {
  const ids = [...new Set((imdbs || []).filter((x) => /^tt\d{1,10}$/.test(x || "")))].slice(0, 40);
  if (!ids.length) return new Map();
  const lus = await lire(env, ids.map((i) => "movie/" + i));
  const vus = await avecAvisPhoto(env, "movie", new Map(ids.map((i) => [i, lus.get("movie/" + i)]).filter(([, x]) => x)), lire);
  return lire === lireVf ? avecAvisDuJour(env, vus, ids.map((i) => [i, "movie/" + i])) : vus;
}

/**
 * L'avis du jour (avisDuJour : Lumio, sinon StreamFusion) par-dessus Torrentio et la photo, pour les rangées et les
 * fiches : le même que celui des affiches. Seulement avec Lumio (LUMIO_URL) : StreamFusion seul garde son plafond pour
 * la photo et les affiches. paires : [[imdb, clé]] ; lus : Map imdb → { vf, sources, langue } (complétée ici).
 */
async function avecAvisDuJour(env, lus, paires) {
  if (!env.LUMIO_URL || !paires.length) return lus;
  const avis = await avisEnLots(env, paires.map(([, cle]) => cle));
  for (const [imdb, cle] of paires) {
    const a = avis.get(cle);
    if (a) lus.set(imdb, { ...(lus.get(imdb) || {}), vf: a.vf, sources: Math.max(1, a.sources || 0) });
  }
  return lus;
}

/** avisDuJour par lots de SF_MAX : chaque lot dans un appel de l'addon à lui-même (son budget de 50 appels sortants). */
const CLE_AVIS = /^(movie\/tt\d{1,10}|series\/tt\d{1,10}:\d{1,3}:1)$/;
async function avisEnLots(env, cles) {
  const lots = [];
  for (let i = 0; i < cles.length; i += SF_MAX) lots.push(cles.slice(i, i + SF_MAX));
  const lus = await Promise.all(lots.map(async (lot) => {
    if (env.SELF) {
      try {
        const res = await env.SELF.fetch("https://self/avis/lot", { method: "POST",
          headers: { "Content-Type": "application/json", "x-tri": await triCle(env) }, body: JSON.stringify({ cles: lot }) });
        if (res.ok) return new Map(Object.entries((await res.json()).avis || {}));
      } catch (e) { /* ici même */ }
    }
    return (await avisDuJour(env, lot, "rangees")).avis;
  }));
  return new Map(lus.flatMap((m) => [...m]));
}

/** La VF des sources pour des séries ([{ imdb, saison }], 1er épisode de la saison) : Map tt… → { vf, sources }. */
async function sourcesVfSeries(env, series, lire = lireVf) {
  const liste = (series || []).filter((x) => /^tt\d{1,10}$/.test(x.imdb || "") && Number.isInteger(x.saison)).slice(0, 40);
  if (!liste.length) return new Map();
  const cle = (x) => `series/${x.imdb}:${x.saison}:1`;
  const lus = await lire(env, liste.map(cle));
  const vus = await avecAvisPhoto(env, "series", new Map(liste.map((x) => [x.imdb, lus.get(cle(x))]).filter(([, x]) => x)), lire);
  return lire === lireVf ? avecAvisDuJour(env, vus, liste.map((x) => [x.imdb, cle(x)])) : vus;
}

/**
 * Les sources d'une série (le 1er épisode de sa dernière saison, comme l'affiche) : { vf, sources, langue } ou null.
 * Seulement pour une série récente (moins d'un an) : c'est elle que l'affiche juge aussi.
 */
async function sourcesSerie(env, imdb, saison) {
  if (!/^tt\d{1,10}$/.test(imdb || "") || !(saison >= 1)) return null;
  const cle = `series/${imdb}:${saison}:1`;
  return (await avecAvisDuJour(env, new Map([[imdb, (await lireVf(env, [cle])).get(cle)]].filter(([, x]) => x)), [[imdb, cle]])).get(imdb) || null;
}

/** /vf.json du service d'affiches pour des clés « movie/tt… » ou « series/tt…:S:1 » : Map clé → { vf, sources, langue }. */
/**
 * La VF d'après StreamFusion (secret STREAMFUSION_URL : un lien d'addon StreamFusion réglé pour écarter l'anglais et le
 * VOSTFR), pour la photo du jour seulement (une quarantaine de titres par jour, pas à chaque affiche). Il lit les
 * sites français que Torrentio ne voit pas : des sources = de la VF (VFF, MULTi…) ; « Aucun résultat » = pas de VF
 * (« N exclus » : des sources, en VO ou VOSTFR). Map clé → { vf, sources } ; un titre qui n'a pas répondu en est
 * absent (Torrentio prend le relais, lireVfPhoto). 18 au plus par photo : la limite de 50 appels sortants.
 */
const SF_MAX = 18, SF_ATTENTE_MS = 15000;
// La qualité des sources VF (mêmes règles que affiches/lib/qualite.js) : DV, HDR et HDR10+ comptent seulement en 4K.
const SF_UHD = /\b(2160p|4k|uhd)\b/i, SF_DV = /\b(dv|dovi|dolby ?vision)\b/i, SF_HDR = /\bhdr(10\+?)?(?=\W|$)/i;
const SF_HDR10P = /\bhdr10(\+|plus)(?=\W|$)/i, SF_FHD = /\b1080p\b/i, SF_ATMOS = /\batmos\b/i;
/** { u, x, p, f, a } : 4K, « DV » ou « HDR », HDR10+, 1080p, Atmos, d'après les noms des sources. */
function qualiteDesSources(textes) {
  const uhd = textes.filter((t) => SF_UHD.test(t));
  return { u: uhd.length ? 1 : 0, x: uhd.some((t) => SF_DV.test(t)) ? "DV" : uhd.some((t) => SF_HDR.test(t)) ? "HDR" : null,
    p: uhd.some((t) => SF_HDR10P.test(t)) ? 1 : 0, f: textes.some((t) => SF_FHD.test(t)) ? 1 : 0, a: textes.some((t) => SF_ATMOS.test(t)) ? 1 : 0 };
}
// Filmé dans une salle de cinéma (CAM, TS, TC) : la même règle que le service d'affiches (affiches/lib/qualite.js).
// Le mot dans le nom du flux, ou après l'année dans le nom du fichier (le film « Cam » de 2018 reste un vrai flux).
const SALLE_NOM = /\b(CAM|TeleSync|TeleCine)\b/i;
const SALLE_FICHIER = /\b(19|20)\d{2}\b.*\b(HD-?CAM|CAM-?RIP|CAM|HD-?TS|TELESYNC|TS|HD-?TC|TELECINE|TC)\b/i;
const filmeEnSalle = (s) => SALLE_NOM.test(s.name || "") || SALLE_FICHIER.test(`${s.title || ""} ${s.description || ""}`);
/**
 * La VF d'après Lumio (secret LUMIO_URL : un lien de profil Lumio réglé sur le français, sans VFQ, langues vérifiées :
 * il lit la langue dans le fichier, pas dans son nom). Des sources = de la VF ; un message « ⚙️ » qui dit qu'aucune ne
 * passe les filtres = pas de VF (By Any Means, en VFQ seulement, que Torrentio et le nom « FRENCH » donnaient en VF).
 * Map clé → { vf, sources, qualite? } ; un titre sans réponse claire (panne, débrideur expiré…) en est absent.
 */
async function lireVfLumio(env, cles) {
  const base = String(env.LUMIO_URL || "").trim().replace(/\/manifest\.json$/, "");
  if (!/^https:\/\//.test(base)) return new Map();
  const lus = await Promise.all(cles.slice(0, SF_MAX).map(async (cle) => {
    try {
      const res = await fetch(`${base}/stream/${cle}.json`, { signal: AbortSignal.timeout(SF_ATTENTE_MS) });
      if (!res.ok) return null;
      const streams = ((await res.json()) || {}).streams || [];
      const texte = (s) => `${s.name || ""} ${s.title || ""} ${s.description || ""}`;
      // Un message (« ⚙️ … aucune ne passe vos filtres », « 🔴 Aucune source trouvée ») n'a pas de lien de lecture.
      const messages = streams.filter((s) => !s.url && !s.infoHash);
      const vraies = streams.filter((s) => !messages.includes(s) && !filmeEnSalle(s));
      if (vraies.length) return [cle, { vf: true, sources: vraies.length, qualite: qualiteDesSources(vraies.map(texte)) }];
      // « 68 sources, mais aucune ne passe vos filtres », « Aucune source trouvée » : il a cherché, rien en VF.
      const vide = messages.find((s) => /ne passe|aucun(e)? (r[ée]sultat|source)/i.test(texte(s)));
      if (vide) return [cle, { vf: false, sources: Math.max(1, Number((/(\d+)\s+sources?/i.exec(texte(vide)) || [])[1]) || 0) }];
      return streams.length && !messages.length ? [cle, { vf: false, sources: 0 }] : null;
    } catch (e) { return null; }
  }));
  return new Map(lus.filter(Boolean));
}

/**
 * L'avis VF du jour pour des titres récents (clés « movie/tt… », « series/tt…:S:1 ») : Lumio, sinon StreamFusion (dans
 * son plafond, compté pour « origine »). Le même pour les affiches, les rangées, les fiches et la photo des tendances.
 * Gardé par Cloudflare : une VF trouvée toute la journée ; « pas de VF » 6 heures, car la VF arrive souvent le jour
 * même de la sortie numérique (The Dog Stars, gris tout le 27 octobre avec l'avis pris à 4 h). SF_MAX titres au plus
 * lus par appel. { avis: Map clé → { vf, sources, qualite? }, plafond: true si StreamFusion était nécessaire mais
 * son plafond atteint }.
 */
const AVIS_NON_MS = 6 * 3600000;
const avisCache = (cle) => new Request(`https://avis.cache/2/${parisToday()}/${cle}`);
async function avisDuJour(env, cles, origine = "affiches") {
  const avis = new Map(), manque = [];
  for (const cle of cles) {
    const hit = await caches.default.match(avisCache(cle)).catch(() => null);
    const d = hit ? await hit.json().catch(() => null) : null;
    if (d && d.avis && (d.avis.vf || Date.now() - d.t < AVIS_NON_MS)) avis.set(cle, d.avis); else manque.push(cle);
  }
  const lus = manque.length ? await lireVfLumio(env, manque) : new Map();
  // Lumio et StreamFusion ensemble : SF_MAX appels au plus (la limite de 50 appels sortants par requête).
  const demandes = env.LUMIO_URL ? Math.min(manque.length, SF_MAX) : 0;
  const reste = manque.filter((c) => !lus.has(c)).slice(0, Math.max(0, SF_MAX - demandes));
  let plafond = false;
  if (reste.length && env.STREAMFUSION_URL) {
    if (await reserverStreamFusion(env, reste.length, origine)) (await lireVfStreamFusion(env, reste)).forEach((v, k) => lus.set(k, v));
    else plafond = true;
  } else if (reste.length) plafond = true;
  for (const [cle, a] of lus) {
    avis.set(cle, a);
    await caches.default.put(avisCache(cle), new Response(JSON.stringify({ avis: a, t: Date.now() }), { headers: { "Cache-Control": "public, max-age=86400" } })).catch(() => {});
  }
  return { avis, plafond: plafond && cles.some((c) => !avis.has(c)) };
}

async function lireVfStreamFusion(env, cles) {
  const base = String(env.STREAMFUSION_URL || "").trim().replace(/\/manifest\.json$/, "");
  if (!/^https:\/\//.test(base)) return new Map();
  const lus = await Promise.all(cles.slice(0, SF_MAX).map(async (cle) => {
    try {
      const res = await fetch(`${base}/stream/${cle}.json`, { signal: AbortSignal.timeout(SF_ATTENTE_MS) });
      if (!res.ok) return null;
      const streams = ((await res.json()) || {}).streams || [];
      const texte = (s) => `${s.name || ""} ${s.title || ""} ${s.description || ""}`;
      const vides = streams.filter((s) => /aucun r[ée]sultat/i.test(texte(s)));
      if (vides.length) {
        // « Aucun résultat » : StreamFusion a cherché et n'a trouvé aucune source en français. Sans VF, même sans source
        // écartée (le fichier pas encore sorti, ou pas encore trouvé) : compté comme au moins une source en VO, pour
        // que la date ne décide pas à sa place. Avant, 空枪 (film chinois sorti en numérique en Chine la veille) était
        // N°1 des Tendances, « Dispo depuis le 23 oct. » : rien chez StreamFusion, donc la date seule.
        const exclus = Number((/(\d+)\s+exclus/i.exec(texte(vides[0])) || [])[1]) || 0;
        return [cle, { vf: false, sources: Math.max(1, exclus) }];
      }
      // Des sources VF (celles qu'on peut lire, en cache chez le débrideur) : leur qualité aussi (« 4K DV » en VF).
      // Sans celles filmées dans une salle de cinéma (CAM, TS, TC) : pas une sortie (voir filmeEnSalle).
      const vraies = streams.filter((s) => !filmeEnSalle(s));
      return [cle, { vf: vraies.length > 0, sources: vraies.length, ...(vraies.length ? { qualite: qualiteDesSources(vraies.map(texte)) } : {}) }];
    } catch (e) { return null; }
  }));
  return new Map(lus.filter(Boolean));
}

/**
 * Plafond de StreamFusion : 300 demandes par jour au plus (réglable : SF_PLAFOND), photo de 4 h comprise, comptées
 * dans la base D1 (table sf_budget). C'est le compte de la personne : jamais plus, quoi qu'il arrive (au-delà,
 * Torrentio jusqu'au lendemain). reserverStreamFusion(env, n, origine) : true si les n demandes tiennent dans le
 * plafond (et les compte), false sinon. Sans base : pas de StreamFusion.
 * Compté aussi par origine, pour savoir où part le plafond (300 dès 9 h 30 le 24 octobre) : lignes « jour:photo »,
 * « jour:affiches », et « jour:refus » (demandes au-delà du plafond).
 */
let budgetPret = null;
async function reserverStreamFusion(env, n = 1, origine = "affiches") {
  if (!env.LIENS || !env.STREAMFUSION_URL) return false;
  const plafond = Number(env.SF_PLAFOND) > 0 ? Number(env.SF_PLAFOND) : 300;
  try {
    await (budgetPret = budgetPret || env.LIENS.prepare("CREATE TABLE IF NOT EXISTS sf_budget (j TEXT PRIMARY KEY, n INTEGER NOT NULL)").run()
      .catch((e) => { budgetPret = null; throw e; }));
    const r = await env.LIENS.prepare("INSERT INTO sf_budget (j, n) VALUES (?1, ?2) ON CONFLICT(j) DO UPDATE SET n = n + ?2 WHERE n + ?2 <= ?3 RETURNING n")
      .bind(parisToday(), n, plafond).first();
    const ok = !!r && r.n <= plafond;
    await env.LIENS.prepare("INSERT INTO sf_budget (j, n) VALUES (?1, ?2) ON CONFLICT(j) DO UPDATE SET n = n + ?2")
      .bind(`${parisToday()}:${ok ? origine : "refus"}`, n).run().catch((e) => console.warn(`compte StreamFusion : ${e && e.message}`));
    return ok;
  } catch (e) { console.warn(`plafond StreamFusion : ${e && e.message}`); return false; }
}

/**
 * /sf/{movie|series}/{tt…|tt…:saison:1}.json : l'avis de StreamFusion pour un titre récent, demandé par le service
 * d'affiches (relais /qualite, avec la clé RELAIS_KEY : sans elle, refusé). { vf, sources, qualite? } ; { plafond:
 * true } (le plafond du jour est atteint) ; { erreur: true } (StreamFusion n'a pas répondu). Gardé un jour par
 * Cloudflare : un titre n'est demandé qu'une fois par jour, d'où qu'il vienne.
 */
async function routeStreamFusion(request, env, cle) {
  const entete = { ...HEADERS, "Cache-Control": "no-store" };
  if (!env.RELAIS_KEY || (await sha256(request.headers.get("X-Relais-Cle") || "")) !== (await sha256(env.RELAIS_KEY))) {
    return new Response(JSON.stringify({ error: "refusé" }), { status: 403, headers: entete });
  }
  const { avis, plafond } = await avisDuJour(env, [cle]);
  const a = avis.get(cle);
  return new Response(JSON.stringify(a || (plafond ? { plafond: true } : { erreur: true })), { headers: entete });
}

/** La VF pour la photo du jour : l'avis du jour (Lumio, sinon StreamFusion), Torrentio (lireVf) pour ce qu'il n'a pas dit. */
async function lireVfPhoto(env, cles) {
  const pris = cles.slice(0, SF_MAX);
  const sf = pris.length ? (await avisDuJour(env, pris, "photo")).avis : new Map();
  const reste = cles.filter((c) => !sf.has(c));
  const tr = reste.length ? await lireVf(env, reste) : new Map();
  return new Map([...tr, ...sf]);
}

async function lireVf(env, cles) {
  try {
    const url = `${relaisUrl(env)}/vf.json?v=${cles.join(",")}`;
    // RELAIS_KEY (secret facultatif, la même valeur que la variable du service d'affiches) : sans elle, le service
    // ne lit pour nous une liste pas encore dans son cache que s'il n'a pas de clé lui-même (affiches/lib/relais.js).
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), cf: { cacheTtl: 3600, cacheEverything: true },
      headers: env.RELAIS_KEY ? { "X-Relais-Cle": env.RELAIS_KEY } : {} });
    if (!res.ok) return new Map();
    const d = await res.json();
    return new Map(cles.map((c) => [c, d && d[c]]).filter(([, x]) => x && typeof x.vf === "boolean"));
  } catch { return new Map(); }
}

/**
 * Film récent : première vraie sortie (salle, numérique, télé) il y a moins d'un an. Les sources ne jugent que
 * ceux-là, comme sur les affiches : un vieux film qui ressort au cinéma (Les Diables, 1971) a de la VF, mais
 * reste une ressortie. Comme les affiches aussi (estVieux) : récent s'il sort pour la première fois au cinéma en
 * France, même sorti ailleurs depuis plus d'un an (3670 : en Corée il y a 14 mois), sauf vraie reprise (plus de 2 ans).
 */
function filmRecent(releases, today) {
  const d = releaseDates(releases || [], [2, 3, 4, 5, 6])[0];
  if (!d || d >= addDays(today, -365)) return true;
  return d >= addDays(today, -730) && releaseDates(releases, [2, 3], ["FR"]).some((x) => x > today);
}

/**
 * Quand le film sera visible chez soi en VF (dispoChezSoi : le calendrier américain), comme l'affiche :
 *   « Dispo le 17 nov. »          date annoncée, à venir (même si les sources n'ont encore que la VO : le fichier
 *                                 américain n'est pas sorti, on ne dit pas « Pas encore en VF »)
 *   « Dispo vers le 3 déc. »      pas de date annoncée : estimation (salle + la fenêtre du distributeur américain,
 *                                 sans le nommer)
 *   « Dispo depuis le 9 oct. »    date passée depuis moins de 60 jours
 *   « Aucune date »               date passée, sources sans VF (Buddy) : on ne sait pas quand la VF viendra
 *   « Déjà dispo »                en VF avant la date (sources VF, ou plateforme en France quand on n'a pas lu les sources)
 * etat = { vf: sources VF (ou plateforme en France en VF, sources pas lues), vo: sources sans VF, surPlateforme: sur
 * une plateforme en France sans savoir si c'est en VF (sources pas lues) }. vod = estimationDe (voir dispoChezSoi).
 */
function releaseNote(releases, langue, today, etat = {}, vod = null) {
  const { date, vers } = dispoChezSoi(releases || [], langue, vod);
  const connuPasse = !!date && !vers && date <= today;
  // Les dates et les plateformes se trompent (Kraken, norvégien, en VF sur Paramount+) : seules les sources disent
  // « Pas encore en VF », et seulement une fois le fichier sorti. Vieux film (L'Étrange Noël de monsieur Jack, en VF
  // sur Disney+) : évidemment dispo, rien à dire.
  if (!connuPasse && etat.vf) return filmRecent(releases, today) ? "Déjà dispo" : "";
  // Le fichier américain est sorti sans VF : plus de date à attendre (on ne sait pas quand la VF viendra) ; jamais la
  // VO (seule la VF compte).
  if (etat.vo && !etat.vf && !(date > today)) return "Aucune date";
  // Sur une plateforme en France, sans savoir si c'est en VF : pas de date qui ne voudrait plus rien dire.
  if (!connuPasse && etat.surPlateforme) return "";
  if (!date) return "";
  if (!vers) {
    if (date > today) return date <= addDays(today, 200) ? `Dispo le ${shortDate(date)}` : "";
    return date >= addDays(today, -60) ? `Dispo depuis le ${shortDate(date)}` : "";
  }
  // Estimation déjà passée : regardable, comme l'affiche (en couleur) ; pas de date qu'on ne connaît pas.
  if (date <= today) return "";
  return `Dispo vers le ${shortDate(date)}`;
}

/**
 * Film pas encore sorti (« Les plus attendus ») : sa sortie au cinéma dans le pays choisi, sinon
 * sa première sortie ailleurs. L'année n'est ajoutée que si ce n'est pas l'année en cours.
 *   « Au cinéma le 3 déc. »   « Sort le 12 mars 2027 »   « Date de sortie pas encore annoncée »
 */
function cinemaNote(releases, region, date, today) {
  const withYear = (iso) => shortDate(iso) + (iso.slice(0, 4) === today.slice(0, 4) ? "" : ` ${iso.slice(0, 4)}`);
  const here = cinemaHere(releases, region, today);
  if (here) return `Au cinéma le ${withYear(here)}`;
  const first = releaseDates(releases, [1, 2, 3, 4]).find((d) => d > today) || (date > today ? date : "");
  return first ? `Sort le ${withYear(first)}` : "Date de sortie pas encore annoncée";
}
const cinemaHere = (releases, region, today) => releaseDates(releases, [2, 3], [region]).find((d) => d > today) || "";

const IMG = "https://image.tmdb.org/t/p/";

// Genres TMDB en français (affichés sous le titre dans le grand carrousel).
const GENRE_NAMES = {
  28: "Action", 12: "Aventure", 16: "Animation", 35: "Comédie", 80: "Crime", 99: "Documentaire",
  18: "Drame", 10751: "Familial", 14: "Fantastique", 36: "Histoire", 27: "Horreur", 10402: "Musique",
  9648: "Mystère", 10749: "Romance", 878: "Science-fiction", 10770: "Téléfilm", 53: "Thriller",
  10752: "Guerre", 37: "Western", 10759: "Action & Aventure", 10762: "Enfants", 10763: "Actualité",
  10764: "Téléréalité", 10765: "SF & Fantastique", 10766: "Feuilleton", 10767: "Talk-show",
  10768: "Guerre & Politique",
};

/**
 * Une fiche par résultat, sans en retirer aucun : la pagination reste exacte
 * (20 résultats TMDB = 20 fiches, donc « skip » tombe toujours sur la bonne page).
 * Sans identifiant IMDb, on se rabat sur « tmdb:<id> », que la fiche (/meta) sait ouvrir.
 */
async function toMetas(env, ctx, results, kind, opts, today) {
  // « Pour qui » de toute la page préparés en arrière-plan (pas pendant la recherche, au budget compté).
  if (!opts.search) prefetchProfiles(env, ctx, results, kind);
  // Infos déjà lues pour trier la page (Tendances) : pas un second appel par titre.
  // Pendant une recherche (budget d'appels compté au plus juste) : Cinemeta seulement s'il est déjà en mémoire.
  const budget = { cinemeta: opts.search ? 0 : CINEMETA_PAR_PAGE };
  const infos = await Promise.all(results.map((it) => (opts.infos && opts.infos.get(it.id)) || extraInfo(env, kind, it.id, budget)));
  if (opts.bilan) { opts.bilan.vus += infos.length; opts.bilan.rates += infos.filter((x) => x.rate).length; }
  const ids = infos.map((x) => x.imdb);
  // VF déjà trouvée par une fiche (Allociné + YouTube) : un seul appel pour toute la page, pas pendant
  // la recherche (son budget d'appels est compté au plus juste).
  const vfIndex = opts.search ? {} : await (opts.vfIndex = opts.vfIndex || readVfIndex());
  // VF des sources (« Dispo depuis peu », « Bientôt dispo », « Prochainement ») : un appel pour la page.
  const sources = opts.sources || (opts.lireSources && kind === "movie" ? await sourcesVf(env, ids) : new Map());
  return results.map((it, i) => {
    const recent = kind === "movie" && filmRecent(infos[i].releases, today);
    const lu = recent ? avecAbonnement(sources.get(ids[i]), infos[i].abonnementVf) : null;
    // En VF chez soi aujourd'hui : la date américaine passée, ou les sources (voir enVfChezSoi), comme les affiches.
    const chezSoi = kind === "movie" ? dispoChezSoi(infos[i].releases, it.original_language, infos[i].vod) : { date: "", vers: false };
    const vf = kind === "movie" && enVfChezSoi(infos[i].releases, it.original_language, today, lu, infos[i].plateformeFr, infos[i].vod);
    // « Pas encore en VF » : le fichier est sorti (date passée), ses sources n'ont pas la VF. Avant la date, la date.
    const vo = sansVf(lu) && !(chezSoi.date > today);
    const date = it.release_date || it.first_air_date || "";
    // Films : quand ils deviennent regardables (« Les plus attendus » : quand ils sortent au cinéma) ;
    // séries : l'épisode de la semaine.
    const note = kind !== "movie" ? episodeNote(infos[i].episode, today)
      : opts.upcoming ? cinemaNote(infos[i].releases, opts.region, date, today)
      : releaseNote(infos[i].releases, it.original_language, today,
        lu ? { vf: lu.vf, vo: sansVf(lu) } : { vf: infos[i].plateformeFr, surPlateforme: !!infos[i].plateformeVo }, infos[i].vod);
    // Pas encore regardable : la date affichée par Nuvio (carrousel, « date de sortie
    // complète ») devient la date de dispo plutôt que la sortie en salle.
    const dispo = chezSoi.date;
    const shownDate = opts.upcoming ? cinemaHere(infos[i].releases, opts.region, today) || date
      : dispo && dispo > today ? dispo : date;
    // Séries : identifiant TMDB direct. Avec l'identifiant IMDb, Nuvio refait la
    // correspondance IMDb → TMDB et tombe parfois sur une autre série (fiches TMDB
    // en double, ex. « Frères d'armes » affiché avec l'image d'une telenovela).
    const meta = {
      id: kind === "series" || !ids[i] ? `tmdb:${it.id}` : ids[i],
      imdb_id: ids[i] || undefined,
      type: kind,
      name: (it.title || it.name || "").replace(/^[‎‏\s]+|[‎‏\s]+$/g, ""),
      poster: it.poster_path ? `${IMG}w500${it.poster_path}` : undefined,
      // Fond en Full HD (w1920) : aussi net que l'original sur une TV 1080p, mais 2 à 5 fois plus léger
      // (l'original est souvent en 4K, plusieurs Mo par image). Le w1280 paraît flou en plein écran.
      background: infos[i].backdrop || it.backdrop_path ? `${IMG}w1920${infos[i].backdrop || it.backdrop_path}` : undefined,
      logo: infos[i].logo,
      description: [note ? `${kind === "movie" ? "📅" : "📺"} ${note}${note.endsWith(".") ? "" : "."}` : "", it.overview || ""].filter(Boolean).join("\n") || undefined,
      // Séries : l'épisode de la semaine seulement dans le résumé (le hero affiche aussi cette ligne :
      // il apparaissait deux fois, et coupé ici). Films : l'année seule aussi (« 2003 · Déjà dispo » sous les cartes,
      // coupé) ; la dispo reste dans le résumé.
      releaseInfo: date.slice(0, 4) || undefined,
      released: shownDate ? `${shownDate}T00:00:00.000Z` : undefined,
      genres: (it.genre_ids || []).map((g) => GENRE_NAMES[g]).filter(Boolean).slice(0, 3),
      imdbRating: imdbRating(ids[i]),   // vraie note IMDb (rien si IMDb n'en a pas assez)
      ...catalogTrailers(infos[i].trailers || [], vfIndex[`${kind}:${ids[i]}`]),
      // Le jour de dispoChezSoi : annoncé (_digital) ou estimé (_guess), pour les rangées « Dispo depuis peu »,
      // « Bientôt dispo ».
      _digital: chezSoi.vers ? "" : chezSoi.date,
      _guess: chezSoi.vers ? chezSoi.date : "",
      _vf: vf,
      // Déjà en VF aujourd'hui, avant la date (pour « Bientôt dispo ») : sources VF, sinon une plateforme en France.
      _dejaVf: lu ? lu.vf : !!infos[i].plateformeFr,
      // Déjà chez soi (date passée), mais en VO seulement (sources sans VF) : « Pas encore en VF ».
      _vo: vo,
    };
    return meta;
  });
}

/** Une fiche sans les champs internes de toMetas (« _digital »…), telle qu'envoyée à Nuvio. */
const sansInternes = ({ _digital, _guess, _vf, _dejaVf, _vo, ...m }) => m;

/** Paramètres TMDB d'une recherche « discover », avec les règles de qualité communes
 *  et les réglages de la config (pays, genres masqués, note et année minimales, famille). */
function discoverParams(def, kind, today, opts) {
  const p = { ...def.discover };
  const cfg = opts.cfg;
  if (p["vote_count.gte"] === undefined) p["vote_count.gte"] = 50;   // pas de titres confidentiels
  const excluded = new Set(String(p.without_genres || "").split(/[|,]/).filter(Boolean));
  // Téléréalité, talk-shows… masqués, sauf dans une rangée sur mesure qui les demande.
  const wanted = String(p.with_genres || "").split(/[|,]/);
  if (kind === "series") NOISE_TV.filter((g) => !wanted.includes(g)).forEach((g) => excluded.add(g));
  const col = kind === "series" ? 2 : 1;
  for (const name of cfg.e) { const g = GENRES.find(([n]) => n === name); if (g && g[col]) excluded.add(String(g[col])); }
  if (cfg.f) {
    if (kind === "series") { p.with_genres = p.with_genres ? p.with_genres : "10751|10762|16"; ["80", "10768", "9648"].forEach((g) => excluded.add(g)); }
    else { p.certification_country = "FR"; p["certification.lte"] = "10"; excluded.add("27"); }
  }
  if (excluded.size) p.without_genres = [...excluded].join("|");
  if (p.watch_region) p.watch_region = opts.region;
  if (p.region) p.region = opts.region;
  if (def.availableHere && !cfg.u) {
    // Seulement ce qu'on peut déjà regarder dans le pays choisi (abonnement, location ou achat) :
    // pas les films encore au cinéma, ni ceux sortis en numérique ailleurs seulement. C'est un
    // filtre de la même requête : aucun appel en plus.
    p.watch_region = opts.region;
    p.with_watch_monetization_types = p.with_watch_monetization_types || "flatrate|free|ads|rent|buy";
  }
  if (cfg.m) p["vote_average.gte"] = Math.max(Number(p["vote_average.gte"]) || 0, cfg.m);
  const gte = kind === "series" ? "first_air_date.gte" : "primary_release_date.gte";
  const lte = kind === "series" ? "first_air_date.lte" : "primary_release_date.lte";
  if (def.lastDays) { p[gte] = addDays(today, -def.lastDays); p[lte] = today; }
  if (def.nextDays) { p[gte] = today; p[lte] = addDays(today, def.nextDays); }
  if (def.untilToday) p[lte] = today;
  if (def.fromYear) p[gte] = maxDate(p[gte], `${def.fromYear}-01-01`);
  if (def.toYear) p[lte] = minDate(p[lte], `${def.toYear}-12-31`);
  if (def.airedSince) p["air_date.gte"] = addDays(today, -def.airedSince);
  if (def.airDays !== undefined) { p["air_date.gte"] = addDays(today, -def.airDays); p["air_date.lte"] = addDays(today, def.airDays); }
  if (cfg.a) {
    p[gte] = maxDate(p[gte], `${cfg.a}-01-01`);
    const yearKey = kind === "series" ? "first_air_date_year" : "primary_release_year";
    if (p[yearKey] && Number(p[yearKey]) < cfg.a) p[yearKey] = cfg.a;   // année demandée trop ancienne : liste vide
  }
  return p;
}
const maxDate = (a, b) => (!a || b > a ? b : a);

/**
 * Un titre d'une liste TMDB (Tendances du jour) passe-t-il les filtres généraux (genres masqués, note minimale, année
 * minimale, mode famille) ? Les mêmes que discoverParams, appliqués à la liste au lieu de la requête : la rangée garde
 * le classement du jour et ses N°, sans les titres filtrés (un N° filtré laisse un trou). Mode famille d'un film :
 * sans horreur ni thriller, comme les tuiles (filterSource) : sa classification n'est pas dans la liste.
 */
function passeLesFiltres(it, kind, cfg) {
  const col = kind === "series" ? 2 : 1;
  const genres = (it.genre_ids || []).map(String);
  const exclus = new Set();
  for (const name of cfg.e) { const g = GENRES.find(([n]) => n === name); if (g && g[col]) exclus.add(String(g[col])); }
  if (cfg.f) (kind === "series" ? ["80", "10768", "9648"] : ["27", "53"]).forEach((g) => exclus.add(g));
  if (genres.some((g) => exclus.has(g))) return false;
  if (cfg.f && kind === "series" && !genres.some((g) => ["10751", "10762", "16"].includes(g))) return false;
  if (cfg.m && !((it.vote_average || 0) >= cfg.m)) return false;
  if (cfg.a && !((it.release_date || it.first_air_date || "") >= `${cfg.a}-01-01`)) return false;
  return true;
}
const minDate = (a, b) => (!a || b < a ? b : a);

/**
 * Listes « toutes faites » de TMDB (tendances, à l'affiche…) : elles n'acceptent aucun
 * filtre. Quand des filtres globaux sont actifs, on les remplace par l'équivalent « discover ».
 */
function endpointAsDiscover(def) {
  const map = {
    "/trending/movie/week": { lastDays: 365 }, "/trending/tv/week": { lastDays: 365 },
    "/trending/movie/day": { lastDays: 120 }, "/trending/tv/day": { lastDays: 120 },
    "/movie/now_playing": { lastDays: 45, discover: { with_release_type: "2|3", region: "FR" } },
    "/movie/upcoming": { nextDays: 90, discover: { with_release_type: "2|3", region: "FR" } },
    "/tv/on_the_air": { airDays: 7 }, "/tv/airing_today": { airDays: 0 },
  };
  const m = map[def.endpoint];
  if (!m) return def;
  const { endpoint, params, ...rest } = def;
  return { ...rest, ...m, discover: { sort_by: "popularity.desc", "vote_count.gte": 10, ...(m.discover || {}) } };
}

/**
 * Photo du jour des tendances (worker/tendances.js), publiée par le service d'affiches : identifiant TMDB → place.
 * Les « N° » des affiches en viennent ; les rangées « Tendances du jour » s'y rangent, pour que les numéros se
 * suivent. Elle change chaque jour à 4 h UTC : gardée par Cloudflare jusque-là. Illisible : vide.
 */
async function photoTendances(env, kind) {
  try {
    // ?v=8 : la photo avec l'avis VF et la qualité de StreamFusion ; les précédentes restent sous leurs adresses. Films : ?v=9,
    // la photo reprise le 24 octobre ; ?v=10, celle du 25. Séries : ?v=9, celle du 25 (voir VERSION_PHOTO dans tendances.js).
    // Gardée par Cloudflare le temps que dit le service (jusqu'au changement ; 5 minutes pour un secours, le classement
    // brut de TMDB quand l'addon n'a pas répondu à temps) : jamais un secours toute la journée.
    const res = await fetch(`${relaisUrl(env)}/tendances/${kind === "series" ? "series.json?v=9" : "movie.json?v=10"}`, { cf: { cacheEverything: true } });
    const d = res.ok ? await res.json() : {};
    if (d.secours) return new Map();
    avisLu.set(kind, { vfi: d.vfi || {}, t: Date.now() });
    return new Map((Array.isArray(d.ids) ? d.ids : []).map((id, i) => [id, i]));
  } catch (e) { return new Map(); }
}
/**
 * Le dossier des affiches toutes faites pour des réglages de la régie (s, sans « 1. ») : le style tout prêt qu'ils
 * donnent, en portrait ou en paysage (Signature a le sien), sinon « maison ».
 */
function dossierApercu(forme, s) {
  // Réglages perso : leur dossier (le paysage s'y dessine avec ces réglages-là, comme un portrait sans paysage à part).
  const perso = s ? `perso/${s}` : "maison";
  if (forme !== "landscape") return dossierDe(lireReglages(new URLSearchParams(s ? { s: "1." + s } : {})), null) || perso;
  const m = Object.keys(MEMOIRES).find((k) => ecrireReglages(MEMOIRES_PAYSAGE[k] || MEMOIRES[k]) === s && dossierDe(MEMOIRES[k], MEMOIRES_PAYSAGE[k] || null));
  return m ? dossierDe(MEMOIRES[m], MEMOIRES_PAYSAGE[m] || null) : perso;
}

/** Titres rangés dans l'ordre de la photo ; ceux qu'elle n'a pas, à la suite, dans leur ordre. */
const dansLOrdre = (items, photo) => (photo.size ? [...items].sort((a, b) => (photo.has(a.id) ? photo.get(a.id) : 1e9) - (photo.has(b.id) ? photo.get(b.id) : 1e9)) : items);
const tendancesDuJour = (def) => /^\/trending\/(movie|tv)\/day$/.test(def.endpoint || "");

/** Une page (1, 2, 3…) d'une définition de liste. */
async function fetchPage(env, ctx, def, kind, page, today, opts) {
  if (def.mix) {
    // Rangée mélangée : page N des films + page N des séries, en alternance. Les séries (et suivantes) par un appel de
    // l'addon à lui-même s'il le peut (40 fiches à lire frôlaient les 50 appels permis), sinon ici.
    const lists = await Promise.all(def.mix.map(async (sub, k) => (k > 0 && opts.moitie && await opts.moitie(k, page, opts.bilan))
      || fetchPage(env, ctx, sub, sub.type, page, today, { ...opts, moitie: null })));
    const out = [];
    for (let i = 0; i < Math.max(...lists.map((l) => l.length)); i++) {
      lists.forEach((l) => { if (l[i]) out.push(l[i]); });
    }
    return out;
  }
  if (def.digital) return fetchVfPage(env, ctx, def, kind, page, today, opts);
  if (def.upcoming) return fetchUpcomingPage(env, ctx, kind, page, today, opts);
  // Filtres généraux : une liste TMDB devient une recherche (discover) qui les applique. Sauf les Tendances (sans les titres
  // à venir) : elles gardent le classement du jour et ses N°, filtré après coup (fetchReleasedPage). Avant, elles devenaient
  // « les plus populaires des 120 derniers jours » : sans ordre ni N°, avec des films encore au cinéma (Hope, L'Odyssée).
  const tendances = def.endpoint && def.endpoint.startsWith("/trending/") && !opts.cfg.u;
  if (def.endpoint && opts.filtered && !tendances) def = endpointAsDiscover(def);
  if (tendances) return fetchReleasedPage(env, ctx, def, kind, page, today, opts);
  let data;
  if (def.endpoint) {
    const params = { ...(def.params || {}) };
    if (params.region) params.region = opts.region;
    const [lue, photo] = await Promise.all([tmdb(env, def.endpoint, { ...params, page }, opts.lang), tendancesDuJour(def) ? photoTendances(env, kind) : new Map()]);
    data = photo.size && lue.results ? { ...lue, results: dansLOrdre(lue.results, photo) } : lue;
  } else {
    const endpoint = `/discover/${kind === "series" ? "tv" : "movie"}`;
    const params = discoverParams(def, kind, today, opts);
    let p = page;
    if (def.rotateDaily) {
      // Sélection différente chaque jour : on démarre plus loin dans la liste selon la date.
      const dayIndex = Math.floor(Date.parse(`${today}T00:00:00Z`) / 86400000);
      p = page + (dayIndex % 15);
    }
    data = await tmdb(env, endpoint, { ...params, page: p }, opts.lang);
  }
  if (!data.results || page > (data.total_pages || 0)) return [];
  // « Prochainement » (sorties en salle à venir) : sans les films déjà regardables chez soi en VF (enVfChezSoi : sortis
  // en numérique aux États-Unis, sources VF…), comme les affiches maison (règle « pas sorti »). Infos gardées un jour.
  // La page reste pleine (20) : complétée par la page TMDB suivante, comme les Tendances (Nuvio demande la suite
  // avec skip = titres reçus et ignore les doublons). Chaque fiche n'est lue qu'une fois (passée à toMetas).
  if (def.endpoint === "/movie/upcoming") {
    const sources = new Map();
    const garder = async (liste) => {
      const infos = await Promise.all(liste.map((it) => extraInfo(env, "movie", it.id)));
      (await sourcesVf(env, infos.map((x) => x.imdb))).forEach((v, k) => sources.set(k, v));
      return liste.map((it, i) => [it, infos[i]]).filter(([it, info]) => {
        // Sans dates (TMDB muet) : gardé. Une ressortie (Les Diables, 1971) aussi : un vieux film a sa VF, mais il
        // revient au cinéma, sa place est ici.
        if (!info.releases || !filmRecent(info.releases, today)) return true;
        return !enVfChezSoi(info.releases, it.original_language, today, avecAbonnement(sources.get(info.imdb), info.abonnementVf), info.plateformeFr, info.vod);
      });
    };
    let gardes = await garder(data.results);
    if (gardes.length < PAGE && page < (data.total_pages || 0)) {
      const suite = await tmdb(env, def.endpoint, { ...(def.params || {}), region: opts.region, page: page + 1 }, opts.lang);
      const vus = new Set(gardes.map(([it]) => it.id));
      // (+1 : de quoi remplacer un titre retiré ; MAX_FILL au plus, pour rester loin des 50 appels de Cloudflare. Page
      // encore courte : Nuvio demande la suivante, voir pageOf.)
      gardes = gardes.concat(await garder((suite.results || []).filter((it) => !vus.has(it.id)).slice(0, Math.min(PAGE - gardes.length + 1, MAX_FILL))));
    }
    gardes = gardes.slice(0, PAGE);
    data = { ...data, results: gardes.map(([it]) => it) };
    opts = { ...opts, infos: new Map(gardes.map(([it, info]) => [it.id, info])), sources };
  }
  const metas = await toMetas(env, ctx, data.results, kind, opts, today);
  return metas.map(sansInternes);
}

/**
 * Une moitié (k) d'une rangée mélangée, préparée par un appel de l'addon à lui-même (liaison SELF de wrangler.toml) :
 * cet appel a son propre budget de 50 appels sortants, et garde sa page en cache comme une autre. Réglages passés
 * dans l'adresse (prefixe = « /<segment> », même pour un lien fixe : pas de base à relire). null sans la liaison
 * (copies Docker, sans limite d'appels) ; la fonction rend null si l'appel échoue : la moitié est alors lue ici.
 */
function moitieParSelf(env, prefixe, type, id) {
  if (!env.SELF) return null;
  return async (k, page, bilan) => {
    try {
      const res = await env.SELF.fetch(`https://self${prefixe}/catalog/${type}/${encodeURIComponent(id)}/partie=${k}&page=${page}.json`);
      const metas = res.ok ? (await res.json()).metas : null;
      if (!Array.isArray(metas)) return null;
      // Moitié incomplète (TMDB a refusé des fiches) : la rangée entière l'est aussi.
      if (bilan && res.headers.get("X-Partiel")) { bilan.vus += metas.length; bilan.rates += metas.length; }
      return metas;
    } catch (e) {
      return null;
    }
  };
}

/**
 * Tendances avec seulement ce qu'on peut déjà regarder chez soi en VF : TMDB y classe aussi les films
 * attendus dès leur bande-annonce (Godzilla Minus Zero, voir « Les plus attendus »), ceux qui ne sont
 * encore qu'au cinéma (Street Fighter, voir « Bientôt dispo ») et ceux qu'on ne trouve qu'en VO (The
 * Weight : sources sans VF, une fois sorti en numérique aux États-Unis). Séries : déjà diffusées.
 * Pages pleines (20) : la page N part de la page N de TMDB et se complète avec la suivante. Nuvio
 * demande la suite avec skip = titres déjà reçus et ignore les doublons : rien ne manque ni ne
 * s'affiche deux fois. Les infos lues pour trier (dates de sortie) resservent pour les fiches.
 */
// Fiches TMDB lues au plus par page (50 appels sortants par requête chez Cloudflare, cache, base des liens fixes et
// « pour qui » compris) : de quoi garder une marge, au pire une quarantaine d'appels en tout.
const MAX_CHECKED = 30;   // Tendances : titres examinés pour en garder 20 déjà regardables en VF
const MAX_FILL = 8;       // « Prochainement » : titres de la page TMDB suivante pour compléter la page
const MAX_VF = 28;        // « Dispo depuis peu », « Bientôt dispo » : candidats examinés
const CINEMETA_PAR_PAGE = 3;   // saisons d'animes recomptées (lireInfo) : appels à Cinemeta au plus, la mémoire en plus
async function fetchReleasedPage(env, ctx, def, kind, page, today, opts) {
  // Dans l'ordre de la photo du jour (celle des « N° » des affiches maison), sinon de TMDB.
  const [lists, photo] = await Promise.all([
    Promise.all([page, page + 1].map((p) => tmdb(env, def.endpoint, { ...(def.params || {}), page: p }, opts.lang))),
    tendancesDuJour(def) ? photoTendances(env, kind) : new Map(),
  ]);
  // Un titre passé d'une page de TMDB à l'autre entre deux lectures n'est gardé qu'une fois.
  const released = dansLOrdre(lists.flatMap((d) => d.results || []), photo)
    .filter((it, i, all) => all.findIndex((x) => x.id === it.id) === i)
    .filter((it) => { const date = it.release_date || it.first_air_date; return date && date <= today; })
    .filter((it) => !opts.filtered || passeLesFiltres(it, kind, opts.cfg));
  // Les titres classés de la photo (N°1 à 20) : tels quels et dans l'ordre, sans refaire le tri (déjà fait à la
  // photo). Refait à une autre heure, il en écartait parfois un (Colony, N°8) : un trou dans les N° de la rangée. Ceux
  // que TMDB ne range plus dans ses deux pages : lus à part. En page 1 seulement ; les pages suivantes ne les reprennent pas.
  const classes = tendancesDuJour(def) ? titresClasses(photo) : [];
  // Seulement les titres classés : chaque carte de la rangée porte son N° (pas de page 2 sans numéros).
  if (classes.length && page > 1) return [];
  const enTete = [];
  if (page === 1 && classes.length) {
    const vus = new Map(released.map((it) => [it.id, it]));
    // Classés plus loin que la page 2 (la photo lit 5 pages, voir worker/tendances.js) : les pages 3 à 5 plutôt
    // qu'une fiche TMDB par titre (jusqu'à 20 appels de plus, sur les 50 permis).
    if (classes.filter((id) => !vus.has(id)).length > 3) {
      const suite = await Promise.all([3, 4, 5].map((p) => tmdb(env, def.endpoint, { ...(def.params || {}), page: p }, opts.lang)));
      suite.flatMap((d) => d.results || []).forEach((it) => { if (!vus.has(it.id)) vus.set(it.id, it); });
    }
    const lus = await Promise.all(classes.map((id) => vus.get(id) || tmdb(env, `/${kind === "series" ? "tv" : "movie"}/${id}`, {}, opts.lang)
      .then((d) => (d && d.id ? { ...d, genre_ids: (d.genres || []).map((g) => g.id) } : null))));
    enTete.push(...lus.filter((it) => it && (!opts.filtered || passeLesFiltres(it, kind, opts.cfg))));
  }
  const reste = classes.length ? [] : released;
  let picked = reste.slice(0, PAGE - enTete.length);
  if (kind === "movie" && picked.length) {
    const garde = await filmsRegardables(env, reste, today, PAGE - enTete.length);
    picked = garde.picked;
    opts = { ...opts, infos: garde.infos, sources: garde.sources };
  }
  picked = [...enTete, ...picked];
  if (!picked.length) return [];
  const metas = await toMetas(env, ctx, picked, kind, opts, today);
  return metas.map(sansInternes);
}

/**
 * Les films déjà regardables chez soi en VF parmi `released` (dans leur ordre), au plus `max` :
 * { picked, infos, sources } (infos et sources resservent pour les fiches). Regardable : voir watchable ; en VF : les
 * sources (un appel pour tous), sinon les dates, comme les affiches (enVfChezSoi) ; un vieux film reste (ses sources
 * ne sont pas lues). 4 de plus examinés pour remplacer les titres en VO seulement.
 */
/**
 * Titre récent sans identifiant IMDb, fiche TMDB lue : Torrentio ne trouve rien sans lui, donc aucune VF à voir (Oh! My
 * Guard, série coréenne, N°10 des Tendances le 25 octobre 2026, diffusée la veille). Pas un titre en français (il a sa
 * VF), ni un film en abonnement sur une plateforme en France qui le double (abonnementVf, plateformeFr).
 */
const sansImdb = (info, it) => !!info && info.lu && !info.imdb && it.original_language !== "fr" && !info.abonnementVf && !info.plateformeFr;

async function filmsRegardables(env, released, today, max, lire = lireVf) {
  const infos = new Map();
  let picked = [];
  for (let i = 0; i < released.length && picked.length < max + 4 && infos.size < MAX_CHECKED;) {
    const batch = released.slice(i, i + Math.min(max + 4 - picked.length, MAX_CHECKED - infos.size));
    i += batch.length;
    const got = await Promise.all(batch.map((it) => extraInfo(env, "movie", it.id)));
    batch.forEach((it, k) => {
      infos.set(it.id, got[k]);
      if (picked.length < max + 4 && watchable(got[k], it, today)) picked.push(it);
    });
  }
  const recent = (it) => !!infos.get(it.id).releases && filmRecent(infos.get(it.id).releases, today);
  const sources = await sourcesVf(env, picked.filter(recent).map((it) => infos.get(it.id).imdb), lire);
  picked = picked.filter((it) => {
    if (!recent(it)) return true;
    const info = infos.get(it.id);
    if (sansImdb(info, it)) return false;
    return enVfChezSoi(info.releases, it.original_language, today, avecAbonnement(sources.get(info.imdb), info.abonnementVf), info.plateformeFr, info.vod);
  }).slice(0, max);
  return { picked, infos, sources };
}

/**
 * Les séries déjà en VF chez soi parmi `released` (déjà diffusées, dans leur ordre), au plus `max` : { picked, infos }.
 * Même règle que leurs affiches (affiches/lib/statut.js) : seule une nouvelle série (première diffusion il y a moins
 * d'un an) est jugée, d'après les sources de sa dernière saison ; sans aucune VF (aucune source en VF, ou aucune source
 * du tout : Small Town Remedy, chinoise, diffusée depuis deux jours), elle est écartée, sauf sur une plateforme en
 * France qui la double. Sans identifiant IMDb, aussi (sansImdb). Une vieille série reste toujours (sa dernière saison
 * manque souvent de VF, pas la série) ; une série pas lue (fiche, sources) aussi.
 */
async function seriesRegardables(env, released, today, max, lire = lireVf) {
  const nouvelle = (it) => (it.first_air_date || "") >= addDays(today, -365);
  const aLire = released.slice(0, max + 8).filter(nouvelle).slice(0, MAX_CHECKED);
  const budget = { cinemeta: CINEMETA_PAR_PAGE };
  const lues = await Promise.all(aLire.map((it) => extraInfo(env, "series", it.id, budget)));
  const infos = new Map(aLire.map((it, i) => [it.id, lues[i]]));
  const sources = await sourcesVfSeries(env, lues.filter((x) => x.imdb && x.serie).map((x) => ({ imdb: x.imdb, saison: x.serie.lastSeason })), lire);
  const picked = released.filter((it) => {
    const info = infos.get(it.id);
    if (!nouvelle(it) || !info || !info.serie || info.serie.plateformeFr) return true;
    if (sansImdb(info, it)) return false;
    const lu = sources.get(info.imdb);
    return !(lu && lu.vf === false);
  }).slice(0, max);
  return { picked, infos, sources };
}

/**
 * Les « N° » du jour (worker/tendances.js) : le classement TMDB (results, dans l'ordre) gardé seulement pour ce que la
 * rangée « Tendances du jour » montre (déjà sorti ; en VF chez soi : films regardables, séries), renuméroté sans trous, dans le
 * même ordre. Toujours 20 places (seules elles portent un N°) : moins de 20 titres gardés, les places en trop sont
 * des 0 (aucun titre), pour qu'un titre écarté n'hérite jamais d'un N°. Une fiche TMDB pas lue : on ne sait pas
 * trier, la photo n'est pas enregistrée (worker/tendances.js la reprend quelques minutes plus tard).
 */
const RANGS = 20;
async function classerTendances(env, kind, results) {
  const today = parisToday();
  const released = results.filter((it) => { const date = it.release_date || it.first_air_date; return date && date <= today; });
  let ids, vf, q, vfi;
  if (kind === "movie") {
    // Films : beaucoup sont encore au cinéma ou en VO (9 sur les 30 premiers gardés un jour d'octobre). Examinés par
    // lots de 20, dans l'ordre, jusqu'à en avoir 20 : chaque lot dans un appel de l'addon à lui-même (son budget de 50).
    ids = []; vf = {}; q = {}; vfi = {};
    for (let i = 0; i < released.length && ids.length < RANGS; i += TRI_LOT) {
      const lot = await trierLot(env, released.slice(i, i + TRI_LOT), today);
      if (!lot.complet) throw new Error("fiches TMDB pas toutes lues");
      ids.push(...lot.ids); Object.assign(vf, lot.vf); Object.assign(q, lot.q); Object.assign(vfi, lot.vfi || {});
    }
    ids = ids.slice(0, RANGS);
  } else {
    // La VF : StreamFusion s'il est réglé (lireVfPhoto), sinon Torrentio.
    const garde = await seriesRegardables(env, released, today, RANGS, lireVfPhoto);
    if ([...garde.infos.values()].some((info) => !info.lu)) throw new Error("fiches TMDB pas toutes lues");
    ids = garde.picked.map((it) => it.id);
    ({ vf, q, vfi } = avisVf(garde));
  }
  return { ids: [...ids, ...Array(RANGS - ids.length).fill(0)], vf, q, vfi };
}

/**
 * L'avis VF de chaque titre examiné (StreamFusion, sinon Torrentio) : publié avec la photo, les affiches s'en servent
 * à la place de Torrentio (StreamFusion n'est appelé qu'ici, pas à chaque affiche).
 * Et la qualité des sources VF de StreamFusion (4K, DV, HDR…) : les affiches la préfèrent à celle de Torrentio.
 */
function avisVf(garde) {
  const vf = {}, q = {}, vfi = {};
  for (const [id, info] of garde.infos) {
    const lu = info && info.imdb ? garde.sources.get(info.imdb) : null;
    if (lu && typeof lu.vf === "boolean") { vf[id] = lu.vf ? 1 : 0; vfi[info.imdb] = lu.vf ? 1 : 0; }
    if (lu && lu.qualite) q[id] = lu.qualite;
  }
  return { vf, q, vfi };
}

/**
 * Un lot de films des tendances (TRI_LOT au plus) : { ids (les regardables en VF, dans l'ordre), complet (toutes les
 * fiches lues), vf, q }. 20 fiches TMDB, StreamFusion (18 au plus) et Torrentio : une quarantaine d'appels sortants,
 * d'où un appel de l'addon à lui-même par lot (liaison SELF, /tendances/tri), sinon ici même (Docker, sans limite).
 */
const TRI_LOT = 20;
const triCle = (env) => sha("tri:" + (env.TMDB_API_KEY || ""));
async function trierLot(env, films, today) {
  const items = films.slice(0, TRI_LOT).map(({ id, release_date, original_language }) => ({ id, release_date, original_language }));
  if (env.SELF) {
    try {
      const res = await env.SELF.fetch("https://self/tendances/tri", { method: "POST",
        headers: { "Content-Type": "application/json", "x-tri": await triCle(env) }, body: JSON.stringify({ items }) });
      if (res.ok) return await res.json();
    } catch (e) { /* ici même */ }
  }
  return trierIci(env, items, today);
}
async function trierIci(env, items, today) {
  // Tout le lot examiné (max = sa taille) : un film gardé ne passe jamais devant un film du lot pas encore lu.
  const garde = await filmsRegardables(env, items, today, items.length, lireVfPhoto);
  return { ids: garde.picked.map((it) => it.id), complet: [...garde.infos.values()].every((info) => info.lu), ...avisVf(garde) };
}

/** Les titres qui portent un N° sur la photo du jour (Map id → place), dans l'ordre. */
const titresClasses = (photo) => [...photo].filter(([id, i]) => id && i < RANGS).sort((a, b) => a[1] - b[1]).map(([id]) => id);

/**
 * Film arrivé chez soi : la date de dispoChezSoi passée (sortie numérique américaine, ou son estimation), ou déjà sur
 * une plateforme en France (en VF) ; la VF est vérifiée ensuite. Sans infos : gardé.
 */
function watchable(info, it, today) {
  if (!info.releases || info.plateformeFr) return true;
  const { date } = dispoChezSoi(info.releases, it.original_language, info.vod);
  return date ? date <= today : (it.release_date || "") <= addDays(today, -45);
}

/**
 * Rangée « Les plus attendus » : les films pas encore sortis que les Tendances écartent, dans le
 * même ordre (le buzz). Ils sont rares (2 ou 3 sur 20) : une seule page, lue sur les 10 premières
 * pages des tendances. Avec des filtres globaux (les tendances n'en acceptent pas) : les films à
 * venir les plus populaires d'après « discover ».
 */
const UPCOMING_PAGES = 10;
async function fetchUpcomingPage(env, ctx, kind, page, today, opts) {
  if (page > 1) return [];
  let found;
  if (opts.filtered) {
    const params = discoverParams({ discover: { sort_by: "popularity.desc", "vote_count.gte": 0 } }, kind, today, opts);
    params["primary_release_date.gte"] = maxDate(params["primary_release_date.gte"], addDays(today, 1));
    found = (await tmdb(env, "/discover/movie", params, opts.lang)).results || [];
  } else {
    const pages = await Promise.all(Array.from({ length: UPCOMING_PAGES }, (_, i) =>
      tmdb(env, "/trending/movie/week", { page: i + 1 }, opts.lang)));
    const seen = new Set();
    found = pages.flatMap((d) => d.results || [])
      .filter((it) => !(it.release_date && it.release_date <= today) && !seen.has(it.id) && seen.add(it.id));
  }
  if (!found.length) return [];
  const metas = await toMetas(env, ctx, found.slice(0, PAGE), kind, { ...opts, upcoming: true }, today);
  return metas.map(sansInternes);
}

/**
 * Rangées « Dispo depuis peu » / « Bientôt dispo » : films dont l'arrivée chez soi (dispoChezSoi : la sortie
 * numérique aux États-Unis, la même date que la fiche et l'affiche) tombe dans la fenêtre. Pour « Bientôt », on
 * ajoute les films encore sans date annoncée dont l'estimation (salle + la fenêtre de leur distributeur, voir
 * dispoChezSoi) tombe dans la fenêtre. Les recherches TMDB (sorties numériques ou en salle de tous pays dans la
 * fenêtre) ramènent de quoi trier : c'est la date de dispoChezSoi qui décide ensuite.
 */
async function fetchVfPage(env, ctx, def, kind, page, today, opts) {
  const future = def.digital[0] > 0;
  // Filtres de la config (genres masqués, note mini, famille…) appliqués comme ailleurs.
  const base = { ...discoverParams(def, kind, today, opts), page };
  base["primary_release_date.gte"] = maxDate(base["primary_release_date.gte"], addDays(today, -365));
  const reqs = [tmdb(env, "/discover/movie", { ...base, with_release_type: "4",
    "release_date.gte": addDays(today, def.digital[0]), "release_date.lte": addDays(today, def.digital[1]) }, opts.lang)];
  // Sorties en salle dont l'estimation peut tomber dans la fenêtre : de la plus longue à la plus courte fenêtre des
  // distributeurs (la même table que dispoChezSoi, déjà lue pour les fiches de la page).
  const [court, long] = future ? bornesVod(await estimationsVod()) : [SALLE_JOURS, SALLE_JOURS];
  if (future) reqs.push(tmdb(env, "/discover/movie", { ...base, with_release_type: "3|2",
    "release_date.gte": addDays(today, def.digital[0] - long), "release_date.lte": addDays(today, def.digital[1] - court) }, opts.lang));
  // « Bientôt dispo » : aussi les films déjà sortis chez soi (depuis moins de 90 jours) mais pas encore en VF, d'après
  // leurs sources (The Weight) — la fiche dit « Pas encore en VF » : ils ont leur place ici, à la fin.
  if (future) reqs.push(tmdb(env, "/discover/movie", { ...base, with_release_type: "4",
    "release_date.gte": addDays(today, -90), "release_date.lte": today }, opts.lang));
  // « Bientôt » : aussi les films des tendances encore au cinéma (retirés des Tendances), que
  // « discover » laisse parfois passer (trop peu de votes). Pas avec des filtres : les tendances
  // n'en acceptent pas.
  const trending = future && page === 1 && !opts.filtered;
  if (trending) [1, 2].forEach((p) => reqs.push(tmdb(env, "/trending/movie/week", { page: p }, opts.lang)));
  const lists = await Promise.all(reqs);
  if (trending) lists.slice(-2).forEach((d) => {
    d.results = (d.results || []).filter((it) => it.release_date && it.release_date <= today && it.release_date >= addDays(today, -120));
  });
  const seen = new Set(), merged = [];
  lists.flatMap((d) => d.results || []).sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .forEach((it) => { if (!seen.has(it.id)) { seen.add(it.id); merged.push(it); } });
  if (!merged.length) return [];
  const metas = await toMetas(env, ctx, merged.slice(0, MAX_VF), kind, { ...opts, lireSources: true }, today);
  const from = addDays(today, def.digital[0]), to = addDays(today, def.digital[1]);
  const when = (m) => m._digital || (future ? m._guess : "");
  return metas
    .filter((m) => (when(m) && when(m) >= from && when(m) <= to) || (future && m._vo))
    .filter((m) => future || m._vf)   // « Dispo depuis peu » : seulement ceux qui ont sûrement une VF
    // « Bientôt dispo » : sans ceux déjà regardables en VF (sources VF, ou plateforme en France : date TMDB en retard).
    .filter((m) => !(future && m._dejaVf))
    .sort((a, b) => (future ? (a._vo !== b._vo ? (a._vo ? 1 : -1) : when(a) < when(b) ? -1 : 1) : (when(a) > when(b) ? -1 : 1)))
    // Une page au plus (voir pageOf) : les dates les plus proches d'abord.
    .slice(0, PAGE)
    .map(sansInternes);
}

/** decodeURIComponent sans erreur : null pour un « % » mal formé (« search=%C3%28 » faisait planter l'addon). */
const decode = (s) => { try { return decodeURIComponent(s); } catch (e) { return null; } };

function parseExtra(segment) {
  const out = {};
  for (const part of (segment || "").split("&")) {
    const [k, ...v] = part.split("=");
    // Mal encodé : ignoré (une recherche illisible ne trouve rien, plutôt qu'une erreur 500).
    const key = decode(k), value = decode(v.join("="));
    if (key && value !== null) out[key] = value;
  }
  return out;
}

const SEARCH = [
  // Avec « Afficher le type de catalogue » désactivé (réglage du guide), Nuvio affiche le nom seul.
  { id: "recherche-films", type: "movie", name: "Films" },
  { id: "recherche-series", type: "series", name: "Séries" },
];

// Vocabulaire des titres connus, pour corriger les fautes de frappe de la recherche
// (data/search-words.json, refait chaque nuit) : chargé une fois par instance du Worker.
let WORDS = null;
function searchWords() {
  if (!WORDS) {
    WORDS = fetch(`${ASSETS}/data/search-words.json`, { cf: { cacheTtl: 6 * 3600, cacheEverything: true } })
      .then((r) => (r.ok ? r.json() : null))
      .then(prepareWords)
      .catch(() => { WORDS = null; return null; });
  }
  return WORDS;
}

/**
 * Recherche tolérante (sigles, fautes, année, suites, personnes, studios) : voir search.js.
 * Avec GEMINI_API_KEY, l'IA prend le relais pour les descriptions (« le film où… ») et les
 * requêtes que la recherche classique ne reconnaît pas : voir ai.js.
 */
async function runSearch(env, type, query, page, opts, trace) {
  // Une requête très longue est coupée (100 caractères) : pour TMDB, Gemini et la correction des fautes.
  query = capQuery(query);
  const endpoint = `/search/${type === "series" ? "tv" : "movie"}`;
  let left = SEARCH_BUDGET;
  const none = Promise.resolve({});
  const search = (q, p, extra = {}) => {
    if (left-- <= 0) return none;
    const { language, ...rest } = extra;
    return tmdb(env, endpoint, { query: q, page: p, include_adult: "false", region: opts.region, ...rest }, language || opts.lang);
  };
  const api = (path, params = {}) => (left-- > 0 ? tmdb(env, path, params, opts.lang) : none);
  const stats = {};
  const classicSearch = () => smartSearch(query, page, search, type, api, { words: searchWords, region: opts.region, trace, stats });
  // Sans clé Gemini, l'IA ne fait que relire les réponses déjà en cache (aiTitles en lecture seule).
  if (page !== 1) {
    if (trace) trace.ai = "page suivante : recherche classique";
    return classicSearch();
  }
  // Une description : Gemini part tout de suite. Pas toute la recherche classique (une dizaine
  // d'appels TMDB pour rien) : seulement de quoi reconnaître un titre connu fait de ces mots
  // (« danse avec les loups »), qui garde alors la recherche classique.
  // « horreur années 80 », « comédie romantique » : un genre (et une époque), que la recherche classique sait lister.
  const descriptive = looksDescriptive(query) && !genreQuery(query, type);
  const aiOpts = { model: opts.aiModel, thinking: opts.aiThinking, fresh: opts.aiFresh };   // réglages de /debug/search
  const ai = descriptive ? aiTitles(env, opts.ctx, query, aiOpts) : null;
  let classic = [];
  if (descriptive) {
    const quick = await search(query, 1);
    if ((quick.results || []).some((it) => isExact(query, it) && it.vote_count >= 300)) {
      if (trace) trace.ai = { descriptive, why: null, titreConnu: true };
      return classicSearch();
    }
  } else {
    classic = await classicSearch();
  }
  // Titre connu, personne, saga ou studio : la recherche classique suffit, sans attendre Gemini
  // (s'il est déjà parti, il finit en arrière-plan et remplit son cache).
  const strong = stats.strong || new Set();
  // Seulement des titres obscurs qui contiennent le mot (« ichigo » : Ichigo 100%, 17 votes) : c'est peut-être un
  // personnage ou un surnom (Ichigo, le héros de Bleach), Gemini est consulté comme sans résultat.
  const connu = classic.some((it) => strong.has(it.id) && (it.vote_count || 0) >= OBSCUR_VOTES);
  // Seulement des titres approchants, aucun ne contient le mot tapé (« luffy » → Buffy, « eren » → Eden) : AniList
  // seulement (un personnage d'anime ?), pas Gemini, pour qu'une vraie faute de frappe (« inseption ») reste aussi rapide.
  const why = descriptive ? "description" : stats.sure ? null : !strong.size ? "rien de proche" : !connu ? "rien de connu"
    : stats.devine ? "titres approchants" : null;
  if (trace) trace.ai = { descriptive, sure: !!stats.sure, strong: strong.size, why };
  const court = !descriptive && norm(query).split(" ").length <= 4;
  if (!why) {
    // Sûre d'elle sans titre exact connu : une personne trouvée par TMDB (« jon snow » : un acteur ; « belmondo » :
    // Victor), ou des titres qui contiennent les mots (« jack sparrow » : un téléfilm obscur). Wikidata peut connaître
    // mieux, le personnage ou la personne la plus connue : ses titres passent devant, sauf s'il désigne la même
    // personne (« nolan »). Gardé 7 jours, sans quota.
    const exactConnu = classic.some((it) => isExact(query, it) && (it.vote_count || 0) >= 300);
    if (court && !exactConnu && (stats.personne || !stats.sure)) {
      const refs = await wikidataDe(query);
      if (refs === null) opts.partial = true;
      const autre = refs && refs.length && !(refs[0].type === "person" && refs[0].id === stats.personne);
      const wikiFound = autre ? await titresWikidata(refs, type, api) : [];
      if (trace) trace.ai.wikidata = refs === null ? "pas de réponse" : { refs: (refs || []).map((r) => `${r.type}:${r.id} (${r.nom})`), found: wikiFound.map((it) => it.title || it.name) };
      if (wikiFound.length) {
        const seen = new Set();
        return [...wikiFound, ...classic].filter((it) => !seen.has(it.id) && seen.add(it.id)).slice(0, AI_MAX);
      }
    }
    return classic;
  }
  // Les titres retrouvés (AniList, Gemini) d'abord, puis seulement les titres de la recherche classique
  // qui ressemblent à la requête (pas « Fils de personne » pour « des personnages bleus »). Un titre
  // obscur qui est exactement la requête (série toute nouvelle, encore peu notée) reste en tête.
  const exact = why === "rien de connu" ? classic.filter((it) => strong.has(it.id) && isExact(query, it)) : [];
  const avecClassique = (found) => {
    const seen = new Set();
    return [...exact, ...found, ...classic.filter((it) => strong.has(it.id))]
      .filter((it) => !seen.has(it.id) && seen.add(it.id)).slice(0, AI_MAX);
  };
  // Quelques mots, pas une description : un anime par son nom japonais ou un personnage (« ichigo » : AniList, voir
  // anilist.js), sinon un personnage, un sigle ou une personne d'après Wikidata (« walter white », « got »,
  // « belmondo » : wikidata.js). Les deux en même temps, sans clé et sans quota Gemini ; Gemini seulement s'ils ne
  // trouvent rien pour ce type.
  if (court) {
    const [animes, refs] = await Promise.all([animesDe(query, env), wikidataDe(query)]);
    // Pas de réponse (panne, quota) : la page n'est pas gardée, la même recherche refaite leur redemandera.
    if (animes === null || refs === null) opts.partial = true;
    const aniFound = animes && animes.length ? await resolveTitles(animes, type, search, api) : [];
    if (trace) trace.ai.anilist = animes === null ? "pas de réponse" : { picks: animes.map((t) => `${t.title} (${t.year || "?"}, ${t.type})`),
      found: aniFound.map((it) => it.title || it.name) };
    if (aniFound.length) return avecClassique(aniFound);
    const wikiFound = refs && refs.length ? await titresWikidata(refs, type, api) : [];
    if (trace) trace.ai.wikidata = refs === null ? "pas de réponse" : { refs: refs.map((r) => `${r.type}:${r.id} (${r.nom})`),
      found: wikiFound.map((it) => it.title || it.name) };
    if (wikiFound.length) return avecClassique(wikiFound);
  }
  if (why === "titres approchants") return classic;
  const job = ai || aiTitles(env, opts.ctx, query, aiOpts);
  const answer = await Promise.race([job, new Promise((r) => setTimeout(() => r(null), AI_WAIT_MS))]);
  // Pas de réponse à temps ou erreur : la recherche classique, sans la garder en cache, pour que
  // la même recherche refaite profite de la réponse de Gemini (qui finit en arrière-plan). Sans clé
  // et rien en cache : la recherche classique, gardée (il n'y a rien de mieux à attendre).
  const miss = aiMiss(answer);
  if (miss) {
    if (miss !== "absent") opts.partial = true;
    if (trace) trace.ai.error = miss === "absent" ? "pas de clé Gemini, rien en cache" : answer ? answer.error : `pas de réponse en ${AI_WAIT_MS} ms`;
    return descriptive ? classicSearch() : classic;
  }
  const found = await resolveTitles(answer.titles, type, search, api);
  if (trace) {
    Object.assign(trace.ai, {
      model: answer.model, ms: answer.ms, cached: answer.cached, tried: answer.tried,
      picks: answer.titles, found: found.map((it) => ({ name: it.title || it.name, date: it.release_date || it.first_air_date, votes: it.vote_count })),
      tmdbCalls: SEARCH_BUDGET - Math.max(0, left),
    });
  }
  // Rien pour ce type à partir d'un titre mal écrit : la recherche classique telle quelle. Une
  // description, elle, n'a rien à voir avec les titres trouvés mot à mot (« la série avec le prof
  // de chimie » : Breaking Bad dans Séries, pas « La guerre des drogues » dans Films).
  if (!found.length && !descriptive) return classic;
  return avecClassique(found);
}

/**
 * Les titres TMDB des références de Wikidata (wikidata.js) pour ce type : les œuvres (fiche TMDB, au format d'un
 * résultat de recherche), ou la filmographie d'une personne, comme la recherche classique (filmography) — seulement
 * une personne du cinéma assez connue (pas Harry Truman, en images d'archives, pour « harry »).
 */
async function titresWikidata(refs, kind, api) {
  const media = kind === "series" ? "tv" : "movie";
  const personne = refs.find((r) => r.type === "person");
  if (personne) {
    const [p, credits] = await Promise.all([api(`/person/${personne.id}`), api(`/person/${personne.id}/${media}_credits`)]);
    if (!p || !["Acting", "Directing", "Writing"].includes(p.known_for_department) || (p.popularity || 0) < 1) return [];
    return filmography(p, credits || {}, kind).filter((it) => it.poster_path && it.vote_count > 0)
      .filter((it, i, all) => all.findIndex((x) => x.id === it.id) === i).slice(0, 15);
  }
  const fiches = await Promise.all(refs.filter((r) => r.type === media).map((r) => api(`/${media}/${r.id}`)));
  return fiches.filter((d) => d && d.id && d.poster_path && d.vote_count > 0)
    .map((d) => ({ ...d, genre_ids: (d.genres || []).map((g) => g.id) }));
}

/**
 * Page demandée par Nuvio, qui envoie skip = titres déjà reçus. Les rangées triées après coup (« Dispo depuis peu »,
 * « Bientôt dispo », rangées mélangées dont une moitié s'épuise) renvoient parfois moins d'une page : arrondi au-dessus,
 * skip = 12 demande la page 2 (avant : la page 1 de nouveau, recalculée pour rien, et la rangée s'arrêtait là). Une
 * page n'a donc jamais plus de titres que sa taille ; et si Nuvio écarte un doublon, skip = 39 donne bien la page 3.
 */
const pageOf = (skip, size) => Math.ceil(Math.max(0, skip) / size) + 1;

async function catalog(env, ctx, type, id, extra, today, cfg, prefixe = "") {
  // Fiches TMDB de la page (extraInfo) et celles restées sans réponse (limite d'appels de TMDB, panne).
  const bilan = { vus: 0, rates: 0 };
  const metas = await catalogPage(env, ctx, type, id, extra, today, cfg, bilan, prefixe);
  // Plus d'une sur dix sans ses infos (IMDb, dates, logo, bande-annonce) : page incomplète, gardée 5 min seulement.
  if (metas.length && bilan.rates > bilan.vus / 10) metas.degrade = true;
  return metas;
}

async function catalogPage(env, ctx, type, id, extra, today, cfg, bilan, prefixe) {
  const skip = Number(extra.skip || 0);
  const opts = { cfg, ctx, lang: langOf(cfg), region: cfg.g, filtered: hasGlobalFilters(cfg), bilan };
  const search = SEARCH.find((c) => c.id === id && c.type === type);
  if (search) {
    const query = (extra.search || "").trim();
    if (!query) return [];
    const page = Math.floor(skip / PAGE) + 1;
    const results = await runSearch(env, type, query, page, opts);
    opts.search = true;
    const metas = results.length ? (await toMetas(env, ctx, results, type, opts, today)).map(sansInternes) : [];
    // Recherche faite sans l'IA (Gemini trop lent ou en panne) : à ne pas garder en cache.
    if (opts.partial) metas.partial = true;
    return metas;
  }
  // « accueil-en-ce-moment » : ancien identifiant de la rangée de saison, encore demandé
  // par les Nuvio qui ont gardé l'ancien manifeste en mémoire.
  const wanted = id === "accueil-en-ce-moment" ? "accueil-saison" : id;
  const home = homeDefs(today, cfg).find((d) => d.id === wanted && d.type === type);
  if (home) {
    // Une moitié d'une rangée mélangée, demandée par l'addon lui-même (voir moitieParSelf) : sa page N telle quelle.
    if (extra.partie !== undefined) {
      const sub = home.mix && /^[1-9]$/.test(extra.partie) ? home.mix[Number(extra.partie)] : null;
      const p = Number(extra.page);
      return sub && Number.isInteger(p) && p >= 1 && p <= 500 ? fetchPage(env, ctx, sub, sub.type, p, today, opts) : [];
    }
    const page = pageOf(skip, pageSizeOf(home));
    return fetchPage(env, ctx, home, type, page, today, { ...opts, moitie: home.mix ? moitieParSelf(env, prefixe, type, home.id) : null });
  }
  // Une saga dans l'ordre de sortie (collections Sagas, Grands univers) : « saga-<id TMDB> », ou l'ancien « saga »
  // avec la saga dans « genre ».
  if ((id === "saga" || SAGA_CATALOGS.has(id)) && type === "movie") {
    const tmdbId = id === "saga" ? SAGA_IDS.get(extra.genre || "") : SAGA_CATALOGS.get(id);
    if (!tmdbId) return [];
    const d = await tmdb(env, `/collection/${tmdbId}`, {}, opts.lang);
    const parts = inReleaseOrder(d.parts || []).filter((it) => !opts.filtered || passeLesFiltres(it, type, cfg)).slice(skip, skip + PAGE);
    return parts.length ? (await toMetas(env, ctx, parts, type, opts, today)).map(sansInternes) : [];
  }
  // Rangées des collections facultatives (lauréats, durée, mini-séries) : servies même décochées (sans danger).
  const fac = FAC_ROWS.find((r) => r.id === id && r.type === type);
  if (fac) {
    if (fac.list) {
      // Filtres généraux (mode famille, genres masqués, note…) appliqués à la liste, comme aux Tendances.
      const results = await laureats(ASSETS, fac.list, skip, PAGE, (it) => !opts.filtered || passeLesFiltres(it, type, cfg));
      return results.length ? (await toMetas(env, ctx, results, type, opts, today)).map(sansInternes) : [];
    }
    return fetchPage(env, ctx, fac, type, pageOf(skip, PAGE), today, opts);
  }
  const disc = discoverDefs(today).find((d) => d.id === id && d.type === type);
  if (disc) {
    // Sans filtre (Nuvio ouvre Découvrir sur « Par défaut ») : le 1er filtre (« Tout »…).
    const opt = extra.genre ? disc.options.find((o) => o.label === extra.genre) : disc.options[0];
    if (!opt) return [];
    const page = pageOf(skip, PAGE);
    return fetchPage(env, ctx, opt.def, type, page, today, opts);
  }
  return [];
}

// ---------- fiches (meta) ----------
// Les fiches détaillées (résumé, casting, saisons, épisodes, bande-annonce) en français,
// directement depuis TMDB : plus besoin de TMDB Discover Plus.
const CACHE_META_S = 12 * 3600;    // une fiche reste 12 h dans le cache Cloudflare
const CACHE_META_CLIENT_S = 3600;  // et 1 h dans Nuvio

const STATUS_FR = {
  "Returning Series": "En cours", Ended: "Terminée", Canceled: "Annulée", "In Production": "En production",
  Planned: "Annoncée", Pilot: "Pilote", Released: "Sorti", "Post Production": "Bientôt",
};

/** Identifiant TMDB d'un titre demandé en « tt… » ou « tmdb:… ». */
async function tmdbIdOf(env, kind, id) {
  // Des chiffres seulement, jusqu'au « : » ou à la fin : « tmdb:1/../../tv/1396 » ouvrait une autre fiche
  // (le reste de l'identifiant allait tel quel dans l'adresse TMDB).
  const t = /^tmdb:(\d{1,10})(?::|$)/.exec(id);
  if (t) return t[1];
  if (!/^tt\d{1,10}$/.test(id)) return null;
  const found = await tmdb(env, `/find/${id}`, { external_source: "imdb_id" });
  const hits = (kind === "series" ? found.tv_results : found.movie_results) || [];
  // Fiches TMDB en double pour un même IMDb : on garde la plus connue.
  hits.sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0) || (b.popularity || 0) - (a.popularity || 0));
  return hits[0] ? String(hits[0].id) : null;
}

/**
 * Image dans la langue voulue, sinon anglais, sinon sans texte. En français : celle de France (ou sans pays) d'abord ;
 * celle du Canada (Toy Story 4 : « Histoire de jouets 4 ») seulement s'il n'y a rien d'autre.
 */
function bestImage(list, lang) {
  const order = [lang, "en", null, undefined];
  const rang = (x) => (x.iso_639_1 === "fr" && x.iso_3166_1 && x.iso_3166_1 !== "FR" ? 8 : (order.indexOf(x.iso_639_1) + 1 || 9));
  return [...(list || [])].sort((a, b) =>
    rang(a) - rang(b) || (b.iso_3166_1 === "FR") - (a.iso_3166_1 === "FR") || (b.vote_average || 0) - (a.vote_average || 0))[0];
}

// Vraie VF : TMDB classe aussi en « fr » les VOSTFR (son original, sous-titres français).
const isVf = (lang, name) => lang === "fr" && !/\bVOST/i.test(name || "");

function trailersOf(videos) {
  return (videos || [])
    .filter((v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"))
    // VF d'abord, puis VOSTFR, puis la meilleure définition (4K, 1080p, 720p…) : Nuvio lit la première dans
    // le hero, et une vidéo pas en HD y devient floue (le hero zoome l'image).
    .sort((a, b) => isVf(b.iso_639_1, b.name) - isVf(a.iso_639_1, a.name) || (b.iso_639_1 === "fr") - (a.iso_639_1 === "fr")
      || (b.size || 0) - (a.size || 0) || (b.type === "Trailer") - (a.type === "Trailer")
      || (b.official === true) - (a.official === true))
    .slice(0, 4)
    .map((v) => ({ source: v.key, ytId: v.key, type: v.type, name: v.name, lang: v.iso_639_1 }));
}

// Bande-annonce en VF quand TMDB n'en a pas (séries, films moins connus) : Allociné dit si une VF
// existe et donne son titre exact, YouTube la fournit (Nuvio ne lit que YouTube).
const VF_CACHE_S = 30 * 86400; // VF trouvée : 30 jours (elle ne change presque jamais ; moins de recherches YouTube)
const VF_MISS_S = 2 * 86400;   // pas de VF : on réessaie dans 2 jours (elle sort souvent peu avant le titre)
const VF_WAIT_MS = 2000;       // attente maximale à l'ouverture d'une fiche
// YouTube redirige parfois les adresses de Cloudflare (consentement aux cookies, « pas un robot ») ou refuse (429) :
// plus de recherche pendant 10 min sur cette instance, au lieu de réessayer à chaque fiche ouverte.
const YT_PAUSE_MS = 10 * 60e3;
let ytPauseJusqua = 0;
export const oublierPauseYoutube = () => { ytPauseJusqua = 0; };
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
  "Accept-Language": "fr-FR,fr;q=0.9",
};
const decodeHtml = (s) => s.replace(/&#0*39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const shortName = (name) => name.split(/ [:–-] /)[0].trim();

/**
 * Titre de la bande-annonce VF sur Allociné (« Black Mirror - saison 7 Bande-annonce VF ») ; null si
 * Allociné n'a pas de VF, undefined si le titre n'y est pas, false si Wikidata n'a pas répondu. Fiche
 * Allociné trouvée par l'IMDb, via Wikidata.
 */
async function allocineVf(kind, imdb) {
  // L'identifiant IMDb vient de TMDB (modifiable par tous) et va tel quel dans la requête Wikidata.
  if (!/^tt\d{1,10}$/.test(imdb || "")) return undefined;
  const q = `SELECT ?a WHERE { ?f wdt:P345 "${imdb}"; wdt:${kind === "series" ? "P1267" : "P1265"} ?a }`;
  const wd = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { headers: WIKI_HEADERS, cf: WIKI_CACHE })
    .then((r) => (r.ok ? r.json() : null), () => null);
  if (!wd) return false;
  const id = ((((wd.results || {}).bindings || [])[0] || {}).a || {}).value;
  if (!/^\d+$/.test(id || "")) return undefined;
  // Films : la fiche liste les vidéos. Séries : page des vidéos, la plus récente saison d'abord.
  const url = kind === "series" ? `https://www.allocine.fr/series/ficheserie-${id}/videos/` : `https://www.allocine.fr/film/fichefilm_gen_cfilm=${id}.html`;
  const html = await fetch(url, { headers: BROWSER_HEADERS }).then((r) => (r.ok ? r.text() : ""), () => "");
  const name = decodeHtml((html.match(/<title>([^<]*)/) || [])[1] || "").replace(/^Trailers & Teasers de /, "").split(/ - (?:Film|Série|AlloCiné)/)[0].trim();
  if (!name) return undefined;
  // La page montre aussi les vidéos d'autres titres : seules celles qui commencent par le nom comptent.
  const titles = [...html.matchAll(/>([^<>]*\b(?:Bande-annonce|Teaser)\b[^<>]*\bVF\b[^<>]*)</g)]
    .map((x) => decodeHtml(x[1]).trim()).filter((t) => norm(t).startsWith(norm(name)));
  const season = (t) => (t.match(/saison \d+/i) || [""])[0].toLowerCase();
  // Une bande-annonce passe avant un teaser de la même saison.
  return titles.find((t) => /Bande-annonce/.test(t) && season(t) === season(titles[0])) || titles[0] || null;
}

// Mots admis devant le nom dans le titre d'une vidéo trouvée par recherche directe (« Bande-annonce VF Below »,
// « FX The Bear… ») : tout autre mot désigne une autre œuvre (« Above and Below »).
const TRAILER_WORDS = new Set("bande annonce d trailer teaser vf officielle officiel nouvelle new la le les l fx netflix disney prime video apple tv hbo max canal paramount".split(" "));

/**
 * Bande-annonce VF trouvée sur YouTube pour une recherche, si son titre nomme l'œuvre (et la saison) ;
 * null sinon, undefined si YouTube n'a pas répondu. Avec « year » (recherche directe, sans titre
 * Allociné) : le nom doit ouvrir le titre, et une année cohérente y figurer (celle du film à un an près,
 * celle de la première saison d'une série).
 */
export async function youtubeVf(query, name, season, year, series) {
  if (Date.now() < ytPauseJusqua) return undefined;
  // SOCS=CAI : cookies refusés, sans passer par la page de consentement.
  const url = `https://www.youtube.com/results?hl=fr&gl=FR&search_query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { ...BROWSER_HEADERS, Cookie: "SOCS=CAI" }, redirect: "manual" }).catch(() => null);
  if (res && ((res.status >= 300 && res.status < 400) || res.status === 429)) {
    ytPauseJusqua = Date.now() + YT_PAUSE_MS;
    const loc = res.headers.get("location");
    let vers = "";
    try { if (loc) { const u = new URL(loc, url); vers = ` vers ${u.host}${u.pathname}`; } } catch (e) { /* adresse illisible */ }
    console.log(`youtube ${res.status}${vers} : recherches de VF en pause 10 min`);
    return undefined;
  }
  const html = res && res.ok ? await res.text().catch(() => "") : "";
  if (!html.includes('"videoRenderer"')) return undefined;
  const want = ` ${norm(name)} `;
  const seasonRe = season ? new RegExp(`\\b(saison|season|s) ?0?${season}\\b`) : null;
  const re = /"videoRenderer":\{"videoId":"([\w-]{11})"[\s\S]{0,3000}?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g;
  for (const m of html.matchAll(re)) {
    let title;
    try { title = JSON.parse(`"${m[2]}"`); } catch (e) { continue; }
    const t = norm(title);
    // Une bande-annonce en VF (pas un épisode ni un extrait), qui nomme l'œuvre (et la saison).
    if (!/\bvf\b|version francaise/.test(t) || /\bvost/.test(t) || !/\b(bande d? ?annonce|ba|trailer|teaser|nouvelle saison)\b/.test(t)
      || !` ${t} `.includes(want) || (seasonRe && !seasonRe.test(t))) continue;
    if (year) {
      const before = ` ${t} `.slice(0, ` ${t} `.indexOf(want)).trim().split(" ").filter(Boolean);
      const y = Number(year), years = [...t.matchAll(/\b(?:19|20)\d\d\b/g)].map((x) => Number(x[0]));
      // Une série et un film du même nom (Bleach, Friday Night Lights) : la vidéo doit être du bon côté.
      const seriesWords = /\b(saison|season|serie|series|episode)\b/.test(t);
      if (series ? /\bfilm\b/.test(t) : seriesWords) continue;
      // Série : l'année de la première saison, ou une plus récente (ou aucune) si la vidéo dit de quelle saison
      // il s'agit (« Black Clover - Saison 1 en VF : Bande-annonce »).
      const okYear = (n) => (series ? n === y || (seriesWords && n > y && n <= new Date().getFullYear() + 1) : Math.abs(n - y) <= 1);
      if (before.some((w) => !TRAILER_WORDS.has(w)) || !(years.some(okYear) || (series && seriesWords && !years.length))) continue;
    }
    return { key: m[1], title };
  }
  return null;
}

/** Bande-annonce VF d'un titre ({ key: identifiant YouTube, title }, ou { key: null }), gardée en cache. */
async function vfTrailer(kind, imdb, name, year) {
  const cacheKey = new Request(`https://cache.local/vf-trailer/v5/${kind}/${imdb}`);
  const hit = await caches.default.match(cacheKey);
  if (hit) return hit.json();
  // YouTube en pause : ni Wikidata ni Allociné, rien n'est gardé, on réessaiera après la pause.
  if (Date.now() < ytPauseJusqua) return { key: null };
  const allo = await allocineVf(kind, imdb);
  let found = null, failed = false;
  const search = async (...args) => {
    const r = await youtubeVf(...args);
    if (r === undefined) failed = true;
    return r || null;
  };
  // « The Bear : sur place ou à emporter - saison 5 Bande-annonce VF » : le sous-titre gêne la recherche.
  if (allo) found = await search(allo.replace(/ : [^-]+(?= - )/, ""), shortName(name), (allo.match(/saison (\d+)/i) || [])[1]);
  // Pas de VF sur Allociné (elle y manque souvent), titre absent d'Allociné, ou VF introuvable sur YouTube
  // sous son titre Allociné : recherche directe, plus stricte.
  if (!found && year) found = await search(`${name} ${kind === "series" ? "série " : ""}bande annonce VF ${year}`, shortName(name), null, year, kind === "series");
  // Wikidata ou YouTube muet : rien n'est gardé, on réessaiera.
  if (!found && (failed || allo === false)) found = undefined;
  // HD ou pas : YouTube n'a l'image « maxresdefault » que pour les vidéos d'au moins 720p.
  const hd = found ? await fetch(`https://i.ytimg.com/vi/${found.key}/maxresdefault.jpg`, { method: "HEAD" }).then((r) => r.ok, () => true) : false;
  const out = found ? { key: found.key, title: found.title, hd } : { key: null };
  // YouTube n'a pas répondu : rien n'est gardé, on réessaiera à la prochaine ouverture.
  if (found !== undefined) {
    await caches.default.put(cacheKey, new Response(JSON.stringify(out), { headers: { "Cache-Control": `public, max-age=${found ? VF_CACHE_S : VF_MISS_S}` } }));
  }
  if (found) await addToVfIndex(`${kind}:${imdb}`, { key: found.key, hd });
  return out;
}

// Index des VF trouvées, pour les rangées de l'accueil : Nuvio y lance la bande-annonce sans ouvrir la
// fiche, et chercher la VF de chaque titre d'une page dépasserait la limite d'appels de Cloudflare.
const VF_INDEX = new Request("https://cache.local/vf-trailer/index");
const VF_INDEX_MAX = 4000;     // titres gardés (les plus anciens sortent en premier)

function readVfIndex() {
  return caches.default.match(VF_INDEX).then((r) => (r ? r.json() : {})).catch(() => ({}));
}

async function addToVfIndex(id, vf) {
  const index = await readVfIndex();
  delete index[id];
  index[id] = vf;
  const ids = Object.keys(index);
  ids.slice(0, Math.max(0, ids.length - VF_INDEX_MAX)).forEach((k) => delete index[k]);
  await caches.default.put(VF_INDEX, new Response(JSON.stringify(index), { headers: { "Cache-Control": `public, max-age=${30 * 86400}` } }));
}

/** Bandes-annonces d'un titre de rangée : celles de TMDB, avec la VF de l'index si TMDB n'en a pas. */
function catalogTrailers(trailers, vf) {
  let list = trailers;
  if (vf && vf.key && !trailers.some((t) => isVf(t.lang, t.name))) {
    const vfItem = { source: vf.key, ytId: vf.key, type: "Trailer", lang: "fr" };
    // Même règle que la fiche : une VF pas en HD passe après la bande-annonce de TMDB.
    list = vf.hd === false && trailers.length ? [trailers[0], vfItem, ...trailers.slice(1)] : [vfItem, ...trailers];
  }
  return list.length ? { trailers: list, trailerStreams: list.map((t) => ({ ytId: t.ytId })) } : {};
}

const person = (p) => ({ name: p.name, character: p.character || p.job || undefined, photo: p.profile_path ? `${IMG}w185${p.profile_path}` : undefined, tmdbId: p.id });

async function meta(env, kind, id, cfg, today, ctx, opts = {}) {
  // Fiche « légère » (survol dans l'aperçu du site) : sans clé Gemini, l'IA ne fait que relire son cache
  // (« pour qui », rappel déjà écrits), pour ne pas dépenser le quota à chaque affiche survolée.
  if (opts.leger) env = { ...env, GEMINI_API_KEY: "" };
  const tmdbId = await tmdbIdOf(env, kind, id);
  if (!tmdbId) return null;
  const lang = langOf(cfg);
  const short = lang.slice(0, 2);
  const movie = kind === "movie";
  const brut = await tmdb(env, `/${movie ? "movie" : "tv"}/${tmdbId}`, {
    append_to_response: movie ? "credits,videos,images,release_dates,external_ids,keywords,watch/providers" : "aggregate_credits,credits,videos,images,external_ids,content_ratings,keywords,watch/providers",
    include_image_language: `${short},en,null`, include_video_language: `${short},en`,
  }, lang);
  if (!brut || !brut.id) return null;

  const imdb = (movie ? brut.imdb_id : brut.external_ids && brut.external_ids.imdb_id) || null;
  // Ce qui ne demande que la fiche TMDB part tout de suite, et chaque partie l'attend là où elle sert. Avant, chacun
  // attendait le précédent : Cinemeta, la VF des sources, la table des estimations, la saga, les épisodes, et seulement
  // ensuite la bande-annonce VF (jusqu'à 2 s) et l'IA. Les saisons recomptées (Cinemeta) ne changent ni le titre, ni
  // les vidéos, ni les mots-clés, ni les classifications : tout ça se lit dans la fiche brute.
  // Série : saisons comptées comme Cinemeta quand TMDB les découpe autrement (anime en une saison), pour les
  // épisodes, leurs identifiants (les sources) et les lignes « Saison… » de la fiche. Voir episodes.js.
  const cineJob = !movie && imdb ? videosCinemeta(imdb) : [];
  const date = (movie ? brut.release_date : brut.first_air_date) || "";
  const releases = movie ? (brut.release_dates && brut.release_dates.results) || [] : null;
  const cert = movie
    ? ((releases.find((r) => r.iso_3166_1 === cfg.g) || {}).release_dates || []).map((r) => r.certification).find(Boolean)
    : ((brut.content_ratings && brut.content_ratings.results || []).find((r) => r.iso_3166_1 === cfg.g) || {}).rating;
  const trailers = trailersOf(brut.videos && brut.videos.results);
  // Pas de VF sur TMDB : recherche Allociné + YouTube, lancée tout de suite et attendue en fin de fiche.
  let vfJob = null;
  if (short === "fr" && imdb && !trailers.some((t) => isVf(t.lang, t.name))) {
    const job = vfTrailer(kind, imdb, (brut.title || brut.name || "").trim(), date.slice(0, 4)).catch(() => null);
    ctx.waitUntil(job);
    vfJob = Promise.race([job, new Promise((res) => setTimeout(() => res("attente"), VF_WAIT_MS))]);
  }
  const keywords = ((movie ? brut.keywords && brut.keywords.keywords : brut.keywords && brut.keywords.results) || []).map((k) => k.name);
  // Lignes écrites par l'IA, lancées dès que possible, pendant que le reste de la fiche se construit :
  // « pour qui » n'a besoin que de la fiche TMDB ; la saison commandée part dès que les saisons sont recomptées, le
  // rappel dès que la saga ou les épisodes sont connus. L'attente maximale compte à partir d'ici.
  // Sans clé Gemini (ou fiche légère), « pour qui » et le rappel sont seulement relus dans le cache.
  const ai = !!env.GEMINI_API_KEY;
  const aiWait = new Promise((res) => setTimeout(() => res("attente"), FICHE_AI_WAIT_MS));
  const ask = (job) => (job ? Promise.race([job, aiWait]) : null);
  const profileJob = ask(aiProfile(env, ctx, `${movie ? "movie" : "tv"}-${brut.id}`, profilePrompt(brut, movie, keywords, cert)));
  // Film d'une saga : sa collection TMDB (suite annoncée, rappel du film d'avant), et le temps pour tout voir, dès
  // qu'elle est lue.
  const colJob = movie && brut.belongs_to_collection ? tmdb(env, `/collection/${brut.belongs_to_collection.id}`, {}, lang).then(async (col) => {
    const parts = col.parts || [];
    const sortis = parts.filter((p) => p.release_date && p.release_date <= today).sort((a, b) => a.release_date.localeCompare(b.release_date));
    return { parts, sortis, temps: sortis.length >= 2 ? await sagaTime(env, sortis, brut, lang) : "" };
  }) : null;
  // Série : les épisodes, ajoutés par lots de 20 saisons à un seul appel TMDB. Saisons de TMDB (pas celles
  // recomptées) : ce sont elles qu'on lui demande.
  const numbers = movie ? [] : (brut.seasons || []).map((s) => s.season_number).filter((n) => Number.isInteger(n));
  const episodesJob = movie ? null : (() => {
    const batches = [];
    for (let i = 0; i < numbers.length; i += 20) batches.push(numbers.slice(i, i + 20));
    const anime = brut.original_language === "ja" && (brut.genres || []).some((g) => g.id === 16) && (brut.number_of_episodes || 0) >= 40;
    return Promise.all([
      Promise.all(batches.slice(0, 10).map((b) =>
        tmdb(env, `/tv/${tmdbId}`, { append_to_response: b.map((n) => `season/${n}`).join(",") }, lang))),
      anime ? fillerEpisodes(brut).catch(() => null) : null,
    ]);
  })();

  const cine = await cineJob;
  const decoupage = cine && decoupageCinemeta(brut.seasons, cine);
  const d = decoupage ? ficheRecomptee(brut, decoupage) : brut;
  const metaId = id.startsWith("tt") ? id : imdb || `tmdb:${tmdbId}`;
  const wp = d["watch/providers"] || null;
  // Film récent (sorti il y a moins d'un an) : la VF lue dans les sources, comme les affiches ; sinon les plateformes.
  const recent = movie && imdb && releaseDates(releases, [2, 3, 4, 5, 6]).some((x) => x >= addDays(today, -365) && x <= today);
  // Sans date numérique américaine : l'estimation d'après son distributeur (table lue seulement dans ce cas). Lues
  // ensemble.
  const [lu, vod] = await Promise.all([
    recent ? sourcesVf(env, [imdb]).then((m) => avecAbonnement(m.get(imdb), abonnementVf(wp, d.original_language, d.keywords))) : null,
    movie && besoinEstimation(releases) ? estimationsVod().then((table) => estimationDe(table, imdb)) : null,
  ]);
  // En VO seulement (comme pas sorti : seule la VF compte) : d'après les sources seulement (voir releaseNote).
  const etat = lu ? { vf: lu.vf, vo: sansVf(lu) } : { vf: movie && vfSurPlateforme(wp, d.original_language, d.keywords), surPlateforme: plateformeFrance(wp) };
  const note = movie ? releaseNote(releases, d.original_language, today, etat, vod) : await noteSerie(env, d, imdb, wp, today);
  // La même date que l'affiche et les rangées : la sortie numérique américaine (dispoChezSoi), ou son estimation.
  const dispo = movie ? dispoChezSoi(releases, d.original_language, vod).date : "";
  const shownDate = dispo && dispo > today ? dispo : date;
  const credits = d.credits || {};
  const castList = movie ? credits.cast || [] : (d.aggregate_credits && d.aggregate_credits.cast || []).map((c) => ({ ...c, character: (c.roles || [])[0] && c.roles[0].character }));
  const crew = credits.crew || [];
  const directors = movie ? crew.filter((c) => c.job === "Director") : (d.created_by || []);
  const writers = crew.filter((c, i, all) => c.department === "Writing" && all.findIndex((o) => o.id === c.id && o.department === "Writing") === i).slice(0, 4);
  const logo = bestImage(d.images && d.images.logos, short);
  const backdrop = bestImage((d.images && d.images.backdrops || []).filter((b) => !b.iso_639_1), short);
  const runtime = movie ? d.runtime : (d.episode_run_time || [])[0];
  const endYear = !movie && d.status !== "Returning Series" && d.last_air_date ? d.last_air_date.slice(0, 4) : "";

  const m = {
    id: metaId,
    imdb_id: imdb || undefined,
    type: kind,
    name: (d.title || d.name || "").trim(),
    poster: d.poster_path ? `${IMG}w500${d.poster_path}` : undefined,
    background: backdrop ? `${IMG}w1920${backdrop.file_path}` : d.backdrop_path ? `${IMG}w1920${d.backdrop_path}` : undefined,
    logo: logo ? `${IMG}w500${logo.file_path.replace(/\.svg$/, ".png")}` : undefined,
    description: [note ? `${movie ? "📅" : "📺"} ${dot(note)}` : "", d.overview || ""].filter(Boolean).join("\n") || undefined,
    // Films : l'année seule, comme les cartes (la dispo est dans le résumé).
    releaseInfo: movie ? date.slice(0, 4) || undefined
      : date ? `${date.slice(0, 4)}-${endYear}` : undefined,
    released: shownDate ? `${shownDate}T00:00:00.000Z` : undefined,
    // « En cours » entre deux saisons trompait (Crystal Lake, saison 1 finie) : « Entre deux saisons ».
    status: !movie && d.status === "Returning Series" && betweenSeasons(episodeOf(d), today)
      ? "Entre deux saisons" : STATUS_FR[d.status] || d.status || undefined,
    imdbRating: imdbRating(imdb),
    genres: (d.genres || []).map((g) => GENRE_NAMES[g.id] || g.name),
    runtime: runtime ? `${runtime} min` : undefined,
    director: directors.map((p) => p.name),
    writer: writers.map((p) => p.name),
    cast: castList.slice(0, 15).map((p) => p.name),
    country: (d.production_countries || []).map((c) => c.iso_3166_1).join(", ") || undefined,
    language: d.original_language || undefined,
    trailers,
    trailerStreams: trailers.map((t) => ({ ytId: t.ytId })),
    links: imdb ? [{ name: "IMDb", category: "imdb", url: `https://www.imdb.com/title/${imdb}` }] : [],
    app_extras: {
      cast: castList.slice(0, 20).map(person),
      directors: directors.map(person),
      writers: writers.map(person),
      certification: cert || undefined,
    },
    behaviorHints: movie ? { defaultVideoId: metaId } : { hasScheduledVideos: d.status === "Returning Series" },
  };

  // Infos en plus, après le résumé : scène après le générique, œuvre adaptée, temps pour tout voir,
  // « pour qui » et « à savoir » (IA), puis le rappel de l'œuvre précédente (IA).
  // En premier : y aura-t-il une suite ? (série terminée, saison annoncée, film suivant de la saga)
  const follow = movie ? null : seriesFollow(d, today);
  const extras = [follow ? follow.text : "", movie ? creditsScene(keywords) : "", sourceNote(keywords, crew)];

  // TMDB dit « pas terminée » sans saison annoncée : Wikipédia tranche (renouvelée ou non).
  const renewalJob = ai && follow && follow.unsure ? ask(renewalOf(env, ctx, d, follow.season, today)) : null;

  let saga = null;
  if (colJob) {
    const col = await colJob;
    extras[0] = sagaFollow(col.parts, d, today);
    saga = col.sortis;
    if (saga.length >= 2) extras.push(col.temps);
  }

  if (!movie) {
    const base = imdb || `tmdb:${tmdbId}`;
    const [parts, fillers] = await episodesJob;
    const videos = [];
    for (const part of parts) {
      for (const n of numbers) {
        const s = part[`season/${n}`];
        if (!s || !s.episodes) continue;
        for (const e of s.episodes) {
          const { season, episode } = decoupage ? decoupage.place(n, e.episode_number) : { season: n, episode: e.episode_number };
          videos.push({
            id: `${base}:${season}:${episode}`,
            title: e.name || `Épisode ${episode}`,
            season,
            episode,
            number: episode,
            released: e.air_date ? `${e.air_date}T00:00:00.000Z` : undefined,
            overview: e.overview || undefined,
            thumbnail: e.still_path ? `${IMG}w500${e.still_path}` : undefined,
            runtime: e.runtime ? `${e.runtime} min` : undefined,
            _minutes: e.runtime || 0,
            _aired: !!e.air_date && e.air_date <= today,
            _note: { air_date: e.air_date, vote_count: e.vote_count, vote_average: e.vote_average, episode_number: episode },
          });
        }
      }
    }
    // Épisodes que seul Cinemeta connaît (saison annoncée) : ses titres anglais, « Episode 1 » traduit.
    for (const v of decoupage ? decoupage.restants : []) {
      videos.push({
        id: `${base}:${v.season}:${v.episode}`,
        title: !v.name || /^Episode \d+$/i.test(v.name) ? `Épisode ${v.episode}` : v.name,
        season: v.season,
        episode: v.episode,
        number: v.episode,
        released: v.released || undefined,
        overview: v.overview || undefined,
        thumbnail: v.released && v.thumbnail ? v.thumbnail : undefined,
        _aired: !!v.released && v.released.slice(0, 10) <= today,
      });
    }
    videos.sort((a, b) => a.season - b.season || a.episode - b.episode);
    // Les 3 meilleurs épisodes de chaque saison (une fois les saisons recomptées) : l'étoile.
    for (const n of new Set(videos.map((v) => v.season))) {
      const saison = videos.filter((v) => v.season === n && v._note);
      const best = n > 0 ? bestEpisodes(saison.map((v) => v._note), today) : new Set();
      for (const v of saison) if (best.has(v.episode)) v.title = `⭐ ${v.title}`;
    }
    for (const v of videos) v.name = v.title;
    // Anime : épisodes de remplissage, comptés à la suite d'une saison à l'autre (hors spéciaux).
    if (fillers && fillers.size) {
      let k = 0;
      for (const v of videos) {
        if (v.season > 0 && fillers.has(++k)) v.title = v.name = `${v.title} (remplissage)`;
      }
    }
    extras.push(seriesTime(videos, d));
    m.videos = videos.map(({ _minutes, _aired, _note, ...v }) => v);
    // Cinemeta en panne : saisons de TMDB pour cette fois, la fiche n'est pas gardée.
    if (cine === null) m._partial = true;
  }

  let recapLine = "";
  const prev = previousWork(d, movie, saga, m.videos);
  const [recap, profile, renewal] = await Promise.all([ask(prev && aiRecap(env, ctx, prev.id, prev.prompt)), profileJob, renewalJob]);
  // Pas encore prêt, ou Gemini indisponible : la fiche n'est pas gardée, pour l'avoir plus tard.
  if ([recap, profile, renewal].some((r) => r === "attente" || (r && r.error))) m._partial = true;
  if (renewal && renewal !== "attente" && renewal.status) extras[0] = renewalNote(renewal, follow.season);
  if (profile && profile !== "attente") {
    if (profile.pourQui) extras.push(`🎯 ${profile.pourQui}`);
    if (profile.aSavoir) extras.push(`⚠️ À savoir : ${profile.aSavoir}`);
  }
  if (recap && recap !== "attente" && recap.recap) recapLine = `🔁 ${prev.label}, attention ça raconte la fin : ${recap.recap}`;
  m.description = [m.description, extras.filter(Boolean).join("\n"), recapLine].filter(Boolean).join("\n\n") || undefined;
  if (vfJob) {
    const vf = await vfJob;
    // Pas encore trouvée : la fiche n'est pas gardée, la VF sera là à la prochaine ouverture.
    if (vf === "attente") m._partial = true;
    else if (vf && vf.key) {
      const vfItem = { source: vf.key, ytId: vf.key, type: "Trailer", name: vf.title, lang: "fr" };
      // VF pas en HD sur YouTube : la bande-annonce HD de TMDB reste en premier (celle du hero), la VF
      // juste après dans la liste de la fiche.
      const first = trailers[0] && ((d.videos && d.videos.results) || []).find((v) => v.key === trailers[0].source);
      m.trailers = vf.hd === false && first && first.size >= 720 ? [trailers[0], vfItem, ...trailers.slice(1)] : [vfItem, ...trailers];
      m.trailerStreams = m.trailers.map((t) => ({ ytId: t.ytId }));
    }
  }
  return m;
}

// Attente maximale des lignes écrites par l'IA (rappel, « pour qui », saison commandée) à la première
// ouverture d'une fiche. Gemini lent ou saturé (un modèle met 5 s à passer la main au suivant) : la fiche
// part sans elles et n'est pas gardée ; elles finissent d'arriver en cache (6 mois) pour l'ouverture suivante.
const FICHE_AI_WAIT_MS = 2000;

/** « 7 nov. », ou « 7 nov. 2027 » hors de l'année en cours. */
const dateFr = (iso, today) => `${shortDate(iso)}${iso.slice(0, 4) !== today.slice(0, 4) ? ` ${iso.slice(0, 4)}` : ""}`;
// Point final, sauf après un mois abrégé (« le 15 déc. », pas « le 15 déc.. »).
const dot = (text) => (text.endsWith(".") ? text : `${text}.`);

/**
 * Film d'une saga : le film suivant (sorti, daté ou seulement annoncé), ou « pas de suite annoncée »
 * pour le dernier. D'après la collection TMDB, où les suites annoncées figurent, datées ou non.
 */
function sagaFollow(parts, d, today) {
  const order = [...parts.filter((p) => p.release_date).sort((a, b) => a.release_date.localeCompare(b.release_date)),
    ...parts.filter((p) => !p.release_date)];
  const i = order.findIndex((p) => p.id === d.id);
  if (i < 0) return "";
  const next = order[i + 1];
  if (!next) return "🏁 Pas de suite annoncée pour l'instant.";
  const title = `« ${next.title || next.original_title} »`;
  if (!next.release_date) return `🔜 Une suite est annoncée : ${title}, pas encore de date.`;
  if (next.release_date > today) return dot(`🔜 La suite : ${title}, sortie prévue le ${dateFr(next.release_date, today)}`);
  return `➡️ La suite : ${title} (${next.release_date.slice(0, 4)}).`;
}

/**
 * Série : terminée, annulée, prochaine saison datée ou annoncée, ou pas encore terminée sans date.
 * Rien pendant une saison en cours (le prochain épisode est déjà en tête du résumé).
 */
function seriesFollow(d, today) {
  const say = (text) => ({ text });
  if (d.status === "Ended") return say("🏁 Série terminée : il n'y aura pas de suite.");
  if (d.status === "Canceled") return say("❌ Série annulée : il n'y aura pas de suite.");
  if (d.status !== "Returning Series") return null;
  const last = d.last_episode_to_air, next = d.next_episode_to_air;
  const lastSeason = last ? last.season_number : 0;
  if (next && next.season_number > lastSeason && next.air_date) return say(dot(`🔜 Saison ${next.season_number} : à partir du ${dateFr(next.air_date, today)}`));
  if (next) return null;
  const coming = (d.seasons || []).find((x) => x.season_number > lastSeason);
  if (coming) {
    return say(coming.air_date && coming.air_date > today
      ? dot(`🔜 Saison ${coming.season_number} : à partir du ${dateFr(coming.air_date, today)}`)
      : `🔜 Saison ${coming.season_number} annoncée, pas encore de date.`);
  }
  // TMDB ne sait pas si la saison suivante est commandée : les actualités trancheront (aiRenewal).
  return { text: `🔜 Pas encore terminée : aucune date pour la saison ${lastSeason + 1}.`, unsure: true, season: lastSeason + 1 };
}

// Nom du logiciel (et de son dépôt) pour Wikimedia : le même pour l'instance principale et les copies.
const WIKI_HEADERS = { "User-Agent": "CatalogueFR/1.0 (+https://github.com/xnzx07/nuvio-assets)" };
const WIKI_CACHE = { cacheTtl: 86400, cacheEverything: true };
// Phrases de l'article qui parlent de la suite : renouvellement, annulation, dernière saison.
const WIKI_NEWS = /renew|cancel|final season|last season|conclud|will end|ended|season (premiere|finale)|upcoming|in production|filming|ordered/i;

/**
 * Extraits de l'article Wikipédia anglais d'une série (mis à jour vite après chaque annonce) :
 * le début de l'article et les phrases sur la suite. Titre trouvé par l'identifiant Wikidata de TMDB.
 */
async function wikiNews(wikidataId) {
  if (!/^Q\d+$/.test(wikidataId || "")) return "";
  const wd = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${wikidataId}&props=sitelinks&sitefilter=enwiki&format=json`,
    { headers: WIKI_HEADERS, cf: WIKI_CACHE }).then((r) => (r.ok ? r.json() : null), () => null);
  const title = (((((wd || {}).entities || {})[wikidataId] || {}).sitelinks || {}).enwiki || {}).title;
  if (!title) return "";
  const wp = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=${encodeURIComponent(title)}`,
    { headers: WIKI_HEADERS, cf: WIKI_CACHE }).then((r) => (r.ok ? r.json() : null), () => null);
  const page = Object.values(((wp || {}).query || {}).pages || {})[0] || {};
  const text = String(page.extract || "");
  if (!text) return "";
  const intro = text.split(/\n\s*\n/)[0].slice(0, 1500);
  const news = text.replace(/^=+.*=+$/gm, "").split(/(?<=[.!?])\s+/).filter((x) => WIKI_NEWS.test(x) && !intro.includes(x));
  return [intro, ...news].join("\n").slice(0, 5000);
}

/** Saison suivante commandée ou non, d'après Wikipédia lu par Gemini (null sans article). */
async function renewalOf(env, ctx, d, season, today) {
  const news = await wikiNews(d.external_ids && d.external_ids.wikidata_id);
  if (!news) return null;
  const last = d.last_episode_to_air;
  const prompt = [
    `Série : « ${d.name} » (titre original : ${d.original_name}, depuis ${(d.first_air_date || "").slice(0, 4)}).`,
    `Dernière saison diffusée : saison ${season - 1}${last && last.air_date ? `, dernier épisode le ${last.air_date}` : ""}. Question : qu'en est-il de la saison ${season} ? Date du jour : ${today}.`,
    `Extraits de Wikipédia :\n${news}`,
  ].join("\n");
  return aiRenewal(env, ctx, `tv-${d.id}-s${season}`, prompt);
}

/** Ligne « suite » d'après les actualités : commandée, annulée, terminée ou en attente. */
function renewalNote(r, season) {
  const more = r.detail ? ` : ${r.detail}` : "";
  if (r.status === "RENOUVELEE") return `🔜 Saison ${season} commandée${more}.`;
  if (r.status === "ANNULEE") return `❌ Série annulée : il n'y aura pas de saison ${season}.`;
  if (r.status === "TERMINEE") return "🏁 Série terminée : il n'y aura pas de suite.";
  return `⏸️ Saison ${season} pas encore commandée${more}.`;
}

/** Scène pendant ou après le générique, d'après les mots-clés TMDB. */
function creditsScene(keywords) {
  const during = keywords.includes("duringcreditsstinger"), after = keywords.includes("aftercreditsstinger");
  if (during && after) return "🎬 Reste jusqu'au bout : il y a des scènes pendant et après le générique.";
  if (after) return "🎬 Reste après le générique : il y a une scène.";
  if (during) return "🎬 Il y a une scène pendant le générique.";
  return "";
}

// Œuvre adaptée (mots-clés TMDB) et métiers TMDB de son auteur.
const SOURCES = [
  [/based on (novel or book|young adult novel)/, "du roman"], [/based on short story/, "de la nouvelle"],
  [/based on manga/, "du manga"], [/based on (comic|graphic novel)/, "de la bande dessinée"],
  [/based on video game/, "du jeu vidéo"], [/based on play or musical/, "de la pièce"],
];
const AUTHOR_JOBS = new Set(["Novel", "Book", "Author", "Short Story", "Comic Book", "Graphic Novel"]);
const de = (name) => (/^[aeiouyhâàéèêîïôûAEIOUYHÂÀÉÈÊÎÏÔÛ]/.test(name) ? `d'${name}` : `de ${name}`);

/** « Adapté du roman de Stephen King », « Tiré d'une histoire vraie »… */
function sourceNote(keywords, crew) {
  const kw = keywords.join("|");
  const src = SOURCES.find(([re]) => re.test(kw));
  const real = /based on (true story|real events|memoir or autobiography)|biography/.test(kw);
  // L'auteur : le plus connu de la liste (TMDB y range aussi les traducteurs : The Witcher donnait
  // « David French et Danusia Stok » au lieu d'Andrzej Sapkowski), en alphabet latin seulement
  // (TMDB n'a parfois que « 岸本斉史 » pour Masashi Kishimoto).
  const authors = crew.filter((c) => AUTHOR_JOBS.has(c.job) && /^[A-Za-zÀ-ÿ]/.test(c.name || ""))
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, 1).map((c) => c.name);
  const parts = [];
  if (src) parts.push(`Adapté ${src[1]}${authors.length ? ` ${de(authors.join(" et "))}` : ""}`);
  if (real) parts.push(parts.length ? "tiré d'une histoire vraie" : "Tiré d'une histoire vraie");
  return parts.length ? `📖 ${parts.join(", ")}.` : "";
}

const duration = (min) => (min >= 600 ? `${Math.round(min / 60)} h`
  : `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, "0")}` : ""}`);

/** « Tout voir : 62 h (5 saisons, 50 épisodes) », d'après les épisodes déjà sortis. */
function seriesTime(videos, d) {
  const aired = videos.filter((v) => v.season > 0 && v._aired);
  if (aired.length < 2) return "";
  const usual = (d.episode_run_time || [])[0] || 0;
  const minutes = aired.reduce((t, v) => t + (v._minutes || usual), 0);
  if (!minutes) return "";
  const seasons = new Set(aired.map((v) => v.season)).size;
  return `⏳ Tout voir : ${duration(minutes)} (${seasons} saison${seasons > 1 ? "s" : ""}, ${aired.length} épisodes).`;
}

/** « La saga entière : 21 h (8 films) », films déjà sortis (une fiche TMDB par film, en cache). */
async function sagaTime(env, saga, d, lang) {
  if (saga.length > 12) return "";
  const runtimes = await Promise.all(saga.map((p) => (p.id === d.id ? d.runtime
    : tmdb(env, `/movie/${p.id}`, {}, lang).then((x) => x.runtime))));
  if (runtimes.some((r) => !r)) return "";
  return `⏳ La saga entière : ${duration(runtimes.reduce((t, r) => t + r, 0))} (${saga.length} films).`;
}

/** Les 3 épisodes les mieux notés d'une saison (au moins 6 épisodes sortis et notés), pour l'étoile. */
function bestEpisodes(episodes, today) {
  const rated = episodes.filter((e) => e.air_date && e.air_date <= today && (e.vote_count || 0) >= 5);
  if (rated.length < 6) return new Set();
  return new Set([...rated].sort((a, b) => b.vote_average - a.vote_average || b.vote_count - a.vote_count)
    .slice(0, 3).map((e) => e.episode_number));
}

/** Numéros des épisodes de remplissage d'un anime (numérotation continue), d'après animefillerlist.com. */
async function fillerEpisodes(d) {
  const slugs = [...new Set([d.name, d.original_name].map((n) => norm(n).replace(/ /g, "-")).filter(Boolean))];
  for (const slug of slugs) {
    const html = await fetch(`https://www.animefillerlist.com/shows/${slug}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CatalogueFR)" },
      cf: { cacheTtl: 7 * 86400, cacheEverything: true },
    }).then((r) => (r.ok ? r.text() : ""), () => "");
    const m = /<div class="filler">([\s\S]*?)<\/div>/.exec(html);
    if (!m) continue;
    const out = new Set();
    for (const [, a, b] of m[1].replace(/<[^>]+>/g, " ").matchAll(/(\d+)(?:\s*-\s*(\d+))?/g)) {
      for (let k = Number(a); k <= Number(b || a) && out.size < 5000; k++) out.add(k);
    }
    return out;
  }
  return null;
}

/** Ce que Gemini sait de l'œuvre pour « pour qui » et « à savoir ». */
function profilePrompt(d, movie, keywords, cert) {
  return [
    `${movie ? "Film" : "Série"} : « ${d.title || d.name} » (titre original : ${d.original_title || d.original_name}, ${(d.release_date || d.first_air_date || "").slice(0, 4)}).`,
    `Genres : ${(d.genres || []).map((g) => g.name).join(", ") || "?"}.`,
    cert ? `Classification en France : ${cert}.` : "",
    keywords.length ? `Mots-clés : ${keywords.slice(0, 20).join(", ")}.` : "",
    `Résumé : ${d.overview || "?"}`,
  ].filter(Boolean).join("\n");
}

/**
 * L'œuvre à rappeler avant celle-ci → { id, label, prompt }, ou null :
 *   - film d'une saga : le film précédent de la saga (assez connu pour que Gemini le connaisse) ;
 *   - série : la saison d'avant la saison en cours (ou d'avant celle qui va commencer), racontée
 *     d'après les résumés de ses épisodes (rien d'inventé).
 */
function previousWork(d, movie, saga, videos) {
  if (movie) {
    const i = (saga || []).findIndex((p) => p.id === d.id);
    const p = i > 0 ? saga[i - 1] : null;
    if (!p || (p.vote_count || 0) < 300) return null;
    const year = p.release_date.slice(0, 4);
    return {
      id: `movie-${p.id}`,
      label: `Rappel de « ${p.title} » (${year})`,
      prompt: `Film à raconter : « ${p.title} » (titre original : ${p.original_title}, ${year}).\nSynopsis : ${p.overview || "?"}\nLa suite qu'on va regarder : « ${d.title} ».`,
    };
  }
  const next = d.next_episode_to_air, last = d.last_episode_to_air;
  const current = next && next.episode_number === 1 ? next.season_number : last && last.season_number;
  if (!current || current < 2) return null;
  const season = current - 1;
  const eps = (videos || []).filter((v) => v.season === season && v.overview);
  // Sans résumés d'épisodes, seulement une série assez connue pour que Gemini la connaisse.
  if (eps.length < 2 && (d.vote_count || 0) < 300) return null;
  const clean = (t) => t.replace(/^⭐ /, "").replace(/ \(remplissage\)$/, "");
  return {
    id: `tv-${d.id}-s${season}`,
    label: `Rappel de la saison ${season}`,
    prompt: [`Série : « ${d.name} » (titre original : ${d.original_name}), saison ${season} à raconter.`,
      eps.length >= 2 ? `Résumés des épisodes :\n${eps.map((e) => `${e.episode}. ${clean(e.title)} : ${e.overview}`).join("\n")}` : ""]
      .filter(Boolean).join("\n").slice(0, 12000),
  };
}

/** Ce que Gemini lit d'un titre pour son « pour qui » de rangée (fiche TMDB : genres en objets ; liste : genre_ids). */
const profileText = (series, it) => [
  `${series ? "Série" : "Film"} : « ${it.title || it.name} » (titre original : ${it.original_title || it.original_name}, ${(it.release_date || it.first_air_date || "").slice(0, 4)}).`,
  `Genres : ${(it.genre_ids || (it.genres || []).map((g) => g.id)).map((g) => GENRE_NAMES[g]).filter(Boolean).join(", ") || "?"}.`,
  `Résumé : ${(it.overview || "?").slice(0, 600)}`,
].join("\n");

/**
 * Prépare en arrière-plan le « pour qui » et le « à savoir » des titres d'une page, en une seule
 * question à Gemini : le hero de Nuvio, qui charge la fiche de chaque titre survolé, les trouve prêts.
 * Passe par un appel de l'addon à lui-même (liaison SELF de wrangler.toml), qui a son propre budget
 * d'appels : une page de rangée en utilise déjà une vingtaine sur les 50 permis.
 */
function prefetchProfiles(env, ctx, results, kind) {
  if (!env.GEMINI_API_KEY || !env.SELF || !ctx || !results || !results.length) return;
  // Seulement les identifiants : l'appel relit lui-même chaque titre dans TMDB (un texte venu de la
  // requête irait tel quel à Gemini, et sa réponse, en cache, serait lue par tout le monde).
  const items = results.slice(0, 20).map((it) => ({ key: `${kind === "series" ? "tv" : "movie"}-${it.id}`, id: it.id }));
  ctx.waitUntil((async () => {
    const headers = { "Content-Type": "application/json", "x-prefetch": await sha(env.GEMINI_API_KEY) };
    await env.SELF.fetch("https://self/prefetch/profiles", { method: "POST", headers, body: JSON.stringify({ key: env.GEMINI_API_KEY, items }) });
  })().catch(() => {}));
}

// ---------- HTTP ----------
const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

/**
 * Bande-annonce YouTube d'un titre (pour l'aperçu de la page de personnalisation) :
 * en français si elle existe, sinon en version originale. L'identifiant peut être IMDb
 * (films) ou « tmdb:<id> » (séries et films sans IMDb).
 */
async function trailer(env, kind, id) {
  let tmdbId = id.startsWith("tmdb:") ? id.slice(5) : null;
  if (!tmdbId && /^tt\d{1,10}$/.test(id)) {
    const found = await tmdb(env, `/find/${id}`, { external_source: "imdb_id" });
    const hit = (kind === "series" ? found.tv_results : found.movie_results) || [];
    tmdbId = hit[0] ? String(hit[0].id) : null;
  }
  if (!tmdbId || !/^\d+$/.test(tmdbId)) return { key: null };
  const path = `/${kind === "series" ? "tv" : "movie"}/${tmdbId}/videos`;
  const pick = (r) => (r.results || [])
    .filter((v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"))
    .sort((a, b) => isVf(b.iso_639_1, b.name) - isVf(a.iso_639_1, a.name) || (b.size >= 1080) - (a.size >= 1080)
      || (b.type === "Trailer") - (a.type === "Trailer") || (b.official === true) - (a.official === true))[0];
  const fr = pick(await tmdb(env, path, {}, "fr-FR"));
  if (fr && isVf(fr.iso_639_1, fr.name)) return { key: fr.key, lang: fr.iso_639_1 };
  // Pas de VF sur TMDB : Allociné + YouTube, sinon la VOSTFR, sinon la VO.
  const d = await tmdb(env, `/${kind === "series" ? "tv" : "movie"}/${tmdbId}`, { append_to_response: "external_ids" });
  const imdb = (d.imdb_id || (d.external_ids && d.external_ids.imdb_id)) || null;
  const vf = imdb ? await vfTrailer(kind, imdb, (d.title || d.name || "").trim(), (d.release_date || d.first_air_date || "").slice(0, 4)).catch(() => null) : null;
  if (vf && vf.key) return { key: vf.key, lang: "fr" };
  if (fr) return { key: fr.key, lang: fr.iso_639_1 };
  const v = pick(await tmdb(env, path, {}, "en-US"));
  return { key: v ? v.key : null, lang: v ? v.iso_639_1 : null };
}

function json(data, maxAge) {
  return new Response(JSON.stringify(data), {
    headers: { ...HEADERS, "Cache-Control": `public, max-age=${maxAge}` },
  });
}

const RESERVED = new Set(["manifest.json", "catalog", "configure", "collections.json", "accueil.json", "guide", "tv", "trailer", "lien", "meta", "logo.png", "debug", "affiche", "prefetch", "dossier", "hote", "statique", "copie", "lien-fixe", "tendances", "sf", "avis", "saison.json", "seance", "diagnostic", "nouveautes", "cpu", "reserve", "compte-nuvio"]);

async function loadCollections() {
  const res = await fetch(`${ASSETS}/collections/collections.json`, { cf: { cacheTtl: 600, cacheEverything: true } });
  return res.ok ? res.json() : [];
}

/** Applique pays et filtres globaux aux sources TMDB « discover » d'une tuile. */
function filterSource(src, cfg) {
  if (src.provider !== "tmdb" || src.tmdbSourceType !== "DISCOVER") return src;
  const f = { ...(src.filters || {}) };
  const col = src.mediaType === "TV" ? 2 : 1;
  const excluded = new Set(String(f.withoutGenres || "").split(/[|,]/).filter(Boolean));
  for (const name of cfg.e) { const g = GENRES.find(([n]) => n === name); if (g && g[col]) excluded.add(String(g[col])); }
  if (cfg.f) (col === 2 ? ["80", "10768"] : ["27", "53"]).forEach((g) => excluded.add(g));
  if (excluded.size) f.withoutGenres = [...excluded].join("|");
  if (f.watchRegion) f.watchRegion = cfg.g;
  if (cfg.m) f.voteAverageGte = Math.max(Number(f.voteAverageGte) || 0, cfg.m);
  if (cfg.a) f.releaseDateGte = maxDate(f.releaseDateGte, `${cfg.a}-01-01`);
  return { ...src, filters: f };
}

/**
 * Tuiles masquées et ordre choisi sont repérés par leur position dans le fichier : une nouvelle tuile
 * s'ajoute donc en fin de collection, une tuile déplacée demande de traduire les anciens liens (voir
 * oldTiles dans config.js), et l'ordre d'affichage par défaut se règle ici : les tuiles listées
 * d'abord, dans cet ordre, puis les autres dans l'ordre du fichier.
 */
const DEFAULT_ORDER = {
  studios: ["studio-33", "marvel-studios", "warner-bros", "dc-comics"],
};
function displayOrder(c, folders) {
  const order = DEFAULT_ORDER[c.id];
  if (!order) return folders;
  const rank = (f) => { const i = order.indexOf(f.id); return i < 0 ? order.length : i; };
  return [...folders].sort((a, b) => rank(a) - rank(b));
}
/** Place d'une tuile de la collection Plateformes : celle de sa plateforme dans cfg.p (les autres après). */
function rangPlateforme(f, cfg) {
  const p = PROVIDERS.find((x) => x.folder === f.id);
  const k = p ? cfg.p.indexOf(p.id) : -1;
  return k < 0 ? cfg.p.length : k;
}
/** Ordre choisi sur la page (positions dans le fichier) ; les tuiles absentes gardent l'ordre habituel, après. */
function userOrder(order, folders, pos) {
  if (!order || !order.length) return folders;
  const rank = (f) => { const k = order.indexOf(pos(f)); return k < 0 ? order.length : k; };
  return [...folders].sort((a, b) => rank(a) - rank(b));
}

/** Rangée de l'addon dans une collection : l'identifiant de cet addon-ci (une copie a le sien, « .perso »). */
const notreAddon = (src, id) => (src.provider === "addon" && src.addonId && src.addonId.startsWith("com.xnzx07.catalogue-fr")
  ? { ...src, addonId: id } : src);

/** Collections Nuvio filtrées : collections, plateformes et tuiles choisies, filtres appliqués. */
async function collections(cfg, url) {
  const all = await loadCollections();
  const chosenFolders = new Set(PROVIDERS.filter((p) => cfg.p.includes(p.id)).map((p) => p.folder));
  const platformFolders = new Set(PROVIDERS.map((p) => p.folder).filter(Boolean));
  const filtered = hasGlobalFilters(cfg) || cfg.g !== "FR";
  return all
    .filter((c) => cfg.c.includes(c.id))
    .map((c) => {
      const hidden = new Set(cfg.t[c.id] || []);
      const folders = userOrder(cfg.to[c.id], displayOrder(c, c.folders), (f) => c.folders.indexOf(f))
        .filter((f) => !hidden.has(c.folders.indexOf(f)))
        .filter((f) => c.id !== "plateformes-streaming" || !platformFolders.has(f.id) || chosenFolders.has(f.id))
        // Plateformes : dans l'ordre choisi sur le site (« Tes plateformes »), les autres tuiles après.
        .sort((a, b) => (c.id === "plateformes-streaming" ? rangPlateforme(a, cfg) - rangPlateforme(b, cfg) || 0 : 0))
        .map((f) => (filtered && f.sources ? { ...f, sources: f.sources.map((src) => filterSource(src, cfg)) } : f))
        .map((f) => (url && f.sources ? { ...f, sources: f.sources.map((src) => notreAddon(src, addonId(url))) } : f));
      return { ...c, folders };
    })
    .filter((c) => c.folders.length);
}

/**
 * L'ordre de l'accueil : { addon, ordre: [{ collection } | { type, id }] }. Les collections épinglées (Plateformes)
 * en tête, comme Nuvio les montre ; les autres à la place choisie (cfg.ac : après n rangées), sinon après les rangées.
 * Le site l'écrit dans le compte Nuvio (worker/compte-nuvio.js) et son aperçu le suit.
 */
async function ordreAccueil(today, cfg, url) {
  const colls = await collections(cfg, url);
  const places = new Map(cfg.ac.map((p, i) => [p.id, { ...p, i }]));
  const rangees = homeDefs(today, cfg).map((d) => ({ type: d.type, id: d.id }));
  const libres = colls.filter((c) => !c.pinToTop).map((c) => ({ id: c.id, n: places.has(c.id) ? places.get(c.id).n : Infinity, i: places.has(c.id) ? places.get(c.id).i : Infinity }))
    .sort((a, b) => Math.min(a.n, rangees.length) - Math.min(b.n, rangees.length) || a.i - b.i);
  const ordre = colls.filter((c) => c.pinToTop).map((c) => ({ collection: c.id }));
  let k = 0;
  for (let n = 0; n <= rangees.length; n++) {
    while (k < libres.length && Math.min(libres[k].n, rangees.length) === n) ordre.push({ collection: libres[k++].id });
    if (n < rangees.length) ordre.push(rangees[n]);
  }
  return { addon: addonId(url), ordre };
}

/** Empreinte courte (24 caractères) : clés de cache, en-tête x-prefetch. */
const sha = async (text) => (await sha256(text)).slice(0, 24);

function html(body) {
  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}

/**
 * En-têtes de sécurité ajoutés à toutes les réponses : pas de devinette du type de fichier, l'adresse
 * complète (qui contient parfois une clé Gemini) jamais envoyée aux autres sites, et les pages du site
 * jamais affichées dans le cadre d'un autre site.
 */
function withSecurity(res) {
  const out = new Response(res.body, res);
  out.headers.set("X-Content-Type-Options", "nosniff");
  out.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if ((out.headers.get("Content-Type") || "").startsWith("text/html")) {
    out.headers.set("Content-Security-Policy", "frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
    out.headers.set("X-Frame-Options", "SAMEORIGIN");
  }
  return out;
}
// Adresse du site telle que le visiteur l'a tapée (sur Docker, l'en-tête Host vient de lui) : un nom,
// une adresse IP et un port, rien d'autre, puisqu'elle est recopiée dans les pages.
const SAFE_HOST = /^([a-z0-9-]+(\.[a-z0-9-]+)*|\[[0-9a-f:.]+\])(:\d{1,5})?$/i;

export default {
  async fetch(request, env, ctx) {
    if (!SAFE_HOST.test(new URL(request.url).host)) return withSecurity(new Response("Adresse invalide", { status: 400 }));
    try {
      return withSecurity(await app.fetch(request, env, ctx));
    } catch (e) {
      // Erreur imprévue : une réponse propre (pas la page 1101 de Cloudflare), jamais gardée, sans le détail.
      // Dans le journal, le message sans ce qui suit un « ? » (une adresse peut contenir une clé).
      console.warn("erreur :", String((e && e.message) || e).replace(/\?\S*/g, "?…").slice(0, 300));
      return withSecurity(new Response(JSON.stringify({ error: "Erreur inattendue : réessaie dans un instant." }),
        { status: 500, headers: { ...HEADERS, "Cache-Control": "no-store" } }));
    }
  },
  // Tâche planifiée de 4 h UTC (wrangler.toml) : la photo du jour des tendances.
  async scheduled(event, env, ctx) {
    // Une demande à soi-même par photo (liaison SELF : chacune son budget de 50 appels sortants), sinon ici.
    ctx.waitUntil(env.SELF
      ? Promise.all(["movie", "series"].map((k) => env.SELF.fetch(`https://self/tendances/${k}.json`).catch(() => null)))
      : prendrePhotos(env, event.scheduledTime, classerTendances));
    ctx.waitUntil(nettoyerReserve(env, event.scheduledTime));
  },
};

// Le site et l'addon (sans les en-têtes de sécurité, ajoutés ci-dessus).
const app = {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: HEADERS });
    const url = new URL(request.url);
    // Chemin brut (encodé) : on découpe « genre=…&skip=… » AVANT de décoder,
    // sinon un filtre comme « Action & Aventure » serait coupé en deux.
    let path = url.pathname.replace(/\/+$/, "");
    // Galerie des styles d'affiches de la régie (salle 2) : jamais derrière une config (voir galerie.js).
    if (path.startsWith("/galerie/")) return galerieRoute(request, env, url, path);
    // Compteur de calcul du service d'affiches (offre Hobby de Vercel : 4 h de CPU par mois, voir cpu.js).
    if (path === "/cpu") return routeCpu(request, env, url);
    // Réserve des affiches déjà dessinées, lue par le service d'affiches avant de dessiner (voir reserve.js).
    const rv = /^\/reserve\/([^/]+)$/.exec(path);
    if (rv) return routeReserve(request, env, rv[1], Date.now(), ctx);
    const today = parisToday();
    const rows = allRows(today, null);
    // Nuvio « de base » de l'avant / après des aperçus : les rangées de Cinemeta, relayées (voir cinemeta.js).
    if (path.startsWith("/cinemeta/")) return routeCinemeta(path, HEADERS, ctx);
    // Le film du jour à deviner : la page, son image, ses indices et ses essais (voir jeu.js).
    if (path === "/jeu" || path.startsWith("/jeu/")) return routeJeu(request, env, ctx, url, path, today, HEADERS, decorSaison(url, today));
    // La salle des machines : l'état du site, testé par le worker lui-même (voir etat.js). L'addon est appelé par la
    // liaison SELF quand elle existe (son propre budget d'appels), sinon ici même.
    if (path === "/etat" || path === "/etat.json") {
      const appel = async (p) => {
        if (env.SELF) {
          try { const r = await env.SELF.fetch(new Request(url.origin + p)); if (r.status < 500) return r; } catch (e) { /* ici même */ }
        }
        return app.fetch(new Request(url.origin + p), env, ctx);
      };
      return routeEtat(request, env, ctx, url, path, { version: VERSION, assets: ASSETS, affiches: AFFICHES_STATIQUES + "/maison", appel, today, saison: decorSaison(url, today) }, HEADERS);
    }

    // Premier segment = config personnalisée, s'il n'est pas un mot réservé.
    let cfgSeg = "", fixedId = "";
    const first = path.split("/")[1] || "";
    if (first && !RESERVED.has(first)) { cfgSeg = first; path = path.slice(first.length + 1); }
    // Lien fixe : ses réglages sont dans la base ; la suite ne voit pas la différence.
    if (isFixedId(cfgSeg)) {
      fixedId = cfgSeg;
      try {
        cfgSeg = await readFixed(env, fixedId);
      } catch (e) {
        // Base injoignable (et pas de copie de secours ici) : « réessaie », jamais « introuvable », et rien de gardé.
        console.warn("lien fixe :", String((e && e.message) || e).slice(0, 300));
        const error = "Base des liens fixes injoignable pour le moment : réessaie dans quelques minutes, ton lien n'a rien perdu.";
        const page = path === "" || path === "/configure";
        return new Response(page ? error : JSON.stringify({ error }), { status: 503, headers: {
          ...(page ? { "Content-Type": "text/plain; charset=utf-8" } : HEADERS), "Cache-Control": "no-store", "Retry-After": "60" } });
      }
      if (cfgSeg === null) {
        if (path === "" || path === "/configure") return Response.redirect(url.origin + "/configure", 302);
        return json({ error: "Lien fixe introuvable : refais ton lien sur la page de personnalisation." }, 60);
      }
    }
    const cfg = decodeConfig(cfgSeg, rows, DEFS.discover);
    if (!cfg) return json({ error: "Configuration illisible : refais ton lien sur la page de personnalisation." }, 60);
    // Espace hébergeur des copies (/hote/…) : n'existe pas sur l'instance principale.
    if (path === "/hote" || path.startsWith("/hote/")) {
      if (isCopy(url)) return hostRoute(request, env, url, path, VERSION);
      return new Response(JSON.stringify({ error: "introuvable" }), { status: 404, headers: { ...HEADERS, "Cache-Control": "no-store" } });
    }

    if (path === "/lien-fixe" || path.startsWith("/lien-fixe/")) {
      return fixedRoute(request, env, path, (seg) => !!decodeConfig(seg, rows, DEFS.discover),
        (seg) => { const c = decodeConfig(seg, rows, DEFS.discover); return c && { k: c.k, al: c.al }; });
    }

    // La racine ouvre la salle 1 (le guide) ; la programmation (salle 2) est sur /configure,
    // et aussi sur /<config>/ pour les anciens liens personnalisés.
    if (path === "/configure" || (path === "" && (cfgSeg || fixedId))) {
      const files = await loadCollections().catch(() => []);
      // Même ordre de référence que config.js (positions dans les liens), avec la position
      // réelle dans le fichier pour l'affichage.
      const cols = COLLECTIONS.map((c) => ({
        ...c, pos: files.findIndex((f) => f.id === c.id),
        folders: displayOrder(c, ((files.find((f) => f.id === c.id) || {}).folders || []).map((f, i) => ({ id: f.id, title: f.title, cover: f.coverImageUrl || "", i }))),
      }));
      const page = html(configurePage({
        // Lien fixe : ni la clé Gemini ni le jeton d'alerte dans la page, que voit quiconque a le lien. La page
        // qui a la clé de modification les redemande (POST /lien-fixe/<id>/lire, voir fixe.js).
        origin: url.origin, cfg: fixedId ? { ...cfg, k: "", al: "" } : cfg, rows, discover: DEFS.discover, providers: PROVIDERS, collections: cols,
        defaults: defaults(rows, DEFS.discover), regions: REGIONS, genres: GENRES, languages: LANGUAGES,
        sorts: SORTS, seasons: SEASON_KEYS, maxCustom: MAX_CUSTOM, season: decorSaison(url, today), copy: isCopy(url),
        fixed: fixedId, fixedOk: fixedAvailable(env), apercus: apercusDe(env, url.origin),
      }));
      // Lien fixe : ses réglages changent sans que l'adresse change, la page n'est jamais resservie d'un cache.
      if (fixedId) page.headers.set("Cache-Control", "no-store");
      return page;
    }
    if (path === "") return html(hallPage({ origin: url.origin, season: decorSaison(url, today), copy: isCopy(url), apercus: apercusDe(env, url.origin) }));   // le hall : choisir sa salle
    if (path === "/guide") return html(guidePage({ origin: url.origin, season: decorSaison(url, today), apercus: apercusDe(env, url.origin) }));
    if (path === "/lien") return html(lienPage({ origin: url.origin }));   // ouvert par les QR codes du guide
    if (path === "/compte-nuvio") return html(compteNuvioPage({ origin: url.origin }));   // collections envoyées au compte Nuvio (essai)
    if (path === "/copie") return html(copiePage({ origin: url.origin }));   // « Monte ta propre salle » : héberger sa copie
    if (path === "/nouveautes") return html(nouveautesPage({ origin: url.origin, version: VERSION }));   // ce qui a changé, pour qui n'a pas Discord
    if (path === "/tv") return Response.redirect(NUVIO_TV_APK, 302);   // adresse courte pour Downloader : télécharge l'APK
    // Styles et scripts communs aux pages du site, gardés en cache par le navigateur (voir statique.js).
    if (path.startsWith("/statique/")) return statique(path.slice(10), url.searchParams.get("v")) || new Response("introuvable", { status: 404 });
    if (path === "/manifest.json") {
      const res = json(manifest(today, cfg, url, await hasAlerts(env, url, cfg)), CACHE_CLIENT_S);
      // Lien fixe : même adresse, nouveaux réglages. « Actualiser les addons » dans Nuvio doit relire le manifest
      // à chaque fois, jamais le ressortir d'un cache. Un lien habituel change d'adresse avec ses réglages : 5 min.
      if (fixedId) res.headers.set("Cache-Control", "no-cache, max-age=0, must-revalidate");
      // « Ta TV l'a reçu » (billet du lien fixe) : l'heure de cette lecture, notée sans retarder la réponse.
      if (fixedId) ctx.waitUntil(noteLecture(env, fixedId, request));
      return res;
    }
    if (path === "/collections.json") return json(await collections(cfg, url), CACHE_CLIENT_S);
    if (path === "/accueil.json") return json(await ordreAccueil(today, cfg, url), CACHE_CLIENT_S);
    // Soirée à deux (salle 2) : les rangées d'un lien, sans clé Gemini ni jeton d'alerte (voir soiree.js).
    if (path === "/programmation.json") return json(programmationPublique(cfg), fixedId ? 60 : 86400);
    // La photo du jour des tendances, lue par le service d'affiches (worker/tendances.js).
    const tend = !cfgSeg && /^\/tendances\/([a-z]+)\.json$/.exec(path);
    if (tend) return routeTendances(env, tend[1], HEADERS, classerTendances);
    // L'avis de StreamFusion pour un titre récent, demandé par le service d'affiches (voir routeStreamFusion).
    const sfDemande = !cfgSeg && /^\/sf\/(movie\/tt\d{1,10}|series\/tt\d{1,10}:\d{1,3}:1)\.json$/.exec(path);
    if (sfDemande) return routeStreamFusion(request, env, sfDemande[1]);
    // Guide : le mot de passe de la séance (seance.js) et le diagnostic par photo (diagnostic.js).
    const sc = /^\/seance\/([^/]+)$/.exec(path);
    if (sc) return routeSeance(request, env, sc[1]);
    if (path === "/diagnostic") return routeDiagnostic(request, env);
    if (path === "/logo.png") {   // le logo servi par le site, sans l'adresse du dépôt dans les pages
      const r = await fetch(`${ASSETS}/logo/addon.png`, { cf: { cacheTtl: 86400, cacheEverything: true } });
      return new Response(r.body, { status: r.status, headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
    }
    if (!env.TMDB_API_KEY) return json({ error: "Secret TMDB_API_KEY manquant" }, 0);
    // Les films de la rangée de saison, lus par le service d'affiches (habillage de la saison).
    // Gardés 3 h, comme les pages TMDB ; une liste vide en pleine fête (TMDB injoignable) : 5 min.
    if (!cfgSeg && path === "/saison.json") {
      const s = await filmsDeSaison(env, today, cfg);
      return json(s, s.saison && !s.ids.length ? CACHE_DEGRADE_S : CACHE_CATALOG_S);
    }
    // Diagnostics (/debug) : ils dépensent la clé Gemini de l'instance, donc réservés à l'hébergeur,
    // depuis son propre lien (celui qui contient cette clé) : /<config>/debug/…
    if (path.startsWith("/debug/") && !(env.GEMINI_API_KEY && cfg.k && same(cfg.k, env.GEMINI_API_KEY))) {
      return new Response(JSON.stringify({ error: "Réservé à l'hébergeur : ouvre /debug depuis ton lien d'addon (celui qui contient la clé Gemini de l'instance)." }),
        { status: 403, headers: { ...HEADERS, "Cache-Control": "no-store" } });
    }
    // Détail d'une recherche (formes essayées, correction, classement) : /debug/search/<movie|series>/<requête>
    // ?model=gemini-… pour essayer un autre modèle, ?thinking=low… pour un autre niveau de réflexion,
    // ?fresh=1 pour reposer la question à Gemini.
    const dbg = path.match(/^\/debug\/search\/(movie|series)\/(.+)$/);
    if (dbg) {
      const trace = {};
      const q = decode(dbg[2]);
      if (q === null) return json({ error: "requête mal encodée" }, 0);
      const out = await runSearch(env, dbg[1], q, 1, {
        ctx, lang: langOf(cfg), region: cfg.g, aiModel: url.searchParams.get("model") || undefined, aiFresh: url.searchParams.has("fresh"),
        aiThinking: url.searchParams.get("thinking") || undefined,
      }, trace);
      trace.final = out.map((it) => `${it.title || it.name} (${(it.release_date || it.first_air_date || "").slice(0, 4)})`);
      return json(trace, 0);
    }
    // Saison suivante d'une série d'après les actualités (réponse de Gemini, erreurs) : /debug/renewal/<id TMDB>
    const dr = path.match(/^\/debug\/renewal\/(\d+)$/);
    if (dr && env.GEMINI_API_KEY) {
      const d = await tmdb(env, `/tv/${dr[1]}`, {}, langOf(cfg));
      const follow = d && d.id ? seriesFollow(d, today) : null;
      if (!follow || !follow.unsure) return json({ tmdb: follow && follow.text }, 0);
      d.external_ids = await tmdb(env, `/tv/${dr[1]}/external_ids`);
      const r = (await renewalOf(env, ctx, d, follow.season, today)) || { error: "pas d'article Wikipédia" };
      return json({ wikipedia: await wikiNews(d.external_ids.wikidata_id), ...r, note: r.status ? renewalNote(r, follow.season) : follow.text }, 0);
    }
    // Affiche maison des aperçus du site (et du Plan B Stremio), gardée un jour dans le cache. Le serveur des affiches
    // (RELAIS_URL ; AFFICHES_URL, un service lancé à côté pour essayer en local) la dessine avec tous les réglages de la
    // salle 2 ; sans lui, c'est l'affiche toute faite du style de ces réglages (fichiers statiques), « maison » pour un
    // réglage perso, comme le lien qu'on copie (Vercel ne dessine plus).
    // /affiche/<type>/<poster|landscape>/<id>?imdb=tt…&s=1.…
    const af = path.match(/^\/affiche\/(movie|series)\/(poster|landscape)\/(tt\d{1,10}|tmdb%3A\d{1,10}|tmdb:\d{1,10})$/);
    if (af) {
      const id = decodeURIComponent(af[3]), imdb = url.searchParams.get("imdb") || "";
      // Réglages de la régie remis dans leur forme canonique (même lien, même cache chez Vercel).
      const s = ecrireReglages(lireReglages(url.searchParams));
      const q = new URLSearchParams();
      if (/^tt\d{1,10}$/.test(imdb)) q.set("imdb", imdb);
      if (s) q.set("s", "1." + s);
      const serveur = env.RELAIS_URL || env.AFFICHES_URL;
      // Fichiers statiques : rangés sous l'identifiant que Nuvio donne (tt… pour la plupart des titres), la régie en
      // demande souvent un tmdb:… avec son tt… à côté ; les deux sont essayés, le tt… d'abord.
      const sources = serveur ? [`${serveur}/${af[1]}/${af[2]}/${id}.jpg${q.size ? "?" + q : ""}`]
        : [...new Set([q.get("imdb"), id].filter(Boolean))].map((x) => `${AFFICHES_STATIQUES}/${dossierApercu(af[2], s)}/${af[1]}/${af[2]}/${encodeURIComponent(x)}.jpg`);
      const key = new Request(`https://cache.local/affiche-v${APERCU_V}/${af[1]}/${af[2]}/${id}?${q}&t=${jourTendances()}`);
      const hitA = await caches.default.match(key);
      if (hitA) return hitA;
      // X-Apercu : le service attend la qualité plus longtemps (une affiche de régie sans son badge 4K faisait croire
      // que cocher une case en retirait une autre).
      let r = null;
      for (const src of sources) {
        r = await fetch(src, { headers: { "X-Apercu": "1" } }).catch(() => null);
        if (r && r.ok) break;
      }
      // Pas encore dessinée en fichier statique (elle l'est au prochain passage) : pas gardée, la régie la redemandera.
      if (!r || !r.ok || !/^image\//.test(r.headers.get("Content-Type") || "")) return new Response(null, { status: 404, headers: { ...HEADERS, "Cache-Control": serveur ? "public, max-age=3600" : "no-store" } });
      // Gardée aussi longtemps que le service le demande, un jour au plus : une affiche partie sans son badge
      // (qualité en retard) n'est gardée qu'une heure, puis redemandée.
      const cc = r.headers.get("Cache-Control") || "", ma = /max-age=(\d+)/.exec(cc);
      // Partie « en retard » (X-Affiche-Etat, une donnée manquait) : jamais gardée, ni ici ni par le navigateur ; la
      // régie la redemande quelques secondes plus tard.
      const etat = r.headers.get("X-Affiche-Etat") === "retard" ? "retard" : "complete";
      const garde = etat === "retard" || /no-store|no-cache/.test(cc) ? 0 : Math.min(86400, ma ? Number(ma[1]) : 3600);
      const out = new Response(r.body, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "X-Affiche-Etat", "X-Affiche-Etat": etat,
        "Content-Type": r.headers.get("Content-Type"), "Cache-Control": garde ? `public, max-age=${garde}` : "no-store" } });
      if (garde) ctx.waitUntil(caches.default.put(key, out.clone()));
      return out;
    }
    // Un lot de films des tendances à trier pour la photo du jour (appel de l'addon à lui-même, voir trierLot). Clé
    // tirée de la clé TMDB de l'instance : un appel venu d'ailleurs ne peut pas dépenser StreamFusion.
    // L'avis VF du jour d'un lot de titres (appel de l'addon à lui-même, voir avisEnLots).
    if (path === "/avis/lot" && request.method === "POST") {
      if (!same(request.headers.get("x-tri") || "", await triCle(env))) return json({ error: "interdit" }, 0);
      const body = await request.json().catch(() => ({}));
      const cles = (Array.isArray(body.cles) ? body.cles : []).filter((c) => typeof c === "string" && CLE_AVIS.test(c)).slice(0, SF_MAX);
      return json({ avis: Object.fromEntries((await avisDuJour(env, cles, "rangees")).avis) }, 0);
    }
    if (path === "/tendances/tri" && request.method === "POST") {
      if (!same(request.headers.get("x-tri") || "", await triCle(env))) return json({ error: "interdit" }, 0);
      const body = await request.json().catch(() => ({}));
      const items = (Array.isArray(body.items) ? body.items : []).slice(0, TRI_LOT)
        .filter((it) => it && Number.isInteger(it.id) && it.id > 0 && /^\d{4}-\d{2}-\d{2}$/.test(it.release_date || ""))
        .map((it) => ({ id: it.id, release_date: it.release_date, original_language: /^[a-z]{2,3}$/.test(it.original_language || "") ? it.original_language : "" }));
      return json(await trierIci(env, items, parisToday()), 0);
    }
    // Préparation des « pour qui » d'une page (appel de l'addon à lui-même, voir prefetchProfiles).
    // La clé Gemini (celle du lien de l'utilisateur) arrive avec l'appel, son empreinte en en-tête :
    // un appel venu d'ailleurs ne peut dépenser que le quota d'une clé qu'il possède déjà.
    if (path === "/prefetch/profiles" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const key = typeof body.key === "string" ? body.key : "";
      if (!key || !same(request.headers.get("x-prefetch") || "", await sha(key))) return json({ error: "interdit" }, 0);
      // Le texte de chaque titre vient de TMDB, jamais de la requête (lu seulement s'il manque au cache).
      const items = (Array.isArray(body.items) ? body.items : [])
        .filter((it) => it && Number.isInteger(it.id) && it.id > 0 && it.key === `${String(it.key).startsWith("tv-") ? "tv" : "movie"}-${it.id}`)
        .slice(0, 20)
        .map((it) => {
          const series = it.key.startsWith("tv-");
          return { key: it.key, id: it.id, text: async () => { const d = await tmdb(env, `/${series ? "tv" : "movie"}/${it.id}`); return d && d.id === it.id ? profileText(series, d) : ""; } };
        });
      return json(await aiProfiles({ ...env, GEMINI_API_KEY: key }, items), 0);
    }
    // IA : clé du lien de l'utilisateur (les /debug au-dessus gardent celle de l'instance).
    env = aiEnv(env, cfg);
    // Une tuile de collection ouverte dans l'aperçu du site : /dossier/<collection>/<tuile>/<n° de source>.json?page=1
    // (mêmes filtres que le collections.json de ce lien : pays, genres exclus, note…).
    const dm = path.match(/^\/dossier\/([\w-]{1,60})\/([\w-]{1,60})\/(\d{1,2})\.json$/);
    if (dm) {
      const page = Math.min(Math.max(parseInt(url.searchParams.get("page"), 10) || 1, 1), 20);
      const col = (await collections(cfg)).find((c) => c.id === dm[1]);
      const folder = col && col.folders.find((f) => f.id === dm[2]);
      const src = folder && (folder.sources || [])[Number(dm[3])];
      if (src && src.provider === "addon") {
        // Rangée de l'addon (collections facultatives : lauréats, durée, mini-séries) : la même que Nuvio lira.
        const metas = await catalogPage(env, ctx, src.type, src.catalogId, { skip: (page - 1) * PAGE, ...(src.genre ? { genre: src.genre } : {}) }, today, cfg, null, "");
        return json({ metas, hasMore: metas.length === PAGE }, 6 * 3600);
      }
      if (!src || src.provider !== "tmdb") return json({ metas: [], hasMore: false, error: "introuvable" }, 600);
      return json(await dossierSource(env, src, langOf(cfg), page), 6 * 3600);
    }
    const tm = path.match(/^\/trailer\/(movie|series)\/([^/]+)\.json$/);
    if (tm) return json(decode(tm[2]) === null ? { key: null } : await trailer(env, tm[1], decode(tm[2])), 7 * 86400);

    const mm = path.match(/^\/meta\/(movie|series)\/([^/]+)\.json$/);
    // Fiche « Version X disponible » de la rangée « Mise à jour » (lien de l'hébergeur d'une copie).
    if (mm && /^maj(:|%3A)/i.test(mm[2])) {
      const info = (await hasAlerts(env, url, cfg)) ? await updateInfo(VERSION) : null;
      return new Response(JSON.stringify({ meta: info ? updateCard(info, env, url.origin) : null }), { headers: { ...HEADERS, "Cache-Control": "no-store" } });
    }
    if (mm && mm[2] === SEANCE_ID) return json({ meta: carteSeance(url.origin, mm[1]) }, 3600);   // carte du mot de passe de la séance
    if (mm && decode(mm[2]) === null) return json({ meta: null }, 600);
    if (mm) {
      const fullKey = `https://cache.local/c${CACHE_V}/${today}/meta/${mm[1]}/${mm[2]}?l=${langOf(cfg)}&g=${cfg.g}&ai=${env.GEMINI_API_KEY ? 1 : 0}`;
      // ?leger=1 : l'aperçu du site au survol. La fiche complète si elle est déjà prête, sinon une fiche sans IA.
      const leger = url.searchParams.get("leger") === "1";
      const metaKey = new Request(leger ? `${fullKey}&leger=1` : fullKey);
      const hitMeta = (leger && await caches.default.match(new Request(fullKey))) || await caches.default.match(metaKey);
      if (hitMeta) return new Response(hitMeta.body, { headers: { ...HEADERS, "Cache-Control": `public, max-age=${CACHE_META_CLIENT_S}` } });
      let found = null;
      try { found = await meta(env, mm[1], decode(mm[2]), cfg, today, ctx, { leger }); } catch (e) { return json({ meta: null, error: String(e) }, 60); }
      if (!found) return json({ meta: null }, 600);
      // Rappel encore en préparation : fiche pas gardée, pour l'avoir à la prochaine ouverture.
      const { _partial, ...metaOut } = found;
      if (_partial) return json({ meta: metaOut }, 60);
      ctx.waitUntil(caches.default.put(metaKey, json({ meta: metaOut }, CACHE_META_S)));
      return json({ meta: metaOut }, CACHE_META_CLIENT_S);
    }

    const m = path.match(/^\/catalog\/(movie|series)\/([^/]+?)(?:\/(.+))?\.json$/);
    if (!m) return json({ error: "introuvable" }, 60);
    const [, type, rawId, extraSeg] = m;
    const id = decode(rawId);
    if (id === null) return json({ metas: [] }, 600);
    // Rangée « Mise à jour » : jamais en cache (« Plus tard » doit la vider tout de suite).
    if (type === "movie" && id === "mise-a-jour") {
      const info = (await hasAlerts(env, url, cfg)) ? await pendingUpdate(env, VERSION) : null;
      return new Response(JSON.stringify({ metas: info ? [updateCard(info, env, url.origin)] : [] }), { headers: { ...HEADERS, "Cache-Control": "no-store" } });
    }

    // Cache de la réponse complète (une page de catalogue) pendant quelques heures.
    // La clé ne dépend que de ce qui change le contenu (pas du nom ni de l'ordre choisis).
    // Une recherche faite sans clé Gemini (sans IA) n'est pas resservie à qui en a une, et inversement.
    const extra = parseExtra(extraSeg);
    // « séance 4821 » tapé dans la recherche : la carte du guide, jamais en cache (voir seance.js).
    if (extra.search && SEARCH.some((c) => c.id === id && c.type === type)) {
      const seance = await rechercheSeance(request, env, type, extra.search);
      if (seance) return seance;
    }
    const aiTag = extra.search ? `&ai=${env.GEMINI_API_KEY ? 1 : 0}` : "";
    // La clé change aussi avec la photo des tendances (4 h UTC) : les rangées suivent les « N° » du jour.
    // Une recherche, elle, suit la version de l'addon : une mise en ligne qui corrige la recherche se voit tout de suite
    // (peu d'appels à refaire : TMDB reste en cache par adresse, Gemini dans le sien). Et Nuvio ne la garde qu'une
    // minute (Nuvio TV : cache disque OkHttp, qui suit max-age) : « bleach » y restait 5 min l'ancienne réponse.
    const cacheKey = new Request(`https://cache.local/${extra.search ? `s${VERSION}` : `c${CACHE_V}`}/${today}${path}?k=${await sha(contentKey(cfg))}${aiTag}&t=${jourTendances()}`);
    const hit = await caches.default.match(cacheKey);
    const clientCc = extra.search ? `public, max-age=${CACHE_CLIENT_SEARCH_S}`
      : fixedId ? `public, max-age=${CACHE_CLIENT_FIXE_S}` : `public, max-age=${CACHE_CLIENT_LONG_S}, stale-while-revalidate=${CACHE_CLIENT_LONG_S}`;
    // Page gardée incomplète (X-Partiel) : Nuvio ne la garde qu'une minute.
    if (hit) {
      const partiel = hit.headers.get("X-Partiel") ? { "X-Partiel": "1" } : {};
      return new Response(hit.body, { headers: { ...HEADERS, ...partiel, "Cache-Control": partiel["X-Partiel"] ? "public, max-age=60" : clientCc } });
    }

    let metas = [];
    try {
      metas = await catalog(env, ctx, type, id, extra, today, cfg, cfgSeg ? `/${cfgSeg}` : "");
    } catch (e) {
      return json({ metas: [], error: String(e) }, 60);
    }
    // Copie gardée côté Cloudflare quelques heures ; Nuvio, lui, ne garde la réponse que 30 minutes ou 1 heure
    // (son cache disque respecte max-age, voir CACHE_CLIENT_LONG_S), pour voir vite les changements.
    // Page incomplète (TMDB a refusé des fiches) : gardée 5 minutes, pas 3 heures, pour vite retrouver la page entière.
    if (metas.length && !metas.partial) {
      const garde = json({ metas }, metas.degrade ? CACHE_DEGRADE_S : CACHE_CATALOG_S);
      if (metas.degrade) garde.headers.set("X-Partiel", "1");
      ctx.waitUntil(caches.default.put(cacheKey, garde));
    }
    const out = json({ metas }, metas.partial ? 0 : 60);
    if (!metas.partial && !metas.degrade) out.headers.set("Cache-Control", clientCc);
    if (metas.degrade) out.headers.set("X-Partiel", "1");   // lu aussi par moitieParSelf
    return out;
  },
};
