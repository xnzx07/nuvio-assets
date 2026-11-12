/**
 * Liens fixes : /f<identifiant>/manifest.json au lieu des réglages écrits dans l'adresse. Les réglages
 * restent dans la base D1 (LIENS) : la page de personnalisation les modifie sans changer le lien, et
 * Nuvio voit les nouvelles rangées sans réinstallation : tout de suite avec « Actualiser les addons »,
 * sinon quand il relit de lui-même le manifest de ses addons (toutes les 6 heures).
 *
 * Rien de lisible dans la base : la ligne est rangée sous une empreinte de l'identifiant et chiffrée
 * avec une clé tirée de lui (les réglages contiennent parfois une clé Gemini). Seul qui a le lien
 * peut les lire. Les modifier demande en plus la clé de modification, que garde le navigateur qui a
 * créé le lien (ou le « lien pour modifier »).
 *
 * « Ta TV l'a reçu » : la ligne note aussi (colonne vu) quand Nuvio a relu le manifest pour la dernière fois, au
 * plus une fois par 10 minutes, sauf juste après un enregistrement (t) : le billet sait alors dire si la TV a déjà
 * les derniers réglages. Lue seulement avec la clé de modification (POST /lien-fixe/<id>/lire).
 */

import { same } from "./hote.js";
import { sha256 as sha } from "./outils-serveur.js";

const ID = /^f[0-9A-Za-z]{16}$/;
const MODIF = /^[0-9A-Za-z]{22}$/;
const MAX_SEG = 6000;               // réglages compactés (12 rangées sur mesure, clé, noms…) : bien moins
const CACHE_S = 300;                // une ligne lue sert 5 min depuis le cache Cloudflare (modifs : 5 min + 6 h de Nuvio)
const SECOURS_S = 7 * 86400;        // puis reste 7 jours en secours, relue seulement si la base ne répond pas
const VU_MS = 10 * 60 * 1000;      // lecture par Nuvio notée au plus une fois par 10 min (écritures D1 comptées)
const cacheKey = (h) => new Request(`https://cache.local/lien-fixe/${h}`);

export const isFixedId = (s) => ID.test(s);
export const fixedAvailable = (env) => !!env.LIENS;

const enc = (s) => new TextEncoder().encode(s);
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function random(n) {
  const abc = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const out = [];
  // Rejet des octets ≥ 248 (= 4 × 62) : chaque caractère a la même chance.
  while (out.length < n) for (const b of crypto.getRandomValues(new Uint8Array(n * 2))) if (b < 248 && out.length < n) out.push(abc[b % 62]);
  return out.join("");
}

const keyOf = async (id) => crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", enc("cle:" + id)), "AES-GCM", false, ["encrypt", "decrypt"]);
async function seal(id, seg) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const box = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyOf(id), enc(seg)));
  return b64(iv) + "." + b64(box);
}
async function open(id, sealed) {
  const [iv, box] = sealed.split(".");
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await keyOf(id), unb64(box)));
}

let ready = null;
const table = (env) => (ready = ready || env.LIENS.prepare(
  "CREATE TABLE IF NOT EXISTS liens (h TEXT PRIMARY KEY, c TEXT NOT NULL, e TEXT NOT NULL, t INTEGER NOT NULL)").run()
  .catch((e) => { ready = null; throw e; }));

/** Ligne gardée dans le cache, avec l'heure de lecture (fraîche 5 min, secours 7 jours). */
const keep = (h, r) => caches.default.put(cacheKey(h), new Response(JSON.stringify({ c: r.c, e: r.e, lu: Date.now() }),
  { headers: { "Cache-Control": `public, max-age=${SECOURS_S}` } }));

// Table pas encore créée (aucun lien fixe sur ce site) : le lien n'existe pas. Toute autre erreur de la base est
// passagère : surtout pas « introuvable », qui pousserait à refaire son lien et à perdre l'ancien.
const noTable = (e) => /no such table/i.test(String((e && e.message) || e));

// Colonne vu (dernière lecture par Nuvio) : absente des bases d'avant, ajoutée la première fois qu'on en a besoin.
const noColumn = (e) => /no such column/i.test(String((e && e.message) || e));
let colonneVu = null;
const ajouteVu = (env) => (colonneVu = colonneVu || env.LIENS.prepare("ALTER TABLE liens ADD COLUMN vu INTEGER").run()
  .catch((e) => { if (!/duplicate column/i.test(String((e && e.message) || e))) { colonneVu = null; throw e; } }));
