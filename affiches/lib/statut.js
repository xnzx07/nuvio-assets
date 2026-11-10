/**
 * Sortie d'un titre, vue de France : est-il disponible chez soi en VF (« sorti »), et quel statut afficher
 * au-dessus de son rang (« Bientôt », « En salle », « Nouveau », « Nouvelle saison ») ?
 * Mêmes règles que les rangées et les fiches de l'addon (worker/index.js : dispoChezSoi, enVfChezSoi, releaseNote) :
 * - chez soi = le calendrier américain des sorties numériques (Premium VOD) seulement : c'est le fichier américain qui
 *   fait apparaître les sources, souvent déjà avec la VF ; la chronologie des médias française ne compte pas
 *   (dispoChezSoi) ;
 * - avant ce jour : pas sorti, avec la date (« DISPO LE 17 NOV. », « DISPO VERS LE … » : estimée d'après la fenêtre
 *   habituelle du distributeur américain, facts.vod, voir lib/estimations.js) ;
 * - à partir de ce jour, les sources lues chez Torrentio (avec la qualité, ce qu'on obtient en faisant « Lire »)
 *   disent si le fichier a la VF : sans VF, pas sorti (seule la VF compte), « Bientôt » sans date (on ne sait pas
 *   quand elle viendra), de même sans aucune source (rien de publié, donc pas de VF) ; avec la VF ou sans sources
 *   lues (Torrentio muet) : sorti, la date dit vrai.
 * Pas sorti : noir et blanc et note cachée sur l'affiche (réglage « Pas sorti »). Des sources VF suffisent, même avant
 * la date (sortie française plus tôt, film français) ; sans sources lues, une plateforme en France aussi
 * (facts.plateformeFrance, en VF d'après lib/tmdb.js).
 */
const NOUVEAU_JOURS = 30, SALLE_JOURS = 45;

const ajoute = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);

function releaseDates(releases, types, pays) {
  return (releases || [])
    .filter((r) => !pays || pays.includes(r.iso_3166_1))
    .flatMap((r) => r.release_dates || [])
    .filter((r) => types.includes(r.type))
    .map((r) => (r.release_date || "").slice(0, 10))
    .filter(Boolean)
    .sort();
}

/**
 * Sorti chez soi en VO seulement : quand la VFF viendra, seulement si la France le dit (sortie numérique française
 * annoncée, sinon la salle en France + 4 mois). La même fonction que vffApresVo dans worker/index.js : la fiche et
 * l'affiche disent le même jour (Malfaisante : « DISPO VERS LE 14 FÉVR. »). Jamais sorti en France : null.
 */
