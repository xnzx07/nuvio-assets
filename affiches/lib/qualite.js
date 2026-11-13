/**
 * Qualité d'un titre (4K, puis DV ou HDR), lue dans les noms des flux de Torrentio, comme le fait
 * un addon de sources. Seulement la 4K : en dessous, pas de badge. Un échec ou un délai dépassé
 * donne null, et l'affiche part sans badge plutôt qu'avec un badge faux.
 * Sur Vercel, elle passe par le relais /qualite/… du service, gardé un jour par le cache de Vercel :
 * ce qu'une instance a lu sert à toutes les autres (même badge partout, donc même ETag).
 */
import { enteteRelais } from "./relais.js";
import { tmdbGet, abonnementVf } from "./tmdb.js";

export const TORRENTIO = "https://torrentio.strem.fun";
const DELAI_MS = 2500;
// Un jour : la VF lue dans les sources (statut des affiches) arrive vite après la sortie.
const GARDE_MS = 86400 * 1000, GARDE_ECHEC_MS = 3600 * 1000;
// assez grande pour tout le stock (~10 000 titres) : rien n'est recalculé chaque nuit faute de place
export const MAX_MEMO = Number(process.env.MEMO_MAX) || 60000;

let memo = new Map();
// Secours quand le relais ne répond pas (serveur des affiches : la qualité lue par la machine GitHub, chaque nuit, dans
// la base) : video → qualité ou null. Posé par serveur.js ; sans lui, rien.
let secours = null;
export const definirSecours = (f) => { secours = f; };   // "movie/tt…" ou "series/tt…:saison:1" → { promesse, until }
export function resetMemo() { memo = new Map(); avisMemo = new Map(); }
export const tailleMemo = () => memo.size;

const UHD = /\b(2160p|4k|uhd)\b/i;
const DV = /\b(dv|dovi|dolby ?vision)\b/i;
const HDR = /\bhdr(10\+?)?(?=\W|$)/i;
const HDR10P = /\bhdr10(\+|plus)(?=\W|$)/i;
const FHD = /\b1080p\b/i;
const ATMOS = /\batmos\b/i;
// VF dans le nom d'un flux : TRUEFRENCH, FRENCH, VFF…, ou « Multi Audio » avec le drapeau français. Les drapeaux
// seuls ne comptent pas : une sortie WEB-DL en affiche quinze, surtout pour ses sous-titres.
// Seule la VF de France compte (choix de la personne) : un flux québécois (VFQ, QUÉBEC) n'est pas de la VF, sauf s'il
// porte aussi une VF de France (MULTi.VFF.VFQ, TRUEFRENCH). Comme StreamFusion, réglé pour écarter la VFQ.
const VF = /\b(TRUEFRENCH|FRENCH|VFF|VFI|VF2|VOF)\b|\bMULTI\b.*\bVF\b|Multi Audio.*🇫🇷/i;
// « FRENCH.CA », « MULTi.CA » : la version du Canada, une VFQ aussi.
const VFQ = /\b(VFQ|QU[EÉ]BEC|QU[EÉ]B[EÉ]COIS)\b|\b(FRENCH|MULTI)[ ._-]CA\b/i;
const VF_FRANCE = /\b(TRUEFRENCH|VFF|VFI|VF2)\b/i;
// Plus aucun groupe cru sur parole pour un « FRENCH » seul (2026-11-07) : SUPPLY, qui écrit d'habitude « CA » pour la
// VFQ, a sorti Leviticus en « MULTi.FRENCH » avec une piste fr-CA (VFQ, vue dans le lecteur). Seuls TRUEFRENCH, VFF,
// VFI, VF2 prouvent une VF de France.
const vffSure = (t) => VF_FRANCE.test(t);
// Doublage fait par une IA (« MULTi.AI ») : pas une VF.
const IA = /\bMULTI[ ._-]?AI\b/i;
const enVf = (t) => VF.test(t) && !IA.test(t) && !(VFQ.test(t) && !VF_FRANCE.test(t));
// Langue (badge « Langue » des affiches) : un flux VF qui porte aussi MULTI (ou « Multi Audio ») a la VF et la VO ;
// sans VF, des sous-titres français (VOSTFR, SUBFRENCH) ; sinon de la VO seulement.
const MULTI = /\bMULTI\b|Multi Audio/i;
const VOSTFR = /\b(VOSTFR|SUBFRENCH)\b/i;
// Filmé dans une salle de cinéma (CAM, TS, TC) : ce n'est pas une sortie, le film n'est pas dispo pour autant (Tombé du
// ciel, au cinéma : quatre « FRENCH CAM » chez Torrentio, la fiche disait « Déjà dispo »). Ces flux ne comptent pour
// rien : ni VF, ni langue, ni qualité. La qualité que Torrentio met dans le nom (« Torrentio CAM », « TeleSync »), ou le
// mot après l'année dans le nom du fichier (pas avant : le film « Cam » de 2018 en sortie WEB reste un vrai flux).
const SALLE_NOM = /\b(CAM|TeleSync|TeleCine)\b/i;
const SALLE_FICHIER = /\b(19|20)\d{2}\b.*\b(HD-?CAM|CAM-?RIP|CAM|HD-?TS|TELESYNC|TS|HD-?TC|TELECINE|TC)\b/i;
export const filmeEnSalle = (s) => SALLE_NOM.test(s.name || "") || SALLE_FICHIER.test(`${s.title || ""} ${s.description || ""}`);

