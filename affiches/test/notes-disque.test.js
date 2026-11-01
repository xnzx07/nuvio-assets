import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { creerNotesDisque } from "../lib/notes-disque.js";

const JOUR = 86400 * 1000, NOTES = { rt: 94, mc: 81, lb: 4.1 }, VIDES = { rt: null, mc: null, lb: null };

function dossier(t) {
  const d = mkdtempSync(join(tmpdir(), "notes-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return join(d, "notes.json");
}

test("notes_relues_apres_un_redemarrage", (t) => {
  const chemin = dossier(t);
  const a = creerNotesDisque({ chemin });
  a.ecrire("tt1", NOTES);
  a.sauver();
  assert.deepEqual(creerNotesDisque({ chemin }).lire("tt1"), NOTES);
  assert.equal(creerNotesDisque({ chemin }).lire("tt2"), null);
});

// 14 jours : une note change peu, et 1 000 lectures par jour tiennent 14 000 titres ; sans note, 7 jours.
test("notes_perimees", (t) => {
  let now = 1000000;
  const g = creerNotesDisque({ chemin: dossier(t), horloge: () => now });
  g.ecrire("tt1", NOTES);
  g.ecrire("tt2", VIDES);
  now += 7 * JOUR - 1;
  assert.deepEqual(g.lire("tt2"), VIDES);
  now += 2;
  assert.equal(g.lire("tt2"), null);
  now += 7 * JOUR - 2;
  assert.deepEqual(g.lire("tt1"), NOTES);
  now += 2;
  assert.equal(g.lire("tt1"), null);
});

test("fichier_abime_ou_absent_ne_bloque_rien", (t) => {
  const chemin = dossier(t);
  assert.equal(creerNotesDisque({ chemin }).lire("tt1"), null);
  writeFileSync(chemin, "{pas du json");
  const g = creerNotesDisque({ chemin });
  assert.equal(g.lire("tt1"), null);
  g.ecrire("tt1", NOTES);
  g.sauver();
  assert.deepEqual(creerNotesDisque({ chemin }).lire("tt1"), NOTES);
});

// Disque en lecture seule (service mal réglé) : un avertissement, le serveur continue.
test("ecriture_impossible_sans_erreur", (t) => {
  t.mock.method(console, "warn", () => {});
  const g = creerNotesDisque({ chemin: join(dossier(t), "absent", "notes.json") });
  g.ecrire("tt1", NOTES);
  assert.doesNotThrow(() => g.sauver());
  assert.deepEqual(g.lire("tt1"), NOTES);
});