export function vffApresVo(releases, today) {
  const numerique = releaseDates(releases, [4, 5, 6], ["FR"]).find((d) => d > today);
  if (numerique) return { date: numerique, vers: false };
  const salle = releaseDates(releases, [2, 3], ["FR"])[0];
  if (!salle) return null;
  const d = new Date(`${salle}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 4);
  const le = d.toISOString().slice(0, 10);
  return le > today ? { date: le, vers: true } : null;
}

// ---------- Fenêtres salle → numérique des distributeurs américains ----------
// Les mêmes fonctions que dans worker/index.js (tableVod, estimationDe, fenetreVod, besoinEstimation) : la table
// data/estimations-vod.json (lue par lib/estimations.js) donne la fenêtre du distributeur d'un film.
const joursValides = (n) => Number.isInteger(n) && n >= 0 && n <= 200;
/** Le fichier lu, vérifié : { mediane (ou null), films, fenetres }, ou null s'il n'a pas la bonne forme. */
export function tableVod(d) {
  if (!d || typeof d !== "object" || !d.films || typeof d.films !== "object") return null;
  return { mediane: joursValides(d.mediane) ? d.mediane : null, films: d.films, fenetres: d.fenetres && typeof d.fenetres === "object" ? d.fenetres : {} };
}

/** L'entrée d'un film (identifiant IMDb) dans la table, et la médiane générale, pour dispoChezSoi ; null sans table. */
export function estimationDe(table, imdb) {
  if (!table) return null;
  return { film: imdb && Object.hasOwn(table.films, imdb) ? table.films[imdb] : null, mediane: table.mediane };
}

/**
 * Jours entre la salle américaine et l'estimation de la sortie numérique : la fenêtre du distributeur du film (table),
 * sinon la médiane de tous les films mesurés, sinon 45 jours. Ajoutés à la salle connue aujourd'hui (pas la date toute
 * faite de la table) : une sortie en salle repoussée depuis la nuit décale l'estimation aussi.
 */
function fenetreVod(vod) {
  const f = vod && vod.film;
  if (f && joursValides(f.jours)) return f.jours;
  return vod && joursValides(vod.mediane) ? vod.mediane : SALLE_JOURS;
}

/** Une estimation à faire : sortie en salle aux États-Unis, sans sortie numérique américaine annoncée. */
export const besoinEstimation = (releases) => releaseDates(releases, [2, 3], ["US"]).length > 0 && !releaseDates(releases, [4], ["US"]).length;

/**
 * Le jour où un film arrive chez soi, et si ce n'est qu'une estimation (vers) : { date, vers }, date vide sans aucune
 * sortie. Le calendrier américain seulement (le fichier américain fait les sources, avec ou sans VF) :
 *   - sa sortie numérique aux États-Unis, annoncée (L'Odyssée : le 17 nov., même en salle en France depuis juillet) ;
 *   - sinon sa sortie en salle aux États-Unis + la fenêtre habituelle de son distributeur américain, en estimation
 *     (vod = estimationDe : Universal 18 jours, Disney 60…, voir fenetreVod) ;
 *   - film français (rarement sorti aux États-Unis), ou film étranger jamais sorti aux États-Unis : ses propres dates,
 *     la première sortie numérique (vidéo, télé) où que ce soit, sinon la première salle + 45 jours.
 * La même fonction que dispoChezSoi dans worker/index.js : l'affiche et la fiche disent le même jour.
 */
export function dispoChezSoi(releases, langue, vod = null) {
  if (langue !== "fr") {
    const numerique = releaseDates(releases, [4], ["US"])[0];
    if (numerique) return { date: numerique, vers: false };
    const salle = releaseDates(releases, [2, 3], ["US"])[0];
    // Date déjà annoncée par le studio (dvdsreleasedates.com, dans la table de la nuit) : sûre, plus une estimation.
    const annonce = vod && vod.film && /^\d{4}-\d{2}-\d{2}$/.test(vod.film.annonce || "") ? vod.film.annonce : "";
    if (salle && annonce) return { date: annonce, vers: false };
    if (salle) return { date: ajoute(salle, fenetreVod(vod)), vers: true };
  }
  const connu = releaseDates(releases, [4, 5, 6])[0];
  if (connu) return { date: connu, vers: false };
  // Film en français : la vidéo à la demande 4 mois après la salle en France (chronologie des médias), comme l'addon.
  const salleFr = langue === "fr" ? releaseDates(releases, [2, 3], ["FR"])[0] : "";
  if (salleFr) {
    const d = new Date(`${salleFr}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 4);
    return { date: d.toISOString().slice(0, 10), vers: true };
  }
  const salle = releaseDates(releases, [2, 3])[0];
  return salle ? { date: ajoute(salle, SALLE_JOURS), vers: true } : { date: "", vers: false };
}

/**
 * Un vieux film : sorti il y a plus d'un an, où que ce soit (même ressorti ou annoncé à nouveau). Les avant-premières
 * de festival (type 1) ne comptent pas : un film y passe souvent un an avant sa sortie (Bad Apples), sauf s'il n'a
 * jamais eu que ça, il y a plus de deux ans. Pas un vieux film s'il sort bientôt au cinéma en France pour la première
 * fois (3670 : festivals et sortie coréenne il y a plus d'un an) ; une vraie reprise (film de plus de deux ans,
 * Quand la mer monte, 2004) en reste un.
 */
