import { test } from "node:test";
import assert from "node:assert/strict";
import { etatKalyo } from "../worker/index.js";

const today = "2026-11-10";
const base = { sansVfConnu: false, vf: false, vfLu: false, vffSur: false, vfq: false, vffLe: "", vo: false, chezSoi: { date: "", vers: false }, today };

test("Kalyo : où en est la VF, sans la phrase de Nuvio", () => {
  // sorti en VO aujourd'hui (Crawlers, Malfaisante) : plus « Aucune date »
  assert.deepEqual(etatKalyo({ ...base, vo: true, chezSoi: { date: today, vers: false } }), { etat: "vo", date: today });
  assert.deepEqual(etatKalyo({ ...base, vf: true, vfLu: true, chezSoi: { date: today } }), { etat: "vff", date: today });
  assert.deepEqual(etatKalyo({ ...base, vf: true, chezSoi: { date: "2026-11-06" } }), { etat: "vf", date: "2026-11-06" });
  assert.deepEqual(etatKalyo({ ...base, vf: true, vfLu: true, vfq: true, vffLe: "2026-11-15" }), { etat: "vfq", date: "2026-11-15" });
  assert.deepEqual(etatKalyo({ ...base, chezSoi: { date: "2026-11-12", vers: false } }), { etat: "bientot", date: "2026-11-12" });
  assert.deepEqual(etatKalyo({ ...base, chezSoi: { date: "2026-11-22", vers: true } }), { etat: "bientot", date: "2026-11-22", estime: true });
  assert.deepEqual(etatKalyo(base), { etat: "inconnu" });
  assert.deepEqual(etatKalyo({ ...base, sansVfConnu: true, vo: true }), { etat: "sansvf" });
});
