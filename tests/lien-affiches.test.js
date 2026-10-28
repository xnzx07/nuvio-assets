import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAUT_REGLAGES, MEMOIRES, MEMOIRES_PAYSAGE, lireReglages, lireReglagesPaysage, ecrireReglages, lienAffiches, dossierDe, memoireDe, reglagesDuLien } from "../worker/lien-affiches.js";

const DEFAUT_LIEN = "https://affiches.xnzxflix.workers.dev/maison/{type}/{shape}/{id}.jpg";
// L'ancien lien (Vercel, réglages dans s et sp) : encore importable dans la régie.
const ANCIEN_LIEN = "https://affiches-catalogue-fr.vercel.app/{type}/{shape}/{id}.jpg?imdb={imdb_id?}";
const lire = (q) => lireReglages(new URLSearchParams(q));
const ecrit = (q) => ecrireReglages(lire(q));
const clone = (o) => JSON.parse(JSON.stringify(o));

test("defaut_vide", () => {
  assert.equal(ecrireReglages(DEFAUT_REGLAGES), "");
  assert.equal(lienAffiches(DEFAUT_REGLAGES), DEFAUT_LIEN);
  assert.equal(ecrit(""), "");
});

// Petit générateur pseudo-aléatoire à graine fixe : les mêmes réglages à chaque lancement.
function hasard(graine) { let s = graine; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; }
const CHOIX = {
  "statut.on": [true, false], "statut.style": ["texte", "etiquette"],
  "tendance.on": [true, false], "tendance.style": ["fleche", "ruban"],
  "qualite.on": [true, false], "qualite.montrer": ["plus", "4k", "tout"], "qualite.style": ["texte", "pastille"],
  "titre.on": [true, false], "titre.taille": [0.6, 0.85, 1, 1.25, 1.4], "titre.place": ["auto", "gauche", "centre"],
  "note.on": [true, false], "note.source": ["imdb", "tmdb"], "note.style": ["etoile", "nu", "grand", "badge"],
  "genre.on": [true, false], "genre.forme": ["court", "complet"], "annee.on": [true, false], "age.on": [true, false],
  "texte.taille": [0.7, 0.95, 1, 1.1, 1.4], "texte.sep": ["point", "barre", "puce"], "texte.haut": [0.6, 1, 1.15, 1.4],
  "texte.police": ["inter", "bebas", "elegante", "arrondie", "condensee"],
  "fondu.on": [true, false], "fondu.couleur": ["noir", "affiche"], "fondu.force": ["s", "m", "l"], "fondu.flou": [false, true],
  "fondu.hauteur": ["court", "normal", "long"],
  "titre.langue": ["fr", "en", "vo"], "titre.monte": [0, 0.05, 0.3], "titre.large": [0.6, 1, 1.4],
  "note.rt": [false, true], "note.mc": [false, true], "note.lb": [false, true], "note.couleur": ["non", "oui", "halo"],
  "duree.on": [false, true], "duree.pour": ["tout", "films", "series"], "ligne.ordre": ["gna", "nga", "agn"], "ligne.barre": ["aucune", "verre", "fine"],
  "plateforme.on": [false, true], "plateforme.place": ["ligne", "coin"],
  "haut.inverse": [false, true], "haut.style": ["auto", "plein", "verre", "contour"], "haut.forme": ["arrondi", "carre", "pilule"],
  "haut.opacite": ["s", "m", "l"], "haut.couleur": ["blanc", "or", "noir"],
  "bandeau.on": [false, true], "bandeau.porte": ["statut", "tendance"], "bandeau.coin": ["d", "g"],
  "image.source": ["sanstexte", "officielle", "fond"],
  "ambiance.accentC": ["", "0", "k", "z"], "texte.couleur": ["", "3", "q"], "haut.fond": ["", "a", "7"], "fondu.teinte": ["", "b", "x"],
  "image.lum": [0.7, 1, 1.3], "image.contraste": [0.85, 1, 1.15], "image.satur": [0, 1, 1.6], "image.filtre": ["aucun", "nb", "sepia", "froid", "chaud"],
  "image.grain": [false, true], "image.cadre": ["aucun", "blanc", "or", "couleur"], "image.cadreC": ["", "5"],
  "texte.casse": ["normal", "maj"], "texte.espace": ["normal", "aere", "tresaere"], "texte.ombre": ["normale", "aucune", "forte"],
  "titre.effet": ["aucun", "ombre", "halo"], "infos.ligne2": ["aucune", "realisateur", "accroche", "studio"], "infos.culte": [false, true],
  "statut.episode": [false, true], "statut.forme": ["date", "compte"], "haut.coinStatut": ["auto", "hg", "hd", "bg", "bd"], "haut.coinQualite": ["auto", "hg", "hd", "bg", "bd"],
  "ambiance.voile": ["0", "s", "m", "l"], "ambiance.vignette": [false, true], "ambiance.accent": ["or", "blanc", "rouge", "bleu", "affiche"],
  "sortie.nb": [true, false], "sortie.cacherNote": [true, false],
  "langue.on": [false, true], "statut.fin": [false, true], "statut.avance": [false, true], "infos.saga": [false, true], "saison.on": [false, true],
};

