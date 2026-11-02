/**
 * Le serveur Oracle sert les catalogues et les fiches (worker/construire/redirections.mjs). Lancé toutes les 5 minutes
 * par .github/workflows/surveillance.yml : décide s'il faut couper (le serveur ne répond plus : les catalogues
 * repassent par le Worker) ou rétablir (il répond de nouveau). L'action part dans GITHUB_OUTPUT, le workflow déploie.
 */
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ACTIF, SERVEUR_ADDON } from "../worker/construire/redirections.mjs";

const ADDON = "https://nuvio-assets.xnzxflix.workers.dev";
const PAGE = "/catalog/movie/accueil-top10.json";
const DELAI_MS = 20000;
// Coupé après 3 échecs sur 2 minutes (un redémarrage après une mise à jour dure quelques secondes) ; rétabli après 5
// réussites sur 4 minutes, pour ne pas aller et venir.
const ESSAIS_COUPER = 3, ESSAIS_RETABLIR = 5, PAUSE_COUPER_MS = 60000, PAUSE_RETABLIR_MS = 60000;

async function serveurRepond(fetchImpl) {
  try {
    const r = await fetchImpl(SERVEUR_ADDON + PAGE, { signal: AbortSignal.timeout(DELAI_MS) });
    if (!r.ok) return false;
    const j = await r.json();
    return Array.isArray(j.metas) && j.metas.length > 0;
  } catch { return false; }
}

/** L'addon renvoie-t-il au serveur en ce moment ? true (307), false (il répond lui-même, 200), null si on ne sait pas. */
async function redirectionActive(fetchImpl) {
  try {
    const r = await fetchImpl(ADDON + PAGE, { redirect: "manual", signal: AbortSignal.timeout(DELAI_MS) });
    return r.status === 307 ? true : r.status === 200 ? false : null;
  } catch { return null; }
}

/** { action: "rien" | "couper" | "retablir", raison }. */
export async function decider({ fetchImpl = fetch, attente = (ms) => new Promise((r) => setTimeout(r, ms)), actif = ACTIF } = {}) {
  if (!actif) return { action: "rien", raison: "bascule retirée dans le code (ACTIF)" };
  const active = await redirectionActive(fetchImpl);
  if (active === null) return { action: "rien", raison: "l'addon ne répond pas clairement" };
  if (active) {
    for (let i = 1; i <= ESSAIS_COUPER; i++) {
      if (await serveurRepond(fetchImpl)) return { action: "rien", raison: i === 1 ? "le serveur répond" : `le serveur répond (essai ${i})` };
      if (i < ESSAIS_COUPER) await attente(PAUSE_COUPER_MS);
    }
    return { action: "couper", raison: `le serveur n'a pas répondu ${ESSAIS_COUPER} fois de suite` };
  }
  for (let i = 1; i <= ESSAIS_RETABLIR; i++) {
    if (!(await serveurRepond(fetchImpl))) return { action: "rien", raison: "catalogues sur le Worker : le serveur ne répond pas encore" };
    if (i < ESSAIS_RETABLIR) await attente(PAUSE_RETABLIR_MS);
  }
  return { action: "retablir", raison: `le serveur a répondu ${ESSAIS_RETABLIR} fois de suite` };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { action, raison } = await decider();
  console.log(`${action} : ${raison}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `action=${action}\n`);
}
