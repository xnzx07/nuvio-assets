/**
 * Page « Connecter Nuvio » (servie sur /compte-nuvio), à l'essai : l'addon, les collections et le lien des affiches
 * arrivent dans Nuvio sans rien coller. La page se connecte au compte Nuvio de la personne comme une TV (code à
 * approuver sur nuvio.tv/link), puis écrit dans ce compte ; Nuvio les reprend tout seul (synchronisation du compte).
 * Tout se passe dans le navigateur : la session Nuvio n'est jamais envoyée à ce site, ni gardée dans sa base.
 * Le serveur de Nuvio publie son adresse et sa clé publique (/.well-known/nuvio) et accepte les appels des pages
 * web (CORS ouvert). Fonctions appelées, celles de l'appli NuvioTV (AuthManager, CollectionSyncService,
 * AddonSyncService, ProfileSettingsSyncService) : start_device_login_session, poll_tv_login_session,
 * tv-logins-exchange, sync_pull_profiles, sync_pull/push_collections, table addons et sync_push_addons,
 * sync_pull/push_profile_settings_blob, sync_pull/push_home_catalog_settings (HomeCatalogSettingsSyncService). Porte non officielle : une mise à jour de Nuvio peut la changer, les liens
 * à coller restent.
 */
import { feuilles, scripts } from "./statique.js";
import { creerLienAffiches } from "./lien-affiches.js";
import { DERNIERE } from "./page.js";
import { FACULTATIVES } from "./config.js";

export const NUVIO_DECOUVERTE = "https://api.nuvio.tv/.well-known/nuvio";
export const NUVIO_LIEN = "https://nuvio.tv/link";   // page où l'on approuve un appareil (DEVICE_LOGIN_WEB_BASE_URL)

/**
 * Les addons du compte, avec le nôtre : Nuvio remplace toute sa liste par celle du compte. Le premier addon de ce
 * site (même origine) prend le lien donné, à sa place ; les autres copies du nôtre sont retirées ; sans lui, il passe
 * en tête. Les addons de la personne restent, dans leur ordre (sort_order renuméroté).
 */
export function fusionAddons(distants, lien, origine) {
  const deCeSite = (u) => { try { return new URL(u).origin === origine; } catch (e) { return false; } };
  const tries = (Array.isArray(distants) ? distants : []).filter((a) => a && a.url).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const i = tries.findIndex((a) => deCeSite(a.url));
  const liste = tries.filter((a, j) => j === i || !deCeSite(a.url)).map((a) => (deCeSite(a.url) ? { ...a, url: lien, enabled: true } : a));
  if (i < 0) liste.unshift({ url: lien, enabled: true });
  return liste.map((a, n) => ({ url: a.url, sort_order: n, enabled: a.enabled !== false, ...(a.name ? { name: a.name } : {}) }));
}

/**
 * Les réglages TV du compte, avec le lien des affiches (Paramètres → Disposition → Custom Poster Source). Nuvio
 * efface chaque rubrique reçue avant de l'appliquer : on renvoie donc tous les réglages lus, ce seul changé. Sans
 * réglages TV dans le compte (la TV ne les a jamais envoyés), null : en écrire de nouveaux effacerait les siens.
 */
export function avecAffiches(reglages, lien) {
  if (!reglages || typeof reglages.features !== "object" || !reglages.features) return null;
  const disposition = { ...(reglages.features.layout_settings || {}), custom_poster_url_pattern: { type: "string", value: lien } };
  return { ...reglages, features: { ...reglages.features, layout_settings: disposition } };
}

/**
 * Réglages de Nuvio PC et téléphone (plateformes « desktop » et « mobile ») avec le lien des affiches : un champ texte
 * (custom_poster_url_pattern), pas le format de la TV. null si l'appareil n'a jamais envoyé ses réglages au compte :
 * un réglage presque vide remplacerait tous les siens.
 */
export function avecAffichesAppli(reglages, lien) {
  if (!reglages || typeof reglages.features !== "object" || !reglages.features) return null;
  return { ...reglages, features: { ...reglages.features, custom_poster_url_pattern: lien } };
}

/**
 * Les collections du compte, avec les nôtres à la place des anciennes : Nuvio remplace toute sa liste par celle du
 * compte, il faut donc garder celles que la personne a faites elle-même. Les nôtres (ids de `nosIds`, toutes celles
 * que le site peut fournir, même masquées depuis) sont retirées, puis celles du lien passent devant, dans leur ordre.
 */
export function fusionCollections(distantes, nos, nosIds) {
  const ids = new Set([...nosIds, ...nos.map((c) => c.id)]);
  return [...nos, ...(Array.isArray(distantes) ? distantes : []).filter((c) => !(c && ids.has(c.id)))];
}

