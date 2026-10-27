import { test } from "node:test";
import assert from "node:assert/strict";
import { posterContent, contentKey, SHORT_GENRES } from "../lib/contenu.js";
import { DEFAUT_REGLAGES, MEMOIRES, lireReglages, PALETTE } from "../lib/lien-affiches.js";

const AUJ = "2026-10-20";
// Film sorti en salle en 2024, en numérique depuis longtemps : aucun statut.
const facts = {
  tmdbId: 693134, type: "movie", imdbId: "tt15239678", genreIds: [878, 12], year: "2024",
  vote: { average: 8.1, count: 6000 }, poster: "/fr.jpg", textlessPoster: "/nu.jpg",
  backdrop: "/bd.jpg", textlessBackdrop: "/bdnu.jpg", logo: "/fr.png", lastSeason: null,
  releases: [{ iso_3166_1: "FR", release_dates: [{ type: 3, release_date: "2024-02-28" }, { type: 4, release_date: "2024-04-16" }] }],
  releaseDate: "2024-02-27", firstAir: "", seasons: [],
};
const bientot = { ...facts, releases: [{ iso_3166_1: "FR", release_dates: [{ type: 3, release_date: "2026-12-16" }] }], releaseDate: "2026-12-16" };
const enSalle = { ...facts, releases: [{ iso_3166_1: "FR", release_dates: [{ type: 3, release_date: "2026-10-10" }] }], releaseDate: "2026-10-10" };
const extra = { imdbRating: "8.4", rank: null, quality: null };
const plein = { imdbRating: "8.4", rank: 4, quality: { uhd: true, extra: "DV" } };
const contenu = (f, e = extra, shape = "poster", r = DEFAUT_REGLAGES) => posterContent(f, e, shape, r, AUJ);
const reglages = (s) => lireReglages(new URLSearchParams("s=1." + s));

test("defaut_comme_avant", () => {
  const c = contenu(facts, plein);
  assert.equal(c.full, true);
  assert.equal(c.image, "/nu.jpg");
  assert.equal(c.logo, "/fr.png");
  assert.deepEqual(c.line, { genre: "SF", note: "8,4", annee: "2024" });
  assert.equal(c.rank, 4);
  assert.deepEqual(c.quality, { extra: "DV" });
  assert.equal(c.statut, null);
  assert.equal(c.gris, false);
  assert.deepEqual(c.styles, { statut: "texte", tendance: "fleche", qualite: "texte", titre: 1, note: "etoile", texte: 1, sep: "point", haut: 1, fondu: { couleur: "noir", force: "m" } });
});

test("sans image sans texte ou sans logo : affiche normale, bas intact", () => {
  for (const f of [{ ...facts, textlessPoster: null, textlessBackdrop: null }, { ...facts, logo: null }]) {
    const c = contenu(f, plein);
    assert.equal(c.full, false);
    assert.equal(c.image, "/fr.jpg");
    assert.equal(c.line, null);
    assert.equal(c.logo, null);
    assert.equal(c.styles.fondu, null);
    assert.equal(c.rank, 4);
  }
});

test("paysage : images de fond", () => {
  assert.equal(contenu(facts, extra, "landscape").image, "/bdnu.jpg");
  const sans = contenu({ ...facts, textlessBackdrop: null }, extra, "landscape");
  assert.equal(sans.image, "/bd.jpg");
  assert.equal(sans.full, false);
});

test("sans image du tout : null", () => {
  assert.equal(contenu({ ...facts, poster: null, textlessPoster: null, textlessBackdrop: null }), null);
  assert.equal(contenu({ ...facts, backdrop: null, textlessBackdrop: null }, extra, "landscape"), null);
});

test("note TMDB de repli à partir de 50 votes", () => {
  const sansImdb = { ...extra, imdbRating: undefined };
  assert.deepEqual(contenu({ ...facts, vote: { average: 7.25, count: 120 } }, sansImdb).line, { genre: "SF", note: "7,3", annee: "2024" });
  assert.deepEqual(contenu({ ...facts, genreIds: [18], year: "2023", vote: { average: 7.25, count: 49 } }, sansImdb).line, { genre: "Drame", annee: "2023" });
});

test("sans genre, sans année", () => {
  assert.deepEqual(contenu({ ...facts, genreIds: [] }).line, { note: "8,4", annee: "2024" });
  assert.deepEqual(contenu({ ...facts, year: null }).line, { genre: "SF", note: "8,4" });
});

test("genres courts, premier genre seulement", () => {
  const g = (id) => contenu({ ...facts, genreIds: [id, 18] }).line.genre;
  assert.equal(g(878), "SF");
  assert.equal(g(10765), "SF");
  assert.equal(g(10759), "Action");
  assert.equal(g(10768), "Guerre");
  assert.equal(g(10751), "Famille");
  assert.equal(g(18), "Drame");
  assert.equal(SHORT_GENRES[27], "Horreur");
});

test("genre_complet", () => {
  assert.equal(contenu(facts, extra, "poster", reglages("gc")).line.genre, "Science-fiction");
  assert.equal(contenu({ ...facts, genreIds: [10765] }, extra, "poster", reglages("gc")).line.genre, "SF & Fantastique");
});

