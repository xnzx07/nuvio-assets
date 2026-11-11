/**
 * Le réveil de la surveillance du serveur Oracle (.github/workflows/surveillance.yml) : les tâches planifiées de GitHub
 * prennent des heures de retard (le canari, prévu toutes les 30 minutes, tournait toutes les 3 à 8 heures en octobre
 * 2026), celles de Cloudflare non. Toutes les 5 minutes : si les redirections et l'état du serveur ne vont plus ensemble,
 * le passage de GitHub est lancé ; c'est lui qui confirme et déploie.
 * Seulement avec SURVEILLANCE_GITHUB (un jeton GitHub limité à ce dépôt, droit Actions) : pas sur les copies.
 */
import { ACTIF, SERVEUR_ADDON } from "./construire/redirections.mjs";

export const CRON_SURVEILLANCE = "*/5 * * * *";
const ADDON = "https://nuvio-assets.xnzxflix.workers.dev";
const PAGE = "/catalog/movie/accueil-top10.json", AFFICHE = "/maison/movie/poster/tt0133093.jpg";
const LANCEMENT = "https://api.github.com/repos/xnzx07/nuvio-assets/actions/workflows/surveillance.yml/dispatches";
const DELAI_MS = 15000, PAUSE_S = 900;
const DEJA = new Request("https://cache.local/surveillance/lancee");

async function serveurRepond(fetchImpl) {
  try {
    const r = await fetchImpl(SERVEUR_ADDON + PAGE, { signal: AbortSignal.timeout(DELAI_MS) });
    if (!r.ok || !((await r.json()).metas || []).length) return false;
    // Les affiches aussi (le Worker « affiches » les lui renvoie).
    const a = await fetchImpl(SERVEUR_ADDON + AFFICHE, { redirect: "manual", signal: AbortSignal.timeout(DELAI_MS) });
    return a.status === 302 || a.status === 200;
  } catch { return false; }
}

export async function surveiller(env, { fetchImpl = fetch } = {}) {
  if (!env.SURVEILLANCE_GITHUB || !ACTIF) return;
  const etat = await fetchImpl(ADDON + PAGE, { redirect: "manual", signal: AbortSignal.timeout(DELAI_MS) }).then((r) => r.status, () => 0);
  if (etat !== 307 && etat !== 200) return;
  const repond = await serveurRepond(fetchImpl);
  if ((etat === 307) === repond) return;
  if (await caches.default.match(DEJA).catch(() => null)) return;
  const res = await fetchImpl(LANCEMENT, { method: "POST", signal: AbortSignal.timeout(DELAI_MS),
    headers: { Authorization: `Bearer ${env.SURVEILLANCE_GITHUB}`, Accept: "application/vnd.github+json", "User-Agent": "catalogue-fr-surveillance" },
    body: JSON.stringify({ ref: "main" }) });
  console.warn(`surveillance : redirections ${etat === 307 ? "actives" : "coupées"}, serveur ${repond ? "en forme" : "muet"} ; GitHub ${res.status}`);
  if (res.ok) await caches.default.put(DEJA, new Response("1", { headers: { "Cache-Control": `public, max-age=${PAUSE_S}` } })).catch(() => {});
}
