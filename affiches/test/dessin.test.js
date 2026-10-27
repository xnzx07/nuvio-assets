import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { draw, SIZES } from "../lib/dessin.js";

const gris = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 128, g: 128, b: 128 } } }).jpeg().toBuffer();
const logoPng = () => sharp({ create: { width: 600, height: 200, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"><rect width="300" height="100" fill="#fff"/></svg>`;

/** Faux fetch d'images TMDB : chemin → { corps, type } ; tout le reste répond 404. */
function images(map) {
  return async (url) => {
    const path = "/" + String(url).split("/").pop();
    const it = map[path];
    if (!it) return new Response("absent", { status: 404 });
    return new Response(await it.corps(), { headers: { "Content-Type": it.type } });
  };
}

const STYLES = { statut: "texte", tendance: "fleche", qualite: "texte", titre: 1, note: "etoile", texte: 1, sep: "point", haut: 1, fondu: { couleur: "noir", force: "m" } };
const base = { shape: "poster", image: "/base.jpg", full: true, gris: false, logo: "/logo.png", line: { genre: "SF", note: "8,4", annee: "2024" }, statut: null, rank: 4, quality: { extra: "DV" }, styles: STYLES };
const f = images({
  "/base.jpg": { corps: () => gris(500, 750), type: "image/jpeg" },
  "/large.jpg": { corps: () => gris(1280, 720), type: "image/jpeg" },
  "/logo.png": { corps: logoPng, type: "image/png" },
  "/logo.svg": { corps: async () => Buffer.from(LOGO_SVG), type: "image/svg+xml" },
});

/** Moyenne (canal rouge) du quart du bas d'une image. */
async function moyenneBas(buf) {
  const { width, height } = await sharp(buf).metadata();
  const q = Math.floor(height / 4);
  // stats() lit l'image d'entrée : on découpe d'abord dans un nouveau tampon.
  const zone = await sharp(buf).extract({ left: 0, top: height - q, width, height: q }).toBuffer();
  const s = await sharp(zone).stats();
  return s.channels[0].mean;
}

test("taille portrait", async () => {
  const m = await sharp(await draw(base, f)).metadata();
  assert.equal(m.format, "jpeg");
  assert.deepEqual([m.width, m.height], SIZES.poster);
  assert.deepEqual(SIZES.poster, [400, 600]);
});

test("taille paysage", async () => {
  const m = await sharp(await draw({ ...base, shape: "landscape", image: "/large.jpg" }, f)).metadata();
  assert.deepEqual([m.width, m.height], [800, 450]);
});

test("paysage : image de fond en w780 (assez pour 800 px, 3 fois plus léger que w1280)", async () => {
  const urls = [];
  await draw({ ...base, shape: "landscape", image: "/large.jpg" }, async (u, o) => { urls.push(String(u)); return f(u, o); });
  assert.ok(urls.some((u) => u.endsWith("/w780/large.jpg")), urls.join(" "));
});

test("logo svg", async () => {
  const buf = await draw({ ...base, logo: "/logo.svg" }, f);
  assert.equal((await sharp(buf).metadata()).format, "jpeg");
});

test("bas intact sans logo ni image sans texte", async () => {
  const buf = await draw({ ...base, full: false, logo: null, line: null }, f);
  assert.ok(Math.abs(await moyenneBas(buf) - 128) <= 3, `bas modifié : ${await moyenneBas(buf)}`);
});

test("bas assombri sous la ligne", async () => {
  // Sans logo (blanc, il éclaircirait la zone mesurée) : on mesure le dégradé seul.
  const buf = await draw({ ...base, logo: null, line: { genre: "SF" }, rank: null, quality: null }, f);
  assert.ok(await moyenneBas(buf) <= 88, `pas assez sombre : ${await moyenneBas(buf)}`);
});

/** Centre horizontal de la zone blanche (> 240) d'une affiche : là où est le logo blanc opaque. */
async function centreBlanc(buf) {
  const { data, info } = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
  let min = info.width, max = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[y * info.width + x] > 240) { min = Math.min(min, x); max = Math.max(max, x); }
  return (min + max) / 2;
}
const logoFait = (svg) => ({ corps: async () => sharp(Buffer.from(svg)).png().toBuffer(), type: "image/png" });

test("logo : les marges transparentes ne décentrent pas le nom", async () => {
  // Bloc blanc de 300 px puis 100 px de vide à droite.
  const g = images({ "/base.jpg": { corps: () => gris(500, 750), type: "image/jpeg" },
    "/marge.png": logoFait(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect width="300" height="100" fill="#fff"/></svg>`) });
  const buf = await draw({ ...base, logo: "/marge.png", line: null, rank: null, quality: null }, g);
  assert.ok(Math.abs(await centreBlanc(buf) - 200) <= 3, `centre ${await centreBlanc(buf)}`);
});

test("logo : une traînée pâle d'un côté compte moins que les lettres", async () => {
  // Lettres opaques (300 px) puis une traînée semi-transparente de 60 px à droite (comme le logo de
  // Dune : Troisième partie) : ce sont les lettres qui sont centrées, pas la traînée.
  const g = images({ "/base.jpg": { corps: () => gris(500, 750), type: "image/jpeg" },
    "/trainee.png": logoFait(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="100"><rect width="300" height="100" fill="#fff"/><rect x="300" width="60" height="100" fill="#fff" fill-opacity="0.4"/></svg>`) });
  const buf = await draw({ ...base, logo: "/trainee.png", line: null, rank: null, quality: null }, g);
  assert.ok(Math.abs(await centreBlanc(buf) - 200) <= 3, `lettres à ${await centreBlanc(buf)}`);
});

test("image introuvable : erreur", async () => {
  await assert.rejects(draw({ ...base, image: "/absente.jpg" }, f));
});

test("logo introuvable sur une image sans texte : erreur, jamais une affiche sans titre", async () => {
  await assert.rejects(draw({ ...base, logo: "/absent.png" }, f));
});

test("logo svg géant : dessiné vite et bien centré", async () => {
  const geant = `<svg xmlns="http://www.w3.org/2000/svg" width="6000" height="2000"><rect width="6000" height="2000" fill="#fff"/></svg>`;
  const g = images({ "/base.jpg": { corps: () => gris(500, 750), type: "image/jpeg" }, "/geant.svg": { corps: async () => Buffer.from(geant), type: "image/svg+xml" } });
  const t0 = Date.now();
  const buf = await draw({ ...base, logo: "/geant.svg", line: null, rank: null, quality: null }, g);
  assert.ok(Date.now() - t0 < 800, `trop long : ${Date.now() - t0} ms`);
  assert.ok(Math.abs(await centreBlanc(buf) - 200) <= 3, `logo à ${await centreBlanc(buf)}`);
});

// ---------- styles de la régie ----------
const uni = (r, g, b) => () => sharp({ create: { width: 500, height: 750, channels: 3, background: { r, g, b } } }).jpeg().toBuffer();
const avec = (fond) => images({ "/base.jpg": { corps: fond, type: "image/jpeg" }, "/logo.png": { corps: logoPng, type: "image/png" } });
async function zone(buf, left, top, width, height) {
  const z = await sharp(buf).extract({ left, top, width, height }).toBuffer();
  return (await sharp(z).stats()).channels.map((c) => c.mean);
}
async function pixels(buf, left, top, width, height) {
  return sharp(await sharp(buf).extract({ left, top, width, height }).toBuffer()).raw().toBuffer({ resolveWithObject: true });
}

test("la ligne du bas est dessinée", async () => {
  const sans = await draw({ ...base, logo: null, line: null, rank: null, quality: null }, f);
  const avecLigne = await draw({ ...base, logo: null, rank: null, quality: null }, f);
  const [a] = await zone(sans, 100, 560, 200, 30), [b] = await zone(avecLigne, 100, 560, 200, 30);
  assert.ok(b > a + 8, `ligne absente : ${a} → ${b}`);
});

test("gris : l'image devient grise, les badges gardent leur couleur", async () => {
  const buf = await draw({ ...base, gris: true, line: null, logo: null, quality: null }, avec(uni(200, 40, 40)));
  const [r, g] = await zone(buf, 100, 250, 200, 100);
  assert.ok(Math.abs(r - g) <= 3, `pas gris : R ${r} G ${g}`);
  const { data, info } = await pixels(buf, 0, 0, 120, 60);
  let dore = false;
  for (let i = 0; i < data.length; i += info.channels) if (data[i] - data[i + 2] > 80) dore = true;
  assert.ok(dore, "la flèche dorée a disparu");
});

test("fondu : plus sombre en fort qu'en léger", async () => {
  const leger = await draw({ ...base, logo: null, line: null, rank: null, quality: null, styles: { ...STYLES, fondu: { couleur: "noir", force: "s" } } }, f);
  const fort = await draw({ ...base, logo: null, line: null, rank: null, quality: null, styles: { ...STYLES, fondu: { couleur: "noir", force: "l" } } }, f);
  assert.ok(await moyenneBas(fort) < await moyenneBas(leger) - 5);
});

test("fondu aux couleurs de l'affiche", async () => {
  const sans = { ...base, logo: null, line: null, rank: null, quality: null };
  const teinte = await draw({ ...sans, styles: { ...STYLES, fondu: { couleur: "affiche", force: "l" } } }, avec(uni(200, 40, 40)));
  const noir = await draw({ ...sans, styles: { ...STYLES, fondu: { couleur: "noir", force: "l" } } }, avec(uni(200, 40, 40)));
  const [rt, , bt] = await zone(teinte, 0, 560, 400, 40), [rn] = await zone(noir, 0, 560, 400, 40);
  assert.ok(rt > rn + 15 && rt > bt + 20, `pas teinté : rouge ${rt} (noir ${rn}), bleu ${bt}`);
});

test("styles : chaque choix se dessine", async () => {
  const essais = [
    { statut: "NOUVEAU", styles: { ...STYLES, statut: "texte" } }, { statut: "EN SALLE", styles: { ...STYLES, statut: "etiquette" } },
    { styles: { ...STYLES, tendance: "ruban" } },
    { styles: { ...STYLES, qualite: "pastille" } }, { quality: { extra: null } },
    { styles: { ...STYLES, note: "nu" } }, { styles: { ...STYLES, note: "grand" } }, { line: { note: "8,4" }, styles: { ...STYLES, note: "grand" } },
    { styles: { ...STYLES, texte: 0.7, sep: "barre" } }, { styles: { ...STYLES, texte: 1.4, sep: "puce" } },
    { styles: { ...STYLES, titre: 0.6 } }, { styles: { ...STYLES, haut: 1.4 } }, { styles: { ...STYLES, titre: 1.4 } },
    { line: { genre: "SF", note: "8,4", source: "tmdb", annee: "2024", age: "16" }, styles: { ...STYLES, note: "badge", police: "bebas", place: "gauche" } },
    { line: { note: "8,4", age: "12" }, styles: { ...STYLES, note: "grand", place: "centre", fondu: { couleur: "affiche", force: "l", flou: true } } },
    { statut: "AU CINÉMA LE 16 DÉC. 2027", styles: { ...STYLES, police: "bebas", haut: 1.4 } },
    { bandeau: { texte: "NOUVEAU", coin: "g" }, statut: null, styles: { ...STYLES, badges: { style: "verre", forme: "carre", opacite: "s", couleur: "or" }, inverse: true, accent: "affiche", vignette: true, voile: "l", barre: "verre", monte: 0.3, large: 1.4 } },
    { line: { genre: "SF", note: "8,4", noteN: 5, notes: [{ s: "mc", v: "45", n: 4.5 }], duree: "3 saisons", ordre: "agn" }, quality: { label: "4K", extra: "DV", atmos: true }, styles: { ...STYLES, couleurNote: "halo", barre: "fine", badges: { style: "contour", forme: "arrondi", opacite: "m", couleur: "blanc" }, fondu: { couleur: "noir", force: "l", hauteur: "long", flou: true } } },
    { logo: null, line: { genre: "SF", note: "8,4" }, styles: { ...STYLES, note: "grand", couleurNote: "oui" } },
    { line2: "Le destin d'un peuple, une très longue accroche qui ne tient pas sur une seule ligne de l'affiche", culte: true, styles: { ...STYLES, police: "elegante", casse: "maj", espace: "aere", ombre: "aucune", effet: "halo", texteC: "#46c46e", accentC: "#a970ff", cadre: "#f5c518", retouche: { lum: 0.7, contraste: 1.3, satur: 0, filtre: "froid", grain: true }, coins: { statut: "bg", qualite: "bd" } } },
    { culte: true, statut: "NOUVEAU", styles: { ...STYLES, police: "condensee", effet: "ombre", retouche: { filtre: "chaud", satur: 1.6 }, coins: { statut: "hd", qualite: "hg" } } },
    { line2: "Créée par Vince Gilligan", styles: { ...STYLES, police: "arrondie", badges: { style: "plein", forme: "pilule", opacite: "m", couleur: "noir", fond: "#a8f0ff" } } },
  ];
  for (const e of essais) {
    for (const shape of ["poster", "landscape"]) {
      const m = await sharp(await draw({ ...base, ...e, shape, image: shape === "landscape" ? "/large.jpg" : "/base.jpg" }, f)).metadata();
      assert.deepEqual([m.width, m.height], SIZES[shape], JSON.stringify(e));
    }
  }
});

test("statut en étiquette : une pastille crème en haut à gauche", async () => {
  const buf = await draw({ ...base, rank: null, statut: "NOUVEAU", styles: { ...STYLES, statut: "etiquette" } }, f);
  const { data, info } = await pixels(buf, 0, 0, 160, 50);
  let creme = 0;
  for (let i = 0; i < data.length; i += info.channels) if (data[i] > 225 && data[i + 1] > 215 && data[i + 2] > 190) creme++;
  assert.ok(creme > 200, `pas d'étiquette : ${creme}`);
});

test("grand chiffre : centré en bas", async () => {
  const buf = await draw({ ...base, logo: null, line: { note: "8,4" }, rank: null, quality: null, styles: { ...STYLES, note: "grand", fondu: { couleur: "noir", force: "l" } } }, f);
  const { data, info } = await pixels(buf, 0, 450, 400, 150);
  let min = 400, max = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) { const i = (y * info.width + x) * info.channels; if (data[i] > 225 && data[i + 1] > 225 && data[i + 2] > 225) { min = Math.min(min, x); max = Math.max(max, x); } }
  assert.ok(max > 0, "chiffre absent");
  assert.ok(Math.abs((min + max) / 2 - 200) <= 10, `centre ${(min + max) / 2}`);
  assert.ok(max - min > 60, `trop petit : ${max - min}`);
});

// Paysage : le logo en bas à gauche, la ligne du bas en petit en bas à droite (comme une carte de plateforme).
test("paysage : logo à gauche, ligne à droite", async () => {
  const buf = await draw({ ...base, shape: "landscape", image: "/large.jpg", rank: null, quality: null }, f);
  const blancs = async (left, width) => {
    const { data, info } = await pixels(buf, left, 300, width, 150);
    let n = 0;
    for (let i = 0; i < data.length; i += info.channels) if (data[i] > 225 && data[i + 1] > 225 && data[i + 2] > 225) n++;
    return n;
  };
  assert.ok(await blancs(0, 300) > 2000, "logo absent à gauche");
  assert.ok(await blancs(400, 180) < 50, "le milieu doit rester libre");
  assert.ok(await blancs(560, 240) > 150, "ligne absente à droite");
});

test("taille des badges du haut réglable à la main", async () => {
  const largeur = async (haut) => {
    const buf = await draw({ ...base, logo: null, line: null, quality: null, rank: 4, styles: { ...STYLES, haut } }, f);
    const { data, info } = await pixels(buf, 0, 0, 200, 80);
    let max = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) { const i = (y * info.width + x) * info.channels; if (data[i] > 225 && data[i + 1] > 225 && data[i + 2] > 225) max = Math.max(max, x); }
    return max;
  };
  assert.ok(await largeur(1.4) > await largeur(0.6) + 20);
});

