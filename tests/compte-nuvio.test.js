import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fusionCollections, fusionAddons, avecAffiches, avecAffichesAppli, compteNuvioPage, associerProfils } from "../worker/compte-nuvio.js";

test("fusion_garde_les_collections_perso", () => {
  // Nuvio remplace toute sa liste par celle du compte : celles de la personne restent, les nôtres sont remplacées.
  const distantes = [{ id: "genres", title: "Genres (ancienne)" }, { id: "a-moi", title: "Mes films" }, { id: "studios" }];
  const nos = [{ id: "plateformes-streaming" }, { id: "genres", title: "Genres" }];
  const ids = ["plateformes-streaming", "genres", "studios"];   // studios : masquée depuis, retirée quand même
  assert.deepEqual(fusionCollections(distantes, nos, ids).map((c) => c.title || c.id),
    ["plateformes-streaming", "Genres", "Mes films"]);
});

test("fusion_compte_vide", () => {
  assert.deepEqual(fusionCollections(null, [{ id: "x" }], ["x"]), [{ id: "x" }]);
  assert.deepEqual(fusionCollections([], [{ id: "x" }], []), [{ id: "x" }]);
});

const O = "https://exemple.workers.dev";

test("fusion_addons_remplace_le_notre_a_sa_place", () => {
  // Nuvio remplace toute sa liste : les addons de la personne restent dans leur ordre, le nôtre prend le nouveau lien.
  const distants = [
    { url: "https://torrentio.strem.fun/manifest.json", sort_order: 1, enabled: true },
    { url: O + "/ancien/manifest.json", sort_order: 0, enabled: false, name: "Catalogue FR" },
    { url: "https://opensubtitles-v3.strem.io/manifest.json", sort_order: 2, enabled: false },
    { url: O + "/doublon/manifest.json", sort_order: 3, enabled: true },
  ];
  assert.deepEqual(fusionAddons(distants, O + "/fNouveau/manifest.json", O), [
    { url: O + "/fNouveau/manifest.json", sort_order: 0, enabled: true, name: "Catalogue FR" },
    { url: "https://torrentio.strem.fun/manifest.json", sort_order: 1, enabled: true },
    { url: "https://opensubtitles-v3.strem.io/manifest.json", sort_order: 2, enabled: false },
  ]);
});

test("fusion_addons_sans_le_notre_en_tete", () => {
  assert.deepEqual(fusionAddons([{ url: "https://torrentio.strem.fun/manifest.json", sort_order: 0, enabled: true }], O + "/manifest.json", O),
    [{ url: O + "/manifest.json", sort_order: 0, enabled: true }, { url: "https://torrentio.strem.fun/manifest.json", sort_order: 1, enabled: true }]);
  assert.deepEqual(fusionAddons(null, O + "/manifest.json", O), [{ url: O + "/manifest.json", sort_order: 0, enabled: true }]);
});

test("affiches_dans_les_reglages_tv", () => {
  const lien = "https://affiches.exemple/maison/{type}/{shape}/{id}.jpg";
  const avant = { version: 1, features: { theme_settings: { t: { type: "string", value: "x" } },
    layout_settings: { poster_shape: { type: "string", value: "l" }, custom_poster_url_pattern: { type: "string", value: "ancien" } } } };
  const apres = avecAffiches(avant, lien);
  // Tout le reste est renvoyé tel quel : Nuvio efface chaque rubrique reçue avant de l'appliquer.
  assert.deepEqual(apres.features.theme_settings, avant.features.theme_settings);
  assert.deepEqual(apres.features.layout_settings.poster_shape, { type: "string", value: "l" });
  assert.deepEqual(apres.features.layout_settings.custom_poster_url_pattern, { type: "string", value: lien });
  assert.equal(avant.features.layout_settings.custom_poster_url_pattern.value, "ancien");   // pas modifié en place
  // Pas de réglages TV dans le compte : rien (en créer effacerait ceux de la TV).
  assert.equal(avecAffiches(null, lien), null);
  assert.equal(avecAffiches({}, lien), null);
});

test("page_compte_nuvio_script_valide", () => {
  const html = compteNuvioPage({ origin: "https://exemple.workers.dev" });
  const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(js.length, 1);
  assert.doesNotThrow(() => new Function(js[0]));
  // La session reste dans le navigateur : aucun appel vers ce site avec les jetons, seulement vers Nuvio.
  assert.ok(html.includes("https://api.nuvio.tv/.well-known/nuvio"));
  assert.ok(html.includes("https://nuvio.tv/link"));
  // Lien d'addon repris de la salle 2 (dernière programmation), jamais sans la clé Gemini gardée.
  assert.ok(html.includes('lu("derniere-programmation")'));
  assert.ok(html.includes('lu("cle-gemini")'));
  assert.match(html, /<meta name="robots" content="noindex">/);
});

