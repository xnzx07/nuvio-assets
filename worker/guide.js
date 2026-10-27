/**
 * Guide « de A à Z » (salle 1, servi sur /guide ; la racine « / » est le hall) : installer Nuvio et toute la configuration
 * conseillée, dans l'ordre, pour quelqu'un qui part de zéro.
 * Même univers visuel que la page de personnalisation (salle de cinéma).
 */

// Adresses de configuration des addons. Laisser vide ce qui n'est pas encore connu :
// l'étape affiche alors une consigne générale.
const LINKS = {
  // Version testée avec ce guide (bêta), la même que celle de l'aperçu (nuvio.js). /tv sur le site redirige
  // vers son APK : plus court à taper.
  nuvioTvVersion: NUVIO_TV_VERSION,
  // Code Downloader (raccourcisseur AFTVnews) → https://nuvio-assets.xnzxflix.workers.dev/tv
  downloaderCode: "5486412",
  nuvioTv: "https://github.com/NuvioMedia/NuvioTV/releases/tag/" + NUVIO_TV_VERSION,
  // Fichier « universal » : marche sur toutes les TV et tous les Fire TV (32 et 64 bits).
  nuvioTvApk: "https://github.com/NuvioMedia/NuvioTV/releases/download/" + NUVIO_TV_VERSION + "/app-full-universal-release.apk",
  nuvioDesktop: "https://github.com/NuvioMedia/NuvioDesktop/releases/latest",
  // Téléphones et tablettes : APK sur GitHub (Android ; Nuvio n'est pas sur le Play Store), ou AltStore / SideStore (iPhone, iPad).
  nuvioMobile: "https://github.com/NuvioMedia/NuvioMobile/releases/latest",
  nuvioIosSource: "https://raw.githubusercontent.com/NuvioMedia/NuvioMobile/cmp-rewrite/store.json",
  altstore: "https://altstore.io/",
  sidestore: "https://sidestore.io/",
  downloader: "https://www.amazon.fr/s?k=downloader+aftvnews",
  lumio: "https://mylumio.tv/configure",
  streamFusion: "https://streamfusion.stremio-epsilon.ca/configure",
  torrentio: "https://torrentio.strem.fun/configure",
  wastream: "https://wastream.noplay.fr/configure",
  opensubtitles: "https://opensubtitles-v3.strem.io/manifest.json",
  allDebrid: "https://alldebrid.com/",
  allDebridOffer: "https://alldebrid.com/offer/",
  allDebridKeys: "https://alldebrid.com/apikeys/",
  realDebrid: "https://real-debrid.com/",
  torbox: "https://torbox.app/",
};


import { STAGE_HEAD, stageTop, secretsHTML, BEAM_HTML, SEATS_HTML, CREDITS_HTML } from "./stage.js";
import { ICONE_APERCU, apercuDonnees } from "./apercu.js";
import { NUVIO_TV_VERSION } from "./nuvio.js";
import { reglagesHTML, POSTER_URL } from "./reglages.js";
export { POSTER_URL };
import { APPAREILS, installUrl } from "./liens.js";
import { feuilles, scripts } from "./statique.js";
import { esc } from "./outils-serveur.js";
import { pannesHTML } from "./pannes.js";
import { seanceHTML, verifCleHTML, photoHTML } from "./guide-verifs.js";

const link = (href, text) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(text)}</a>`;
const copyBox = (id, value) => `<div class="copy"><code id="${id}">${esc(value)}</code><button type="button" data-copy="${id}">Copier</button></div>`;
// Lien d'addon : Copier, plus « Installer dans Nuvio » (nuvio://), suivi par la page quand le lien change.
const addonBox = (id, value) => `${copyBox(id, value)}<a class="installer" data-installe="${id}" href="${esc(installUrl(value) || "#")}"${installUrl(value) ? "" : " hidden"}>Installer dans Nuvio sur cet appareil</a>`;
// Le choix de l'appareil (étape 6) : des cartes rangées par famille ; une fois choisi, on ne voit plus
// que lui et sa configuration (qualité max, ce qu'on exclut), avec « Changer » pour revoir la liste.
const ICONES_APPAREIL = {
  stick: '<rect x="5" y="12" width="17" height="8" rx="2"/><path d="M22 16h3M25 13v6"/><path d="M10.5 16h6"/>',
  box: '<rect x="4" y="11" width="24" height="10" rx="3"/><path d="M8.5 16h7"/><circle cx="23" cy="16" r="1.3"/>',
  tv: '<rect x="3" y="6" width="26" height="16" rx="2"/><path d="M11 27h10M16 22v5"/>',
  ecran: '<rect x="3" y="7" width="18" height="13" rx="1.5"/><path d="M1 24h22"/><rect x="23" y="10" width="7" height="14" rx="1.5"/>',
};
const FAMILLES = [
  ["Fire TV", "stick", ["fire-hd", "fire-4k"]],
  ["Box Android", "box", ["box-hd", "box-4k-dv", "box-4k", "shield"]],
  ["TV, téléphone, ordinateur", null, ["tv", "ecran"]],
];
const appareilsHTML = () => `<div class="choix-appareil" id="choix-appareil">
        <p class="ca-titre" id="ca-titre">L'appareil où tu regardes</p>
        <div class="ca-liste" role="radiogroup" aria-labelledby="ca-titre">
          ${FAMILLES.map(([famille, icone, ids]) => `<p class="ca-famille">${esc(famille)}</p>
          ${ids.map((id) => { const a = APPAREILS[id], ic = icone || (id === "tv" ? "tv" : "ecran"); return `<label class="ca-carte" data-appareil="${id}"><input type="radio" name="appareil" value="${id}"><svg viewBox="0 0 32 32" aria-hidden="true">${ICONES_APPAREIL[ic]}</svg><span class="ca-nom">${esc(a.nom)}${a.exemples ? `<small>${esc(a.exemples)}</small>` : ""}</span>${a.qualite.length <= 5 ? `<i class="ca-q">${esc(a.qualite)}</i>` : ""}</label>`; }).join("\n          ")}`).join("\n          ")}
        </div>
        <div class="ma-conf" id="ma-conf" hidden>
          <dl><div><dt>Qualité max</dt><dd id="mc-q"></dd></div><div><dt>À exclure</dt><dd id="mc-x"></dd></div></dl>
          <button type="button" class="ca-changer" id="ca-changer">Changer d'appareil</button>
        </div>
        <p class="small ca-aide">Le guide s'en sert pour préparer le lien de Torrentio et te dire quoi cocher dans les autres addons. Tu ne connais pas ton modèle ? Regarde sous la box ou dans <span class="path">Paramètres → À propos</span> ; dans le doute, prends « Box 4K sans Dolby Vision ».</p>
      </div>`;

// Ce qu'il faut régler sur le site d'un addon, selon l'appareil choisi à l'étape 6.
const consigne = (addon) => `<p class="consigne" data-consigne="${addon}"><b>Pour ton appareil :</b> <span>choisis-le dans l'encadré « Avant tout » plus haut, le guide te dira quoi régler.</span></p>`;

export const NUVIO_TV_APK = LINKS.nuvioTvApk;

// ---------- Étape 2 : un onglet par appareil où installer Nuvio (TV par défaut : le guide se lit souvent à côté) ----------
const ONGLETS = [
  ["tv", ICONES_APPAREIL.tv, "TV Android", "Google TV, Shield…"],
  ["fire", ICONES_APPAREIL.stick, "Fire TV", "Stick, Cube"],
  ["android", '<rect x="9" y="3" width="14" height="26" rx="3"/><path d="M14 25h4"/>', "Android", "téléphone, tablette"],
  ["ios", '<rect x="5" y="4" width="22" height="25" rx="3"/><circle cx="16" cy="25.5" r=".9"/>', "iPhone, iPad", "via AltStore"],
  ["pc", '<rect x="6" y="7" width="20" height="13" rx="1.5"/><path d="M3 24h26l-2-4H5z"/>', "Windows, Mac", "ordinateur"],
  ["linux", '<rect x="4" y="6" width="24" height="20" rx="2"/><path d="M9 13l4 3-4 3M15 20h7"/>', "Linux", "ordinateur"],
];
const ongletsHTML = () => ONGLETS.map(([id, svg, nom, detail], i) => `<button type="button" role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-tab="${id}"><svg viewBox="0 0 32 32" aria-hidden="true">${svg}</svg><b>${nom}</b><small>${detail}</small><i class="claude-dispo">+ Claude</i></button>`).join("\n      ");
// Le panneau d'un onglet ; seul celui de la TV est ouvert au départ.
const panneau = (id, contenu) => `<div class="panel" role="tabpanel" id="panel-${id}" aria-labelledby="tab-${id}" data-panel="${id}"${id === "tv" ? "" : " hidden"}>
      ${contenu}
    </div>`;
const modes = (avecClaude) => `<div class="modes" role="group" aria-label="Façon d'installer">
        <button type="button" data-mode="main" aria-pressed="true"><b>À la main</b><small>pas à pas</small></button>
        <button type="button" data-mode="claude" aria-pressed="false"><b>Avec Claude</b><small>${avecClaude}</small></button>
      </div>`;

// TV Android et Fire TV : mêmes étapes (Downloader, puis l'APK), à quelques menus près.
// n : la façon de nommer l'appareil dans les phrases (« la TV », « ton Fire TV »…).
const TV = { id: "tv", n: { le: "la TV", ton: "ta TV", mon: "ma TV", du: "de la TV", au: "à la TV" },
  etapes: [
    "Sur la TV, installe l'appli <b>Downloader</b> depuis le Play Store.",
    `Autorise-la à installer des applis : <span class="path">Paramètres → Système (ou Appareil) → Sécurité → Sources inconnues → Downloader</span>. Le chemin varie un peu selon la marque.`,
    "Dans Downloader, tape ce code dans le champ d'adresse et valide. Il télécharge directement le bon fichier, <b>app-full-universal-release.apk</b> :",
  ],
  fin: [`Choisis <b>Installer</b>, puis ouvre Nuvio. Vérifie dans <span class="path">Paramètres → À propos</span> que la version est ${LINKS.nuvioTvVersion} ou plus récente.`],
  debogage: `<span class="path">Paramètres → Système → À propos</span>, appuie 7 fois sur « Version de l'OS » (ou « Build »). Puis <span class="path">Options pour les développeurs → Débogage USB</span>.`,
  ip: `<span class="path">Paramètres → Réseau et Internet</span>, puis ton Wi-Fi`,
  // Android 11 et plus : certaines TV (Google TV Streamer…) refusent « adb connect » sur le port 5555 tant
  // qu'on n'a pas associé l'ordinateur par le débogage sans fil (code d'association, port tiré au hasard).
  secours: {
    claude: " Si la connexion sur le port 5555 est refusée, guide-moi pour activer « Débogage sans fil » dans les options pour les développeurs, associe l'ordinateur avec « adb pair » (adresse, port et code d'association affichés sur la TV), puis connecte-toi avec l'adresse et le port de l'écran « Débogage sans fil ».",
    main: `<p class="small">Connexion refusée ? Sur les TV récentes (Android 11 et plus), active <span class="path">Options pour les développeurs → Débogage sans fil</span>, choisis « Associer l'appareil avec un code », puis tape <code>adb pair</code> suivi de l'adresse et du port affichés (par exemple <code>adb pair 192.168.1.42:37123</code>) et donne le code à 6 chiffres. Ensuite, <code>adb connect</code> avec l'adresse et le port de l'écran « Débogage sans fil » (pas 5555).</p>`,
  },
};
const FIRE = { id: "fire", n: { le: "le Fire TV", ton: "ton Fire TV", mon: "mon Fire TV", du: "du Fire TV", au: "au Fire TV" },
  // Les derniers Fire TV tournent sous Vega OS, plus sous Android : aucune appli Android ne s'y installe.
  avant: `<p class="note warn"><b>Fire TV Stick 4K Select</b> et <b>Fire TV Stick HD de 2026</b> (Wi-Fi 6) : ils tournent sous Vega OS, pas sous Android, et Nuvio ne peut pas s'y installer. Pour vérifier : <span class="path">Paramètres → Ma Fire TV → À propos</span> ; si la version du logiciel commence par « 1. », c'est Vega OS. Les Fire TV Stick Lite, 4K et 4K Max, le Cube et les TV Fire TV marchent.</p>`,
  etapes: [
    "Installe <b>Downloader</b> de <b>AFTVnews</b> depuis l'Amazon Appstore (cherche « Downloader », icône orange). Évite « Downloader for Fire, Browser… », une imitation payante.",
    `Active les options développeur : <span class="path">Paramètres → Ma Fire TV → À propos</span>, puis appuie 7 fois sur le nom de l'appareil.`,
    `Autorise Downloader : <span class="path">Paramètres → Ma Fire TV → Options pour les développeurs → Applications de sources inconnues → Downloader</span>.`,
    "Ouvre Downloader, va dans le champ d'adresse, tape ce code (ou dicte-le à la télécommande Alexa) et valide. Il télécharge directement le bon fichier, <b>app-full-universal-release.apk</b> :",
  ],
  fin: [
    "Choisis <b>Installer</b>, puis <b>Supprimer</b> le fichier téléchargé pour libérer de la place.",
    `Ouvre Nuvio et vérifie dans <span class="path">Paramètres → À propos</span> que la version est ${LINKS.nuvioTvVersion} ou plus récente. Astuce : maintiens le bouton Accueil → Applications pour l'ajouter à tes favoris.`,
  ],
  debogage: `<span class="path">Paramètres → Ma Fire TV → À propos</span>, appuie 7 fois sur le nom de l'appareil. Puis <span class="path">Options pour les développeurs → Débogage ADB → Activé</span>.`,
  ip: `<span class="path">Paramètres → Ma Fire TV → À propos → Réseau</span>`,
};
const li = (items) => items.map((t) => `<li>${t}</li>`).join("\n          ");
const panneauTV = ({ id, n, avant = "", etapes, fin, debogage, ip, secours = { claude: "", main: "" } }, short) => panneau(id, `${avant}${modes("il s'en occupe depuis l'ordi")}
      <div class="mode-pane" data-pane="main">
        <ol>
          ${li(etapes)}
        </ol>
        <div class="code"><span>Code Downloader</span><b>${LINKS.downloaderCode}</b></div>
        <p class="small">Si le code ne marche pas, tape l'adresse à la place :</p>
        ${copyBox("u-" + id, short)}
        <ol start="${etapes.length + 1}">
          ${li(fin)}
        </ol>
      <details class="manual"><summary>TV et Fire TV : installer à la main depuis GitHub (si le code ne marche pas)</summary>
        <p>Ouvre ${link(LINKS.nuvioTv, "la page de Nuvio TV " + LINKS.nuvioTvVersion)}, puis dans « Assets » prends <b>app-full-universal-release.apk</b>. Il marche partout. Les autres fichiers sont plus légers mais propres à un type de processeur : <b>armeabi-v7a</b> pour la plupart des Fire TV et des TV, <b>arm64-v8a</b> pour les boîtiers récents (Shield, Chromecast avec Google TV), <b>x86</b> et <b>x86_64</b> pour les émulateurs et PC.</p>
      </details>
      </div>
      <div class="mode-pane" data-pane="claude" hidden>
        <p>Tu as un ordinateur sur le même Wi-Fi que ${n.le} et l'appli <b>Claude</b> (avec Claude Code) ? Claude installe Nuvio sur ${n.ton} à ta place, par le réseau (ADB). Rien à télécharger sur ${n.le}.</p>
        <p class="small">Depuis ton téléphone, l'appli Claude peut piloter Claude Code qui tourne sur ton ordinateur (Remote Control) : ça marche aussi, tant que l'ordinateur reste allumé sur le même Wi-Fi. Une session Claude Code « dans le cloud », elle, ne voit pas ${n.ton}.</p>
        <ol>
          <li><b>Active le débogage sur ${n.le}</b> : ${debogage}</li>
          <li><b>Note l'adresse IP ${n.du}</b> : ${ip}. Elle ressemble à 192.168.1.42.</li>
          <li><b>Ouvre Claude Code sur l'ordinateur</b> et colle ce message en remplaçant l'adresse IP par celle de ${n.ton} :</li>
        </ol>
        <div class="copy long"><code id="u-claude-${id}">Installe Nuvio TV sur ${n.mon} par ADB. Adresse IP ${n.du} : 192.168.1.42. Étapes : installe les outils ADB (Android platform-tools) s'ils manquent, télécharge le fichier APK depuis ${esc(LINKS.nuvioTvApk)}, connecte-toi ${n.au} avec « adb connect » sur le port 5555, puis installe l'APK avec « adb install -r ».${secours.claude} Explique-moi chaque étape avant de la faire et dis-moi quand accepter la demande qui s'affichera sur ${n.le}. À la fin, déconnecte-toi ${n.du}.</code><button type="button" data-copy="u-claude-${id}">Copier</button></div>
        <ol start="4">
          <li>Quand ${n.le} affiche <b>« Autoriser le débogage ? »</b>, coche « Toujours autoriser depuis cet ordinateur » et valide.</li>
          <li>Une fois Nuvio installé, <b>désactive le débogage</b> sur ${n.le} (même menu). Laisser ADB ouvert permet à n'importe quel appareil du réseau de piloter ${n.ton}.</li>
        </ol>
        <details class="manual"><summary>Sans Claude : les commandes à taper soi-même</summary>
          <p>Avec les <a href="https://developer.android.com/tools/releases/platform-tools" target="_blank" rel="noopener">outils ADB de Google</a> installés et le fichier APK téléchargé :</p>
          <div class="copy long"><code id="u-adb-${id}" class="lignes">adb connect 192.168.1.42:5555
adb install -r app-full-universal-release.apk
adb disconnect</code><button type="button" data-copy="u-adb-${id}">Copier</button></div>
          ${secours.main}
        </details>
      </div>`);

// Ordinateur (Windows, Mac ou Linux) : Claude choisit lui-même le bon fichier, le message est le même.
const MESSAGE_DESKTOP = `Installe Nuvio Desktop sur cet ordinateur. Prends la dernière version sur ${LINKS.nuvioDesktop}, avec le fichier qui correspond à mon système : .msi pour Windows ; .dmg arm64 (puce Apple) ou x86_64 (Intel) pour Mac ; .deb, .rpm, .flatpak ou .AppImage selon ma distribution Linux. Télécharge-le et installe-le. Explique-moi chaque étape avant de la faire, et à la fin dis-moi comment ouvrir Nuvio.`;