// Affiche rouge-magenta (le rouge domine, plus de bleu que de vert) : la teinte doit rester une vraie couleur, pas du noir.
test("fondu aux couleurs d'une affiche magenta", async () => {
  const sans = { ...base, logo: null, line: null, rank: null, quality: null };
  const teinte = await draw({ ...sans, styles: { ...STYLES, fondu: { couleur: "affiche", force: "l" } } }, avec(uni(160, 40, 100)));
  const noir = await draw({ ...sans, styles: { ...STYLES, fondu: { couleur: "noir", force: "l" } } }, avec(uni(160, 40, 100)));
  const [rt] = await zone(teinte, 0, 560, 400, 40), [rn] = await zone(noir, 0, 560, 400, 40);
  assert.ok(rt > rn + 15, `teinte noire : rouge ${rt} (noir ${rn})`);
});

// Dolby Vision : le logo (deux « D » arrondis face à face), pas le texte « DV ». HDR reste écrit en toutes lettres.
test("qualité : logo Dolby Vision", async () => {
  const { elementsQualite } = await import("../lib/dessin.js");
  const texte = (n) => JSON.stringify(n);
  const dv = elementsQualite("DV", 26, false);
  assert.match(texte(dv), /"type":"svg"/);
  assert.doesNotMatch(texte(dv), /"DV"/);
  // D de gauche : bord plat à x = 3, arrondi vers la droite ; D de droite : bord plat à x = 45, arrondi vers la gauche.
  const { DOLBY } = await import("../lib/dessin.js");
  assert.match(DOLBY, /^M3 2h10a10 10 0 0 1 0 20H3zM45 2H35a10 10 0 0 0 0 20h10z$/);
  const hdr = elementsQualite("HDR", 26, false);
  assert.match(texte(hdr), /"HDR"/);
  assert.doesNotMatch(texte(hdr), /"type":"svg"/);
  assert.match(texte(elementsQualite(null, 26, false)), /"4K"/);
});

