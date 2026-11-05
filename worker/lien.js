/**
 * Page « Sur ton téléphone » (servie sur /lien) : ce qu'on ouvre en scannant un QR code du guide.
 * Le lien voyage dans l'ancre (#u=…&nom=…), qui n'est jamais envoyée au serveur : les liens qui
 * contiennent une clé (AllDebrid) restent sur le téléphone.
 * On choisit : copier le lien, ou copier le contenu du fichier (une configuration JSON, par exemple).
 * Un lien d'affiches (QR code de la régie) : seulement « Copier le lien », avec l'endroit où le coller dans Nuvio.
 */
import { AFFICHES_URL, LOGO_V } from "./reglages.js";
import { feuilles } from "./statique.js";

export function lienPage({ origin }) {
  const LOGO = `${origin}/logo.png?v=${LOGO_V}`;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Sur ton téléphone · Nuvio en français</title>
<meta name="robots" content="noindex">
<link rel="icon" href="${LOGO}">
${feuilles("polices.css")}
<style>
:root { --velvet: #170c12; --velvet-2: #22121b; --seat: #3d2230; --cream: #f5ead8; --dim: #b9a59c; --bulb: #ffcf6b; --ink: #2a1a14; color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; color: var(--cream); font: 16px/1.5 "Figtree", system-ui, sans-serif;
  background: radial-gradient(ellipse 90% 40% at 50% -5%, rgba(229,65,58,.25), transparent 70%), var(--velvet);
  padding: max(24px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); }
main { max-width: 560px; margin: 0 auto; display: grid; gap: 16px; }
.ticket { display: grid; gap: 4px; padding: 16px 18px; border-radius: 14px; background: var(--cream); color: var(--ink); }
.ticket small { font: 800 .72rem "Figtree"; letter-spacing: .16em; text-transform: uppercase; color: #7a5a4c; }
h1 { margin: 0; font: 400 2rem/1 "Bebas Neue", Impact, sans-serif; letter-spacing: .03em; }
.ticket #site { font: 600 .85rem/1.4 "Figtree"; letter-spacing: 0; text-transform: none; overflow-wrap: anywhere; }
.choix { display: grid; gap: 10px; }
.choix button, .choix a { display: grid; gap: 2px; width: 100%; padding: 16px; border-radius: 14px; border: 1px solid var(--seat); background: var(--velvet-2); color: var(--cream); text-align: left; text-decoration: none; font: inherit; cursor: pointer; }
.choix button.principal { background: var(--bulb); border-color: var(--bulb); color: var(--ink); }
.choix b { font: 800 1.05rem "Figtree"; }
.choix span { font-size: .85rem; opacity: .8; }
.choix button:disabled { opacity: .5; }
pre { margin: 0; max-height: 40vh; overflow: auto; padding: 12px 14px; border-radius: 12px; background: #0f080c; border: 1px solid var(--seat); font: .78rem/1.45 "Courier Prime", monospace; white-space: pre-wrap; word-break: break-all; color: #f0e2cf; }
.aide { margin: 0; font-size: .9rem; color: var(--dim); }
.etat { min-height: 1.4em; margin: 0; font-weight: 800; color: var(--bulb); text-align: center; }
/* Les erreurs : le même encadré rouge que sur le reste du site. */
.erreur { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 12px; border: 1.5px solid #e5413a; background: #3b1216; color: #ffe1d8; font-weight: 600; text-align: left; box-shadow: 0 0 0 3px rgba(229,65,58,.15); }
.erreur::before { content: "!"; flex: none; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: #e5413a; color: #fff; font: 800 .85rem/1 "Figtree", system-ui, sans-serif; }
a, button, summary { touch-action: manipulation; }
summary.aide { padding: 10px 0; cursor: pointer; }
</style>
</head>
<body>
<main>
  <div class="ticket"><small>Envoyé depuis ton ordinateur</small><h1 id="nom">Ton lien</h1><small id="site" hidden></small></div>
  <div class="choix" id="choix"></div>
  <p class="etat" id="etat" role="status"></p>
  <details id="apercu" hidden><summary class="aide">Voir ce qui sera copié</summary><pre id="texte"></pre></details>
  <p class="aide" id="aide">Puis colle-le là où le guide l'indique : dans Nuvio (« Gérer depuis le téléphone »), ou sur le site de l'addon. <a href="${origin}/guide" style="color: var(--bulb)">Retour au guide</a></p>
</main>
<script>
(() => {
  const p = new URLSearchParams(location.hash.slice(1)), valeur = p.get("u") || "", nom = p.get("nom") || "Ton lien";
  const $ = (id) => document.getElementById(id);
  $("nom").textContent = nom;
  const etat = (t, err) => { $("etat").textContent = t; $("etat").className = "etat" + (err ? " erreur" : ""); };
  const copier = (texte, ok) => {
    const repli = () => { $("apercu").hidden = false; $("apercu").open = true; const r = document.createRange(); r.selectNodeContents($("texte")); getSelection().removeAllRanges(); getSelection().addRange(r); etat("Texte sélectionné : appuie sur Copier.", true); };
    try { navigator.clipboard.writeText(texte).then(() => etat(ok), repli); } catch (e) { repli(); }
  };
  const bouton = (titre, sous, principal, action) => {
    const b = document.createElement("button"); b.type = "button"; if (principal) b.className = "principal";
    const t = document.createElement("b"); t.textContent = titre; const s = document.createElement("span"); s.textContent = sous;
    b.append(t, s); b.addEventListener("click", action); $("choix").append(b); return b;
  };
  if (!valeur) { etat("Rien n'a été reçu : rescanne le QR code depuis le guide.", true); return; }
  const estLien = /^https?:[/][/]/.test(valeur);
  if (!estLien) {
    $("texte").textContent = valeur; $("apercu").hidden = false;
    bouton("Copier le texte", "À coller tel quel", true, () => copier(valeur, "Texte copié ✓"));
    return;
  }
  $("texte").textContent = valeur; $("apercu").hidden = false;
  // Le site où mène le lien, toujours affiché : n'importe qui peut fabriquer une adresse /lien#u=….
  // Seuls les addons du guide (ce site, Torrentio, OpenSubtitles) ont le bouton d'installation directe.
  let site = "";
  try { site = new URL(valeur).hostname; } catch (e) {}
  const AFFICHES = ${JSON.stringify(new URL(AFFICHES_URL).hostname)};
  const connu = [location.hostname, AFFICHES, "torrentio.strem.fun", "opensubtitles-v3.strem.io"].includes(site);
  $("site").textContent = "Lien vers " + (site || "?") + (connu ? "" : " : un site qui n'est pas dans le guide, vérifie que tu l'attendais.");
  $("site").hidden = false;
  // Lien d'affiches : un modèle ({type}, {id}…) que Nuvio remplit, rien à ouvrir ni à télécharger.
  if (site === AFFICHES) {
    bouton("Copier le lien", "Pour Nuvio : Paramètres → Disposition → Custom Poster Source", true, () => copier(valeur, "Lien copié ✓"));
    $("aide").textContent = "Puis dans Nuvio : Paramètres → Disposition → Custom Poster Source, colle le lien.";
    return;
  }
  bouton("Copier le lien", "Le plus courant : à coller dans Nuvio ou sur le site d'un addon", true, () => { $("texte").textContent = valeur; copier(valeur, "Lien copié ✓"); });
  // Un lien d'addon s'installe aussi d'un geste dans l'appli Nuvio de ce téléphone (nuvio://…, que Stremio ne prend pas ; pas sous Windows, où Nuvio n'ouvre aucun lien).
  if (connu && /^https:[/][/][^/]+[/].*manifest[.]json$/.test(valeur) && !/Windows/.test(navigator.userAgent)) {
    const inst = document.createElement("a"); inst.href = valeur.replace(/^https:/, "nuvio:");
    inst.innerHTML = "<b>Installer dans Nuvio sur ce téléphone</b><span>Si Nuvio est installé ici. Pour la TV, copie plutôt le lien.</span>"; $("choix").append(inst);
  }
  // Si le lien mène à un fichier (configuration JSON…), on prépare aussi son contenu, prêt à copier.
  const fichier = bouton("Copier le contenu du fichier", "Chargement du fichier…", false, () => { if (contenu) { $("texte").textContent = contenu; copier(contenu, "Contenu copié ✓"); } });
  fichier.disabled = true;
  let contenu = "";
  fetch(valeur).then((r) => {
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !/json|text|javascript/.test(type)) throw new Error("pas un fichier texte");
    return r.text();
  }).then((t) => {
    try { t = JSON.stringify(JSON.parse(t), null, 2); } catch (e) {}
    contenu = t; fichier.disabled = false;
    fichier.querySelector("span").textContent = "Pour « Import Config » et autres imports (" + (t.length > 1024 ? Math.round(t.length / 1024) + " Ko" : t.length + " caractères") + ")";
  }).catch(() => { fichier.remove(); });
  const ouvrir = document.createElement("a"); ouvrir.href = valeur; ouvrir.target = "_blank"; ouvrir.rel = "noopener";
  ouvrir.innerHTML = "<b>Ouvrir le lien</b><span>Dans le navigateur du téléphone</span>"; $("choix").append(ouvrir);
})();
</script>
</body>
</html>`;
}
