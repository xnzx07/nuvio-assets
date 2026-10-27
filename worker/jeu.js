/**
 * « Le film du jour » (/jeu) : deviner un film à partir d'une image pixelisée, en 5 essais. Le même film pour tout le
 * monde, chaque jour (date de Paris), tiré d'une liste de films très connus (les plus votés de TMDB, décennie par
 * décennie, plus les films français les plus votés).
 *
 * La réponse n'est jamais dans la page : le worker sert l'image (/jeu/<date>/image.jpg, un fond de TMDB sans texte),
 * les indices un par un (/jeu/<date>/indice/<n>) et vérifie les essais (POST /jeu/<date>/essai). Le titre n'arrive
 * qu'à la fin (bonne réponse, ou dernier essai raté).
 *
 * Le tirage : chaque film de la liste reçoit une note tirée de la date et de son identifiant ; le mieux noté gagne
 * (hors films des 60 jours précédents). Une liste qui bouge un peu (un film qui entre, un qui sort) ne change le film du
 * jour que si c'est lui qui gagne : rare. Avec la base D1 (LIENS), le premier tirage du jour y est gardé et c'est lui que
 * tout le monde reçoit, quel que soit le centre de Cloudflare ; sans base (Docker), le tirage suffit.
 */
import { esc } from "./outils-serveur.js";
import { STAGE_HEAD, stageTop, BEAM_HTML } from "./stage.js";
import { feuilles, scripts } from "./statique.js";

export const JEU_DEBUT = "2026-10-22";   // n° 1 (le jour de la mise en ligne)
export const ESSAIS = 5;
const INDICES = 4;
const RECENTS_J = 60;                    // un film ne revient pas avant 60 jours
const GARDE_S = 2 * 86400;
const TMDB = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/";

// La liste : les films les plus votés de chaque époque (assez pour varier les décennies), et ceux du cinéma français.
const TRANCHES = [
  { de: "1950-01-01", a: "1969-12-31", pages: 1, votes: 2500 },
  { de: "1970-01-01", a: "1979-12-31", pages: 1, votes: 3000 },
  { de: "1980-01-01", a: "1989-12-31", pages: 2, votes: 4000 },
  { de: "1990-01-01", a: "1999-12-31", pages: 2, votes: 6000 },
  { de: "2000-01-01", a: "2009-12-31", pages: 2, votes: 8000 },
  { de: "2010-01-01", a: "2019-12-31", pages: 2, votes: 10000 },
  { de: "2020-01-01", a: "", pages: 1, votes: 6000 },
  { de: "1950-01-01", a: "", pages: 1, votes: 1500, langue: "fr" },
];

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const ajoute = (iso, j) => new Date(Date.parse(iso + "T12:00:00Z") + j * 86400000).toISOString().slice(0, 10);
/** Le numéro du film du jour (n° 1 le premier jour). */
export const numero = (date) => Math.round((Date.parse(date + "T12:00:00Z") - Date.parse(JEU_DEBUT + "T12:00:00Z")) / 86400000) + 1;
/** Une date de partie valable : depuis le n° 1, jamais dans le futur (le film de demain reste secret). */
export const jourValable = (date, today) => JOUR.test(date) && !Number.isNaN(Date.parse(date)) && date >= JEU_DEBUT && date <= today;

