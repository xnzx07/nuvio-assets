/**
 * /{type}/{shape}/{id}.jpg?imdb=… (réécrit vers /api/affiche par vercel.json) : l'affiche maison d'un titre.
 * TMDB injoignable : erreur 502, et Nuvio montre l'affiche d'origine ; dessin impossible (logo cassé…) : redirection
 * vers l'affiche d'origine chez TMDB, gardée une heure.
 * Caches : Nuvio garde l'image une semaine (puis revérifie l'ETag) ; le CDN de Vercel aussi, et la redessine en
 * arrière-plan ensuite, ce qui tient dans les limites de l'offre gratuite.
 * Vitesse : les images sont téléchargées pendant qu'on lit les notes et la qualité, et on n'attend pas
 * Torrentio plus d'1 s ; sans réponse, l'affiche part sans badge, avec un cache court pour l'avoir ensuite. De même
 * sans le fichier des notes IMDb (pas attendu plus d'1,5 s), sans photo des tendances, ou si une image sans texte n'a
 * pas pu être vérifiée : une donnée qui manque pour une panne passagère n'est jamais gardée des jours.
 */
import { titleFacts } from "../lib/tmdb.js";
import { lireNoteImdb } from "../lib/notes.js";
import { lireRang, secondesAvantBascule, ADDON_URL } from "../lib/tendances.js";
import { qualityOf, avisDuJour, qualiteDeQ } from "../lib/qualite.js";
import { posterContent, contentKey } from "../lib/contenu.js";
import { etatSortie, sourcesUtiles, dispoChezSoi, estimationDe, besoinEstimation, LIBELLES_FIN } from "../lib/statut.js";
import { lireEstimations } from "../lib/estimations.js";
import { lireReglages, lireReglagesPaysage, ecrireReglages } from "../lib/lien-affiches.js";
import { notesPlus } from "../lib/notes-plus.js";
import { noteMal } from "../lib/mal.js";
import { filmsDeLaSaga, rangSaga } from "../lib/saga.js";
import { lireSaison, habillageDe, saisonDu, secondesAvantChangementSaison } from "../lib/saison.js";
import { draw, imageUrls } from "../lib/dessin.js";
import { choisirSansTexte } from "../lib/texte.js";
import { jourParis, secondesAvantMinuitParis, secondesAvantJourParis } from "../lib/jour.js";
import { disjoncteurDe } from "../lib/disjoncteur.js";
import { creerBudget } from "../lib/budget.js";
import { creerReserve } from "../lib/reserve.js";

// CDN : 7 jours, comme l'appli, puis redessinée en arrière-plan (limite de calcul gratuite : 4 h par mois). Une
// affiche sans statut ni N° ne change qu'avec sa note (fichier IMDb de la semaine) ou son badge 4K : quelques jours
// de retard au plus, pour deux fois moins de dessins qu'avec 3 jours. Le service en panne (erreur 5xx) : le CDN
// ressert l'ancienne un jour de plus (stale-if-error).
const OK_CACHE = { "Cache-Control": "public, max-age=604800", "Vercel-CDN-Cache-Control": "max-age=604800, stale-while-revalidate=604800, stale-if-error=86400" };
// Cache court (une donnée en retard) : redessinée 10 min plus tard, l'ancienne servie pendant ce temps.
const COURT = { "Cache-Control": "public, max-age=3600", "Vercel-CDN-Cache-Control": "max-age=600, stale-while-revalidate=3600" };

/**
 * Durées de cache d'une réponse. Une affiche classée ou presque (place sur la photo des tendances), ou avec un
 * statut (une date, « Nouveau »…), expire au changement de photo des tendances, dans l'appli comme au CDN :
 * son N° et sa date restent ceux du jour. minuit : l'affiche du lendemain ne sera pas la même (« DEMAIN » devient
 * « AUJOURD'HUI ») ; elle expire aussi à minuit à Paris. Avant, toute affiche à statut expirait aussi à minuit et
 * était dessinée deux fois par nuit, le plus souvent à l'identique. Une donnée en retard (Torrentio pas encore
 * lu…) : cache court, pour l'avoir ensuite.
 * Au CDN, la première demande après l'expiration reçoit encore l'ancienne pendant qu'on la redessine (une heure au plus).
 * jusqua (secondes, facultatif) : une autre échéance (prochain épisode d'une série avec sa barre d'avancement…).
 */