async function avecVu(env, requete) {
  try { return await requete(); } catch (e) { if (!noColumn(e)) throw e; await ajouteVu(env); return requete(); }
}

// Une seule lecture à la fois par lien : Nuvio demande ~20 rangées d'un coup, elles attendent la même réponse.
const lecturesEnCours = new Map();
function row(env, h) {
  let p = lecturesEnCours.get(h);
  if (!p) {
    p = lireLigne(env, h).finally(() => lecturesEnCours.delete(h));
    lecturesEnCours.set(h, p);
  }
  return p;
}

async function lireLigne(env, h) {
  const hit = await caches.default.match(cacheKey(h)).then((r) => (r ? r.json() : null)).catch(() => null);
  // Lu il y a moins de 5 min (les lignes d'avant, sans heure, sont relues).
  if (hit && hit.lu && Date.now() - hit.lu < CACHE_S * 1000) return hit;
  let r;
  try {
    r = await env.LIENS.prepare("SELECT c, e FROM liens WHERE h = ?").bind(h).first();
  } catch (e) {
    if (noTable(e)) return null;
    // Base injoignable : la copie de secours si ce centre de Cloudflare en a une, sinon l'erreur (réponse 503).
    if (hit) return hit;
    throw e;
  }
  if (r) await keep(h, r);
  return r;
}

/**
 * Réglages (le segment d'adresse habituel) d'un lien fixe, ou null s'il n'existe pas. Lève une erreur si la base
 * ne répond pas (et qu'aucune copie de secours n'est là) : à dire « réessaie », jamais « introuvable ».
 */
export async function readFixed(env, id) {
  if (!fixedAvailable(env) || !isFixedId(id)) return null;
  const r = await row(env, await sha("lien:" + id));
  if (!r) return null;
  try { return await open(id, r.c); } catch (e) { return null; }
}

/**
 * Nuvio vient de lire le manifest d'un lien fixe : l'heure est notée (vu), au plus une fois par 10 minutes, et
 * toujours à la première lecture après un enregistrement (vu < t). Une seule requête, qui n'écrit rien quand il n'y
 * a rien à noter. Pas les navigateurs : le lien ouvert dans un onglet (navigate) ou lu par le site lui-même.
 */
export async function noteLecture(env, id, request) {
  if (!fixedAvailable(env) || !isFixedId(id)) return;
  const h = request.headers;
  if (h.get("sec-fetch-mode") === "navigate" || h.get("sec-fetch-site") === "same-origin") return;
  const now = Date.now(), cle = await sha("lien:" + id);
  try {
    await avecVu(env, () => env.LIENS.prepare("UPDATE liens SET vu = ? WHERE h = ? AND (vu IS NULL OR vu < ? OR vu < t)")
      .bind(now, cle, now - VU_MS).run());
  } catch (e) {
    if (!noTable(e)) console.warn("lien fixe, lecture :", String(e));
  }
}

/**
 * POST /lien-fixe            { c }          → { id, modif }  (nouveau lien)
 * POST /lien-fixe/<id>       { c, modif }   → { ok: true, t }  (même lien, nouveaux réglages ; t : heure d'enregistrement)
 * POST /lien-fixe/<id>/lire  { modif }      → { k, al, pf, n, vu, t, maintenant }  (clé Gemini, jeton d'alerte, profils, voir plus
 *                                             bas ; vu : dernière lecture par Nuvio, t : dernier enregistrement, en ms)
 * `valid(seg)` dit si les réglages sont lisibles (decodeConfig) ; `secrets(seg)` en tire { k, al, pf, n }.
 */