/** Note d'un film pour un jour : FNV-1a de « date|id », mélangée (même résultat partout, pour toujours). */
export function note(date, id) {
  let h = 0x811c9dc5;
  const s = date + "|" + id;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
const classe = (date, ids) => [...ids].sort((a, b) => note(date, b) - note(date, a) || a - b);

/**
 * Les candidats du jour, du mieux noté au moins bien : la liste sans les films tirés les 60 jours d'avant (ceux de la
 * base si elle en a, et ceux que le tirage aurait donnés). Exporté pour les tests.
 */
export function candidats(date, ids, deja = []) {
  const exclus = new Set(deja);
  for (let k = 1; k <= RECENTS_J; k++) {
    const avant = ajoute(date, -k);
    if (avant < JEU_DEBUT) break;
    const premier = classe(avant, ids)[0];
    if (premier != null) exclus.add(premier);
  }
  const restants = ids.filter((id) => !exclus.has(id));
  return classe(date, restants.length ? restants : ids);
}

async function tmdb(env, chemin, params = {}) {
  const u = new URL(TMDB + chemin);
  u.search = new URLSearchParams({ api_key: env.TMDB_API_KEY, language: "fr-FR", ...params });
  try {
    const r = await fetch(u, { cf: { cacheTtl: 86400, cacheEverything: true } });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}

/** La liste des films (identifiants TMDB), lue une fois par jour. */
async function liste(env, today) {
  const max = ajoute(today, -365);   // sortis depuis un an au moins : le temps de devenir connus
  const pages = await Promise.all(TRANCHES.flatMap((t) => Array.from({ length: t.pages }, (_, i) => tmdb(env, "/discover/movie", {
    sort_by: "vote_count.desc", include_adult: "false", without_genres: "99", page: String(i + 1),
    "vote_count.gte": String(t.votes), "primary_release_date.gte": t.de, "primary_release_date.lte": t.a && t.a < max ? t.a : max,
    ...(t.langue ? { with_original_language: t.langue } : {}),
  }))));
  const ids = new Set();
  for (const p of pages) for (const f of (p && p.results) || []) if (f.backdrop_path && f.poster_path && !f.adult) ids.add(f.id);
  return [...ids].sort((a, b) => a - b);
}

// Le meilleur fond sans texte (langue « aucune »), assez grand : sinon le film n'est pas jouable.
const fondSansTexte = (images) => ((images && images.backdrops) || [])
  .filter((b) => !b.iso_639_1 && b.width >= 1280 && b.aspect_ratio > 1.6)
  .sort((a, b) => b.vote_average - a.vote_average || b.vote_count - a.vote_count)[0];

/** La partie d'un film : tout ce que le jeu révèle (indices, puis la réponse). null s'il n'est pas jouable. */
async function partieDe(env, date, id) {
  const d = await tmdb(env, `/movie/${id}`, { append_to_response: "credits,images,external_ids", include_image_language: "null" });
  if (!d || d.id !== id) return null;
  const fond = fondSansTexte(d.images);
  if (!fond) return null;
  const crew = (d.credits && d.credits.crew) || [];
  const real = crew.filter((c) => c.job === "Director").map((c) => c.name);
  const acteur = (((d.credits && d.credits.cast) || []).find((c) => c.order === 0) || ((d.credits && d.credits.cast) || [])[0] || {}).name || "";
  return {
    date, n: numero(date), tmdb: d.id, imdb: d.imdb_id || (d.external_ids && d.external_ids.imdb_id) || "",
    titre: d.title || d.original_title || "", titreVO: d.original_title && d.original_title !== d.title ? d.original_title : "",
    annee: (d.release_date || "").slice(0, 4), duree: d.runtime || 0,
    genres: (d.genres || []).map((g) => g.name).slice(0, 3), realisateur: real.slice(0, 2).join(" et "), acteur,
    affiche: d.poster_path || "", fond: fond.file_path,
  };
}

// La base (facultative) : le film de chaque jour, le premier enregistré gagne.
let pret = null;
const table = (env) => (pret = pret || env.LIENS.prepare("CREATE TABLE IF NOT EXISTS jeu (j TEXT PRIMARY KEY, film INTEGER NOT NULL)").run()
  .catch((e) => { pret = null; throw e; }));
async function enBase(env, date) {
  const r = await env.LIENS.prepare("SELECT film FROM jeu WHERE j = ?").bind(date).first();
  return r ? Number(r.film) : null;
}
async function recentsEnBase(env, date) {
  const r = await env.LIENS.prepare("SELECT film FROM jeu WHERE j >= ? AND j < ?").bind(ajoute(date, -RECENTS_J), date).all();
  return ((r && r.results) || []).map((x) => Number(x.film));
}

const MEMOIRE = new Map();
/** Pour les tests : oublier les parties gardées en mémoire. */
export const oublierJeu = () => { MEMOIRE.clear(); pret = null; };

/** La partie du jour (date de Paris), ou null si TMDB ne répond pas. */
export async function partieDuJour(env, date) {
  if (MEMOIRE.has(date)) return MEMOIRE.get(date);
  const cle = new Request(`https://cache.local/jeu-v1/${date}`);
  const hit = await caches.default.match(cle).catch(() => null);
  if (hit) { const p = await hit.json(); MEMOIRE.set(date, p); return p; }
  let base = !!env.LIENS, choisi = null, deja = [];
  if (base) {
    try { await table(env); choisi = await enBase(env, date); if (!choisi) deja = await recentsEnBase(env, date); }
    catch (e) { console.warn(`jeu : ${e && e.message}`); base = false; }
  }
  let partie = choisi ? await partieDe(env, date, choisi) : null;
  if (!partie) {
    const ids = await liste(env, date);
    if (!ids.length) return null;
    // Les 4 mieux notés au plus : le premier qui a un beau fond sans texte.
    for (const id of candidats(date, ids, deja).slice(0, 4)) { partie = await partieDe(env, date, id); if (partie) break; }
    if (!partie) return null;
    if (base) {
      try {
        await env.LIENS.prepare("INSERT OR IGNORE INTO jeu (j, film) VALUES (?, ?)").bind(date, partie.tmdb).run();
        // Un autre centre a pu tirer avant nous : c'est son film qui compte.
        const gagnant = await enBase(env, date);
        if (gagnant && gagnant !== partie.tmdb) partie = (await partieDe(env, date, gagnant)) || partie;
      } catch (e) { console.warn(`jeu : ${e && e.message}`); }
    }
  }
  MEMOIRE.set(date, partie);
  if (MEMOIRE.size > 30) MEMOIRE.delete(MEMOIRE.keys().next().value);
  await caches.default.put(cle, new Response(JSON.stringify(partie), { headers: { "Cache-Control": `public, max-age=${GARDE_S}` } })).catch(() => {});
  return partie;
}

/** Les indices, dans l'ordre où ils tombent (un par essai raté). */
export function indice(p, n) {
  if (n === 1) return { n, quoi: "Année", texte: p.annee ? `Sorti en ${p.annee}` + (p.duree ? ` · ${Math.floor(p.duree / 60)} h ${String(p.duree % 60).padStart(2, "0")}` : "") : "Année inconnue" };
  if (n === 2) return { n, quoi: "Genre", texte: p.genres.length ? p.genres.join(", ") : "Genre inconnu" };
  if (n === 3) return { n, quoi: "Réalisation", texte: p.realisateur ? `Réalisé par ${p.realisateur}` : "Réalisateur inconnu" };
  return { n, quoi: "Distribution", texte: p.acteur ? `Avec ${p.acteur}` : "Distribution inconnue" };
}
/** La réponse, à la fin de la partie. */
export const reponse = (p) => ({ titre: p.titre, titreVO: p.titreVO, annee: p.annee, realisateur: p.realisateur, affiche: p.affiche ? `${IMG}w342${p.affiche}` : "", tmdb: p.tmdb });
/** Un essai (l'identifiant d'une fiche de l'addon : tt…, ou tmdb:…) est-il le film du jour ? */
export const bonFilm = (p, id) => typeof id === "string" && ((!!p.imdb && id === p.imdb) || id === `tmdb:${p.tmdb}`);

const finJour = () => { const n = new Date(), p = new Date(n.toLocaleString("en-US", { timeZone: "Europe/Paris" })); return Math.max(60, 86400 - (p.getHours() * 3600 + p.getMinutes() * 60 + p.getSeconds())); };

/** Les routes /jeu… (today : la date de Paris). */
export async function routeJeu(request, env, ctx, url, path, today, headers, saison = "") {
  const json = (d, statut = 200, cc = "no-store") => new Response(JSON.stringify(d), { status: statut, headers: { ...headers, "Cache-Control": cc } });
  if (path === "/jeu") {
    return new Response(jeuPage({ origin: url.origin, date: today, n: numero(today), saison }), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": `public, max-age=${Math.min(300, finJour())}` } });
  }
  const m = /^\/jeu\/(\d{4}-\d{2}-\d{2})\/(image\.jpg|indice\/(\d)|essai)$/.exec(path);
  if (!m || !jourValable(m[1], today)) return json({ error: "introuvable" }, 404, "public, max-age=300");
  const [, date, quoi, nIndice] = m;
  if (quoi === "essai" && request.method !== "POST") return json({ error: "POST attendu" }, 405);
  if (!env.TMDB_API_KEY) return json({ error: "Le jeu a besoin de la clé TMDB du site." }, 503);
  const p = await partieDuJour(env, date);
  if (!p) return json({ error: "TMDB ne répond pas : réessaie dans un instant." }, 503);
  // Une partie passée ne change plus ; celle du jour, jusqu'à minuit (heure de Paris).
  const garde = date < today ? 86400 : finJour();
  if (quoi === "image.jpg") {
    const cle = new Request(`https://cache.local/jeu-v1/${date}/image`);
    const hit = await caches.default.match(cle).catch(() => null);
    if (hit) return new Response(hit.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": `public, max-age=${garde}` } });
    const r = await fetch(`${IMG}w1280${p.fond}`, { cf: { cacheTtl: 86400, cacheEverything: true } }).catch(() => null);
    if (!r || !r.ok) return json({ error: "image indisponible" }, 502, "public, max-age=60");
    const octets = await r.arrayBuffer();
    ctx.waitUntil(caches.default.put(cle, new Response(octets, { headers: { "Content-Type": "image/jpeg", "Cache-Control": `public, max-age=${GARDE_S}` } })).catch(() => {}));
    return new Response(octets, { headers: { "Content-Type": "image/jpeg", "Cache-Control": `public, max-age=${garde}` } });
  }
  if (nIndice) {
    const n = Number(nIndice);
    if (n < 1 || n > INDICES) return json({ error: "introuvable" }, 404, "public, max-age=300");
    return json(indice(p, n), 200, `public, max-age=${garde}`);
  }
  // Un essai : { id } (fiche de l'addon), { id, fin: true } au dernier essai (la réponse est donnée même si c'est raté).
  const corps = await request.json().catch(() => null);
  const id = corps && typeof corps.id === "string" ? corps.id.slice(0, 40) : "";
  const ok = bonFilm(p, id);
  return json(ok || (corps && corps.fin === true) ? { ok, film: reponse(p) } : { ok });
}

// ---------------------------------------------------------------------------------------------------------------
// La page
// ---------------------------------------------------------------------------------------------------------------
export function jeuPage({ origin, date, n, saison = "" }) {
  const LOGO = origin + "/logo.png";
  const jourLong = new Date(date + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return `<!doctype html>
<html lang="fr" data-saison="${esc(saison || "")}">
<head>
<meta charset="utf-8">
${STAGE_HEAD}
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Le film du jour · Nuvio en français</title>
<meta name="description" content="Un film à deviner chaque jour à partir d'une image floutée, en 5 essais. Le même pour tout le monde.">
<meta property="og:title" content="Le film du jour · Nuvio en français">
<meta property="og:description" content="Un film à deviner chaque jour, en 5 essais.">
<meta property="og:image" content="${LOGO}">
<link rel="icon" href="${LOGO}">
${feuilles("polices.css", "scene.css")}
<style>${JEU_CSS}</style>
</head>
<body>
<div class="valance" aria-hidden="true"></div>
${stageTop({ here: "jeu", origin })}
<main class="jeu">
  <header class="hero">
    ${BEAM_HTML}
    <div class="marquee"><small>Le film du jour</small><h1>Devine le film</h1></div>
    <p class="tagline">Une image, cinq essais, le même film pour tout le monde.</p>
    <p class="jour"><b>N° ${n}</b> · ${esc(jourLong.charAt(0).toUpperCase() + jourLong.slice(1))}</p>
  </header>

  <section class="ecran-jeu" aria-labelledby="t-image">
    <h2 id="t-image" class="visually-hidden">L'image du film</h2>
    <div class="toile">
      <canvas id="image" width="960" height="540" role="img" aria-label="Image du film à deviner, très pixelisée"></canvas>
      <p class="chargement" id="chargement">Le projectionniste charge la bobine…</p>
    </div>
    <ol class="essais" id="essais" aria-label="Tes essais">${'<li class="libre"><span class="visually-hidden">Essai libre</span></li>'.repeat(ESSAIS)}</ol>
  </section>

  <section class="jouer" id="jouer" aria-labelledby="t-jouer">
    <h2 id="t-jouer">Ton idée ?</h2>
    <form id="forme" autocomplete="off">
      <div class="champ">
        <label for="q" class="visually-hidden">Titre du film</label>
        <input id="q" type="search" placeholder="Tape un titre de film…" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="propositions" spellcheck="false" enterkeyhint="search">
        <ul id="propositions" role="listbox" aria-label="Films trouvés" hidden></ul>
      </div>
      <div class="actions">
        <button type="submit" class="btn" id="valider" disabled>Valider</button>
        <button type="button" class="btn fantome" id="passer">Passer (indice suivant)</button>
      </div>
      <p class="aide" id="aide" aria-live="polite">Choisis un film dans la liste : chaque essai raté rend l'image plus nette et donne un indice.</p>
    </form>
  </section>

  <section class="indices" aria-labelledby="t-indices">
    <h2 id="t-indices">Indices</h2>
    <ol id="indices">
      ${["Année", "Genre", "Réalisation", "Distribution"].map((q, i) => `<li class="ferme"><b>${q}</b><span>Après ton ${i ? i + 1 + "e" : "1er"} essai raté</span></li>`).join("\n      ")}
    </ol>
    <ul class="rates" id="rates" aria-label="Essais ratés"></ul>
  </section>

  <section class="fin" id="fin" hidden aria-labelledby="t-fin" tabindex="-1">
    <div class="billet">
      <span class="affiche" id="f-affiche"></span>
      <div class="f-texte">
        <p class="f-statut" id="f-statut"></p>
        <h2 id="t-fin"></h2>
        <p class="f-infos" id="f-infos"></p>
        <p class="f-carres" id="f-carres" aria-hidden="true"></p>
        <div class="actions">
          <button type="button" class="btn" id="partager">Partager mon score</button>
        </div>
        <p class="f-demain" id="f-demain"></p>
      </div>
    </div>
    <div class="stats" aria-labelledby="t-stats">
      <h3 id="t-stats">Tes statistiques</h3>
      <dl id="stats"></dl>
      <div class="repartition" id="repartition" aria-label="Victoires selon le nombre d'essais"></div>
    </div>
  </section>
</main>
${scripts("scene.js")}
<script>
const JEU = ${JSON.stringify({ origin, date, n, essais: ESSAIS }).replace(/</g, "\\u003c")};
${JEU_JS}
</script>
</body>
</html>`;
}

const JEU_CSS = `
:root {
  --velvet: #170c12; --velvet-2: #22121b; --seat: #3d2230; --cream: #f5ead8; --dim: #b9a59c;
  --bulb: #ffcf6b; --red: #e5413a; --ink: #2a1a14; --green: #5fd39a;
  --display: "Bebas Neue", Impact, "Arial Narrow", sans-serif;
  --body: "Figtree", "Segoe UI", system-ui, sans-serif;
  --serif: "Instrument Serif", Georgia, serif;
  color-scheme: dark;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html { overflow-x: clip; }
html, body { margin: 0; }
body { position: relative; color: var(--cream); font: 16px/1.6 var(--body);
  background: radial-gradient(ellipse 80% 40% at 50% -5%, rgba(229,65,58,.22), transparent 70%), repeating-linear-gradient(90deg, rgba(0,0,0,.18) 0 2px, transparent 2px 46px), var(--velvet);
  padding: max(104px, calc(env(safe-area-inset-top) + 92px)) max(16px, env(safe-area-inset-right)) calc(40px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); }
.valance { position: absolute; inset: 0 0 auto; height: 74px; pointer-events: none; z-index: 1;
  background: radial-gradient(ellipse 34px 30px at 34px 0, #6d1420 0 28px, transparent 29px) 0 46px / 68px 32px repeat-x, repeating-linear-gradient(90deg, rgba(0,0,0,.28) 0 3px, transparent 3px 22px, rgba(255,255,255,.04) 22px 24px, transparent 24px 34px), linear-gradient(#4a0c15, #7a1824 70%, #5a0f1a);
  -webkit-mask: linear-gradient(#000, #000) top / 100% 48px no-repeat, radial-gradient(ellipse 34px 30px at 34px 0, #000 28px, transparent 29px) 0 46px / 68px 32px repeat-x;
          mask: linear-gradient(#000, #000) top / 100% 48px no-repeat, radial-gradient(ellipse 34px 30px at 34px 0, #000 28px, transparent 29px) 0 46px / 68px 32px repeat-x; }
a { color: var(--bulb); }
:focus-visible { outline: 3px solid var(--bulb); outline-offset: 3px; border-radius: 8px; }
.visually-hidden { position: absolute !important; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.jeu { max-width: 860px; margin: 0 auto; display: grid; gap: 28px; }
.jeu > * { min-width: 0; }
.hero { position: relative; display: grid; justify-items: center; gap: 10px; text-align: center; }
.hero .tagline { margin: 0; font: italic 400 1.45rem/1.25 var(--serif); color: var(--bulb); }
.hero .jour { margin: 0; color: var(--dim); }
.hero .jour b { color: var(--cream); }
h2 { margin: 0; font: 400 1.9rem/1 var(--display); letter-spacing: .04em; }
h3 { margin: 0; font: 400 1.4rem/1 var(--display); letter-spacing: .04em; color: var(--bulb); }
/* L'écran : l'image pixelisée dans un cadre de salle, puis les cinq essais en tickets. */
.ecran-jeu { display: grid; gap: 14px; justify-items: center; }
.ecran-jeu > * { width: min(100%, calc(58vh * 16 / 9), 860px); }
.toile { position: relative; aspect-ratio: 16 / 9; border-radius: 10px; overflow: hidden; background: #050304;
  box-shadow: 0 0 0 6px #120a0d, 0 0 0 8px #c9a227, 0 24px 60px rgba(0,0,0,.6), 0 0 90px rgba(255,236,190,.12); }
.toile canvas { display: block; width: 100%; height: 100%; image-rendering: pixelated; transition: filter .5s ease; }
.toile.net canvas { image-rendering: auto; }
.chargement { position: absolute; inset: 0; margin: 0; display: grid; place-items: center; padding: 16px; text-align: center; color: var(--dim); font: italic 1.1rem var(--serif); }
.essais { display: grid; grid-template-columns: repeat(${ESSAIS}, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
.essais li { height: 12px; border-radius: 99px; background: var(--seat); transition: background .3s ease; }
.essais li.rate { background: var(--red); }
.essais li.gagne { background: var(--green); box-shadow: 0 0 14px rgba(95,211,154,.6); }
.essais li.encours { background: rgba(255,207,107,.55); }
/* Le champ et ses propositions */
.jouer { display: grid; gap: 12px; padding: 20px; border-radius: 18px; background: var(--velvet-2); border: 1px solid var(--seat); }
#forme { display: grid; gap: 12px; }
.champ { position: relative; }
.champ input { width: 100%; padding: 14px 16px; border-radius: 12px; border: 1.5px solid var(--seat); background: #0f080c; color: var(--cream); font: 600 1.05rem var(--body); }
.champ input:focus { outline: none; border-color: var(--bulb); box-shadow: 0 0 0 3px rgba(255,207,107,.25); }
.champ input::-webkit-search-cancel-button { filter: invert(1); }
#propositions { position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 6px); max-height: 330px; overflow-y: auto; margin: 0; padding: 6px; list-style: none;
  border-radius: 12px; background: #1b0f15; border: 1px solid var(--seat); box-shadow: 0 18px 40px rgba(0,0,0,.6); }
#propositions li { display: flex; align-items: center; gap: 12px; padding: 7px 10px; border-radius: 9px; cursor: pointer; }
#propositions li[aria-selected="true"], #propositions li:hover { background: rgba(255,207,107,.14); }
#propositions img, #propositions .sans { flex: none; width: 34px; height: 51px; border-radius: 4px; object-fit: cover; background: var(--seat); }
#propositions b { display: block; font-weight: 700; line-height: 1.25; }
#propositions small { color: var(--dim); }
#propositions .vide { cursor: default; color: var(--dim); }
.actions { display: flex; flex-wrap: wrap; gap: 10px; }
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 10px 20px; border-radius: 99px; border: 1.5px solid var(--bulb); background: var(--bulb); color: var(--ink);
  font: 800 .98rem var(--body); text-decoration: none; cursor: pointer; transition: transform .12s ease, background .2s ease; }
.btn:hover { transform: translateY(-1px); }
.btn:active { transform: scale(.97); }
.btn:disabled { opacity: .45; cursor: not-allowed; transform: none; }
.btn.fantome { background: transparent; color: var(--bulb); }
.aide { margin: 0; color: var(--dim); font-size: .95rem; }
.aide.erreur { color: #ffb4a8; }
/* Les indices : des cartons qui se retournent */
.indices { display: grid; gap: 12px; }
#indices { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 0; padding: 0; list-style: none; }
#indices li { display: grid; gap: 4px; align-content: start; min-height: 92px; padding: 12px 14px; border-radius: 12px; background: var(--cream); color: var(--ink); animation: carton .5s cubic-bezier(.2,.8,.3,1) both; }
#indices li b { font: 800 .72rem var(--body); letter-spacing: .14em; text-transform: uppercase; color: #7a5a4c; }
#indices li span { font-weight: 700; line-height: 1.3; overflow-wrap: anywhere; }
#indices li.ferme { background: transparent; color: var(--dim); border: 1.5px dashed var(--seat); animation: none; }
#indices li.ferme b { color: var(--dim); }
#indices li.ferme span { font-weight: 400; font-size: .9rem; }
@keyframes carton { from { transform: rotateX(80deg); opacity: 0; } }
.rates { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
.rates li { padding: 5px 12px; border-radius: 99px; background: rgba(229,65,58,.14); border: 1px solid rgba(229,65,58,.5); color: #ffd6cf; font-size: .92rem; }
.rates li.passe { background: transparent; border-style: dashed; color: var(--dim); }
/* La fin : un billet avec l'affiche, puis les statistiques */
.fin { display: grid; gap: 22px; outline: none; }
.billet { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 20px; padding: 18px; border-radius: 18px; background: var(--cream); color: var(--ink); box-shadow: 0 20px 50px rgba(0,0,0,.45); animation: carton .6s cubic-bezier(.2,.8,.3,1) both; }
.billet img { width: 160px; height: auto; aspect-ratio: 2 / 3; border-radius: 8px; object-fit: cover; background: #d8c8b0; }
.f-texte { display: grid; gap: 8px; align-content: start; }
.f-texte h2 { font-size: 2.3rem; color: var(--ink); }
.f-statut { margin: 0; font: 800 .78rem var(--body); letter-spacing: .14em; text-transform: uppercase; color: #8a3a2a; }
.f-infos, .f-demain { margin: 0; color: #5a4036; }
.f-carres { margin: 0; font-size: 1.5rem; letter-spacing: .1em; }
.billet .affiche { display: block; }
.stats { display: grid; gap: 12px; padding: 18px; border-radius: 18px; background: var(--velvet-2); border: 1px solid var(--seat); }
.stats dl { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 0; text-align: center; }
.stats dl div { display: grid; }
.stats dt { order: 2; color: var(--dim); font-size: .85rem; }
.stats dd { order: 1; margin: 0; font: 400 2.2rem/1 var(--display); color: var(--bulb); }
.repartition { display: grid; gap: 6px; }
.repartition div { display: grid; grid-template-columns: 1.2em minmax(0, 1fr); gap: 8px; align-items: center; font-weight: 700; }
.repartition i { display: block; min-width: 2.2em; padding: 2px 8px; border-radius: 6px; background: var(--seat); font-style: normal; text-align: right; font-size: .85rem; }
.repartition div.ici i { background: var(--green); color: var(--ink); }
@media (max-width: 700px) {
  #indices { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .billet { grid-template-columns: 96px minmax(0, 1fr); gap: 14px; padding: 14px; }
  .billet img { width: 96px; }
  .f-texte h2 { font-size: 1.8rem; }
  .stats dl { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .jouer { padding: 16px; }
}
@media (prefers-reduced-motion: reduce) { #indices li, .billet { animation: none; } .toile canvas, .essais li { transition: none; } .btn { transition: none; } }
`;

const JEU_JS = String.raw`(() => {
  const $ = (id) => document.getElementById(id);
  const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const calme = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const base = JEU.origin + "/jeu/" + JEU.date;
  const NIVEAUX = [16, 24, 36, 56, 90];   // largeur de l'image en gros pixels, essai après essai

  // ---------- Ce que garde ce navigateur : les parties jouées (stats, série) ----------
  const CLE = "jeu-film-v1";
  const lire = () => { try { const d = JSON.parse(localStorage.getItem(CLE) || "{}"); return d && typeof d === "object" && d.parties && typeof d.parties === "object" ? d : { parties: {} }; } catch (e) { return { parties: {} }; } };
  const ecrire = (d) => {
    // Une année d'historique au plus.
    const jours = Object.keys(d.parties).sort(); while (jours.length > 400) delete d.parties[jours.shift()];
    try { localStorage.setItem(CLE, JSON.stringify(d)); } catch (e) {}
  };
  const memoire = lire();
  const partie = memoire.parties[JEU.date] = memoire.parties[JEU.date] || { essais: [], fini: false, gagne: false };
  if (!Array.isArray(partie.essais)) partie.essais = [];
  partie.essais = partie.essais.filter((e) => e && typeof e === "object").slice(0, JEU.essais);

  // ---------- L'image : dessinée en gros pixels, plus fine à chaque essai raté ----------
  const canvas = $("image"), cx = canvas.getContext("2d"), petit = document.createElement("canvas"), pcx = petit.getContext("2d");
  const img = new Image();
  let imgPrete = false;
  const dessine = () => {
    if (!imgPrete) return;
    const fini = partie.fini, rates = partie.essais.filter((e) => !e.ok).length;
    canvas.parentElement.classList.toggle("net", fini);
    if (fini) { cx.imageSmoothingEnabled = true; cx.drawImage(img, 0, 0, canvas.width, canvas.height); canvas.setAttribute("aria-label", "Image du film, en entier"); return; }
    const w = NIVEAUX[Math.min(rates, NIVEAUX.length - 1)], h = Math.max(1, Math.round(w * 9 / 16));
    petit.width = w; petit.height = h; pcx.imageSmoothingEnabled = true; pcx.drawImage(img, 0, 0, w, h);
    cx.imageSmoothingEnabled = false; cx.clearRect(0, 0, canvas.width, canvas.height); cx.drawImage(petit, 0, 0, w, h, 0, 0, canvas.width, canvas.height);
    canvas.setAttribute("aria-label", "Image du film à deviner, pixelisée (niveau " + (Math.min(rates, 4) + 1) + " sur 5)");
  };
  img.onload = () => { imgPrete = true; $("chargement").remove(); dessine(); };
  img.onerror = () => { $("chargement").textContent = "La bobine n'a pas pu être chargée. Recharge la page dans un instant."; };
  img.src = base + "/image.jpg";

  // ---------- Essais, indices ----------
  const indices = [...$("indices").children];
  const montreIndice = (n) => fetch(base + "/indice/" + n).then((r) => r.ok ? r.json() : Promise.reject()).then((d) => {
    const li = indices[n - 1]; if (!li || !li.classList.contains("ferme")) return;
    li.classList.remove("ferme"); li.lastElementChild.textContent = d.texte;
  }).catch(() => {});
  const dessineEssais = () => {
    const lis = [...$("essais").children];
    lis.forEach((li, i) => {
      const e = partie.essais[i];
      li.className = e ? (e.ok ? "gagne" : "rate") : (i === partie.essais.length && !partie.fini ? "encours" : "libre");
      li.firstElementChild.textContent = e ? (e.ok ? "Essai " + (i + 1) + " : trouvé" : "Essai " + (i + 1) + " : raté (" + (e.nom || "passé") + ")") : "Essai " + (i + 1) + " : libre";
    });
    const rates = $("rates"); rates.textContent = "";
    partie.essais.filter((e) => !e.ok).forEach((e) => rates.append(mk("li", e.id ? null : "passe", e.id ? "✗ " + e.nom : "Passé")));
    const r = partie.essais.filter((e) => !e.ok).length;
    for (let n = 1; n <= Math.min(r, indices.length); n++) montreIndice(n);
  };

  // ---------- La fin : le billet, le partage, les statistiques ----------
  const carres = () => partie.essais.map((e) => (e.ok ? "🟩" : "🟥")).join("") + "⬛".repeat(Math.max(0, JEU.essais - partie.essais.length));
  const texteBilan = () => "Catalogue FR · Film du jour n°" + JEU.n + " " + carres() + "\n" + JEU.origin + "/jeu";
  const stats = () => {
    const jours = Object.keys(memoire.parties).filter((j) => memoire.parties[j] && memoire.parties[j].fini).sort();
    const gagnes = jours.filter((j) => memoire.parties[j].gagne);
    // Série : jours gagnés d'affilée jusqu'à aujourd'hui (ou hier, si la partie du jour n'est pas encore finie).
    const veille = (j) => new Date(Date.parse(j + "T12:00:00Z") - 86400000).toISOString().slice(0, 10);
    let serie = 0, j = partie.fini ? JEU.date : veille(JEU.date);
    while (memoire.parties[j] && memoire.parties[j].gagne) { serie++; j = veille(j); }
    let record = 0, cours = 0, prec = null;
    for (const d of jours) { if (memoire.parties[d].gagne) { cours = prec && veille(d) === prec ? cours + 1 : 1; record = Math.max(record, cours); prec = d; } else { cours = 0; prec = null; } }
    const repartition = Array.from({ length: JEU.essais }, (_, i) => gagnes.filter((d) => (memoire.parties[d].essais || []).length === i + 1).length);
    return { jouees: jours.length, pct: jours.length ? Math.round(gagnes.length / jours.length * 100) : 0, serie, record: Math.max(record, serie), repartition };
  };
  const tempsAvantDemain = () => {
    const p = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
    const s = 86400 - (p.getHours() * 3600 + p.getMinutes() * 60 + p.getSeconds()), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    return h ? h + " h " + String(m).padStart(2, "0") : m + " min";
  };
  const montreFin = (anime) => {
    const f = partie.film || {};
    $("jouer").hidden = true;
    const fin = $("fin"); fin.hidden = false;
    const n = partie.essais.length;
    $("f-statut").textContent = partie.gagne ? (n === 1 ? "Du premier coup !" : "Trouvé en " + n + " essais") : "Raté pour cette fois";
    $("t-fin").textContent = f.titre || "Le film du jour";
    $("f-infos").textContent = [f.titreVO, f.annee, f.realisateur ? "de " + f.realisateur : ""].filter(Boolean).join(" · ");
    $("f-carres").textContent = carres();
    const aff = $("f-affiche"); aff.textContent = "";
    if (f.affiche) { const im = mk("img"); im.src = f.affiche; im.alt = "Affiche de " + (f.titre || "ce film"); im.width = 342; im.height = 513; aff.append(im); } else aff.hidden = true;
    $("f-demain").textContent = "Prochain film dans " + tempsAvantDemain() + ".";
    const s = stats(), dl = $("stats"); dl.textContent = "";
    [["Parties", s.jouees], ["Gagnées", s.pct + " %"], ["Série en cours", s.serie], ["Meilleure série", s.record]].forEach(([t, v]) => { const d = mk("div"); d.append(mk("dt", null, t), mk("dd", null, String(v))); dl.append(d); });
    const rep = $("repartition"); rep.textContent = ""; const max = Math.max(1, ...s.repartition);
    s.repartition.forEach((v, i) => {
      const l = mk("div", partie.gagne && i === n - 1 ? "ici" : null); l.append(mk("span", null, String(i + 1)));
      const barre = mk("i", null, String(v)); barre.style.width = Math.max(8, v / max * 100) + "%"; l.append(barre);
      l.setAttribute("aria-label", v + " victoire" + (v > 1 ? "s" : "") + " en " + (i + 1) + " essai" + (i ? "s" : "")); rep.append(l);
    });
    dessine(); dessineEssais();
    if (anime) {
      fin.focus({ preventScroll: true }); fin.scrollIntoView({ behavior: calme ? "auto" : "smooth", block: "start" });
      if (partie.gagne) { if (window.popcornRain) popcornRain(); if (window.bravo) bravo(); if (window.secret) secret("cinephile"); }
    }
  };
  $("partager").addEventListener("click", async () => {
    const texte = texteBilan();
    if (navigator.share && matchMedia("(pointer: coarse)").matches) { try { await navigator.share({ text: texte }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(texte); if (window.toast) toast("Score copié : colle-le où tu veux."); }
    catch (e) { if (window.toast) toast("Copie impossible ici : " + texte, true); }
  });

  // ---------- Jouer : un film choisi dans la liste, ou passer ----------
  const aide = $("aide"), q = $("q"), liste = $("propositions"), valider = $("valider");
  let choix = null, actif = -1, propositions = [], attente = 0, enCours = null;
  const dit = (t, erreur) => { aide.textContent = t; aide.classList.toggle("erreur", !!erreur); };
  const ferme = () => { liste.hidden = true; q.setAttribute("aria-expanded", "false"); q.removeAttribute("aria-activedescendant"); actif = -1; };
  const surligne = (i) => {
    actif = i;
    [...liste.children].forEach((li, k) => li.setAttribute("aria-selected", String(k === i)));
    const li = liste.children[i];
    if (li && li.id) { q.setAttribute("aria-activedescendant", li.id); li.scrollIntoView({ block: "nearest" }); } else q.removeAttribute("aria-activedescendant");
  };
  const prend = (m) => { choix = m; q.value = m.name + (m.annee ? " (" + m.annee + ")" : ""); valider.disabled = false; ferme(); q.focus(); };
  const petiteAffiche = (u) => String(u || "").replace(/\/t\/p\/(w\d+|original)\//, "/t/p/w92/");
  const remplit = (metas) => {
    liste.textContent = ""; propositions = metas;
    if (!metas.length) { const li = mk("li", "vide", "Aucun film trouvé : essaie un autre titre."); li.setAttribute("role", "option"); li.setAttribute("aria-disabled", "true"); liste.append(li); }
    metas.forEach((m, i) => {
      const li = mk("li"); li.id = "prop-" + i; li.setAttribute("role", "option"); li.setAttribute("aria-selected", "false");
      if (m.poster) { const im = mk("img"); im.alt = ""; im.loading = "lazy"; im.src = petiteAffiche(m.poster); li.append(im); } else li.append(mk("span", "sans"));
      const t = mk("span"); t.append(mk("b", null, m.name)); if (m.annee) t.append(mk("small", null, m.annee)); li.append(t);
      li.addEventListener("mousedown", (e) => e.preventDefault());
      li.addEventListener("click", () => prend(m));
      liste.append(li);
    });
    liste.hidden = false; q.setAttribute("aria-expanded", "true"); actif = -1;
    if (liste.getBoundingClientRect().bottom > innerHeight) liste.scrollIntoView({ block: "nearest", behavior: calme ? "auto" : "smooth" });
  };
  const deja = new Set(partie.essais.map((e) => e.id).filter(Boolean));
  const cherche = (texte) => {
    if (enCours) enCours.abort();
    const ctl = enCours = new AbortController();
    fetch(JEU.origin + "/catalog/movie/recherche-films/search=" + encodeURIComponent(texte) + ".json", { signal: ctl.signal })
      .then((r) => r.json()).then((d) => {
        if (ctl !== enCours) return;
        const metas = ((d && d.metas) || []).filter((m) => m && m.id && m.name).slice(0, 8).map((m) => ({ id: String(m.id), name: m.name, poster: m.poster, annee: (/^\d{4}/.exec(m.releaseInfo || "") || [""])[0] }));
        remplit(metas.filter((m) => !deja.has(m.id)));
      }).catch((e) => { if (e && e.name !== "AbortError") dit("La recherche ne répond pas : réessaie dans un instant.", true); });
  };
  q.addEventListener("input", () => {
    choix = null; valider.disabled = true; clearTimeout(attente);
    const t = q.value.trim();
    if (t.length < 3) { ferme(); return; }   // 3 lettres : chaque recherche nouvelle coûte une vingtaine d'appels TMDB
    attente = setTimeout(() => cherche(t), 350);
  });
  q.addEventListener("keydown", (e) => {
    const n = liste.hidden ? 0 : propositions.length;
    if (e.key === "ArrowDown" && n) { e.preventDefault(); surligne((actif + 1) % n); }
    else if (e.key === "ArrowUp" && n) { e.preventDefault(); surligne((actif - 1 + n) % n); }
    else if (e.key === "Enter" && n && actif >= 0) { e.preventDefault(); prend(propositions[actif]); }
    else if (e.key === "Escape" && !liste.hidden) { e.preventDefault(); ferme(); }
  });
  q.addEventListener("blur", () => setTimeout(ferme, 150));

  const joue = async (essai) => {
    if (partie.fini) return;
    valider.disabled = true; $("passer").disabled = true;
    const dernier = partie.essais.length + 1 >= JEU.essais;
    let rep = null;
    if (essai.id) {
      try {
        const r = await fetch(base + "/essai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: essai.id, fin: dernier }) });
        if (!r.ok) throw new Error(r.status);
        rep = await r.json();
      } catch (e) { dit("La salle ne répond pas : ton essai n'a pas compté, réessaie.", true); valider.disabled = false; $("passer").disabled = false; return; }
    } else if (dernier) {
      try { rep = await (await fetch(base + "/essai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "", fin: true }) })).json(); } catch (e) { rep = { ok: false }; }
    } else rep = { ok: false };
    partie.essais.push({ id: essai.id || "", nom: essai.nom || "", ok: !!rep.ok });
    if (essai.id) deja.add(essai.id);
    if (rep.ok || dernier) { partie.fini = true; partie.gagne = !!rep.ok; partie.film = rep.film || null; }
    ecrire(memoire);
    q.value = ""; choix = null; $("passer").disabled = false;
    if (partie.fini) { montreFin(true); return; }
    if (window.sfx) sfx.click();
    const reste = JEU.essais - partie.essais.length;
    dit((essai.id ? "Raté ! " : "") + "L'image est un peu plus nette, et un indice est tombé. Plus que " + reste + " essai" + (reste > 1 ? "s" : "") + ".");
    dessine(); dessineEssais(); q.focus();
  };
  $("forme").addEventListener("submit", (e) => { e.preventDefault(); if (choix) joue({ id: choix.id, nom: choix.name }); });
  $("passer").addEventListener("click", () => joue({ id: "", nom: "" }));

  dessineEssais();
  if (partie.fini) montreFin(false);
})();`;
