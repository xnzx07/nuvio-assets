/**
 * Page de personnalisation (salle 2, servie sur /configure ; le guide, salle 1, est sur /guide ; le hall à la racine).
 * Tout se passe dans le navigateur : la page fabrique l'adresse personnalisée
 * de l'addon et des collections, rien n'est envoyé ni stocké.
 *
 * Direction visuelle : une salle de cinéma. Titre en enseigne lumineuse, réglages
 * en « bobine » (pellicule perforée), aperçu en direct de l'accueil sur un écran
 * de TV, et le lien remis sous forme de billet d'entrée à détacher.
 */

const ROW_HINTS = {
  "accueil-saison": "Change toute seule : Halloween, Noël, Saint-Valentin, Pâques, été, sinon les films à l'affiche",
  "accueil-top10": "Les films dont tout le monde parle aujourd'hui, dans l'ordre du classement",
  "accueil-tendances-series": "Les séries dont tout le monde parle aujourd'hui, dans l'ordre du classement",
  "accueil-nouveautes-plateformes": "Arrivés depuis 3 mois sur les plateformes que tu choisis plus bas",
  "accueil-series-a-devorer": "Séries notées 8/10 et plus",
  "accueil-mini-series": "Une seule saison, idéal pour un week-end",
  "accueil-pepites": "Très bien notés mais peu connus, nouvelle sélection chaque jour",
  "accueil-cinema-francais": "Les films français des deux dernières années",
  "accueil-films-cultes": "Les classiques que tout le monde a vus (ou devrait)",
  "accueil-anime": "L'animation japonaise du moment",
  "accueil-famille": "Films familiaux, sans horreur",
  "accueil-documentaires": "Documentaires bien notés",
  "accueil-vod-semaine": "Films sortis en numérique ces deux dernières semaines : regardables maintenant",
  "accueil-vod-bientot": "Films qui deviennent regardables dans les six prochaines semaines, avec la date",
  "accueil-attendus": "Les films pas encore sortis dont tout le monde parle, avec leur date au cinéma",
};


/** Couleur d'accent de chaque plateforme (pastille et tuile de l'aperçu). */
const PROVIDER_COLORS = {
  8: "#e50914", 119: "#1a98ff", 337: "#1b3f9c", 531: "#0064ff",
  1899: "#7b2cff", 350: "#d9d9de", 381: "#111111", 283: "#f47521",
};

import { STAGE_HEAD, stageTop, secretsHTML, BEAM_HTML, SEATS_HTML, CREDITS_HTML } from "./stage.js";
import { nuvioDonnees } from "./nuvio.js";
import { POSTER_URL } from "./reglages.js";
import { feuilles, scripts } from "./statique.js";
import { esc } from "./outils-serveur.js";
import { GUICHET_DEPART, guichetHTML } from "./guichet.js";
import { SOIREE_HTML } from "./soiree.js";
import { GALERIE_BOUTON, GALERIE_HTML } from "./galerie.js";

