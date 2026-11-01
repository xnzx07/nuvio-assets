/**
 * Lance l'addon sur le serveur Oracle (serveur/addon.service), derrière Caddy, qui ne lui passe que les catalogues et
 * les fiches. Environnement (/etc/affiches.env) : TMDB_API_KEY, RELAIS_KEY, SERVEUR_URL, CLOUDFLARE_API_TOKEN,
 * CLOUDFLARE_ACCOUNT_ID, D1_LIENS ; GEMINI_API_KEY (/etc/addon.env : les lignes « Pour qui » des fiches, comme le secret du
 * Worker), GEMINI_MODEL, ADDON_ORIGINE, ADDON_CACHE, ADDON_PORT facultatifs.
 * --essai : charge le code et s'arrête (serveur/mettre-a-jour.sh, avant de remplacer la version en service).
 */
import { register } from "node:module";
import { createServer } from "node:http";
import { creerCache, avecCacheCf } from "./cache.mjs";
import { creerD1 } from "./d1.mjs";
import { creerService } from "./addon.mjs";

register("./chargeur.mjs", import.meta.url);

const e = process.env, PORT = Number(e.ADDON_PORT) || 8788;
const origine = e.ADDON_ORIGINE || "https://nuvio-assets.xnzxflix.workers.dev";
const cache = creerCache({ dossier: e.ADDON_CACHE || "/var/cache/addon" });
const fetchDirect = globalThis.fetch;
globalThis.caches = { default: cache, open: async () => cache };
globalThis.fetch = avecCacheCf(fetchDirect, cache);

const { default: worker } = await import("../index.js");
if (process.argv.includes("--essai")) { console.log("addon : code chargé"); process.exit(0); }

const env = {
  TMDB_API_KEY: e.TMDB_API_KEY, RELAIS_KEY: e.RELAIS_KEY, RELAIS_URL: e.SERVEUR_URL,
  ...(e.GEMINI_API_KEY ? { GEMINI_API_KEY: e.GEMINI_API_KEY } : {}), ...(e.GEMINI_MODEL ? { GEMINI_MODEL: e.GEMINI_MODEL } : {}),
  LIENS: creerD1({ jeton: e.CLOUDFLARE_API_TOKEN, compte: e.CLOUDFLARE_ACCOUNT_ID, base: e.D1_LIENS, fetchImpl: fetchDirect }),
};
const service = creerService({ worker, env, origine, fetchImpl: fetchDirect });

createServer(async (req, res) => {
  let r;
  try { r = await service.repondre(req.method, req.url, req.headers); }
  catch (err) { console.error(`addon : ${String((err && err.message) || err).replace(/\?\S*/g, "?…").slice(0, 300)}`); r = new Response(null, { status: 500, headers: { "Cache-Control": "no-store" } }); }
  const entetes = {};
  for (const [k, v] of r.headers) if (!["content-encoding", "content-length", "transfer-encoding"].includes(k)) entetes[k] = v;
  res.writeHead(r.status, entetes);
  res.end(req.method === "HEAD" ? undefined : Buffer.from(await r.arrayBuffer()));
}).listen(PORT, "127.0.0.1", () => console.log(`addon sur http://127.0.0.1:${PORT}, sous ${origine}`));

setInterval(() => cache.menage().catch((err) => console.warn(`ménage du cache : ${err.message}`)), 3600 * 1000);