test("aller_retour", () => {
  const r = hasard(42);
  const essais = [...Object.values(MEMOIRES)];
  for (let i = 0; i < 20; i++) {
    const x = clone(DEFAUT_REGLAGES);
    for (const [chemin, vals] of Object.entries(CHOIX)) { const [a, b] = chemin.split("."); x[a][b] = vals[Math.floor(r() * vals.length)]; }
    essais.push(x);
  }
  for (const x of essais) {
    const s = ecrireReglages(x);
    assert.equal(ecrireReglages(lire(s ? "s=1." + s : "")), s, s);
  }
});

// Tailles réglables à la main : de 60 % à 140 % par pas de 5 %, une lettre par cran (a = 60 %, i = 100 %, q = 140 %).
test("tailles_libres", () => {
  assert.equal(lire("s=1.la").titre.taille, 0.6);
  assert.equal(lire("s=1.lq").titre.taille, 1.4);
  assert.equal(lire("s=1.xm").texte.taille, 1.2);
  assert.equal(lire("s=1.zc").texte.haut, 0.7);
  assert.equal(ecrit("s=1.li"), "");                // 100 % = défaut
  assert.equal(ecrit("s=1.lz"), "");                // hors plage : ignoré
  const x = clone(DEFAUT_REGLAGES); x.titre.taille = 1.23; x.texte.haut = 0.66;
  assert.equal(ecrireReglages(x), "lnzb");          // arrondi au cran le plus proche
});

test("ordre_canonique", () => {
  assert.equal(ecrit("s=1.Q0T0"), "T0Q0");
  // La pastille de tendance a été retirée (le propriétaire ne l'aimait pas) : son code est ignoré.
  assert.equal(ecrit("s=1.tp"), "");
});

test("sous_reglages_ignores", () => {
  assert.equal(ecrit("s=1.N0nteg"), "N0");
  assert.equal(ecrit("s=1.L0gcxs"), "L0");
  assert.equal(ecrit("s=1.F0fail"), "F0");
  assert.equal(ecrit("s=1.B0c1"), "B0");
});

// Ajouts inspirés de Viewio et Posters+ : place du titre, note en badge, âge, police, fondu flou.
test("nouveaux_reglages", () => {
  const d = DEFAUT_REGLAGES;
  assert.deepEqual([d.titre.place, d.age.on, d.texte.police, d.fondu.flou], ["auto", false, "inter", false]);
  const x = lire("s=1.ogebY1wbd1");
  assert.deepEqual([x.titre.place, x.note.style, x.age.on, x.texte.police, x.fondu.flou], ["gauche", "badge", true, "bebas", true]);
  assert.equal(lire("s=1.oc").titre.place, "centre");
  assert.equal(ecrit("s=1.d1Y1wbebog"), "ogebY1wbd1");
  // Sans titre, ni place, ni âge, ni flou ; la police sert encore aux badges du haut.
  assert.equal(ecrit("s=1.L0ogY1wbd1"), "L0wb");
  assert.equal(ecrit("s=1.S0T0Q0L0wb"), "S0T0Q0L0");
  assert.equal(ecrit("s=1.F0d1"), "F0");
});

