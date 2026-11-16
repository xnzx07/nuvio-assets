// Lecture des listes Top d'une copie Docker. Sur Cloudflare c'est le cron de wrangler.toml ; ici wrangler dev
// --test-scheduled expose /__scheduled, appelé une fois au démarrage puis chaque jour à partir de 4 h UTC, avec la tâche
// « tops » seule. Déjà lues ce jour-là : aucun appel de plus (prendreTops).
const URL_TACHE = "http://127.0.0.1:8787/__scheduled?cron=tops";
let dernierJour = "";

async function lancer() {
  try {
    const r = await fetch(URL_TACHE, { signal: AbortSignal.timeout(120000) });
    console.warn(`tâche tops : HTTP ${r.status}`);
    return r.ok;
  } catch (e) { console.warn(`tâche tops : ${e && e.message}`); return false; }
}

async function attendreLeServeur() {
  for (;;) {
    try { if ((await fetch("http://127.0.0.1:8787/manifest.json", { signal: AbortSignal.timeout(10000) })).ok) return; } catch (e) { /* pas encore prêt */ }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

await attendreLeServeur();
if (await lancer()) dernierJour = new Date().toISOString().slice(0, 10);
setInterval(async () => {
  const maintenant = new Date(), jour = maintenant.toISOString().slice(0, 10);
  if (maintenant.getUTCHours() >= 4 && jour !== dernierJour && await lancer()) dernierJour = jour;
}, 10 * 60 * 1000);