function cacheDe({ enRetard, place, statut, minuit, jusqua }) {
  const base = enRetard ? COURT : OK_CACHE;
  if (!place && !statut && !jusqua) return base;
  const s = Math.min(...(place || statut ? [statut && minuit ? Math.min(secondesAvantBascule(), secondesAvantMinuitParis()) : secondesAvantBascule()] : []), ...(jusqua ? [jusqua] : []));
  const age = (h) => Number(/max-age=(\d+)/.exec(base[h])[1]);
  return { "Cache-Control": `public, max-age=${Math.min(age("Cache-Control"), s)}`,
    "Vercel-CDN-Cache-Control": `max-age=${Math.min(age("Vercel-CDN-Cache-Control"), s)}, stale-while-revalidate=3600${enRetard ? "" : ", stale-if-error=86400"}` };
}
const lendemain = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(Date.parse(iso) + 86400000).toISOString().slice(0, 10) : "");
const ABSENT = { "Cache-Control": "public, max-age=3600", "Vercel-CDN-Cache-Control": "max-age=3600" };
// Redirection vers la forme normale d'un lien : elle ne change qu'avec une mise en ligne, qui vide le cache de toute façon.
const CANONIQUE = { "Cache-Control": "public, max-age=604800", "Vercel-CDN-Cache-Control": "max-age=604800" };
// Trop de dessins (lib/disjoncteur.js) ou dessin impossible (logo cassé, SVG illisible) : une erreur passagère, jamais
// une redirection vers l'affiche d'origine. Nuvio garde une image redirigée sous l'adresse de l'affiche, avec les
// en-têtes de TMDB (un an) : les affiches paysage étaient restées nues après un disjoncteur. Sur une erreur, il montre
// l'affiche d'origine sans la garder et redemande la nôtre plus tard. Retry-After : dans 10 minutes, dans une heure.
const SURCHARGE = { "Retry-After": "600" };
const SECOURS = { "Retry-After": "3600" };
const CORS = { "Access-Control-Allow-Origin": "*" };
const ATTENTE_QUALITE_MS = 1000;
// Aperçu de la régie (en-tête X-Apercu, envoyé par le relais /affiche de l'addon) : on peut attendre Torrentio plus
// longtemps qu'une carte de Nuvio. Sinon chaque case cochée (une adresse nouvelle) risquait de partir sans son badge
// 4K, et la régie semblait ajouter ou retirer des badges au hasard. L'en-tête ne change pas l'adresse : l'affiche
// complète est gardée au CDN pour tout le monde.
const ATTENTE_APERCU_MS = 4000;
// Fichier des notes IMDb pas encore lu (instance qui démarre) : pas attendu plus longtemps (il peut prendre 8 s).
const ATTENTE_NOTES_MS = 1500;
// Table des fenêtres des distributeurs (lib/estimations.js) pas encore lue : pas attendue plus longtemps non plus.
const ATTENTE_ESTIMATIONS_MS = 1500;

const absent = () => new Response(null, { status: 404, headers: { ...CORS, ...ABSENT } });
const panne = () => new Response(null, { status: 502, headers: { ...CORS, "Cache-Control": "no-store" } });
/**
 * La qualité lue chez Torrentio, corrigée par l'avis VF de l'addon quand il a examiné le titre (photo du jour :
 * StreamFusion, qui lit les sites français, sinon Torrentio) : la VF et la langue suivent cet avis. 4K, DV, HDR,
 * HDR10+, 1080p et Atmos : ceux des sources VF de StreamFusion s'il en a (« 4K DV » = en VF), sinon Torrentio.
 * Sans avis : telle quelle.
 */
function avecAvisVf(q, avis, qualiteVf = null) {
  if (typeof avis !== "boolean") return q;
  const base = { ...(q || { uhd: false, extra: null, fhd: false, hdr10p: false, atmos: false, sources: 0, langue: null }), ...(qualiteVf || {}) };
  const enVf = base.langue === "vf" || base.langue === "multi";
  const langue = avis ? (enVf ? base.langue : "vf") : (enVf ? "vo" : base.langue);
  return { ...base, vf: avis, sources: Math.max(1, base.sources || 0), langue };
}

/**
 * Un travail qui peut finir après la réponse (ranger le dessin dans la réserve, envoyer le compteur de calcul) : confié
 * à Vercel (waitUntil, le même contexte que lit le paquet @vercel/functions), l'affiche part sans l'attendre (50 à
 * 150 ms de gagnés, 1,5 s si l'addon traîne). Hors de Vercel (essais en local, tests) : rendu tel quel, on l'attend
 * comme avant. Pas de paquet : package.json entre dans l'empreinte de la réserve (lib/reserve.js), le changer ferait
 * tout redessiner.
 */