// ---------- ajouts inspirés de Viewio et Posters+ ----------
const compte = async (buf, [left, top, width, height], ok) => {
  const { data, info } = await pixels(buf, left, top, width, height);
  let n = 0;
  for (let i = 0; i < data.length; i += info.channels) if (ok(data[i], data[i + 1], data[i + 2])) n++;
  return n;
};
const blanc = (r, g, b) => r > 225 && g > 225 && b > 225;
const seul = { ...base, logo: null, rank: null, quality: null };

test("note en badge : pastille jaune IMDb, bleue TMDB", async () => {
  const jaune = (r, g, b) => r > 200 && g > 150 && b < 90, bleu = (r, g, b) => r < 90 && g > 140 && b > 190;
  const imdb = await draw({ ...seul, line: { genre: "SF", note: "8,4", source: "imdb", annee: "2024" }, styles: { ...STYLES, note: "badge" } }, f);
  assert.ok(await compte(imdb, [0, 520, 400, 80], jaune) > 150, "pas de badge jaune");
  const tmdb = await draw({ ...seul, line: { note: "8,1", source: "tmdb" }, styles: { ...STYLES, note: "badge" } }, f);
  assert.ok(await compte(tmdb, [0, 520, 400, 80], bleu) > 150, "pas de badge bleu");
});

