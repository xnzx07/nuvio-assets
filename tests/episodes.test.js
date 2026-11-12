import { test } from "node:test";
import assert from "node:assert/strict";
import { decoupageCinemeta, decoupageParDates, comptesDifferents, ficheRecomptee } from "../worker/episodes.js";
import { decoupageCinemeta as decoupageAffiches } from "../affiches/lib/episodes.js";

// Cinemeta : une vidéo par épisode, comme dans /meta/series/<imdb>.json.
const cine = (...saisons) => saisons.flatMap((n, i) => Array.from({ length: n }, (_, k) => ({
  id: `tt1:${i + 1}:${k + 1}`, season: i + 1, episode: k + 1, name: `Ep ${k + 1}`, released: "2024-01-01T00:00:00.000Z",
})));
const tmdb = (...saisons) => [{ season_number: 0, episode_count: 3 }, ...saisons.map((n, i) => ({ season_number: i + 1, episode_count: n, air_date: "2024-01-01" }))];

test("meme_decoupage_rien_a_faire", () => {
  assert.equal(decoupageCinemeta(tmdb(10, 10), cine(10, 10)), null);
  // Cinemeta a seulement des épisodes de plus en fin de saison (L'Attaque des Titans) : on garde TMDB.
  assert.equal(decoupageCinemeta(tmdb(25, 28), cine(25, 30)), null);
  assert.equal(decoupageCinemeta(tmdb(10), []), null);
  assert.equal(decoupageCinemeta(tmdb(10), null), null);
});

test("memes_saisons_un_episode_d_ecart_on_garde_tmdb", () => {
  // La Villa des cœurs brisés : un épisode de plus chez Cinemeta en saison 2 (56 contre 55), des épisodes annoncés en
  // plus en saison 11. Mis bout à bout, tout glissait d'un cran dès la saison 3 (S11E58 de TMDB devenait :11:57).
  assert.equal(decoupageCinemeta(tmdb(41, 55, 91, 70), cine(41, 56, 91, 73)), null);
  assert.equal(decoupageAffiches(tmdb(41, 55, 91, 70), cine(41, 56, 91, 73)), null);
  // Cinemeta en retard sur la saison en cours (sa copie gardée un jour : 69 contre 70 chez TMDB) : l'écart de la
  // dernière saison est son remplissage, pas une frontière déplacée.
  assert.equal(decoupageCinemeta(tmdb(41, 55, 91, 70), cine(41, 56, 91, 69)), null);
  assert.equal(decoupageAffiches(tmdb(41, 55, 91, 70), cine(41, 56, 91, 69)), null);
  // Écarts qui se compensent (Hunter x Hunter : 62 + 74 chez TMDB, 58 + 78 chez Cinemeta) : frontière déplacée, le
  // bout à bout reste.
  assert.deepEqual(decoupageCinemeta(tmdb(62, 74, 12), cine(58, 78, 12)).place(1, 59), { season: 2, episode: 1 });
  assert.deepEqual(decoupageCinemeta(tmdb(41, 57, 89, 20), cine(41, 56, 90, 20)).place(3, 1), { season: 3, episode: 2 });
  assert.notEqual(decoupageAffiches(tmdb(41, 57, 89, 20), cine(41, 56, 90, 20)), null);
});

test("une_saison_tmdb_redecoupee_comme_cinemeta", () => {
  // Jujutsu Kaisen : une « saison 1 » de 59 épisodes chez TMDB, 24 + 23 + 12 et la saison 4 annoncée chez Cinemeta.
  const c = cine(24, 23, 12);
  c.push({ id: "tt1:4:1", season: 4, episode: 1, name: "Episode 1", released: null });
  const d = decoupageCinemeta(tmdb(59), c);
  assert.deepEqual(d.place(1, 1), { season: 1, episode: 1 });
  assert.deepEqual(d.place(1, 25), { season: 2, episode: 1 });
  assert.deepEqual(d.place(1, 59), { season: 3, episode: 12 });
  assert.deepEqual(d.place(0, 2), { season: 0, episode: 2 });
  // Le 60e épisode, quand TMDB l'aura : le 1er de la saison 4.
  assert.deepEqual(d.place(1, 60), { season: 4, episode: 1 });
  assert.deepEqual(d.restants.map((v) => v.id), ["tt1:4:1"]);
  assert.deepEqual(d.saisons.map((s) => [s.season_number, s.episode_count, s.air_date]),
    [[0, 3, undefined], [1, 24, "2024-01-01"], [2, 23, "2024-01-01"], [3, 12, "2024-01-01"], [4, 1, null]]);
});