// Régie v2 : ~25 réglages de plus, chacun un code de 2 caractères, toujours écrit dans le même ordre.
const V2 = "uvmcjqR1M1b1coD1OnrvP1vcI1HvypasCoJ1KtEgqtUfWlV0X1Za";
test("regie_v2_codes", () => {
  const x = lire("s=1." + V2);
  assert.deepEqual([x.titre.langue, x.titre.monte, x.titre.large], ["vo", 0.1, 1.4]);
  assert.deepEqual([x.note.rt, x.note.mc, x.note.lb, x.note.couleur], [true, true, true, "oui"]);
  assert.deepEqual([x.duree.on, x.ligne.ordre, x.ligne.barre, x.plateforme.on, x.plateforme.place], [true, "nga", "verre", true, "coin"]);
  assert.deepEqual([x.haut.inverse, x.haut.style, x.haut.forme, x.haut.opacite, x.haut.couleur], [true, "verre", "pilule", "s", "or"]);
  assert.deepEqual([x.bandeau.on, x.bandeau.porte, x.bandeau.coin], [true, "tendance", "g"]);
  assert.deepEqual([x.qualite.montrer, x.image.source, x.fondu.hauteur], ["tout", "fond", "long"]);
  assert.deepEqual([x.ambiance.voile, x.ambiance.vignette, x.ambiance.accent], ["0", true, "affiche"]);
  // Même réglage, codes dans un autre ordre : même lien.
  const paires = V2.match(/../g);
  assert.equal(ecrit("s=1." + [...paires].reverse().join("")), ecrit("s=1." + V2));
  assert.equal(ecrit("s=1." + ecrit("s=1." + V2)), ecrit("s=1." + V2));
  // Sous-réglages d'une voie éteinte (ou d'un style « auto ») : pas écrits.
  assert.equal(ecrit("s=1.N0R1M1co"), "N0");
  assert.equal(ecrit("s=1.ypasCo"), "");
  assert.equal(ecrit("s=1.KtEg"), "");
  assert.equal(ecrit("s=1.vc"), "");
  assert.equal(ecrit("s=1.L0uvmcD1OnUf"), "L0");
});

// Paysage à part : un second jeu de réglages dans sp, écrit seulement s'il diffère du portrait.
test("paysage_a_part", () => {
  assert.equal(lienAffiches(DEFAUT_REGLAGES, DEFAUT_REGLAGES), DEFAUT_LIEN);
  // Un paysage qui ne va pas avec le style : réglage perso.
  assert.equal(dossierDe(DEFAUT_REGLAGES, MEMOIRES.essentiel), null);
  assert.equal(dossierDe(MEMOIRES.essentiel, MEMOIRES.essentiel), "essentiel");
  assert.equal(dossierDe(MEMOIRES.signature, MEMOIRES_PAYSAGE.signature), "signature");
  assert.equal(dossierDe(MEMOIRES.signature, MEMOIRES.signature), null);
  const p = lireReglagesPaysage(new URLSearchParams("s=1.T0&sp=1.Q0"));
  assert.equal(p.qualite.on, false);
  assert.equal(p.tendance.on, true);
  assert.equal(lireReglagesPaysage(new URLSearchParams("s=1.T0")).tendance.on, false);
});

test("codes_inconnus_ignores", () => {
  assert.equal(ecrit("s=1.zz9yT0"), "T0");
  assert.equal(ecrit("s=2.T0"), "");
  assert.equal(ecrit("s=n'importe quoi"), "");
});

test("anciens_liens", () => {
  assert.equal(ecrit("o=tga"), "T0G0A0");
  assert.equal(ecrit("o=tga&r=tmdb"), "T0ntG0A0");
  assert.equal(memoireDe(lire("o=tqngal")), "nue");
  assert.equal(ecrit("o=n&r=tmdb"), "N0");
  assert.equal(ecrit("r=tmdb"), "nt");
});