function estVieux(facts, today) {
  const toutes = releaseDates(facts.releases, [1, 2, 3, 4, 5, 6]);
  const commerciales = releaseDates(facts.releases, [2, 3, 4, 5, 6]);
  const vieux = commerciales[0] ? commerciales[0] < ajoute(today, -365) : toutes[0] < ajoute(today, -730);
  const enFranceAVenir = releaseDates(facts.releases, [2, 3], ["FR"]).some((d) => d > today);
  return vieux && !(enFranceAVenir && (commerciales[0] || toutes[0]) >= ajoute(today, -730));
}

/** Les sources valent-elles d'être lues pour le statut ? Un film récent déjà sorti quelque part, une série récente. */
export function sourcesUtiles(facts, today) {
  if (facts.type === "series") return !!facts.firstAir && facts.firstAir <= today && (facts.lastEpisode || facts.firstAir) >= ajoute(today, -365);
  const commerciales = releaseDates(facts.releases, [2, 3, 4, 5, 6]);
  return commerciales.some((d) => d <= today) && !estVieux(facts, today);
}

/** Les sources lues (avec la qualité) : { vf, sources } si on sait, sinon null (les dates décident). */
const lues = (sources) => (sources && typeof sources.vf === "boolean" ? sources : null);

function sortieFilm(facts, today, sources) {
  const toutes = releaseDates(facts.releases, [1, 2, 3, 4, 5, 6]);
  if (!toutes.length) {
    // Pas de dates détaillées : la date de la fiche, si elle existe, dit seulement si le film est sorti.
    const sorti = !!facts.releaseDate && facts.releaseDate <= today;
    if (sorti) return { sorti, statut: null };
    return facts.releaseDate ? { sorti, statut: "bientot", quand: { quoi: "sortie", date: facts.releaseDate, vers: false } } : { sorti, statut: "bientot" };
  }
  // Vieux film que Torrentio, Lumio et StreamFusion voient tous sans VF (facts.sansVf : data/sans-vf.json, Bad Genius) :
  // ni sorti, ni « Bientôt » (elle n'arrivera sans doute jamais).
  // La liste SANS VF a jusqu'à 60 jours de retard : un fichier VFF explicite (sources.vff) passe avant elle.
  if (estVieux(facts, today)) return facts.sansVf && !(sources && sources.vff) ? { sorti: false, statut: "sansvf" } : { sorti: true, statut: null };
  const s = lues(sources);
  const { date: dispo, vers } = dispoChezSoi(facts.releases, facts.originalLanguage, facts.vod);
  const arrive = !!dispo && dispo <= today;
  // Sources lues, aucune en VF : en VO seulement, ou rien de publié du tout (空枪, film chinois sorti en numérique
  // l'avant-veille, sans aucune source : il passait « dispo » d'après sa date). Pas la VF dans les deux cas.
  const sansVf = !!s && !s.vf;
  const nouveau = (depuis) => (depuis >= ajoute(today, -NOUVEAU_JOURS) ? "nouveau" : null);
  // Des sources VF : disponible, même avant la date (sortie française plus tôt…), depuis la date si elle est passée.
  if (s && s.vf) return { sorti: true, statut: nouveau(arrive ? dispo : today) };
  // En abonnement sur une plateforme en France qui le double (lib/tmdb.js) : en VF, même si les sources n'ont que la VO
  // (documentaires Netflix : personne ne publie la VF).
  if (facts.abonnementVf) return { sorti: true, statut: nouveau(arrive ? dispo : today) };
  // La date passée, le fichier américain est sorti : disponible, sauf si ses sources n'ont pas la VF. Sans sources lues
  // (Torrentio en panne) : la date dit vrai.
  if (arrive && !sansVf) return { sorti: true, statut: nouveau(dispo) };
  // Sur une plateforme en France (en VF), sources pas lues : disponible aujourd'hui, même avant la date américaine.
  if (!s && facts.plateformeFrance) return { sorti: true, statut: nouveau(today) };
  // Pas encore chez soi en VF : « Au cinéma » s'il y est ou y sera en France (cinema : sa date, si elle est à venir),
  // avec en dessous son arrivée chez soi (la date qui range « Bientôt dispo ») si elle est à venir : passée, sans la VF,
  // on ne sait pas quand elle viendra. Sinon « Bientôt », avec la date à venir la plus utile (comme les rangées).
  const sallesFrance = releaseDates(facts.releases, [2, 3], ["FR"]);
  // Date passée, en VO seulement : la VFF à sa date française, si on la connaît (vffApresVo).
  const vffVo = !(dispo > today) && arrive && sansVf ? vffApresVo(facts.releases, today) : null;
  const aVenir = dispo > today ? { quoi: "dispo", date: dispo, vers } : vffVo ? { quoi: "dispo", date: vffVo.date, vers: vffVo.vers } : null;
  const enSalle = !!sallesFrance[0] && sallesFrance[0] <= today;
  const cinema = enSalle ? null : sallesFrance.find((d) => d > today);
  if (enSalle || cinema) return { sorti: false, statut: "salle", ...(cinema ? { cinema } : {}), ...(aVenir ? { quand: aVenir } : {}) };
  // La date passée, sources sans VF (The Fix), jamais sorti en France : « Bientôt » sans date (seule la VF compte, et
  // on ne sait pas quand elle viendra). Avant la date, sources en VO ou pas : la date (« DISPO LE 17 NOV. »), jamais « Bientôt » seul.
  if (!aVenir) return { sorti: false, statut: "bientot" };
  // Déjà sorti quelque part (Bad Apples : au cinéma en Allemagne) : son arrivée chez soi, annoncée ou estimée, comme la
  // rangée « Bientôt dispo ». Sorti nulle part : sa première sortie (« SORT LE ») ; « DISPO LE » seulement s'il sort
  // directement chez soi ce jour-là.
  const dejaSorti = releaseDates(facts.releases, [2, 3, 4, 5, 6]).some((d) => d <= today);
  const premiere = dejaSorti ? "" : releaseDates(facts.releases, [2, 3, 4]).find((d) => d > today);
  const quand = premiere && (vers || premiere < dispo) ? { quoi: "sortie", date: premiere, vers: false } : aVenir;
  return { sorti: false, statut: "bientot", quand };
}

