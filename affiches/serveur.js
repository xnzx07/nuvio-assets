/**
 * Le serveur des affiches (Oracle Cloud, offre gratuite), derrière Caddy (https) : le même service que sur Vercel, sans
 * quota de calcul. Installé par serveur/installer.sh, lancé par systemd (serveur/affiches.service).
 *   GET /statique/<style>/{type}/{shape}/{id}.jpg  pour le Worker « affiches » (clé X-Relais-Cle) : une affiche absente
 *       de ses fichiers statiques, dessinée tout de suite, puis publiée avec les autres (toutes les 3 minutes)
 *   GET /{type}/{shape}/{id}.jpg?s=…               comme sur Vercel
 *   GET /affiche/{type}/{shape}/{id}?imdb=…&s=…     les aperçus des pages du site (comme /affiche/… de l'addon, sans lui)
 *   GET /qualite/… /tendances/… /notes/… /vf.json /anilist.json   les relais de l'addon, comme sur Vercel
 *   GET /etat                                      le bilan du serveur
 *   GET /passage?tout=1                            (clé X-Relais-Cle) tout redessiner maintenant, après une nuit ratée
 * Il prend aussi la file des affiches demandées pendant son absence (toutes les 5 minutes) et redessine tout chaque
 * nuit après la photo des tendances (4 h 17 UTC), et se signale chaque minute : la machine GitHub ne le fait qu'en
 * secours (scripts/affiches-statiques.mjs).
 * Environnement (/etc/affiches.env) : TMDB_API_KEY, RELAIS_KEY ; CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID,
 * D1_AFFICHES (publication) ; SERVEUR_URL (son adresse https, donnée au Worker) ; MDBLIST_API_KEY, PORT facultatifs.
 */
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { timingSafeEqual, createHash } from "node:crypto";
import { makeHandler } from "./api/affiche.js";
import { makeTendances } from "./api/tendances.js";
import { makeNotes } from "./api/notes.js";
import { makeVf } from "./api/vf.js";
import { makeQualite } from "./api/qualite.js";
import { makeAnilist } from "./api/anilist.js";
import { creerCloudflare, dessinerStatique, dessinerTout, publierEtEnregistrer, lireEtat, empreinte } from "./lib/statiques.js";
import { definirSecours } from "./lib/qualite.js";
import { lireReglages, ecrireReglages } from "./lib/lien-affiches.js";
import { secondesAvantBascule } from "./lib/tendances.js";

// Aperçus gardés en mémoire (les mêmes pour tous les visiteurs du site : les rangées du hall, la galerie) ; ~100 Ko chacun.
const APERCUS_MAX = 400;

/**
 * Le service des passages du serveur (la nuit, la file) : sans le plafond du disjoncteur, qui protège l'adresse
 * publique. Le 27 octobre 2026, la nuit l'a déclenché après ~1 400 affiches (300 par minute) : les autres ont gardé
 * les N° de la veille toute la journée.
 */
export const envDesPassages = (env) => ({ ...env, RENDUS_MINUTE: "1000000000", RENDUS_HEURE: "1000000000" });

