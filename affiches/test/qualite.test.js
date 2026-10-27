import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { parseQuality, qualityOf, resetMemo, tailleMemo, avecStreamFusion } from "../lib/qualite.js";

beforeEach(() => resetMemo());

test("4K DV : DV passe avant HDR", () => {
  assert.deepEqual(parseQuality([{ name: "Torrentio\n4k DV | HDR" }, { name: "Torrentio\n1080p" }]), { uhd: true, extra: "DV", fhd: true, hdr10p: false, atmos: false, vf: false, sources: 2, langue: "vo" });
});

test("4K HDR", () => {
  assert.deepEqual(parseQuality([{ name: "Torrentio\n4k HDR10+" }]), { uhd: true, extra: "HDR", fhd: false, hdr10p: true, atmos: false, vf: false, sources: 1, langue: "vo" });
});

test("4K seul", () => {
  assert.deepEqual(parseQuality([{ title: "Film.2024.2160p.WEB-DL.mkv" }]), { uhd: true, extra: null, fhd: false, hdr10p: false, atmos: false, vf: false, sources: 1, langue: "vo" });
});

test("HDR hors 4K ignoré", () => {
  assert.deepEqual(parseQuality([{ name: "Torrentio\n1080p HDR" }]), { uhd: false, extra: null, fhd: true, hdr10p: false, atmos: false, vf: false, sources: 1, langue: "vo" });
  assert.deepEqual(parseQuality([]), { uhd: false, extra: null, fhd: false, hdr10p: false, atmos: false, vf: false, sources: 0, langue: null });
});

// Filmé en salle (CAM, TS, TC) : pas une sortie. Tombé du ciel, au cinéma : ses quatre flux « FRENCH CAM » ne font ni
// VF ni sources (la fiche disait « Déjà dispo »). Le film « Cam » (2018) en sortie WEB reste un vrai flux.
test("flux filmés en salle ignorés", () => {
  const vide = { uhd: false, extra: null, fhd: false, hdr10p: false, atmos: false, vf: false, sources: 0, langue: null };
  assert.deepEqual(parseQuality([
    { name: "Torrentio\nCAM", title: "Tombe Du Ciel 2026.1080p FRENCH CAM x264-FS mkv\n👤 6 💾 2.88 GB ⚙️ TorrentGalaxy\n🇫🇷" },
    { name: "Torrentio\nCAM", title: "Tombe du Ciel 2026 FRENCH HDCAM x264-FS mkv" },
    { name: "Torrentio\nTeleSync", title: "Film 2026 FRENCH 720p" },
    { name: "Torrentio\n1080p", title: "Film.2026.FRENCH.HDTS.x264" },
    { name: "Torrentio\n720p", title: "Film.2026.TRUEFRENCH.TC.XviD" },
  ]), vide);
  assert.equal(parseQuality([{ name: "Torrentio\n1080p", title: "Cam.2018.MULTi.VFF.1080p.WEB.x264" }]).vf, true);
  const q = parseQuality([{ name: "Torrentio\nCAM", title: "Film 2026 FRENCH CAM" }, { name: "Torrentio\n1080p", title: "Film.2026.VOSTFR.1080p.WEB" }]);
  assert.deepEqual([q.vf, q.sources, q.langue], [false, 1, "vostfr"]);
});

const reponse = (streams) => async () => new Response(JSON.stringify({ streams }));

test("URL film", async () => {
  const calls = [];
  const f = async (u) => { calls.push(String(u)); return reponse([{ name: "4k" }])(); };
  assert.deepEqual(await qualityOf("movie", "tt1", null, f), { uhd: true, extra: null, fhd: false, hdr10p: false, atmos: false, vf: false, sources: 1, langue: "vo" });
  assert.equal(calls[0], "https://torrentio.strem.fun/language=french/stream/movie/tt1.json");
});

test("URL série : premier épisode de la dernière saison", async () => {
  const calls = [];
  const f = async (u) => { calls.push(String(u)); return reponse([])(); };
  await qualityOf("series", "tt2", 3, f);
  await qualityOf("series", "tt3", null, f);
  assert.equal(calls[0], "https://torrentio.strem.fun/language=french/stream/series/tt2:3:1.json");
  assert.equal(calls[1], "https://torrentio.strem.fun/language=french/stream/series/tt3:1:1.json");
});

test("sans IMDb : null sans appel", async () => {
  let n = 0;
  assert.equal(await qualityOf("movie", null, null, async () => { n++; }), null);
  assert.equal(n, 0);
});

