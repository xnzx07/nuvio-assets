/**
 * Recherche de secours dans Wikidata, hors animes (les animes : anilist.js) : un personnage (« walter white » →
 * Breaking Bad, « jon snow », « tony soprano »), un sigle ou un surnom (« got », « twd », « lotr »), une personne que
 * la recherche de personnes de TMDB ne propose pas (« belmondo » → Jean-Paul Belmondo). Wikidata donne directement
 * les identifiants TMDB (P4983 série, P4947 film, P4985 personne) : rien à deviner d'après un titre.
 *
 * Trois demandes, gardées 7 jours (1 jour sans rien trouvé) ; une panne rend null, la recherche continue sans lui :
 *   1. les éléments dont le nom ou un alias commence par la requête (wbsearchentities) ;
 *   2. en plus, les éléments qui ont un identifiant TMDB ou une œuvre et contiennent les mots (recherche plein texte) ;
 *   3. leurs identifiants TMDB, et pour un personnage ceux des œuvres où il apparaît (P1441 ; pas l'inverse, P674 :
 *      des centaines d'œuvres pour Dark Vador, la demande dépassait le délai), en une demande SPARQL.
 * Éléments et œuvres les plus connus d'abord (nombre de pages Wikipédia) : Jean-Paul Belmondo (110) passe devant le
 * nom de famille et un documentaire. Rend des références { type: "tv" | "movie" | "person", id, nom }.
 */
import { norm } from "./search.js";

const API = "https://www.wikidata.org/w/api.php";
const SPARQL = "https://query.wikidata.org/sparql";
const ENTETES = { "User-Agent": "CatalogueFR/1.0 (+https://github.com/xnzx07/nuvio-assets)" };
const WAIT_MS = 3000;
const MIN_LETTRES = 3;      // « got », « twd » ; Nuvio cherche à chaque lettre, mais Wikidata ne compte pas ses appels
const OEUVRES = 4;           // œuvres d'un personnage gardées
const GARDE_S = 7 * 86400, GARDE_VIDE_S = 86400;

/** Le nom trouvé correspond à la requête : chaque mot tapé commence un de ses mots (« got » → alias « GOT »). */
function correspond(query, nom) {
  const mots = norm(query).split(" ").filter(Boolean);
  const toks = norm(nom || "").split(" ").filter(Boolean);
  return mots.length > 0 && mots.every((w) => toks.some((t) => t.startsWith(w)));
}

/**
 * Les références TMDB, d'après les éléments trouvés ([{ id, nom }]) et les lignes SPARQL. Le plus connu des éléments
 * qui mènent quelque part l'emporte, et le suivant seulement s'il est du même genre (deux œuvres : « got » →
 * Le Trône de fer ; pas une personne après une œuvre).
 */
export function referencesDe(elements, lignes) {
  const par = new Map(), connu = new Map();
  for (const b of lignes || []) {
    const id = b.item && b.item.value.split("/").pop();
    if (!id) continue;
    const e = par.get(id) || { tv: null, movie: null, person: null, oeuvres: new Map() };
    if (b.tv) e.tv = b.tv.value;
    if (b.film) e.movie = b.film.value;
    if (b.pers) e.person = b.pers.value;
    if (b.isl) connu.set(id, Number(b.isl.value) || 0);
    if (b.w && (b.wtv || b.wfilm)) {
      const sl = Number(b.sl && b.sl.value) || 0;
      if (b.wtv) e.oeuvres.set(`tv:${b.wtv.value}`, Math.max(sl, e.oeuvres.get(`tv:${b.wtv.value}`) || 0));
      if (b.wfilm) e.oeuvres.set(`movie:${b.wfilm.value}`, Math.max(sl, e.oeuvres.get(`movie:${b.wfilm.value}`) || 0));
    }
    par.set(id, e);
  }
  const out = [];
  let genre = null;
  const tries = elements.map((e, i) => ({ ...e, i })).sort((a, b) => (connu.get(b.id) || 0) - (connu.get(a.id) || 0) || a.i - b.i);
  for (const { id, nom } of tries) {
    const e = par.get(id);
    if (!e) continue;
    let refs;
    if (e.person && !e.tv && !e.movie) refs = [{ type: "person", id: Number(e.person), nom }];
    // Ses propres identifiants (une œuvre, ou un personnage qui a sa série : Iron Man), puis les œuvres où il apparaît
    // (les films d'Iron Man pour « tony stark »).
    else refs = [e.tv && { type: "tv", id: Number(e.tv), nom }, e.movie && { type: "movie", id: Number(e.movie), nom },
      ...[...e.oeuvres].sort((a, b) => b[1] - a[1]).slice(0, OEUVRES).map(([k]) => ({ type: k.split(":")[0], id: Number(k.split(":")[1]), nom }))].filter(Boolean);
    if (!refs.length) continue;
    const g = refs[0].type === "person" ? "personne" : "oeuvre";
    if (genre && g !== genre) break;
    genre = genre || g;
    out.push(...refs);
    if (g === "personne" || out.length >= OEUVRES) break;
  }
  const vus = new Set();
  return out.filter((r) => { const k = `${r.type}:${r.id}`; return !vus.has(k) && vus.add(k); }).slice(0, OEUVRES);
}

