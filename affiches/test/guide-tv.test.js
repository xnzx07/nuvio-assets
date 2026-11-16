import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { creerGuide, dateXmltv, lireGuide } from "../lib/guide-tv.js";

// 15 nov. 2026 20:00 UTC
const MAINTENANT = Date.UTC(2026, 10, 15, 20, 0, 0) / 1000;
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="TF1.fr"><display-name>TF1</display-name><icon src="x"/></channel>
  <channel id="TF1+1.fr"><display-name>TF1 + 1</display-name></channel>
  <channel id="Vide.fr"><display-name>Vide</display-name></channel>
  <programme start="20261115190000 +0100" stop="20261115200000 +0100" channel="TF1.fr"><title lang="fr">Passé</title></programme>
  <programme start="20261115213000 +0100" stop="20261115230000 +0100" channel="TF1.fr"><title lang="fr">Koh-Lanta</title><desc lang="fr">${"x".repeat(700)}</desc></programme>
  <programme start="20261115203000 +0100" stop="20261115213000 +0100" channel="TF1.fr"><title lang="fr">Le Journal &amp; la m&#233;téo</title><desc lang="fr">L&apos;actu</desc></programme>
  <programme start="20261118200000 +0100" stop="20261118210000 +0100" channel="TF1.fr"><title>Trop loin</title></programme>
  <programme start="20261115200000 +0100" stop="20261115220000 +0100" channel="TF1+1.fr"><title>Le Journal</title></programme>
</tv>`;

/** Le XML en morceaux coupés n'importe où (au milieu des balises). */
async function* morceaux(s, taille = 37) {
  const octets = Buffer.from(s, "utf8");
  for (let i = 0; i < octets.length; i += taille) yield octets.subarray(i, i + taille);
}

test("dateXmltv : heure locale avec décalage → secondes Unix", () => {
  assert.equal(dateXmltv("20261115213000 +0100"), Date.UTC(2026, 10, 15, 20, 30) / 1000);
  assert.equal(dateXmltv("20261115213000"), Date.UTC(2026, 10, 15, 21, 30) / 1000);
  assert.equal(dateXmltv("n'importe quoi"), null);
});

test("lireGuide : morceaux coupés, fenêtre de 36 h, entités, résumé coupé, tri", async () => {
  const { chaines, programmes } = await lireGuide(morceaux(XML), { maintenant: MAINTENANT });
  assert.deepEqual(chaines.map((c) => c.id), ["TF1.fr", "TF1+1.fr", "Vide.fr"]);
  assert.equal(chaines[1].name, "TF1 + 1");
  const tf1 = programmes.get("TF1.fr");
  // « Passé » finit à maintenant − 1 h : écarté ; « Trop loin » commence dans 3 jours : écarté
  assert.deepEqual(tf1.map((p) => p.title), ["Le Journal & la météo", "Koh-Lanta"]);
  assert.equal(tf1[0].description, "L'actu");
  assert.equal(tf1[0].start, MAINTENANT - 1800);
  assert.equal(tf1[1].description.length, 600);
  assert.equal(programmes.get("Vide.fr"), undefined);
});

test("creerGuide : téléchargé, servi, copié sur le disque, relu au démarrage", async () => {
  const dossier = mkdtempSync(join(tmpdir(), "guide-"));
  const disque = join(dossier, "guide.json");
  let appels = 0;
  const fetch = async () => {
    appels++;
    return new Response(gzipSync(Buffer.from(XML)), { status: 200 });
  };
  const horloge = () => MAINTENANT * 1000;
  const g = creerGuide({ fetch, horloge, disque, journal: { log() {}, warn() {} } });
  assert.deepEqual(g.index(), []);
  assert.equal(g.chaine("TF1.fr"), null);
  await g.rafraichir();
  assert.deepEqual(g.index().map((c) => c.id), ["TF1.fr", "TF1+1.fr"]);
  assert.equal(g.chaine("TF1+1.fr")[0].title, "Le Journal");
  assert.ok(JSON.parse(readFileSync(disque, "utf8")).programmes["TF1.fr"]);

  // un autre serveur démarre avec la copie de moins de 24 h : pas de téléchargement
  const g2 = creerGuide({ fetch, horloge, disque, journal: { log() {}, warn() {} } });
  g2.demarrer();
  g2.arreter();
  assert.equal(appels, 1);
  assert.equal(g2.chaine("TF1.fr").length, 2);

  // copie trop vieille : téléchargée
  writeFileSync(disque, JSON.stringify({ t: MAINTENANT * 1000 - 25 * 3600 * 1000, chaines: [], programmes: {} }));
  const g3 = creerGuide({ fetch, horloge, disque, journal: { log() {}, warn() {} } });
  g3.demarrer();
  g3.arreter();
  await g3.rafraichir();
  assert.equal(appels, 2);
});

test("creerGuide : source en erreur, le guide reste vide sans planter", async () => {
  const g = creerGuide({ fetch: async () => new Response("non", { status: 503 }), journal: { log() {}, warn() {} } });
  await g.rafraichir();
  assert.deepEqual(g.index(), []);
});

test("serveur : /guide/index.json et /guide/<id>.json, CORS ouvert, id encodé, inconnu 404", async () => {
  const { creerServeur } = await import("../serveur.js");
  const guide = { index: () => [{ id: "TF1+1.fr", name: "TF1 + 1" }], chaine: (id) => (id === "TF1+1.fr" ? [{ title: "Le Journal", description: "", start: 1, end: 2 }] : null), demarrer() {}, arreter() {} };
  const s = creerServeur({ env: {}, fetchImpl: async () => new Response(null, { status: 404 }), guide });
  const idx = await s.route(new Request("http://x/guide/index.json"));
  assert.equal(idx.status, 200);
  assert.equal(idx.headers.get("access-control-allow-origin"), "*");
  assert.match(idx.headers.get("cache-control"), /max-age=1800/);
  assert.deepEqual(await idx.json(), [{ id: "TF1+1.fr", name: "TF1 + 1" }]);
  const tf1 = await s.route(new Request("http://x/guide/TF1%2B1.fr.json"));
  assert.equal((await tf1.json())[0].title, "Le Journal");
  assert.equal((await s.route(new Request("http://x/guide/Rien.fr.json"))).status, 404);
  const vide = creerServeur({ env: {}, fetchImpl: async () => new Response(null, { status: 404 }), guide: { ...guide, index: () => [] } });
  assert.deepEqual(await (await vide.route(new Request("http://x/guide/index.json"))).json(), []);
});
