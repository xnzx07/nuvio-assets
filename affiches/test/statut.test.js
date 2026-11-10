import { test } from "node:test";
import assert from "node:assert/strict";
import { statutDe, etatSortie, suiteSerie, libelleSuite } from "../lib/statut.js";

const AUJ = "2026-10-20";
const jours = (n) => new Date(Date.parse(AUJ) + n * 86400000).toISOString().slice(0, 10);
// Dates de sortie TMDB : type 2/3 = salle, 4 = numérique.
const sorties = (...dates) => [{ iso_3166_1: "FR", release_dates: dates.map(([type, d]) => ({ type, release_date: d + "T00:00:00.000Z" })) }];
const pays = (code, ...dates) => ({ iso_3166_1: code, release_dates: dates.map(([type, d]) => ({ type, release_date: d + "T00:00:00.000Z" })) });
const film = (releases, date = "", langue = "en") => ({ type: "movie", releases, releaseDate: date, originalLanguage: langue });

// « Sorti » = disponible chez soi en VF, comme pour les rangées de l'addon : le calendrier américain des sorties
// numériques (dispoChezSoi), puis les sources disent si le fichier a la VF. Sans sources lues, la date dit vrai.
test("VF : sorti en numérique aux États-Unis, sources pas lues → sorti, nouveau", () => {
  const e = etatSortie(film([pays("US", [4, jours(-20)])]), AUJ);
  assert.deepEqual(e, { sorti: true, statut: "nouveau" });
});

test("VF : film français sorti en numérique → sorti, nouveau", () => {
  assert.deepEqual(etatSortie(film([pays("US", [4, jours(-5)])], "", "fr"), AUJ), { sorti: true, statut: "nouveau" });
});

// La chronologie des médias française ne compte pas : « Nouveau » compté depuis la sortie américaine.
test("VF : numérique aux États-Unis il y a 40 jours, en France il y a 10 jours → sorti depuis la date américaine", () => {
  assert.deepEqual(etatSortie(film([pays("US", [4, jours(-40)]), pays("FR", [4, jours(-10)])]), AUJ), { sorti: true, statut: null });
});

