/**
 * La mise en scène commune aux deux pages (personnalisation et guide).
 *
 * À l'arrivée : lever de rideau (une fois par visite), enseigne qui s'allume.
 * Dans la salle : faisceau du projecteur et sa poussière, lampe de l'ouvreuse,
 * draperies sur les côtés, fauteuils et spectateurs, générique de fin, décor de saison.
 * Le foyer : plan des salles (navigation), interrupteur et son de la salle.
 * Entre les pages : fermeture à l'iris.
 * Petits plaisirs : pop-corn quand on copie, lettres de l'enseigne qu'on décroche,
 * ampoule fatiguée, pluie de pop-corn secrète.
 *
 * Rien ne bouge si l'appareil demande moins d'animations. Par défaut, la salle est éteinte et le son coupé.
 */

import { sansCle } from "./liens.js";

// À mettre dans <head> : rideau une fois par visite, iris d'arrivée, salle éteinte.
export const STAGE_HEAD = `<script>try{var d=document.documentElement,s=sessionStorage;if(s.getItem("rideau"))d.classList.add("vu");s.setItem("rideau","1");if(s.getItem("iris")){d.classList.add("iris-in");s.removeItem("iris")}var n=localStorage.getItem("noir");if(n==="1"||(n===null&&location.pathname==="/"))d.classList.add("noir");var t=localStorage.getItem("theme");if(t&&t!=="classique")d.dataset.theme=t}catch(e){}var h=new Date().getHours();document.documentElement.dataset.heure=h>=23||h<6?"minuit":h<11?"matin":h<18?"jour":"soir"</script>`;

const FOLDS = "linear-gradient(90deg, rgba(0,0,0,.5), rgba(0,0,0,.04) 20%, rgba(255,160,160,.13) 38%, rgba(0,0,0,.06) 62%, rgba(0,0,0,.42))";
const bulbs = (c) => `
    radial-gradient(circle, ${c} 2.6px, transparent 3.4px) 7px 0 / var(--b) var(--b) repeat-x,
    radial-gradient(circle, ${c} 2.6px, transparent 3.4px) 7px 100% / var(--b) var(--b) repeat-x,
    radial-gradient(circle, ${c} 2.6px, transparent 3.4px) 0 7px / var(--b) var(--b) repeat-y,
    radial-gradient(circle, ${c} 2.6px, transparent 3.4px) 100% 7px / var(--b) var(--b) repeat-y`;
const COBWEB = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240' viewBox='0 0 240 240'%3E%3Cg fill='none' stroke='rgba(240,232,220,.42)' stroke-linecap='round'%3E%3Cpath d='M0 0L227.9 8.0' stroke-width='1.05'/%3E%3Cpath d='M0 0L222.2 51.3' stroke-width='1.05'/%3E%3Cpath d='M0 0L206.6 96.4' stroke-width='1.05'/%3E%3Cpath d='M0 0L151.7 114.3' stroke-width='1.05'/%3E%3Cpath d='M0 0L149.6 172.1' stroke-width='1.05'/%3E%3Cpath d='M0 0L110.5 199.4' stroke-width='1.05'/%3E%3Cpath d='M0 0L66.7 218.0' stroke-width='1.05'/%3E%3Cpath d='M0 0L19.9 227.1' stroke-width='1.05'/%3E%3Cpath d='M150 0Q178 30 214 80M0 150Q30 176 78 214' stroke-width='.8'/%3E%3Cpath d='M16.0 0.6Q13.8 1.8 16.1 3.7M16.1 3.7Q13.6 4.7 15.4 7.2M15.4 7.2Q12.1 7.3 12.8 9.6M12.8 9.6Q10.2 9.5 10.8 12.4M10.8 12.4Q8.2 11.8 8.2 14.8M8.2 14.8Q5.5 13.0 4.7 15.3M4.7 15.3Q2.7 13.7 1.4 16.4' stroke-width='0.90'/%3E%3Cpath d='M30.9 1.1Q26.7 3.5 31.0 7.2M31.0 7.2Q25.1 8.7 27.2 12.7M27.2 12.7Q22.4 13.5 24.7 18.6M24.7 18.6Q19.7 18.4 20.9 24.0M20.9 24.0Q15.2 21.8 14.5 26.2M14.5 26.2Q10.2 24.1 9.0 29.5M9.0 29.5Q5.1 26.5 2.8 31.7' stroke-width='0.85'/%3E%3Cpath d='M48.7 1.7Q40.4 5.3 44.8 10.3M44.8 10.3Q38.0 13.1 42.9 20.0M42.9 20.0Q35.4 21.3 38.9 29.3M38.9 29.3Q29.8 27.8 30.2 34.7M30.2 34.7Q23.0 32.9 23.0 41.4M23.0 41.4Q16.2 38.1 14.3 46.6M14.3 46.6Q7.8 40.0 4.0 45.8' stroke-width='0.81'/%3E%3Cpath d='M63.0 2.2Q54.5 7.2 63.2 14.6M63.2 14.6Q53.5 18.4 60.5 28.2M60.5 28.2Q47.8 28.7 50.3 37.9M50.3 37.9Q40.2 37.5 42.6 49.0M42.6 49.0Q32.5 46.4 32.4 58.4M32.4 58.4Q21.8 51.4 18.4 60.2M18.4 60.2Q10.5 54.0 5.7 64.6' stroke-width='0.77'/%3E%3Cpath d='M84.4 2.9Q73.1 9.6 84.7 19.6M84.7 19.6Q68.7 23.6 74.3 34.7M74.3 34.7Q61.4 36.9 67.5 50.8M67.5 50.8Q53.9 50.3 57.0 65.6M57.0 65.6Q41.7 59.5 39.8 71.7M39.8 71.7Q28.0 65.9 24.7 80.8M24.7 80.8Q14.1 72.3 7.6 86.6' stroke-width='0.72'/%3E%3Cpath d='M109.1 3.8Q90.5 11.9 100.4 23.2M100.4 23.2Q85.0 29.3 96.2 44.8M96.2 44.8Q79.3 47.7 87.2 65.7M87.2 65.7Q66.7 62.2 67.6 77.7M67.6 77.7Q51.6 73.6 51.4 92.8M51.4 92.8Q36.2 85.2 31.9 104.4M31.9 104.4Q17.4 89.6 9.0 102.6' stroke-width='0.68'/%3E%3Cpath d='M125.9 4.4Q109.0 14.4 126.5 29.2M126.5 29.2Q107.1 36.9 121.0 56.4M121.0 56.4Q95.7 57.5 100.6 75.8M100.6 75.8Q80.4 75.0 85.1 97.9M85.1 97.9Q64.9 92.8 64.8 116.8M64.8 116.8Q43.6 102.7 36.8 120.5M36.8 120.5Q21.0 108.0 11.3 129.3' stroke-width='0.63'/%3E%3Cpath d='M155.4 5.4Q134.5 17.7 156.0 36.0M156.0 36.0Q126.5 43.5 136.9 63.8M136.9 63.8Q113.0 67.9 124.2 93.6M124.2 93.6Q99.2 92.5 105.0 120.8M105.0 120.8Q76.7 109.6 73.2 132.1M73.2 132.1Q51.5 121.3 45.5 148.7M45.5 148.7Q25.9 133.2 14.0 159.5' stroke-width='0.58'/%3E%3Cpath d='M188.6 6.6Q156.3 20.6 173.4 40.0M173.4 40.0Q146.9 50.6 166.2 77.5M166.2 77.5Q137.1 82.4 150.7 113.6M150.7 113.6Q115.3 107.5 116.8 134.3M88.9 160.4Q62.5 147.3 55.2 180.4M55.2 180.4Q30.1 154.8 15.5 177.3' stroke-width='0.54'/%3E%3Cpath d='M205.9 7.2Q178.3 23.5 206.7 47.7M206.7 47.7Q175.0 60.3 197.9 92.3M197.9 92.3Q156.4 94.0 164.5 124.0M164.5 124.0Q131.5 122.6 139.2 160.1M105.9 191.0Q71.3 168.0 60.2 197.0M60.2 197.0Q34.3 176.5 18.5 211.4' stroke-width='0.50'/%3E%3Cpath d='M150 112q6 22 -2 40' stroke-width='.6'/%3E%3C/g%3E%3Cg fill='rgba(255,250,240,.75)'%3E%3Ccircle cx='16.0' cy='0.6' r='1.6'/%3E%3Ccircle cx='14.5' cy='26.2' r='1.6'/%3E%3Ccircle cx='42.6' cy='49.0' r='1.6'/%3E%3Ccircle cx='87.2' cy='65.7' r='1.6'/%3E%3Ccircle cx='136.9' cy='63.8' r='1.6'/%3E%3Ccircle cx='206.7' cy='47.7' r='1.6'/%3E%3C/g%3E%3C/svg%3E\")";

