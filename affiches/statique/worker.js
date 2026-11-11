/**
 * Le Worker des affiches statiques. Les affiches déjà dessinées sont ses fichiers statiques : Cloudflare les sert
 * sans lancer ce code (gratuit, sans limite, hors des 100 000 requêtes par jour). Ce code ne tourne que pour une
 * affiche absente : il la fait dessiner par le serveur des affiches (SERVEUR, affiches/serveur.js, avec RELAIS_KEY) et
 * la renvoie aussitôt, comme avant ; le serveur la publie ensuite avec les autres. Serveur absent ou en panne : elle va
 * dans la file (table demandes de la base nuvio-affiches), réponse 503, et Nuvio montre l'affiche d'origine sans la
 * garder ; la file est dessinée plus tard (serveur, ou machine GitHub en secours).
 * Mis en ligne par affiches/lib/statiques.js (API de Cloudflare), pas par wrangler : la liste des styles est recopiée ici.
 */
const STYLES = new Set(__STYLES__);
// Déjà mises en file par cette instance (chemin → heure) : redemandées à chaque passage sur la carte, elles ne
// retournent pas à la base avant 10 minutes. La file elle-même est bornée par celui qui la vide (lib/statiques.js) :
// la compter ici, à chaque affiche absente, a dépassé les 5 millions de lignes lues par jour de D1 (26 octobre 2026).
const DEJA_EN_FILE = new Map(), OUBLI_MS = 10 * 60000;
// Le serveur dessine une affiche en moins d'une seconde ; Torrentio peut le faire attendre un peu plus.
const ATTENTE_MS = 8000;
// Un style tout prêt, ou des réglages perso (/perso/<code>[-<code du paysage>]/, vérifiés par le serveur).
const ADRESSE = /^\/(?:([a-z]+)|perso\/([0-9A-Za-z]{1,600})(?:-([0-9A-Za-z]{1,600}))?)\/(movie|series)\/(poster|landscape)\/(tt\d{1,10}|tmdb:\d{1,10})\.jpg$/;
const CORS = { "Access-Control-Allow-Origin": "*" };

const absente = () => new Response(null, { status: 503, headers: { ...CORS, "Retry-After": "600", "Cache-Control": "no-store" } });

async function duServeur(env, chemin) {
  if (!env.SERVEUR || !env.RELAIS_KEY) return null;
  try {
    const r = await fetch(`${env.SERVEUR}/statique${chemin}`, { headers: { "X-Relais-Cle": env.RELAIS_KEY }, signal: AbortSignal.timeout(ATTENTE_MS) });
    if (r.status === 404) return new Response("introuvable", { status: 404, headers: { ...CORS, "Cache-Control": "public, max-age=3600" } });
    if (!r.ok || !(r.headers.get("Content-Type") || "").startsWith("image/")) return null;
    return new Response(r.body, { headers: { ...CORS, "Content-Type": "image/jpeg", "Cache-Control": r.headers.get("Cache-Control") || "public, max-age=600" } });
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let chemin = url.pathname;
    try { chemin = decodeURIComponent(chemin); } catch { return new Response("introuvable", { status: 404 }); }
    // Sous /f : un fichier pas encore en ligne, demandé par le serveur des affiches (lib/statiques.js, PREFIXE).
    if (chemin.startsWith("/f/")) chemin = chemin.slice(2);
    const m = ADRESSE.exec(chemin);
    if (!m || (m[1] ? !STYLES.has(m[1]) : !m[2])) return new Response("introuvable", { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
    const dessinee = await duServeur(env, chemin);
    if (dessinee) return dessinee;
    const now = Date.now();
    if (!(DEJA_EN_FILE.get(chemin) > now - OUBLI_MS)) {
      if (DEJA_EN_FILE.size > 5000) DEJA_EN_FILE.clear();
      DEJA_EN_FILE.set(chemin, now);
      ctx.waitUntil(env.DB.prepare("INSERT OR IGNORE INTO demandes (chemin, vu) VALUES (?, ?)")
        .bind(chemin, new Date(now).toISOString()).run()
        .catch((e) => console.warn(`file : ${e && e.message}`)));
    }
    return absente();
  },
};