test("âge : un cadre de plus au bout de la ligne", async () => {
  const droite = async (line) => {
    const { data, info } = await pixels(await draw({ ...seul, line }, f), 0, 540, 400, 60);
    let max = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) { const i = (y * info.width + x) * info.channels; if (blanc(data[i], data[i + 1], data[i + 2])) max = Math.max(max, x); }
    return max;
  };
  const ligne = { genre: "SF", note: "8,4", annee: "2024" };
  assert.ok(await droite({ ...ligne, age: "12" }) > await droite(ligne) + 15);
});

test("police cinéma : un autre dessin des lettres", async () => {
  const inter = await draw({ ...seul, statut: "NOUVEAU" }, f);
  const bebas = await draw({ ...seul, statut: "NOUVEAU", styles: { ...STYLES, police: "bebas" } }, f);
  const [pa, pb] = [await pixels(inter, 0, 520, 400, 80), await pixels(bebas, 0, 520, 400, 80)];
  let differents = 0;
  for (let i = 0; i < pa.data.length; i++) if (Math.abs(pa.data[i] - pb.data[i]) > 60) differents++;
  assert.ok(differents > 500, `même dessin : ${differents}`);
});

test("place du titre : à gauche, au centre", async () => {
  const centre = async (shape, place) => centreBlanc(await draw({ ...base, shape, image: shape === "landscape" ? "/large.jpg" : "/base.jpg", line: null, rank: null, quality: null, styles: { ...STYLES, place } }, f));
  // Logo de 320 px de large : collé à la marge de gauche (20 px), son centre est à 180 px (200 au centre).
  assert.ok(Math.abs(await centre("poster", "gauche") - 180) <= 3, "affiche : logo pas à gauche");
  assert.ok(Math.abs(await centre("landscape", "centre") - 400) <= 4, "paysage : logo pas au centre");
  assert.ok(await centre("landscape", undefined) < 250, "paysage par défaut : à gauche");
});

test("fondu flou : le bas de l'image est adouci", async () => {
  const rayures = () => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750"><defs><pattern id="p" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="3" height="6" fill="#fff"/><rect x="3" width="3" height="6" fill="#000"/></pattern></defs><rect width="500" height="750" fill="url(#p)"/></svg>`)).jpeg().toBuffer();
  const g = avec(rayures);
  const ecart = async (flou) => {
    const buf = await draw({ ...seul, line: null, styles: { ...STYLES, fondu: { couleur: "noir", force: "s", flou } } }, g);
    const z = await sharp(buf).extract({ left: 0, top: 500, width: 400, height: 60 }).toBuffer();
    return (await sharp(z).stats()).channels[0].stdev;
  };
  const net = await ecart(undefined), doux = await ecart(true);
  assert.ok(doux < net * 0.5, `pas flou : ${net} → ${doux}`);
});

// ---------- Régie v2 ----------
const rouge = (r, g, b) => r > 200 && g < 110 && b < 110;
const vert = (r, g, b) => g > 150 && r < 120 && b < 140;
const sombre = async (buf, zoneXY) => (await zone(buf, ...zoneXY))[0];

test("v2_bandeau_dans_le_coin", async () => {
  const sans = { ...seul, line: null, statut: null };
  const avecBandeau = await draw({ ...sans, bandeau: { texte: "NOUVEAU", coin: "d" } }, f);
  const jaune = (r, g, b) => r > 200 && g > 160 && b < 90;
  assert.ok(await compte(avecBandeau, [300, 0, 100, 100], jaune) > 400, "pas de bandeau en haut à droite");
  assert.ok(await compte(avecBandeau, [0, 0, 100, 100], jaune) < 20, "bandeau du mauvais côté");
  const gauche = await draw({ ...sans, bandeau: { texte: "N°2", coin: "g" } }, f);
  assert.ok(await compte(gauche, [0, 0, 100, 100], jaune) > 400, "pas de bandeau en haut à gauche");
});

test("v2_accent_et_note_coloree", async () => {
  const accent = await draw({ ...seul, styles: { ...STYLES, accent: "rouge" } }, f);
  assert.ok(await compte(accent, [0, 520, 400, 80], rouge) > 40, "étoile pas rouge");
  const coloree = await draw({ ...seul, line: { note: "8,4", noteN: 8.4 }, styles: { ...STYLES, couleurNote: "oui" } }, f);
  assert.ok(await compte(coloree, [0, 520, 400, 80], vert) > 80, "note pas verte");
});

test("v2_autres_notes", async () => {
  const buf = await draw({ ...seul, line: { note: "8,4", notes: [{ s: "rt", v: "94 %", n: 9.4 }, { s: "lb", v: "4,1", n: 8.2 }] } }, f);
  assert.ok(await compte(buf, [0, 520, 400, 80], rouge) > 40, "pas de pastille RT");
  const bleu = (r, g, b) => b > 200 && r < 120 && g > 150;
  assert.ok(await compte(buf, [0, 520, 400, 80], bleu) > 5, "pas de points Letterboxd");
});

test("v2_ordre_et_duree", async () => {
  const a = await draw({ ...seul, line: { genre: "SF", note: "8,4", annee: "2024", duree: "2 h 46" } }, f);
  const b = await draw({ ...seul, line: { genre: "SF", note: "8,4", annee: "2024" } }, f);
  const [da, db] = [await pixels(a, 0, 540, 400, 60), await pixels(b, 0, 540, 400, 60)];
  let changes = 0;
  for (let i = 0; i < da.data.length; i++) if (Math.abs(da.data[i] - db.data[i]) > 40) changes++;
  assert.ok(changes > 300, "durée absente");
  const ordre = await draw({ ...seul, line: { genre: "SF", note: "8,4", annee: "2024", ordre: "nga" } }, f);
  const [pa, pb] = [await pixels(b, 0, 540, 400, 60), await pixels(ordre, 0, 540, 400, 60)];
  let diff = 0;
  for (let i = 0; i < pa.data.length; i++) if (Math.abs(pa.data[i] - pb.data[i]) > 60) diff++;
  assert.ok(diff > 300, "ordre sans effet");
});