export const STAGE_CSS = `
@property --lit { syntax: "<percentage>"; inherits: true; initial-value: 100%; }
@property --sweep { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
@property --iris { syntax: "<length>"; inherits: false; initial-value: 0px; }

/* ---------- Salle éteinte ---------- */
:root.noir { --velvet: #0a0407; --velvet-2: #140a0f; --seat: #2b1620; --dim: #a8958d; }
.noir .valance { filter: brightness(.55) drop-shadow(0 8px 10px rgba(0,0,0,.5)); }
.noir .beam { opacity: 1; filter: brightness(1.7); animation: none; }

/* ---------- Le rideau, relevé « à l'italienne » ---------- */
.curtain { position: fixed; inset: 0; z-index: 70; pointer-events: none; display: grid; grid-template-columns: 1fr 1fr; }
.curtain i {
  position: relative;
  background: ${FOLDS} 0 0 / clamp(44px, 7vw, 92px) 100%, linear-gradient(transparent 70%, rgba(0,0,0,.45)), radial-gradient(ellipse 140% 70% at 50% 0, #a42637, #640f1d 65%, #3d0812);
  transform-origin: 0 0; animation: coups .95s ease-out .2s, gather-l 1.75s cubic-bezier(.62,0,.18,1) 1.25s forwards;
}
.curtain i + i { transform-origin: 100% 0; animation-name: coups, gather-r; }
/* Les trois coups : le rideau tressaute à chaque coup frappé derrière lui. */
@keyframes coups { 0%, 22%, 52%, 82%, 100% { transform: none; } 6%, 36%, 66% { transform: translateY(3px) scaleY(.994); } 12%, 42%, 72% { transform: translateY(-1px); } }
/* La poursuite éclaire le rideau fermé, puis s'éteint quand il s'ouvre. */
.curtain::after { content: ""; position: absolute; left: 50%; top: -15%; width: min(90vmin, 900px); height: 130%; transform: translateX(-50%); pointer-events: none; opacity: 0;
  background: radial-gradient(ellipse 50% 45% at 50% 42%, rgba(255,232,190,.32), rgba(255,220,160,.1) 55%, transparent 72%); mix-blend-mode: screen; animation: poursuite 2.9s ease forwards; }
@keyframes poursuite { 8% { opacity: 1; } 45% { opacity: 1; } 75%, 100% { opacity: 0; } }
.trois-coups { position: absolute; left: 0; right: 0; top: 58%; z-index: 1; display: flex; justify-content: center; gap: .6em; pointer-events: none;
  font: italic 400 clamp(1.4rem, 4vw, 2.2rem)/1 var(--serif); color: #ffd98a; text-shadow: 0 0 18px rgba(255,200,110,.7), 0 2px 4px rgba(0,0,0,.6); }
.trois-coups b { font-weight: 400; opacity: 0; animation: toc 1.4s ease forwards; }
.trois-coups b:nth-child(1) { animation-delay: .2s; } .trois-coups b:nth-child(2) { animation-delay: .5s; } .trois-coups b:nth-child(3) { animation-delay: .8s; }
@keyframes toc { 0% { opacity: 0; transform: translateY(6px) scale(.8); } 12% { opacity: 1; transform: none; } 60% { opacity: 1; } 100% { opacity: 0; transform: translateY(-4px); } }
.curtain i::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 14px;
  background: repeating-linear-gradient(90deg, #e2b04e 0 3px, #8a5f1a 3px 5px); -webkit-mask: linear-gradient(#000 40%, transparent); mask: linear-gradient(#000 40%, transparent); }
.curtain i:first-child { box-shadow: inset -18px 0 30px rgba(0,0,0,.5); }
.curtain i + i { box-shadow: inset 18px 0 30px rgba(0,0,0,.5); }
@keyframes gather-l { 0% { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); transform: none; } 12% { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); transform: translateX(1.2%) scaleX(1.01); } 70% { opacity: 1; } 100% { clip-path: polygon(0 0, 100% 0, 100% 0, 0 100%); transform: scaleX(.18); opacity: 0; } }
@keyframes gather-r { 0% { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); transform: none; } 12% { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); transform: translateX(-1.2%) scaleX(1.01); } 70% { opacity: 1; } 100% { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 0); transform: scaleX(.18); opacity: 0; } }

/* ---------- L'iris, entre deux pages ---------- */
.iris { position: fixed; inset: 0; z-index: 90; pointer-events: none; visibility: hidden; background: #050304;
  -webkit-mask: radial-gradient(circle at var(--ix, 50%) var(--iy, 50%), transparent var(--iris), #000 calc(var(--iris) + 8px));
          mask: radial-gradient(circle at var(--ix, 50%) var(--iy, 50%), transparent var(--iris), #000 calc(var(--iris) + 8px)); }
.iris.closing { visibility: visible; pointer-events: auto; animation: iris-close .55s cubic-bezier(.6,0,.4,1) forwards; }
@keyframes iris-close { from { --iris: 150vmax; } to { --iris: 0px; } }
.iris-in .iris { visibility: visible; animation: iris-open .75s cubic-bezier(.3,0,.2,1) .05s forwards; }
@keyframes iris-open { from { --iris: 0px; } 99% { visibility: visible; } to { --iris: 150vmax; visibility: hidden; } }

/* ---------- Le foyer : plan des salles, interrupteur, son ---------- */
.foyer { position: relative; z-index: 5; max-width: var(--foyer-w, 1180px); margin: 0 auto 22px; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
/* La bande du foyer laisse passer les clics (la cabine du projectionniste est dessous) ; seuls ses boutons les prennent. */
.foyer { pointer-events: none; }
.foyer > * { pointer-events: auto; }
.salles { display: flex; gap: 10px; flex-wrap: wrap; }
.salle { position: relative; display: grid; padding: 6px 22px 7px; border-radius: 7px; text-decoration: none; line-height: 1.1; color: #3a2410;
  background: linear-gradient(160deg, #f6dc98, #c9973f 42%, #f2d283 62%, #b4822f);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.55), inset 0 -2px 0 rgba(0,0,0,.22), 0 6px 14px rgba(0,0,0,.45);
  opacity: .6; transition: opacity .2s ease, transform .2s ease, box-shadow .2s ease; }
.salle::before, .salle::after { content: ""; position: absolute; top: 50%; width: 5px; height: 5px; margin-top: -2.5px; border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #fff2c4, #7a5418); box-shadow: 0 1px 1px rgba(0,0,0,.4); }
.salle::before { left: 8px; } .salle::after { right: 8px; }
.salle b { font: 400 1.1rem/1 var(--display); letter-spacing: .1em; }
.salle span { font: 700 .74rem var(--body); }
.salle:hover { opacity: .95; transform: translateY(-2px); }
.salle[aria-current] { opacity: 1; box-shadow: inset 0 1px 0 rgba(255,255,255,.55), inset 0 -2px 0 rgba(0,0,0,.22), 0 6px 14px rgba(0,0,0,.45), 0 0 22px rgba(255,207,107,.4); }
.regie { display: flex; gap: 8px; }
.regie button { display: inline-flex; align-items: center; gap: 8px; padding: 7px 13px 7px 9px; border-radius: 99px; cursor: pointer;
  border: 1px solid rgba(255,207,107,.22); background: rgba(28,14,21,.72); color: var(--dim); font: 700 .8rem var(--body); transition: color .2s ease, border-color .2s ease; }
.regie button:hover, .regie button[aria-pressed="true"] { color: var(--cream); border-color: rgba(255,207,107,.6); }
.levier { position: relative; width: 16px; height: 24px; border-radius: 3px; background: linear-gradient(#f5ead8, #cdbca5); box-shadow: inset 0 0 0 1px rgba(0,0,0,.25); }
.levier::after { content: ""; position: absolute; left: 5px; top: 3px; width: 6px; height: 9px; border-radius: 2px; background: #3a2410; transition: transform .15s cubic-bezier(.22,1,.36,1); }
[aria-pressed="true"] .levier::after { transform: translateY(9px); }
.regie svg { width: 18px; height: 18px; }
.regie .ondes { transition: opacity .2s ease; }
.regie [aria-pressed="false"] .ondes { opacity: .2; }
/* Écran moyen : plaques compactes (sans sous-titre) pour laisser la cabine du projectionniste au centre. */
@media (max-width: 1240px) { .salle { padding: 5px 16px 6px; } .salle span { display: none; } .salle.hall-lien { padding-inline: 14px; } }
@media (max-width: 520px) { .salle { padding: 5px 18px 6px; } .salle span { font-size: .68rem; } .regie .txt { display: none; } .regie button { padding: 7px 10px; } }

/* ---------- Draperies sur les côtés (grands écrans) ----------
   Comme un vrai tissu : le haut, tenu par la tringle, gonfle à peine ; le bas, libre sous
   l'embrasse, se balance et revient comme un pendule. Le bas déborde hors de l'écran (76 px,
   deux plis) pour qu'aucun vide n'apparaisse au bord quand il se balance. */
.draperie { position: fixed; top: 0; bottom: 0; z-index: 0; pointer-events: none; width: clamp(0px, calc((100vw - 1260px) / 2), 150px);
  --sens: 1; transform-origin: 50% 0; animation: souffle-g 9s ease-in-out infinite; }
.draperie.g { left: 0; }
.draperie.d { right: 0; --sens: -1; animation-name: souffle-d; animation-delay: -4.5s; }
@keyframes souffle-g { 50% { transform: skewX(.6deg); } }
@keyframes souffle-d { 50% { transform: skewX(-.6deg); } }
.draperie i { position: absolute; top: 0; bottom: 0; left: 0; right: 0; will-change: transform;
  background: ${FOLDS} 0 0 / 38px 100%, linear-gradient(transparent 72%, rgba(0,0,0,.5)), linear-gradient(#8e1f2f, #5a0e1a 65%, #34070f); }
.draperie .haut { transform: scaleX(var(--gonfle, 1)); }
.draperie .bas { transform: skewX(var(--balance, 0deg)); }
.draperie.g .haut { transform-origin: 0 0; clip-path: polygon(0 0, 100% 0, 96% 28%, 40% 60.6%, 0 60.6%); }
.draperie.g .bas { left: -76px; transform-origin: calc(76px + (100% - 76px) * .2) 60%;
  clip-path: polygon(0 60%, calc(76px + (100% - 76px) * .4) 60%, calc(76px + (100% - 76px) * .8) 100%, 0 100%); }
.draperie.d .haut { transform-origin: 100% 0; clip-path: polygon(0 0, 100% 0, 100% 60.6%, 60% 60.6%, 4% 28%); }
.draperie.d .bas { right: -76px; transform-origin: calc((100% - 76px) * .8) 60%;
  clip-path: polygon(calc((100% - 76px) * .6) 60%, 100% 60%, 100% 100%, calc((100% - 76px) * .2) 100%); }
.draperie::after { content: ""; position: absolute; z-index: 1; top: calc(60% - 6px); width: 42%; height: 12px; border-radius: 6px;
  background: repeating-linear-gradient(60deg, #e2b04e 0 4px, #8a5f1a 4px 7px); box-shadow: 0 3px 6px rgba(0,0,0,.45); }
.draperie.g::after { left: 0; } .draperie.d::after { right: 0; }
.noir .draperie { filter: brightness(.6); }
/* Le bas en bandes : chaque bande suit celle du dessus avec un temps de retard, comme une vague
   qui descend dans le tissu. Le dégradé est calé sur toute la hauteur pour rester continu. */
.draperie.tranches .bas { display: none; }
.draperie .tranche { top: auto; bottom: auto; transform-origin: 0 0; will-change: transform;
  background: ${FOLDS} 0 0 / 38px 100%, linear-gradient(transparent 72%, rgba(0,0,0,.5)) 0 var(--py, 0) / 100% var(--ph, 100%) no-repeat,
    linear-gradient(#8e1f2f, #5a0e1a 65%, #34070f) 0 var(--py, 0) / 100% var(--ph, 100%) no-repeat; }
.draperie.g .tranche { left: -76px; right: 0; }
.draperie.d .tranche { right: -76px; left: 0; }
/* Le gland doré pendu à l'embrasse se balance avec un temps de retard. */
.draperie .gland { position: absolute; z-index: 2; top: calc(60% + 4px); bottom: auto; right: auto; clip-path: none; width: 14px; height: 52px; margin-left: -7px; transform-origin: 50% 0; will-change: transform;
  background: linear-gradient(#e2b04e, #e2b04e) 50% 0 / 2px 16px no-repeat, radial-gradient(circle at 50% 30%, #f6dc98 0 4px, #c9973f 5px 6px, transparent 6.5px) 50% 12px / 14px 14px no-repeat,
    repeating-linear-gradient(90deg, #e2b04e 0 2px, #8a5f1a 2px 3px) 50% 100% / 12px 31px no-repeat; filter: drop-shadow(0 3px 3px rgba(0,0,0,.5)); }
.draperie.g .gland { left: 36%; } .draperie.d .gland { left: 64%; }

/* ---------- L'enseigne : ampoules qui s'allument une à une, néon qui chauffe ---------- */
.marquee {
  --b: 14px;
  position: relative; padding: 22px clamp(20px, 5vw, 56px) 18px; border-radius: 14px;
  background: linear-gradient(#2a1520, #1b0d14);
  box-shadow: 0 0 0 3px #4a2a36, 0 18px 60px rgba(0,0,0,.55);
  animation: lit .7s steps(16) 1.9s backwards;
}
@keyframes lit { from { --lit: 0%; } to { --lit: 100%; } }
.marquee::before, .marquee::after { content: ""; position: absolute; inset: 7px; border-radius: 9px; pointer-events: none;
  -webkit-mask: linear-gradient(90deg, #000 var(--lit), transparent var(--lit)); mask: linear-gradient(90deg, #000 var(--lit), transparent var(--lit)); }
.marquee::before {
  background:
    radial-gradient(circle, var(--bulb) 2.6px, transparent 3.4px) 0 0 / var(--b) var(--b) repeat-x,
    radial-gradient(circle, var(--bulb) 2.6px, transparent 3.4px) 0 100% / var(--b) var(--b) repeat-x,
    radial-gradient(circle, var(--bulb) 2.6px, transparent 3.4px) 0 0 / var(--b) var(--b) repeat-y,
    radial-gradient(circle, var(--bulb) 2.6px, transparent 3.4px) 100% 0 / var(--b) var(--b) repeat-y;
  filter: drop-shadow(0 0 4px var(--bulb));
}
.marquee::after { background: ${bulbs("#fff3cf")}; filter: drop-shadow(0 0 6px rgba(255,220,140,1)); animation: chase .9s steps(1) infinite; }
@keyframes chase { 0% { opacity: 1; } 50% { opacity: .15; } }
.marquee small { display: block; font: 700 .78rem var(--body); letter-spacing: .35em; text-transform: uppercase; color: var(--bulb); }
.marquee h1 {
  margin: 4px 0 0; font: 400 clamp(2.8rem, 9vw, 5.6rem)/.9 var(--display); letter-spacing: .03em;
  color: #fff6e6; text-shadow: 0 0 18px rgba(255,207,107,.45), 0 0 2px #fff;
  animation: warm 1s 2.15s backwards, flicker 7s 3.4s infinite;
}
@keyframes warm {
  0% { opacity: .12; text-shadow: none; } 18% { opacity: .9; } 24% { opacity: .2; }
  40% { opacity: 1; text-shadow: 0 0 30px rgba(255,207,107,.9), 0 0 2px #fff; } 46% { opacity: .45; } 100% { opacity: 1; }
}
@keyframes flicker { 0%, 92%, 100% { opacity: 1; } 93% { opacity: .55; } 94% { opacity: 1; } 96% { opacity: .7; } }
/* Lettres qu'on décroche d'un clic : elles pendent à leur clou, puis se raccrochent. */
.marquee .mot { white-space: nowrap; }
.marquee .lettre { display: inline-block; transform-origin: 14% 8%; cursor: pointer; }
.marquee .lettre.decroche { animation: swing 2.8s cubic-bezier(.3,0,.3,1) forwards; }
.marquee .lettre.raccroche { animation: rehang .5s cubic-bezier(.3,1.6,.5,1); }
@keyframes swing { 0% { transform: none; } 12% { transform: rotate(80deg); } 26% { transform: rotate(46deg); } 40% { transform: rotate(68deg); } 54% { transform: rotate(53deg); } 68% { transform: rotate(62deg); } 100% { transform: rotate(58deg); } }
@keyframes rehang { from { transform: rotate(58deg); } }
/* Les ampoules, posées une à une (script) : espacement régulier, une ampoule pile dans chaque coin.
   Elles s'allument dans l'ordre du tour de l'enseigne, puis clignotent une sur deux.
   Sans script, les ampoules dessinées en fond (::before / ::after) restent en place. */
.marquee.ampoules-js::before, .marquee.ampoules-js::after { display: none; }
.ampoules { position: absolute; inset: 0; pointer-events: none; }
/* Les ampoules ne s'animent pas une par une (trop coûteux) : une couche d'ampoules allumées en couleur,
   et deux couches d'ampoules vives (une sur deux) qui clignotent en alternance par leur opacité. */
.ampoules i { position: absolute; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; background: var(--bulb); box-shadow: 0 0 4px var(--bulb); }
.ampoules .base i { animation: allume .01s linear calc(1.9s + var(--k) * .7s / var(--n)) backwards; }
@keyframes allume { from { opacity: 0; } }
.ampoules .vives { position: absolute; inset: 0; opacity: 0; will-change: opacity; animation: clignote .9s steps(1) 2.65s infinite; }
.ampoules .vives.b { animation-delay: 3.1s; }
.ampoules .vives i { background: #fff3cf; box-shadow: 0 0 7px 1px rgba(255,220,140,.95); }
@keyframes clignote { 0% { opacity: 1; } 50% { opacity: 0; } }
[data-saison="noel"] .ampoules .base i.pair { --bulb: #ff6b6b; }
.vu .ampoules .base i { animation: none; }
.vu .ampoules .vives { animation-delay: 0s; }
.vu .ampoules .vives.b { animation-delay: -.45s; }
/* L'ampoule fatiguée (et réparable). */
.ampoules .base i.grillee { pointer-events: auto; cursor: pointer; background: #4e3420; box-shadow: inset 0 0 2px #000; animation: grille 9s steps(1) 3s infinite; }
.ampoules .base i.grillee::after { content: ""; position: absolute; inset: -9px; }
@keyframes grille { 0%, 70% { background: #4e3420; box-shadow: inset 0 0 2px #000; } 71%, 73.5% { background: var(--bulb); box-shadow: 0 0 6px var(--bulb); } 72%, 75% { background: #4e3420; box-shadow: inset 0 0 2px #000; } }
.ampoules i.reparee { cursor: default; }

/* ---------- Le faisceau du projecteur et sa poussière ---------- */
.beam { position: absolute; left: 50%; top: -110px; width: min(1100px, 100vw); height: 560px; transform: translateX(-50%); pointer-events: none; z-index: -1;
  background: conic-gradient(from 0deg at 50% 0, transparent 158deg, rgba(255,230,180,.09) 170deg, rgba(255,232,190,.17) 180deg, rgba(255,230,180,.09) 190deg, transparent 202deg);
  -webkit-mask: linear-gradient(#000 55%, transparent); mask: linear-gradient(#000 55%, transparent);
  animation: hum 5s ease-in-out infinite; }
.beam canvas { width: 100%; height: 100%; display: block;
  -webkit-mask: conic-gradient(from 0deg at 50% 0, transparent 160deg, #000 172deg 188deg, transparent 200deg); mask: conic-gradient(from 0deg at 50% 0, transparent 160deg, #000 172deg 188deg, transparent 200deg); }
@keyframes hum { 50% { opacity: .82; } 53% { opacity: 1; } 56% { opacity: .9; } }

/* ---------- La lampe de l'ouvreuse (souris seulement) ---------- */
/* Un disque de lumière de taille fixe, déplacé par transform (rien à recalculer ailleurs dans la page). */
.torch { position: fixed; left: 0; top: 0; width: 640px; height: 640px; margin: -320px 0 0 -320px; z-index: -1; pointer-events: none; opacity: 0; transition: opacity .7s ease; will-change: transform;
  background: radial-gradient(circle 300px at 50% 50%, rgba(255,206,140,.17), rgba(255,206,140,.06) 45%, transparent 72%); }
.torch i { position: absolute; inset: 0;
  background: repeating-linear-gradient(90deg, rgba(255,180,170,.1) 0 2px, transparent 2px 13px, rgba(0,0,0,.28) 13px 17px, transparent 17px 23px);
  -webkit-mask: radial-gradient(circle 240px at 50% 50%, #000, transparent 72%); mask: radial-gradient(circle 240px at 50% 50%, #000, transparent 72%); }
.torch.on { opacity: 1; }
/* Messages gravés dans le velours : on ne les lit qu'à la lumière de la lampe. */
.secret { position: absolute; z-index: -1; width: 16ch; pointer-events: none; text-align: center; transform: rotate(var(--r, -5deg));
  font: italic 400 1.3rem/1.25 var(--serif); color: rgba(255,226,180,.8); text-shadow: 0 0 10px rgba(255,190,110,.4);
  -webkit-mask: radial-gradient(circle 110px at var(--sx, -999px) var(--sy, -999px), #000 25%, transparent 75%);
          mask: radial-gradient(circle 110px at var(--sx, -999px) var(--sy, -999px), #000 25%, transparent 75%); }
.noir .secret { color: rgba(255,236,200,.95); }
@media not all and (hover: hover) { .secret { display: none; } }
@media (max-width: 1099px) { .secret { display: none; } }
.noir .torch { background: radial-gradient(circle 230px at 50% 50%, rgba(255,226,170,.3), rgba(255,226,170,.08) 50%, transparent 74%); }

/* ---------- Les fauteuils et leurs spectateurs ---------- */
.seats { max-width: 1180px; margin: 26px auto 0; height: 170px; position: relative; opacity: .9;
  background:
    radial-gradient(ellipse 22px 26px at 26px 30px, #3b1220 0 20px, transparent 21px) 0 50px / 56px 60px repeat-x,
    radial-gradient(ellipse 26px 14px at 28px 52px, #2a0c17 0 13px, transparent 14px) 0 50px / 56px 60px repeat-x,
    radial-gradient(ellipse 22px 26px at 26px 30px, #2a0b17 0 20px, transparent 21px) 28px 108px / 56px 60px repeat-x,
    radial-gradient(ellipse 26px 14px at 28px 52px, #1d0710 0 13px, transparent 14px) 28px 108px / 56px 60px repeat-x;
  -webkit-mask: linear-gradient(90deg, transparent, #000 15%, #000 85%, transparent); mask: linear-gradient(90deg, transparent, #000 15%, #000 85%, transparent); }
/* Les spectateurs, vus de dos derrière leur fauteuil ; le liseré du haut, c'est la lumière de l'écran.
   Dérangés, ils se retournent : on voit leurs yeux (et ils ne sont pas contents). */
.tete { position: absolute; top: 18px; width: 36px; height: 46px; transform-origin: 50% 100%; cursor: pointer; animation: hoche 7s ease-in-out var(--d) infinite; }
.tete svg { display: block; width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 -1px 0 rgba(255,196,150,.5)); }
.tete .visage { display: none; }
.tete.chut .visage { display: inline; }
.tete.chut .arriere { display: none; }
/* Le dossier du premier rang passe devant les épaules. */
.seats::after { content: ""; position: absolute; inset: 0; z-index: 1; pointer-events: none;
  background: radial-gradient(ellipse 22px 26px at 26px 30px, #3b1220 0 20px, transparent 21px) 0 50px / 56px 60px repeat-x; }
[data-theme="drivein"] .seats::after, [data-theme="drivein"] .dossiers2 { display: none; }
/* Second rang : ses spectateurs passent devant le premier rang, son dossier devant leurs épaules. */
.tete.r2 { z-index: 2; }
.seats .dossiers2 { position: absolute; inset: 0; z-index: 3; pointer-events: none;
  background: radial-gradient(ellipse 22px 26px at 26px 30px, #2a0b17 0 20px, transparent 21px) 28px 108px / 56px 60px repeat-x; }
@keyframes hoche { 0%, 78%, 100% { transform: none; } 83% { transform: rotate(-7deg); } 90% { transform: rotate(5deg); } }
/* Chacun vit la séance à sa façon : il rit, chuchote à son voisin, sursaute, ou respire tranquillement. */
.tete.rit { animation: rit 8s ease-in-out var(--d) infinite; }
@keyframes rit { 0%, 70%, 88%, 100% { transform: none; } 72%, 76%, 80%, 84% { transform: translateY(-2px) rotate(-1deg); } 74%, 78%, 82%, 86% { transform: translateY(0) rotate(1deg); } }
.tete.chuchote { animation: chuchote 11s ease-in-out var(--d) infinite; }
@keyframes chuchote { 0%, 58%, 100% { transform: none; } 63%, 80% { transform: rotate(var(--penche, -12deg)) translateX(var(--vers, -3px)); } 85% { transform: none; } }
.tete.sursaute { animation: sursaute 13s ease-out var(--d) infinite; }
@keyframes sursaute { 0%, 86%, 100% { transform: none; } 87% { transform: translateY(-8px) scale(1.05); } 89% { transform: translateY(-2px); } 92% { transform: none; } }
.tete.respire { animation: respire 4.5s ease-in-out var(--d) infinite alternate; }
@keyframes respire { to { transform: translateY(-1px) scaleY(1.015); } }
/* Le pot de pop-corn monte à la bouche de temps en temps. */
.tete .cornet-g { transform-box: view-box; transform-origin: 31px 30px; animation: mange 6s ease-in-out var(--d) infinite; }
@keyframes mange { 0%, 64%, 100% { transform: none; } 72%, 82% { transform: translate(-6px, -9px) rotate(-14deg); } }
/* Les bras se lèvent pendant les applaudissements. */
.tete .bras { display: none; }
.seats.bravo .tete .bras { display: inline; }
.seats.bravo .tete .bras path, .seats.bravo .tete .bras circle { transform-box: view-box; animation: agite .22s ease-in-out infinite alternate; }
.seats.bravo .tete .bras .g { transform-origin: 6px 33px; }
.seats.bravo .tete .bras .d { transform-origin: 30px 33px; animation-direction: alternate-reverse; }
@keyframes agite { from { transform: rotate(-9deg); } to { transform: rotate(9deg); } }
/* Un spectateur dérangé se retourne et râle (une réplique différente à chaque fois). */
.tete.chut { animation: retourne .5s ease both; }
@keyframes retourne { 30% { transform: translateY(-6px) rotate(-8deg); } 100% { transform: none; } }
.tete.chut::before { content: attr(data-dit); position: absolute; bottom: calc(100% + 2px); left: 50%; padding: 2px 8px; border-radius: 8px; white-space: nowrap;
  background: var(--cream); color: var(--ink); font: 800 .72rem var(--body); transform: translateX(-50%); animation: bulle 1.8s ease forwards; }
@keyframes bulle { 0% { opacity: 0; transform: translate(-50%, 4px) scale(.6); } 12%, 80% { opacity: 1; transform: translate(-50%, 0) scale(1); } 100% { opacity: 0; } }
.seats.bravo .tete { animation: bravo .26s ease-in-out calc(var(--d) / 20) 6 alternate; }
.seats.bravo .tete .cornet-g { animation: none; }
@keyframes bravo { to { transform: translateY(-9px); } }

/* ---------- Les secrets de la salle ---------- */
.regie #trophees { color: var(--bulb); }
.regie #trophees svg { width: 17px; height: 17px; }
.regie #trophees.gagne { animation: gagne .7s cubic-bezier(.22,1,.36,1); }
.regie #trophees.complet { color: var(--ink); background: var(--bulb); border-color: var(--bulb); box-shadow: 0 0 18px rgba(255,207,107,.55); }
@keyframes gagne { 40% { transform: scale(1.25) rotate(-6deg); } }
.trophees { position: absolute; right: 0; top: calc(100% + 10px); z-index: 30; width: min(340px, calc(100vw - 32px)); padding: 16px; border-radius: 16px;
  border: 1px solid rgba(255,207,107,.3); background: rgba(28,14,21,.97); box-shadow: 0 24px 60px rgba(0,0,0,.6); animation: rise .25s ease both; }
.trophees h2 { margin: 0 0 4px; font: 400 1.6rem/1 var(--display); letter-spacing: .04em; color: var(--bulb); }
.trophees ul { list-style: none; margin: 10px 0; padding: 0; display: grid; gap: 7px; }
.trophees li { display: grid; grid-template-columns: 22px 1fr; gap: 8px; font-size: .9rem; color: var(--cream); }
.trophees li::before { content: "✓"; color: var(--green, #5fd39a); font-weight: 800; }
.trophees li.cache { color: var(--dim); font-style: italic; }
.trophees li.cache::before { content: "?"; color: var(--dim); }
.trophees p { margin: 0; font-size: .85rem; color: var(--dim); }
.trophees .barre { height: 6px; border-radius: 3px; background: rgba(255,255,255,.08); overflow: hidden; margin-top: 8px; }
.trophees .barre i { display: block; height: 100%; background: linear-gradient(90deg, var(--bulb), #ff9b3d); transform-origin: 0 50%; transition: transform .5s ease; }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } }

/* ---------- Le générique de fin ---------- */
.generique { max-width: 520px; height: 168px; margin: 22px auto 0; overflow: hidden; text-align: center;
  -webkit-mask: linear-gradient(transparent, #000 28%, #000 72%, transparent); mask: linear-gradient(transparent, #000 28%, #000 72%, transparent); }
.generique .defile { animation: defile 34s linear infinite; }
.generique:hover .defile { animation-play-state: paused; }
@keyframes defile { to { transform: translateY(-50%); } }
.generique dl { margin: 0; padding: 0 0 34px; display: grid; gap: 4px; }
.generique dt { font: italic 400 1rem var(--serif); color: var(--dim); margin-top: 14px; }
.generique dd { margin: 0; font: 400 1.45rem/1 var(--display); letter-spacing: .06em; color: var(--cream); }
.generique dd small { display: block; max-width: 40ch; margin: 6px auto 0; font: 400 .8rem/1.4 var(--body); letter-spacing: 0; color: var(--dim); }

/* ---------- Pop-corn, messages ---------- */
.kernel { position: fixed; z-index: 80; width: 15px; height: 13px; pointer-events: none;
  background:
    radial-gradient(circle at 30% 38%, #fffaf0 0 3.6px, transparent 4.2px),
    radial-gradient(circle at 68% 32%, #fff3dc 0 4px, transparent 4.6px),
    radial-gradient(circle at 52% 70%, #ffe8b4 0 4.4px, transparent 5px),
    radial-gradient(circle at 48% 58%, #e9b04f 0 1.6px, transparent 2.2px);
  filter: drop-shadow(0 1px 1px rgba(0,0,0,.45)); }
.toast { position: fixed; left: 50%; top: calc(18px + env(safe-area-inset-top)); z-index: 85; transform: translate(-50%, -16px); opacity: 0; pointer-events: none;
  padding: 12px 18px; border-radius: 12px; background: var(--cream); color: var(--ink); font: 800 .95rem var(--body); text-align: center;
  max-width: calc(100vw - 32px); box-shadow: 0 12px 30px rgba(0,0,0,.5); transition: opacity .3s ease, transform .35s cubic-bezier(.22,1,.36,1); }
.toast.on { opacity: 1; transform: translate(-50%, 0); }
/* ---------- Les erreurs : un encadré rouge bien visible, le même partout ---------- */
/* Fond sombre plein : lisible aussi bien sur le velours que dans un cadre blanc (QR code). */
.alerte { display: flex; gap: 10px; align-items: flex-start; margin: 0; padding: 12px 14px; border-radius: 12px; border: 1.5px solid #e5413a;
  background: #3b1216; color: #ffe1d8; font: 600 .95rem/1.45 "Figtree", system-ui, sans-serif; text-align: left; box-shadow: 0 0 0 3px rgba(229,65,58,.15); }
.alerte::before { content: "!"; flex: none; width: 22px; height: 22px; margin-top: 1px; border-radius: 50%; display: grid; place-items: center;
  background: #e5413a; color: #fff; font: 800 .85rem/1 "Figtree", system-ui, sans-serif; }
.alerte:empty { display: none; }
.toast.erreur { background: #3b1216; color: #ffe1d8; border: 1.5px solid #e5413a; }

/* ---------- Le décor de saison (le même que la rangée « Spécial ») ---------- */
.saison { position: fixed; inset: 0; z-index: 45; pointer-events: none; overflow: hidden; }
.saison i { position: absolute; left: var(--x); font-style: normal; }
[data-saison="halloween"] .marquee { --bulb: #ff9b3d; }
/* Les toiles d'araignée, dans les coins hauts ; elles ondulent un peu, comme dans un courant d'air. */
/* Les toiles d'araignée, dans les coins hauts. Comme les rideaux, elles ondulent quand on fait défiler
   (--vent, posé par le script), et respirent un peu au repos. */
/* Les toiles sont accrochées en haut de la page (pas à l'écran) : elles partent avec le lambrequin quand on défile. */
.toiles { display: none; }
[data-saison="halloween"] .toiles { display: block; position: absolute; top: 0; left: 0; right: 0; height: 300px; z-index: 45; pointer-events: none; }
[data-saison="halloween"] .toiles::before, [data-saison="halloween"] .toiles::after { content: ""; position: absolute; top: 0; width: 240px; height: 240px; background: ${COBWEB} 0 0 / 100% 100% no-repeat;
  filter: drop-shadow(0 0 2px rgba(255,240,220,.18)); animation: toile 7s ease-in-out infinite;
  transform: scaleX(var(--sx, 1)) skew(calc(var(--vent, 0) * 1deg), calc(var(--vent, 0) * .7deg)) scaleY(calc(1 + var(--vent-abs, 0) * .012)); }
[data-saison="halloween"] .toiles::before { left: 0; transform-origin: 0 0; }
[data-saison="halloween"] .toiles::after { right: 0; transform-origin: 100% 0; translate: -240px 0; --sx: -1; animation-delay: -3.5s; }
@keyframes toile { 50% { scale: 1.012 1.02; } }
@media (max-width: 760px) { [data-saison="halloween"] .toiles::before, [data-saison="halloween"] .toiles::after { width: 130px; height: 130px; opacity: .7; } [data-saison="halloween"] .toiles::after { translate: -130px 0; } }
/* L'araignée : elle descend au bout de son fil, puis remonte ; un clic la fait fuir. */
.toiles .araignee { position: absolute; top: 18px; right: 96px; width: 22px; height: 230px; pointer-events: none; transform-origin: 50% 0; rotate: calc(var(--vent, 0) * -2.2deg); }
.araignee .fil { position: absolute; left: 50%; top: 0; width: 1px; height: 200px; margin-left: -.5px; background: rgba(240,232,220,.45); transform-origin: 50% 0; transform: scaleY(0); animation: fil 14s ease-in-out infinite; }
.araignee .bete { position: absolute; left: -3px; top: -10px; width: 28px; height: 28px; filter: drop-shadow(0 0 4px rgba(255,155,61,.45)); pointer-events: auto; cursor: pointer; animation: bete 14s ease-in-out infinite; }
.araignee .bete svg { display: block; width: 100%; height: 100%; overflow: visible; animation: gigote .6s ease-in-out infinite alternate; }
@keyframes fil { 0%, 8% { transform: scaleY(0); } 30%, 62% { transform: scaleY(1); } 80%, 100% { transform: scaleY(0); } }
@keyframes bete { 0%, 8% { transform: translateY(0); } 30%, 62% { transform: translateY(200px); } 80%, 100% { transform: translateY(0); } }
@keyframes gigote { from { transform: rotate(-6deg); } to { transform: rotate(6deg); } }
/* Elle fuit depuis là où elle est, rapetisse et disparaît dans la toile, puis revient plus tard. */
.araignee .bete { transition: opacity .8s ease; }
.araignee.fuit .fil { animation: fuit-fil 1.1s ease-in forwards; }
.araignee.fuit .bete { animation: fuit-bete 1.1s ease-in forwards; }
.araignee.cachee .fil, .araignee.cachee .bete { animation: none; }
.araignee.cachee .bete { opacity: 0; pointer-events: none; }
@keyframes fuit-fil { from { transform: scaleY(var(--fil-depart, 1)); } to { transform: scaleY(0); } }
@keyframes fuit-bete { from { transform: translateY(var(--depart, 200px)); opacity: 1; } 80% { opacity: 1; } to { transform: translateY(-14px) scale(.35); opacity: 0; } }
@media (max-width: 760px) { .toiles .araignee { right: 40px; } }
.saison .chauve-souris { top: 0; left: 0; width: 40px; height: 18px; filter: drop-shadow(0 0 5px rgba(255,140,60,.55)); scale: var(--s, 1); animation: vol var(--t) linear var(--d) infinite backwards; }
.chauve-souris svg { display: block; width: 100%; height: 100%; animation: flap .16s ease-in-out infinite alternate; }
/* On peut les attraper : zone de clic agrandie, puis elles se débattent et partent en fumée. */
.saison .chauve-souris { pointer-events: auto; cursor: crosshair; padding: 12px; margin: -12px; box-sizing: content-box; touch-action: manipulation; }
.saison .chauve-souris.prise { animation: none; }
.chauve-souris.prise svg { animation: debat .06s linear infinite alternate; }
@keyframes debat { from { transform: scaleY(1) rotate(-14deg); } to { transform: scaleY(.3) rotate(14deg); } }
.saison .chauve-souris.essaim { pointer-events: none; animation: essaim 2.6s cubic-bezier(.4,.1,.6,.9) both; }
@keyframes essaim { from { translate: -80px var(--y0); } to { translate: 110vw var(--y1); } }
.saison .fumee { width: 72px; height: 72px; margin: -36px 0 0 -36px; border-radius: 50%; background: radial-gradient(circle, rgba(185,140,225,.6), rgba(120,80,165,.25) 45%, transparent 70%); animation: fumee .8s ease-out forwards; }
@keyframes fumee { from { transform: scale(.2); opacity: 1; } to { transform: scale(1.9); opacity: 0; } }
.saison.orage { animation: orage 1.4s steps(1); }
@keyframes orage { 0%, 22%, 48%, 100% { background-color: transparent; } 8%, 34% { background-color: rgba(220,230,255,.16); } }
@keyframes flap { to { transform: scaleY(.3); } }
@keyframes vol { 0% { translate: -60px 24vh; } 9% { translate: 22vw 13vh; } 18% { translate: 48vw 22vh; } 27% { translate: 76vw 9vh; } 36%, 100% { translate: 110vw 16vh; } }
/* ---------- Fêtes : une guirlande en haut de la page et un passant dans le ciel ---------- */
.guirlande { position: absolute; top: 0; left: 0; width: 100%; height: 120px; z-index: 44; pointer-events: none; }
.guirlande svg { display: block; width: 100%; height: 100%; overflow: visible; }
.guirlande .scint { animation: scint 1.8s ease-in-out infinite; }
@keyframes scint { 50% { opacity: .35; } }
.guirlande .balance { transform-box: fill-box; transform-origin: 50% 0; animation: fanion 3s ease-in-out infinite alternate; }
@keyframes fanion { from { transform: rotate(-6deg); } to { transform: rotate(6deg); } }
.passant { position: fixed; top: calc(14px + env(safe-area-inset-top)); left: 0; z-index: 46; padding: 0; border: 0; background: none; cursor: pointer; animation: survol 34s linear 7s infinite backwards; }
.passant svg { display: block; width: 100%; height: 100%; overflow: visible; }
.passant.traineau { width: 150px; height: 54px; }
.passant.traineau svg { animation: flotte 1.4s ease-in-out infinite alternate; }
.passant.cupidon { width: 56px; height: 50px; }
.passant.cupidon .ailes { transform-box: fill-box; transform-origin: 50% 100%; animation: flap .2s ease-in-out infinite alternate; }
.passant.lapin { width: 46px; height: 46px; }
.passant.lapin svg { animation: saut .45s ease-in-out infinite alternate; }
@keyframes saut { from { transform: translateY(6px) scaleY(.95); } to { transform: translateY(-10px) scaleY(1.04); } }
.passant.mouette { width: 60px; height: 26px; }
.passant.mouette svg { animation: flap .3s ease-in-out infinite alternate; }
.passant.touche { animation-play-state: paused; }
.eclat { position: fixed; z-index: 80; pointer-events: none; font: 400 1.2rem/1 var(--body); animation: eclat 1.1s ease-out forwards; }
@keyframes eclat { to { transform: translate(var(--ex), var(--ey)) scale(.6); opacity: 0; } }
.oeuf-tombe { position: fixed; z-index: 80; width: 14px; height: 18px; border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%; pointer-events: none;
  background: repeating-linear-gradient(160deg, #ffd1e8 0 4px, #fff3b0 4px 8px, #c8f2ff 8px 12px); animation: tombe-oeuf 1.4s cubic-bezier(.5,0,.9,.5) forwards; }
@keyframes tombe-oeuf { to { transform: translateY(70vh) rotate(380deg); opacity: 0; } }
[data-saison="saint-valentin"] .marquee::after { background: ${bulbs("#ff8fb1")}; filter: drop-shadow(0 0 6px rgba(255,120,170,.9)); }
[data-saison="paques"] .marquee::after { background: ${bulbs("#b8f0c8")}; filter: drop-shadow(0 0 6px rgba(184,240,200,.9)); }
[data-saison="ete"] .marquee::after { background: ${bulbs("#ffb36b")}; filter: drop-shadow(0 0 6px rgba(255,179,107,.9)); }
@media (prefers-reduced-motion: reduce) { .guirlande *, .passant, .passant * { animation: none !important; } .passant { left: 72vw; } }
/* Sur écran tactile (téléphones, tablettes), la guirlande reste immobile : moins de calcul à chaque image. */
@media (hover: none) { .guirlande .scint, .guirlande .balance { animation: none; } }
[data-saison="noel"] .marquee { --bulb: #ffd76b; }
[data-saison="noel"] .marquee::after { background: ${bulbs("#ff6b6b")}; filter: drop-shadow(0 0 6px rgba(255,90,90,.9)); }
[data-saison="noel"] .saison { opacity: .6; animation: neige 14s linear infinite;
  background-image: radial-gradient(circle at 10% 20%, #fff 0 1.5px, transparent 2px), radial-gradient(circle at 60% 70%, #fff 0 1px, transparent 1.5px), radial-gradient(circle at 80% 30%, #fff 0 2px, transparent 2.5px), radial-gradient(circle at 35% 85%, #fff 0 1.2px, transparent 1.8px);
  background-size: 220px 220px, 160px 160px, 300px 300px, 190px 190px; }
@keyframes neige { to { background-position: 30px 220px, -20px 160px, 40px 300px, -10px 190px; } }
[data-saison="saint-valentin"] .marquee { --bulb: #ff8fb1; }
.coeur { bottom: -30px; color: #ff6f9a; font-size: calc(20px * var(--s)); opacity: .45; animation: monte var(--t) linear var(--d) infinite; }
@keyframes monte { 0% { transform: translate(0, 0) rotate(-10deg); } 50% { transform: translate(30px, -55vh) rotate(10deg); } 100% { transform: translate(-10px, -115vh) rotate(-10deg); } }
[data-saison="paques"] .marquee { --bulb: #ffe08a; }
.oeuf { top: -30px; width: calc(12px * var(--s)); height: calc(15px * var(--s)); border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%; background: hsl(var(--h) 75% 80%); opacity: .55; animation: tombe var(--t) linear var(--d) infinite; }
@keyframes tombe { to { transform: translate(40px, 112vh) rotate(260deg); } }
[data-saison="ete"] .marquee { --bulb: #ffe14d; }
.luciole { top: var(--y); width: 4px; height: 4px; border-radius: 50%; background: #e9ff8a; box-shadow: 0 0 8px 2px rgba(220,255,120,.6); opacity: 0; animation: luciole var(--t) ease-in-out var(--d) infinite; }
@keyframes luciole { 0%, 100% { transform: translate(0, 0); opacity: 0; } 20% { opacity: .9; } 50% { transform: translate(60px, -40px); opacity: .2; } 70% { opacity: .9; } 85% { transform: translate(-30px, 20px); opacity: 0; } }

/* ---------- Le curseur : une flèche dorée ; sur ce qui se clique, avec un grain de pop-corn ---------- */
@media (hover: hover) and (pointer: fine) {
  html { cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Cpath d='M3 2v22l6-5.5 4.2 8.6 3.9-1.8-4.1-8.5H21z' fill='%23ffcf6b' stroke='%231b0d14' stroke-width='1.6' stroke-linejoin='round'/%3E%3Cpath d='M5 6v13' stroke='%23fff6d8' stroke-width='1.2' stroke-linecap='round' opacity='.7'/%3E%3C/svg%3E") 3 2, auto; }
  a, button, summary, label, select, [role="button"], input[type="checkbox"], input[type="range"], .chip span, .nv-card, .nv-tile, .tete, .marquee .lettre, .ampoules .base i.grillee, .reel-btn, .salle, .seats, .cabine, .applaudir {
    cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Cpath d='M3 2v22l6-5.5 4.2 8.6 3.9-1.8-4.1-8.5H21z' fill='%23ffcf6b' stroke='%231b0d14' stroke-width='1.6' stroke-linejoin='round'/%3E%3Cg stroke='%231b0d14' stroke-width='1.1' fill='%23fff3dc'%3E%3Ccircle cx='23' cy='23.5' r='3.6'/%3E%3Ccircle cx='27.6' cy='22.4' r='3.3'/%3E%3Ccircle cx='25.4' cy='27.6' r='3.4'/%3E%3C/g%3E%3Ccircle cx='25.2' cy='24.6' r='1.3' fill='%23e9b04f'/%3E%3C/svg%3E") 3 2, pointer !important; }
  input[type="text"], input[type="number"], textarea { cursor: text; }
  .nv-track.drag, .nv-track.drag .nv-card, .nv-track.drag .nv-tile { cursor: grabbing !important; }
  .saison .chauve-souris { cursor: crosshair !important; }
}

/* ---------- Les salles : chacune son époque, sa typo, ses couleurs, son décor ---------- */
@property --led { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
.decor-salle { position: fixed; inset: 0; z-index: 0; pointer-events: none; display: none; }
.salle-tag { display: none; }

/* === Film muet (années 1920) : sépia, cartons à double filet, pellicule qui défile sur les côtés === */
:root[data-theme="muet"] { filter: grayscale(1) sepia(.35) contrast(1.08); --velvet: #111; --velvet-2: #0c0c0c; --seat: #3a3a3a; --bulb: #efe7d6; --red: #efe7d6; --cream: #f2ecdf; --dim: #b8b0a2; }
[data-theme="muet"] body { background: radial-gradient(ellipse at 50% 25%, #2b2b2b, #0a0a0a 75%); }
[data-theme="muet"] .valance { display: none; }
[data-theme="muet"] .marquee { background: #000; border-radius: 0; box-shadow: 0 0 0 4px #000, 0 0 0 6px #efe7d6, 0 0 0 10px #000, 0 0 0 11px #efe7d6, 0 20px 60px rgba(0,0,0,.7); }
[data-theme="muet"] .ampoules, [data-theme="muet"] .marquee::before, [data-theme="muet"] .marquee::after { display: none; }
[data-theme="muet"] .marquee h1, [data-theme="muet"] .act h2 { font-family: var(--serif); font-style: italic; text-transform: none; letter-spacing: 0; color: #f2ecdf; text-shadow: none; }
[data-theme="muet"] .marquee small { font-family: var(--serif); font-style: italic; letter-spacing: .08em; text-transform: none; font-size: 1rem; }
[data-theme="muet"] .act { border-radius: 0; background: #0c0c0c; border: 3px double #efe7d6; }
[data-theme="muet"] .act::before { display: none; }
[data-theme="muet"] .toc, [data-theme="muet"] .nav { border-radius: 0; border: 3px double #efe7d6; background: #0c0c0c; }
[data-theme="muet"] .act h2 { display: inline-block; justify-self: start; padding: 6px 16px 4px; border: 3px double #efe7d6; font-size: 2.2rem; }
[data-theme="muet"] .act .label, [data-theme="muet"] .act header > span:first-child:not(.num) { background: none; color: #efe7d6; border-bottom: 1px solid #efe7d6; border-radius: 0; transform: none; font-family: var(--serif); font-style: italic; letter-spacing: .04em; text-transform: none; font-size: .95rem; }
[data-theme="muet"] .draperie { width: clamp(0px, calc((100vw - 1180px) / 2), 74px); animation: none; transform: none; }
[data-theme="muet"] .draperie i.bas, [data-theme="muet"] .draperie .tranche, [data-theme="muet"] .draperie .gland, [data-theme="muet"] .draperie::after { display: none; }
[data-theme="muet"] .draperie i.haut { clip-path: none; transform: none; background-repeat: repeat-y, repeat-y, no-repeat;
  background-image: repeating-linear-gradient(transparent 0 10px, #d8d0c0 10px 22px, transparent 22px 32px), repeating-linear-gradient(transparent 0 10px, #d8d0c0 10px 22px, transparent 22px 32px), linear-gradient(90deg, #050505, #1a1a1a 50%, #050505);
  background-size: 12px 100%, 12px 100%, 100% 100%; background-position: 10px 0, calc(100% - 10px) 0, 0 0; animation: film-defile .45s linear infinite; }
@keyframes film-defile { to { background-position: 10px 32px, calc(100% - 10px) 32px, 0 0; } }
[data-theme="muet"] .seats { filter: brightness(.9); }
.muet-fx { position: fixed; inset: 0; z-index: 56; pointer-events: none;
  background: radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,.55)), linear-gradient(90deg, transparent 0 18%, rgba(255,255,255,.2) 18% 18.12%, transparent 18.12% 63%, rgba(0,0,0,.35) 63% 63.2%, transparent 63.2%);
  animation: muet-flicker .12s steps(2) infinite, muet-rayures 1.4s steps(7) infinite; }
@keyframes muet-flicker { 50% { opacity: .82; } }
@keyframes muet-rayures { 0% { background-position: 0 0, 0 0; } 20% { background-position: 0 0, 27vw 0; } 40% { background-position: 0 0, -14vw 0; } 60% { background-position: 0 0, 41vw 0; } 80% { background-position: 0 0, -30vw 0; } }

/* === Art déco (années 1930) : bleu canard et or, typo Limelight, pans coupés, soleil de rayons === */
:root[data-theme="artdeco"] { --velvet: #0b1416; --velvet-2: #102024; --seat: #2b4a46; --red: #c9a227; --bulb: #e8c66a; --dim: #a9b8b2; --cream: #f3ead2; }
[data-theme="artdeco"] body { background: radial-gradient(circle at 50% 100%, transparent 0 22px, rgba(212,175,55,.13) 23px 25px, transparent 26px 34px, rgba(212,175,55,.08) 35px 36px, transparent 37px) 0 0 / 80px 40px, var(--velvet); }
[data-theme="artdeco"] .marquee h1, [data-theme="artdeco"] .act h2, [data-theme="artdeco"] .salle b { font-family: "Limelight", var(--display); letter-spacing: .05em; }
[data-theme="artdeco"] .marquee h1 { font-size: clamp(2rem, 5.6vw, 3.9rem); color: #f6dc98; text-shadow: 0 0 22px rgba(232,198,106,.45); }
[data-theme="artdeco"] .marquee { border-radius: 0; background: linear-gradient(#13282c, #0b1416);
  clip-path: polygon(22px 0, calc(100% - 22px) 0, 100% 22px, 100% calc(100% - 22px), calc(100% - 22px) 100%, 22px 100%, 0 calc(100% - 22px), 0 22px);
  box-shadow: inset 0 0 0 3px #c9a227, inset 0 0 0 8px #0b1416, inset 0 0 0 9px #c9a227; }
[data-theme="artdeco"] .ampoules i { border-radius: 1px; transform: rotate(45deg); }
[data-theme="artdeco"] .toc, [data-theme="artdeco"] .nav { border-radius: 0; border: 1px solid rgba(201,162,39,.75); }
[data-theme="artdeco"] .act { border-radius: 0; border: 1px solid rgba(201,162,39,.75); box-shadow: inset 0 0 0 5px var(--velvet-2), inset 0 0 0 6px rgba(201,162,39,.35); }
[data-theme="artdeco"] .act::before { inset: 0; height: auto;
  background: linear-gradient(135deg, #c9a227 0 12px, transparent 12px) top left / 34px 34px no-repeat, linear-gradient(225deg, #c9a227 0 12px, transparent 12px) top right / 34px 34px no-repeat,
    linear-gradient(45deg, #c9a227 0 12px, transparent 12px) bottom left / 34px 34px no-repeat, linear-gradient(315deg, #c9a227 0 12px, transparent 12px) bottom right / 34px 34px no-repeat; }
[data-theme="artdeco"] .act .label, [data-theme="artdeco"] .act header > span:first-child:not(.num) { background: #c9a227; color: #0b1416; border-radius: 0; transform: none; clip-path: polygon(6px 0, calc(100% - 6px) 0, 100% 50%, calc(100% - 6px) 100%, 6px 100%, 0 50%); padding-inline: 12px; }
[data-theme="artdeco"] .valance { height: 150px; filter: none; -webkit-mask: radial-gradient(ellipse 55% 100% at 50% 0, #000 30%, transparent 75%); mask: radial-gradient(ellipse 55% 100% at 50% 0, #000 30%, transparent 75%);
  background: repeating-conic-gradient(from 90deg at 50% 0, rgba(201,162,39,.38) 0 3deg, transparent 3deg 9deg); animation: soleil 6s ease-in-out infinite; }
[data-theme="artdeco"] .valance::after { display: none; }
@keyframes soleil { 50% { opacity: .55; } }
[data-theme="artdeco"] .curtain i, [data-theme="artdeco"] .draperie i:not(.gland) { filter: hue-rotate(150deg) saturate(.75); }
[data-theme="artdeco"] .seats { filter: hue-rotate(150deg) saturate(.6); }

/* === Drive-in (années 1950) : nuit étoilée, lune, enseigne en néon rose et cyan, voitures === */
:root[data-theme="drivein"] { --velvet: #0a0f1f; --velvet-2: #111a33; --seat: #263252; --dim: #a4adc4; --bulb: #5ff2e5; --red: #ff4fa0; --cream: #f6f1ff; }
[data-theme="drivein"] body { background: radial-gradient(1px 1px at 20px 30px, #fff, transparent) 0 0 / 120px 90px, radial-gradient(1.5px 1.5px at 70px 60px, rgba(255,255,255,.8), transparent) 0 0 / 170px 130px, radial-gradient(1px 1px at 110px 20px, rgba(255,255,255,.6), transparent) 0 0 / 90px 110px, linear-gradient(#060914, #142046 70%, #1d2b55) fixed; }
[data-theme="drivein"] .valance, [data-theme="drivein"] .draperie, [data-theme="drivein"] .tete, [data-theme="drivein"] .seats::after, [data-theme="drivein"] .dossiers2 { display: none; }
[data-theme="drivein"] .seats { background: linear-gradient(transparent 60%, rgba(10,14,30,.6)); -webkit-mask: none; mask: none; }
[data-theme="drivein"] .ampoules, [data-theme="drivein"] .marquee::before, [data-theme="drivein"] .marquee::after { display: none; }
[data-theme="drivein"] .marquee { border-radius: 26px; background: rgba(10,15,31,.85); box-shadow: 0 0 0 3px #5ff2e5, 0 0 18px rgba(95,242,229,.8), inset 0 0 18px rgba(95,242,229,.35), 0 20px 60px rgba(0,0,0,.6); }
[data-theme="drivein"] .marquee h1 { font-family: "Pacifico", cursive; text-transform: none; letter-spacing: 0; font-size: clamp(2.4rem, 7vw, 4.6rem); line-height: 1.25; color: #ffe6f4;
  text-shadow: 0 0 4px #fff, 0 0 12px #ff4fa0, 0 0 28px #ff4fa0, 0 0 48px rgba(255,79,160,.6); }
[data-theme="drivein"] .marquee small { color: #5ff2e5; text-shadow: 0 0 10px rgba(95,242,229,.9); }
[data-theme="drivein"] .act h2 { font-family: "Pacifico", cursive; text-transform: none; letter-spacing: 0; font-size: 1.9rem; line-height: 1.3; color: #fff; text-shadow: 0 0 14px rgba(255,79,160,.55); }
[data-theme="drivein"] .act { border-radius: 24px; border: 1px solid rgba(95,242,229,.35); box-shadow: 0 0 26px rgba(95,242,229,.08), inset 0 1px 0 rgba(255,255,255,.06); }
[data-theme="drivein"] .toc, [data-theme="drivein"] .nav { border-radius: 24px; border-color: rgba(95,242,229,.35); box-shadow: 0 0 22px rgba(95,242,229,.08); }
[data-theme="drivein"] .act::before { background: linear-gradient(90deg, transparent, #ff4fa0, #5ff2e5, transparent); opacity: .7; }
[data-theme="drivein"] .act .label, [data-theme="drivein"] .act header > span:first-child:not(.num) { background: #ff4fa0; color: #fff; border-radius: 99px; transform: none; box-shadow: 0 0 12px rgba(255,79,160,.7); }
[data-theme="drivein"] .decor-salle { display: block;
  background: radial-gradient(circle at 86% 13%, #fdf6d8 0 34px, rgba(253,246,216,.18) 36px, transparent 90px); }
[data-theme="drivein"] .decor-salle::after { content: ""; position: absolute; top: 9%; left: -10%; width: 140px; height: 2px; border-radius: 2px; background: linear-gradient(90deg, transparent, #fff); transform: rotate(-18deg); opacity: 0; animation: filante 9s linear 3s infinite; }
@keyframes filante { 0% { opacity: 0; transform: translate(0, 0) rotate(-18deg); } 3% { opacity: 1; } 12% { opacity: 0; transform: translate(60vw, 20vh) rotate(-18deg); } 100% { opacity: 0; transform: translate(60vw, 20vh) rotate(-18deg); } }

/* === IMAX (aujourd'hui) : noir et bleu électrique, typo Orbitron, verre, bande LED, écran géant === */
:root[data-theme="imax"] { --velvet: #04070d; --velvet-2: #0b1222; --seat: #1d2a40; --bulb: #8fd3ff; --red: #2f6bff; --dim: #93a4bf; --cream: #eaf4ff; }
[data-theme="imax"] body { background: repeating-linear-gradient(90deg, rgba(143,211,255,.025) 0 1px, transparent 1px 46px), var(--velvet); }
[data-theme="imax"] .valance, [data-theme="imax"] .draperie, [data-theme="imax"] .ampoules, [data-theme="imax"] .marquee::before, [data-theme="imax"] .marquee::after { display: none; }
[data-theme="imax"] .marquee h1, [data-theme="imax"] .act h2, [data-theme="imax"] .salle b { font-family: "Orbitron", var(--display); font-weight: 700; letter-spacing: .06em; }
[data-theme="imax"] .marquee h1 { font-size: clamp(2rem, 6.4vw, 4.2rem); color: #eaf4ff; text-shadow: 0 0 24px rgba(47,107,255,.65); }
[data-theme="imax"] .act h2 { font-size: 1.7rem; }
[data-theme="imax"] .marquee { border-radius: 18px; border: 2px solid transparent; animation: led 5s linear infinite;
  background: linear-gradient(#0b1424, #05080f) padding-box, conic-gradient(from var(--led), #2f6bff, #8fd3ff, transparent 30%, transparent 70%, #2f6bff) border-box;
  box-shadow: 0 0 40px rgba(47,107,255,.25), 0 20px 60px rgba(0,0,0,.6); }
@keyframes led { to { --led: 360deg; } }
[data-theme="imax"] .act { border-radius: 20px; border: 1px solid rgba(143,211,255,.22); background: linear-gradient(180deg, rgba(20,32,58,.85), rgba(8,13,24,.85)); }
[data-theme="imax"] .toc, [data-theme="imax"] .nav { border-radius: 20px; border-color: rgba(143,211,255,.22); background: linear-gradient(180deg, rgba(20,32,58,.85), rgba(8,13,24,.85)); }
[data-theme="imax"] .act::before { background: linear-gradient(90deg, transparent, #8fd3ff, transparent); }
[data-theme="imax"] .act .label, [data-theme="imax"] .act header > span:first-child:not(.num) { background: rgba(47,107,255,.2); color: #8fd3ff; border: 1px solid rgba(143,211,255,.5); border-radius: 6px; transform: none; font-family: "Orbitron", var(--body); letter-spacing: .12em; }
[data-theme="imax"] .decor-salle { display: block; background: radial-gradient(ellipse 75% 46px at 50% 0, rgba(143,211,255,.55), rgba(47,107,255,.18) 55%, transparent 75%); }
[data-theme="imax"] .decor-salle::after { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(143,211,255,.6), transparent); animation: laser 8s linear infinite; }
@keyframes laser { from { transform: translateY(0); opacity: .9; } to { transform: translateY(100vh); opacity: 0; } }
[data-theme="imax"] .curtain i { filter: hue-rotate(200deg) saturate(.5) brightness(.7); }
[data-theme="imax"] .seats { filter: hue-rotate(210deg) saturate(.45) brightness(.9); }
/* ---------- Ce qui vit dans chaque salle ---------- */
.parking, .pianiste, .lustre, .soucoupe { display: none; }
/* Drive-in : des voitures des années 50, qui klaxonnent et allument leurs phares. */
[data-theme="drivein"] .parking { display: block; position: absolute; inset: 0; }
.voiture { position: absolute; width: 92px; height: 44px; padding: 0; border: 0; background: none; cursor: pointer; transform-origin: 50% 100%; animation: tangue 5s ease-in-out var(--d, 0s) infinite; }
.voiture svg { display: block; width: 100%; height: 100%; overflow: visible; }
@keyframes tangue { 0%, 70%, 100% { transform: none; } 75% { transform: rotate(-1.2deg); } 82% { transform: rotate(.8deg); } }
.voiture .phare { position: absolute; right: -2px; top: 22px; width: 6px; height: 5px; border-radius: 50%; background: #fff7c4; box-shadow: 0 0 6px 2px rgba(255,240,170,.5); }
.voiture .phare::after { content: ""; position: absolute; left: 4px; top: 50%; width: 120px; height: 46px; transform: translateY(-50%); opacity: 0; pointer-events: none;
  background: linear-gradient(90deg, rgba(255,245,190,.55), transparent); clip-path: polygon(0 45%, 100% 0, 100% 100%, 0 55%); transition: opacity .15s ease; }
.voiture.flash .phare::after { opacity: 1; }
.voiture.flash { animation: klaxon .12s linear 4 alternate; }
@keyframes klaxon { to { transform: translateY(-2px) rotate(-1deg); } }
.voiture .bulle-v { position: absolute; left: 50%; bottom: calc(100% + 4px); padding: 2px 8px; border-radius: 8px; white-space: nowrap; background: var(--cream); color: var(--ink); font: 800 .7rem var(--body); opacity: 0; transform: translateX(-50%); pointer-events: none; }
.voiture.flash .bulle-v { animation: bulle 1.8s ease forwards; }
/* La soucoupe volante traverse le ciel ; un clic et elle allume son rayon. */
[data-theme="drivein"] .soucoupe { display: block; position: fixed; top: calc(12px + env(safe-area-inset-top)); left: 0; z-index: 46; width: 74px; height: 40px; padding: 0; border: 0; background: none; cursor: pointer; pointer-events: auto; animation: survol 32s linear 4s infinite; }
.soucoupe svg { display: block; width: 100%; height: 100%; overflow: visible; animation: flotte 1.6s ease-in-out infinite alternate; }
@keyframes flotte { to { transform: translateY(5px) rotate(4deg); } }
@keyframes survol { 0% { transform: translateX(-120px); } 40% { transform: translateX(45vw) translateY(4vh); } 50% { transform: translateX(55vw) translateY(-2vh); } 100% { transform: translateX(110vw) translateY(3vh); } }
.soucoupe .rayon { position: absolute; left: 50%; top: 30px; width: 120px; height: 220px; margin-left: -60px; opacity: 0; pointer-events: none;
  background: linear-gradient(rgba(170,255,210,.55), rgba(170,255,210,0)); clip-path: polygon(38% 0, 62% 0, 100% 100%, 0 100%); transition: opacity .3s ease; }
.soucoupe.aspire .rayon { opacity: 1; }
.soucoupe.aspire { animation-play-state: paused; }
.soucoupe .feu { animation: feux .5s steps(1) infinite; }
.soucoupe .feu:nth-of-type(2) { animation-delay: -.25s; }
@keyframes feux { 50% { fill: #ff4fa0; } }
/* Film muet : un pianiste accompagne le film ; un clic, il joue un air. */
[data-theme="muet"] .pianiste { display: block; position: absolute; right: 0; top: 22px; z-index: 4; width: 128px; height: 120px; filter: drop-shadow(0 0 8px rgba(239,231,214,.25)); padding: 0; border: 0; background: none; cursor: pointer; }
.pianiste svg { display: block; width: 100%; height: 100%; overflow: visible; }
.pianiste .main-g, .pianiste .main-d { transform-box: view-box; animation: joue .32s ease-in-out infinite alternate; }
.pianiste .main-g { transform-origin: 52px 50px; }
.pianiste .main-d { transform-origin: 66px 50px; animation-delay: -.16s; }
@keyframes joue { to { transform: translateY(-2.5px); } }
.pianiste .tete-pi { transform-box: view-box; transform-origin: 48px 40px; animation: balance-pi 2.4s ease-in-out infinite alternate; }
@keyframes balance-pi { from { transform: rotate(-5deg); } to { transform: rotate(6deg); } }
.pianiste.virtuose .main-g, .pianiste.virtuose .main-d { animation-duration: .12s; }
.note-volante { position: absolute; z-index: 5; font: 400 1.3rem/1 var(--serif); color: #efe7d6; pointer-events: none; animation: s-envole 1.6s ease-out forwards; }
@keyframes s-envole { to { transform: translate(var(--nx, 20px), -70px) rotate(var(--nr, 15deg)); opacity: 0; } }
/* Art déco : deux lustres qui se balancent ; un clic, ils scintillent. */
[data-theme="artdeco"] .lustre { display: block; position: absolute; top: 0; z-index: 4; width: 84px; height: 132px; padding: 0; border: 0; background: none; cursor: pointer; pointer-events: auto; transform-origin: 50% 0; animation: lustre 6s ease-in-out infinite alternate; }
[data-theme="artdeco"] .lustre.g { left: calc(50% - 470px); }
[data-theme="artdeco"] .lustre.d { left: calc(50% + 386px); animation-delay: -3s; }
.lustre svg { display: block; width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 0 10px rgba(232,198,106,.35)); transition: filter .4s ease; }
@keyframes lustre { from { transform: rotate(-1.6deg); } to { transform: rotate(1.6deg); } }
.lustre .goutte { animation: cristal 2.6s ease-in-out infinite; }
.lustre .goutte:nth-of-type(2n) { animation-delay: -1.3s; }
@keyframes cristal { 50% { opacity: .45; } }
.lustre.brille svg { filter: drop-shadow(0 0 22px rgba(255,236,170,.95)) brightness(1.35); }
.lustre.brille { animation: lustre-secoue .5s ease-in-out 3 alternate; }
@keyframes lustre-secoue { from { transform: rotate(-5deg); } to { transform: rotate(5deg); } }
@media (max-width: 1100px) { [data-theme="artdeco"] .lustre { display: none; } }
/* IMAX : lunettes 3D sur le nez des spectateurs, et un léger relief rouge et cyan sur l'enseigne. */
.tete .l3d { display: none; }
[data-theme="imax"] .tete.chut .l3d { display: inline; }
[data-theme="imax"] .marquee h1 { animation: relief 5s ease-in-out infinite; }
@keyframes relief { 0%, 100% { text-shadow: -2px 0 rgba(255,40,80,.55), 2px 0 rgba(0,220,255,.55), 0 0 24px rgba(47,107,255,.65); } 50% { text-shadow: -5px 0 rgba(255,40,80,.5), 5px 0 rgba(0,220,255,.5), 0 0 30px rgba(47,107,255,.8); } }
@media (prefers-reduced-motion: reduce) { .voiture, .soucoupe, .soucoupe svg, .pianiste *, .lustre, .lustre *, [data-theme="imax"] .marquee h1 { animation: none !important; } [data-theme="drivein"] .soucoupe { left: 70vw; } }


/* ---------- L'heure de la séance ---------- */
:root[data-heure="minuit"]:not([data-theme]) { --velvet: #12080c; --velvet-2: #1b0e14; }
.heure-fx { position: fixed; inset: 0; z-index: 0; pointer-events: none; background: repeating-linear-gradient(120deg, rgba(255,236,190,.06) 0 60px, transparent 60px 150px);
  -webkit-mask: radial-gradient(ellipse 70% 60% at 0 0, #000, transparent 70%); mask: radial-gradient(ellipse 70% 60% at 0 0, #000, transparent 70%); }

/* ---------- La cabine du projectionniste ---------- */
.cabine { position: absolute; left: 50%; top: -76px; z-index: 2; width: 78px; transform: translateX(-50%); }
.cabine .vitre { position: relative; height: 40px; border-radius: 5px; overflow: hidden;
  background: radial-gradient(ellipse 90% 100% at 50% 100%, rgba(255,214,150,.6), rgba(255,170,90,.12) 75%), #241210;
  box-shadow: 0 0 0 3px #4a2a36, 0 0 0 5px #1b0d14, 0 0 24px rgba(255,200,120,.25), inset 0 0 10px rgba(0,0,0,.6); }
/* Le projectionniste : casquette, lunettes, moustache, bretelles, derrière son projecteur à bobines. */
.cabine svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.cabine svg * { transform-box: view-box; }
.cabine .bob { position: absolute; top: 3.5px; width: 15px; height: 15px; border-radius: 50%; will-change: transform; animation: tourne-bobine 2.4s linear infinite;
  background: radial-gradient(circle, #c98b2e 0 1.6px, transparent 2.1px), repeating-conic-gradient(#6b4a2c 0 7deg, transparent 7deg 45deg), #1a0e0c; box-shadow: inset 0 0 0 1.2px #6b4a2c; }
.cabine .bob.g { left: 38.5px; } .cabine .bob.d { left: 54.5px; }
@keyframes tourne-bobine { to { transform: rotate(360deg); } }
.cabine .tete-p { transform-origin: 18px 25px; transition: transform .8s ease; }
.cabine.dort .tete-p { transform: rotate(-16deg) translate(-1px, 2px); }
.cabine:not(.dort):not(.salut) .tete-p { animation: surveille 6s ease-in-out infinite; }
@keyframes surveille { 0%, 40%, 100% { transform: none; } 50%, 70% { transform: rotate(7deg) translateX(.6px); } 80% { transform: rotate(-3deg); } }
.cabine.dort .bob { animation-duration: 9s; }
.cabine .yeux-fermes { display: none; }
.cabine.dort .yeux-fermes { display: inline; }
.cabine .bras-p { transform-origin: 27px 31px; opacity: 0; }
.cabine.salut .bras-p { opacity: 1; animation: coucou .32s ease-in-out 6 alternate; }
@keyframes coucou { from { transform: rotate(-25deg); } to { transform: rotate(20deg); } }
.cabine .projo { position: absolute; left: 68px; top: 21.5px; width: 11px; height: 11px; border-radius: 50%; background: radial-gradient(circle, #fff 0 30%, #ffe2a8 60%, #b07a2a); box-shadow: 0 0 12px 4px rgba(255,220,150,.75); }
.cabine .bulle { position: absolute; left: 50%; top: calc(100% + 8px); padding: 3px 9px; border-radius: 8px; white-space: nowrap; background: var(--cream); color: var(--ink); font: 800 .72rem var(--body); opacity: 0; transform: translateX(-50%); pointer-events: none; }
.cabine.parle .bulle { animation: bulle 2.2s ease forwards; }
.cabine.dort.parle .bulle { animation-duration: 4s; }
@media (max-width: 760px) { .cabine { display: none; } }

/* ---------- Panne de courant ---------- */
.panne-fx { position: fixed; inset: 0; z-index: 76; pointer-events: none; background: rgba(2,1,2,.97); animation: panne-in .2s steps(2) both;
  -webkit-mask: radial-gradient(circle 170px at var(--tx, 50%) var(--ty, 50%), transparent 35%, #000 78%); mask: radial-gradient(circle 170px at var(--tx, 50%) var(--ty, 50%), transparent 35%, #000 78%); }
@keyframes panne-in { from { opacity: 0; } }
.panne-fx .exit { position: absolute; bottom: 24px; padding: 7px 14px 5px; border-radius: 6px; font: 400 1.4rem/1 var(--display); letter-spacing: .14em; text-transform: uppercase; color: #eafff2; background: #1f9d5c; box-shadow: 0 0 26px rgba(60,220,140,.75); }
.panne-fx .exit.g { left: 24px; } .panne-fx .exit.d { right: 24px; }
.panne-fx.retour { animation: retour-courant 1.5s steps(1) forwards; }
@keyframes retour-courant { 0% { opacity: 1; } 15% { opacity: 0; } 25% { opacity: 1; } 40% { opacity: 0; } 50% { opacity: .8; } 65%, 100% { opacity: 0; } }

/* ---------- La pellicule qui brûle ---------- */
@property --r { syntax: "<length>"; inherits: false; initial-value: 0px; }
.brule { position: fixed; inset: 0; z-index: 77; pointer-events: none; }
.brule i { position: absolute; inset: 0; animation: brule 3.2s cubic-bezier(.5,0,.9,.45) var(--dl) both;
  background: radial-gradient(circle at var(--bx) var(--by), #fffbe8 0 var(--r), #ffb347 calc(var(--r) + 3px), #7a2a00 calc(var(--r) + 10px), rgba(20,8,0,.88) calc(var(--r) + 16px), transparent calc(var(--r) + 46px)); }
@keyframes brule { from { --r: 0px; } to { --r: 120vmax; } }
.brule.repart { animation: repart .8s ease forwards; }
@keyframes repart { to { opacity: 0; } }

/* ---------- Ton fauteuil ---------- */
.seats { cursor: pointer; }
.tete.toi svg { filter: drop-shadow(0 -1px 0 rgba(255,207,107,.95)) drop-shadow(0 0 5px rgba(255,207,107,.55)); }
.tete.toi::after { content: "Toi"; position: absolute; top: -17px; left: 50%; transform: translateX(-50%); font: 800 .62rem var(--body); letter-spacing: .08em; color: var(--bulb); }

/* ---------- L'applaudimètre ---------- */
.applaudimetre { display: flex; align-items: center; justify-content: center; gap: 10px 14px; flex-wrap: wrap; max-width: 520px; margin: 8px auto 0; }
.applaudir { font: 800 .9rem var(--body); padding: 9px 18px; border-radius: 99px; border: 1px solid rgba(255,207,107,.45); background: rgba(255,207,107,.08); color: var(--bulb); transition: transform .1s ease, box-shadow .3s ease; }
.applaudir:active { transform: scale(.92); }
.applaudimetre.chaud .applaudir { box-shadow: 0 0 20px rgba(255,207,107,.5); }
.jauge { width: 170px; height: 12px; border-radius: 6px; overflow: hidden; background: #0f080c; box-shadow: inset 0 0 0 1px var(--seat); }
.jauge i { display: block; height: 100%; clip-path: inset(0 100% 0 0); background: linear-gradient(90deg, #5fd39a, var(--bulb) 60%, #e5413a);
  -webkit-mask: repeating-linear-gradient(90deg, #000 0 8px, transparent 8px 10px); mask: repeating-linear-gradient(90deg, #000 0 8px, transparent 8px 10px); }
.record { flex-basis: 100%; margin: 0; text-align: center; font: italic 400 .95rem var(--serif); color: var(--dim); }

/* ---------- Séance rétro (code 1895) ---------- */
.retro { position: fixed; inset: 0; z-index: 89; display: grid; place-items: center; background: #0a0806; animation: panne-in .6s ease both; }
.retro .carton { grid-area: 1 / 1; max-width: calc(100vw - 48px); padding: 34px 46px; text-align: center; color: #efe6d6; border: 3px double #d8cfbf; outline: 1px solid #d8cfbf; outline-offset: 8px; font: italic 400 1.3rem/1.3 var(--serif); transition: opacity .8s ease; }
.retro .carton b { display: block; margin: 10px 0; font: 400 clamp(2rem, 6vw, 3.4rem)/1 var(--display); letter-spacing: .04em; }
.retro .carton p { margin: 0; }
.retro video { grid-area: 1 / 1; width: min(960px, 92vw); max-height: 78vh; opacity: 0; transition: opacity 1s ease; filter: sepia(.35) contrast(1.15) brightness(1.05); box-shadow: 0 0 80px rgba(255,230,180,.15); }
.retro.projette video { opacity: 1; }
.retro.projette .carton { opacity: 0; }
.retro .rayures { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,.6)), linear-gradient(90deg, transparent 0 22%, rgba(255,255,255,.12) 22% 22.15%, transparent 22.15% 71%, rgba(0,0,0,.4) 71% 71.2%, transparent 71.2%); animation: muet-rayures 1.2s steps(6) infinite, muet-flicker .1s steps(2) infinite; }
.retro-fermer { position: absolute; bottom: 24px; left: 50%; z-index: 1; transform: translateX(-50%); padding: 9px 18px; border-radius: 99px; border: 1px solid #d8cfbf; background: transparent; color: #efe6d6; font: 800 .88rem var(--body); }
.retro.fin { animation: repart .6s ease forwards; }

/* ---------- Le panneau du foyer : onglets, billets, salles ---------- */
.onglets { display: flex; gap: 4px; margin-bottom: 12px; padding: 4px; border-radius: 10px; background: rgba(0,0,0,.28); }
.onglets button { flex: 1; padding: 7px 8px; border: 0; border-radius: 7px; background: transparent; color: var(--dim); font: 800 .8rem var(--body); }
.onglets button[aria-selected="true"] { background: var(--bulb); color: var(--ink); }
/* L'album : de vrais billets de cinéma (photo du film, titre, date, numéro, talon « Admis », encoches). */
.album { display: grid; gap: 8px; max-height: 300px; overflow: auto; margin: 10px 0; padding: 4px; scrollbar-width: thin; }
.mini-billet { display: grid; grid-template-columns: 92px minmax(0, 1fr) 34px; height: 64px; padding: 0; border: 0; border-radius: 8px; overflow: hidden; text-align: left; color: var(--ink);
  background: var(--cream); background-image: repeating-linear-gradient(0deg, rgba(42,26,20,.035) 0 1px, transparent 1px 4px);
  -webkit-mask: radial-gradient(circle 7px at calc(100% - 34px) 0, transparent 98%, #000) top / 100% 51% no-repeat, radial-gradient(circle 7px at calc(100% - 34px) 100%, transparent 98%, #000) bottom / 100% 51% no-repeat;
          mask: radial-gradient(circle 7px at calc(100% - 34px) 0, transparent 98%, #000) top / 100% 51% no-repeat, radial-gradient(circle 7px at calc(100% - 34px) 100%, transparent 98%, #000) bottom / 100% 51% no-repeat; }
.mini-billet .photo { background: #2a1520 center / cover no-repeat; }
.mini-billet .infos { display: grid; align-content: center; gap: 3px; padding: 0 10px; min-width: 0; }
.mini-billet .infos b { font: 400 1.15rem/1 var(--display); letter-spacing: .03em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mini-billet .infos small { font: 700 .66rem/1.2 var(--type); color: #7a5a4c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mini-billet .talon { display: grid; place-items: center; border-left: 2px dashed rgba(42,26,20,.35); }
.mini-billet .talon span { writing-mode: vertical-rl; transform: rotate(180deg); font: 400 .8rem/1 var(--display); letter-spacing: .12em; color: #c2352f; }
.salles-liste { display: grid; gap: 6px; margin: 10px 0 4px; }
@media (prefers-reduced-motion: reduce) { .muet-fx, .retro .rayures, .cabine .bras, .panne-fx, .draperie i, .valance, .marquee, .decor-salle::after { animation: none !important; } }

/* ---------- Salles : chaque salle a sa rangée à ajouter dans Nuvio ---------- */
.salle-carte { display: grid; gap: 6px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--seat); background: rgba(255,255,255,.03); }
.salle-carte.ici { border-color: var(--bulb); background: rgba(255,207,107,.1); }
.salle-carte.ferme { opacity: .5; }
.salle-carte b { font: 800 .95rem var(--body); color: var(--cream); }
.salle-carte small { font-size: .8rem; color: var(--dim); line-height: 1.4; }
.salle-carte .actions { display: flex; gap: 6px; flex-wrap: wrap; }
.salle-carte .actions button, .salle-carte .actions a { font: 800 .76rem var(--body); padding: 6px 10px; border-radius: 99px; border: 1px solid rgba(255,207,107,.45); background: transparent; color: var(--bulb); text-decoration: none; }
.salle-carte .actions .plein { background: var(--bulb); color: var(--ink); border-color: var(--bulb); }
.salle-carte .actions button:disabled { opacity: .6; cursor: default; }
.salles-liste { max-height: 360px; overflow: auto; scrollbar-width: thin; }

/* ---------- Billets : le film du jour et sa fiche ---------- */
.album button.mini-billet { padding: 0; border: 0; cursor: pointer; text-align: left; transition: transform .2s ease; }
.album button.mini-billet:hover, .album button.mini-billet:focus-visible { transform: translateX(3px) rotate(-.6deg); }
.billet-jour { position: fixed; z-index: 84; top: calc(164px + env(safe-area-inset-top)); right: max(16px, env(safe-area-inset-right)); width: min(340px, calc(100vw - 32px));
  display: grid; grid-template-columns: 64px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 10px; border-radius: 14px; color: var(--ink);
  background: var(--cream); box-shadow: 0 18px 40px rgba(0,0,0,.55); animation: billet-arrive .6s cubic-bezier(.22,1,.36,1) both; }
.billet-jour.part { animation: billet-part .4s ease forwards; }
/* Téléphone : la régie passe sur deux lignes à cette hauteur, le billet arrive en bas pour ne rien cacher. */
@media (max-width: 760px) { .billet-jour { top: auto; bottom: calc(16px + env(safe-area-inset-bottom)); } }
@keyframes billet-arrive { from { opacity: 0; transform: translateX(40px) rotate(4deg); } }
@keyframes billet-part { to { opacity: 0; transform: translateX(40px); } }
.billet-jour .vignette { width: 64px; aspect-ratio: 2 / 3; border-radius: 6px; background: #2a1520 center / cover no-repeat; }
.billet-jour p { margin: 0; font-size: .78rem; color: #7a5a4c; font-weight: 700; }
.billet-jour b { display: block; font: 400 1.25rem/1.05 var(--display); letter-spacing: .03em; margin: 2px 0 6px; }
.billet-jour .voir { font: 800 .8rem var(--body); padding: 6px 12px; border-radius: 99px; border: 0; background: var(--ink); color: var(--cream); }
.billet-jour .fermer { align-self: start; width: 26px; height: 26px; border-radius: 50%; border: 0; background: rgba(42,26,20,.1); color: var(--ink); font: 800 1rem/1 var(--body); }
.fiche-billet { position: fixed; inset: 0; z-index: 87; display: grid; place-items: center; padding: 16px; background: rgba(5,3,4,.82); animation: panne-in .25s ease both; }
.fiche-billet .boite { position: relative; width: min(640px, 100%); max-height: calc(100vh - 32px); overflow: auto; border-radius: 18px; background: var(--velvet-2); border: 1px solid rgba(255,207,107,.3); box-shadow: 0 30px 80px rgba(0,0,0,.7); }
.fiche-billet .ecran { position: relative; aspect-ratio: 16 / 9; background: #000 center / cover no-repeat; }
.fiche-billet .ecran::after { content: ""; position: absolute; inset: 0; background: linear-gradient(transparent 50%, var(--velvet-2)); pointer-events: none; }
.fiche-billet .ecran.video::after { display: none; }
.fiche-billet iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.fiche-billet .texte { display: grid; gap: 8px; padding: 4px 22px 22px; }
.fiche-billet h2 { margin: 0; font: 400 2.2rem/1 var(--display); letter-spacing: .03em; color: #fff6e6; }
.fiche-billet .meta { font: 700 .85rem var(--body); color: var(--bulb); }
.fiche-billet .desc { margin: 0; color: #d9c8be; line-height: 1.55; }
.fiche-billet .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
.fiche-billet .actions button, .fiche-billet .actions a { font: 800 .88rem var(--body); padding: 10px 16px; border-radius: 99px; border: 1px solid rgba(255,207,107,.45); background: transparent; color: var(--bulb); text-decoration: none; }
.fiche-billet .actions .principal { background: var(--bulb); color: var(--ink); border-color: var(--bulb); }
.fiche-billet .fermer { position: absolute; top: 10px; right: 10px; z-index: 2; width: 34px; height: 34px; border-radius: 50%; border: 0; background: rgba(0,0,0,.55); color: #fff; font: 800 1.2rem/1 var(--body); }
.fiche-billet .talon { font: 700 .74rem var(--type); color: var(--dim); }

/* Hors de l'écran : animations en pause. */
.loin, .loin *, .loin::before, .loin::after { animation-play-state: paused !important; }
.vu .curtain { display: none; }
.vu .marquee { animation: none; }
.vu .marquee h1 { animation: flicker 7s infinite; }
@media (prefers-reduced-motion: reduce) {
  .curtain, .torch, .beam canvas, .iris, .saison i, .secret { display: none; }
  .marquee, .marquee::after, .marquee h1, .beam, .ampoules i, .tete, .tete *, .cabine *, .saison, .draperie { animation: none !important; }
  /* Fenêtres et billets apparaissent et partent sans glisser ni clignoter (ils sont retirés par minuterie). */
  .billet-jour, .billet-jour.part, .fiche-billet, .retro, .retro.fin, #trophees.gagne { animation: none !important; }
  .ampoules .vives { display: none; }
  .ampoules .base i.grillee { background: #4e3420; box-shadow: inset 0 0 2px #000; }
  .generique { height: auto; -webkit-mask: none; mask: none; }
  .generique .defile { animation: none; }
  .generique dl + dl { display: none; }
}
/* Les draperies n'ont de place qu'au-delà de 1260 px ; en dessous, leur bas qui déborde ferait glisser la page de côté. */
@media (max-width: 1260px) { .draperie { display: none; } }
/* Doigt : pas de zoom au double appui (on tape vite sur les flèches), et des plaques assez hautes pour le pouce. */
a, button, label, summary, input, select { touch-action: manipulation; }
@media (hover: none), (pointer: coarse) {
  .salle { min-height: 40px; align-content: center; }
  .regie button { min-height: 44px; min-width: 44px; justify-content: center; }
}
`;