function apresLaReponse(travail) {
  const contexte = globalThis[Symbol.for("@vercel/request-context")]?.get?.();
  if (typeof contexte?.waitUntil !== "function") return travail;
  contexte.waitUntil(travail);
  return undefined;
}

/**
 * Durée de chaque étape d'une affiche, pour l'en-tête Server-Timing (« tmdb;dur=120, qualite;dur=640, …, total;dur=980 ») :
 * de quoi voir en ligne ce qui fait attendre une affiche hors cache. mesure() rend la même promesse (ou la valeur telle
 * quelle si ce n'en est pas une) ; une étape qui échoue est mesurée aussi.
 */
function chronometre() {
  const t0 = performance.now(), etapes = [];
  return {
    mesure(nom, travail) {
      if (!travail || typeof travail.then !== "function") return travail;
      const debut = performance.now();
      return travail.finally(() => etapes.push(`${nom};dur=${Math.round(performance.now() - debut)}`));
    },
    entete: () => [...etapes, `total;dur=${Math.round(performance.now() - t0)}`].join(", "),
  };
}

/** Pas d'affiche pour l'instant (503, jamais gardée) : l'appli montre celle d'origine. */
const indisponible = (attente) => new Response(null, { status: 503, headers: { ...CORS, ...attente, "Cache-Control": "no-store" } });

/** fetch qui ne télécharge qu'une fois chaque image TMDB : une demande faite en avance resservira à draw(). */
function fetchImages(fetchImpl) {
  const vues = new Map();
  return (url, opts) => {
    const u = String(url);
    if (!u.startsWith("https://image.tmdb.org/")) return fetchImpl(url, opts);
    if (!vues.has(u)) {
      vues.set(u, fetchImpl(u, { signal: AbortSignal.timeout(3000) })
        .then(async (r) => ({ status: r.status, type: r.headers.get("Content-Type"), corps: r.ok ? await r.arrayBuffer() : null })));
    }
    return vues.get(u).then((x) => new Response(x.corps, { status: x.status, headers: x.type ? { "Content-Type": x.type } : {} }));
  };
}

/**
 * La qualité, ou null si Torrentio n'a pas répondu à temps ou a échoué. En retard (la lecture continue : elle sera
 * gardée par le relais et l'instance) : cache court, pour avoir le badge ensuite. En échec (Torrentio en panne, le
 * relais le garde 30 min) : cache normal sans badge, sinon chaque affiche serait redessinée toutes les 10 minutes
 * pendant toute la panne.
 */
function qualiteATemps(type, facts, fetchImpl, relais, cle, attente = ATTENTE_QUALITE_MS, avecStreamFusion = true) {
  let timer;
  const delai = new Promise((ok) => { timer = setTimeout(() => ok({ enRetard: true, quality: null }), attente); });
  // Titre récent (film de moins d'un an déjà sorti, nouvelle série) : la VF vient aussi de StreamFusion.
  const jour = jourParis(), ilYaUnAn = new Date(Date.parse(jour) - 365 * 86400000).toISOString().slice(0, 10);
  const sf = avecStreamFusion && (type === "series" ? !!facts.firstAir && facts.firstAir <= jour && facts.firstAir >= ilYaUnAn : sourcesUtiles(facts, jour));
  const lue = qualityOf(type, facts.imdbId, facts.lastSeason, fetchImpl, relais, cle, sf).then((quality) => ({ enRetard: false, quality }));
  return Promise.race([lue, delai])
    .finally(() => clearTimeout(timer));
}

/**
 * Forme normale des options d'un lien, dans l'ordre imdb, s, sp : imdb seulement s'il est valable (celui de
 * l'id pour un « tt… »), s dans sa forme canonique (lib/lien-affiches.js), absent si tout est par défaut ; sp
 * (réglages à part du paysage) seulement s'il diffère de s. Un imdb vide (Nuvio l'envoie ainsi quand il n'en a
 * pas) reste tel quel. Les anciens o et r sont convertis.
 */