test("memoires", () => {
  assert.equal(memoireDe(DEFAUT_REGLAGES), "maison");
  const e = MEMOIRES.essentiel;
  assert.deepEqual([e.statut.on, e.tendance.on, e.qualite.on, e.titre.on, e.note.on, e.genre.on, e.annee.on, e.fondu.on, e.sortie.nb], [false, false, true, true, true, false, false, true, true]);
  const n = MEMOIRES.noteSeule;
  assert.deepEqual([n.statut.on, n.tendance.on, n.qualite.on, n.titre.on, n.note.on, n.note.style, n.genre.on, n.annee.on, n.fondu.on, n.sortie.nb], [false, false, false, true, true, "grand", false, false, true, true]);
  const u = MEMOIRES.nue;
  assert.deepEqual([u.statut.on, u.tendance.on, u.qualite.on, u.titre.on, u.note.on, u.genre.on, u.annee.on, u.fondu.on, u.sortie.nb], [false, false, false, false, false, false, false, false, false]);
  const pp = MEMOIRES.postersPlus;
  assert.deepEqual([pp.note.rt, pp.note.mc, pp.note.couleur, pp.ligne.barre, pp.bandeau.on, pp.haut.style, pp.haut.forme], [true, true, "oui", "verre", true, "verre", "pilule"]);
  const pf = MEMOIRES.plateforme;
  assert.deepEqual([pf.plateforme.on, pf.note.style, pf.duree.on], [true, "badge", true]);
  const c = MEMOIRES.cine;
  assert.deepEqual([c.texte.police, c.note.style, c.fondu.flou, c.age.on, c.statut.style], ["bebas", "badge", true, true, "etiquette"]);
  for (const [nom, r] of Object.entries(MEMOIRES)) assert.equal(memoireDe(r), nom);
  const perso = clone(DEFAUT_REGLAGES); perso.genre.on = false;
  assert.equal(memoireDe(perso), null);
});

// Un dossier par style tout prêt (fichiers statiques) ; un réglage perso a le sien, /perso/<code>[-<code du paysage>]/.
test("lien_avec_reglages", () => {
  assert.equal(lienAffiches(MEMOIRES.essentiel), "https://affiches.xnzxflix.workers.dev/essentiel/{type}/{shape}/{id}.jpg");
  assert.equal(lienAffiches(MEMOIRES.noteSeule), "https://affiches.xnzxflix.workers.dev/note/{type}/{shape}/{id}.jpg");
  assert.equal(lienAffiches(MEMOIRES.signature, MEMOIRES_PAYSAGE.signature), "https://affiches.xnzxflix.workers.dev/signature/{type}/{shape}/{id}.jpg");
  assert.equal(lienAffiches(lire("s=1.T0")), "https://affiches.xnzxflix.workers.dev/perso/T0/{type}/{shape}/{id}.jpg");
  // Paysage à part : son code après un tiret ; portrait par défaut : « 0 ».
  assert.equal(lienAffiches(lire("s=1.T0"), lire("s=1.S0T0G0A0")), "https://affiches.xnzxflix.workers.dev/perso/T0-S0T0G0A0/{type}/{shape}/{id}.jpg");
  assert.equal(lienAffiches(DEFAUT_REGLAGES, lire("s=1.T0")), "https://affiches.xnzxflix.workers.dev/perso/0-T0/{type}/{shape}/{id}.jpg");
  // Paysage identique au portrait : pas de tiret.
  assert.equal(lienAffiches(lire("s=1.T0"), lire("s=1.T0")), "https://affiches.xnzxflix.workers.dev/perso/T0/{type}/{shape}/{id}.jpg");
  // Tout éteint (l'ancien style « Nue », plus dans la régie) : un réglage perso comme un autre.
  assert.equal(lienAffiches(MEMOIRES.nue), "https://affiches.xnzxflix.workers.dev/perso/S0T0Q0L0B0/{type}/{shape}/{id}.jpg");
});