export function guidePage({ origin, season, apercus = origin }) {
  const short = origin.replace(/^https?:\/\//, "") + "/tv";
  const LOGO = origin + "/logo.png";
  const manifest = `${origin}/manifest.json`;
  const sf = LINKS.streamFusion
    ? `<li>Ouvre ${link(LINKS.streamFusion, "la page de StreamFusion Reborn")}.</li>`
    : `<li>Ouvre la page de configuration de StreamFusion Reborn (demande l'adresse à la personne qui t'a envoyé ce guide).</li>`;
  const wa = LINKS.wastream
    ? `<li>Ouvre ${link(LINKS.wastream, "la page de WAStream")}.</li>`
    : `<li>Ouvre la page de configuration de WAStream (demande l'adresse à la personne qui t'a envoyé ce guide).</li>`;

  return `<!doctype html>
<html lang="fr" data-saison="${esc(season || "")}">
<head>
<meta charset="utf-8">
${STAGE_HEAD}
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Guide Nuvio FR · de A à Z</title>
<meta name="description" content="Installer Nuvio et une configuration complète en français, étape par étape.">
<meta property="og:title" content="Nuvio en français, de A à Z">
<meta property="og:image" content="${LOGO}">
<link rel="icon" href="${LOGO}">
${feuilles("polices.css", "guide.css", "apercu.css", "nuvio.css", "reglages.css", "guide-reclames.css", "scene.css", "guide-fin.css", "guide-verifs.css")}
</head>
<body>
<div class="valance" aria-hidden="true"></div>
${stageTop({ here: "guide", origin })}
${secretsHTML("guide")}
<div class="wrap">
  <header class="hero">
    ${BEAM_HTML}
    <div class="marquee"><small>Guide de A à Z</small><h1>Nuvio en français</h1></div>
    <p class="tagline">De l'appli vide à l'accueil complet, en une séance.</p>
    <a class="raccourci" href="${esc(origin)}/configure" data-programmation>Tu as déjà Nuvio ? Passe direct à la salle 2 →</a>
    <button type="button" class="voir-resultat" data-resultat>${ICONE_APERCU}Voir l'accueil que tu auras à la fin</button>
    <button type="button" class="vers-tel" id="vers-tel">Ouvrir ce guide sur mon téléphone (QR code)</button>
    <p>Ce guide installe Nuvio puis toute la configuration conseillée, dans le bon ordre : catalogue en français, recherche, sources, sous-titres, collections et affiches.</p>
    <div class="facts"><span>≈ 25 minutes</span><span>TV, téléphone, tablette ou ordinateur</span><span>Sur TV : un téléphone à côté</span></div>
  </header>

  <nav class="toc" aria-label="Étapes">
    <a href="#avant">Avant de commencer</a><a href="#installer">Installer Nuvio</a><a href="#francais">Premier lancement (Avancé, français)</a>
    <a href="#telephone">Piloter depuis le téléphone</a><a href="#comptes">Créer ta clé AllDebrid</a><a href="#addons">Ajouter les addons</a>
    <a href="#collections">Importer les collections</a><a href="#affiches">Les affiches perso</a><a href="#reglages">Les réglages conseillés</a><a href="#ranger">Ranger l'accueil</a>
    <a href="#tester">Lancer un premier film</a><a href="#depannage">En cas de souci</a>
  </nav>

  <section class="reclames" id="reclames" aria-roledescription="carrousel" aria-label="Réclames d'avant-séance">
    <article class="reclame on" aria-roledescription="diapositive" aria-label="Réclame 1 sur 3">
      <p class="r-sur">Nouveau en salle 2</p><h3>Le Mode Famille</h3><p class="r-slogan">Zéro frisson, cent pour cent de sourires. Toute la famille devant l'écran, garanti sans horreur !</p><a class="r-cta" href="${esc(origin)}/configure#s-filtres">Essayez-le dès ce soir</a>
      <span class="r-etoile" aria-hidden="true">Garanti !</span><span class="r-tampon" aria-hidden="true">Réclame</span>
    </article>
    <article class="reclame" aria-roledescription="diapositive" aria-label="Réclame 2 sur 3" aria-hidden="true">
      <p class="r-sur">Le chic à la française</p><h3>Les affiches maison</h3><p class="r-slogan">Note, genre, année, tendance et qualité, d'un seul coup d'œil. Vos amis en seront verts de jalousie.</p><a class="r-cta" href="#affiches" tabindex="-1">Voir l'étape 8</a>
      <span class="r-etoile" aria-hidden="true">Luxe !</span><span class="r-tampon" aria-hidden="true">Réclame</span>
    </article>
    <article class="reclame" aria-roledescription="diapositive" aria-label="Réclame 3 sur 3" aria-hidden="true">
      <p class="r-sur">Pour vos amis</p><h3>Le billet en image</h3><p class="r-slogan">Offrez votre programmation ! Un joli billet, prêt à envoyer à toute la bande.</p><a class="r-cta" href="${esc(origin)}/configure" tabindex="-1">Imprimer mon billet</a>
      <span class="r-etoile" aria-hidden="true">Offert !</span><span class="r-tampon" aria-hidden="true">Réclame</span>
    </article>
  </section>
  <div class="r-dots" id="r-dots" role="group" aria-label="Choisir une réclame"></div>

  <section class="act" id="avant">
    <header><span class="num">01</span><span class="label">Avant de commencer</span><h2>Ce qu'il te faut</h2></header>
    <ul>
      <li><b>Un appareil</b> : une TV Android ou Google TV, un Fire TV (sauf le Fire TV Stick 4K Select et le Fire TV Stick HD de 2026, voir l'étape 2), un téléphone ou une tablette (Android, iPhone, iPad), ou un ordinateur (Windows, Mac, Linux).</li>
      <li><b>Sur TV, un téléphone</b> sur le même Wi-Fi : il sert à coller les liens au lieu de les taper à la télécommande.</li>
      <li><b>Un compte AllDebrid premium</b> (payant, quelques euros par mois) : Lumio, StreamFusion, Torrentio et WAStream s'en servent pour fournir des sources rapides. On le crée à l'étape 5. ${link(LINKS.realDebrid, "Real-Debrid")} ou ${link(LINKS.torbox, "TorBox")} marchent aussi.</li>
    </ul>
    <p class="note">Nuvio est un lecteur : il n'héberge rien. Ce que tu regardes dépend des addons que tu ajoutes. Respecte la loi de ton pays sur les contenus.</p>
  </section>

  <section class="act" id="installer">
    <header><span class="num">02</span><span class="label">Installation</span><h2>Installer Nuvio</h2></header>
    <p class="lead">Sur TV, on installe la version testée avec ce guide, <b>Nuvio TV ${LINKS.nuvioTvVersion}</b>, depuis sa page officielle sur GitHub. Sur téléphone, tablette et ordinateur, c'est l'appli Nuvio de la même équipe : les étapes suivantes sont les mêmes partout.</p>
    <p class="ou-installer" id="ou-installer">Où veux-tu installer Nuvio ? <small>Pas forcément sur l'appareil où tu lis ce guide.</small></p>
    <div class="appareils" role="tablist" aria-labelledby="ou-installer">
      ${ongletsHTML()}
    </div>
    ${panneauTV(TV, short)}
    ${panneauTV(FIRE, short)}
    <div class="panel" role="tabpanel" id="panel-android" aria-labelledby="tab-android" data-panel="android" hidden>
      <div class="modes" role="group" aria-label="Façon d'installer">
        <button type="button" data-mode="main" aria-pressed="true"><b>À la main</b><small>pas à pas</small></button>
        <button type="button" data-mode="claude" aria-pressed="false"><b>Avec Claude</b><small>il te guide sur ton téléphone</small></button>
      </div>
      <div class="mode-pane" data-pane="main">
        <ol>
          <li>Nuvio n'est pas sur le Play Store : son fichier d'installation officiel (APK) est sur GitHub. Ouvre ${link(LINKS.nuvioMobile, "la page de Nuvio Mobile sur GitHub")} et, dans « Assets », prends <b>androidApp-full-arm64-v8a-release.apk</b> (presque tous les téléphones et tablettes récents) ou <b>androidApp-full-armeabi-v7a-release.apk</b> pour un très vieil appareil.</li>
          <li>Ouvre le fichier téléchargé. Android demande d'autoriser ton navigateur à installer des applis : accepte, puis choisis <b>Installer</b>.</li>
          <li>Ouvre Nuvio. Sur téléphone et tablette, saute l'étape 4 : tu colles les liens directement dans l'appli.</li>
        </ol>
      </div>
      <div class="mode-pane" data-pane="claude" hidden>
        <p>L'appli <b>Claude</b> ne peut pas installer Nuvio à ta place sur ton téléphone ou ta tablette, mais elle peut <b>te guider pas à pas</b> : elle t'explique chaque étape, attend que tu aies fini, et comprend les captures d'écran que tu lui envoies si tu bloques.</p>
        <ol>
          <li><b>Copie ce message</b> :</li>
        </ol>
        <div class="copy long"><code id="u-guide-android">Aide-moi à installer l'appli Nuvio sur mon téléphone (ou ma tablette) Android, puis à la configurer en français. Guide-moi une seule étape à la fois et attends que je te dise « c'est fait » avant de passer à la suivante. Si je bloque, je t'enverrai une capture d'écran. Nuvio n'est pas sur le Play Store : l'APK officiel est sur ${LINKS.nuvioMobile} (fichier androidApp-full-arm64-v8a-release.apk pour un appareil récent, androidApp-full-armeabi-v7a-release.apk pour un très vieux). Ensuite, le guide complet à suivre est ici : ${origin}/guide (étapes 3 et 5 à 12 ; l'étape 4 ne sert pas sur téléphone).</code><button type="button" data-copy="u-guide-android">Copier</button></div>
        <ol start="2">
          <li><b>Ouvre l'appli Claude</b> (ou ${link("https://claude.ai/new", "claude.ai")}), colle le message et envoie-le. Réponds-lui au fur et à mesure.</li>
        </ol>
      </div>
    </div>
    <div class="panel" role="tabpanel" id="panel-ios" aria-labelledby="tab-ios" data-panel="ios" hidden>
      <div class="modes" role="group" aria-label="Façon d'installer">
        <button type="button" data-mode="main" aria-pressed="true"><b>À la main</b><small>pas à pas</small></button>
        <button type="button" data-mode="claude" aria-pressed="false"><b>Avec Claude</b><small>il te guide sur ton téléphone</small></button>
      </div>
      <div class="mode-pane" data-pane="main">
        <p class="note">Nuvio n'est pas sur l'App Store. Sur iPhone et iPad, on l'installe avec <b>AltStore</b> ou <b>SideStore</b>, deux applis qui installent des applis en dehors de l'App Store.</p>
        <ol>
          <li>Installe ${link(LINKS.altstore, "AltStore")} (il faut un ordinateur la première fois) ou ${link(LINKS.sidestore, "SideStore")}, en suivant les explications de leur site.</li>
          <li>Dans AltStore ou SideStore : onglet <b>Sources</b> → <b>+</b>, puis colle cette adresse :</li>
        </ol>
        ${copyBox("u-ios", LINKS.nuvioIosSource)}
        <ol start="3">
          <li>Ouvre la source <b>Nuvio</b> et appuie sur <b>Installer</b>.</li>
          <li>Avec un identifiant Apple gratuit, les applis installées ainsi doivent être renouvelées tous les 7 jours : AltStore et SideStore le font tout seuls si tu les ouvres de temps en temps.</li>
          <li>Ouvre Nuvio et saute l'étape 4 : tu colles les liens directement dans l'appli.</li>
        </ol>
      </div>
      <div class="mode-pane" data-pane="claude" hidden>
        <p>L'appli <b>Claude</b> ne peut pas installer Nuvio à ta place sur ton iPhone ou ton iPad, mais elle peut <b>te guider pas à pas</b> : elle t'explique chaque étape, attend que tu aies fini, et comprend les captures d'écran que tu lui envoies si tu bloques.</p>
        <ol>
          <li><b>Copie ce message</b> :</li>
        </ol>
        <div class="copy long"><code id="u-guide-ios">Aide-moi à installer l'appli Nuvio sur mon iPhone (ou mon iPad), puis à la configurer en français. Guide-moi une seule étape à la fois et attends que je te dise « c'est fait » avant de passer à la suivante. Si je bloque, je t'enverrai une capture d'écran. Nuvio n'est pas sur l'App Store : il s'installe avec AltStore (${LINKS.altstore}) ou SideStore (${LINKS.sidestore}), en ajoutant cette source dans l'onglet Sources : ${LINKS.nuvioIosSource}. Avec un identifiant Apple gratuit, l'appli doit être renouvelée tous les 7 jours. Ensuite, le guide complet à suivre est ici : ${origin}/guide (étapes 3 et 5 à 12 ; l'étape 4 ne sert pas sur téléphone).</code><button type="button" data-copy="u-guide-ios">Copier</button></div>
        <ol start="2">
          <li><b>Ouvre l'appli Claude</b> (ou ${link("https://claude.ai/new", "claude.ai")}), colle le message et envoie-le. Réponds-lui au fur et à mesure.</li>
        </ol>
      </div>
    </div>
    <div class="panel" role="tabpanel" id="panel-pc" aria-labelledby="tab-pc" data-panel="pc" hidden>
      <div class="modes" role="group" aria-label="Façon d'installer">
        <button type="button" data-mode="main" aria-pressed="true"><b>À la main</b><small>pas à pas</small></button>
        <button type="button" data-mode="claude" aria-pressed="false"><b>Avec Claude</b><small>il s'en occupe depuis l'ordi</small></button>
      </div>
      <div class="mode-pane" data-pane="main">
        <p class="note warn">Nuvio Desktop est encore en version <b>alpha</b>, réservée aux testeurs : ça marche, mais attends-toi à quelques bugs.</p>
        <ol>
          <li>Ouvre la page de Nuvio Desktop et, dans « Assets », télécharge :
            <ul>
              <li><b>Windows</b> : <b>Nuvio-Windows-x64-….msi</b></li>
              <li><b>Mac avec puce Apple</b> (M1, M2, M3, M4) : <b>Nuvio-macOS-arm64-….dmg</b></li>
              <li><b>Mac Intel</b> : <b>Nuvio-macOS-x86_64-….dmg</b>. Pour savoir lequel tu as : <span class="path">menu Pomme → À propos de ce Mac</span>.</li>
            </ul>
          </li>
        </ol>
        ${copyBox("u-pc", LINKS.nuvioDesktop)}
        <ol start="2">
          <li>Installe : double-clic sur le <b>.msi</b>, ou ouvre le <b>.dmg</b> et glisse Nuvio dans <b>Applications</b>.</li>
          <li>Si Windows affiche « Windows a protégé votre ordinateur » : <b>Informations complémentaires → Exécuter quand même</b>. Si le Mac refuse d'ouvrir l'appli : <span class="path">Réglages Système → Confidentialité et sécurité → Ouvrir quand même</span>.</li>
          <li>Ouvre Nuvio et saute l'étape 4 : tu colles les liens directement dans l'appli.</li>
        </ol>
      </div>
      <div class="mode-pane" data-pane="claude" hidden>
        <p>Tu as l'appli <b>Claude</b> (avec Claude Code) sur cet ordinateur ? Claude trouve le bon fichier pour ton système, le télécharge et l'installe à ta place.</p>
        <p class="note warn">Nuvio Desktop est encore en version <b>alpha</b>, réservée aux testeurs : attends-toi à quelques bugs.</p>
        <ol><li><b>Ouvre Claude Code</b> et colle ce message :</li></ol>
        <div class="copy long"><code id="u-claude-pc">${esc(MESSAGE_DESKTOP)}</code><button type="button" data-copy="u-claude-pc">Copier</button></div>
        <ol start="2"><li>Accepte les demandes d'autorisation de Claude (et ton mot de passe si le système le demande), puis ouvre Nuvio et saute l'étape 4 : tu colles les liens directement dans l'appli.</li></ol>
      </div>
    </div>
    <div class="panel" role="tabpanel" id="panel-linux" aria-labelledby="tab-linux" data-panel="linux" hidden>
      <div class="modes" role="group" aria-label="Façon d'installer">
        <button type="button" data-mode="main" aria-pressed="true"><b>À la main</b><small>pas à pas</small></button>
        <button type="button" data-mode="claude" aria-pressed="false"><b>Avec Claude</b><small>il s'en occupe depuis l'ordi</small></button>
      </div>
      <div class="mode-pane" data-pane="main">
        <p class="note warn">Nuvio Desktop est encore en version <b>alpha</b>, réservée aux testeurs : ça marche, mais attends-toi à quelques bugs. Il existe pour les PC 64 bits (x86_64).</p>
        <ol>
          <li>Ouvre la page de Nuvio Desktop et, dans « Assets », prends le format de ta distribution :
            <ul>
              <li><b>.deb</b> : Ubuntu, Debian, Linux Mint</li>
              <li><b>.rpm</b> : Fedora, openSUSE</li>
              <li><b>.flatpak</b> ou <b>.AppImage</b> : n'importe quelle distribution</li>
            </ul>
          </li>
        </ol>
        ${copyBox("u-linux", LINKS.nuvioDesktop)}
        <ol start="2"><li>Dans un terminal, depuis le dossier du téléchargement, lance la commande qui correspond à ton fichier :</li></ol>
        <p class="small"><b>.deb</b> (Ubuntu, Debian, Mint)</p>
        ${copyBox("u-lx-deb", "sudo apt install ./Nuvio-Linux-x86_64-*.deb")}
        <p class="small"><b>.rpm</b> (Fedora, openSUSE)</p>
        ${copyBox("u-lx-rpm", "sudo dnf install ./Nuvio-Linux-x86_64-*.rpm")}
        <p class="small"><b>.flatpak</b></p>
        ${copyBox("u-lx-flat", "flatpak install --user ./Nuvio-Linux-x86_64-*.flatpak")}
        <p class="small"><b>.AppImage</b> (rien à installer : on le rend exécutable et on le lance)</p>
        ${copyBox("u-lx-app", "chmod +x Nuvio-Linux-x86_64-*.AppImage && ./Nuvio-Linux-x86_64-*.AppImage")}
        <ol start="3"><li>Ouvre Nuvio depuis le menu des applis et saute l'étape 4 : tu colles les liens directement dans l'appli.</li></ol>
      </div>
      <div class="mode-pane" data-pane="claude" hidden>
        <p>Tu as l'appli <b>Claude</b> (avec Claude Code) sur cet ordinateur ? Claude trouve le bon fichier pour ton Linux, le télécharge et l'installe à ta place.</p>
        <p class="note warn">Nuvio Desktop est encore en version <b>alpha</b>, réservée aux testeurs : attends-toi à quelques bugs.</p>
        <ol><li><b>Ouvre Claude Code</b> et colle ce message :</li></ol>
        <div class="copy long"><code id="u-claude-linux">${esc(MESSAGE_DESKTOP)}</code><button type="button" data-copy="u-claude-linux">Copier</button></div>
        <ol start="2"><li>Accepte les demandes d'autorisation de Claude (et ton mot de passe si le système le demande), puis ouvre Nuvio et saute l'étape 4 : tu colles les liens directement dans l'appli.</li></ol>
      </div>
    </div>
  </section>

  <section class="act" id="francais">
    <header><span class="num">03</span><span class="label">Premier lancement</span><h2>Choisir « Avancé » et mettre en français</h2></header>
    <div class="first-run">
      <p><b>Au tout premier lancement</b>, Nuvio demande quel affichage des réglages tu veux : <b>Essentiel</b> ou <b>Avancé</b>. <span class="pick">Choisis Avancé</span> : sinon, une bonne partie des réglages de ce guide (lecteur, audio, affiches perso, bandes-annonces…) reste cachée.</p>
      <div class="choix" aria-hidden="true"><small>Affichage des réglages</small><span>Essentiel</span><span class="focus">Avancé</span></div>
      <small>Déjà choisi Essentiel ? Pas grave : <span class="path">Paramètres → Avancé → Mode d'expérience → Avancé</span>. Rien n'est perdu.</small>
    </div>
    <ol>
      <li><span class="path">Paramètres → Langue de l'application → Français</span>. Sinon, l'appli affiche « Movie » au lieu de « Film ».</li>
      <li><span class="path">Paramètres → Intégrations → TMDB</span> : <b>Langue → Français</b> (titres, résumés et logos en VF). Désactive <b>Bandes-annonces</b> : activé, Nuvio prend celles de TMDB, souvent en anglais, à la place de celles du Catalogue FR, qui sont en VF dès qu'une VF existe. Désactive aussi <b>Informations de base</b> pour voir quand arrivent les films à venir (« 📅 Dispo le 17 nov. » en tête du résumé), <b>Détails</b> pour garder « Entre deux saisons » sur les séries en pause (sinon Nuvio met « En cours »), et <b>Illustrations</b> pour garder les fonds en pleine définition et les logos en français du Catalogue FR.</li>
    </ol>
  </section>

  <section class="act" id="telephone">
    <header><span class="num">04</span><span class="label">Astuce</span><h2>Piloter depuis le téléphone</h2></header>
    <p class="lead">Les liens des addons sont longs : on ne les tape jamais à la télécommande.</p>
    <p class="note">Nuvio est installé sur un téléphone, une tablette ou un ordinateur ? Saute cette étape : tu colles les liens directement dans l'appli.</p>
    <ol>
      <li>Dans Nuvio sur la TV : <span class="path">Addons → Gérer depuis le téléphone</span>. Un QR code s'affiche.</li>
      <li>Scanne-le avec l'appareil photo du téléphone. Une page s'ouvre avec trois onglets : <b>Addons</b>, <b>Disposition de l'accueil</b> et <b>Collections</b>.</li>
      <li>Ouvre aussi ce guide sur le téléphone. À chaque étape, appuie sur <b>Copier</b>, puis colle le lien dans la page de Nuvio.</li>
    </ol>
  </section>

  <section class="act" id="comptes">
    <header><span class="num">05</span><span class="label">Comptes</span><h2>Créer ta clé</h2></header>
    <h3 class="sub-h">A · AllDebrid premium et sa clé API</h3>
    <p>Les addons de sources (Lumio, StreamFusion, Torrentio, WAStream) passent par un débrideur. Il t'en faut <b>au moins un</b> pour regarder quelque chose : les autres sont là au cas où le premier ne trouve rien. Le guide utilise AllDebrid.</p>
    <ol>
      <li>Crée un compte sur ${link(LINKS.allDebrid, "alldebrid.com")} et confirme ton adresse e-mail.</li>
      <li>Passe en <b>premium</b> sur ${link(LINKS.allDebridOffer, "la page des offres")} : sans premium, aucun addon ne fonctionne. <b>L'essai gratuit de 7 jours ne marche pas</b> avec les addons : il faut un vrai abonnement premium payant. Celui d'un mois suffit pour essayer.</li>
      <li>Ouvre ${link(LINKS.allDebridKeys, "la page des clés API")} (<span class="path">Mon compte → Clés API</span>), crée une clé et nomme-la « Nuvio ».</li>
      <li>Copie la clé et colle-la dans <a href="#trousseau">ton trousseau, juste en dessous</a> : le guide la met tout seul dans le lien de Torrentio, et la garde sous la main pour les autres addons de sources.</li>
    </ol>
    <p class="note">Certains addons proposent aussi « Se connecter avec AllDebrid » : tu valides un code sur alldebrid.com au lieu de coller la clé. Les deux marchent.</p>
    <div class="trousseau" id="trousseau">
      <h3 class="sub-h">B · Ton trousseau</h3>
      <p>Colle ta clé ici, une seule fois : le guide l'insère dans les liens des étapes suivantes. Elle reste gardée dans ce navigateur, sur cet appareil : elle n'est jamais envoyée à notre serveur.</p>
      <label class="keyfield" for="ad-key"><span>Ta clé AllDebrid</span><input id="ad-key" type="text" placeholder="la clé nommée « Nuvio »" autocomplete="off" spellcheck="false" autocapitalize="off"></label>
      <p class="etat-cles" id="etat-cles" role="status"></p>
      ${verifCleHTML()}
      <div class="trousseau-actions">
        <button type="button" class="vers-tel" id="cles-tel">Envoyer ma clé sur mon téléphone (QR code)</button>
        <button type="button" class="ca-changer" id="oublier-cle" hidden>Oublier ma clé</button>
      </div>
    </div>
    <p class="note warn">Tes clés sont personnelles : ne les publie pas et ne les envoie à personne. Ne partage pas non plus tes liens d'installation d'addons, ils contiennent ta clé AllDebrid.</p>
  </section>

  <section class="act" id="addons">
    <header><span class="num">06</span><span class="label">Le cœur</span><h2>Ajouter les addons, dans cet ordre</h2></header>
    <p class="lead">L'ordre compte : Nuvio interroge les addons de haut en bas. Pour chacun : configure-le sur son site, copie le lien d'installation qu'il te donne, puis colle-le dans <span class="path">Addons → Ajouter un addon</span> (ou depuis le téléphone).</p>
    <p class="note">Les addons marqués <b>Débrideur</b> (Lumio, StreamFusion, Torrentio, WAStream) donnent les sources : il en faut <b>au moins un</b>. Les autres sont un secours, au cas où le premier ne trouve rien pour un film ou un épisode.</p>
    <div class="compat-box" id="compatibilite">
      <h3>Avant tout : ce que ton appareil sait lire</h3>
      <p>Valable pour <b>tous les addons de sources</b> : Lumio, StreamFusion, Torrentio et WAStream. Dans chacun, exclus les qualités et les formats que ton appareil ne gère pas. Sinon : <b>écran vert ou violet</b>, <b>image saccadée</b> ou <b>pas de son</b>.</p>
      ${appareilsHTML()}
      <ul class="tips">
        <li><b>Écran vert ou violet</b> : la vidéo est en Dolby Vision et l'appareil ne le gère pas. Exclus Dolby Vision (ou garde seulement « DV + HDR10 »).</li>
        <li><b>Pas de son</b> : la piste est en DTS, DTS-HD ou TrueHD, que la plupart des Fire TV et des TV ne décodent pas sans ampli ou barre de son compatible. Exclus ces formats audio et garde AAC, AC3 ou E-AC3 (Dolby Digital Plus, qui inclut Atmos).</li>
        <li><b>Image qui saccade ou se coupe</b> : fichier trop lourd pour l'appareil ou la connexion. Limite la taille (ex. 15 Go pour un film) ou baisse en 1080p. Sur Wi-Fi, mieux vaut éviter les REMUX.</li>
        <li><b>Mouvements de caméra saccadés, sans chargement</b> : ce n'est pas le fichier. Le film est en 24 images/s et la TV l'affiche en 60 Hz. Sur Fire TV : <span class="path">Paramètres → Affichage et sons → Affichage → Faire correspondre la fréquence d'images d'origine</span> → activé.</li>
      </ul>
    </div>
    <div class="addons">
      <article class="addon">
        <header><h3>Catalogue FR</h3><span class="role">Accueil, Découvrir, recherche, fiches</span></header>
        <p>Les rangées d'accueil en français (saison, tendances, nouveautés sur tes plateformes…), les catalogues de Découvrir, la recherche (rangées « Films » et « Séries », titres en français, les plus connus d'abord) et les fiches des films et séries (résumé avec la date de dispo des films à venir, casting, saisons, épisodes, bande-annonce en VF quand elle existe). Pas de compte nécessaire, et plus besoin de TMDB Discover Plus.</p>
        <p>Pour les réglages conseillés, colle simplement ce lien. Pour choisir tes rangées, tes plateformes et tes filtres, personnalise-le sans quitter le guide : ton lien perso arrive ensuite dans cette carte. Astuce : sur ton billet, « Créer mon lien fixe » t'évite de réinstaller l'addon à chaque changement de réglages.</p>
        <p class="perso-actions"><button type="button" class="perso-btn" data-perso-ouvrir>Personnaliser mon catalogue</button></p>
        ${addonBox("u-cat", manifest)}
        <p class="small perso" data-perso hidden>C'est ton lien perso, repris de ta programmation. <button type="button" class="perso-lien" data-perso-ouvrir>Le modifier</button> · <button type="button" class="perso-lien" data-perso-retour>Revenir au lien conseillé</button></p>
        ${seanceHTML()}
      </article>
      <article class="addon">
        <header><h3>Lumio</h3><span class="role need">Débrideur</span></header>
        <p>Sources en français, déjà indexées : les liens s'affichent vite.</p>
        <ol>
          <li>Ouvre ${link(LINKS.lumio, "la page de Lumio")} et connecte AllDebrid (clé API ou code).</li>
          <li>Règle tes préférences (qualités, formats vidéo et audio) <b>selon ce que ton appareil sait lire</b> : voir <a href="#compatibilite">l'encadré plus haut</a>.</li>
          <li>Copie le lien d'installation (bouton en bas à droite) et ajoute-le dans Nuvio. Sur l'appareil où Nuvio est installé, son bouton d'installation l'ajoute directement.</li>
        </ol>
        ${consigne("lumio")}
        <div class="cle-ad" data-cle-ad hidden><p class="small">Ta clé AllDebrid, prête à coller :</p>${copyBox("u-ad-lumio", "")}</div>
      </article>
      <article class="addon">
        <header><h3>StreamFusion Reborn</h3><span class="role need">Débrideur</span></header>
        <p>Sources françaises complémentaires.</p>
        <ol>${sf}<li>Choisis AllDebrid, colle ta clé API et mets la langue sur Français.</li><li>Exclus les qualités et formats que ton appareil ne gère pas (<a href="#compatibilite">encadré plus haut</a>), puis copie le lien d'installation.</li></ol>
        ${consigne("streamfusion")}
        <div class="cle-ad" data-cle-ad hidden><p class="small">Ta clé AllDebrid, prête à coller :</p>${copyBox("u-ad-sf", "")}</div>
      </article>
      <article class="addon">
        <header><h3>Torrentio</h3><span class="role need">Débrideur</span></header>
        <p>Le grand classique, très complet, en complément des sources françaises.</p>
        <p class="note" id="torrentio-attente">Ton lien Torrentio se prépare tout seul : il manque <span id="torrentio-manque">ta clé AllDebrid (<a href="#trousseau">trousseau, étape 5</a>) et ton appareil (<a href="#compatibilite">encadré plus haut</a>)</span>.</p>
        <div id="torrentio-pret" hidden>
          <p>Ton lien est prêt : français en premier, sans le catalogue AllDebrid sur l'accueil, et sans ce que ton appareil ne sait pas lire. Colle-le dans Nuvio.</p>
          ${addonBox("u-torrentio", "")}
        </div>
        <details class="manual"><summary>Régler Torrentio à la main sur son site</summary>
        <ol>
          <li>Ouvre ${link(LINKS.torrentio, "la page de Torrentio")}.</li>
          <li><b>Priority foreign language</b> : French. <b>Debrid provider</b> : AllDebrid, puis colle ta clé API.</li>
          <li>Juste en dessous, dans les options du débrideur, <b>coche « Don't show debrid catalog »</b>. Sinon, Torrentio ajoute sur ton accueil un catalogue avec le contenu de ton compte AllDebrid.</li>
          <li><b>Exclude qualities</b> et <b>Max size</b> : selon ton appareil (<a href="#compatibilite">encadré plus haut</a>). Par exemple, sur un Fire TV Stick HD : exclure 4K, HDR, DV et limiter à 15 Go.</li>
          <li>Clique <b>Install</b>, puis <b>Copy link</b>, et colle le lien dans Nuvio.</li>
        </ol>
        </details>
      </article>
      <article class="addon">
        <header><h3>WAStream <span class="opt">Facultatif</span></h3><span class="role need">Débrideur</span></header>
        <p>Des sources en téléchargement direct converties par ton débrideur, utiles quand les autres ne trouvent rien.</p>
        <ol>${wa}<li>Choisis AllDebrid et colle ta clé API.</li><li>Exclus les qualités et formats que ton appareil ne gère pas (<a href="#compatibilite">encadré plus haut</a>), puis copie le lien d'installation.</li></ol>
        ${consigne("wastream")}
        <div class="cle-ad" data-cle-ad hidden><p class="small">Ta clé AllDebrid, prête à coller :</p>${copyBox("u-ad-wa", "")}</div>
      </article>
      <article class="addon">
        <header><h3>OpenSubtitles v3 <span class="opt">Facultatif</span></h3><span class="role">Sous-titres</span></header>
        <p>Les sous-titres français pour tout le reste. Pas de compte nécessaire : colle ce lien.</p>
        ${addonBox("u-os", LINKS.opensubtitles)}
        <p>Puis dans le lecteur : <span class="path">Paramètres → Sous-titres → Langue préférée → Français</span>.</p>
      </article>
    </div>
    <p class="note"><b>Plusieurs profils dans Nuvio ?</b> Installe les addons sur le profil principal. Pour chacun des autres : <span class="path">Paramètres → Profils → Gérer les profils</span>, choisis le profil, <b>Modifier</b>, puis active <b>Utiliser les addons principaux</b>. Ils partagent alors les mêmes addons, sans rien réinstaller.</p>
    <p class="small">Plus tard, si un addon change (nouvelles rangées, nouvelle saison…), pas besoin de le réinstaller : <span class="path">Addons → Actualiser les addons</span>.</p>
  </section>

  <aside class="entracte" aria-label="Entracte">
    <button type="button" class="vendeuse" aria-label="Acheter un esquimau à la vendeuse"><svg viewBox="0 0 48 72" aria-hidden="true"><g class="v-jambe-g"><rect x="19" y="50" width="4.4" height="18" rx="2" fill="#e9c9a8"/><path d="M17.5 68h7v3h-7z" rx="1" fill="#1b0d14"/></g><g class="v-jambe-d"><rect x="24.6" y="50" width="4.4" height="18" rx="2" fill="#e9c9a8"/><path d="M23.6 68h7v3h-7z" fill="#1b0d14"/></g><g class="v-haut"><path d="M14 31q10-6 20 0l3.5 22h-27z" fill="#c2352f"/><path d="M14 31q10-6 20 0l1 6q-11-4-22 0z" fill="#a82b26"/><path d="M24 31v21" stroke="#8f2420" stroke-width="1"/><g fill="#ffcf6b"><circle cx="21.6" cy="37" r=".9"/><circle cx="21.6" cy="42" r=".9"/><circle cx="26.4" cy="37" r=".9"/><circle cx="26.4" cy="42" r=".9"/></g><path d="M21 27h6l-.5 5h-5z" fill="#d9a57a"/><path d="M19.5 30l4.5 3 4.5-3" stroke="#f5ead8" stroke-width="1.4" fill="none"/><circle cx="24" cy="20" r="7.5" fill="#e3b088"/><path d="M16 21q-1.2-11.5 8-11.5t8 11.5q-1.4-6.5-8-6.5t-8 6.5z" fill="#3a2418"/><path d="M16.4 19q-1.4 7 1.6 9.5M31.6 19q1.4 7-1.6 9.5" stroke="#3a2418" stroke-width="3.2" fill="none" stroke-linecap="round"/><rect x="18.5" y="8.4" width="11" height="4.4" rx="1.6" fill="#c2352f"/><rect x="18.5" y="11" width="11" height="1.2" fill="#ffcf6b"/><circle cx="21.3" cy="20.4" r=".95" fill="#2a1a14"/><circle cx="26.7" cy="20.4" r=".95" fill="#2a1a14"/><circle cx="19.6" cy="23" r="1.4" fill="rgba(229,65,58,.32)"/><circle cx="28.4" cy="23" r="1.4" fill="rgba(229,65,58,.32)"/><path d="M22 24q2 1.7 4 0" stroke="#8f2420" stroke-width="1" fill="none" stroke-linecap="round"/><path d="M17.5 31.5L6 42M30.5 31.5L42 42" stroke="#f5ead8" stroke-width="1.1"/><g><rect x="6.5" y="33" width="5.5" height="8" rx="2.4" fill="#5a2e16"/><rect x="14.5" y="33" width="5.5" height="8" rx="2.4" fill="#6b3a1e"/><rect x="28" y="33" width="5.5" height="8" rx="2.4" fill="#5a2e16"/><rect x="36" y="33" width="5.5" height="8" rx="2.4" fill="#6b3a1e"/><path d="M8 35h2.5M16 35h2.5M29.5 35h2.5M37.5 35h2.5" stroke="rgba(255,255,255,.25)" stroke-width=".8"/></g><rect x="3" y="40.5" width="42" height="5.5" rx="1.6" fill="#f5ead8"/><rect x="3" y="44.2" width="42" height="1.8" fill="#cdbca5"/><circle cx="4.5" cy="42.5" r="1.9" fill="#e3b088"/><circle cx="43.5" cy="42.5" r="1.9" fill="#e3b088"/></g></svg><span class="v-bulle"></span></button>
    <div class="cornet" aria-hidden="true"><i></i><i></i><i></i></div>
    <div><p class="titre">Entracte</p><p>La moitié est faite, et c'était la plus longue. Va te chercher du pop-corn : la suite va vite.</p></div>
  </aside>

  <section class="act" id="collections">
    <header><span class="num">07</span><span class="label">Grand écran</span><h2>Importer les collections</h2></header>
    <p class="lead">Les grandes tuiles en haut de l'accueil : Plateformes, Genres, J'ai envie de…, Sagas et Studios.</p>
    <p class="note"><b>Tu as un compte Nuvio ?</b> <a href="${esc(origin)}/compte-nuvio" data-compte-nuvio target="_blank" rel="noopener">Tout envoyer dans Nuvio</a> : l'addon, ces collections et les affiches de la TV (étape 8) arrivent tout seuls, sans rien coller. Sinon, suis les étapes ci-dessous.</p>
    <ol>
      <li>Appuie sur « Copier le contenu (PC/TEL) » sous le lien : il copie tout le contenu du lien.</li>
      <li>Dans Nuvio, sur le téléphone (étape 4) comme sur PC, ouvre l'onglet <b>Collections</b> et appuie sur le <b>bouton presse-papiers</b>, en haut à droite : Nuvio importe ce que tu viens de copier.</li>
      <li>Sur le téléphone, coller le lien marche aussi (<span class="path">Collections → Importer → URL</span>). Sur PC, seul le contenu passe.</li>
      <li>Si tu as personnalisé ton catalogue à l'étape 6, le guide a déjà mis ton lien perso.</li>
    </ol>
    ${copyBox("u-coll", origin + "/collections.json")}
    <button type="button" class="contenu" data-copy-contenu="u-coll">Copier le contenu (PC/TEL)</button>
    <textarea class="contenu-txt" id="u-coll-contenu" readonly hidden aria-label="Contenu du lien des collections"></textarea>
    <p class="small perso" data-perso hidden>C'est ton lien perso, repris de ta programmation (étape 6).</p>
  </section>

  <section class="act" id="affiches">
    <header><span class="num">08</span><span class="label">Finitions</span><h2>Les affiches maison</h2></header>
    <p class="lead">Le logo du titre, sa note, son genre et son année, et quand il y a lieu son rang dans les tendances du jour et sa qualité (4K, DV, HDR). Le lien est le même pour tout le monde.</p>
    <p class="note">Envie de choisir ce qui s'affiche dessus, et comment ? <a href="${esc(origin)}/configure#regie">Régler mes affiches</a> ouvre la régie de la salle 2 : le lien ci-dessous devient alors le tien, sur cet appareil.</p>
    <div class="copy long"><code id="u-poster">${esc(POSTER_URL)}</code><button type="button" data-copy="u-poster">Copier</button></div>
    <ol>
      <li>Dans Nuvio : <span class="path">Paramètres → Disposition → Custom Poster Source</span>. Le plus simple : <b>Configure via Phone</b>, puis colle le lien depuis ton téléphone.</li>
      <li>En dessous, dans « Apply to », laisse tout activé (Home, Collections, Library, Search, Details Screen…). Les affiches se mettent à jour au fil de la navigation.</li>
    </ol>
    <p class="small">Sur iPhone, le lien se colle souvent abîmé : <code>%7Btype%7D/%7Bshape%7D…</code> au lieu de <code>{type}/{shape}…</code>. Nuvio TV n'applique alors tes affiches qu'en portrait, jamais en paysage. Vérifie les accolades avant d'enregistrer, ou ouvre la page « Configure via Phone » sur ton ordinateur et colle le lien depuis là.</p>
  </section>


  <section class="act" id="reglages">
    <header><span class="num">09</span><span class="label">Réglages fins</span><h2>Les réglages conseillés</h2></header>
    <p class="lead">Le reste des paramètres, écran par écran, tels qu'ils sont réglés sur le Fire TV de test. Suis le cadre rouge et recopie : quand une bulle <span class="tag-adapt">À adapter</span> apparaît, le réglage dépend de ta TV, de ta barre de son ou de tes goûts.</p>
    ${reglagesHTML(POSTER_URL)}
    <p class="small">Touche l'écran pour mettre en pause, les flèches passent d'un réglage à l'autre et les onglets sautent directement à un écran.</p>
    <p class="note">Un réglage n'apparaît pas ? Passe en mode <b>Avancé</b> (Paramètres → Avancé → Mode d'expérience). Les noms à moitié en anglais sont normaux : la traduction de Nuvio n'est pas complète.</p>
  </section>

  <section class="act" id="ranger">
    <header><span class="num">10</span><span class="label">Mise en scène</span><h2>Ranger l'accueil</h2></header>
    <p><button type="button" class="voir-resultat" data-resultat>${ICONE_APERCU}Voir à quoi ressemble l'accueil terminé</button></p>
    <p><span class="path">Paramètres → Réorganiser les catalogues de l'accueil</span> → active <b>Suivre l'ordre des addons</b>.</p>
    <p class="note">C'est tout : le reste est déjà dans le bon ordre. Plateformes est épinglée tout en haut, puis viennent les rangées du Catalogue FR, puis Genres, J'ai envie de…, Sagas et Studios. Une collection n'est pas à sa place (importée avec une ancienne version) ? Déplace-la dans ce même écran, ou depuis le téléphone, onglet « Disposition de l'accueil ».</p>
    <p class="note">Tu as réinstallé le Catalogue FR et ses rangées sont passées tout en bas, sous les collections ? C'est normal : Nuvio range l'accueil addon par addon, et pour lui c'est un nouvel addon. Dans ce même écran, fais descendre d'un cran <b>Studios</b>, puis <b>Sagas</b>, puis <b>J'ai envie de…</b>, puis <b>Genres</b> : chacune saute sous les rangées du Catalogue FR, et l'ordre est rétabli.</p>
  </section>

  <section class="act" id="tester">
    <header><span class="num">11</span><span class="label">Moteur !</span><h2>Lancer un premier film</h2></header>
    <ol>
      <li>Ouvre un film depuis l'accueil, puis <b>Regarder</b> : la liste des sources s'affiche.</li>
      <li>Choisis une source marquée <b>FR</b>, <b>VFF</b>, <b>MULTI</b> ou <b>TRUEFRENCH</b> pour la VF. Les sources « en cache » chez ton débrideur démarrent tout de suite.</li>
      <li>Pendant la lecture, l'icône sous-titres permet de choisir des sous-titres français.</li>
    </ol>
  </section>

  <section class="act faq" id="depannage">
    <header><span class="num">12</span><span class="label">Coulisses</span><h2>En cas de souci</h2></header>
    <div class="pupitre" id="pupitre" hidden>
      <p class="pu-plaque">Panneau de la cabine · où ça coince ?</p>
      <p class="lead">Un incident de projection ? Allume le voyant de l'endroit où ça coince : seules les pannes qui s'y produisent restent à l'écran.</p>
      <div class="pu-voyants" role="group" aria-label="Où ça coince ?">
        <button type="button" class="voyant" data-moment="accueil" aria-pressed="false"><i class="lampe"></i><b>À l'accueil</b><small></small></button>
        <button type="button" class="voyant" data-moment="fiche" aria-pressed="false"><i class="lampe"></i><b>Sur une fiche</b><small></small></button>
        <button type="button" class="voyant" data-moment="recherche" aria-pressed="false"><i class="lampe"></i><b>En cherchant</b><small></small></button>
        <button type="button" class="voyant" data-moment="lecture" aria-pressed="false"><i class="lampe"></i><b>Pour regarder</b><small></small></button>
        <button type="button" class="voyant" data-moment="profils" aria-pressed="false"><i class="lampe"></i><b>Sur un autre profil</b><small></small></button>
      </div>
      <p class="pu-etat" id="pu-etat" aria-live="polite"></p>
    </div>
    ${photoHTML(origin)}
    ${pannesHTML()}
    <div class="rembobinage" id="rembobinage">
      <svg class="rb-bobine" viewBox="0 0 80 80" aria-hidden="true"><circle class="rb-film" cx="40" cy="40" r="12"/><g class="rb-tourne"><circle cx="40" cy="40" r="36"/><path d="M40 33V4M33.9 43.5L8.8 58M46.1 43.5L71.2 58"/><circle cx="40" cy="40" r="7"/></g></svg>
      <div class="rb-texte">
        <h3>Toujours pas ? Le grand rembobinage</h3>
        <p>Quatre gestes, du plus léger au plus radical, qui règlent la plupart des pannes. Coche-les au fur et à mesure : la bobine se rembobine.</p>
        <ul class="rb-gestes">
          <li><label><input type="checkbox"><span>Dans <span class="path">Addons</span>, appuie sur <b>Actualiser les addons</b> : Nuvio récupère tout de suite leurs dernières modifications.</span></label></li>
          <li><label><input type="checkbox"><span>Force l'arrêt de Nuvio, puis relance-le.</span></label></li>
          <li><label><input type="checkbox"><span>Vérifie que ton abonnement AllDebrid <b>premium</b> est actif (étape 5) : l'essai gratuit de 7 jours ne suffit pas.</span></label></li>
          <li><label><input type="checkbox"><span>Retire le Catalogue FR et rajoute-le avec le lien de l'étape 6.</span></label></li>
        </ul>
        <p class="rb-fin" id="rb-fin" hidden>Bobine rembobinée : relance le film, la séance reprend.</p>
      </div>
    </div>
  </section>

  <section class="diplome-box" id="diplome" aria-label="Diplôme de projectionniste" hidden>
    <p class="titre">Bravo, la séance peut commencer !</p>
    <p>Tu as fait toutes les étapes : tu mérites ton diplôme de projectionniste.</p>
    <div class="row"><input id="dip-nom" type="text" maxlength="30" placeholder="Ton prénom" autocomplete="given-name" aria-label="Ton prénom, écrit sur le diplôme"><button type="button" class="btn" id="dip-btn">Télécharger mon diplôme</button></div>
  </section>

  <div class="sortie-wrap">
    <a class="sortie" href="${esc(origin)}/configure" data-programmation>
      <svg viewBox="0 0 30 30" aria-hidden="true"><circle cx="17" cy="5" r="3" fill="currentColor"/><path d="M15 9l-5 4 1 5 3-3 2 5-4 7h3l3-6 3 2v5h3v-7l-4-3 1-4 3 3h4v-3h-3l-4-5z" fill="currentColor"/></svg>
      <span><b>Sortie</b><span>Retour à ta programmation</span></span>
    </a>
    <a class="btn ghost" href="#avant">Revenir au début</a>
  </div>
</div>
${SEATS_HTML}
${CREDITS_HTML}

<button type="button" class="pot away" id="pot" aria-label="Pot de pop-corn plein : clique pour le remplir"><i class="p-interieur"><i class="p-mais"></i></i><i class="p-seau"></i></button>
<div class="ouvreuse" id="ouvreuse" aria-hidden="true"><svg viewBox="0 0 50 86" aria-hidden="true"><g class="o-jambe-g"><rect x="19.5" y="58" width="4.4" height="24" rx="2" fill="#2a1a14"/><path d="M18 82h7.5v3H18z" fill="#12070b"/></g><g class="o-jambe-d"><rect x="25" y="58" width="4.4" height="24" rx="2" fill="#2a1a14"/><path d="M24 82h7.5v3H24z" fill="#12070b"/></g><g class="o-haut"><path d="M13.5 33q10.5-6 21 0l3 27h-27z" fill="#6d1420"/><path d="M13.5 33q10.5-6 21 0l1 7q-11.5-4.5-23 0z" fill="#5a0f1b"/><path d="M10.5 56h27l1 4h-29z" fill="#4a0c15"/><g fill="#ffcf6b"><circle cx="22" cy="39" r=".95"/><circle cx="22" cy="44" r=".95"/><circle cx="22" cy="49" r=".95"/><circle cx="26.5" cy="39" r=".95"/><circle cx="26.5" cy="44" r=".95"/><circle cx="26.5" cy="49" r=".95"/></g><path d="M17 34.5l-2.5 3M31.5 34.5l2.5 3" stroke="#ffcf6b" stroke-width="1.6" stroke-linecap="round"/><path d="M21.3 29h6l-.5 5.5h-5z" fill="#d9a57a"/><circle cx="24.3" cy="21" r="7.6" fill="#e3b088"/><path d="M16.3 22q-1.2-11.8 8-11.8t8 11.8q-1.4-6.6-8-6.6t-8 6.6z" fill="#24100f"/><path d="M16.7 20q-1.4 7.4 1.6 10M31.9 20q1.2 6-.6 8" stroke="#24100f" stroke-width="3.2" fill="none" stroke-linecap="round"/><rect x="19" y="9.2" width="11" height="4.4" rx="1.6" fill="#6d1420"/><rect x="19" y="11.8" width="11" height="1.2" fill="#ffcf6b"/><circle cx="23" cy="21.5" r=".95" fill="#2a1a14"/><circle cx="28.2" cy="21.5" r=".95" fill="#2a1a14"/><circle cx="30" cy="24" r="1.4" fill="rgba(229,65,58,.3)"/><path d="M24.4 25.2q2 1.5 3.9 0" stroke="#8f2420" stroke-width="1" fill="none" stroke-linecap="round"/><path d="M32 37q8 1.5 13 3" stroke="#6d1420" stroke-width="4" stroke-linecap="round" fill="none"/><circle cx="45" cy="40.2" r="2.2" fill="#e3b088"/><rect x="42.5" y="37.6" width="7" height="4.6" rx="1.2" fill="#3a2418"/><rect x="48.6" y="37.2" width="1.6" height="5.4" rx=".6" fill="#fff3cf"/></g></svg><i class="o-lampe"></i><span class="o-bulle"></span></div>
<div class="o-faisceau" id="o-faisceau" aria-hidden="true"></div>
<div class="reel-nav away" id="reel-nav">
  <nav class="reel-menu" id="reel-menu" aria-label="Aller à une étape" hidden></nav>
  <button type="button" class="reel-btn" id="reel-btn" aria-expanded="false" aria-controls="reel-menu">
    <svg viewBox="0 0 42 42" aria-hidden="true"><circle class="ring" id="reel-ring" cx="21" cy="21" r="20" pathLength="100" stroke-dasharray="0 100"/><g class="spin" id="reel-spin"><circle class="disc" cx="21" cy="21" r="17.6"/><circle class="hole" cx="21" cy="10.5" r="4.6"/><circle class="hole" cx="31" cy="17.8" r="4.6"/><circle class="hole" cx="27.2" cy="29.5" r="4.6"/><circle class="hole" cx="14.8" cy="29.5" r="4.6"/><circle class="hole" cx="11" cy="17.8" r="4.6"/><circle class="hub" cx="21" cy="21" r="2.6"/></g></svg>
    <span><b id="reel-n">01</b> / <span id="reel-total">12</span><small id="reel-t">Ce qu'il te faut</small></span>
  </button>
</div>

<script>const ORIG = ${JSON.stringify(origin)}, ORIGINE = ORIG;</script>
${scripts("liens.js", "outils.js", "guide.js", "scene.js")}
<script>${apercuDonnees(origin, apercus)}</script>
${scripts("nuvio.js", "apercu.js", "reglages.js")}
<script>
// Étape 8 : le lien d'affiches de cet appareil, avec ce qui a été choisi en salle 2 (« Tes affiches »).
if (window.NV) document.getElementById("u-poster").textContent = NV.lienPerso();
</script>
${scripts("guide-fin.js", "guide-verifs.js")}
</body>
</html>`;
}

// Les styles et les scripts du guide, les mêmes pour tous : servis à part (statique.js), gardés en cache par le
// navigateur. Dans la page, dans cet ordre : guide.css, apercu.css, nuvio.css, reglages.css, guide-reclames.css,
// scene.css, guide-fin.css.
export const GUIDE_CSS = `/* Le programme de la séance : une colonne de lecture, chaque étape est un « acte » numéroté. */
:root {
  --foyer-w: 1180px;
  --velvet: #170c12; --velvet-2: #22121b; --seat: #3d2230; --cream: #f5ead8; --dim: #b9a59c;
  --bulb: #ffcf6b; --red: #e5413a; --ink: #2a1a14; --green: #5fd39a;
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
body {
  position: relative; color: var(--cream); font: 16px/1.6 var(--body);
  background: radial-gradient(ellipse 80% 40% at 50% -5%, rgba(229,65,58,.22), transparent 70%), repeating-linear-gradient(90deg, rgba(0,0,0,.18) 0 2px, transparent 2px 46px), var(--velvet);
  padding: max(104px, calc(env(safe-area-inset-top) + 92px)) max(16px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
}
body::after { content: ""; position: fixed; inset: -50%; pointer-events: none; z-index: 50; opacity: .07; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  animation: grain 1.2s steps(6) infinite; }
@keyframes grain { 0%{transform:translate(0,0)} 25%{transform:translate(-3%,2%)} 50%{transform:translate(2%,-3%)} 75%{transform:translate(3%,3%)} 100%{transform:translate(0,0)} }
.valance { position: absolute; inset: 0 0 auto; height: 74px; pointer-events: none;
  background: radial-gradient(ellipse 34px 30px at 34px 0, #6d1420 0 28px, transparent 29px) 0 46px / 68px 32px repeat-x, repeating-linear-gradient(90deg, rgba(0,0,0,.28) 0 3px, transparent 3px 22px, rgba(255,255,255,.04) 22px 24px, transparent 24px 34px), linear-gradient(#4a0c15, #7a1824 70%, #5a0f1a);
  -webkit-mask: linear-gradient(#000, #000) top / 100% 48px no-repeat, radial-gradient(ellipse 34px 30px at 34px 0, #000 28px, transparent 29px) 0 46px / 68px 32px repeat-x;
          mask: linear-gradient(#000, #000) top / 100% 48px no-repeat, radial-gradient(ellipse 34px 30px at 34px 0, #000 28px, transparent 29px) 0 46px / 68px 32px repeat-x;
  filter: drop-shadow(0 8px 10px rgba(0,0,0,.5)); }
.valance::after { content: ""; position: absolute; left: 0; right: 0; top: 40px; height: 6px; background: repeating-linear-gradient(90deg, #d9a441 0 6px, #8a5f1a 6px 9px); }
a { color: var(--bulb); font-weight: 700; text-underline-offset: 3px; }
:focus-visible { outline: 3px solid var(--bulb); outline-offset: 3px; border-radius: 6px; }

.wrap { max-width: 860px; margin: 0 auto; display: grid; gap: 26px; }
.hero { position: relative; text-align: center; display: grid; gap: 14px; justify-items: center; }
.hero .marquee { margin-bottom: 4px; }
.hero h1 { font-size: clamp(2.6rem, 9vw, 5rem); text-wrap: balance; }
.hero .tagline { margin: 0; font: italic 400 1.45rem/1.25 var(--serif); color: var(--bulb); }
.hero p { margin: 0; max-width: 60ch; color: var(--dim); }
.facts { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.facts span { font: 700 .82rem var(--body); padding: 7px 12px; border-radius: 99px; border: 1px solid var(--seat); background: var(--velvet-2); color: var(--cream); }

.toc { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 6px 18px; background: var(--velvet-2); border: 1px solid var(--seat); border-radius: 16px; padding: 18px 20px; counter-reset: toc; }
.toc a { color: var(--cream); font-weight: 600; text-decoration: none; display: flex; gap: 10px; align-items: baseline; padding: 3px 0; }
.toc a::before { counter-increment: toc; content: counter(toc, decimal-leading-zero); font: 400 1.1rem var(--display); color: var(--bulb); min-width: 2ch; }
.toc a:hover { color: var(--bulb); }

.act { position: relative; background: var(--velvet-2); border: 1px solid var(--seat); border-radius: 18px; padding: 24px; display: grid; gap: 14px; scroll-margin-top: 20px; overflow: hidden; }
.act::before { content: ""; position: absolute; inset: 0 0 auto; height: 2px; background: linear-gradient(90deg, transparent, rgba(255,207,107,.5), transparent); }
.act > header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 4px 16px; align-items: end; }
/* L'étiquette et le titre restent toujours dans la colonne du milieu, l'un sous l'autre. */
.act > header .label { grid-column: 2; grid-row: 1; } .act > header h2 { grid-column: 2; grid-row: 2; }
.act .num { grid-row: span 2; position: relative; isolation: isolate; width: 84px; height: 84px; display: grid; place-items: center; border-radius: 50%;
  font: 400 2.9rem/1 var(--display); padding-top: 4px; color: var(--bulb); text-shadow: 0 0 20px rgba(255,207,107,.35);
  background:
    radial-gradient(circle, transparent 0 57%, rgba(255,207,107,.55) 58% 60%, transparent 61% 68%, rgba(255,207,107,.22) 69% 70%, transparent 71%),
    linear-gradient(rgba(255,207,107,.16), rgba(255,207,107,.16)) center / 1px 100% no-repeat,
    linear-gradient(rgba(255,207,107,.16), rgba(255,207,107,.16)) center / 100% 1px no-repeat,
    var(--velvet); }
/* Amorce de film : le secteur balaie le cercle une fois, à l'arrivée sur l'étape. */
.act .num::before { content: ""; position: absolute; inset: 0; border-radius: 50%; z-index: -1; background: conic-gradient(rgba(255,207,107,.32) var(--sweep), transparent 0); }
.act.rolling .num::before { animation: leader .9s linear; }
.act.rolling .num { animation: leader-num .9s steps(1); }
@keyframes leader { from { --sweep: 0deg; } to { --sweep: 360deg; } }
@keyframes leader-num { 0% { opacity: .35; } 100% { opacity: 1; } }
.act .label { font: 700 .74rem var(--type); letter-spacing: .14em; text-transform: uppercase; color: #fff; background: var(--red); padding: 3px 8px 2px; border-radius: 3px; justify-self: start; transform: rotate(-2deg); }
.act h2 { margin: 0; font: 400 2.2rem/1 var(--display); letter-spacing: .03em; text-wrap: balance; }
.act .lead { margin: 0; font: 400 1.15rem/1.45 var(--serif); color: #d6c3b8; }
.act .lead b { font-weight: 400; color: var(--cream); }   /* le serif n'a qu'une graisse : pas de faux gras */
.act p { margin: 0; }
.sub-h { margin: 6px 0 0; font: 800 .8rem var(--body); letter-spacing: .18em; text-transform: uppercase; color: var(--bulb); }
.act ol, .act ul { margin: 0; padding-left: 1.3em; display: grid; gap: 7px; }
.act li::marker { color: var(--bulb); font-weight: 800; }
.path { font-weight: 800; color: #fff; background: rgba(255,255,255,.06); border-radius: 5px; padding: 0 5px; }
.opt { font: 800 .66rem var(--body); letter-spacing: .14em; text-transform: uppercase; color: var(--ink); background: var(--bulb); border-radius: 4px; padding: 2px 6px; vertical-align: 4px; }

/* Choix de l'appareil : une carte par appareil, avec son icône. */
.appareils { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: 8px; }
.appareils button { position: relative; display: grid; justify-items: center; gap: 2px; padding: 14px 8px 12px; border-radius: 12px; cursor: pointer; text-align: center;
  border: 1px solid var(--seat); background: var(--velvet); color: var(--cream); transition: border-color .2s ease, background .2s ease, transform .2s ease; }
.appareils button:hover { border-color: rgba(255,207,107,.5); transform: translateY(-2px); }
.appareils svg { width: 30px; height: 30px; margin-bottom: 4px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; color: var(--bulb); }
.appareils b { font: 800 .9rem/1.2 var(--body); }
.appareils small { font-size: .74rem; color: var(--dim); }
.appareils .claude-dispo { position: absolute; top: 6px; right: 6px; font: normal 800 .58rem var(--body); letter-spacing: .04em; padding: 2px 5px; border-radius: 99px; background: rgba(255,207,107,.14); color: var(--bulb); }
.appareils button[aria-selected="true"] { background: var(--cream); border-color: var(--cream); color: var(--ink); box-shadow: 0 0 0 3px rgba(255,207,107,.35); }
.appareils button[aria-selected="true"] svg { color: var(--red); }
.appareils button[aria-selected="true"] small { color: #7a5a4c; }
.appareils button[aria-selected="true"] .claude-dispo { background: var(--ink); color: var(--cream); }
/* À la main ou avec Claude */
.modes { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 5px; border-radius: 12px; background: rgba(0,0,0,.28); border: 1px solid var(--seat); }
.modes button { display: grid; gap: 1px; padding: 9px 10px; border: 0; border-radius: 9px; background: transparent; color: var(--dim); cursor: pointer; text-align: center; }
.modes button b { font: 800 .92rem var(--body); }
.modes button small { font-size: .74rem; }
.modes button[aria-pressed="true"] { background: var(--bulb); color: var(--ink); }
.mode-pane { display: grid; gap: 10px; }
@media (max-width: 520px) { .appareils { grid-template-columns: repeat(2, 1fr); } }
.panel { display: grid; gap: 10px; }

.addons { display: grid; gap: 12px; counter-reset: ad; }
.addon { border: 1px solid var(--seat); border-radius: 14px; background: var(--velvet); padding: 16px 18px; display: grid; gap: 10px; }
.addon > header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.addon > header::before { counter-increment: ad; content: counter(ad); font: 400 1.6rem/1 var(--display); color: var(--ink); background: var(--bulb); width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; flex: none; padding-top: 3px; }
.addon h3 { margin: 0; font: 800 1.12rem var(--body); }
.addon .role { font: 700 .72rem var(--body); letter-spacing: .14em; text-transform: uppercase; color: var(--dim); }
.addon .role.need { color: var(--bulb); }

.copy { display: grid; grid-template-columns: minmax(0, 1fr) auto; background: #0f080c; border: 1px solid var(--seat); border-radius: 10px; overflow: hidden; }
.copy code { font: 400 .82rem/1.45 var(--type); padding: 11px 13px; overflow-x: auto; white-space: nowrap; min-width: 0; user-select: all; color: #f0e2cf; }
.copy button { font: 800 .85rem var(--body); border: 0; background: var(--cream); color: var(--ink); padding: 0 16px; cursor: pointer; min-width: 92px; }
.copy button:hover { background: var(--bulb); }
.copy.long code { white-space: normal; word-break: break-all; max-height: 7.5em; overflow-y: auto; }
/* Blocs de commandes : une commande par ligne. */
.copy.long code.lignes { white-space: pre-wrap; max-height: none; }
/* Du PC au téléphone : un QR code à côté de chaque lien, et le lien reçu sur le téléphone. */
.copy .qr-btn { display: none; min-width: 0; padding: 0 12px; background: #2a1520; color: var(--bulb); border-left: 1px solid var(--seat); }
.copy .qr-btn:hover { background: #3a1d2b; }
.copy .qr-btn svg { width: 20px; height: 20px; display: block; }
.contenu { justify-self: start; font: 800 .86rem var(--body); padding: 8px 14px; border-radius: 99px; border: 1px solid rgba(255,207,107,.45); background: transparent; color: var(--bulb); cursor: pointer; }
.contenu:hover { background: rgba(255,207,107,.1); }
/* Copie bloquée par le navigateur : le contenu s'affiche, déjà sélectionné, pour le copier à la main. */
.contenu-txt { width: 100%; height: 9em; resize: vertical; padding: 11px 13px; border-radius: 10px; border: 1px solid var(--seat); background: #0f080c; color: #f0e2cf; font: 400 .78rem/1.45 var(--type); }
.vers-tel { display: none; font: 800 .86rem var(--body); padding: 8px 14px; border-radius: 99px; border: 1px solid rgba(255,207,107,.45); background: transparent; color: var(--bulb); cursor: pointer; }
@media (hover: hover) and (pointer: fine) and (min-width: 700px) {
  .copy { grid-template-columns: minmax(0, 1fr) auto auto; }
  .copy .qr-btn { display: block; }
  .vers-tel { display: inline-flex; align-items: center; gap: 8px; }
}
.qr-modal { position: fixed; inset: 0; z-index: 88; display: grid; place-items: center; padding: 16px; background: rgba(5,3,4,.84); animation: rise .25s ease both; }
.qr-modal .boite { position: relative; display: grid; gap: 12px; justify-items: center; text-align: center; width: min(420px, 100%); padding: 24px; border-radius: 18px; background: var(--velvet-2); border: 1px solid rgba(255,207,107,.35); box-shadow: 0 30px 80px rgba(0,0,0,.7); }
.qr-modal h2 { margin: 0; font: 400 1.8rem/1 var(--display); letter-spacing: .03em; color: var(--bulb); }
.qr-modal .code-qr { width: 270px; height: 270px; padding: 12px; border-radius: 12px; background: #fff; }
.qr-modal .code-qr svg { width: 100%; height: 100%; display: block; }
.qr-modal p { margin: 0; color: #e6d6c8; font-size: .95rem; }
.qr-modal small { color: var(--dim); max-width: 34ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 400 .78rem var(--type); }
.qr-modal .fermer { position: absolute; top: 10px; right: 10px; width: 32px; height: 32px; border-radius: 50%; border: 0; background: rgba(255,255,255,.08); color: var(--cream); font: 800 1.1rem/1 var(--body); cursor: pointer; }

/* Le choix de l’appareil : des cartes par famille, repliées sur l’appareil choisi et sa configuration. */
.choix-appareil { display: grid; gap: 10px; }
.ca-titre { margin: 0; font: 700 .72rem var(--body); letter-spacing: .2em; text-transform: uppercase; color: var(--dim); }
.ca-liste { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.ca-famille { grid-column: 1 / -1; margin: 8px 0 0; font: 800 .74rem var(--body); letter-spacing: .16em; text-transform: uppercase; color: var(--bulb); }
.ca-famille:first-child { margin-top: 0; }
.ca-carte { position: relative; display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px;
  border: 1px solid var(--seat); background: var(--velvet); color: var(--cream); cursor: pointer; transition: border-color .2s ease, background-color .2s ease, box-shadow .2s ease; }
.ca-carte:hover { border-color: rgba(255,207,107,.5); }
.ca-carte input { position: absolute; inset: 0; margin: 0; opacity: 0; cursor: pointer; }
.ca-carte:focus-within { outline: 2px solid var(--bulb); outline-offset: 2px; }
.ca-carte svg { width: 30px; height: 30px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; color: var(--bulb); }
.ca-carte svg circle { fill: currentColor; stroke: none; }
.ca-nom { display: grid; gap: 2px; font: 800 .95rem/1.25 var(--body); }
.ca-nom small { font: 400 .8rem/1.35 var(--body); color: var(--dim); }
.ca-q { font: normal 700 .78rem var(--type); color: var(--bulb); padding: 3px 7px; border-radius: 6px; border: 1px solid rgba(255,207,107,.35); white-space: nowrap; }
.ca-carte.on { background: var(--cream); border-color: var(--cream); color: var(--ink); box-shadow: 0 0 0 3px rgba(255,207,107,.35); }
.ca-carte.on small { color: #6b4c3e; }
.ca-carte.on svg { color: var(--red); }
.ca-carte.on .ca-q { color: var(--ink); border-color: rgba(42,26,20,.3); }
.ca-carte[hidden], .ca-famille[hidden], .ma-conf[hidden] { display: none; }
.choix-appareil.replie .ca-liste { grid-template-columns: minmax(0, 1fr); }
.choix-appareil.replie .ca-carte.on { animation: ca-pose .4s cubic-bezier(.16,1,.3,1); }
.choix-appareil.replie .ca-aide { display: none; }
@keyframes ca-pose { from { transform: scale(.97); box-shadow: 0 0 0 10px rgba(255,207,107,0); } }
.ma-conf { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: start; padding: 12px 14px; border-radius: 12px; border: 1px dashed rgba(255,207,107,.45); animation: rise .3s ease both; }
.ma-conf dl { margin: 0; display: grid; gap: 8px; }
.ma-conf dl div { display: grid; grid-template-columns: 8.5em minmax(0, 1fr); gap: 10px; }
.ma-conf dt { font: 700 .7rem var(--body); letter-spacing: .14em; text-transform: uppercase; color: var(--dim); padding-top: 3px; }
.ma-conf dd { margin: 0; color: var(--cream); }
.ca-changer { font: 800 .85rem var(--body); padding: 8px 14px; border-radius: 99px; border: 1px solid rgba(255,207,107,.45); background: transparent; color: var(--bulb); cursor: pointer; white-space: nowrap; }
.ca-changer:hover { background: rgba(255,207,107,.1); }
@media (max-width: 620px) {
  .ca-liste { grid-template-columns: minmax(0, 1fr); }
  .ma-conf { grid-template-columns: minmax(0, 1fr); }
  .ma-conf dl div { grid-template-columns: minmax(0, 1fr); gap: 2px; }
  .ca-changer { justify-self: start; }
}
@media (prefers-reduced-motion: reduce) { .choix-appareil.replie .ca-carte.on, .ma-conf { animation: none; } }
.tips { display: grid; gap: 8px; }
.first-run { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 14px 22px; align-items: center; padding: 18px 20px; border-radius: 14px;
  background: linear-gradient(135deg, rgba(229,65,58,.14), rgba(229,65,58,.04)); border: 1px solid rgba(229,65,58,.4); color: #eadacd; }
.first-run p { margin: 0; line-height: 1.55; }
.first-run .pick { font-weight: 800; color: var(--ink); background: var(--bulb); padding: 1px 8px; border-radius: 5px; white-space: nowrap; }
.first-run small { grid-column: 1 / -1; display: block; padding-top: 12px; border-top: 1px dashed rgba(255,207,107,.25); color: var(--dim); font-size: .88rem; line-height: 1.6; }
/* La boîte de dialogue de Nuvio, en miniature : « Avancé » a le focus de la télécommande. */
.choix { display: grid; gap: 8px; padding: 12px; border-radius: 12px; background: #0f0b14; box-shadow: inset 0 0 0 1px rgba(255,255,255,.06); min-width: 170px; }
.choix span { display: block; padding: 9px 14px; border-radius: 9px; font: 700 .9rem var(--body); color: #8f88a2; background: rgba(255,255,255,.04); }
.choix span.focus { position: relative; color: #111; background: #fff; box-shadow: 0 0 0 3px var(--bulb), 0 0 6px rgba(255,207,107,.2); }
.choix span.focus::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; box-shadow: 0 0 22px rgba(255,207,107,.45); animation: halo 2.4s ease-in-out infinite; }
.choix small { border: 0; padding: 0; grid-column: auto; font: 600 .7rem var(--body); color: #6f6884; text-align: center; }
@keyframes halo { 50% { opacity: 0; } }
@media (max-width: 600px) { .first-run { grid-template-columns: 1fr; } .choix { justify-self: start; } }
.compat-box { border: 1px solid var(--bulb); border-radius: 14px; padding: 16px 18px; display: grid; gap: 12px; background: linear-gradient(180deg, rgba(255,207,107,.08), rgba(255,207,107,.02)); scroll-margin-top: 20px; }
.compat-box h3 { margin: 0; font: 400 1.5rem/1 var(--display); letter-spacing: .03em; color: var(--bulb); }
.compat-box p { margin: 0; color: #e6d6c8; }
.tag-adapt { font: 800 .66rem var(--body); letter-spacing: .12em; text-transform: uppercase; color: var(--ink); background: var(--bulb); border-radius: 4px; padding: 2px 6px; white-space: nowrap; }
.tips li { color: #e6d6c8; }
.code { justify-self: start; display: grid; gap: 2px; padding: 12px 22px 10px; border-radius: 12px; background: var(--cream); color: var(--ink); box-shadow: 0 0 0 3px var(--bulb), 0 10px 30px rgba(0,0,0,.4); }
.code span { font: 700 .7rem var(--body); letter-spacing: .2em; text-transform: uppercase; color: #7a5a4c; }
.code b { font: 400 3rem/1 var(--display); letter-spacing: .12em; }
.small { font-size: .88rem; color: var(--dim); }
.ou-installer { margin: 0; font: 800 1.05rem var(--body); color: var(--cream); }
.ou-installer small { display: block; font: 400 .88rem var(--body); color: var(--dim); }
.panel ul { margin-top: 6px; }
.manual summary { cursor: pointer; color: var(--bulb); font-weight: 700; }
.manual p { margin: 8px 0 0; color: #d9c8be; }
.note { border-left: 3px solid var(--bulb); background: rgba(255,207,107,.07); padding: 10px 14px; border-radius: 0 10px 10px 0; color: #e6d6c8; font-size: .95rem; }
.note.warn { border-color: var(--red); background: rgba(229,65,58,.09); }
.keyfield { display: grid; gap: 6px; }
.keyfield span { font: 700 .72rem var(--body); letter-spacing: .2em; text-transform: uppercase; color: var(--dim); }
.keyfield input { font: 600 1rem var(--type); padding: 11px 13px; border-radius: 10px; border: 1px dashed var(--bulb); background: #0f080c; color: var(--cream); }
.keyfield input, .keyfield select { min-width: 0; width: 100%; }
.keyfield select { font: 700 1rem var(--body); padding: 11px 13px; border-radius: 10px; border: 1px solid var(--bulb); background: #0f080c; color: var(--cream); cursor: pointer; }
/* Le trousseau (étape 5) : les clés tapées une fois, reprises partout. */
.trousseau { display: grid; gap: 10px; padding: 16px 18px; border-radius: 14px; border: 1px solid rgba(255,207,107,.35); background: linear-gradient(180deg, rgba(255,207,107,.08), rgba(255,207,107,.02)); }
.trousseau p { margin: 0; }
.trousseau .vers-tel { justify-self: start; }
.trousseau-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }.etat-cles { min-height: 1.3em; font-weight: 800; font-size: .9rem; color: var(--bulb); }
.etat-cles:empty { display: none; }
.etat-cles.erreur { color: #ffe1d8; }
/* Personnaliser sans quitter le guide : la salle 2 par-dessus, dans un cadre. */
.perso-actions { margin: 0; }
.perso-btn { font: 800 .92rem var(--body); padding: 10px 18px; border-radius: 99px; border: 1px solid var(--bulb); background: rgba(255,207,107,.1); color: var(--bulb); cursor: pointer; transition: background-color .2s ease; }
.perso-btn:hover { background: rgba(255,207,107,.2); }
.perso-lien { font: inherit; font-weight: 800; padding: 0; border: 0; background: none; color: var(--bulb); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.salle2 { position: fixed; inset: 0; z-index: 92; display: grid; grid-template-rows: auto minmax(0, 1fr); background: var(--velvet); animation: rise .3s ease both; }
.s2-barre { display: flex; align-items: center; justify-content: space-between; gap: 10px 16px; flex-wrap: wrap;
  padding: max(10px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 10px max(16px, env(safe-area-inset-left)); background: var(--velvet-2); border-bottom: 1px solid rgba(255,207,107,.35); }
.s2-barre p { margin: 0; display: grid; gap: 2px; min-width: 0; }
.s2-barre b { font: 400 1.5rem/1 var(--display); letter-spacing: .03em; color: var(--bulb); }
.s2-barre span { font-size: .86rem; color: var(--dim); }
.s2-fini { font: 800 .95rem var(--body); padding: 10px 18px; border-radius: 99px; border: 0; background: var(--bulb); color: var(--ink); cursor: pointer; }
.salle2 iframe { width: 100%; height: 100%; border: 0; background: var(--velvet); }
html.s2-ouverte, html.s2-ouverte body { overflow: hidden; }
@media (max-width: 560px) { .s2-barre { flex-wrap: nowrap; } .s2-barre b { font-size: 1.25rem; } .s2-barre span { display: none; } .s2-fini { padding: 9px 14px; font-size: .86rem; white-space: nowrap; } }
@media (prefers-reduced-motion: reduce) { .salle2 { animation: none; } }
/* Installer d'un geste (nuvio://) et consignes selon l'appareil */
.installer { justify-self: start; font: 800 .88rem var(--body); color: var(--bulb); text-decoration: underline; text-underline-offset: 3px; }
.installer[hidden] { display: none; }
.consigne { margin: 0; padding: 10px 14px; border-radius: 10px; background: rgba(255,255,255,.04); border: 1px dashed var(--seat); color: #e6d6c8; font-size: .93rem; }
.consigne.pret { border-style: solid; border-color: rgba(255,207,107,.45); background: rgba(255,207,107,.07); }
.cle-ad { display: grid; gap: 6px; }
.cle-ad p { margin: 0; }
.copy[hidden], .cle-ad[hidden] { display: none; }

.faq details { border-bottom: 1px solid var(--seat); padding: 12px 0; }
.faq summary { cursor: pointer; font-weight: 800; }
.faq details p { margin: 8px 0 0; color: #d9c8be; }
/* Le pupitre de la cabine (étape 12) : on allume le voyant de l'endroit où ça coince, les autres pannes s'effacent. */
.pupitre { display: grid; gap: 12px; padding: 18px 20px 16px; border-radius: 14px;
  background: radial-gradient(circle at 10px 10px, #7a654f 0 2.5px, transparent 3px), radial-gradient(circle at calc(100% - 10px) 10px, #7a654f 0 2.5px, transparent 3px),
    radial-gradient(circle at 10px calc(100% - 10px), #7a654f 0 2.5px, transparent 3px), radial-gradient(circle at calc(100% - 10px) calc(100% - 10px), #7a654f 0 2.5px, transparent 3px), linear-gradient(#2b2226, #1b1418);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.06), inset 0 0 0 1px rgba(0,0,0,.5), 0 10px 26px rgba(0,0,0,.35); }
/* L'étiquette de la plaque : du ruban à lettres en relief, collé un peu de travers. */
.pu-plaque { justify-self: start; margin: 0; padding: 4px 10px 3px; border-radius: 3px; transform: rotate(-1deg); font: 700 .74rem var(--type); letter-spacing: .18em; text-transform: uppercase;
  color: #f4f0e6; background: #0d0a0b; text-shadow: 0 -1px 0 #000; box-shadow: inset 0 1px 0 rgba(255,255,255,.14), 0 1px 0 rgba(0,0,0,.6); }
.pu-voyants { display: grid; grid-template-columns: repeat(auto-fit, minmax(126px, 1fr)); gap: 10px; }
.voyant { display: grid; justify-items: center; gap: 4px; padding: 14px 8px 11px; border-radius: 12px; border: 1px solid #0c090a; cursor: pointer; text-align: center; color: var(--cream);
  background: linear-gradient(#30272b, #221a1e); box-shadow: inset 0 1px 0 rgba(255,255,255,.07), 0 3px 0 #0c090a; transition: transform .1s ease, box-shadow .1s ease, border-color .2s ease; }
.voyant:active { transform: translateY(2px); box-shadow: inset 0 1px 0 rgba(255,255,255,.07), 0 1px 0 #0c090a; }
.voyant b { font: 800 .9rem/1.2 var(--body); }
.voyant small { font: 400 .74rem var(--type); color: var(--dim); }
.voyant .lampe { width: 24px; height: 24px; margin-bottom: 4px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #6e3431, #2e1010 70%);
  box-shadow: 0 0 0 3px #8a6a3a, 0 0 0 4px #000, inset 0 -3px 6px rgba(0,0,0,.5); }
.voyant[aria-pressed="true"] { border-color: rgba(255,90,74,.55); }
.voyant[aria-pressed="true"] .lampe { background: radial-gradient(circle at 35% 30%, #ffe1d8, #ff5a4a 45%, #b81f18 78%);
  box-shadow: 0 0 0 3px #c99a4a, 0 0 0 4px #000, 0 0 18px 5px rgba(255,80,60,.55); animation: allume .6s; }
/* L'ampoule grésille avant de tenir. */
@keyframes allume { 0%, 18%, 36% { opacity: .35; } 10%, 26%, 100% { opacity: 1; } }
.pu-etat { margin: 0; font-size: .9rem; color: var(--dim); }
.faq details.revient { animation: rise .35s ease both; }
/* Le grand rembobinage : chaque geste coché remet de la pellicule sur la bobine. */
.rembobinage { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 14px 20px; align-items: start; margin-top: 6px; padding: 18px 20px; border-radius: 14px; border: 1px dashed rgba(255,207,107,.4); background: rgba(255,207,107,.04); }
.rembobinage h3 { margin: 0 0 6px; font: 400 1.6rem/1 var(--display); letter-spacing: .03em; color: var(--bulb); }
.rb-texte { display: grid; gap: 8px; }
.rb-bobine { width: 78px; height: 78px; }
.rb-bobine * { transform-box: view-box; }
.rb-film { fill: #3a2418; stroke: #6b4a32; stroke-width: 1; transition: r .6s cubic-bezier(.16,1,.3,1); }
.rb-tourne { fill: none; stroke: var(--bulb); stroke-width: 2.5; stroke-linecap: round; transform-origin: 40px 40px; transition: transform .7s cubic-bezier(.16,1,.3,1); }
.rb-tourne circle:last-child { fill: var(--velvet); }
.act .rb-gestes { list-style: none; padding: 0; gap: 2px; }
.rb-gestes label { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 10px; align-items: start; padding: 5px 0; cursor: pointer; color: #e6d6c8; }
.rb-gestes input { appearance: none; -webkit-appearance: none; width: 20px; height: 20px; margin: 3px 0 0; display: grid; place-items: center; border-radius: 5px; border: 2px solid var(--bulb); background: transparent; cursor: pointer; }
.rb-gestes input::after { content: "✓"; font: 800 .8rem/1 var(--body); color: #0e2a1c; opacity: 0; }
.rb-gestes input:checked { background: var(--green); border-color: var(--green); }
.rb-gestes input:checked::after { opacity: 1; }
.rb-gestes input:checked + span { color: var(--dim); text-decoration: line-through; text-decoration-color: rgba(95,211,154,.6); }
.rb-fin { font: italic 400 1.3rem/1.3 var(--serif); color: var(--green); animation: rise .4s ease both; }
@media (max-width: 520px) { .pupitre, .rembobinage { padding: 16px; } .rembobinage { grid-template-columns: minmax(0, 1fr); } .rb-bobine { width: 60px; height: 60px; } }
@media (prefers-reduced-motion: reduce) { .voyant[aria-pressed="true"] .lampe, .faq details.revient, .rb-fin { animation: none; } .rb-film, .rb-tourne { transition: none; } }
.cta { display: flex; flex-wrap: wrap; gap: 10px; }
.btn { display: inline-block; font: 800 .95rem var(--body); text-decoration: none; padding: 12px 18px; border-radius: 10px; background: var(--bulb); color: var(--ink); }
.btn.ghost { background: transparent; color: var(--cream); border: 1px solid var(--seat); }
footer { text-align: center; color: var(--dim); font: italic 400 1.05rem var(--serif); }
/* La bobine : avance au fil de la lecture, et sert de sommaire. */
.reel-nav { position: fixed; right: max(16px, env(safe-area-inset-right)); bottom: calc(16px + env(safe-area-inset-bottom)); z-index: 40;
  display: grid; justify-items: end; gap: 10px; transition: opacity .3s ease, transform .3s ease; }
.reel-nav.away { opacity: 0; transform: translateY(14px); pointer-events: none; }
.reel-btn { display: flex; align-items: center; gap: 10px; padding: 6px 16px 6px 6px; border-radius: 99px; cursor: pointer; text-align: left;
  border: 1px solid rgba(255,207,107,.3); background: rgba(28,14,21,.9); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  color: var(--cream); font: 700 .85rem/1.2 var(--body); box-shadow: 0 12px 30px rgba(0,0,0,.5); }
.reel-btn:hover { border-color: var(--bulb); }
.reel-btn svg { width: 42px; height: 42px; flex: none; }
.reel-btn .disc { fill: #4a2a36; stroke: var(--bulb); stroke-width: 1.5; }
.reel-btn .hole { fill: var(--velvet); }
.reel-btn .hub { fill: var(--bulb); }
.reel-btn .spin { transform-origin: 21px 21px; }
.reel-btn b { font: 400 1.4rem/1 var(--display); color: var(--bulb); letter-spacing: .04em; }
.reel-btn small { display: block; color: var(--dim); font-weight: 600; max-width: 24ch; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.reel-menu { display: grid; gap: 2px; padding: 8px; min-width: 260px; max-height: min(62vh, 520px); overflow: auto; border-radius: 16px;
  border: 1px solid rgba(255,207,107,.25); background: rgba(28,14,21,.96); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  box-shadow: 0 20px 50px rgba(0,0,0,.6); transform-origin: 100% 100%; animation: unspool .22s cubic-bezier(.16,1,.3,1); counter-reset: rm; }
@keyframes unspool { from { opacity: 0; transform: scale(.9) translateY(8px); } }
.reel-menu a { display: flex; gap: 10px; align-items: baseline; padding: 8px 12px; border-radius: 10px; color: var(--cream); text-decoration: none; font-weight: 600; }
.reel-menu a::before { counter-increment: rm; content: counter(rm, decimal-leading-zero); font: 400 1.05rem var(--display); color: var(--bulb); min-width: 2ch; }
.reel-menu a:hover { background: rgba(255,255,255,.06); }
.reel-menu a.on { background: var(--bulb); color: var(--ink); }
.reel-menu a.on::before { color: var(--ink); }
.copy button { transition: background .15s ease, transform .15s ease; }
.copy button:active { transform: scale(.94); }
/* Étape faite : un talon de billet qu'on composte. */
.composte { grid-column: 3; grid-row: 1 / span 2; align-self: center; position: relative; padding: 9px 14px 9px 22px; border: 0; border-radius: 8px; cursor: pointer;
  font: 800 .82rem var(--body); color: var(--dim); background: rgba(255,255,255,.05); box-shadow: inset 0 0 0 1px var(--seat); white-space: nowrap; transition: background .2s ease, color .2s ease; }
.composte::before { content: ""; position: absolute; left: 8px; top: 50%; width: 8px; height: 8px; margin-top: -4px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px currentColor; }
.composte:hover { color: var(--cream); }
.composte[aria-pressed="true"] { color: #0e2a1c; background: var(--green); box-shadow: none; animation: punch .35s cubic-bezier(.16,1,.3,1); }
.composte[aria-pressed="true"]::before { background: var(--velvet-2); box-shadow: none; }
@keyframes punch { 40% { transform: scale(.9) rotate(-3deg); } }
.act.fait .num { color: var(--green); text-shadow: 0 0 20px rgba(95,211,154,.35); }
.toc a.fait::after, .reel-menu a.fait::after { content: "✓"; margin-left: auto; color: var(--green); font-weight: 800; }
.reel-menu a.on.fait::after { color: var(--ink); }
.reel-btn .ring { fill: none; stroke: var(--green); stroke-width: 2.2; stroke-linecap: round; transform: rotate(-90deg); transform-origin: 21px 21px; transition: stroke-dasharray .5s ease; }
.reel-menu .home { border-bottom: 1px dashed rgba(255,207,107,.25); border-radius: 10px 10px 0 0; margin-bottom: 4px; color: var(--bulb); }
.reel-menu .home::before { content: "↩"; counter-increment: none; }
.reel-menu .astuce { margin: 6px 12px 4px; font-size: .78rem; color: var(--dim); }
kbd { font: 700 .75rem var(--type); padding: 1px 6px; border-radius: 4px; background: rgba(255,255,255,.08); box-shadow: inset 0 -1px 0 rgba(0,0,0,.4); color: var(--cream); }

/* Entracte, à mi-parcours */
.entracte { display: flex; align-items: center; gap: 22px; padding: 22px 8px; border-top: 2px dashed rgba(255,207,107,.25); border-bottom: 2px dashed rgba(255,207,107,.25); }
.entracte p { margin: 0; color: var(--dim); max-width: 46ch; }
.entracte .titre { font: italic 400 2.6rem/1 var(--serif); color: var(--bulb); text-shadow: 0 0 18px rgba(255,207,107,.45); margin-bottom: 4px; }
.cornet { position: relative; flex: none; width: 54px; height: 64px; margin-top: 14px; }
.cornet::before { content: ""; position: absolute; inset: 10px 0 0; background: repeating-linear-gradient(90deg, #e5413a 0 9px, #f5ead8 9px 18px); clip-path: polygon(0 0, 100% 0, 86% 100%, 14% 100%); border-radius: 3px; }
.cornet::after { content: ""; position: absolute; left: -2px; right: -2px; top: -2px; height: 22px;
  background: radial-gradient(circle at 15% 70%, #fff6e2 0 7px, transparent 7.5px), radial-gradient(circle at 40% 40%, #ffeec6 0 8px, transparent 8.5px), radial-gradient(circle at 65% 65%, #fff8ea 0 7px, transparent 7.5px), radial-gradient(circle at 86% 45%, #ffe7b0 0 7px, transparent 7.5px); }
.cornet i { position: absolute; left: 50%; top: 0; width: 13px; height: 11px; z-index: 1; animation: saute 2.6s cubic-bezier(.3,.6,.4,1) infinite;
  background: radial-gradient(circle at 30% 38%, #fffaf0 0 3px, transparent 3.6px), radial-gradient(circle at 68% 32%, #fff3dc 0 3.4px, transparent 4px), radial-gradient(circle at 52% 70%, #ffe8b4 0 3.8px, transparent 4.3px); }
.cornet i:nth-child(2) { animation-delay: .9s; --dx: -22px; }
.cornet i:nth-child(3) { animation-delay: 1.7s; --dx: 18px; }
@keyframes saute { 0%, 55% { transform: translate(-50%, 6px) scale(.6); opacity: 0; } 60% { opacity: 1; } 78% { transform: translate(calc(-50% + var(--dx, 6px) * .6), -26px) rotate(160deg); } 100% { transform: translate(calc(-50% + var(--dx, 6px)), 4px) rotate(320deg); opacity: 0; } }

/* Le panneau de sortie de secours : direction la salle 2 (ta programmation) */
.sortie-wrap { display: flex; justify-content: center; align-items: center; gap: 16px; flex-wrap: wrap; margin-top: 8px; }
.sortie { display: inline-flex; align-items: center; gap: 12px; padding: 10px 18px 10px 12px; border-radius: 8px; text-decoration: none; color: #eafff2;
  background: linear-gradient(#1f9d5c, #13804a); position: relative; box-shadow: 0 0 0 3px #0c3d25, 0 0 14px rgba(60,220,140,.25), inset 0 1px 0 rgba(255,255,255,.25); }
.sortie::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; box-shadow: 0 0 26px rgba(60,220,140,.45); animation: halo 4s ease-in-out infinite; }
.sortie svg { width: 30px; height: 30px; flex: none; }
.sortie b { display: block; font: 400 1.6rem/1 var(--display); letter-spacing: .12em; }
.sortie span { display: block; font: 700 .8rem var(--body); opacity: .9; }
.sortie:hover { box-shadow: 0 0 0 3px #0c3d25, 0 0 40px rgba(60,220,140,.7), inset 0 1px 0 rgba(255,255,255,.25); }

/* Le raccourci vers la salle 2, pour qui a déjà Nuvio */
.raccourci { display: inline-block; font: 800 .92rem var(--body); text-decoration: none; color: var(--ink); background: var(--bulb); padding: 9px 16px; border-radius: 99px; box-shadow: 0 0 22px rgba(255,207,107,.35); }
.raccourci:hover { background: #fff1c9; }
`;

export const GUIDE_RECLAMES_CSS = `/* Réclames d'avant-séance : de fausses pubs d'époque pour les fonctions du site. */
.reclames { position: relative; display: grid; }
.reclame { grid-area: 1 / 1; position: relative; display: grid; gap: 8px; justify-items: start; padding: 26px 30px 24px; border-radius: 6px; color: #2a1a14; overflow: hidden;
  background: radial-gradient(circle, rgba(42,26,20,.09) 1px, transparent 1.5px) 0 0 / 6px 6px, linear-gradient(160deg, #f6ead2, #ead8b6);
  box-shadow: inset 0 0 0 6px #ead8b6, inset 0 0 0 8px #2a1a14, 0 18px 40px rgba(0,0,0,.45);
  opacity: 0; visibility: hidden; transform: scale(.98); transition: opacity .5s ease, transform .5s ease, visibility .5s; }
.reclame.on { opacity: 1; visibility: visible; transform: none; }
.reclame .r-sur { margin: 0; font: 800 .74rem var(--body); letter-spacing: .22em; text-transform: uppercase; color: #8f2420; }
.reclame h3 { margin: 0; font: italic 400 clamp(2.2rem, 6vw, 3.2rem)/1 var(--serif); }
.reclame .r-slogan { margin: 0; max-width: 46ch; font-size: 1.02rem; line-height: 1.5; }
.reclame .r-cta { margin-top: 4px; font: 400 1.25rem/1 var(--display); letter-spacing: .06em; color: #f5ead8; background: #8f2420; padding: 9px 16px 7px; border-radius: 4px; text-decoration: none; }
.reclame .r-cta:hover { background: #2a1a14; }
.reclame .r-tampon { position: absolute; right: 18px; bottom: 16px; font: 400 1rem/1 var(--display); letter-spacing: .2em; color: rgba(143,36,32,.5); border: 2px solid rgba(143,36,32,.45); border-radius: 4px; padding: 4px 8px 2px; transform: rotate(-8deg); }
.reclame .r-etoile { position: absolute; top: 14px; right: 18px; width: 92px; height: 92px; display: grid; place-items: center; text-align: center; transform: rotate(12deg);
  font: 400 1.05rem/1 var(--display); letter-spacing: .04em; color: #fff6e6; background: #e5413a;
  clip-path: polygon(50% 0, 61% 18%, 82% 10%, 80% 32%, 100% 40%, 85% 56%, 96% 76%, 74% 78%, 68% 100%, 50% 86%, 32% 100%, 26% 78%, 4% 76%, 15% 56%, 0 40%, 20% 32%, 18% 10%, 39% 18%); }
.r-dots { display: flex; justify-content: center; gap: 8px; margin-top: 10px; }
.r-dots button { width: 10px; height: 10px; padding: 0; border-radius: 50%; border: 0; background: var(--seat); }
.r-dots button[aria-pressed="true"] { background: var(--bulb); }
.r-dots { align-items: center; }
.r-dots button.r-pause { width: auto; height: auto; margin-left: 6px; padding: 3px 10px; border-radius: 99px; border: 1px solid var(--seat); background: transparent; color: var(--dim); font: 700 .72rem var(--body); cursor: pointer; }
.r-dots button.r-pause:hover { color: var(--cream); border-color: rgba(255,207,107,.5); }
@media (max-width: 600px) { .reclame { padding: 22px 20px 52px; } .reclame .r-etoile { width: 70px; height: 70px; font-size: .85rem; top: 10px; right: 10px; } .reclame h3 { padding-right: 64px; } }

/* La vendeuse d'esquimaux passe dans l'allée de l'entracte. */
.entracte { position: relative; padding-bottom: 96px; overflow: hidden; }
.vendeuse { position: absolute; left: 0; bottom: 6px; width: 48px; height: 72px; padding: 0; border: 0; background: none; transform: translateX(-80px); }
.entracte.vue .vendeuse { animation: passe 14s linear both; }
.entracte .vendeuse.pause { animation-play-state: paused; }
@keyframes passe { from { transform: translateX(-80px); } to { transform: translateX(var(--allee, 800px)); } }
/* La vendeuse : petit chapeau rond, carré court, uniforme rouge à boutons dorés, plateau d'esquimaux. */
.vendeuse svg, .ouvreuse svg { display: block; width: 100%; height: 100%; overflow: visible; }
.vendeuse svg *, .ouvreuse svg * { transform-box: view-box; }
.v-haut { transform-origin: 24px 52px; }
.v-jambe-g, .o-jambe-g { transform-origin: 22px 52px; }
.v-jambe-d, .o-jambe-d { transform-origin: 27px 52px; }
.entracte.vue .vendeuse:not(.pause) .v-haut { animation: dandine .45s ease-in-out infinite alternate; }
.entracte.vue .vendeuse:not(.pause) .v-jambe-g { animation: pas .45s ease-in-out infinite alternate; }
.entracte.vue .vendeuse:not(.pause) .v-jambe-d { animation: pas .45s ease-in-out infinite alternate-reverse; }
@keyframes dandine { to { transform: translateY(-1.5px) rotate(1.2deg); } }
@keyframes pas { from { transform: rotate(14deg); } to { transform: rotate(-14deg); } }
/* Les yeux clignent ; à l'arrêt, on respire. */
.o-haut circle[fill="#2a1a14"], .v-haut circle[fill="#2a1a14"] { transform-box: fill-box; transform-origin: center; }
.cligne .o-haut circle[fill="#2a1a14"], .cligne .v-haut circle[fill="#2a1a14"] { animation: cligne .3s; }
.v-haut circle[fill="#2a1a14"] { animation-delay: -2.1s; }
@keyframes cligne { 40% { transform: scaleY(.1); } }
.ouvreuse:not(.marche) svg { animation: souffle-o 3.4s ease-in-out infinite alternate; }
@keyframes souffle-o { to { translate: 0 -.7px; } }
.entracte .vendeuse.pause .v-haut { animation: crie .5s ease-in-out 2 alternate; }
@keyframes crie { to { transform: translateY(-2px) rotate(-3deg); } }
.v-bulle { position: absolute; left: 50%; bottom: calc(100% + 6px); padding: 3px 9px; border-radius: 8px; white-space: nowrap; background: var(--cream); color: var(--ink); font: 800 .72rem var(--body); opacity: 0; transform: translateX(-50%); pointer-events: none; }
.vendeuse.parle .v-bulle { animation: bulle 2.4s ease forwards; }

/* Le pot de pop-corn : il se vide pendant qu'on lit, on le remplit en cliquant. */
.pot { position: fixed; left: max(16px, env(safe-area-inset-left)); bottom: calc(16px + env(safe-area-inset-bottom)); z-index: 40; width: 56px; height: 70px; padding: 0; border: 0; background: none; overflow: hidden; transition: opacity .3s ease, transform .3s ease; }
.pot.away { opacity: 0; transform: translateY(14px); pointer-events: none; }
/* Le pop-corn ne dépasse jamais du pot : au-dessus du bord, il reste dans la largeur de l'ouverture ;
   en dessous, il suit les flancs du pot (même trapèze que le seau). */
.p-interieur { position: absolute; inset: 0; clip-path: polygon(5px 0, 51px 0, 51px 31px, 45px 70px, 11px 70px, 5px 31px); }
.p-mais { position: absolute; left: 6px; right: 6px; top: 7px; height: 28px; transition: transform .5s ease; transform: translateY(calc((1 - var(--niveau, 1)) * 34px));
  background: radial-gradient(circle at 15% 70%, #fff6e2 0 8px, transparent 8.5px), radial-gradient(circle at 40% 40%, #ffeec6 0 9px, transparent 9.5px), radial-gradient(circle at 65% 65%, #fff8ea 0 8px, transparent 8.5px), radial-gradient(circle at 86% 45%, #ffe7b0 0 8px, transparent 8.5px), radial-gradient(circle at 50% 85%, #fff3dc 0 9px, transparent 9.5px); }
.p-seau { position: absolute; left: 4px; right: 4px; bottom: 0; height: 40px; z-index: 1; border-radius: 3px; background: repeating-linear-gradient(90deg, #e5413a 0 8px, #f5ead8 8px 16px); clip-path: polygon(0 0, 100% 0, 86% 100%, 14% 100%); box-shadow: inset 0 3px 0 rgba(0,0,0,.15); }
.pot.vide .p-seau { animation: secoue .5s ease 2; }
@keyframes secoue { 25% { transform: rotate(-6deg); } 75% { transform: rotate(6deg); } }
@media (max-width: 520px) { .pot { transform: scale(.82); transform-origin: 0 100%; } }

/* Le diplôme de projectionniste, quand toutes les étapes sont faites. */
.diplome-box { display: grid; gap: 10px; justify-items: center; text-align: center; padding: 26px; border-radius: 18px; border: 1px solid rgba(255,207,107,.5); background: radial-gradient(ellipse at 50% 0, rgba(255,207,107,.16), transparent 70%), var(--velvet-2); animation: rise .5s ease both; }
.diplome-box .titre { margin: 0; font: italic 400 2.2rem/1.1 var(--serif); color: var(--bulb); }
.diplome-box p { margin: 0; color: #e6d6c8; }
.diplome-box .row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 6px; }
.diplome-box input { font: 600 1rem var(--body); padding: 11px 13px; border-radius: 10px; border: 1px dashed var(--bulb); background: #0f080c; color: var(--cream); min-width: 0; width: 220px; }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } }

/* L'ouvreuse : elle suit la lecture et éclaire l'étape en cours avec sa lampe. */
.ouvreuse { position: fixed; top: 0; left: calc(50% - 430px - 104px); z-index: 30; width: 50px; height: 86px; cursor: pointer; will-change: transform; }
.o-haut { transform-origin: 24px 56px; }
.o-jambe-g { transform-origin: 22px 58px; } .o-jambe-d { transform-origin: 27px 58px; }
.ouvreuse.marche .o-haut { animation: dandine .3s ease-in-out infinite alternate; }
.ouvreuse.marche .o-jambe-g { animation: pas .3s ease-in-out infinite alternate; }
.ouvreuse.marche .o-jambe-d { animation: pas .3s ease-in-out infinite alternate-reverse; }
.o-lampe { position: absolute; right: -1px; top: 37.5px; width: 3px; height: 5px; border-radius: 2px; background: #fff3cf; box-shadow: 0 0 10px 4px rgba(255,220,150,.75); }
.o-bulle { position: absolute; left: 50%; bottom: calc(100% + 6px); padding: 3px 9px; border-radius: 8px; white-space: nowrap; background: var(--cream); color: var(--ink); font: 800 .72rem var(--body); opacity: 0; transform: translateX(-50%); pointer-events: none; }
.ouvreuse.parle .o-bulle { animation: bulle 2.4s ease forwards; }
.o-faisceau { position: fixed; left: 0; top: 0; z-index: 1; height: 150px; margin-top: -75px; pointer-events: none; transform-origin: 0 50%; opacity: 0; transition: opacity .4s ease; mix-blend-mode: screen;
  background: linear-gradient(90deg, rgba(255,230,170,.32), rgba(255,230,170,.04)); clip-path: polygon(0 47%, 100% 0, 100% 100%, 0 53%); }
.o-faisceau.on { opacity: 1; }
@media (max-width: 1179px) { .ouvreuse, .o-faisceau { display: none; } }
@media (prefers-reduced-motion: reduce) { .entracte.vue .vendeuse, .vendeuse svg *, .ouvreuse svg *, .pot.vide .p-seau { animation: none !important; } .vendeuse { display: none; } }`;

export const GUIDE_FIN_CSS = `@media (max-width: 520px) { .act > header { grid-template-columns: auto minmax(0, 1fr); } .composte { grid-column: 1 / -1; grid-row: 3; justify-self: start; margin-top: 8px; } .entracte { gap: 14px; } .entracte .titre { font-size: 2.1rem; } }
@media (max-width: 520px) { .act { padding: 18px; } .act .num { width: 64px; height: 64px; font-size: 2.2rem; } .act h2 { font-size: 1.8rem; } body { padding-bottom: calc(96px + env(safe-area-inset-bottom)); } .reel-btn small { max-width: 16ch; } }
@media (prefers-reduced-motion: reduce) { body::after, .act .num, .act .num::before, .reel-menu, .choix span.focus::after, .cornet i, .sortie::after, .composte { animation: none !important; } }
/* Doigt plutôt que souris : des cibles d'au moins 44 px (les points de la réclame gardent leur taille, seule la zone à toucher grandit). */
@media (hover: none), (pointer: coarse) {
  .composte { min-height: 44px; }
  .faq details { padding: 3px 0; }
  .faq summary, .manual summary { padding-block: 10px; }
  .rb-gestes label { min-height: 44px; padding-block: 10px; }
  .reel-menu a { padding: 12px; }
  .r-dots { gap: 0; }
  .r-dots button { box-sizing: border-box; width: 30px; height: 30px; padding: 10px; background-clip: content-box; }
  .r-dots button.r-pause { min-height: 44px; padding: 0 14px; }
}`;

/** Après liens.js et outils.js, avec ORIG (l'adresse du site) écrit dans la page. */
export const GUIDE_JS = `// Onglets d'installation : un clic, ou les flèches (Début, Fin) quand le focus est sur un onglet.
// TV par défaut, sans deviner : on lit souvent ce guide sur le téléphone, à côté de la TV.
const onglets = [...document.querySelectorAll(".appareils [role=tab]")];
const ouvreOnglet = (b) => {
  onglets.forEach((x) => { x.setAttribute("aria-selected", String(x === b)); x.tabIndex = x === b ? 0 : -1; });
  document.querySelectorAll("[data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; });
};
onglets.forEach((b) => b.addEventListener("click", () => ouvreOnglet(b)));
document.querySelector(".appareils").addEventListener("keydown", (e) => {
  const i = onglets.indexOf(document.activeElement); if (i < 0) return;
  const j = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: onglets.length - 1 }[e.key];
  if (j === undefined) return;
  e.preventDefault();
  const b = onglets[(j + onglets.length) % onglets.length]; b.focus(); b.click();
});
// À la main ou avec Claude (le choix suit d'un appareil à l'autre).
const choisirMode = (mode) => document.querySelectorAll("[data-panel]").forEach((p) => {
  p.querySelectorAll(".modes button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.mode === mode)));
  p.querySelectorAll(".mode-pane").forEach((x) => { x.hidden = x.dataset.pane !== mode; });
});
document.querySelectorAll(".modes button").forEach((b) => b.addEventListener("click", () => choisirMode(b.dataset.mode)));
// ---------- Le trousseau : clés et appareil, gardés dans le navigateur (jamais envoyés au serveur du site) ----------
const lit = (k) => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
const garde = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} };
// Clés envoyées depuis l'ordinateur par QR code (#cles=…) : rangées sur ce téléphone, puis retirées de l'adresse.
(() => {
  if (location.hash.indexOf("#cles=") !== 0) return;
  let o = {};
  try { const b = location.hash.slice(6).replace(/-/g, "+").replace(/_/g, "/"); o = lirePaquet(atob(b)); } catch (e) {}
  history.replaceState(null, "", location.pathname);
  // N'importe qui peut fabriquer ce lien : des clés déjà rangées ici ne sont remplacées qu'avec accord.
  const autres = o.ad && lit("ad-key") && lit("ad-key") !== o.ad;
  if (autres && !confirm("Ce lien remplace la clé AllDebrid déjà enregistrée sur cet appareil. Continuer ? Annule si tu ne viens pas de le scanner toi-même.")) return;
  if (o.ad) garde("ad-key", o.ad);
  if (o.app) garde("guide-appareil", o.app);
  if (!Object.keys(o).length) return;
  addEventListener("load", () => { document.getElementById("addons").scrollIntoView(); toast("Clés reçues : tes liens sont prêts."); });
})();
const adInput = document.getElementById("ad-key");
// L’appareil : les cartes radio de l’étape 6 (une seule cochée). Une fois choisi, la liste se replie sur lui.
const appRadios = [...document.querySelectorAll("input[name=appareil]")];
const appSel = {
  get value() { const r = appRadios.find((x) => x.checked); return r ? r.value : ""; },
  set value(v) { appRadios.forEach((x) => { x.checked = x.value === v; }); },
};
let caOuvert = false, caClavier = false;
adInput.value = lit("ad-key");
appSel.value = APPAREILS[lit("guide-appareil")] ? lit("guide-appareil") : "";
const $id = (id) => document.getElementById(id);
const setInstall = (id) => {
  document.querySelectorAll('[data-installe="' + id + '"]').forEach((a) => {
    const u = installUrl($id(id).textContent.trim()); a.hidden = !u || SANS_INSTALL; if (u) a.href = u;
  });
};
const SANS_INSTALL = sansInstall(navigator.userAgent);
document.querySelectorAll("[data-installe]").forEach((a) => setInstall(a.dataset.installe));
// Programmation perso (salle 2, ouverte par-dessus le guide ou plus tôt dans cet onglet) : son lien remplace celui par défaut.
function appliquerPerso(base) {
  $id("u-cat").textContent = (base || ORIG) + "/manifest.json";
  $id("u-coll").textContent = (base || ORIG) + "/collections.json";
  $id("u-coll-contenu").hidden = true; // le contenu affiché serait celui de l'ancien lien
  document.querySelectorAll("[data-perso]").forEach((p) => { p.hidden = !base; });
  // Les liens « Salle 2 » sans la clé Gemini (liens.js) : seul le lien d'addon à installer la garde. L'adresse
  // gardée dans l'onglet (sessionStorage « programmation ») la garde aussi : c'est d'elle que vient ce lien d'addon.
  document.querySelectorAll("a[data-programmation]").forEach((a) => { a.href = sansCle((base || ORIG) + "/configure"); });
  setInstall("u-cat");
}
try { appliquerPerso(basePerso(sessionStorage.getItem("programmation") || "", ORIG)); } catch (e) { appliquerPerso(""); }
// Fenêtres par-dessus le guide (salle 2, QR code) : le reste de la page devient inerte (le focus reste dans
// la fenêtre), Échap la ferme, et le focus revient au bouton qui l'a ouverte. Renvoie de quoi tout rétablir.
function modale(ov, fermer) {
  const avant = document.activeElement;
  const fond = [...document.body.children].filter((x) => x !== ov && !x.inert);
  fond.forEach((x) => { x.inert = true; });
  ov.setAttribute("aria-modal", "true");
  const echap = (e) => { if (e.key === "Escape") { e.preventDefault(); fermer(); } };
  addEventListener("keydown", echap);
  return () => {
    removeEventListener("keydown", echap);
    fond.forEach((x) => { x.inert = false; });
    if (avant && avant.isConnected && !avant.closest("[hidden]")) avant.focus({ preventScroll: true });
  };
}
// La salle 2 s'ouvre par-dessus le guide, sans changer de page ; en la fermant, son lien arrive dans les cartes.
function ouvrirSalle2(e) {
  const declencheur = e && e.currentTarget;
  let depart = "";
  try { depart = sessionStorage.getItem("programmation") || ""; } catch (err) {}
  if (!basePerso(depart, ORIG)) depart = ORIG + "/configure";
  const ov = document.createElement("div"); ov.className = "salle2"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "Ta programmation");
  ov.innerHTML = '<div class="s2-barre"><p><b>Ta programmation</b><span>Choisis tes rangées, tes plateformes et tes filtres : le guide reprend ton lien.</span></p><button type="button" class="s2-fini">Terminé, revenir au guide</button></div><iframe title="Salle 2 : ta programmation"></iframe>';
  const frame = ov.querySelector("iframe"); frame.src = depart;
  document.body.append(ov); document.documentElement.classList.add("s2-ouverte");
  const fini = ov.querySelector(".s2-fini");
  const fermer = () => {
    if (!ov.isConnected) return;
    // La salle 2 réécrit son adresse à chaque réglage : on la relit à la fermeture.
    let u = "";
    try { u = frame.contentWindow.location.href; } catch (err) {}
    if (!/[/]configure$/.test(u)) { try { u = sessionStorage.getItem("programmation") || ""; } catch (err) {} }
    const base = basePerso(u, ORIG);
    try { sessionStorage.setItem("programmation", (base || ORIG) + "/configure"); } catch (err) {}
    appliquerPerso(base);
    ov.remove(); libere(); document.documentElement.classList.remove("s2-ouverte");
    $id("u-cat").closest(".addon").scrollIntoView({ block: "center" });
    if (declencheur && declencheur.isConnected && !declencheur.closest("[hidden]")) declencheur.focus({ preventScroll: true });
    toast(base ? "Ton lien perso est prêt : il est dans la carte du Catalogue FR." : "Tu gardes les réglages conseillés.");
  };
  const libere = modale(ov, fermer);
  fini.addEventListener("click", fermer); fini.focus();
}
document.querySelectorAll("[data-perso-ouvrir]").forEach((b) => b.addEventListener("click", ouvrirSalle2));
document.querySelectorAll("[data-perso-retour]").forEach((b) => b.addEventListener("click", () => {
  try { sessionStorage.setItem("programmation", ORIG + "/configure"); } catch (e) {}
  appliquerPerso(""); toast("Retour au lien conseillé.");
}));
// Ce qu'il faut régler sur le site de chaque addon, selon l'appareil.
document.querySelectorAll("[data-consigne] span").forEach((s) => { s.dataset.vide = s.textContent; });
function majCles() {
  const ad = cleAllDebrid(adInput.value), a = APPAREILS[appSel.value];
  const replie = !!a && !caOuvert;
  $id("choix-appareil").classList.toggle("replie", replie);
  document.querySelectorAll(".ca-carte").forEach((c) => { const on = c.dataset.appareil === appSel.value; c.classList.toggle("on", on); c.hidden = replie && !on; });
  document.querySelectorAll(".ca-famille").forEach((p) => { p.hidden = replie; });
  $id("ma-conf").hidden = !a;
  if (a) { $id("mc-q").textContent = a.qualite; $id("mc-x").textContent = a.exclure; }
  const t = torrentioUrl(ad, appSel.value);
  $id("u-torrentio").textContent = t;
  $id("torrentio-pret").hidden = !t;
  $id("torrentio-attente").hidden = !!t;
  $id("torrentio-manque").innerHTML = [ad ? "" : 'ta clé AllDebrid (<a href="#trousseau">trousseau, étape 5</a>)', a ? "" : 'ton appareil (<a href="#compatibilite">encadré plus haut</a>)'].filter(Boolean).join(" et ");
  setInstall("u-torrentio");
  document.querySelectorAll("[data-consigne]").forEach((p) => {
    const s = p.querySelector("span"); s.textContent = a ? a[p.dataset.consigne] : s.dataset.vide; p.classList.toggle("pret", !!a);
  });
  document.querySelectorAll("[data-cle-ad]").forEach((d) => { d.hidden = !ad; d.querySelector("code").textContent = ad; });
  const brut = adInput.value.trim();
  $id("etat-cles").className = "etat-cles";
  if (brut && !ad) { $id("etat-cles").textContent = "Cette clé AllDebrid paraît incomplète : recopie-la depuis la page des clés API."; $id("etat-cles").classList.add("erreur", "alerte"); }
  else $id("etat-cles").textContent = ad ? "Clé gardée dans ce navigateur ✓" : "";
  $id("oublier-cle").hidden = !brut;
}
adInput.addEventListener("input", () => { garde("ad-key", adInput.value.trim().replace(/[^A-Za-z0-9]/g, "")); majCles(); });
// Oublier ma clé : effacée de ce navigateur (et des liens préparés par le guide).
$id("oublier-cle").addEventListener("click", () => {
  garde("ad-key", ""); adInput.value = ""; majCles(); adInput.focus();
  toast("Clé oubliée : elle n'est plus gardée sur cet appareil.");
});
// L'appareil : choisi à la main, ou déduit de l'onglet cliqué à l'étape 2 tant qu'on n'a rien choisi
// (sauf TV et Fire TV : TV ou box, HD ou 4K, Dolby Vision ou non, seule la personne le sait).
let appAuto = !appSel.value;
// Au clavier, les flèches parcourent la liste sans la replier ; un clic (ou Entrée) choisit et replie.
$id("choix-appareil").addEventListener("keydown", (e) => { caClavier = e.key.indexOf("Arrow") === 0; if (e.key === "Enter" && e.target.name === "appareil") { caOuvert = false; majCles(); e.target.focus(); } });
$id("choix-appareil").addEventListener("pointerdown", () => { caClavier = false; });
$id("choix-appareil").addEventListener("change", () => { appAuto = false; if (!caClavier) caOuvert = false; garde("guide-appareil", appSel.value); majCles(); });
$id("ca-changer").addEventListener("click", () => { caOuvert = true; majCles(); const r = appRadios.find((x) => x.checked) || appRadios[0]; r.focus(); });
onglets.forEach((b) => b.addEventListener("click", () => {
  if (!appAuto) return;
  appSel.value = { android: "ecran", ios: "ecran", pc: "ecran", linux: "ecran" }[b.dataset.tab] || "";
  garde("guide-appareil", appSel.value); majCles();
}));
majCles();
// Boutons Copier
document.querySelectorAll("[data-copy]").forEach((btn) => btn.addEventListener("click", () => {
  const node = document.getElementById(btn.dataset.copy);
  const done = (t) => { btn.textContent = t; setTimeout(() => { btn.textContent = "Copier"; }, 1500); if (t !== "Sélectionné") popcorn(btn); };
  const fallback = () => { const r = document.createRange(); r.selectNodeContents(node); const s = getSelection(); s.removeAllRanges(); s.addRange(r); done("Sélectionné"); };
  try { navigator.clipboard.writeText(node.textContent).then(() => done("Copié ✓"), fallback); } catch (e) { fallback(); }
}));
// « Tout envoyer dans Nuvio » (compte-nuvio.js) : les liens du guide dans l'ancre, jamais envoyée au serveur.
document.querySelectorAll("[data-compte-nuvio]").forEach((a) => a.addEventListener("click", () => {
  a.href = ORIG + "/compte-nuvio#" + new URLSearchParams({ lien: $id("u-cat").textContent.trim(), affiches: $id("u-poster").textContent.trim() });
}));
// Nuvio importe aussi les collections en collant leur contenu (le JSON) : sur PC, c'est la seule façon.
document.querySelectorAll("[data-copy-contenu]").forEach((btn) => btn.addEventListener("click", () => {
  const url = document.getElementById(btn.dataset.copyContenu).textContent.trim(), label = btn.textContent;
  const zone = document.getElementById(btn.dataset.copyContenu + "-contenu");
  const texte = fetch(url).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); });
  copierContenu(texte).then(() => { zone.hidden = true; btn.textContent = "Contenu copié ✓"; setTimeout(() => { btn.textContent = label; }, 1500); popcorn(btn); }, () => texte.then((t) => {
    zone.value = t; zone.hidden = false; zone.focus(); zone.select();
    toast("Copie bloquée par le navigateur : le contenu est affiché et sélectionné, copie-le (appui long → Copier, ou Ctrl+C).", true);
  }, () => {
    window.open(url, "_blank", "noopener");
    toast("Contenu introuvable : le lien s'ouvre dans un onglet, sélectionne tout et copie.", true);
  }));
}));
// Le texte est demandé pendant le clic (ClipboardItem) : le navigateur garde l'autorisation de copier.
function copierContenu(texte) {
  try {
    if (window.ClipboardItem) return navigator.clipboard.write([new ClipboardItem({ "text/plain": texte.then((t) => new Blob([t], { type: "text/plain" })) })]);
    return texte.then((t) => navigator.clipboard.writeText(t));
  } catch (e) { return Promise.reject(e); }
}`;

/** Après scene.js, nuvio.js, apercu.js et reglages.js. */
export const GUIDE_FIN_JS = `// Amorce : le secteur balaie le cercle une fois, la première fois qu'on arrive sur l'étape.
const acts = [...document.querySelectorAll("section.act")];
const roll = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (e.isIntersecting) { e.target.classList.add("rolling"); roll.unobserve(e.target); }
}), { rootMargin: "0px 0px -25% 0px" });
acts.forEach((a) => roll.observe(a));

// Bobine : tourne avec le défilement, indique l'étape en cours, ouvre le sommaire.
const reelNav = document.getElementById("reel-nav"), reelBtn = document.getElementById("reel-btn"), menu = document.getElementById("reel-menu");
const home = document.createElement("a");
home.className = "home"; home.href = document.querySelector("a.sortie").href; home.setAttribute("data-programmation", ""); home.textContent = "Ta programmation (salle 2)";
menu.append(home);
document.querySelectorAll(".toc a").forEach((a) => menu.append(a.cloneNode(true)));
const astuce = document.createElement("p");
astuce.className = "astuce"; astuce.innerHTML = "Touches <kbd>T</kbd> et <kbd>G</kbd> du clavier : T pour revenir, G pour l'étape suivante.";
menu.append(astuce);
document.getElementById("reel-total").textContent = String(acts.length).padStart(2, "0");
const setMenu = (open) => { menu.hidden = !open; reelBtn.setAttribute("aria-expanded", String(open)); };
reelBtn.addEventListener("click", (e) => { e.stopPropagation(); setMenu(menu.hidden); });
menu.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
document.addEventListener("click", (e) => { if (!reelNav.contains(e.target)) setMenu(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { setMenu(false); reelBtn.focus(); } });
const spin = document.getElementById("reel-spin"), toc = document.querySelector(".toc");
let ticking = false, cur = -1;
const onScroll = () => {
  ticking = false;
  const max = document.documentElement.scrollHeight - innerHeight, away = toc.getBoundingClientRect().bottom > 0;
  spin.style.transform = "rotate(" + (scrollY / Math.max(max, 1) * 1440).toFixed(1) + "deg)";
  if (reelNav.classList.contains("away") !== away) { reelNav.classList.toggle("away", away); if (away) setMenu(false); }
};
addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
onScroll();
const spy = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (!e.isIntersecting) return;
  const i = acts.indexOf(e.target); cur = i; dispatchEvent(new Event("etape"));
  document.getElementById("reel-n").textContent = String(i + 1).padStart(2, "0");
  document.getElementById("reel-t").textContent = e.target.querySelector("h2").textContent;
  menu.querySelectorAll("a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id));
}), { rootMargin: "-35% 0px -60% 0px" });
acts.forEach((a) => spy.observe(a));

// Étapes faites : on composte son talon, c'est mémorisé sur l'appareil.
let faits = [];
try { faits = JSON.parse(localStorage.getItem("guide-faits") || "[]"); } catch (e) {}
const ring = document.getElementById("reel-ring");
function drawFaits(celebrate) {
  acts.forEach((a) => {
    const on = faits.includes(a.id);
    a.classList.toggle("fait", on);
    const b = a.querySelector(".composte"); b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "Fait ✓" : "À faire";
  });
  document.querySelectorAll(".toc a, .reel-menu a").forEach((l) => l.classList.toggle("fait", faits.includes((l.getAttribute("href") || "").slice(1))));
  ring.setAttribute("stroke-dasharray", (faits.length / acts.length * 100).toFixed(1) + " 100");
  document.getElementById("diplome").hidden = faits.length !== acts.length;
  if (celebrate && faits.length === acts.length) { bravo(); popcornRain(); toast("Tout est prêt. Ton diplôme t'attend en bas du guide !"); }
}
acts.forEach((a) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "composte"; b.setAttribute("aria-label", "Étape faite : " + a.querySelector("h2").textContent);
  b.addEventListener("click", () => {
    const on = !faits.includes(a.id);
    faits = on ? [...faits, a.id] : faits.filter((x) => x !== a.id);
    try { localStorage.setItem("guide-faits", JSON.stringify(faits)); } catch (e) {}
    if (on) { sfx.punch(); popcorn(b); }
    drawFaits(on);
  });
  a.querySelector("header").append(b);
});
drawFaits(false);

// Raccourcis : G étape suivante, T précédente (T est au-dessus de G sur le clavier).
addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || (e.target.closest && e.target.closest("input, textarea, select"))) return;
  const k = (e.key || "").toLowerCase();
  if (k !== "g" && k !== "t") return;
  const next = Math.max(0, Math.min(acts.length - 1, cur + (k === "g" ? 1 : -1)));
  acts[next].scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  cur = next;
});

// ---------- Du PC au téléphone : QR codes ----------
const QR_ICONE = '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M2 2h7v7H2zm2 2v3h3V4zm7-2h7v7h-7zm2 2v3h3V4zM2 11h7v7H2zm2 2v3h3v-3zm8-2h2v2h-2zm2 2h2v2h-2zm2-2h2v2h-2zm-4 4h2v3h-2zm4 0h2v3h-2zm-2 2h2v1h-2z"/></svg>';
// chargerQr et qrSvg : outils.js (communs avec la salle 2).
function montrerQr(titre, texte, cible, detail) {
  document.querySelectorAll(".qr-modal").forEach((x) => x._fermer());
  const ov = document.createElement("div"); ov.className = "qr-modal"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", titre);
  ov.innerHTML = '<div class="boite"><button type="button" class="fermer" aria-label="Fermer">×</button><h2></h2><div class="code-qr">Impression du QR code…</div><p></p><small></small></div>';
  ov.querySelector("h2").textContent = titre;
  ov.querySelector("p").textContent = texte;
  ov.querySelector("small").textContent = detail || "";
  document.body.append(ov);
  const close = () => { if (!ov.isConnected) return; ov.remove(); libere(); };
  const libere = modale(ov, close); ov._fermer = close;
  ov.querySelector(".fermer").addEventListener("click", close); ov.querySelector(".fermer").focus();
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  chargerQr().then((qrcode) => { ov.querySelector(".code-qr").innerHTML = qrSvg(qrcode, cible); },
    () => { const q = ov.querySelector(".code-qr"), p = document.createElement("p"); p.className = "alerte"; p.setAttribute("role", "alert"); p.textContent = "QR code indisponible : vérifie ta connexion."; q.textContent = ""; q.append(p); });
}
// Un bouton QR à côté de chaque « Copier » : le téléphone ouvre le guide avec ce lien prêt à copier.
document.querySelectorAll(".copy").forEach((box) => {
  const code = box.querySelector("code"); if (!code) return;
  const b = document.createElement("button"); b.type = "button"; b.className = "qr-btn"; b.innerHTML = QR_ICONE;
  b.setAttribute("aria-label", "Envoyer ce lien sur mon téléphone (QR code)"); b.title = "Envoyer sur mon téléphone";
  const nom = (box.closest(".addon") || box.closest(".act")).querySelector("h3, h2").textContent.trim();
  // Le QR code ouvre la page /lien : on y choisit de copier le lien ou le contenu du fichier.
  // (Le lien voyage après le #, il n'est jamais envoyé au serveur. Ton lien perso part tel quel, avec ta
  // clé Gemini : il sert à l'installer sur ton propre appareil.)
  b.addEventListener("click", () => {
    const valeur = code.textContent.trim();
    if (!valeur) return;
    const cible = ORIGINE + "/lien#" + new URLSearchParams({ u: valeur, nom }).toString();
    montrerQr("Sur ton téléphone", "Scanne avec l'appareil photo : tu pourras copier le lien, ou le contenu du fichier s'il s'agit d'une configuration.", cible, nom);
  });
  box.append(b);
});
document.getElementById("vers-tel").addEventListener("click", () => {
  const ici = acts[Math.max(0, cur)];
  montrerQr("Le guide sur ton téléphone", "Scanne avec l'appareil photo : le guide s'ouvre à la même étape.", ORIGINE + "/guide#" + (cur >= 0 ? ici.id : ""), "");
});
// Le trousseau sur le téléphone : les clés et l'appareil voyagent dans le QR code, après le #.
document.getElementById("cles-tel").addEventListener("click", () => {
  const o = paquetCles({ ad: adInput.value, appareil: appSel.value });
  if (!o.ad) { toast("Colle d'abord ta clé dans le trousseau."); adInput.focus(); return; }
  const b = btoa(JSON.stringify(o)).replace(/[+]/g, "-").replace(/[/]/g, "_").replace(/=+$/, "");
  // La clé passe par l'image, pas par le serveur du site ; mais l'appli qui lit le QR code la voit.
  montrerQr("Ta clé sur ton téléphone", "Scanne avec l'appareil photo du téléphone : le guide s'ouvre avec ta clé et tes liens prêts. Ta clé passe par l'image, pas par notre serveur ; évite les applis de scan, qui voient ce qu'elles lisent.", ORIGINE + "/guide#cles=" + b, "");
});
// Ancien format des QR codes (/guide#lien=…) : on passe à la page /lien, qui les ouvre aujourd'hui.
if (location.hash.indexOf("#lien=") === 0) {
  const p = new URLSearchParams(location.hash.slice(1));
  location.replace(ORIGINE + "/lien#" + new URLSearchParams({ u: p.get("lien") || "", nom: p.get("nom") || "" }).toString());
}

// ---------- Réclames d'avant-séance : une nouvelle toutes les 7 secondes ----------
(() => {
  const box = document.getElementById("reclames"), dots = document.getElementById("r-dots");
  const items = [...box.querySelectorAll(".reclame")];
  let i = 0, timer = 0;
  const show = (k) => {
    i = (k + items.length) % items.length;
    items.forEach((a, j) => {
      a.classList.toggle("on", j === i);
      if (j === i) a.removeAttribute("aria-hidden"); else a.setAttribute("aria-hidden", "true");
      a.querySelector(".r-cta").tabIndex = j === i ? 0 : -1;
    });
    dots.querySelectorAll("button").forEach((b, j) => b.setAttribute("aria-pressed", String(j === i)));
  };
  // Le défilement s'arrête au survol et au focus ; le bouton Pause l'arrête pour de bon. Sans animation
  // (mouvement réduit), il est arrêté au départ : le bouton le relance.
  let arrete = matchMedia("(prefers-reduced-motion: reduce)").matches, dessus = false;
  const pause = document.createElement("button"); pause.type = "button"; pause.className = "r-pause";
  const restart = () => {
    clearInterval(timer);
    pause.textContent = arrete ? "Lecture" : "Pause";
    pause.setAttribute("aria-label", arrete ? "Relancer le défilement des réclames" : "Arrêter le défilement des réclames");
    if (!arrete && !dessus) timer = setInterval(() => show(i + 1), 7000);
  };
  items.forEach((_, j) => {
    const b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-label", "Réclame " + (j + 1));
    b.addEventListener("click", () => { show(j); restart(); }); dots.append(b);
  });
  pause.addEventListener("click", () => { arrete = !arrete; restart(); });
  dots.append(pause);
  [box, dots].forEach((el) => {
    el.addEventListener("mouseenter", () => { dessus = true; restart(); }); el.addEventListener("mouseleave", () => { dessus = false; restart(); });
    el.addEventListener("focusin", () => { dessus = true; restart(); }); el.addEventListener("focusout", () => { dessus = false; restart(); });
  });
  show(0); restart();
})();

// ---------- La vendeuse d'esquimaux, à l'entracte ----------
(() => {
  const entracte = document.querySelector(".entracte"), v = entracte.querySelector(".vendeuse");
  const lane = () => entracte.style.setProperty("--allee", (entracte.clientWidth + 20) + "px");
  lane(); addEventListener("resize", lane);
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !entracte.classList.contains("vue")) { entracte.classList.add("vue"); }
  }, { threshold: .6 }).observe(entracte);
  // À mi-chemin, elle s'arrête et appelle les clients.
  let crieT = 0;
  const appel = () => {
    if (!entracte.classList.contains("vue") || v.classList.contains("pause")) return;
    v.classList.add("pause");
    v.querySelector(".v-bulle").textContent = "Esquimaux, chocolats glacés !";
    v.classList.remove("parle"); void v.offsetWidth; v.classList.add("parle");
    setTimeout(() => v.classList.remove("pause"), 2600);
  };
  new MutationObserver(() => { clearTimeout(crieT); if (entracte.classList.contains("vue")) crieT = setTimeout(appel, 6300); }).observe(entracte, { attributes: true, attributeFilter: ["class"] });
  v.addEventListener("animationend", (e) => { if (e.animationName === "passe") setTimeout(() => { entracte.classList.remove("vue"); }, 8000); });
  v.addEventListener("click", () => {
    v.classList.add("pause");
    v.querySelector(".v-bulle").textContent = "Esquimau, chocolat glacé !";
    v.classList.remove("parle"); void v.offsetWidth; v.classList.add("parle");
    sfx.punch(); popcorn(v); secret("esquimau");
    setTimeout(() => toast("Un esquimau, un ! Bon entracte."), 700);
    setTimeout(() => v.classList.remove("pause"), 2600);
  });
})();

// ---------- Le pot de pop-corn : il se vide pendant la lecture ----------
(() => {
  const pot = document.getElementById("pot");
  // Calculé une fois par image, et on ne touche à la page que si quelque chose a vraiment changé.
  let stock = 1, last = scrollY, prevenu = false, vu = -1, cache = null, raf = 0;
  const draw = () => {
    raf = 0;
    const pc = Math.round(stock * 50) * 2;
    if (pc !== vu) {
      vu = pc; pot.style.setProperty("--niveau", (pc / 100).toFixed(2));
      pot.setAttribute("aria-label", "Pot de pop-corn rempli à " + pc + " % : clique pour le remplir");
    }
    const away = toc.getBoundingClientRect().bottom > 0;
    if (away !== cache) { cache = away; pot.classList.toggle("away", away); }
  };
  addEventListener("scroll", () => {
    const dy = scrollY - last; last = scrollY;
    if (dy > 0) stock = Math.max(0, stock - dy / Math.max(1, (document.documentElement.scrollHeight - innerHeight) * .7));
    if (stock === 0 && !prevenu) { prevenu = true; pot.classList.add("vide"); setTimeout(() => pot.classList.remove("vide"), 1100); toast("Plus de pop-corn ! Clique sur le pot pour en reprendre."); }
    if (!raf) raf = requestAnimationFrame(draw);
  }, { passive: true });
  pot.addEventListener("click", () => {
    stock = Math.min(1, stock + .34); if (stock > .2) prevenu = false;
    popcorn(pot); draw();
  });
  draw();
})();

// ---------- Le pupitre de la cabine (étape 12) : on allume le voyant de l'endroit où ça coince ----------
(() => {
  const pu = $id("pupitre"), etat = $id("pu-etat"), voyants = [...pu.querySelectorAll(".voyant")];
  const pannes = [...document.querySelectorAll("#depannage details[data-moment]")];
  const de = (p, m) => p.dataset.moment.split(" ").includes(m);
  const nb = (n, mot) => n + " " + mot + (n > 1 ? "s" : "");
  voyants.forEach((v) => { v.querySelector("small").textContent = nb(pannes.filter((p) => de(p, v.dataset.moment)).length, "panne"); });
  const allumer = (m) => {
    voyants.forEach((v) => v.setAttribute("aria-pressed", String(v.dataset.moment === m)));
    const vues = pannes.filter((p) => !m || de(p, m));
    pannes.forEach((p) => p.classList.remove("revient")); void pu.offsetWidth;
    pannes.forEach((p) => { const on = vues.includes(p); p.hidden = !on; if (!on) p.open = false; else if (m) p.classList.add("revient"); });
    if (vues.length === 1) vues[0].open = true;
    const nom = m ? voyants.find((v) => v.dataset.moment === m).querySelector("b").textContent : "";
    etat.textContent = m ? "Voyant « " + nom + " » allumé : " + vues.length + (vues.length > 1 ? " pannes possibles" : " panne possible") + ". Rappuie dessus pour tout revoir."
      : "Tous les voyants sont éteints : voici toutes les pannes connues.";
  };
  voyants.forEach((v) => v.addEventListener("click", () => {
    sfx.click(); allumer(v.getAttribute("aria-pressed") === "true" ? "" : v.dataset.moment);
    // Les pannes restantes sont sous le pupitre : si elles sont hors de l'écran, la page descend pour les montrer.
    const premiere = pannes.find((p) => !p.hidden), r = premiere && premiere.getBoundingClientRect();
    if (r && r.top > innerHeight - 120) scrollBy({ top: r.top - innerHeight * .4, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }));
  allumer(""); pu.hidden = false;

  // Le grand rembobinage : chaque geste coché remet de la pellicule sur la bobine.
  const rb = $id("rembobinage"), cases = [...rb.querySelectorAll("input")], bobine = rb.querySelector(".rb-bobine");
  rb.addEventListener("change", () => {
    const n = cases.filter((c) => c.checked).length, fini = n === cases.length, r = 12 + n * 5.5;
    const film = rb.querySelector(".rb-film"); film.setAttribute("r", String(r)); film.style.setProperty("r", r + "px");
    rb.querySelector(".rb-tourne").style.transform = "rotate(" + (-n * 140) + "deg)";
    if (fini && $id("rb-fin").hidden) { sfx.applause(); popcorn(bobine); } else sfx.tick();
    $id("rb-fin").hidden = !fini;
  });
})();

// ---------- Le diplôme de projectionniste (image 1600 × 1130) ----------
(() => {
  const btn = document.getElementById("dip-btn"), nom = document.getElementById("dip-nom");
  try { nom.value = localStorage.getItem("diplome-nom") || ""; } catch (e) {}
  const fit = (c, text, max) => { if (c.measureText(text).width <= max) return text; while (text.length > 1 && c.measureText(text + "…").width > max) text = text.slice(0, -1); return text + "…"; };
  btn.addEventListener("click", async () => {
    const qui = nom.value.trim() || "Un fin cinéphile";
    try { localStorage.setItem("diplome-nom", nom.value.trim()); } catch (e) {}
    const label = btn.textContent; btn.textContent = "Calligraphie en cours…"; btn.disabled = true;
    try {
      await Promise.all(['400 120px "Bebas Neue"', 'italic 400 60px "Instrument Serif"', '600 34px "Figtree"', '800 24px "Figtree"', '700 30px "Courier Prime"'].map((f) => document.fonts.load(f)));
      const W = 1600, H = 1130, cv = document.createElement("canvas"); cv.width = W; cv.height = H; const c = cv.getContext("2d");
      c.fillStyle = "#f3e7cf"; c.fillRect(0, 0, W, H);
      const vg = c.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, 900); vg.addColorStop(0, "rgba(120,80,30,0)"); vg.addColorStop(1, "rgba(120,80,30,.28)"); c.fillStyle = vg; c.fillRect(0, 0, W, H);
      c.strokeStyle = "#8a5f1a"; c.lineWidth = 10; c.strokeRect(40, 40, W - 80, H - 80);
      c.lineWidth = 3; c.strokeRect(62, 62, W - 124, H - 124);
      [[62, 62], [W - 62, 62], [62, H - 62], [W - 62, H - 62]].forEach(([x, y]) => { c.fillStyle = "#8a5f1a"; c.beginPath(); c.arc(x, y, 14, 0, 6.283); c.fill(); c.fillStyle = "#f3e7cf"; c.beginPath(); c.arc(x, y, 7, 0, 6.283); c.fill(); });
      c.textAlign = "center";
      c.fillStyle = "#8a5f1a"; c.font = '800 24px "Figtree"'; c.fillText("NUVIO  ·  SALLE 1  ·  LE GUIDE DE A À Z", W / 2, 150);
      c.fillStyle = "#2a1a14"; c.font = '400 128px "Bebas Neue"'; c.fillText("DIPLÔME DE PROJECTIONNISTE", W / 2, 290);
      c.font = 'italic 400 46px "Instrument Serif"'; c.fillText("décerné à", W / 2, 385);
      c.fillStyle = "#7a1824"; c.font = 'italic 400 124px "Instrument Serif"'; c.fillText(fit(c, qui, 1200), W / 2, 520);
      c.strokeStyle = "rgba(42,26,20,.35)"; c.lineWidth = 2; c.beginPath(); c.moveTo(380, 555); c.lineTo(W - 380, 555); c.stroke();
      c.fillStyle = "#2a1a14"; c.font = '600 34px "Figtree"';
      c.fillText("pour avoir installé Nuvio en français, de A à Z, en douze étapes,", W / 2, 640);
      c.fillText("sans jamais parler pendant le film.", W / 2, 690);
      c.textAlign = "left"; c.font = '700 30px "Courier Prime"'; c.fillStyle = "#5a3a22";
      c.fillText("Le " + new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }), 170, 905);
      c.textAlign = "right"; c.fillStyle = "#2a1a14"; c.font = 'italic 400 60px "Instrument Serif"'; c.fillText("L'ouvreuse", W - 170, 900);
      c.strokeStyle = "#2a1a14"; c.lineWidth = 2; c.beginPath(); c.moveTo(W - 470, 920); c.bezierCurveTo(W - 380, 940, W - 260, 900, W - 160, 925); c.stroke();
      c.textAlign = "center";
      c.fillStyle = "#b8322c"; c.beginPath(); c.arc(W / 2, 890, 92, 0, 6.283); c.fill();
      c.strokeStyle = "#f3e7cf"; c.lineWidth = 3; c.beginPath(); c.arc(W / 2, 890, 78, 0, 6.283); c.stroke();
      c.fillStyle = "#f3e7cf"; c.font = '400 64px "Bebas Neue"'; c.fillText("35 MM", W / 2, 905);
      c.font = '800 18px "Figtree"'; c.fillText("CERTIFIÉ", W / 2, 935);
      const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
      const file = new File([blob], "diplome-projectionniste.png", { type: "image/png" });
      if (matchMedia("(pointer: coarse)").matches && navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: "Diplôme de projectionniste" });
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "diplome-projectionniste.png"; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
      btn.textContent = "Diplôme imprimé ✓"; popcorn(btn); sfx.punch();
    } catch (e) { btn.textContent = "Impression impossible"; toast("Impression du diplôme impossible : réessaie, ou fais une capture d'écran.", true); }
    btn.disabled = false; setTimeout(() => { btn.textContent = label; }, 2200);
  });
})();

// ---------- L'ouvreuse : elle suit la lecture et éclaire l'étape en cours ----------
(() => {
  const o = document.getElementById("ouvreuse"), beam = document.getElementById("o-faisceau");
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let y = innerHeight / 2, raf = 0, stopT = 0;
  const step = () => {
    raf = 0;
    if (!o.offsetParent && getComputedStyle(o).display === "none") return;
    // Elle vise le cercle du numéro de l'étape en cours ; s'il est hors de l'écran, elle attend à mi-hauteur.
    const act = acts[Math.max(0, cur)], h = act.querySelector(".num") || act.querySelector("h2"), r = h.getBoundingClientRect();
    const ox = o.getBoundingClientRect().right;   // la position horizontale ne dépend pas du déplacement vertical
    const dedans = r.bottom > 0 && r.top < innerHeight;
    const target = dedans ? Math.max(90, Math.min(innerHeight - 130, r.top + r.height / 2 - 39)) : innerHeight * .42;
    const dy = target - y; y = calm ? target : y + dy * .12;
    o.style.transform = "translateY(" + y.toFixed(1) + "px)";
    o.classList.toggle("marche", Math.abs(dy) > 2);
    const oy = y + 40, tx = r.left + r.width * .2, ty = r.top + r.height / 2;
    const visible = dedans && tx > ox;
    beam.classList.toggle("on", visible);
    if (visible) {
      const len = Math.hypot(tx - ox, ty - oy), ang = Math.atan2(ty - oy, tx - ox);
      beam.style.width = len.toFixed(0) + "px";
      beam.style.transform = "translate(" + ox.toFixed(0) + "px, " + oy.toFixed(0) + "px) rotate(" + ang.toFixed(3) + "rad)";
    }
    if (Math.abs(dy) > .5) raf = requestAnimationFrame(step);
  };
  const go = () => { if (!raf) raf = requestAnimationFrame(step); };
  addEventListener("scroll", go, { passive: true }); addEventListener("resize", go); addEventListener("etape", go); go();
  // Un clignement des yeux toutes les quelques secondes (ouvreuse et vendeuse), seulement si l'onglet est visible.
  if (!calm) setInterval(() => {
    if (document.hidden) return;
    document.querySelectorAll(".ouvreuse, .vendeuse").forEach((el) => { el.classList.add("cligne"); setTimeout(() => el.classList.remove("cligne"), 320); });
  }, 4600);
  o.addEventListener("click", () => {
    o.querySelector(".o-bulle").textContent = ["Par ici, je vous prie !", "Votre place est juste là.", "Pas de flash pendant la séance !", "Suivez ma lampe."][Math.floor(Math.random() * 4)];
    o.classList.remove("parle"); void o.offsetWidth; o.classList.add("parle");
    secret("ouvreuse"); sfx.click();
  });
})();`;
