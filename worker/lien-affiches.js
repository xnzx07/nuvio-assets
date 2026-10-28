/**
 * Réglages des affiches maison (la « régie » de la salle 2) et leur écriture dans le lien d'affiches.
 * Deux copies identiques : worker/lien-affiches.js (le site) et affiches/lib/lien-affiches.js (le service sur
 * Vercel) ; un test vérifie qu'elles le restent. Tout tient dans une seule fonction autonome,
 * creerLienAffiches : le script commun des pages du site (worker/nuvio.js) la reprend telle quelle.
 *
 * Le lien porte un seul paramètre, s=1.<codes> : 2 caractères par réglage qui diffère du défaut, toujours
 * dans le même ordre, sans les sous-réglages d'une voie éteinte. Un même réglage donne donc un seul lien.
 * Les anciens liens (o = lettres des éléments coupés, r=tmdb) sont encore lus.
 */
export function creerLienAffiches() {
  const geler = (o) => { Object.values(o).forEach((v) => Object.freeze(v)); return Object.freeze(o); };
  const copie = (r) => JSON.parse(JSON.stringify(r));

  const DEFAUT_REGLAGES = geler({
    statut: { on: true, style: "texte", episode: false, forme: "date", fin: false, avance: false },
    tendance: { on: true, style: "fleche" },
    qualite: { on: true, montrer: "plus", style: "texte" },
    // Langue des sources (VF, MULTI, VOSTFR, VO), sous la qualité.
    langue: { on: false },
    // Badges du haut : « auto » = le style propre à chaque badge (ci-dessus) ; sinon un style commun.
    haut: { inverse: false, style: "auto", forme: "arrondi", opacite: "l", couleur: "blanc", fond: "", coinStatut: "auto", coinQualite: "auto" },
    bandeau: { on: false, porte: "statut", coin: "d" },
    titre: { on: true, taille: 1, place: "auto", langue: "fr", monte: 0, large: 1, effet: "aucun" },
    note: { on: true, source: "imdb", principale: true, deux: false, style: "etoile", rt: false, mc: false, lb: false, mal: false, moyenne: false, couleur: "non" },
    genre: { on: true, forme: "court" },
    annee: { on: true },
    // Durée d'un film, saisons d'une série : les deux, ou l'un seulement (Nuvio montre déjà la durée d'un film).
    duree: { on: false, pour: "tout" },
    age: { on: false },
    plateforme: { on: false, place: "ligne" },
    ligne: { ordre: "gna", barre: "aucune" },
    texte: { taille: 1, sep: "point", haut: 1, police: "inter", couleur: "", casse: "normal", espace: "normal", ombre: "normale" },
    infos: { ligne2: "aucune", culte: false, saga: false },
    image: { source: "sanstexte", lum: 1, contraste: 1, satur: 1, filtre: "aucun", grain: false, cadre: "aucun", cadreC: "" },
    // opacite et taille : réglage fin du fondu (0 = pas réglé : on garde force et hauteur en crans).
    fondu: { on: true, couleur: "noir", force: "m", flou: false, hauteur: "normal", teinte: "", opacite: 0, taille: 0 },
    ambiance: { voile: "m", vignette: false, accent: "or", accentC: "" },
    sortie: { nb: true, cacherNote: true },
    // Habillage de la saison (Halloween, Noël…) sur les films de la rangée de saison.
    saison: { on: false },
  });

  // Tailles réglables à la main : de 60 % à 140 % par pas de 5 %, une lettre par cran (a = 0,6, i = 1, q = 1,4).
  const TAILLES = Object.freeze(Object.fromEntries([..."abcdefghijklmnopq"].map((c, i) => [c, Math.round(60 + i * 5) / 100])));
  const cranDe = (v) => Object.keys(TAILLES).reduce((a, c) => (Math.abs(TAILLES[c] - v) < Math.abs(TAILLES[a] - v) ? c : a));
  // Hauteur du titre : remonté de 0 à 30 % de la hauteur de l'image, par pas de 5 %.
  const MONTEES = Object.freeze({ a: 0, b: 0.05, c: 0.1, d: 0.15, e: 0.2, f: 0.25, g: 0.3 });
  // Retouches de l'image : luminosité et contraste de 70 à 130 % (g = 100 %), saturation de 0 à 160 % (k = 100 %).
  const RETOUCHES = Object.freeze(Object.fromEntries([..."abcdefghijklm"].map((c, i) => [c, Math.round(70 + i * 5) / 100])));
  // Fondu réglé finement : force de 30 à 100 % (a = 0,30… o = 1,00), hauteur de 25 à 85 % de l'image (a = 0,25… m = 0,85).
  const FORCES_FONDU = Object.freeze(Object.fromEntries([..."abcdefghijklmno"].map((c, i) => [c, Math.round(30 + i * 5) / 100])));
  const HAUTEURS_FONDU = Object.freeze(Object.fromEntries([..."abcdefghijklm"].map((c, i) => [c, Math.round(25 + i * 5) / 100])));
  const SATURATIONS = Object.freeze(Object.fromEntries([..."abcdefghijklmnopq"].map((c, i) => [c, i / 10])));
  // Nuancier : 36 couleurs, une par caractère (0–9, a–z) : blancs et gris, ors et oranges, rouges et roses,
  // violets et bleus, cyans et verts, bruns et crèmes.
  const PALETTE = Object.freeze(Object.fromEntries([..."0123456789abcdefghijklmnopqrstuvwxyz"].map((c, i) => [c, [
    "#ffffff", "#e6e6e6", "#b3b3b3", "#7a7a7a", "#3d3d3d", "#000000",
    "#fff3b0", "#f5c518", "#e8a33d", "#ff8a00", "#d9661f", "#a8541b",
    "#ffb3c1", "#ff5c8a", "#e5484d", "#c21f3a", "#8e1b2e", "#5c1020",
    "#d7c4ff", "#a970ff", "#6e3cc4", "#4c9aff", "#1f5fd1", "#14306e",
    "#a8f0ff", "#26c6da", "#00897b", "#46c46e", "#2e8b3d", "#1b4d2a",
    "#f3ead7", "#e0c9a6", "#b8946a", "#8a6a4c", "#5b4031", "#2e1f17",
  ][i]])));
  /** Le cran le plus proche dans une échelle de nombres. */
  const procheDe = (echelle, v) => Object.keys(echelle).reduce((a, c) => (Math.abs(echelle[c] - v) < Math.abs(echelle[a] - v) ? c : a));
  const ECHELLES = [TAILLES, RETOUCHES, SATURATIONS, FORCES_FONDU, HAUTEURS_FONDU];
  const COULEUR = Object.freeze(Object.fromEntries(Object.keys(PALETTE).map((c) => [c, c])));

  // Chaque code : [lettre, voie, champ, { caractère: valeur }, quand l'écrire]. L'ordre du tableau est l'ordre du lien.
  const titreOn = (r) => r.titre.on;
  const noteOn = (r) => r.titre.on && r.note.on;
  // Un badge en haut (statut, tendance, qualité, ou la plateforme en coin) : les réglages des badges servent.
  const hautOn = (r) => r.statut.on || r.tendance.on || r.qualite.on || (r.plateforme.on && r.plateforme.place === "coin") || r.infos.culte
    || r.langue.on || r.infos.saga;
  const styleCommun = (r) => hautOn(r) && r.haut.style !== "auto";
  // Du texte est écrit sur l'affiche (ligne du bas ou badges) : casse, espacement et ombre servent.
  const texteOn = (r) => r.titre.on || hautOn(r) || r.infos.culte;
  // Coins des blocs du haut : 1 haut gauche, 2 haut droite, 3 bas gauche, 4 bas droite.
  const COINS = Object.freeze({ 1: "hg", 2: "hd", 3: "bg", 4: "bd" });
  // La couleur d'accent sert à l'étoile, à la flèche ou au ruban de tendance, au bandeau, à la barre fine, au texte « accent » des badges,
  // à la barre d'avancement d'une série.
  const accentOn = (r) => r.tendance.on || (r.bandeau.on && (r.statut.on || r.tendance.on))
    || (r.titre.on && ((r.note.on && r.note.style === "etoile") || r.ligne.barre === "fine")) || (styleCommun(r) && r.haut.couleur === "or") || r.infos.culte
    || (r.statut.on && r.statut.avance);
  const CODES = [
    ["S", "statut", "on", { 0: false }],
    ["s", "statut", "style", { e: "etiquette" }, (r) => r.statut.on],
    ["T", "tendance", "on", { 0: false }],
    ["t", "tendance", "style", { r: "ruban" }, (r) => r.tendance.on],
    ["Q", "qualite", "on", { 0: false }],
    ["q", "qualite", "montrer", { 4: "4k", t: "tout" }, (r) => r.qualite.on],
    ["k", "qualite", "style", { p: "pastille" }, (r) => r.qualite.on],
    ["I", "haut", "inverse", { 1: true }, hautOn],
    ["H", "haut", "style", { p: "plein", v: "verre", c: "contour" }, hautOn],
    ["y", "haut", "forme", { c: "carre", p: "pilule" }, styleCommun],
    ["a", "haut", "opacite", { s: "s", m: "m" }, styleCommun],
    ["C", "haut", "couleur", { o: "or", n: "noir" }, styleCommun],
    ["J", "bandeau", "on", { 1: true }, (r) => r.statut.on || r.tendance.on],
    ["K", "bandeau", "porte", { t: "tendance" }, (r) => r.bandeau.on && (r.statut.on || r.tendance.on)],
    ["E", "bandeau", "coin", { g: "g" }, (r) => r.bandeau.on && (r.statut.on || r.tendance.on)],
    ["L", "titre", "on", { 0: false }],
    ["l", "titre", "taille", TAILLES, titreOn],
    ["o", "titre", "place", { g: "gauche", c: "centre" }, titreOn],
    ["u", "titre", "langue", { e: "en", v: "vo" }, titreOn],
    ["m", "titre", "monte", MONTEES, titreOn],
    ["j", "titre", "large", TAILLES, titreOn],
    ["N", "note", "on", { 0: false }, titreOn],
    ["n", "note", "source", { t: "tmdb" }, (r) => noteOn(r) && r.note.principale],
    ["e", "note", "style", { n: "nu", g: "grand", b: "badge" }, noteOn],
    ["R", "note", "rt", { 1: true }, noteOn],
    ["M", "note", "mc", { 1: true }, noteOn],
    ["b", "note", "lb", { 1: true }, noteOn],
    ["c", "note", "couleur", { o: "oui", h: "halo" }, noteOn],
    ["G", "genre", "on", { 0: false }, titreOn],
    ["g", "genre", "forme", { c: "complet" }, (r) => r.titre.on && r.genre.on],
    ["A", "annee", "on", { 0: false }, titreOn],
    ["D", "duree", "on", { 1: true }, titreOn],
    ["Y", "age", "on", { 1: true }, titreOn],
    ["P", "plateforme", "on", { 1: true }, (r) => r.titre.on || r.plateforme.place === "coin"],
    ["v", "plateforme", "place", { c: "coin" }, (r) => r.plateforme.on],
    ["O", "ligne", "ordre", { n: "nga", a: "agn" }, titreOn],
    ["r", "ligne", "barre", { v: "verre", f: "fine" }, titreOn],
    ["x", "texte", "taille", TAILLES, titreOn],
    ["p", "texte", "sep", { b: "barre", u: "puce" }, titreOn],
    ["z", "texte", "haut", TAILLES, hautOn],
    ["w", "texte", "police", { b: "bebas", e: "elegante", r: "arrondie", c: "condensee" }, (r) => r.titre.on || hautOn(r)],
    ["F", "fondu", "on", { 0: false }, titreOn],
    ["f", "fondu", "couleur", { a: "affiche" }, (r) => r.titre.on && r.fondu.on],
    ["i", "fondu", "force", { s: "s", l: "l" }, (r) => r.titre.on && r.fondu.on],
    ["d", "fondu", "flou", { 1: true }, (r) => r.titre.on && r.fondu.on],
    ["W", "fondu", "hauteur", { c: "court", l: "long" }, (r) => r.titre.on && r.fondu.on],
    ["U", "image", "source", { o: "officielle", f: "fond" }, titreOn],
    ["V", "ambiance", "voile", { 0: "0", s: "s", l: "l" }, (r) => hautOn(r) || (r.bandeau.on && (r.statut.on || r.tendance.on))],
    ["X", "ambiance", "vignette", { 1: true }],
    // Une couleur du nuancier remplace l'accent de base : celui-ci n'est alors plus écrit.
    ["Z", "ambiance", "accent", { b: "blanc", r: "rouge", u: "bleu", a: "affiche" }, (r) => accentOn(r) && !r.ambiance.accentC],
    ["B", "sortie", "nb", { 0: false }],
    ["h", "sortie", "cacherNote", { 0: false }, (r) => r.titre.on && r.note.on],
    // Régie v3 : clés de 2 caractères (un chiffre de 0 à 3, une lettre) et une valeur d'un caractère.
    ["0a", "ambiance", "accentC", COULEUR, accentOn],
    ["0b", "texte", "couleur", COULEUR, titreOn],
    ["0c", "haut", "fond", COULEUR, (r) => styleCommun(r) && r.haut.style === "plein"],
    ["0d", "fondu", "teinte", COULEUR, (r) => r.titre.on && r.fondu.on],
    ["1a", "image", "lum", RETOUCHES],
    ["1b", "image", "contraste", RETOUCHES],
    ["1c", "image", "satur", SATURATIONS],
    ["1d", "image", "filtre", { n: "nb", s: "sepia", f: "froid", c: "chaud" }],
    ["1e", "image", "grain", { 1: true }],
    ["1f", "image", "cadre", { b: "blanc", o: "or", c: "couleur" }],
    ["1g", "image", "cadreC", COULEUR, (r) => r.image.cadre === "couleur"],
    // Majuscules et espacement : pour la ligne du bas et la petite ligne seulement (il faut le titre).
    ["2a", "texte", "casse", { m: "maj" }, titreOn],
    ["2b", "texte", "espace", { a: "aere", t: "tresaere" }, titreOn],
    ["2c", "texte", "ombre", { 0: "aucune", f: "forte" }, texteOn],
    ["2d", "titre", "effet", { o: "ombre", h: "halo" }, titreOn],
    ["3a", "infos", "ligne2", { r: "realisateur", a: "accroche", s: "studio" }, titreOn],
    ["3b", "infos", "culte", { 1: true }],
    ["3c", "statut", "episode", { 1: true }, (r) => r.statut.on],
    ["3d", "statut", "forme", { c: "compte" }, (r) => r.statut.on],
    ["3e", "haut", "coinStatut", COINS, (r) => r.statut.on || r.tendance.on || r.infos.culte || r.infos.saga],
    ["1h", "fondu", "opacite", FORCES_FONDU, (r) => r.titre.on && r.fondu.on && r.fondu.opacite > 0],
    ["1i", "fondu", "taille", HAUTEURS_FONDU, (r) => r.titre.on && r.fondu.on && r.fondu.taille > 0],
    ["3f", "haut", "coinQualite", COINS, (r) => r.qualite.on || (r.plateforme.on && r.plateforme.place === "coin") || r.langue.on],
    // Options ajoutées ensuite, toutes éteintes par défaut : langue des sources, fin et avancement d'une série, rang dans
    // la saga, habillage de la saison.
    ["3g", "langue", "on", { 1: true }],
    ["3h", "statut", "fin", { 1: true }, (r) => r.statut.on],
    ["3i", "statut", "avance", { 1: true }, (r) => r.statut.on],
    ["3j", "infos", "saga", { 1: true }],
    ["3k", "saison", "on", { 1: true }],
    // La note MyAnimeList (animés), et une seule note : la moyenne de celles choisies.
    ["3l", "note", "mal", { 1: true }, noteOn],
    ["3m", "note", "moyenne", { 1: true }, noteOn],
    // IMDb et TMDB ensemble (la principale, puis l'autre) ; ou ni l'une ni l'autre (seulement les autres sites).
    ["3n", "note", "deux", { 1: true }, (r) => noteOn(r) && r.note.principale],
    ["3o", "note", "principale", { 0: false }, noteOn],
    // Durée des films seulement, ou saisons des séries seulement.
    ["3p", "duree", "pour", { f: "films", s: "series" }, (r) => r.titre.on && r.duree.on],
  ];

  /** Les styles tout prêts de la régie (« mémoires »). */
  const de = (changer) => { const r = copie(DEFAUT_REGLAGES); changer(r); return geler(r); };
  const MEMOIRES = Object.freeze({
    maison: DEFAUT_REGLAGES,
    essentiel: de((r) => { r.statut.on = false; r.tendance.on = false; r.genre.on = false; r.annee.on = false; }),
    noteSeule: de((r) => {
      r.statut.on = false; r.tendance.on = false; r.qualite.on = false; r.genre.on = false; r.annee.on = false; r.note.style = "grand";
    }),
    // Façon affiche de cinéma : police haute et serrée, note en badge, âge conseillé, fond flouté sous le titre.
    cine: de((r) => {
      r.texte.police = "bebas"; r.note.style = "badge"; r.fondu.flou = true; r.age.on = true; r.statut.style = "etiquette";
    }),
    // Façon Posters+ : plusieurs notes colorées, ligne sur une bande de verre, statut en bandeau, badges en verre.
    postersPlus: de((r) => {
      r.note.rt = true; r.note.mc = true; r.note.couleur = "oui"; r.ligne.barre = "verre"; r.bandeau.on = true;
      r.haut.style = "verre"; r.haut.forme = "pilule";
    }),
    // La plateforme où regarder le titre, la note en badge et la durée.
    plateforme: de((r) => { r.plateforme.on = true; r.note.style = "badge"; r.duree.on = true; }),
    nue: de((r) => {
      for (const v of ["statut", "tendance", "qualite", "titre", "note", "genre", "annee", "fondu"]) r[v].on = false;
      r.sortie.nb = false;
    }),
    // Statuts complets (nouvel épisode, fin, avance), note colorée, durée, Incontournable et saga, fondu court et flou aux
    // couleurs de l'affiche ; le paysage a ses propres réglages (MEMOIRES_PAYSAGE).
    signature: geler(lireReglages(new URLSearchParams({ s: "1.coD1faild1Wc0a10b02do3b13c13e11he1ia3f23h13i13j1" }))),
  });
  /** Le paysage des styles qui en ont un à part (texte plus grand, sans fondu) ; les autres : comme le portrait. */
  const MEMOIRES_PAYSAGE = Object.freeze({
    signature: geler(lireReglages(new URLSearchParams({ s: "1.coD1xqfaild1Wc0a10b02do3b13c13e11ia3f23h13i13j1" }))),
  });
  // Les affiches sont servies en fichiers tout faits (Worker « affiches » de Cloudflare), un dossier par style tout prêt ;
  // un réglage perso a le sien, /perso/<code>/ (dessiné à la demande par le serveur des affiches).
  const STATIQUES = "https://affiches.xnzxflix.workers.dev";
  const DOSSIERS = Object.freeze({ maison: "maison", essentiel: "essentiel", noteSeule: "note", cine: "cine", postersPlus: "postersplus", plateforme: "plateforme", signature: "signature" });

  /** Valeur canonique du paramètre s (sans « 1. ») ; "" quand tout est par défaut. */
  function ecrireReglages(r) {
    let s = "";
    for (const [lettre, voie, champ, valeurs, quand] of CODES) {
      if (quand && !quand(r)) continue;
      const v = r[voie][champ];
      // Une taille ou une retouche est ramenée au cran le plus proche ; au cran de 100 %, c'est le défaut.
      const car = ECHELLES.includes(valeurs) ? procheDe(valeurs, Number.isFinite(Number(v)) ? Number(v) : 1) : Object.keys(valeurs).find((k) => valeurs[k] === v);
      if (car === undefined || valeurs[car] === DEFAUT_REGLAGES[voie][champ]) continue;
      s += lettre + car;
    }
    return s;
  }

  /** Réglages lus dans les paramètres d'un lien d'affiches (s=1.…, ou les anciens o et r). */
  function lireReglages(params) {
    const r = copie(DEFAUT_REGLAGES);
    const s = params.get("s");
    if (s !== null) {
      if (!s.startsWith("1.")) return r;
      const codes = s.slice(2);
      for (let i = 0; i + 1 < codes.length;) {
        // Clé v3 (0a, 1c…) : 2 caractères de clé ; sinon 1. Puis la valeur, d'un caractère.
        const long = /[0-3]/.test(codes[i]) ? 2 : 1, cle = codes.slice(i, i + long), car = codes[i + long];
        i += long + 1;
        if (car === undefined) break;
        const code = CODES.find((c) => c[0] === cle);
        if (code && Object.prototype.hasOwnProperty.call(code[3], car)) r[code[1]][code[2]] = code[3][car];
      }
      return r;
    }
    // Ancien lien (étape 1) : o = lettres des éléments coupés, r=tmdb = note TMDB.
    const o = params.get("o") || "";
    const coupes = { t: "tendance", q: "qualite", n: "note", g: "genre", a: "annee", l: "titre" };
    for (const [k, voie] of Object.entries(coupes)) if (o.includes(k)) r[voie].on = false;
    if (Object.keys(coupes).every((k) => o.includes(k))) { r.statut.on = false; r.fondu.on = false; r.sortie.nb = false; }
    if (params.get("r") === "tmdb") r.note.source = "tmdb";
    return r;
  }

  /** Réglages du paysage : sp s'il y en a (réglages à part), sinon les mêmes que le portrait (s). */
  function lireReglagesPaysage(params) {
    const sp = params.get("sp");
    return sp === null ? lireReglages(params) : lireReglages(new URLSearchParams({ s: sp }));
  }

  /**
   * Le dossier du style tout prêt de ces réglages (rp : réglages à part pour le paysage, ou null), ou null : réglage
   * perso, ou paysage qui ne va pas avec ce style.
   */
  function dossierDe(r, rp) {
    const m = memoireDe(r || DEFAUT_REGLAGES);
    if (!m || !DOSSIERS[m]) return null;
    const paysage = MEMOIRES_PAYSAGE[m] || MEMOIRES[m];
    return !rp || ecrireReglages(rp) === ecrireReglages(paysage) ? DOSSIERS[m] : null;
  }

  /**
   * Le lien à coller dans Nuvio (Paramètres → Disposition → Custom Poster Source) : celui du style tout prêt de ces
   * réglages, sinon /perso/<code>/ : les codes du portrait et, s'il a ses propres réglages, du paysage après un tiret
   * (« 0 » : le portrait par défaut ; un code n'a jamais un seul caractère). Les fichiers statiques ignorent « ?… ».
   */
  function lienAffiches(r, rp) {
    const d = dossierDe(r, rp);
    if (d) return `${STATIQUES}/${d}/{type}/{shape}/{id}.jpg`;
    const s = ecrireReglages(r || DEFAUT_REGLAGES), sp = rp ? ecrireReglages(rp) : s;
    if (!s && sp === s) return `${STATIQUES}/maison/{type}/{shape}/{id}.jpg`;
    return `${STATIQUES}/perso/${s || "0"}${sp !== s ? "-" + (sp || "0") : ""}/{type}/{shape}/{id}.jpg`;
  }

  /**
   * Réglages d'un lien d'affiches collé dans la régie (« importer ») : { r, rp } (rp : réglages à part du paysage,
   * ou null), ou null si ce n'est pas un lien d'affiches (…/{type}/{shape}/{id}.jpg ou l'adresse d'une affiche).
   */
  function reglagesDuLien(texte) {
    let t = String(texte || "").trim();
    // Copié d'une barre d'adresse ou d'une appli : accolades (voire tout le lien) codées, %7Btype%7D…
    for (let i = 0; i < 2 && /%[0-9a-f]{2}/i.test(t); i++) { try { t = decodeURIComponent(t); } catch (e) { break; } }
    if (!/\/(\{type\}|movie|series)\/(\{shape\}|poster|landscape)\/[^/?]+\.jpg(\?|$)/.test(t)) return null;
    // Lien d'un style tout prêt (…/signature/{type}/…) : ses réglages.
    const d = /\/([a-z]+)\/(?:\{type\}|movie|series)\//.exec(t);
    const m = d && Object.keys(DOSSIERS).find((k) => DOSSIERS[k] === d[1]);
    if (m) return { r: copie(MEMOIRES[m]), rp: MEMOIRES_PAYSAGE[m] ? copie(MEMOIRES_PAYSAGE[m]) : null };
    // Lien perso (…/perso/<code>[-<code du paysage>]/…) : ses réglages.
    const p = /\/perso\/([0-9A-Za-z]+)(?:-([0-9A-Za-z]+))?\//.exec(t);
    const code = (x) => lireReglages(new URLSearchParams(x && x !== "0" ? { s: "1." + x } : {}));
    if (p) return { r: code(p[1]), rp: p[2] ? code(p[2]) : null };
    const params = new URLSearchParams(t.includes("?") ? t.slice(t.indexOf("?") + 1) : "");
    return { r: lireReglages(params), rp: params.has("sp") ? lireReglagesPaysage(params) : null };
  }

  /** Le nom de la mémoire qui correspond à ces réglages, ou null (réglage perso). */
  function memoireDe(r) {
    const s = ecrireReglages(r);
    return Object.keys(MEMOIRES).find((nom) => ecrireReglages(MEMOIRES[nom]) === s) || null;
  }

  return { DEFAUT_REGLAGES, TAILLES, MONTEES, RETOUCHES, SATURATIONS, PALETTE, MEMOIRES, MEMOIRES_PAYSAGE, ecrireReglages, lireReglages, lireReglagesPaysage, lienAffiches, dossierDe, memoireDe, reglagesDuLien };
}

export const { DEFAUT_REGLAGES, TAILLES, MONTEES, RETOUCHES, SATURATIONS, PALETTE, MEMOIRES, MEMOIRES_PAYSAGE, ecrireReglages, lireReglages, lireReglagesPaysage, lienAffiches, dossierDe, memoireDe, reglagesDuLien } = creerLienAffiches();