test("episodes_tmdb_au_dela_de_cinemeta", () => {
  // Bleach : 366 + 50 chez TMDB, les 366 en 16 saisons chez Cinemeta. La 2e saison TMDB devient la 17e,
  // un épisode de plus dans une saison TMDB continue la dernière saison de Cinemeta.
  const d = decoupageCinemeta(tmdb(28, 5), cine(10, 18));
  assert.deepEqual(d.place(1, 28), { season: 2, episode: 18 });
  assert.deepEqual(d.place(2, 1), { season: 3, episode: 1 });
  assert.deepEqual(d.place(2, 5), { season: 3, episode: 5 });
  assert.deepEqual(d.restants, []);
  assert.deepEqual(d.saisons.map((s) => [s.season_number, s.episode_count]), [[0, 3], [1, 10], [2, 18], [3, 5]]);
  const e = decoupageCinemeta(tmdb(30), cine(10, 18));
  assert.deepEqual(e.place(1, 30), { season: 2, episode: 20 });
  assert.deepEqual(e.saisons.map((s) => [s.season_number, s.episode_count]), [[0, 3], [1, 10], [2, 20]]);
});

test("numerotation_continue_de_tmdb", () => {
  // One Piece chez TMDB : 61 épisodes en saison 1, la saison 2 va du 62 au 77.
  const d = decoupageCinemeta(tmdb(61, 16), cine(30, 47));
  assert.deepEqual(d.place(1, 61), { season: 2, episode: 31 });
  assert.deepEqual(d.place(2, 62), { season: 2, episode: 32 });
  assert.deepEqual(d.place(2, 77), { season: 2, episode: 47 });
  // Le dernier, quand TMDB l'a avant Cinemeta.
  const e = decoupageCinemeta(tmdb(61, 16), cine(30, 46));
  assert.deepEqual(e.place(2, 77), { season: 2, episode: 47 });
});

test("fiche_tmdb_recomptee", () => {
  const c = cine(24, 23, 12);
  c.push({ id: "tt1:4:1", season: 4, episode: 1, name: "Episode 1", released: null });
  const brut = { id: 95479, seasons: tmdb(59), number_of_seasons: 1, next_episode_to_air: null,
    last_episode_to_air: { season_number: 1, episode_number: 59, air_date: "2026-03-26", episode_type: "mid_season" } };
  const d = ficheRecomptee(brut, decoupageCinemeta(brut.seasons, c));
  assert.equal(d.number_of_seasons, 4);
  assert.deepEqual(d.last_episode_to_air, { season_number: 3, episode_number: 12, air_date: "2026-03-26", episode_type: undefined });
  assert.equal(d.next_episode_to_air, null);
  assert.equal(brut.seasons.length, 2);   // la fiche d'origine n'est pas touchée
});

test("cinemeta_trop_incomplet_on_garde_tmdb", () => {
  assert.equal(decoupageCinemeta(tmdb(100), cine(10, 10)), null);
});

// Le service des affiches (sur Vercel) a sa copie du découpage (affiches/lib/episodes.js) : elle doit répondre pareil.
test("affiches_meme_decoupage", () => {
  const cas = [[tmdb(59), [...cine(24, 23, 12), { id: "tt1:4:1", season: 4, episode: 1, released: null }]],
    [tmdb(28, 5), cine(10, 18)], [tmdb(30), cine(10, 18)], [tmdb(61, 16), cine(30, 46)], [tmdb(10, 10), cine(10, 10)], [tmdb(100), cine(10, 10)]];
  for (const [saisons, videos] of cas) {
    const a = decoupageCinemeta(saisons, videos), b = decoupageAffiches(saisons, videos);
    assert.equal(!!a, !!b);
    if (!a) continue;
    assert.deepEqual(b.saisons, a.saisons);
    assert.deepEqual(b.restants, a.restants);
    for (const s of saisons) for (let e = 1; e <= s.episode_count + 2; e++) assert.deepEqual(b.place(s.season_number, e), a.place(s.season_number, e));
    assert.deepEqual(b.place(2, 77), a.place(2, 77));
  }
});