function optionsNormales(q, id) {
  const p = new URLSearchParams();
  const imdb = q.get("imdb");
  if (imdb !== null) {
    if (imdb === "") p.set("imdb", "");
    else if (id.startsWith("tt")) p.set("imdb", id);
    else if (/^tt\d{1,10}$/.test(imdb)) p.set("imdb", imdb);
  }
  const s = ecrireReglages(lireReglages(q)), sp = ecrireReglages(lireReglagesPaysage(q));
  if (s) p.set("s", "1." + s);
  if (sp !== s) p.set("sp", "1." + sp);
  return String(p);
}

export function makeHandler({ fetchImpl = fetch, env = process.env } = {}) {
  const disjoncteur = disjoncteurDe(env);
  const budget = creerBudget({ env, fetchImpl }), reserve = creerReserve({ env, fetchImpl });
  let dernierAvis = 0, dernierAvisBudget = 0, dessins = 0;
  // Le CPU de l'instance part chez l'addon (une fois par minute au plus) pendant qu'on répond, et finit après la réponse.
  return async function GET(request) {
    const envoi = budget.noter();
    try { return await repondre(request); } finally { await apresLaReponse(envoi); }
  };
  async function repondre(request) {
    const cpu0 = process.cpuUsage(), chrono = chronometre();
    const q = new URL(request.url).searchParams;
    const type = q.get("type"), shape = q.get("shape"), id = q.get("id") || "";
    const imdb = /^tt\d{1,10}$/.test(q.get("imdb") || "") ? q.get("imdb") : "";
    if (!["movie", "series"].includes(type) || !["poster", "landscape"].includes(shape) || !/^(tt\d{1,10}|tmdb:\d{1,10})$/.test(id)) return absent();
    // Un lien bricolé (paramètre en trop, lettres dans le désordre…) ferait dessiner une copie de plus de la
    // même affiche : on le renvoie, sans rien dessiner, vers sa forme normale (Nuvio suit les redirections).
    const recues = new URLSearchParams([...q].filter(([k]) => !["type", "shape", "id"].includes(k)));
    const reglages = shape === "landscape" ? lireReglagesPaysage(q) : lireReglages(q);
    const normales = optionsNormales(q, id);
    if (String(recues) !== normales) {
      return new Response(null, { status: 308, headers: { ...CORS, ...CANONIQUE, Location: `/${type}/${shape}/${id}.jpg${normales ? "?" + normales : ""}` } });
    }
    // Budget de calcul des 31 jours dépensé, marge comprise (lib/budget.js) : rien à lire ni à dessiner, l'appli
    // montre l'affiche d'origine (le CDN ressert encore un jour celles qu'il a). Avant TMDB : lire la fiche coûte aussi.
    if (budget.arret()) {
      if (Date.now() - dernierAvisBudget > 60000) { dernierAvisBudget = Date.now(); console.warn("budget de calcul dépensé : affiches d'origine pour l'instant"); }
      return indisponible(SURCHARGE);
    }
    const tendance = reglages.tendance.on, qualite = reglages.qualite.on && env.QUALITE !== "off";
    // Langue des sources (réglage Langue) : lue avec la qualité, chez Torrentio.
    const langue = reglages.langue.on && env.QUALITE !== "off";
    // Note IMDb : pour la note affichée, ou pour le badge « Incontournable ».
    const noteImdb = (reglages.titre.on && reglages.note.on && reglages.note.principale && (reglages.note.source !== "tmdb" || reglages.note.deux)) || reglages.infos.culte;
    // Les autres notes ne sont demandées que si elles serviront : dessinées (pas avec la note en grand chiffre), ou dans
    // la moyenne.
    const notesServent = reglages.titre.on && reglages.note.on && (reglages.note.style !== "grand" || reglages.note.moyenne);
    const autresNotes = notesServent && (reglages.note.rt || reglages.note.mc || reglages.note.lb);
    const malVoulue = notesServent && reglages.note.mal;
    try {
      // Notes IMDb et tendances ne dépendent pas du titre : sur une instance qui démarre, on les charge
      // pendant que TMDB répond (elles sont ensuite gardées en mémoire).
      if (noteImdb) lireNoteImdb("tt0", fetchImpl, 0).catch(() => {});
      if (type === "movie") lireEstimations(fetchImpl, 0).catch(() => {});
      const relais = new URL(request.url).origin;
      if (tendance) lireRang(env, type, 0, fetchImpl, relais).catch(() => {});
      let facts = await chrono.mesure("tmdb", titleFacts(env, { type, id, imdb }, fetchImpl, { plateforme: reglages.plateforme.on, vo: reglages.titre.on && reglages.titre.langue === "vo", credits: reglages.titre.on && reglages.infos.ligne2 === "realisateur" }));
      if (!facts) return absent();
      // Film en salle aux États-Unis sans date numérique : son estimation d'après son distributeur américain, la même
      // que celle de l'addon. Table pas lue à temps : la salle + 45 jours, et le cache court pour l'avoir ensuite. Un
      // film en français garde ses propres dates (dispoChezSoi) : la table ne lui sert pas.
      let estimationManque = false;
      if (type === "movie" && facts.originalLanguage !== "fr" && besoinEstimation(facts.releases)) {
        const { table, manque } = await chrono.mesure("estimations", lireEstimations(fetchImpl, ATTENTE_ESTIMATIONS_MS));
        facts = { ...facts, vod: estimationDe(table, facts.imdbId) };
        estimationManque = manque;
      }
      // Trop de dessins sur cette instance (robot, liens au hasard) : rien à analyser ni à dessiner, l'appli montre
      // l'affiche d'origine. Mieux vaut des affiches nues un moment qu'un service coupé 30 jours.
      if (disjoncteur.plein()) {
        if (Date.now() - dernierAvis > 60000) { dernierAvis = Date.now(); console.warn("disjoncteur : trop de dessins, affiches d'origine pour l'instant"); }
        return indisponible(SURCHARGE);
      }
      // Le jour à Paris, le même pour tout le calcul (statut, sources utiles).
      const aujourdhui = jourParis();
      // Les sources (lues avec la qualité) disent si le titre est en VF : lues aussi sans le badge, pour un titre récent.
      const lireSources = qualite || langue || (env.QUALITE !== "off" && sourcesUtiles(facts, aujourdhui));
      // L'avis VF du jour de l'addon (le même que ses rangées et ses fiches), pour un titre récent : seulement sur le
      // serveur des affiches (AVIS_DU_JOUR=on, avec la clé du relais), pas sur Vercel ni la machine GitHub.
      const ilYaUnAn = new Date(Date.parse(aujourdhui) - 365 * 86400000).toISOString().slice(0, 10);
      const recent = env.QUALITE !== "off" && (type === "series" ? !!facts.firstAir && facts.firstAir <= aujourdhui && facts.firstAir >= ilYaUnAn : sourcesUtiles(facts, aujourdhui));
      const videoAvis = env.AVIS_DU_JOUR === "on" && env.RELAIS_KEY && recent && facts.imdbId
        ? (type === "series" ? `series/${facts.imdbId}:${facts.lastSeason || 1}:1` : `movie/${facts.imdbId}`) : null;
      // Pas encore sorti avec la note cachée : les autres notes ne seraient pas dessinées non plus.
      const notesCachees = reglages.sortie.cacherNote && !etatSortie(facts, aujourdhui).sorti;
      const notesUtiles = autresNotes && !notesCachees;
      // Rang dans la saga (réglage Saga) : les films de sa collection TMDB, un appel par saga gardé une semaine.
      const sagaVoulue = reglages.infos.saga && type === "movie" && !!facts.collection;
      // Habillage de la saison (réglage Saison) : pendant une fête, les films de la rangée « Spécial … » de l'addon.
      const saisonVoulue = reglages.saison.on && type === "movie" && !!saisonDu(aujourdhui);
      // Qualité, tendances, notes, saga et saison ne dépendent pas de l'image choisie : lancées tout de suite, elles
      // tournent pendant la vérification des images sans texte (Torrentio peut prendre jusqu'à 1 s). Une réponse
      // possible avant de les attendre (affiche absente) : leur échec ne doit pas rester sans suite.
      // La photo du jour sert aussi sans le réglage Tendance, dès que la VF compte : elle porte l'avis VF de l'addon
      // (StreamFusion).
      const lectures = Promise.all([
        noteImdb && facts.imdbId ? chrono.mesure("imdb", lireNoteImdb(facts.imdbId, fetchImpl, ATTENTE_NOTES_MS)) : { note: undefined, manque: false },
        tendance || lireSources ? chrono.mesure("tendances", lireRang(env, type, facts.tmdbId, fetchImpl, relais).catch(() => ({ rang: null, illisible: true, vf: null, qualite: null }))) : { rang: null, illisible: false, vf: null, qualite: null },
        lireSources ? chrono.mesure("qualite", qualiteATemps(type, facts, fetchImpl, env.QUALITE_RELAIS || relais, env.RELAIS_KEY, request.headers.get("X-Apercu") === "1" ? ATTENTE_APERCU_MS : ATTENTE_QUALITE_MS, env.STREAMFUSION !== "off")) : { enRetard: false, quality: null },
        notesUtiles && facts.imdbId ? chrono.mesure("notes", notesPlus(facts.imdbId, fetchImpl, relais, env.RELAIS_KEY, type)) : undefined,
        sagaVoulue ? chrono.mesure("saga", filmsDeLaSaga(env, facts.collection, fetchImpl)) : null,
        saisonVoulue ? chrono.mesure("saison", lireSaison(env, fetchImpl)) : null,
        malVoulue && !notesCachees ? chrono.mesure("mal", noteMal(env, type, facts.tmdbId, fetchImpl)) : null,
        videoAvis ? chrono.mesure("avis", avisDuJour(env.ADDON_URL || ADDON_URL, videoAvis, env.RELAIS_KEY, fetchImpl)) : null,
      ]);
      lectures.catch(() => {});
      // L'image « sans texte » porte notre logo : on vérifie qu'elle n'a vraiment pas de texte (TMDB y range
      // parfois des affiches étrangères). Aucune de propre : l'affiche normale, sans logo ni ligne du bas.
      // L'image du film recadrée (réglage « Image ») vient des fonds, vérifiés de la même façon.
      // Une candidate pas lue (panne passagère) : le choix peut changer, cache court.
      let imageIncertaine = false;
      if (reglages.titre.on) {
        const fond = shape === "landscape" || reglages.image.source === "fond";
        const [cle, liste] = fond ? ["textlessBackdrop", facts.textlessBackdrops] : ["textlessPoster", facts.textlessPosters];
        const { chemin, incertain } = await chrono.mesure("sans-texte", choisirSansTexte(liste, fetchImpl));
        facts = { ...facts, [cle]: chemin };
        imageIncertaine = incertain;
        // Aucune affiche sans texte propre : le fond sans texte recadré en portrait (lib/contenu.js), vérifié de même.
        if (!fond && !chemin && reglages.image.source !== "officielle") {
          const secours = await chrono.mesure("sans-texte", choisirSansTexte(facts.textlessBackdrops, fetchImpl));
          facts = { ...facts, textlessBackdrop: secours.chemin };
          imageIncertaine = imageIncertaine || secours.incertain;
        }
      }
      // Les images ne dépendent que du titre : on les demande tout de suite (sauf pour une revérification
      // par ETag, qui finit presque toujours en 304 sans rien dessiner).
      const brouillon = posterContent(facts, {}, shape, reglages, aujourdhui);
      if (!brouillon) return absent();
      const images = fetchImages(fetchImpl);
      const peutDessiner = brouillon.full || brouillon.statut || brouillon.gris || brouillon.bandeau || brouillon.coin || tendance || qualite || langue
        || reglages.infos.culte || reglages.infos.saga || !!brouillon.styles.retouche || !!brouillon.styles.cadre || (reglages.saison.on && type === "movie");
      if (peutDessiner && !request.headers.get("If-None-Match")) imageUrls(brouillon).forEach((u) => images(u).catch(() => {}));
      const [{ note: imdbRating, manque: imdbManque }, photoLue, { enRetard: qualiteEnRetard, quality: qualiteTorrentio }, notesLues, filmsSaga, rangee, mal, avisJour] = await chrono.mesure("lectures", lectures);
      const notes = mal ? { ...(notesLues || {}), mal } : notesLues;
      const place = tendance ? photoLue.rang : null, photoIllisible = tendance && photoLue.illisible;
      // L'avis du jour prime sur celui de la photo de 4 h (The Dog Stars : sans VF à 4 h, en VF dans la journée).
      // Sans VF, pas de qualité : celle de Torrentio est celle d'un fichier en VFQ ou en VO (By Any Means, « 4K DV »).
      const SANS_QUALITE = { uhd: false, extra: null, fhd: false, hdr10p: false, atmos: false };
      const quality = avisJour ? avecAvisVf(qualiteTorrentio, avisJour.vf, avisJour.vf ? qualiteDeQ(avisJour.qualite) : SANS_QUALITE)
        : avecAvisVf(qualiteTorrentio, photoLue.vf, photoLue.qualite);
      // Récent sans VF d'après l'avis du jour : « revoir », le serveur la redessine quelques heures plus tard.
      const aRevoir = !!avisJour && avisJour.vf === false;
      const saga = sagaVoulue ? rangSaga(filmsSaga, facts.tmdbId, aujourdhui) : null;
      // Une donnée qui manque pour une panne passagère (fichier IMDb pas lu : note TMDB en attendant ; photo des
      // tendances illisible : pas de N° ; image sans texte pas vérifiée) : cache court, pour l'avoir ensuite.
      // Notes des autres sites demandées mais pas lues (quota, panne) : cache normal sans elles (le relais garde
      // l'échec une heure ; un cache court ferait redessiner sans fin pendant toute la panne).
      // Saga ou rangée de saison demandées mais pas lues (TMDB ou l'addon en panne) : cache court aussi.
      const enRetard = qualiteEnRetard || imdbManque || photoIllisible || imageIncertaine || (sagaVoulue && !filmsSaga) || (saisonVoulue && !rangee)
        || estimationManque;
      const saison = saisonVoulue ? habillageDe(rangee, facts.tmdbId, aujourdhui) : null;
      const content = posterContent(facts, { imdbRating, rank: place, quality, notes, saga, saison }, shape, reglages, aujourdhui);
      // Réglage Saison, sur un film : jusqu'au prochain changement de fête (minuit à Paris), habillé ou pas, redirection
      // comprise : habillé dès qu'elle commence, plus du tout quand elle finit. Pas chaque jour (limite de calcul) : un
      // film sorti de la rangée en cours de fête garde son habillage une semaine au plus.
      const finSaison = reglages.saison.on && type === "movie" ? secondesAvantChangementSaison() : undefined;
      // Rien à poser ni à griser : l'appli va chercher l'image directement chez TMDB, sans la redessiner ici.
      const retouchee = !!(content.styles.retouche || content.styles.cadre);
      if (!content.full && !content.rank && !content.quality && !content.statut && !content.gris && !content.bandeau && !content.coin && !content.culte && !retouchee
        && !content.langue && !content.avance && !content.saga && !content.saison) {
        return new Response(null, { status: 302, headers: { ...CORS, ...cacheDe({ enRetard, place, jusqua: finSaison }), "Server-Timing": chrono.entete(), Location: imageUrls(content)[0] } });
      }
      const cle = contentKey(content), etag = `"${cle}"`;
      // Classée, presque classée ou avec un statut : jusqu'au changement de photo des tendances (voir cacheDe).
      // Un bandeau qui porte le statut (une date) suit la même règle que le statut.
      // « Nouvel épisode » allumé sur une série : revérifiée chaque jour aussi, pour l'afficher le jour même.
      // « TERMINÉE », « ANNULÉE » ne changent pas avec le jour : pas revérifiées chaque jour pour elles.
      const fixe = (x) => LIBELLES_FIN.includes(x);
      const suitLeCalendrier = (content.statut && !fixe(content.statut)) || (content.bandeau && reglages.bandeau.porte === "statut" && !fixe(content.bandeau.texte))
        || (type === "series" && reglages.statut.on && reglages.statut.episode);
      // Barre d'avancement d'une série : jusqu'au lendemain de son prochain épisode (date connue de TMDB).
      const avance = content.avance && facts.nextEpisode ? secondesAvantJourParis(lendemain(facts.nextEpisode)) : undefined;
      const jusqua = avance && finSaison ? Math.min(avance, finSaison) : avance || finSaison;
      // L'affiche de demain, avec les mêmes données : seule la date change. Différente : elle expire à minuit.
      const minuit = !!suitLeCalendrier && contentKey(posterContent(facts, { imdbRating, rank: place, quality, notes, saga, saison }, shape, reglages, lendemain(aujourdhui))) !== contentKey(content);
      const cache = cacheDe({ enRetard, place, statut: suitLeCalendrier, minuit, jusqua });
      // X-Affiche-Etat : « retard » quand une donnée manquait (badge qualité en route…) ; la régie redemande alors
      // l'affiche un peu plus tard, et le relais de l'addon ne la garde pas.
      // X-Affiche-Sortie : de quoi comprendre une affiche grise ou un statut (« pas sorti » vient des dates, des sources
      // ou des plateformes françaises que TMDB connaît au moment du dessin). Rien de privé.
      const sortieVue = etatSortie(facts, aujourdhui, quality ? { vf: quality.vf, sources: quality.sources } : null);
      // dispo : le jour d'arrivée chez soi d'un film (calendrier américain, lib/statut.js), « ~ » si estimé.
      const chezSoi = type === "movie" ? dispoChezSoi(facts.releases, facts.originalLanguage, facts.vod) : null;
      const pourquoi = `${sortieVue.sorti ? "sorti" : "pas-sorti"} statut=${sortieVue.statut || "-"} vf=${quality ? quality.vf : "?"} sources=${quality ? quality.sources : "?"}`
        + (chezSoi ? ` dispo=${chezSoi.date ? chezSoi.date + (chezSoi.vers ? "~" : "") : "-"}` : "")
        + ` plateforme-fr=${facts.plateformeFrance ? 1 : 0} tmdb-fr=${facts.plateformesVues || "-"} premiere=${facts.firstAir || facts.releaseDate || "-"} jour=${aujourdhui}`;
      const headers = { ...CORS, "Access-Control-Expose-Headers": "X-Affiche-Etat, X-Affiche-Sortie, Server-Timing", "X-Affiche-Etat": enRetard ? "retard" : aRevoir ? "revoir" : "complete",
        "X-Affiche-Sortie": pourquoi, ...cache, ETag: etag };
      if (request.headers.get("If-None-Match") === etag) return new Response(null, { status: 304, headers: { ...headers, "Server-Timing": chrono.entete() } });
      // Une ligne par affiche dans les journaux de Vercel : relue ou dessinée, et ce qui fait dessiner (options, durée
      // au CDN, donnée en retard : q qualité, i note IMDb, t tendances, x image sans texte, s saga ou saison, e estimation).
      const retard = [[qualiteEnRetard, "q"], [imdbManque, "i"], [photoIllisible, "t"], [imageIncertaine, "x"],
        [(sagaVoulue && !filmsSaga) || (saisonVoulue && !rangee), "s"], [estimationManque, "e"]].filter(([v]) => v).map(([, c]) => c).join("");
      const ligne = `${type}/${shape}/${id}${normales ? "?" + normales : ""} cdn=${/max-age=(\d+)/.exec(cache["Vercel-CDN-Cache-Control"])[1]}${retard ? " retard=" + retard : ""}`;
      // Déjà dessinée à l'identique (la veille, avant une mise en ligne…) : relue dans la réserve de l'addon.
      const gardee = await chrono.mesure("reserve", reserve.lire(cle));
      if (gardee) {
        console.log(`reserve ${ligne}`);
        return new Response(gardee, { status: 200, headers: { ...headers, "X-Affiche-Reserve": "lue", "Server-Timing": chrono.entete(), "Content-Type": "image/jpeg" } });
      }
      // Budget du mois dépensé (lib/budget.js) : plus de dessin, seulement la réserve.
      if (budget.epuise()) {
        if (Date.now() - dernierAvisBudget > 60000) { dernierAvisBudget = Date.now(); console.warn("budget de calcul dépensé : plus de dessin, seulement la réserve"); }
        return indisponible(SURCHARGE);
      }
      console.log(`dessin ${ligne}`);
      let jpg;
      disjoncteur.compte();
      try {
        jpg = await chrono.mesure("dessin", draw(content, images));
      } catch (e) {
        // Dessin impossible (logo introuvable ou illisible, SVG cassé…) : l'appli montre l'affiche d'origine, qui
        // porte le titre.
        console.error(`dessin ${type}/${shape}/${id} : ${e && e.message}`);
        return indisponible(SECOURS);
      }
      // X-Affiche-Cpu : temps de calcul (limite Hobby : 4 h de CPU actif par mois). « requete » compte aussi les
      // demandes servies en même temps par l'instance ; « instance / dessins » donne le coût moyen d'un dessin.
      dessins++;
      const ms = (c) => Math.round((c.user + c.system) / 1000);
      const cpu = `requete=${ms(process.cpuUsage(cpu0))} instance=${ms(process.cpuUsage())} dessins=${dessins} depuis=${Math.round(process.uptime())} budget=${budget.minutes}`;
      await apresLaReponse(reserve.garder(cle, jpg));
      return new Response(jpg, { status: 200, headers: { ...headers, "X-Affiche-Cpu": cpu, "Server-Timing": chrono.entete(), "Content-Type": "image/jpeg" } });
    } catch (e) {
      console.error(`affiche ${type}/${shape}/${id} : ${e && e.message}`);
      return panne();
    }
  }
}

export const GET = makeHandler();