test("qualité : seulement la 4K, et 4K seul sur demande", () => {
  assert.equal(contenu(facts, { ...extra, quality: { uhd: false, extra: null } }).quality, null);
  assert.deepEqual(contenu(facts, { ...extra, quality: { uhd: true, extra: "DV" } }).quality, { extra: "DV" });
  assert.deepEqual(contenu(facts, { ...extra, quality: { uhd: true, extra: "DV" } }, "poster", reglages("q4")).quality, { extra: null });
  assert.equal(contenu(facts, { ...extra, quality: null }).quality, null);
});

test("rang : top 20 seulement", () => {
  assert.equal(contenu(facts, { ...extra, rank: 21 }).rank, null);
  assert.equal(contenu(facts, { ...extra, rank: 20 }).rank, 20);
});

test("voies éteintes", () => {
  const c = contenu(facts, plein, "poster", reglages("T0Q0G0A0N0"));
  assert.equal(c.rank, null);
  assert.equal(c.quality, null);
  assert.equal(c.line, null);
  assert.equal(c.full, true);
  const sansTitre = contenu(facts, plein, "poster", reglages("L0"));
  assert.equal(sansTitre.full, false);
  assert.equal(sansTitre.image, "/fr.jpg");
  assert.equal(sansTitre.rank, 4);
  assert.equal(contenu(facts, plein, "poster", reglages("F0")).styles.fondu, null);
});

test("source_tmdb", () => {
  assert.deepEqual(contenu(facts, plein, "poster", reglages("nt")).line, { genre: "SF", note: "8,1", annee: "2024" });
  assert.deepEqual(contenu({ ...facts, vote: { average: 8.1, count: 10 } }, plein, "poster", reglages("nt")).line, { genre: "SF", annee: "2024" });
});

test("bientot_gris_sans_note", () => {
  const c = contenu(bientot, plein);
  assert.equal(c.statut, "AU CINÉMA LE 16 DÉC.");
  assert.equal(c.gris, true);
  assert.deepEqual(c.line, { genre: "SF", annee: "2024" });
  assert.equal(contenu(bientot, plein, "poster", reglages("B0")).gris, false);
  assert.equal(contenu(bientot, plein, "poster", reglages("h0")).line.note, "8,4");
  assert.equal(contenu(bientot, plein, "poster", reglages("S0")).statut, null);
});

// « Pas sorti » = pas encore chez soi en VF, comme les rangées de l'addon : un film seulement au cinéma l'est.
test("en_salle_pas_encore_sorti", () => {
  const c = contenu(enSalle, plein);
  assert.equal(c.statut, "AU CINÉMA");
  assert.equal(c.statut2, "DISPO VERS LE 24 NOV.");
  assert.equal(c.gris, true);
  assert.equal(c.line.note, undefined);
});

// The Fix : sorti en numérique aux États-Unis, sources sans VF → en noir et blanc, « BIENTÔT » (sans date : on ne sait
// pas quand la VF viendra). Sans sources lues, la date américaine passée dit vrai : en couleur, « NOUVEAU ».
test("sorti_sans_vf_pas_encore_sorti", () => {
  const sansVf = { ...facts, originalLanguage: "en", releases: [{ iso_3166_1: "US", release_dates: [{ type: 4, release_date: "2026-10-01" }] }], releaseDate: "2026-09-01" };
  const c = contenu(sansVf, { ...plein, quality: { uhd: false, extra: null, vf: false, sources: 12 } });
  assert.equal(c.gris, true);
  assert.equal(c.statut, "BIENTÔT");
  assert.deepEqual([contenu(sansVf, plein).statut, contenu(sansVf, plein).gris], ["NOUVEAU", false]);
});

// L'Odyssée : sources en VO seulement, sortie numérique américaine le 17 nov. → « DÈS LE 17 NOV. » en noir et blanc
// (« DISPO LE » sous « AU CINÉMA » s'il est en salle en France), jamais « BIENTÔT » seul. Sans date américaine : « PRÉVU VERS LE ».
test("vo_avant_la_date_americaine", () => {
  const vo = { ...plein, quality: { uhd: false, extra: null, vf: false, sources: 30 } };
  const us = { iso_3166_1: "US", release_dates: [{ type: 3, release_date: "2026-07-17" }, { type: 4, release_date: "2026-11-17" }] };
  const ailleurs = contenu({ ...facts, originalLanguage: "en", releases: [us], releaseDate: "2026-07-17" }, vo);
  assert.deepEqual([ailleurs.statut, ailleurs.gris], ["DÈS LE 17 NOV.", true]);
  const enSalleFr = contenu({ ...facts, originalLanguage: "en", releases: [{ iso_3166_1: "FR", release_dates: [{ type: 3, release_date: "2026-07-15" }] }, us], releaseDate: "2026-07-15" }, vo);
  assert.deepEqual([enSalleFr.statut, enSalleFr.statut2, enSalleFr.gris], ["AU CINÉMA", "DISPO LE 17 NOV.", true]);
  const estime = contenu({ ...facts, originalLanguage: "en", releases: [{ iso_3166_1: "US", release_dates: [{ type: 3, release_date: "2026-10-10" }] }], releaseDate: "2026-10-10" }, vo);
  assert.deepEqual([estime.statut, estime.gris], ["PRÉVU VERS LE 24 NOV.", true]);
  // Le jour venu, sources VF : en couleur.
  const vf = contenu({ ...facts, originalLanguage: "en", releases: [us], releaseDate: "2026-07-17" }, { ...plein, quality: { uhd: false, extra: null, vf: true, sources: 30 } }, "poster", DEFAUT_REGLAGES);
  assert.equal(vf.gris, false);
});