// Date du n-ième mardi depuis le 3 mars 2026 (une émission par semaine).
const semaine = (n) => new Date(Date.parse("2026-03-03T00:00:00Z") + n * 7 * 864e5).toISOString().slice(0, 10);

test("koh_lanta_emissions_coupees_en_deux_placees_par_date", () => {
  // Cinemeta : S1 de 16 émissions (une par semaine), S2 de 13 (la 13e pas encore sortie, sans date chez TMDB).
  const c = [
    ...Array.from({ length: 16 }, (_, k) => ({ season: 1, episode: k + 1, released: `${semaine(k)}T21:15:00.000Z` })),
    ...Array.from({ length: 13 }, (_, k) => ({ season: 2, episode: k + 1, released: `${semaine(30 + k)}T21:15:00.000Z` })),
  ];
  // TMDB : chaque émission en deux parties le même jour, 32 + 24.
  const eps = [
    ...Array.from({ length: 32 }, (_, k) => ({ season_number: 1, episode_number: k + 1, air_date: semaine(Math.floor(k / 2)) })),
    ...Array.from({ length: 24 }, (_, k) => ({ season_number: 2, episode_number: k + 1, air_date: semaine(30 + Math.floor(k / 2)) })),
  ];
  const seasons = [{ season_number: 1, episode_count: 32 }, { season_number: 2, episode_count: 24 }];
  assert.equal(comptesDifferents(seasons, c), true);
  const pos = decoupageCinemeta(seasons, c);
  const d = decoupageParDates(seasons, c, eps, pos);
  assert.deepEqual(d.place(1, 1), { season: 1, episode: 1 });
  assert.deepEqual(d.place(1, 2), { season: 1, episode: 1 });
  assert.deepEqual(d.place(1, 32), { season: 1, episode: 16 });
  assert.deepEqual(d.place(2, 15), { season: 2, episode: 8 });
  assert.deepEqual(d.place(2, 24), { season: 2, episode: 12 });
  assert.deepEqual(d.restants.map((v) => v.episode), [13]);
  assert.deepEqual(d.saisons.map((s) => [s.season_number, s.episode_count]), [[1, 16], [2, 13]]);
});

test("par_dates_rien_a_changer_ou_dates_incoherentes", () => {
  const c = Array.from({ length: 10 }, (_, k) => ({ season: 1, episode: k + 1, released: `${semaine(k)}T00:00:00.000Z` }));
  const eps = Array.from({ length: 10 }, (_, k) => ({ season_number: 1, episode_number: k + 1, air_date: semaine(k) }));
  assert.equal(decoupageParDates([{ season_number: 1, episode_count: 10 }], c, eps, null), null);
  // Dates TMDB sans rapport avec Cinemeta : on n'y touche pas.
  const autres = eps.map((e) => ({ ...e, air_date: semaine(e.episode_number + 50) }));
  assert.equal(decoupageParDates([{ season_number: 1, episode_count: 10 }], c, autres, null), null);
});

test("par_dates_sans_parties_on_garde_le_bout_a_bout", () => {
  // Anime en une saison TMDB, dates à un jour près (décalage horaire), aucun épisode coupé : le bout à bout reste.
  const c = [...Array.from({ length: 24 }, (_, k) => ({ season: 1, episode: k + 1, released: `${semaine(k)}T15:00:00.000Z` })),
    ...Array.from({ length: 12 }, (_, k) => ({ season: 2, episode: k + 1, released: `${semaine(40 + k)}T15:00:00.000Z` }))];
  const eps = Array.from({ length: 36 }, (_, k) => ({ season_number: 1, episode_number: k + 1,
    air_date: new Date(Date.parse(`${semaine(k < 24 ? k : 16 + k)}T00:00:00Z`) + 864e5).toISOString().slice(0, 10) }));
  const seasons = [{ season_number: 1, episode_count: 36 }];
  const pos = decoupageCinemeta(seasons, c);
  assert.equal(decoupageParDates(seasons, c, eps, pos), null);
});
