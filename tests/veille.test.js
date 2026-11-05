import { test } from "node:test";
import assert from "node:assert/strict";
import { comparer, versionsPages, versionNuvio, versionApercu, SOURCES, NUVIO_RELEASES } from "../scripts/veille.mjs";

const PAGES = { torrentio: "0.0.15", streamfusion: "3.3.4", wastream: "3.10.1", lumio: "1792938724" };

test("premier_passage_garde_les_versions_sans_prevenir", () => {
  const { garde, issues } = comparer({}, PAGES, "1.1.0-beta.7", "1.1.0-beta.7");
  assert.deepEqual(garde, { ...PAGES, nuvio: "1.1.0-beta.7" });
  assert.deepEqual(issues, { nuvio: null, pages: [] });
});

test("nouvelle_version_d_une_page_de_reglage", () => {
  const { garde, issues } = comparer(PAGES, { ...PAGES, torrentio: "0.0.16" }, null, null);
  assert.equal(garde.torrentio, "0.0.16");
  assert.equal(issues.pages.length, 1);
  assert.equal(issues.pages[0].titre, "Veille : Torrentio passe en 0.0.16");
  assert.match(issues.pages[0].corps, /0\.0\.15 à 0\.0\.16/);
});

test("page_illisible_garde_l_ancienne_version_sans_prevenir", () => {
  const { garde, issues } = comparer(PAGES, { ...PAGES, lumio: null }, null, null);
  assert.equal(garde.lumio, "1792938724");
  assert.deepEqual(issues.pages, []);
});

test("apercu_en_retard_sur_nuvio_tv", () => {
  const { issues } = comparer(PAGES, PAGES, "1.1.0-beta.10", "1.1.0-beta.7");
  assert.equal(issues.nuvio.titre, "Veille : Nuvio TV 1.1.0-beta.10 (l'aperçu copie 1.1.0-beta.7)");
  assert.equal(comparer(PAGES, PAGES, "1.1.0-beta.10", "1.1.0-beta.10").issues.nuvio, null);
  // GitHub muet : rien à dire, rien d'effacé.
  const muet = comparer({ ...PAGES, nuvio: "1.1.0-beta.9" }, PAGES, null, "1.1.0-beta.7");
  assert.equal(muet.issues.nuvio, null);
  assert.equal(muet.garde.nuvio, "1.1.0-beta.9");
});

test("versions_lues_dans_chaque_page", async () => {
  const corps = {
    "https://torrentio.strem.fun/manifest.json": '{"id":"com.stremio.torrentio.addon","version":"0.0.15"}',
    "https://streamfusion.stremio-epsilon.ca/manifest.json": '{"version": "3.3.4"}',
    "https://wastream.noplay.fr/configure": "<footer>WAStream v3.10.1</footer>",
    "https://mylumio.tv/configure": '<script src="/static/configure.js?v=1792938724"></script>',
  };
  assert.equal(SOURCES.length, Object.keys(corps).length);
  const f = async (u) => (u in corps ? new Response(corps[u]) : new Response("", { status: 404 }));
  assert.deepEqual(await versionsPages(f), PAGES);
  // Panne ou page refaite : null, sans erreur.
  const panne = await versionsPages(async () => { throw new Error("réseau"); });
  assert.deepEqual(panne, { torrentio: null, streamfusion: null, wastream: null, lumio: null });
});

test("nuvio_tv_pre_versions_comprises_brouillons_exclus", async () => {
  let entetes;
  const f = async (u, init) => {
    assert.equal(u, NUVIO_RELEASES);
    entetes = init.headers;
    return Response.json([{ tag_name: "v1.2.0", draft: true }, { tag_name: "1.1.0-beta.10", prerelease: true }, { tag_name: "1.0.0" }]);
  };
  assert.equal(await versionNuvio(f, "jeton"), "1.1.0-beta.10");
  assert.equal(entetes.Authorization, "Bearer jeton");
  assert.equal(await versionNuvio(async () => new Response("", { status: 403 }), null), null);
});

test("version_recopiee_par_l_apercu", () => {
  assert.equal(versionApercu('export const NUVIO_TV_VERSION = "1.1.0-beta.7";'), "1.1.0-beta.7");
  assert.match(versionApercu(), /^\d+\.\d+\.\d+/);   // le vrai worker/nuvio.js
});
