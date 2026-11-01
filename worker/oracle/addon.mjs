/**
 * L'addon sur le serveur Oracle : le code du Worker tel quel, pour les catalogues et les fiches seulement. Tout le reste
 * (site, manifest, tâches de la nuit, avis Lumio et StreamFusion) reste sur Cloudflare.
 * Les réponses sont fabriquées sous l'adresse de l'addon (origine) : leurs liens sont les mêmes que sur le Worker.
 */
export const ADRESSES_ADDON = /^\/(?:[^/]+\/)?(?:catalog|meta)\//;
const SANS = new Set(["host", "connection", "keep-alive", "transfer-encoding", "upgrade", "content-length"]);

/** Les en-têtes d'une demande Node pour le Worker ; l'adresse du visiteur à la place où Cloudflare la met. */
export function enteteVersRequete(entetes) {
  const h = new Headers();
  for (const [k, v] of Object.entries(entetes)) if (!SANS.has(k) && v !== undefined) h.set(k, Array.isArray(v) ? v.join(", ") : v);
  const ip = String(entetes["x-forwarded-for"] || "").split(",")[0].trim();
  if (ip) h.set("cf-connecting-ip", ip);
  return h;
}

export function creerService({ worker, env, origine, fetchImpl = fetch }) {
  const contexte = () => ({
    waitUntil: (p) => { Promise.resolve(p).catch((e) => console.warn(`après la réponse : ${e && e.message}`)); },
    passThroughOnException() {},
  });
  const service = {
    ...env,
    // Sans lien ici : les rangées demandent l'avis du jour (avecAvisDuJour), et SELF le passe au Worker, qui a les liens.
    LUMIO_URL: "https://par-le-worker.invalid",
    SELF: {
      async fetch(cible, init = {}) {
        const u = new URL(cible.url || cible);
        if (u.pathname === "/avis/lot") {
          // Jamais d'essai ici (avisEnLots le ferait après un échec) : sans les liens, il userait les plafonds pour rien.
          const r = await fetchImpl(`${origine}/avis/lot`, init).catch(() => null);
          return r && r.ok ? r : Response.json({ avis: {} });
        }
        return worker.fetch(new Request(origine + u.pathname + u.search, cible.url ? cible : init), service, contexte());
      },
    },
  };
  // Le bilan de /sante (seulement sur le serveur, Caddy ne le passe pas) : par appli et par famille de statut, sans
  // adresse (elles contiennent les réglages des liens, parfois une clé Gemini). Depuis le dernier démarrage.
  const compte = {}, depuis = new Date().toISOString();
  const noter = (ua, status) => {
    const appli = (String(ua || "?").split(/[/ ]/)[0] || "?").slice(0, 30);
    const c = (compte[appli] = compte[appli] || {}), famille = `${String(status)[0]}xx`;
    c[famille] = (c[famille] || 0) + 1;
  };
  return {
    env: service,
    async repondre(methode, adresse, entetes) {
      const chemin = adresse.split("?")[0];
      if (chemin === "/sante") return Response.json({ depuis, compte });
      if (!ADRESSES_ADDON.test(chemin)) return new Response("introuvable", { status: 404 });
      if (!["GET", "HEAD", "OPTIONS"].includes(methode)) return new Response(null, { status: 405 });
      const r = await worker.fetch(new Request(origine + adresse, { method: methode, headers: enteteVersRequete(entetes) }), service, contexte());
      noter(entetes["user-agent"], r.status);
      return r;
    },
  };
}
