/**
 * Rangées de l'addon pour les collections facultatives : ce que Nuvio ne sait pas demander seul à TMDB.
 *   - Récompenses : lauréats (Oscar et César du meilleur film, Palme d'or) depuis data/recompenses.json
 *     (scripts/build_recompenses.py : Wikidata, fiches TMDB en français ; pas un appel TMDB par lauréat ici).
 *   - Selon le temps : films de moins de 90 minutes (durée) et mini-séries (type de série), en direct depuis TMDB.
 * Dans le manifest seulement si leur collection est cochée (showInHome: false : pas sur l'accueil).
 */
import SAGAS from "../data/sagas.json";

/**
 * Sagas : TMDB rend certaines sagas dans le désordre (Rocky Balboa avant Rocky, Bad Boys for Life avant Bad Boys) et
 * Nuvio ne sait trier une saga que du plus récent au plus ancien : l'addon sert ces sagas dans l'ordre de sortie.
 * Un catalogue par saga (« saga-<id TMDB> », au nom de la saga) : Nuvio TV reconnaît une rangée à son catalogue
 * (titre, défilement, « Charger plus ») ; avec un seul catalogue, les rangées d'un thème s'appelaient toutes « Saga »
 * et défilaient ensemble. L'ancien catalogue « saga » (la saga en « genre ») reste pour les collections pas réimportées.
 */
export const SAGA_IDS = new Map(SAGAS.flatMap((t) => t.sagas.map((s) => [s.title, s.id])));
const DESORDRE = SAGAS.flatMap((t) => t.sagas).filter((s) => s.in_order === false);
export const SAGA_CATALOGS = new Map(DESORDRE.map((s) => [`saga-${s.id}`, s.id]));

/** Catalogues des sagas du manifest, si Sagas ou Grands univers est cochée. */
export function sagaCatalog(cfg, pageSize) {
  if (!cfg.c.includes("sagas") && !cfg.c.includes("univers")) return [];   // Grands univers : leurs sagas aussi
  const names = [...SAGA_IDS.keys()];
  return [{ type: "movie", id: "saga", name: "Saga", showInHome: false, pageSize, genres: names,
    extra: [{ name: "genre", isRequired: true, options: names }, { name: "skip" }],
    extraRequired: ["genre"], extraSupported: ["genre", "skip"] },
  // Un filtre exigé (genre « Saga », donné par les collections) : l'appli Nuvio sur ordinateur ignore showInHome et met
  // sur l'accueil tout catalogue qui n'en exige pas.
  ...DESORDRE.map((s) => ({ type: "movie", id: `saga-${s.id}`, name: s.title, showInHome: false, pageSize, genres: ["Saga"],
    extra: [{ name: "genre", isRequired: true, options: ["Saga"] }, { name: "skip" }], extraRequired: ["genre"], extraSupported: ["genre", "skip"] }))];
}

/** Films d'une saga dans l'ordre de sortie ; sans date (annoncés) à la fin. */
export const inReleaseOrder = (parts) => [...parts].sort((a, b) =>
  (a.release_date ? 0 : 1) - (b.release_date ? 0 : 1) || String(a.release_date || "").localeCompare(String(b.release_date || "")));

export const ROWS = [
  { id: "fac-oscars", type: "movie", name: "Oscars du meilleur film", collection: "recompenses", list: "oscars", filtre: "Lauréats" },
  { id: "fac-palmes", type: "movie", name: "Palmes d'or", collection: "recompenses", list: "palmes", filtre: "Lauréats" },
  { id: "fac-cesars", type: "movie", name: "Césars du meilleur film", collection: "recompenses", list: "cesars", filtre: "Lauréats" },
  { id: "fac-moins-90", type: "movie", name: "Moins de 90 minutes", collection: "temps", filtre: "Populaires",
    discover: { "with_runtime.lte": 90, "with_runtime.gte": 60, sort_by: "popularity.desc", "vote_count.gte": 300 } },
  { id: "fac-mini-series", type: "series", name: "Mini-séries", collection: "temps", filtre: "Bien notées",
    discover: { with_type: "2", sort_by: "popularity.desc", "vote_average.gte": 7.3, "vote_count.gte": 200 } },
];

/** Catalogues du manifest pour les collections facultatives cochées. */
export function facultativeCatalogs(cfg, pageSize) {
  // Un filtre exigé (r.filtre, donné par les collections) : l'appli Nuvio sur ordinateur ignore showInHome et met sur
  // l'accueil tout catalogue qui n'en exige pas.
  return ROWS.filter((r) => cfg.c.includes(r.collection)).map((r) => ({
    type: r.type, id: r.id, name: r.name, showInHome: false, pageSize, genres: [r.filtre],
    extra: [{ name: "genre", isRequired: true, options: [r.filtre] }, { name: "skip" }], extraRequired: ["genre"], extraSupported: ["genre", "skip"],
  }));
}

/** Lauréats d'un prix qui passent les filtres (keep), page qui commence à « skip » (résultats TMDB, pour toMetas). */
export async function laureats(assets, list, skip, size, keep = () => true) {
  const res = await fetch(`${assets}/data/recompenses.json`, { cf: { cacheTtl: 86400, cacheEverything: true } });
  const data = res.ok ? await res.json() : {};
  return (data[list] || []).filter(keep).slice(skip, skip + size);
}