/**
 * Les réglages de l'accueil du compte (sync_push_home_catalog_settings, « home_catalog_shared » : l'ordre et
 * l'affichage de chaque ligne, communs à tous les appareils), dans l'ordre du site : nos collections et nos rangées
 * (ordre de /accueil.json) en tête, puis les autres lignes du compte dans leur ordre. Ce que la personne a réglé dans
 * Nuvio reste (ligne masquée, titre renommé), sauf pour les nôtres, toujours affichées.
 */
export function fusionAccueil(distants, ordre, addon) {
  const cle = (it) => (it.is_collection ? "c:" + it.collection_id : `${it.addon_id}/${it.type}/${it.catalog_id}`);
  const avant = (Array.isArray(distants) ? distants : []).filter((it) => it && typeof it === "object")
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  const parCle = new Map(avant.map((it) => [cle(it), it]));
  const nos = ordre.map((o) => (o.collection
    ? { addon_id: "", type: "", catalog_id: "", is_collection: true, collection_id: o.collection }
    : { addon_id: addon, type: o.type, catalog_id: o.id, is_collection: false, collection_id: "" }));
  const nosCles = new Set(nos.map(cle));
  return [
    ...nos.map((it) => ({ ...it, enabled: true, custom_title: (parCle.get(cle(it)) || {}).custom_title || "" })),
    ...avant.filter((it) => !nosCles.has(cle(it))),
  ].map((it, order) => ({ addon_id: it.addon_id || "", type: it.type || "", catalog_id: it.catalog_id || "", enabled: it.enabled !== false,
    order, custom_title: it.custom_title || "", is_collection: !!it.is_collection, collection_id: it.collection_id || "" }));
}

