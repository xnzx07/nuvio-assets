/**
 * Le hall (servi à la racine « / ») : l'entrée du cinéma. Deux portes :
 * salle 1, le guide (pour qui n'a pas encore Nuvio) ; salle 2, la programmation (pour qui l'a déjà).
 * Au mur, les films dont tout le monde parle aujourd'hui, tirés du Catalogue FR (Tendances du jour).
 */
import { STAGE_HEAD, stageTop, secretsHTML, BEAM_HTML, CREDITS_HTML } from "./stage.js";
import { ICONE_APERCU, ICONE_AVANT_APRES, apercuDonnees } from "./apercu.js";
import { feuilles, scripts, adresseStatique } from "./statique.js";
import { esc } from "./outils-serveur.js";
import { NOUVEAUTES, jourEnClair } from "./nouveautes.js";
import { LOGO_V } from "./reglages.js";


export function hallPage({ origin, season, copy = false, apercus = origin }) {
  const LOGO = `${origin}/logo.png?v=${LOGO_V}`;
  const porte = (n, href, titre, texte, extra) => `
    <a class="porte" href="${esc(href)}"${extra || ""}>
      <span class="plaque-porte">Salle ${n}</span>
      <span class="encadrement" aria-hidden="true"><span class="lumiere"></span><i class="battant g"><i class="hublot"></i></i><i class="battant d"><i class="hublot"></i></i></span>
      <span class="texte"><b>${titre}</b><small>${texte}</small><em>Entrer en salle ${n}</em></span>
    </a>`;
  return `<!doctype html>
<html lang="fr" data-saison="${esc(season || "")}">
<head>
<meta charset="utf-8">
${STAGE_HEAD}
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Nuvio en français · Ta salle de cinéma</title>
<meta name="description" content="Tous tes films et séries au même endroit, en français : installe Nuvio avec le guide, ou compose ton accueil.">
<meta property="og:title" content="Nuvio en français · Ta salle de cinéma">
<meta property="og:description" content="Tous tes films et séries au même endroit, en français.">
<meta property="og:image" content="${LOGO}">
<link rel="icon" href="${LOGO}">
${feuilles("polices.css")}
<style>
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
body { position: relative; color: var(--cream); font: 16px/1.6 var(--body);
  background: radial-gradient(ellipse 80% 40% at 50% -5%, rgba(229,65,58,.22), transparent 70%), repeating-linear-gradient(90deg, rgba(0,0,0,.18) 0 2px, transparent 2px 46px), var(--velvet);
  padding: max(104px, calc(env(safe-area-inset-top) + 92px)) max(16px, env(safe-area-inset-right)) calc(40px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); }
body::after { content: ""; position: fixed; inset: -50%; pointer-events: none; z-index: 50; opacity: .07; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  animation: grain 1.2s steps(6) infinite; }
@keyframes grain { 0%{transform:translate(0,0)} 25%{transform:translate(-3%,2%)} 50%{transform:translate(2%,-3%)} 75%{transform:translate(3%,3%)} 100%{transform:translate(0,0)} }
.valance { position: absolute; inset: 0 0 auto; height: 74px; pointer-events: none; z-index: 1;
  background: radial-gradient(ellipse 34px 30px at 34px 0, #6d1420 0 28px, transparent 29px) 0 46px / 68px 32px repeat-x, repeating-linear-gradient(90deg, rgba(0,0,0,.28) 0 3px, transparent 3px 22px, rgba(255,255,255,.04) 22px 24px, transparent 24px 34px), linear-gradient(#4a0c15, #7a1824 70%, #5a0f1a);
  -webkit-mask: linear-gradient(#000, #000) top / 100% 48px no-repeat, radial-gradient(ellipse 34px 30px at 34px 0, #000 28px, transparent 29px) 0 46px / 68px 32px repeat-x;
          mask: linear-gradient(#000, #000) top / 100% 48px no-repeat, radial-gradient(ellipse 34px 30px at 34px 0, #000 28px, transparent 29px) 0 46px / 68px 32px repeat-x;
  filter: drop-shadow(0 8px 10px rgba(0,0,0,.5)); }
.valance::after { content: ""; position: absolute; left: 0; right: 0; top: 40px; height: 6px; background: repeating-linear-gradient(90deg, #d9a441 0 6px, #8a5f1a 6px 9px); }
a { color: var(--bulb); }
:focus-visible { outline: 3px solid var(--bulb); outline-offset: 4px; border-radius: 8px; }

.hall { max-width: 1040px; margin: 0 auto; display: grid; gap: 40px; }
.hero { position: relative; display: grid; justify-items: center; gap: 14px; text-align: center; }
.hero .tagline { margin: 0; font: italic 400 1.6rem/1.25 var(--serif); color: var(--bulb); }
.hero p { margin: 0; max-width: 56ch; color: var(--dim); font-size: 1.05rem; }

/* Les deux portes de salle : elles s'entrouvrent au survol, la lumière de l'écran passe. */
.portes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px; }
.porte { display: grid; justify-items: center; align-content: start; gap: 14px; padding: 22px 20px 24px; border-radius: 20px; text-decoration: none; color: var(--cream);
  background: linear-gradient(180deg, rgba(255,255,255,.03), transparent 40%), var(--velvet-2); border: 1px solid var(--seat); transition: border-color .3s ease, transform .3s ease; }
.porte:hover, .porte:focus-visible { border-color: rgba(255,207,107,.55); transform: translateY(-3px); }
.plaque-porte { padding: 4px 18px 2px; border-radius: 6px; font: 400 1.5rem/1.1 var(--display); letter-spacing: .14em; color: #3a2410;
  background: linear-gradient(160deg, #f6dc98, #c9973f 42%, #f2d283 62%, #b4822f); box-shadow: 0 0 18px rgba(255,207,107,.35), inset 0 1px 0 rgba(255,255,255,.5); }
.encadrement { position: relative; display: grid; grid-template-columns: 1fr 1fr; width: 200px; height: 240px; padding: 10px 10px 0; border-radius: 10px 10px 0 0; perspective: 700px;
  background: linear-gradient(#3a1d14, #24120c); box-shadow: inset 0 0 0 3px #5a3a22, 0 20px 40px rgba(0,0,0,.45); }
.lumiere { position: absolute; inset: 10px 10px 0; background: radial-gradient(ellipse at 50% 30%, #fff3cf, #ffcf6b 35%, #c46a2a 70%, #3a1d14); opacity: .35; transition: opacity .5s ease; }
.battant { position: relative; z-index: 1; display: grid; place-items: start center; padding-top: 38px; transition: transform .7s cubic-bezier(.22,1,.36,1);
  background: radial-gradient(circle at 50% 50%, #c9a227 0 1.6px, transparent 2px) 0 0 / 18px 18px, linear-gradient(90deg, #7a1824, #a42637 50%, #6d1420);
  box-shadow: inset 0 0 0 2px #4a0c15, inset 0 0 18px rgba(0,0,0,.45); }
.battant.g { transform-origin: 0 50%; border-right: 1px solid #2a0810; }
.battant.d { transform-origin: 100% 50%; }
.hublot { width: 44px; height: 44px; border-radius: 50%; background: radial-gradient(circle, #fff3cf, #ffcf6b 45%, #8a4a1a); box-shadow: 0 0 0 4px #c9a227, 0 0 16px rgba(255,207,107,.6); opacity: .85; }
.porte:hover .battant.g, .porte:focus-visible .battant.g { transform: rotateY(-38deg); }
.porte:hover .battant.d, .porte:focus-visible .battant.d { transform: rotateY(38deg); }
.porte:hover .lumiere, .porte:focus-visible .lumiere { opacity: 1; }
.texte { display: grid; gap: 6px; text-align: center; }
.texte b { font: 400 2rem/1 var(--display); letter-spacing: .03em; }
.texte small { max-width: 34ch; justify-self: center; color: var(--dim); font-size: .98rem; line-height: 1.5; }
.texte em { justify-self: center; margin-top: 8px; font: normal 800 .95rem var(--body); padding: 10px 18px; border-radius: 99px; background: var(--bulb); color: var(--ink); }
.porte + .porte .texte em { background: transparent; color: var(--bulb); box-shadow: inset 0 0 0 1.5px var(--bulb); }
.apercu-boutons { justify-self: center; display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; max-width: 640px; text-align: center; }
.apercu-boutons p { flex-basis: 100%; margin: 0; color: var(--dim); font-size: .95rem; }
.apercu-lien { justify-self: center; display: inline-flex; align-items: center; gap: 10px; font: 800 1rem var(--body); text-decoration: none; color: var(--cream); padding: 12px 20px; border-radius: 99px; border: 1px solid var(--seat); background: rgba(0,0,0,.25); }
.apercu-lien:hover { border-color: var(--bulb); color: var(--bulb); }
.apercu-lien svg { width: 20px; height: 20px; }

/* Le film du jour : un billet avec une image en gros pixels, vers le jeu (/jeu). */
.film-du-jour { justify-self: center; width: min(100%, 720px); display: grid; grid-template-columns: 132px minmax(0, 1fr) auto; align-items: center; gap: 18px; padding: 14px 18px 14px 14px;
  border-radius: 16px; background: var(--cream); color: var(--ink); text-decoration: none; box-shadow: 0 14px 34px rgba(0,0,0,.4); transition: transform .25s ease, box-shadow .25s ease; }
.film-du-jour:hover, .film-du-jour:focus-visible { transform: translateY(-3px) rotate(-.4deg); box-shadow: 0 18px 40px rgba(0,0,0,.5), 0 0 0 2px var(--bulb); }
.fdj-image { aspect-ratio: 16 / 9; border-radius: 8px; image-rendering: pixelated; background: #2a1520 center / 100% 100% no-repeat;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 4.5' shape-rendering='crispEdges'%3E%3Cpath fill='%233a2230' d='M0 0h8v4.5H0z'/%3E%3Cpath fill='%23c9874a' d='M1 0h1v1H1zM5 1h1v1H5zM2 3h2v1H2z'/%3E%3Cpath fill='%23e7c08a' d='M2 1h1v1H2zM6 0h1v1H6zM4 2h1v1H4z'/%3E%3Cpath fill='%237a3a2c' d='M0 2h2v1H0zM5 3h2v1.5H5zM3 0h2v1H3z'/%3E%3Cpath fill='%23f6e2b8' d='M3 1h1v1H3zM6 2h1v1H6z'/%3E%3Cpath fill='%23a8563a' d='M2 2h2v1H2zM0 1h1v1H0zM7 1h1v2H7z'/%3E%3Cpath fill='%23542a2a' d='M0 3h2v1.5H0zM4 3h1v1.5H4zM5 2h1v1H5z'/%3E%3C/svg%3E"); }
.fdj-texte { display: grid; gap: 2px; }
.fdj-texte small { font: 800 .7rem var(--body); letter-spacing: .16em; text-transform: uppercase; color: #8a3a2a; }
.fdj-texte b { font: 400 1.9rem/1 var(--display); letter-spacing: .03em; }
.fdj-texte span { color: #5a4036; font-size: .95rem; line-height: 1.4; }
.film-du-jour em { font: normal 800 .95rem var(--body); padding: 10px 18px; border-radius: 99px; background: var(--ink); color: var(--bulb); }
@media (max-width: 560px) { .film-du-jour { grid-template-columns: 88px minmax(0, 1fr); } .film-du-jour em { grid-column: 1 / -1; justify-self: start; } }
/* Le mur des affiches : les Tendances du jour, sous des cadres lumineux. */
.mur { display: grid; gap: 16px; text-align: center; }
.mur h2 { margin: 0; font: 400 2.2rem/1 var(--display); letter-spacing: .04em; }
.mur p { margin: 0; color: var(--dim); }
.affiches { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 16px; }
.cadre { position: relative; aspect-ratio: 2 / 3; border-radius: 6px; background: #221a2b center / cover no-repeat;
  box-shadow: 0 0 0 4px #2a1520, 0 0 0 6px #c9a227, 0 14px 30px rgba(0,0,0,.5); }
.cadre::after { content: ""; position: absolute; inset: 0; border-radius: inherit; background: linear-gradient(115deg, rgba(255,255,255,.12), transparent 40%); }
.cadre.vide { animation: attente 1.4s ease-in-out infinite; }
@keyframes attente { 50% { opacity: .55; } }
footer { text-align: center; }
.machines-lien { margin: 18px 0 0; color: var(--dim); font-size: .95rem; }
.machines-lien a { font-weight: 800; text-underline-offset: 3px; }
.propre-salle { justify-self: center; margin-top: -8px; text-align: center; color: var(--dim); font-size: .95rem; }
.propre-salle a { color: inherit; font-weight: 800; text-underline-offset: 3px; }
.propre-salle a:hover { color: var(--cream, #f5ead8); }
/* La dernière nouveauté, pour qui ne suit pas le Discord (voir nouveautes.js). */
.nouveautes-lien { justify-self: center; margin-top: -8px; text-align: center; color: var(--dim); font-size: .95rem; }
.nouveautes-lien a { color: var(--bulb); font-weight: 800; text-underline-offset: 3px; }
@media (max-width: 760px) {
  .portes { grid-template-columns: 1fr; }
  .affiches { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .encadrement { width: 170px; height: 200px; }
}
@media (prefers-reduced-motion: reduce) { body::after, .cadre.vide { animation: none; } .battant, .porte, .film-du-jour { transition: none; } .film-du-jour:hover, .film-du-jour:focus-visible { transform: none; } }
</style>
${feuilles("scene.css", "apercu.css", "nuvio.css")}
</head>
<body>
<div class="valance" aria-hidden="true"></div>
${stageTop({ here: "hall", origin })}
${secretsHTML("hall")}
<main class="hall">
  <header class="hero">
    ${BEAM_HTML}
    <div class="marquee"><small>Nuvio en français</small><h1>Ta salle de cinéma</h1></div>
    <p class="tagline">Tous tes films et séries au même endroit, en français.</p>
    <p>Nuvio réunit films et séries dans un seul accueil, avec les affiches, les bandes-annonces et les sous-titres. Ici, on te l'installe et on te le règle en français. Choisis ta salle.</p>
  </header>

  <nav class="portes" aria-label="Choisir sa salle">
    ${porte(1, origin + "/guide", "Je n'ai pas encore Nuvio", "Le guide de A à Z : on installe tout, dans l'ordre, sur TV, téléphone ou ordinateur. Environ 25 minutes.")}
    ${porte(2, origin + "/configure", "J'ai déjà Nuvio", "Compose ton accueil : rangées, plateformes, filtres et collections, avec un aperçu en direct.", " data-programmation")}
  </nav>
${copy ? "" : `  <p class="propre-salle">Tu veux ta propre salle, avec tes clés et ton quota ? <a href="${origin}/copie">Monte-la</a></p>
`}
  <p class="nouveautes-lien">Nouveau le ${jourEnClair(NOUVEAUTES[0].date)} : ${NOUVEAUTES[0].titre}. <a href="${origin}/nouveautes">Toutes les nouveautés</a></p>
  <div class="apercu-boutons">
    <button type="button" class="apercu-lien" data-resultat>${ICONE_APERCU}Voir l'accueil que tu auras à la fin</button>
    <button type="button" class="apercu-lien" data-resultat data-avant-apres>${ICONE_AVANT_APRES}Avant / après le guide</button>
    <p>Nuvio tout juste installé est en anglais, avec un seul catalogue. Fais glisser le trait pour voir ce que le guide en fait.</p>
  </div>

  <a class="film-du-jour" href="${origin}/jeu">
    <span class="fdj-image" aria-hidden="true"></span>
    <span class="fdj-texte"><small>Un nouveau chaque jour</small><b>Le film du jour</b><span>Une image pixelisée, cinq essais : devine le film. Le même pour tout le monde.</span></span>
    <em>Jouer</em>
  </a>

  <section class="mur" aria-labelledby="a-laffiche">
    <h2 id="a-laffiche">Actuellement à l'affiche</h2>
    <p>Les films dont tout le monde parle aujourd'hui, avec les affiches qu'ils auront sur ton accueil.</p>
    <div class="affiches" id="affiches">${'<div class="cadre vide"></div>'.repeat(6)}</div>
  </section>
  <footer>${CREDITS_HTML}
    <p class="machines-lien"><a href="${origin}/etat">Salle des machines</a> : est-ce que tout tourne en ce moment ?</p>
  </footer>
</main>
${scripts("scene.js")}
<script>${apercuDonnees(origin, apercus)}</script>
${scripts("affiches.js")}
<script>
// « Voir l'accueil que tu auras à la fin » : l'écran Nuvio (nuvio.js, le plus gros script du site) et l'aperçu
// (apercu.js) ne se chargent qu'au premier clic, qui est ensuite rejoué ; arrivée avec « #apercu » : tout de suite.
// Chaque script une seule fois (nuvio.js rechargé redéclarerait ses constantes) ; en échec, le clic suivant réessaie.
(() => {
  const boutons = [...document.querySelectorAll("[data-resultat]")];
  const charges = {};
  const script = (src) => charges[src] || (charges[src] = new Promise((ok, ko) => {
    const sc = document.createElement("script"); sc.src = src;
    sc.onload = ok; sc.onerror = () => { delete charges[src]; sc.remove(); ko(); };
    document.body.append(sc);
  }));
  const charger = () => script(${JSON.stringify(adresseStatique("nuvio.js"))}).then(() => script(${JSON.stringify(adresseStatique("apercu.js"))}));
  const premier = (e) => {
    const b = e.currentTarget;
    boutons.forEach((x) => x.removeEventListener("click", premier));
    b.setAttribute("aria-busy", "true");
    charger().then(() => { b.removeAttribute("aria-busy"); b.click(); }, () => {
      b.removeAttribute("aria-busy");
      boutons.forEach((x) => x.addEventListener("click", premier));
      if (window.toast) toast("Aperçu indisponible : vérifie ta connexion et réessaie.", true);
    });
  };
  boutons.forEach((b) => b.addEventListener("click", premier));
  // La TV des boutons ne vacille que lorsqu'ils sont à l'écran (comme apercu.js le fera, une fois chargé).
  if ("IntersectionObserver" in window) {
    const vu = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("ap-vu", e.isIntersecting)));
    boutons.forEach((b) => vu.observe(b));
  }
  if (location.hash === "#apercu" || location.hash === "#avant-apres") charger().catch(() => {});
})();
</script>
<script>
// Le mur : les 6 premiers films de « Tendances du jour · Films ». Rien à montrer (liste vide, erreur) :
// le mur disparaît, plutôt que de rester en attente.
const sansMur = () => { document.querySelector(".mur").hidden = true; };
fetch(${JSON.stringify(origin)} + "/catalog/movie/accueil-top10.json").then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then((d) => {
  const box = document.getElementById("affiches");
  const metas = ((d && d.metas) || []).filter((m) => m.poster).slice(0, 6);
  if (!metas.length) { sansMur(); return; }
  box.textContent = "";
  metas.forEach((m) => {
    const c = document.createElement("div"); c.className = "cadre"; c.title = m.name; c.setAttribute("role", "img"); c.setAttribute("aria-label", m.name);
    // Les affiches maison du réglage conseillé (étape 8), celles qu'on aura sur l'accueil
    const pp = NV_AFFICHES.ppSrc(m, "poster"), pose = (u) => { c.style.backgroundImage = NV_AFFICHES.cssUrl(u); };
    if (pp) { const im = new Image(); im.onload = () => pose(pp); im.onerror = () => pose(m.poster); im.src = pp; } else pose(m.poster);
    box.append(c);
  });
}).catch(sansMur);
</script>
${copy ? `<script>
// Copie auto-hébergée : bandeau pour l'hébergeur connecté quand une nouvelle version est sortie.
fetch(${JSON.stringify(origin)} + "/hote/etat", { credentials: "same-origin" }).then((r) => r.json()).then((e) => {
  if (!e.hote || !e.maj) return;
  const a = document.createElement("a");
  a.href = ${JSON.stringify(origin)} + "/configure#s-hote";
  a.textContent = "🔔 Version " + e.maj.version + " disponible : voir dans la salle 2";
  a.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99;padding:10px 16px;border-radius:999px;background:#f3e6cf;color:#2a1a14;font:700 .9rem system-ui,sans-serif;text-decoration:none;box-shadow:0 6px 20px rgba(0,0,0,.4);max-width:calc(100vw - 32px)";
  document.body.append(a);
}).catch(() => {});
</script>` : ""}
</body>
</html>`;
}