/** Tout ce qui entoure la page : rideau, iris, lampe, draperies, décor de saison, et le foyer. */
export function stageTop({ here, origin }) {
  const cur = (k) => (k === here ? ' aria-current="page"' : "");
  return `<div class="curtain" aria-hidden="true"><i></i><i></i><span class="trois-coups"><b>Toc…</b><b>toc…</b><b>toc</b></span></div>
<div class="iris" aria-hidden="true"></div>
<div class="torch" aria-hidden="true"><i></i></div>
<div class="draperie g" aria-hidden="true"><i class="bas"></i><i class="haut"></i></div><div class="draperie d" aria-hidden="true"><i class="bas"></i><i class="haut"></i></div>
<div class="saison" aria-hidden="true"></div>
<div class="toiles" aria-hidden="true"></div>
<div class="decor-salle" aria-hidden="true"></div>
<div class="foyer" data-origin="${origin}">
  <nav class="salles" aria-label="Les salles">
    <a class="salle hall-lien" href="${origin}/"${cur("hall")}><b>Hall</b><span>Choisir sa salle</span></a>
    <a class="salle" href="${origin}/guide"${cur("guide")}><b>Salle 1</b><span>Le guide de A à Z</span></a>
    <a class="salle" href="${origin}/configure" data-programmation${cur("programmation")}><b>Salle 2</b><span>Ta programmation</span></a>
  </nav>
  <div class="regie">
    <button type="button" id="trophees" aria-expanded="false" aria-controls="trophees-panel" aria-label="Secrets de la salle trouvés"><svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M5 2h10v2h3v2.5A3.5 3.5 0 0 1 14.6 10 5 5 0 0 1 11 12.9V15h3v3H6v-3h3v-2.1A5 5 0 0 1 5.4 10 3.5 3.5 0 0 1 2 6.5V4h3V2zm0 4H4v.5c0 .8.5 1.5 1.2 1.8A5 5 0 0 1 5 7V6zm10 0v1c0 .4 0 .9-.2 1.3.7-.3 1.2-1 1.2-1.8V6h-1z"/></svg><span id="trophees-n">0 / 0</span></button>
    <button type="button" id="lumieres" aria-pressed="false" aria-label="Éteindre les lumières de la salle"><i class="levier" aria-hidden="true"></i><span class="txt" aria-hidden="true">Lumières</span></button>
    <button type="button" id="son" aria-pressed="false" aria-label="Son de la salle"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7.5h3l4.5-3.5v12L6 12.5H3z" fill="currentColor"/><path class="ondes" d="M13.5 7.5a3.5 3.5 0 0 1 0 5M15.8 5.2a6.6 6.6 0 0 1 0 9.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><span class="txt" aria-hidden="true">Son</span></button>
  </div>
  <div class="trophees" id="trophees-panel" role="dialog" aria-label="Secrets de la salle" hidden></div>
</div>`;
}

