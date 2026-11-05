/**
 * Étape 9 du guide (« Les réglages conseillés ») : les écrans de paramètres de Nuvio TV rejoués en motion design,
 * d'après une vidéo du Fire TV de test. Un cadre de focus parcourt les réglages ligne par ligne, ouvre les sections
 * et change d'écran comme à la télécommande ; une bulle explique les réglages qui dépendent du matériel (« À adapter »)
 * ou qui méritent une explication (« Pourquoi »). Lecture auto quand l'étape est à l'écran, pause, pas à pas et chapitres.
 * Les valeurs sont celles du guide (pas celles de la vidéo quand elles diffèrent : Enrichissement TMDB notamment).
 */

import { esc } from "./outils-serveur.js";

// Icônes au trait (24 × 24), dessinées en currentColor.
const ICONS = {
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c.8-3.6 3.4-5.5 7-5.5s6.2 1.9 7 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.4 2.4 4 5.2",
  palette: "M12 3a9 9 0 1 0 0 18c1.2 0 1.6-1 1-2-.7-1.2.1-2.6 1.5-2.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3zM7.5 11.5v.01M10 7.5v.01M15 7.5v.01",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z",
  play: "M8 5v14l11-7z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  sync: "M20 7h-5M20 7V2M20 7a8 8 0 0 0-14.5 2M4 17h5M4 17v5M4 17a8 8 0 0 0 14.5-2",
  wrench: "M15 4a5 5 0 0 0-4.8 6.4L3 17.6V21h3.4l7.2-7.2A5 5 0 0 0 20 9l-3 1-2-2 1-3z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.01",
  home: "M3 11l9-7 9 7M5 10v10h14V10",
  rows: "M4 5h16M4 12h16M4 19h10",
  nav: "M4 5h4v14H4zM11 7h9M11 12h9M11 17h6",
  play2: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM10 8.5v7l5.5-3.5z",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  card: "M6 3h12v18H6z",
  depth: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  image: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6",
  doc: "M6 3h9l4 4v14H6zM9 12h7M9 16h7",
  list: "M8 6h12M8 12h12M8 18h12M4 6v.01M4 12v.01M4 18v.01",
  player: "M3 5h18v14H3zM10 9v6l5-3z",
  stream: "M4 12h4l3-7 3 14 3-7h3",
  next: "M5 6v12l8-6zM15 6v12M19 6v12",
  skip: "M4 6v12l8-6zM12 6v12l8-6z",
  layers: "M12 3L2 8l10 5 10-5zM2 13l10 5 10-5",
  audio: "M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11",
  cc: "M3 5h18v14H3zM10.5 10.2a2.5 2.5 0 1 0 0 3.6M17.5 10.2a2.5 2.5 0 1 0 0 3.6",
  screen: "M3 5h18v12H3zM8 21h8M12 17v4",
  wifi: "M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0M12 19.5v.01",
  p2p: "M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4",
  cloud: "M7 18a5 5 0 0 1-.6-10A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9zM12 11v5M9.5 13.5L12 16l2.5-2.5",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
  key: "M8 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h9M18 12v3M21 12v3",
  puzzle: "M5 7h4V5a2 2 0 1 1 4 0v2h4v4h-2a2 2 0 1 0 0 4h2v4H5z",
  server: "M4 4h16v6H4zM4 14h16v6H4zM8 7v.01M8 17v.01",
  plug: "M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4",
  ext: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  ring: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
};
// data-ico : l'aperçu de Nuvio (nuvio.js) remplace ces icônes au trait par celles de l'appli.
const ico = (name) => `<svg class="nv-ico" data-ico="${name}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
const CHEV = `<svg class="nv-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;

// ---------- Les briques d'un écran de paramètres ----------
// x = options communes : a (« À adapter », texte de la bulle), n (« Pourquoi »), icon, skip (le focus ne s'y arrête pas),
// enter (le focus entre dans l'écran de ce nom, comme TMDB dans Intégrations) ; pour la version texte seulement :
// texte (nom d'une brique qui n'en affiche pas), garde (valeur d'une section qu'on laisse fermée).
const bulle = (x = {}) => (x.a ? ` data-a="${esc(x.a)}"` : "") + (x.n ? ` data-n="${esc(x.n)}"` : "");
const focus = (x = {}) => (x.skip ? "" : " data-f") + (x.enter ? ` data-enter="${x.enter}"` : "") + bulle(x);
// La version texte de l'étape 9 (texteReglages) : pendant qu'elle se prépare, chaque brique note ce qu'elle
// affiche (réglage, valeur, bulle), retrouvé ensuite à partir de son HTML. Le reste du temps, rien n'est noté.
let TXT = null;
const note = (html, quoi) => { if (TXT) TXT.set(html, quoi()); return html; };
const notes = (htmls) => htmls.map((h) => TXT.get(h)).filter(Boolean);
const COULEURS = { "#fff": "blanc", "#000": "noir", "#d9d9d9": "gris clair" };
const txt = (l, s) => `<span class="nv-txt"><b>${esc(l)}</b>${s ? `<small>${esc(s)}</small>` : ""}</span>`;
const lead = (x = {}) => (x.icon ? ico(x.icon) : "");

// Interrupteur
const T = (l, s, on, x = {}) => note(`<div class="nv-row${x.dim ? " dim" : ""}"${focus(x)}>${lead(x)}${txt(l, s)}<i class="nv-tg${on ? " on" : ""}" role="img" aria-label="${on ? "activé" : "désactivé"}"></i></div>`, () => ({ l, v: on ? "activé" : "désactivé", x }));
// Valeur avec chevron
const V = (l, s, v, x = {}) => note(`<div class="nv-row"${focus(x)}>${lead(x)}${txt(l, s)}<span class="nv-val">${v ? esc(v) : ""}${CHEV}</span></div>`, () => ({ l, v, x }));
// Curseur
const SL = (l, s, v, pct, x = {}) => note(`<div class="nv-row nv-slider"${focus(x)}><span class="nv-sl-top">${txt(l, s)}<span class="nv-val">${esc(v)}</span></span><span class="nv-sl"><i>−</i><span class="nv-track"><span style="width:${pct}%"></span></span><i>+</i></span></div>`, () => ({ l, v, x }));
// Pastille de couleur
const COL = (l, s, color, x = {}) => note(`<div class="nv-row"${focus(x)}>${txt(l, s)}<i class="nv-dot" style="background:${color}"></i></div>`, () => ({ l, v: COULEURS[color] || color, x }));
// Rangée de puces, une sélectionnée
const CH = (l, opts, sel, x = {}) => note(`<div class="nv-chips"${focus({ skip: !x.a && !x.n, ...x })}><span>${esc(l)}</span><span class="nv-chip-row">${opts.map((o) => `<i${o === sel ? ' class="sel"' : ""}>${esc(o)}</i>`).join("")}</span></div>`, () => ({ l: l.replace(/ [(].*[)]$/, ""), v: sel, x }));
// Cartes à choisir (disposition de l'accueil, style de Continuer à regarder, style des paramètres)
const CARDS = (kind, opts, sel, x = {}) => note(`<div class="nv-cards nv-${kind}"${focus(x)}>${opts.map(([name, desc, n]) => `<span class="nv-card${name === sel ? " sel" : ""}">${n ? `<span class="nv-art">${"<i></i>".repeat(n)}</span>` : ""}<b>${esc(name)}</b>${desc ? `<small>${esc(desc)}</small>` : ""}</span>`).join("")}</div>`, () => ({ l: x.texte, v: sel, x }));
// Nuancier du thème de couleur
const SWATCHES = (list, sel, x = {}) => note(`<div class="nv-swatches"${focus(x)}>${list.map(([name, c]) => `<span class="nv-sw${name === sel ? " sel" : ""}"><i style="background:${c}"></i>${esc(name)}</span>`).join("")}</div>`, () => ({ v: sel, x }));
// « Apply to » : petits interrupteurs groupés
const APPLY = (list, x = {}) => note(`<div class="nv-apply"${focus({ skip: !x.a && !x.n, ...x })}><span>APPLY TO</span><span class="nv-chip-row">${list.map((o) => `<i>${esc(o)}<em class="nv-tg on"></em></i>`).join("")}</span></div>`, () => ({ l: "Apply to", v: "tout activé (" + list.join(", ") + ")", x }));
// Sous-titre de groupe, paragraphe, lien
const H = (l, s, warn) => `<p class="nv-h">${esc(l)}${s ? `<small${warn ? ' class="warn"' : ""}>${esc(s)}</small>` : ""}</p>`;
const P = (t) => `<p class="nv-p">${esc(t)}</p>`;
const URL = (t, x = {}) => note(`<div class="nv-url"${focus(x)}>${esc(t)}</div>`, () => ({ l: "Lien", v: t, x }));
// Section repliable : « Fermé › » puis « Ouvert ⌄ » quand le focus l'ouvre. keep = reste fermée.
const SEC = (l, s, icon, kids, x = {}) => note(`<div class="nv-secw"><div class="nv-row nv-sec"${focus(x)} data-sec${x.keep ? " data-keep" : ""}>${ico(icon)}${txt(l, s)}<span class="nv-val"><span class="nv-etat">Fermé</span>${CHEV}</span></div>${kids.length ? `<div class="nv-kids"><div class="nv-kin"><div class="nv-kbox">${kids.join("")}</div></div></div>` : ""}</div>`, () => ({ l, kids: notes(kids), x }));
// Groupe (boîte translucide), avec ou sans en-tête
const G = (h, s, items) => note(`<div class="nv-group">${h ? `<p class="nv-gh"><b>${esc(h)}</b>${s ? `<small>${esc(s)}</small>` : ""}</p>` : ""}${items.join("")}</div>`, () => ({ l: h, kids: notes(items), groupe: true }));