test("age_sur_demande", () => {
  const f = { ...facts, age: "12" };
  assert.equal(contenu(f, plein).line.age, undefined);
  assert.deepEqual(contenu(f, plein, "poster", reglages("Y1")).line, { genre: "SF", note: "8,4", annee: "2024", age: "12" });
  assert.equal(contenu({ ...facts, age: null }, plein, "poster", reglages("Y1")).line.age, undefined);
});

// Le badge dit d'où vient la note : IMDb, ou TMDB (choisie, ou en repli quand IMDb n'en a pas).
test("note_en_badge", () => {
  assert.equal(contenu(facts, plein).line.source, undefined);
  assert.equal(contenu(facts, plein, "poster", reglages("eb")).line.source, "imdb");
  assert.equal(contenu(facts, { ...plein, imdbRating: undefined }, "poster", reglages("eb")).line.source, "tmdb");
  assert.equal(contenu(facts, plein, "poster", reglages("nteb")).line.source, "tmdb");
  assert.equal(contenu(facts, plein, "poster", reglages("eb")).styles.note, "badge");
});

test("styles_nouveaux", () => {
  const c = contenu(facts, plein, "poster", reglages("ocwbd1"));
  assert.equal(c.styles.place, "centre");
  assert.equal(c.styles.police, "bebas");
  assert.deepEqual(c.styles.fondu, { couleur: "noir", force: "m", flou: true });
});

// La date à la place de « Bientôt » / « En salle » ; l'année seulement si ce n'est pas l'année en cours.
test("statut_en_dates", () => {
  const avec = (releases, releaseDate = "") => contenu({ ...facts, releases, releaseDate }, plein).statut;
  const fr = (...d) => [{ iso_3166_1: "FR", release_dates: d.map(([type, release_date]) => ({ type, release_date })) }];
  assert.equal(avec(fr([3, "2026-10-10"], [4, "2026-11-02"])), "AU CINÉMA");
  assert.equal(contenu({ ...facts, releases: fr([3, "2026-10-10"], [4, "2026-11-02"]) }, plein).statut2, "DISPO LE 2 NOV.");
  assert.equal(avec(fr([3, "2027-03-12"]), "2027-03-12"), "AU CINÉMA LE 12 MARS 2027");
  assert.equal(avec([{ iso_3166_1: "US", release_dates: [{ type: 3, release_date: "2027-01-05" }] }]), "PRÉVU LE 5 JANV. 2027");
  assert.equal(avec([], "2026-12-01"), "PRÉVU LE 1 DÉC.");
  assert.equal(avec([], ""), "BIENTÔT");
  const serie = { ...facts, type: "series", releases: [], releaseDate: "", firstAir: "2026-11-01", seasons: [] };
  assert.equal(contenu(serie, plein).statut, "PRÉVU LE 1 NOV.");
});

test("note_seule_sans_logo", () => {
  const c = contenu({ ...facts, logo: null }, plein, "poster", MEMOIRES.noteSeule);
  assert.equal(c.full, false);
  assert.equal(c.line, null);
  const avec = contenu(facts, plein, "poster", MEMOIRES.noteSeule);
  assert.deepEqual(avec.line, { note: "8,4" });
  assert.equal(avec.styles.note, "grand");
  assert.equal(avec.rank, null);
});

test("etag_change", () => {
  const a = contenu(facts, plein), b = contenu(facts, plein);
  assert.equal(contentKey(a), contentKey(b));
  assert.match(contentKey(a), /^[0-9a-f]{40}$/);
  for (const s of ["T0", "tr", "kp", "la", "en", "pb", "xq", "zq", "fa", "il", "se"]) {
    assert.notEqual(contentKey(contenu(facts, plein, "poster", reglages(s))), contentKey(a), s);
  }
});

// ---------- Régie v2 ----------
const v2 = { ...facts, runtime: 166, seasonsCount: null, provider: { name: "Netflix", logo: "/n.jpg" },
  logos: { fr: "/fr.png", en: "/en.png", vo: "/ja.png" } };

test("v2_duree_film_et_series", () => {
  assert.equal(contenu(v2, plein, "poster", reglages("D1")).line.duree, "2 h 46");
  assert.equal(contenu({ ...v2, runtime: 45 }, plein, "poster", reglages("D1")).line.duree, "45 min");
  const serie = { ...v2, type: "series", runtime: null, seasonsCount: 3, releases: [], releaseDate: "", firstAir: "2020-01-01", seasons: [] };
  assert.equal(contenu(serie, plein, "poster", reglages("D1")).line.duree, "3 saisons");
  assert.equal(contenu({ ...serie, seasonsCount: 1 }, plein, "poster", reglages("D1")).line.duree, "1 saison");
  assert.equal(contenu(v2, plein).line.duree, undefined);
});

