// Tâche de 4 h UTC d'une copie Docker. Sur Cloudflare c'est le cron de wrangler.toml ; ici wrangler dev --test-scheduled
// expose /__scheduled, appelé une fois au démarrage puis chaque jour à partir de 4 h UTC (les classements Top des
// plateformes, la photo du jour des tendances). Une tâche déjà faite ce jour-là ne refait aucun appel (prendreTops).
const URL_TACHE = "http://127.0.0.1:8787/__scheduled?cron=0+4+*+*+*";
let dernierJour = "";

async function lancer() {
  try {
    const r = await fetch(URL_TACHE, { signal: AbortSignal.timeout(120000) });
    console.warn(`tâche de 4 h : HTTP ${r.status}`);
    return r.ok;
  } catch (e) { console.warn(`tâche de 4 h : ${e && e.message}`); return false; }
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