// ---------- Barre latérale ----------
const SIDE = [["Compte", "user"], ["Profils", "users"], ["Watch party", "users"], "sep", ["Apparence", "palette"], ["Disposition", "grid"], "sep",
  ["Contenu et déc…", "compass"], ["Lecture", "play"], "sep", ["Intégrations", "link"], ["Tracking", "sync"], ["Avancé", "wrench"], ["À propos", "info"]];
let sideN = 0;
const SIDE_HTML = SIDE.map((it) => it === "sep" ? `<li class="sep" aria-hidden="true"></li>` : `<li data-i="${sideN++}">${ico(it[1])}<span>${esc(it[0])}</span>${CHEV}</li>`).join("");
const sideIndex = (name) => SIDE.filter((it) => it !== "sep").findIndex((it) => it[0] === name);

// ---------- Les écrans, dans l'ordre de la visite ----------
const page = (id, chap, side, title, sub, body, parent) => ({ id, chap, side: sideIndex(side), title, sub, body: [].concat(body).join(""), parts: [].concat(body), parent });
const pageHTML = ({ id, chap, side, title, sub, body, parent }) =>
  `<div class="nv-page" data-page="${id}" data-chap="${esc(chap)}" data-side="${side}"${parent ? ` data-parent="${parent}"` : ""}>
  <div class="nv-head"><h4>${esc(title)}</h4><p>${esc(sub)}</p></div>
  <div class="nv-vp"><div class="nv-ct">${body}<i class="nv-ring" aria-hidden="true"></i></div></div>
</div>`;

// Le service d'affiches de Vercel (dossier affiches/) : ses relais servent encore à l'addon tant que le serveur des
// affiches n'est pas là (relaisUrl) ; ses anciennes adresses d'affiches renvoient vers les fichiers statiques.
export const AFFICHES_URL = "https://affiches-catalogue-fr.vercel.app";
/**
 * Les relais du service d'affiches (VF des sources, photo des tendances, AniList, aperçus de la régie) : le serveur des
 * affiches (secret RELAIS_URL, son adresse https) quand il est là, sinon le service de Vercel.
 */
export const relaisUrl = (env) => env.RELAIS_URL || env.AFFICHES_URL || AFFICHES_URL;
/**
 * Qui dessine les aperçus d'affiches des pages du site (/affiche/…) : le serveur des affiches (RELAIS_URL), sans passer
 * par l'addon : chaque aperçu relayé comptait une requête dans les 100 000 par jour du compte (le tiers des requêtes de
 * l'addon le 26 octobre 2026). Sans serveur (copies, essais en local), l'addon lui-même.
 */
export const apercusDe = (env, origin) => (/^https:\/\/[^/]+/.test(env.RELAIS_URL || "") ? env.RELAIS_URL.replace(/\/+$/, "") : origin);
// Version des aperçus d'affiches du site (/affiche/…, gardés un jour par le navigateur) : à changer quand le
// dessin change, pour qu'aucun aperçu dessiné par l'ancienne version ne ressorte du cache.
export const APERCU_V = "3";
// Version du logo (logo/addon.png) : Nuvio et Discord gardent les images en cache selon leur adresse, donc
// un nouveau logo n'apparaît que si son adresse change. À augmenter à chaque nouveau logo.
export const LOGO_V = 2;
// Le lien à coller dans Nuvio, Paramètres → Disposition → Custom Poster Source : les affiches maison en fichiers
// statiques (Worker « affiches » de Cloudflare), style « maison » ; un autre style tout prêt a son propre dossier.
export const AFFICHES_STATIQUES = "https://affiches.xnzxflix.workers.dev";
export const POSTER_URL = AFFICHES_STATIQUES + "/maison/{type}/{shape}/{id}.jpg";
// Les réglages de la régie (salle 2) et leur écriture dans ce lien : worker/lien-affiches.js.