// Messages cachés : placés sur le velours, de part et d'autre du contenu (body en position relative).
const SECRETS = {
  hall: [
    ["top: 220px; left: max(12px, calc(50% - 700px)); --r: -5deg", "↑ ↑ ↓ ↓ ← → ← → B A.<br>Les anciens comprendront.", "lampe"],
    ["top: 340px; right: max(12px, calc(50% - 700px)); --r: 4deg", "Tape au clavier l'année du tout premier film. Les frères Lumière t'attendent.", "lampe"],
    ["bottom: 70px; left: max(12px, calc(50% - 690px)); --r: -3deg", "Même dans le hall, tu fouilles jusqu'au fond ? Respect.", "fond"],
  ],
  programmation: [
    ["top: 210px; left: max(12px, calc(50% - 610px)); --r: -6deg", "Psst… tape « popcorn » au clavier.", "lampe"],
    ["top: 300px; right: max(12px, calc(50% - 610px)); --r: 5deg", "Une ampoule de l'enseigne est fatiguée. Clique dessus.", "lampe"],
    ["bottom: 70px; left: max(12px, calc(50% - 570px)); --r: -3deg", "Je savais que tu fouillerais jusqu'au bout. C'est bien fait, hein ?", "fond"],
  ],
  guide: [
    ["top: 210px; left: max(12px, calc(50% - 600px)); --r: -5deg", "Les lettres de l'enseigne se décrochent. Essaie.", "lampe"],
    ["top: 330px; right: max(12px, calc(50% - 600px)); --r: 4deg", "Ici, on ne parle pas pendant le film.", "lampe"],
    ["bottom: 70px; left: max(12px, calc(50% - 560px)); --r: 3deg", "Encore toi ? Avoue, tu cherches partout haha.", "fond"],
    ["bottom: 70px; right: max(12px, calc(50% - 560px)); --r: -4deg", "Touches T et G du clavier : T pour revenir, G pour l'étape suivante.<br>(tg on entend pas le film)", "lampe"],
  ],
};
export const secretsHTML = (here) => (SECRETS[here] || []).map(([pos, text, id]) => `<p class="secret" aria-hidden="true" data-secret="${id}" style="${pos}">${text}</p>`).join("");

