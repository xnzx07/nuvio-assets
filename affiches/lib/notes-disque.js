/**
 * Les notes lues chez MDBList, gardées sur le disque du serveur des affiches (sur Vercel, c'est son CDN, 7 jours). Sans
 * elles, le serveur relit chaque jour les mêmes titres : les 1 000 lectures par jour de la clé gratuite partaient dans
 * les premières heures, le 1er novembre 2026, et les autres affiches restaient sans leurs notes.
 * 14 jours (1 000 lectures par jour tiennent 14 000 titres) ; 7 pour un titre sans note, qui peut en avoir bientôt.
 */
import { readFileSync, writeFileSync, renameSync } from "node:fs";

const JOUR = 86400 * 1000, GARDE = 14 * JOUR, GARDE_SANS_NOTE = 7 * JOUR;
const aDesNotes = (n) => Object.values(n).some((v) => v !== null);

export function creerNotesDisque({ chemin, horloge = Date.now }) {
  let entrees = new Map(), change = false;
  try { entrees = new Map(Object.entries(JSON.parse(readFileSync(chemin, "utf8")))); } catch { /* pas encore là, ou abîmé : on repart de zéro */ }
  return {
    /** { rt, mc, lb } encore valables, ou null. */
    lire(imdb) {
      const e = entrees.get(imdb);
      if (!e) return null;
      if (horloge() - e.lu < (aDesNotes(e.notes) ? GARDE : GARDE_SANS_NOTE)) return e.notes;
      entrees.delete(imdb);
      change = true;
      return null;
    },
    ecrire(imdb, notes) { entrees.set(imdb, { notes, lu: horloge() }); change = true; },
    /** Écrit le fichier si quelque chose a changé ; un échec n'arrête rien (les notes restent en mémoire). */
    sauver() {
      if (!change) return;
      try {
        writeFileSync(chemin + ".tmp", JSON.stringify(Object.fromEntries(entrees)));
        renameSync(chemin + ".tmp", chemin);
        change = false;
      } catch (e) { console.warn(`notes sur le disque : ${e.message}`); }
    },
  };
}