// Un lien perso collé dans la régie redonne ses réglages.
test("lien_perso_relu", () => {
  for (const [r, rp] of [[lire("s=1.T0"), null], [lire("s=1.T0"), lire("s=1.S0T0G0A0")], [DEFAUT_REGLAGES, lire("s=1.T0")]]) {
    const lu = reglagesDuLien(lienAffiches(r, rp));
    assert.equal(ecrireReglages(lu.r), ecrireReglages(r));
    assert.equal(lu.rp && ecrireReglages(lu.rp), rp && ecrireReglages(rp));
  }
});

// Vercel ne déploie que affiches/, Docker que worker/ : le module existe en deux copies, toujours identiques.
test("copies_identiques", () => {
  const a = readFileSync(new URL("../worker/lien-affiches.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const b = readFileSync(new URL("../affiches/lib/lien-affiches.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.equal(a, b);
});

// Revue : un réglage sans effet n'est pas écrit (sinon deux liens pour un même dessin, deux copies en cache).
test("revue_codes_sans_effet", () => {
  assert.equal(ecrit("s=1.S0T0Q0I1Hv"), "S0T0Q0");      // côtés et style des badges, sans aucun badge
  assert.equal(ecrit("s=1.S0T0J1"), "S0T0");            // bandeau sans statut ni tendance à porter
  assert.equal(ecrit("s=1.L0P1"), "L0");                // plateforme dans la ligne, sans titre (pas de ligne)
  assert.equal(ecrit("s=1.L0P1vc"), "L0P1vc");          // en coin, elle se dessine quand même
  assert.equal(ecrit("s=1.S0T0Q0J0V0"), "S0T0Q0");      // voile du haut sans rien en haut
  assert.equal(ecrit("s=1.S0T0Q0L0Zr"), "S0T0Q0L0");    // accent sans rien qui l'utilise
  assert.equal(ecrit("s=1.Zr"), "Zr");                  // l'étoile de la note l'utilise
  // La taille des badges vaut aussi pour la plateforme en coin.
  assert.equal(ecrit("s=1.S0T0Q0P1vczq"), "S0T0Q0P1vczq");
});

// Régie v3 : codes de 3 caractères (clé chiffre + lettre, puis la valeur), à côté des codes de 2 caractères.
test("regie_v3_codes", () => {
  const x = lire("s=1.0az0bq1am1bm1co1dn1e11fc1g5wc2am2bt2cf2dh3ar3b13c13dc3e43f1");
  assert.deepEqual([x.ambiance.accentC, x.texte.couleur, x.image.lum, x.image.contraste, x.image.satur], ["z", "q", 1.3, 1.3, 1.4]);
  assert.deepEqual([x.image.filtre, x.image.grain, x.image.cadre, x.image.cadreC], ["nb", true, "couleur", "5"]);
  assert.deepEqual([x.texte.police, x.texte.casse, x.texte.espace, x.texte.ombre, x.titre.effet], ["condensee", "maj", "tresaere", "forte", "halo"]);
  assert.deepEqual([x.infos.ligne2, x.infos.culte, x.statut.episode, x.statut.forme, x.haut.coinStatut, x.haut.coinQualite], ["realisateur", true, true, "compte", "bd", "hg"]);
  // Écrit puis relu : identique ; dans le désordre : même lien.
  const s1 = ecrit("s=1.0az0bq1am1bm1co1dn1e11fc1g5wc2am2bt2cf2dh3ar3b13c13dc3e43f1");
  assert.equal(ecrit("s=1." + s1), s1);
  assert.equal(ecrit("s=1.3f13e42dh1g51fc0bq"), ecrit("s=1.0bq1fc1g52dh3e43f1"));
  // Valeur inconnue, code tronqué ou clé inconnue : ignorés.
  assert.equal(ecrit("s=1.0a!"), "");
  assert.equal(ecrit("s=1.T00a"), "T0");
  assert.equal(ecrit("s=1.0qzT0"), "T0");
  // Sans effet : cadre de couleur sans cadre « couleur », fond des badges sans style plein, teinte du fondu sans fondu.
  assert.equal(ecrit("s=1.1g5"), "");
  assert.equal(ecrit("s=1.0ca"), "");
  assert.equal(ecrit("s=1.F00db"), "F0");
  assert.equal(ecrit("s=1.S03c13dc"), "S0");
});

test("nuancier_et_echelles", async () => {
  const { PALETTE, RETOUCHES, SATURATIONS } = await import("../worker/lien-affiches.js");
  assert.equal(Object.keys(PALETTE).length, 36);
  for (const c of Object.values(PALETTE)) assert.match(c, /^#[0-9a-f]{6}$/);
  assert.equal(RETOUCHES.g, 1);
  assert.equal(SATURATIONS.k, 1);
});

test("revue_v3_liens_canoniques", () => {
  assert.equal(ecrit("s=1.Zr0az"), "0az");              // accent du nuancier : la base n'est plus écrite
  assert.equal(ecrit("s=1.L02am2bt"), "L0");            // majuscules et espacement : seulement pour la ligne du bas
  assert.equal(ecrit("s=1.S0T0Q03b1Zr"), "S0T0Q0Zr3b1"); // Incontournable seul : l'accent sert (étoile du badge)
});

// Fondu réglé finement : force de 30 à 100 % (1h, a = 0,30… o = 1,00), hauteur de 25 à 85 % (1i, a = 0,25… m = 0,85).
test("fondu_precis", () => {
  const x = lire("s=1.1ho1im");
  assert.deepEqual([x.fondu.opacite, x.fondu.taille], [1, 0.85]);
  const y = clone(DEFAUT_REGLAGES); y.fondu.opacite = 0.62; y.fondu.taille = 0.5;
  assert.equal(ecrireReglages(y), "1hg1if");            // ramenés au cran le plus proche (0,60 et 0,50)
  assert.equal(ecrit("s=1.F01ho1im"), "F0");             // sans fondu : rien
  assert.equal(ecrireReglages(DEFAUT_REGLAGES), "");
});

// Importer un lien d'affiches (collé dans la régie) : on retrouve ses réglages, paysage à part compris.
test("importer_un_lien", async () => {
  const { reglagesDuLien } = await import("../worker/lien-affiches.js");
  // Lien d'un style tout prêt : ses réglages, paysage à part compris.
  const r = reglagesDuLien(lienAffiches(MEMOIRES.signature, MEMOIRES_PAYSAGE.signature));
  assert.equal(ecrireReglages(r.r), ecrireReglages(MEMOIRES.signature));
  assert.equal(ecrireReglages(r.rp), ecrireReglages(MEMOIRES_PAYSAGE.signature));
  assert.equal(reglagesDuLien(lienAffiches(MEMOIRES.cine)).rp, null);
  assert.equal(ecrireReglages(reglagesDuLien(lienAffiches(MEMOIRES.cine)).r), ecrireReglages(MEMOIRES.cine));
  assert.equal(ecrireReglages(reglagesDuLien(DEFAUT_LIEN).r), "");
  // Ancien lien (Vercel) : ses réglages, paysage à part compris.
  const a = reglagesDuLien(ANCIEN_LIEN + "&s=1.T0&sp=1.Q0");
  assert.equal(ecrireReglages(a.r), "T0");
  assert.equal(ecrireReglages(a.rp), "Q0");
  assert.equal(ecrireReglages(reglagesDuLien(ANCIEN_LIEN).r), "");
  // Espaces autour, lien d'une affiche précise, ancien lien (o, r) : acceptés.
  assert.equal(ecrireReglages(reglagesDuLien("  " + ANCIEN_LIEN + "&s=1.T0  ").r), "T0");
  assert.equal(ecrireReglages(reglagesDuLien("https://affiches-catalogue-fr.vercel.app/movie/poster/tt1375666.jpg?imdb=tt1375666&s=1.Q0").r), "Q0");
  assert.equal(ecrireReglages(reglagesDuLien("https://affiches-catalogue-fr.vercel.app/{type}/{shape}/{id}.jpg?imdb={imdb_id?}&o=tga").r), "T0G0A0");
  // Copié d'une barre d'adresse : accolades codées (%7B…%7D), et même tout le lien codé.
  const code = ANCIEN_LIEN.replace(/\{/g, "%7B").replace(/\}/g, "%7D") + "&s=1.coD1failWc0a10b02do3b13c13e13f2";
  assert.equal(ecrireReglages(reglagesDuLien(code).r), ecrireReglages(reglagesDuLien(ANCIEN_LIEN + "&s=1.coD1failWc0a10b02do3b13c13e13f2").r));
  assert.notEqual(ecrireReglages(reglagesDuLien(code).r), "");
  assert.equal(ecrireReglages(reglagesDuLien(encodeURIComponent(ANCIEN_LIEN + "&s=1.T0")).r), "T0");
  assert.equal(dossierDe(reglagesDuLien(encodeURIComponent(DEFAUT_LIEN.replace("maison", "cine"))).r), "cine");
  assert.equal(reglagesDuLien("%E0%A4%A"), null);
  // Autre chose qu'un lien d'affiches : refusé.
  for (const x of ["", "bonjour", "https://exemple.com/?s=1.T0", "https://posters.example/{type}/{id}?s=1.T0"]) assert.equal(reglagesDuLien(x), null, x);
});

// Options au choix (langue des sources, fin et avancement d'une série, saga, habillage de la saison) : éteintes par
// défaut, donc aucun lien existant ne change ; chacune un code v3, écrit dans le même ordre.
test("options_au_choix", () => {
  const d = DEFAUT_REGLAGES;
  assert.deepEqual([d.langue.on, d.statut.fin, d.statut.avance, d.infos.saga, d.saison.on], [false, false, false, false, false]);
  const x = lire("s=1.3k13j13i13h13g1");
  assert.deepEqual([x.langue.on, x.statut.fin, x.statut.avance, x.infos.saga, x.saison.on], [true, true, true, true, true]);
  assert.equal(ecrireReglages(x), "3g13h13i13j13k1");
  // Seul « signature » en allume (fin, avancement, saga : les statuts complets).
  for (const [nom, m] of Object.entries(MEMOIRES)) if (nom !== "signature") assert.ok(!/3[g-k]/.test(ecrireReglages(m)), nom);
  // Sans statut, ni fin ni avancement ; la langue et la saga sont des badges du haut (style commun, coins).
  assert.equal(ecrit("s=1.S03h13i1"), "S0");
  assert.equal(ecrit("s=1.S0T0Q0Hv3g1"), "S0T0Q0Hv3g1");
  assert.equal(ecrit("s=1.S0T0Q0Hv3j1"), "S0T0Q0Hv3j1");
  assert.equal(ecrit("s=1.S0T0Q03f13g1"), "S0T0Q03f13g1");
  assert.equal(ecrit("s=1.S0T0Q03e23j1"), "S0T0Q03e23j1");
  // La barre d'avancement prend la couleur d'accent.
  assert.equal(ecrit("s=1.S0T0Q0L0Zr"), "S0T0Q0L0");
  assert.equal(ecrit("s=1.T0Q0L0Zr3i1"), "T0Q0L0Zr3i1");
});

// Les deux réglages de notes ajoutés : écrits seulement allumés, et seulement avec la note.
test("codes_mal_et_moyenne", () => {
  const r = lire("s=1.R13l13m1");
  assert.equal(r.note.mal, true);
  assert.equal(r.note.moyenne, true);
  assert.equal(ecrireReglages(r), "R13l13m1");
  assert.equal(ecrireReglages(DEFAUT_REGLAGES), "");
  r.note.on = false;
  assert.equal(ecrireReglages(r), "N0");
});

// IMDb et TMDB ensemble, ou aucune des deux : la source n'est plus écrite sans principale (un seul lien par dessin).
test("codes_deux_principales_ou_aucune", () => {
  assert.equal(ecrit("s=1.3n1"), "3n1");
  assert.equal(ecrit("s=1.nt3n1"), "nt3n1");
  assert.equal(ecrit("s=1.nt3o0"), "3o0");
  assert.equal(ecrit("s=1.3n13o0"), "3o0");
  assert.equal(ecrit("s=1.N03n1"), "N0");
});