test("dispo_chez_soi : le calendrier américain", async () => {
  const { dispoChezSoi } = await import("../lib/statut.js");
  // Sortie numérique américaine, même plus tard qu'ailleurs, et même en salle en France depuis longtemps.
  assert.deepEqual(dispoChezSoi([pays("FR", [3, jours(-99)]), pays("GB", [4, jours(5)]), pays("US", [3, jours(-97)], [4, jours(26)])], "en"), { date: jours(26), vers: false });
  // Pas de date numérique américaine : leur salle + 45 jours, en estimation (pas la sortie numérique anglaise).
  assert.deepEqual(dispoChezSoi([pays("FR", [3, jours(-20)]), pays("US", [3, jours(-10)]), pays("GB", [4, jours(-5)])], "en"), { date: jours(35), vers: true });
  // Film français : ses dates, pas les américaines.
  assert.deepEqual(dispoChezSoi([pays("FR", [3, jours(-20)], [4, jours(10)]), pays("US", [3, jours(30)])], "fr"), { date: jours(10), vers: false });
  assert.deepEqual(dispoChezSoi([pays("FR", [3, jours(-20)]), pays("US", [4, jours(60)])], "fr"), { date: jours(60), vers: false });
  // Sans date numérique : la VOD 4 mois après la salle en France (chronologie des médias).
  const plusMois = (n, m) => { const d = new Date(`${n}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + m); return d.toISOString().slice(0, 10); };
  assert.deepEqual(dispoChezSoi([pays("FR", [3, jours(-20)])], "fr"), { date: plusMois(jours(-20), 4), vers: true });
  // Film étranger jamais sorti aux États-Unis (une avant-première n'est pas une sortie) : sa première sortie numérique
  // où que ce soit, sinon sa première salle + 45 jours.
  assert.deepEqual(dispoChezSoi([pays("KR", [3, jours(-30)], [4, jours(12)]), pays("US", [1, jours(-60)])], "ko"), { date: jours(12), vers: false });
  assert.deepEqual(dispoChezSoi([pays("KR", [3, jours(-30)]), pays("FR", [3, jours(30)])], "ko"), { date: jours(15), vers: true });
  assert.deepEqual(dispoChezSoi([], "en"), { date: "", vers: false });
  // Date annoncée par le studio (dvdsreleasedates.com, table de la nuit) : « Dispo le … », pas une estimation.
  assert.deepEqual(dispoChezSoi([pays("US", [3, jours(-10)])], "en", { film: { jours: 45, annonce: jours(24) }, mediane: 32 }), { date: jours(24), vers: false });
});

// L'Odyssée : en salle en France, sources en VO seulement, sortie numérique américaine dans 26 jours → « AU CINÉMA »
// et la date (« DISPO LE … »), jamais « Bientôt » sans date. Pas en salle en France : « Bientôt » avec la date.
test("sources en VO avant la date américaine → la date", () => {
  const odyssee = [pays("FR", [3, jours(-99)]), pays("US", [3, jours(-97)], [4, jours(26)])];
  assert.deepEqual(etatSortie(film(odyssee), AUJ, { vf: false, sources: 30 }), { sorti: false, statut: "salle", quand: { quoi: "dispo", date: jours(26), vers: false } });
  const ailleurs = [pays("DE", [3, jours(-99)]), pays("US", [3, jours(-97)], [4, jours(26)])];
  assert.deepEqual(etatSortie(film(ailleurs), AUJ, { vf: false, sources: 30 }), { sorti: false, statut: "bientot", quand: { quoi: "dispo", date: jours(26), vers: false } });
  // Sans date américaine annoncée : l'estimation (salle américaine + 45 jours).
  const estime = [pays("DE", [3, jours(-20)]), pays("US", [3, jours(-15)])];
  assert.deepEqual(etatSortie(film(estime), AUJ, { vf: false, sources: 12 }).quand, { quoi: "dispo", date: jours(30), vers: true });
});

// The Fix : sorti en numérique aux États-Unis, sources sans VF → pas sorti, « Bientôt » sans date. Avec des sources
// VF : sorti. Sans aucune source (rien de publié, donc pas de VF) : pas sorti non plus. Sans sources lues : la date dit vrai.
test("sources après la date américaine → elles décident", () => {
  const fix = film([pays("US", [3, jours(-60)], [4, jours(-10)])]);
  assert.deepEqual(etatSortie(fix, AUJ, { vf: false, sources: 25 }), { sorti: false, statut: "bientot" });
  assert.deepEqual(etatSortie(fix, AUJ, { vf: true, sources: 25 }), { sorti: true, statut: "nouveau" });
  assert.deepEqual(etatSortie(fix, AUJ, { vf: false, sources: 0 }), { sorti: false, statut: "bientot" });
  assert.deepEqual(etatSortie(fix, AUJ, null), { sorti: true, statut: "nouveau" });
  // Des sources VF avant la date américaine (sortie française plus tôt) : sorti aussi.
  assert.deepEqual(etatSortie(film([pays("FR", [4, jours(-3)]), pays("US", [4, jours(20)])]), AUJ, { vf: true, sources: 4 }), { sorti: true, statut: "nouveau" });
});

// Film français : ses propres dates, comme avant (pas la sortie américaine).
test("film français : ses dates", () => {
  const f = film([pays("FR", [3, jours(-20)], [4, jours(10)]), pays("US", [3, jours(-5)])], "", "fr");
  assert.deepEqual(etatSortie(f, AUJ), { sorti: false, statut: "salle", quand: { quoi: "dispo", date: jours(10), vers: false } });
  // 50 jours après la salle, pas encore en VOD (4 mois) ; 130 jours après, si.
  assert.equal(etatSortie(film([pays("FR", [3, jours(-50)])], "", "fr"), AUJ).sorti, false);
  assert.deepEqual(etatSortie(film([pays("FR", [3, jours(-130)])], "", "fr"), AUJ), { sorti: true, statut: "nouveau" });
});

// Pas encore sorti nulle part : « SORT LE » (sa première sortie), sauf s'il sort directement chez soi ce jour-là.
test("pas encore sorti : sort le, ou dispo le en sortie directe", () => {
  assert.deepEqual(etatSortie(film([pays("US", [3, jours(10)], [4, jours(55)])]), AUJ).quand, { quoi: "sortie", date: jours(10), vers: false });
  assert.deepEqual(etatSortie(film([pays("US", [4, jours(10)])]), AUJ).quand, { quoi: "dispo", date: jours(10), vers: false });
});

test("VF : au cinéma en France, pas encore chez soi → pas sorti, en salle", () => {
  assert.deepEqual(etatSortie(film(sorties([3, jours(-10)])), AUJ), { sorti: false, statut: "salle", quand: { quoi: "dispo", date: jours(35), vers: true } });
});

test("VF : sorti au Québec → VF probable", () => {
  assert.equal(etatSortie(film([pays("US", [4, jours(-60)]), pays("CA", [3, jours(-100)])]), AUJ).sorti, true);
});

// « Bad Apples » : avant-première en festival il y a plus d'un an (type 1), vraie sortie le mois dernier, pas en
// France : pas un vieux film, donc pas sorti. Une avant-première seule, très ancienne (jamais sorti) : vieux film.
test("film : avant-première ancienne, sortie récente hors de France → pas sorti", () => {
  const f = film([pays("CA", [1, jours(-410)]), pays("DE", [3, jours(-40)]), pays("US", [1, jours(-360)], [2, jours(-33)])], jours(-40));
  assert.equal(etatSortie(f, AUJ).sorti, false);
  assert.equal(etatSortie(film([pays("CA", [1, jours(-900)])], jours(-900)), AUJ).sorti, true);
});

// « On va s'arrêter là » (Netflix) : sorti partout en streaming, sur Netflix France. Sur une plateforme en France
// (en VF), sources pas lues : disponible, même avant la date américaine.
test("VF : sur une plateforme en France → sorti", () => {
  const f = { ...film([pays("AR", [1, jours(-12)], [4, jours(-4)]), pays("US", [4, jours(-4)])], jours(-12), "es"), plateformeFrance: true };
  assert.deepEqual(etatSortie(f, AUJ), { sorti: true, statut: "nouveau" });
  // Sans plateforme : la date américaine passée suffit (sources pas lues).
  assert.equal(etatSortie({ ...f, plateformeFrance: false }, AUJ).sorti, true);
  // Sans aucune date de sortie chez soi connue : disponible quand même (elle y est).
  assert.equal(etatSortie({ ...film([pays("AR", [1, jours(-12)])], jours(-12), "es"), plateformeFrance: true }, AUJ).sorti, true);
  // Avant la date américaine : disponible aujourd'hui ; sources lues sans VF : elles décident (la date).
  const avant = { ...film([pays("AR", [3, jours(-12)]), pays("US", [4, jours(20)])], jours(-12), "es"), plateformeFrance: true };
  assert.deepEqual(etatSortie(avant, AUJ), { sorti: true, statut: "nouveau" });
  assert.deepEqual(etatSortie(avant, AUJ, { vf: false, sources: 6 }), { sorti: false, statut: "bientot", quand: { quoi: "dispo", date: jours(20), vers: false } });
  // « Nouveau » compté depuis la date américaine, pas la française.
  const tard = { ...film([pays("US", [4, jours(-40)]), pays("FR", [4, jours(-10)])]), plateformeFrance: true };
  assert.deepEqual(etatSortie(tard, AUJ), { sorti: true, statut: null });
});

// Turning Point (documentaire Netflix) : 12 sources, toutes en VO (personne ne publie la VF), mais Netflix le double.
test("VF : en abonnement sur une plateforme qui double → sorti, même avec des sources en VO", () => {
  const f = { ...film([pays("US", [4, jours(-48)])], jours(-48)), plateformeFrance: true, abonnementVf: true };
  assert.deepEqual(etatSortie(f, AUJ, { vf: false, sources: 12 }), { sorti: true, statut: null });
  assert.deepEqual(etatSortie({ ...f, releases: [pays("US", [4, jours(-3)])] }, AUJ, { vf: false, sources: 3 }), { sorti: true, statut: "nouveau" });
  // Sans la règle (stand-up, MUBI…) : les sources décident, comme avant.
  assert.equal(etatSortie({ ...f, abonnementVf: false }, AUJ, { vf: false, sources: 12 }).sorti, false);
});

// Sortie au cinéma en France annoncée : « AU CINÉMA LE … » (avec son arrivée chez soi en dessous).
test("film : rien de sorti, salle en France annoncée → au cinéma", () => {
  assert.equal(statutDe(film(sorties([3, jours(30)]), jours(30)), AUJ), "salle");
  assert.equal(statutDe(film([pays("US", [3, jours(30)])], jours(30)), AUJ), "bientot");
});

// Le statut se lit côté France : sorti au Japon, en salle en France dans un mois → au cinéma (le …).
test("film : sorti ailleurs, salle en France à venir → au cinéma", () => {
  const releases = [
    { iso_3166_1: "JP", release_dates: [{ type: 3, release_date: jours(-20) + "T00:00:00.000Z" }] },
    { iso_3166_1: "FR", release_dates: [{ type: 3, release_date: jours(30) + "T00:00:00.000Z" }] },
  ];
  assert.equal(statutDe(film(releases), AUJ), "salle");
  assert.equal(etatSortie(film(releases), AUJ).cinema, jours(30));
});

test("film : aucune date du tout → bientôt", () => {
  assert.equal(statutDe(film([], ""), AUJ), "bientot");
});

test("film : au cinéma depuis 10 jours, pas encore chez soi → en salle", () => {
  assert.equal(statutDe(film(sorties([3, jours(-10)])), AUJ), "salle");
});

test("film : salle il y a 50 jours → numérique estimé à J−5 → nouveau", () => {
  assert.equal(statutDe(film(sorties([3, jours(-50)])), AUJ), "nouveau");
});

test("film : numérique annoncé dans le futur → encore en salle", () => {
  assert.equal(statutDe(film(sorties([3, jours(-60)], [4, jours(10)])), AUJ), "salle");
});

test("film : numérique il y a 40 jours → rien", () => {
  assert.equal(statutDe(film(sorties([3, jours(-90)], [4, jours(-40)])), AUJ), null);
});

test("film : numérique il y a 12 jours → nouveau", () => {
  assert.equal(statutDe(film(sorties([4, jours(-12)])), AUJ), "nouveau");
});

test("film : pas de dates TMDB mais sorti d'après sa fiche → rien", () => {
  assert.equal(statutDe(film([], "2010-05-01"), AUJ), null);
});

// Dates TMDB incomplètes : un téléfilm (type 6), un film sorti en DVD (type 5) ou vu seulement en festival
// (type 1) depuis longtemps ne sont pas « Bientôt ».
test("film : seulement à la télé, en vidéo ou en festival, depuis longtemps → rien", () => {
  assert.equal(statutDe(film(sorties([6, "2005-03-01"])), AUJ), null);
  assert.equal(statutDe(film(sorties([5, "2010-06-01"])), AUJ), null);
  assert.equal(statutDe(film(sorties([1, "2015-09-01"])), AUJ), null);
});

test("film : téléfilm diffusé il y a 10 jours → nouveau", () => {
  assert.equal(statutDe(film(sorties([6, jours(-10)])), AUJ), "nouveau");
});

// Un vieux film ressorti en numérique (ou annoncé) n'est ni « Nouveau » ni « En salle ».
test("film : vieux film ressorti → rien", () => {
  assert.equal(statutDe(film(sorties([3, "1995-05-01"], [4, jours(-5)])), AUJ), null);
  assert.equal(statutDe(film(sorties([3, "1995-05-01"], [4, jours(20)])), AUJ), null);
  const vieuxAilleurs = [{ iso_3166_1: "US", release_dates: [{ type: 3, release_date: "1995-05-01T00:00:00.000Z" }] }, { iso_3166_1: "DE", release_dates: [{ type: 4, release_date: jours(20) + "T00:00:00.000Z" }] }];
  assert.equal(statutDe(film(vieuxAilleurs), AUJ), null);
});

const serie = (firstAir, seasons = []) => ({ type: "series", firstAir, seasons });

test("série : première diffusion dans le futur → bientôt", () => {
  assert.equal(statutDe(serie(jours(15)), AUJ), "bientot");
  assert.equal(statutDe(serie(""), AUJ), "bientot");
});

test("série : lancée il y a 10 jours → nouveau", () => {
  assert.equal(statutDe(serie(jours(-10), [{ season_number: 1, air_date: jours(-10) }]), AUJ), "nouveau");
});

test("série : saison 3 il y a 5 jours → nouvelle saison", () => {
  const s = [{ season_number: 0, air_date: jours(-2) }, { season_number: 1, air_date: "2020-01-01" }, { season_number: 3, air_date: jours(-5) }];
  assert.equal(statutDe(serie("2020-01-01", s), AUJ), "saison");
});

test("série : dernière saison il y a un an → rien", () => {
  assert.equal(statutDe(serie("2020-01-01", [{ season_number: 2, air_date: jours(-365) }]), AUJ), null);
});

// Dates à la place de « Bientôt » et « En salle », comme dans les rangées de l'addon.
test("date : au cinéma en France, numérique annoncé → dispo le", () => {
  const e = etatSortie(film(sorties([3, jours(-10)], [4, jours(20)])), AUJ);
  assert.deepEqual(e, { sorti: false, statut: "salle", quand: { quoi: "dispo", date: jours(20), vers: false } });
});

test("date : au cinéma en France, pas de date numérique → dispo vers salle + 45 jours", () => {
  const e = etatSortie(film(sorties([3, jours(-10)])), AUJ);
  assert.deepEqual(e.quand, { quoi: "dispo", date: jours(35), vers: true });
});

// Au cinéma le …, et en dessous l'arrivée chez soi : annoncée, sinon estimée (salle + 45 jours).
test("date : sortie en salle en France annoncée → au cinéma le, dispo le", () => {
  const e = etatSortie(film(sorties([3, jours(30)]), jours(30)), AUJ);
  assert.equal(e.statut, "salle");
  assert.equal(e.cinema, jours(30));
  assert.equal(e.quand.quoi, "dispo");
  assert.equal(e.quand.vers, true);
  const annonce = etatSortie(film([pays("FR", [3, jours(30)]), pays("US", [3, jours(5)], [4, jours(20)])], jours(5)), AUJ);
  assert.deepEqual(annonce, { sorti: false, statut: "salle", cinema: jours(30), quand: { quoi: "dispo", date: jours(20), vers: false } });
});

test("date : pas de salle en France, numérique annoncé avec VF → dispo le", () => {
  const e = etatSortie(film([pays("US", [4, jours(12)]), pays("FR", [4, jours(12)])]), AUJ);
  assert.deepEqual(e, { sorti: false, statut: "bientot", quand: { quoi: "dispo", date: jours(12), vers: false } });
});

test("date : sortie ailleurs seulement → sortie le, sinon rien", () => {
  assert.deepEqual(etatSortie(film([pays("US", [3, jours(40)])]), AUJ).quand, { quoi: "sortie", date: jours(40), vers: false });
  assert.equal(etatSortie(film([pays("US", [4, jours(-20)])]), AUJ).quand, undefined);
  assert.equal(etatSortie(film([], ""), AUJ).quand, undefined);
});

// Bad Apples : déjà au cinéma en Allemagne, prochaine sortie en Australie dans un mois. Pas « SORT LE » (la date
// d'un autre pays), mais l'arrivée chez soi estimée (salle + 45 jours), comme la rangée « Bientôt dispo ».
test("date : déjà sorti en salle ailleurs → dispo vers, pas la sortie d'un autre pays", () => {
  assert.deepEqual(etatSortie(film([pays("DE", [3, jours(-41)]), pays("AU", [3, jours(29)])]), AUJ).quand, { quoi: "dispo", date: jours(4), vers: true });
  // Arrivée chez soi annoncée : sa date.
  assert.deepEqual(etatSortie(film([pays("DE", [3, jours(-41)], [4, jours(9)]), pays("AU", [3, jours(29)])]), AUJ).quand, { quoi: "dispo", date: jours(9), vers: false });
});

test("date : série pas encore lancée → sortie le", () => {
  assert.deepEqual(etatSortie(serie(jours(15)), AUJ).quand, { quoi: "sortie", date: jours(15), vers: false });
  assert.equal(etatSortie(serie(""), AUJ).quand, undefined);
});

// Les sources décident (titre de moins d'un an) : ce qu'on obtient en faisant « Lire ». Les dates ne servent plus
// que si Torrentio n'a pas répondu (sources null).
test("sources : la VF trouvée décide pour un film récent", () => {
  // Oasis : au cinéma en France, sortie chez soi aux États-Unis ; les dates disent « dispo », les sources non.
  const oasis = film([pays("FR", [3, jours(-42)]), pays("US", [3, jours(-40)], [4, jours(-12)])]);
  assert.equal(etatSortie(oasis, AUJ).sorti, true);
  // En salle en France il y a 42 jours : sa VFF vers la salle + 4 mois (vffApresVo).
  assert.deepEqual(etatSortie(oasis, AUJ, { vf: false, sources: 20 }), { sorti: false, statut: "salle", quand: { quoi: "dispo", date: "2027-01-08", vers: true } });
  // Bad Apples : pas encore chez soi d'après les dates, mais des sources VF.
  assert.deepEqual(etatSortie(film([pays("DE", [3, jours(-41)])]), AUJ, { vf: true, sources: 36 }), { sorti: true, statut: "nouveau" });
  // Sorti en VO seulement, pas au cinéma en France : pas sorti (seule la VF compte), « Bientôt » sans date.
  const vo = film([pays("US", [3, jours(-60)], [4, jours(-20)]), pays("CA", [3, jours(-59)])]);
  assert.deepEqual(etatSortie(vo, AUJ, { vf: false, sources: 30 }), { sorti: false, statut: "bientot" });
  // Aucune source du tout (空枪, sorti en numérique l'avant-veille) : pas de VF non plus, pas sorti.
  assert.deepEqual(etatSortie(vo, AUJ, { vf: false, sources: 0 }), { sorti: false, statut: "bientot" });
  // Sources inconnues (Torrentio en panne, ancienne réponse) : les dates.
  assert.deepEqual(etatSortie(vo, AUJ, null), etatSortie(vo, AUJ));
  assert.deepEqual(etatSortie(vo, AUJ, { vf: null, sources: null }), etatSortie(vo, AUJ));
  // Vieux film : les sources ne changent rien.
  assert.deepEqual(etatSortie(film([pays("US", [3, jours(-800)])]), AUJ, { vf: false, sources: 5 }), { sorti: true, statut: null });
});

test("sources : série récente sans VF → pas sortie", () => {
  const s = { ...serie(jours(-10), [{ season_number: 1, air_date: jours(-10) }]), lastEpisode: jours(-3), lastSeason: 1 };
  assert.deepEqual(etatSortie(s, AUJ, { vf: false, sources: 14 }), { sorti: false, statut: "bientot" });
  // Sur une plateforme en France qui la double : rien ne change.
  assert.deepEqual(etatSortie({ ...s, plateformeFrance: true }, AUJ, { vf: false, sources: 14 }), { sorti: true, statut: "nouveau" });
  // One Piece : la saison en cours (23) pas encore en VF, mais la série l'est : rien ne change, les sources ne jugent
  // que les nouvelles séries. Doraemon (2005, une seule « saison » de mille épisodes) non plus.
  const onePiece = { ...serie("1999-10-20", [{ season_number: 22, air_date: "2025-01-05" }, { season_number: 23, air_date: jours(-12) }]), lastEpisode: jours(-2), lastSeason: 23 };
  assert.equal(etatSortie(onePiece, AUJ).statut, "saison");
  assert.deepEqual(etatSortie(onePiece, AUJ, { vf: false, sources: 35 }), etatSortie(onePiece, AUJ));
  const doraemon = { ...serie("2005-04-15", [{ season_number: 1, air_date: "2005-04-15" }]), lastEpisode: jours(-4), lastSeason: 1 };
  assert.deepEqual(etatSortie(doraemon, AUJ, { vf: false, sources: 3 }), { sorti: true, statut: null });
  assert.deepEqual(etatSortie(s, AUJ, { vf: true, sources: 14 }), { sorti: true, statut: "nouveau" });
  // Aucune source du tout (Small Town Remedy, diffusée depuis deux jours) : regardable nulle part, pas sortie non plus ;
  // sur une plateforme en France qui la double, si. Sources pas lues (Torrentio en panne) : rien ne change.
  assert.deepEqual(etatSortie(s, AUJ, { vf: false, sources: 0 }), { sorti: false, statut: "bientot" });
  assert.deepEqual(etatSortie({ ...s, plateformeFrance: true }, AUJ, { vf: false, sources: 0 }), { sorti: true, statut: "nouveau" });
  assert.deepEqual(etatSortie(s, AUJ, null), { sorti: true, statut: "nouveau" });
  // Vieille série (dernier épisode il y a plus d'un an) : rien ne change.
  const vieille = { ...serie("2018-01-01"), lastEpisode: "2019-05-01" };
  assert.deepEqual(etatSortie(vieille, AUJ, { vf: false, sources: 14 }), etatSortie(vieille, AUJ));
});

// 3670 : projeté en festival et sorti en Corée il y a plus d'un an, sortie au cinéma en France dans un mois : pas un
// vieux film, ses sources sont lues (« SORT LE … » tant qu'elles n'ont pas la VF ; sans sources lues, sa date d'arrivée
// chez soi, la salle coréenne + 45 jours, est passée). Une vraie reprise d'un vieux film (Quand la mer monte, 2004)
// reste un vieux film.
test("vieux film : pas avec une sortie en France à venir, sauf vraie reprise", async () => {
  const { sourcesUtiles } = await import("../lib/statut.js");
  const f3670 = film([pays("KR", [1, jours(-540)], [3, jours(-413)]), pays("FR", [1, jours(-357)], [3, jours(28)])], "", "ko");
  assert.equal(sourcesUtiles(f3670, AUJ), true);
  assert.deepEqual(etatSortie(f3670, AUJ, { vf: false, sources: 9 }), { sorti: false, statut: "salle", cinema: jours(28), quand: { quoi: "dispo", date: "2027-03-17", vers: true } });
  assert.equal(etatSortie(film([pays("FR", [3, "2004-10-27"], [3, jours(28)])], "", "fr"), AUJ).sorti, true);
});

test("sources_utiles : seulement pour un titre récent", async () => {
  const { sourcesUtiles } = await import("../lib/statut.js");
  assert.equal(sourcesUtiles(film([pays("US", [4, jours(-20)])]), AUJ), true);
  assert.equal(sourcesUtiles(film([pays("US", [3, jours(-800)])]), AUJ), false);
  assert.equal(sourcesUtiles(film([pays("FR", [3, jours(30)])], jours(30)), AUJ), false);
  assert.equal(sourcesUtiles(film([], "2024-01-01"), AUJ), false);
  assert.equal(sourcesUtiles({ ...serie(jours(-10)), lastEpisode: jours(-3) }, AUJ), true);
  assert.equal(sourcesUtiles({ ...serie("2018-01-01"), lastEpisode: "2019-05-01" }, AUJ), false);
});

// La suite d'une série : nouvel épisode, fin (Ended, Canceled), avancement de la saison en cours.
test("suite_serie", () => {
  const s = { ...serie("2020-01-01", [{ season_number: 1, episode_count: 10 }, { season_number: 2, episode_count: 8 }]), lastSeason: 2, lastEpisodeNumber: 5, lastEpisode: jours(-2), status: "Returning Series" };
  assert.deepEqual(suiteSerie(s, AUJ), { episode: true, fin: null, avance: { s: 2, n: 5, t: 8 } });
  // Saison complète, nombre d'épisodes inconnu, pas d'épisode diffusé : pas de barre.
  assert.equal(suiteSerie({ ...s, lastEpisodeNumber: 8 }, AUJ).avance, null);
  assert.equal(suiteSerie({ ...s, seasons: [{ season_number: 2, episode_count: null }] }, AUJ).avance, null);
  assert.equal(suiteSerie({ ...s, lastEpisodeNumber: null }, AUJ).avance, null);
  assert.equal(suiteSerie({ ...s, lastSeason: 3 }, AUJ).avance, null);
  // Finie : « TERMINÉE », « ANNULÉE », et jamais de barre (saison coupée en route).
  assert.deepEqual(suiteSerie({ ...s, status: "Ended", lastEpisode: jours(-30) }, AUJ), { episode: false, fin: "TERMINÉE", avance: null });
  assert.equal(suiteSerie({ ...s, status: "Canceled" }, AUJ).fin, "ANNULÉE");
  assert.deepEqual(suiteSerie({ type: "movie", status: "Released" }, AUJ), { episode: false, fin: null, avance: null });
});

// Priorités du libellé : un nouvel épisode passe avant la fin ; chaque réglage seulement s'il est allumé.
test("libelle_suite_priorites", () => {
  const finie = { episode: true, fin: "TERMINÉE", avance: null };
  assert.equal(libelleSuite(finie, { episode: true, fin: true }), "NOUVEL ÉPISODE");
  assert.equal(libelleSuite(finie, { episode: false, fin: true }), "TERMINÉE");
  assert.equal(libelleSuite({ ...finie, episode: false }, { episode: true, fin: true }), "TERMINÉE");
  assert.equal(libelleSuite(finie, { episode: false, fin: false }), null);
});

// Une nouvelle saison (la 2e ou plus) commence dans moins de 60 jours : « SAISON 3 BIENTÔT », la série reste sortie (en
// couleur). Pas pour un épisode de la saison en cours, ni pour une saison lointaine, ni pour une série pas encore sortie.
test("série : nouvelle saison bientôt", () => {
  const s = { ...serie("2019-01-01", [{ season_number: 2, air_date: "2024-01-01" }]), lastEpisode: "2024-03-01", lastSeason: 2 };
  assert.deepEqual(etatSortie({ ...s, nextEpisode: jours(12), nextSeason: 3, nextEpisodeNumber: 1 }, AUJ), { sorti: true, statut: "prochaine", saison: 3 });
  assert.equal(etatSortie({ ...s, nextEpisode: jours(5), nextSeason: 2, nextEpisodeNumber: 6 }, AUJ).statut, null);
  assert.equal(etatSortie({ ...s, nextEpisode: jours(90), nextSeason: 3, nextEpisodeNumber: 1 }, AUJ).statut, null);
  assert.equal(etatSortie({ ...serie(jours(20)), nextEpisode: jours(20), nextSeason: 1, nextEpisodeNumber: 1 }, AUJ).statut, "bientot");
});

// Sans date numérique américaine : la salle + la fenêtre du distributeur américain (facts.vod, lib/estimations.js),
// « DISPO VERS LE » comme avant ; une date annoncée l'emporte toujours.
test("dispo_estimee_d_apres_le_distributeur", async () => {
  const { estimationDe, tableVod } = await import("../lib/statut.js");
  const table = tableVod({ mediane: 32, fenetres: {}, films: { tt1: { date: jours(50), distributeur: "Q1323594", jours: 60 } } });
  const enSalle = [pays("US", [3, jours(-10)])];
  const avec = (releases, imdb) => ({ ...film(releases), vod: estimationDe(table, imdb) });
  assert.deepEqual(etatSortie(avec(enSalle, "tt1"), AUJ), { sorti: false, statut: "bientot", quand: { quoi: "dispo", date: jours(50), vers: true } });
  assert.deepEqual(etatSortie(avec(enSalle, "tt2"), AUJ).quand, { quoi: "dispo", date: jours(22), vers: true });
  assert.deepEqual(etatSortie(film(enSalle), AUJ).quand, { quoi: "dispo", date: jours(35), vers: true });
  assert.deepEqual(etatSortie(avec([pays("US", [3, jours(-10)], [4, jours(5)])], "tt1"), AUJ).quand, { quoi: "dispo", date: jours(5), vers: false });
});

// Bad Genius (2017) : un vieux film que les trois sources voient sans VF (data/sans-vf.json) : elle n'arrivera sans doute
// jamais, donc pas « Bientôt » ; et pas sorti non plus.
test("vieux film sans VF confirmée → pas sorti, statut sansvf", () => {
  const vieux = film([pays("TH", [3, jours(-3000)])], jours(-3000), "th");
  assert.deepEqual(etatSortie({ ...vieux, sansVf: true }, AUJ), { sorti: false, statut: "sansvf" });
  assert.deepEqual(etatSortie(vieux, AUJ), { sorti: true, statut: null });
  // La liste a du retard : un fichier VFF explicite passe avant elle.
  assert.deepEqual(etatSortie({ ...vieux, sansVf: true }, AUJ, { vf: true, sources: 3, vff: true }), { sorti: true, statut: null });
  assert.deepEqual(etatSortie({ ...vieux, sansVf: true }, AUJ, { vf: true, sources: 3 }), { sorti: false, statut: "sansvf" });
});

// Malfaisante : en salle en France il y a 27 jours, en VO aux États-Unis aujourd'hui, sources sans VF → sa VFF à la
// chronologie française (salle + 4 mois), comme la fiche (vffApresVo) ; Crawlers, jamais sorti en France : rien.
test("VO seulement : la VFF à la salle en France + 4 mois, jamais une date inventée", () => {
  const malfaisante = film([pays("US", [3, jours(-32)], [4, AUJ]), pays("FR", [3, jours(-27)])]);
  assert.deepEqual(etatSortie(malfaisante, AUJ, { vf: false, sources: 30 }).quand, { quoi: "dispo", date: "2027-01-23", vers: true });
  const crawlers = film([pays("US", [3, jours(-25)], [4, AUJ])]);
  assert.deepEqual(etatSortie(crawlers, AUJ, { vf: false, sources: 20 }), { sorti: false, statut: "bientot" });
});