const PAGES = (posterUrl) => [
  page("apparence", "Apparence", "Apparence", "Apparence", "Choisissez votre thème de couleur, votre police et votre langue", [
    G("Thème de couleur", "Choisissez la couleur d'accent utilisée dans toute l'application", [
      SWATCHES([["Custom", "#e7a6dc"], ["Blanc", "#f2f2f2"], ["Cramoisi", "#ee5b4b"], ["Océan", "#8fc6ff"], ["Violet", "#d560ff"], ["Émeraude", "#9ee35b"], ["Ambre", "#ffd84d"], ["Rose", "#ff74b8"]], "Cramoisi", { a: "Pure question de goût : la couleur d'accent de toute l'appli." }),
      T("Mode AMOLED", "Utiliser un noir pur pour les arrière-plans de l'application", true, { a: "Au choix. Active-le sur une TV OLED : noir pur, plus joli et moins de marquage." }),
      T("Surfaces noir pur", "Mettre aussi les cartes, panneaux et conteneurs en noir pur", false),
    ]),
    G("Style des paramètres", "Choisir comment les écrans de paramètres sont présentés", [
      CARDS("style", [["Par défaut", "Disposition standard avec des cartes"], ["Minimal", "Disposition simple et épurée"], ["Barre supérieure", "Onglets de navigation en haut"]], "Par défaut"),
    ]),
    G("Launcher Artwork", "Choose how Nuvio appears on your TV home screen", [
      V("App Icon & Banner", "Change app icon and banner", "Rose Gold", { a: "Au choix : l'icône et la bannière de Nuvio sur l'accueil du Fire TV. Rose Gold sur le Fire TV de test." }),
    ]),
    G("Ambient Mode", "Show artwork from your catalogs while the TV sits idle", [
      T("Ambient Mode", "Fill the screen with backdrops after a period with no remote input", true, { a: "Un économiseur d'écran avec les images des films. Sur une TV OLED, garde-le pour éviter le marquage." }),
      V("Start After", "How long to wait before Ambient Mode starts", "1 minute"),
      V("Catalogs", "Choose up to 3 catalogs to pull artwork from", "Same as hero"),
    ]),
    G("Police et langue", "Choisissez la police et la langue utilisées dans toute l'application", [
      V("Police de l'application", "Choisissez votre police préférée", "Inter"),
      V("Langue de l'application", "Remplacer la langue du système", "Français", { n: "« Par défaut (système) » suffit si ton appareil est en français. S'il est en anglais, choisis Français." }),
    ]),
  ]),

  page("disposition", "Disposition", "Disposition", "Paramètres de disposition", "Ajuster la disposition de l'accueil, la visibilité du contenu et le comportement des affiches", G(null, null, [
    SEC("Disposition de l'accueil", "Choisir la structure et la source hero.", "home", [
      CARDS("layout", [["Vue moderne", "", 5], ["Vue en grille", "", 15], ["Vue classique", "", 12]], "Vue moderne", { n: "Vue moderne : un grand carrousel en haut, les rangées en dessous." }),
      T("Arrière-plan en plein écran", "Étendre l'arrière-plan pour couvrir la totalité de l'écran.", false),
    ]),
    SEC("Contenu de l'accueil", "Contrôler ce qui apparaît sur l'accueil et la recherche.", "rows", [
      T("Afficher le type de catalogue", "Afficher le suffixe de type à côté du nom du catalogue (film/série).", false, { n: "Désactivé, les rangées de recherche s'appellent simplement « Films » et « Séries »." }),
      T("Masquer le contenu non sorti", "Masquer les films et séries qui ne sont pas encore sortis.", false),
      T("Overall Ratings", "Standard and TMDB ratings are shown.", true),
    ]),
    SEC("Sidebar & Navigation", "Sidebar style and where Discover appears.", "nav", [
      T("Barre latérale moderne", "Activer la navigation par barre latérale flottante.", true),
      T("Hide Floating Pill", "Hide the floating navigation indicator on the home screen.", true),
      T("Afficher Découvrir dans la recherche", "Afficher la section navigation quand la recherche est vide.", true),
      V("Emplacement de Découvrir", "", "Afficher dans le panneau latéral"),
    ]),
    SEC("Continuer à regarder", "Paramètres pour la section Continuer à regarder.", "play2", [
      T("Show Continue Watching", "Show the Continue Watching row on the home screen.", true),
      CARDS("cw", [["Card", "", 2], ["Wide", "", 1], ["Poster", "", 1]], "Card", { texte: "Style des cartes" }),
      T("Utiliser les miniatures d'épisodes dans Continuer à regarder", "Utilise les miniatures d'épisodes comme image par défaut. Quand désactivé, utilise l'image de fond.", true),
      T("Flouter les épisodes non vus dans Continuer à regarder", "Flouter les miniatures des épisodes suivants dans Continuer à regarder pour éviter les spoilers.", true, { n: "Anti-spoiler : les miniatures des épisodes pas encore vus restent floues." }),
      T("Suivant à partir de l'épisode le plus avancé", "Affiche l'épisode suivant à partir de l'épisode le plus avancé que vous avez regardé.", true),
      T("Afficher les épisodes à venir", "Inclut les épisodes à venir dans Continuer à regarder avant leur diffusion.", true),
      V("Ordre de tri", "Comment les éléments Continuer à regarder sont organisés", "Par défaut"),
    ]),
    SEC("Affiche sélectionnée", "Comportement avancé des cartes d'affiches sélectionnées.", "target", [
      T("Étendre l'affiche sélectionnée en arrière-plan", "Étendre l'affiche sélectionnée après un délai d'inactivité.", true),
      SL("Délai d'expansion de l'arrière-plan", "Temps d'attente avant d'étendre les cartes sélectionnées.", "3s", 30, { n: "La carte s'agrandit après 3 secondes sur la même affiche." }),
      T("Lecture auto de la bande-annonce", "Lire l'aperçu de la bande-annonce pour le contenu sélectionné si disponible.", true),
      T("Lire la bande-annonce en sourdine", "Couper le son de la bande-annonce pendant l'aperçu automatique.", false, { a: "Active « Lire en sourdine » si tu ne veux pas de son en naviguant." }),
      CH("Emplacement de la bande-annonce (moderne)", ["Carte étendue", "Média hero"], "Média hero"),
    ]),
    SEC("Carte d'affiche", "Ajuster la largeur et le rayon des coins des cartes.", "card", [
      CH("Largeur (Équilibré)", ["Compact", "Dense", "Standard", "Équilibré", "Confort", "Grand"], "Équilibré"),
      CH("Rayon des coins (Pilule)", ["Net", "Subtil", "Classique", "Arrondi", "Pilule"], "Pilule"),
      T("Affiches paysage", "Alterner entre les cartes portrait et paysage pour la vue moderne.", false, { a: "Active-le si tu préfères des cartes horizontales (16:9) au lieu des affiches verticales." }),
      T("Always Backdrop with Logo for Landscape Posters", "Ignore landscape poster from addon and use backdrop with clearlogo overlay instead.", false, { n: "Laisse-le désactivé : avec les affiches perso de l'étape 8, il casse l'affichage des cartes." }),
    ]),
    SEC("Card Depth Effect", "Edge light and sheen on image cards.", "depth", [
      T("Enable depth effect", "Adds a lit top edge and a soft sheen to image cards for a subtle sense of depth.", true, { n: "Un léger liseré lumineux sur les cartes." }),
      CH("Edge glow", ["Subtle", "Balanced", "Bold"], "Balanced"),
      CH("Top sheen", ["Off", "Soft", "Bright"], "Off"),
      APPLY(["Posters", "Continue Watching", "Episode cards", "Cast", "Trailers"]),
    ]),
    SEC("Custom Poster Source", "Use artwork from an external poster service.", "image", [
      P("Provide a poster URL pattern from an external service. If a placeholder has no value for a given title, the original poster is used instead."),
      URL(posterUrl, { n: "Le lien de l'étape 8 (ou le tien, réglé en salle 2). Le plus simple : « Configure via Phone », puis colle-le depuis ton téléphone." }),
      V("Configure via Phone", "✓ Custom poster source active", ""),
      APPLY(["Home", "Continue Watching", "Collections", "Library", "Search", "Details Screen", "TV Recommendations"], { n: "Laisse tout activé : les affiches se mettent à jour au fil de la navigation." }),
    ]),
    SEC("Page de détail", "Paramètres pour les écrans de détail et d'épisodes.", "doc", [
      H("EPISODES"),
      V("Episode Options Overlay", "Choose the appearance shown when holding an episode.", "Artwork"),
      T("Shuffle", "Shuffle episodes from any series. Turning this off pauses shuffle.", false),
      T("Flouter les épisodes non vus", "Flouter les miniatures d'épisodes jusqu'à ce qu'ils soient vus pour éviter les spoilers.", true),
      V("Episode Ratings", "Choose which episode ratings are visible.", "Show"),
      H("TRAILERS"),
      T("Lecture automatique des bandes-annonces", "Lire automatiquement les bandes-annonces sur l'écran de détail après une période d'inactivité", true),
      T("Play in Background", "Play the trailer in place of the backdrop while the page stays visible.", false),
      SL("Délai de la bande-annonce", "", "5s", 15),
      T("4K Trailers", "Play trailers above 1080p when available. Uses much more memory.", true, { a: "Désactive-le sur un Fire TV Stick Lite ou HD, ou un appareil avec 2 Go de mémoire ou moins : les bandes-annonces rament." }),
      T("Afficher le bouton bande-annonce", "Afficher le bouton bande-annonce sur la page de détail (uniquement quand une bande-annonce est disponible).", true),
      H("METADATA"),
      T("Préférer les métadonnées de l'addon externe", "Utiliser les métadonnées de l'addon externe au lieu de l'addon de catalogue.", true, { n: "Les fiches du Catalogue FR (en français, avec la date de dispo) passent avant celles de TMDB." }),
      T("Afficher la date de sortie complète", "Pour les films, afficher la date de sortie complète au lieu de l'année seulement.", true, { n: "Pour un film pas encore regardable, le carrousel affiche la date où il arrive chez toi, pas sa sortie au cinéma." }),
    ]),
    SEC("Flux", "Paramètres d'affichage des résultats de flux et des panneaux de source du lecteur.", "list", [
      H("STYLE FUSION"),
      T("Badges de taille", "Affiche les badges de taille de fichier dans les résultats de flux et les panneaux de source du lecteur.", true, { n: "La taille du fichier s'affiche à côté de chaque source." }),
      V("Position des badges", "", "En bas"),
      H("AFFICHAGE"),
      T("Logo de l'addon", "Affiche le logo et le nom de l'addon à côté des sources de streams.", true, { n: "Le logo de l'addon s'affiche à côté de chaque source." }),
    ]),
  ])),

  page("lecture", "Lecture", "Lecture", "Paramètres de lecture", "Configurer la lecture vidéo et les sous-titres", G(null, null, [
    SEC("Player", "Default player, internal engine and error fallback.", "player", [
      V("Default Player", "", "Interne"),
      V("Moteur interne", "", "ExoPlayer"),
      T("Changement auto du moteur en cas d'erreur au démarrage", "Si le démarrage du flux échoue, bascule automatiquement entre ExoPlayer et libmpv.", false),
    ]),
    SEC("Stream Selection", "How a stream is picked when you press play.", "stream", [
      V("Sélection automatique du flux", "", "Manuel (choisir le flux)", { n: "Tu choisis toi-même la source (VF, qualité) dans la liste." }),
      SL("Délai de sélection du flux", "Temps d'attente pour les addons avant la sélection.", "3s", 20),
      T("Preload Next Episode Sources", "Start searching for sources in the background before the next episode button appears.", false),
      T("Réutiliser le dernier lien", "Lire automatiquement votre dernier flux fonctionnel pour ce même film/épisode tant que le cache est valide", false),
    ]),
    SEC("Up Next", "Next episode autoplay and post-play suggestions.", "next", [
      T("Lecture automatique de l'épisode suivant", "Démarrer automatiquement l'épisode suivant quand l'invite apparaît.", false, { a: "Active-le si tu enchaînes les épisodes." }),
      V("Mode du seuil de l'épisode suivant", "", "Pourcentage"),
      SL("Pourcentage du seuil", "Solution de repli en l'absence de marqueur de fin.", "99%", 65),
      T("Préférer le groupe Binge (épisode suivant)", "Essayer d'abord le même profil de source (même addon/groupe de qualité).", true, { n: "L'épisode suivant reprend la même source que le précédent." }),
      T("Réutiliser le groupe Binge", "Mémoriser et réutiliser le dernier groupe Binge entre les sessions.", false),
      T("Post-play Recommendations", "Show recommendations near the end of movies and series.", true),
      SL("Movie Recommendation Timing", "Choose when movie recommendations appear.", "96%", 80),
    ]),
    SEC("Skip Segments", "Skip intros, recaps and credits.", "skip", [
      T("Passer l'intro", "Utiliser introdb.app pour détecter les intros et les récapitulatifs.", true, { n: "Un bouton « Passer » apparaît : c'est toi qui choisis. Les sauts automatiques restent désactivés." }),
      H("SAUT AUTOMATIQUE", "Choisissez les segments à passer automatiquement."),
      T("Intro / Générique de début", "Passer automatiquement les intros et les génériques d'anime.", false),
      T("Résumé", "Passer automatiquement les segments de résumé.", false),
      T("Outro / Générique de fin", "Passer automatiquement les outros et les génériques de fin d'anime.", false),
      T("End Credits", "Skip movie credits automatically, keeping post-credits scenes.", false),
    ]),
    SEC("Player Interface", "Overlays, clock and details shown during playback.", "layers", [
      T("Écran de chargement", "Afficher l'écran de chargement jusqu'à l'apparition de la première image vidéo.", true),
      T("Afficher l'état de chargement", "Afficher la progression étape par étape pendant l'initialisation du lecteur.", true),
      T("Superposition en pause", "Afficher les détails après 5 secondes de pause.", true),
      T("Horloge OSD", "Afficher l'heure actuelle et l'heure de fin lorsque les contrôles sont visibles.", true),
      T("Avertissements de contenu", "Afficher l'avertissement de contrôle parental au démarrage de la lecture.", true),
    ]),
    SEC("Audio", "Languages, decoding and audio output.", "audio", [
      P("Le passthrough audio (TrueHD, DTS, AC-3, etc.) est automatique. Lorsqu'il est connecté à un récepteur AV ou une barre de son compatible via HDMI, l'audio sans perte est envoyé tel quel sans décodage."),
      V("Langue audio préférée", "", "Langue de l'appareil", { n: "Donc le français si ton Fire TV est en français. Sinon, choisis Français." }),
      V("Langue préférée secondaire", "", "Non défini"),
      T("Passer les silences", "Passer les passages silencieux de l'audio pendant la lecture", false),
      T("Mémoriser le délai audio par appareil", "Enregistrer et restaurer le délai audio du lecteur pour la sortie audio actuelle", true),
      H("AUDIO AVANCÉ", "Ces paramètres peuvent causer des problèmes sur certains appareils. Ne modifiez que si vous savez ce que vous faites.", true),
      V("Priorité du décodeur", "", "Préférer les décodeurs de l'appareil"),
      T("Activer le downmix", "Uses the FFmpeg downmix path. Requires Prefer app decoders (FFmpeg).", false, { skip: true, dim: true }),
      T("Lecture tunnelisée", "Synchronisation audio/vidéo au niveau matériel. Peut améliorer la lecture sur certains appareils Android TV", true, { a: "Si l'image saccade ou si le son se décale, désactive-la." }),
      T("Forcer le transcodage AC-3 (optique/SPDIF)", "Transcode les formats multicanaux (TrueHD, DTS, AAC, etc.) en Dolby Digital 5.1 en temps réel.", true, { a: "Seulement si ta barre de son ou ton ampli est branché en optique (câble Toslink) ou ne décode pas DTS/TrueHD. En HDMI eARC avec une barre récente, ou avec les haut-parleurs de la TV, laisse-le désactivé." }),
    ]),
    SEC("Sous-titres", "Langue, style et mode de rendu.", "cc", [
      H("LANGUAGES"),
      V("Langue préférée", "", "Par défaut (système)", { n: "Choisis Français si ton appareil n'est pas en français." }),
      V("Langue préférée secondaire", "", "Non défini"),
      T("Auto Sync Subtitles", "Match the selected add-on subtitle to the timing of the subtitles embedded in the video.", false),
      T("Utiliser les sous-titres forcés", "Préférer les sous-titres forcés lorsque l'audio correspond à la langue des sous-titres", true, { n: "Affiche seulement les passages traduits (une langue étrangère dans un film en VF)." }),
      T("Afficher uniquement les langues préférées", "Masquer toutes les autres langues de sous-titres dans la liste de sélection", false),
      T("Strip SDH subtitles", "Hide sound descriptions and speaker labels from text subtitles", false),
      H("STYLE"),
      SL("Taille", "", "100%", 33),
      SL("Décalage vertical", "", "5%", 35),
      T("Gras", "Utiliser une police en gras pour les sous-titres", true),
      COL("Couleur du texte", "", "#fff"),
      COL("Couleur de fond", "", "#d9d9d9"),
      T("Contour", "Ajouter un contour autour du texte des sous-titres pour une meilleure visibilité", true),
      COL("Couleur du contour", "", "#000"),
      H("RENDU AVANCÉ DES SOUS-TITRES"),
      T("Utiliser libass pour les sous-titres ASS/SSA", "Expérimental : rendu ASS/SSA avancé (styles, positionnement, animations)", true, { n: "Les sous-titres stylés des animés s'affichent comme prévu." }),
      V("Mode de rendu libass", "", "Superposition OpenGL (recommandé)"),
    ]),
    SEC("Vidéo", "Frame rate matching, Dolby Vision and HDR.", "screen", [
      H("FRÉQUENCE D'IMAGES AUTOMATIQUE"),
      V("Frame Rate Matching", "", "Désactivé", { a: "Active-le si ta TV gère le changement de fréquence : mouvements plus fluides en 24 i/s. Sur Fire TV, active aussi Paramètres → Affichage et sons → Affichage → Faire correspondre la fréquence d'images d'origine." }),
      T("Adapter la résolution", "L'écran ne signale qu'une seule résolution ; l'adaptation peut ne pas avoir d'effet.", false),
      H("DOLBY VISION & HDR"),
      V("Gestion de Dolby Vision Profile 7", "", "Auto (recommandé)", { a: "Ne touche à rien ici, sauf en cas d'écran vert ou violet : voir l'encadré de l'étape 6." }),
      T("Préserver le mapping DV (DV7 vers DV8.1)", "Conserve le tone-mapping voulu par le créateur.", false),
      T("Convertir DV5 en DV8.1", "Signale les flux Profile 5 comme Profile 8.1 pour une sortie compatible HDR10.", false),
      T("Supprimer les métadonnées HDR10+", "Supprime les métadonnées dynamiques HDR10+ des flux.", false),
      T("True black bars", "Leave the bars around the picture unpainted so HDR stays true black.", false),
    ]),
    SEC("Mémoire tampon et réseau", "Quelle quantité de contenu garder en mémoire et comment récupérer les flux.", "wifi", [], { keep: true, garde: "rien à changer" }),
    SEC("Streaming P2P", "Autoriser les flux pair-à-pair (torrent)", "p2p", [
      T("Activer le P2P", "", false, { n: "Laisse-le désactivé : avec AllDebrid, Torrentio et les autres addons donnent des liens directs, le P2P ne sert à rien. Sans débrideur, tu partagerais les fichiers depuis ta propre adresse IP, visible de tous." }),
      T("Masquer les statistiques torrent", "Masquer la mémoire tampon, les seeders, les pairs et la vitesse de téléchargement", true),
      V("Torrent profile", "Recommended balance of startup speed and connection stability", "Balanced"),
      V("Torrent cache size", "Downloaded torrent data kept on this device for faster replays", "2 GB"),
    ]),
  ])),

  page("integrations", "Enrichissement TMDB", "Intégrations", "Intégrations", "Gérer les intégrations disponibles", G(null, null, [
    V("Debrid", "Sources de comptes cloud expérimentales", "", { icon: "cloud", skip: true }),
    V("TMDB", "Contrôles d'enrichissement des métadonnées", "", { icon: "image", enter: "tmdb" }),
    V("Notes MDBList", "Fournisseurs de notes externes", "", { icon: "star", skip: true }),
    V("Anime-Skip", "Horodatages pour passer les intros/outros d'animés", "", { icon: "skip", skip: true }),
  ])),

  page("tmdb", "Enrichissement TMDB", "Intégrations", "Enrichissement TMDB", "Choisir les champs de métadonnées provenant de TMDB", G(null, null, [
    T("Activer l'enrichissement TMDB", "Utiliser TMDB comme source de métadonnées pour enrichir les données de l'addon", true),
    T("Activer sur l'accueil moderne", "Appliquer également l'enrichissement TMDB aux hero et aux cartes sélectionnées de l'accueil moderne", true),
    T("Enrichir Continuer à regarder", "Appliquer l'enrichissement TMDB aux éléments de Continuer à regarder", true),
    V("Langue", "Langue des métadonnées TMDB pour le titre, le logo et les champs activés", "Français"),
    T("Illustrations", "Logo et images d'arrière-plan depuis TMDB", false, { n: "Désactivé : le Catalogue FR fournit déjà les fonds en pleine définition et les logos en français. Activé, Nuvio les remplace par des images TMDB plus petites (fonds flous dans le carrousel et le mode ambiant)." }),
    T("Informations de base", "Description, genres et note depuis TMDB", false, { n: "Désactivé pour voir quand arrivent les films à venir (« 📅 Dispo le 17 nov. » en tête du résumé). Activé, Nuvio prend le résumé de TMDB et la date disparaît." }),
    T("Détails", "Durée, date de sortie, pays et langue depuis TMDB", false, { n: "Désactivé pour garder « Entre deux saisons » sur une série dont la saison suivante n'est pas encore là. Activé, Nuvio met « En cours » à la place. La durée, le pays et la langue sont les mêmes des deux côtés." }),
    T("Crédits", "Casting avec photos, réalisateur et scénariste depuis TMDB", true),
    T("Productions", "Sociétés de production depuis TMDB", true),
    T("Chaînes", "Chaînes avec logos depuis TMDB", true),
    T("Épisodes", "Titres, résumés, miniatures et durée des épisodes depuis TMDB", true),
    T("Bandes-annonces", "Candidats de bandes-annonces depuis les vidéos TMDB pour la page de détail", false, { n: "Désactivé : sinon Nuvio prend les bandes-annonces de TMDB, souvent en anglais, à la place de celles du Catalogue FR (en VF dès qu'une VF existe)." }),
    T("Similaires", "Arrière-plans de recommandations TMDB sur la page de détail", true),
    T("Collections", "Collections de films par date de sortie TMDB", true),
  ]), "integrations"),

  page("avance", "Avancé", "Avancé", "Avancé", "Performance, navigation, cache et diagnostics", [
    G("Mode d'expérience", null, [
      V("Passer en mode essentiel", "Masquer les écrans de configuration avancée sans modifier les valeurs enregistrées.", "Avancé", { n: "Le mode Avancé affiche tous les réglages de ce guide." }),
    ]),
    G("Performance et navigation", null, [
      T("Navigation horizontale rapide", "Augmenter la vitesse de répétition du D-pad dans les rangées.", true),
      T("Défilement de la sélection Nuvio", "Utiliser l'animation et le positionnement globaux du défilement de sélection de Nuvio.", true),
      T("RGB565 image decoding", "Use lower-memory 16-bit color for eligible opaque images. Changing this restarts the app.", true, { a: "Économise la mémoire, mais fait des dégradés en escalier dans le grand carrousel. Garde-le sur Fire TV Stick Lite ou HD ; désactive-le sur un Fire TV Stick 4K / 4K Max, un Cube ou une TV récente." }),
    ]),
    G("Startup & exit", null, [
      T("Startup Splash", "Show logo and loading indicator after selecting a profile", true),
      T("Se souvenir du dernier profil", "Se souvenir du dernier profil sélectionné au démarrage", false),
      T("Full exit on close", "Fully terminate the app and free memory when exiting.", true),
    ]),
    G("Diagnostics", null, [
      T("Rapports de plantage Sentry", "Envoyer les rapports de plantage et d'ANR avec un contexte sûr.", true),
      T("Rapports de problèmes de lecture", "Affiche des boutons de signalement pendant la lecture, les chargements longs et les erreurs", true),
      T("Playback stats overlay", "Show a button in stream info to toggle live cpu, memory, buffer, bitrate and thermal readings", false),
    ]),
  ]),
];