test("v2_barre_verre_et_fine", async () => {
  const rayures = () => sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750"><defs><pattern id="p" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="3" height="6" fill="#fff"/><rect x="3" width="3" height="6" fill="#000"/></pattern></defs><rect width="500" height="750" fill="url(#p)"/></svg>')).jpeg().toBuffer();
  const g = avec(rayures);
  const ecart = async (barre) => {
    const buf = await draw({ ...seul, line: { genre: "SF" }, styles: { ...STYLES, fondu: null, barre } }, g);
    const z = await sharp(buf).extract({ left: 0, top: 590, width: 60, height: 8 }).toBuffer();
    return (await sharp(z).stats()).channels[0].stdev;
  };
  assert.ok(await ecart("verre") < (await ecart(undefined)) * 0.5, "pas de verre flouté sous la ligne");
  const fine = await draw({ ...seul, line: { genre: "SF" }, styles: { ...STYLES, barre: "fine", accent: "rouge" } }, f);
  assert.ok(await compte(fine, [150, 520, 100, 60], rouge) > 60, "pas de barre fine");
});

test("v2_badges_communs_et_inverse", async () => {
  const plein = await draw({ ...seul, line: null, statut: "NOUVEAU", styles: { ...STYLES, badges: { style: "plein", forme: "pilule", opacite: "l", couleur: "noir" } } }, f);
  const creme = (r, g, b) => r > 225 && g > 215 && b > 190;
  assert.ok(await compte(plein, [0, 0, 160, 50], creme) > 200, "pas de badge plein");
  const inverse = await draw({ ...seul, line: null, quality: { extra: "DV" }, styles: { ...STYLES, inverse: true } }, f);
  assert.ok(await compte(inverse, [0, 0, 150, 60], blanc) > 80, "qualité pas passée à gauche");
  assert.ok(await compte(inverse, [250, 0, 150, 60], blanc) < 20, "qualité restée à droite");
});

test("v2_plateforme_et_logo_monte", async () => {
  const netflix = () => sharp({ create: { width: 92, height: 92, channels: 3, background: { r: 229, g: 9, b: 20 } } }).png().toBuffer();
  const g = images({ "/base.jpg": { corps: () => gris(500, 750), type: "image/jpeg" }, "/logo.png": { corps: logoPng, type: "image/png" }, "/n.jpg": { corps: netflix, type: "image/png" } });
  const ligne = await draw({ ...seul, line: { genre: "SF", plateforme: "/n.jpg" } }, g);
  assert.ok(await compte(ligne, [0, 520, 400, 80], rouge) > 300, "logo de plateforme absent de la ligne");
  const coin = await draw({ ...seul, line: null, coin: "/n.jpg" }, g);
  assert.ok(await compte(coin, [300, 0, 100, 100], rouge) > 300, "logo de plateforme absent du coin");
  const hautBlanc = async (buf) => { const { data, info } = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true }); for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[y * info.width + x] > 240) return y; return -1; };
  const normal = await draw({ ...base, line: null, rank: null, quality: null }, f);
  const monte = await draw({ ...base, line: null, rank: null, quality: null, styles: { ...STYLES, monte: 0.2 } }, f);
  assert.ok(await hautBlanc(monte) < (await hautBlanc(normal)) - 100, "logo pas remonté");
});

test("v2_voile_vignette", async () => {
  const sans = await draw({ ...seul, line: null, logo: null, statut: "NOUVEAU", styles: { ...STYLES, voile: "0" } }, f);
  const avecVoile = await draw({ ...seul, line: null, logo: null, statut: "NOUVEAU" }, f);
  assert.ok(await sombre(sans, [200, 0, 200, 40]) > (await sombre(avecVoile, [200, 0, 200, 40])) + 10, "voile du haut pas retiré");
  const vignette = await draw({ ...seul, line: null, logo: null, full: false, styles: { ...STYLES, vignette: true } }, f);
  assert.ok(await sombre(vignette, [0, 250, 20, 100]) < 110, "bords pas assombris");
  assert.ok(await sombre(vignette, [180, 280, 40, 40]) > 120, "centre assombri");
});

test("v2_qualite_complete", async () => {
  const { elementsQualite } = await import("../lib/dessin.js");
  const q = JSON.stringify(elementsQualite("HDR10+", 26, false, "4K", true));
  assert.match(q, /"HDR10\+"/);
  assert.match(q, /"ATMOS"/);
  assert.match(JSON.stringify(elementsQualite(null, 26, false, "1080p", false)), /"1080p"/);
  const buf = await draw({ ...seul, line: null, quality: { label: "1080p", extra: null, atmos: true } }, f);
  assert.equal((await sharp(buf).metadata()).width, 400);
});

// Une ligne chargée (genre long, plusieurs notes, durée, âge) reste sur une seule ligne, dans les marges :
// le texte rapetisse au besoin plutôt que de passer à la ligne ou de sortir de l'affiche.
test("v2_ligne_chargee_tient", async () => {
  const line = { genre: "Science-fiction", note: "8,7", notes: [{ s: "rt", v: "94 %", n: 9.4 }, { s: "mc", v: "81", n: 8.1 }], annee: "2014", duree: "2 h 49", age: "12" };
  for (const styles of [STYLES, { ...STYLES, note: "badge" }, { ...STYLES, texte: 1.4 }]) {
    const buf = await draw({ ...seul, line, styles }, f);
    assert.equal(await compte(buf, [0, 480, 14, 120], blanc), 0, "déborde à gauche");
    assert.equal(await compte(buf, [386, 480, 14, 120], blanc), 0, "déborde à droite");
    const { data, info } = await pixels(buf, 0, 440, 400, 160);
    const lignes = new Set();
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) { const i = (y * info.width + x) * info.channels; if (blanc(data[i], data[i + 1], data[i + 2])) lignes.add(y); }
    assert.ok(Math.max(...lignes) - Math.min(...lignes) < 40, `sur plusieurs lignes : ${Math.max(...lignes) - Math.min(...lignes)} px`);
  }
});

// Revue : une ligne sans élément v2 (genre long, comme avant) n'est jamais réduite : le dessin par défaut ne change pas.
test("revue_ligne_par_defaut_pas_reduite", async () => {
  const buf = await draw({ ...seul, line: { genre: "Science-fiction", note: "8,4", annee: "2024" } }, f);
  const { data, info } = await pixels(buf, 0, 540, 400, 60);
  let min = 400, max = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) { const i = (y * info.width + x) * info.channels; if (blanc(data[i], data[i + 1], data[i + 2])) { min = Math.min(min, x); max = Math.max(max, x); } }
  assert.ok(max - min >= 270, "ligne réduite : " + (max - min) + " px");   // 284 px sans réduction, ~230 réduite
});