test("v2_notes_multiples_et_couleur", () => {
  const notes = { rt: 94, mc: 81, lb: 4.1 };
  const c = posterContent(v2, { ...plein, notes }, "poster", reglages("R1b1co"), AUJ);
  assert.deepEqual(c.line.notes, [{ s: "rt", v: "94 %", n: 9.4 }, { s: "lb", v: "4,1", n: 8.2 }]);
  assert.equal(c.line.noteN, 8.4);
  assert.equal(c.styles.couleurNote, "oui");
  // Notes inconnues : absentes ; pas demandées : rien.
  assert.equal(posterContent(v2, { ...plein, notes: null }, "poster", reglages("R1"), AUJ).line.notes, undefined);
  assert.equal(posterContent(v2, { ...plein, notes }, "poster", DEFAUT_REGLAGES, AUJ).line.notes, undefined);
  // Pas encore sorti avec la note cachée : les autres notes aussi.
  assert.equal(posterContent(bientot, { ...plein, notes }, "poster", reglages("R1"), AUJ).line.notes, undefined);
});

test("v2_plateforme_ordre", () => {
  assert.equal(contenu(v2, plein, "poster", reglages("P1")).line.plateforme, "/n.jpg");
  const coin = contenu(v2, plein, "poster", reglages("P1vc"));
  assert.equal(coin.coin, "/n.jpg");
  assert.equal(coin.line.plateforme, undefined);
  assert.equal(contenu({ ...v2, provider: null }, plein, "poster", reglages("P1")).line.plateforme, undefined);
  assert.equal(contenu(v2, plein, "poster", reglages("On")).line.ordre, "nga");
  assert.equal(contenu(v2, plein).line.ordre, undefined);
});

test("v2_bandeau", () => {
  const statut = contenu(enSalle, plein, "poster", reglages("J1"));
  assert.deepEqual(statut.bandeau, { texte: "AU CINÉMA", coin: "d" });
  assert.equal(statut.statut2, undefined);
  assert.equal(statut.statut, null);
  const tendance = contenu(facts, plein, "poster", reglages("J1KtEg"));
  assert.deepEqual(tendance.bandeau, { texte: "N°4", coin: "g" });
  assert.equal(tendance.rank, null);
  // Rien à porter : pas de bandeau.
  assert.equal(contenu(facts, extra, "poster", reglages("J1")).bandeau, undefined);
});

test("v2_image_et_langue_du_logo", () => {
  const off = contenu(v2, plein, "poster", reglages("Uo"));
  assert.deepEqual([off.image, off.logo, off.full], ["/fr.jpg", null, true]);
  const fond = contenu(v2, plein, "poster", reglages("Uf"));
  assert.deepEqual([fond.image, fond.logo, fond.full], ["/bdnu.jpg", "/fr.png", true]);
  assert.equal(contenu(v2, plein, "poster", reglages("ue")).logo, "/en.png");
  assert.equal(contenu(v2, plein, "poster", reglages("uv")).logo, "/ja.png");
  // Repli : pas de logo dans la langue d'origine → français ; ni français ni anglais → le logo d'une autre langue
  // (mieux qu'une affiche sans rien) ; aucun logo → l'affiche normale.
  assert.equal(contenu({ ...v2, logos: { fr: "/fr.png", en: null, vo: null } }, plein, "poster", reglages("uv")).logo, "/fr.png");
  const autre = contenu({ ...v2, logo: null, logos: { fr: null, en: null, vo: null, autre: "/es.png" } }, plein);
  assert.deepEqual([autre.full, autre.logo], [true, "/es.png"]);
  assert.equal(contenu({ ...v2, logo: null, logos: { fr: null, en: null, vo: null, autre: "/es.png" } }, plein, "poster", reglages("ue")).logo, "/es.png");
  assert.equal(contenu({ ...v2, logo: null, logos: { fr: null, en: null, vo: null, autre: null } }, plein).full, false);
});

test("v2_qualite_tout", () => {
  const q = (quality) => contenu(v2, { ...plein, quality }, "poster", reglages("qt")).quality;
  assert.deepEqual(q({ uhd: true, extra: "HDR", hdr10p: true, fhd: true, atmos: true }), { label: "4K", extra: "HDR10+", atmos: true });
  assert.deepEqual(q({ uhd: true, extra: "DV", hdr10p: true, fhd: false, atmos: false }), { label: "4K", extra: "DV", atmos: false });
  assert.deepEqual(q({ uhd: false, extra: null, fhd: true, atmos: true }), { label: "1080p", extra: null, atmos: true });
  assert.equal(q({ uhd: false, extra: null, fhd: false, atmos: true }), null);
});