// ---------- L'écran Paramètres de l'aperçu (nuvio.js) ----------
// Les écrans de la visite (valeurs du guide), plus les rubriques qu'elle ne montre pas, telles que Nuvio TV
// les affiche sans compte connecté. Textes repris de Nuvio TV (en anglais quand l'appli n'est pas traduite).
const PAGES_EN_PLUS = [
  page("compte", "", "Compte", "Compte", "Compte et état de la synchronisation", G(null, null, [
    P("Synchronisez votre bibliothèque, votre progression, vos addons et plugins entre vos appareils."),
    `<p class="nv-note">La synchronisation n’est pas en temps réel entre les appareils actifs. Redémarrez cet appareil après vous être connecté ou pour récupérer les modifications effectuées ailleurs.</p>`,
    `<div class="nv-row nv-bouton" data-f>${ico("key")}${txt("Connexion par code QR", "Scannez un code QR et complétez la connexion par e-mail sur votre téléphone")}</div>`,
  ])),
  page("profils", "", "Profils", "Profils", "Gérer les profils utilisateurs pour ce compte", G(null, null, [V("Gérer les profils", "", "")])),
  page("party", "", "Watch party", "Watch party", "Join friends with a party code", G(null, null, [
    V("Join a watch party", "Sign in to your Nuvio account to use watch parties.", "", { icon: "users" }),
  ])),
  page("contenu", "", "Contenu et déc…", "Contenu et découverte", "Addons, plugins, catalogues et sources de découverte", G(null, null, [
    V("Addons", "Gérer les addons, l’ordre des catalogues et les collections", "", { icon: "puzzle" }),
    V("Media servers", "Connect Jellyfin or Emby to browse and play your own library.", "", { icon: "server" }),
    V("Plugins", "Gérer les dépôts et les fournisseurs de flux", "", { icon: "plug" }),
  ])),
  page("tracking", "", "Tracking", "Tracking", "Connect tracking providers and choose which one powers your Library and Continue Watching.", [
    G("Accounts", "Connect and manage tracking services", [
      V("Trakt", "Synchronisez votre liste de suivi, votre progression, vos visionnages en cours, vos scrobbles et vos listes personnelles avec Trakt.", "Not connected", { icon: "ring" }).replace('data-ico="ring"', 'data-ico="trakt"'),
      V("Simkl", "Connect Simkl to sync lists, watched history, playback progress, and scrobbles.", "Not connected", { icon: "ring" }).replace('data-ico="ring"', 'data-ico="simkl"'),
      V("MDBList", "Sync watched history and playback progress across devices", "Not connected", { icon: "ring" }).replace('data-ico="ring"', 'data-ico="mdblist"'),
    ]),
    G("Sources", "Choose where Nuvio reads your library and watch progress. Playback scrobbles to every connected service.", [
      V("Source de la bibliothèque", "Choisir quelle bibliothèque utiliser pour enregistrer et afficher votre collection", "Bibliothèque Nuvio"),
      V("Progression", "Choisir quelle source de progression alimente la reprise et Continuer à regarder", "Nuvio Sync"),
    ]),
  ].join("")),
  page("apropos", "", "À propos", "À propos", "Informations sur l’application, mises à jour et liens légaux", G(null, null, [
    `<div class="nv-about"></div>`,
    V("Update channel", "Choose the type of app updates to receive", "Beta"),
    T("Automatic update banner", "Show a banner when a new version is available", true),
    V("Vérifier les mises à jour", "Télécharger la dernière version", "").replace("nv-row", "nv-row nv-ext"),
    V("Politique de confidentialité", "Consulter notre politique de confidentialité", "").replace("nv-row", "nv-row nv-ext"),
    V("Support Nuvio", "Remerciements et crédits du projet", ""),
    V("Licences & attributions", "Sources de données, remerciements et licences Android", ""),
  ])),
];
const TESTS_RESEAU = G("Network tests", null, [V("Lancer le test de débit", "", ""), V("Lancer un test de débit du dernier flux lu", "", "")]);

