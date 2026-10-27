import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeConfig, contentKey, PROVIDERS, defaults } from "../worker/config.js";

const rows = [{ id: "a", home: true }];
const discover = [];
const seg = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const KEY = "AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q";

test("cle_valide", () => {
  assert.equal(decodeConfig(seg({ k: KEY }), rows, discover).k, KEY);
});

test("cle_avec_espaces", () => {
  assert.equal(decodeConfig(seg({ k: `  ${KEY}\n` }), rows, discover).k, KEY);
});

test("cle_invalide", () => {
  for (const k of ["<script>", 42, "court"]) {
    const cfg = decodeConfig(seg({ k, n: "Mon addon" }), rows, discover);
    assert.equal(cfg.k, "");
    assert.equal(cfg.custom, true);
    assert.equal(cfg.n, "Mon addon");
  }
});

test("sans_config", () => {
  assert.equal(decodeConfig("", rows, discover).k, "");
});

test("cle_hors_cache", () => {
  const cfg = decodeConfig(seg({ k: KEY }), rows, discover);
  assert.ok(!contentKey(cfg).includes(KEY));
});

test("cle_nouveau_format", () => {
  const k = "AQ.Ab8RN6LxYz0123456789abcdefGHIJKLmnopqrstu-_";
  assert.equal(decodeConfig(seg({ k }), rows, discover).k, k);
});

test("cle_caracteres_interdits", () => {
  for (const k of ["AIzaSyA1b2C3d4E5f6G7h8I9 j0K1l2M3n4O5p6Q", "AIzaSyA1b2C3d4E5f6G7h8I9\nj0K1l2M3n4O5p6Q", 'AIzaSyA1b2C3d4E5f6G7h8I9"j0K1l2M3n4O5p6Q'])
    assert.equal(decodeConfig(seg({ k }), rows, discover).k, "");
});

test("jeton_alerte", () => {
  const al = "a".repeat(24);
  const cfg = decodeConfig(seg({ al }), rows, discover);
  assert.equal(cfg.al, al);
  assert.ok(!contentKey(cfg).includes(al));
  assert.equal(decodeConfig(seg({ al: "zz" }), rows, discover).al, "");
  assert.equal(decodeConfig("", rows, discover).al, "");
});

test("ordre_des_tuiles", () => {
  const cfg = decodeConfig(seg({ to: { 2: [3, 0, 3, "x", -1, 1] }, t: { 2: [1] } }), rows, discover);
  assert.deepEqual(cfg.to, { genres: [3, 0, 1] });
  assert.deepEqual(cfg.t, { genres: [1] });
  assert.deepEqual(decodeConfig(seg({ to: [1, 2] }), rows, discover).to, {});
  assert.deepEqual(decodeConfig("", rows, discover).to, {});
});

test("tuiles_marvel_warner_dc_passees_aux_studios", () => {
  // Lien d'avant : Marvel (7) et DC (9) masqués dans les Plateformes, Crunchyroll (10) placé en tête.
  const old = decodeConfig(seg({ t: { 0: [2, 7, 9], 4: [1] }, to: { 0: [10, 8, 0] } }), rows, discover);
  assert.deepEqual(old.t, { "plateformes-streaming": [2], studios: [1, 9, 11] });
  assert.deepEqual(old.to, { "plateformes-streaming": [7, 0] });
  // Seules des tuiles déplacées étaient masquées : plus rien à masquer dans les Plateformes.
  assert.deepEqual(decodeConfig(seg({ t: { 0: [8] } }), rows, discover).t, { studios: [10] });
  // Lien d'après (tv: 1, puis tv: 2) : positions lues telles quelles.
  for (const tv of [1, 2]) {
    const now = decodeConfig(seg({ tv, t: { 0: [7] }, to: { 0: [7, 0] } }), rows, discover);
    assert.deepEqual(now.t, { "plateformes-streaming": [7] });
    assert.deepEqual(now.to, { "plateformes-streaming": [7, 0] });
  }
});

test("anciennes_tuiles_de_sagas_ignorees", () => {
  // Les 24 tuiles de sagas sont devenues 8 thèmes : une ancienne position ne doit masquer aucun thème.
  for (const tv of [undefined, 1]) {
    const old = decodeConfig(seg({ tv, t: { 3: [0, 5, 20], 2: [1] }, to: { 3: [4, 0] } }), rows, discover);
    assert.deepEqual(old.t, { genres: [1] });
    assert.deepEqual(old.to, {});
  }
  // Lien d'après les thèmes (tv: 2) : positions lues telles quelles.
  const now = decodeConfig(seg({ tv: 2, t: { 3: [2] }, to: { 3: [1, 0] } }), rows, discover);
  assert.deepEqual(now.t, { sagas: [2] });
  assert.deepEqual(now.to, { sagas: [1, 0] });
});

test("plateformes_francaises_en_option", () => {
  // TF1+, france.tv, M6+ : en fin de liste (les liens repèrent les plateformes par position), décochées par défaut.
  const ids = PROVIDERS.map((p) => p.id);
  assert.deepEqual(ids.slice(0, 8), ["8", "119", "337", "531", "1899", "350", "381", "283"]);
  assert.deepEqual(PROVIDERS.slice(8).map((p) => [p.id, p.name, p.folder]),
    [["1754", "TF1+", "tf1-plus"], ["2535", "france.tv", "france-tv"], ["147", "M6+", "m6-plus"]]);
  assert.ok(!["1754", "2535", "147"].some((id) => defaults(rows, discover).p.includes(id)));
  assert.ok(decodeConfig(seg({ p: [0, 8] }), rows, discover).p.includes("1754"));
});

test("ordre_des_plateformes_hors_cle_de_cache", () => {
  const rows = [{ id: "a", home: true }];
  const seg = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  assert.equal(contentKey(decodeConfig(seg({ p: [0, 1] }), rows, [])), contentKey(decodeConfig(seg({ p: [1, 0] }), rows, [])));
  assert.deepEqual(decodeConfig(seg({ p: [1, 0] }), rows, []).p, [PROVIDERS[1].id, PROVIDERS[0].id]);
});
