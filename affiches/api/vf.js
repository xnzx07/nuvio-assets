/**
 * /vf.json?v=movie/tt…,series/tt…:saison:1,… (réécrit vers /api/vf par vercel.json) : la VF des sources de
 * plusieurs titres en un seul appel, pour l'addon (Cloudflare ne lui laisse que 50 appels sortants par requête :
 * une page de rangée en fait déjà une quarantaine). Chaque titre est lu au relais /qualite/ du service, gardé un
 * jour au CDN : le même que pour les affiches, donc la même réponse partout.
 *   { "movie/tt…": { vf, sources, langue?, vff?, vfq? } | null (pas lu : Torrentio en panne ou trop lent) }
 * Avec RELAIS_KEY, seul l'addon principal (qui envoie la clé, lib/relais.js) fait lire Torrentio : sinon, 40
 * identifiants au hasard par appel le feraient lire 40 fois. Sans la clé (les copies auto-hébergées, qui appellent
 * aussi ce service), la réponse ne contient que ce qui est déjà connu (mémoire, CDN de /qualite/) ; incomplète, elle
 * n'est pas gardée au CDN, pour ne pas servir ensuite des trous à l'addon principal (même adresse).
 */
import { qualityOf, qualiteConnue } from "../lib/qualite.js";
import { relaisRefuse } from "../lib/relais.js";

const ID = /^(movie\/tt\d{1,10}|series\/tt\d{1,10}:\d{1,3}:1)$/;
const MAX = 40;

export function makeVf({ fetchImpl = fetch, env = process.env } = {}) {
  return async function GET(request) {
    const url = new URL(request.url);
    const ids = [...new Set((url.searchParams.get("v") || "").split(",").filter((x) => ID.test(x)))].slice(0, MAX);
    if (!ids.length) {
      return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=3600", "Vercel-CDN-Cache-Control": "max-age=3600" } });
    }
    const sansCle = relaisRefuse(request, env);
    // QUALITE_RELAIS : un relais /qualite que Torrentio accepte (Vercel aux États-Unis), pour un service hébergé là où il
    // refuse (le serveur des affiches, chez Oracle à Paris).
    const relais = env.QUALITE_RELAIS || url.origin;
    const lus = await Promise.all(ids.map(async (id) => {
      const [type, video] = id.split("/");
      const [imdb, saison] = video.split(":");
      const s = saison ? Number(saison) : null;
      // Torrentio seulement, plus StreamFusion : chaque titre récent demandait son avis à l'addon (/sf), une invocation de
      // plus chez Cloudflare même passé le plafond de 300 par jour (atteint dès le matin). Le 25 octobre 2026, ces appels
      // faisaient les deux tiers des requêtes de l'addon, au-delà des 100 000 permis par jour. Les 300 vont à la photo des
      // tendances, dont l'avis VF sert aussi aux affiches.
      const q = await (sansCle ? qualiteConnue(type, imdb, s, fetchImpl, relais) : qualityOf(type, imdb, s, fetchImpl, relais, env.RELAIS_KEY)).catch(() => null);
      // langue (« vostfr », « vo »…) : ce qu'on peut regarder sans VF, que la fiche de l'addon dit (« en VOSTFR »).
      // vff, vfq : VF sûre (TRUEFRENCH, VFF…) et la qualité de ses sources : l'addon ne demande alors pas Lumio.
      return [id, q && typeof q.vf === "boolean" ? { vf: q.vf, sources: q.sources, ...(q.langue ? { langue: q.langue } : {}),
        ...(q.vff && q.vfq ? { vff: true, vfq: q.vfq } : {}) } : null];
    }));
    const trou = lus.some(([, x]) => x === null);
    // Un titre pas lu : gardé dix minutes seulement, pour réessayer bientôt ; sans la clé, pas gardé du tout.
    const cache = sansCle && trou ? { "Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store" }
      : { "Cache-Control": `public, max-age=${trou ? 600 : 3600}`, "Vercel-CDN-Cache-Control": `max-age=${trou ? 600 : 3600}` };
    return new Response(JSON.stringify(Object.fromEntries(lus)), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...cache },
    });
  };
}

export const GET = makeVf();
