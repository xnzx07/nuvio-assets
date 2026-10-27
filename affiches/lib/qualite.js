/**
 * Qualité d'un titre (4K, puis DV ou HDR), lue dans les noms des flux de Torrentio, comme le fait
 * un addon de sources. Seulement la 4K : en dessous, pas de badge. Un échec ou un délai dépassé
 * donne null, et l'affiche part sans badge plutôt qu'avec un badge faux.
 * Sur Vercel, elle passe par le relais /qualite/… du service, gardé un jour par le cache de Vercel :
 * ce qu'une instance a lu sert à toutes les autres (même badge partout, donc même ETag).
 */
import { enteteRelais } from "./relais.js";

export const TORRENTIO = "https://torrentio.strem.fun";
const DELAI_MS = 2500;
// Un jour : la VF lue dans les sources (statut des affiches) arrive vite après la sortie.
const GARDE_MS = 86400 * 1000, GARDE_ECHEC_MS = 3600 * 1000;
const MAX_MEMO = 5000;

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
const VFQ = /\b(VFQ|QU[EÉ]BEC|QU[EÉ]B[EÉ]COIS)\b/i;
const VF_FRANCE = /\b(TRUEFRENCH|VFF|VFI|VF2)\b/i;
const enVf = (t) => VF.test(t) && !(VFQ.test(t) && !VF_FRANCE.test(t));
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

/**
 * { uhd, extra, fhd, hdr10p, atmos, vf, sources, langue } d'après une liste de flux Stremio ({ name, title }). DV, HDR
 * et HDR10+ comptent seulement en 4K ; fhd = un flux 1080p ; atmos = un flux Dolby Atmos, en toute résolution ;
 * langue : la meilleure (langueDe), « multi » ou « vf » exactement quand vf est vrai.
 */
export function parseQuality(streams) {
  const tous = (streams || []).filter((s) => !filmeEnSalle(s)).map((s) => `${s.name || ""} ${s.title || ""}`);
  const uhd = tous.filter((t) => UHD.test(t));
  const extra = uhd.some((t) => DV.test(t)) ? "DV" : uhd.some((t) => HDR.test(t)) ? "HDR" : null;
  return { uhd: uhd.length > 0, extra, fhd: tous.some((t) => FHD.test(t)), hdr10p: uhd.some((t) => HDR10P.test(t)), atmos: tous.some((t) => ATMOS.test(t)),
    vf: tous.some(enVf), sources: tous.length, langue: langueDe(tous) };
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
        vf: typeof d.vf === "boolean" ? d.vf : null, sources: Number.isInteger(d.sources) ? d.sources : null, langue: LANGUES.includes(d.langue) ? d.langue : null }
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
 * s'il en a, sinon ceux de Torrentio. Sans avis : Torrentio tel quel.
 */
export function avecStreamFusion(t, avis) {
  if (!avis || typeof avis.vf !== "boolean") return t;
  const base = t || { uhd: false, extra: null, fhd: false, hdr10p: false, atmos: false, vf: false, sources: 0, langue: null };
  const q = avis.qualite || null;
  const qualite = q ? { uhd: q.u === 1, extra: q.x === "DV" || q.x === "HDR" ? q.x : null, hdr10p: q.p === 1, fhd: q.f === 1, atmos: q.a === 1 } : {};
  const enVf = base.langue === "vf" || base.langue === "multi";
  const langue = avis.vf ? (enVf ? base.langue : "vf") : (enVf ? "vo" : base.langue);
  return { ...base, ...qualite, vf: avis.vf, sources: Math.max(base.sources || 0, avis.sources || 0, 1), langue };
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
 * 30 minutes : une affiche redessinée plus tard le redemande.
 */
let avisMemo = new Map();
const AVIS_MEMO_MS = 30 * 60000;
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
  avisMemo.delete(video);
  avisMemo.set(video, { promesse, until: Date.now() + AVIS_MEMO_MS });
  while (avisMemo.size > MAX_MEMO) avisMemo.delete(avisMemo.keys().next().value);
  return promesse;
}
