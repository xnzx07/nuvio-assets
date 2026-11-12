/**
 * Les feuilles de style, les scripts et les polices des pages du site (hall, guide, salle 2…), servis à part
 * sur /statique/<nom>?v=<empreinte> au lieu d'être recopiés dans chaque page : le navigateur les garde
 * en cache (un an) et ne les retélécharge plus d'une salle à l'autre, ni à la visite suivante.
 * L'empreinte change avec le contenu : une nouvelle version du site est redemandée tout de suite.
 * Tout vient du worker lui-même : les copies (Cloudflare, Docker) servent les leurs, sans rien chercher ailleurs.
 */
import { STAGE_CSS, STAGE_JS } from "./stage.js";
import { APERCU_CSS, APERCU_JS } from "./apercu.js";
import { NUVIO_CSS, NUVIO_JS, AFFICHES_JS } from "./nuvio.js";
import { REGLAGES_CSS, REGLAGES_JS } from "./reglages.js";
import { LIENS_JS } from "./liens.js";
import { POLICES, policesCss } from "./polices.js";
import { QRCODE_JS } from "./tiers/qrcode.js";
import { outilsJs } from "./outils.js";
import { SALLE2_CSS, SALLE2_FIN_CSS, SALLE2_JS, HOTE_JS } from "./page.js";
import { GUIDE_CSS, GUIDE_RECLAMES_CSS, GUIDE_FIN_CSS, GUIDE_JS, GUIDE_FIN_JS } from "./guide.js";
import { VERIFS_CSS, VERIFS_JS } from "./guide-verifs.js";
import { GUICHET_CSS, GUICHET_JS } from "./guichet.js";
import { SOIREE_CSS, SOIREE_JS } from "./soiree.js";
import { GALERIE_CSS, GALERIE_JS } from "./galerie.js";
import { PROFILS_CSS, PROFILS_JS } from "./profils.js";

// Construits au premier besoin : les pages importent ce fichier, et lui importe leurs styles et leurs scripts.
let fichiers = null;
const FICHIERS = () => fichiers || (fichiers = {
  "scene.css": STAGE_CSS, "scene.js": STAGE_JS,
  "nuvio.css": NUVIO_CSS, "nuvio.js": NUVIO_JS, "affiches.js": AFFICHES_JS,
  "apercu.css": APERCU_CSS, "apercu.js": APERCU_JS,
  "reglages.css": REGLAGES_CSS, "reglages.js": REGLAGES_JS,
  "liens.js": LIENS_JS,
  "salle2.css": SALLE2_CSS, "salle2-fin.css": SALLE2_FIN_CSS, "salle2.js": SALLE2_JS, "salle2-hote.js": HOTE_JS,
  // Salle 2, ajouts à part : le guichet (3 questions, programmations toutes prêtes), la soirée à deux, la galerie
  // des styles d'affiches (régie).
  "salle2-guichet.css": GUICHET_CSS, "salle2-guichet.js": GUICHET_JS,
  "salle2-soiree.css": SOIREE_CSS, "salle2-soiree.js": SOIREE_JS,
  "salle2-galerie.css": GALERIE_CSS, "salle2-galerie.js": GALERIE_JS,
  // Mes profils : un lien fixe par membre de la famille (profils.js).
  "salle2-profils.css": PROFILS_CSS, "salle2-profils.js": PROFILS_JS,
  "guide.css": GUIDE_CSS, "guide-reclames.css": GUIDE_RECLAMES_CSS, "guide-fin.css": GUIDE_FIN_CSS,
  "guide.js": GUIDE_JS, "guide-fin.js": GUIDE_FIN_JS,
  "guide-verifs.css": VERIFS_CSS, "guide-verifs.js": VERIFS_JS,
  // qrcode-generator 1.4.4 (licence MIT, en tête du fichier), tel que publié sur npm.
  "qrcode.js": QRCODE_JS,
  // Ceux-là citent d'autres fichiers d'ici, avec leur empreinte.
  "outils.js": () => outilsJs(adresse("qrcode.js")),
  "polices.css": () => policesCss(adresse),
  ...Object.fromEntries(POLICES.map(([f, contenu]) => ["polices/" + f, contenu])),
});
const contenus = {};
const contenu = (nom) => {
  if (!(nom in contenus)) { const c = FICHIERS()[nom]; contenus[nom] = typeof c === "function" ? c() : c; }
  return contenus[nom];
};
const TYPES = { css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8", woff2: "font/woff2" };

// FNV-1a sur le texte (ou les octets d'une police) : calculée une fois par fichier, au premier besoin.
const empreintes = {};
const empreinte = (nom) => {
  if (!empreintes[nom]) {
    let h = 0x811c9dc5;
    const c = contenu(nom);
    if (typeof c === "string") for (let i = 0; i < c.length; i++) { h ^= c.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    else { const u = new Uint8Array(c); for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 0x01000193); } }
    empreintes[nom] = (h >>> 0).toString(36);
  }
  return empreintes[nom];
};

// Adresses depuis la racine : valables aussi sur les anciens liens /<config>/ et sur les copies.
const adresse = (nom) => `/statique/${nom}?v=${empreinte(nom)}`;
/** Les balises à écrire dans la page, à la place du contenu, dans le même ordre. */
export const feuilles = (...noms) => noms.map((n) => `<link rel="stylesheet" href="${adresse(n)}">`).join("\n");
export const scripts = (...noms) => noms.map((n) => `<script src="${adresse(n)}"></script>`).join("\n");
/** L'adresse versionnée d'un fichier, pour un script qui le charge plus tard (hall : l'aperçu au premier clic). */
export const adresseStatique = adresse;

/** Les noms de tous les fichiers (« scene.css », « polices/… ») : écrits en fichiers statiques par construire/statiques.mjs. */
export const nomsStatiques = () => Object.keys(FICHIERS());
/** Le contenu d'un fichier (texte, ou ArrayBuffer d'une police) ; undefined s'il n'existe pas. Pour les tests. */
export const contenuStatique = (nom) => (Object.hasOwn(FICHIERS(), nom) ? contenu(nom) : undefined);

/** Réponse à /statique/<nom> ; null si le fichier n'existe pas. */
export function statique(nom, version) {
  if (!Object.hasOwn(FICHIERS(), nom)) return null;
  // Ancienne empreinte (page restée ouverte pendant une mise à jour) : contenu actuel, gardé une minute seulement.
  const cache = version === empreinte(nom) ? "public, max-age=31536000, immutable" : "public, max-age=60";
  return new Response(contenu(nom), { headers: { "Content-Type": TYPES[nom.split(".").pop()], "Cache-Control": cache } });
}