// Retour sur /configure (adresse tapée, favori, « Salle 2 » du hall) : la dernière programmation de cet appareil
// se rouvre d'elle-même (gardée par update(), sans la clé Gemini, qui est rangée à part). Pas dans le guide, qui
// a la sienne. Une fois par onglet et par adresse : un lien fixe supprimé renvoie sur /configure, il serait rouvert
// sans fin ; au deuxième passage, l'adresse gardée est oubliée. Injectée telle quelle en tête de page.
export const DERNIERE = "derniere-programmation";
export function reprise(loc, ls, ss, racine) {
  const p = ls.getItem("derniere-programmation");
  if (loc.pathname !== "/configure" || !p || !/^\/[^/?#]+\/configure$/.test(p) || racine.classList.contains("dans-guide")) return;
  if (ss.getItem("reprise") === p) { ls.removeItem("derniere-programmation"); return; }
  ss.setItem("reprise", p);
  loc.replace(p + loc.hash);
}

// Espace hébergeur d'une copie auto-hébergée (absent de l'instance principale) : connexion avec le mot de
// passe ADMIN_PASSWORD, lien avec alertes (rangée « Mise à jour » dans Nuvio), bannière de mise à jour.
const HOTE_HTML = `
      <section class="act" id="s-hote">
        <header><span>Cabine</span><h2>Espace hébergeur</h2></header>
        <p class="sub">Tu héberges ta propre copie du Catalogue FR. Connecte-toi avec ton mot de passe (le secret ADMIN_PASSWORD de ta copie) pour voir les nouvelles versions et recevoir les alertes dans Nuvio.</p>
        <div id="hote-box" class="hote-box"></div>
      </section>`;
export const HOTE_JS = `
// ---------- espace hébergeur ----------
let hote = null;
function hoteCall(path, body) {
  return fetch(D.origin + path, body === undefined ? { credentials: "same-origin" }
    : { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
async function hoteRefresh() {
  try { hote = await (await hoteCall("/hote/etat")).json(); } catch (e) { hote = { hote: false }; }
  hoteRender();
}
function hoteRender() {
  const box = $("hote-box"); box.textContent = "";
  if (hote && hote.motDePasseFaible) {
    box.append(el("p", { class: "alerte", role: "alert", text: "Le mot de passe d'hébergeur de ta copie est trop simple : 10 caractères au moins, et pas celui de l'exemple. Change ADMIN_PASSWORD (Docker : dans docker-compose.yml ; Cloudflare : dans les paramètres de ton Worker), redémarre ou redéploie, puis recharge cette page." }));
    return;
  }
  if (hote && hote.motDePasse === false) {
    box.append(el("p", { class: "alerte", role: "alert", text: "Ta copie n'a pas encore de mot de passe d'hébergeur. Ajoute ADMIN_PASSWORD (Docker : dans docker-compose.yml, rubrique environment ; Cloudflare : un secret dans les paramètres de ton Worker), redémarre ou redéploie, puis recharge cette page." }));
    return;
  }
  if (!hote || !hote.hote) {
    const pw = el("input", { type: "password", id: "hote-mdp", autocomplete: "current-password", placeholder: "Mot de passe", "aria-label": "Mot de passe de l'hébergeur" });
    const msg = el("p", { class: "alerte", role: "alert" });
    const go = async () => {
      const r = await hoteCall("/hote/connexion", { motDePasse: pw.value }).catch(() => null);
      if (r && r.ok) hoteRefresh();
      else msg.textContent = !r ? "Pas de réponse de ta copie : vérifie ta connexion et réessaie."
        : r.status === 429 ? "Trop d'essais : réessaie dans un quart d'heure."
        : (await r.json().catch(() => ({}))).error || "Mot de passe incorrect.";
    };
    pw.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go(); } });
    box.append(el("div", { class: "hote-ligne" }, pw, el("button", { type: "button", class: "hote-btn", text: "Se connecter", onclick: go })), msg);
    return;
  }
  const alertes = el("input", { type: "checkbox", id: "hote-alertes" });
  alertes.checked = state.al === hote.jeton;
  alertes.addEventListener("change", () => { state.al = alertes.checked ? hote.jeton : ""; update(); });
  box.append(el("label", { class: "switch" }, alertes, el("span", {},
    el("b", { text: "Alertes de mise à jour dans Nuvio" }),
    el("small", { text: "Ajoute à ton lien une rangée « Mise à jour », en tête de l'accueil, visible seulement quand une nouvelle version est sortie. Réinstalle ton lien après l'avoir coché (avec un lien fixe, « Actualiser les addons » dans Nuvio suffit), et ne coche pas pour les liens que tu donnes aux autres." }))));
  box.append(hote.maj ? hoteBanner(hote.maj)
    : hote.verification === "impossible"
      ? el("p", { class: "alerte", role: "alert", text: "Impossible de vérifier les mises à jour pour l'instant (GitHub ne répond pas). Réessaie plus tard." })
      : el("p", { class: "sub", text: "Ta copie est à jour (ou tu as repoussé la dernière version)." }));
  box.append(el("button", { type: "button", class: "hote-btn line", text: "Se déconnecter", onclick: async () => { await hoteCall("/hote/deconnexion", {}); hoteRefresh(); } }));
}
function hoteBanner(maj) {
  const b = el("div", { class: "hote-maj", role: "status" }, el("b", { text: "Version " + maj.version + " disponible" }));
  if (maj.notes.length) b.append(el("ul", {}, maj.notes.map((n) => el("li", { text: n }))));
  b.append(el("a", { href: maj.history, target: "_blank", rel: "noopener", text: "Tout l'historique des changements" }));
  const how = el("div", { class: "hote-how", hidden: "" });
  if (hote.installation === "docker") {
    how.append(el("p", { text: "Sur ton serveur, dans le dossier de ta copie, lance :" }), el("code", { text: "docker compose pull && docker compose up -d" }));
  } else {
    how.append(el("p", { text: "Sur GitHub, ouvre ta copie du dépôt et clique sur « Sync fork », puis « Update branch » : Cloudflare redéploie ta copie tout seul, en une minute environ." }));
    if (hote.depot) how.append(el("a", { href: "https://github.com/" + hote.depot, target: "_blank", rel: "noopener", text: "Ouvrir github.com/" + hote.depot }));
  }
  b.append(el("div", { class: "hote-ligne" },
    el("button", { type: "button", class: "hote-btn", text: "Mettre à jour", onclick: () => { how.hidden = false; } }),
    el("button", { type: "button", class: "hote-btn line", text: "Plus tard", onclick: async () => { await hoteCall("/hote/plus-tard", { palier: maj.version.split(".").slice(0, 2).join(".") }); hote.maj = null; hoteRender(); } })), how);
  return b;
}
hoteRefresh();
`;


export function configurePage({ origin, cfg, rows, discover, providers, collections, defaults, regions, genres, languages, sorts, seasons, maxCustom, season, copy = false, fixed = "", fixedOk = false, apercus = origin }) {
  const plain = (c) => ({ n: c.n, r: c.r, p: c.p, d: c.d, c: c.c, o: c.o, x: c.x, g: c.g, e: c.e, m: c.m, a: c.a, f: c.f, h: c.h, t: c.t, to: c.to || {}, ac: c.ac || [], u: c.u, ca: c.ca, k: c.k, al: c.al });
  const data = {
    origin, maxCustom, fixed, fixedOk,
    cfg: plain(cfg),
    defaults: plain(defaults),
    rows: rows.map((d) => ({
      id: d.id,
      name: d.id === "accueil-saison" ? "Spécial saison" : d.name,
      now: d.id === "accueil-saison" ? d.name : "",
      kind: d.mix ? "Films + séries" : d.type === "series" ? "Séries" : "Films",
      type: d.type,
      hint: ROW_HINTS[d.id] || "",
    })),
    discover: discover.map((d) => ({ id: d.id, name: d.name, type: d.type })),
    providers: providers.map((p) => ({ id: p.id, name: p.name, tile: Boolean(p.folder), color: PROVIDER_COLORS[p.id] || "#888" })),
    collections, regions, genres, languages, sorts, seasons,
  };
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const LOGO = origin + "/logo.png";

  return `<!doctype html>
<html lang="fr" data-saison="${esc(season || "")}">
<head>
<meta charset="utf-8">
${STAGE_HEAD}
<script>try{if(window.parent!==window&&parent.location.origin===location.origin)document.documentElement.classList.add("dans-guide")}catch(e){}</script>
<script>try{(${reprise})(location,localStorage,sessionStorage,document.documentElement)}catch(e){}</script>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(cfg.n)} · Ta programmation</title>
<meta name="description" content="Compose ton accueil Nuvio en français : rangées, plateformes, collections, filtres.">
<meta property="og:title" content="Compose ta programmation Nuvio">
<meta property="og:image" content="${LOGO}">
<link rel="icon" href="${LOGO}">
${feuilles("polices.css", "salle2.css", "scene.css", "nuvio.css", "salle2-fin.css", "salle2-guichet.css", "salle2-soiree.css", "salle2-galerie.css")}
</head>
<body>
  <div class="valance" aria-hidden="true"></div>
  ${stageTop({ here: "programmation", origin })}
  ${secretsHTML("programmation")}
  <div class="marquee-wrap">
    ${BEAM_HTML}
    <div class="marquee"><small>Nuvio · en français</small><h1>Ta programmation</h1></div>
    <p class="tagline">Ton accueil, ta salle, tes règles.</p>
    <a class="guide-link" href="${origin}/guide">Pas encore Nuvio ? Suis le guide de A à Z →</a>
    <p>Choisis ce qui passe sur ton accueil, crée tes propres rangées, renomme-les, filtre ce que tu ne veux pas voir. <b>L'écran se met à jour en direct</b>, et ton billet contient ton lien d'installation. Rien n'est enregistré : tout tient dans le lien. Ou crée un <b>lien fixe</b> : il ne change plus, et tes changements arrivent dans Nuvio sans réinstaller.</p>
  </div>

  <div class="layout">
    <main>
      <nav class="nav" aria-label="Sections">
        <a href="#s-nom">Nom</a><a href="#s-pays">Pays</a><a href="#s-rangees">Rangées</a><a href="#s-saison">Saison</a>
        <a href="#s-plateformes">Plateformes</a><a href="#s-filtres">Filtres</a><a href="#s-ia">IA</a><a href="#s-decouvrir">Découvrir</a><a href="#s-collections">Collections</a><a href="#s-affiches">Affiches</a>${copy ? '<a href="#s-hote">Hébergeur</a>' : ""}<a href="#s-mode">Installer</a>
      </nav>
${GUICHET_DEPART}

      <section class="act" id="s-nom">
        <header><span>Affiche</span><h2>Le nom de ton addon</h2></header>
        <label for="name" class="sub">Il apparaît dans la liste des addons de Nuvio.</label>
        <input type="text" id="name" maxlength="40" autocomplete="off" spellcheck="false" enterkeyhint="done">
      </section>

      <section class="act" id="s-pays">
        <header><span>Salle</span><h2>Ton pays</h2></header>
        <p class="sub">Les plateformes et les sorties au cinéma changent d'un pays à l'autre. Au Québec, les titres sont en français québécois quand ils existent.</p>
        <div class="seg" id="regions" role="group" aria-label="Pays"></div>
      </section>

      <section class="act" id="s-rangees">
        <header><span>Bobine</span><h2>Les rangées de l'accueil</h2></header>
        <p class="sub">Mets à l'affiche celles que tu veux, range-les avec les flèches, et renomme-les avec le crayon. Tu peux aussi créer tes propres rangées.</p>
        <ol class="reel" id="rows"></ol>
        <button type="button" class="add-row" id="add-row">+ Créer une rangée sur mesure</button>
        <div class="builder" id="builder" hidden>
          <h3 id="b-title">Nouvelle rangée</h3>
          <label class="field"><span>Nom de la rangée</span><input type="text" class="plain" id="b-name" maxlength="40" enterkeyhint="done" placeholder="ex. K-dramas à pleurer"></label>
          <div class="field"><span>Quoi</span><div class="seg" id="b-type" role="group" aria-label="Type"></div></div>
          <div class="field"><span>Genres (l'un ou l'autre)</span><div class="chips" id="b-genres"></div></div>
          <div class="field"><span>Seulement sur ces plateformes (facultatif)</span><div class="chips" id="b-prov"></div></div>
          <div class="two">
            <label class="field"><span>Langue d'origine</span><select id="b-lang"></select></label>
            <div class="field"><span>Sortis entre</span><div class="two"><input type="number" id="b-from" min="1900" max="2100" inputmode="numeric" enterkeyhint="done" placeholder="1900" aria-label="Année de début"><input type="number" id="b-to" min="1900" max="2100" inputmode="numeric" enterkeyhint="done" placeholder="aujourd'hui" aria-label="Année de fin"></div></div>
          </div>
          <div class="field"><span>Note minimale</span><div class="range"><input type="range" id="b-vote" min="0" max="9" step="0.5" aria-label="Note minimale"><output id="b-vote-out"></output></div></div>
          <div class="field"><span>Ordre</span><div class="seg" id="b-sort" role="group" aria-label="Ordre"></div></div>
          <p class="summary" id="b-summary"></p>
          <div class="b-actions"><button type="button" class="mini ok" id="b-save">Ajouter à l'affiche</button><button type="button" class="mini" id="b-cancel">Annuler</button></div>
        </div>
${SOIREE_HTML}
      </section>

      <section class="act" id="s-saison">
        <header><span>Calendrier</span><h2>La rangée « Spécial »</h2></header>
        <p class="sub">Elle change toute seule selon la période. Décoche les fêtes qui ne t'intéressent pas : en dehors des fêtes choisies, elle montre les films à l'affiche.</p>
        <div class="chips" id="seasons"></div>
      </section>

      <section class="act" id="s-plateformes">
        <header><span>Abonnements</span><h2>Tes plateformes</h2></header>
        <p class="sub">Elles décident du contenu de « Nouveautés sur tes plateformes » et des tuiles de la collection Plateformes.</p>
        <div class="chips" id="providers"></div>
        <p class="prov-titre">L'ordre de leurs tuiles dans la collection Plateformes</p>
        <ol id="prov-ordre" class="acc-list prov-ordre"></ol>
        <p class="warn" id="prov-warn" hidden>Aucune plateforme choisie : la rangée « Nouveautés sur tes plateformes » ne s'affichera pas.</p>
      </section>

      <section class="act" id="s-filtres">
        <header><span>Le videur</span><h2>Ce que tu ne veux pas voir</h2></header>
        <p class="sub">Ces filtres s'appliquent partout : rangées, Découvrir et collections.</p>
        <div class="field"><span>Genres à masquer</span><div class="chips danger" id="excl"></div></div>
        <div class="two">
          <div class="field"><span>Note minimale partout</span><div class="range"><input type="range" id="g-vote" min="0" max="8" step="0.5" aria-label="Note minimale partout"><output id="g-vote-out"></output></div></div>
          <label class="field"><span>Rien de sorti avant</span><select id="g-year"></select></label>
        </div>
        <label class="switch"><input type="checkbox" id="g-family"><span><b>Mode famille</b><small>Films tous publics ou -10 ans seulement, pas d'horreur, séries pour la famille et les enfants.</small></span></label>
        <label class="switch"><input type="checkbox" id="g-unreleased"><span><b>Tendances et Découvrir : seulement ce qu'on peut déjà regarder</b><small>TMDB y met aussi les films encore au cinéma ou pas encore sortis. Ils passent dans « Bientôt dispo » et « Les plus attendus ». Dans Découvrir (Populaires, Nouveautés, films de cette année et de l'an dernier) : seulement les films déjà dispo dans ton pays, en abonnement, location ou achat.</small></span></label>
      </section>

      <section class="act" id="s-ia">
        <header><span>Projectionniste</span><h2>La recherche par IA</h2></header>
        <p class="sub">L'IA comprend les recherches du genre « le film où un mec revit la même journée » et écrit dans les fiches « pour qui », « à savoir » et le rappel avant une suite. Elle marche avec ta propre clé Gemini, gratuite : crée-la en 2 minutes sur <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a>, puis colle-la ici.</p>
        <div class="field">
          <span>Ta clé Gemini (facultatif)</span>
          <div class="ai-key">
            <input type="text" id="ai-key" class="plain masque" autocomplete="off" data-1p-ignore data-lpignore="true" spellcheck="false" enterkeyhint="done" placeholder="AIza…" aria-label="Ta clé Gemini" aria-describedby="ai-key-hint">
            <button type="button" id="ai-key-eye" aria-label="Afficher la clé" aria-pressed="false">👁</button>
          </div>
          <small id="ai-key-hint" aria-live="polite"></small>
        </div>
        <p class="sub">Ta clé est rangée dans ton lien d'installation : ne partage pas ce lien. Elle est aussi gardée sur cet appareil, pour la retrouver en revenant ici ; « Offrir ce billet » ne l'emporte jamais. Sans clé, tu profites quand même des réponses déjà écrites pour les autres.</p>
${copy ? "" : `        <p class="sub">Le lien partagé sature ? <a href="${origin}/copie">Monte ta propre copie</a> : la même chose, avec tes clés et ton quota.</p>
`}      </section>

      <section class="act" id="s-decouvrir">
        <header><span>Coulisses</span><h2>Les catalogues de Découvrir</h2></header>
        <p class="sub">Ils ne passent pas sur l'accueil, seulement dans l'onglet Découvrir, avec leurs filtres par genre, année ou décennie.</p>
        <div class="group"><h3>Films</h3><div class="chips" id="disc-movie"></div></div>
        <div class="group"><h3>Séries</h3><div class="chips" id="disc-series"></div></div>
      </section>

      <section class="act" id="s-collections">
        <header><span>Grand écran</span><h2>Les collections</h2></header>
        <p class="sub">Les grandes tuiles de l'accueil, à importer avec le second lien de ton billet. Plateformes reste tout en haut ; les autres viennent après tes rangées, ou à la place que tu choisis dans « Ordre de l'accueil ». Choisis les collections, puis les tuiles de chacune et leur ordre.</p>
        <p class="coll-resume" id="coll-resume"></p>
        <button type="button" class="btn solid" id="coll-ouvrir">Choisir les collections</button>
        <dialog id="coll-dialog" aria-labelledby="coll-titre">
          <div class="coll-dlg-head"><h2 id="coll-titre">Les collections</h2><button type="button" class="btn line" id="coll-fermer">Fermer</button></div>
          <div class="coll-dlg-body"><p class="coll-intro">Coche les collections et choisis leurs tuiles. Leur place sur l'accueil, avant ou après tes rangées, se règle dans « Ordre de l'accueil ».</p><div id="collections" style="display:grid;gap:10px"></div></div>
        </dialog>
        <button type="button" class="btn line" id="acc-ouvrir">Ordre de l'accueil</button>
        <label class="switch"><input type="checkbox" id="g-coll-accueil"><span><b>Ouvrir les collections comme l'accueil</b><small>Une tuile ouverte montre ses rangées comme l'accueil, au lieu des onglets. Sur Nuvio TV, la bande-annonce du film choisi se lance alors dans le fond, si elle est activée dans les réglages de l'accueil (Paramètres → Disposition). Sur téléphone, rien ne change pour les bandes-annonces.</small></span></label>
        <dialog id="acc-dialog" aria-labelledby="acc-titre">
          <div class="coll-dlg-head"><h2 id="acc-titre">L'ordre de l'accueil</h2><button type="button" class="btn line" id="acc-fermer">Fermer</button></div>
          <div class="coll-dlg-body">
            <p class="sub">Tes rangées et tes collections, du haut de l'accueil vers le bas : monte ou descends chacune. Plateformes reste tout en haut. Dans Nuvio, l'ordre arrive avec « Tout envoyer dans Nuvio » (case « L'ordre de l'accueil »).</p>
            <ol id="accueil-ordre" class="acc-list"></ol>
          </div>
        </dialog>
      </section>

      <section class="act" id="s-affiches">
        <header><span>Vitrine</span><h2>Tes affiches</h2></header>
        <p class="sub">Les affiches des cartes de Nuvio : ce qui s'affiche dessus, et comment. Tout se règle dans la régie, sur tes vraies affiches en grand. Ton lien d'addon ne change pas : le lien « Affiches » de ton billet se colle dans Nuvio (Paramètres → Disposition → Custom Poster Source). Tes réglages restent gardés dans ce navigateur.</p>
        <p class="aff-resume" id="aff-resume"></p>
        <button type="button" class="btn solid" id="regie-ouvrir">Régler mes affiches</button>
      </section>

${copy ? HOTE_HTML : ""}
      <section class="act" id="s-mode">
        <header><span>Mode d'emploi</span><h2>Installer sur ta TV sans rien taper</h2></header>
        <p class="sub"><b>Le plus simple, avec un compte Nuvio</b> : « Tout envoyer dans Nuvio » sur ton billet. L'addon, les collections et les affiches arrivent sur la TV, rien à coller. Sans compte Nuvio :</p>
        <ol class="steps-howto">
          <li><span><b>Sur la TV</b>, dans Nuvio : Addons → <b>Gérer depuis le téléphone</b>. Un QR code s'affiche.</span></li>
          <li><span><b>Scanne-le avec ton téléphone</b>, connecté au même Wi-Fi que la TV.</span></li>
          <li><span><b>Colle les liens de ton billet</b> (« Installer à la main ») : l'addon dans l'onglet Addons, les collections avec « Copier le contenu (PC/TEL) », puis le bouton presse-papiers en haut à droite de l'onglet Collections, et les affiches dans Paramètres → Disposition → Custom Poster Source.</span></li>
          <li><span><b>Mets Nuvio en français</b> : langue de l'appli et langue TMDB (Paramètres → Intégrations → TMDB).</span></li>
        </ol>
        <p class="sub">Nuvio est sur ton téléphone, ta tablette ou ton ordinateur ? Pas besoin de QR code : colle directement le lien d'addon de ton billet dans l'onglet Addons. Pour les collections, « Copier le contenu (PC/TEL) » copie tout le contenu de leur lien : dans Nuvio, onglet Collections, appuie sur le bouton presse-papiers en haut à droite, sur téléphone comme sur ordinateur.</p>
        <p class="sub">Pour retrouver tes réglages plus tard : sur cet appareil, la salle 2 rouvre d'elle-même ta dernière programmation. Ailleurs, ouvre ton lien d'addon en remplaçant « manifest.json » par « configure ». Avec un lien fixe, fais-le sur l'appareil qui l'a créé (ou avec son lien pour modifier) : tes changements arrivent dans Nuvio sans réinstaller, avec « Actualiser les addons ». Les collections, elles, sont importées : après un changement de tuiles, supprime-les dans Nuvio et réimporte-les (« Copier le contenu (PC/TEL) », puis le bouton presse-papiers en haut à droite de l'onglet Collections). Tu pars de zéro ? <a href="${origin}/guide">Le guide complet</a> installe Nuvio et tous les addons, dans l'ordre.</p>
      </section>

      <button type="button" class="reset" id="reset">Revenir à la programmation d'origine</button>
      <div class="annule" id="annule" role="status" hidden><span id="annule-txt"></span><button type="button" id="annule-btn">Annuler</button></div>
    </main>

    <aside>
      <div class="rail">
      <div class="stage" id="stage">
        <div class="glow" id="glow" aria-hidden="true"></div>
        <div class="tv"><div class="screen" id="screen" role="region" aria-label="Aperçu interactif de ton accueil Nuvio"></div></div>
        <div class="tv-foot"></div>
        <div class="screen-tools">
          <button type="button" class="mini" id="ret-btn" title="Le bouton Retour de la télécommande (touche Retour arrière du clavier)">◀ Retour</button>
          <div class="seg" id="fmt" role="group" aria-label="Format des affiches"></div>
          <button type="button" class="mini" id="pp-btn" aria-pressed="false">Affiches maison</button>
        </div>
        <p class="pp-note" id="pp-note" hidden>Ce sont tes affiches maison. <button type="button" class="pp-ouvrir" id="pp-ouvrir">Régler mes affiches</button></p>
        <div class="screen-fun">
          <button type="button" class="mini" id="zoom" aria-pressed="false">Agrandir l'écran</button>
        </div>
        <button type="button" class="btn big-close" id="big-close">Fermer le grand écran</button>
      </div>
      </div>
      <p class="caption"><span class="souris">Passe la souris sur une affiche (ou utilise les flèches) comme avec la télécommande, clique pour ouvrir sa fiche ; « Retour » ouvre le menu de Nuvio.</span><span class="doigt">Touche une affiche pour ouvrir sa fiche, fais glisser les rangées du doigt.</span></p>

      <div class="ticket" id="ticket">
        <div class="main">
          <div class="t-head"><b id="t-name"></b><span id="t-serial"></span></div>
          <div class="t-seance" id="t-seance"></div>
          <div class="t-meta"><span><b id="t-rows"></b> rangées</span><span><b id="t-prov"></b> plateformes</span><span><b id="t-coll"></b> collections</span><span id="t-extra"></span></div>
          <div class="compte-nuvio">
            <a class="btn solid full" id="compte-nuvio" href="/compte-nuvio" target="_blank" rel="noopener">Tout envoyer dans Nuvio</a>
            <p>Avec un compte Nuvio : l'addon, les collections et les affiches (TV) arrivent tout seuls, rien à coller.</p>
          </div>
          <details class="a-la-main" id="a-la-main">
          <summary>Installer à la main, sans compte Nuvio</summary>
          <div class="a-la-main-corps">
          <div class="t-label">Addon · Addons → Ajouter un addon</div>
          <div class="t-url" id="u-manifest"></div>
          <div class="t-btns">
            <button type="button" class="btn solid" id="copy-manifest">Copier</button>
            <a class="btn line" id="open-app" href="#">Ouvrir dans l'appli</a>
          </div>
          <div class="fixe" id="fixe" hidden>
            <p id="fixe-txt"></p>
            <p class="recu" id="fixe-recu" hidden></p>
            <div class="t-btns"><button type="button" class="btn solid" id="fixe-creer">Créer mon lien fixe</button></div>
            <p class="autre" id="fixe-autre" hidden>Modifier depuis un autre appareil ? <button type="button" class="discret" id="fixe-modif">Copier le lien de modification</button> (à ouvrir dans un navigateur, pas dans Nuvio)</p>
            <p class="alerte" id="fixe-err" role="alert"></p>
          </div>
          <div class="t-label">Collections · onglet Collections → presse-papiers en haut à droite</div>
          <div class="t-url" id="u-collections"></div>
          <div class="t-btns"><button type="button" class="btn solid" id="copy-collections">Copier</button><button type="button" class="btn line" id="copy-collections-contenu" title="Tout le contenu du lien, à coller dans Nuvio (sur PC, Nuvio ne prend que le contenu)">Copier le contenu (PC/TEL)</button></div>
          <textarea class="t-url t-contenu" id="contenu-collections" readonly hidden aria-label="Contenu du lien des collections"></textarea>
          <div class="t-label">Affiches · Paramètres → Disposition → Custom Poster Source</div>
          <div class="t-url" id="u-affiches">${POSTER_URL.replace(/&/g, "&amp;")}</div>
          <div class="t-btns"><button type="button" class="btn solid full" id="copy-affiches">Copier</button></div>
          </div>
          </details>
          <div class="t-btns">
            <button type="button" class="btn line" id="qr-btn" aria-expanded="false" aria-controls="qr">Continuer sur le téléphone</button>
            <button type="button" class="btn line" id="share-btn">Offrir ce billet</button>
            <button type="button" class="btn line full" id="img-btn">Télécharger le billet en image</button>
          </div>
          <div class="qr" id="qr" hidden><div id="qr-code" class="qr-wait">Impression du QR code…</div><p>Scanne-le avec ton téléphone : cette page s'ouvre avec les mêmes réglages, ta clé Gemini comprise, il ne reste qu'à copier les liens. Avec un lien fixe, le téléphone pourra aussi le modifier. Ce QR code est pour toi seul : ne le montre à personne d'autre (pour partager ta programmation, c'est « Offrir ce billet »).</p></div>
        </div>
        <div class="stub"><span>Admis · 1 salle</span></div>
        <div class="stamp" aria-hidden="true">Copié</div>
      </div>

    </aside>
  </div>

  ${SEATS_HTML}
  ${CREDITS_HTML}


  <div class="dock"><button type="button" class="dock-billet" id="dock-billet">Ton billet : <b id="dock-count"></b><i aria-hidden="true">↓</i></button><button type="button" class="btn" id="dock-copy">Copier mon lien</button></div>

  <div class="regie-affiches" id="regie" role="dialog" aria-modal="true" aria-labelledby="regie-titre" hidden>
    <div class="regie-boite">
      <div class="regie-barre">
        <h2 id="regie-titre">Tes affiches</h2>
        <div class="regie-actions">
          ${GALERIE_BOUTON}
          <button type="button" class="mini" id="regie-importer" aria-expanded="false" aria-controls="regie-import">Importer un lien</button>
          <button type="button" class="mini" id="regie-qr-btn" aria-expanded="false" aria-controls="regie-qr">QR code</button>
          <button type="button" class="mini" id="regie-annuler" disabled>↶ Annuler</button>
          <button type="button" class="btn solid" id="regie-copier">Copier mon lien d'affiches</button>
          <button type="button" class="regie-x" id="regie-fermer" aria-label="Fermer la régie">✕</button>
        </div>
        <div class="regie-import" id="regie-import" role="region" aria-label="Importer un lien d'affiches" hidden>
          <label for="regie-import-lien">Colle un lien d'affiches (le tien, ou celui de quelqu'un) pour reprendre ses réglages :</label>
          <div class="regie-import-ligne">
            <input type="text" id="regie-import-lien" spellcheck="false" autocomplete="off" placeholder="https://affiches-catalogue-fr.vercel.app/{type}/{shape}/{id}.jpg?…">
            <button type="button" class="btn solid" id="regie-import-ok">Importer</button>
          </div>
          <p class="regie-import-msg" id="regie-import-msg" aria-live="polite"></p>
        </div>
        <div class="regie-import regie-qr" id="regie-qr" role="region" aria-label="QR code du lien d'affiches" hidden>
          <div id="regie-qr-code" class="regie-qr-code">Impression du QR code…</div>
          <p>Scanne-le avec ton téléphone : ton lien d'affiches s'ouvre, prêt à copier. Colle-le ensuite dans Nuvio : Paramètres → Disposition → Custom Poster Source. Le QR code suit tes réglages.</p>
          <p>Sur iPhone, vérifie que le lien collé garde ses accolades (<code>{type}/{shape}</code>, pas <code>%7Btype%7D</code>) : sinon Nuvio TV n'applique tes affiches qu'en portrait.</p>
        </div>
      </div>
      <div class="regie-corps">
      <div class="regie-scene">
        <div class="regie-rideau g" aria-hidden="true"></div><div class="regie-rideau d" aria-hidden="true"></div>
        <div class="regie-tete">
          <p class="regie-legende" id="regie-legende"></p>
          <div class="seg" id="regie-format" role="group" aria-label="Forme de l'affiche"></div>
          <div class="regie-choix">
            <input type="search" id="regie-q" placeholder="Essayer sur un titre : film, série, animé…" aria-label="Essayer les réglages sur un titre de ton choix" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="regie-propositions" autocomplete="off" spellcheck="false" enterkeyhint="search">
            <button type="button" class="regie-retirer" id="regie-retirer" hidden>Retirer mon titre</button>
            <ul id="regie-propositions" role="listbox" aria-label="Titres trouvés" hidden></ul>
          </div>
        </div>
        <figure class="regie-plateau" id="regie-plateau"><img id="regie-grande" alt=""></figure>
        <div class="regie-coulisses" id="regie-coulisses" role="group" aria-label="D'autres films avec les mêmes réglages"></div>
      </div>
      <div class="regie-console">
        <div class="regie-memoires" id="regie-memoires" role="group" aria-label="Styles tout prêts">
          <button type="button" data-memoire="maison" aria-label="Style Maison"><img alt=""><span>Maison</span></button><button type="button" data-memoire="essentiel" aria-label="Style Essentiel"><img alt=""><span>Essentiel</span></button><button type="button" data-memoire="noteSeule" aria-label="Style Note seule"><img alt=""><span>Note seule</span></button><button type="button" data-memoire="cine" aria-label="Style Ciné"><img alt=""><span>Ciné</span></button><button type="button" data-memoire="postersPlus" aria-label="Style Posters+"><img alt=""><span>Posters+</span></button><button type="button" data-memoire="plateforme" aria-label="Style Plateforme"><img alt=""><span>Plateforme</span></button><button type="button" data-memoire="signature" aria-label="Style Signature"><img alt=""><span>Signature</span></button>
        </div>
        <p class="regie-perso" id="regie-perso" hidden>Réglages perso : ton lien est à toi (il est long, copie-le avec le bouton ou le QR code). La première affiche de chaque titre met une à deux secondes, ensuite elle est instantanée.</p>
        <p class="regie-cible" id="regie-cible" hidden>Tu règles les images en paysage.</p>
        <div class="regie-onglets" id="regie-onglets" role="tablist" aria-label="Réglages par partie de l'affiche">
          <button type="button" role="tab" id="onglet-haut" data-onglet="haut" aria-selected="true" aria-controls="regie-voies">Haut</button><button type="button" role="tab" id="onglet-titre" data-onglet="titre" aria-selected="false" aria-controls="regie-voies" tabindex="-1">Titre</button><button type="button" role="tab" id="onglet-infos" data-onglet="infos" aria-selected="false" aria-controls="regie-voies" tabindex="-1">Infos</button><button type="button" role="tab" id="onglet-image" data-onglet="image" aria-selected="false" aria-controls="regie-voies" tabindex="-1">Image</button><button type="button" role="tab" id="onglet-couleurs" data-onglet="couleurs" aria-selected="false" aria-controls="regie-voies" tabindex="-1">Couleurs</button><button type="button" role="tab" id="onglet-paysage" data-onglet="paysage" aria-selected="false" aria-controls="regie-voies" tabindex="-1">Paysage</button>
        </div>
        <div class="regie-voies" id="regie-voies" role="tabpanel" aria-labelledby="onglet-haut"></div>
        <div class="regie-plus" id="regie-plus" role="region" aria-label="Plus de réglages" hidden></div>
      </div>
      </div>${GALERIE_HTML}
    </div>
  </div>
${guichetHTML()}

<script>${nuvioDonnees(origin, apercus)}</script>
${scripts("nuvio.js")}
<script>
const D = ${json};
</script>
${scripts("outils.js", "salle2.js", "salle2-guichet.js", "salle2-soiree.js", "salle2-galerie.js")}
${copy ? scripts("salle2-hote.js") : ""}
${scripts("scene.js")}
</body>
</html>`;
}

// Les styles et le script de la salle 2, les mêmes pour tous : servis à part (statique.js), gardés en cache par le
// navigateur. La page, elle, change avec chaque lien (réglages, D) et n'est jamais gardée.
export const SALLE2_CSS = `/* Salle obscure : enseigne en haut, la bobine de réglages à gauche, l'écran et le billet à droite. */
:root {
  --velvet: #170c12;      /* fond : velours sombre */
  --velvet-2: #22121b;    /* panneaux */
  --velvet-3: #2f1925;    /* survols, cases */
  --seat: #3d2230;        /* traits */
  --cream: #f5ead8;       /* texte, papier du billet */
  --dim: #b9a59c;         /* texte secondaire */
  --bulb: #ffcf6b;        /* ampoules de l'enseigne */
  --red: #e5413a;         /* rideau, accent principal */
  --ink: #2a1a14;         /* encre du billet */
  --display: "Bebas Neue", Impact, "Arial Narrow", sans-serif;
  --body: "Figtree", "Segoe UI", system-ui, sans-serif;
  --type: "Courier Prime", "Courier New", ui-monospace, monospace;
  color-scheme: dark;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html, body { margin: 0; }
html { overflow-x: clip; }
body {
  background:
    radial-gradient(ellipse 80% 40% at 50% -5%, rgba(229,65,58,.22), transparent 70%),
    repeating-linear-gradient(90deg, rgba(0,0,0,.18) 0 2px, transparent 2px 46px),
    var(--velvet);
  color: var(--cream); font: 16px/1.55 var(--body);
  padding-top: max(28px, env(safe-area-inset-top));
  padding-bottom: calc(96px + env(safe-area-inset-bottom));
  padding-left: max(16px, env(safe-area-inset-left)); padding-right: max(16px, env(safe-area-inset-right));
}
a { color: var(--bulb); }
button { font-family: inherit; }
:focus-visible { outline: 3px solid var(--bulb); outline-offset: 3px; border-radius: 6px; }

/* ---------- Enseigne ---------- */
.marquee-wrap { position: relative; max-width: 1180px; margin: 0 auto 36px; display: grid; justify-items: center; gap: 14px; text-align: center; }
.marquee-wrap p { margin: 0; max-width: 58ch; color: var(--dim); }
.marquee-wrap p b { color: var(--cream); }

/* ---------- Mise en page ---------- */
.layout { max-width: 1180px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 36px; align-items: start; }
main { display: grid; gap: 22px; min-width: 0; }
.act { background: var(--velvet-2); border: 1px solid var(--seat); border-radius: 16px; padding: 22px; display: grid; gap: 14px; min-width: 0; }
.act header { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.act h2 { margin: 0; font: 400 2rem/1 var(--display); letter-spacing: .03em; }
.act header span { font: 700 .74rem var(--body); letter-spacing: .22em; text-transform: uppercase; color: var(--red); }
.act .sub { margin: -6px 0 0; color: var(--dim); font-size: .94rem; max-width: 62ch; }

input[type=text] {
  width: 100%; font: 400 1.7rem/1.1 var(--display); letter-spacing: .04em; padding: 12px 14px;
  color: #fff6e6; background: var(--velvet); border: 1px dashed var(--seat); border-radius: 10px;
}

/* La bobine : chaque rangée est une image de pellicule perforée. */
.reel { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.frame {
  --perf: radial-gradient(circle at 50% 50%, var(--velvet) 3px, transparent 3.5px) 0 4px / 14px 14px repeat-y;
  position: relative; display: grid; grid-template-columns: 26px auto minmax(0, 1fr) auto; gap: 12px; align-items: center;
  padding: 10px 12px 10px 0; border-radius: 6px; background: #0f080c; border: 1px solid #000;
  transition: transform .18s ease, background .18s ease;
}
.frame::before { content: ""; align-self: stretch; background: var(--perf), #24131c; border-radius: 6px 0 0 6px; margin: -10px 0; }
.frame.on { background: linear-gradient(90deg, #3a1a24, #26131c); border-color: #5a2e3c; }
.frame.flash { transform: translateX(6px); }
.frame .pos { font: 400 1.6rem/1 var(--display); color: var(--seat); min-width: 1.6ch; text-align: right; }
.frame.on .pos { color: var(--bulb); }
.frame label { cursor: pointer; min-width: 0; }
.frame b { font-weight: 800; }
.frame .kind { margin-left: 8px; font: 700 .68rem var(--body); letter-spacing: .14em; text-transform: uppercase; color: var(--dim); white-space: nowrap; }
.frame small { display: block; color: var(--dim); font-size: .85rem; line-height: 1.35; }
.frame:not(.on) b, .frame:not(.on) small { opacity: .55; }
.frame > input[type=checkbox] { position: absolute; opacity: 0; width: 1px; height: 1px; }
.tools { display: flex; gap: 4px; align-items: center; }
.toggle { font: 800 .72rem var(--body); letter-spacing: .1em; text-transform: uppercase; border-radius: 99px; padding: 6px 10px; border: 1px solid var(--seat); background: transparent; color: var(--dim); cursor: pointer; white-space: nowrap; }
.frame.on .toggle { background: var(--red); border-color: var(--red); color: #fff; }
.arrow { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--seat); background: transparent; color: var(--cream); cursor: pointer; font-size: .95rem; }
.arrow:disabled { opacity: .25; cursor: default; }
.frame:focus-within { outline: 2px solid var(--bulb); outline-offset: 2px; }

/* Pastilles (plateformes, Découvrir, collections) */
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { position: relative; }
.chip input { position: absolute; inset: 0; opacity: 0; cursor: pointer; margin: 0; }
.chip span {
  display: inline-flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: 99px;
  border: 1px solid var(--seat); background: var(--velvet); color: var(--dim); font-weight: 700; font-size: .92rem;
  transition: background .15s ease, color .15s ease, border-color .15s ease;
}
.chip i { width: 10px; height: 10px; border-radius: 50%; background: var(--c, var(--dim)); box-shadow: 0 0 0 2px rgba(255,255,255,.08); }
.chip input:checked + span { background: var(--cream); border-color: var(--cream); color: var(--ink); }
.chip input:focus-visible + span { outline: 3px solid var(--bulb); outline-offset: 2px; }
.group { display: grid; gap: 8px; }
.group h3 { margin: 0; font: 700 .72rem var(--body); letter-spacing: .22em; text-transform: uppercase; color: var(--dim); }
.warn { margin: 0; color: var(--bulb); font-weight: 700; font-size: .9rem; }
.reset { justify-self: start; background: none; border: 0; padding: 0; color: var(--dim); text-decoration: underline; text-underline-offset: 4px; cursor: pointer; font-size: .92rem; }
/* Programmation remise d'origine : « Annuler » pendant 10 secondes, en haut de l'écran (comme les messages). */
.annule { position: fixed; left: 50%; top: calc(18px + env(safe-area-inset-top)); z-index: 86; transform: translateX(-50%); display: flex; align-items: center; gap: 14px;
  width: max-content; max-width: calc(100vw - 32px); padding: 8px 8px 8px 18px; border-radius: 12px; background: var(--cream); color: var(--ink); font: 800 .95rem var(--body); box-shadow: 0 12px 30px rgba(0,0,0,.5); }
.annule[hidden] { display: none; }
.annule button { flex: none; min-height: 44px; padding: 8px 18px; border: 0; border-radius: 99px; background: var(--ink); color: var(--cream); font: 800 .9rem var(--body); cursor: pointer; }

/* ---------- L'écran : aperçu de l'accueil ---------- */
.steps-howto { margin: 0; padding: 0; list-style: none; counter-reset: st; display: grid; gap: 12px; }
.steps-howto li { counter-increment: st; display: grid; grid-template-columns: 44px 1fr; gap: 12px; align-items: start; color: #d9c8be; }
.steps-howto li::before { content: counter(st); font: 400 2.2rem/1 var(--display); color: var(--bulb); text-align: center; border: 1px dashed rgba(255,207,107,.4); border-radius: 10px; padding: 6px 0 2px; }
.steps-howto b { color: var(--cream); }
aside { position: sticky; top: 18px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 22px; min-width: 0; }
/* Trop haut pour la fenêtre : la colonne prend toute la hauteur, l'écran reste collé en haut (en entier)
   et le billet arrive en bas, à la fin du défilement. */
aside.long { position: relative; top: auto; align-self: stretch; grid-template-rows: minmax(0, 1fr) auto auto; }
aside.long .stage:not(.big) { position: sticky; top: var(--stage-top, 18px); }

/* ---------- Le billet ---------- */
.ticket { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 74px; color: var(--ink); filter: drop-shadow(0 16px 30px rgba(0,0,0,.5)); }
.ticket .main, .ticket .stub {
  background: var(--cream);
  background-image: repeating-linear-gradient(0deg, rgba(42,26,20,.035) 0 1px, transparent 1px 4px);
}
.ticket .main { border-radius: 12px 0 0 12px; padding: 18px 18px 16px; display: grid; gap: 10px; min-width: 0;
  -webkit-mask: radial-gradient(circle 11px at 100% 0, transparent 98%, #000) top / 100% 51% no-repeat, radial-gradient(circle 11px at 100% 100%, transparent 98%, #000) bottom / 100% 51% no-repeat;
          mask: radial-gradient(circle 11px at 100% 0, transparent 98%, #000) top / 100% 51% no-repeat, radial-gradient(circle 11px at 100% 100%, transparent 98%, #000) bottom / 100% 51% no-repeat; }
.ticket .stub { border-radius: 0 12px 12px 0; border-left: 2px dashed rgba(42,26,20,.35); display: grid; place-items: center;
  -webkit-mask: radial-gradient(circle 11px at 0 0, transparent 98%, #000) top / 100% 51% no-repeat, radial-gradient(circle 11px at 0 100%, transparent 98%, #000) bottom / 100% 51% no-repeat;
          mask: radial-gradient(circle 11px at 0 0, transparent 98%, #000) top / 100% 51% no-repeat, radial-gradient(circle 11px at 0 100%, transparent 98%, #000) bottom / 100% 51% no-repeat; }
.stub span { writing-mode: vertical-rl; transform: rotate(180deg); font: 400 1.25rem/1 var(--display); letter-spacing: .12em; color: var(--red); white-space: nowrap; }
.t-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; border-bottom: 2px solid var(--ink); padding-bottom: 6px; }
.t-head b { font: 400 1.7rem/1 var(--display); letter-spacing: .04em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.t-head span { font: 700 .78rem var(--type); white-space: nowrap; }
.t-meta { display: flex; flex-wrap: wrap; gap: 4px 14px; font: 400 .8rem var(--type); }
.t-meta b { font-weight: 700; }
.t-label { font: 700 .7rem var(--body); letter-spacing: .2em; text-transform: uppercase; color: #7a5a4c; }
.t-url { font: 400 .76rem/1.45 var(--type); word-break: break-all; user-select: all; background: rgba(42,26,20,.07); border-radius: 6px; padding: 8px 10px; max-height: 6.2em; overflow: auto; }
.t-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
/* Copie bloquée par le navigateur : le contenu des collections s'affiche, déjà sélectionné. */
.t-contenu { display: block; width: 100%; height: 6.2em; resize: none; border: 0; color: inherit; }
.t-contenu[hidden] { display: none; }
.btn { font: 800 .9rem var(--body); border-radius: 8px; padding: 11px 10px; cursor: pointer; text-align: center; text-decoration: none; border: 2px solid var(--ink); }
.btn.solid { background: var(--ink); color: var(--cream); }
.btn.solid:hover { background: var(--red); border-color: var(--red); }
.btn.line { background: transparent; color: var(--ink); }
.btn.full { grid-column: 1 / -1; }
/* Collections : 19 avec les facultatives, choisies dans une fenêtre ; la page n'en garde qu'un résumé. */
.coll-resume { margin: 0 0 12px; font-weight: 700; }
#coll-dialog, #acc-dialog { width: min(920px, calc(100vw - 24px)); max-height: calc(100vh - 32px); padding: 0; border: 2px solid var(--ink); border-radius: 14px; background: var(--cream); color: var(--ink); }
#coll-dialog::backdrop, #acc-dialog::backdrop { background: rgba(5,3,4,.72); }
.coll-dlg-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; background: var(--cream); border-bottom: 2px solid var(--ink); }
.coll-dlg-head h2 { margin: 0; }
.coll-dlg-body { padding: 14px 16px 18px; }
/* L'ordre de l'accueil : des cartes sombres numérotées (comme celles des collections), sur le papier de la fenêtre. */
#acc-dialog .sub { color: #5b4636; margin: 0 0 12px; }
.acc-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.acc-item { display: grid; grid-template-columns: 34px 1fr auto; align-items: center; gap: 10px; padding: 8px 10px 8px 8px;
  background: var(--velvet); color: var(--cream); border: 1px solid var(--seat); border-left: 4px solid var(--seat); border-radius: 12px; transition: background .25s; }
.acc-item.coll-item { border-left-color: var(--bulb); }
.acc-item.epingle { border-style: dashed; border-left-style: solid; border-left-color: var(--red); background: #241219; }
.acc-item.bouge { background: #3a1d2a; }
.acc-num { font: 400 1.5rem/1 var(--display); color: var(--bulb); text-align: center; }
.acc-nom { min-width: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.acc-nom b { font-weight: 800; overflow-wrap: anywhere; }
.acc-tag { font: 800 .64rem/1 var(--body); letter-spacing: .14em; text-transform: uppercase; padding: 4px 7px; border-radius: 999px; border: 1px solid var(--seat); color: var(--dim); }
.coll-item .acc-tag { background: var(--bulb); border-color: var(--bulb); color: var(--ink); }
.epingle .acc-tag { background: var(--red); border-color: var(--red); color: #fff; }
.acc-fleches { display: flex; gap: 6px; }
.acc-fleches .arrow { border-color: #6a4153; }
.acc-fleches .arrow:not(:disabled):hover { background: var(--cream); color: var(--ink); }
.prov-titre { margin: 16px 0 8px; font: 700 .78rem var(--body); letter-spacing: .16em; text-transform: uppercase; color: var(--bulb); }
.prov-ordre { max-width: 520px; }
.prov-ordre .acc-item { padding: 6px 8px; border-left-color: var(--bulb); background: rgba(255,255,255,.03); }
.acc-nom .pastille { width: 10px; height: 10px; border-radius: 50%; background: var(--c); flex: none; box-shadow: 0 0 0 2px rgba(255,255,255,.1); }
/* La fenêtre des collections : cartes sombres au texte clair sur le papier ; les décochées en pointillés. */
#coll-dialog .coll { color: var(--cream); }
#coll-dialog .coll-head .switch b { color: var(--cream); font-size: 1.02rem; }
#coll-dialog .coll.off { opacity: 1; background: #241219; border-style: dashed; }
#coll-dialog .coll.off .coll-head .switch b { color: var(--dim); }
#coll-dialog .coll.off details { display: none; }
#coll-dialog .coll-rangees { color: #5b4636; border-color: rgba(42,26,20,.35); }
#coll-dialog .coll-rangees b { color: var(--red); }
#coll-dialog .coll-intro { margin: 0 0 12px; color: #5b4636; }
.btn:disabled { opacity: .6; cursor: wait; }
/* Lien fixe : un encart pointillé dans le billet, sous le lien de l'addon. */
.compte-nuvio { display: grid; gap: 6px; }
.compte-nuvio p { margin: 0; font: 600 .78rem/1.45 var(--body); color: #7a5a4c; }
/* Les liens à coller, repliés : « Tout envoyer dans Nuvio » les remplace pour qui a un compte Nuvio. */
.a-la-main summary { cursor: pointer; font: 800 .82rem var(--body); color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
.a-la-main-corps { display: grid; gap: 10px; margin-top: 12px; }
.fixe { display: grid; gap: 8px; padding: 10px 12px; border: 2px dashed rgba(42,26,20,.3); border-radius: 10px; }
.fixe p { margin: 0; font: 600 .82rem/1.45 var(--body); color: #4a2e24; }
.fixe p b { color: var(--ink); }
.fixe .etat { font-weight: 800; color: #2f6b3a; }
.fixe .t-btns { grid-template-columns: 1fr; }
/* Le lien pour modifier : discret, pour qu'on ne le prenne pas pour celui à coller dans Nuvio. */
.fixe .autre { font: 600 .76rem/1.45 var(--body); color: #7a5a4c; }
.fixe .discret { padding: 0; border: 0; background: none; font: inherit; font-weight: 800; color: var(--ink); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
/* « Ta TV l'a reçu » : un voyant devant la phrase (vert : reçu ; ambre qui clignote : en attente ; éteint : pas encore). */
.fixe .recu { position: relative; padding: 7px 10px 7px 28px; border-radius: 8px; background: rgba(42,26,20,.06); font: 600 .8rem/1.45 var(--body); }
.fixe .recu::before { content: ""; position: absolute; left: 10px; top: .78em; width: 9px; height: 9px; border-radius: 50%; background: #a8968c; }
.fixe .recu small { display: block; font-weight: 600; color: #7a5a4c; }
.fixe .recu.ok { background: rgba(47,107,58,.12); }
.fixe .recu.ok b { color: #2f6b3a; }
.fixe .recu.ok::before { background: #3a9a4c; box-shadow: 0 0 0 3px rgba(58,154,76,.22); }
.fixe .recu.attente { background: rgba(217,140,30,.13); }
.fixe .recu.attente::before { background: #d98c1e; animation: voyant 1.4s ease-in-out infinite; }
@keyframes voyant { 50% { opacity: .3; } }

.howto { background: var(--velvet-2); border: 1px solid var(--seat); border-radius: 16px; padding: 16px 18px; font-size: .9rem; color: var(--dim); display: grid; gap: 8px; }
.howto b { color: var(--cream); }
.howto ol { margin: 0; padding-left: 1.2em; display: grid; gap: 3px; }

/* Barre du bas sur téléphone */
.dock { display: none; }
@media (max-width: 960px) {
  .layout { grid-template-columns: minmax(0, 1fr); }
  aside { position: static; order: -1; }
  .tv { max-width: 520px; width: 100%; justify-self: center; }
  .dock { display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 20; gap: 10px; align-items: center;
    padding: 12px max(16px, env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
    background: rgba(23,12,18,.94); backdrop-filter: blur(8px); border-top: 1px solid var(--seat); }
  .dock { transition: transform .25s cubic-bezier(.22,1,.36,1); }
  .dock.cache { transform: translateY(110%); }
  .dock-billet { flex: 1; min-width: 0; min-height: 44px; padding: 0; border: 0; background: none; text-align: left; cursor: pointer; font: 400 .85rem/1.35 var(--body); color: var(--dim); }
  .dock-billet b { color: var(--cream); }
  .dock-billet i { font-style: normal; color: var(--bulb); margin-left: 4px; }
  .dock .btn { border-color: var(--cream); background: var(--cream); color: var(--ink); flex: none; min-height: 46px; }
  /* Clavier ouvert : la barre du bas cacherait le champ qu'on remplit. */
  body:has(:is(input[type=text], input[type=password], input[type=number], input[type=search], select):focus) .dock { display: none; }
}
@media (max-width: 520px) {
  .frame { grid-template-columns: 22px auto minmax(0, 1fr); }
  .tools { grid-column: 2 / -1; }
  .ticket { grid-template-columns: minmax(0, 1fr) 54px; }
  .act { padding: 18px 16px; }
  .act h2 { font-size: 1.75rem; }
  .t-btns { grid-template-columns: minmax(0, 1fr); }
  .t-btns .btn { min-height: 48px; }
}
@media (prefers-reduced-motion: reduce) { *, *::before { animation: none !important; transition: none !important; } }

/* ---------- Ajouts : réglages avancés ---------- */
/* Sommaire : une bande de pellicule flottante, la section en cours s'allume. */
.nav { position: sticky; top: calc(env(safe-area-inset-top, 0px) + 12px); z-index: 15; justify-self: start; max-width: 100%;
  display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; padding: 9px 10px;
  border-radius: 14px; border: 1px solid rgba(255,207,107,.22);
  background:
    radial-gradient(circle, rgba(0,0,0,.55) 2px, transparent 2.5px) 6px 2px / 12px 6px repeat-x,
    radial-gradient(circle, rgba(0,0,0,.55) 2px, transparent 2.5px) 6px calc(100% - 2px) / 12px 6px repeat-x,
    rgba(28,14,21,.82);
  -webkit-backdrop-filter: blur(10px) saturate(1.3); backdrop-filter: blur(10px) saturate(1.3);
  box-shadow: 0 10px 30px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.03); }
.nav::-webkit-scrollbar { display: none; }
.nav a { flex: none; text-decoration: none; color: var(--dim); font: 700 .8rem var(--body); letter-spacing: .02em; padding: 7px 10px; border-radius: 9px; transition: background .2s ease, color .2s ease; }
.nav a:hover { color: var(--cream); background: rgba(255,255,255,.05); }
.nav a.on { background: var(--bulb); color: var(--ink); box-shadow: 0 0 14px rgba(255,207,107,.45); }
.frame .orig { font-style: normal; color: var(--bulb); font-size: .78rem; margin-left: 6px; }
.frame .rename { display: none; gap: 6px; margin-top: 6px; }
.frame.editing .rename { display: flex; }
.rename input { flex: 1; min-width: 0; font: 600 .95rem var(--body); padding: 7px 10px; border-radius: 8px; border: 1px solid var(--bulb); background: var(--velvet); color: var(--cream); }
.mini { font: 700 .78rem var(--body); border-radius: 8px; padding: 6px 10px; border: 1px solid var(--seat); background: transparent; color: var(--cream); cursor: pointer; white-space: nowrap; }
.mini.ok { background: var(--bulb); border-color: var(--bulb); color: var(--ink); }
.mini.del { color: #ff9c95; }
.icon { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--seat); background: transparent; color: var(--cream); cursor: pointer; font-size: .9rem; }
.badge { display: inline-block; margin-left: 8px; font: 800 .62rem var(--body); letter-spacing: .14em; text-transform: uppercase; color: var(--ink); background: var(--bulb); border-radius: 4px; padding: 2px 5px; vertical-align: 2px; }
.add-row { justify-self: start; font: 800 .95rem var(--body); padding: 12px 18px; border-radius: 10px; border: 1px dashed var(--bulb); background: rgba(255,207,107,.06); color: var(--bulb); cursor: pointer; }
.add-row:disabled { opacity: .4; cursor: default; }

.builder { border: 1px solid var(--bulb); border-radius: 14px; padding: 18px; display: grid; gap: 16px; background: linear-gradient(180deg, #2a1720, #1d0f16); }
.builder h3 { margin: 0; font: 400 1.6rem/1 var(--display); letter-spacing: .03em; color: var(--bulb); }
.field { display: grid; gap: 8px; }
.ai-key { display: flex; gap: 8px; }
.ai-key input { flex: 1; min-width: 0; }
.ai-key button { flex: none; padding: 0 12px; border-radius: 8px; border: 1px solid var(--seat); background: var(--velvet); color: var(--cream); cursor: pointer; }
#ai-key-hint { color: var(--dim); min-height: 1.2em; }
#ai-key-hint.alerte { color: #ffe1d8; min-height: 0; }
/* Clé masquée sans champ « mot de passe » (Chrome proposerait de l'enregistrer). */
#ai-key.masque { -webkit-text-security: disc; text-security: disc; }
/* Espace hébergeur (copies auto-hébergées seulement). */
.hote-box { display: grid; gap: 12px; }
.hote-ligne { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.hote-ligne input { flex: 1; min-width: 0; font: 600 1rem var(--body); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--seat); background: var(--velvet); color: var(--cream); }
.hote-btn { padding: 10px 14px; border-radius: 8px; border: 1px solid var(--cream); background: var(--cream); color: var(--ink); font: 700 .9rem var(--body); cursor: pointer; }
.hote-btn.line { background: transparent; color: var(--cream); justify-self: start; }
.hote-maj { border: 1px solid var(--red); border-radius: 12px; padding: 14px 16px; display: grid; gap: 10px; background: var(--velvet-2); }
.hote-maj ul { margin: 0; padding-left: 1.2em; color: var(--dim); }
.hote-maj a { color: var(--cream); }
.hote-how { display: grid; gap: 8px; color: var(--dim); }
.hote-how p { margin: 0; }
.hote-how code { display: block; padding: 8px 10px; border-radius: 6px; background: var(--velvet); color: var(--cream); user-select: all; overflow-wrap: anywhere; }
.field > span { font: 700 .72rem var(--body); letter-spacing: .2em; text-transform: uppercase; color: var(--dim); }
.field input:is([type=text], [type=password]).plain, select, input[type=number] { font: 600 1rem var(--body); letter-spacing: 0; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--seat); background: var(--velvet); color: var(--cream); }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.seg { display: inline-flex; flex-wrap: wrap; gap: 0; border: 1px solid var(--seat); border-radius: 10px; overflow: hidden; justify-self: start; }
.seg button { font: 700 .88rem var(--body); padding: 9px 14px; border: 0; background: var(--velvet); color: var(--dim); cursor: pointer; border-right: 1px solid var(--seat); }
.seg button:last-child { border-right: 0; }
.seg button[aria-pressed="true"] { background: var(--cream); color: var(--ink); }
/* Listes déroulantes : flèche dorée ; le menu ouvert prend les couleurs de la salle
   dans les navigateurs qui savent le personnaliser (sinon, menu du système). */
select { cursor: pointer; appearance: none; padding-right: 38px; transition: border-color .2s ease;
  background: var(--velvet) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%23ffcf6b' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E") right 14px center / 12px 8px no-repeat; }
select:hover { border-color: rgba(255,207,107,.5); }
@supports (appearance: base-select) {
  select, ::picker(select) { appearance: base-select; }
  select { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-right: 14px; background-image: none; }
  select::picker-icon { content: ""; width: 7px; height: 7px; border-right: 2px solid var(--bulb); border-bottom: 2px solid var(--bulb); transform: translateY(-2px) rotate(45deg); transition: transform .25s ease; }
  select:open { border-color: var(--bulb); }
  select:open::picker-icon { transform: translateY(2px) rotate(225deg); }
  ::picker(select) { margin-top: 6px; padding: 6px; max-height: 320px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--seat) transparent;
    border: 1px solid rgba(255,207,107,.35); border-radius: 12px; background: #1d0f16; color: var(--cream); box-shadow: 0 18px 44px rgba(0,0,0,.65), 0 0 0 1px rgba(0,0,0,.4);
    opacity: 0; transform: translateY(-6px); transition: opacity .18s ease, transform .18s ease, overlay .18s allow-discrete, display .18s allow-discrete; }
  ::picker(select):popover-open { opacity: 1; transform: none; }
  @starting-style { ::picker(select):popover-open { opacity: 0; transform: translateY(-6px); } }
  select option { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px; font: 600 .95rem var(--body); color: var(--cream); background: transparent; cursor: pointer; }
  select option:hover, select option:focus-visible { background: rgba(255,207,107,.12); color: #fff; outline: none; }
  select option:checked { background: var(--bulb); color: var(--ink); font-weight: 800; }
  select option::checkmark { content: "✓"; order: 1; margin-left: auto; }
}

/* Curseurs de note : un sillon sombre, la part choisie en or, une graduation par point,
   et une ampoule qu'on fait glisser (éteinte tant qu'il n'y a pas de note minimale). */
.range { display: flex; align-items: center; gap: 14px; }
.range input[type=range] { --p: 0%; --steps: 8; flex: 1; min-width: 0; height: 30px; margin: 0; background: transparent; cursor: pointer; -webkit-appearance: none; appearance: none; }
.range input[type=range]:focus-visible { outline: none; }
.range input[type=range]::-webkit-slider-runnable-track { height: 8px; border-radius: 4px;
  background: linear-gradient(90deg, #a8742a, var(--bulb)) 0 0 / var(--p) 100% no-repeat, repeating-linear-gradient(90deg, rgba(255,255,255,.16) 0 1px, transparent 1px calc(100% / var(--steps))), #0f080c;
  box-shadow: inset 0 1px 2px rgba(0,0,0,.6), 0 0 0 1px var(--seat); }
.range input[type=range]::-moz-range-track { height: 8px; border-radius: 4px; background: repeating-linear-gradient(90deg, rgba(255,255,255,.16) 0 1px, transparent 1px calc(100% / var(--steps))), #0f080c; box-shadow: inset 0 1px 2px rgba(0,0,0,.6), 0 0 0 1px var(--seat); }
.range input[type=range]::-moz-range-progress { height: 8px; border-radius: 4px; background: linear-gradient(90deg, #a8742a, var(--bulb)); }
.range input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; margin-top: -7px; border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, #fff8e1, var(--bulb) 55%, #c98b2e); box-shadow: 0 0 0 3px #1b0d14, 0 0 16px rgba(255,207,107,.85); transition: transform .15s ease, box-shadow .15s ease; }
.range input[type=range]::-moz-range-thumb { width: 22px; height: 22px; border: 0; border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, #fff8e1, var(--bulb) 55%, #c98b2e); box-shadow: 0 0 0 3px #1b0d14, 0 0 16px rgba(255,207,107,.85); transition: transform .15s ease, box-shadow .15s ease; }
.range input[type=range]:hover::-webkit-slider-thumb, .range input[type=range]:active::-webkit-slider-thumb { transform: scale(1.15); }
.range input[type=range]:hover::-moz-range-thumb, .range input[type=range]:active::-moz-range-thumb { transform: scale(1.15); }
.range input[type=range]:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px #1b0d14, 0 0 0 6px var(--bulb), 0 0 16px rgba(255,207,107,.85); }
.range input[type=range]:focus-visible::-moz-range-thumb { box-shadow: 0 0 0 3px #1b0d14, 0 0 0 6px var(--bulb), 0 0 16px rgba(255,207,107,.85); }
.range input[type=range].zero::-webkit-slider-thumb { background: radial-gradient(circle at 40% 35%, #8a6a4c, #4e3420 60%, #2e1c12); box-shadow: 0 0 0 3px #1b0d14, inset 0 0 3px rgba(0,0,0,.6); }
.range input[type=range].zero::-moz-range-thumb { background: radial-gradient(circle at 40% 35%, #8a6a4c, #4e3420 60%, #2e1c12); box-shadow: 0 0 0 3px #1b0d14, inset 0 0 3px rgba(0,0,0,.6); }
.range input[type=range].zero + output { color: var(--dim); }
.range output { font: 400 1.5rem/1 var(--display); color: var(--bulb); min-width: 3.4ch; text-align: right; }
.summary { margin: 0; padding: 12px 14px; border-radius: 10px; background: rgba(0,0,0,.25); font: 400 .9rem/1.45 var(--type); color: var(--cream); }
.b-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.b-actions .mini { padding: 10px 16px; font-size: .9rem; }

.chips.danger .chip input:checked + span { background: var(--red); border-color: var(--red); color: #fff; text-decoration: line-through; text-decoration-thickness: 2px; }
.switch { display: flex; align-items: center; gap: 12px; cursor: pointer; }
.switch input { appearance: none; width: 46px; height: 26px; border-radius: 99px; background: var(--seat); position: relative; cursor: pointer; flex: none; transition: background .15s ease; }
.switch input::after { content: ""; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: var(--cream); transition: transform .15s ease; }
.switch input:checked { background: var(--red); }
.switch input:checked::after { transform: translateX(20px); }
.switch small { display: block; color: var(--dim); }
.aff-resume { margin: 0 0 12px; color: var(--cream); }
.aff-resume b { color: var(--bulb); }

/* ---------- La régie : le configurateur d'affiches, en fenêtre (scène + console d'éclairage) ----------
   Sur ordinateur et tablette, tout tient dans l'écran sans défiler : la scène à gauche (grande affiche à la
   hauteur disponible, six coulisses en rangée dessous), la console à droite. Sur téléphone, tout s'empile. */
.regie-affiches { position: fixed; inset: 0; z-index: 95; display: grid; place-items: center; padding: 16px; background: rgba(5,3,4,.86); animation: fade-in .2s ease both; }
.regie-affiches[hidden] { display: none; }
.regie-boite { width: min(1240px, 100%); height: calc(100dvh - 32px); max-height: 940px; display: grid; grid-template-rows: auto minmax(0, 1fr); border-radius: 16px; overflow: hidden; background: #0d0a0c; border: 1px solid var(--seat); box-shadow: 0 30px 80px rgba(0,0,0,.6); color: var(--cream); }
.regie-barre { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 16px; background: #140e11; border-bottom: 1px solid var(--seat); }
.regie-barre h2 { margin: 0; font: 400 1.6rem/1 var(--display); letter-spacing: .05em; }
/* Importer un lien : un petit panneau sous la barre, à droite (par-dessus la scène : rien ne bouge). */
.regie-barre { position: relative; }
.regie-import { position: absolute; top: calc(100% + 6px); right: 16px; z-index: 5; width: min(520px, calc(100% - 32px)); display: grid; gap: 8px; padding: 12px 14px;
  border-radius: 12px; background: #241c22; border: 1px solid #5a4a53; box-shadow: 0 12px 40px rgba(0,0,0,.6); color: var(--cream); font: 500 .8rem system-ui, sans-serif; }
.regie-import[hidden] { display: none; }
.regie-import-ligne { display: flex; gap: 8px; }
.regie-import input { flex: 1; min-width: 0; padding: 8px 10px; border-radius: 8px; border: 1px solid #5a4a53; background: #140e11; color: var(--cream); font: 500 .78rem ui-monospace, monospace; }
.regie-import input:focus-visible { outline: 2px solid var(--bulb); outline-offset: 1px; }
.regie-import-msg { margin: 0; min-height: 1em; color: #c2b4a6; }
.regie-import-msg.erreur { color: #ff8a8a; }
/* QR code du lien d'affiches : même panneau, le code à gauche, l'explication à droite. */
.regie-qr { width: min(440px, calc(100% - 32px)); grid-template-columns: 168px minmax(0, 1fr); align-items: center; gap: 14px; }
.regie-qr p { margin: 0; line-height: 1.45; color: #e6d6c8; }
.regie-qr-code { width: 168px; height: 168px; display: grid; place-items: center; padding: 6px; border-radius: 10px; background: #fff; color: #2a1a14; font: 400 .72rem var(--type); text-align: center; }
.regie-qr-code svg { width: 100%; height: 100%; display: block; }
.regie-qr-code.alerte { background: #3b1216; color: #ffe1d8; }
@media (max-width: 520px) { .regie-qr { grid-template-columns: 1fr; justify-items: center; text-align: center; } }
.regie-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.regie-x { width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--seat); background: transparent; color: var(--cream); font-size: 1.05rem; cursor: pointer; }
.regie-corps { display: grid; grid-template-columns: minmax(0, 1fr) 400px; min-height: 0; }

/* La scène : rideaux, en-tête (titre en cours + Portrait/Paysage), grande affiche, rangée de coulisses. */
.regie-scene { position: relative; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 10px; min-height: 0; padding: 12px 44px 12px;
  background: radial-gradient(ellipse 50% 60% at 50% 45%, rgba(255,236,190,.16), transparent 72%), linear-gradient(#1c1013, #0d0a0c); }
.regie-rideau { position: absolute; top: 0; bottom: 0; width: 28px; background: repeating-linear-gradient(90deg, #4a0c18 0 9px, #6b1526 9px 15px); }
.regie-rideau.g { left: 0; } .regie-rideau.d { right: 0; }
.regie-tete { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.regie-legende { margin: 0; color: var(--dim); font-size: .85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.regie-tete .seg button { padding: 6px 12px; font-size: .8rem; }
/* Le titre de son choix : une ligne sous l'en-tête, la liste des titres trouvés par-dessus la grande affiche. */
.regie-tete { flex-wrap: wrap; }
.regie-legende { flex: 1 1 0; min-width: 0; }
.regie-choix { position: relative; flex: 1 1 100%; display: flex; gap: 8px; align-items: center; }
.regie-choix input { flex: 1; min-width: 0; font: 500 .85rem/1.2 var(--body); padding: 8px 12px; color: #fff6e6; background: rgba(0,0,0,.35); border: 1px solid var(--seat); border-radius: 99px; }
.regie-choix input:focus-visible { outline: 2px solid var(--bulb); outline-offset: 2px; }
.regie-retirer { flex: none; font: 600 .75rem/1 var(--body); padding: 8px 12px; color: var(--dim); background: none; border: 1px solid var(--seat); border-radius: 99px; cursor: pointer; }
.regie-retirer:hover, .regie-retirer:focus-visible { color: var(--cream); border-color: var(--dim); }
#regie-propositions { position: absolute; z-index: 5; top: calc(100% + 6px); left: 0; right: 0; max-height: min(360px, 55vh); overflow-y: auto; margin: 0; padding: 6px; list-style: none;
  background: #1b1216; border: 1px solid var(--seat); border-radius: 12px; box-shadow: 0 18px 40px rgba(0,0,0,.6); }
#regie-propositions li { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 8px; cursor: pointer; color: var(--cream); font: 500 .85rem/1.25 var(--body); }
#regie-propositions li[aria-selected="true"], #regie-propositions li:hover { background: rgba(255,207,107,.12); }
#regie-propositions li.vide { cursor: default; color: var(--dim); }
#regie-propositions img, #regie-propositions .sans { flex: none; width: 34px; aspect-ratio: 2 / 3; object-fit: cover; border-radius: 4px; background: #2a1d22; }
#regie-propositions small { display: block; color: var(--dim); font-size: .72rem; }
@media (pointer: coarse) { .regie-choix input, .regie-retirer { min-height: 44px; } #regie-propositions li { min-height: 52px; } }
/* La grande affiche prend toute la place, en gardant ses proportions (2:3 ou 16:9) : largeur bornée par la largeur ET la hauteur du plateau. */
.regie-plateau { margin: 0; min-height: 0; display: flex; justify-content: center; align-items: center; container-type: size; }
.regie-plateau img { display: block; width: min(100cqw, calc(100cqh * 2 / 3)); height: auto; aspect-ratio: 2 / 3; object-fit: cover; border-radius: 8px; background: #1b1418; box-shadow: 0 0 60px rgba(255,220,150,.18); transition: opacity .25s ease; }
.regie-plateau.paysage img { width: min(100cqw, calc(100cqh * 16 / 9)); aspect-ratio: 16 / 9; }
.regie-plateau img.attente { opacity: .55; }
.regie-coulisses { display: flex; justify-content: center; gap: 10px; }
.regie-coulisses button { width: 62px; flex: none; padding: 0; border: 0; background: none; color: var(--dim); font: 600 .66rem/1.2 system-ui, sans-serif; cursor: pointer; text-align: center; }
.regie-coulisses img { display: block; width: 62px; aspect-ratio: 2 / 3; object-fit: cover; border-radius: 5px; margin-bottom: 4px; outline: 2px solid transparent; outline-offset: 2px; opacity: .8; background: #1b1418; }
.regie-coulisses button[aria-pressed="true"] img { outline-color: var(--bulb); opacity: 1; }
.regie-coulisses span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.regie-coulisses.paysage button { width: 104px; }
.regie-coulisses.paysage img { width: 104px; aspect-ratio: 16 / 9; }

/* La console : styles tout prêts en vignettes (vraies petites affiches), 6 onglets, une carte par élément (icône,
   nom, interrupteur, choix principaux visibles ; réglages fins dans « Plus de réglages », un seul ouvert). */
.regie-console { display: flex; flex-direction: column; gap: 8px; min-height: 0; overflow: auto; padding: 12px 14px; background: linear-gradient(#231d22, #161117); border-left: 3px solid #3a2f36; }
.regie-memoires { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
.regie-memoires button { display: flex; flex-direction: column; align-items: stretch; gap: 4px; min-width: 0; padding: 3px; border: 1.5px solid transparent; border-radius: 9px; background: none; color: #d8cab2; font: 600 .62rem/1.1 system-ui, sans-serif; cursor: pointer; }
.regie-memoires img { display: block; width: 100%; aspect-ratio: 2 / 3; object-fit: cover; border-radius: 6px; background: #2a2126; }
.regie-memoires span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center; }
.regie-memoires button:hover { border-color: #5a4a53; }
.regie-memoires button[aria-pressed="true"] { border-color: var(--bulb); color: var(--bulb); background: rgba(255,207,107,.08); }
.regie-perso { margin: -4px 0 0; color: var(--bulb); font: 600 .72rem system-ui, sans-serif; }
.regie-perso[hidden], .regie-cible[hidden] { display: none; }
.regie-cible { margin: 0; padding: 5px 10px; border-radius: 8px; background: rgba(255,207,107,.12); color: var(--bulb); font: 600 .78rem system-ui, sans-serif; }
.regie-onglets { display: flex; border-bottom: 1px solid #3a2f36; }
.regie-onglets button { flex: 1; min-width: 0; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; background: none; color: #c2b4a6; font: 600 .74rem system-ui, sans-serif; padding: 8px 0; cursor: pointer; white-space: nowrap; }
.regie-onglets button:hover { color: var(--cream); }
.regie-onglets button[aria-selected="true"] { color: var(--cream); border-bottom-color: var(--bulb); }
.regie-voies { display: flex; flex-direction: column; gap: 5px; }
.regie-voies .carte { display: grid; gap: 6px; padding: 7px 10px; border-radius: 12px; background: #1d171b; border: 1px solid #30272d; }
.regie-voies .carte.ouverte { border-color: #5a4a53; }
.regie-voies .carte-tete { display: flex; align-items: center; gap: 9px; }
.regie-voies .carte-icone { width: 28px; height: 28px; flex: none; border-radius: 8px; display: grid; place-items: center; background: #2a2126; }
.regie-voies .carte-icone svg { width: 17px; height: 17px; fill: none; stroke: var(--bulb); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.regie-voies .carte-tete b { flex: 1; min-width: 0; font-size: .82rem; color: var(--cream); }
.regie-voies .eteinte .carte-icone svg { stroke: #8d7f86; }
.regie-voies .eteinte .carte-tete b { color: #b9aa97; }
.regie-voies .carte-corps { display: grid; gap: 6px; }
.regie-voies .carte-fin { border-top: 1px dashed #3a2f36; padding-top: 7px; }
.regie-voies .carte-plus { flex: none; border: 1px solid #4a3d45; border-radius: 99px; background: none; color: var(--bulb); font: 600 .66rem system-ui, sans-serif; padding: 3px 9px; cursor: pointer; }
.regie-voies .carte-plus:hover, .regie-voies .carte-plus[aria-expanded="true"] { border-color: var(--bulb); }
/* Panneau « Plus de réglages » : posé par-dessus le bas de la console, il ne déplace rien ; il défile s'il est long. */
.regie-console { position: relative; }
.regie-plus { position: absolute; left: 10px; right: 10px; bottom: 10px; max-height: calc(100% - 150px); overflow: auto; display: grid; gap: 8px;
  padding: 10px 12px 12px; border-radius: 14px; background: #241c22; border: 1px solid #5a4a53; box-shadow: 0 -12px 40px rgba(0,0,0,.6); animation: plus-monte .18s ease both; z-index: 2; }
.regie-plus[hidden] { display: none; }
.regie-plus .plus-tete { display: flex; align-items: center; gap: 8px; }
.regie-plus .plus-tete b { flex: 1; font-size: .84rem; color: var(--bulb); }
.regie-plus .plus-fermer { width: 28px; height: 28px; border-radius: 50%; border: 1px solid #5a4a53; background: transparent; color: var(--cream); cursor: pointer; }
.regie-plus .carte-corps { display: grid; gap: 7px; }
@keyframes plus-monte { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .regie-plus { animation: none; } }
.regie-console .interrupteur { width: 36px; height: 20px; flex: none; border: 0; border-radius: 99px; background: #4a3d45; position: relative; cursor: pointer; padding: 0; }
.regie-console .interrupteur::after { content: ""; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: #d8cab2; transition: transform .15s ease; }
.regie-console .interrupteur[aria-checked="true"] { background: var(--bulb); }
.regie-console .interrupteur[aria-checked="true"]::after { transform: translateX(16px); background: #1a1208; }
.regie-console .choix { display: grid; grid-template-columns: 70px 1fr; align-items: center; gap: 8px; }
.regie-console .choix > span { font: 700 .6rem system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #c2b4a6; }
.regie-console .puces { display: flex; flex-wrap: wrap; gap: 4px; }
.regie-console .puces button { border: 1px solid #4a3d45; border-radius: 99px; padding: 3px 9px; background: transparent; color: var(--cream); font: 600 .7rem system-ui, sans-serif; cursor: pointer; }
.regie-console .puces button:hover { border-color: #7a6670; }
.regie-console .puces button[aria-pressed="true"] { background: var(--cream); color: var(--ink); border-color: var(--cream); }
.regie-console .puces button[aria-disabled="true"] { opacity: .38; cursor: not-allowed; }
.regie-console .puces button[aria-disabled="true"]:hover { border-color: #4a3d45; }
.regie-console .puces button[aria-pressed="true"][aria-disabled="true"] { opacity: 1; cursor: default; }
.regie-console .regie-note.limite { color: var(--bulb); }
.regie-console .curseur { display: flex; align-items: center; gap: 8px; }
.regie-console .curseur output { font: 700 .74rem system-ui, sans-serif; width: 5ch; text-align: right; color: var(--cream); font-variant-numeric: tabular-nums; }
/* Curseurs dessinés à la main : piste fine, partie remplie dorée jusqu'au bouton (--rempli), bouton rond doré. */
.regie-console .curseur input[type=range] { -webkit-appearance: none; appearance: none; flex: 1; min-width: 0; height: 18px; margin: 0; background: transparent; cursor: pointer; }
.regie-console .curseur input[type=range]::-webkit-slider-runnable-track { height: 4px; border-radius: 99px; background: linear-gradient(90deg, var(--bulb) var(--rempli, 50%), #4a3d45 var(--rempli, 50%)); }
.regie-console .curseur input[type=range]::-moz-range-track { height: 4px; border-radius: 99px; background: #4a3d45; }
.regie-console .curseur input[type=range]::-moz-range-progress { height: 4px; border-radius: 99px; background: var(--bulb); }
.regie-console .curseur input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; margin-top: -5px; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #ffe7a0, var(--bulb) 65%); box-shadow: 0 0 0 3px #1d171b, 0 0 8px rgba(255,207,107,.45); }
.regie-console .curseur input[type=range]::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #ffe7a0, var(--bulb) 65%); box-shadow: 0 0 0 3px #1d171b, 0 0 8px rgba(255,207,107,.45); }
.regie-console .curseur input[type=range]:focus-visible { outline: none; }
.regie-console .curseur input[type=range]:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px #1d171b, 0 0 0 5px var(--cream); }
.regie-console .curseur input[type=range]:focus-visible::-moz-range-thumb { box-shadow: 0 0 0 3px #1d171b, 0 0 0 5px var(--cream); }
/* Nuancier : 36 pastilles et « Par défaut » (rayée), sur deux rangs. */
.regie-console .nuancier { display: grid; grid-template-columns: repeat(19, minmax(0, 1fr)); gap: 4px; }
.regie-console .nuancier button { aspect-ratio: 1; min-width: 0; padding: 0; border-radius: 50%; border: 1px solid rgba(255,255,255,.18); cursor: pointer; }
.regie-console .nuancier button.defaut { background: linear-gradient(135deg, #2a2126 44%, #e5484d 44% 56%, #2a2126 56%); }
.regie-console .nuancier button[aria-pressed="true"] { outline: 2px solid var(--cream); outline-offset: 1px; }
.regie-console .nuancier button:focus-visible { outline: 2px solid var(--bulb); outline-offset: 1px; }
.regie-console .regie-note { margin: 0; font-size: .72rem; color: #c2b4a6; }
.regie-paysage { display: grid; gap: 10px; padding-top: 10px; }
.regie-paysage .btn { justify-self: start; }
body.regie-ouverte { overflow: hidden; }
/* Tablette : console un peu plus étroite, coulisses plus petites. */
@media (max-width: 1000px) {
  .regie-corps { grid-template-columns: minmax(0, 1fr) 340px; }
  .regie-coulisses { gap: 6px; }
  .regie-coulisses button, .regie-coulisses img { width: 50px; }
  .regie-coulisses.paysage button, .regie-coulisses.paysage img { width: 80px; }
}
/* Écran peu haut (portable en 1280×720) : console resserrée. */
@media (max-height: 760px) and (min-width: 761px) {
  .regie-console { gap: 6px; padding: 10px 12px; }
  .regie-memoires span { display: none; }
  .regie-voies { gap: 5px; }
  .regie-voies .carte { padding: 6px 9px; gap: 5px; }
  .regie-voies .carte-icone { width: 24px; height: 24px; }
  .regie-cible { padding: 2px 8px; font-size: .72rem; }
}
/* Téléphone : tout s'empile et défile (l'écran est trop petit pour tout montrer d'un coup). */
@media (max-width: 760px) {
  .regie-affiches { padding: 0; }
  .regie-boite { height: 100dvh; max-height: none; border-radius: 0; grid-template-rows: auto minmax(0, 1fr); }
  .regie-corps { display: block; overflow: auto; }
  .regie-scene { padding: 12px; }
  .regie-rideau { display: none; }
  .regie-plateau { container-type: normal; }
  .regie-plateau img { width: min(240px, 62vw); }
  .regie-plateau.paysage img { width: 100%; }
  .regie-coulisses { justify-content: flex-start; overflow-x: auto; padding-bottom: 4px; }
  .regie-console { overflow: visible; border-left: 0; border-top: 3px solid #3a2f36; }
}
@media (prefers-reduced-motion: reduce) { .regie-affiches, .regie-plateau img { animation: none; transition: none; } }

.coll { border: 1px solid var(--seat); border-radius: 12px; padding: 12px 14px; display: grid; gap: 10px; background: var(--velvet); }
.coll-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.coll-head .switch b { font-weight: 800; }
.coll details summary { cursor: pointer; color: var(--bulb); font-weight: 700; font-size: .88rem; }
.coll details .chips { margin-top: 10px; }
/* Tuiles d'une collection : une ligne chacune, la pastille les montre ou les cache, les flèches les déplacent. */
.tiles { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 6px; max-width: 460px; }
.tiles li { display: flex; align-items: center; gap: 4px; }
.tiles .chip { flex: 1; min-width: 0; margin-right: 4px; }
.tiles .chip span { display: flex; }
.coll .chip span { padding: 6px 11px; font-size: .84rem; }
.coll.off { opacity: .55; }
/* Repère : sur l'accueil de Nuvio, les rangées du Catalogue FR passent entre Plateformes et les autres collections. */
.coll-rangees { margin: 0; padding: 10px 14px; border: 1.5px dashed var(--seat); border-radius: 12px; text-align: center; font: 700 .86rem/1.4 var(--body); color: var(--dim); }
.coll-rangees b { color: var(--bulb); }

@media (max-width: 520px) { .two { grid-template-columns: 1fr; } }

/* ================= Grand jeu : la salle ================= */
:root { --serif: "Instrument Serif", "Iowan Old Style", Georgia, serif; }
/* Lambrequin de velours en haut de la page */
.valance { position: absolute; inset: 0 0 auto; height: 74px; pointer-events: none; z-index: 1;
  background:
    radial-gradient(ellipse 34px 22px at 34px 0, transparent 0 20px, rgba(0,0,0,.35) 21px, transparent 26px) 0 52px / 68px 30px repeat-x,
    radial-gradient(ellipse 34px 30px at 34px 0, #6d1420 0 28px, transparent 29px) 0 46px / 68px 32px repeat-x,
    repeating-linear-gradient(90deg, rgba(0,0,0,.28) 0 3px, transparent 3px 22px, rgba(255,255,255,.04) 22px 24px, transparent 24px 34px),
    linear-gradient(#4a0c15, #7a1824 70%, #5a0f1a);
  -webkit-mask: linear-gradient(#000 60%, #000) top / 100% 48px no-repeat, radial-gradient(ellipse 34px 30px at 34px 0, #000 28px, transparent 29px) 0 46px / 68px 32px repeat-x;
          mask: linear-gradient(#000 60%, #000) top / 100% 48px no-repeat, radial-gradient(ellipse 34px 30px at 34px 0, #000 28px, transparent 29px) 0 46px / 68px 32px repeat-x;
  filter: drop-shadow(0 8px 10px rgba(0,0,0,.5)); }
.valance::after { content: ""; position: absolute; left: 0; right: 0; top: 40px; height: 6px; background: repeating-linear-gradient(90deg, #d9a441 0 6px, #8a5f1a 6px 9px); opacity: .9; }
body { position: relative; padding-top: max(104px, calc(env(safe-area-inset-top) + 92px)); }
/* Grain de pellicule */
body::after { content: ""; position: fixed; inset: -50%; pointer-events: none; z-index: 50; opacity: .07; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  animation: grain 1.2s steps(6) infinite; }
@keyframes grain { 0%{transform:translate(0,0)} 20%{transform:translate(-3%,2%)} 40%{transform:translate(2%,-3%)} 60%{transform:translate(-2%,-1%)} 80%{transform:translate(3%,3%)} 100%{transform:translate(0,0)} }
.marquee-wrap p { font-size: 1.04rem; }
.guide-link { display: inline-block; font: 800 .92rem var(--body); text-decoration: none; color: var(--ink); background: var(--bulb); padding: 9px 16px; border-radius: 99px; box-shadow: 0 0 22px rgba(255,207,107,.35); }
.guide-link:hover { background: #fff1c9; }
.marquee-wrap .tagline { font: italic 400 1.5rem/1.2 var(--serif); color: var(--bulb); margin: 0; }

/* Titres de section : lettrage d'enseigne + numéro de séance */
.act { position: relative; overflow: hidden; }
.act::before { content: ""; position: absolute; inset: 0 0 auto; height: 2px; background: linear-gradient(90deg, transparent, rgba(255,207,107,.5), transparent); }
.act .sub { font-family: var(--serif); font-size: 1.12rem; line-height: 1.4; color: #cdb8ad; }
/* Le serif (une seule graisse) ne sert qu'au chapeau sous le titre : les notes qui suivent et les consignes en gras
   restent dans la police du texte, plus lisible sur plusieurs lignes et sans faux gras. */
.act .sub:not(header + .sub), .act .sub:has(b) { font-family: var(--body); font-size: .94rem; line-height: 1.55; text-wrap: pretty; }
.act .sub:not(header + .sub) { margin-top: 0; }
/* Le bouton d'une section ouvre une fenêtre : lisible sur le velours (l'encre du billet y disparaissait). */
.act > .btn.solid { justify-self: start; padding: 10px 20px; border-radius: 99px; border: 1.5px solid rgba(255,207,107,.6); background: transparent; color: var(--bulb); }
.act > .btn.solid:hover { background: rgba(255,207,107,.12); border-color: var(--bulb); }
.act header span { font-family: var(--type); font-weight: 700; letter-spacing: .14em; background: var(--red); color: #fff; padding: 3px 8px 2px; border-radius: 3px; transform: rotate(-2deg); display: inline-block; }
.act h2 { font-size: 2.2rem; }

/* L'écran : vrais visuels */
.stage { position: relative; }
.stage .glow { position: absolute; inset: 6% 4% 10%; z-index: -1; filter: blur(42px) saturate(1.4); opacity: .55; background-size: cover; background-position: center; transition: background-image .6s ease; border-radius: 30px; }
/* ---------- L'écran : un vrai petit Nuvio, qu'on parcourt à la souris ou aux flèches ---------- */
.tv { overflow: hidden; background: #050304; border-radius: 16px; padding: 10px; box-shadow: 0 0 0 2px #2b1820, 0 30px 80px rgba(0,0,0,.6), 0 0 90px rgba(120,160,255,.06); }
.screen { position: relative; aspect-ratio: 16 / 9; border-radius: 8px; overflow: hidden; background: linear-gradient(180deg, #13101a, #0b0910); container-type: inline-size; }
.tv-foot { height: 10px; width: 34%; margin: 8px auto 0; border-radius: 0 0 10px 10px; background: #1c1116; }
@keyframes fade-in { from { opacity: 0; } }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } }
/* Sous l'écran : format des affiches, agrandir */
.screen-tools { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: -8px; }
.screen-tools .seg button { padding: 7px 12px; font-size: .82rem; }
.caption { margin: -12px 0 0; text-align: center; color: var(--dim); font-size: .82rem; }
.big-close { display: none; }
.screen-fun { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.stage .screen-tools { justify-content: center; }
#pp-btn[aria-pressed="true"] { background: var(--cream); border-color: var(--cream); color: var(--ink); }
/* Les affiches maison se règlent plus haut (« Tes affiches ») ; le lien va dans Nuvio (étape 8 du guide). */
.pp-note { margin: 10px auto 0; max-width: 46ch; text-align: center; color: var(--dim); font-size: .82rem; }
.pp-ouvrir { padding: 0; border: 0; background: none; font: inherit; color: var(--bulb); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
/* L'étape 8 du guide en fenêtre : clé TMDB, lien à copier, où le coller dans Nuvio. */
.pp-modal { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; padding: 16px; background: rgba(5,3,4,.84); animation: fade-in .2s ease both; }
.pp-modal .boite { position: relative; display: grid; gap: 12px; width: min(480px, 100%); max-height: calc(100dvh - 32px); overflow-y: auto; padding: 24px; border-radius: 18px; background: var(--velvet-2); border: 1px solid rgba(255,207,107,.35); box-shadow: 0 30px 80px rgba(0,0,0,.7); animation: rise .25s ease both; }
.pp-modal h2 { margin: 0; padding-right: 36px; font: 400 1.8rem/1 var(--display); letter-spacing: .03em; color: var(--bulb); }
.pp-modal p, .pp-modal ol { margin: 0; color: #e6d6c8; font-size: .92rem; line-height: 1.45; }
.pp-modal ol { display: grid; gap: 6px; padding-left: 1.3em; }
.pp-modal .pp-mini { color: var(--dim); font-size: .82rem; }
.pp-modal a { color: var(--bulb); }
.pp-modal label { display: grid; gap: 6px; font-size: .82rem; color: var(--dim); }
.pp-modal input[type=text] { font: 400 .95rem var(--type); letter-spacing: 0; padding: 10px 12px; }
.pp-lien { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: start; }
.pp-lien code { min-width: 0; max-height: 5.6em; overflow: auto; padding: 8px 10px; border-radius: 8px; background: var(--velvet); border: 1px solid var(--seat); font: 400 .74rem/1.45 var(--type); word-break: break-all; color: var(--cream); }
.pp-lien button { padding: 9px 14px; border-radius: 8px; border: 0; background: var(--bulb); color: var(--ink); font: 800 .85rem var(--body); cursor: pointer; }
.pp-modal .fermer { position: absolute; top: 10px; right: 10px; width: 32px; height: 32px; border-radius: 50%; border: 0; background: rgba(255,255,255,.08); color: var(--cream); font: 800 1.1rem/1 var(--body); cursor: pointer; }
.screen-fun .mini { padding: 8px 14px; font-size: .84rem; border-color: rgba(255,207,107,.4); color: var(--bulb); }
.screen-fun .mini:hover { background: rgba(255,207,107,.1); }
.stage .screen-tools { margin-top: 14px; }
/* La colonne collante crée sa propre pile d'affichage : on la passe devant tout quand l'écran est en grand. */
.ecran-grand aside { z-index: 66; }
/* Le billet du jour (z-index 84) ne passe pas devant l'écran agrandi. */
.ecran-grand .billet-jour { display: none; }
/* L'écran en grand, par-dessus la page */
.stage.big { position: fixed; inset: 0; z-index: 65; display: grid; place-content: center; justify-items: center; padding: 24px; background: rgba(5,3,4,.92); }
.stage.big .tv { width: min(1180px, calc(100vw - 48px), calc((100vh - 230px) * 16 / 9)); max-width: none; }
.stage.big .screen-tools, .stage.big .screen-fun { width: min(1100px, calc(100vw - 48px)); }
.stage.big .caption, .stage.big .pp-note { display: none; }
.stage.big .glow { inset: 15%; }
.stage.big .big-close { display: inline-flex; margin-top: 16px; border-color: var(--cream); background: var(--cream); color: var(--ink); }

/* Le billet qui se déchire quand on copie */
.ticket .stub { transition: transform .5s cubic-bezier(.16,1,.3,1); transform-origin: 0 100%; }
.ticket.torn .stub { transform: translate(10px, 16px) rotate(9deg); }
.ticket.torn .main { animation: thump .4s ease; }
@keyframes thump { 30% { transform: translateY(2px); } }
.stamp { position: absolute; right: 90px; top: 40%; transform: rotate(-12deg) scale(.6); opacity: 0; font: 400 1.6rem/1 var(--display); letter-spacing: .1em; color: var(--red); border: 3px solid var(--red); border-radius: 6px; padding: 4px 10px; pointer-events: none; transition: all .35s cubic-bezier(.16,1,.3,1); mix-blend-mode: multiply; }
.ticket.torn .stamp { opacity: .85; transform: rotate(-12deg) scale(1); }

/* Le billet holographique : il s'incline sous la souris, un reflet irisé le traverse. */
.ticket { transform: perspective(900px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)); transition: transform .35s ease; }
.ticket.tilting { transition: transform .08s linear; }
.ticket .main { position: relative; }
.ticket .main::after { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .3s ease; mix-blend-mode: soft-light;
  background: linear-gradient(115deg, transparent 25%, rgba(255,240,200,.9) 42%, rgba(255,170,220,.75) 48%, rgba(150,220,255,.75) 54%, transparent 70%) var(--mx, 50%) 0 / 260% 100% no-repeat; }
.ticket.tilting .main::after { opacity: 1; }
.t-seance { margin-top: -4px; font: 700 .74rem var(--type); color: #7a5a4c; }
.qr { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 12px; align-items: center; padding: 10px; border-radius: 8px; background: rgba(42,26,20,.07); }
.qr svg { width: 112px; height: 112px; display: block; border-radius: 6px; }
.qr p { margin: 0; font-size: .85rem; line-height: 1.4; }
.qr-wait { font: 400 .78rem var(--type); }

/* L'écran grésille comme quand on change de chaîne. */
.screen::before { content: ""; position: absolute; inset: 0; z-index: 3; pointer-events: none; opacity: 0; mix-blend-mode: screen;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E") 0 0 / 140px 140px, repeating-linear-gradient(0deg, rgba(255,255,255,.09) 0 1px, transparent 1px 3px); }
.screen.zap::before { animation: zap .4s steps(5); }
@keyframes zap { 0% { opacity: .85; background-position: 0 0, 0 0; } 25% { background-position: 50px 30px, 0 6px; } 50% { opacity: .55; background-position: -40px 70px, 0 2px; } 75% { background-position: 20px -40px, 0 9px; } 100% { opacity: 0; } }

/* Une rangée mise à l'affiche : le projecteur la balaie, son numéro s'allume. */
.frame.lit::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  background: linear-gradient(100deg, transparent 38%, rgba(255,226,165,.3) 50%, transparent 62%) no-repeat; background-size: 240% 100%;
  animation: sweep-row .75s ease-out both; }
@keyframes sweep-row { from { background-position: 100% 0; } to { background-position: 0 0; } }
.frame.lit .pos { animation: tick .45s cubic-bezier(.16,1,.3,1); }
@keyframes tick { from { transform: scale(.3); opacity: 0; } }
`;

// Après scene.css et nuvio.css, pour passer devant.
export const SALLE2_FIN_CSS = `/* ---------- Téléphone (après tout le reste, pour passer devant) ---------- */
@media (max-width: 960px) {
  /* L'aperçu en haut, les réglages, puis le billet tout à la fin (là où on en a besoin). */
  aside, .rail { display: contents; }
  .stage { order: -2; }
  .caption { order: -1; margin-top: -26px; }
  .ticket { order: 1; scroll-margin: 24px; }
}
/* Doigt plutôt que souris : des cibles d'au moins 44 px, et des champs en 16 px (sinon iOS zoome dans la page). */
.caption .doigt { display: none; }
@media (hover: none), (pointer: coarse) {
  .caption .souris { display: none; }
  .caption .doigt { display: inline; }
  .arrow, .icon { width: 44px; height: 44px; font-size: 1.05rem; }
  .toggle { min-height: 44px; padding: 8px 12px; }
  .tools { gap: 6px; }
  .mini, .seg button, .screen-tools .seg button { min-height: 44px; }
  .chip span { min-height: 44px; }
  .nav a { padding: 11px 12px; }
  .reset { padding: 12px 0; }
  .add-row { min-height: 48px; }
  .coll details summary { padding-block: 11px; }
  .nvo-rech input, .rename input, .field input:is([type=text], [type=password]).plain, select, input[type=number] { font-size: 16px; }
  .act { scroll-margin-top: 76px; }
  /* La régie au doigt : puces et boutons de 40 px de haut, interrupteurs plus grands (zone de 44 px), nuancier
     sur 10 colonnes (19 pastilles de 14 px sur un téléphone, c'était trop petit), textes d'au moins 0,75rem. */
  .regie-console .puces { gap: 6px; }
  .regie-console .puces button { min-height: 40px; padding: 8px 13px; font-size: .8rem; }
  .regie-console .choix { grid-template-columns: 84px 1fr; }
  .regie-console .choix > span { font-size: .75rem; letter-spacing: .04em; }
  .regie-console .regie-note { font-size: .8rem; }
  .regie-console .interrupteur { width: 52px; height: 30px; }
  .regie-console .interrupteur::before { content: ""; position: absolute; inset: -7px -4px; }
  .regie-console .interrupteur::after { top: 4px; left: 4px; width: 22px; height: 22px; }
  .regie-console .interrupteur[aria-checked="true"]::after { transform: translateX(22px); }
  .regie-voies .carte-plus { min-height: 40px; padding: 8px 13px; font-size: .78rem; }
  .regie-plus .plus-fermer { width: 44px; height: 44px; }
  .regie-onglets button { min-height: 44px; font-size: .8rem; }
  .regie-memoires button { font-size: .75rem; }
  .regie-console .curseur input[type=range] { height: 40px; }
  .regie-console .curseur output { font-size: .8rem; }
  .regie-console .nuancier { grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 7px; }
}
/* Ouverte par-dessus le guide (dans un cadre) : seulement les réglages et le billet. La barre du guide
   porte le titre et « Terminé » ; rien ne mène ailleurs (salles, guide, mode d'emploi déjà dans le guide). */
.dans-guide .valance, .dans-guide .foyer, .dans-guide .marquee-wrap, .dans-guide .draperie, .dans-guide #s-mode, .dans-guide .nav a[href="#s-mode"] { display: none !important; }
.dans-guide body { padding-top: 16px; }
@media (prefers-reduced-motion: reduce) { body::after, .frame::after, .frame .pos, .screen::before, .nv *, .fiche, .fiche * { animation: none !important; } .ticket { transform: none; } .nv, .nv-track { scroll-behavior: auto; } }`;

/** Le script de la salle 2 : après nuvio.js et les données de la page (const D). */
export const SALLE2_JS = `const hashDepart = location.hash; // l'adresse est réécrite ensuite (réglages), on garde l'ancre demandée
window.hashDepart = hashDepart;
const clone = (o) => JSON.parse(JSON.stringify(o));
const state = clone(D.cfg);
const $ = (id) => document.getElementById(id);
// Les effets de la salle (scene.js : pop-corn, sons, messages) sont un plus : s'ils manquent (script pas
// chargé, bloqué), l'action qui vient de réussir ne doit pas passer pour un échec.
const effet = (nom, ...args) => { try { if (typeof window[nom] === "function") window[nom](...args); } catch (e) {} };
const bruit = (nom) => { try { if (window.sfx && typeof window.sfx[nom] === "function") window.sfx[nom](); } catch (e) {} };
// Écran tactile : on n'y donne jamais le focus à un champ de nous-mêmes (ça ouvrirait le clavier).
const tactile = matchMedia("(hover: none), (pointer: coarse)").matches;
// « Moins d'animations » demandé par l'appareil : les défilements sautent directement au bon endroit.
const glisse = () => matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
const same =(a, b) => JSON.stringify(a) === JSON.stringify(b);
const baseIds = D.rows.map(r => r.id);
let order = [];
function resetOrder() { order = [...state.r, ...allRowIds().filter(id => !state.r.includes(id))]; }
function allRowIds() { return [...baseIds, ...state.x.map((_, i) => "perso-" + i)]; }

// ---------- adresse courte (voir config.js : positions, masques, seulement les différences) ----------
function rowRef(id) { return id.startsWith("perso-") ? "p" + id.slice(6) : baseIds.indexOf(id); }
function compact(st) {
  const o = {}, df = D.defaults;
  const idx = (ids, ref) => ids.map(id => ref.indexOf(id));
  const mask = (ids, ref) => ref.reduce((m, id, i) => ids.includes(id) ? m | (1 << i) : m, 0);
  if (st.n !== df.n) o.n = st.n;
  if (!same(st.r, df.r)) o.r = st.r.map(rowRef);
  if (!same(st.p, df.p)) o.p = idx(st.p, D.providers.map(p => p.id));
  if (!same(st.d, df.d)) o.d = mask(st.d, D.discover.map(d => d.id));
  if (!same(st.c, df.c)) o.c = mask(st.c, D.collections.map(c => c.id));
  if (Object.keys(st.o).length) { o.o = {}; for (const [k, v] of Object.entries(st.o)) o.o[rowRef(k)] = v; }
  if (st.x.length) o.x = st.x.map(x => {
    const r = {};
    if (x.n) r.n = x.n; if (x.t) r.t = x.t; if (x.g.length) r.g = x.g; if (x.w.length) r.w = x.w;
    if (x.l) r.l = x.l; if (x.y[0] || x.y[1]) r.y = x.y; if (x.v) r.v = x.v; if (x.s) r.s = x.s;
    return r;
  });
  if (st.g !== df.g) o.g = st.g;
  if (st.e.length) o.e = idx(st.e, D.genres.map(g => g[0]));
  if (st.m) o.m = st.m;
  if (st.a) o.a = st.a;
  if (st.f) o.f = 1;
  if (st.u) o.u = 1;
  if (st.ca) o.ca = 1;
  if (st.k) o.k = st.k;
  if (st.al) o.al = st.al;
  if (!same(st.h, df.h)) o.h = mask(st.h, D.seasons.map(s => s[0]));
  const t = {};
  const to = {};
  D.collections.forEach((c, i) => {
    if (st.t[c.id] && st.t[c.id].length) t[i] = st.t[c.id];
    if (st.to[c.id] && st.to[c.id].length) to[i] = st.to[c.id];
  });
  if (Object.keys(t).length) o.t = t;
  if (Object.keys(to).length) o.to = to;
  if (o.t || o.to) o.tv = 2; // positions d'après les Studios (Marvel, Warner, DC) et les Sagas en thèmes (config.js)
  // Place des collections sur l'accueil : [position de la collection, rangées avant elle], dans l'ordre voulu.
  const ac = (st.ac || []).map(p => [D.collections.findIndex(c => c.id === p.id), p.n]).filter(v => v[0] >= 0);
  if (ac.length) o.ac = ac;
  return o;
}
function enc(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = ""; bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
}

// ---------- petits composants ----------
function el(tag, props, ...kids) {
  const n = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v; else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else if (v !== undefined && v !== null) n.setAttribute(k, v);
  }
  kids.flat().forEach(k => k && n.append(k));
  return n;
}
function chip(container, id, label, checked, onChange, color) {
  const i = el("input", { type: "checkbox", id });
  i.checked = checked; i.addEventListener("change", () => onChange(i.checked));
  const s = el("span");
  if (color) { const dot = el("i"); dot.style.setProperty("--c", color); s.append(dot); }
  s.append(document.createTextNode(label));
  container.append(el("label", { class: "chip" }, i, s));
}
function seg(container, labels, current, onPick) {
  container.textContent = "";
  labels.forEach((lab, i) => container.append(el("button", { type: "button", "aria-pressed": String(i === current), text: lab, onclick: () => onPick(i) })));
}
// Curseur de note : part dorée, graduations, ampoule éteinte à « Toutes ».
function paintRange(r) {
  const min = Number(r.min), max = Number(r.max), v = Number(r.value);
  r.style.setProperty("--p", ((v - min) / (max - min) * 100) + "%");
  r.style.setProperty("--steps", String(max - min));
  r.classList.toggle("zero", v <= min);
}
document.querySelectorAll(".range input[type=range]").forEach((r) => r.addEventListener("input", () => paintRange(r)));
const fmtVote = (v) => v ? v.toLocaleString("fr-FR") + "+" : "Toutes";

// ---------- rangées ----------
function rowInfo(id) {
  if (id.startsWith("perso-")) {
    const i = Number(id.slice(6)), x = state.x[i]; if (!x) return null;
    return { id, custom: i, name: x.n || "Ma rangée " + (i + 1), kind: ["Films", "Séries", "Films + séries"][x.t], hint: describe(x) };
  }
  return D.rows.find(r => r.id === id);
}
// Une liste reconstruite (rangées, collections) : le focus revient sur le même élément, retrouvé par son id
// ou son data-cle (sinon il tomberait en haut de la page, au clavier comme au lecteur d'écran).
function repereFocus(boite) {
  const a = document.activeElement;
  if (!a || a === document.body || !boite.contains(a)) return null;
  return a.id ? { id: a.id } : a.dataset && a.dataset.cle ? { cle: a.dataset.cle } : null;
}
function rendFocus(boite, rep, repli) {
  if (!rep || boite.contains(document.activeElement)) return;
  const trouve = (r) => r.id ? document.getElementById(r.id) : boite.querySelector('[data-cle="' + CSS.escape(r.cle) + '"]');
  const n = trouve(rep);
  if (n) n.focus({ preventScroll: true });
  if (document.activeElement === n || !repli) return;
  const m = trouve(repli); if (m) m.focus({ preventScroll: true });
}
function renderRows(flashId) {
  const ol = $("rows"), rep = repereFocus(ol); ol.textContent = "";
  let n = 0;
  order.forEach((id, idx) => {
    const r = rowInfo(id); if (!r) return;
    const on = state.r.includes(id);
    const shown = state.o[id] || r.name;
    const li = el("li", { class: "frame" + (on ? " on" : "") + (id === flashId ? " flash" : "") + (id === justOn ? " lit" : "") });
    const cb = el("input", { type: "checkbox", id: "row-" + id }); cb.checked = on;
    cb.addEventListener("change", () => { setRow(id, cb.checked); renderRows(id); update(); });
    const lab = el("label", { for: cb.id },
      el("b", { text: shown }),
      r.custom !== undefined ? el("span", { class: "badge", text: "Sur mesure" }) : null,
      el("span", { class: "kind", text: r.kind }),
      state.o[id] ? el("em", { class: "orig", text: "(" + r.name + ")" }) : null,
      el("small", { text: r.hint + (r.now ? " · en ce moment : " + r.now : "") }));
    const inp = el("input", { type: "text", value: state.o[id] || "", placeholder: r.name, maxlength: "40", enterkeyhint: "done", "aria-label": "Nouveau nom pour " + r.name, "data-cle": "nom:" + id });
    const saveName = () => { const v = inp.value.trim(); if (v && v !== r.name) state.o[id] = v; else delete state.o[id]; renderRows(id); update(); };
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") renderRows(); });
    const box = el("div", { class: "body" }, lab, el("div", { class: "rename" }, inp, el("button", { type: "button", class: "mini ok", text: "OK", "data-cle": "ok:" + id, onclick: saveName })));
    const tools = el("div", { class: "tools" });
    tools.append(el("button", { type: "button", class: "toggle", "aria-pressed": String(on), "data-cle": "affiche:" + id, text: on ? "À l'affiche" : "Ajouter", onclick: () => { setRow(id, !on); renderRows(id); update(); } }));
    if (r.custom !== undefined) tools.append(el("button", { type: "button", class: "icon", title: "Modifier", "aria-label": "Modifier " + shown, "data-cle": "outil:" + id, text: "⚙", onclick: () => openBuilder(r.custom) }));
    else tools.append(el("button", { type: "button", class: "icon", title: "Renommer", "aria-label": "Renommer " + shown, "data-cle": "outil:" + id, text: "✎", onclick: () => { li.classList.add("editing"); inp.focus(); inp.select(); } }));
    [["↑", -1, "Monter"], ["↓", 1, "Descendre"]].forEach(([t, d, a]) => {
      const j = idx + d;
      const bt = el("button", { type: "button", class: "arrow", text: t, "aria-label": a + " " + shown, "data-cle": a.toLowerCase() + ":" + id });
      bt.disabled = j < 0 || j >= order.length;
      bt.addEventListener("click", () => {
        [order[idx], order[j]] = [order[j], order[idx]];
        state.r = order.filter(x => state.r.includes(x));
        renderRows(id); update();
        const again = document.querySelector('#rows .frame.flash .arrow[aria-label^="' + a + '"]'); if (again && !again.disabled) again.focus();
      });
      tools.append(bt);
    });
    li.append(el("span", { class: "pos", text: on ? String(++n) : "·" }), cb, box, tools);
    ol.append(li);
  });
  justOn = null;
  // Le nom renommé (champ refermé) rend le focus au bouton ✎ ; une flèche arrivée au bout, à l'autre flèche.
  if (rep && rep.cle) {
    const [type, ...reste] = rep.cle.split(":"), rid = reste.join(":");
    rendFocus(ol, rep, { cle: (type === "monter" ? "descendre" : type === "descendre" ? "monter" : "outil") + ":" + rid });
  } else rendFocus(ol, rep);
  $("add-row").disabled = state.x.length >= D.maxCustom;
  if (flashId) setTimeout(() => document.querySelectorAll(".frame.flash").forEach(f => f.classList.remove("flash")), 180);
}
let justOn = null; // rangée qu'on vient de mettre à l'affiche (balayée par le projecteur)
function setRow(id, on) {
  if (on && !state.r.includes(id)) justOn = id;
  const set = new Set(state.r); on ? set.add(id) : set.delete(id);
  state.r = order.filter(x => set.has(x));
}

// ---------- rangée sur mesure ----------
let draft = null, editing = -1;
const blank = () => ({ n: "", t: 0, g: [], w: [], l: "", y: [0, 0], v: 0, s: 0 });
function describe(x) {
  const kind = ["Films", "Séries", "Films et séries"][x.t];
  const lang = x.l ? " · " + (D.languages.find(l => l[0] === x.l) || ["", ""])[1].toLowerCase() : "";
  const g = x.g.length ? " · " + x.g.map(i => D.genres[i][0]).join(" ou ") : "";
  const w = x.w.length ? " · sur " + x.w.map(i => D.providers[i].name).join(", ") : "";
  const y = x.y[0] && x.y[1] ? " · de " + x.y[0] + " à " + x.y[1] : x.y[0] ? " · depuis " + x.y[0] : x.y[1] ? " · jusqu'à " + x.y[1] : "";
  const v = x.v ? " · notés " + x.v.toLocaleString("fr-FR") + "+" : "";
  return kind + lang + g + w + y + v + " · " + D.sorts[x.s].toLowerCase();
}
function openBuilder(i) {
  editing = i; draft = i >= 0 ? clone(state.x[i]) : blank();
  $("b-title").textContent = i >= 0 ? "Modifier la rangée" : "Nouvelle rangée";
  $("b-save").textContent = i >= 0 ? "Enregistrer" : "Ajouter à l'affiche";
  $("b-name").value = draft.n;
  $("b-genres").textContent = ""; $("b-prov").textContent = "";
  D.genres.forEach((g, gi) => chip($("b-genres"), "bg-" + gi, g[0], draft.g.includes(gi), on => { toggleIdx(draft.g, gi, on); drawBuilder(); }));
  D.providers.forEach((p, pi) => chip($("b-prov"), "bp-" + pi, p.name, draft.w.includes(pi), on => { toggleIdx(draft.w, pi, on); drawBuilder(); }, p.color));
  $("b-lang").value = draft.l; $("b-from").value = draft.y[0] || ""; $("b-to").value = draft.y[1] || ""; $("b-vote").value = draft.v; paintRange($("b-vote"));
  delBtn.hidden = i < 0;
  $("builder").hidden = false; drawBuilder();
  $("builder").scrollIntoView({ behavior: glisse(), block: tactile ? "start" : "center" }); if (!tactile) $("b-name").focus({ preventScroll: true });
}
function toggleIdx(list, i, on) { const k = list.indexOf(i); if (on && k < 0) list.push(i); if (!on && k >= 0) list.splice(k, 1); list.sort((a, b) => a - b); }
function drawBuilder() {
  seg($("b-type"), ["Films", "Séries", "Les deux"], draft.t, (i) => { draft.t = i; drawBuilder(); });
  seg($("b-sort"), D.sorts, draft.s, (i) => { draft.s = i; drawBuilder(); });
  $("b-vote-out").textContent = fmtVote(draft.v);
  // Genres qui n'existent pas pour les séries (ex. Horreur) : grisés quand on choisit « Séries ».
  D.genres.forEach((g, gi) => { const box = $("bg-" + gi).parentElement; box.style.opacity = (draft.t === 1 && !g[2]) || (draft.t === 0 && !g[1]) ? ".35" : ""; });
  $("b-summary").textContent = (draft.n || "Ta rangée") + " → " + describe(draft);
}
$("b-name").addEventListener("input", () => { draft.n = $("b-name").value.trim(); drawBuilder(); });
$("b-lang").addEventListener("change", () => { draft.l = $("b-lang").value; drawBuilder(); });
$("b-from").addEventListener("input", () => { draft.y[0] = Number($("b-from").value) || 0; drawBuilder(); });
$("b-to").addEventListener("input", () => { draft.y[1] = Number($("b-to").value) || 0; drawBuilder(); });
$("b-vote").addEventListener("input", () => { draft.v = Number($("b-vote").value); drawBuilder(); });
$("add-row").addEventListener("click", () => openBuilder(-1));
$("b-cancel").addEventListener("click", () => { $("builder").hidden = true; });
$("b-save").addEventListener("click", () => {
  if (editing >= 0) state.x[editing] = draft;
  else { state.x.push(draft); const id = "perso-" + (state.x.length - 1); order.push(id); setRow(id, true); }
  // une seule rangée : bouton Supprimer dans le formulaire de modification
  $("builder").hidden = true; renderRows(editing >= 0 ? "perso-" + editing : "perso-" + (state.x.length - 1)); update();
});
function deleteCustom(i) {
  const shift = (id) => { if (!id.startsWith("perso-")) return id; const k = Number(id.slice(6)); return k === i ? null : k > i ? "perso-" + (k - 1) : id; };
  state.x.splice(i, 1);
  state.r = state.r.map(shift).filter(Boolean);
  order = order.map(shift).filter(Boolean);
  const o = {}; for (const [k, v] of Object.entries(state.o)) { const nk = shift(k); if (nk) o[nk] = v; } state.o = o;
}
const delBtn = el("button", { type: "button", class: "mini del", text: "Supprimer cette rangée", onclick: () => { if (editing >= 0) { deleteCustom(editing); $("builder").hidden = true; renderRows(); update(); } } });
$("b-cancel").after(delBtn);

// ---------- aperçu : l'écran Nuvio commun (nuvio.js), nourri par le lien en cours ----------
// Il lit exactement ce que Nuvio recevra : le manifest.json et le collections.json de ce lien, dans leur ordre
// (« Suivre l'ordre des addons »), avec Plateformes épinglée tout en haut.
const byPos = (list) => [...list].sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));
// Réponses gardées le temps de la visite : 50 au plus (les plus anciennes partent), et un échec (réseau,
// erreur du serveur) n'est pas gardé, pour que l'écran réessaie au changement suivant.
const jsonCache = new Map();
function fetchJSON(url) {
  let p = jsonCache.get(url);
  if (p) { jsonCache.delete(url); jsonCache.set(url, p); return p; }
  p = fetch(url).then(r => r.ok ? r.json() : null).catch(() => null)
    .then((d) => { if (d === null && jsonCache.get(url) === p) jsonCache.delete(url); return d; });
  jsonCache.set(url, p);
  while (jsonCache.size > 50) jsonCache.delete(jsonCache.keys().next().value);
  return p;
}
let currentBase = D.origin, screenBase = null, screenTimer = 0, screenToken = 0, lastZap = 0;
let configureUrl = D.origin + "/configure"; // adresse de cette page avec les réglages en cours, clé Gemini comprise :
                                              // pour ses propres appareils seulement (QR « Continuer sur le téléphone »)
let pageUrl = configureUrl;                   // la même sans la clé : celle qu'on voit dans la barre d'adresse
let shareUrl = configureUrl;                  // sans la clé ni le jeton d'alerte : pour le billet partagé
// L'écran grésille à chaque changement (pas plus de deux fois par seconde).
function zap(sc) {
  const now = Date.now(); if (now - lastZap < 450) return; lastZap = now;
  sc.classList.remove("zap"); void sc.offsetWidth; sc.classList.add("zap");
}
const E = NV.ecran($("screen"), { base: () => currentBase });
E.paysage(NV.reglages.format === "l"); E.pp();
// La lueur derrière la TV prend les couleurs du haut de l'écran.
new MutationObserver(() => { const i = E.hero.el.querySelector(".nvo-bd > i.on:last-of-type") || E.hero.el.querySelector(".nvo-bd > i:last-of-type"); if (i && i.style.backgroundImage) $("glow").style.backgroundImage = i.style.backgroundImage; })
  .observe(E.hero.el, { subtree: true, attributes: true, attributeFilter: ["class", "style"] });
function renderScreen() {
  zap($("screen"));
  const token = ++screenToken, base = currentBase;
  clearTimeout(screenTimer);
  screenTimer = setTimeout(async () => {
    const [man, colls, acc] = await Promise.all([fetchJSON(base + "/manifest.json"), fetchJSON(base + "/collections.json"), fetchJSON(base + "/accueil.json")]);
    if (token !== screenToken) return;
    const keep = E.rangees.scrollTop;
    E.vider();
    const collections = Array.isArray(colls) ? colls : ((colls && colls.collections) || []);
    const accueil = ((man && man.catalogs) || []).filter((c) => c.showInHome !== false && !(c.extra || []).some((x) => x.isRequired));
    const rangeeTuiles = (c) => { const { piste } = E.rangee(c.title); (c.folders || []).forEach((f) => piste.append(NV.tuile(f, c.title, c.id))); };
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); e.target._charge(); } }), { root: E.rangees, rootMargin: "300px 0px" });
    const rangeeCatalogue = (c) => {
      const { section, piste } = E.rangee(c.name);
      for (let k = 0; k < 8; k++) piste.append(NV.carte(null));
      section._charge = () => fetchJSON(base + "/catalog/" + c.type + "/" + encodeURIComponent(c.id) + ".json").then((d) => {
        if (token !== screenToken) return;
        const metas = ((d && d.metas) || []).filter((m) => m.poster);
        piste.textContent = "";
        if (!metas.length) { section.remove(); return; }
        metas.slice(0, 20).forEach((m) => piste.append(NV.carte(m)));
        E.pret();
      });
      io.observe(section);
    };
    // Dans l'ordre de l'accueil choisi (/accueil.json) ; sans lui, Plateformes, les rangées, puis les autres collections.
    const ordre = acc && Array.isArray(acc.ordre) ? acc.ordre : null;
    if (ordre) ordre.forEach((o) => {
      const c = o.collection ? collections.find((x) => x.id === o.collection) : accueil.find((x) => x.type === o.type && x.id === o.id);
      if (c) (o.collection ? rangeeTuiles : rangeeCatalogue)(c);
    });
    else {
      collections.filter((c) => c.pinToTop).forEach(rangeeTuiles);
      accueil.forEach(rangeeCatalogue);
      collections.filter((c) => !c.pinToTop).forEach(rangeeTuiles);
    }
    if (!E.rangees.children.length) { const { piste } = E.rangee("Écran noir"); piste.append(NV.mkd("p", "vide", "Coche au moins une rangée ou une collection.")); }
    E.rangees.scrollTop = keep;
    E.pret();
  }, 300);
}

// ---------- Les salles du foyer ajoutent leur rangée sur mesure ----------
window.rangeePresente = (nom) => state.x.some((x) => x.n === nom);
// Lien fixe modifiable ici : les messages ne parlent pas de « nouveau lien » (voir stage.js).
window.lienFixe = () => !!(fixe && fixe.modif);
window.ajouterRangee = (r) => {
  if (state.x.some((x) => x.n === r.n)) return "deja";
  if (state.x.length >= D.maxCustom) return "plein";
  const x = { n: r.n, t: r.t || 0, g: (r.genres || []).map((g) => D.genres.findIndex((G) => G[0] === g)).filter((i) => i >= 0), w: [], l: "", y: r.y || [0, 0], v: r.v || 0, s: r.s || 0 };
  state.x.push(x);
  const id = "perso-" + (state.x.length - 1);
  order.push(id); setRow(id, true); renderRows(id); update();
  return "ok";
};

// ---------- outils : télécommande, format des affiches, affiches maison, grand écran ----------
$("ret-btn").addEventListener("click", () => E.retour());
function drawPP() { $("pp-btn").setAttribute("aria-pressed", String(NV.reglages.pp)); $("pp-note").hidden = !NV.reglages.pp; }
$("pp-btn").addEventListener("click", () => { NV.reglages.pp = !NV.reglages.pp; drawPP(); E.pp(); if (window.sfx) sfx.click(); });
drawPP();

// ---------- La régie : le configurateur d'affiches, en fenêtre ----------
// Les réglages (LA, worker/lien-affiches.js) sont gardés dans ce navigateur et écrits dans le lien « Affiches »
// du billet. La scène montre de vraies affiches (une grande, six en coulisses), redessinées après chaque rafale.
// La console : les styles tout prêts en vignettes, puis 6 onglets ; chaque élément est une carte (icône, nom,
// interrupteur, choix principaux visibles) avec ses réglages fins dans « Plus de réglages » (un seul ouvert).
const NOMS_MEMOIRES = { maison: "Maison", essentiel: "Essentiel", noteSeule: "Note seule", cine: "Ciné", postersPlus: "Posters+", plateforme: "Plateforme", signature: "Signature", nue: "Nue" };
const ONGLETS = {
  haut: ["statut", "tendance", "qualite", "langue", "culte", "saga", "bandeau", "badges"],
  titre: ["titre", "texte", "ligne", "ligne2"],
  infos: ["note", "genre", "annee", "duree", "age", "plateforme"],
  image: ["image", "retouche", "fondu", "ambiance", "cadre", "saison", "sortie"],
  couleurs: ["c-accent", "c-texte", "c-badges", "c-fondu", "c-cadre"],
  paysage: [],
};
// Icônes dessinées (traits de 24×24), une par élément.
const ICONES = {
  statut: "M3 7l9-4 9 4v10l-9 4-9-4z M12 3v18", tendance: "M4 17L10 11l4 4 6-8 M14 7h6v6", qualite: "M3 6h18v12H3z M7 10v4 M7 12h3 M10 10v4 M14 10l3 4 M17 10l-3 4",
  langue: "M4 5h16v10H10l-5 4v-4H4z M8 9h8 M8 12h5", saga: "M3 8h12v12H3z M6 5h12v12 M9 2h12v12",
  culte: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z", bandeau: "M14 3h7v7 M4 20L20 4", badges: "M4 6h7v5H4z M13 6h7v5h-7z M4 13h7v5H4z",
  titre: "M5 5h14 M12 5v14 M8 19h8", texte: "M4 19l5-14 5 14 M6 14h6 M15 19c0-3 5-3 5 0v-5c0-2-4-2-5 0", ligne: "M4 8h16 M4 12h16 M4 16h10", ligne2: "M4 9h16 M7 14h10 M9 18h6",
  note: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z", genre: "M4 5h16v14H4z M4 9h16 M9 9v10", annee: "M4 6h16v14H4z M4 10h16 M8 3v5 M16 3v5",
  duree: "M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16z M12 8v4l3 2", age: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M10 12h4", plateforme: "M4 5h16v12H4z M10 9l4 2-4 2z M8 21h8",
  image: "M4 5h16v14H4z M4 15l5-5 4 4 3-3 4 4 M15 9h.01", retouche: "M5 6h14 M5 12h14 M5 18h14 M9 4v4 M15 10v4 M11 16v4", fondu: "M4 4h16v16H4z M4 12h16 M4 16h16 M4 19h16",
  ambiance: "M12 4a8 8 0 1 0 0 16z M12 4a8 8 0 0 1 0 16", cadre: "M4 4h16v16H4z M8 8h8v8H8z", saison: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z M19 3v4 M17 5h4", sortie: "M4 12c3-5 13-5 16 0-3 5-13 5-16 0z M12 10a2 2 0 1 0 0 4 M4 4l16 16",
  couleur: "M12 3c4 5 7 8 7 11a7 7 0 0 1-14 0c0-3 3-6 7-11z",
};
// Les 36 couleurs du nuancier (même ordre que LA.PALETTE), pour les lecteurs d'écran.
const NOMS_COULEURS = ["blanc", "gris clair", "gris", "gris moyen", "gris foncé", "noir", "jaune pâle", "or", "ocre", "orange", "orange brûlé", "cuivre",
  "rose pâle", "rose", "rouge", "carmin", "bordeaux", "lie-de-vin", "lilas", "violet", "pourpre", "bleu", "bleu roi", "bleu nuit",
  "ciel", "turquoise", "sarcelle", "vert", "vert forêt", "vert sapin", "crème", "sable", "caramel", "brun", "chocolat", "ébène"];
const COULEURS = Object.keys(LA.PALETTE);
const PLACES = { auto: "", gauche: " · à gauche", centre: " · au centre" };
const pct = (v) => Math.round(Number(v) * 100) + " %";
const SEPS = { point: "·", barre: "|", puce: "•" };
let regieR = null, regieRP = null, regieHisto = [], regieAttente = 0, regieTitres = [], regieChoisi = 0, regieForme = "poster", regieVoie = null, regieOnglet = "haut", regieDeclencheur = null;

// Les réglages entiers de la régie, gardés aussi dans ce navigateur (JSON) : la forme courte, celle du lien
// (gardée par nuvio.js), oublie les réglages d'un élément éteint ; rallumé, il les retrouve ici. Relus seulement
// s'ils donnent encore la même forme courte (sinon une autre page l'a changée : elle passe devant).
const REGIE_COMPLET = "affiches-v2-complet";
const fusionne = (base, o) => {
  const r = JSON.parse(JSON.stringify(base));
  if (o && typeof o === "object") for (const k of Object.keys(r)) {
    if (!(k in o)) continue;
    if (r[k] && typeof r[k] === "object" && !Array.isArray(r[k])) r[k] = fusionne(r[k], o[k]);
    else if (typeof o[k] === typeof r[k]) r[k] = o[k];
  }
  return r;
};
function regieLue() {
  const r = NV.reglages.affiches, rp = NV.reglages.affichesPaysage;
  try {
    const j = JSON.parse(localStorage.getItem(REGIE_COMPLET) || "null");
    if (j && j.r) {
      const jr = fusionne(r, j.r), jrp = j.rp && rp ? fusionne(rp, j.rp) : null;
      const pareil = LA.ecrireReglages(jr) === LA.ecrireReglages(r) && (rp ? !!jrp && LA.ecrireReglages(jrp) === LA.ecrireReglages(rp) : !j.rp);
      if (pareil) return { r: jr, rp: rp ? jrp : null };
    }
  } catch (e) {}
  return { r, rp };
}
function regieGarde() {
  NV.reglages.affiches = regieR;
  NV.reglages.affichesPaysage = regieRP;
  try { localStorage.setItem(REGIE_COMPLET, JSON.stringify({ r: regieR, rp: regieRP })); } catch (e) {}
}

/** Les réglages qu'on modifie : ceux du paysage quand il est réglé à part et montré, sinon ceux du portrait. */
const cible = () => (regieRP && regieForme === "landscape" ? regieRP : regieR);

function lienAffichesMaj() {
  $("u-affiches").textContent = NV.lienPerso();
  // Les affiches sont servies en fichiers tout faits, un dossier par style tout prêt : un réglage perso n'a pas le sien.
  const m = LA.memoireDe(NV.reglages.affiches), servi = LA.dossierDe(NV.reglages.affiches, NV.reglages.affichesPaysage);
  $("aff-resume").innerHTML = "";
  if (servi) $("aff-resume").append("Style en cours : ", el("b", { text: NOMS_MEMOIRES[m] }), ".");
  else $("aff-resume").append("Style en cours : ", el("b", { text: "perso" }), NV.reglages.affichesPaysage ? " (paysage à part)." : ".");
  regieQr();
}

// QR code du lien d'affiches (régie) : le téléphone ouvre /lien, où le lien est prêt à copier (il voyage après
// le #, jamais envoyé au serveur). Ouvert, il suit les réglages.
function regieQr() {
  if ($("regie-qr").hidden) return;
  const box = $("regie-qr-code");
  const lien = location.origin + "/lien#" + new URLSearchParams({ u: NV.lienPerso(), nom: "Ton lien d'affiches" }).toString();
  chargerQr().then((qrcode) => { // outils.js
    box.className = "regie-qr-code"; box.removeAttribute("role");
    box.innerHTML = qrSvg(qrcode, lien, "QR code de ton lien d'affiches", true);
  }, () => { box.className = "regie-qr-code alerte"; box.setAttribute("role", "alert"); box.textContent = "QR code indisponible : vérifie ta connexion."; });
}
function qrOuvre(ouvert) {
  $("regie-qr").hidden = !ouvert;
  $("regie-qr-btn").setAttribute("aria-expanded", String(ouvert));
  if (ouvert) { $("regie-import").hidden = true; $("regie-importer").setAttribute("aria-expanded", "false"); regieQr(); }
}

// ---- Les contrôles ----
// data-cle : de quoi retrouver un bouton après une reconstruction (focus). Préfixée par l'élément en cours de
// dessin (« statut/Style:texte » et « qualite/Style:texte » ne se confondent plus).
let prefixeCle = "";
const cleDe = (s) => (prefixeCle ? prefixeCle + "/" : "") + s;
function choix(titre, options, actuel, choisir) {
  const d = el("div", { class: "choix" }, el("span", { text: titre }));
  const puces = el("div", { class: "puces" });
  options.forEach(([val, txt]) => puces.append(el("button", { type: "button", text: txt, "data-cle": cleDe(titre + ":" + String(val)), "aria-pressed": String(val === actuel), onclick: () => choisir(val) })));
  d.append(puces);
  return d;
}
function curseur(titre, val, regler, min = 60, max = 140, pas = 5) {
  const out = el("output", { text: Math.round(val * 100) + " %" });
  const input = el("input", { type: "range", min: String(min), max: String(max), step: String(pas), value: String(Math.round(val * 100)), "aria-label": titre, "data-cle": cleDe("curseur:" + titre) });
  // Partie remplie de la piste (dessinée en CSS jusqu'au bouton).
  const remplir = () => input.style.setProperty("--rempli", ((Number(input.value) - min) / (max - min)) * 100 + "%");
  remplir();
  input.addEventListener("input", () => { remplir(); out.textContent = input.value + " %"; regler(Number(input.value) / 100); });
  return el("div", { class: "choix" }, el("span", { text: titre }), el("div", { class: "curseur" }, input, out));
}
/** Nuancier : une pastille par couleur, plus « Par défaut » (la couleur d'origine de l'élément). */
function nuancier(titre, actuel, choisir) {
  const grille = el("div", { class: "nuancier", role: "group", "aria-label": titre });
  grille.append(el("button", { type: "button", class: "defaut", "aria-pressed": String(!actuel), "aria-label": "Par défaut", title: "Par défaut", "data-cle": cleDe(titre + ":defaut"), onclick: () => choisir("") }));
  COULEURS.forEach((c, i) => grille.append(el("button", { type: "button", style: "background:" + LA.PALETTE[c], "aria-pressed": String(actuel === c), "aria-label": NOMS_COULEURS[i], title: NOMS_COULEURS[i], "data-cle": cleDe(titre + ":" + c), onclick: () => choisir(c) })));
  return grille;
}
const aide = (text) => el("p", { class: "regie-note", text });
const icone = (nom) => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", ICONES[nom] || ICONES.couleur);
  s.append(p);
  return s;
};

// ---- Les cartes : nom, icône, interrupteur, choix principaux (toujours visibles) et réglages fins ----
const SANS_TITRE = ["note", "genre", "annee", "duree", "age", "ligne", "ligne2", "fondu", "image", "c-texte", "c-fondu"];
const sansEffet = (r, v) => !r.titre.on && SANS_TITRE.includes(v);
function carteDe(v) {
  const r = cible(), regle = (f, cle) => regieChange(f, cle);
  const onOff = (g) => ({ on: () => r[g].on, bascule: () => regle((r) => { r[g].on = !r[g].on; }) });
  const C = {
    statut: { nom: "Statut", ...onOff("statut"),
      principal: () => [choix("Style", [["texte", "Discret"], ["etiquette", "Étiquette"]], r.statut.style, (x) => regle((r) => { r.statut.style = x; }))],
      plus: () => [choix("Date", [["date", "Le 2 nov."], ["compte", "Dans 12 jours"]], r.statut.forme, (x) => regle((r) => { r.statut.forme = x; })),
        choix("Épisodes", [[false, "Non"], [true, "Nouvel épisode"]], r.statut.episode, (x) => regle((r) => { r.statut.episode = x; })),
        choix("Fin", [[false, "Non"], [true, "Terminée, annulée"]], r.statut.fin, (x) => regle((r) => { r.statut.fin = x; })),
        choix("Avancement", [[false, "Non"], [true, "Barre de la saison"]], r.statut.avance, (x) => regle((r) => { r.statut.avance = x; })),
        aide("« Nouveau », « Nouvelle saison » ; pas encore sorti : la date ou le compte à rebours. Séries : « Terminée » ou « Annulée » quand rien d'autre n'est à dire, et une barre fine des épisodes déjà sortis de la saison en cours.")] },
    tendance: { nom: "Tendance", ...onOff("tendance"),
      principal: () => [choix("Style", [["fleche", "↗ N°4"], ["ruban", "Ruban"]], r.tendance.style, (x) => regle((r) => { r.tendance.style = x; }))] },
    qualite: { nom: "Qualité", ...onOff("qualite"),
      principal: () => [choix("Montrer", [["4k", "4K"], ["plus", "4K + HDR"], ["tout", "Tout"]], r.qualite.montrer, (x) => regle((r) => { r.qualite.montrer = x; }))],
      plus: () => [choix("Style", [["texte", "Texte nu"], ["pastille", "Pastille"]], r.qualite.style, (x) => regle((r) => { r.qualite.style = x; })),
        aide("« Tout » : 1080p quand il n'y a pas de 4K, HDR10+ et Dolby Atmos en plus.")] },
    langue: { nom: "Langue", ...onOff("langue"),
      principal: () => [aide("VF, MULTI (VF et VO), VOSTFR ou VO, d'après les sources du titre : sous la qualité.")] },
    culte: { nom: "Incontournable", on: () => r.infos.culte, bascule: () => regle((r) => { r.infos.culte = !r.infos.culte; }),
      principal: () => [aide("Un badge pour les films et séries très bien notés et très vus.")] },
    saga: { nom: "Rang dans la saga", on: () => r.infos.saga, bascule: () => regle((r) => { r.infos.saga = !r.infos.saga; }),
      principal: () => [aide("« SAGA · 3/5 » pour un film d'une saga : sa place parmi les films déjà sortis, par date.")] },
    bandeau: { nom: "Bandeau en coin", ...onOff("bandeau"),
      principal: () => [choix("Porte", [["statut", "Le statut"], ["tendance", "Le N°"]], r.bandeau.porte, (x) => regle((r) => { r.bandeau.porte = x; })),
        choix("Coin", [["g", "Gauche"], ["d", "Droite"]], r.bandeau.coin, (x) => regle((r) => { r.bandeau.coin = x; }))] },
    badges: { nom: "Badges : style et place",
      principal: () => [choix("Style", [["auto", "Chacun"], ["plein", "Plein"], ["verre", "Verre"], ["contour", "Contour"]], r.haut.style, (x) => regle((r) => { r.haut.style = x; }))],
      plus: () => [
        ...(r.haut.style === "auto" ? [] : [
          choix("Forme", [["arrondi", "Arrondie"], ["carre", "Carrée"], ["pilule", "Pilule"]], r.haut.forme, (x) => regle((r) => { r.haut.forme = x; })),
          choix("Fond", [["s", "Léger"], ["m", "Moyen"], ["l", "Plein"]], r.haut.opacite, (x) => regle((r) => { r.haut.opacite = x; })),
          choix("Texte", [["blanc", "Blanc"], ["or", "Accent"], ["noir", "Noir"]], r.haut.couleur, (x) => regle((r) => { r.haut.couleur = x; })),
        ]),
        curseur("Taille", r.texte.haut, (x) => regle((r) => { r.texte.haut = x; }, "texte.haut")),
        choix("Statut", [["auto", "Auto"], ["hg", "↖"], ["hd", "↗"], ["bg", "↙"], ["bd", "↘"]], r.haut.coinStatut, (x) => regle((r) => { r.haut.coinStatut = x; })),
        choix("Qualité", [["auto", "Auto"], ["hg", "↖"], ["hd", "↗"], ["bg", "↙"], ["bd", "↘"]], r.haut.coinQualite, (x) => regle((r) => { r.haut.coinQualite = x; }))] },
    titre: { nom: "Titre (logo)", ...onOff("titre"),
      principal: () => [choix("Langue", [["fr", "Français"], ["en", "Anglais"], ["vo", "D'origine"]], r.titre.langue, (x) => regle((r) => { r.titre.langue = x; })),
        curseur("Taille", r.titre.taille, (x) => regle((r) => { r.titre.taille = x; }, "titre.taille"))],
      plus: () => [curseur("Largeur", r.titre.large, (x) => regle((r) => { r.titre.large = x; }, "titre.large")),
        curseur("Hauteur", r.titre.monte, (x) => regle((r) => { r.titre.monte = x; }, "titre.monte"), 0, 30, 5),
        choix("Place", [["auto", "Auto"], ["gauche", "Gauche"], ["centre", "Centre"]], r.titre.place, (x) => regle((r) => { r.titre.place = x; })),
        choix("Effet", [["aucun", "Aucun"], ["ombre", "Ombre"], ["halo", "Halo"]], r.titre.effet, (x) => regle((r) => { r.titre.effet = x; }))] },
    texte: { nom: "Police et texte",
      principal: () => [choix("Police", [["inter", "Moderne"], ["bebas", "Cinéma"], ["elegante", "Élégante"], ["arrondie", "Arrondie"], ["condensee", "Condensée"]], r.texte.police, (x) => regle((r) => { r.texte.police = x; }))],
      plus: () => [choix("Casse", [["normal", "Normale"], ["maj", "MAJUSCULES"]], r.texte.casse, (x) => regle((r) => { r.texte.casse = x; })),
        choix("Lettres", [["normal", "Normal"], ["aere", "Aéré"], ["tresaere", "Très aéré"]], r.texte.espace, (x) => regle((r) => { r.texte.espace = x; })),
        choix("Ombre", [["aucune", "Aucune"], ["normale", "Douce"], ["forte", "Forte"]], r.texte.ombre, (x) => regle((r) => { r.texte.ombre = x; }))] },
    ligne: { nom: "Ligne du bas",
      principal: () => [choix("Ordre", [["gna", "Genre d'abord"], ["nga", "Note d'abord"], ["agn", "Année d'abord"]], r.ligne.ordre, (x) => regle((r) => { r.ligne.ordre = x; }))],
      plus: () => [choix("Barre", [["aucune", "Aucune"], ["verre", "Verre"], ["fine", "Fine"]], r.ligne.barre, (x) => regle((r) => { r.ligne.barre = x; })),
        curseur("Taille", r.texte.taille, (x) => regle((r) => { r.texte.taille = x; }, "texte.taille")),
        choix("Séparateur", [["point", "·"], ["barre", "|"], ["puce", "•"]], r.texte.sep, (x) => regle((r) => { r.texte.sep = x; }))] },
    ligne2: { nom: "Petite ligne en dessous",
      principal: () => [choix("Montrer", [["aucune", "Rien"], ["realisateur", "Réalisateur"], ["accroche", "Accroche"], ["studio", "Studio"]], r.infos.ligne2, (x) => regle((r) => { r.infos.ligne2 = x; }))] },
    note: { nom: "Notes", ...onOff("note"),
      principal: () => {
        // Une seule liste de sources, cochées librement : côte à côte, trois au plus (la ligne déborderait) ; en
        // moyenne, autant qu'on veut. Toujours une au moins (pour n'en montrer aucune : l'interrupteur).
        const SOURCES = [["imdb", "IMDb"], ["tmdb", "TMDB"], ["rt", "Rotten Tomatoes"], ["mc", "Metacritic"], ["lb", "Letterboxd"], ["mal", "MyAnimeList"]];
        const MAX = 3;
        const choisies = (n) => new Set(SOURCES.map(([k]) => k).filter((k) => (k === "imdb" ? n.principale && (n.source === "imdb" || n.deux)
          : k === "tmdb" ? n.principale && (n.source === "tmdb" || n.deux) : n[k])));
        const poser = (n, sel) => {
          n.principale = sel.has("imdb") || sel.has("tmdb");
          n.source = sel.has("imdb") || !n.principale ? "imdb" : "tmdb";
          n.deux = sel.has("imdb") && sel.has("tmdb");
          for (const k of ["rt", "mc", "lb", "mal"]) n[k] = sel.has(k);
        };
        const sel = choisies(r.note), plein = !r.note.moyenne && sel.size >= MAX;
        const puces = el("div", { class: "puces" }, ...SOURCES.map(([k, nom]) => {
          const pris = sel.has(k), bloque = (!pris && plein) || (pris && sel.size === 1);
          return el("button", { type: "button", text: nom, "data-cle": cleDe("sources:" + k), "aria-pressed": String(pris), "aria-disabled": String(bloque),
            title: bloque ? (pris ? "Une note au moins : pour les cacher toutes, éteins « Notes »." : "Trois notes au plus côte à côte : passe en moyenne pour en mettre plus.") : "",
            onclick: () => { if (!bloque) regle((r) => { const s = choisies(r.note); if (s.has(k)) s.delete(k); else s.add(k); poser(r.note, s); }); } });
        }));
        const dit = r.note.moyenne
          ? "Une seule note : la moyenne sur 10 de celles cochées que le titre a."
          : plein ? "Trois notes au plus côte à côte : passe en moyenne pour en mettre plus." : "Jusqu'à trois notes côte à côte (" + sel.size + "/3).";
        return [choix("Afficher", [["non", "Côte à côte"], ["oui", "La moyenne"]], r.note.moyenne ? "oui" : "non", (x) => regle((r) => {
            r.note.moyenne = x === "oui";
            // Retour côte à côte : les trois premières seulement.
            if (!r.note.moyenne) poser(r.note, new Set([...choisies(r.note)].slice(0, MAX)));
          })),
          el("div", { class: "choix" }, el("span", { text: "Sources" }), puces),
          el("p", { class: "regie-note" + (plein ? " limite" : ""), text: dit + (sel.has("mal") ? " MyAnimeList : sur les animés seulement." : "") })];
      },
      plus: () => [choix("Style", [["etoile", "★ 8,4"], ["nu", "8,4"], ["grand", "Grand"], ["badge", "Badge"]], r.note.style, (x) => regle((r) => { r.note.style = x; })),
        choix("Couleur", [["non", "Non"], ["oui", "Selon la note"], ["halo", "+ halo"]], r.note.couleur, (x) => regle((r) => { r.note.couleur = x; }))] },
    genre: { nom: "Genre", ...onOff("genre"),
      principal: () => [choix("Forme", [["court", "Court (SF)"], ["complet", "Complet"]], r.genre.forme, (x) => regle((r) => { r.genre.forme = x; }))] },
    annee: { nom: "Année", ...onOff("annee") },
    duree: { nom: "Durée, saisons", ...onOff("duree"), principal: () => [aide("« 2 h 46 » pour un film, « 3 saisons » pour une série.")] },
    age: { nom: "Âge conseillé", ...onOff("age"), principal: () => [aide("-10, -12, -16, -18 ; rien pour les titres tous publics.")] },
    plateforme: { nom: "Plateforme", ...onOff("plateforme"),
      principal: () => [choix("Place", [["ligne", "Dans la ligne"], ["coin", "En coin"]], r.plateforme.place, (x) => regle((r) => { r.plateforme.place = x; }))] },
    image: { nom: "Image",
      principal: () => [choix("Image", [["sanstexte", "Sans texte"], ["officielle", "Officielle"], ["fond", "Du film"]], r.image.source, (x) => regle((r) => { r.image.source = x; }))] },
    retouche: { nom: "Retouche",
      principal: () => [choix("Filtre", [["aucun", "Aucun"], ["nb", "N&B"], ["sepia", "Sépia"], ["froid", "Froid"], ["chaud", "Chaud"]], r.image.filtre, (x) => regle((r) => { r.image.filtre = x; }))],
      plus: () => [curseur("Lumière", r.image.lum, (x) => regle((r) => { r.image.lum = x; }, "image.lum"), 70, 130, 5),
        curseur("Contraste", r.image.contraste, (x) => regle((r) => { r.image.contraste = x; }, "image.contraste"), 70, 130, 5),
        curseur("Couleurs", r.image.satur, (x) => regle((r) => { r.image.satur = x; }, "image.satur"), 0, 160, 10),
        choix("Grain", [[false, "Non"], [true, "Oui"]], r.image.grain, (x) => regle((r) => { r.image.grain = x; }))] },
    fondu: { nom: "Fondu", ...onOff("fondu"),
      // Réglé finement au curseur : force de 30 à 100 %, hauteur de 25 à 85 % de l'image (départ : les anciens crans).
      principal: () => [curseur("Force", r.fondu.opacite || ({ s: 0.7, m: 0.9, l: 0.95 })[r.fondu.force], (x) => regle((r) => { r.fondu.opacite = x; }, "fondu.opacite"), 30, 100, 5)],
      plus: () => [curseur("Hauteur", r.fondu.taille || ({ court: 0.4, normal: 0.5, long: 0.65 })[r.fondu.hauteur], (x) => regle((r) => { r.fondu.taille = x; }, "fondu.taille"), 25, 85, 5),
        choix("Couleur", [["noir", "Noir"], ["affiche", "De l'affiche"]], r.fondu.couleur, (x) => regle((r) => { r.fondu.couleur = x; })),
        choix("Flou", [[false, "Non"], [true, "Oui"]], r.fondu.flou, (x) => regle((r) => { r.fondu.flou = x; }))] },
    ambiance: { nom: "Voile et vignette",
      principal: () => [choix("Voile", [["0", "Aucun"], ["s", "Léger"], ["m", "Moyen"], ["l", "Fort"]], r.ambiance.voile, (x) => regle((r) => { r.ambiance.voile = x; })),
        choix("Vignette", [[false, "Non"], [true, "Oui"]], r.ambiance.vignette, (x) => regle((r) => { r.ambiance.vignette = x; }))] },
    cadre: { nom: "Cadre",
      // « Couleur » : une couleur d'office (sinon il restait blanc) et le nuancier s'ouvre dans le panneau du bas.
      principal: () => [choix("Cadre", [["aucun", "Aucun"], ["blanc", "Blanc"], ["or", "Doré"], ["couleur", "Couleur"]], r.image.cadre, (x) => {
        if (x === "couleur") { regieVoie = "cadre"; regieFocusPlus = true; }
        regle((r) => { r.image.cadre = x; if (x === "couleur" && !r.image.cadreC) r.image.cadreC = "e"; });
      })],
      plus: () => r.image.cadre === "couleur"
        ? [nuancier("Couleur du cadre", r.image.cadreC, (x) => regle((r) => { r.image.cadreC = x || "e"; }))]
        : [aide("Choisis « Couleur » pour prendre une teinte du nuancier.")] },
    saison: { nom: "Habillage de la saison", on: () => r.saison.on, bascule: () => { regle((r) => { r.saison.on = !r.saison.on; }); regieSaisonMontre(); },
      principal: () => [aide(regieSaison && regieSaison.fete === null
        ? "Pas de fête en ce moment : l'habillage s'allumera tout seul à la prochaine (Halloween, Noël, Saint-Valentin, Pâques, été)."
        : "Seulement sur les films de la rangée « " + ((regieSaison && regieSaison.nom) || "Spécial …") + " », le temps de la fête : un cadre et des ornements. Un film de cette rangée passe sur la scène pour le voir.")],
      plus: () => [aide("Nuvio ne dit pas de quelle rangée vient une affiche : un film de la rangée de saison est habillé partout où il apparaît (Tendances, recherche, fiche).")] },
    sortie: { nom: "Pas encore sorti", on: () => r.sortie.nb, bascule: () => regle((r) => { r.sortie.nb = !r.sortie.nb; }),
      principal: () => [choix("Note", [[true, "Cachée"], [false, "Montrée"]], r.sortie.cacherNote, (x) => regle((r) => { r.sortie.cacherNote = x; }))],
      plus: () => [aide("Noir et blanc tant que le titre n'est pas disponible chez soi en VF, comme dans les rangées.")] },
    "c-accent": { nom: "Accent (étoile, flèche, ruban)", couleur: true,
      principal: () => [choix("Base", [["or", "Or"], ["blanc", "Blanc"], ["rouge", "Rouge"], ["bleu", "Bleu"], ["affiche", "De l'affiche"]], r.ambiance.accent, (x) => regle((r) => { r.ambiance.accent = x; r.ambiance.accentC = ""; })),
        nuancier("Accent", r.ambiance.accentC, (x) => regle((r) => { r.ambiance.accentC = x; }))] },
    "c-texte": { nom: "Texte du bas", couleur: true, principal: () => [nuancier("Texte du bas", r.texte.couleur, (x) => regle((r) => { r.texte.couleur = x; }))] },
    "c-badges": { nom: "Fond des badges (style plein)", couleur: true,
      principal: () => r.haut.style === "plein" ? [nuancier("Fond des badges", r.haut.fond, (x) => regle((r) => { r.haut.fond = x; }))] : [aide("Choisis le style « Plein » (onglet Haut, Badges) pour colorer leur fond.")] },
    "c-fondu": { nom: "Fondu", couleur: true, principal: () => [nuancier("Fondu", r.fondu.teinte, (x) => regle((r) => { r.fondu.teinte = x; }))] },
    "c-cadre": { nom: "Cadre", couleur: true,
      principal: () => r.image.cadre === "couleur" ? [nuancier("Cadre", r.image.cadreC, (x) => regle((r) => { r.image.cadreC = x || "e"; }))] : [aide("Choisis un cadre « Couleur » (onglet Image) pour lui donner une couleur du nuancier.")] },
  };
  return C[v];
}

/** L'onglet Paysage : mêmes réglages que le portrait, ou réglages à part. */
function ongletPaysage() {
  const apart = !!regieRP;
  const bloc = el("div", { class: "regie-paysage" },
    choix("Paysage", [[false, "Mêmes réglages"], [true, "Réglages à part"]], apart, (x) => regieChange(() => { regieRP = x ? JSON.parse(JSON.stringify(regieR)) : null; if (x) regieForme = "landscape"; })),
    aide(apart
      ? "Avec la scène en Paysage, tout ce que tu règles ne touche que les images en paysage (Continuer à regarder…). Ça reste un seul lien : les deux réglages sont dedans, Nuvio prend le bon pour chaque image."
      : "Les images en paysage suivent les réglages des affiches. Choisis « Réglages à part » pour les régler séparément."));
  if (apart) bloc.append(el("button", { type: "button", class: "btn", text: "Reprendre les réglages des affiches", "data-cle": "paysage:reprendre", onclick: () => regieChange(() => { regieRP = JSON.parse(JSON.stringify(regieR)); }) }));
  return [bloc];
}

function regieCartes() {
  const r = cible(), boite = $("regie-voies");
  boite.textContent = "";
  if (regieOnglet === "paysage") { prefixeCle = "paysage"; boite.append(...ongletPaysage()); prefixeCle = ""; return; }
  ONGLETS[regieOnglet].forEach((v) => {
    prefixeCle = v;
    const c = carteDe(v), allume = c.on ? c.on() : null, vide = sansEffet(r, v), ouverte = v === regieVoie;
    const carte = el("section", { class: "carte" + (allume === false || vide ? " eteinte" : "") + (ouverte ? " ouverte" : ""), "data-voie": v, "aria-label": c.nom });
    const tete = el("div", { class: "carte-tete" }, el("span", { class: "carte-icone" }, icone(c.couleur ? "couleur" : v)), el("b", { text: c.nom }));
    if (allume !== null) tete.append(el("button", { type: "button", class: "interrupteur", role: "switch", "aria-checked": String(allume), "aria-label": c.nom, "data-cle": "on:" + v, onclick: c.bascule }));
    carte.append(tete);
    if (vide) carte.append(aide("Sans effet sans le titre (onglet Titre)."));
    else if (allume !== false) {
      if (c.principal) carte.append(el("div", { class: "carte-corps" }, ...c.principal()));
      // Les réglages fins s'ouvrent dans le panneau du bas, par-dessus les cartes : rien ne bouge. Le bouton est
      // dans la ligne de titre (avant l'interrupteur), pour que chaque carte reste courte.
      if (c.plus) tete.insertBefore(el("button", { type: "button", class: "carte-plus", "aria-expanded": String(ouverte), "aria-controls": "corps-" + v, "data-cle": "plus:" + v,
        text: "Plus de réglages", onclick: () => { if (ouverte) fermePlus(); else { regieVoie = v; regieFocusPlus = true; regieDessine(); } } }), tete.querySelector(".interrupteur"));
    }
    boite.append(carte);
  });
  prefixeCle = "";
}

/** Le panneau « Plus de réglages » de la carte ouverte (regieVoie), par-dessus le bas de la console. */
let regieFocusPlus = false;
function regiePanneau() {
  const panneau = $("regie-plus"), v = regieVoie, c = v && regieOnglet !== "paysage" && ONGLETS[regieOnglet].includes(v) ? carteDe(v) : null;
  panneau.textContent = "";
  panneau.hidden = !(c && c.plus);
  if (panneau.hidden) return false;
  prefixeCle = v;
  panneau.append(
    el("div", { class: "plus-tete" }, el("b", { text: c.nom }), el("button", { type: "button", class: "plus-fermer", text: "✕", "aria-label": "Fermer ces réglages", "data-cle": "fermer-plus", onclick: fermePlus })),
    el("div", { class: "carte-corps", id: "corps-" + v }, ...c.plus()));
  prefixeCle = "";
  // Ouvert à l'instant : le focus entre dans le panneau (son premier réglage).
  if (!regieFocusPlus) return false;
  regieFocusPlus = false;
  const premier = panneau.querySelector("[aria-pressed='true'], input, button:not(.plus-fermer)");
  (premier || panneau.querySelector("button")).focus();
  return true;
}
/** Ferme le panneau ; le focus revient sur le bouton « Plus de réglages » de la carte. */
function fermePlus() {
  const v = regieVoie;
  regieVoie = null;
  regieDessine();
  const bouton = [...$("regie").querySelectorAll("[data-cle]")].find((b) => b.dataset.cle === "plus:" + v);
  if (bouton) bouton.focus();
}

function regieDessine(garderCorps) {
  const r = cible(), m = LA.memoireDe(r);
  // Les cartes sont reconstruites : le focus revient sur le même bouton (data-cle).
  const actif = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.cle || "" : "";
  document.querySelectorAll("#regie-memoires [data-memoire]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.memoire === m)));
  $("regie-perso").hidden = !!LA.dossierDe(regieR, regieRP);
  document.querySelectorAll("#regie-onglets [data-onglet]").forEach((b) => { b.setAttribute("aria-selected", String(b.dataset.onglet === regieOnglet)); b.tabIndex = b.dataset.onglet === regieOnglet ? 0 : -1; });
  $("regie-voies").setAttribute("aria-labelledby", "onglet-" + regieOnglet);
  $("regie-cible").hidden = !(regieRP && regieForme === "landscape");
  // Pendant un glissé de curseur, les cartes restent telles quelles (les reconstruire couperait le glissé).
  if (!garderCorps) regieCartes();
  // Une carte ouverte : les vignettes des styles se réduisent à leurs noms, pour laisser la place à ses réglages.
  // Pendant un glissé de curseur (dans le panneau), il reste tel quel lui aussi.
  const focusDansPanneau = !garderCorps && regiePanneau();
  $("regie-annuler").disabled = !regieHisto.length;
  seg($("regie-format"), ["Portrait", "Paysage"], regieForme === "landscape" ? 1 : 0, (i) => { regieForme = i ? "landscape" : "poster"; regieDessine(); regieApercus(); });
  [...$("regie-format").children].forEach((b, i) => { b.dataset.cle = "format:" + i; });
  lienAffichesMaj();
  if (actif) {
    const retour = [...$("regie").querySelectorAll("[data-cle]")].find((b) => b.dataset.cle === actif);
    if (retour && !focusDansPanneau) retour.focus();
  }
}

// Chaque affiche redessinée est un dessin chez Vercel : une rafale de clics n'en déclenche qu'un, à la fin.
// « Annuler » revient d'un changement : un changement sans effet ne compte pas, et un même curseur glissé
// (cle) compte pour un seul changement.
let regieCleDerniere = "", regieDernier = 0;
// Un changement compte s'il change le lien (forme courte) ; « Annuler » remet les réglages entiers d'avant.
const regieEtat = () => JSON.stringify([LA.ecrireReglages(regieR), regieRP ? LA.ecrireReglages(regieRP) : null]);
function regieChange(modif, cle) {
  const avant = regieEtat(), entiers = JSON.stringify([regieR, regieRP]);
  modif(cible());
  const suite = cle && cle === regieCleDerniere && Date.now() - regieDernier < 800;
  if (regieEtat() !== avant && !suite) { regieHisto.push(entiers); if (regieHisto.length > 60) regieHisto.shift(); }
  regieCleDerniere = cle || ""; regieDernier = Date.now();
  regieGarde();
  regieDessine(!!cle);
  clearTimeout(regieAttente);
  regieAttente = setTimeout(regieApercus, 400);
  if (window.sfx && !cle) sfx.click();
}

function regieApercus() {
  // Habillage allumé ou éteint autrement que par sa carte (style tout prêt, Annuler, lien importé) : le film de la
  // saison rejoint ou quitte les coulisses.
  const saison = regieSaisonVisible(), present = !!saison && regieTitres.some((x) => x.id === saison.id && x.legende === saison.legende);
  if (regieDemo.length && !!saison !== present) regieCoulisses();
  const t = regieTitres[regieChoisi];
  const grande = $("regie-grande");
  $("regie-plateau").classList.toggle("paysage", regieForme === "landscape");
  if (t) {
    const src = NV.ppSrc(t, regieForme, regieForme === "landscape" && regieRP ? regieRP : regieR);
    if (src && grande.dataset.src !== src) regieImage(grande, src, true);
    grande.alt = "Affiche de " + (t.name || "ce titre");
    $("regie-legende").textContent = (t.name || "") + (t.legende ? " · " + t.legende : "");
  }
  // Les coulisses suivent le format de la scène (en Paysage : images 16:9, réglages du paysage s'il est à part).
  $("regie-coulisses").classList.toggle("paysage", regieForme === "landscape");
  document.querySelectorAll("#regie-coulisses button").forEach((b, i) => {
    const img = b.querySelector("img"), src = NV.ppSrc(regieTitres[i], regieForme, regieForme === "landscape" && regieRP ? regieRP : regieR);
    if (src && img.dataset.src !== src) regieImage(img, src);
    b.setAttribute("aria-pressed", String(i === regieChoisi));
  });
}

// Une affiche de la régie : lue par fetch pour savoir si elle est partie complète (X-Affiche-Etat). Une affiche
// « en retard » (le badge 4K pas encore lu chez Torrentio…) est redemandée 4 s puis 8 s plus tard : sans ça, chaque
// case cochée, une adresse nouvelle, pouvait arriver sans ses badges et semblait en retirer d'autres. Le relais
// ne la garde pas, le paramètre essai passe le cache du navigateur.
function regieImage(img, src, grande, essai = 0) {
  clearTimeout(img._relance);
  img.dataset.src = src;
  if (grande) img.classList.add("attente");
  fetch(essai ? src + "&essai=" + essai : src).then(async (r) => {
    if (img.dataset.src !== src) return;   // un autre réglage est passé entre-temps
    if (!r.ok) throw new Error(r.status);
    const etat = r.headers.get("X-Affiche-Etat"), blob = await r.blob();
    if (img.dataset.src !== src) return;
    if (img._url) URL.revokeObjectURL(img._url);
    img._url = URL.createObjectURL(blob); img.src = img._url;
    img.classList.remove("attente");
    if (etat === "retard" && essai < 2) img._relance = setTimeout(() => { if (img.dataset.src === src) regieImage(img, src, false, essai + 1); }, 4000 * (essai + 1));
  }).catch(() => { if (img.dataset.src === src) img.classList.remove("attente"); });
}

// Vignettes des styles tout prêts : une vraie petite affiche du premier titre de démonstration dans chaque style
// (les mêmes pour tout le monde : gardées par le CDN, 7 dessins par jour en tout).
function regieVignettes() {
  const t = regieDemo[0];
  if (!t) return;
  document.querySelectorAll("#regie-memoires [data-memoire]").forEach((b) => {
    const img = b.querySelector("img"), src = NV.ppSrc(t, "poster", LA.MEMOIRES[b.dataset.memoire]);
    if (img && src && img.dataset.src !== src) { img.dataset.src = src; img.src = src; }
  });
}

// Les 6 titres de démonstration : pris dans les catalogues de l'addon pour être toujours à jour (tendance,
// pas encore sorti, en salle, série), plus deux titres fixes (un film en 4K, un film au logo travaillé).
async function regieCharge() {
  if (regieDemo.length) return;
  const premier = async (type, id, genre, legende) => {
    try {
      const d = await fetchJSON(NV_ORIG + "/catalog/" + type + "/" + id + "/genre=" + encodeURIComponent(genre) + ".json");
      const m = ((d && d.metas) || []).find((x) => /^(tt\\d+|tmdb:\\d+)$/.test(String(x.id)));
      return m ? { id: m.id, type, name: m.name, imdb_id: m.imdb_id, legende } : null;
    } catch (e) { return null; }
  };
  const lus = await Promise.all([
    premier("movie", "films-tendances", "Aujourd'hui", "Tendance du jour"),
    premier("movie", "films-cinema", "Prochainement", "Prochainement"),
    premier("movie", "films-cinema", "En ce moment", "Au cinéma"),
    premier("series", "series-tendances", "Aujourd'hui", "Série tendance"),
  ]);
  const fixes = [{ id: "tt1375666", type: "movie", name: "Inception", legende: "En 4K" }, { id: "tt15239678", type: "movie", name: "Dune : Deuxième partie", legende: "Logo fin" }];
  regieDemo = [...lus.filter(Boolean), ...fixes].slice(0, 6);
  regieCoulisses();
  regieVignettes();
}

// Le titre de son choix (« Essayer sur un titre ») : gardé sur l'appareil, en tête des coulisses et sur la grande
// affiche. Les vignettes des styles restent sur le premier titre de démonstration (les mêmes pour tout le monde,
// gardées par le CDN) ; seules la scène et les coulisses dessinent ce titre-là.
const REGIE_TITRE = "regie-titre";
let regieDemo = [];
let regieMonTitre = (() => {
  try {
    const t = JSON.parse(localStorage.getItem(REGIE_TITRE) || "null");
    if (!t || !/^(tt\\d+|tmdb:\\d+)$/.test(String(t.id)) || (t.type !== "movie" && t.type !== "series")) return null;
    return { id: String(t.id), type: t.type, name: String(t.name || "").slice(0, 120), imdb_id: /^tt\\d+$/.test(t.imdb_id || "") ? t.imdb_id : undefined };
  } catch (e) { return null; }
})();
function regieCoulisses() {
  const saison = regieSaisonVisible(), vu = regieTitres[regieChoisi];
  regieTitres = [...(regieMonTitre ? [{ ...regieMonTitre, legende: "Ton choix" }] : []), ...(saison ? [saison] : []), ...regieDemo].slice(0, 6);
  // Le titre regardé reste sur la scène s'il est toujours là (sinon le premier : ton choix, ou le titre du moment).
  const garde = vu ? regieTitres.findIndex((x) => x.id === vu.id && x.legende === vu.legende) : -1;
  regieChoisi = garde >= 0 ? garde : 0;
  const c = $("regie-coulisses");
  c.textContent = "";
  regieTitres.forEach((t, i) => c.append(el("button", { type: "button", "aria-pressed": "false", "aria-label": "Voir " + (t.name || "ce titre") + " en grand",
    onclick: () => { regieChoisi = i; regieApercus(); } }, el("img", { alt: "" }), el("span", { text: t.legende }))));
  $("regie-retirer").hidden = !regieMonTitre;
}
// Habillage de la saison : il ne se pose que sur les films de la rangée de saison (/saison.json de l'addon), que
// les titres de démonstration ne sont presque jamais. Réglage allumé : un film de cette rangée rejoint la scène.
// regieSaison : undefined (pas encore lu), { fete: null } (pas de fête), { fete, nom, titre }.
let regieSaison;
const FETES = { halloween: "Spécial Halloween", noel: "Spécial Noël", "saint-valentin": "Spécial Saint-Valentin", paques: "Spécial Pâques", ete: "Spécial été" };
const regieSaisonAllumee = () => !!((regieR && regieR.saison && regieR.saison.on) || (regieRP && regieRP.saison && regieRP.saison.on));
const regieSaisonVisible = () => (regieSaisonAllumee() && regieSaison && regieSaison.titre ? regieSaison.titre : null);
async function regieSaisonLue() {
  if (regieSaison !== undefined) return regieSaison;
  try {
    const d = await fetchJSON(NV_ORIG + "/saison.json");
    if (!d || !d.saison || !Array.isArray(d.ids) || !d.ids.length) return (regieSaison = { fete: null });
    const id = d.ids[0], m = ((await fetchJSON(NV_ORIG + "/meta/movie/tmdb:" + id + ".json")) || {}).meta || {};
    const imdb = /^tt\\d+$/.test(m.imdb_id || "") ? m.imdb_id : /^tt\\d+$/.test(m.id || "") ? m.id : undefined;
    regieSaison = { fete: d.saison, nom: FETES[d.saison] || "Spécial …",
      titre: { id: "tmdb:" + id, type: "movie", name: m.name || "", imdb_id: imdb, legende: FETES[d.saison] || "Rangée de saison" } };
  } catch (e) { regieSaison = undefined; return { fete: undefined }; }   // réessayé à la prochaine bascule
  return regieSaison;
}
// Réglage allumé : le film de la saison sur la scène (la carte dit aussi s'il n'y a pas de fête en ce moment).
async function regieSaisonMontre() {
  if (!regieSaisonAllumee()) { regieCoulisses(); regieApercus(); return; }
  await regieSaisonLue();
  regieDessine();
  regieCoulisses();
  const i = regieTitres.findIndex((t) => regieSaison && regieSaison.titre && t.id === regieSaison.titre.id);
  if (i >= 0) regieChoisi = i;
  regieApercus();
}

function regieGardeTitre() {
  try { if (regieMonTitre) localStorage.setItem(REGIE_TITRE, JSON.stringify(regieMonTitre)); else localStorage.removeItem(REGIE_TITRE); } catch (e) {}
}
$("regie-retirer").addEventListener("click", () => {
  regieMonTitre = null; regieGardeTitre(); regieChoisi = 0; regieCoulisses(); regieApercus();
  $("regie-q").focus();
});

// La recherche : films et séries (les animés en font partie) par la recherche de l'addon, comme dans Nuvio.
// Dès 3 lettres, après une courte pause : chaque recherche nouvelle coûte une vingtaine d'appels TMDB.
(() => {
  const q = $("regie-q"), liste = $("regie-propositions");
  let actif = -1, props = [], attente = 0, enCours = null;
  const ferme = () => { liste.hidden = true; q.setAttribute("aria-expanded", "false"); q.removeAttribute("aria-activedescendant"); actif = -1; };
  const surligne = (i) => {
    actif = i;
    [...liste.children].forEach((li, k) => li.setAttribute("aria-selected", String(k === i)));
    const li = liste.children[i];
    if (li && li.id) { q.setAttribute("aria-activedescendant", li.id); li.scrollIntoView({ block: "nearest" }); } else q.removeAttribute("aria-activedescendant");
  };
  const prend = (m) => {
    regieMonTitre = { id: m.id, type: m.type, name: m.name, imdb_id: m.imdb_id };
    regieGardeTitre();
    regieCoulisses(); regieChoisi = 0; regieApercus();   // le titre choisi, en premier, passe en grand
    q.value = ""; ferme();
    if (window.sfx) sfx.click();
  };
  const petite = (u) => String(u || "").replace(/\\/t\\/p\\/(w\\d+|original)\\//, "/t/p/w92/");
  const remplit = (metas) => {
    liste.textContent = ""; props = metas;
    if (!metas.length) liste.append(el("li", { class: "vide", role: "option", "aria-disabled": "true", text: "Aucun titre trouvé : essaie un autre nom." }));
    metas.forEach((m, i) => {
      const li = el("li", { id: "regie-prop-" + i, role: "option", "aria-selected": "false" },
        m.poster ? el("img", { alt: "", loading: "lazy", src: petite(m.poster) }) : el("span", { class: "sans" }),
        el("span", null, el("b", { text: m.name }), el("small", { text: (m.type === "series" ? "Série" : "Film") + (m.annee ? " · " + m.annee : "") })));
      li.addEventListener("mousedown", (e) => e.preventDefault());
      li.addEventListener("click", () => prend(m));
      liste.append(li);
    });
    liste.hidden = false; q.setAttribute("aria-expanded", "true"); actif = -1;
  };
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const cherche = (texte) => {
    if (enCours) enCours.abort();
    const ctl = enCours = new AbortController();
    const un = (type, cat) => fetch(NV_ORIG + "/catalog/" + type + "/" + cat + "/search=" + encodeURIComponent(texte) + ".json", { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => ((d && d.metas) || []).filter((m) => m && m.name && /^(tt\\d+|tmdb:\\d+)$/.test(String(m.id)))
        .map((m) => ({ id: String(m.id), type, name: m.name, imdb_id: m.imdb_id, poster: m.poster, annee: (/^\\d{4}/.exec(m.releaseInfo || "") || [""])[0] })))
      .catch((e) => { if (e && e.name === "AbortError") throw e; return []; });
    Promise.all([un("movie", "recherche-films"), un("series", "recherche-series")]).then(([films, series]) => {
      if (ctl !== enCours) return;
      // La liste dont le premier titre ressemble le plus à la recherche passe d'abord, puis les deux alternent.
      const n = norm(texte), proche = (l) => { const t = l.length ? norm(l[0].name) : ""; return !t ? 0 : t === n ? 3 : t.startsWith(n) ? 2 : t.includes(n) ? 1 : 0; };
      const [a, b] = proche(series) > proche(films) ? [series, films] : [films, series];
      const tout = [];
      for (let i = 0; i < 6; i++) { if (a[i]) tout.push(a[i]); if (b[i]) tout.push(b[i]); }
      remplit(tout.slice(0, 10));
    }).catch(() => {});
  };
  q.addEventListener("input", () => {
    clearTimeout(attente);
    const t = q.value.trim();
    if (t.length < 3) { if (enCours) enCours.abort(); ferme(); return; }
    attente = setTimeout(() => cherche(t), 400);
  });
  q.addEventListener("keydown", (e) => {
    const n = liste.hidden ? 0 : props.length;
    if (e.key === "ArrowDown" && n) { e.preventDefault(); surligne((actif + 1) % n); }
    else if (e.key === "ArrowUp" && n) { e.preventDefault(); surligne((actif - 1 + n) % n); }
    else if (e.key === "Enter" && n) { e.preventDefault(); prend(props[actif >= 0 ? actif : 0]); }
    // Échap ferme d'abord la liste, sans fermer la régie.
    else if (e.key === "Escape" && !liste.hidden) { e.preventDefault(); e.stopPropagation(); ferme(); }
  });
  q.addEventListener("blur", () => setTimeout(ferme, 150));
})();

function regieOuvre(declencheur) {
  regieDeclencheur = declencheur || null;
  ({ r: regieR, rp: regieRP } = regieLue());
  regieHisto = [];
  regieVoie = null;
  $("regie").hidden = false;
  document.body.classList.add("regie-ouverte");
  // Fenêtre modale : le reste de la page devient inerte (ni clic, ni Tab, ni lecteur d'écran) tant qu'elle est
  // ouverte ; les messages de la salle (toast) restent lisibles.
  regieFond = [...document.body.children].filter((n) => n !== $("regie") && !n.classList.contains("toast") && n.tagName !== "SCRIPT" && !n.inert);
  regieFond.forEach((n) => { n.inert = true; });
  regieDessine();
  // La fête du moment est lue avec les titres : le texte de la carte « Habillage » et son film sur la scène en dépendent.
  Promise.all([regieCharge(), regieSaisonLue()]).then(() => { regieCoulisses(); regieDessine(true); regieApercus(); });
  $("regie-fermer").focus();
}
let regieFond = [];
function regieFerme() {
  clearTimeout(regieAttente);
  $("regie").hidden = true;
  document.body.classList.remove("regie-ouverte");
  regieFond.forEach((n) => { n.inert = false; });
  regieFond = [];
  if (!NV.reglages.pp) { NV.reglages.pp = true; drawPP(); }
  E.pp();
  if (regieDeclencheur && regieDeclencheur.isConnected) regieDeclencheur.focus();
}
$("regie-ouvrir").addEventListener("click", (e) => regieOuvre(e.currentTarget));
$("pp-ouvrir").addEventListener("click", (e) => regieOuvre(e.currentTarget));
$("regie-fermer").addEventListener("click", regieFerme);
$("regie").addEventListener("click", (e) => { if (e.target === $("regie")) regieFerme(); });
// Échap ferme la régie où que soit le focus (des cartes reconstruites peuvent l'avoir fait retomber sur la page).
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || $("regie").hidden) return;
  e.stopPropagation();
  if (!$("regie-import").hidden) { importOuvre(false); return; }
  if (!$("regie-qr").hidden) { qrOuvre(false); $("regie-qr-btn").focus(); return; }
  if (regieVoie) { fermePlus(); return; }
  regieFerme();
});
$("regie-annuler").addEventListener("click", () => {
  if (!regieHisto.length) return;
  [regieR, regieRP] = JSON.parse(regieHisto.pop());
  regieGarde();
  regieDessine();
  clearTimeout(regieAttente);
  regieAttente = setTimeout(regieApercus, 400);
});
$("regie-copier").addEventListener("click", (e) => copy(e.currentTarget, $("u-affiches"), "Copier mon lien d'affiches"));
// Importer un lien d'affiches : ses réglages (et ceux du paysage à part) remplacent ceux de la régie ; Annuler revient en arrière.
function importOuvre(ouvert) {
  $("regie-import").hidden = !ouvert;
  $("regie-importer").setAttribute("aria-expanded", String(ouvert));
  $("regie-import-msg").textContent = ""; $("regie-import-msg").classList.remove("erreur");
  if (ouvert) { qrOuvre(false); $("regie-import-lien").value = ""; $("regie-import-lien").focus(); } else $("regie-importer").focus();
}
$("regie-importer").addEventListener("click", () => importOuvre($("regie-import").hidden));
$("regie-qr-btn").addEventListener("click", () => qrOuvre($("regie-qr").hidden));
function importe() {
  const lu = LA.reglagesDuLien($("regie-import-lien").value), msg = $("regie-import-msg");
  if (!lu) { msg.textContent = "Ce n'est pas un lien d'affiches : il doit finir par …/{type}/{shape}/{id}.jpg?…"; msg.classList.add("erreur"); return; }
  regieChange(() => { regieR = lu.r; regieRP = lu.rp; });
  msg.classList.remove("erreur");
  msg.textContent = "Réglages importés" + (lu.rp ? " (paysage à part compris)." : ".");
  setTimeout(() => { if (!$("regie-import").hidden) importOuvre(false); }, 900);
}
$("regie-import-ok").addEventListener("click", importe);
$("regie-import-lien").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); importe(); } });
document.querySelectorAll("#regie-memoires [data-memoire]").forEach((b) => b.addEventListener("click", () => {
  const m = LA.MEMOIRES[b.dataset.memoire], mp = LA.MEMOIRES_PAYSAGE[b.dataset.memoire];
  const copie = (x) => JSON.parse(JSON.stringify(x));
  regieChange(() => { regieR = copie(m); regieRP = mp ? copie(mp) : null; });
}));
// Onglets : clic, flèches gauche/droite d'un onglet à l'autre, Début et Fin pour le premier et le dernier (rôle tablist).
const ongletsListe = [...document.querySelectorAll("#regie-onglets [data-onglet]")];
ongletsListe.forEach((b, i) => {
  b.addEventListener("click", () => { regieOnglet = b.dataset.onglet; regieVoie = null; regieDessine(); });
  b.addEventListener("keydown", (e) => {
    const n = ongletsListe.length;
    const vers = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i + n - 1) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (vers < 0) return;
    e.preventDefault();
    const suivant = ongletsListe[vers];
    regieOnglet = suivant.dataset.onglet; regieVoie = null; regieDessine(); suivant.focus();
  });
});
$("copy-affiches").addEventListener("click", (e) => copy(e.currentTarget, $("u-affiches"), "Copier"));
// « Tout envoyer dans Nuvio » (compte-nuvio.js) : les deux liens du billet dans l'ancre, jamais envoyée au serveur
// (la clé Gemini peut être dans le lien d'addon).
$("compte-nuvio").addEventListener("click", (e) => {
  e.currentTarget.href = D.origin + "/compte-nuvio#" + new URLSearchParams({ lien: $("u-manifest").textContent.trim(), affiches: NV.lienPerso() });
});
lienAffichesMaj();
// Ouverte directement depuis le guide (étape 8) : /configure#regie.
if (hashDepart === "#regie") addEventListener("load", () => regieOuvre($("regie-ouvrir")));
function drawFmt() {
  seg($("fmt"), ["Affiches verticales", "Paysage"], NV.reglages.format === "l" ? 1 : 0, (i) => {
    NV.reglages.format = i ? "l" : "p";
    drawFmt(); E.paysage(i === 1);
    if (window.sfx) sfx.click();
  });
}
drawFmt();
const stageEl = $("stage");
function setBig(on) {
  stageEl.classList.toggle("big", on);
  document.body.classList.toggle("ecran-grand", on);
  $("zoom").setAttribute("aria-pressed", String(on));
  document.body.style.overflow = on ? "hidden" : "";
  if (on) { const f = E.pilote.sel; if (f) f.focus({ preventScroll: true }); }
  else $("zoom").focus({ preventScroll: true });
  if (window.sfx) sfx.click();
}
$("zoom").addEventListener("click", () => setBig(!stageEl.classList.contains("big")));
$("big-close").addEventListener("click", () => setBig(false));
$("coll-ouvrir").addEventListener("click", () => $("coll-dialog").showModal());
$("acc-ouvrir").addEventListener("click", () => { renderAccueil(); $("acc-dialog").showModal(); });
$("acc-fermer").addEventListener("click", () => $("acc-dialog").close());
$("acc-dialog").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
$("coll-fermer").addEventListener("click", () => $("coll-dialog").close());
// Clic sur le fond assombri (hors de la fenêtre) : on ferme.
$("coll-dialog").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
stageEl.addEventListener("click", (e) => { if (e.target === stageEl) setBig(false); });
addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (E.ouvert() && (stageEl.classList.contains("big") || $("screen").contains(document.activeElement))) { e.preventDefault(); E.retour(); return; }
  if (stageEl.classList.contains("big")) setBig(false);
});

// ---------- billet ----------
function serial(s) { let h = 7; for (const ch of s) h = (h * 131 + ch.charCodeAt(0)) % 99991; return "N° " + String(h).padStart(5, "0"); }
function update() {
  state.n = $("name").value.trim() || D.defaults.n;
  const c = compact(state);
  const seg = Object.keys(c).length ? enc(c) : "";
  if (segDepart === null) { segDepart = dernierEnvoye = seg; etatDepart = clone(state); }
  // Lien fixe : la même adresse tant qu'on peut l'enregistrer (ou qu'on n'a rien changé).
  const garde = fixe && (fixe.modif || seg === segDepart);
  const base = garde ? D.origin + "/" + fixe.id : D.origin + (seg ? "/" + seg : "");
  if (garde && fixe.modif) planifie(seg);
  dessineFixe(seg);
  const manifest = base + "/manifest.json";
  // L'aperçu lit toujours les réglages en cours (le lien fixe, lui, garde la même adresse : le
  // navigateur ressortirait ses anciennes rangées de son cache). Sans le nom, la clé Gemini ni le jeton
  // d'alerte : ils ne changent pas les rangées (le nom de l'addon n'est pas à l'écran, la recherche de
  // l'aperçu passe par l'adresse de base), et l'écran ne recharge pas tout à chaque lettre tapée.
  const vu = compact({ ...state, n: D.defaults.n, k: "", al: "" });
  currentBase = D.origin + (Object.keys(vu).length ? "/" + enc(vu) : "");
  // L'adresse de la page suit les réglages : on peut revenir, recharger ou partager sans rien perdre.
  configureUrl = base + "/configure";
  // La clé Gemini reste hors de la barre d'adresse (historique, capture d'écran, lien recopié) : rechargée,
  // la page la reprend sur cet appareil (cleGarde). Dans le guide (cadre, adresse invisible), la page garde
  // la clé : le guide relit cette adresse pour le lien d'addon à installer.
  const sansCle = compact({ ...state, k: "" });
  pageUrl = garde ? configureUrl : D.origin + (Object.keys(sansCle).length ? "/" + enc(sansCle) : "") + "/configure";
  const shared = compact({ ...state, k: "", al: "" });
  shareUrl = D.origin + (Object.keys(shared).length ? "/" + enc(shared) : "") + "/configure";
  const affichee = document.documentElement.classList.contains("dans-guide") ? configureUrl : pageUrl;
  try { if (location.protocol.startsWith("http") && location.href !== affichee) history.replaceState(null, "", affichee); } catch (e) {}
  // Gardée dans l'onglet pour le guide (lien d'addon, avec la clé) ; les liens « Salle 2 » du site la
  // reprennent sans la clé (scene.js).
  try { sessionStorage.setItem("programmation", configureUrl); } catch (e) {}
  // Et sur l'appareil, pour la rouvrir au prochain passage sur /configure (reprise, en tête de page). Revenue
  // par défaut après le démarrage (« Revenir à la programmation d'origine ») : plus rien à rouvrir.
  try {
    const chemin = new URL(pageUrl).pathname;
    if (chemin !== "/configure") localStorage.setItem("${DERNIERE}", chemin);
    else if (demarre) localStorage.removeItem("${DERNIERE}");
  } catch (e) {}
  if (!$("qr").hidden) drawQr();
  $("u-manifest").textContent = manifest;
  $("u-collections").textContent = base + "/collections.json";
  $("contenu-collections").hidden = true; // le contenu affiché serait celui de l'ancien lien
  // nuvio:// et pas stremio:// (sinon Stremio, s'il est installé, s'ouvre à la place) ; sous Windows, Nuvio n'ouvre aucun lien.
  $("open-app").href = manifest.replace(/^https:/, "nuvio:");
  // Lien http (copie Docker à la maison) : pas de nuvio://, le bouton ouvrirait le fichier dans le navigateur.
  $("open-app").hidden = !/^https:/.test(manifest) || /Windows/.test(navigator.userAgent);
  $("copy-manifest").classList.toggle("full", $("open-app").hidden);
  $("t-name").textContent = state.n;
  $("t-serial").textContent = serial(manifest);
  $("t-rows").textContent = state.r.length;
  $("t-prov").textContent = state.p.length;
  $("t-coll").textContent = state.c.length;
  const extras = [];
  if (state.x.length) extras.push(state.x.length + " sur mesure");
  if (state.e.length || state.m || state.a || state.f) extras.push("filtres actifs");
  if (state.g !== "FR") extras.push((D.regions.find(r => r.id === state.g) || {}).name);
  $("t-extra").textContent = extras.join(" · ");
  $("dock-count").textContent = state.r.length + " rangées, " + state.p.length + " plateformes";
  $("prov-warn").hidden = state.p.length > 0 || !state.r.includes("accueil-nouveautes-plateformes");
  if (currentBase !== screenBase) { screenBase = currentBase; renderScreen(); }
}

// ---------- tout le reste ----------
// Tes plateformes, dans l'ordre de leurs tuiles (collection Plateformes) : une cochée s'ajoute au bout.
function togglePlateforme(id, on) {
  state.p = state.p.filter(x => x !== id).concat(on ? [id] : []);
  renderPlateformes(); update();
}
function bougePlateforme(id, d) {
  const k = state.p.indexOf(id), j = k + d;
  if (k < 0 || j < 0 || j >= state.p.length) return;
  [state.p[k], state.p[j]] = [state.p[j], state.p[k]];
  renderPlateformes(); update();
}
function renderPlateformes(moved) {
  const ol = $("prov-ordre");
  ol.textContent = "";
  ol.hidden = state.p.length < 2;
  ol.previousElementSibling.hidden = ol.hidden;
  state.p.forEach((id, k) => {
    const pf = D.providers.find(x => x.id === id);
    if (!pf) return;
    const li = el("li", { class: "acc-item" + (moved && moved.id === id ? " bouge" : ""), "data-cle": "p:" + id },
      el("span", { class: "acc-num", text: String(k + 1) }),
      el("span", { class: "acc-nom" }, el("i", { class: "pastille", style: "--c:" + (pf.color || "var(--dim)") }), el("b", { text: pf.name })));
    const fleches = el("span", { class: "acc-fleches" });
    [["↑", -1, "Monter"], ["↓", 1, "Descendre"]].forEach(([t, d, a]) => {
      const bt = el("button", { type: "button", class: "arrow", text: t, "aria-label": a + " " + pf.name });
      bt.disabled = k + d < 0 || k + d >= state.p.length;
      bt.addEventListener("click", () => { bougePlateforme(id, d); renderPlateformes({ id, a }); });
      fleches.append(bt);
    });
    li.append(fleches);
    ol.append(li);
  });
  if (moved) {
    const arrows = [...ol.querySelectorAll('li[data-cle="p:' + moved.id + '"] .arrow')];
    const again = arrows.find(b => b.getAttribute("aria-label").startsWith(moved.a) && !b.disabled) || arrows.find(b => !b.disabled);
    if (again) again.focus();
    setTimeout(() => ol.querySelectorAll(".acc-item.bouge").forEach(x => x.classList.remove("bouge")), 400);
  }
}
function toggle(key, id, on, all) {
  const set = new Set(state[key]); on ? set.add(id) : set.delete(id);
  state[key] = all.filter(x => set.has(x));
  update();
}
function renderCollections() {
  // Reconstruite à chaque collection cochée : les listes de tuiles ouvertes le restent, le focus reste en place.
  const box = $("collections"), rep = repereFocus(box);
  const ouvertes = new Set([...box.querySelectorAll("details[open]")].map((d) => d.dataset.coll));
  box.textContent = "";
  let enPlus = false;
  byPos(D.collections).forEach(c => {
    if (c.optional && !enPlus) {
      enPlus = true;
      box.append(el("p", { class: "coll-rangees" }, el("b", { text: "En plus, au choix" }), " : des collections à ajouter si tu veux"));
    }
    const on = state.c.includes(c.id);
    const hidden = state.t[c.id] || [];
    const cb = el("input", { type: "checkbox", id: "col-" + c.id }); cb.checked = on;
    cb.addEventListener("change", () => { toggle("c", c.id, cb.checked, D.collections.map(x => x.id)); renderCollections(); });
    const count = c.folders.length - hidden.length;
    const head = el("div", { class: "coll-head" }, el("label", { class: "switch" }, cb, el("span", null, el("b", { text: c.name }), el("small", { text: count + " tuile" + (count > 1 ? "s" : "") + " sur " + c.folders.length }))));
    const wrap = el("div", { class: "coll" + (on ? "" : " off") }, head);
    if (c.folders.length) {
      const list = el("ol", { class: "tiles" });
      drawTiles(c, list, head);
      const det = el("details", { "data-coll": c.id }, el("summary", { text: c.id === "plateformes-streaming" ? "Choisir les tuiles" : "Choisir les tuiles et leur ordre", "data-cle": "tuiles:" + c.id }), list);
      det.open = ouvertes.has(c.id);
      if (c.id === "plateformes-streaming") det.append(el("p", { class: "sub", style: "margin:8px 0 0", text: "Les tuiles suivent tes abonnements, dans l'ordre choisi dans « Tes plateformes »." }));
      wrap.append(det);
    }
    box.append(wrap);
  });
  rendFocus(box, rep);
  const choisies = byPos(D.collections).filter(c => state.c.includes(c.id)).map(c => c.name);
  $("coll-resume").textContent = choisies.length
    ? choisies.length + " collection" + (choisies.length > 1 ? "s" : "") + " sur " + D.collections.length + " : " + choisies.join(", ") + "."
    : "Aucune collection.";
}
// L'accueil de haut en bas, sans Plateformes (épinglée, toujours en tête) : les rangées, et chaque collection à sa place
// (state.ac : après n rangées), sinon après les rangées. Même calcul que /accueil.json (worker/index.js).
function accueilListe() {
  const rangees = state.r.filter(id => rowInfo(id));
  const places = new Map((state.ac || []).map((p, i) => [p.id, { n: p.n, i }]));
  const colls = byPos(D.collections).filter(c => state.c.includes(c.id) && c.id !== "plateformes-streaming")
    .map((c, k) => { const p = places.get(c.id); return { c, n: Math.min(p ? p.n : rangees.length, rangees.length), i: p ? p.i : 1000 + k }; })
    .sort((a, b) => a.n - b.n || a.i - b.i);
  const liste = [];
  let k = 0;
  for (let n = 0; n <= rangees.length; n++) {
    while (k < colls.length && colls[k].n === n) liste.push({ coll: colls[k++].c });
    if (n < rangees.length) liste.push({ row: rangees[n] });
  }
  return liste;
}
// Un ordre choisi dans la fenêtre : les rangées dans state.r (et la bobine), les collections dans state.ac. Toutes
// après les rangées, dans l'ordre habituel : rien à garder dans le lien.
function appliqueAccueil(liste) {
  const rows = liste.filter(it => it.row).map(it => it.row);
  state.r = rows.concat(state.r.filter(id => !rows.includes(id)));
  order = state.r.concat(order.filter(id => !state.r.includes(id)));
  const ac = [];
  let n = 0;
  liste.forEach(it => { if (it.row) n++; else ac.push({ id: it.coll.id, n }); });
  const habituel = ac.every(p => p.n === rows.length) && same(ac.map(p => p.id), byPos(D.collections).filter(c => ac.some(p => p.id === c.id)).map(c => c.id));
  state.ac = habituel ? [] : ac;
}
function renderAccueil(moved) {
  const ol = $("accueil-ordre");
  ol.textContent = "";
  let num = 0;
  const ligne = (classe, nom, tag) => el("li", { class: "acc-item" + classe }, el("span", { class: "acc-num", text: String(++num) }),
    el("span", { class: "acc-nom" }, el("b", { text: nom }), el("span", { class: "acc-tag", text: tag })));
  const epinglee = D.collections.find(c => c.id === "plateformes-streaming");
  if (epinglee && state.c.includes(epinglee.id)) ol.append(ligne(" epingle", epinglee.name, "Toujours en haut"));
  const liste = accueilListe();
  liste.forEach((it, k) => {
    const nom = it.coll ? it.coll.name : (state.o[it.row] || rowInfo(it.row).name);
    const cle = it.coll ? "c:" + it.coll.id : "r:" + it.row;
    const li = ligne((it.coll ? " coll-item" : "") + (moved && moved.cle === cle ? " bouge" : ""), nom, it.coll ? "Collection" : "Rangée");
    li.dataset.cle = cle;
    const fleches = el("span", { class: "acc-fleches" });
    [["↑", -1, "Monter"], ["↓", 1, "Descendre"]].forEach(([t, d, a]) => {
      const j = k + d;
      const bt = el("button", { type: "button", class: "arrow", text: t, "aria-label": a + " " + nom });
      bt.disabled = j < 0 || j >= liste.length;
      bt.addEventListener("click", () => {
        [liste[k], liste[j]] = [liste[j], liste[k]];
        appliqueAccueil(liste); renderAccueil({ cle, a }); renderRows(); update();
      });
      fleches.append(bt);
    });
    li.append(fleches);
    ol.append(li);
  });
  // La flèche suit la ligne déplacée (l'autre flèche quand elle arrive au bout) ; la ligne s'éclaire un instant.
  if (moved) {
    const arrows = [...ol.querySelectorAll('li[data-cle="' + CSS.escape(moved.cle) + '"] .arrow')];
    const again = arrows.find(b => b.getAttribute("aria-label").startsWith(moved.a) && !b.disabled) || arrows.find(b => !b.disabled);
    if (again) again.focus();
    setTimeout(() => ol.querySelectorAll(".acc-item.bouge").forEach(x => x.classList.remove("bouge")), 400);
  }
}
// Tuiles d'une collection dans l'ordre choisi (positions dans le fichier) ; les autres suivent, ordre habituel.
function tileOrder(c) {
  const o = state.to[c.id] || [];
  const rank = (f) => { const k = o.indexOf(f.i); return k < 0 ? o.length : k; };
  return [...c.folders].sort((a, b) => rank(a) - rank(b));
}
function drawTiles(c, list, head, moved) {
  list.textContent = "";
  const hidden = new Set(state.t[c.id] || []);
  const tiles = tileOrder(c);
  tiles.forEach(({ title, i }, k) => {
    const li = el("li", { "data-i": String(i) });
    chip(li, "tile-" + c.id + "-" + i, title, !hidden.has(i), (keep) => {
      const set = new Set(state.t[c.id] || []); keep ? set.delete(i) : set.add(i);
      if (set.size) state.t[c.id] = [...set].sort((a, b) => a - b); else delete state.t[c.id];
      const n = c.folders.length - set.size;
      head.querySelector("small").textContent = n + " tuile" + (n > 1 ? "s" : "") + " sur " + c.folders.length;
      update();
    });
    // Plateformes : l'ordre se choisit dans « Tes plateformes » (celui de la collection le suit).
    if (c.id !== "plateformes-streaming") [["↑", -1, "Monter"], ["↓", 1, "Descendre"]].forEach(([t, d, a]) => {
      const j = k + d;
      const bt = el("button", { type: "button", class: "arrow", text: t, "aria-label": a + " " + title });
      bt.disabled = j < 0 || j >= tiles.length;
      bt.addEventListener("click", () => {
        const ids = tiles.map(f => f.i); [ids[k], ids[j]] = [ids[j], ids[k]];
        if (same(ids, c.folders.map(f => f.i))) delete state.to[c.id]; else state.to[c.id] = ids;
        drawTiles(c, list, head, { i, a }); update();
      });
      li.append(bt);
    });
    list.append(li);
  });
  // La flèche suit la tuile déplacée (l'autre flèche quand elle arrive au bout).
  if (moved) {
    const arrows = [...list.querySelectorAll('li[data-i="' + moved.i + '"] .arrow')];
    const again = arrows.find(b => b.getAttribute("aria-label").startsWith(moved.a) && !b.disabled) || arrows.find(b => !b.disabled);
    if (again) again.focus();
  }
}
function renderAll() {
  $("name").value = state.n;
  $("ai-key").value = state.k || ""; aiKeyHint();
  resetOrder(); renderRows();
  seg($("regions"), D.regions.map(r => r.name), D.regions.findIndex(r => r.id === state.g), (i) => { state.g = D.regions[i].id; renderAll(); });
  ["providers", "disc-movie", "disc-series", "seasons", "excl"].forEach(id => { $(id).textContent = ""; });
  D.providers.forEach(p => chip($("providers"), "prov-" + p.id, p.name, state.p.includes(p.id), on => togglePlateforme(p.id, on), p.color));
  renderPlateformes();
  D.discover.forEach(d => chip($(d.type === "series" ? "disc-series" : "disc-movie"), "disc-" + d.id, d.name, state.d.includes(d.id), on => toggle("d", d.id, on, D.discover.map(x => x.id))));
  D.seasons.forEach(([k, label]) => chip($("seasons"), "season-" + k, label, state.h.includes(k), on => toggle("h", k, on, D.seasons.map(s => s[0]))));
  // Téléréalité : déjà masquée partout, sauf dans les rangées sur mesure qui la choisissent.
  D.genres.filter(([name]) => name !== "Téléréalité").forEach(([name]) => chip($("excl"), "excl-" + name, name, state.e.includes(name), on => toggle("e", name, on, D.genres.map(g => g[0]))));
  $("g-vote").value = state.m; $("g-vote-out").textContent = fmtVote(state.m); paintRange($("g-vote"));
  $("g-year").value = String(state.a); $("g-family").checked = state.f;
  $("g-unreleased").checked = !state.u;
  $("g-coll-accueil").checked = state.ca;
  renderCollections();
  update();
}

// listes déroulantes fixes
D.languages.forEach(([code, label]) => $("b-lang").append(el("option", { value: code, text: label })));
[0, 1960, 1970, 1980, 1990, 2000, 2010, 2015, 2020].forEach(y => $("g-year").append(el("option", { value: String(y), text: y ? String(y) : "Aucune limite" })));
$("g-vote").addEventListener("input", () => { state.m = Number($("g-vote").value); $("g-vote-out").textContent = fmtVote(state.m); update(); });
$("g-year").addEventListener("change", () => { state.a = Number($("g-year").value); update(); });
$("g-family").addEventListener("change", () => { state.f = $("g-family").checked; update(); });
$("g-unreleased").addEventListener("change", () => { state.u = !$("g-unreleased").checked; update(); });
$("g-coll-accueil").addEventListener("change", () => { state.ca = $("g-coll-accueil").checked; update(); });

function copy(btn, node, label) {
  const ok = () => {
    btn.textContent = "Copié ✓"; setTimeout(() => btn.textContent = label, 1500); effet("popcorn", btn); bruit("punch"); effet("bravo");
    const t = $("ticket"); t.classList.remove("torn"); void t.offsetWidth; t.classList.add("torn"); setTimeout(() => t.classList.remove("torn"), 1700);
  };
  const fallback = () => { const r = document.createRange(); r.selectNodeContents(node); const s = getSelection(); s.removeAllRanges(); s.addRange(r); btn.textContent = "Sélectionné"; setTimeout(() => btn.textContent = label, 1500); };
  try { navigator.clipboard.writeText(node.textContent).then(ok, fallback); } catch (e) { fallback(); }
}
$("copy-manifest").addEventListener("click", e => copy(e.currentTarget, $("u-manifest"), "Copier"));
$("copy-collections").addEventListener("click", e => copy(e.currentTarget, $("u-collections"), "Copier"));
// Nuvio importe aussi les collections en collant leur contenu (le JSON) : sur PC, c'est la seule façon. Le
// texte est demandé pendant le clic (ClipboardItem) : le navigateur garde l'autorisation de copier.
$("copy-collections-contenu").addEventListener("click", (e) => {
  const btn = e.currentTarget, url = $("u-collections").textContent.trim(), zone = $("contenu-collections");
  const texte = fetch(url).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); });
  let ecrit;
  try {
    ecrit = window.ClipboardItem
      ? navigator.clipboard.write([new ClipboardItem({ "text/plain": texte.then((t) => new Blob([t], { type: "text/plain" })) })])
      : texte.then((t) => navigator.clipboard.writeText(t));
  } catch (err) { ecrit = Promise.reject(err); }
  ecrit.then(() => { zone.hidden = true; btn.textContent = "Contenu copié ✓"; setTimeout(() => btn.textContent = "Copier le contenu (PC/TEL)", 1500); effet("popcorn", btn); }, () => texte.then((t) => {
    // Copie bloquée : le contenu s'affiche dans le billet, sélectionné, prêt à copier à la main.
    zone.value = t; zone.hidden = false; zone.focus(); zone.select();
    effet("toast", "Copie bloquée par le navigateur : le contenu est affiché et sélectionné, copie-le (appui long → Copier, ou Ctrl+C).", true);
  }, () => {
    window.open(url, "_blank", "noopener");
    effet("toast", "Contenu introuvable : le lien s'ouvre dans un onglet, sélectionne tout et copie.", true);
  }));
});
$("dock-copy").addEventListener("click", e => copy(e.currentTarget, $("u-manifest"), "Copier mon lien"));
$("dock-billet").addEventListener("click", () => $("ticket").scrollIntoView({ behavior: glisse(), block: "start" }));
// Le billet est à l'écran : la barre du bas ferait doublon (et cacherait ses boutons).
if ("IntersectionObserver" in window) new IntersectionObserver(([e]) => document.querySelector(".dock").classList.toggle("cache", e.isIntersecting), { threshold: .15 }).observe($("ticket"));
$("name").addEventListener("input", update);
// Clé Gemini : nettoyée à la saisie ; l'indication dit si elle a la forme d'une clé.
function aiKeyHint() {
  const k = state.k || "";
  const cleOk = /^[A-Za-z0-9._~+/=:-]{20,200}$/.test(k);
  $("ai-key-hint").textContent = !k ? "" : cleOk ? "Clé reconnue ✓" : "Ça ne ressemble pas à une clé Gemini : recopie-la depuis Google AI Studio (elle commence par AIza).";
  $("ai-key-hint").classList.toggle("alerte", !!k && !cleOk);
}
$("ai-key").addEventListener("input", () => { state.k = $("ai-key").value.trim(); cleGarde(state.k); aiKeyHint(); update(); });
// La clé Gemini est gardée sur cet appareil : l'adresse de la page ne la porte plus (voir update).
const CLE_GEMINI = "cle-gemini";
function cleGarde(k) { try { if (k) localStorage.setItem(CLE_GEMINI, k); else localStorage.removeItem(CLE_GEMINI); } catch (e) {} }
function cleLue() { try { return localStorage.getItem(CLE_GEMINI) || ""; } catch (e) { return ""; } }
$("ai-key").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } });
$("ai-key-eye").addEventListener("click", (e) => {
  const show = $("ai-key").classList.toggle("masque") === false;
  e.currentTarget.setAttribute("aria-pressed", String(show));
  e.currentTarget.setAttribute("aria-label", show ? "Masquer la clé" : "Afficher la clé");
});
// « OK » du clavier : on referme le clavier au lieu de rester dans le champ.
$("name").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } });
// « Revenir à la programmation d'origine » : tout revient par défaut sauf la clé Gemini et le jeton d'alerte.
// « Annuler » pendant 10 secondes remet tout comme avant (rangées sur mesure, noms, ordre) ; un lien fixe
// reçoit alors de nouveau l'ancien réglage.
let annuleT = 0, annuleRetour = null;
function annuleFin() {
  clearTimeout(annuleT); annuleT = 0;
  if (document.activeElement === $("annule-btn")) (annuleRetour || $("reset")).focus();
  $("annule").hidden = true;
}
/**
 * Toute la programmation vient d'être remplacée (remise d'origine, guichet, soirée à deux) : « Annuler » pendant
 * 10 secondes remet l'état d'avant (avant, ordreAvant) ; retour : où rendre le focus ensuite.
 */
function proposeAnnuler(texte, avant, ordreAvant, retour) {
  annuleRetour = retour || null;
  $("annule-txt").textContent = texte;
  $("annule").hidden = false;
  $("annule-btn").onclick = () => {
    annuleFin();
    Object.assign(state, avant); renderAll();
    order = ordreAvant; renderRows();
    (retour && retour.isConnected ? retour : $("reset")).focus();
    effet("toast", "Tes réglages sont revenus.");
  };
  clearTimeout(annuleT); annuleT = setTimeout(annuleFin, 10000);
}
$("reset").addEventListener("click", () => {
  const avant = clone(state), ordreAvant = [...order];
  Object.assign(state, clone(D.defaults), { k: state.k, al: state.al });
  $("builder").hidden = true; renderAll();
  proposeAnnuler("Programmation d'origine remise.", avant, ordreAvant);
});

// ---------- lien fixe (voir fixe.js) : les réglages gardés par le site, le lien ne change plus ----------
// La clé pour modifier reste dans ce navigateur (une par lien) ; le « lien pour modifier » l'emporte ailleurs.
function fixesLus() { try { return JSON.parse(localStorage.getItem("liens-fixes") || "{}") || {}; } catch (e) { return {}; } }
function fixeGarde(id, modif) { try { const f = fixesLus(); f[id] = modif; localStorage.setItem("liens-fixes", JSON.stringify(f)); } catch (e) {} }
function lienModif() { return D.origin + "/" + fixe.id + "/configure#modif=" + fixe.modif; }
// Une erreur du lien fixe ne reste pas cachée dans les liens repliés.
function fixeErreur(msg) { $("fixe-err").textContent = msg || ""; if (msg) $("a-la-main").open = true; }
let saveT = 0, envoi = Promise.resolve(), etatFixe = "", envoiN = 0, partiN = 0, directN = 0;
// Réglage pas encore confirmé par le serveur, gardé dans l'onglet : rafraîchie juste après un changement,
// la page est redemandée avant que l'envoi (pagehide) n'arrive, et montrerait l'ancien réglage.
const attenteCle = () => "fixe-attente:" + fixe.id;
function attenteLue() { try { return sessionStorage.getItem(attenteCle()); } catch (e) { return null; } }
let demarre = false; // pendant le premier affichage, le réglage gardé attend d'être relu (fin du script)
function attenteGarde(seg) { if (!demarre) return; try { seg === null ? sessionStorage.removeItem(attenteCle()) : sessionStorage.setItem(attenteCle(), seg); } catch (e) {} }
function planifie(seg) {
  clearTimeout(saveT); saveT = 0;
  // Clé Gemini et jeton d'alerte pas encore relus : rien n'est enregistré ni gardé (ils manqueraient).
  if (!secretsLus) { if (seg !== dernierEnvoye) etatFixe = "attente"; lireSecrets(); return; }
  attenteGarde(seg);
  if (seg === dernierEnvoye) return;
  etatFixe = "attente";
  saveT = setTimeout(() => enregistre(seg), 1200);
}
function enregistre(seg) {
  clearTimeout(saveT); saveT = 0;
  if (!secretsLus) return;
  dernierEnvoye = seg; etatFixe = "envoi"; dessineFixe(seg);
  const id = fixe.id, modif = fixe.modif, n = ++envoiN;
  envoi = envoi.then(async () => {
    // Un réglage plus récent est déjà parti directement (page quittée) : celui-ci ne doit pas l'écraser.
    if (n <= directN) return;
    partiN = n;
    try {
      const r = await fetch(D.origin + "/lien-fixe/" + id, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ c: seg, modif }), keepalive: true });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Enregistrement impossible : réessaie dans un instant.");
      if (dernierEnvoye === seg) { etatFixe = "ok"; fixeErreur(""); }
      if (attenteLue() === seg) attenteGarde(null);
      if (recu && j.t) { recu.t = Math.max(recu.t, j.t); recuPlanifie(true); }
    } catch (err) {
      if (dernierEnvoye === seg) { dernierEnvoye = null; etatFixe = ""; fixeErreur((err && err.message && !/fetch|network/i.test(err.message) ? err.message : "Enregistrement impossible : vérifie ta connexion.") + " Tes changements seront renvoyés au prochain réglage."); }
    }
    dessineFixe(seg);
  });
}
// Page quittée juste après un réglage : le dernier part tout de suite, sans attendre la file des envois
// (la page fermée, ce qui attend dans la file ne partirait jamais). keepalive : l'envoi survit à l'onglet.
addEventListener("pagehide", () => {
  if (!fixe || !fixe.modif || !secretsLus) return;
  const c = compact(state), seg = Object.keys(c).length ? enc(c) : "";
  // Rien en attente, rien dans la file, dernier réglage déjà parti (ou en route, keepalive) : rien à faire.
  if (!saveT && envoiN === partiN && seg === dernierEnvoye) return;
  clearTimeout(saveT); saveT = 0;
  dernierEnvoye = seg; directN = envoiN;
  try {
    fetch(D.origin + "/lien-fixe/" + fixe.id, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ c: seg, modif: fixe.modif }), keepalive: true })
      .then((r) => { if (r.ok && dernierEnvoye === seg) { etatFixe = "ok"; dessineFixe(seg); } }, () => {});
  } catch (e) {}
});
function dessineFixe(seg) {
  const box = $("fixe");
  box.hidden = !D.fixedOk && !fixe;
  if (box.hidden) return;
  const txt = $("fixe-txt"), creer = $("fixe-creer"), autre = $("fixe-autre");
  txt.textContent = "";
  if (!fixe) {
    txt.append(el("b", { text: "Lien fixe : " }), "crée-le avant d'installer l'addon. Ensuite, plus besoin de réinstaller quand tu changes tes réglages.");
  } else if (fixe.modif) {
    const etat = { attente: "Changements en attente…", envoi: "Enregistrement…", ok: "Enregistré ✓" }[etatFixe] || "";
    txt.append(el("b", { text: "Lien fixe ✓ " }), "C'est le lien du dessus qu'on colle dans Nuvio, une seule fois. Ensuite tes changements s'enregistrent tout seuls : dans Nuvio, « Actualiser les addons » et c'est à jour. ");
    if (etat) txt.append(el("span", { class: "etat", text: etat }));
  } else if (seg === segDepart) {
    txt.append(el("b", { text: "Lien fixe. " }), "Pour le modifier, ouvre cette page sur l'appareil qui l'a créé, ou avec son « lien pour modifier ».");
  } else {
    txt.append(el("b", { text: "Ce navigateur ne peut pas modifier ce lien fixe : " }), "tes changements font un lien habituel, à réinstaller. Ou crée un nouveau lien fixe avec ces réglages.");
  }
  creer.hidden = !D.fixedOk || !!(fixe && (fixe.modif || seg === segDepart));
  autre.hidden = !(fixe && fixe.modif);
  dessineRecu();
}
// « Ta TV l'a reçu » : le site note quand Nuvio relit le manifest du lien fixe (vu, voir fixe.js) ; le billet compare
// avec le dernier enregistrement (t). Heures du site : decalage rattrape l'horloge de l'appareil. Relu doucement,
// seulement en attente, billet à l'écran et onglet visible ; sinon seul le texte « il y a … » avance, sans rien demander.
let recu = null, recuT = 0, recuLu = 0, recuVisible = false, recuEtat = "";
function recuNote(j) {
  if (j && typeof j.vu === "number") recu = { vu: j.vu, t: j.t || 0, decalage: (Number(j.maintenant) || Date.now()) - Date.now() };
}
function ilYa(ms) {
  const m = Math.floor(Math.max(0, ms) / 60000), h = Math.floor(m / 60), j = Math.floor(h / 24);
  return m < 1 ? "à l'instant" : m < 60 ? "il y a " + m + " min" : h < 24 ? "il y a " + h + " h" : "il y a " + j + " jour" + (j > 1 ? "s" : "");
}
function dessineRecu() {
  const p = $("fixe-recu");
  p.hidden = !(fixe && fixe.modif && recu);
  if (p.hidden) return;
  const maintenant = Date.now() + recu.decalage, enCours = etatFixe === "attente" || etatFixe === "envoi";
  const etat = !recu.vu ? "pas-encore" : enCours || recu.vu < recu.t ? "attente" : "ok";
  p.className = "recu " + etat; p.textContent = "";
  if (etat === "pas-encore") p.append(el("b", { text: "Pas encore reçu : " }), "Nuvio n'a pas encore lu ce lien. Colle-le dans Nuvio (Addons), ou fais « Actualiser les addons » s'il y est déjà.");
  else if (etat === "attente") p.append(el("b", { text: "En attente : " }), "dans Nuvio, fais « Actualiser les addons ». ", el("small", { text: "Dernière lecture par Nuvio " + ilYa(maintenant - recu.vu) + "." }));
  else p.append(el("b", { text: "Ta TV l'a reçu ✓ " }), "Nuvio a relu ta programmation " + ilYa(maintenant - recu.vu) + ".");
  // Le passage au ✓ est annoncé une fois (message de la salle, lu par les lecteurs d'écran), pas chaque minute.
  if (etat === "ok" && recuEtat && recuEtat !== "ok") effet("toast", "Ta TV a reçu ta programmation ✓");
  recuEtat = etat;
}
async function recuLire() {
  if (!fixe || !fixe.modif || Date.now() - recuLu < 15000) return;
  recuLu = Date.now();
  try {
    const r = await fetch(D.origin + "/lien-fixe/" + fixe.id + "/lire", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modif: fixe.modif }) });
    if (r.ok) recuNote(await r.json());
  } catch (e) {}
}
/** En attente : relu toutes les 20 s pendant 10 min après l'enregistrement, puis toutes les 2 min jusqu'à 1 h. */
function recuPlanifie(tout) {
  clearTimeout(recuT); recuT = 0;
  if (tout) dessineRecu();
  if (!fixe || !fixe.modif || !recu || !recuVisible || document.visibilityState !== "visible") return;
  const attente = recu.vu < recu.t, age = Date.now() + recu.decalage - recu.t;
  const delai = !attente ? 60000 : age < 600000 ? 20000 : age < 3600000 ? 120000 : 0;
  if (delai) recuT = setTimeout(async () => { if (attente) await recuLire(); recuPlanifie(true); }, delai);
}
// Billet revenu à l'écran, onglet repris (souvent : on revient de la TV) : relu tout de suite s'il attend encore.
function recuReveil() {
  if (recuVisible && document.visibilityState === "visible" && recu && recu.vu < recu.t) recuLire().then(() => recuPlanifie(true));
  else recuPlanifie(true);
}
if ("IntersectionObserver" in window) new IntersectionObserver(([e]) => { recuVisible = e.isIntersecting; recuReveil(); }).observe($("fixe"));
document.addEventListener("visibilitychange", recuReveil);

let fixe = D.fixed ? { id: D.fixed, modif: "" } : null;
let segDepart = null, dernierEnvoye = null, etatDepart = null;
if (fixe) {
  const m = /modif=([0-9A-Za-z]{22})/.exec(hashDepart);
  if (m) fixeGarde(fixe.id, m[1]);
  fixe.modif = fixesLus()[fixe.id] || "";
}
// La page d'un lien fixe n'a ni sa clé Gemini ni son jeton d'alerte (quiconque a le lien la voit) : avec la clé
// de modification, on les redemande au site. Jusque-là, rien n'est enregistré : un réglage envoyé sans eux les
// effacerait du lien. Clé refusée : ce navigateur ne peut plus modifier le lien. Pas de réponse : on réessaie
// au prochain réglage, et le message le dit.
let secretsLus = !(fixe && fixe.modif), secretsEnCours = null;
function lireSecrets() {
  if (secretsLus || secretsEnCours) return secretsEnCours;
  const id = fixe.id, modif = fixe.modif;
  secretsEnCours = (async () => {
    try {
      const r = await fetch(D.origin + "/lien-fixe/" + id + "/lire", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modif }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 403 || r.status === 404) {
        fixe.modif = ""; secretsLus = true; etatFixe = ""; demarre = true;
        fixeErreur("Ce navigateur n'a plus la clé pour modifier ce lien fixe.");
        update(); return;
      }
      if (!r.ok) throw new Error(j.error || "");
      recuNote(j);
      // Ce que le site a enregistré : les réglages du début de la page, avec la clé et le jeton.
      const depart = compact({ ...(etatDepart || state), k: j.k || "", al: j.al || "" });
      segDepart = dernierEnvoye = Object.keys(depart).length ? enc(depart) : "";
      // Tapés pendant la lecture : on garde ceux de l'utilisateur.
      if (!state.k) state.k = j.k || "";
      if (!state.al) state.al = j.al || "";
      if (state.k) cleGarde(state.k);
      $("ai-key").value = state.k; aiKeyHint();
      if (typeof hoteRender === "function" && hote) hoteRender();
      secretsLus = true; etatFixe = ""; fixeErreur("");
      state.n = $("name").value.trim() || D.defaults.n;
      const c = compact(state);
      // Rien changé pendant la lecture : on reprend le réglage resté en route (page rechargée trop tôt).
      // Sinon, ce qui vient d'être réglé l'emporte et part maintenant.
      if ((Object.keys(c).length ? enc(c) : "") === segDepart) { repriseAttente(); dessineFixe(segDepart); }
      else { demarre = true; update(); }
      recuPlanifie();
    } catch (err) {
      fixeErreur("Ton lien fixe ne répond pas pour le moment : tes changements seront enregistrés dès qu'il répondra (vérifie ta connexion).");
      dessineFixe(segDepart);
    } finally { secretsEnCours = null; }
  })();
  return secretsEnCours;
}
$("fixe-creer").addEventListener("click", async (e) => {
  const btn = e.currentTarget, label = btn.textContent;
  const c = compact(state), seg = Object.keys(c).length ? enc(c) : "";
  btn.disabled = true; btn.textContent = "Création…"; fixeErreur("");
  try {
    const r = await fetch(D.origin + "/lien-fixe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ c: seg }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id) throw new Error(j.error || "Création impossible : réessaie dans un instant.");
    fixeGarde(j.id, j.modif);
    fixe = { id: j.id, modif: j.modif }; segDepart = dernierEnvoye = seg; etatFixe = "ok";
    recu = { vu: 0, t: Date.now(), decalage: 0 };   // tout neuf : Nuvio ne l'a pas encore lu
    update(); effet("popcorn", btn); bruit("punch"); recuPlanifie();
    effet("toast", "Ton lien fixe est prêt : installe-le une fois, ensuite « Actualiser les addons » dans Nuvio suffit.");
  } catch (err) {
    fixeErreur(err && err.message && !/fetch|network/i.test(err.message) ? err.message : "Création impossible : vérifie ta connexion.");
  }
  btn.disabled = false; btn.textContent = label;
});
$("fixe-modif").addEventListener("click", async (e) => {
  const btn = e.currentTarget, label = btn.textContent;
  try { await navigator.clipboard.writeText(lienModif()); btn.textContent = "Copié ✓"; effet("toast", "Lien de modification copié : ouvre-le dans le navigateur de l'autre appareil. Dans Nuvio, c'est toujours le lien du billet."); }
  catch (err) { effet("toast", "Copie impossible : ouvre cette page sur l'autre appareil avec le QR code « Continuer sur le téléphone ».", true); }
  setTimeout(() => { btn.textContent = label; }, 2200);
});

// ---------- billet : séance, QR code, partage, reflet ----------
{
  const now = new Date();
  $("t-seance").textContent = "Séance du " + now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) + " à " + now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
// QR codes : chargerQr et qrSvg viennent d'outils.js.
function drawQr() {
  const box = $("qr-code");
  chargerQr().then((qrcode) => {
    // Pour ses propres appareils : la clé Gemini voyage avec (le billet offert et l'image, eux, ne l'ont jamais).
    box.className = "";
    box.innerHTML = qrSvg(qrcode, fixe && fixe.modif ? lienModif() : configureUrl, "QR code de ta programmation", true);
  }, () => { box.className = "alerte"; box.setAttribute("role", "alert"); box.textContent = "QR code indisponible : vérifie ta connexion."; });
}
$("qr-btn").addEventListener("click", () => {
  const open = $("qr").hidden;
  $("qr").hidden = !open; $("qr-btn").setAttribute("aria-expanded", String(open));
  if (open) drawQr();
  bruit("click");
});
$("share-btn").addEventListener("click", async (e) => {
  const btn = e.currentTarget, label = btn.textContent;
  const data = { title: state.n + ", ma programmation Nuvio", text: "Ouvre ce lien pour avoir les mêmes rangées que moi dans Nuvio.", url: shareUrl };
  if (navigator.share) { try { await navigator.share(data); effet("popcorn", btn); } catch (err) {} return; }
  try { await navigator.clipboard.writeText(shareUrl); btn.textContent = "Lien copié ✓"; effet("popcorn", btn); } catch (err) { btn.textContent = "Copie impossible"; effet("toast", "Copie impossible : sélectionne le lien et copie-le à la main.", true); }
  setTimeout(() => { btn.textContent = label; }, 1800);
});
// Le billet en image (1080 × 1350), à garder ou à envoyer.
function fitText(c, text, max) {
  if (c.measureText(text).width <= max) return text;
  while (text.length > 1 && c.measureText(text + "…").width > max) text = text.slice(0, -1);
  return text + "…";
}
function drawTicket(c, qr) {
  const W = 1080, H = 1350;
  c.fillStyle = "#170c12"; c.fillRect(0, 0, W, H);
  const glow = c.createRadialGradient(W / 2, -60, 40, W / 2, -60, 800); glow.addColorStop(0, "rgba(229,65,58,.35)"); glow.addColorStop(1, "rgba(229,65,58,0)");
  c.fillStyle = glow; c.fillRect(0, 0, W, H);
  c.fillStyle = "rgba(0,0,0,.18)"; for (let x = 0; x < W; x += 46) c.fillRect(x, 0, 2, H);
  // L'enseigne
  const sx = 120, sy = 60, sw = 840, sh = 190;
  c.fillStyle = "#22121b"; c.beginPath(); c.roundRect(sx, sy, sw, sh, 22); c.fill();
  c.strokeStyle = "#4a2a36"; c.lineWidth = 5; c.stroke();
  const pts = [], e = 22, nx = Math.round((sw - 2 * e) / 24), ny = Math.round((sh - 2 * e) / 24);
  for (let i = 0; i < nx; i++) pts.push([sx + e + i * (sw - 2 * e) / nx, sy + e]);
  for (let j = 0; j < ny; j++) pts.push([sx + sw - e, sy + e + j * (sh - 2 * e) / ny]);
  for (let i = 0; i < nx; i++) pts.push([sx + sw - e - i * (sw - 2 * e) / nx, sy + sh - e]);
  for (let j = 0; j < ny; j++) pts.push([sx + e, sy + sh - e - j * (sh - 2 * e) / ny]);
  pts.forEach(([x, y], k) => { c.fillStyle = k % 2 ? "#ffcf6b" : "#fff3cf"; c.shadowColor = "#ffcf6b"; c.shadowBlur = 12; c.beginPath(); c.arc(x, y, 6, 0, 6.283); c.fill(); });
  c.shadowBlur = 0; c.textAlign = "center";
  c.fillStyle = "#ffcf6b"; c.font = '700 24px "Figtree"'; c.fillText("NUVIO  ·  EN FRANÇAIS", W / 2, sy + 70);
  c.fillStyle = "#fff6e6"; c.shadowColor = "rgba(255,207,107,.7)"; c.shadowBlur = 24; c.font = '400 104px "Bebas Neue"'; c.fillText("MA PROGRAMMATION", W / 2, sy + 160); c.shadowBlur = 0;
  // Le billet
  const tx = 90, ty = 300, tw = 900, th = 960, stub = 150, cut = tx + tw - stub;
  c.fillStyle = "#f5ead8"; c.beginPath(); c.roundRect(tx, ty, tw, th, 26); c.fill();
  c.fillStyle = "#170c12"; [[cut, ty], [cut, ty + th]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 22, 0, 6.283); c.fill(); });
  c.strokeStyle = "rgba(42,26,20,.4)"; c.lineWidth = 3; c.setLineDash([12, 10]); c.beginPath(); c.moveTo(cut, ty + 34); c.lineTo(cut, ty + th - 34); c.stroke(); c.setLineDash([]);
  c.save(); c.translate(cut + stub / 2 + 16, ty + th / 2); c.rotate(-Math.PI / 2); c.fillStyle = "#e5413a"; c.font = '400 64px "Bebas Neue"'; c.fillText("ADMIS  ·  1 SALLE", 0, 0); c.restore();
  const L = tx + 50, R = cut - 40;
  c.textAlign = "left"; c.fillStyle = "#2a1a14";
  c.font = '400 86px "Bebas Neue"'; c.fillText(fitText(c, state.n.toUpperCase(), R - L - 200), L, ty + 110);
  c.textAlign = "right"; c.font = '700 28px "Courier Prime"'; c.fillText($("t-serial").textContent, R, ty + 104);
  c.fillRect(L, ty + 132, R - L, 4);
  c.textAlign = "left"; c.fillStyle = "#7a5a4c"; c.font = '700 26px "Courier Prime"'; c.fillText(fitText(c, $("t-seance").textContent, R - L), L, ty + 180);
  c.fillStyle = "#2a1a14"; c.font = '700 30px "Figtree"';
  c.fillText(state.r.length + " rangées   " + state.p.length + " plateformes   " + state.c.length + " collections", L, ty + 232);
  c.fillStyle = "#7a5a4c"; c.font = '800 22px "Figtree"'; c.fillText("AU PROGRAMME", L, ty + 292);
  const names = state.r.map((id) => { const r = rowInfo(id); return r ? (state.o[id] || r.now || r.name) : null; }).filter(Boolean);
  c.fillStyle = "#2a1a14"; c.font = '600 30px "Figtree"';
  names.slice(0, 8).forEach((n, i) => c.fillText(fitText(c, (i + 1) + ".  " + n, R - L), L, ty + 342 + i * 46));
  if (names.length > 8) { c.fillStyle = "#7a5a4c"; c.fillText("… et " + (names.length - 8) + " autres", L, ty + 342 + 8 * 46); }
  // QR code : la même programmation, en un scan
  const qy = ty + th - 250;
  if (qr) {
    const n = qr.getModuleCount(), size = 200, cell = size / (n + 4);
    c.fillStyle = "#fff"; c.fillRect(L, qy, size, size); c.fillStyle = "#2a1a14";
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) c.fillRect(L + (k + 2) * cell, qy + (r + 2) * cell, Math.ceil(cell), Math.ceil(cell));
  }
  c.fillStyle = "#2a1a14"; c.font = 'italic 400 38px "Instrument Serif"';
  const tl = qr ? L + 230 : L;
  ["Scanne-moi pour avoir", "la même programmation", "dans Nuvio."].forEach((line, i) => c.fillText(line, tl, qy + 70 + i * 46));
  c.textAlign = "center"; c.fillStyle = "#b9a59c"; c.font = 'italic 400 30px "Instrument Serif"';
  c.fillText("Une séance préparée sur " + D.origin.replace(/^https?:[/][/]/, ""), W / 2, H - 40);
}
async function imprimeBillet() {
  await Promise.all(['400 90px "Bebas Neue"', '700 28px "Courier Prime"', '700 30px "Figtree"', '800 22px "Figtree"', '600 30px "Figtree"', 'italic 400 38px "Instrument Serif"'].map((f) => document.fonts.load(f)));
  let qr = null;
  try { const qrcode = await chargerQr(); qr = qrcode(0, "M"); qr.addData(shareUrl); qr.make(); } catch (err) { qr = null; }
  const cv = document.createElement("canvas"); cv.width = 1080; cv.height = 1350;
  drawTicket(cv.getContext("2d"), qr);
  return new Promise((ok, ko) => cv.toBlob((b) => b ? ok(b) : ko(new Error("image vide")), "image/png"));
}
// L'image est préparée à l'avance (billet à l'écran, doigt sur le bouton) : au clic, le partage part tout de
// suite. Sur iPhone, un partage lancé après une attente n'est plus lié au geste, et le navigateur le refuse.
let billetImg = null; // { cle, p, blob } : l'image des réglages en cours
const billetCle = () => shareUrl + "|" + $("t-serial").textContent + "|" + $("t-seance").textContent;
function prepareBillet() {
  const cle = billetCle();
  if (billetImg && billetImg.cle === cle) return billetImg.p;
  const b = { cle, blob: null };
  b.p = imprimeBillet().then((blob) => { b.blob = blob; return blob; });
  b.p.catch(() => { if (billetImg === b) billetImg = null; });
  billetImg = b;
  return b.p;
}
const auDoigt = () => matchMedia("(pointer: coarse)").matches;
["pointerdown", "focus"].forEach((t) => $("img-btn").addEventListener(t, () => { if (auDoigt()) prepareBillet().catch(() => {}); }));
if (auDoigt() && "IntersectionObserver" in window) new IntersectionObserver(([e]) => { if (e.isIntersecting) prepareBillet().catch(() => {}); }, { threshold: .5 }).observe($("img-btn"));
function telechargeBillet(blob) {
  const a = el("a", { href: URL.createObjectURL(blob), download: "billet-nuvio.png" }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
$("img-btn").addEventListener("click", async (e) => {
  const btn = e.currentTarget, label = btn.dataset.label || (btn.dataset.label = btn.textContent);
  const pret = billetImg && billetImg.cle === billetCle() ? billetImg.blob : null;
  btn.textContent = "Impression du billet…"; btn.disabled = true;
  let fin = "Billet imprimé ✓";
  try {
    const blob = pret || await prepareBillet();
    const file = new File([blob], "billet-nuvio.png", { type: "image/png" });
    let partage = false;
    if (auDoigt() && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: state.n }); partage = true; }
      catch (err) {
        // Feuille de partage refermée : rien à faire. Partage refusé (geste perdu, appli) : on télécharge.
        if (err && err.name === "AbortError") { partage = true; fin = label; }
      }
    }
    if (!partage) telechargeBillet(blob);
    if (fin !== label) { effet("popcorn", btn); bruit("punch"); }
  } catch (err) { fin = "Impression impossible"; effet("toast", "Impression du billet impossible : réessaie, ou fais une capture d'écran.", true); }
  btn.textContent = fin;
  btn.disabled = false;
  setTimeout(() => { btn.textContent = label; }, 2000);
});
const tk = $("ticket");
if (matchMedia("(hover: hover) and (pointer: fine)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  tk.addEventListener("pointermove", (e) => {
    const r = tk.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    tk.classList.add("tilting");
    tk.style.setProperty("--rx", ((.5 - y) * 7).toFixed(2) + "deg");
    tk.style.setProperty("--ry", ((x - .5) * 9).toFixed(2) + "deg");
    tk.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
  });
  tk.addEventListener("pointerleave", () => { tk.classList.remove("tilting"); tk.style.setProperty("--rx", "0deg"); tk.style.setProperty("--ry", "0deg"); });
}

// Clé Gemini : une adresse qui l'apporte encore (ancien lien, lien d'addon avec « configure ») la range sur
// cet appareil ; une adresse sans clé (page rechargée, lien « Salle 2 ») la reprend. Pas sur un lien fixe :
// ses réglages sont gardés par le site, y glisser la clé les changerait sans qu'on l'ait demandé.
if (!fixe) { if (state.k) cleGarde(state.k); else state.k = cleLue(); }
renderAll();
// Lien fixe : un réglage de cet onglet n'était pas encore arrivé quand la page a été redemandée. On le
// renvoie, puis on recharge une fois pour l'afficher (une seule : si le serveur le lit autrement, on s'arrête).
// Seulement une fois la clé Gemini relue (lireSecrets) : segDepart la contient alors, comme le réglage gardé.
function repriseAttente() {
  const attente = attenteLue();
  let deja = null; try { deja = sessionStorage.getItem("fixe-recharge"); } catch (e) {}
  demarre = true;
  if (attente === null || attente === segDepart || attente === deja) {
    attenteGarde(null); try { sessionStorage.removeItem("fixe-recharge"); } catch (e) {}
  } else {
    try { sessionStorage.setItem("fixe-recharge", attente); } catch (e) {}
    enregistre(attente);
    envoi.then(() => { if (etatFixe === "ok") location.reload(); });
  }
}
if (fixe && fixe.modif) lireSecrets();
else demarre = true;
// Rouverte toute seule depuis /configure (reprise) : on le dit, avec le moyen de repartir de zéro. Le message
// attend la fin du chargement : scene.js, qui l'affiche, vient après ce script.
try {
  if (sessionStorage.getItem("reprise") === location.pathname) {
    sessionStorage.removeItem("reprise");
    addEventListener("DOMContentLoaded", () => effet("toast", "Ta dernière programmation est rouverte. Pour repartir de zéro : « Revenir à la programmation d'origine »."));
  }
} catch (e) {}

// L'écran et le billet suivent le défilement. S'ils sont trop hauts ensemble pour la fenêtre,
// seul l'écran suit (toujours en entier) et le billet attend en bas de la colonne.
const asideEl = document.querySelector("aside"), ticketEl = $("ticket"), captionEl = asideEl.querySelector(".caption");
function placeAside() {
  if (matchMedia("(max-width: 960px)").matches) { asideEl.classList.remove("long"); asideEl.style.top = ""; return; }
  const besoin = stageEl.offsetHeight + captionEl.offsetHeight + ticketEl.offsetHeight + 44 + 36;
  const long = besoin > innerHeight;
  asideEl.classList.toggle("long", long);
  asideEl.style.top = long ? "" : Math.min(18, innerHeight - asideEl.offsetHeight - 18) + "px";
  asideEl.style.setProperty("--stage-top", Math.min(18, innerHeight - stageEl.offsetHeight - 18) + "px");
}
addEventListener("resize", placeAside);
const asideRO = new ResizeObserver(placeAside); [asideEl, stageEl, ticketEl].forEach((el) => asideRO.observe(el)); placeAside();

// Sommaire : un clic amène la section juste sous le sommaire (qui reste collé en haut),
// et la section en cours s'allume : la dernière dont le haut a passé le sommaire.
const navLinks = [...document.querySelectorAll(".nav a")];
const navBar = document.querySelector(".nav");
const sections = navLinks.map((a) => document.querySelector(a.getAttribute("href")));
let navLock = 0;
function lightNav(a) {
  navLinks.forEach((x) => x.classList.toggle("on", x === a));
  if (a) navBar.scrollTo({ left: a.offsetLeft - navBar.clientWidth / 2 + a.offsetWidth / 2, behavior: glisse() });
}
function navOffset() { return navBar.getBoundingClientRect().height + 24; }
navLinks.forEach((a, i) => a.addEventListener("click", (e) => {
  e.preventDefault();
  const y = sections[i].getBoundingClientRect().top + scrollY - navOffset();
  scrollTo({ top: Math.max(0, y), behavior: glisse() });
  lightNav(a); navLock = Date.now() + 1200;
  sections[i].setAttribute("tabindex", "-1"); sections[i].focus({ preventScroll: true });
}));
let navTick = false;
function spyNav() {
  navTick = false;
  if (Date.now() < navLock) return;
  const line = navOffset() + 40;
  // Sections masquées (dans le guide : #s-mode) ignorées, sinon leur lien invisible s'allumerait.
  const visible = (sec) => sec && sec.getClientRects().length > 0;
  let cur = 0;
  sections.forEach((sec, i) => { if (visible(sec) && sec.getBoundingClientRect().top <= line) cur = i; });
  if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) {
    for (let i = sections.length - 1; i >= 0; i--) if (visible(sections[i])) { cur = i; break; }
  }
  if (!navLinks[cur].classList.contains("on")) lightNav(navLinks[cur]);
}
addEventListener("scroll", () => { if (!navTick) { navTick = true; requestAnimationFrame(spyNav); } }, { passive: true });
spyNav();
{ const i = navLinks.findIndex((a) => a.getAttribute("href") === hashDepart); if (i >= 0) setTimeout(() => navLinks[i].click(), 500); }`;