// Le faisceau : à placer dans un bloc en position relative (l'en-tête de la page).
export const BEAM_HTML = `<div class="beam" aria-hidden="true"><canvas></canvas></div>`;

export const SEATS_HTML = `<div class="seats" aria-hidden="true"></div>`;

const CREDITS = [
  ["Dans le rôle du lecteur", "Nuvio"],
  ["Fiches, affiches et bandes-annonces", "TMDB"],
  ["Lettrage des affiches", "Inter"],
  ["Sources", "Lumio, StreamFusion, Torrentio, WAStream"],
  ["Sous-titres", "OpenSubtitles"],
  ["Lettrage de l'enseigne", "Bebas Neue"],
  ["Pop-corn", "Toi"],
  ["Avec la participation de", "TMDB<small>Ce site utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB.</small>"],
];
const creditList = (hidden) => `<dl${hidden ? ' aria-hidden="true"' : ""}>${CREDITS.map(([r, n]) => `<dt>${r}</dt><dd>${n}</dd>`).join("")}</dl>`;
export const CREDITS_HTML = `<div class="generique" role="region" aria-label="Générique"><div class="defile">${creditList(false)}${creditList(true)}</div></div>
<div class="applaudimetre"><button type="button" class="applaudir">Applaudir</button><div class="jauge" aria-hidden="true"><i></i></div><p class="record" aria-live="polite"></p></div>`;