/** La meilleure langue des flux pour un Français : "multi", "vf", "vostfr", "vo", ou null sans aucun flux. */
function langueDe(tous) {
  if (!tous.length) return null;
  const vf = tous.filter(enVf);
  if (vf.some((t) => MULTI.test(t))) return "multi";
  if (vf.length) return "vf";
  return tous.some((t) => VOSTFR.test(t)) ? "vostfr" : "vo";
}

/** La qualité de flux en abrégé, comme l'avis VF de l'addon : { u: 4K, x: « DV » ou « HDR », p: HDR10+, f: 1080p, a: Atmos }. */
function qualiteCourte(textes) {
  const uhd = textes.filter((t) => UHD.test(t));
  return { u: uhd.length ? 1 : 0, x: uhd.some((t) => DV.test(t)) ? "DV" : uhd.some((t) => HDR.test(t)) ? "HDR" : null,
    p: uhd.some((t) => HDR10P.test(t)) ? 1 : 0, f: textes.some((t) => FHD.test(t)) ? 1 : 0, a: textes.some((t) => ATMOS.test(t)) ? 1 : 0 };
}

/**
 * { uhd, extra, fhd, hdr10p, atmos, vf, sources, langue } d'après une liste de flux Stremio ({ name, title }). DV, HDR
 * et HDR10+ comptent seulement en 4K ; fhd = un flux 1080p ; atmos = un flux Dolby Atmos, en toute résolution ;
 * langue : la meilleure (langueDe), « multi » ou « vf » exactement quand vf est vrai.
 * Et vff, vfq quand la VF est sûre (un fichier TRUEFRENCH, VFF, VFI, VF2) : vfq = la qualité des seules sources VF.
 * L'addon ne demande alors pas l'avis de Lumio ni de StreamFusion (le compte AllDebrid de la personne).
 * Et vfqDoute quand une VFQ est en vue sans rien de sûr pour la France : les autres flux « FRENCH », « MULTI » sont
 * peut-être la même VFQ renommée (Torrent9), et Lumio ou StreamFusion la prendraient pour de la VF même sans eux
 * (L'Invitation, en « MULTi.CA » seulement). Les dates de sortie le disent (avecDatesVff).
 */
export function parseQuality(streams) {
  const tous = (streams || []).filter((s) => !filmeEnSalle(s)).map((s) => `${s.name || ""} ${s.title || ""}`);
  const uhd = tous.filter((t) => UHD.test(t));
  const extra = uhd.some((t) => DV.test(t)) ? "DV" : uhd.some((t) => HDR.test(t)) ? "HDR" : null;
  const vff = tous.some(vffSure);
  const vf = tous.some(enVf);
  return { uhd: uhd.length > 0, extra, fhd: tous.some((t) => FHD.test(t)), hdr10p: uhd.some((t) => HDR10P.test(t)), atmos: tous.some((t) => ATMOS.test(t)),
    vf, sources: tous.length, langue: langueDe(tous), ...(vff ? { vff: true, vfq: qualiteCourte(tous.filter(enVf)) } : {}),
    ...(!vff && tous.some((t) => VFQ.test(t)) ? { vfqDoute: true } : {}) };
}