// Revue : l'image du film en portrait vient d'un fond 16:9 ; en w500 elle serait floue une fois recadrée.
test("revue_image_du_film_nette", async () => {
  const urls = [];
  await draw({ ...base, image: "/large.jpg", fondLarge: true }, async (u, o) => { urls.push(String(u)); return f(u, o); });
  assert.ok(urls.some((u) => u.endsWith("/w1280/large.jpg")), urls.join(" "));
});

// Revue : un texte long dans le bandeau (« AU CINÉMA LE 12 MARS 2027 ») rapetisse pour tenir dans la partie visible.
test("revue_bandeau_texte_long", async () => {
  const { tailleBandeau } = await import("../lib/dessin.js");
  const court = tailleBandeau("NOUVEAU", 18, 200), long = tailleBandeau("AU CINÉMA LE 12 MARS 2027", 18, 200);
  assert.ok(long < court, `court ${court}, long ${long}`);
  assert.ok(long * 25 * 0.62 <= 200 * 0.62, "le texte long dépasse la partie visible");
  const buf = await draw({ ...seul, line: null, bandeau: { texte: "AU CINÉMA LE 12 MARS 2027", coin: "d" } }, f);
  assert.equal((await sharp(buf).metadata()).width, 400);
});

// Revue : « Tout » dessine vraiment ATMOS (le test d'avant ne vérifiait que la largeur de l'image).
test("revue_qualite_atmos_dessinee", async () => {
  const sans = await draw({ ...seul, line: null, quality: { label: "4K", extra: null, atmos: false } }, f);
  const avecAtmos = await draw({ ...seul, line: null, quality: { label: "4K", extra: null, atmos: true } }, f);
  assert.ok(await compte(avecAtmos, [200, 0, 200, 60], blanc) > await compte(sans, [200, 0, 200, 60], blanc) + 60, "ATMOS absent");
});

// ---------- Régie v3 ----------
const difference = async (a, b, zoneXY) => {
  const [pa, pb] = [await pixels(a, ...zoneXY), await pixels(b, ...zoneXY)];
  let n = 0;
  for (let i = 0; i < pa.data.length; i++) if (Math.abs(pa.data[i] - pb.data[i]) > 40) n++;
  return n;
};
const ligneSF = { genre: "SF", note: "8,4", annee: "2024" };

test("v3_polices_casse_espace_ombre", async () => {
  const defaut = await draw({ ...seul, line: ligneSF }, f);
  for (const st of [{ police: "elegante" }, { police: "arrondie" }, { police: "condensee" }, { casse: "maj", line: { genre: "Drame" } }, { espace: "tresaere" }, { ombre: "forte" }]) {
    const { line = ligneSF, ...styles } = st;
    const buf = await draw({ ...seul, line, styles: { ...STYLES, ...styles } }, f);
    const ref = line === ligneSF ? defaut : await draw({ ...seul, line }, f);
    assert.ok(await difference(ref, buf, [0, 520, 400, 80]) > 200, JSON.stringify(st));
  }
});

test("v3_couleurs", async () => {
  const rouge = (r, g, b) => r > 190 && g < 110 && b < 120;
  const texte = await draw({ ...seul, line: { genre: "Drame" }, styles: { ...STYLES, texteC: "#e5484d" } }, f);
  assert.ok(await compte(texte, [0, 520, 400, 80], rouge) > 60, "texte pas rouge");
  const accent = await draw({ ...seul, line: { note: "8,4" }, styles: { ...STYLES, accentC: "#e5484d" } }, f);
  assert.ok(await compte(accent, [0, 520, 400, 80], rouge) > 30, "étoile pas rouge");
  const fond = await draw({ ...seul, line: null, statut: "NOUVEAU", styles: { ...STYLES, badges: { style: "plein", forme: "arrondi", opacite: "l", couleur: "blanc", fond: "#e5484d" } } }, f);
  assert.ok(await compte(fond, [0, 0, 160, 50], rouge) > 200, "fond des badges pas rouge");
  const teinte = await draw({ ...seul, line: null, logo: null, styles: { ...STYLES, fondu: { couleur: "noir", force: "l", teinte: "#1f5fd1" } } }, f);
  const [r, , b] = await zone(teinte, 0, 560, 400, 40);
  assert.ok(b > r + 15, `fondu pas bleu : r ${r} b ${b}`);
});

test("v3_retouches_et_cadre", async () => {
  const sans = await draw({ ...seul, line: null }, f);
  const [m0] = await zone(sans, 100, 250, 200, 100);
  const clair = await draw({ ...seul, line: null, styles: { ...STYLES, retouche: { lum: 1.3 } } }, f);
  assert.ok((await zone(clair, 100, 250, 200, 100))[0] > m0 + 15, "pas plus lumineux");
  const sepia = await draw({ ...seul, line: null, styles: { ...STYLES, retouche: { filtre: "sepia" } } }, f);
  const [sr, sg, sb] = await zone(sepia, 100, 250, 200, 100);
  assert.ok(sr > sg && sg > sb + 10, `pas sépia : ${sr} ${sg} ${sb}`);
  const nb = await draw({ ...seul, line: null, styles: { ...STYLES, retouche: { filtre: "nb" } } }, avec(uni(200, 40, 40)));
  const [nr, ng] = await zone(nb, 100, 250, 200, 100);
  assert.ok(Math.abs(nr - ng) < 4, "pas en noir et blanc");
  const grain = await draw({ ...seul, line: null, styles: { ...STYLES, retouche: { grain: true } } }, f);
  const sd = async (buf) => (await sharp(await sharp(buf).extract({ left: 100, top: 250, width: 200, height: 100 }).toBuffer()).stats()).channels[0].stdev;
  assert.ok(await sd(grain) > (await sd(sans)) + 2, "pas de grain");
  const cadre = await draw({ ...seul, line: null, styles: { ...STYLES, cadre: "#e5484d" } }, f);
  const rouge = (r, g, b) => r > 190 && g < 110 && b < 120;
  assert.ok(await compte(cadre, [0, 200, 6, 200], rouge) > 150, "pas de cadre");
});