export const STAGE_JS = String.raw`
(() => {
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  // ---------- Son de la salle (coupé par défaut : on l'allume avec le bouton « Son », le choix est gardé) ----------
  // Uniquement des notes douces, sans bruit ni boucle : un « tic » de bois, un carillon de caisse,
  // des « plop » de pop-corn, une petite fanfare. Tout passe par un volume général bas et un compresseur.
  const sfx = window.sfx = (() => {
    let ctx = null, out = null, on = store.get("son") === "1";
    const ac = () => {
      if (!ctx) {
        const A = window.AudioContext || window.webkitAudioContext; if (!A) return null;
        ctx = new A();
        const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -24; comp.ratio.value = 4;
        const soft = ctx.createBiquadFilter(); soft.type = "lowpass"; soft.frequency.value = 5000;
        out = ctx.createGain(); out.gain.value = .55;
        out.connect(soft); soft.connect(comp); comp.connect(ctx.destination);
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    };
    // Une note : attaque douce, extinction naturelle ; « to » fait glisser la hauteur (plop).
    const note = (freq, o) => {
      if (!on) return; const c = ac(); if (!c) return;
      o = o || {};
      const t = c.currentTime + (o.when || 0), dur = o.dur || .3, gain = o.gain || .08;
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = o.type || "sine";
      osc.frequency.setValueAtTime(freq, t);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || dur * .6));
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + (o.attack || .006));
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + dur + .05);
    };
    // Une cloche : la note et deux harmoniques plus discrètes.
    const bell = (freq, when, gain) => {
      note(freq, { when, dur: .9, gain: gain || .06 });
      note(freq * 2, { when, dur: .5, gain: (gain || .06) * .35 });
      note(freq * 3, { when, dur: .25, gain: (gain || .06) * .12 });
    };
    return {
      get on() { return on; },
      set(v) { on = v; store.set("son", v ? "1" : "0"); },
      wake() {},
      click() { note(1200, { to: 700, dur: .06, gain: .05, type: "triangle" }); },
      punch() { bell(1318.5, 0, .05); bell(1975.5, .09, .04); },
      pops(n) { for (let i = 0; i < (n || 6); i++) note(700 + Math.random() * 600, { to: 220, glide: .05, dur: .08, gain: .045, when: i * .09 + Math.random() * .06 }); },
      clink() { bell(2093, 0, .035); },
      whoosh() { note(520, { to: 260, dur: .45, gain: .03, attack: .08 }); },
      clap() { note(300 + Math.random() * 80, { to: 140, dur: .06, gain: .05, type: "triangle" }); },
      tick(when) { note(1500, { to: 900, dur: .04, gain: .03, type: "triangle", when: when || 0 }); },
      klaxon() { note(392, { dur: .16, gain: .045, type: "square" }); note(330, { dur: .2, gain: .045, type: "square", when: .18 }); },
      piano() { [523.25, 659.25, 783.99, 1046.5, 783.99, 659.25, 698.46, 880].forEach((f, i) => note(f, { dur: .5, gain: .05, type: "triangle", when: i * .13 })); },
      ovni() { note(300, { to: 1400, dur: 1.1, gain: .03, type: "sine", attack: .1 }); note(310, { to: 1500, dur: 1.1, gain: .02, type: "sine", attack: .1, when: .05 }); },
      couic() { note(2600, { to: 1700, dur: .09, gain: .035, type: "triangle" }); note(2900, { to: 1900, dur: .08, gain: .03, type: "triangle", when: .11 }); },
      applause() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(f, i * .11, .045)); },
    };
  })();

  // ---------- Le foyer : interrupteur et son ----------
  const lights = document.getElementById("lumieres"), son = document.getElementById("son");
  if (lights) {
    const sync = () => lights.setAttribute("aria-pressed", String(root.classList.contains("noir")));
    sync();
    let coups = [];
    lights.addEventListener("click", () => {
      const off = !root.classList.contains("noir"); root.classList.toggle("noir", off); store.set("noir", off ? "1" : "0"); sync(); sfx.click();
      // Cinq fois en moins de 2,5 secondes : les plombs sautent.
      const now = Date.now(); coups = coups.filter((t) => now - t < 2500); coups.push(now);
      if (coups.length >= 5) { coups = []; panne(); }
    });
  }
  if (son) {
    son.setAttribute("aria-pressed", String(sfx.on));
    son.addEventListener("click", () => { sfx.set(!sfx.on); son.setAttribute("aria-pressed", String(sfx.on)); sfx.click(); });
  }
  // Les liens vers la programmation (salle 2) la retrouvent telle qu'on l'avait laissée, sans la clé Gemini :
  // l'adresse gardée la porte (le guide en tire le lien d'addon), la salle 2 la reprend sur l'appareil (liens.js).
  ${sansCle}
  try {
    const s1 = sessionStorage.getItem("programmation");
    // (une ancienne adresse « / » mène désormais au guide : on l'ignore)
    if (s1 && new URL(s1).origin === location.origin && new URL(s1).pathname !== "/") { const lien = sansCle(s1); document.querySelectorAll("a[data-programmation]").forEach((a) => { a.href = lien; }); }
  } catch (e) {}

  // ---------- Rideau : retiré une fois relevé ----------
  const curtain = document.querySelector(".curtain");
  if (curtain) {
    if (calm || root.classList.contains("vu")) curtain.remove();
    else {
      // Retiré quand le rideau de droite a fini de se relever (pas à la fin des trois coups).
      curtain.addEventListener("animationend", (e) => { if (e.animationName === "gather-r") curtain.remove(); });
      document.addEventListener("click", () => curtain.remove(), { once: true });
    }
  }

  // ---------- Iris : on change de salle en fermant l'image sur un cercle ----------
  const iris = document.querySelector(".iris");
  if (iris) {
    if (root.classList.contains("iris-in")) iris.addEventListener("animationend", () => root.classList.remove("iris-in"), { once: true });
    document.addEventListener("click", (e) => {
      const a = e.target.closest && e.target.closest("a[href]");
      if (calm || !a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target || a.hasAttribute("download")) return;
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin || u.pathname === location.pathname || u.pathname === "/tv") return;
      e.preventDefault();
      iris.style.setProperty("--ix", (e.clientX || innerWidth / 2) + "px");
      iris.style.setProperty("--iy", (e.clientY || innerHeight / 2) + "px");
      root.classList.remove("iris-in"); iris.classList.add("closing"); sfx.whoosh();
      try { sessionStorage.setItem("iris", "1"); } catch (e2) {}
      setTimeout(() => { location.href = u.href; }, 560);
    });
    addEventListener("pageshow", (e) => { if (e.persisted) iris.classList.remove("closing"); });
  }

  // ---------- Messages, pop-corn ----------
  const toastEl = document.createElement("div");
  toastEl.className = "toast"; toastEl.setAttribute("role", "status"); document.body.append(toastEl);
  let toastT = 0;
  // toast(message, true) : une erreur, en rouge, annoncée tout de suite et affichée plus longtemps.
  window.toast = (msg, erreur) => {
    toastEl.textContent = msg; toastEl.classList.toggle("erreur", !!erreur); toastEl.setAttribute("role", erreur ? "alert" : "status");
    toastEl.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("on"), erreur ? 6000 : 3400);
  };
  const kernel = (x, y) => { const k = document.createElement("i"); k.className = "kernel"; k.style.left = x + "px"; k.style.top = y + "px"; document.body.append(k); return k; };

  // Quelques grains sautent du bouton qu'on vient d'utiliser.
  window.popcorn = (from) => {
    sfx.pops(5);
    if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
    if (calm || !from || !document.body.animate) return;
    const r = from.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (let i = 0; i < 9; i++) {
      const k = kernel(cx, cy);
      const a = -Math.PI / 2 + (Math.random() - .5) * 2.4, v = 55 + Math.random() * 75;
      const dx = Math.cos(a) * v, dy = Math.sin(a) * v, rot = (Math.random() - .5) * 600, s = .95 + Math.random() * .6;
      const at = (x, y, deg, sc) => "translate(calc(-50% + " + x + "px), calc(-50% + " + y + "px)) rotate(" + deg + "deg) scale(" + sc + ")";
      k.animate([
        { transform: at(0, 0, 0, .2), opacity: 1 },
        { transform: at(dx * .7, dy, rot * .5, s), opacity: 1, offset: .42 },
        { transform: at(dx * 1.1, dy * .2 + 110, rot, s), opacity: 0 },
      ], { duration: 950 + Math.random() * 350, easing: "cubic-bezier(.2,.6,.45,1)" }).onfinish = () => k.remove();
    }
  };
  // Il pleut du pop-corn sur toute la salle.
  window.popcornRain = () => {
    sfx.pops(16);
    if (calm || !document.body.animate) return;
    for (let i = 0; i < 48; i++) {
      const k = kernel(Math.random() * innerWidth, -20);
      const rot = (Math.random() - .5) * 900, s = .9 + Math.random() * .8, drift = (Math.random() - .5) * 140;
      k.animate([
        { transform: "translate(-50%, 0) rotate(0deg) scale(" + s + ")" },
        { transform: "translate(calc(-50% + " + drift + "px), " + (innerHeight + 60) + "px) rotate(" + rot + "deg) scale(" + s + ")" },
      ], { duration: 1800 + Math.random() * 1600, delay: Math.random() * 1400, easing: "cubic-bezier(.4,0,.8,.6)", fill: "backwards" }).onfinish = () => k.remove();
    }
  };
  // Les spectateurs applaudissent.
  window.bravo = () => {
    sfx.applause();
    document.querySelectorAll(".seats").forEach((r) => { r.classList.remove("bravo"); void r.offsetWidth; r.classList.add("bravo"); setTimeout(() => r.classList.remove("bravo"), 1900); });
  };

  // ---------- Les secrets de la salle : trouvés un à un, gardés sur l'appareil ----------
  const LISTE = [
    ["fond", "Le message tout au fond, à la lampe", "Le meilleur est caché tout au fond."],
    ["lampe", "Un autre message gravé dans le velours", "Le velours cache plus d'un mot."],
    ["ampoule", "Changer l'ampoule fatiguée", "Une ampoule de l'enseigne a besoin d'aide."],
    ["lettre", "Décrocher une lettre de l'enseigne", "L'enseigne est mal fixée."],
    ["popcorn", "Taper « popcorn » au clavier", "Un mot gourmand, au clavier."],
    ["konami", "Le code Konami", "↑ ↑ ↓ ↓… les anciens savent."],
    ["chut", "Déranger un spectateur", "Les fauteuils ne sont pas tous vides."],
    ["generique", "Rester jusqu'à la fin du générique", "Les vrais cinéphiles restent jusqu'au bout."],
    ["retour", "Revenir dans la salle", "Reviens une autre fois…"],
    ["panne", "Faire sauter les plombs", "L'interrupteur n'aime pas qu'on s'acharne."],
    ["brule", "Laisser brûler la pellicule", "Ne touche plus à rien pendant un long moment…"],
    ["projectionniste", "Saluer le projectionniste", "Quelqu'un travaille là-haut, dans la cabine."],
    ["fauteuil", "Choisir son fauteuil", "Il reste des places libres dans la salle."],
    ["applaudimetre", "Faire exploser l'applaudimètre", "Le générique mérite une ovation."],
    ["1895", "La séance de 1895", "Une année, au clavier : celle du premier film."],
    ["esquimau", "Acheter un esquimau à l'entracte", "À l'entracte du guide, quelqu'un vend des glaces."],
    ["ouvreuse", "Saluer l'ouvreuse", "Dans le guide, quelqu'un t'éclaire le chemin."],
    ["cinephile", "Deviner le film du jour", "Dans le hall, un film attend chaque jour d'être deviné."],
  ];
  if (root.dataset.saison === "halloween") LISTE.push(["colonie", "Réveiller la colonie de chauves-souris", "Elles volent au-dessus de toi."]);
  let trouves = [];
  try { trouves = JSON.parse(store.get("secrets") || "[]"); } catch (e) {}
  // Une valeur abîmée (autre version, extension) ne doit pas casser toute la salle.
  if (!Array.isArray(trouves)) trouves = [];
  trouves = trouves.filter((x) => typeof x === "string");
  const tBtn = document.getElementById("trophees"), tPanel = document.getElementById("trophees-panel");
  // Les salles (thèmes) se débloquent avec les secrets.
  // Chaque salle change le décor ET apporte une rangée à ajouter dans Nuvio (rangée sur mesure).
  const THEMES = [
    ["classique", "Classique", "Velours rouge et ampoules dorées.", 0,
      { n: "Les grands classiques", t: 0, genres: [], y: [1960, 1999], v: 7.5, s: 1, quoi: "les films cultes de 1960 à 1999, notés 7,5 et plus" }],
    ["muet", "Film muet", "Années 1920 : sépia, cartons à l'ancienne et pellicule qui défile.", 0,
      { n: "Cinéma muet", t: 0, genres: [], y: [1895, 1929], v: 0, s: 1, quoi: "Chaplin, Keaton, Murnau : les films muets les mieux notés" }],
    ["artdeco", "Art déco", "Années 1930 : bleu canard, or, soleil de rayons et lettres Limelight.", 4,
      { n: "L'âge d'or d'Hollywood", t: 0, genres: [], y: [1930, 1959], v: 7, s: 1, quoi: "les films de 1930 à 1959, notés 7 et plus" }],
    ["drivein", "Drive-in", "Années 1950 : enseigne en néon, lune, étoiles filantes et voitures garées.", 8,
      { n: "Séance drive-in", t: 0, genres: ["Horreur", "Science-fiction"], y: [1950, 1989], v: 0, s: 0, quoi: "horreur et science-fiction des années 50 à 80" }],
    ["imax", "IMAX", "Aujourd'hui : verre, bande LED et lueur d'écran géant.", 12,
      { n: "Grand spectacle", t: 0, genres: ["Action", "Aventure", "Science-fiction"], y: [2010, 0], v: 7, s: 0, quoi: "les gros films d'action et de science-fiction depuis 2010, notés 7 et plus" }],
  ];
  // Sur la page de personnalisation, la rangée s'ajoute directement ; depuis le guide, on y va.
  const ajouterRangeeSalle = (id) => {
    const th = THEMES.find((x) => x[0] === id); if (!th) return;
    const r = th[4];
    if (window.ajouterRangee) {
      const res = window.ajouterRangee(r);
      if (res === "ok") { toast("Rangée « " + r.n + " » ajoutée ! " + (window.lienFixe && window.lienFixe() ? "Ton lien fixe la reçoit : « Actualiser les addons » dans Nuvio." : "Copie ton nouveau lien sur le billet.")); sfx.punch(); }
      else if (res === "deja") toast("La rangée « " + r.n + " » est déjà dans ta programmation.");
      else toast("Tu as déjà 12 rangées sur mesure : supprime-en une d'abord.");
      drawSecrets();
    }
  };
  let album = [];
  try { album = JSON.parse(store.get("billets") || "[]"); } catch (e) {}
  if (!Array.isArray(album)) album = [];
  album = album.filter((b) => b && typeof b === "object" && b.id);
  let onglet = "secrets";
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const nTrouves = () => LISTE.filter(([id]) => trouves.includes(id)).length;
  const muetFx = () => {
    let m = document.querySelector(".muet-fx");
    if (root.dataset.theme === "muet" && !calm) { if (!m) { m = mk("div", "muet-fx"); m.setAttribute("aria-hidden", "true"); document.body.append(m); } }
    else if (m) m.remove();
  };
  const choisirSalle = (id) => {
    if (id === "classique") delete root.dataset.theme; else root.dataset.theme = id;
    store.set("theme", id); muetFx(); sfx.click(); drawSecrets();
  };
  const drawSecrets = () => {
    if (!tBtn) return;
    const n = nTrouves(), tout = n === LISTE.length;
    document.getElementById("trophees-n").textContent = n + " / " + LISTE.length;
    tBtn.setAttribute("aria-label", "Secrets de la salle : " + n + " trouvés sur " + LISTE.length);
    tBtn.classList.toggle("complet", tout);
    // On garde la position de défilement de la liste (salles, billets) quand on redessine le panneau.
    const avant = tPanel.querySelector(".salles-liste, .album"), defil = avant ? avant.scrollTop : 0, memeOnglet = drawSecrets.onglet === onglet;
    drawSecrets.onglet = onglet;
    tPanel.innerHTML = "";
    const tabs = mk("div", "onglets"); tabs.setAttribute("role", "tablist");
    [["secrets", "Secrets"], ["billets", "Billets"], ["salles", "Salles"]].forEach(([id, lab]) => {
      const b = mk("button", null, lab); b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(onglet === id));
      b.addEventListener("click", (e) => { e.stopPropagation(); onglet = id; drawSecrets(); const sel = tPanel.querySelector('[aria-selected="true"]'); if (sel) sel.focus(); });
      tabs.append(b);
    });
    tPanel.append(tabs);
    if (onglet === "secrets") {
      const bar = mk("div", "barre"), fill = mk("i"); fill.style.transform = "scaleX(" + (n / LISTE.length).toFixed(3) + ")"; bar.append(fill);
      const ul = mk("ul");
      LISTE.forEach(([id, label, indice]) => { const ok = trouves.includes(id); ul.append(mk("li", ok ? "" : "cache", ok ? label : indice)); });
      tPanel.append(mk("h2", null, "Secrets de la salle"), bar, ul, mk("p", null, tout ? "Tous trouvés. Tu peux aller dormir maintenant." : "Il en reste " + (LISTE.length - n) + ". Bonne chasse !"));
    } else if (onglet === "billets") {
      tPanel.append(mk("h2", null, "Billets de collection"), mk("p", null, album.length ? album.length + " billet" + (album.length > 1 ? "s" : "") + ", un par visite." : "Ton premier billet arrive dans quelques secondes."));
      const grid = mk("div", "album");
      album.forEach((b) => {
        const t = mk("button", "mini-billet"); t.type = "button";
        t.setAttribute("aria-label", "Voir la fiche : " + b.n);
        const photo = mk("i", "photo"); photo.style.backgroundImage = "url('" + String(b.img).replace(/'/g, "%27") + "')";
        let h = 7; for (const ch of String(b.id) + b.d) h = (h * 131 + ch.charCodeAt(0)) % 99991;
        const infos = mk("span", "infos");
        infos.append(mk("b", null, b.n), mk("small", null, new Date(b.d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) + "  ·  N° " + String(h).padStart(5, "0")));
        const talon = mk("span", "talon"); talon.append(mk("span", null, "Admis"));
        t.append(photo, infos, talon); grid.append(t);
        t.addEventListener("click", (e) => { e.stopPropagation(); ouvrirBillet(b); });
      });
      if (album.length) tPanel.append(grid, mk("p", null, "Clique sur un billet : bande-annonce, résumé, et ajout à la bibliothèque."));
    } else {
      const cur = root.dataset.theme || "classique", list = mk("div", "salles-liste");
      const origine = ((document.querySelector(".foyer") || {}).dataset || {}).origin || "";
      THEMES.forEach(([id, nom, desc, besoin, r]) => {
        const ok = n >= besoin, carte = mk("div", "salle-carte" + (cur === id ? " ici" : "") + (ok ? "" : " ferme"));
        carte.append(mk("b", null, nom + (cur === id ? " (tu y es)" : "")));
        carte.append(mk("small", null, ok ? desc + " Sa rangée : « " + r.n + " », " + r.quoi + "." : "Encore " + (besoin - n) + " secret" + (besoin - n > 1 ? "s" : "") + " pour ouvrir cette salle et sa rangée « " + r.n + " »."));
        if (ok) {
          const act = mk("div", "actions");
          if (cur !== id) { const entrer = mk("button", null, "Entrer"); entrer.type = "button"; entrer.addEventListener("click", (e) => { e.stopPropagation(); choisirSalle(id); }); act.append(entrer); }
          if (window.ajouterRangee) {
            const deja = window.rangeePresente && window.rangeePresente(r.n);
            const add = mk("button", "plein", deja ? "✓ Rangée dans ta programmation" : "Ajouter la rangée à Nuvio"); add.type = "button"; add.disabled = !!deja;
            add.addEventListener("click", (e) => { e.stopPropagation(); ajouterRangeeSalle(id); });
            act.append(add);
          } else if (origine) {
            const lien = mk("a", "plein", "Ajouter la rangée (salle 2)"); lien.href = origine + "/configure#rangee-" + id; act.append(lien);
          }
          carte.append(act);
        }
        list.append(carte);
      });
      tPanel.append(mk("h2", null, "Changer de salle"), list, mk("p", null, "Chaque salle débloquée (avec les secrets) change le décor et t'offre une rangée pour ton accueil Nuvio."));
    }
    const apres = tPanel.querySelector(".salles-liste, .album");
    if (apres && memeOnglet) apres.scrollTop = defil;
  };
  const secret = window.secret = (id) => {
    if (trouves.includes(id) || !LISTE.some(([x]) => x === id)) return;
    trouves.push(id); store.set("secrets", JSON.stringify(trouves)); drawSecrets();
    const n = LISTE.filter(([x]) => trouves.includes(x)).length, label = LISTE.find(([x]) => x === id)[1];
    if (tBtn) { tBtn.classList.remove("gagne"); void tBtn.offsetWidth; tBtn.classList.add("gagne"); }
    const say = () => {
      if (n === LISTE.length) { toast("Tous les secrets trouvés ! Respect."); popcornRain(); bravo(); }
      else { toast("Secret trouvé : " + label + " (" + n + " / " + LISTE.length + ")"); sfx.punch(); }
    };
    if (toastEl.classList.contains("on")) setTimeout(say, 2600); else say();
  };
  if (tBtn) {
    drawSecrets();
    const open = (on) => { tPanel.hidden = !on; tBtn.setAttribute("aria-expanded", String(on)); };
    tBtn.addEventListener("click", (e) => { e.stopPropagation(); open(tPanel.hidden); sfx.click(); });
    document.addEventListener("click", (e) => { if (!tPanel.hidden && !tPanel.contains(e.target)) open(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !tPanel.hidden) { open(false); tBtn.focus(); } });
  }
  muetFx();
  // Un billet de collection par visite : un film à l'affiche, gardé dans l'album.
  try {
    const origin = (document.querySelector(".foyer") || {}).dataset;
    if (origin && origin.origin && !sessionStorage.getItem("billet")) {
      sessionStorage.setItem("billet", "1");
      fetch(origin.origin + "/catalog/movie/accueil-top10.json").then((r) => r.json()).then((d) => {
        // Seulement un film avec son titre en français (pas d'écriture chinoise, cyrillique…) : sans VF, pas de billet.
        const metas = (d.metas || []).filter((m) => m.background && m.name && !/[\u0370-\u1CFF\u2E80-\uD7FF\uF900-\uFAFF]/.test(m.name) && !album.some((b) => b.id === m.id));
        if (!metas.length) return;
        const m = metas[Math.floor(Math.random() * metas.length)];
        const b = { id: m.id, type: m.type || "movie", n: m.name, img: m.background.replace(/[/](original|w1920|w1280)[/]/, "/w300/"), bg: m.background.replace(/[/](original|w1920|w1280)[/]/, "/w780/"), poster: m.poster, desc: m.description || "",
          an: m.releaseInfo || "", genres: (m.genres || []).slice(0, 3), note: m.imdbRating || "", d: new Date().toISOString().slice(0, 10) };
        album.unshift(b);
        album = album.slice(0, 60); store.set("billets", JSON.stringify(album)); drawSecrets();
        setTimeout(() => billetDuJour(b), 4500);
      }).catch(() => {});
    }
  } catch (e) {}
  // ---------- Le billet du jour : une carte à l'arrivée, puis sa fiche ----------
  const lireListe = () => { try { return JSON.parse(store.get("ma-liste") || "[]"); } catch (e) { return []; } };
  function billetDuJour(b) {
    const c = mk("div", "billet-jour"); c.setAttribute("role", "status");
    const v = mk("i", "vignette"); if (b.poster) v.style.backgroundImage = "url('" + String(b.poster).replace(/'/g, "%27") + "')";
    const mil = mk("div"); mil.append(mk("p", null, "Ton billet du jour"), mk("b", null, b.n));
    const voir = mk("button", "voir", "Voir la fiche"); voir.type = "button"; mil.append(voir);
    const x = mk("button", "fermer", "×"); x.type = "button"; x.setAttribute("aria-label", "Fermer");
    c.append(v, mil, x); document.body.append(c);
    const part = () => { c.classList.add("part"); setTimeout(() => c.remove(), 400); };
    voir.addEventListener("click", () => { part(); ouvrirBillet(b); });
    x.addEventListener("click", part);
    setTimeout(() => { if (c.isConnected) part(); }, 15000);
  }
  function ouvrirBillet(b) {
    document.querySelectorAll(".fiche-billet").forEach((x) => x.remove());
    const origine = ((document.querySelector(".foyer") || {}).dataset || {}).origin || "";
    const ov = mk("div", "fiche-billet"); ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", b.n);
    const boite = mk("div", "boite"), ecran = mk("div", "ecran");
    if (b.bg || b.img) ecran.style.backgroundImage = "url('" + String(b.bg || b.img).replace(/'/g, "%27") + "')";
    const texte = mk("div", "texte");
    texte.append(mk("h2", null, b.n), mk("span", "meta", [b.an, (b.genres || []).join(", "), b.note ? "★ " + b.note : ""].filter(Boolean).join("  ·  ")));
    texte.append(mk("p", "desc", b.desc || "Pas encore de résumé en français pour ce film."));
    const act = mk("div", "actions");
    const ba = mk("button", "principal", "▶ Bande-annonce"); ba.type = "button";
    const liste = mk("button", null, ""); liste.type = "button";
    const dans = () => lireListe().some((x) => x.id === b.id);
    const dessine = () => { liste.textContent = dans() ? "Retirer de la bibliothèque" : "+ Ajouter à la bibliothèque"; };
    dessine(); act.append(ba, liste);
    if (/^tt\d+$/.test(b.id)) { const imdb = mk("a", null, "Fiche IMDb ↗"); imdb.href = "https://www.imdb.com/title/" + b.id + "/"; imdb.target = "_blank"; imdb.rel = "noopener"; act.append(imdb); }
    texte.append(act, mk("span", "talon", "Billet du " + new Date(b.d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) + ". Ta bibliothèque s'affiche dans l'aperçu de la salle 2, onglet « Bibliothèque »."));
    const fermer = mk("button", "fermer", "×"); fermer.type = "button"; fermer.setAttribute("aria-label", "Fermer la fiche");
    boite.append(fermer, ecran, texte); ov.append(boite); document.body.append(ov); fermer.focus();
    const close = () => ov.remove();
    fermer.addEventListener("click", close);
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    ov.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });
    liste.addEventListener("click", () => {
      let l = lireListe();
      if (dans()) l = l.filter((x) => x.id !== b.id);
      else { l.unshift({ id: b.id, type: b.type, name: b.n, poster: b.poster, background: b.bg ? b.bg.replace("/w780/", "/w1920/") : "", description: b.desc, releaseInfo: b.an, genres: b.genres, imdbRating: b.note }); popcorn(liste); }
      store.set("ma-liste", JSON.stringify(l.slice(0, 50))); dessine(); sfx.click();
      dispatchEvent(new Event("ma-liste"));
    });
    ba.addEventListener("click", () => {
      ba.disabled = true; ba.textContent = "Chargement…";
      fetch(origine + "/trailer/" + (b.type === "series" ? "series" : "movie") + "/" + encodeURIComponent(b.id) + ".json").then((r) => r.json()).then((d) => {
        const key = d && /^[A-Za-z0-9_-]{6,20}$/.test(d.key || "") ? d.key : null;
        if (!key) { ba.textContent = "Pas de bande-annonce"; return; }
        const f = document.createElement("iframe");
        // Lecteur YouTube normal : youtube-nocookie demande souvent de se connecter (« pas un robot »).
        f.src = "https://www.youtube.com/embed/" + key + "?autoplay=1&playsinline=1&rel=0&modestbranding=1&origin=" + encodeURIComponent(location.origin);
        f.title = "Bande-annonce"; f.allow = "autoplay; encrypted-media; picture-in-picture"; f.allowFullscreen = true; f.referrerPolicy = "strict-origin-when-cross-origin";
        ecran.classList.add("video"); ecran.append(f); ba.textContent = "▶ En cours";
      }).catch(() => { ba.textContent = "Pas de bande-annonce"; });
    });
  }
  // Arrivée avec « #rangee-xxx » (depuis le guide) : on ajoute la rangée de la salle.
  { const h = window.hashDepart || location.hash; if (h && h.indexOf("#rangee-") === 0 && window.ajouterRangee) setTimeout(() => ajouterRangeeSalle(h.slice(8)), 600); }

  // L'heure de la séance : rayons du matin, séance de minuit.
  const heure = { matin: "Séance du matin", minuit: "Séance de minuit" }[root.dataset.heure];
  if (heure) document.querySelectorAll(".marquee small").forEach((x) => { x.textContent = heure; });
  if (root.dataset.heure === "matin") { const h = mk("div", "heure-fx"); h.setAttribute("aria-hidden", "true"); document.body.prepend(h); }

  // ---------- Panne de courant : tout s'éteint sauf les sorties de secours ----------
  function panne() {
    if (document.querySelector(".panne-fx")) return;
    const ov = mk("div", "panne-fx"); ov.setAttribute("aria-hidden", "true");
    ov.append(mk("span", "exit g", "Sortie"), mk("span", "exit d", "Sortie"));
    if (window.lampe) { ov.style.setProperty("--tx", window.lampe.x.toFixed(1) + "px"); ov.style.setProperty("--ty", window.lampe.y.toFixed(1) + "px"); }
    document.body.append(ov); sfx.click(); secret("panne");
    toast("Panne de courant ! Le projectionniste répare…");
    setTimeout(() => { ov.classList.add("retour"); setTimeout(() => ov.remove(), 1500); }, 9000);
  }

  // ---------- Séance rétro : le code 1895, le premier film des frères Lumière ----------
  function seance1895() {
    if (document.querySelector(".retro")) return;
    secret("1895"); sfx.whoosh();
    const ov = mk("div", "retro"); ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "Séance rétro : La Sortie de l’usine Lumière à Lyon, 1895");
    const carton = mk("div", "carton");
    carton.append(mk("p", null, "Les frères Lumière présentent"), mk("b", null, "La Sortie de l’usine Lumière à Lyon"), mk("p", null, "1895 · film muet, domaine public"));
    const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto";
    v.src = "https://upload.wikimedia.org/wikipedia/commons/4/45/Auguste_%26_Louis_Lumi%C3%A8re-_Sortie_des_Usines_Lumi%C3%A8re_%C3%A0_Lyon_%281895%29.webm";
    const fermer = mk("button", "retro-fermer", "Quitter la séance"); fermer.type = "button";
    ov.append(carton, v, mk("i", "rayures"), fermer);
    document.body.append(ov); fermer.focus();
    const close = () => { ov.classList.add("fin"); setTimeout(() => ov.remove(), 600); };
    fermer.addEventListener("click", close);
    ov.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    setTimeout(() => { if (!ov.isConnected) return; ov.classList.add("projette"); v.play().catch(() => {}); }, 2800);
    v.addEventListener("ended", () => { carton.replaceChildren(mk("b", null, "Fin")); ov.classList.remove("projette"); setTimeout(close, 2400); });
    v.addEventListener("error", () => { toast("La bobine de 1895 n'a pas pu être chargée."); close(); });
  }

  // ---------- La cabine du projectionniste : il salue, il s'endort ----------
  const CABINE = '<svg viewBox="0 0 78 40" aria-hidden="true"><path d="M46 18.5L54 21M62 18.5L56 21" stroke="#3a2418" stroke-width="1"/><rect x="40" y="20" width="28" height="13" rx="2" fill="#2a1a14"/><rect x="43" y="23" width="11" height="2" rx="1" fill="#5a3a22"/><circle cx="60" cy="28" r="1.4" fill="#c98b2e"/><path d="M68 23.5h5v7h-5z" fill="#3a2418"/><rect x="38" y="33" width="32" height="7" fill="#1b0d10"/><g class="perso"><path d="M5 40c0-9 5-13 13-13s13 4 13 13z" fill="#3d5a7a"/><path d="M13 28.5l2 11.5M23 28.5l-2 11.5" stroke="#2a1a14" stroke-width="1.6"/><g class="tete-p"><rect x="15.5" y="22" width="5" height="6" rx="2" fill="#c48e66"/><circle cx="18" cy="18" r="7" fill="#d9a57a"/><path d="M10.6 16.5q0-8.2 7.4-8.2t7.4 8.2q-3-3-7.4-3t-7.4 3z" fill="#3a2418"/><path d="M24 12.5q5.5 0 6.5 2.3q-3.4 1-6.5-.2z" fill="#3a2418"/><g class="lunettes"><circle cx="15.4" cy="18.6" r="2.1" fill="rgba(255,240,210,.35)" stroke="#1b0d14" stroke-width=".9"/><circle cx="21" cy="18.6" r="2.1" fill="rgba(255,240,210,.35)" stroke="#1b0d14" stroke-width=".9"/><path d="M17.5 18.6h1.4" stroke="#1b0d14" stroke-width=".9"/></g><path class="yeux-fermes" d="M14.2 18.8q1.2.8 2.4 0M19.8 18.8q1.2.8 2.4 0" stroke="#1b0d14" stroke-width=".8" fill="none"/><path d="M15 22.4q3 1.6 6 0q-3-1.2-6 0z" fill="#3a2418"/></g><g class="bras-p"><path d="M27 31q6-4 7.2-11" stroke="#3d5a7a" stroke-width="3.2" stroke-linecap="round" fill="none"/><circle cx="34.2" cy="19.5" r="2.1" fill="#d9a57a"/></g></g></svg>';
  document.querySelectorAll(".beam").forEach((beam) => {
    const c = mk("div", "cabine"); c.setAttribute("aria-hidden", "true");
    const vitre = mk("div", "vitre"); vitre.innerHTML = CABINE; vitre.append(mk("i", "bob g"), mk("i", "bob d"), mk("i", "projo"));
    const bulle = mk("span", "bulle"); c.append(vitre, bulle);
    beam.parentElement.insertBefore(c, beam);
    let dodo = 0, parleT = 0, loin = false;
    const dit = (txt, ms) => { bulle.textContent = txt; c.classList.remove("parle"); void c.offsetWidth; c.classList.add("parle"); clearTimeout(parleT); parleT = setTimeout(() => c.classList.remove("parle"), ms || 2200); };
    const salut = (txt) => { c.classList.remove("dort", "salut"); void c.offsetWidth; c.classList.add("salut"); setTimeout(() => c.classList.remove("salut"), 2100); if (txt) dit(txt); };
    let vu = 0;
    const reveil = () => {
      // Appelé à chaque mouvement : on ne relance le minuteur qu'une fois par seconde.
      const dort = c.classList.contains("dort"), t = Date.now();
      if (!dort && t - vu < 1000) return;
      vu = t;
      if (dort) { c.classList.remove("dort"); dit("Hein ? Je dormais pas !"); }
      clearTimeout(dodo); dodo = setTimeout(() => { c.classList.add("dort"); dit("Zzz…", 4000); }, 45000);
    };
    c.addEventListener("click", () => { salut("Bonne séance !"); secret("projectionniste"); sfx.click(); });
    ["pointermove", "keydown", "scroll"].forEach((t) => addEventListener(t, reveil, { passive: true }));
    addEventListener("scroll", () => { if (scrollY > 700) loin = true; else if (scrollY < 60 && loin) { loin = false; salut("Re-bonjour !"); } }, { passive: true });
    reveil();
  });

  // ---------- L'applaudimètre, sous le générique ----------
  document.querySelectorAll(".applaudimetre").forEach((box) => {
    const btn = box.querySelector(".applaudir"), fill = box.querySelector(".jauge i"), rec = box.querySelector(".record");
    let niveau = 0, serie = 0, serieT = 0, raf = 0, avant = 0, ovation = false, record = Number(store.get("record-applaudissements")) || 0;
    const showRec = () => { rec.textContent = record ? "Record : " + record + " applaudissements d'affilée" : "Applaudis le générique !"; };
    showRec();
    // La jauge redescend de 22 points par seconde, quelle que soit la fréquence de l'écran.
    const tick = (t) => {
      niveau = Math.max(0, niveau - (avant ? (t - avant) / 1000 * 22 : 0)); avant = t;
      fill.style.clipPath = "inset(0 " + (100 - niveau).toFixed(1) + "% 0 0)";
      box.classList.toggle("chaud", niveau > 60);
      raf = niveau > 0 ? requestAnimationFrame(tick) : 0;
      if (!raf) avant = 0;
    };
    btn.addEventListener("click", () => {
      niveau = Math.min(100, niveau + 10); serie++; sfx.clap();
      clearTimeout(serieT);
      serieT = setTimeout(() => {
        if (serie > record) { record = serie; store.set("record-applaudissements", String(record)); toast("Nouveau record : " + record + " applaudissements !"); }
        serie = 0; ovation = false; showRec();
      }, 1500);
      if (niveau >= 100 && !ovation) { ovation = true; bravo(); popcornRain(); toast("Standing ovation !"); secret("applaudimetre"); }
      else if (niveau > 50 && Math.random() < .3) document.querySelectorAll(".seats").forEach((r) => { r.classList.remove("bravo"); void r.offsetWidth; r.classList.add("bravo"); setTimeout(() => r.classList.remove("bravo"), 1900); });
      if (!raf) raf = requestAnimationFrame(tick);
    });
  });

  // Vraie deuxième visite : on revient plus de 6 heures après la précédente (un nouvel onglet ou un
  // rechargement ne compte pas, et en navigation privée tout est oublié à la fermeture).
  try {
    const maintenant = Date.now(), avant = Number(store.get("derniere-visite")) || 0;
    if (avant && maintenant - avant > 6 * 3600 * 1000) store.set("revenu", "1");
    store.set("derniere-visite", String(maintenant));
    if (store.get("revenu") === "1") {
      const m = document.createElement("p");
      m.className = "secret"; m.dataset.secret = "retour"; m.setAttribute("aria-hidden", "true");
      m.style.cssText = "top: 400px; left: max(12px, calc(50% - 600px)); --r: 4deg";
      m.textContent = "Tu es revenu ? Je savais que tu reviendrais.";
      document.body.append(m);
    }
  } catch (e) {}
  // Le générique regardé jusqu'au bout (une boucle complète à l'écran).
  document.querySelectorAll(".generique").forEach((g) => {
    let vu = false, temps = 0;
    new IntersectionObserver(([e]) => { vu = e.isIntersecting; }).observe(g);
    const t = setInterval(() => { if (vu && !document.hidden && ++temps >= 34) { clearInterval(t); secret("generique"); } }, 1000);
  });

  // ---------- L'enseigne : lettres à décrocher, ampoule fatiguée ----------
  document.querySelectorAll(".marquee h1").forEach((h) => {
    const text = h.textContent.trim();
    h.setAttribute("aria-label", text); h.textContent = "";
    text.split(" ").forEach((w, i) => {
      if (i) h.append(" ");
      const mot = document.createElement("span"); mot.className = "mot"; mot.setAttribute("aria-hidden", "true");
      [...w].forEach((ch) => { const l = document.createElement("span"); l.className = "lettre"; l.textContent = ch; mot.append(l); });
      h.append(mot);
    });
    h.addEventListener("click", (e) => {
      const l = e.target.closest(".lettre");
      if (!l || l.classList.contains("decroche")) return;
      sfx.clink(); secret("lettre"); if (calm) return;
      l.classList.add("decroche");
      setTimeout(() => { l.classList.replace("decroche", "raccroche"); setTimeout(() => l.classList.remove("raccroche"), 600); }, 2900);
    });
  });
  const surprise = (msg) => { popcornRain(); toast(msg); };
  // Ampoules réparties sur le contour : à 14 px du bord, environ tous les 14 px, ajustées pour
  // tomber juste dans les quatre coins. Redessinées si l'enseigne change de taille.
  document.querySelectorAll(".marquee").forEach((m) => {
    const box = document.createElement("span"); box.className = "ampoules"; box.setAttribute("aria-hidden", "true");
    m.prepend(box); m.classList.add("ampoules-js");
    let reparee = false, lastSize = "";
    const draw = () => {
      const W = m.clientWidth, H = m.clientHeight, size = W + "x" + H;
      if (size === lastSize || !W) return; lastSize = size;
      const e = 14, w = W - 2 * e, h = H - 2 * e;
      const nx = Math.max(2, Math.round(w / 14)), ny = Math.max(2, Math.round(h / 14)), sx = w / nx, sy = h / ny;
      const pts = [];
      for (let i = 0; i < nx; i++) pts.push([e + i * sx, e]);
      for (let j = 0; j < ny; j++) pts.push([e + w, e + j * sy]);
      for (let i = 0; i < nx; i++) pts.push([e + w - i * sx, e + h]);
      for (let j = 0; j < ny; j++) pts.push([e, e + h - j * sy]);
      box.textContent = ""; box.style.setProperty("--n", String(pts.length));
      const base = mk("span", "base"), ea = mk("span", "vives a"), eb = mk("span", "vives b");
      pts.forEach(([x, y], k) => {
        const pos = (el) => { el.style.left = x.toFixed(1) + "px"; el.style.top = y.toFixed(1) + "px"; return el; };
        const b = pos(document.createElement("i")); b.style.setProperty("--k", String(k));
        if (k % 2) b.className = "pair";
        if (k === 5 && !reparee) b.classList.add("grillee");
        base.append(b);
        if (k !== 5 || reparee) (k % 2 ? eb : ea).append(pos(document.createElement("i")));
      });
      box.append(base, ea, eb);
    };
    draw(); new ResizeObserver(draw).observe(m);
    box.addEventListener("click", (ev) => {
      const b = ev.target.closest(".grillee"); if (!b) return;
      ev.stopPropagation(); reparee = true;
      b.classList.replace("grillee", "reparee"); sfx.click(); surprise("Ampoule changée. Le pop-corn est offert par la maison."); secret("ampoule");
    });
  });
  // Code Konami, ou « popcorn » tapé au clavier.
  const konami = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];
  let kpos = 0, typed = "";
  addEventListener("keydown", (e) => {
    const k = (e.key || "").toLowerCase();
    kpos = k === konami[kpos] ? kpos + 1 : (k === konami[0] ? 1 : 0);
    if (kpos === konami.length) { kpos = 0; surprise("Code secret accepté : pop-corn à volonté !"); secret("konami"); }
    if (e.target.closest && e.target.closest("input, textarea, select")) return;
    if (k.length === 1) { typed = (typed + k).slice(-7); if (typed === "popcorn") { typed = ""; surprise("Une grande portion de pop-corn, une !"); secret("popcorn"); }
      if (typed.endsWith("1895")) { typed = ""; seance1895(); } }
  });

  // ---------- Les spectateurs prennent place ----------
  // Ce que râlent les spectateurs : « Chut ! » d'abord, puis dans le désordre, sans se répéter
  // avant d'avoir tout dit.
  const REPLIQUES = [
    "Ferme-la !", "Tg !", "Pousse-toi, je vois rien !", "On entend rien, là !", "Range ton téléphone !",
    "Mâche moins fort !", "Tu vas pas me spoiler, hein ?", "C'est ma place, ça !", "Enlève ton chapeau !",
    "Arrête de taper dans mon siège !", "Psst… t'as du pop-corn ?", "Il meurt à la fin. Oups.", "Encore toi ?!",
    "Va t'asseoir !", "Silence, ça commence !", "T'es pas dans ton salon !", "Je dors, laisse-moi.",
    "La sortie, c'est le panneau vert.", "Et éteins ta lampe !", "Le pop-corn, c'est pas gratuit !",
    "Tu reviens des toilettes, là ?", "On rembobine pas, hein.", "Y a pas de pause, ici.", "Respire moins fort !",
  ];
  let sac = [];
  const replique = () => {
    if (!sac.length) { sac = REPLIQUES.slice().sort(() => Math.random() - .5); if (!replique.deja) { sac.unshift("Chut !"); replique.deja = true; } }
    return sac.shift();
  };
  // Les spectateurs : huit coiffures, plusieurs couleurs de cheveux ; ta place a une couronne.
  const COIFFES = {
    court: (c) => '<path d="M9 15Q9 5 18 5T27 15Q24 10 18 10T9 15z" fill="' + c + '"/>',
    long: (c) => '<path class="arriere" d="M8 15Q8 4 18 4T28 15L29.5 31Q18 34 6.5 31z" fill="' + c + '"/><path d="M9 15Q9 4 18 4T27 15Q24 9 18 9T9 15z" fill="' + c + '"/><path d="M9 14Q7.5 25 9.5 31M27 14Q28.5 25 26.5 31" stroke="' + c + '" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
    chignon: (c) => '<path d="M9 15Q9 5 18 5T27 15Q24 10 18 10T9 15z" fill="' + c + '"/><circle cx="18" cy="4.5" r="4.5" fill="' + c + '"/>',
    // Vus de dos : la queue-de-cheval tombe au milieu du dos, la casquette montre sa fermeture (pas sa visière).
    queue: (c) => '<path d="M9 15Q9 5 18 5T27 15Q24 10 18 10T9 15z" fill="' + c + '"/><path class="arriere" d="M15.6 11Q18 8.6 20.4 11Q22 21 18 30Q14 21 15.6 11z" fill="' + c + '"/><rect class="arriere" x="16" y="10.6" width="4" height="2.2" rx="1" fill="#c2352f"/>',
    casquette: () => '<path d="M8.6 15Q9 4.5 18 4.5T27.4 15z" fill="#3a1a22"/><path d="M14.6 15a3.4 3 0 0 1 6.8 0z" fill="#12070b"/><path d="M14 14.4h8" stroke="#5a2a36" stroke-width="1.1"/><circle cx="18" cy="5" r="1.1" fill="#5a2a36"/>',
    afro: (c) => '<g fill="' + c + '"><circle cx="18" cy="12" r="10.5"/><circle cx="9" cy="9" r="5"/><circle cx="27" cy="9" r="5"/><circle cx="12.5" cy="4" r="5"/><circle cx="23.5" cy="4" r="5"/><circle cx="7.5" cy="15" r="4"/><circle cx="28.5" cy="15" r="4"/></g>',
    chauve: (c) => '<path d="M9 16Q10 21.5 18 22T27 16Q26 19.5 18 19.8T9 16z" fill="' + c + '"/><ellipse cx="14.5" cy="9" rx="3" ry="1.6" fill="rgba(255,220,190,.22)"/>',
    bonnet: () => '<path d="M8.5 15Q8.5 3 18 3T27.5 15z" fill="#3b1220"/><rect x="8" y="12" width="20" height="4" rx="2" fill="#5a1a2c"/><circle cx="18" cy="2.6" r="3" fill="#7a2638"/>',
  };
  const CHEVEUX = ["#24100f", "#3a2418", "#1a0c10", "#4a2a1a", "#5c5048"];
  const VISAGE = '<g class="visage"><path d="M12.4 12.4l3.6 1.3M23.6 12.4l-3.6 1.3" stroke="rgba(245,234,216,.85)" stroke-width="1" stroke-linecap="round"/><ellipse cx="14.6" cy="16" rx="1.9" ry="1.5" fill="#f5ead8"/><ellipse cx="21.4" cy="16" rx="1.9" ry="1.5" fill="#f5ead8"/><circle cx="14.9" cy="16.2" r=".85" fill="#12070b"/><circle cx="21.1" cy="16.2" r=".85" fill="#12070b"/><ellipse cx="18" cy="20.6" rx="2" ry="1.3" fill="#5a0f1b" stroke="rgba(245,234,216,.4)" stroke-width=".5"/><g class="l3d"><rect x="11.4" y="13.6" width="6.4" height="4.8" rx="1" fill="rgba(255,60,80,.8)" stroke="#f5ead8" stroke-width=".6"/><rect x="18.2" y="13.6" width="6.4" height="4.8" rx="1" fill="rgba(0,210,255,.8)" stroke="#f5ead8" stroke-width=".6"/></g></g>';
  const CORNET_IN = '<path d="M27.5 25h8l-1.2 10h-5.6z" fill="#e9dcc6"/><path d="M29.4 25h1.6l-.3 10h-1.1zM32.6 25h1.6l-.7 10h-1.2z" fill="#c2352f"/><g fill="#fff3dc"><circle cx="29" cy="24" r="1.8"/><circle cx="31.6" cy="23" r="2"/><circle cx="34" cy="24" r="1.8"/></g><circle cx="28.4" cy="31" r="2" fill="#12070b"/>';
  const CORNET = '<g class="cornet-g">' + CORNET_IN + "</g>";
  const COURONNE = '<path d="M12.5-2.5l2.2 3 3.3-3.6 3.3 3.6 2.2-3-.8 5.4h-9.4z" fill="#ffcf6b"/>';
  const spectateur = (coiffe, couleur, cornet, toi) => {
    const sil = toi ? "#2a1520" : "#12070b";
    return '<svg viewBox="0 -4 36 46" aria-hidden="true">' +
      '<g class="bras" stroke="' + sil + '" stroke-width="3.4" stroke-linecap="round" fill="' + sil + '"><path class="g" d="M6 34L-1 9"/><circle class="g" cx="-1.4" cy="7" r="2.6" stroke="none"/><path class="d" d="M30 34L37 9"/><circle class="d" cx="37.4" cy="7" r="2.6" stroke="none"/></g>' +
      '<path d="M2 42c0-8 7-12 16-12s16 4 16 12z" fill="' + sil + '"/>' +
      '<rect x="14" y="20" width="8" height="12" rx="3" fill="' + sil + '"/>' +
      '<ellipse cx="9" cy="16" rx="2" ry="3" fill="' + sil + '"/><ellipse cx="27" cy="16" rx="2" ry="3" fill="' + sil + '"/>' +
      '<circle cx="18" cy="15" r="9" fill="' + sil + '"/>' +
      COIFFES[coiffe](couleur) + VISAGE + (cornet ? CORNET : "") + (toi ? COURONNE : "") + "</svg>";
  };
  const hasard = (list) => list[Math.floor(Math.random() * list.length)];
  const VOISINS = ["Bienvenue !", "Enfin quelqu'un de sympa !", "Pas à côté de moi…", "Tu me prêtes ton pop-corn ?", "Salut, voisin !", "Tu ronfles pas, j'espère ?"];
  const rale = (t, txt) => { t.dataset.dit = txt; t.classList.remove("chut"); void t.offsetWidth; t.classList.add("chut"); setTimeout(() => t.classList.remove("chut"), 1900); };
  // Deux rangs : le second (plus près de nous) passe devant le premier.
  document.querySelectorAll(".seats").forEach((salle) => {
    salle.append(mk("i", "dossiers2"));
    const W = salle.clientWidth;
    const RANGS = { 1: { x0: 26, top: 18, n: Math.floor(W / 56) }, 2: { x0: 54, top: 76, n: Math.floor((W - 28) / 56) } };
    const occupe = new Map(), cle = (r, k) => r + ":" + k;
    const placer = (t, r, k) => { t.style.left = (RANGS[r].x0 + 56 * k - 18) + "px"; t.style.top = RANGS[r].top + "px"; t.classList.toggle("r2", r === 2); };
    [1, 2].forEach((r) => {
      for (let k = 0; k < RANGS[r].n; k++) {
        if (Math.random() > (r === 1 ? .45 : .35)) continue;
        const t = document.createElement("i");
        t.className = "tete " + hasard(["hoche", "rit", "chuchote", "sursaute", "respire", "respire"]);
        if (Math.random() < .5) { t.style.setProperty("--penche", "12deg"); t.style.setProperty("--vers", "3px"); }
        t.innerHTML = spectateur(hasard(Object.keys(COIFFES)), hasard(CHEVEUX), Math.random() < .18, false);
        placer(t, r, k); occupe.set(cle(r, k), t);
        t.style.setProperty("--d", (Math.random() * 6).toFixed(2) + "s");
        t.addEventListener("click", () => {
          t.dataset.dit = replique();
          t.classList.remove("chut"); void t.offsetWidth; t.classList.add("chut");
          sfx.couic(); secret("chut");
          setTimeout(() => t.classList.remove("chut"), 1900);
        });
        salle.append(t);
      }
    });
    // Choisir son fauteuil, dans l'un ou l'autre rang : ta tête s'y installe, gardée pour la prochaine fois.
    let toi = null;
    const asseoir = (r, k, annonce) => {
      k = Math.max(0, Math.min(RANGS[r].n - 1, k));
      const deja = occupe.get(cle(r, k));
      if (deja && deja !== toi) { if (annonce) rale(deja, "C'est ma place !"); return; }
      if (!toi) {
        toi = document.createElement("i"); toi.className = "tete toi"; toi.innerHTML = spectateur("court", "#4a2a1a", false, true);
        toi.addEventListener("click", (e) => { e.stopPropagation(); rale(toi, "Je suis bien, là."); });
        salle.append(toi);
      }
      occupe.forEach((v, key) => { if (v === toi) occupe.delete(key); });
      occupe.set(cle(r, k), toi); placer(toi, r, k);
      store.set("fauteuil", cle(r, k));
      if (annonce) {
        [cle(r, k - 1), cle(r, k + 1)].forEach((c) => { const v = occupe.get(c); if (v && v !== toi) rale(v, VOISINS[Math.floor(Math.random() * VOISINS.length)]); });
        // Au second rang, la personne juste devant (premier rang) se retourne aussi.
        if (r === 2) [k, k + 1].forEach((j) => { const v = occupe.get(cle(1, j)); if (v && Math.random() < .5) rale(v, "Tu me tapes pas dans le dos, hein ?"); });
        secret("fauteuil"); sfx.punch();
      }
    };
    const m = (store.get("fauteuil") || "").match(/^(?:([12]):)?(\d+)$/);
    if (m) {
      const r = m[1] === "2" ? 2 : 1, k = Math.max(0, Math.min(RANGS[r].n - 1, Number(m[2]))), v = occupe.get(cle(r, k));
      if (v) { v.remove(); occupe.delete(cle(r, k)); }
      asseoir(r, k, false);
    }
    salle.addEventListener("click", (e) => {
      if (e.target.closest(".tete")) return;
      const box = salle.getBoundingClientRect(), x = e.clientX - box.left, y = e.clientY - box.top;
      const r = y > 108 ? 2 : 1;
      asseoir(r, Math.round((x - RANGS[r].x0) / 56), true);
    });
  });

  // ---------- Ce qui vit dans chaque salle (affiché seulement dans la salle concernée) ----------
  const VOITURE = (c) => '<svg viewBox="0 0 92 44" aria-hidden="true">' +
    '<path d="M4 30q0-6 8-7l14-1 8-10q3-3 9-3h14q6 0 9 3l8 9 10 2q8 1 8 7v4H4z" fill="' + c + '"/>' +
    '<path d="M2 26l9-5 2 4zM88 27l3-7-1 9z" fill="' + c + '"/>' +
    '<path d="M36 13q2-2 6-2h7v10H30zM53 11h6q4 0 6 2l6 8H53z" fill="#1d2b55"/>' +
    '<circle cx="42" cy="17" r="3.4" fill="#0a0f1f"/><circle cx="59" cy="17" r="3.4" fill="#0a0f1f"/>' +
    '<path d="M4 31h86" stroke="rgba(255,255,255,.65)" stroke-width="1.6"/><rect x="2" y="32" width="8" height="3" rx="1.5" fill="#cfd6e6"/><rect x="82" y="32" width="9" height="3" rx="1.5" fill="#cfd6e6"/>' +
    '<circle cx="22" cy="36" r="6.5" fill="#0b0b10"/><circle cx="22" cy="36" r="3.6" fill="#f2f2f2"/><circle cx="22" cy="36" r="1.6" fill="#9aa3b5"/>' +
    '<circle cx="71" cy="36" r="6.5" fill="#0b0b10"/><circle cx="71" cy="36" r="3.6" fill="#f2f2f2"/><circle cx="71" cy="36" r="1.6" fill="#9aa3b5"/>' +
    '<rect x="3" y="24" width="4" height="3" rx="1" fill="#ff4f6a"/></svg>';
  const COULEURS = ["#7fd8c8", "#ff8fb1", "#f3e3b5", "#5ac8e8", "#e5534b", "#b39cf0"];
  const KLAXONS = ["Pouet !", "Bip bip !", "Chut, ça commence !", "Tu me fais de la place ?", "Pouet pouet !"];
  document.querySelectorAll(".seats").forEach((salle) => {
    const parking = mk("div", "parking"); parking.setAttribute("aria-hidden", "true");
    const n = Math.floor((salle.clientWidth - 20) / 104);
    for (let k = 0; k < n; k++) {
      if (Math.random() < .25) continue;
      const v = mk("button", "voiture"); v.type = "button"; v.tabIndex = -1;
      v.innerHTML = VOITURE(COULEURS[k % COULEURS.length]); v.append(mk("i", "phare"), mk("span", "bulle-v"));
      v.style.left = (14 + 104 * k + (k % 2) * 10) + "px"; v.style.top = (k % 2 ? 96 : 56) + "px"; v.style.zIndex = k % 2 ? 3 : 2;
      v.style.setProperty("--d", (Math.random() * 5).toFixed(2) + "s");
      v.addEventListener("click", (e) => {
        e.stopPropagation();
        v.querySelector(".bulle-v").textContent = KLAXONS[Math.floor(Math.random() * KLAXONS.length)];
        v.classList.remove("flash"); void v.offsetWidth; v.classList.add("flash"); sfx.klaxon();
        setTimeout(() => v.classList.remove("flash"), 1800);
      });
      parking.append(v);
    }
    salle.append(parking);
    // Le pianiste du muet, devant le premier rang
    const pi = mk("button", "pianiste"); pi.type = "button"; pi.setAttribute("aria-label", "Le pianiste");
    pi.innerHTML = '<svg viewBox="0 0 92 86" aria-hidden="true">' +
      '<rect x="40" y="22" width="50" height="50" rx="2" fill="#1a1a1a" stroke="#efe7d6" stroke-width="1.2"/><rect x="44" y="26" width="42" height="16" fill="#0c0c0c" stroke="#5a5650" stroke-width=".8"/>' +
      '<rect x="36" y="48" width="58" height="7" fill="#efe7d6"/><path d="M40 48v5M45 48v5M50 48v5M55 48v5M60 48v5M65 48v5M70 48v5M75 48v5M80 48v5M85 48v5M90 48v5" stroke="#1a1a1a" stroke-width="1.4"/>' +
      '<rect x="42" y="72" width="4" height="12" fill="#1a1a1a"/><rect x="84" y="72" width="4" height="12" fill="#1a1a1a"/>' +
      '<rect x="12" y="60" width="26" height="5" rx="1" fill="#2a2a2a"/><path d="M14 65v19M36 65v19" stroke="#2a2a2a" stroke-width="2.4"/>' +
      '<path d="M14 60q2-22 14-22t14 20z" fill="#0c0c0c" stroke="#efe7d6" stroke-width=".8"/>' +
      '<g class="tete-pi"><circle cx="30" cy="30" r="7" fill="#0c0c0c" stroke="#efe7d6" stroke-width=".8"/><path d="M22 27q8-9 16 0" stroke="#efe7d6" stroke-width=".8" fill="none"/></g>' +
      '<path class="main-g" d="M34 44q10 2 16 4" stroke="#0c0c0c" stroke-width="3.6" stroke-linecap="round" fill="none"/>' +
      '<path class="main-d" d="M36 46q16 0 26 1" stroke="#0c0c0c" stroke-width="3.6" stroke-linecap="round" fill="none"/></svg>';
    pi.addEventListener("click", (e) => {
      e.stopPropagation(); sfx.piano(); pi.classList.add("virtuose"); setTimeout(() => pi.classList.remove("virtuose"), 1300);
      for (let i = 0; i < 5; i++) setTimeout(() => {
        const n2 = mk("span", "note-volante", ["♪", "♫", "♩"][i % 3]);
        n2.style.left = (pi.offsetLeft + 50 + Math.random() * 30) + "px"; n2.style.top = (pi.offsetTop + 10) + "px";
        n2.style.setProperty("--nx", (Math.random() * 50 - 15).toFixed(0) + "px"); n2.style.setProperty("--nr", (Math.random() * 40 - 20).toFixed(0) + "deg");
        salle.append(n2); setTimeout(() => n2.remove(), 1700);
      }, i * 180);
    });
    salle.append(pi);
  });
  // Les lustres Art déco et la soucoupe du drive-in, dans le décor de la salle
  const decor = document.querySelector(".decor-salle");
  if (decor) {
    const LUSTRE = '<svg viewBox="0 0 84 132" aria-hidden="true"><path d="M42 0v34" stroke="#c9a227" stroke-width="1.6"/>' +
      '<path d="M42 34l-30 26h60z" fill="#c9a227"/><path d="M42 40l-22 20M42 40v20M42 40l22 20" stroke="#0b1416" stroke-width="1.2"/>' +
      '<path d="M8 60h68l-6 14H14z" fill="#e8c66a"/><path d="M20 74h44l-8 16H28z" fill="#c9a227"/><path d="M34 90h16l-8 18z" fill="#e8c66a"/>' +
      '<g fill="#fff6dc"><circle class="goutte" cx="14" cy="80" r="2.4"/><circle class="goutte" cx="26" cy="86" r="2.4"/><circle class="goutte" cx="42" cy="114" r="2.8"/><circle class="goutte" cx="58" cy="86" r="2.4"/><circle class="goutte" cx="70" cy="80" r="2.4"/></g>' +
      '<g fill="#fff3cf"><circle cx="16" cy="58" r="2.6"/><circle cx="42" cy="58" r="2.6"/><circle cx="68" cy="58" r="2.6"/></g></svg>';
    ["g", "d"].forEach((c) => {
      const l = mk("button", "lustre " + c); l.type = "button"; l.tabIndex = -1; l.setAttribute("aria-hidden", "true"); l.innerHTML = LUSTRE;
      l.addEventListener("click", () => { l.classList.remove("brille"); void l.offsetWidth; l.classList.add("brille"); sfx.clink(); setTimeout(() => sfx.clink(), 180); setTimeout(() => l.classList.remove("brille"), 1600); });
      document.body.append(l);
    });
    const so = mk("button", "soucoupe"); so.type = "button"; so.tabIndex = -1; so.setAttribute("aria-hidden", "true");
    so.innerHTML = '<i class="rayon"></i><svg viewBox="0 0 74 40" aria-hidden="true"><ellipse cx="37" cy="14" rx="14" ry="11" fill="rgba(170,230,255,.55)" stroke="#dff6ff" stroke-width="1"/><circle cx="37" cy="13" r="4" fill="#7fe08a"/><circle cx="35.6" cy="12" r="1" fill="#0a0f1f"/><circle cx="38.4" cy="12" r="1" fill="#0a0f1f"/>' +
      '<ellipse cx="37" cy="24" rx="35" ry="9" fill="#9aa6bd" stroke="#e6ecf5" stroke-width="1"/><ellipse cx="37" cy="27" rx="20" ry="4" fill="#5d6780"/>' +
      '<circle class="feu" cx="14" cy="25" r="2.2" fill="#5ff2e5"/><circle class="feu" cx="37" cy="31" r="2.2" fill="#5ff2e5"/><circle class="feu" cx="60" cy="25" r="2.2" fill="#5ff2e5"/></svg>';
    let aspire = 0;
    so.addEventListener("click", () => {
      if (so.classList.contains("aspire")) return;
      so.classList.add("aspire"); sfx.ovni(); toast("Ils sont venus pour le pop-corn…");
      clearTimeout(aspire); aspire = setTimeout(() => so.classList.remove("aspire"), 2600);
    });
    document.body.append(so);
  }

  // ---------- Décor de saison ----------
  const fx = document.querySelector(".saison"), saison = root.dataset.saison;
  if (fx && !calm) {
    const BAT = '<svg viewBox="0 0 40 18"><path fill="#1c0a10" d="M20 5c-1-3-2-4-3-4 0 2 0 3 1 4-3-1-8-3-13-1 3 1 5 3 5 6 2-1 4-1 5 0 1-1 2-1 3 0 1-1 1-1 2 0 1-1 2-1 3 0 1-1 3-1 5 0 0-3 2-5 5-6-5-2-10 0-13 1 1-1 1-2 1-4-1 0-2 1-3 4z"/></svg>';
    const add = (cls, n, html, slow) => {
      for (let i = 0; i < n; i++) {
        const el = document.createElement("i"); el.className = cls; if (html) el.innerHTML = html;
        el.style.setProperty("--x", (Math.random() * 100).toFixed(1) + "vw");
        el.style.setProperty("--y", (10 + Math.random() * 75).toFixed(1) + "vh");
        el.style.setProperty("--h", String(Math.floor(Math.random() * 360)));
        el.style.setProperty("--t", ((slow ? 26 : 14) + Math.random() * 12).toFixed(1) + "s");
        el.style.setProperty("--d", (slow ? 4 + i * 9 : -Math.random() * 20).toFixed(1) + "s");
        el.style.setProperty("--s", (.6 + Math.random() * .7).toFixed(2));
        fx.append(el);
      }
    };
    // Halloween : les chauves-souris s'attrapent d'un clic ; trois prises réveillent toute la colonie.
    if (saison === "halloween") {
      let prises = 0;
      const bat = (delay) => {
        const b = document.createElement("i"); b.className = "chauve-souris"; b.innerHTML = BAT;
        b.style.setProperty("--t", (24 + Math.random() * 10).toFixed(1) + "s");
        b.style.setProperty("--d", delay.toFixed(1) + "s");
        b.style.setProperty("--s", (.95 + Math.random() * .4).toFixed(2));
        b.addEventListener("pointerdown", (e) => { e.preventDefault(); attrape(b); });
        fx.append(b);
      };
      const colonie = () => {
        secret("colonie");
        toast("Trois de suite ! Toute la colonie se réveille…");
        fx.classList.remove("orage"); void fx.offsetWidth; fx.classList.add("orage");
        sfx.applause();
        for (let i = 0; i < 14; i++) {
          const b = document.createElement("i"); b.className = "chauve-souris essaim"; b.innerHTML = BAT;
          b.style.setProperty("--y0", (30 + Math.random() * 60).toFixed(1) + "vh");
          b.style.setProperty("--y1", (Math.random() * 50).toFixed(1) + "vh");
          b.style.setProperty("--s", (.6 + Math.random() * .8).toFixed(2));
          b.style.animationDelay = (Math.random() * 1.2).toFixed(2) + "s";
          fx.append(b); setTimeout(() => b.remove(), 4200);
        }
      };
      const attrape = (b) => {
        if (b.classList.contains("prise")) return;
        // Elle s'arrête là où elle est, se débat, puis part en fumée.
        const m = getComputedStyle(b).translate;
        if (m && m !== "none") b.style.translate = m;
        b.classList.add("prise"); sfx.couic();
        setTimeout(() => {
          const r = b.getBoundingClientRect();
          const f = document.createElement("i"); f.className = "fumee";
          f.style.left = (r.left + r.width / 2) + "px"; f.style.top = (r.top + r.height / 2) + "px";
          fx.append(f); setTimeout(() => f.remove(), 900);
          popcorn(b); b.remove();
          prises++;
          if (prises % 3 === 0) colonie();
          else toast("Chauve-souris attrapée ! Encore " + (3 - prises % 3) + " pour réveiller la colonie.");
          setTimeout(() => bat(0), 5000 + Math.random() * 4000);
        }, 450);
      };
      bat(4); bat(13);
      // L'araignée, dans la toile de droite.
      const ar = document.createElement("i"); ar.className = "araignee";
      ar.innerHTML = '<i class="fil"></i><i class="bete" title="Une araignée !"><svg viewBox="0 0 22 22" aria-hidden="true"><g stroke="#c9b4a4" stroke-width="1.3" fill="none" stroke-linecap="round"><path d="M8 10L2 6M8 12L1 12M8 14L2 18M8 15L4 21M14 10L20 6M14 12L21 12M14 14L20 18M14 15L18 21"/></g><ellipse cx="11" cy="14" rx="4.6" ry="5.2" fill="#2a1520" stroke="#e9d6c4" stroke-width=".7"/><circle cx="11" cy="8.6" r="3" fill="#3a1d2b" stroke="#e9d6c4" stroke-width=".6"/><circle cx="9.9" cy="8.2" r=".9" fill="#ff9b3d"/><circle cx="12.1" cy="8.2" r=".9" fill="#ff9b3d"/><path d="M9 15.5q2 1.6 4 0" stroke="#7a1824" stroke-width=".8" fill="none"/></svg></i>';
      (document.querySelector(".toiles") || fx).append(ar);
      ar.querySelector(".bete").addEventListener("pointerdown", (e) => {
        e.preventDefault(); if (ar.classList.contains("fuit") || ar.classList.contains("cachee")) return;
        sfx.couic();
        const bete = ar.querySelector(".bete"), fil = ar.querySelector(".fil");
        ar.style.setProperty("--depart", new DOMMatrix(getComputedStyle(bete).transform).m42.toFixed(1) + "px");
        ar.style.setProperty("--fil-depart", new DOMMatrix(getComputedStyle(fil).transform).d.toFixed(3));
        ar.classList.add("fuit");
        // Une fois cachée, on arrête sa ronde ; quand elle revient, elle repart du haut de son fil.
        setTimeout(() => { ar.classList.add("cachee"); ar.classList.remove("fuit"); }, 1100);
        setTimeout(() => { ar.classList.remove("cachee"); }, 10000);
      });
    }
    if (saison === "saint-valentin") add("coeur", 9, "♥");
    if (saison === "paques") add("oeuf", 10);
    if (saison === "ete") add("luciole", 14);

    // ---------- Fêtes : guirlande accrochée en haut de la page, et un passant à attraper dans le ciel ----------
    const FETES = {
      noel: { objet: "ampoule", passant: "traineau", msg: "Ho ho ho ! Le Père Noël t'a laissé du pop-corn.", son: () => { sfx.clink(); setTimeout(sfx.clink, 160); setTimeout(sfx.clink, 320); }, eclat: ["❄", "✦", "❄"] },
      "saint-valentin": { objet: "coeur", passant: "cupidon", msg: "Touché en plein cœur !", son: () => sfx.punch(), eclat: ["♥", "♥", "♡"] },
      paques: { objet: "fanion", passant: "lapin", msg: "Un œuf en chocolat pour toi !", son: () => sfx.pops(4), oeuf: true },
      ete: { objet: "guinguette", passant: "mouette", msg: "Cui cui ! Elle voulait juste ton pop-corn.", son: () => sfx.couic(), eclat: ["✦", "☀", "✦"] },
    };
    const fete = FETES[saison];
    if (fete) {
      const g = mk("div", "guirlande"); g.setAttribute("aria-hidden", "true"); document.body.prepend(g);
      const COUL = { ampoule: ["#ff5a5a", "#ffd84a", "#5ad1ff", "#7cff8a"], coeur: ["#ff6f9a", "#e5413a", "#ffb3c8"], fanion: ["#ffd1e8", "#fff3b0", "#c8f2ff", "#d8f5c8", "#e6d4ff"], guinguette: ["#ffe9a8"] };
      const dessine = () => {
        const W = document.documentElement.clientWidth, n = Math.max(1, Math.round(W / 420)), pas = W / n, creux = Math.min(70, pas * .14);
        let fil = "", objets = "", k = 0;
        for (let i = 0; i < n; i++) {
          const x0 = i * pas, x1 = x0 + pas;
          fil += "M" + x0.toFixed(1) + " 6Q" + ((x0 + x1) / 2).toFixed(1) + " " + (6 + 2 * creux).toFixed(1) + " " + x1.toFixed(1) + " 6";
          const m = Math.max(4, Math.round(pas / 42));
          for (let j = 1; j < m; j++, k++) {
            const t = j / m, x = x0 + pas * t, y = 6 + 4 * creux * t * (1 - t), c = COUL[fete.objet][k % COUL[fete.objet].length];
            const d = "style=\"animation-delay:" + (-(k % 7) * .27).toFixed(2) + "s\"";
            if (fete.objet === "ampoule") objets += '<g class="scint" ' + d + '><rect x="' + (x - 2) + '" y="' + (y - 1) + '" width="4" height="4" fill="#3a3a3a"/><ellipse cx="' + x + '" cy="' + (y + 8) + '" rx="3.6" ry="5.6" fill="' + c + '" style="filter: drop-shadow(0 0 5px ' + c + ')"/></g>';
            else if (fete.objet === "guinguette") objets += '<g class="scint" ' + d + '><rect x="' + (x - 2) + '" y="' + (y - 1) + '" width="4" height="4" fill="#3a3a3a"/><circle cx="' + x + '" cy="' + (y + 8) + '" r="5" fill="' + c + '" style="filter: drop-shadow(0 0 7px #ffc56b)"/></g>';
            else if (fete.objet === "coeur") objets += '<path class="balance" ' + d + ' d="M' + x + " " + (y + 16) + "c-9-6-11-11-8-14s7-1 8 2c1-3 5-5 8-2s1 8-8 14z" + '" fill="' + c + '"/>';
            else objets += '<path class="balance" ' + d + ' d="M' + (x - 8) + " " + y + "L" + (x + 8) + " " + y + "L" + x + " " + (y + 17) + 'z" fill="' + c + '"/>';
          }
        }
        g.innerHTML = '<svg viewBox="0 0 ' + W + ' 120" preserveAspectRatio="none"><path d="' + fil + '" stroke="rgba(30,20,20,.9)" stroke-width="1.4" fill="none"/>' + objets + "</svg>";
      };
      dessine(); let rT = 0; addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(dessine, 200); });

      const SVG_PASSANT = {
        traineau: '<svg viewBox="0 0 150 54" aria-hidden="true"><g fill="#7a4a2a"><ellipse cx="22" cy="26" rx="13" ry="6"/><path d="M14 30l-3 12M30 30l3 12M18 30l-1 12M26 30l1 12" stroke="#7a4a2a" stroke-width="2.4"/><circle cx="35" cy="20" r="4.5"/><path d="M34 15l-3-8M38 15l3-8M32 9l-4-2M40 9l4-2" stroke="#5a3418" stroke-width="1.6"/></g><circle cx="39" cy="20" r="1.6" fill="#ff3b3b"/>' +
          '<g fill="#7a4a2a"><ellipse cx="56" cy="28" rx="12" ry="5.5"/><path d="M49 32l-3 11M63 32l3 11" stroke="#7a4a2a" stroke-width="2.4"/><circle cx="68" cy="22" r="4.2"/><path d="M67 17l-3-7M71 17l3-7" stroke="#5a3418" stroke-width="1.6"/></g>' +
          '<path d="M37 24L84 34M69 26L84 34" stroke="#d9a441" stroke-width="1"/><path d="M84 26h44q8 0 8 10v4H92q-8 0-8-8z" fill="#c2352f"/><path d="M84 44h56q6 0 6-5" stroke="#d9a441" stroke-width="2" fill="none"/>' +
          '<circle cx="112" cy="18" r="8" fill="#c2352f"/><circle cx="112" cy="18" r="5" fill="#f2c7a5"/><path d="M106 21q6 8 12 0" fill="#fff"/><path d="M104 15q8-12 16 0z" fill="#c2352f"/><circle cx="121" cy="8" r="2.4" fill="#fff"/><path d="M122 24h10v8h-10z" fill="#5a8a3a"/></svg>',
        cupidon: '<svg viewBox="0 0 56 50" aria-hidden="true"><g class="ailes"><ellipse cx="18" cy="18" rx="10" ry="6" fill="#fff" transform="rotate(-25 18 18)"/><ellipse cx="34" cy="16" rx="10" ry="6" fill="#f6eefa" transform="rotate(20 34 16)"/></g>' +
          '<circle cx="27" cy="16" r="7" fill="#f6c9a8"/><path d="M21 13q6-8 12 0" fill="#f2c84a"/><ellipse cx="27" cy="30" rx="8" ry="9" fill="#f6c9a8"/><path d="M20 32q7 5 14 0v4H20z" fill="#fff"/>' +
          '<path d="M40 18q10 12 0 24" stroke="#c2352f" stroke-width="2" fill="none"/><path d="M40 18L40 42" stroke="#f5ead8" stroke-width=".8"/><path d="M30 30h22" stroke="#7a4a2a" stroke-width="1.6"/><path d="M50 27l5 3-5 3z" fill="#ff6f9a"/></svg>',
        lapin: '<svg viewBox="0 0 46 46" aria-hidden="true"><ellipse cx="18" cy="32" rx="12" ry="10" fill="#f7f2ea"/><circle cx="7" cy="30" r="4" fill="#fff"/><circle cx="31" cy="22" r="8" fill="#f7f2ea"/>' +
          '<ellipse cx="28" cy="7" rx="3" ry="9" fill="#f7f2ea" transform="rotate(-12 28 7)"/><ellipse cx="35" cy="7" rx="3" ry="9" fill="#f7f2ea" transform="rotate(14 35 7)"/><ellipse cx="28" cy="8" rx="1.3" ry="6" fill="#ffc6d6" transform="rotate(-12 28 8)"/><ellipse cx="35" cy="8" rx="1.3" ry="6" fill="#ffc6d6" transform="rotate(14 35 8)"/>' +
          '<circle cx="34" cy="21" r="1.4" fill="#2a1a14"/><circle cx="38.6" cy="24" r="1.3" fill="#ff8fb1"/><ellipse cx="24" cy="41" rx="6" ry="3" fill="#ece4d8"/></svg>',
        mouette: '<svg viewBox="0 0 60 26" aria-hidden="true"><path d="M2 8q14-8 26 8q2 3 4 0q12-16 26-8q-14-2-24 14h-6Q16 6 2 8z" fill="#f4f6fa"/><path d="M28 16l4 2-4 2z" fill="#ffb347"/><circle cx="30" cy="14" r="2.4" fill="#f4f6fa"/></svg>',
      };
      const p = mk("button", "passant " + fete.passant); p.type = "button"; p.tabIndex = -1; p.setAttribute("aria-hidden", "true");
      p.innerHTML = SVG_PASSANT[fete.passant]; document.body.append(p);
      p.addEventListener("click", (e) => {
        if (p.classList.contains("touche")) return;
        p.classList.add("touche"); fete.son(); toast(fete.msg);
        const r = p.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (fete.oeuf) for (let i = 0; i < 3; i++) setTimeout(() => { const o = mk("i", "oeuf-tombe"); o.style.left = (cx - 7 + (i - 1) * 14) + "px"; o.style.top = cy + "px"; document.body.append(o); setTimeout(() => o.remove(), 1500); }, i * 120);
        else for (let i = 0; i < 10; i++) {
          const x = mk("span", "eclat", fete.eclat[i % fete.eclat.length]); const a = Math.random() * 6.28, v = 40 + Math.random() * 60;
          x.style.left = cx + "px"; x.style.top = cy + "px"; x.style.color = saison === "noel" ? "#fff" : saison === "ete" ? "#ffd56b" : "#ff6f9a";
          x.style.setProperty("--ex", (Math.cos(a) * v).toFixed(0) + "px"); x.style.setProperty("--ey", (Math.sin(a) * v).toFixed(0) + "px");
          document.body.append(x); setTimeout(() => x.remove(), 1200);
        }
        if (saison === "noel") popcornRain();
        setTimeout(() => p.classList.remove("touche"), 1800);
      });
    }
  }
  // ---------- Hors de l'écran, on met les animations en pause (le téléphone respire) ----------
  if ("IntersectionObserver" in window) {
    const repos = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("loin", !e.isIntersecting)), { rootMargin: "120px 0px" });
    document.querySelectorAll(".seats, .marquee, .beam, .cabine, .toiles, .entracte, .guirlande, .generique, .applaudimetre, .reclames, .stage, .ticket").forEach((el) => repos.observe(el));
  }
  if (calm) return;

  // ---------- Lampe de l'ouvreuse : une lumière chaude suit la souris ----------
  const torch = document.querySelector(".torch");
  if (torch && matchMedia("(hover: hover) and (pointer: fine)").matches) {
    let x = innerWidth / 2, y = innerHeight / 3, tx = x, ty = y, raf = 0;
    const secrets = [...document.querySelectorAll(".secret")];
    // La lampe éclaire aussi les messages gravés qui se trouvent sous elle.
    // On lit toutes les positions d'abord, puis on écrit : pas de recalcul de mise en page entre les deux.
    const lightSecrets = () => {
      const rects = secrets.map((s) => s.getBoundingClientRect());
      secrets.forEach((s, i) => {
        const r = rects[i]; if (!r.width) return;
        s.style.setProperty("--sx", (x - r.left).toFixed(1) + "px"); s.style.setProperty("--sy", (y - r.top).toFixed(1) + "px");
        // Lampe pile dessus : le message est lu.
        if (Math.hypot(x - r.left - r.width / 2, y - r.top - r.height / 2) < 70 && s.dataset.secret) secret(s.dataset.secret);
      });
    };
    const plis = torch.querySelector("i");
    const step = () => {
      x += (tx - x) * .16; y += (ty - y) * .16;
      window.lampe = { x, y };
      torch.style.transform = "translate3d(" + x.toFixed(1) + "px, " + y.toFixed(1) + "px, 0)";
      if (plis) plis.style.backgroundPosition = (320 - x).toFixed(1) + "px 0";
      const pf = document.querySelector(".panne-fx");
      if (pf) { pf.style.setProperty("--tx", x.toFixed(1) + "px"); pf.style.setProperty("--ty", y.toFixed(1) + "px"); }
      lightSecrets();
      raf = Math.abs(tx - x) + Math.abs(ty - y) > .5 ? requestAnimationFrame(step) : 0;
    };
    addEventListener("scroll", () => { if (torch.classList.contains("on")) lightSecrets(); }, { passive: true });
    addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      tx = e.clientX; ty = e.clientY; torch.classList.add("on");
      if (!raf) raf = requestAnimationFrame(step);
    }, { passive: true });
    root.addEventListener("mouseleave", () => torch.classList.remove("on"));
  }

  // ---------- La pellicule brûle si on ne touche plus à rien pendant 2 minutes (une seule fois) ----------
  let idleT = 0;
  const brule = () => {
    if (trouves.includes("brule")) return;
    if (document.hidden || document.querySelector(".brule, .retro, .panne-fx")) { resetIdle(); return; }
    const ov = mk("div", "brule"); ov.setAttribute("aria-hidden", "true");
    [[50, 45, 0], [28, 62, .5], [72, 32, .9]].forEach(([x, y, d]) => { const i = mk("i"); i.style.setProperty("--bx", x + "%"); i.style.setProperty("--by", y + "%"); i.style.setProperty("--dl", d + "s"); ov.append(i); });
    document.body.append(ov); secret("brule");
    setTimeout(() => { ov.classList.add("repart"); sfx.punch(); }, 3600);
    setTimeout(() => { ov.remove(); toast("La pellicule a brûlé ! Le projectionniste a recollé le film."); }, 4500);
  };
  const resetIdle = () => { clearTimeout(idleT); if (!trouves.includes("brule")) idleT = setTimeout(brule, 120000); };
  ["pointermove", "pointerdown", "keydown", "scroll", "wheel", "touchstart"].forEach((t) => addEventListener(t, resetIdle, { passive: true }));
  resetIdle();

  // ---------- Les toiles d'araignée prennent le vent du défilement (toutes tailles d'écran) ----------
  if (root.dataset.saison === "halloween") {
    // Les variables sont posées sur le calque des toiles seulement (sur la racine, toute la page serait recalculée).
    const toilesEl = document.querySelector(".toiles");
    let last = scrollY, pos = 0, vel = 0, raf = 0;
    const tick = () => {
      vel += -pos * .03; vel *= .92; pos = Math.max(-6, Math.min(6, pos + vel));
      if (!toilesEl) return;
      toilesEl.style.setProperty("--vent", pos.toFixed(3)); toilesEl.style.setProperty("--vent-abs", Math.abs(pos).toFixed(3));
      if (Math.abs(pos) + Math.abs(vel) > .004) raf = requestAnimationFrame(tick);
      else { raf = 0; toilesEl.style.setProperty("--vent", "0"); toilesEl.style.setProperty("--vent-abs", "0"); }
    };
    addEventListener("scroll", () => {
      const dy = scrollY - last; last = scrollY;
      vel += Math.max(-.9, Math.min(.9, dy * .01));
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
  }

  // ---------- Draperies : un ressort amorti, comme un tissu lourd ----------
  // Le défilement donne une impulsion : le bas des draperies part, dépasse, revient et se calme.
  // Le bas est découpé en bandes qui suivent la bande du dessus avec un retard (vague dans le tissu),
  // le haut gonfle un peu selon la vitesse, et le gland de l'embrasse se balance en dernier.
  const drapes = [...document.querySelectorAll(".draperie")];
  if (drapes.length) {
    const N = 4, hist = new Array(N * 5 + 6).fill(0);
    let last = scrollY, pos = 0, vel = 0, puff = 0, raf = 0, geo = [];
    const construit = () => {
      geo = drapes.map((d) => {
        d.querySelectorAll(".tranche, .gland").forEach((x) => x.remove());
        const W = d.offsetWidth, H = innerHeight;
        if (!W) { d.classList.remove("tranches"); return null; }
        const droite = d.classList.contains("d"), h = H * .4 / N, tr = [];
        for (let k = 0; k < N; k++) {
          const t = mk("i", "tranche"), T = H * .6 + k * h;
          t.style.top = T.toFixed(1) + "px"; t.style.height = (h + 1).toFixed(1) + "px";
          t.style.setProperty("--py", (-T).toFixed(1) + "px"); t.style.setProperty("--ph", H + "px");
          const f0 = k / N, f1 = (k + 1) / N;
          t.style.clipPath = droite
            ? "polygon(" + (W * (.6 - .4 * f0)).toFixed(1) + "px 0, 100% 0, 100% 100%, " + (W * (.6 - .4 * f1)).toFixed(1) + "px 100%)"
            : "polygon(0 0, " + (76 + W * (.4 + .4 * f0)).toFixed(1) + "px 0, " + (76 + W * (.4 + .4 * f1)).toFixed(1) + "px 100%, 0 100%)";
          d.append(t); tr.push(t);
        }
        const gl = mk("i", "gland"); d.append(gl);
        d.classList.add("tranches");
        return { d, tr, gl, h, sens: droite ? -1 : 1 };
      });
    };
    const apply = () => geo.forEach((g) => {
      if (!g) return;
      g.d.style.setProperty("--gonfle", (1 + puff).toFixed(4));
      let off = 0;
      g.tr.forEach((t, k) => {
        const a = hist[k * 5] * (.7 + .3 * k) * g.sens;
        t.style.transform = "translateX(" + off.toFixed(2) + "px) skewX(" + a.toFixed(3) + "deg)";
        off += g.h * Math.tan(a * Math.PI / 180);
      });
      g.gl.style.transform = "rotate(" + (-hist[hist.length - 1] * 2.6 * g.sens).toFixed(2) + "deg)";
    });
    const tick = () => {
      vel += -pos * .025; vel *= .94; pos = Math.max(-10, Math.min(10, pos + vel)); puff *= .94;
      hist.unshift(pos); hist.pop();
      apply();
      if (Math.abs(pos) + Math.abs(vel) + puff + hist.reduce((m, v) => Math.max(m, Math.abs(v)), 0) > .003) raf = requestAnimationFrame(tick);
      else { raf = 0; pos = vel = puff = 0; hist.fill(0); apply(); }
    };
    construit();
    let rT = 0; addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => { construit(); apply(); }, 200); });
    addEventListener("scroll", () => {
      const dy = scrollY - last; last = scrollY;
      if (innerWidth < 1300 || !geo.some(Boolean)) return;
      vel += Math.max(-1.1, Math.min(1.1, dy * .008));
      puff = Math.min(.07, puff + Math.abs(dy) * .0003);
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
  }

  // ---------- Poussière dans le faisceau, seulement quand on la voit ----------
  document.querySelectorAll(".beam canvas").forEach((cv) => {
    if ((navigator.hardwareConcurrency || 4) < 4) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    let w = 0, h = 0, raf = 0, seen = false, motes = [];
    const size = () => {
      w = cv.clientWidth; h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      motes = Array.from({ length: 70 }, () => ({
        x: w / 2 + (Math.random() - .5) * w * .5, y: Math.random() * h, r: .5 + Math.random() * 1.5,
        vx: (Math.random() - .5) * .14, vy: -.03 - Math.random() * .08, t: Math.random() * 6.3, s: .006 + Math.random() * .012,
      }));
    };
    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      for (const m of motes) {
        m.t += m.s; m.x += m.vx + Math.sin(m.t) * .12; m.y += m.vy + Math.cos(m.t * .7) * .06;
        if (m.y < 0) m.y = h; if (m.x < w * .2) m.x = w * .8; if (m.x > w * .8) m.x = w * .2;
        const a = (.3 + .7 * (.5 + .5 * Math.sin(m.t * 2.6))) * (1 - m.y / h * .75);
        ctx.fillStyle = "rgba(255,236,205," + a.toFixed(3) + ")";
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 6.283); ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    const run = () => { cancelAnimationFrame(raf); raf = 0; if (seen && !document.hidden) raf = requestAnimationFrame(frame); };
    size(); addEventListener("resize", size);
    new IntersectionObserver(([e]) => { seen = e.isIntersecting; run(); }).observe(cv);
    document.addEventListener("visibilitychange", run);
  });
})();
`;