test("v2_styles_hors_defaut_seulement", () => {
  assert.deepEqual(Object.keys(contenu(v2, plein).styles).sort(), Object.keys(contenu(facts, plein).styles).sort());
  const st = contenu(v2, plein, "poster", reglages("mcjqrvI1HvypasCoV0X1ZrWl")).styles;
  assert.deepEqual([st.monte, st.large, st.barre, st.inverse, st.voile, st.vignette, st.accent], [0.1, 1.4, "verre", true, "0", true, "rouge"]);
  assert.deepEqual(st.badges, { style: "verre", forme: "pilule", opacite: "s", couleur: "or" });
  assert.equal(st.fondu.hauteur, "long");
});

test("revue_image_du_film_marque_fond_large", () => {
  assert.equal(contenu(v2, plein, "poster", reglages("Uf")).fondLarge, true);
  assert.equal(contenu(v2, plein).fondLarge, undefined);
});

// ---------- Régie v3 ----------
const v3 = { ...v2, tagline: "Le destin d'un peuple.", studio: "Legendary", director: "Denis Villeneuve", vote: { average: 8.1, count: 6000 } };

test("v3_ligne2", () => {
  assert.equal(contenu(v3, plein, "poster", reglages("3ar")).line2, "Un film de Denis Villeneuve");
  assert.equal(contenu(v3, plein, "poster", reglages("3aa")).line2, "Le destin d'un peuple.");
  assert.equal(contenu(v3, plein, "poster", reglages("3as")).line2, "Legendary");
  const serie = { ...v3, type: "series", releases: [], releaseDate: "", firstAir: "2020-01-01", seasons: [], director: "Vince Gilligan" };
  assert.equal(contenu(serie, plein, "poster", reglages("3ar")).line2, "Créée par Vince Gilligan");
  assert.equal(contenu({ ...v3, tagline: null }, plein, "poster", reglages("3aa")).line2, undefined);
  assert.equal(contenu(v3, plein).line2, undefined);
});

test("v3_culte", () => {
  assert.equal(contenu(v3, plein, "poster", reglages("3b1")).culte, true);
  assert.equal(contenu(v3, { ...plein, imdbRating: "7.9" }, "poster", reglages("3b1")).culte, undefined);
  assert.equal(contenu({ ...v3, vote: { average: 8.1, count: 900 } }, plein, "poster", reglages("3b1")).culte, undefined);
  assert.equal(contenu(v3, plein).culte, undefined);
});

test("v3_statut_episode_et_compte", () => {
  const serie = { ...facts, type: "series", releases: [], releaseDate: "", firstAir: "2020-01-01", seasons: [], lastEpisode: "2026-10-17" };
  assert.equal(contenu(serie, plein, "poster", reglages("3c1")).statut, "NOUVEL ÉPISODE");
  assert.equal(contenu({ ...serie, lastEpisode: "2026-10-01" }, plein, "poster", reglages("3c1")).statut, null);
  assert.equal(contenu(serie, plein).statut, null);
  assert.equal(contenu(bientot, plein, "poster", reglages("3dc")).statut, "AU CINÉMA DANS 57 JOURS");
  assert.equal(contenu(enSalle, plein, "poster", reglages("3dc")).statut, "AU CINÉMA");
  assert.equal(contenu(enSalle, plein, "poster", reglages("3dc")).statut2, "DISPO DANS ENV. 35 JOURS");
  const demain = { ...facts, releases: [{ iso_3166_1: "FR", release_dates: [{ type: 3, release_date: "2026-10-21" }] }], releaseDate: "2026-10-21" };
  assert.equal(contenu(demain, plein, "poster", reglages("3dc")).statut, "AU CINÉMA DEMAIN");
});

test("v3_styles_hors_defaut", () => {
  assert.deepEqual(Object.keys(contenu(v3, plein).styles).sort(), Object.keys(contenu(facts, plein).styles).sort());
  const st = contenu(v3, plein, "poster", reglages("Hp0az0bq0c51am1bc1co1dn1e11fc1g5wc2am2bt2cf2dh3e43f1")).styles;
  assert.equal(st.accentC, PALETTE.z);
  assert.equal(st.texteC, PALETTE.q);
  assert.equal(st.badges.fond, PALETTE["5"]);
  assert.deepEqual(st.retouche, { lum: 1.3, contraste: 0.8, satur: 1.4, filtre: "nb", grain: true });
  assert.equal(st.cadre, PALETTE["5"]);
  assert.deepEqual([st.police, st.casse, st.espace, st.ombre, st.effet], ["condensee", "maj", "tresaere", "forte", "halo"]);
  assert.deepEqual(st.coins, { statut: "bd", qualite: "hg" });
  assert.equal(contenu(v3, plein, "poster", reglages("0db")).styles.fondu.teinte, PALETTE.b);
  assert.equal(contenu(v3, plein, "poster", reglages("1fo")).styles.cadre, "#f5c518");
});

test("fondu_precis_dans_les_styles", () => {
  assert.deepEqual(contenu(v3, plein, "poster", reglages("1ho1im")).styles.fondu, { couleur: "noir", force: "m", opacite: 1, taille: 0.85 });
  assert.deepEqual(contenu(v3, plein).styles.fondu, { couleur: "noir", force: "m" });
});