test("bouton_tout_envoyer_billet_et_guide", async () => {
  // Le billet et l'étape 7 ouvrent la page avec leurs liens dans l'ancre (jamais envoyée au serveur).
  const { SALLE2_JS } = await import("../worker/page.js");
  const { GUIDE_JS, guidePage } = await import("../worker/guide.js");
  assert.match(SALLE2_JS, /"[/]compte-nuvio#" \+ new URLSearchParams\(\{ lien: \$\("u-manifest"\)/);
  assert.match(GUIDE_JS, /"[/]compte-nuvio#" \+ new URLSearchParams\(\{ lien: \$id\("u-cat"\)/);
  assert.match(guidePage({ origin: O }), /data-compte-nuvio/);
});

test("page_compte_nuvio_remplit_les_liens", () => {
  // Le script tourne comme dans le navigateur. L'outil de Cloudflare ajoute des appels à __name dans les fonctions
  // recopiées telles quelles (fusionAddons…) : on en met un en tête du script ; sans « var __name », il plantait
  // et aucun lien n'était rempli.
  const html = compteNuvioPage({ origin: O });
  const js = /<script>([\s\S]*?)<\/script>/.exec(html)[1].replace("(() => {", "(() => { __name(() => {}, \"essai\");");
  const els = {};
  const el = (id) => els[id] || (els[id] = { id, value: "", hidden: false, textContent: "", className: "", checked: true, dataset: {}, addEventListener() {}, append() {} });
  const lien = O + "/fAbcdefghijklmnop/manifest.json", affiches = "https://affiches.exemple/maison/{type}/{shape}/{id}.jpg";
  vm.runInNewContext(js, { document: { getElementById: el, createElement: () => el(String(Math.random())) },
    location: { hash: "#" + new URLSearchParams({ lien, affiches }), origin: O }, localStorage: { getItem: () => null, setItem() {} },
    URLSearchParams, URL, fetch: () => Promise.reject(new Error("hors ligne")), setTimeout, clearTimeout, crypto: globalThis.crypto });
  assert.equal(els.lien.value, lien);
  assert.equal(els.affiches.value, affiches);
});

// Nuvio PC et téléphone (plateformes « desktop » et « mobile ») : le lien des affiches est un champ texte des réglages
// (custom_poster_url_pattern), pas le format de la TV ; le reste des réglages est gardé.
test("affiches_sur_pc_et_telephone", () => {
  const lien = "https://affiches.example/{type}/{shape}/{id}.jpg?s=x";
  const avant = { version: 4, features: { theme_settings: { a: 1 }, custom_poster_url_pattern: "", custom_poster_enabled_screens: "home" } };
  const apres = avecAffichesAppli(avant, lien);
  assert.equal(apres.features.custom_poster_url_pattern, lien);
  assert.deepEqual(apres.features.theme_settings, { a: 1 });
  assert.equal(apres.features.custom_poster_enabled_screens, "home");
  assert.equal(apres.version, 4);
  // Appareil qui n'a jamais envoyé ses réglages : rien à écrire (un réglage presque vide effacerait les siens).
  assert.equal(avecAffichesAppli(null, lien), null);
  assert.equal(avecAffichesAppli({}, lien), null);
});

test("envoi_des_affiches_aux_trois_appareils", () => {
  const html = compteNuvioPage({ origin: "https://x" });
  assert.match(html, /p_platform: "tv"/);
  assert.ok(html.includes('["desktop", "le PC"]') && html.includes('["mobile", "le téléphone"]'));
  assert.match(html, /const avecAffichesAppli = function avecAffichesAppli/);
});

// Mes profils → profils Nuvio : même nom d'abord (accents et majuscules oubliés), le principal au profil 1 sinon.
test("profils_associes_par_leur_nom", () => {
  const nos = [{ i: "fMoi", n: "Catalogue FR" }, { i: "fLeo", n: "Léo" }, { i: "fEmma", n: "Emma" }];
  const nuvio = [{ profile_index: 1, name: "Enzo" }, { profile_index: 2, name: "leo " }, { profile_index: 3, name: "Invité" }];
  assert.deepEqual(associerProfils(nuvio, nos), ["fMoi", "fLeo", ""]);
  // Le principal porte le nom d'un autre profil Nuvio : il y va, et le profil 1 ne reçoit rien d'office.
  assert.deepEqual(associerProfils([{ profile_index: 1, name: "Papa" }, { profile_index: 2, name: "Catalogue FR" }], nos), ["", "fMoi"]);
  // Deux profils Nuvio du même nom : un seul reçoit le lien.
  assert.deepEqual(associerProfils([{ profile_index: 2, name: "Emma" }, { profile_index: 3, name: "Emma" }], nos), ["fEmma", ""]);
  assert.deepEqual(associerProfils([], nos), []);
});
