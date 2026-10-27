import { test } from "node:test";
import assert from "node:assert/strict";
import { configurePage, reprise, DERNIERE, SALLE2_JS } from "../worker/page.js";
import { enLigne } from "./support/en-ligne.mjs";
import { hallPage } from "../worker/hall.js";
import { STAGE_JS } from "../worker/stage.js";
import * as LA from "../worker/lien-affiches.js";
import { sansCle, LIENS_JS } from "../worker/liens.js";
import { defaults, decodeConfig, PROVIDERS, REGIONS, GENRES, LANGUAGES, SORTS, SEASON_KEYS, MAX_CUSTOM, COLLECTIONS } from "../worker/config.js";

const rows = [{ id: "a", home: true, name: "A", type: "movie" }];
const KEY = "AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q";
const page = (copy = false) => enLigne(configurePage({ copy,
  origin: "https://x", cfg: decodeConfig(Buffer.from(JSON.stringify({ k: KEY })).toString("base64url"), rows, []), rows, discover: [],
  providers: PROVIDERS, collections: COLLECTIONS.map((c) => ({ ...c, pos: 0, folders: [] })), defaults: defaults(rows, []),
  regions: REGIONS, genres: GENRES, languages: LANGUAGES, sorts: SORTS, seasons: SEASON_KEYS, maxCustom: MAX_CUSTOM, season: null,
}));

