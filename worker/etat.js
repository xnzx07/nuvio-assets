/**
 * La salle des machines (/etat) : ce qui tourne et ce qui coince, en clair. Le worker teste lui-même, au plus une fois
 * toutes les 5 minutes (le bilan est gardé), TMDB, le manifest, une rangée, la recherche, le service des affiches, le
 * serveur des affiches (RELAIS_URL : son adresse reste un secret, jamais dans le bilan),
 * l'hébergement des tuiles des collections (raw.githubusercontent.com) et la base D1 s'il en a une ; il lit la date de
 * la mise à jour de la nuit (addon/state.json du dépôt). /etat.json : le même bilan, pour le canari
 * (.github/workflows/canari.yml) et pour qui veut le lire.
 *
 * Voyants : vert (ça marche), orange (ça marche mal : lent, vide, en retard), rouge (en panne), éteint (sans objet ici,
 * par exemple pas de base sur une copie Docker).
 */
import { esc } from "./outils-serveur.js";
import { STAGE_HEAD, stageTop, BEAM_HTML } from "./stage.js";
import { feuilles, scripts } from "./statique.js";
import { LOGO_V } from "./reglages.js";

export const ETAT_GARDE_S = 300;
const DELAI_MS = 8000;      // au-delà : en panne
const LENT_MS = 4000;       // au-delà : lent (orange)
// Les essentiels : sans eux, Nuvio n'affiche plus rien du Catalogue FR (bilan rouge).
const ESSENTIELS = new Set(["tmdb", "manifest", "rangee"]);

const avecDelai = (p) => Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(new Error("délai dépassé")), DELAI_MS))]);
const ajoute = (iso, j) => new Date(Date.parse(iso + "T12:00:00Z") + j * 86400000).toISOString().slice(0, 10);

/** Un contrôle : la fonction rend { etat?, detail } ou lève une erreur (rouge) ; le temps passé est mesuré. */
async function controle(id, nom, fn) {
  const t0 = Date.now();
  try {
    const r = await avecDelai(fn());
    const ms = Date.now() - t0;
    const etat = r.etat || (ms > LENT_MS ? "orange" : "vert");
    return { id, nom, etat, ms, detail: r.detail || "" };
  } catch (e) {
    return { id, nom, etat: "rouge", ms: Date.now() - t0, detail: String((e && e.message) || e).replace(/\?\S*/g, "").slice(0, 160) };
  }
}
const lireJson = async (r) => { if (!r.ok) throw new Error(`réponse ${r.status}`); return r.json(); };

/**
 * Le bilan complet. outils : { version, assets (dépôt brut), affiches (service d'affiches), appel(chemin) (l'addon
 * lui-même), appelCatalogue(chemin) (qui sert vraiment les rangées, s'il n'est pas l'addon lui-même), today (date de Paris) }.
 */