test("délai : null en 2,5 s au plus", async () => {
  const f = (u, opts) => new Promise((_, reject) => opts.signal.addEventListener("abort", () => reject(opts.signal.reason)));
  // Le minuteur d'AbortSignal.timeout ne garde pas Node en vie (une vraie connexion, si) : sans celui-ci,
  // Node 22 croit le test fini et annule toute la suite.
  const garde = setTimeout(() => {}, 5000);
  const t0 = Date.now();
  try {
    assert.equal(await qualityOf("movie", "tt9", null, f), null);
  } finally { clearTimeout(garde); }
  assert.ok(Date.now() - t0 <= 3000, `trop long : ${Date.now() - t0} ms`);
});

test("erreur HTTP : null", async () => {
  assert.equal(await qualityOf("movie", "tt8", null, async () => new Response("non", { status: 403 })), null);
});

// Avec un relais (le service lui-même, derrière le cache de Vercel), la qualité lue par une instance
// resservira à toutes les autres : on la demande au relais, pas à Torrentio.
test("relais : qualité lue via le cache partagé", async () => {
  const calls = [];
  const f = async (u) => { calls.push(String(u)); return new Response(JSON.stringify({ uhd: true, extra: "HDR" })); };
  assert.deepEqual(await qualityOf("series", "tt2", 3, f, "https://affiches.test"), { uhd: true, extra: "HDR", fhd: false, hdr10p: false, atmos: false, vf: null, sources: null, langue: null });
  assert.deepEqual(calls, ["https://affiches.test/qualite/series/tt2:3:1.json?v=3"]);
});

// Qualité v2 : 1080p (quand il n'y a pas de 4K), HDR10+ (en 4K) et Dolby Atmos (toute résolution).
test("qualite_v2", async () => {
  assert.deepEqual(parseQuality([{ name: "Torrentio\n4k", title: "Film 2160p HDR10+ DDP5.1 Atmos" }, { name: "Torrentio\n1080p" }]), { uhd: true, extra: "HDR", fhd: true, hdr10p: true, atmos: true, vf: false, sources: 2, langue: "vo" });
  assert.deepEqual(parseQuality([{ name: "Torrentio\n1080p", title: "Film.1080p.TrueHD.Atmos" }]), { uhd: false, extra: null, fhd: true, hdr10p: false, atmos: true, vf: false, sources: 1, langue: "vo" });
  // HDR10+ hors 4K ne compte pas.
  assert.equal(parseQuality([{ name: "1080p HDR10+" }]).hdr10p, false);
  // Relais au nouveau format : les champs suivent ; ancien format (gardé au CDN) : false.
  const neuf = async () => new Response(JSON.stringify({ uhd: false, extra: null, fhd: true, hdr10p: false, atmos: true }));
  assert.deepEqual(await qualityOf("movie", "tt8", null, neuf, "https://affiches.test"), { uhd: false, extra: null, fhd: true, hdr10p: false, atmos: true, vf: null, sources: null, langue: null });
});

test("relais en panne : null", async () => {
  assert.equal(await qualityOf("movie", "tt7", null, async () => new Response("", { status: 503 }), "https://affiches.test"), null);
});

test("mémoire plafonnée : les plus anciennes sortent", async () => {
  const f = async () => reponse([])();
  for (let i = 0; i < 5005; i++) await qualityOf("movie", "tt" + (100000 + i), null, f);
  assert.ok(tailleMemo() <= 5000, `taille ${tailleMemo()}`);
});

test("mémoire : un seul appel par titre", async () => {
  let n = 0;
  const f = async () => { n++; return reponse([{ name: "4k DV" }])(); };
  await qualityOf("movie", "tt5", null, f);
  assert.deepEqual(await qualityOf("movie", "tt5", null, f), { uhd: true, extra: "DV", fhd: false, hdr10p: false, atmos: false, vf: false, sources: 1, langue: "vo" });
  assert.equal(n, 1);
});

// VF dans le nom d'un flux (TRUEFRENCH, FRENCH, VFF…, pas la VFQ seule, ou « Multi Audio » avec le drapeau français) ; les
// drapeaux seuls ne comptent pas (une sortie WEB-DL en affiche quinze, surtout pour ses sous-titres).
test("vf_dans_les_sources", () => {
  const vf = (...titres) => parseQuality(titres.map((title) => ({ name: "Torrentio\n1080p", title }))).vf;
  assert.equal(vf("Bad Apples MULTI TRUEFRENCH ULTRA HD 4K x265 2026"), true);
  assert.equal(vf("Bad.Apples.2025.MULTi.VFF.2160p.WEB.H265.mkv"), true);
  assert.equal(vf("Film.2026.FRENCH.1080p.WEB.x264"), true);
  assert.equal(vf("Film.2026.VFQ.1080p.WEB"), false);   // québécoise : pas la VF de France
  assert.equal(vf("Film 2026 1080p WEBRip\n👤 5 ⚙️ EXT\nMulti Audio / 🇬🇧 / 🇫🇷"), true);
  assert.equal(vf("Film 2026 1080p AMZN WEB-DL DDP5 1 H 264\n🇬🇧 / 🇯🇵 / 🇫🇷 / 🇩🇪"), false);
  assert.equal(vf("Film.2026.1080p.WEBRip\nMulti Audio / 🇬🇧 / 🇪🇸"), false);
  assert.equal(vf("Frenchie.2026.1080p"), false);
  assert.equal(parseQuality([]).sources, 0);
  assert.equal(parseQuality([{ name: "a" }, { name: "b" }]).sources, 2);
});

