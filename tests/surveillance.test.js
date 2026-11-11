import { test } from "node:test";
import assert from "node:assert/strict";
import { decider } from "../scripts/surveiller-oracle.mjs";
import { redirige, serveurPret, SERVEUR_ADDON } from "../worker/construire/redirections.mjs";

const page = (metas = [{ id: "tt1" }]) => Response.json({ metas });
// reponses : ce que dit l'addon (sa redirection), puis le serveur à chaque essai.
function scene({ addon = 307, serveur = [], affiche = 302 }) {
  const appels = { addon: 0, serveur: 0 };
  const fetchImpl = async (u, init = {}) => {
    if (String(u).startsWith(SERVEUR_ADDON + "/maison/")) return new Response("", { status: affiche });
    if (String(u).startsWith(SERVEUR_ADDON)) {
      const r = serveur[Math.min(appels.serveur++, serveur.length - 1)];
      if (r instanceof Error) throw r;
      return typeof r === "number" ? new Response("", { status: r }) : page(r === "vide" ? [] : undefined);
    }
    appels.addon++;
    assert.equal(init.redirect, "manual");
    if (addon instanceof Error) throw addon;
    return new Response(addon === 200 ? "{}" : "", { status: addon });
  };
  return { fetchImpl, appels, attente: async () => {} };
}
const panne = new Error("injoignable");

test("serveur_en_forme_rien_a_faire", async () => {
  const s = scene({ serveur: ["ok"] });
  assert.equal((await decider(s)).action, "rien");
  assert.equal(s.appels.serveur, 1);
});

// Un essai raté de temps en temps (redémarrage après une mise à jour) ne coupe rien.
test("un_echec_isole_ne_coupe_pas", async () => {
  const s = scene({ serveur: [panne, 502, "ok"] });
  assert.equal((await decider(s)).action, "rien");
  assert.equal(s.appels.serveur, 3);
});

// Les catalogues répondent mais plus les affiches : coupé aussi (le Worker « affiches » les renvoie au serveur).
test("affiches_muettes_coupent", async () => {
  const s = scene({ serveur: ["ok"], affiche: 502 });
  assert.equal((await decider(s)).action, "couper");
});

test("trois_echecs_de_suite_coupent", async () => {
  for (const serveur of [[panne], [502], ["vide"]]) {
    const s = scene({ serveur });
    assert.equal((await decider(s)).action, "couper", JSON.stringify(serveur));
    assert.equal(s.appels.serveur, 3);
  }
});

// Déjà coupé : rétabli seulement après cinq réponses de suite, pour ne pas aller et venir.
test("retabli_seulement_apres_cinq_reussites", async () => {
  const bon = scene({ addon: 200, serveur: ["ok"] });
  assert.equal((await decider(bon)).action, "retablir");
  assert.equal(bon.appels.serveur, 5);
  const fragile = scene({ addon: 200, serveur: ["ok", "ok", "ok", panne] });
  assert.equal((await decider(fragile)).action, "rien");
  assert.equal(fragile.appels.serveur, 4);
});

// L'addon lui-même ne répond pas clairement (déploiement en cours, Cloudflare en panne) : on ne touche à rien.
test("etat_de_l_addon_inconnu_rien", async () => {
  for (const addon of [500, 404, panne]) {
    const s = scene({ addon, serveur: [panne] });
    assert.equal((await decider(s)).action, "rien");
    assert.equal(s.appels.serveur, 0);
  }
});

// Bascule retirée à la main dans le code (ACTIF à false) : la surveillance ne la remet pas.
test("bascule_retiree_a_la_main", async () => {
  const s = scene({ addon: 200, serveur: ["ok"] });
  assert.equal((await decider({ ...s, actif: false })).action, "rien");
  assert.equal(s.appels.addon, 0);
});

test("deploiement_coupe_sans_redirections", () => {
  const depot = "https://github.com/xnzx07/nuvio-assets";
  assert.ok(redirige({ commande: "deploy", depot }));
  assert.ok(!redirige({ commande: "deploy", depot, coupe: true }));
});

// Un envoi sur main pendant une panne ne remet pas les redirections (17 h 37, le 2 novembre : une autre mise en ligne les
// avait remises 84 secondes après la coupure).
test("deploiement_sans_redirections_si_le_serveur_ne_repond_pas", async () => {
  const attente = async () => {};
  let appels = 0;
  const ok = async () => { appels++; return page(); };
  assert.equal(await serveurPret({ fetchImpl: ok, attente }), true);
  assert.equal(appels, 1);
  assert.equal(await serveurPret({ fetchImpl: async () => { throw new Error("x"); }, attente }), false);
  assert.equal(await serveurPret({ fetchImpl: async () => new Response("", { status: 502 }), attente }), false);
  assert.equal(await serveurPret({ fetchImpl: async () => page([]), attente }), false);
  // Un redémarrage : le second essai suffit.
  let n = 0;
  assert.equal(await serveurPret({ fetchImpl: async () => (n++ ? page() : new Response("", { status: 502 })), attente }), true);
});