export async function bilan(env, outils) {
  const { version, assets, affiches, appel, appelCatalogue = appel, today } = outils;
  const controles = await Promise.all([
    controle("tmdb", "TMDB", async () => {
      if (!env.TMDB_API_KEY) throw new Error("clé TMDB absente");
      const r = await fetch(`https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(env.TMDB_API_KEY)}`);
      const d = await lireJson(r);
      if (!d || !d.images) throw new Error("réponse inattendue");
      return {};
    }),
    controle("manifest", "Manifest de l'addon", async () => {
      const d = await lireJson(await appel("/manifest.json"));
      if (!Array.isArray(d.catalogs) || !d.catalogs.length) throw new Error("aucune rangée");
      return { detail: `${d.catalogs.length} catalogues` };
    }),
    controle("rangee", "Une rangée de l'accueil", async () => {
      const d = await lireJson(await appelCatalogue("/catalog/movie/accueil-top10.json"));
      const n = Array.isArray(d.metas) ? d.metas.length : 0;
      return n ? { detail: `${n} films` } : { etat: "orange", detail: "rangée vide" };
    }),
    controle("recherche", "Recherche", async () => {
      const d = await lireJson(await appelCatalogue("/catalog/movie/recherche-films/search=dune.json"));
      const n = Array.isArray(d.metas) ? d.metas.length : 0;
      return n ? { detail: `${n} résultats` } : { etat: "orange", detail: "aucun résultat" };
    }),
    controle("affiches", "Service des affiches", async () => {
      const r = await fetch(`${affiches}/movie/poster/tt0111161.jpg`);
      if (!r.ok) throw new Error(`réponse ${r.status}`);
      if (!/^image\//.test(r.headers.get("Content-Type") || "")) throw new Error("pas une image");
      await r.arrayBuffer();
      return {};
    }),
    controle("serveur", "Serveur des affiches", async () => {
      if (!env.RELAIS_URL) return { etat: "eteint", detail: "pas de serveur sur ce site" };
      const d = await lireJson(await fetch(`${env.RELAIS_URL}/etat`));
      if (d.erreur) return { etat: "orange", detail: String(d.erreur).replace(/https?:\/\/\S+/g, "").slice(0, 120) };
      // Des affiches dessinées qui attendent depuis plus d'une heure : la mise en fichiers ne passe plus.
      const enRetard = !d.dernierePublication || Date.now() - Date.parse(d.dernierePublication) > 3600000;
      if (d.enAttente > 100 && enRetard) return { etat: "orange", detail: `${d.enAttente} affiches pas encore en fichiers` };
      return { detail: `${d.dessinees} dessinées, ${d.enAttente} en attente` };
    }),
    controle("tuiles", "Tuiles des collections", async () => {
      const liste = await lireJson(await fetch(`${assets}/collections/collections.json`, { cf: { cacheTtl: 600, cacheEverything: true } }));
      const image = (liste || []).flatMap((c) => c.folders || []).map((f) => f.coverImageUrl).find((u) => /^https:\/\//.test(u || ""));
      if (!image) return { etat: "orange", detail: "aucune tuile" };
      const r = await fetch(image, { method: "HEAD" });
      if (!r.ok) throw new Error(`image : réponse ${r.status}`);
      return {};
    }),
    controle("base", "Base des liens fixes", async () => {
      if (!env.LIENS) return { etat: "eteint", detail: "pas de base sur ce site" };
      await env.LIENS.prepare("SELECT 1").first();
      return {};
    }),
  ]);
  // La mise à jour de la nuit (workflow « Mettre à jour l'addon », vers 5 h) : sa date, ses listes en échec.
  let nuit;
  try {
    const s = await avecDelai(fetch(`${assets}/addon/state.json`, { cf: { cacheTtl: 300, cacheEverything: true } }).then(lireJson));
    const date = /^\d{4}-\d{2}-\d{2}$/.test(s.date || "") ? s.date : "";
    const rates = Array.isArray(s.failed) ? s.failed.length : 0;
    const etat = !date ? "rouge" : date >= ajoute(today, -1) ? (rates ? "orange" : "vert") : date >= ajoute(today, -3) ? "orange" : "rouge";
    nuit = { date, saison: typeof s.label === "string" ? s.label.slice(0, 60) : "", rates, etat };
  } catch (e) {
    nuit = { date: "", saison: "", rates: 0, etat: "rouge" };
  }
  const global = controles.some((c) => c.etat === "rouge" && ESSENTIELS.has(c.id)) ? "rouge"
    : controles.some((c) => c.etat === "rouge" || c.etat === "orange") || nuit.etat !== "vert" ? "orange" : "vert";
  return { version, verifie: new Date().toISOString(), global, nuit, controles };
}

let memoire = null;
/** Pour les tests : oublier le dernier bilan. */
export const oublierEtat = () => { memoire = null; };

/** Le bilan gardé 5 minutes (mémoire de l'instance, puis cache de Cloudflare), refait au-delà. */
async function bilanGarde(env, ctx, url, outils) {
  if (memoire && memoire.host === url.host && Date.now() - memoire.t < ETAT_GARDE_S * 1000) return memoire.b;
  const cle = new Request(`https://cache.local/etat-v1/${url.host}`);
  const hit = await caches.default.match(cle).catch(() => null);
  if (hit) {
    const b = await hit.json().catch(() => null);
    if (b && Date.now() - Date.parse(b.verifie) < ETAT_GARDE_S * 1000) { memoire = { host: url.host, t: Date.parse(b.verifie), b }; return b; }
  }
  const b = await bilan(env, outils);
  memoire = { host: url.host, t: Date.now(), b };
  const garde = caches.default.put(cle, new Response(JSON.stringify(b), { headers: { "Cache-Control": `public, max-age=${ETAT_GARDE_S}` } })).catch(() => {});
  if (ctx && ctx.waitUntil) ctx.waitUntil(garde);
  return b;
}

/** /etat (la page) et /etat.json (le bilan). */
export async function routeEtat(request, env, ctx, url, path, outils, headers) {
  if (path === "/etat") {
    return new Response(etatPage({ origin: url.origin, version: outils.version, saison: outils.saison }), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  }
  const b = await bilanGarde(env, ctx, url, outils);
  const reste = Math.max(10, Math.min(60, ETAT_GARDE_S - Math.round((Date.now() - Date.parse(b.verifie)) / 1000)));
  return new Response(JSON.stringify(b), { headers: { ...headers, "Cache-Control": `public, max-age=${reste}` } });
}

// ---------------------------------------------------------------------------------------------------------------
// La page : la cabine de projection, son pupitre et ses voyants (remplis par /etat.json).
// ---------------------------------------------------------------------------------------------------------------
// Ce que dit chaque voyant, selon sa couleur.
export const TEXTES = {
  tmdb: { vert: "TMDB répond : fiches, affiches et rangées arrivent.", orange: "TMDB répond lentement : les rangées mettent plus de temps à s'afficher.", rouge: "TMDB ne répond pas : les rangées et les fiches peuvent rester vides. Ça vient de chez eux, et ça revient en général tout seul." },
  manifest: { vert: "Nuvio peut lire l'addon : la liste des rangées est servie.", orange: "L'addon répond lentement : Nuvio peut mettre du temps à l'ouvrir.", rouge: "Nuvio ne peut plus lire l'addon : les rangées du Catalogue FR ne s'affichent pas. Réessaie dans quelques minutes." },
  rangee: { vert: "La rangée « Tendances du jour » se remplit.", orange: "La rangée « Tendances du jour » est lente ou vide pour le moment.", rouge: "Les rangées ne se remplissent pas : l'accueil reste vide." },
  recherche: { vert: "La recherche trouve les films.", orange: "La recherche est lente ou ne trouve rien pour le moment.", rouge: "La recherche ne répond pas : chercher un titre dans Nuvio ne donne rien." },
  affiches: { vert: "Le service des affiches maison répond.", orange: "Les affiches maison arrivent lentement.", rouge: "Les affiches maison ne s'affichent pas : Nuvio montre les affiches d'origine en attendant." },
  serveur: { vert: "Le serveur des affiches dessine les affiches nouvelles et les aperçus de la régie.", orange: "Le serveur des affiches répond, mais les affiches nouvelles mettent du temps à passer en fichiers.", rouge: "Le serveur des affiches ne répond pas : les affiches déjà faites s'affichent, les nouvelles montrent l'affiche d'origine.", eteint: "Pas de serveur des affiches sur ce site." },
  tuiles: { vert: "Les images des collections (plateformes, genres, sagas) sont en ligne.", orange: "Les images des collections sont lentes à venir.", rouge: "GitHub ne sert plus les images des collections : les tuiles restent grises." },
  base: { vert: "La base des liens fixes répond : ils gardent tes réglages.", orange: "La base des liens fixes est lente.", rouge: "La base des liens fixes ne répond pas : les liens fixes peuvent échouer, les liens habituels marchent toujours.", eteint: "Pas de base sur ce site : les liens fixes n'y sont pas proposés, c'est normal." },
};

export function etatPage({ origin, version, saison = "" }) {
  const LOGO = `${origin}/logo.png?v=${LOGO_V}`;
  const voyant = (id, nom) => `<li class="voyant" data-id="${id}" data-etat="attente"><i class="lampe" aria-hidden="true"></i><div><b>${esc(nom)}</b><span class="etat">En test…</span><p class="texte"></p></div><small class="ms"></small></li>`;
  return `<!doctype html>
<html lang="fr" data-saison="${esc(saison || "")}">
<head>
<meta charset="utf-8">
${STAGE_HEAD}
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Salle des machines · Nuvio en français</title>
<meta name="description" content="Est-ce que tout tourne ? TMDB, l'addon, la recherche, les affiches : l'état du Catalogue FR en direct.">
<link rel="icon" href="${LOGO}">
${feuilles("polices.css", "scene.css")}
<style>${ETAT_CSS}</style>
</head>
<body>
<div class="valance" aria-hidden="true"></div>
${stageTop({ here: "etat", origin })}
<main class="machines">
  <header class="hero">
    ${BEAM_HTML}
    <div class="marquee"><small>La cabine de projection</small><h1>Salle des machines</h1></div>
    <p class="tagline">Quand l'écran reste noir, c'est ici qu'on regarde d'abord.</p>
  </header>

  <section class="bilan" id="bilan" data-etat="attente" aria-live="polite">
    <i class="lampe grande" aria-hidden="true"></i>
    <div><h2 id="bilan-titre">Le projectionniste fait le tour des machines…</h2><p id="bilan-texte">Les tests prennent quelques secondes.</p></div>
  </section>

  <section class="pupitre" aria-labelledby="t-pupitre">
    <h2 id="t-pupitre" class="plaque">Pupitre de la cabine</h2>
    <ul class="voyants">
      ${voyant("tmdb", "TMDB")}
      ${voyant("manifest", "L'addon (manifest)")}
      ${voyant("rangee", "Une rangée de l'accueil")}
      ${voyant("recherche", "La recherche")}
      ${voyant("affiches", "Les affiches maison")}
      ${voyant("serveur", "Le serveur des affiches")}
      ${voyant("tuiles", "Les tuiles des collections")}
      ${voyant("base", "La base des liens fixes")}
    </ul>
  </section>

  <section class="registre" aria-labelledby="t-registre">
    <h2 id="t-registre" class="plaque">Registre</h2>
    <dl>
      <div><dt>Version en ligne</dt><dd>${esc(version)}</dd></div>
      <div><dt>Mise à jour de la nuit</dt><dd id="nuit">…</dd></div>
      <div><dt>Dernier tour des machines</dt><dd id="verifie">…</dd></div>
    </dl>
    <p class="note">Les tests se refont toutes les 5 minutes au plus. Un voyant orange ou rouge qui dure ? Dis-le sur <a href="https://github.com/xnzx07/nuvio-assets/issues">la page des problèmes du projet</a>.</p>
    <button type="button" class="btn" id="refaire">Refaire le tour</button>
    <noscript><p>Sans JavaScript : le bilan brut est sur <a href="${origin}/etat.json">/etat.json</a>.</p></noscript>
  </section>
</main>
${scripts("scene.js")}
<script>
const ETAT = ${JSON.stringify({ origin, textes: TEXTES }).replace(/</g, "\\u003c")};
${ETAT_JS}
</script>
</body>
</html>`;
}

const ETAT_CSS = `
:root {
  --velvet: #170c12; --velvet-2: #22121b; --seat: #3d2230; --cream: #f5ead8; --dim: #b9a59c;
  --bulb: #ffcf6b; --red: #e5413a; --ink: #2a1a14; --green: #5fd39a; --orange: #ffad4a; --off: #4a3a40;
  --display: "Bebas Neue", Impact, "Arial Narrow", sans-serif;
  --body: "Figtree", "Segoe UI", system-ui, sans-serif;
  --type: "Courier Prime", "Courier New", ui-monospace, monospace;
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
.machines { max-width: 820px; margin: 0 auto; display: grid; gap: 26px; }
.machines > * { min-width: 0; }
.hero { position: relative; display: grid; justify-items: center; gap: 10px; text-align: center; }
.hero .tagline { margin: 0; font: italic 400 1.45rem/1.25 var(--serif); color: var(--bulb); }
h2 { margin: 0; font: 400 1.8rem/1.05 var(--display); letter-spacing: .04em; }
/* Les voyants : une ampoule de couleur, et toujours un mot (pas seulement la couleur). */
.lampe { --c: var(--off); flex: none; width: 22px; height: 22px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, rgba(255,255,255,.85) 0 10%, var(--c) 42%, color-mix(in srgb, var(--c) 55%, #000) 100%);
  box-shadow: 0 0 0 3px #120a0d, 0 0 0 4px #5a3a22, 0 0 16px color-mix(in srgb, var(--c) 70%, transparent); }
[data-etat="vert"] > .lampe { --c: var(--green); }
[data-etat="orange"] > .lampe { --c: var(--orange); }
[data-etat="rouge"] > .lampe { --c: var(--red); animation: alerte 1.1s steps(2, end) infinite; }
[data-etat="eteint"] > .lampe { --c: var(--off); box-shadow: 0 0 0 3px #120a0d, 0 0 0 4px #5a3a22; }
[data-etat="attente"] > .lampe { --c: #8a7050; animation: attente 1.4s ease-in-out infinite; }
@keyframes alerte { 50% { filter: brightness(.55); } }
@keyframes attente { 50% { opacity: .45; } }
.lampe.grande { width: 44px; height: 44px; }
.bilan { display: flex; align-items: center; gap: 18px; padding: 18px 22px; border-radius: 18px; background: var(--velvet-2); border: 1px solid var(--seat); }
.bilan[data-etat="vert"] { border-color: rgba(95,211,154,.55); }
.bilan[data-etat="orange"] { border-color: rgba(255,173,74,.6); }
.bilan[data-etat="rouge"] { border-color: rgba(229,65,58,.7); background: linear-gradient(90deg, rgba(229,65,58,.14), transparent 60%), var(--velvet-2); }
.bilan p { margin: 4px 0 0; color: var(--dim); }
/* Le pupitre : une plaque de métal, une rangée de voyants par machine. */
.pupitre, .registre { position: relative; display: grid; gap: 14px; padding: 22px; border-radius: 18px;
  background: repeating-linear-gradient(90deg, rgba(255,255,255,.018) 0 2px, transparent 2px 6px), linear-gradient(#2a1a20, #1c1016); border: 1px solid #4a2c36; box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 18px 40px rgba(0,0,0,.4); }
.plaque { justify-self: start; padding: 4px 16px 2px; border-radius: 6px; font-size: 1.25rem; letter-spacing: .14em; color: #3a2410;
  background: linear-gradient(160deg, #f6dc98, #c9973f 42%, #f2d283 62%, #b4822f); box-shadow: 0 0 14px rgba(255,207,107,.25), inset 0 1px 0 rgba(255,255,255,.5); }
.voyants { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.voyant { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: 14px; padding: 12px 14px; border-radius: 12px; background: rgba(0,0,0,.28); border: 1px solid rgba(255,255,255,.05); }
.voyant .lampe { margin-top: 3px; }
.voyant b { font-weight: 800; }
.voyant .etat { margin-left: 8px; padding: 1px 8px; border-radius: 99px; font: 800 .72rem var(--body); letter-spacing: .08em; text-transform: uppercase; background: rgba(255,255,255,.08); color: var(--dim); white-space: nowrap; }
.voyant[data-etat="vert"] .etat { background: rgba(95,211,154,.16); color: var(--green); }
.voyant[data-etat="orange"] .etat { background: rgba(255,173,74,.16); color: var(--orange); }
.voyant[data-etat="rouge"] .etat { background: rgba(229,65,58,.2); color: #ffb4a8; }
.voyant .texte { margin: 4px 0 0; color: var(--dim); font-size: .95rem; }
.voyant .texte:empty { display: none; }
.voyant .ms { font: .85rem var(--type); color: var(--dim); white-space: nowrap; }
.registre dl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 0; }
.registre dl div { padding: 12px 14px; border-radius: 12px; background: rgba(0,0,0,.28); }
.registre dt { font: 800 .72rem var(--body); letter-spacing: .12em; text-transform: uppercase; color: var(--dim); }
.registre dd { margin: 4px 0 0; font: 700 1.05rem var(--type); overflow-wrap: anywhere; }
.registre dd .lampe { display: inline-block; width: 12px; height: 12px; margin-right: 8px; vertical-align: -1px; }
.note { margin: 0; color: var(--dim); font-size: .95rem; }
.btn { justify-self: start; display: inline-flex; align-items: center; min-height: 44px; padding: 10px 20px; border-radius: 99px; border: 1.5px solid var(--bulb); background: transparent; color: var(--bulb); font: 800 .95rem var(--body); cursor: pointer; }
.btn:hover { background: rgba(255,207,107,.12); }
.btn:disabled { opacity: .5; cursor: progress; }
@media (max-width: 640px) {
  .registre dl { grid-template-columns: 1fr; }
  .voyant { grid-template-columns: auto minmax(0, 1fr); }
  .voyant .ms { grid-column: 2; }
  .voyant .etat { display: inline-block; margin: 4px 0 0; }
  .voyant b { display: block; }
  .pupitre, .registre { padding: 16px; }
}
@media (prefers-reduced-motion: reduce) { [data-etat] > .lampe { animation: none !important; } }
`;

const ETAT_JS = String.raw`(() => {
  const $ = (id) => document.getElementById(id);
  const MOTS = { vert: "OK", orange: "Ralenti", rouge: "En panne", eteint: "Sans objet", attente: "En test…" };
  const BILAN = {
    vert: ["Tout tourne", "Toutes les machines répondent : si quelque chose coince chez toi, regarde la page « En cas de souci » du guide."],
    orange: ["Quelques ratés", "Le site marche, mais une machine est lente ou en retard : voir les voyants orange ou rouges."],
    rouge: ["Panne en cours", "Une machine essentielle ne répond pas : l'accueil du Catalogue FR peut rester vide. On est dessus."],
  };
  const dateFr = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const depuis = (iso) => { const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000)); return s < 60 ? "à l'instant" : "il y a " + Math.round(s / 60) + " min"; };
  const remplit = (b) => {
    const bilan = $("bilan"); bilan.dataset.etat = b.global;
    $("bilan-titre").textContent = BILAN[b.global][0]; $("bilan-texte").textContent = BILAN[b.global][1];
    (b.controles || []).forEach((c) => {
      const li = document.querySelector('.voyant[data-id="' + c.id + '"]'); if (!li) return;
      li.dataset.etat = c.etat;
      li.querySelector(".etat").textContent = MOTS[c.etat] || c.etat;
      const t = (ETAT.textes[c.id] || {})[c.etat] || "";
      li.querySelector(".texte").textContent = t + (c.etat === "rouge" && c.detail ? " (" + c.detail + ")" : "");
      li.querySelector(".ms").textContent = c.etat === "eteint" ? "" : (c.ms >= 1000 ? (c.ms / 1000).toFixed(1).replace(".", ",") + " s" : c.ms + " ms");
    });
    const n = b.nuit || {}, dd = $("nuit"); dd.textContent = "";
    const l = document.createElement("i"); l.className = "lampe"; l.setAttribute("aria-hidden", "true");
    const wrap = document.createElement("span"); wrap.dataset.etat = n.etat; wrap.append(l);
    dd.append(wrap, n.date ? dateFr(n.date) + (n.saison ? " · " + n.saison : "") : "illisible");
    if (n.etat !== "vert") dd.append(document.createElement("br"), n.date ? (n.rates ? n.rates + " liste(s) en échec, gardées de la veille" : "en retard : les rangées gardent les listes d'avant") : "le registre de la nuit ne répond pas");
    $("verifie").textContent = depuis(b.verifie);
  };
  const tour = (bouton) => {
    if (bouton) bouton.disabled = true;
    return fetch(ETAT.origin + "/etat.json", { cache: "no-store" }).then((r) => r.json()).then(remplit).catch(() => {
      $("bilan").dataset.etat = "rouge";
      $("bilan-titre").textContent = "La cabine ne répond pas";
      $("bilan-texte").textContent = "Impossible de lire l'état du site : vérifie ta connexion, puis refais le tour.";
    }).finally(() => { if (bouton) bouton.disabled = false; });
  };
  $("refaire").addEventListener("click", (e) => { tour(e.currentTarget); if (window.sfx) sfx.click(); });
  tour();
})();`;
