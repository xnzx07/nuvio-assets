import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";

// Lance docker/entrypoint.sh avec un faux « wrangler » qui affiche ses arguments (un par ligne), dans un
// dossier d'application et un volume temporaires : renvoie les arguments, le .dev.vars écrit et le volume.
function run(vars) {
  const dir = mkdtempSync(join(tmpdir(), "ep-")), app = mkdtempSync(join(tmpdir(), "app-")), data = mkdtempSync(join(tmpdir(), "data-"));
  writeFileSync(join(dir, "wrangler"), '#!/bin/sh\nfor a in "$@"; do printf "%s\n" "$a"; done\n');
  chmodSync(join(dir, "wrangler"), 0o755);
  const r = spawnSync("sh", ["docker/entrypoint.sh"], { env: { ...process.env, ...vars, APP_DIR: app, DATA_DIR: data, PATH: dir + delimiter + process.env.PATH }, encoding: "utf8" });
  return { args: r.stdout.trim().split(/\r?\n/), devVars: readFileSync(join(app, ".dev.vars"), "utf8"), data, stderr: r.stderr };
}
const entrypoint = (vars) => run(vars).args;

test("adresse_publique_en_https", () => {
  const args = entrypoint({ TMDB_API_KEY: "x", ADRESSE_PUBLIQUE: "https://catalogue.exemple.fr/" });
  const i = args.indexOf("--local-upstream");
  assert.ok(i > 0);
  assert.equal(args[i + 1], "catalogue.exemple.fr");
  assert.equal(args[args.indexOf("--upstream-protocol") + 1], "https");
});

test("sans_adresse_publique", () => {
  assert.ok(!entrypoint({ TMDB_API_KEY: "x" }).includes("--local-upstream"));
});

test("journaux_sans_adresses", () => {
  const args = entrypoint({ TMDB_API_KEY: "x" });
  assert.equal(args[args.indexOf("--log-level") + 1], "warn");
});

// Les clés passent par .dev.vars (lisible par le Worker seul), jamais en arguments (visibles avec ps).
test("secrets_hors_ligne_de_commande", () => {
  const { args, devVars } = run({ TMDB_API_KEY: "cle-tmdb", ADMIN_PASSWORD: "mot-de-passe-long" });
  assert.ok(!args.some((a) => a.includes("cle-tmdb") || a.includes("mot-de-passe-long")));
  assert.match(devVars, /^TMDB_API_KEY='cle-tmdb'$/m);
  assert.match(devVars, /^ADMIN_PASSWORD='mot-de-passe-long'$/m);
});

// Format vérifié avec wrangler dev : entre '…' ou `…`, rien n'est interprété ($, #, \n, guillemets).
test("secrets_tels_quels", () => {
  assert.match(run({ ADMIN_PASSWORD: 'a "b" #c: d $HOME' }).devVars, /^ADMIN_PASSWORD='a "b" #c: d \$HOME'$/m);
  assert.match(run({ ADMIN_PASSWORD: `l'été "x"` }).devVars, /^ADMIN_PASSWORD=`l'été "x"`$/m);
});

test("secret_hote_tire_au_hasard_et_garde", () => {
  const first = run({ TMDB_API_KEY: "x" });
  const secret = readFileSync(join(first.data, "hote-secret"), "utf8");
  assert.match(secret, /^[0-9a-f]{64}$/);
  assert.match(first.devVars, new RegExp(`^HOTE_SECRET='${secret}'$`, "m"));
});

test("mot_de_passe_trop_simple_signale", () => {
  assert.match(run({ ADMIN_PASSWORD: "choisis-un-mot-de-passe" }).stderr, /trop simple/);
});

// Même image de base à chaque construction, et un état « healthy » lisible par docker ps.
test("image_de_base_fixee_et_etat_de_sante", () => {
  const dockerfile = readFileSync("Dockerfile", "utf8");
  assert.match(dockerfile, /^FROM node:22-[a-z]+-slim@sha256:[0-9a-f]{64}$/m);
  assert.match(dockerfile, /^HEALTHCHECK .*\n\s+CMD \["node", "-e", ".*\/manifest\.json/m);
});

// workerd lit les certificats racines du système, absents de l'image slim : sans eux, aucun appel https.
test("certificats_racines_installes", () => {
  assert.match(readFileSync("Dockerfile", "utf8"), /^RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates /m);
});

// Au démarrage, seuls les fichiers du volume qui ne sont pas à « node » changent de propriétaire.
test("pas_de_chown_complet_du_volume", () => {
  const ep = readFileSync("docker/entrypoint.sh", "utf8");
  assert.doesNotMatch(ep, /chown -R/);
  assert.match(ep, /find "\$DATA_DIR" .*! -user node/);
});

// Workers Builds redéploie à chaque « Sync fork » : les variables du tableau de bord doivent rester.
test("variables_gardees_au_deploiement", () => {
  assert.match(readFileSync("wrangler.toml", "utf8"), /^keep_vars = true$/m);
});

// Chaque fichier hors de worker/ importé par le Worker (data/sagas.json…) est copié dans l'image, et son
// changement refait l'image : sinon wrangler dev échoue au démarrage du conteneur (« Could not resolve »).
test("imports_hors_worker_copies_dans_l_image", () => {
  const dockerfile = readFileSync("Dockerfile", "utf8"), workflow = readFileSync(".github/workflows/docker.yml", "utf8");
  const copied = dockerfile.match(/^COPY .*$/gm).flatMap((l) => l.split(/\s+/).slice(1, -1));
  const imports = readdirSync("worker", { recursive: true }).filter((f) => f.endsWith(".js"))
    .flatMap((f) => [...readFileSync(join("worker", f), "utf8").matchAll(/^import .* from "\.\.\/([^"]+)";$/gm)].map((m) => m[1]));
  assert.ok(imports.includes("data/sagas.json"));
  for (const file of imports) {
    assert.ok(copied.includes(file), `${file} absent du Dockerfile`);
    assert.ok(workflow.includes(`- "${file}"`), `${file} absent des chemins de docker.yml`);
  }
});