/** Les rubriques de la barre de gauche (null = séparateur) et leurs écrans, dans l'ordre de Nuvio TV. */
export const parametresNuvio = (posterUrl) => {
  const pages = [...PAGES(posterUrl).map((p) => p.id === "avance" ? { ...p, body: p.body + TESTS_RESEAU } : p), ...PAGES_EN_PLUS];
  return {
    rubriques: SIDE.map((it) => it === "sep" ? null : [it[0] === "Contenu et déc…" ? "Contenu et découverte" : it[0], it[1]]),
    pages: pages.map(({ id, side, title, sub, body, parent }) => ({ id, side, title, sub, parent: parent || null, body })),
  };
};

const CHAPITRES = ["Apparence", "Disposition", "Lecture", "Enrichissement TMDB", "Avancé"];

// ---------- La version texte de l'étape 9 : les mêmes écrans, réglage par réglage, avec leurs bulles ----------
// Pour qui ne voit pas l'animation (lecteur d'écran, mouvement réduit) ou préfère une liste à recopier.
const ligneTexte = (e, enfants) => {
  const x = e.x || {};
  if (x.skip) return "";
  const sous = e.kids || (x.enter && enfants[x.enter]) || null;
  const liste = sous && sous.length ? `<ul>${sous.map((k) => ligneTexte(k, enfants)).join("")}</ul>` : "";
  if (e.groupe && !e.l) return sous.map((k) => ligneTexte(k, enfants)).join("");
  const v = e.v || x.garde || "";
  const t = x.a || x.n;
  return `<li>${e.l ? esc(e.l) + (v ? " : " : "") : ""}${v ? `<b>${esc(v)}</b>` : ""}${t ? ` <span class="nvt-${x.a ? "adapt" : "pourquoi"}">${x.a ? "À adapter" : "Pourquoi"}</span> ${esc(t)}` : ""}${liste}</li>`;
};
export const texteReglages = (posterUrl) => {
  TXT = new Map();
  try {
    const pages = PAGES(posterUrl).map((p) => ({ ...p, notes: notes(p.parts) }));
    const enfants = Object.fromEntries(pages.filter((p) => p.parent).map((p) => [p.id, p.notes]));
    const rubriques = SIDE.filter((it) => it !== "sep");
    return `<details class="nv-texte"><summary>Version texte : tous les réglages, écran par écran</summary>
  ${pages.filter((p) => !p.parent).map((p) => `<div class="nvt-ecran"><p class="nvt-titre">Paramètres → ${esc(rubriques[p.side][0])}</p><ul>${p.notes.map((e) => ligneTexte(e, enfants)).join("")}</ul></div>`).join("\n  ")}
</details>`;
  } finally { TXT = null; }
};

export const reglagesHTML = (posterUrl) => `<div class="nv" id="nv">
  <div class="nv-tv">
    <div class="nv-screen" tabindex="0" role="group" aria-roledescription="animation" aria-label="Les réglages de Nuvio, écran par écran. Flèches gauche et droite : réglage précédent ou suivant. Espace : pause.">
      <nav class="nv-side" aria-hidden="true"><ul>${SIDE_HTML}</ul></nav>
      <div class="nv-main">${PAGES(posterUrl).map(pageHTML).join("")}</div>
      <div class="nv-cap" aria-live="off"><span class="nv-tag"></span><span class="nv-ctxt"></span></div>
      <span class="nv-pause" aria-hidden="true">En pause</span>
    </div>
  </div>
  <div class="nv-bar">
    <button type="button" class="nv-pp" aria-label="Pause"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-pause" d="M7 5h3v14H7zM14 5h3v14h-3z"/><path class="i-play" d="M8 5v14l11-7z"/></svg></button>
    <div class="nv-chaps">${CHAPITRES.map((c) => `<button type="button" data-chap="${esc(c)}">${esc(c)}</button>`).join("")}</div>
    <button type="button" class="nv-step" data-dir="-1" aria-label="Réglage précédent"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
    <button type="button" class="nv-step" data-dir="1" aria-label="Réglage suivant"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
  </div>
  ${texteReglages(posterUrl)}
</div>`;