test("v3_effet_du_logo", async () => {
  const sans = await draw({ ...base, line: null, rank: null, quality: null }, f);
  const ombre = await draw({ ...base, line: null, rank: null, quality: null, styles: { ...STYLES, effet: "ombre" } }, f);
  const halo = await draw({ ...base, line: null, rank: null, quality: null, styles: { ...STYLES, effet: "halo" } }, f);
  assert.ok(await difference(sans, ombre, [0, 300, 400, 300]) > 200, "pas d'ombre");
  assert.ok(await difference(sans, halo, [0, 300, 400, 300]) > 200, "pas de halo");
});

test("v3_ligne2_culte_coins", async () => {
  const sans = await draw({ ...seul, line: ligneSF }, f);
  const avecL2 = await draw({ ...seul, line: ligneSF, line2: "Un film de Denis Villeneuve" }, f);
  assert.ok(await compte(avecL2, [0, 570, 400, 30], (r, g, b) => r > 150 && g > 150 && b > 150) > 40, "pas de ligne 2 en bas");
  assert.ok(await difference(sans, avecL2, [0, 480, 400, 80]) > 200, "la ligne du bas n'est pas remontée");
  const culte = await draw({ ...seul, line: null, culte: true }, f);
  const jaune = (r, g, b) => r > 200 && g > 150 && b < 90;
  assert.ok(await compte(culte, [0, 0, 220, 80], jaune) > 60, "pas de badge Incontournable");
  const coin = await draw({ ...seul, line: ligneSF, statut: "NOUVEAU", styles: { ...STYLES, coins: { statut: "bd", qualite: "auto" } } }, f);
  assert.ok(await compte(coin, [0, 0, 200, 60], blanc) < 10, "statut resté en haut");
  assert.ok(await compte(coin, [200, 300, 200, 250], blanc) > 40, "statut pas en bas à droite");
});