/**
 * Série : les sources lues sont celles du 1er épisode de sa dernière saison, souvent pas encore doublée (One Piece,
 * saison 23 ; la saison en cours de New York Unité spéciale) alors que la série l'est : elles ne jugent que les
 * nouvelles séries (première diffusion il y a moins d'un an). Sans VF dans ces sources (ou sans aucune source : Small
 * Town Remedy, chinoise, diffusée depuis deux jours, n'est regardable nulle part), une nouvelle série n'est pas sortie : « Bientôt », en noir et blanc ; sauf sur une plateforme en France
 * qui la double (série en anglais ou en français, Netflix, Disney+). Une vieille série dont seule la dernière saison
 * (ou un seul « saison » de mille épisodes, Doraemon) manque de VF : rien ne change.
 */
function sortieSerie(facts, today, sources) {
  const base = sortieSerieDates(facts, today), s = lues(sources);
  const nouvelle = !!facts.firstAir && facts.firstAir >= ajoute(today, -365);
  if (!base.sorti || !s || s.vf || !nouvelle || facts.plateformeFrance) return base;
  return { sorti: false, statut: "bientot" };
}

/** Une nouvelle saison (la 2e ou plus) commence dans moins de 60 jours : « SAISON 3 BIENTÔT », série en couleur. */
const PROCHAINE_JOURS = 60;
function saisonProchaine(facts, today) {
  const { nextEpisode: d, nextSeason: s, nextEpisodeNumber: e } = facts;
  return d && d > today && d <= ajoute(today, PROCHAINE_JOURS) && s >= 2 && e === 1 ? s : null;
}