// Le billet se partage (bouton « Offrir », image du billet) : jamais avec la clé Gemini de l'utilisateur.
// Le QR « Continuer sur le téléphone », lui, sert à ses propres appareils : il emporte la clé (avec un avertissement).
test("partage_sans_cle", () => {
  const html = page();
  assert.match(html, /const shared = compact\(\{ \.\.\.state, k: "", al: "" \}\);\s*shareUrl = D\.origin \+ .*enc\(shared\)/);
  // Offrir : partage et copie avec l'adresse sans clé.
  assert.match(html, /url: shareUrl \}/);
  assert.match(html, /writeText\(shareUrl\)/);
  assert.doesNotMatch(html, /url: configureUrl/);
  assert.doesNotMatch(html, /writeText\(configureUrl\)/);
  // Image du billet : son QR code est fait avec l'adresse sans clé, et seulement elle.
  const image = html.slice(html.indexOf("async function imprimeBillet"), html.indexOf("const tk = "));
  assert.ok(image.length > 500);
  assert.match(image, /addData\(shareUrl\)/);
  assert.equal((image.match(/addData\(/g) || []).length, 1);
  // QR pour ses appareils : la clé voyage, et le texte le dit.
  assert.match(html, /qrSvg\(qrcode, fixe && fixe\.modif \? lienModif\(\) : configureUrl, /);
  assert.match(html, /ta clé Gemini comprise[^<]*ne le montre à personne d'autre/);
});

// La clé Gemini n'est plus dans la barre d'adresse : rangée sur l'appareil, reprise au rechargement.
test("cle_hors_de_la_barre_d_adresse", () => {
  const html = page();
  assert.match(html, /const sansCle = compact\(\{ \.\.\.state, k: "" \}\);/);
  assert.match(html, /history\.replaceState\(null, "", affichee\)/);
  assert.doesNotMatch(html, /replaceState\(null, "", configureUrl\)/);
  assert.match(html, /if \(!fixe\) \{ if \(state\.k\) cleGarde\(state\.k\); else state\.k = cleLue\(\); \}/);
});

// Les liens « Salle 2 » du site (scene.js) reprennent la programmation de l'onglet, mais sans la clé Gemini.
test("liens_salle_2_sans_cle", () => {
  // La même fonction dans scene.js et dans le guide (liens.js), injectée telle quelle.
  assert.ok(STAGE_JS.includes(String(sansCle)) && LIENS_JS.includes(String(sansCle)));
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const seg = /^https:\/\/x\/([^/]+)\/configure$/.exec(sansCle("https://x/" + b64({ n: "Ma télé", k: KEY, m: 7 }) + "/configure"))[1];
  assert.deepEqual(JSON.parse(Buffer.from(seg, "base64url").toString()), { n: "Ma télé", m: 7 });
  assert.equal(sansCle("https://x/" + b64({ k: KEY }) + "/configure"), "https://x/configure");
  const sans = "https://x/" + b64({ m: 7 }) + "/configure";
  assert.equal(sansCle(sans), sans);
  assert.equal(sansCle("https://x/fAbc123/configure"), "https://x/fAbc123/configure");
  assert.equal(sansCle("https://x/configure"), "https://x/configure");
});

// L'adresse fabriquée par la page (compact + enc, dans le navigateur) se relit à l'identique par le serveur
// (decodeConfig) : tous les réglages, rangées sur mesure, noms et clé compris.
test("adresse_de_la_page_relue_par_le_serveur", () => {
  const rows3 = [{ id: "a", home: true, name: "A", type: "movie" }, { id: "b", home: true, name: "B", type: "series" }, { id: "c", home: false, name: "C", type: "movie" }];
  const disc = [{ id: "d1", name: "D1", type: "movie" }, { id: "d2", name: "D2", type: "series" }];
  const html = enLigne(configurePage({ origin: "https://x", cfg: decodeConfig("", rows3, disc), rows: rows3, discover: disc,
    providers: PROVIDERS, collections: COLLECTIONS.map((c) => ({ ...c, pos: 0, folders: [] })), defaults: defaults(rows3, disc),
    regions: REGIONS, genres: GENRES, languages: LANGUAGES, sorts: SORTS, seasons: SEASON_KEYS, maxCustom: MAX_CUSTOM, season: null }));
  const D = JSON.parse(/const D = (.*);\n/.exec(html)[1]);
  const src = /function rowRef[\s\S]*?\nfunction enc\(obj\) \{[\s\S]*?\n\}\n/.exec(html)[0];
  const { compact, enc } = new Function("D", "const same = (a, b) => JSON.stringify(a) === JSON.stringify(b); const baseIds = D.rows.map(r => r.id);\n"
    + src + "\nreturn { compact, enc };")(D);
  const lire = (st) => { const c = compact(st); const { custom, ...cfg } = decodeConfig(Object.keys(c).length ? enc(c) : "", rows3, disc); return cfg; };
  // Réglages d'origine : adresse vide, relue telle quelle.
  assert.deepEqual(lire(structuredClone(D.cfg)), D.cfg);
  const st = structuredClone(D.cfg);
  Object.assign(st, {
    n: "Ma salle à moi ✨", r: ["perso-0", "c", "a"], p: [PROVIDERS[0].id, PROVIDERS[2].id], d: ["d2"], c: [COLLECTIONS[1].id],
    o: { a: "Mes films", "perso-0": "Peur" }, x: [{ n: "Frissons", t: 1, g: [2, 5], w: [0], l: LANGUAGES[1][0], y: [2000, 2020], v: 7, s: 2 }],
    g: REGIONS[1].id, e: [GENRES[3][0]], m: 7, a: 1990, f: true, h: [SEASON_KEYS[0][0]], t: { [COLLECTIONS[0].id]: [1, 3] },
    to: { [COLLECTIONS[0].id]: [3, 0, 1] }, ac: [{ id: COLLECTIONS[3].id, n: 2 }, { id: COLLECTIONS[1].id, n: 0 }], u: true, k: KEY, al: "a".repeat(24),
  });
  assert.deepEqual(lire(st), st);
  // Billet offert (sans clé ni jeton) : relu sans eux, le reste identique.
  assert.deepEqual(lire({ ...st, k: "", al: "" }), { ...st, k: "", al: "" });
});

// L'indication sous le champ accepte les mêmes clés que le serveur (nouveau format « AQ.… » compris).
test("indication_meme_format_que_serveur", () => {
  assert.ok(page().includes("/^[A-Za-z0-9._~+/=:-]{20,200}$/.test(k)"));
});

// Pas de champ « mot de passe » : Chrome proposerait d'enregistrer la clé. Elle est masquée en CSS.
test("cle_masquee_sans_champ_mot_de_passe", () => {
  const html = page();
  assert.doesNotMatch(html, /type="password"/);
  assert.match(html, /<input type="text" id="ai-key" class="plain masque"/);
  assert.match(html, /-webkit-text-security: disc/);
});

// Espace hébergeur et bandeau de mise à jour : seulement sur une copie, jamais sur la source.
test("espace_hebergeur_sur_une_copie", () => {
  const html = page(true);
  assert.match(html, /id="s-hote"/);
  assert.match(html, /href="#s-hote"/);
  assert.match(html, /\/hote\/connexion/);
});

test("pas_d_espace_hebergeur_sur_la_source", () => {
  const html = page(false);
  assert.doesNotMatch(html, /s-hote/);
  assert.doesNotMatch(html, /\/hote\//);
});

test("bandeau_du_hall", () => {
  assert.match(hallPage({ origin: "https://copie.exemple", season: null, copy: true }), /\/hote\/etat/);
  assert.doesNotMatch(hallPage({ origin: "https://x", season: null, copy: false }), /\/hote\//);
});

// Le billet partagé n'emporte pas non plus le jeton d'alerte de l'hébergeur.
test("partage_sans_jeton_alerte", () => {
  assert.match(page(true), /const shared = compact\(\{ \.\.\.state, k: "", al: "" \}\);/);
});

// L'espace hébergeur explique quoi faire sans mot de passe, et quand GitHub ne répond pas.
test("espace_hebergeur_messages", () => {
  const html = page(true);
  assert.match(html, /hote\.motDePasse === false/);
  assert.match(html, /hote\.verification === "impossible"/);
  assert.match(html, /r\.status === 429/);
});

// Bouton « ouvrir dans Nuvio » : seulement pour un lien https (une copie Docker en http, à la maison,
// ouvrirait le fichier manifest.json dans le navigateur).
test("ouvrir_dans_nuvio_seulement_en_https", () => {
  assert.match(page(), /\$\("open-app"\)\.hidden = !\/\^https:\/\.test\(manifest\) \|\| \/Windows\/\.test\(navigator\.userAgent\);/);
});

// Dans le guide, la salle 2 masque des sections (#s-mode) : la navigation ne doit jamais allumer leur lien.
test("navigation_ignore_les_sections_masquees", () => {
  const html = page();
  assert.match(html, /const visible = \(sec\) => sec && sec\.getClientRects\(\)\.length > 0;/);
  assert.match(html, /if \(visible\(sec\) && sec\.getBoundingClientRect\(\)\.top <= line\) cur = i;/);
});

// Salle 2, section IA : sur la source, une ligne mène à la page « Monte ta propre salle ».
test("salle_2_mene_a_la_page_copie_seulement_sur_la_source", () => {
  assert.ok(page(false).includes('href="https://x/copie"'));
  assert.ok(!page(true).includes('/copie"'));
});

// « Revenir à la programmation d'origine » garde la clé Gemini et le jeton d'alerte, et se rattrape (« Annuler »).
test("remise_d_origine_garde_la_cle_et_s_annule", () => {
  const html = page();
  assert.match(html, /Object\.assign\(state, clone\(D\.defaults\), \{ k: state\.k, al: state\.al \}\);/);
  assert.match(html, /id="annule-btn">Annuler<\/button>/);
  assert.match(html, /Object\.assign\(state, avant\); renderAll\(\);/);
  assert.match(html, /setTimeout\(annuleFin, 10000\)/);
});

// Régie : un élément éteint puis rallumé retrouve ses réglages (gardés entiers dans le navigateur), sauf si
// la forme courte du lien a changé ailleurs entre-temps.
test("regie_garde_les_reglages_d_un_element_eteint", () => {
  const html = page();
  const src = /const REGIE_COMPLET = [^\n]*\n/.exec(html)[0] + /const fusionne = [\s\S]*?\n\};\n/.exec(html)[0] + /function regieLue\(\) \{[\s\S]*?\n\}\n/.exec(html)[0];
  const lit = (s) => LA.lireReglages(new URLSearchParams(s ? "s=1." + s : ""));
  const essai = (court, complet) => {
    const store = { "affiches-v2-complet": JSON.stringify(complet) };
    const localStorage = { getItem: (k) => store[k] ?? null };
    const NV = { reglages: { affiches: lit(court), affichesPaysage: null } };
    return new Function("LA", "NV", "localStorage", src + "\nreturn regieLue();")(LA, NV, localStorage);
  };
  const r = JSON.parse(JSON.stringify(LA.DEFAUT_REGLAGES));
  r.qualite.style = "pastille"; r.qualite.montrer = "tout"; r.qualite.on = false;
  // La forme courte (lien) a oublié « pastille » et « tout » : la régie les retrouve.
  assert.equal(lit(LA.ecrireReglages(r)).qualite.style, "texte");
  const lu = essai(LA.ecrireReglages(r), { r, rp: null });
  assert.equal(lu.r.qualite.style, "pastille");
  assert.equal(lu.r.qualite.montrer, "tout");
  assert.equal(lu.rp, null);
  // La forme courte a changé ailleurs (titre éteint) : elle passe devant les réglages gardés.
  const ailleurs = JSON.parse(JSON.stringify(r)); ailleurs.titre.on = false;
  assert.equal(essai(LA.ecrireReglages(ailleurs), { r, rp: null }).r.titre.on, false);
  assert.equal(essai(LA.ecrireReglages(ailleurs), { r, rp: null }).r.qualite.style, "texte");
  // Rien de gardé, ou une valeur abîmée : la forme courte.
  assert.equal(essai(LA.ecrireReglages(r), "abîmé").r.qualite.style, "texte");
});

// Régie : fenêtre modale, le reste de la page est inerte tant qu'elle est ouverte.
test("regie_modale_inerte", () => {
  const html = page();
  assert.match(html, /regieFond\.forEach\(\(n\) => \{ n\.inert = true; \}\);/);
  assert.match(html, /regieFond\.forEach\(\(n\) => \{ n\.inert = false; \}\);/);
  // Repères des boutons préfixés par l'élément (plus de « Style:texte » en double).
  assert.match(html, /"data-cle": cleDe\(titre \+ ":" \+ String\(val\)\)/);
});

// Rangées et collections reconstruites : le focus reste sur le même élément, les listes de tuiles restent ouvertes.
test("focus_garde_apres_reconstruction", () => {
  const html = page();
  assert.match(html, /const ol = \$\("rows"\), rep = repereFocus\(ol\);/);
  assert.match(html, /const box = \$\("collections"\), rep = repereFocus\(box\);/);
  assert.match(html, /det\.open = ouvertes\.has\(c\.id\);/);
  assert.match(html, /rendFocus\(box, rep\);/);
});

// Billet en image : feuille de partage refermée = rien ; partage refusé = téléchargement ; image préparée avant le clic.
test("billet_image_partage_ou_telechargement", () => {
  const html = page();
  assert.match(html, /if \(err && err\.name === "AbortError"\) \{ partage = true; fin = label; \}/);
  assert.match(html, /if \(!partage\) telechargeBillet\(blob\);/);
  assert.match(html, /const blob = pret \|\| await prepareBillet\(\);/);
});

// Lien fixe : à la fermeture de l'onglet, le dernier réglage part tout de suite (keepalive), hors de la file.
test("lien_fixe_envoye_a_la_fermeture", () => {
  const html = page();
  const fin = html.slice(html.indexOf('addEventListener("pagehide"')).slice(0, 1200);
  assert.match(fin, /fetch\(D\.origin \+ "\/lien-fixe\/" \+ fixe\.id, [^\n]*keepalive: true/);
  assert.doesNotMatch(fin, /enregistre\(/);
  assert.match(html, /if \(n <= directN\) return;/);
});

// Lien fixe : sa page n'a pas la clé Gemini (voir fixe.js) ; avec la clé de modification, elle la relit avant tout
// enregistrement (un réglage envoyé sans elle l'effacerait du lien), et sans elle, rien ne s'enregistre jamais.
test("lien_fixe_rien_d_enregistre_avant_la_cle_relue", () => {
  const html = page();
  assert.match(html, /let secretsLus = !\(fixe && fixe\.modif\)/);
  assert.match(html, /function planifie\(seg\) \{\s*clearTimeout\(saveT\); saveT = 0;\s*\/\/[^\n]*\n\s*if \(!secretsLus\) \{[^\n]*return; \}\s*attenteGarde\(seg\);/);
  assert.match(html, /function enregistre\(seg\) \{\s*clearTimeout\(saveT\); saveT = 0;\s*if \(!secretsLus\) return;/);
  assert.match(html, /addEventListener\("pagehide", \(\) => \{\s*if \(!fixe \|\| !fixe\.modif \|\| !secretsLus\) return;/);
  assert.match(html, /fetch\(D\.origin \+ "\/lien-fixe\/" \+ id \+ "\/lire"/);
  // Le réglage resté en route n'est repris qu'une fois la clé relue.
  assert.match(html, /if \(fixe && fixe\.modif\) lireSecrets\(\);\nelse demarre = true;/);
  // La clé gardée sur cet appareil n'entre jamais dans un lien fixe (ni le sien, ni celui d'un autre).
  assert.equal((html.match(/state\.k = cleLue\(\)/g) || []).length, 1);
  assert.match(html, /if \(!fixe\) \{ if \(state\.k\) cleGarde\(state\.k\); else state\.k = cleLue\(\); \}/);
});

// Le chemin du réglage TMDB dans Nuvio TV (chaînes françaises de l'appli) : comme dans le guide.
test("chemin_tmdb_de_la_salle_2", () => {
  const html = page();
  assert.doesNotMatch(html, /Paramètres → Enrichissement TMDB/);
  assert.ok(html.includes("Paramètres → Intégrations → TMDB"));
});

// Retour sur /configure : la dernière programmation de l'appareil se rouvre, une fois par onglet et par adresse.
function essaiReprise({ chemin = "/configure", hash = "", garde = "/abc/configure", deja = null, guide = false } = {}) {
  const ls = new Map(garde ? [[DERNIERE, garde]] : []), ss = new Map(deja ? [["reprise", deja]] : []);
  const store = (m) => ({ getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) });
  let vers = null;
  reprise({ pathname: chemin, hash, replace: (u) => { vers = u; } }, store(ls), store(ss), { classList: { contains: (c) => guide && c === "dans-guide" } });
  return { vers, garde: ls.get(DERNIERE), reprise: ss.get("reprise") };
}
test("reprise_de_la_derniere_programmation", () => {
  assert.deepEqual(essaiReprise({ hash: "#s-hote" }), { vers: "/abc/configure#s-hote", garde: "/abc/configure", reprise: "/abc/configure" });
  assert.equal(essaiReprise({ garde: "/f1234567890/configure" }).vers, "/f1234567890/configure");
  // Rien à rouvrir : déjà sur une programmation, dans le guide, rien de gardé, adresse gardée bizarre.
  assert.equal(essaiReprise({ chemin: "/xyz/configure" }).vers, null);
  assert.equal(essaiReprise({ guide: true }).vers, null);
  assert.equal(essaiReprise({ garde: null }).vers, null);
  for (const garde of ["https://ailleurs.exemple/abc/configure", "//ailleurs.exemple/configure", "/abc/configure?x", "/a/b/configure", "/configure"]) {
    assert.equal(essaiReprise({ garde }).vers, null, garde);
  }
  // Revenu sur /configure dans le même onglet sans que la page rouverte ait démarré (lien fixe supprimé) : oubliée.
  assert.deepEqual(essaiReprise({ deja: "/abc/configure" }), { vers: null, garde: undefined, reprise: "/abc/configure" });
});

test("derniere_programmation_gardee_sans_cle", () => {
  assert.ok(reprise.toString().includes(`"${DERNIERE}"`));
  // L'adresse de la barre (pageUrl, sans la clé Gemini), jamais configureUrl ; oubliée après une remise d'origine.
  assert.match(SALLE2_JS, /const chemin = new URL\(pageUrl\)\.pathname;\s*if \(chemin !== "\/configure"\) localStorage\.setItem\("derniere-programmation", chemin\);\s*else if \(demarre\) localStorage\.removeItem/);
  assert.doesNotMatch(SALLE2_JS, /localStorage\.setItem\("derniere-programmation", [^)]*configureUrl/);
  // La page rouverte le dit, et efface la marque de l'onglet.
  assert.match(SALLE2_JS, /sessionStorage\.getItem\("reprise"\) === location\.pathname\) \{\s*sessionStorage\.removeItem\("reprise"\);\s*addEventListener\("DOMContentLoaded", \(\) => effet\("toast", "Ta dernière programmation est rouverte/);
  assert.match(page(), /<script>try\{\(function reprise\(/);
});

// Positions des tuiles d'après le rangement des sagas en thèmes (config.js : tv 2).
test("positions_des_tuiles_version_2", () => {
  const html = page();
  assert.match(html, /if \(o\.t \|\| o\.to\) o\.tv = 2;/);
});

// Collections : 19 avec les facultatives, trop pour la page : un résumé et une fenêtre pour les choisir.
test("collections_dans_une_fenetre", () => {
  const html = page();
  assert.match(html, /<button type="button" class="btn solid" id="coll-ouvrir">/);
  assert.match(html, /<dialog id="coll-dialog"[^>]*>[\s\S]*<div id="collections"[\s\S]*<\/dialog>/);
  assert.match(html, /id="coll-resume"/);
  assert.match(html, /\$\("coll-ouvrir"\)\.addEventListener\("click", \(\) => \$\("coll-dialog"\)\.showModal\(\)\)/);
});

// L'ordre de l'accueil (fenêtre « Ordre de l'accueil ») : rangées et collections mêlées, Plateformes à part (toujours
// en haut). La liste se calcule comme /accueil.json ; chaque déplacement s'écrit dans state.r et state.ac.
test("ordre_de_l_accueil_sur_le_site", () => {
  const html = page();
  assert.match(html, /<dialog id="acc-dialog"[^>]*>[\s\S]*<ol id="accueil-ordre"[\s\S]*<\/dialog>/);
  assert.match(html, /id="acc-ouvrir"/);
  const src = /function accueilListe\(\) \{[\s\S]*?\n\}\n/.exec(html)[0] + /function appliqueAccueil\(liste\) \{[\s\S]*?\n\}\n/.exec(html)[0];
  const D = { collections: [{ id: "plateformes-streaming", name: "P", pos: 0 }, { id: "genres", name: "G", pos: 1 }, { id: "sagas", name: "S", pos: 2 }] };
  const state = { r: ["a", "b", "c"], c: ["plateformes-streaming", "genres", "sagas"], ac: [], o: {} };
  const f = new Function("D", "state", "let order = [...state.r, \"z\"]; const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);"
    + " const byPos = (l) => [...l].sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99)); const rowInfo = (id) => ({ name: id });\n"
    + src + "\nreturn { accueilListe, appliqueAccueil, order: () => order };")(D, state);
  const cles = () => f.accueilListe().map((it) => (it.coll ? "c:" + it.coll.id : "r:" + it.row));
  assert.deepEqual(cles(), ["r:a", "r:b", "r:c", "c:genres", "c:sagas"]);
  const par = (liste) => liste.map((k) => f.accueilListe().find((it) => (it.coll ? "c:" + it.coll.id : "r:" + it.row) === k));
  f.appliqueAccueil(par(["r:a", "c:genres", "r:b", "r:c", "c:sagas"]));
  assert.deepEqual(state.ac, [{ id: "genres", n: 1 }, { id: "sagas", n: 3 }]);
  assert.deepEqual(cles(), ["r:a", "c:genres", "r:b", "r:c", "c:sagas"]);
  f.appliqueAccueil(par(["c:sagas", "r:b", "r:a", "c:genres", "r:c"]));
  assert.deepEqual(state.r, ["b", "a", "c"]);
  assert.deepEqual(state.ac, [{ id: "sagas", n: 0 }, { id: "genres", n: 2 }]);
  assert.deepEqual(f.order(), ["b", "a", "c", "z"]);
  // Revenu à l'ordre habituel (collections après les rangées) : rien dans le lien.
  f.appliqueAccueil(par(["r:b", "r:a", "r:c", "c:genres", "c:sagas"]));
  assert.deepEqual(state.ac, []);
});