// « EB » : aucun logo chez TMDB, dans aucune langue. Le titre est écrit en texte à la place du logo (jamais une image
// sans nom) ; seulement en lettres latines (les polices n'ont pas les autres écritures). Avec un logo : rien ne change.
test("titre_ecrit_sans_logo", () => {
  const sansLogo = { ...facts, logo: null, logos: { fr: null, en: null, vo: null, autre: null }, titre: "EB" };
  const c = contenu(sansLogo);
  assert.deepEqual([c.full, c.logo, c.titreTexte, c.image], [true, null, "EB", "/nu.jpg"]);
  assert.ok(c.line, "ligne du bas");
  assert.equal(contenu(sansLogo, extra, "landscape").titreTexte, "EB");
  assert.equal(contenu({ ...sansLogo, titre: "Les Rayons et les Ombres : l'été d'Hélène (2026) !" }).titreTexte, "Les Rayons et les Ombres : l'été d'Hélène (2026) !");
  const japonais = contenu({ ...sansLogo, titre: "南田南弁護士は天才肌" });
  assert.deepEqual([japonais.full, japonais.titreTexte], [false, undefined]);
  assert.equal(contenu({ ...sansLogo, titre: null }).full, false);
  // Sans image sans texte (ni affiche ni fond) : l'affiche officielle, qui porte déjà son titre.
  assert.equal(contenu({ ...sansLogo, textlessPoster: null, textlessBackdrop: null }).titreTexte, undefined);
  // Titre éteint (« Pas de titre ») : rien d'écrit.
  assert.equal(contenu(sansLogo, extra, "poster", lireReglages(new URLSearchParams("s=1.L0"))).titreTexte, undefined);
  // Avec un logo : pas de titre écrit (ETag inchangé).
  assert.equal("titreTexte" in contenu({ ...facts, titre: "Dune" }), false);
});

// Titre écrit : seulement ce que les polices savent écrire (lues dans leurs fichiers). Émojis et symboles (★) :
// l'image d'origine. Cyrillique, grec : en Inter. Une lettre absente de la police choisie (Ş, Ř, Ğ manquent à
// Oswald) : tout le titre en Inter, jamais un mélange au milieu du titre.
test("titre_ecrit_seulement_ecrivable", () => {
  const sansLogo = { ...facts, logo: null, logos: { fr: null, en: null, vo: null, autre: null } };
  const ecrit = (titre, r = DEFAUT_REGLAGES) => { const c = contenu({ ...sansLogo, titre }, extra, "poster", r); return [c.titreTexte, c.titreInter]; };
  assert.deepEqual(ecrit("Brat ★"), [undefined, undefined]);
  assert.deepEqual(ecrit("Fiesta 🎉"), [undefined, undefined]);
  assert.deepEqual(ecrit("Война и мир"), ["Война и мир", undefined]);
  assert.deepEqual(ecrit("Ζορμπάς"), ["Ζορμπάς", undefined]);
  assert.deepEqual(ecrit("Fast & Furious 7"), ["Fast & Furious 7", undefined]);
  const oswald = reglages("wc");
  assert.deepEqual(ecrit("Amélie", oswald), ["Amélie", undefined]);
  assert.deepEqual(ecrit("Kış Uykusu", oswald), ["Kış Uykusu", true]);
  assert.deepEqual(ecrit("Война и мир", reglages("wb")), ["Война и мир", true]);
  // Titre en lettres décomposées (e + accent) : écrit dans sa forme composée.
  assert.equal(ecrit("Amélie")[0], "Amélie");
});

// La petite ligne (réalisateur, accroche, studio) : vérifiée de même ; pas écrivable, pas de petite ligne.
test("ligne2_seulement_ecrivable", () => {
  assert.equal(contenu({ ...v3, studio: "東宝" }, plein, "poster", reglages("3as")).line2, undefined);
  assert.equal(contenu({ ...v3, tagline: "Prêts ? 🍿" }, plein, "poster", reglages("3aa")).line2, undefined);
  const c = contenu({ ...v3, director: "Nuri Bilge Ceylan Ş" }, plein, "poster", reglages("3arwc"));
  assert.deepEqual([c.line2, c.ligne2Inter], ["Un film de Nuri Bilge Ceylan Ş", true]);
  assert.equal("ligne2Inter" in contenu(v3, plein, "poster", reglages("3ar")), false);
});

// Sources sans VF (lues avec la qualité) : pas sorti, seule la VF compte — en noir et blanc, « BIENTÔT ».
test("statut_en_vo_seulement", () => {
  const recent = { ...facts, releases: [{ iso_3166_1: "US", release_dates: [{ type: 4, release_date: "2026-10-01" }] }, { iso_3166_1: "CA", release_dates: [{ type: 3, release_date: "2026-08-01" }] }], releaseDate: "2026-08-01" };
  const vo = contenu(recent, { ...extra, quality: { uhd: false, extra: null, vf: false, sources: 8 } });
  assert.deepEqual([vo.statut, vo.gris], ["BIENTÔT", true]);
  const vf = contenu(recent, { ...extra, quality: { uhd: false, extra: null, vf: true, sources: 8 } });
  assert.deepEqual([vf.statut, vf.gris], ["NOUVEAU", false]);
});