export const REGLAGES_CSS = `/* Étape 9 : les écrans de paramètres de Nuvio TV, rejoués comme à la télécommande. */
.nv { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; container-type: inline-size; }
.nv-tv { padding: 8px; border-radius: 18px; background: #050304; box-shadow: 0 0 0 2px #2b1820, 0 24px 60px rgba(0,0,0,.55); }
.nv-screen { position: relative; aspect-ratio: 16 / 9; border-radius: 10px; overflow: hidden; cursor: pointer; display: grid; grid-template-columns: 26% minmax(0, 1fr); gap: 18px; padding: 18px 18px 0 14px;
  font: 500 13px/1.3 Inter, var(--body); color: #fff; -webkit-font-smoothing: antialiased;
  background: radial-gradient(ellipse 90% 70% at 25% 0%, rgba(214,222,203,.5), transparent 70%), linear-gradient(172deg, #9ca593 0%, #858c7d 46%, #71675b 100%); }
.nv-screen:focus-visible { outline-offset: 6px; border-radius: 10px; }
.nv-ico { width: 15px; height: 15px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.nv-chev { width: 13px; height: 13px; flex: none; fill: none; stroke: currentColor; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }

/* Barre latérale : la rubrique choisie reste vers la 3e place, la liste glisse */
.nv-side { overflow: hidden; padding: 4px 4px 0; -webkit-mask: linear-gradient(transparent, #000 26px, #000 85%, transparent); mask: linear-gradient(transparent, #000 26px, #000 85%, transparent); }
.nv-side ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; transition: transform .5s cubic-bezier(.3,.7,.2,1); }
.nv-side li { display: flex; align-items: center; gap: 9px; padding: 9px 12px; border-radius: 99px; background: #141113; font-weight: 700; font-size: 12.5px; white-space: nowrap; box-shadow: 0 0 0 2px transparent; transition: background .25s, box-shadow .25s, opacity .25s; }
.nv-side li span { flex: 1; overflow: hidden; text-overflow: ellipsis; }
.nv-side li.sep { padding: 0; height: 1px; margin: 0 14px; background: rgba(255,255,255,.22); }
.nv-side li.sel { background: rgba(255,196,186,.32); box-shadow: 0 0 0 2px #ff8f84; }
.nv-side li.focus { background: rgba(255,170,158,.42); box-shadow: 0 0 0 2px #ff6a5c, 0 0 16px rgba(255,106,92,.55); }

/* Les écrans : en-tête fixe, contenu qui défile sous le focus */
.nv-main { position: relative; min-width: 0; }
.nv-page { position: absolute; inset: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); opacity: 0; visibility: hidden; transition: opacity .35s ease, visibility 0s .35s; }
.nv-page.on { opacity: 1; visibility: visible; transition: opacity .35s ease .1s, visibility 0s; }
.nv-head { padding: 0 2px 10px; }
.nv-head h4 { margin: 0; font: 600 19px/1.15 Inter, var(--body); letter-spacing: -.01em; }
.nv-head p { margin: 3px 0 0; font-size: 11.5px; color: rgba(255,255,255,.78); }
.nv-vp { position: relative; overflow: hidden; -webkit-mask: linear-gradient(transparent, #000 10px, #000 calc(100% - 26px), transparent); mask: linear-gradient(transparent, #000 10px, #000 calc(100% - 26px), transparent); }
.nv-ct { position: relative; display: grid; gap: 10px; padding: 6px 4px 240px; transition: transform .5s cubic-bezier(.3,.7,.2,1); }
.nv-group { display: grid; gap: 7px; padding: 10px; border-radius: 20px; background: linear-gradient(180deg, rgba(150,96,78,.42), rgba(122,74,60,.36)); border: 1px solid rgba(255,226,212,.3); }
.nv-gh { margin: 0 4px 2px; display: grid; }
.nv-gh b { font-weight: 600; font-size: 13px; }
.nv-gh small { font-size: 10.5px; color: rgba(255,255,255,.72); }

/* Une ligne de réglage : pilule sombre */
.nv-row { display: flex; align-items: center; gap: 11px; min-height: 44px; padding: 8px 16px; border-radius: 24px; background: #141113; }
.nv-txt { flex: 1; min-width: 0; display: grid; gap: 1px; }
.nv-txt b { font-weight: 700; font-size: 13px; }
.nv-txt small { font-size: 10.5px; color: rgba(255,255,255,.7); line-height: 1.3; }
.nv-val { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 12px; text-align: right; color: rgba(255,255,255,.95); flex: none; max-width: 48%; }
.nv-tg { position: relative; flex: none; width: 32px; height: 18px; border-radius: 99px; background: rgba(232,232,232,.86); transition: background .25s; }
.nv-tg::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.35); transition: left .25s; }
.nv-tg.on { background: #ee5a4b; } .nv-tg.on::after { left: 16px; }
.nv-row.dim { opacity: .55; } .nv-row.dim .nv-tg { background: rgba(120,120,120,.6); }
.nv-dot { flex: none; width: 18px; height: 18px; border-radius: 50%; box-shadow: 0 0 0 2px rgba(255,255,255,.85); }
.nv-slider { display: grid; gap: 6px; padding-block: 10px; }
.nv-sl-top { display: flex; align-items: center; gap: 10px; }
.nv-sl { display: flex; align-items: center; gap: 12px; font-weight: 700; }
.nv-sl i { font-style: normal; width: 12px; text-align: center; }
.nv-track { flex: 1; height: 7px; border-radius: 99px; background: rgba(255,255,255,.18); overflow: hidden; }
.nv-track span { display: block; height: 100%; border-radius: inherit; background: #fff; }

/* Sections repliables : « Fermé » puis « Ouvert », le contenu se déplie dans un cadre en retrait */
.nv-sec .nv-ico { width: 17px; height: 17px; }
.nv-etat { color: rgba(255,255,255,.9); }
.nv-sec .nv-chev { transition: transform .3s; }
.nv-secw.open .nv-sec .nv-chev { transform: rotate(90deg); }
.nv-secw + .nv-secw { margin-top: 0; }
.nv-kids { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .45s cubic-bezier(.3,.7,.2,1); }
.nv-secw.open .nv-kids { grid-template-rows: 1fr; }
.nv-kin { min-height: 0; overflow: hidden; }
.nv-kbox { display: grid; gap: 6px; margin: 7px 0 3px 14px; padding: 8px; border-radius: 22px; border: 1px solid rgba(255,230,218,.32); background: rgba(255,255,255,.04); opacity: 0; transform: translateY(-6px); transition: opacity .35s .08s, transform .35s .08s; }
.nv-secw.open .nv-kbox { opacity: 1; transform: none; }
.nv-h { margin: 6px 8px 0; display: grid; gap: 1px; font-size: 10px; font-weight: 700; letter-spacing: .08em; color: rgba(255,255,255,.62); }
.nv-h small { font-size: 10px; font-weight: 500; letter-spacing: 0; color: rgba(255,255,255,.62); }
.nv-h small.warn { color: #ffd75e; }
.nv-p { margin: 0 8px; font-size: 10.5px; color: rgba(255,255,255,.75); }
.nv-url { padding: 9px 12px; border-radius: 14px; background: rgba(0,0,0,.42); font: 10px/1.45 var(--type); color: rgba(255,255,255,.85); word-break: break-all; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

/* Puces, cartes à choisir, nuancier, « Apply to » */
.nv-chips, .nv-apply { display: grid; gap: 6px; padding: 4px 8px; border-radius: 16px; font-size: 11.5px; font-weight: 600; }
.nv-apply > span:first-child { font-size: 10px; letter-spacing: .08em; color: rgba(255,255,255,.62); }
.nv-chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
.nv-chip-row i { font-style: normal; display: inline-flex; align-items: center; gap: 7px; padding: 5px 11px; border-radius: 99px; background: #141113; font-size: 10.5px; font-weight: 600; }
.nv-chip-row i.sel { background: #ea7363; box-shadow: 0 0 0 1.5px #ffc0b6; }
.nv-apply .nv-tg { width: 24px; height: 14px; } .nv-apply .nv-tg::after { width: 10px; height: 10px; } .nv-apply .nv-tg.on::after { left: 12px; }
.nv-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding: 2px; border-radius: 16px; }
.nv-card { position: relative; display: grid; gap: 4px; align-content: start; padding: 9px; border-radius: 14px; background: #141113; font-size: 11px; }
.nv-card b { font-weight: 700; } .nv-card small { font-size: 9.5px; color: rgba(255,255,255,.66); }
.nv-card.sel { box-shadow: 0 0 0 2px #ee5a4b; }
.nv-card.sel::after { content: "✓"; position: absolute; top: 6px; right: 7px; width: 15px; height: 15px; border-radius: 50%; display: grid; place-items: center; font-size: 9px; font-weight: 800; background: #ee5a4b; }
.nv-art { display: grid; gap: 2px; height: 34px; padding: 3px; border-radius: 6px; background: rgba(255,255,255,.07); }
.nv-art i { border-radius: 2px; background: rgba(255,255,255,.32); }
.nv-layout .nv-card:nth-child(1) .nv-art { grid-template-columns: repeat(4, 1fr); grid-template-rows: 1.6fr 1fr; }
.nv-layout .nv-card:nth-child(1) .nv-art i:first-child { grid-column: span 4; background: rgba(255,255,255,.5); }
.nv-layout .nv-card:nth-child(2) .nv-art { grid-template-columns: repeat(5, 1fr); }
.nv-layout .nv-card:nth-child(3) .nv-art { grid-template-columns: repeat(4, 1fr); }
.nv-cw .nv-art { justify-items: center; align-items: center; }
.nv-cw .nv-card:nth-child(1) .nv-art { grid-template-columns: 1.4fr 1fr; } .nv-cw .nv-card:nth-child(1) .nv-art i { width: 100%; height: 80%; }
.nv-cw .nv-card:nth-child(2) .nv-art i { width: 90%; height: 70%; }
.nv-cw .nv-card:nth-child(3) .nv-art i { width: 30%; height: 100%; }
.nv-swatches { display: flex; gap: 7px; padding: 2px; border-radius: 16px; overflow: hidden; }
.nv-sw { position: relative; flex: none; display: grid; justify-items: center; gap: 4px; width: 58px; padding: 8px 4px 6px; border-radius: 14px; background: #141113; font-size: 9.5px; font-weight: 700; }
.nv-sw i { width: 22px; height: 22px; border-radius: 50%; }
.nv-sw.sel { box-shadow: 0 0 0 2px #ee5a4b; }
.nv-sw.sel i::after { content: "✓"; display: grid; place-items: center; height: 100%; font: 800 12px/1 var(--body); font-style: normal; color: #fff; }

/* Le cadre de focus : il glisse d'une ligne à l'autre ; ambre sur un réglage « à adapter » */
.nv-ring { position: absolute; top: 0; left: 0; width: 0; height: 0; pointer-events: none; z-index: 2; opacity: 0; border-radius: 24px;
  box-shadow: 0 0 0 2px #ff6a5c, 0 0 0 5px rgba(255,106,92,.22), 0 0 22px rgba(255,106,92,.5);
  transition: transform .38s cubic-bezier(.3,.7,.2,1), width .38s cubic-bezier(.3,.7,.2,1), height .38s cubic-bezier(.3,.7,.2,1), border-radius .38s, opacity .25s, box-shadow .3s; }
.nv-ring.on { opacity: 1; }
.nv-ring.adapt { box-shadow: 0 0 0 2px var(--bulb), 0 0 0 5px rgba(255,207,107,.25), 0 0 24px rgba(255,207,107,.55); }
.nv-vp::before, .nv-vp::after { content: ""; position: absolute; left: 50%; z-index: 3; width: 7px; height: 7px; margin-left: -4px; border: solid #fff; border-width: 2px 0 0 2px; opacity: 0; transition: opacity .3s; }
.nv-vp::before { top: 3px; transform: rotate(45deg); }
.nv-vp::after { bottom: 8px; transform: rotate(225deg); }
.nv-vp.up::before, .nv-vp.down::after { opacity: .9; }

/* La bulle, comme un sous-titre en bas de l'écran */
.nv-cap { position: absolute; left: 50%; bottom: 14px; z-index: 5; width: min(86%, 560px); display: flex; gap: 10px; align-items: baseline; padding: 10px 14px; border-radius: 14px;
  background: rgba(14,8,11,.93); border: 1px solid rgba(245,234,216,.22); box-shadow: 0 14px 34px rgba(0,0,0,.5); font: 500 13px/1.45 var(--body); color: var(--cream);
  opacity: 0; transform: translate(-50%, 14px); transition: opacity .3s, transform .4s cubic-bezier(.3,.7,.2,1); pointer-events: none; }
.nv-cap.on { opacity: 1; transform: translate(-50%, 0); }
.nv-cap.adapt { border-color: rgba(255,207,107,.7); }
.nv-tag { flex: none; font: 800 .62rem/1.6 var(--body); letter-spacing: .12em; text-transform: uppercase; border-radius: 4px; padding: 1px 6px; color: var(--cream); box-shadow: inset 0 0 0 1px rgba(245,234,216,.45); }
.nv-cap.adapt .nv-tag { color: var(--ink); background: var(--bulb); box-shadow: none; }
.nv-pause { position: absolute; top: 10px; right: 12px; z-index: 5; font: 800 .62rem/1 var(--body); letter-spacing: .14em; text-transform: uppercase; padding: 5px 8px; border-radius: 99px; background: rgba(14,8,11,.75); color: var(--cream); opacity: 0; transition: opacity .25s; }
.nv.paused .nv-pause { opacity: 1; }

/* Sous l'écran : pause, chapitres (avec leur avancement), pas à pas */
.nv-bar { display: flex; align-items: center; gap: 8px; }
.nv-bar button { cursor: pointer; font-family: var(--body); }
.nv-pp, .nv-step { flex: none; width: 38px; height: 38px; display: grid; place-items: center; border-radius: 50%; border: 1px solid var(--seat); background: var(--velvet); color: var(--cream); }
.nv-pp:hover, .nv-step:hover { border-color: var(--bulb); color: var(--bulb); }
.nv-bar svg { width: 18px; height: 18px; fill: currentColor; }
.nv-step svg { fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
.nv-pp .i-play, .nv.paused .nv-pp .i-pause { display: none; } .nv.paused .nv-pp .i-play { display: inline; }
.nv-chaps { position: relative; flex: 1; min-width: 0; display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; }
.nv-chaps::-webkit-scrollbar { display: none; }
.nv-chaps button { flex: 1 0 auto; padding: 8px 10px 9px; border: 0; border-radius: 8px; font-weight: 700; font-size: .8rem; color: var(--dim); white-space: nowrap;
  background: linear-gradient(var(--bulb), var(--bulb)) 0 100% / calc(var(--p, 0) * 100%) 2px no-repeat, linear-gradient(var(--seat), var(--seat)) 0 100% / 100% 2px no-repeat, transparent; }
.nv-chaps button:hover { color: var(--cream); }
.nv-chaps button[aria-current="true"] { color: var(--bulb); background-color: rgba(255,207,107,.07); }

/* La version texte, sous l'animation */
.nv-texte { border: 1px solid var(--seat); border-radius: 12px; padding: 10px 14px; background: rgba(0,0,0,.18); }
.nv-texte summary { cursor: pointer; color: var(--bulb); font-weight: 700; }
.nv-texte[open] summary { margin-bottom: 8px; }
.nvt-ecran + .nvt-ecran { margin-top: 12px; }
.nvt-titre { margin: 0 0 4px; font: 800 .8rem var(--body); letter-spacing: .14em; text-transform: uppercase; color: var(--bulb); }
.nv-texte ul { margin: 0; padding-left: 1.2em; display: grid; gap: 3px; font-size: .92rem; color: #e6d6c8; }
.nv-texte ul ul { margin-top: 3px; }
.nv-texte b { color: var(--cream); }
.nvt-adapt, .nvt-pourquoi { font: 800 .62rem/1.6 var(--body); letter-spacing: .1em; text-transform: uppercase; border-radius: 4px; padding: 1px 5px; vertical-align: 1px; }
.nvt-adapt { color: var(--ink); background: var(--bulb); }
.nvt-pourquoi { color: var(--cream); box-shadow: inset 0 0 0 1px rgba(245,234,216,.45); }

/* Sauts de chapitre et pas à pas : tout se place sans animation */
.nv.instant * { transition: none !important; }
@media (prefers-reduced-motion: reduce) { .nv * { transition-duration: .01s !important; transition-delay: 0s !important; } }

/* Téléphone : pas de barre latérale, un écran plus haut que large */
@container (max-width: 620px) {
  .nv-screen { aspect-ratio: auto; height: 520px; grid-template-columns: minmax(0, 1fr); padding: 14px 10px 0; }
  .nv-side { display: none; }
  .nv-row { padding: 8px 12px; gap: 9px; }
  .nv-val { max-width: 44%; font-size: 11px; }
  .nv-kbox { margin-left: 6px; padding: 6px; }
  .nv-cap { width: calc(100% - 20px); bottom: 10px; font-size: 12.5px; flex-direction: column; gap: 4px; }
  .nv-chaps button { flex: none; }
}`;

