/**
 * Le cache de Cloudflare (caches.default et les fetch avec cf.cacheTtl), sur le disque du serveur Oracle : un fichier
 * par adresse, gardé le temps que dit Cache-Control, et retrouvé après un redémarrage (sans lui, chaque mise à jour
 * redemanderait tout à TMDB).
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const adresse = (k) => String((k && k.url) || k);
const secondes = (cc) => {
  if (/no-store|private/i.test(cc || "")) return 0;
  const m = /s-maxage=(\d+)/i.exec(cc || "") || /max-age=(\d+)/i.exec(cc || "");
  return m ? Number(m[1]) : 0;
};

export function creerCache({ dossier, horloge = Date.now, max = 8e9 }) {
  const chemin = (k) => {
    const h = createHash("sha256").update(adresse(k)).digest("hex");
    return join(dossier, h.slice(0, 2), h);
  };
  return {
    async match(k) {
      const f = chemin(k);
      const brut = await readFile(f).catch(() => null);
      if (!brut) return undefined;
      const fin = brut.indexOf(10);
      let t;
      try { t = JSON.parse(brut.subarray(0, fin).toString()); } catch { return undefined; }
      if (t.fin <= horloge()) { await rm(f, { force: true }).catch(() => {}); return undefined; }
      return new Response([204, 205, 304].includes(t.status) ? null : brut.subarray(fin + 1), { status: t.status, headers: t.headers });
    },
    async put(k, r) {
      const s = secondes(r.headers.get("Cache-Control"));
      if (!s || r.status === 206 || r.headers.get("Vary") === "*") return;
      const f = chemin(k), corps = Buffer.from(await r.arrayBuffer());
      const tete = JSON.stringify({ fin: horloge() + s * 1000, status: r.status, headers: [...r.headers] });
      await mkdir(join(f, ".."), { recursive: true });
      const tmp = `${f}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
      await writeFile(tmp, Buffer.concat([Buffer.from(tete + "\n"), corps]));
      await rename(tmp, f);
    },
    async delete(k) {
      const f = chemin(k), la = await stat(f).then(() => true, () => false);
      await rm(f, { force: true });
      return la;
    },
    /** Retire ce qui a expiré, puis les plus anciens au-delà de max octets. Appelé toutes les heures. */
    async menage() {
      const vivants = [];
      let total = 0;
      for (const d of await readdir(dossier).catch(() => [])) {
        for (const n of await readdir(join(dossier, d)).catch(() => [])) {
          const f = join(dossier, d, n), brut = await readFile(f).catch(() => null);
          if (!brut) continue;
          let t = null;
          try { t = JSON.parse(brut.subarray(0, brut.indexOf(10)).toString()); } catch { /* abîmé : retiré */ }
          if (!t || t.fin <= horloge()) { await rm(f, { force: true }).catch(() => {}); continue; }
          const { mtimeMs } = await stat(f).catch(() => ({ mtimeMs: 0 }));
          vivants.push([mtimeMs, f, brut.length]);
          total += brut.length;
        }
      }
      vivants.sort((a, b) => a[0] - b[0]);
      for (const [, f, n] of vivants) {
        if (total <= max) break;
        await rm(f, { force: true }).catch(() => {});
        total -= n;
      }
    },
  };
}

/**
 * fetch avec cf: { cacheTtl } ou { cacheTtlByStatus } : Cloudflare garde la réponse de lui-même, pas Node. Gardée ici pour
 * un GET réussi ; les demandes identiques en cours n'en font qu'une.
 */
export function avecCacheCf(fetchImpl, cache) {
  const enCours = new Map();
  return async function fetchGarde(cible, init = {}) {
    const methode = init.method || (cible && cible.method) || "GET";
    const cf = init.cf;
    const ttl = cf && (cf.cacheTtl || (cf.cacheTtlByStatus && cf.cacheTtlByStatus["200-299"]));
    if (!ttl || methode !== "GET") return fetchImpl(cible, init);
    const cle = `https://cf-fetch.cache/${adresse(cible)}`;
    const hit = await cache.match(cle);
    if (hit) return hit;
    if (!enCours.has(cle)) {
      enCours.set(cle, (async () => {
        const r = await fetchImpl(cible, init);
        const corps = await r.arrayBuffer(), entetes = new Headers(r.headers);
        ["content-encoding", "content-length", "transfer-encoding"].forEach((h) => entetes.delete(h));
        if (r.ok) {
          entetes.set("Cache-Control", `public, max-age=${ttl}`);
          await cache.put(cle, new Response(corps, { status: r.status, headers: entetes })).catch(() => {});
        }
        return { status: r.status, headers: [...entetes], corps };
      })().finally(() => enCours.delete(cle)));
    }
    const { status, headers, corps } = await enCours.get(cle);
    return new Response(corps, { status, headers });
  };
}