// Badge Langue (3g1) : la langue lue dans les sources ; rien sans sources, rien sans le réglage (ETag d'avant).
test("langue_des_sources", () => {
  const q = (langue) => ({ ...plein, quality: { uhd: true, extra: "DV", vf: langue === "vf" || langue === "multi", sources: 5, langue } });
  assert.equal(contenu(facts, q("multi"), "poster", reglages("3g1")).langue, "MULTI");
  assert.equal(contenu(facts, q("vf"), "poster", reglages("3g1")).langue, "VF");
  assert.equal(contenu(facts, q("vostfr"), "poster", reglages("3g1")).langue, "VOSTFR");
  assert.equal(contenu(facts, q("vo"), "poster", reglages("3g1")).langue, "VO");
  assert.equal(contenu(facts, q(null), "poster", reglages("3g1")).langue, undefined);
  assert.equal(contenu(facts, extra, "poster", reglages("3g1")).langue, undefined);
  assert.equal("langue" in contenu(facts, q("vf")), false);
  // Sans le badge qualité, la langue reste.
  assert.equal(contenu(facts, q("vf"), "poster", reglages("Q03g1")).langue, "VF");
});

// Rang dans la saga (3j1) : seulement avec le réglage, et seulement s'il est connu.
test("rang_dans_la_saga", () => {
  assert.deepEqual(contenu(facts, { ...plein, saga: { n: 3, t: 5 } }, "poster", reglages("3j1")).saga, { n: 3, t: 5 });
  assert.equal("saga" in contenu(facts, { ...plein, saga: { n: 3, t: 5 } }), false);
  assert.equal("saga" in contenu(facts, { ...plein, saga: null }, "poster", reglages("3j1")), false);
});

// Habillage de la saison (3k1) : seulement avec le réglage.
test("habillage_de_saison", () => {
  assert.equal(contenu(facts, { ...plein, saison: "noel" }, "poster", reglages("3k1")).saison, "noel");
  assert.equal("saison" in contenu(facts, { ...plein, saison: "noel" }), false);
  assert.equal("saison" in contenu(facts, plein, "poster", reglages("3k1")), false);
});

// Fin et avancement d'une série (3h1, 3i1) : jamais deux libellés ; la sortie, puis le nouvel épisode, passent avant.
test("serie_fin_et_avancement", () => {
  const serie = { ...facts, type: "series", releases: [], releaseDate: "", firstAir: "2020-01-01", status: "Ended", lastEpisode: "2025-05-01",
    lastSeason: 2, lastEpisodeNumber: 5, seasons: [{ season_number: 2, air_date: "2025-03-01", episode_count: 8 }] };
  assert.equal(contenu(serie, plein, "poster", reglages("3h1")).statut, "TERMINÉE");
  assert.equal(contenu({ ...serie, status: "Canceled" }, plein, "poster", reglages("3h1")).statut, "ANNULÉE");
  assert.equal(contenu(serie, plein).statut, null);
  assert.equal(contenu(serie, plein, "poster", reglages("S03h1")).statut, null);
  // Un épisode de la semaine passe avant (réglage Épisodes) ; « NOUVEAU » (première diffusion récente) aussi.
  assert.equal(contenu({ ...serie, lastEpisode: "2026-10-18" }, plein, "poster", reglages("3c13h1")).statut, "NOUVEL ÉPISODE");
  assert.equal(contenu({ ...serie, firstAir: "2026-10-10" }, plein, "poster", reglages("3h1")).statut, "NOUVEAU");
  // Bandeau qui porte le statut : « TERMINÉE » dans le bandeau.
  assert.equal(contenu(serie, plein, "poster", reglages("J13h1")).bandeau.texte, "TERMINÉE");
  // Avancement : série pas finie, saison pas complète.
  const enCours = { ...serie, status: "Returning Series", lastEpisode: "2026-10-15" };
  assert.deepEqual(contenu(enCours, plein, "poster", reglages("3i1")).avance, { s: 2, n: 5, t: 8 });
  assert.equal("avance" in contenu(enCours, plein), false);
  assert.equal("avance" in contenu(serie, plein, "poster", reglages("3i1")), false);
  assert.equal("avance" in contenu(enCours, plein, "poster", reglages("S03i1")), false);
  // Nouvelle série pas encore sortie en VF (sources sans VF) : pas de barre.
  const vo = contenu({ ...enCours, firstAir: "2026-09-01", lastSeason: 1, seasons: [{ season_number: 1, air_date: "2026-09-01", episode_count: 8 }] }, { ...plein, quality: { uhd: true, extra: null, vf: false, sources: 4 } }, "poster", reglages("3i1"));
  assert.equal(vo.statut, "BIENTÔT");
  assert.equal(vo.gris, true);
  assert.equal("avance" in vo, false);
  // Série déjà là (plus d'un an), sa saison en cours pas encore en VF : en couleur, avec son avancement.
  const enCoursVo = contenu({ ...enCours, firstAir: "2024-09-01" }, { ...plein, quality: { uhd: true, extra: null, vf: false, sources: 4 } }, "poster", reglages("3i1"));
  assert.deepEqual([enCoursVo.statut, enCoursVo.gris, enCoursVo.avance], [null, false, { s: 2, n: 5, t: 8 }]);
  // Sa saison 3 commence bientôt : « SAISON 3 BIENTÔT », en couleur (pas « BIENTÔT » comme une nouvelle série).
  const prochaine = contenu({ ...serie, nextEpisode: "2026-11-02", nextSeason: 3, nextEpisodeNumber: 1 }, plein, "poster", reglages("3h1"));
  assert.deepEqual([prochaine.statut, prochaine.gris], ["SAISON 3 BIENTÔT", false]);
});