// Langue des sources (badge « Langue ») : MULTI avec la VF, VF seule, VOSTFR, sinon VO ; toujours d'accord avec vf.
test("langue_des_sources", () => {
  const langue = (...titres) => parseQuality(titres.map((title) => ({ name: "Torrentio\n1080p", title }))).langue;
  assert.equal(langue("Bad.Apples.2025.MULTi.VFF.2160p.WEB.H265.mkv", "Film.2025.FRENCH.1080p"), "multi");
  assert.equal(langue("Film 2026 1080p WEBRip\nMulti Audio / 🇬🇧 / 🇫🇷"), "multi");
  assert.equal(langue("Film.2026.TRUEFRENCH.1080p.WEB", "Film.2026.1080p.VOSTFR"), "vf");
  for (const t of ["FRENCH", "VFF", "VFI", "VF2", "TRUEFRENCH"]) assert.equal(langue(`Film.2026.${t}.1080p`), "vf", t);
  assert.equal(langue("Film.2026.1080p.VOSTFR.WEB", "Film.2026.1080p.WEB"), "vostfr");
  assert.equal(langue("Film.2026.SUBFRENCH.1080p"), "vostfr");
  // MULTI sans la VF (« Multi Audio » espagnol), drapeaux seuls : de la VO.
  assert.equal(langue("Film.2026.1080p.WEBRip\nMulti Audio / 🇬🇧 / 🇪🇸", "Film.2026.MULTI.1080p"), "vo");
  assert.equal(langue("Film 2026 1080p AMZN WEB-DL\n🇬🇧 / 🇯🇵 / 🇫🇷"), "vo");
  assert.equal(parseQuality([]).langue, null);
  for (const t of ["Film.MULTi.VFF.1080p", "Film.FRENCH.1080p", "Film.VOSTFR.1080p", "Film.1080p"]) {
    const q = parseQuality([{ title: t }]);
    assert.equal(q.vf, ["multi", "vf"].includes(q.langue), t);
  }
});

test("relais_avec_la_langue", async () => {
  const f = async () => new Response(JSON.stringify({ uhd: false, extra: null, fhd: true, hdr10p: false, atmos: false, vf: true, sources: 3, langue: "multi" }));
  assert.equal((await qualityOf("movie", "tt11", null, f, "https://affiches.test")).langue, "multi");
  // Valeur inconnue : pas de langue.
  const g = async () => new Response(JSON.stringify({ uhd: false, extra: null, vf: false, sources: 3, langue: "klingon" }));
  assert.equal((await qualityOf("movie", "tt12", null, g, "https://affiches.test")).langue, null);
});

test("relais_v3_avec_la_vf", async () => {
  const calls = [];
  const f = async (u) => { calls.push(String(u)); return new Response(JSON.stringify({ uhd: false, extra: null, fhd: true, hdr10p: false, atmos: false, vf: true, sources: 12 })); };
  const q = await qualityOf("movie", "tt9", null, f, "https://affiches.test");
  assert.deepEqual([q.vf, q.sources], [true, 12]);
  assert.deepEqual(calls, ["https://affiches.test/qualite/movie/tt9.json?v=3"]);
  // Réponse d'avant (sans vf) : inconnue, pas « sans VF ».
  const ancien = async () => new Response(JSON.stringify({ uhd: true, extra: "HDR" }));
  const a = await qualityOf("movie", "tt10", null, ancien, "https://affiches.test");
  assert.deepEqual([a.vf, a.sources], [null, null]);
});