// Script client : bâtit la suite d'actions à partir du DOM, puis la joue (ou la rejoue instantanément pour un saut).
// Pas de gabarit littéral ici : ce texte est injecté dans le gabarit de la page.
export const REGLAGES_JS = `// ---------- Étape 9 : les réglages rejoués comme à la télécommande ----------
(() => {
  const nv = document.getElementById("nv"); if (!nv) return;
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scr = nv.querySelector(".nv-screen"), ul = nv.querySelector(".nv-side ul"), items = [...ul.querySelectorAll("[data-i]")];
  const cap = nv.querySelector(".nv-cap"), capTag = cap.querySelector(".nv-tag"), capTxt = cap.querySelector(".nv-ctxt");
  const pages = [...nv.querySelectorAll(".nv-page")], byId = {};
  pages.forEach((p) => { byId[p.dataset.page] = p; });
  const chapBtns = [...nv.querySelectorAll(".nv-chaps button")];

  // La visite : barre latérale → écran → chaque réglage dans l'ordre (ouvrir les sections, entrer dans TMDB).
  const A = [], chapStart = {};
  let sideAt = +pages[0].dataset.side;
  const addPage = (p) => {
    if (!(p.dataset.chap in chapStart)) chapStart[p.dataset.chap] = A.length;
    if (!p.dataset.parent) {
      const to = +p.dataset.side;
      if (sideAt === to) A.push({ t: "side", i: to });
      while (sideAt !== to) { sideAt += sideAt < to ? 1 : -1; A.push({ t: "side", i: sideAt }); }
    }
    A.push({ t: "page", p });
    p.querySelectorAll("[data-f]").forEach((el) => {
      A.push({ t: "focus", el, p });
      if (el.hasAttribute("data-sec") && !el.hasAttribute("data-keep")) A.push({ t: "open", el, p });
      if (el.dataset.enter) { A.push({ t: "enter" }); addPage(byId[el.dataset.enter]); }
    });
    if (!p.dataset.parent) A.push({ t: "leave", p });
  };
  pages.forEach((p) => { if (!p.dataset.parent) addPage(p); });
  const chapEnd = {};
  for (let c = 0; c < chapBtns.length; c++) chapEnd[chapBtns[c].dataset.chap] = c + 1 < chapBtns.length ? chapStart[chapBtns[c + 1].dataset.chap] : A.length;

  // ---------- L'état de l'écran ----------
  let page = null, el = null, inSide = true;
  const setSide = (i, focused) => {
    items.forEach((li, j) => { li.classList.toggle("sel", j === i && !focused); li.classList.toggle("focus", j === i && focused); });
    const li = items[i], pitch = items[1].offsetTop - items[0].offsetTop;
    const max = Math.max(0, ul.scrollHeight - ul.parentElement.clientHeight + 8);
    ul.style.transform = "translateY(" + (-Math.min(max, Math.max(0, li.offsetTop - pitch * 2))) + "px)";
  };
  const showPage = (p) => {
    if (page === p) return;
    pages.forEach((q) => { q.classList.toggle("on", q === p); q.inert = q !== p; });
    page = p; el = null;
  };
  const ringOf = (p) => p.querySelector(".nv-ring");
  // Place le cadre sur la ligne et fait défiler pour la garder vers le haut de l'écran.
  const layout = () => {
    if (!page) return;
    const ring = ringOf(page), ct = page.querySelector(".nv-ct"), vp = page.querySelector(".nv-vp");
    if (!el || inSide) { ring.classList.remove("on"); return; }
    const cr = ct.getBoundingClientRect(), r = el.getBoundingClientRect();
    const top = r.top - cr.top, H = vp.clientHeight, C = ct.scrollHeight - 230;
    let y = Math.max(0, Math.min(top - H * .26, C - H));
    // Avec une bulle, la ligne doit rester au-dessus d'elle, même en bas de liste (on défile dans la marge du bas).
    if (el.dataset.a || el.dataset.n) {
      const capTop = scr.getBoundingClientRect().bottom - 14 - cap.offsetHeight - vp.getBoundingClientRect().top;
      y = Math.min(Math.max(y, top + r.height - capTop + 12), ct.scrollHeight - H);
    }
    ct.style.transform = "translateY(" + (-y) + "px)";
    vp.classList.toggle("up", y > 2); vp.classList.toggle("down", y < C - H - 2);
    // Première apparition sur l'écran : le cadre se pose directement, sans grandir depuis le coin.
    const first = !ring.classList.contains("on");
    if (first) ring.style.transition = "none";
    ring.style.transform = "translate(" + (r.left - cr.left) + "px, " + top + "px)";
    ring.style.width = r.width + "px"; ring.style.height = r.height + "px";
    ring.style.borderRadius = getComputedStyle(el).borderRadius;
    if (first) { void ring.offsetWidth; ring.style.transition = ""; }
    ring.classList.add("on"); ring.classList.toggle("adapt", !!el.dataset.a);
  };
  const caption = () => {
    const t = el && !inSide ? (el.dataset.a || el.dataset.n) : "";
    cap.classList.toggle("on", !!t);
    if (!t) return;
    cap.classList.toggle("adapt", !!el.dataset.a);
    capTag.textContent = el.dataset.a ? "À adapter" : "Pourquoi";
    capTxt.textContent = t;
  };
  const openSec = (h) => { const w = h.parentElement; w.classList.add("open"); h.querySelector(".nv-etat").textContent = "Ouvert"; };
  const reset = () => {
    nv.querySelectorAll(".nv-secw.open").forEach((w) => { w.classList.remove("open"); w.querySelector(".nv-etat").textContent = "Fermé"; });
    nv.querySelectorAll(".nv-ct").forEach((ct) => { ct.style.transform = ""; });
    page = null; el = null; inSide = true;
  };
  let relayT = 0, sideAttente = null;
  const apply = (a, instant) => {
    // En saut (instant), la barre latérale n'est placée qu'une fois, à la fin (seek) : setSide mesure la page.
    const side = (i, f) => { if (instant) sideAttente = [i, f]; else setSide(i, f); };
    if (a.t === "side") { inSide = true; side(a.i, true); }
    else if (a.t === "page") { showPage(a.p); }
    else if (a.t === "focus") { inSide = false; el = a.el; side(+(a.p.dataset.side), false); }
    else if (a.t === "open") { openSec(a.el); }
    else if (a.t === "leave") { inSide = true; el = null; side(+(a.p.dataset.side), true); }
    if (instant) return;
    caption(); layout();
    // Une section qui s'ouvre change les hauteurs : on recale une fois le dépliage fini.
    clearTimeout(relayT); if (a.t === "open") relayT = setTimeout(layout, 480);
  };
  const dur = (a) => {
    if (a.t === "side") return 420; if (a.t === "page") return 750; if (a.t === "open") return 650;
    if (a.t === "enter") return 450; if (a.t === "leave") return 380;
    const t = a.el.dataset.a || a.el.dataset.n;
    return t ? Math.min(10000, 1500 + t.length * 42) : 800;
  };

  // ---------- Lecture, saut, pas à pas ----------
  let k = 0, timer = 0, wanted = !calm, seen = false;
  const progress = () => {
    chapBtns.forEach((b) => {
      const s = chapStart[b.dataset.chap], e = chapEnd[b.dataset.chap], on = k > s && k <= e;
      b.style.setProperty("--p", k >= e ? 1 : k <= s ? 0 : ((k - s) / (e - s)).toFixed(3));
      if (on && b.getAttribute("aria-current") !== "true") {
        // Sur téléphone, les onglets défilent : on garde le chapitre en cours visible (sans faire bouger la page).
        const bar = b.parentElement;
        bar.scrollTo({ left: b.offsetLeft - (bar.clientWidth - b.offsetWidth) / 2, behavior: calm ? "auto" : "smooth" });
      }
      b.setAttribute("aria-current", String(on));
    });
  };
  const seek = (n) => {
    nv.classList.add("instant"); reset();
    sideAttente = null;
    for (let i = 0; i < n; i++) apply(A[i], true);
    if (sideAttente) setSide(...sideAttente);
    k = n; caption(); layout(); progress();
    void nv.offsetWidth; requestAnimationFrame(() => nv.classList.remove("instant"));
  };
  const tick = () => {
    if (k >= A.length) { timer = setTimeout(() => { seek(0); tick(); }, 1500); return; }
    const a = A[k++]; apply(a, false); progress();
    timer = setTimeout(tick, dur(a));
  };
  const sync = () => {
    clearTimeout(timer); timer = 0;
    const run = wanted && seen && !document.hidden;
    nv.classList.toggle("paused", !wanted);
    nv.querySelector(".nv-pp").setAttribute("aria-label", wanted ? "Pause" : "Lecture");
    cap.setAttribute("aria-live", wanted ? "off" : "polite");
    if (run) timer = setTimeout(tick, 300);
  };
  const step = (dir) => {
    wanted = false;
    let j = k - 1;
    if (dir > 0) { j = k; while (j < A.length && A[j].t !== "focus") j++; if (j >= A.length) j = A.length - 1; }
    else { j = k - 2; while (j > 0 && A[j].t !== "focus") j--; }
    seek(Math.max(2, j + 1)); sync();
  };
  nv.querySelector(".nv-pp").addEventListener("click", () => { wanted = !wanted; sync(); });
  nv.querySelectorAll(".nv-step").forEach((b) => b.addEventListener("click", () => step(+b.dataset.dir)));
  chapBtns.forEach((b) => b.addEventListener("click", () => {
    seek(chapStart[b.dataset.chap]);
    // Sans animation (mouvement réduit), on se pose directement sur le premier réglage du chapitre.
    if (calm) { wanted = false; step(1); } else { wanted = true; sync(); }
  }));
  scr.addEventListener("click", () => { wanted = !wanted; sync(); });
  scr.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); step(-1); }
    else if (e.key === " " || e.key === "Enter") { e.preventDefault(); wanted = !wanted; sync(); }
  });
  new IntersectionObserver(([e]) => { seen = e.isIntersecting; sync(); }, { threshold: .45 }).observe(scr);
  document.addEventListener("visibilitychange", sync);
  addEventListener("resize", () => { if (page) setSide(+page.dataset.side, inSide); layout(); });
  // Au départ : l'écran Apparence, focus sur la première ligne.
  seek(calm ? 0 : 2); if (calm) step(1);
  sync();
})();
`;
