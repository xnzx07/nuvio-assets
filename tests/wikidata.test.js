import { test } from "node:test";
import assert from "node:assert/strict";
import { wikidataDe } from "../worker/wikidata.js";

// La recherche par nom répond sans liste (Wikidata en limite), celle en plein texte trouve un élément qui ne correspond
// pas : « Cannot read properties of undefined (reading 'some') » faisait croire Wikidata en panne.
test("recherche_par_nom_sans_liste", async (t) => {
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
  t.mock.method(globalThis, "fetch", async (u) => {
    const s = String(u);
    if (s.includes("wbsearchentities")) return Response.json({ error: { code: "maxlag" } });
    if (s.includes("list=search")) return Response.json({ query: { search: [{ title: "Q1" }] } });
    return Response.json({ results: { bindings: [{ item: { value: "http://www.wikidata.org/entity/Q1" }, itemLabel: { value: "Autre chose" } }] } });
  });
  assert.deepEqual(await wikidataDe("mot inconnu"), []);
});

// Wikidata refuse (429) : plus rien pendant une minute, la recherche continue sans lui.
test("pause_apres_refus", async (t) => {
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
  let appels = 0;
  t.mock.method(globalThis, "fetch", async () => { appels++; return new Response("", { status: 429 }); });
  assert.equal(await wikidataDe("un titre"), null);
  const avant = appels;
  assert.equal(await wikidataDe("autre titre"), null);
  assert.equal(appels, avant);
});