// ---------- Revue v3 ----------
test("revue_v3_coin_bas_sans_place_remonte", async () => {
  // Logo carré, agrandi et remonté : il commence presque en haut. Un bloc « en bas à droite » n'a pas la place
  // au-dessus de lui : il est dessiné en haut à droite, entier (même rendu que le coin « haut droite »).
  const carre = () => sharp({ create: { width: 300, height: 300, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
  const g = images({ "/large.jpg": { corps: () => gris(1280, 720), type: "image/jpeg" }, "/carre.png": { corps: carre, type: "image/png" } });
  const dessin = (statut) => draw({ ...base, logo: "/carre.png", shape: "landscape", image: "/large.jpg", line: ligneSF, line2: "Un film de quelqu'un", statut: "NOUVEAU", rank: 4, quality: null,
    styles: { ...STYLES, titre: 1.4, monte: 0.3, coins: { statut, qualite: "auto" } } }, g);
  assert.ok(await difference(await dessin("bd"), await dessin("hd"), [560, 0, 240, 140]) < 30, "bloc pas remonté en haut, ou coupé");
});

test("revue_v3_deux_blocs_meme_coin", async () => {
  const buf = await draw({ ...seul, line: null, statut: "NOUVEAU", quality: { extra: null }, styles: { ...STYLES, coins: { statut: "hd", qualite: "auto" } } }, f);
  assert.ok(await compte(buf, [0, 0, 150, 60], blanc) > 40, "la qualité n'est pas passée à gauche");
  assert.ok(await compte(buf, [250, 0, 150, 60], blanc) > 40, "le statut n'est pas à droite");
});

test("fondu_precis_dessine", async () => {
  const fondu = (st) => draw({ ...seul, line: null, logo: null, styles: { ...STYLES, fondu: { couleur: "noir", force: "m", ...st } } }, f);
  const [fort] = await zone(await fondu({ opacite: 1 }), 0, 560, 400, 40), [leger] = await zone(await fondu({ opacite: 0.3 }), 0, 560, 400, 40);
  assert.ok(fort < leger - 30, `force sans effet : ${fort} / ${leger}`);
  const [haut] = await zone(await fondu({ taille: 0.85 }), 0, 200, 400, 40), [bas] = await zone(await fondu({ taille: 0.25 }), 0, 200, 400, 40);
  assert.ok(haut < bas - 5, `hauteur sans effet : ${haut} / ${bas}`);
});

test("statut_avec_petite_ligne", async () => {
  const sans = await draw({ ...seul, line: null, statut: "AU CINÉMA" }, f);
  const avec2 = await draw({ ...seul, line: null, statut: "AU CINÉMA", statut2: "DISPO LE 1 DÉC." }, f);
  assert.ok(await compte(avec2, [0, 0, 220, 90], blanc) > await compte(sans, [0, 0, 220, 90], blanc) + 40, "pas de petite ligne sous le statut");
});

// Sans logo : le titre écrit en texte, à la place du logo (du blanc au-dessus de la ligne du bas, qui n'y est pas
// sans lui), dans les deux formes et avec chaque police.
test("titre_ecrit_sans_logo", async () => {
  const zoneTitre = async (buf, [x, y, w, h]) => {
    const z = await sharp(buf).extract({ left: x, top: y, width: w, height: h }).toBuffer();
    return (await sharp(z).stats()).channels[0].max;
  };
  const sans = { ...base, logo: null, rank: null, quality: null, line: null };
  const vide = await draw(sans, f);
  const ecrit = await draw({ ...sans, titreTexte: "EB" }, f);
  assert.ok(await zoneTitre(ecrit, [60, 380, 280, 150]) > 230, "titre pas écrit");
  assert.ok(await zoneTitre(vide, [60, 380, 280, 150]) < 200, "zone déjà blanche sans titre");
  for (const police of ["inter", "bebas", "elegante", "arrondie", "condensee"]) {
    await draw({ ...sans, titreTexte: "Les Rayons et les Ombres", styles: { ...STYLES, police } }, f);
  }
  const paysage = await draw({ ...sans, shape: "landscape", image: "/large.jpg", titreTexte: "Un titre assez long pour deux lignes" }, f);
  assert.ok(await zoneTitre(paysage, [22, 250, 340, 170]) > 230, "titre pas écrit en paysage");
  // titreInter (une lettre manque à la police choisie) : tout le titre en Inter, pas en Oswald.
  const oswald = { ...sans, titreTexte: "Kış Uykusu", styles: { ...STYLES, police: "condensee" } };
  assert.notDeepEqual(await draw({ ...oswald, titreInter: true }, f), await draw(oswald, f));
});

// Badge Langue : sous la qualité (en haut à droite), dans chaque style de badges.
test("badge_langue", async () => {
  const sans = await draw({ ...seul, line: null, quality: { extra: null } }, f);
  const avec = await draw({ ...seul, line: null, quality: { extra: null }, langue: "VOSTFR" }, f);
  assert.ok(await difference(sans, avec, [240, 40, 160, 50]) > 60, "pas de badge sous la qualité");
  assert.ok(await difference(sans, avec, [0, 0, 200, 600]) === 0, "badge ailleurs qu'à droite");
  // Seul (sans qualité) : à la place de la qualité, en haut à droite.
  const seulLangue = await draw({ ...seul, line: null, langue: "VF" }, f);
  assert.ok(await compte(seulLangue, [300, 10, 100, 40], blanc) > 20, "pas de badge en haut à droite");
  for (const style of ["plein", "verre", "contour"]) {
    await draw({ ...seul, line: null, langue: "MULTI", styles: { ...STYLES, badges: { style, forme: "pilule", opacite: "m", couleur: "blanc" } } }, f);
  }
  await draw({ ...seul, line: null, langue: "VO", styles: { ...STYLES, qualite: "pastille" } }, f);
});

// Badge Saga : en haut à gauche, sous le statut et le N°.
test("badge_saga", async () => {
  const sans = await draw({ ...seul, line: null, statut: "NOUVEAU" }, f);
  const avec = await draw({ ...seul, line: null, statut: "NOUVEAU", saga: { n: 3, t: 5 } }, f);
  assert.ok(await difference(sans, avec, [0, 40, 200, 50]) > 60, "pas de badge sous le statut");
  assert.ok(await difference(sans, avec, [200, 0, 200, 600]) === 0, "badge ailleurs qu'à gauche");
  await draw({ ...seul, line: null, saga: { n: 12, t: 12 }, styles: { ...STYLES, badges: { style: "plein", forme: "carre", opacite: "l", couleur: "or" } } }, f);
});

// Habillage de la saison : un cadre orange (Halloween) dans la marge, l'emblème dans un coin du haut libre (le droit
// d'abord), jamais sous un badge ; rien sans fête.
test("habillage_de_saison", async () => {
  const orange = (r, g, b) => r > 200 && g > 100 && g < 190 && b < 80;
  const sans = await draw({ ...seul, line: null }, f);
  const avec = await draw({ ...seul, line: null, saison: "halloween" }, f);
  assert.ok(await compte(avec, [0, 250, 12, 100], orange) > 80, "pas de cadre à gauche");
  assert.ok(await compte(avec, [388, 250, 12, 100], orange) > 80, "pas de cadre à droite");
  assert.ok(await compte(avec, [320, 0, 80, 80], orange) > 300, "pas d'emblème en haut à droite");
  assert.ok(await compte(sans, [0, 0, 400, 600], orange) === 0);
  // Qualité à droite : l'emblème passe à gauche ; statut à gauche aussi : pas d'emblème.
  const qualite = await draw({ ...seul, line: null, quality: { extra: null }, saison: "halloween" }, f);
  assert.ok(await compte(qualite, [0, 0, 80, 80], orange) > 300, "pas d'emblème en haut à gauche");
  const plein = await draw({ ...seul, line: null, statut: "NOUVEAU", quality: { extra: null }, saison: "halloween" }, f);
  assert.ok(await compte(plein, [20, 20, 360, 60], orange) < 40, "emblème sous un badge");
  // Paysage, et les autres fêtes.
  const paysage = await draw({ ...seul, shape: "landscape", image: "/large.jpg", line: null, saison: "halloween" }, f);
  assert.ok(await compte(paysage, [700, 0, 100, 90], orange) > 300, "pas d'emblème en paysage");
  for (const fete of ["noel", "saint-valentin", "paques", "ete"]) {
    assert.ok(await difference(sans, await draw({ ...seul, line: null, saison: fete }, f), [0, 0, 400, 600]) > 500, fete);
  }
});

// Barre d'avancement d'une série : à la couleur d'accent, sous le statut (ou seule), du côté du bloc.
// L'avancement en chiffres (« S2 · 5/8 »), sans barre : trop petite pour se lire.
test("avancement_en_chiffres", async () => {
  const jaune = (r, g, b) => r > 200 && g > 150 && b < 90, blanc = (r, g, b) => r > 200 && g > 200 && b > 200;
  const sans = await draw({ ...seul, line: null, statut: "NOUVEL ÉPISODE" }, f);
  const avec = await draw({ ...seul, line: null, statut: "NOUVEL ÉPISODE", avance: { s: 2, n: 5, t: 8 } }, f);
  assert.ok(await compte(avec, [0, 30, 200, 50], blanc) > await compte(sans, [0, 30, 200, 50], blanc) + 20, "pas de chiffres sous le statut");
  assert.ok(await compte(avec, [0, 30, 200, 50], jaune) < 5, "encore une barre");
  const inverse = await draw({ ...seul, line: null, avance: { s: 3, n: 7, t: 8 }, styles: { ...STYLES, inverse: true } }, f);
  assert.ok(await compte(inverse, [250, 0, 150, 50], blanc) > 20, "pas de chiffres à droite côtés inversés");
});

// La petite ligne en Inter quand la police choisie n'a pas toutes ses lettres.
test("ligne2_en_inter", async () => {
  const c = { ...base, line: null, line2: "Un film de Nuri Bilge Ceylan Ş", styles: { ...STYLES, police: "condensee" } };
  assert.notDeepEqual(await draw({ ...c, ligne2Inter: true }, f), await draw(c, f));
});

// Carte « annoncée » (fondUni : aucune image chez TMDB) : dessinée sans rien télécharger pour le fond.
test("annonce_dessinee_sans_image", async () => {
  const urls = [];
  const buf = await draw({ ...base, image: null, fondUni: true, logo: null, titreTexte: "Gladiator III", line: null, quality: null, rank: null },
    async (u, o) => { urls.push(String(u)); return f(u, o); });
  const m = await sharp(buf).metadata();
  assert.deepEqual([m.width, m.height], SIZES.poster);
  assert.ok(!urls.some((u) => u.includes("image.tmdb.org/t/p/") && u.endsWith("null")), urls.join("\n"));
  assert.equal(urls.filter((u) => u.includes("image.tmdb.org")).length, 0);
});
