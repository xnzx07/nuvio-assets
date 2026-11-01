/**
 * /qualite/{movie|series}/{tt…|tt…:saison:1}.json (réécrit vers /api/qualite par vercel.json) : la qualité
 * d'une vidéo (et la VF de ses sources) lue chez Torrentio, gardée un jour par le cache de Vercel. Les affiches la demandent ici :
 * une seule lecture sert à toutes les instances du service. Avec RELAIS_KEY, seul le service fait lire une adresse
 * pas encore au CDN (lib/relais.js).
 */
import { lireTorrentio, avecStreamFusion, avecDatesVff, SF_ATTENTE_MS } from "../lib/qualite.js";
import { ADDON_URL } from "../lib/tendances.js";
import { relaisRefuse, refusRelais } from "../lib/relais.js";

const VIDEO = { movie: /^tt\d{1,10}$/, series: /^tt\d{1,10}:\d{1,3}:1$/ };

/**
 * L'avis de StreamFusion pour un titre récent (&sf=1), lu chez l'addon (/sf/…, avec RELAIS_KEY : il a le lien
 * StreamFusion et tient le plafond du jour). { vf, sources, qualite? }, { plafond: true }, ou null (pas de réponse).
 */
async function avisStreamFusion(env, type, video, fetchImpl) {
  if (!env.RELAIS_KEY) return null;
  try {
    const res = await fetchImpl(`${env.ADDON_URL || ADDON_URL}/sf/${type}/${video}.json`, { headers: { "X-Relais-Cle": env.RELAIS_KEY }, signal: AbortSignal.timeout(SF_ATTENTE_MS) });
    if (!res.ok) return null;
    const d = await res.json();
    return d && (typeof d.vf === "boolean" || d.plafond) ? d : null;
  } catch { return null; }
}

export function makeQualite({ fetchImpl = fetch, env = process.env } = {}) {
  return async function GET(request) {
    const q = new URL(request.url).searchParams;
    const type = q.get("type"), video = q.get("video") || "";
    if (!VIDEO[type] || !VIDEO[type].test(video)) {
      return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=3600", "Vercel-CDN-Cache-Control": "max-age=3600" } });
    }
    if (relaisRefuse(request, env)) return refusRelais();
    // Sans clé (machine GitHub) ou STREAMFUSION=off (le serveur des affiches) : jamais l'addon. Chaque demande à /sf y
    // compte une requête, même refusée ; les affiches ont déjà l'avis VF de la photo du jour.
    const sf = q.get("sf") === "1" && !!env.RELAIS_KEY && env.STREAMFUSION !== "off";
    // Un film avec une VFQ et rien de sûr pour la France : ses dates disent si ses flux « FRENCH » peuvent être une VFF.
    const [torrentio, avis] = await Promise.all([
      lireTorrentio(`${type}/${video}`, fetchImpl).then((t) => avecDatesVff(env, type === "movie" ? video : null, t, fetchImpl)),
      sf ? avisStreamFusion(env, type, video, fetchImpl) : null]);
    const qualite = avis && !avis.plafond ? avecStreamFusion(torrentio, avis) : torrentio;
    // Torrentio en panne ou qui refuse : { erreur: true } gardé 30 min (le CDN de Vercel ne garde jamais une 503 :
    // chaque affiche redemanderait Torrentio, et Vercel risquerait d'être bloqué).
    if (!qualite) {
      return new Response(JSON.stringify({ erreur: true }), {
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=1800", "Vercel-CDN-Cache-Control": "max-age=1800" },
      });
    }
    // StreamFusion demandé mais sans réponse : Torrentio seul, gardé une heure (on le redemandera) ; plafond du jour
    // atteint : six heures ; sinon un jour.
    const s = !sf || (avis && !avis.plafond) ? 86400 : avis && avis.plafond ? 21600 : 3600;
    return new Response(JSON.stringify(qualite), {
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${s}`, "Vercel-CDN-Cache-Control": `max-age=${s}, stale-if-error=86400` },
    });
  };
}

export const GET = makeQualite();