/**
 * Une VFF peut-elle être dans les sources d'un film ? Elles viennent du fichier américain (sortie numérique aux
 * États-Unis) : sa piste française n'est une VFF que si le doublage pour la France existait déjà, le film sorti en France
 * avant (Verity : en salle le 30 sept., en numérique aux États-Unis le 27 oct., TRUEFRENCH) ; sinon c'est la VFQ (Hope :
 * le 13 oct. aux États-Unis, le 28 en France ; By Any Means : jamais en France). La VFF arrive alors avec la sortie
 * numérique française. Film français : toujours. releases : release_dates de TMDB ; today : AAAA-MM-JJ.
 */
export function vffPossible(releases, langue, today) {
  if (langue === "fr") return true;
  const dates = (types, pays) => (releases || []).filter((r) => r.iso_3166_1 === pays).flatMap((r) => r.release_dates || [])
    .filter((r) => types.includes(r.type)).map((r) => (r.release_date || "").slice(0, 10)).filter(Boolean).sort();
  const frNumerique = dates([4, 5, 6], "FR")[0];
  if (frNumerique && frNumerique <= today) return true;
  // Sortie en salle en France avant le fichier américain : ne suffit plus (2026-11-06). Le fichier du store américain
  // porte souvent la VFQ même quand une VFF existe pour les salles (Primetime, Your Mother Your Mother Your Mother : en
  // salle en France avant, VFQ seulement). Sans preuve dans les noms (TRUEFRENCH, VFF… : vff, comme Verity et The Dog
  // Stars), la VFF n'est sûre qu'avec la sortie numérique française ; avant, c'est le doute (affiche coupée en deux).
  // Pas de sortie numérique américaine du tout : les sources ne viennent pas d'un store américain.
  const fr = dates([2, 3, 4, 5, 6], "FR")[0];
  if (!fr || fr > today) return false;
  return !dates([4], "US")[0];
}

/** La prochaine sortie numérique en France, annoncée (AAAA-MM-JJ) : la VFF arrive avec elle. Sinon null. */
export function prochaineVff(releases, today) {
  return (releases || []).filter((r) => r.iso_3166_1 === "FR").flatMap((r) => r.release_dates || [])
    .filter((r) => [4, 5, 6].includes(r.type)).map((r) => (r.release_date || "").slice(0, 10)).filter((d) => d > today).sort()[0] || null;
}

/**
 * Sans sortie numérique française annoncée : l'estimation de la chronologie des médias, la vidéo à la demande 4 mois
 * après la salle en France (Primetime, en salle le 23 septembre 2026 : vers le 23 janvier 2027). Seulement à venir ;
 * sinon null.
 */