export async function fixedRoute(request, env, path, valid, secrets) {
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  if (request.method !== "POST") return reply({ error: "Méthode non prise en charge." }, 405);
  if (!fixedAvailable(env)) return reply({ error: "Les liens fixes ne sont pas disponibles sur ce site." }, 501);
  // Un navigateur envoie toujours Origin avec un POST fait par la page : sans elle, c'est un script ou un robot
  // (des liens créés à la chaîne rempliraient la base).
  if (request.headers.get("origin") !== new URL(request.url).origin) return reply({ error: "interdit" }, 403);
  // Créations limitées par adresse IP (liaison LIMITE_LIENS de wrangler.toml, facultative : sans elle, pas de limite).
  // Les modifications, enregistrées toutes seules à chaque réglage, ne sont pas comptées.
  if (path === "/lien-fixe" && env.LIMITE_LIENS) {
    const ip = request.headers.get("cf-connecting-ip") || "?";
    const { success } = await env.LIMITE_LIENS.limit({ key: ip }).catch(() => ({ success: true }));
    if (!success) return reply({ error: "Trop de liens créés d'un coup : réessaie dans une minute." }, 429);
  }
  let body;
  try { body = await request.json(); } catch (e) { return reply({ error: "Demande illisible." }, 400); }
  const lire = /^\/lien-fixe\/([^/]+)\/lire$/.exec(path);
  if (lire) return lireSecrets(env, lire[1], body && body.modif, secrets, reply);
  const seg = typeof body.c === "string" ? body.c : "";
  if (seg.length > MAX_SEG || !valid(seg)) return reply({ error: "Réglages illisibles : recharge la page et réessaie." }, 400);

  const id = path.slice("/lien-fixe/".length);
  try {
    await table(env);
    if (path === "/lien-fixe") {
      const fresh = "f" + random(16), modif = random(22);
      await env.LIENS.prepare("INSERT INTO liens (h, c, e, t) VALUES (?, ?, ?, ?)")
        .bind(await sha("lien:" + fresh), await seal(fresh, seg), await sha("modif:" + modif), Date.now()).run();
      return reply({ id: fresh, modif });
    }
    if (!isFixedId(id) || !MODIF.test(String(body.modif || ""))) return reply({ error: "Lien fixe inconnu." }, 404);
    const h = await sha("lien:" + id);
    const r = await env.LIENS.prepare("SELECT e FROM liens WHERE h = ?").bind(h).first();
    if (!r) return reply({ error: "Lien fixe inconnu." }, 404);
    if (!same(r.e, await sha("modif:" + body.modif))) return reply({ error: "Ce navigateur n'a pas la clé pour modifier ce lien." }, 403);
    const c = await seal(id, seg), t = Date.now();
    await env.LIENS.prepare("UPDATE liens SET c = ?, t = ? WHERE h = ?").bind(c, t, h).run();
    // Ce centre de Cloudflare voit tout de suite les nouveaux réglages ; les autres d'ici 5 minutes.
    await keep(h, { c, e: r.e });
    return reply({ ok: true, t });
  } catch (e) {
    console.warn("lien fixe :", String(e));
    return reply({ error: "Enregistrement impossible pour le moment : réessaie dans quelques minutes." }, 503);
  }
}

/**
 * La clé Gemini et le jeton d'alerte d'un lien fixe ne sont jamais écrits dans sa page (/f…/configure) : qui a
 * seulement le lien (installé chez un proche, montré sur une capture) ne doit pas pouvoir les lire. La page qui
 * a la clé de modification les redemande ici, avant d'enregistrer quoi que ce soit (sans eux, l'enregistrement
 * les effacerait). Lu dans la base, pas dans le cache : les derniers enregistrés.
 */
async function lireSecrets(env, id, modif, secrets, reply) {
  if (!isFixedId(id) || !MODIF.test(String(modif || ""))) return reply({ error: "Lien fixe inconnu." }, 404);
  try {
    const h = await sha("lien:" + id);
    const r = await avecVu(env, () => env.LIENS.prepare("SELECT c, e, t, vu FROM liens WHERE h = ?").bind(h).first());
    if (!r) return reply({ error: "Lien fixe inconnu." }, 404);
    if (!same(r.e, await sha("modif:" + modif))) return reply({ error: "Ce navigateur n'a pas la clé pour modifier ce lien." }, 403);
    const s = secrets(await open(id, r.c)) || {};
    // maintenant : l'heure du site, pour compter « il y a 3 min » même si l'horloge de l'appareil dérive.
    // pf : les profils d'un lien principal (leurs liens et clés) ; n : le nom du lien, celui du profil dans la barre.
    return reply({ k: s.k || "", al: s.al || "", pf: Array.isArray(s.pf) ? s.pf : [], n: s.n || "", vu: Number(r.vu) || 0, t: Number(r.t) || 0, maintenant: Date.now() });
  } catch (e) {
    if (noTable(e)) return reply({ error: "Lien fixe inconnu." }, 404);
    console.warn("lien fixe :", String(e));
    return reply({ error: "Lecture impossible pour le moment : réessaie dans quelques minutes." }, 503);
  }
}