export function compteNuvioPage({ origin }) {
  const LOGO = origin + "/logo.png";
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Tout envoyer dans Nuvio · Nuvio en français</title>
<meta name="robots" content="noindex">
<link rel="icon" href="${LOGO}">
${feuilles("polices.css")}
<style>
:root { --velvet: #170c12; --velvet-2: #22121b; --seat: #3d2230; --cream: #f5ead8; --dim: #b9a59c; --bulb: #ffcf6b; --ink: #2a1a14; --red: #e5413a; --green: #5fd39a; color-scheme: dark; }
* { box-sizing: border-box; }
::selection { background: var(--bulb); color: var(--ink); }
body { margin: 0; min-height: 100vh; color: var(--cream); font: 16px/1.5 "Figtree", system-ui, sans-serif;
  background: radial-gradient(ellipse 90% 40% at 50% -5%, rgba(229,65,58,.25), transparent 70%), var(--velvet);
  padding: max(24px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(32px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); }
main { max-width: 560px; margin: 0 auto; display: grid; gap: 16px; }
a { color: var(--bulb); text-underline-offset: 3px; }
:focus-visible { outline: 2px solid var(--bulb); outline-offset: 3px; }
h2:focus { outline: none; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* Le billet d'entrée : le titre et la promesse */
.ticket { display: grid; gap: 6px; padding: 18px 20px; border-radius: 14px; background: var(--cream); color: var(--ink); }
.ticket small { font: 800 .72rem "Figtree"; letter-spacing: .16em; text-transform: uppercase; color: #7a5a4c; }
h1 { margin: 0; font: 400 2.2rem/1 "Bebas Neue", Impact, sans-serif; letter-spacing: .03em; }
.ticket p { margin: 0; font-size: .95rem; color: #4a3328; text-wrap: pretty; }

/* Les trois étapes : où on en est */
.etapes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; counter-reset: e; }
.etapes li { counter-increment: e; display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--seat); color: var(--dim); font: 700 .82rem/1.2 "Figtree", system-ui, sans-serif; }
.etapes li::before { content: counter(e); flex: none; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; border: 1.5px solid currentColor; font: 800 .75rem/1 "Figtree", system-ui, sans-serif; }
.etapes li.en-cours { color: var(--bulb); border-color: rgba(255,207,107,.55); background: rgba(255,207,107,.07); }
.etapes li.fait { color: var(--green); border-color: rgba(95,211,154,.35); }
.etapes li.fait::before { content: "✓"; background: var(--green); border-color: var(--green); color: var(--velvet); }

/* Les blocs d'étape */
.bloc { display: grid; gap: 12px; padding: 20px; border-radius: 14px; border: 1px solid var(--seat); background: var(--velvet-2); }
/* Ce qui s'ouvre défile jusqu'à l'écran, avec un peu d'air au-dessus. */
.bloc, .etat, details.liens { scroll-margin: 16px; }
.bloc[hidden], [hidden] { display: none !important; }
h2 { margin: 0; font: 400 1.6rem/1.05 "Bebas Neue", Impact, sans-serif; letter-spacing: .04em; color: var(--cream); }
.aide { margin: 0; font-size: .92rem; color: var(--dim); text-wrap: pretty; }
label { font-weight: 800; }
input, select { width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--seat); background: #0f080c; color: var(--cream); font: .9rem "Figtree", system-ui, sans-serif; }
input:focus, select:focus { outline: none; border-color: var(--bulb); box-shadow: 0 0 0 3px rgba(255,207,107,.22); }
button, .bouton { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 48px; padding: 12px 16px; border-radius: 12px; border: 1.5px solid var(--seat); background: transparent; color: var(--cream);
  font: 800 1rem "Figtree", system-ui, sans-serif; text-decoration: none; cursor: pointer; transition: background .15s ease, border-color .15s ease, transform .12s ease; }
button:hover, .bouton:hover { border-color: rgba(255,207,107,.55); }
button:active, .bouton:active { transform: scale(.98); }
button.principal, .bouton.principal { background: var(--bulb); border-color: var(--bulb); color: var(--ink); }
button.principal:hover, .bouton.principal:hover { background: #ffe0a0; }
button.discret { width: auto; min-height: 0; padding: 6px 2px; border: 0; color: var(--dim); font-weight: 700; font-size: .88rem; text-decoration: underline; text-underline-offset: 3px; }
button.discret:hover { color: var(--cream); }
button:disabled { opacity: .5; cursor: default; transform: none; }
a, button { touch-action: manipulation; }

/* Étape 1 bis : le code à approuver */
.code { margin: 0; text-align: center; font: 400 3rem/1 "Bebas Neue", Impact, sans-serif; letter-spacing: .2em; color: var(--bulb); padding: 14px 0 10px; border-radius: 12px; border: 1.5px dashed rgba(255,207,107,.45); background: #120a0e; user-select: all; }
.approuver { display: grid; grid-template-columns: 172px minmax(0, 1fr); gap: 18px; align-items: center; }
.qr { width: 172px; padding: 8px; border-radius: 12px; background: #fff; }
.qr:empty { aspect-ratio: 1; background: #120a0e; border: 1px solid var(--seat); }
.qr svg { display: block; width: 100%; height: auto; }
.approuver .suite { display: grid; gap: 10px; }
.attente { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin: 0; font-weight: 700; color: var(--cream); }
.attente::before { content: ""; flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--bulb); animation: pouls 1.4s ease-in-out infinite; }
.attente small { margin-left: auto; font-weight: 600; color: var(--dim); font-variant-numeric: tabular-nums; white-space: nowrap; }
@keyframes pouls { 50% { opacity: .25; transform: scale(.7); } }
/* Sur un téléphone, on ne scanne pas son propre écran : le bouton passe devant, le QR (pour un autre appareil) après. */
@media (max-width: 560px) {
  .approuver { grid-template-columns: 1fr; }
  .qr { order: 2; width: 150px; justify-self: center; }
}

/* Étape 2 : le compte, le profil, ce qu'on envoie */
.compte-tete { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 12px; }
.qui { margin: 0; font-size: .9rem; color: var(--dim); overflow-wrap: anywhere; }
.qui b { color: var(--green); }
.champ { display: grid; gap: 6px; }
fieldset { margin: 0; padding: 0; border: 0; display: grid; gap: 10px; }
legend { padding: 0; margin-bottom: 8px; font-weight: 800; }
/* Les interrupteurs : les mêmes que la salle 2 (Mode famille, collections). */
.switch { display: flex; align-items: center; gap: 12px; padding: 4px 0; cursor: pointer; }
.switch input { appearance: none; width: 46px; height: 26px; margin: 0; border-radius: 99px; background: var(--seat); position: relative; cursor: pointer; flex: none; transition: background .15s ease; }
.switch input::after { content: ""; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: var(--cream); transition: transform .15s ease; }
.switch input:checked { background: var(--red); }
.switch input:checked::after { transform: translateX(20px); }
.switch b { font-weight: 800; }
.switch small { display: block; font-size: .85rem; font-weight: 400; color: var(--dim); }
details.liens { border-radius: 12px; border: 1px solid var(--seat); }
details.liens summary { display: flex; align-items: center; gap: 10px; padding: 12px 14px; cursor: pointer; list-style: none; font-weight: 700; }
details.liens summary::-webkit-details-marker { display: none; }
details.liens summary::after { content: ""; margin-left: auto; width: 8px; height: 8px; border-right: 2px solid var(--dim); border-bottom: 2px solid var(--dim); transform: rotate(45deg) translateY(-2px); transition: transform .15s ease; }
details.liens[open] summary::after { transform: rotate(-135deg) translateY(-2px); }
details.liens summary small { font-weight: 600; color: var(--dim); }
details.liens summary small.manque { color: #ffb4a8; }
details.liens .dedans { display: grid; gap: 12px; padding: 0 14px 14px; }

/* Le résultat */
.etat { min-height: 1.4em; margin: 0; font-weight: 800; text-align: center; color: var(--bulb); }
.etat:empty { display: none; }
.etat.reussi { display: grid; gap: 4px; padding: 16px; border-radius: 12px; border: 1.5px solid rgba(95,211,154,.5); background: rgba(95,211,154,.08); color: var(--green); }
.etat.reussi small { font-weight: 600; color: var(--cream); }
/* Les erreurs : le même encadré rouge que sur le reste du site. */
.erreur { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 12px; border: 1.5px solid var(--red); background: #3b1216; color: #ffe1d8; font-weight: 600; text-align: left; box-shadow: 0 0 0 3px rgba(229,65,58,.15); }
.erreur::before { content: "!"; flex: none; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: var(--red); color: #fff; font: 800 .85rem/1 "Figtree", system-ui, sans-serif; }
#bilan { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
#bilan:empty { display: none; }
#bilan li { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 10px; background: var(--velvet-2); border: 1px solid var(--seat); font-weight: 600; }
#bilan li::before { content: "✓"; flex: none; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; background: var(--green); color: var(--velvet); font: 800 .75rem/1 "Figtree", system-ui, sans-serif; }
#bilan li.ko { color: #ffd2c8; border-color: rgba(229,65,58,.5); }
#bilan li.ko::before { content: "!"; background: var(--red); color: #fff; }
.pied { margin: 8px 0 0; text-align: center; font-size: .9rem; color: var(--dim); }
@media (prefers-reduced-motion: reduce) { .attente::before { animation: none; } button, .bouton, .switch input, .switch input::after { transition: none; } }
</style>
</head>
<body>
<main>
  <header class="ticket">
    <small>Sans rien coller</small>
    <h1>Tout envoyer dans Nuvio</h1>
    <p>L'addon, les collections, l'ordre de l'accueil et tes affiches arrivent tout seuls sur tes appareils connectés à ton compte Nuvio.</p>
  </header>

  <ol class="etapes" aria-label="Étapes">
    <li id="p1" class="en-cours">Connecter</li>
    <li id="p2">Choisir</li>
    <li id="p3">Envoyer</li>
  </ol>

  <section class="bloc" id="b-connexion" aria-labelledby="t-connexion">
    <h2 id="t-connexion" tabindex="-1">Connecte ton compte Nuvio</h2>
    <p class="aide">Comme pour une TV : un code à approuver avec ton compte Nuvio (gratuit). La connexion reste dans ce navigateur, ce site ne la voit jamais.</p>
    <button type="button" class="principal" id="connecter">Connecter mon compte Nuvio</button>
  </section>

  <section class="bloc" id="b-code" aria-labelledby="t-code" hidden>
    <h2 id="t-code" tabindex="-1">Approuve avec ce code</h2>
    <p class="code" id="code" aria-label="Code de connexion"></p>
    <div class="approuver">
      <div class="qr" id="qr" aria-label="QR code de connexion"></div>
      <div class="suite">
        <p class="aide">Ouvre <b>nuvio.tv/link</b>, connecte-toi à ton compte Nuvio si on te le demande, vérifie le code puis approuve. Depuis un autre appareil, scanne le QR code.</p>
        <a class="bouton principal" id="ouvrir" target="_blank" rel="noopener">Ouvrir nuvio.tv/link</a>
      </div>
    </div>
    <p class="attente" role="status">En attente de ton accord…<small id="reste"></small></p>
    <button type="button" class="discret" id="annuler">Annuler</button>
  </section>

  <section class="bloc" id="b-compte" aria-labelledby="t-compte" hidden>
    <div class="compte-tete">
      <h2 id="t-compte" tabindex="-1">Que veux-tu envoyer ?</h2>
      <button type="button" class="discret" id="deconnecter">Déconnecter</button>
    </div>
    <p class="qui" id="qui"><b>Compte Nuvio connecté</b></p>
    <div class="champ">
      <label for="profil">Profil Nuvio</label>
      <select id="profil"></select>
    </div>
    <fieldset>
      <legend class="visually-hidden">Ce qui part dans ton compte</legend>
      <label class="switch"><input type="checkbox" id="e-addon" checked><span><b>L'addon</b><small>Tes autres addons restent ; le nôtre prend ton lien.</small></span></label>
      <label class="switch"><input type="checkbox" id="e-coll" checked><span><b>Les collections</b><small>Celles que tu as faites toi-même restent ; les nôtres sont remplacées.</small></span></label>
      <label class="switch"><input type="checkbox" id="e-acc" checked><span><b>L'ordre de l'accueil</b><small>Plateformes en haut, puis tes rangées et tes collections dans l'ordre choisi sur le site ; les rangées de tes autres addons suivent.</small></span></label>
      <label class="switch"><input type="checkbox" id="e-aff" checked><span><b>Les affiches</b><small>Custom Poster Source, sur chaque appareil (TV, PC, téléphone) qui a déjà ouvert Nuvio avec ce compte.</small></span></label>
    </fieldset>
    <details class="liens" id="liens">
      <summary>Tes liens <small id="liens-etat">repris de ton billet</small></summary>
      <div class="dedans">
        <div class="champ">
          <label for="lien">Ton lien d'addon</label>
          <input id="lien" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="${origin}/…/manifest.json">
          <p class="aide">Celui de ton billet, repris de ta dernière programmation en salle 2 sur cet appareil : l'addon et les collections suivront ses réglages (pays, genres, tuiles).</p>
        </div>
        <div class="champ">
          <label for="affiches">Ton lien d'affiches</label>
          <input id="affiches" type="url" inputmode="url" autocomplete="off" spellcheck="false">
          <p class="aide">Celui de ton billet, avec les réglages de la régie de ce navigateur.</p>
        </div>
      </div>
    </details>
    <button type="button" class="principal" id="envoyer">Envoyer dans Nuvio</button>
  </section>

  <div class="etat" id="etat" role="status"></div>
  <ul id="bilan" aria-live="polite"></ul>
  <p class="pied"><a href="${origin}/guide">Retour au guide</a> · <a href="${origin}/configure">Ta programmation (salle 2)</a></p>
</main>
${scripts("outils.js")}
<script>
// __name : voir NUVIO_JS (nuvio.js), le code d'une fonction recopiée telle quelle peut l'appeler.
var __name = function (f) { return f; };
(() => {
  const $ = (id) => document.getElementById(id);
  const etat = (t, err) => { $("etat").textContent = t; $("etat").className = "etat" + (err ? " erreur" : ""); };
  const CLE = "compte-nuvio";
  const lire = () => { try { return JSON.parse(localStorage.getItem(CLE) || "{}"); } catch (e) { return {}; } };
  const garder = (o) => { try { localStorage.setItem(CLE, JSON.stringify(o)); } catch (e) {} };
  let memo = lire(), serveur = null, attente = null;
  const fusion = ${fusionCollections.toString()};
  const fusionAcc = ${fusionAccueil.toString()};
  const fusionAddons = ${fusionAddons.toString()};
  const avecAffiches = ${avecAffiches.toString()};
  const avecAffichesAppli = ${avecAffichesAppli.toString()};
  const LA = (${creerLienAffiches})();

  // Les liens : dans l'ancre (#lien=…&affiches=…), sinon ce que la salle 2 a gardé sur cet appareil, sinon les
  // derniers utilisés ici.
  const p = new URLSearchParams(location.hash.slice(1));
  const lu = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  // La dernière programmation de la salle 2 (${DERNIERE} : /<réglages>/configure). Un lien fixe tel quel ; des
  // réglages dans l'adresse seulement sans clé Gemini gardée : elle n'est pas dans ce chemin, l'addon installé
  // perdrait la recherche par IA.
  const salle2 = () => {
    const m = /^[/]([^/]+)[/]configure$/.exec(lu(${JSON.stringify(DERNIERE)}) || "");
    if (!m || (!/^f[0-9A-Za-z]{16}$/.test(m[1]) && lu("cle-gemini"))) return "";
    return location.origin + "/" + m[1] + "/manifest.json";
  };
  $("lien").value = p.get("lien") || salle2() || memo.lien || "";
  // Les affiches : les réglages de la régie de ce navigateur (affiches-v2, comme lienPerso dans nuvio.js).
  const regie = (k) => { const s = lu(k); return s === null ? null : LA.lireReglages(new URLSearchParams(s ? "s=1." + s : "")); };
  $("affiches").value = p.get("affiches") || (lu("affiches-v2") !== null || !memo.affiches
    ? LA.lienAffiches(regie("affiches-v2") || LA.lireReglages(new URLSearchParams("")), regie("affiches-v2-paysage")) : memo.affiches);
  // Les liens restent repliés quand ils sont là ; sans lien d'addon, le panneau s'ouvre et le dit.
  const etatLiens = () => {
    const vide = !$("lien").value.trim();
    $("liens-etat").textContent = vide ? "lien d'addon manquant : colle celui de ton billet" : p.get("lien") ? "repris de ton billet" : "repris de cet appareil";
    $("liens-etat").className = vide ? "manque" : "";
    if (vide) $("liens").open = true;
  };
  // Ce qui s'ouvre (étape suivante, liens, résultat) défile jusqu'à l'écran ; sans animation si on l'a demandé.
  const voir = (el, ou) => el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: ou || "nearest" });
  etatLiens();
  $("liens").addEventListener("toggle", () => { if ($("liens").open && !$("b-compte").hidden) voir($("liens")); });
  $("lien").addEventListener("input", etatLiens);
  const baseDu = (lien) => {
    if (!lien.trim()) throw new Error("colle le lien d'addon de ton billet dans « Tes liens ».");
    let u; try { u = new URL(lien.trim()); } catch (e) { throw new Error("ce lien d'addon n'est pas une adresse (il commence par " + location.origin + ")."); }
    if (u.origin !== location.origin) throw new Error("ce n'est pas un lien d'addon de ce site.");
    return u.origin + u.pathname.replace(/[/](manifest[.]json|configure)?$/, "");
  };

  // Le serveur de Nuvio, tel qu'il se décrit lui-même (adresse et clé publique).
  const decouvrir = async () => {
    if (serveur) return serveur;
    const d = await fetch(${JSON.stringify(NUVIO_DECOUVERTE)}).then((r) => r.json());
    if (!d.backend_url || !d.publishable_key) throw new Error("Nuvio ne répond pas comme prévu.");
    return (serveur = { url: d.backend_url.replace(/[/]$/, ""), cle: d.publishable_key });
  };
  // corps undefined : une lecture (GET), pour les tables (addons).
  const appel = async (chemin, corps, jeton) => {
    const s = await decouvrir();
    const h = { apikey: s.cle, "Content-Type": "application/json", Accept: "application/json" };
    if (jeton) h.Authorization = "Bearer " + jeton;
    const r = await fetch(s.url + chemin, corps === undefined ? { headers: h } : { method: "POST", headers: h, body: JSON.stringify(corps) });
    const t = await r.text();
    let d = null; try { d = t ? JSON.parse(t) : null; } catch (e) {}
    if (!r.ok) { const err = new Error((d && (d.message || d.error_description || d.error)) || ("Nuvio a répondu " + r.status)); err.status = r.status; throw err; }
    return d;
  };
  // Appel avec la session ; jeton expiré : on le renouvelle une fois (refresh_token), comme l'appli.
  const appelCompte = async (chemin, corps) => {
    try { return await appel(chemin, corps, memo.acces); }
    catch (e) {
      if (e.status !== 401 || !memo.renouv) throw e;
      const t = await appel("/auth/v1/token?grant_type=refresh_token", { refresh_token: memo.renouv });
      memo.acces = t.access_token; memo.renouv = t.refresh_token || memo.renouv; garder(memo);
      return appel(chemin, corps, memo.acces);
    }
  };
  const rpc = (nom, corps) => appelCompte("/rest/v1/rpc/" + nom, corps || {});
  const hasard = () => { const a = new Uint8Array(24); crypto.getRandomValues(a); return Array.from(a, (x) => x.toString(16).padStart(2, "0")).join(""); };

  // Une étape à la fois ; le fil du haut suit, et le focus va au titre quand c'est un clic qui fait avancer.
  let minuteur = null;
  const montrer = (quoi, focus) => {
    $("b-connexion").hidden = quoi !== "connexion"; $("b-code").hidden = quoi !== "code"; $("b-compte").hidden = quoi !== "compte";
    const dedans = quoi === "compte";
    $("p1").className = dedans ? "fait" : "en-cours"; $("p2").className = dedans ? "en-cours" : ""; $("p3").className = "";
    if (quoi !== "code") { clearInterval(minuteur); clearTimeout(attente); }
    if (focus) { $("t-" + quoi).focus({ preventScroll: true }); voir($("b-" + quoi), "start"); }
  };
  // L'adresse e-mail du compte, lue dans le jeton (il ne quitte pas ce navigateur).
  const courriel = () => {
    try { return JSON.parse(atob(memo.acces.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).email || ""; } catch (e) { return ""; }
  };
  const profils = async () => {
    const liste = await rpc("sync_pull_profiles").catch(() => null);
    const sel = $("profil"); sel.textContent = "";
    const rangs = Array.isArray(liste) && liste.length ? liste : [{ profile_index: 1, name: "Profil principal" }];
    for (const pr of rangs.sort((a, b) => a.profile_index - b.profile_index)) {
      const o = document.createElement("option"); o.value = pr.profile_index; o.textContent = pr.name || ("Profil " + pr.profile_index);
      // Un profil qui prend les addons du profil principal : ses addons sont rangés sous le profil 1 (AddonSyncService).
      o.dataset.addons = pr.profile_index !== 1 && pr.uses_primary_addons ? "1" : String(pr.profile_index);
      if (String(pr.profile_index) === String(memo.profil || 1)) o.selected = true;
      sel.append(o);
    }
  };
  const connecte = async (focus) => {
    const mail = courriel(), qui = $("qui"); qui.textContent = "";
    const b = document.createElement("b"); b.textContent = "Connecté"; qui.append(b, mail ? " · " + mail : " à ton compte Nuvio");
    montrer("compte", focus); etat(""); await profils();
  };

  // Connexion « comme une TV » : un code, approuvé par la personne sur nuvio.tv/link.
  $("connecter").addEventListener("click", async () => {
    $("connecter").disabled = true; etat("");
    try {
      const nonce = hasard();
      const r = await appel("/rest/v1/rpc/start_device_login_session", { p_device_nonce: nonce, p_redirect_base_url: ${JSON.stringify(NUVIO_LIEN)}, p_device_type: "tv", p_device_name: "Nuvio en français (site)" });
      const s = Array.isArray(r) ? r[0] : r;
      $("code").textContent = s.user_code; $("ouvrir").href = s.verification_uri_complete;
      chargerQr().then((qrcode) => { $("qr").innerHTML = qrSvg(qrcode, s.verification_uri_complete, "QR code de connexion à Nuvio", true); }, () => {});
      montrer("code", true);
      const fin = Date.parse(s.expires_at) || Date.now() + 600000, pas = Math.max(2, s.poll_interval_seconds || 3) * 1000;
      const reste = () => { const t = Math.max(0, Math.round((fin - Date.now()) / 1000)); $("reste").textContent = "expire dans " + Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); };
      reste(); minuteur = setInterval(reste, 1000);
      const tour = async () => {
        if (Date.now() > fin) { montrer("connexion", true); etat("Le code a expiré : recommence.", true); return; }
        try {
          const q = await appel("/rest/v1/rpc/poll_tv_login_session", { p_code: s.device_code, p_device_nonce: nonce });
          const st = (Array.isArray(q) ? q[0] : q || {}).status;
          if (st === "approved") {
            const t = await appel("/functions/v1/tv-logins-exchange", { code: s.device_code, device_nonce: nonce });
            memo.acces = t.access_token; memo.renouv = t.refresh_token; garder(memo);
            return connecte(true);
          }
          if (st === "expired" || st === "used" || st === "cancelled") { montrer("connexion", true); etat("Connexion refusée ou expirée : recommence.", true); return; }
        } catch (e) { /* réseau : on réessaie au tour suivant */ }
        attente = setTimeout(tour, pas);
      };
      attente = setTimeout(tour, pas);
    } catch (e) { etat("Connexion impossible : " + e.message, true); }
    $("connecter").disabled = false;
  });
  $("annuler").addEventListener("click", () => { montrer("connexion", true); etat(""); });

  const lireJson = (u) => fetch(u).then((r) => r.ok ? r.json() : r.json().then((d) => { throw new Error((d && d.error) || ("réponse " + r.status)); }, () => { throw new Error("réponse " + r.status); }));
  const bilan = (texte, ok) => { const li = document.createElement("li"); li.textContent = texte; if (!ok) li.className = "ko"; $("bilan").append(li); };

  // Chaque partie à son tour : une qui échoue n'empêche pas les autres.
  const envoiAddon = async (base, profil) => {
    const lien = base + "/manifest.json";
    await lireJson(lien);   // le lien répond (pas de lien cassé installé dans Nuvio)
    const avant = await appelCompte("/rest/v1/addons?select=url,name,enabled,sort_order&profile_id=eq." + profil + "&order=sort_order.asc");
    const liste = fusionAddons(avant, lien, location.origin);
    await rpc("sync_push_addons", { p_addons: liste, p_profile_id: profil, p_origin_client_id: memo.client });
    return "L'addon, " + (liste.length - 1 ? "avec tes " + (liste.length - 1) + " autres addons" : "seul");
  };
  const envoiCollections = async (base, profil) => {
    const [nos, toutes] = await Promise.all([base + "/collections.json", location.origin + "/collections.json"].map(lireJson));
    if (!Array.isArray(nos) || !nos.length) throw new Error("ton lien ne donne aucune collection.");
    const distant = await rpc("sync_pull_collections", { p_profile_id: profil });
    const avant = (Array.isArray(distant) && distant[0] && distant[0].collections_json) || [];
    // Les nôtres : celles de la config par défaut, plus les facultatives (décochées, elles quittent le compte).
    const liste = fusion(avant, nos, (Array.isArray(toutes) ? toutes : []).map((c) => c.id).concat(${JSON.stringify(FACULTATIVES)}));
    await rpc("sync_push_collections", { p_profile_id: profil, p_collections_json: liste, p_origin_client_id: memo.client });
    const perso = liste.length - nos.length;
    return "Les collections : " + nos.length + (perso ? ", et tes " + perso + " à toi gardées" : "");
  };
  // L'ordre de l'accueil, commun aux appareils du profil : Nuvio le reprend à son ouverture.
  const envoiAccueil = async (base, profil) => {
    const a = await lireJson(base + "/accueil.json");
    if (!a || !Array.isArray(a.ordre) || !a.addon) throw new Error("ton lien ne donne pas d'ordre d'accueil.");
    const d = await rpc("sync_pull_home_catalog_settings", { p_profile_id: profil, p_platform: "home_catalog_shared" });
    const avant = (Array.isArray(d) && d[0] && d[0].settings_json) || {};
    const reglages = { ...avant, items: fusionAcc(avant.items, a.ordre, a.addon) };
    await rpc("sync_push_home_catalog_settings", { p_profile_id: profil, p_settings_json: reglages, p_platform: "home_catalog_shared", p_origin_client_id: memo.client });
    return "L'ordre de l'accueil";
  };
  const envoiAffiches = async (lien, profil) => {
    // Un modèle que Nuvio remplit ({id}…), pas l'adresse d'une seule affiche.
    if (!/[{]id[}]/.test(lien) || !LA.reglagesDuLien(lien)) throw new Error("ce n'est pas un lien d'affiches (celui de ton billet, avec {type}/{shape}/{id}).");
    // Chaque appareil range ses réglages à part dans le compte : la TV (son format), le PC et le téléphone (le leur).
    // Un appareil qui ne les a jamais envoyés est sauté (on n'écrase pas ses réglages par un réglage presque vide).
    const faits = [];
    const tv = await rpc("sync_pull_profile_settings_blob", { p_profile_id: profil, p_platform: "tv" });
    const reglagesTv = avecAffiches(Array.isArray(tv) && tv[0] && tv[0].settings_json, lien);
    if (reglagesTv) {
      await rpc("sync_push_profile_settings_blob", { p_profile_id: profil, p_settings_json: reglagesTv, p_platform: "tv", p_origin_client_id: memo.client });
      faits.push("la TV");
    }
    for (const [plateforme, nom] of [["desktop", "le PC"], ["mobile", "le téléphone"]]) {
      const d = await rpc("sync_pull_profile_settings_blob", { p_profile_id: profil, p_platform: plateforme });
      const reglages = avecAffichesAppli(Array.isArray(d) && d[0] && d[0].settings_json, lien);
      if (!reglages) continue;
      await rpc("sync_push_profile_settings_blob", { p_profile_id: profil, p_settings_json: reglages, p_platform: plateforme, p_origin_client_id: memo.client });
      faits.push(nom);
    }
    if (!faits.length) throw new Error("aucun appareil n'a encore envoyé ses réglages au compte : ouvre Nuvio (TV, PC ou téléphone) connecté à ce compte, puis réessaie (ou colle le lien à la main).");
    return "Les affiches : " + faits.join(", ");
  };

  $("envoyer").addEventListener("click", async () => {
    const b = $("envoyer"); b.disabled = true; b.textContent = "Envoi en cours…"; etat(""); $("bilan").textContent = ""; $("p3").className = "en-cours";
    let base = "";
    const fini = () => { b.disabled = false; b.textContent = "Envoyer dans Nuvio"; };
    try { base = baseDu($("lien").value); } catch (e) { etat("Envoi impossible : " + e.message, true); $("liens").open = true; $("lien").focus({ preventScroll: true }); $("p3").className = ""; fini(); return; }
    const opt = $("profil").selectedOptions[0];
    memo.lien = $("lien").value.trim(); memo.affiches = $("affiches").value.trim(); memo.profil = +$("profil").value;
    if (!memo.client) memo.client = "site-" + hasard();
    garder(memo);
    const parties = [
      ["e-addon", "L'addon", () => envoiAddon(base, +((opt && opt.dataset.addons) || memo.profil))],
      ["e-coll", "Les collections", () => envoiCollections(base, memo.profil)],
      ["e-acc", "L'ordre de l'accueil", () => envoiAccueil(base, memo.profil)],
      ["e-aff", "Les affiches", () => envoiAffiches(memo.affiches, memo.profil)],
    ];
    let rates = 0, faits = 0;
    for (const [id, nom, f] of parties) {
      if (!$(id).checked) continue;
      try { bilan(await f(), true); faits++; } catch (e) { bilan(nom + " : " + e.message, false); rates++; }
    }
    if (!faits && !rates) etat("Coche au moins une case.", true);
    else if (rates) etat(faits ? "Envoyé en partie : voir ci-dessous." : "Envoi impossible : voir ci-dessous.", true);
    else {
      // Tout est parti : le fil du haut se termine et la suite est dite clairement.
      $("p2").className = "fait"; $("p3").className = "fait";
      const e = $("etat"); e.textContent = ""; e.className = "etat reussi";
      const fin = document.createElement("small"); fin.textContent = "Ouvre Nuvio : il reprend tout seul (au pire, à sa prochaine ouverture).";
      e.append("C'est dans ton compte Nuvio", fin);
    }
    if (rates) $("p3").className = "";
    fini();
    voir($("etat").textContent ? $("etat") : $("bilan"), "start");
  });

  $("deconnecter").addEventListener("click", async () => {
    if (memo.acces) await appel("/auth/v1/logout", {}, memo.acces).catch(() => {});
    memo = { lien: memo.lien, affiches: memo.affiches }; garder(memo); $("bilan").textContent = ""; montrer("connexion", true); etat("Nuvio déconnecté de ce navigateur.");
  });

  if (memo.renouv) connecte().catch(() => { montrer("connexion"); });
})();
</script>
</body>
</html>`;
}