export function creerServeur({ env = process.env, fetchImpl = fetch, horloge = Date.now } = {}) {
  const PORT = Number(env.PORT) || 8080, BASE = `http://127.0.0.1:${PORT}`;
  // Le service : sans réserve, sans le compteur de Vercel (rien à protéger ici), sans StreamFusion (chaque appel à /sf
  // compte une requête chez l'addon ; les affiches ont l'avis VF de la photo du jour). Le disjoncteur reste, plus haut :
  // l'adresse publique pourrait être appelée par n'importe qui.
  const envService = { ...env, RESERVE: "off", STREAMFUSION: "off", CPU_BUDGET_MIN: "1000000",
    RENDUS_MINUTE: env.RENDUS_MINUTE || "300", RENDUS_HEURE: env.RENDUS_HEURE || "6000" };
  const sansCompteur = (url, init) => (/\/cpu\?/.test(String(url)) ? Promise.resolve(Response.json({ ms: 0 })) : fetchImpl(url, init));
  const affiche = makeHandler({ env: envService, fetchImpl: sansCompteur });
  const afficheDesPassages = makeHandler({ env: envDesPassages(envService), fetchImpl: sansCompteur });
  const relais = { tendances: makeTendances({ env: envService, fetchImpl }), notes: makeNotes({ env: envService, fetchImpl }), vf: makeVf({ env: envService, fetchImpl }),
    qualite: makeQualite({ env: envService, fetchImpl }), anilist: makeAnilist({ env: envService, fetchImpl }) };
  const cf = env.CLOUDFLARE_API_TOKEN && env.D1_AFFICHES
    ? creerCloudflare({ jeton: env.CLOUDFLARE_API_TOKEN, compte: env.CLOUDFLARE_ACCOUNT_ID, base: env.D1_AFFICHES, worker: env.AFFICHES_WORKER || "affiches", fetchImpl })
    : null;
  // Le relais de Vercel ne répond pas (en pause, en panne) : la qualité de la nuit, lue par la machine GitHub (une ligne).
  if (cf) definirSecours(async (video) => {
    const r = await cf.sql("SELECT q FROM sources WHERE video = ?", [video]);
    return r[0] ? JSON.parse(r[0].q) : null;
  });
  const cleOk = (req) => {
    if (!env.RELAIS_KEY) return false;
    const h = (x) => createHash("sha256").update(String(x || "")).digest();
    return timingSafeEqual(h(req.headers["x-relais-cle"]), h(env.RELAIS_KEY));
  };

  // Aperçu d'une page du site : mêmes règles que /affiche/… de l'addon (worker/index.js), qui le relayait et comptait
  // ainsi une requête de plus dans les 100 000 par jour du compte. Réglages remis dans leur forme canonique, attente de
  // la régie (X-Apercu), gardé un jour au plus et jamais après la photo des tendances ; « en retard » : jamais gardé.
  const apercus = new Map();   // clé → { jpg, type, fin }
  const CORS_APERCU = { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "X-Affiche-Etat" };
  async function apercu(type, shape, id, params) {
    const q = new URLSearchParams(), imdb = params.get("imdb") || "", s = ecrireReglages(lireReglages(params));
    if (/^tt\d{1,10}$/.test(imdb)) q.set("imdb", imdb);
    if (s) q.set("s", "1." + s);
    const cle = `${type}/${shape}/${id}?${q}`, now = horloge(), hit = apercus.get(cle);
    const sortie = (jpg, ct, etat, garde) => new Response(jpg, { headers: { ...CORS_APERCU, "X-Affiche-Etat": etat, "Content-Type": ct,
      "Cache-Control": garde ? `public, max-age=${garde}` : "no-store" } });
    if (hit && hit.fin > now) return sortie(hit.jpg, hit.type, "complete", Math.ceil((hit.fin - now) / 1000));
    let r = null, p = q;
    // Le service renvoie (308) vers l'adresse canonique de ces réglages : on la suit, deux fois au plus.
    for (let i = 0; i < 3; i++) {
      p.set("type", type); p.set("shape", shape); p.set("id", id);
      r = await affiche(new Request(`${BASE}/api/affiche?${p}`, { headers: { "X-Apercu": "1" } }));
      if (r.status !== 308) break;
      p = new URLSearchParams((r.headers.get("Location") || "").split("?")[1] || "");
    }
    const ct = (r && r.headers.get("Content-Type")) || "";
    if (!r || !r.ok || !ct.startsWith("image/")) return new Response(null, { status: 404, headers: { ...CORS_APERCU, "Cache-Control": "public, max-age=3600" } });
    const cc = r.headers.get("Cache-Control") || "", ma = /max-age=(\d+)/.exec(cc), jpg = Buffer.from(await r.arrayBuffer());
    const etat = r.headers.get("X-Affiche-Etat") === "retard" ? "retard" : "complete";
    const garde = etat === "retard" || /no-store|no-cache/.test(cc) ? 0 : Math.min(86400, ma ? Number(ma[1]) : 3600, secondesAvantBascule(now));
    if (garde) {
      if (apercus.size >= APERCUS_MAX) apercus.delete(apercus.keys().next().value);
      apercus.set(cle, { jpg, type: ct, fin: now + garde * 1000 });
    }
    return sortie(jpg, ct, etat, garde);
  }

  // Affiches dessinées pour le Worker, en attente de publication (chemin → { jpg, hash }).
  const enAttente = new Map();
  const etat = { depuis: new Date(horloge()).toISOString(), dessinees: 0, publiees: 0, dernierePublication: null, erreur: null, liaisonsPosees: false };

  async function route(req) {
    const url = new URL(req.url, BASE);
    const p = url.pathname;
    const st = /^\/statique(\/(?:[a-z]+|perso\/[0-9A-Za-z-]{1,1300})\/(?:movie|series)\/(?:poster|landscape)\/[^/]+\.jpg)$/.exec(p);
    if (st) {
      if (!cleOk(req)) return new Response(null, { status: 403 });
      let chemin;
      try { chemin = decodeURIComponent(st[1]); } catch { return new Response(null, { status: 404 }); }
      const r = await dessinerStatique(affiche, BASE, chemin);
      if (!r.jpg) return new Response(null, { status: r.statut === 404 ? 404 : 503, headers: { "Cache-Control": "no-store" } });
      etat.dessinees++;
      enAttente.set(chemin, { jpg: r.jpg, hash: empreinte(r.jpg), retard: r.retard });
      // Gardée peu de temps dans Nuvio : la version publiée (avec le badge, si Torrentio était en retard) la remplace.
      return new Response(r.jpg, { headers: { "Content-Type": "image/jpeg", "Cache-Control": `public, max-age=${r.retard ? 120 : 600}` } });
    }
    const a = /^\/(movie|series)\/(poster|landscape)\/([^/]+)\.jpg$/.exec(p);
    if (a) {
      const q = new URLSearchParams(url.search);
      q.set("type", a[1]); q.set("shape", a[2]); q.set("id", decodeURIComponent(a[3]));
      const entetes = {};
      for (const k of ["if-none-match", "x-apercu"]) if (req.headers[k]) entetes[k] = req.headers[k];
      return affiche(new Request(`${BASE}/api/affiche?${q}`, { headers: entetes }));
    }
    const ap = /^\/affiche\/(movie|series)\/(poster|landscape)\/(tt\d{1,10}|tmdb%3A\d{1,10}|tmdb:\d{1,10})$/.exec(p);
    if (ap) return apercu(ap[1], ap[2], decodeURIComponent(ap[3]), url.searchParams);
    const enTetes = Object.fromEntries(Object.entries(req.headers).filter(([k]) => k === "x-relais-cle"));
    const t = /^\/tendances\/(movie|series)\.json$/.exec(p);
    if (t) return relais.tendances(new Request(`${BASE}/api/tendances?type=${t[1]}`, { headers: enTetes }));
    const qa = /^\/qualite\/(movie|series)\/([^/]+)\.json$/.exec(p);
    if (qa) return relais.qualite(new Request(`${BASE}/api/qualite?type=${qa[1]}&video=${encodeURIComponent(decodeURIComponent(qa[2]))}${url.search ? "&" + url.search.slice(1) : ""}`, { headers: enTetes }));
    if (/^\/notes\/tt\d{1,10}\.json$/.test(p)) return relais.notes(new Request(`${BASE}/api/notes?imdb=${p.slice(7, -5)}${url.searchParams.get("type") === "series" ? "&type=series" : ""}`, { headers: enTetes }));
    if (p === "/vf.json") return relais.vf(new Request(`${BASE}/api/vf${url.search}`, { headers: enTetes }));
    if (p === "/anilist.json") return relais.anilist(new Request(`${BASE}/api/anilist${url.search}`, { headers: enTetes }));
    // Une nuit ratée : tout redessiner à la main, avec la clé ; la réponse part sans attendre la fin.
    if (p === "/passage") {
      if (!cleOk(req)) return new Response(null, { status: 403 });
      passage({ tout: url.searchParams.get("tout") === "1" });
      return new Response(null, { status: 202 });
    }
    if (p === "/etat") return Response.json({ ...etat, enAttente: enAttente.size, memoire: Math.round(process.memoryUsage().rss / 1e6) }, { headers: { "Cache-Control": "no-store" } });
    return new Response("introuvable", { status: 404 });
  }

  const serveur = createServer(async (req, res) => {
    let r;
    try { r = await route(req); } catch (e) { console.error(`${req.url} : ${e && e.message}`); r = new Response(null, { status: 500 }); }
    const entetes = Object.fromEntries([...r.headers].filter(([k]) => !["content-encoding", "content-length", "transfer-encoding"].includes(k)));
    res.writeHead(r.status, entetes);
    res.end(Buffer.from(await r.arrayBuffer()));
  });

  /** Publie ce qui attend, et prend la file (tout : redessine aussi tout ce qui est en ligne). */
  let occupe = false, connu = null, prete = false;
  // Tables et index : au démarrage, et redemandés au passage suivant tant que la base les refuse (bloquée pour la journée).
  const preparer = () => (prete ? Promise.resolve() : cf.preparer().then(() => { prete = true; }));
  async function passage({ tout = false } = {}) {
    if (!cf || occupe) return;
    occupe = true;
    try {
      await preparer();
      // La liste des fichiers en ligne : lue une fois, puis tenue à jour ici (relue chaque nuit, avec tout).
      const { parChemin, aFaire } = await lireEtat(cf, { tout, connu: tout ? null : connu });
      connu = parChemin;
      for (const c of enAttente.keys()) aFaire.delete(c);
      const fait = await dessinerTout([...aFaire], (c) => dessinerStatique(afficheDesPassages, BASE, c), parChemin, { enMemeTemps: Number(env.EN_MEME_TEMPS) || 4 });
      const pris = [...enAttente];
      for (const [chemin, x] of pris) {
        const avant = parChemin.get(chemin);
        if (avant && avant.hash === x.hash) continue;
        fait.nouveaux.set(x.hash, x.jpg);
        parChemin.set(chemin, { chemin, hash: x.hash, taille: x.jpg.length, cree: avant ? avant.cree : new Date().toISOString(), change: true });
        if (x.retard) fait.reessais.push([chemin, 1, 10]);
        else fait.faits.push(chemin);
      }
      // Première publication : l'adresse du serveur et la clé pour le Worker (gardées ensuite d'une publication à l'autre).
      const liaisons = etat.liaisonsPosees || !env.SERVEUR_URL ? [] : [
        { type: "plain_text", name: "SERVEUR", text: env.SERVEUR_URL }, { type: "secret_text", name: "RELAIS_KEY", text: env.RELAIS_KEY }];
      const pub = await publierEtEnregistrer(cf, parChemin, fait.nouveaux, { ...fait, liaisons });
      if (pub.publie) {
        etat.liaisonsPosees = true;
        etat.publiees += pub.envoyes;
        etat.dernierePublication = new Date(horloge()).toISOString();
        for (const [chemin, x] of pris) if (enAttente.get(chemin) === x) enAttente.delete(chemin);
      }
      etat.erreur = null;
    } catch (e) {
      etat.erreur = e && e.message;
      console.error(`passage : ${etat.erreur}`);
    } finally {
      occupe = false;
    }
  }

  const minuteries = [];
  return {
    serveur, route, passage, etat, enAttente,
    demarrer() {
      serveur.listen(PORT, "127.0.0.1", () => console.log(`affiches sur ${BASE}`));
      if (!cf) { console.warn("pas de publication : CLOUDFLARE_API_TOKEN ou D1_AFFICHES manquant"); return; }
      // Son adresse et la clé pour le Worker, dès le démarrage : sans lire la base (elle peut être bloquée pour la journée).
      if (env.SERVEUR_URL && env.RELAIS_KEY) {
        cf.mettreAJourCode([{ type: "plain_text", name: "SERVEUR", text: env.SERVEUR_URL }, { type: "secret_text", name: "RELAIS_KEY", text: env.RELAIS_KEY }])
          .then(() => { etat.liaisonsPosees = true; console.log(`Worker relié : ${env.SERVEUR_URL}`); })
          .catch((e) => console.error(`liaison du Worker : ${e.message}`));
      }
      preparer().then(() => cf.signaler("serveur")).catch((e) => console.error(`base : ${e.message}`));
      minuteries.push(setInterval(() => cf.signaler("serveur").catch(() => {}), 60000));
      // Toutes les 3 minutes ce qui attend, et la file un tour sur cinq. Une fois par jour après 4 h 17 UTC (la photo des
      // tendances est prise à 4 h) : tout, pour les N° et statuts du jour ; retenté au tour suivant si occupé.
      // Démarré dans la journée (mise à jour, redémarrage) : la nuit est déjà faite (par lui, ou par la machine GitHub).
      const d0 = new Date(horloge());
      let tour = 0, derniereNuit = d0.getUTCHours() * 60 + d0.getUTCMinutes() >= 4 * 60 + 17 ? d0.toISOString().slice(0, 10) : "";
      minuteries.push(setInterval(async () => {
        tour++;
        const d = new Date(horloge()), jour = d.toISOString().slice(0, 10);
        const nuit = derniereNuit !== jour && (d.getUTCHours() > 4 || (d.getUTCHours() === 4 && d.getUTCMinutes() >= 17));
        if (nuit && !occupe) { derniereNuit = jour; await passage({ tout: true }); }
        // La file ne se remplit que si le serveur n'a pas répondu au Worker : un tour sur cinq suffit (15 minutes).
        else if (enAttente.size || tour % 5 === 0) await passage();
      }, 3 * 60000));
    },
    arreter() { for (const m of minuteries) clearInterval(m); serveur.close(); },
  };
}

// Lancé directement (node serveur.js), pas importé (tests).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) creerServeur().demarrer();