const lire = (url) => fetch(url, { headers: ENTETES, signal: AbortSignal.timeout(WAIT_MS) })
  .then((r) => { if (!r.ok) throw new Error(`wikidata ${r.status}`); return r.json(); });

/** Références TMDB pour cette requête (gardées), [] si rien, null si Wikidata ne répond pas. */
export async function wikidataDe(query) {
  const q = norm(query);
  if (q.replace(/ /g, "").length < MIN_LETTRES || q.split(" ").length > 4) return [];
  const cle = new Request(`https://cache.local/wikidata-v1/${encodeURIComponent(q)}`);
  const hit = await caches.default.match(cle).catch(() => null);
  if (hit) return hit.json();
  let refs;
  try {
    const [noms, texte] = await Promise.all([
      lire(`${API}?action=wbsearchentities&search=${encodeURIComponent(query)}&language=fr&uselang=fr&type=item&limit=7&format=json`),
      lire(`${API}?action=query&list=search&srsearch=${encodeURIComponent(`${query} haswbstatement:P4985|P4947|P4983|P1441`)}&srlimit=4&format=json`),
    ]);
    const elements = [];
    for (const r of noms.search || []) if (correspond(query, r.match && r.match.text)) elements.push({ id: r.id, nom: r.label || r.match.text });
    for (const r of (texte.query && texte.query.search) || []) if (!elements.some((e) => e.id === r.title)) elements.push({ id: r.title, nom: null });
    const choisis = elements.slice(0, 11);
    if (!choisis.length) refs = [];
    else {
      const sparql = `SELECT ?item ?itemLabel ?isl ?tv ?film ?pers ?w ?wtv ?wfilm ?sl WHERE {
        VALUES ?item { ${choisis.map((e) => `wd:${e.id}`).join(" ")} }
        OPTIONAL { ?item wikibase:sitelinks ?isl }
        OPTIONAL { ?item wdt:P4983 ?tv } OPTIONAL { ?item wdt:P4947 ?film } OPTIONAL { ?item wdt:P4985 ?pers }
        OPTIONAL { ?item wdt:P1441 ?w .
          OPTIONAL { ?w wdt:P4983 ?wtv } OPTIONAL { ?w wdt:P4947 ?wfilm } OPTIONAL { ?w wikibase:sitelinks ?sl } }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
      } LIMIT 300`;
      const r = await lire(`${SPARQL}?format=json&query=${encodeURIComponent(sparql)}`);
      const lignes = (r.results && r.results.bindings) || [];
      // Élément trouvé en plein texte : gardé si son nom contient les mots tapés (« Jean-Paul Belmondo »).
      const libelles = new Map(lignes.map((b) => [b.item.value.split("/").pop(), b.itemLabel && b.itemLabel.value]));
      const retenus = choisis.map((e) => ({ ...e, nom: e.nom || libelles.get(e.id) }))
        .filter((e) => e.nom && (correspond(query, e.nom) || (noms.search || []).some((s) => s.id === e.id)));
      refs = referencesDe(retenus, lignes);
    }
  } catch (e) {
    console.log(`wikidata ${(e && e.message) || e} pour « ${q} »`);
    return null;
  }
  await caches.default.put(cle, new Response(JSON.stringify(refs), { headers: { "Cache-Control": `public, max-age=${refs.length ? GARDE_S : GARDE_VIDE_S}` } })).catch(() => {});
  return refs;
}
