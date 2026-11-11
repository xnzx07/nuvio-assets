import { test } from "node:test";
import assert from "node:assert/strict";
import { sansObscurs } from "../worker/search.js";

// Recherche : les titres obscurs homonymes d'un titre connu partent (« avatar » : le film espagnol de 2006, 60 votes),
// sans jamais vider une recherche. Chiffres TMDB relevés le 2026-11-11.

const TODAY = "2026-11-11";
const film = (title, date, votes, popularity = 1, lang = "en") => ({ title, release_date: date, vote_count: votes, popularity, original_language: lang });
const noms = (l) => l.map((it) => it.title);

const AVATAR = [
  film("Avatar", "2009-12-16", 35005, 25.3),
  film("Avatar : De feu et de cendres", "2025-12-17", 4673, 42.5),
  film("Avatar", "2006-04-11", 60, 0.6, "es"),
  film("Avatar 4", "2029-12-19", 0, 2.7),
  film("Avatar", "1964-07-22", 0, 0.7, "fr"),
  film("नरसिंहा Avatar", "2025-05-23", 0, 1.2, "ne"),
  film("Capturing Avatar", "2010-11-16", 113, 0.9),
  film("Avatar", "1916-03-06", 18, 0.3, "it"),
];

test("« avatar » : les homonymes obscurs partent, les connus et le prochain restent", () => {
  assert.deepEqual(noms(sansObscurs(AVATAR, "avatar", TODAY)),
    ["Avatar", "Avatar : De feu et de cendres", "Avatar 4", "Capturing Avatar"]);
});

test("aucun titre connu de ce nom : rien ne part (« ichigo » : Ichigo 100%, 17 votes ; « avatar 2006 »)", () => {
  const l = [film("Ichigo 100%", "2005-04-06", 17, 3, "ja"), film("Ichigo", "1999-01-01", 2, 0.1, "ja")];
  assert.deepEqual(sansObscurs(l, "ichigo", TODAY), l);
  assert.equal(sansObscurs(AVATAR, "avatar 2006", TODAY).filter((it) => it.release_date.startsWith("2006")).length, 1);
});

test("un titre français un peu noté reste, pas un titre français sans aucun vote", () => {
  const l = [film("Kaamelott", "2005-01-03", 5000), film("Kaamelott : Premier Volet", "2021-07-21", 40, 1, "fr"), film("Aux sources de Kaamelott", "2006-06-14", 1, 0.1, "fr")];
  assert.deepEqual(noms(sansObscurs(l, "kaamelott", TODAY)), ["Kaamelott", "Kaamelott : Premier Volet"]);
});

test("un titre sorti depuis peu, encore peu noté, reste s'il fait parler", () => {
  const l = [film("The Bear", "2022-06-23", 2038), film("I Kill the Bear", "2026-11-06", 1, 5.3), film("Little Bear", "2026-03-01", 2, 0.2)];
  assert.deepEqual(noms(sansObscurs(l, "the bear", TODAY)), ["The Bear", "I Kill the Bear"]);
});

test("tous obscurs : rien n'est retiré ; sans nombre de votes : gardé", () => {
  const obscurs = [film("Zorglub", "1971-01-01", 3), film("Zorglub 2", "1973-01-01", 0)];
  assert.deepEqual(sansObscurs(obscurs, "zorglub", TODAY), obscurs);
  const sansVotes = [film("Connu", "2000-01-01", 900), { title: "Trouvé par l'IA", release_date: "1990-01-01" }, film("Obscur", "1990-01-01", 4)];
  assert.deepEqual(noms(sansObscurs(sansVotes, "connu", TODAY)),["Connu", "Trouvé par l'IA"]);
});