function sortieSerieDates(facts, today) {
  if (!facts.firstAir) return { sorti: false, statut: "bientot" };
  if (facts.firstAir > today) return { sorti: false, statut: "bientot", quand: { quoi: "sortie", date: facts.firstAir, vers: false } };
  const prochaine = saisonProchaine(facts, today);
  if (prochaine) return { sorti: true, statut: "prochaine", saison: prochaine };
  if (facts.firstAir >= ajoute(today, -NOUVEAU_JOURS)) return { sorti: true, statut: "nouveau" };
  const derniere = (facts.seasons || [])
    .filter((s) => s.season_number >= 2 && s.air_date && s.air_date <= today)
    .sort((a, b) => b.season_number - a.season_number)[0];
  return { sorti: true, statut: derniere && derniere.air_date >= ajoute(today, -NOUVEAU_JOURS) ? "saison" : null };
}

/**
 * { sorti: disponible chez soi en VF, statut: "bientot" | "salle" | "nouveau" | "saison" | "prochaine" | null,
 *   saison (« prochaine » : la saison qui commence bientôt),
 *   cinema (« salle » : la sortie au cinéma en France, si elle est à venir),
 *   quand (pas sorti, si on la connaît) : { quoi: "dispo" | "sortie", date, vers: date estimée } }.
 * sources (facultatif) : { vf, sources } lus chez Torrentio avec la qualité ; null ou vf inconnu : les dates.
 */
export function etatSortie(facts, today, sources = null) {
  return facts.type === "series" ? sortieSerie(facts, today, sources) : sortieFilm(facts, today, sources);
}

/** Le statut seul. */
export const statutDe = (facts, today) => etatSortie(facts, today).statut;

// ---------- La suite d'une série, une fois sortie ----------
// Un seul libellé en haut à gauche, jamais deux, par ordre de priorité :
// 1. la sortie (etatSortie : « BIENTÔT », la date ou le compte à rebours, « AU CINÉMA », « NOUVEAU », « NOUVELLE SAISON ») ;
// 2. « NOUVEL ÉPISODE » (réglage Épisodes) : un épisode sorti il y a moins de 7 jours ;
// 3. « TERMINÉE » ou « ANNULÉE » (réglage Fin) : statut TMDB Ended ou Canceled.
// L'avancement de la saison (réglage Avancement) n'est pas un libellé : un petit badge « S1 · ÉP. 4/8 » sous le libellé (ou seul),
// pour une série pas finie dont la saison en cours n'est pas complète.
const FINS = { Ended: "TERMINÉE", Canceled: "ANNULÉE" };
export const LIBELLES_FIN = Object.freeze(Object.values(FINS));
const NOUVEL_EPISODE_JOURS = 7;

/**
 * { episode: un épisode sorti il y a moins de 7 jours, fin: "TERMINÉE" | "ANNULÉE" | null,
 *   avance: { s: saison, n: épisodes diffusés, t: épisodes de la saison } | null }.
 * Avancement : la saison du dernier épisode diffusé, avec son nombre d'épisodes connu et pas encore atteint.
 */
export function suiteSerie(facts, today) {
  if (facts.type !== "series") return { episode: false, fin: null, avance: null };
  const last = facts.lastEpisode;
  const episode = !!last && last <= today && Math.round((Date.parse(today) - Date.parse(last)) / 86400000) < NOUVEL_EPISODE_JOURS;
  const fin = FINS[facts.status] || null;
  const saison = (facts.seasons || []).find((s) => s.season_number === facts.lastSeason);
  const n = facts.lastEpisodeNumber, t = saison ? saison.episode_count : null;
  const avance = !fin && facts.lastSeason >= 1 && Number.isInteger(n) && Number.isInteger(t) && n >= 1 && t > n ? { s: facts.lastSeason, n, t } : null;
  return { episode, fin, avance };
}

/** Le libellé de la suite (priorités 2 et 3 ci-dessus), selon les réglages du statut ; null sans rien à dire. */
export function libelleSuite(suite, { episode, fin }) {
  if (episode && suite.episode) return "NOUVEL ÉPISODE";
  return (fin && suite.fin) || null;
}