// MyAnimeList (animés) à côté des autres ; la moyenne : une seule note, celles qu'on a ramenées sur 10.
test("notes_mal_et_moyenne", () => {
  const notes = { rt: 94, mc: 81, lb: 4.1, mal: 8.62 };
  const mal = posterContent(v2, { ...plein, notes }, "poster", reglages("3l1"), AUJ);
  assert.deepEqual(mal.line.notes, [{ s: "mal", v: "8,62", n: 8.6 }]);
  // IMDb 8,4, RT 9,4, MC 8,1, LB 8,2, MAL 8,6 : 8,54 → 8,5.
  const moy = posterContent(v2, { ...plein, notes }, "poster", reglages("R1M1b13l13m1"), AUJ);
  assert.equal(moy.line.note, "8,5");
  assert.equal(moy.line.notes, undefined);
  // En badge : « MOY. » ; en grand chiffre aussi ; une note manquante ne compte pas.
  assert.equal(posterContent(v2, { ...plein, notes }, "poster", reglages("eb3l13m1"), AUJ).line.source, "moy");
  assert.equal(posterContent(v2, { ...plein, notes }, "poster", reglages("eg3l13m1"), AUJ).line.note, "8,5");
  assert.equal(posterContent(v2, { ...plein, notes: { mal: null } }, "poster", reglages("3l13m1"), AUJ).line.note, "8,4");
  // Sans moyenne, en grand chiffre : la principale seule, comme avant.
  assert.equal(posterContent(v2, { ...plein, notes }, "poster", reglages("egR1"), AUJ).line.notes, undefined);
});

// IMDb et TMDB ensemble (3n1) : IMDb en principale, TMDB en premier des autres ; ni l'une ni l'autre (3o0) : seulement
// les autres sites.
test("notes_imdb_et_tmdb_ou_aucune", () => {
  const notes = { rt: 94, mc: null, lb: null, mal: null };
  const deux = posterContent(v2, { ...plein, notes }, "poster", reglages("R13n1"), AUJ);
  assert.equal(deux.line.note, "8,4");
  assert.deepEqual(deux.line.notes, [{ s: "tmdb", v: "8,1", n: 8.1 }, { s: "rt", v: "94 %", n: 9.4 }]);
  // Sans note IMDb, la principale est déjà TMDB : pas deux fois.
  assert.deepEqual(posterContent(v2, { ...plein, imdbRating: null, notes }, "poster", reglages("R13n1"), AUJ).line.notes, [{ s: "rt", v: "94 %", n: 9.4 }]);
  const aucune = posterContent(v2, { ...plein, notes }, "poster", reglages("R13o0"), AUJ);
  assert.equal(aucune.line.note, undefined);
  assert.deepEqual(aucune.line.notes, [{ s: "rt", v: "94 %", n: 9.4 }]);
  // En moyenne : IMDb 8,4, TMDB 8,1, RT 9,4 → 8,6.
  assert.equal(posterContent(v2, { ...plein, notes }, "poster", reglages("R13m13n1"), AUJ).line.note, "8,6");
});

// Aucune affiche sans texte chez TMDB (Brice de Nice, Les Nouvelles Aventures d'Aladin, films français surtout) : le fond
// sans texte recadré en portrait, avec notre logo et la ligne du bas, plutôt que l'affiche officielle sans rien (dite
// « pas dessinée en entier »). Sans fond sans texte non plus : l'affiche officielle, comme avant.
test("sans_affiche_sans_texte_le_fond_recadre", () => {
  const c = contenu({ ...facts, textlessPoster: null }, plein);
  assert.equal(c.full, true);
  assert.equal(c.image, "/bdnu.jpg");
  assert.equal(c.fondLarge, true);
  assert.equal(c.logo, "/fr.png");
  assert.deepEqual(c.line, { genre: "SF", note: "8,4", annee: "2024" });
  const rien = contenu({ ...facts, textlessPoster: null, textlessBackdrop: null }, plein);
  assert.equal(rien.full, false);
  assert.equal(rien.image, "/fr.jpg");
  // Le paysage n'est pas concerné ; l'affiche officielle choisie (réglage Image) non plus.
  assert.equal(contenu({ ...facts, textlessPoster: null }, plein, "landscape").fondLarge, undefined);
  assert.equal(contenu({ ...facts, textlessPoster: null }, plein, "poster", reglages("Uo")).image, "/fr.jpg");
});