export function vffEstimee(releases, today) {
  const salle = (releases || []).filter((r) => r.iso_3166_1 === "FR").flatMap((r) => r.release_dates || [])
    .filter((r) => [2, 3].includes(r.type)).map((r) => (r.release_date || "").slice(0, 10)).filter(Boolean).sort()[0];
  if (!salle) return null;
  const d = new Date(`${salle}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 4);
  const le = d.toISOString().slice(0, 10);
  return le > today ? le : null;
}

// Sortie numérique le même jour dans au moins ce nombre de pays : une plateforme mondiale, doublée, même si TMDB ne la
// liste pas encore en France (Colisión : 10 pays, Runner : 2).
const PAYS_MONDIALE = 8;
function sortieMondiale(releases) {
  const parJour = new Map();
  for (const r of releases || []) for (const x of r.release_dates || []) {
    if (x.type !== 4) continue;
    const j = (x.release_date || "").slice(0, 10);
    parJour.set(j, (parJour.get(j) || new Set()).add(r.iso_3166_1));
  }
  return [...parJour.values()].some((p) => p.size >= PAYS_MONDIALE);
}
const ilYaUnAn = (today) => new Date(Date.parse(today) - 365 * 86400000).toISOString().slice(0, 10);
export const filmRecent = (releases, today) => {
  const d = (releases || []).flatMap((r) => r.release_dates || []).filter((r) => [2, 3, 4, 5, 6].includes(r.type)).map((r) => (r.release_date || "").slice(0, 10)).filter(Boolean).sort()[0];
  return !d || d >= ilYaUnAn(today);
};

/**
 * Le doute VFF ou VFQ d'un film récent, tranché par ses dates (vffPossible, TMDB lu par son identifiant IMDb). Pas pour
 * une VF sûre (vff), un film français, en abonnement sur une plateforme en France qui le double, ou sorti partout le
 * même jour.
 * - quebec + vfqPossible : une VFQ en vue, que les dates disent oui ou non : le film se regarde au moins en VFQ, vf true,
 *   l'affiche est coupée en deux (choix de la personne le 2026-11-04 : Hope, L'île des souvenirs ; avant, Hope était
 *   gris et L'île en couleur). quebec : ni Lumio ni StreamFusion, qui la prennent pour de la VF.
 * - vfqPossible seul : seulement « FRENCH » alors que les dates disent non (Torrent9 renomme tout). L'affiche est coupée
 *   en deux.
 * - vffImpossible : pas de VFF possible et pas de VFQ en vue. L'avis de Lumio ou StreamFusion est encore utile : « non »,
 *   pas de VF (Runner, en MULTi.LAT, sans français) ; « oui », le doute, car ils ne distinguent pas la VFQ (Citizen
 *   Vigilante, rien chez Torrentio). Voir avecAvisDoute.
 * Et vffLe : la sortie numérique française annoncée, si la VFF n'est pas encore possible. TMDB pas lu, sans aucune date,
 * ou une série (imdb null) : rien ne change.
 */
export async function avecDatesVff(env, imdb, q, fetchImpl = fetch, today = new Date().toISOString().slice(0, 10)) {
  if (!q || q.vff) return q;
  const { vfqDoute, ...reste } = q;
  // Sans clé TMDB (la machine GitHub en secours) : les noms seuls, comme avant.
  if (!imdb || !env.TMDB_API_KEY) return reste;
  let d = null;
  // frais : comme lib/tmdb.js, le CDN de TMDB garde pour la clé du service une copie d'avant les dernières dates (Coyote vs.
  // Acme, numérique en France le 22 octobre : classé en VFQ le 1er novembre, faute de voir cette date).
  try { d = await tmdbGet(env, `/movie/${imdb}`, { append_to_response: "release_dates,watch/providers,keywords", frais: new Date().toISOString().slice(0, 13) }, fetchImpl); } catch { return reste; }
  const dates = d && d.release_dates && d.release_dates.results;
  if (!d || !dates || !dates.length || d.original_language === "fr" || !filmRecent(dates, today) || abonnementVf(d) || sortieMondiale(dates)) return reste;
  const possible = vffPossible(dates, d.original_language, today), le = prochaineVff(dates, today);
  const estimee = le ? null : vffEstimee(dates, today);
  const avecDate = le ? { vffLe: le } : estimee ? { vffLe: estimee, vffVers: true } : {};
  // Une VFQ en vue : le fichier américain porte la VFQ, la VFF n'y est pas encore, même si le doublage existe (Primetime :
  // en salle en France avant sa sortie numérique américaine, et pourtant en VFQ seulement). La date de la VFF dessous.
  if (vfqDoute) {
    const enVf = reste.langue === "vf" || reste.langue === "multi";
    return { ...reste, vf: true, langue: enVf ? reste.langue : "vf", quebec: true, vfqPossible: true, ...avecDate };
  }
  if (possible) return reste;
  return { ...reste, vffImpossible: true, ...(reste.vf ? { vfqPossible: true } : {}), ...avecDate };
}

/** La qualité une fois l'avis appliqué (vf à jour) : avec vffImpossible, un « oui » est le doute, un « non » le lève. */
export function avecAvisDoute(q) {
  if (!q || !q.vffImpossible) return q;
  const { vfqPossible, ...reste } = q;
  return reste.vf ? { ...reste, vfqPossible: true } : reste;
}
const LANGUES = ["multi", "vf", "vostfr", "vo"];

/** Qualité lue directement chez Torrentio pour une vidéo (« movie/tt… », « series/tt…:3:1 ») ; null si échec. */
export async function lireTorrentio(video, fetchImpl = fetch) {
  try {
    // Les flux en français d'abord : sinon, pour un titre très partagé, ils passent après ceux que Torrentio renvoie.
    const res = await fetchImpl(`${TORRENTIO}/language=french/stream/${video}.json`, { signal: AbortSignal.timeout(DELAI_MS) });
    if (!res.ok) { console.warn(`Torrentio ${res.status} pour ${video}`); return null; }
    const d = await res.json();
    return parseQuality(d && d.streams);
  } catch (e) { console.warn(`Torrentio injoignable pour ${video} : ${e && e.message}`); return null; }
}

async function lireRelais(relais, video, fetchImpl, cle, sf = false) {
  try {
    // ?v=3 : avec la VF des sources ; les réponses d'avant restent au CDN sous leurs anciennes adresses. &sf=1 : un
    // titre récent, dont le relais demande aussi la VF à StreamFusion (api/qualite.js) : plus lent la première fois.
    const res = await fetchImpl(`${relais}/qualite/${video}.json?v=3${sf ? "&sf=1" : ""}`, { headers: enteteRelais(cle), signal: AbortSignal.timeout(DELAI_MS + 500 + (sf ? SF_ATTENTE_MS : 0)) });
    if (!res.ok) return null;
    const d = await res.json();
    // Réponse gardée au CDN avant la qualité v2 : sans fhd, hdr10p ni atmos (lus false). { erreur: true } (Torrentio
    // en panne) : null. Sans langue (réponse d'avant le badge Langue) : langue inconnue, pas de badge. Pas de ?v=4
    // pour elle : chaque mise en ligne vide déjà le CDN, et le relais ne garde une réponse qu'un jour.
    return d && typeof d.uhd === "boolean"
      ? { uhd: d.uhd, extra: d.extra === "DV" || d.extra === "HDR" ? d.extra : null, fhd: d.fhd === true, hdr10p: d.hdr10p === true, atmos: d.atmos === true,
        vf: typeof d.vf === "boolean" ? d.vf : null, sources: Number.isInteger(d.sources) ? d.sources : null, langue: LANGUES.includes(d.langue) ? d.langue : null,
        ...(d.vff === true && d.vfq && typeof d.vfq === "object" ? { vff: true, vfq: d.vfq } : {}), ...(d.quebec === true ? { quebec: true } : {}),
        ...(d.vfqPossible === true ? { vfqPossible: true } : {}), ...(d.vffImpossible === true ? { vffImpossible: true } : {}),
        ...(/^\d{4}-\d{2}-\d{2}$/.test(d.vffLe || "") ? { vffLe: d.vffLe } : {}) }
      : null;
  } catch { return null; }
}

/**
 * Qualité d'un film, ou d'une série (premier épisode de sa dernière saison) ; null si inconnue.
 * relais : adresse du service (sur Vercel) pour passer par son cache partagé ; sans relais, Torrentio directement.
 * cle : RELAIS_KEY, envoyée au relais (lib/relais.js). sf : titre récent, la VF vient aussi de StreamFusion (relais).
 */
export async function qualityOf(type, imdbId, lastSeason, fetchImpl = fetch, relais = null, cle = null, sf = false) {
  if (!imdbId) return null;
  const video = type === "series" ? `series/${imdbId}:${lastSeason || 1}:1` : `movie/${imdbId}`;
  const memoCle = relais && sf ? video + "#sf" : video;
  const now = Date.now(), hit = memo.get(memoCle);
  if (hit && now < hit.until) return hit.promesse;
  const lue = relais ? lireRelais(relais, video, fetchImpl, cle, sf) : lireTorrentio(video, fetchImpl);
  const entry = { promesse: secours ? lue.then((q) => q || secours(video).catch(() => null)) : lue, until: now + GARDE_MS };
  memo.delete(memoCle);
  memo.set(memoCle, entry);
  // Mémoire plafonnée : les entrées les plus anciennes sortent (une Map garde l'ordre d'arrivée).
  while (memo.size > MAX_MEMO) memo.delete(memo.keys().next().value);
  entry.promesse.then((q) => { if (!q) entry.until = Date.now() + GARDE_ECHEC_MS; });
  return entry.promesse;
}

/**
 * Qualité déjà connue seulement : la mémoire de l'instance, sinon le relais sans clé (une réponse déjà au CDN passe,
 * une adresse nouvelle est refusée). Jamais Torrentio, et rien n'est gardé en mémoire : un « inconnu » lu ainsi ne
 * doit pas répondre plus tard à la place d'une vraie lecture avec la clé.
 */
export async function qualiteConnue(type, imdbId, lastSeason, fetchImpl = fetch, relais, sf = false) {
  if (!imdbId || !relais) return null;
  const video = type === "series" ? `series/${imdbId}:${lastSeason || 1}:1` : `movie/${imdbId}`;
  const hit = memo.get(sf ? video + "#sf" : video);
  if (hit && Date.now() < hit.until) return hit.promesse;
  return lireRelais(relais, video, fetchImpl, null, sf);
}

/**
 * La qualité de Torrentio corrigée par l'avis de StreamFusion ({ vf, sources, qualite? }, lu par l'addon : il lit les
 * sites français et écarte la VFQ) : la VF et la langue suivent StreamFusion ; 4K, DV, HDR… ceux de ses sources VF
 * s'il en a, sinon ceux de Torrentio. Sans avis, ou de la VFQ seulement chez Torrentio (quebec) : Torrentio tel quel,
 * sauf une VFF prouvée par les noms de l'avis (vff).
 */
export function avecStreamFusion(t, avis) {
  if (!avis || typeof avis.vf !== "boolean" || (t && t.quebec && !avis.vff)) return t;
  const base = t || { uhd: false, extra: null, fhd: false, hdr10p: false, atmos: false, vf: false, sources: 0, langue: null };
  const q = avis.qualite || null;
  const qualite = q ? { uhd: q.u === 1, extra: q.x === "DV" || q.x === "HDR" ? q.x : null, hdr10p: q.p === 1, fhd: q.f === 1, atmos: q.a === 1 } : {};
  const enVf = base.langue === "vf" || base.langue === "multi";
  const langue = avis.vf ? (enVf ? base.langue : "vf") : (enVf ? "vo" : base.langue);
  const lu = { ...base, ...qualite, vf: avis.vf, sources: Math.max(base.sources || 0, avis.sources || 0, 1), langue };
  return avis.vff ? vffProuvee(lu) : avecAvisDoute(lu);
}

/**
 * La VFF prouvée par les noms des fichiers de Lumio ou StreamFusion (avis.vff : TRUEFRENCH, VFF, VF2…) : plus de doute,
 * ni VFQ en vue (quebec), ni date de VFF à attendre (Resident Evil, le 11 novembre 2026 : un « MULTi.VFQ » chez
 * Torrentio, huit fichiers TRUEFRENCH, VFF ou VF2 chez Lumio).
 */
export function vffProuvee(q) {
  if (!q) return q;
  const { vfqPossible, vffImpossible, vffLe, vffVers, quebec, vfqDoute, ...reste } = q;
  return { ...reste, vf: true, vff: true };
}

/** Attente de StreamFusion (lu par l'addon), en plus de celle de Torrentio. */
export const SF_ATTENTE_MS = 9000;

/** La qualité des sources VF d'un avis ({ u, x, p, f, a }) en champs de qualité, ou null. */
export const qualiteDeQ = (q) => (q && typeof q === "object"
  ? { uhd: q.u === 1, extra: q.x === "DV" || q.x === "HDR" ? q.x : null, hdr10p: q.p === 1, fhd: q.f === 1, atmos: q.a === 1 } : null);

/**
 * L'avis VF du jour de l'addon pour une vidéo récente (« movie/tt… », « series/tt…:S:1 ») : /sf/…, avec RELAIS_KEY
 * (Lumio, qui lit la langue dans le fichier, sinon StreamFusion ; gardé par l'addon : « pas de VF » 3 heures). Le même
 * que celui des rangées et des fiches. { vf, sources, qualite? }, ou null (pas d'avis : plafond, panne). Gardé ici
 * 3 heures ; « pas de VF » une heure seulement : les fiches et les rangées mettent à jour l'avis commun de l'addon
 * entre-temps (Heart of the Beast : VF pour l'addon à 23 h, affiche encore grise une heure plus tard). Le redemander ne
 * coûte qu'une requête à l'addon, qui le relit dans sa mémoire commune sans appeler le débrideur.
 */
let avisMemo = new Map();
const AVIS_MEMO_MS = 3 * 3600000, AVIS_MEMO_NON_MS = 3600000;
export function avisDuJour(addon, video, cle, fetchImpl = fetch) {
  const hit = avisMemo.get(video);
  if (hit && Date.now() < hit.until) return hit.promesse;
  const promesse = (async () => {
    try {
      const res = await fetchImpl(`${addon}/sf/${video}.json`, { headers: { "X-Relais-Cle": cle }, signal: AbortSignal.timeout(SF_ATTENTE_MS) });
      if (!res.ok) return null;
      const d = await res.json();
      return d && typeof d.vf === "boolean" ? d : null;
    } catch { return null; }
  })();
  const memo = { promesse, until: Date.now() + AVIS_MEMO_MS };
  promesse.then((d) => { if (d && d.vf === false) memo.until = Math.min(memo.until, Date.now() + AVIS_MEMO_NON_MS); });
  avisMemo.delete(video);
  avisMemo.set(video, memo);
  while (avisMemo.size > MAX_MEMO) avisMemo.delete(avisMemo.keys().next().value);
  return promesse;
}