// Seule la VF de France compte : un flux québécois seul (VFQ, QUÉBEC, FRENCH.VFQ) n'est pas de la VF ; avec une VF de
// France à côté (MULTi.VFF.VFQ, TRUEFRENCH), si.
test("vfq_seule_pas_de_vf", () => {
  const de = (...noms) => parseQuality(noms.map((title) => ({ name: "Torrentio 1080p", title })));
  assert.deepEqual([de("By.Any.Means.2026.MULTi.VFQ.2160p.WEB").vf, de("By.Any.Means.2026.MULTi.VFQ.2160p.WEB").langue], [false, "vo"]);
  assert.equal(de("Film.2026.FRENCH.VFQ.1080p").vf, false);
  assert.equal(de("Film 2026 QUEBEC 1080p WEB").vf, false);
  assert.deepEqual([de("Film.2026.MULTi.VFF.VFQ.1080p").vf, de("Film.2026.MULTi.VFF.VFQ.1080p").langue], [true, "multi"]);
  assert.equal(de("Film.2026.TRUEFRENCH.1080p").vf, true);
  assert.equal(de("Film.2026.MULTi.VFQ.2160p", "Film.2026.FRENCH.720p.WEBRIP").vf, true);
  assert.equal(de("Film.2026.VOSTFR.1080p").langue, "vostfr");
});

// L'avis de StreamFusion corrige Torrentio : la VF et la langue le suivent (VFQ écartée, sites français lus) ; la 4K,
// le DV… ceux de ses sources VF s'il en a, sinon Torrentio ; sans avis, Torrentio tel quel.
test("avec_streamfusion", () => {
  const t = { uhd: true, extra: "HDR", fhd: true, hdr10p: false, atmos: false, vf: true, sources: 30, langue: "multi" };
  assert.equal(avecStreamFusion(t, null), t);
  assert.deepEqual(avecStreamFusion(t, { vf: false, sources: 11 }), { ...t, vf: false, sources: 30, langue: "vo" });
  assert.deepEqual(avecStreamFusion({ ...t, vf: false, langue: "vostfr" }, { vf: true, sources: 4, qualite: { u: 1, x: "DV", p: 1, f: 1, a: 1 } }),
    { ...t, uhd: true, extra: "DV", hdr10p: true, fhd: true, atmos: true, vf: true, sources: 30, langue: "vf" });
  assert.deepEqual(avecStreamFusion(null, { vf: true, sources: 2 }), { uhd: false, extra: null, fhd: false, hdr10p: false, atmos: false, vf: true, sources: 2, langue: "vf" });
});

// Le relais ne répond pas (Vercel en pause) : la qualité de la nuit, lue par la machine GitHub (secours du serveur des
// affiches) ; le relais répond : il passe devant ; sans secours posé : null, comme avant.
test("qualite_secours_quand_le_relais_ne_repond_pas", async () => {
  const { qualityOf, definirSecours, resetMemo } = await import("../lib/qualite.js");
  const nuit = { uhd: true, extra: "DV", fhd: false, hdr10p: false, atmos: false, vf: true, sources: 12, langue: "multi" };
  try {
    resetMemo();
    definirSecours(async (video) => (video === "movie/tt8888888" ? nuit : null));
    assert.deepEqual(await qualityOf("movie", "tt8888888", null, async () => new Response("", { status: 500 }), "https://relais.test", "k"), nuit);
    resetMemo();
    const direct = { uhd: false, extra: null, fhd: true, hdr10p: false, atmos: false, vf: false, sources: 4, langue: "vo" };
    assert.equal((await qualityOf("movie", "tt8888888", null, async () => Response.json(direct), "https://relais.test", "k")).vf, false);
    resetMemo();
    definirSecours(null);
    assert.equal(await qualityOf("movie", "tt8888888", null, async () => new Response("", { status: 500 }), "https://relais.test", "k"), null);
  } finally {
    definirSecours(null);
    resetMemo();
  }
});

// VF sûre (vff) : un fichier TRUEFRENCH, VFF, VFI ou VF2 ; avec la qualité de ses seules sources VF (vfq, comme l'avis de
// l'addon). L'addon ne demande alors rien à Lumio ni à StreamFusion (le compte AllDebrid de la personne). FRENCH seul
// n'est pas sûr : By Any Means, en VFQ seulement, était nommé « FRENCH ».
test("VF sûre : vff et la qualité des sources VF", () => {
  const q = parseQuality([
    { name: "Torrentio\n4k DV", title: "Film.2026.2160p.WEB.DV.mkv" },
    { name: "Torrentio\n1080p", title: "Film.2026.MULTi.VFF.1080p.WEB.Atmos.mkv" },
  ]);
  assert.equal(q.vff, true);
  assert.deepEqual(q.vfq, { u: 0, x: null, p: 0, f: 1, a: 1 });
  assert.equal(q.uhd, true, "la qualité de toutes les sources ne change pas");
  const douteux = parseQuality([{ name: "Torrentio\n1080p", title: "Film.2026.FRENCH.1080p.WEB.mkv" }]);
  assert.equal(douteux.vf, true);
  assert.equal(douteux.vff, undefined);
  assert.equal(douteux.vfq, undefined);
});
