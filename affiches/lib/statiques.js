/**
 * Les affiches en fichiers statiques du Worker « affiches » (Cloudflare) : dessin et publication, partagés par le
 * serveur des affiches (serveur.js, qui dessine à la demande) et la machine GitHub (scripts/affiches-statiques.mjs, en
 * secours et chaque nuit). Adresse : /<style>/{type}/{shape}/{id}.jpg (styles : lib/styles.js).
 * Base nuvio-affiches (D1) : demandes (la file des affiches absentes, remplie par statique/worker.js), verrou (une
 * publication à la fois), etat (le serveur est-il là ?). Ce qui est en ligne : la liste publiée avec les affiches
 * (LISTE), plus la table fichiers (gardée pour la relire une dernière fois, plus écrite).
 * Publication par l'API de Cloudflare (envoi direct des fichiers statiques) : Cloudflare répond les empreintes qu'il n'a
 * pas, on n'envoie que celles-là, puis on remet le Worker en ligne avec la liste complète.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { STYLES, parametresDuStyle } from "./styles.js";
import { lireReglages, ecrireReglages } from "./lien-affiches.js";

// Un style tout prêt (/maison/…), ou des réglages perso (/perso/<code>[-<code du paysage>]/…, les codes du lien de la
// régie ; « 0 » : le portrait par défaut).
export const ADRESSE = /^\/(?:([a-z]+)|perso\/([0-9A-Za-z]{1,600})(?:-([0-9A-Za-z]{1,600}))?)\/(movie|series)\/(poster|landscape)\/(tt\d{1,10}|tmdb:\d{1,10})\.jpg$/;
const canonique = (x) => x === "0" || ecrireReglages(lireReglages(new URLSearchParams({ s: "1." + x }))) === x;
/**
 * Une adresse d'affiche valable : { style, type, shape, id } (style tout prêt) ou { s, sp, type, shape, id } (codes
 * perso, seulement sous leur forme canonique : sinon deux adresses pour un même dessin), ou null.
 */
export function cheminValable(c) {
  const m = ADRESSE.exec(c || "");
  if (!m) return null;
  const [, style, s, sp, type, shape, id] = m;
  if (style) return STYLES[style] ? { style, type, shape, id } : null;
  if (!canonique(s) || (sp !== undefined && (!canonique(sp) || sp === s))) return null;
  return { s: s === "0" ? "" : s, sp: sp === undefined ? null : sp === "0" ? "" : sp, type, shape, id };
}
// Offre gratuite : 20 000 fichiers par version du Worker (dont _headers). Au-delà, les plus anciens partent ; une
// affiche retirée et redemandée revient par la file.
export const FICHIERS_MAX = 19000;
// Un titre inconnu de TMDB est essayé trois jours de suite, puis sort de la file.
const INCONNUE_ESSAIS = 3;
// Une heure dans Nuvio, puis revérifiée par son ETag (304 si rien n'a changé) : les N° et statuts du jour suivent.
export const ENTETES = "/*\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=3600, stale-while-revalidate=86400\n";

// Empreinte d'un fichier statique : 32 caractères hexadécimaux, au choix de l'envoyeur (comme wrangler : contenu en
// base64 suivi de l'extension).
export const empreinte = (buf, ext = "jpg") => createHash("sha256").update(buf.toString("base64") + ext).digest("hex").slice(0, 32);
// Valeurs écrites en clair dans les écritures groupées : chemins vérifiés par ADRESSE, empreintes en hexadécimal.
const texte = (v) => `'${String(v).replace(/'/g, "''")}'`;

/**
 * La liste de ce qui est en ligne, publiée avec les affiches (un de leurs fichiers), pas dans la base : chaque affiche
 * publiée y écrivait 4 lignes (ajout, et retrait de la plus ancienne, index compris). Le stock plein (FICHIERS_MAX) se
 * renouvelle chaque jour, et le 27 octobre 2026 ces ~76 000 lignes ont dépassé, avec le reste, les 100 000 écritures
 * gratuites par jour du compte (l'addon compris : plus d'avis VF ce soir-là). Le serveur la garde aussi sur son disque.
 * Refaite au plus toutes les 30 minutes (environ 2 Mo pour 19 000 affiches) : c'est le secours de la machine GitHub.
 * { t, f: [[chemin, empreinte, taille, cree]] }.
 */
export const LISTE = "/_liste.json";
const LISTE_MS = 30 * 60000;
export const contenuListe = (fichiers, t = new Date().toISOString()) =>
  Buffer.from(JSON.stringify({ t, f: fichiers.map((x) => [x.chemin, x.hash, x.taille, x.cree]) }));
/** { t, fichiers: [{ chemin, hash, taille, cree }] }, ou null si illisible. */
export function lireListe(buf) {
  try {
    const d = JSON.parse(buf.toString("utf8"));
    if (!d || !Array.isArray(d.f)) return null;
    return { t: String(d.t || ""), fichiers: d.f.filter((x) => Array.isArray(x) && cheminValable(x[0])).map(([chemin, hash, taille, cree]) => ({ chemin, hash, taille, cree })) };
  } catch { return null; }
}

/** Le code du Worker, avec la liste des styles. */
export const codeDuWorker = () => readFileSync(new URL("../statique/worker.js", import.meta.url), "utf8").replace("__STYLES__", JSON.stringify(Object.keys(STYLES)));

/**
 * L'accès à Cloudflare : { sql, ecrire, preparer, verrouiller, liberer, signaler, serveurRecent, publier }.
 * jeton : Workers Scripts et D1 en écriture ; compte : CLOUDFLARE_ACCOUNT_ID ; base : l'id de nuvio-affiches.
 */
export function creerCloudflare({ jeton, compte, base, worker = "affiches", fetchImpl = fetch }) {
  const API = `https://api.cloudflare.com/client/v4/accounts/${compte}`;
  async function cf(chemin, init = {}) {
    const res = await fetchImpl(API + chemin, { ...init, headers: { Authorization: `Bearer ${jeton}`, ...(init.headers || {}) } });
    const corps = await res.json().catch(() => ({}));
    if (!res.ok || corps.success === false) throw new Error(`Cloudflare ${chemin.split("?")[0]} : ${res.status} ${JSON.stringify(corps.errors || corps).slice(0, 300)}`);
    return corps.result;
  }
  async function requete(sql, params) {
    const r = await cf(`/d1/database/${base}/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sql, params }) });
    return (r && r[0]) || {};
  }
  const sql = async (s, params = []) => (await requete(s, params)).results || [];
  const ecrire = async (s, params = []) => ((await requete(s, params)).meta || {}).changes || 0;

  return {
    sql, ecrire,
    async preparer() {
      await sql("CREATE TABLE IF NOT EXISTS demandes (chemin TEXT PRIMARY KEY, vu TEXT NOT NULL, essais INTEGER NOT NULL DEFAULT 0, apres TEXT)");
      // La file se lit par apres (lireEtat) : sans index, chaque passage relisait toute la table (26 octobre 2026).
      await sql("CREATE INDEX IF NOT EXISTS demandes_apres ON demandes (apres)");
      await sql("CREATE TABLE IF NOT EXISTS fichiers (chemin TEXT PRIMARY KEY, hash TEXT NOT NULL, taille INTEGER NOT NULL, dessine TEXT NOT NULL, cree TEXT NOT NULL)");
      await sql("CREATE TABLE IF NOT EXISTS verrou (nom TEXT PRIMARY KEY, jusqua TEXT NOT NULL)");
      await sql("CREATE TABLE IF NOT EXISTS etat (nom TEXT PRIMARY KEY, vu TEXT NOT NULL)");
      // La qualité lue chez Torrentio par la machine GitHub, chaque nuit (video → JSON de lireTorrentio).
      await sql("CREATE TABLE IF NOT EXISTS sources (video TEXT PRIMARY KEY, q TEXT NOT NULL, lu TEXT NOT NULL)");
    },
    /** Prend le verrou pour `ms` ; false s'il est déjà pris (une autre publication en cours). */
    async verrouiller(nom, ms) {
      const now = new Date().toISOString(), fin = new Date(Date.now() + ms).toISOString();
      return (await ecrire("INSERT INTO verrou (nom, jusqua) VALUES (?, ?) ON CONFLICT (nom) DO UPDATE SET jusqua = excluded.jusqua WHERE verrou.jusqua < ?", [nom, fin, now])) > 0;
    },
    liberer: (nom) => ecrire("UPDATE verrou SET jusqua = ? WHERE nom = ?", [new Date(0).toISOString(), nom]),
    /** Le serveur des affiches est là (une fois par minute) : la machine GitHub ne dessine pas à sa place. */
    signaler: (nom) => ecrire("INSERT INTO etat (nom, vu) VALUES (?, ?) ON CONFLICT (nom) DO UPDATE SET vu = excluded.vu", [nom, new Date().toISOString()]),
    async serveurRecent(ms = 15 * 60000) {
      const r = await sql("SELECT vu FROM etat WHERE nom = 'serveur'").catch(() => []);
      return !!r[0] && Date.parse(r[0].vu) > Date.now() - ms;
    },
    /**
     * Remet le Worker en ligne avec `fichiers` ([{ chemin, hash, taille }]) : `nouveaux` (Map empreinte → JPEG) sont
     * envoyés s'ils manquent chez Cloudflare ; une empreinte demandée mais absente de `nouveaux` est relue en ligne.
     * liaisons : celles à poser en plus de la base (SERVEUR, RELAIS_KEY), les autres sont gardées telles quelles.
     */
    /**
     * Remet en ligne le seul code du Worker, ses fichiers et ses liaisons gardés tels quels (keep_assets) : sans lire la
     * base (bloquée quand le compte dépasse les lignes lues du jour). liaisons : en plus de la base (SERVEUR, RELAIS_KEY).
     */
    async mettreAJourCode(liaisons = []) {
      const form = new FormData();
      form.append("metadata", new Blob([JSON.stringify({
        main_module: "worker.js", compatibility_date: "2026-10-01",
        bindings: [{ type: "d1", name: "DB", id: base }, ...liaisons], keep_bindings: ["plain_text", "secret_text"],
        keep_assets: true, assets: { config: { not_found_handling: "none", _headers: ENTETES } },
      })], { type: "application/json" }));
      form.append("worker.js", new Blob([codeDuWorker()], { type: "application/javascript+module" }), "worker.js");
      await cf(`/workers/scripts/${worker}`, { method: "PUT", body: form });
    },
    /** La liste publiée avec les affiches (LISTE) : { t, fichiers }, ou null (pas encore publiée, illisible). */
    async lireListePubliee() {
      try {
        const sousDomaine = (await cf("/workers/subdomain")).subdomain;
        const r = await fetchImpl(`https://${worker}.${sousDomaine}.workers.dev${LISTE}`);
        return r.ok ? lireListe(Buffer.from(await r.arrayBuffer())) : null;
      } catch { return null; }
    },
    async publier(fichiers, nouveaux, liaisons = []) {
      const manifest = {};
      for (const f of fichiers) manifest[f.chemin] = { hash: f.hash, size: f.taille };
      const session = await cf(`/workers/scripts/${worker}/assets-upload-session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manifest }) });
      let jeton2 = session.jwt;
      const cheminDe = new Map(fichiers.map((f) => [f.hash, f.chemin]));
      let sousDomaine = null;
      for (const lot of session.buckets || []) {
        const form = new FormData();
        for (const hash of lot) {
          let jpg = nouveaux.get(hash);
          if (!jpg) {
            sousDomaine = sousDomaine || (await cf("/workers/subdomain")).subdomain;
            const r = await fetchImpl(`https://${worker}.${sousDomaine}.workers.dev${cheminDe.get(hash)}`);
            if (!r.ok) throw new Error(`fichier ${cheminDe.get(hash)} introuvable en ligne (${r.status})`);
            jpg = Buffer.from(await r.arrayBuffer());
          }
          form.append(hash, new File([jpg.toString("base64")], hash, { type: cheminDe.get(hash) === LISTE ? "application/json" : "image/jpeg" }));
        }
        // Trois essais : Cloudflare refuse parfois un envoi (vu le 2026-10-25, le suivant passe).
        for (let essai = 1; ; essai++) {
          const res = await fetchImpl(`${API}/workers/assets/upload?base64=true`, { method: "POST", headers: { Authorization: `Bearer ${jeton2}` }, body: form });
          const corps = await res.json().catch(() => ({}));
          if (res.ok && corps.success !== false) { if (corps.result && corps.result.jwt) jeton2 = corps.result.jwt; break; }
          const erreur = `envoi des fichiers : ${res.status} ${JSON.stringify(corps.errors || corps).slice(0, 300)}`;
          if (essai === 3) throw new Error(erreur);
          console.warn(`${erreur}, nouvel essai`);
          await new Promise((ok) => setTimeout(ok, 3000 * essai));
        }
      }
      const form = new FormData();
      form.append("metadata", new Blob([JSON.stringify({
        main_module: "worker.js",
        compatibility_date: "2026-10-01",
        bindings: [{ type: "d1", name: "DB", id: base }, ...liaisons],
        // L'adresse du serveur et la clé restent d'une publication à l'autre (la machine GitHub ne les connaît pas).
        keep_bindings: ["plain_text", "secret_text"],
        assets: { jwt: jeton2, config: { not_found_handling: "none", _headers: ENTETES } },
      })], { type: "application/json" }));
      form.append("worker.js", new Blob([codeDuWorker()], { type: "application/javascript+module" }), "worker.js");
      await cf(`/workers/scripts/${worker}`, { method: "PUT", body: form });
      await cf(`/workers/scripts/${worker}/subdomain`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: true }) });
      return (session.buckets || []).reduce((n, l) => n + l.length, 0);
    },
  };
}

/**
 * Dessine une affiche statique avec le service (makeHandler), sur `base` (son adresse, pour ses relais) :
 * { jpg, retard } ou { statut } (404 : titre inconnu ; autre : à réessayer).
 */
export async function dessinerStatique(affiche, base, chemin) {
  const a = cheminValable(chemin);
  if (!a) return { statut: 404 };
  const { type, shape, id } = a;
  let p = a.style ? parametresDuStyle(a.style) : new URLSearchParams();
  if (!a.style) { if (a.s) p.set("s", "1." + a.s); if (a.sp !== null) p.set("sp", "1." + a.sp); }
  // Le service renvoie (308) vers l'adresse canonique de ces réglages : on la suit, deux fois au plus.
  for (let i = 0; i < 3; i++) {
    p.set("type", type); p.set("shape", shape); p.set("id", id);
    const r = await affiche(new Request(`${base}/api/affiche?${p}`));
    if (r.status === 308) { p = new URLSearchParams((r.headers.get("Location") || "").split("?")[1] || ""); continue; }
    if (r.status === 200 && (r.headers.get("Content-Type") || "").startsWith("image/")) {
      const etat = r.headers.get("X-Affiche-Etat");
      return { jpg: Buffer.from(await r.arrayBuffer()), retard: etat === "retard", revoir: etat === "revoir" };
    }
    return { statut: r.status };
  }
  return { statut: 508 };
}

/**
 * Dessine `liste` ([[chemin, essais]], essais null : déjà en ligne, redessinée pour les statuts du jour) avec
 * `dessiner(chemin)`, `enMemeTemps` à la fois. parChemin (Map chemin → { chemin, hash, taille, cree }) : ce qui est en
 * ligne, mis à jour ici (change : true pour ce qui doit partir). { nouveaux (empreinte → JPEG), faits, reessais, bilan }.
 */
const REVOIR_MIN = 3 * 60;
export async function dessinerTout(liste, dessiner, parChemin, { enMemeTemps = 4, maintenant = new Date().toISOString() } = {}) {
  const nouveaux = new Map(), faits = [], reessais = [], bilan = { dessinees: 0, inchangees: 0, retard: 0, inconnues: 0, ratees: 0 };
  let i = 0;
  async function ouvrier() {
    while (i < liste.length) {
      const [chemin, essais] = liste[i++];
      let r;
      try { r = await dessiner(chemin); } catch (e) { console.warn(`${chemin} : ${e.message}`); r = { statut: 500 }; }
      if (r.jpg) {
        const hash = empreinte(r.jpg), avant = parChemin.get(chemin);
        if (avant && avant.hash === hash) bilan.inchangees++;
        else { bilan.dessinees++; nouveaux.set(hash, r.jpg); }
        parChemin.set(chemin, { chemin, hash, taille: r.jpg.length, cree: avant ? avant.cree : maintenant, change: !avant || avant.hash !== hash || !!(avant && avant.change) });
        // Torrentio trop lent : publiée sans badge de qualité, et redessinée au prochain passage.
        if (r.retard) { bilan.retard++; reessais.push([chemin, (essais || 0) + 1, 10]); }
        // Titre récent sans VF d'après l'avis du jour : redessiné dans 3 heures (la VF sort souvent dans la journée).
        else if (r.revoir) reessais.push([chemin, 0, REVOIR_MIN]);
        else if (essais !== null) faits.push(chemin);
      } else if (essais !== null) {
        // Titre inconnu : redemandé dans un jour seulement (Nuvio redemande l'affiche à chaque passage sur la carte) ;
        // au troisième jour, il sort de la file (il y reviendra si Nuvio le redemande).
        if (r.statut === 404) { bilan.inconnues++; if (essais + 1 >= INCONNUE_ESSAIS) faits.push(chemin); else reessais.push([chemin, essais + 1, 24 * 60]); } else { bilan.ratees++; reessais.push([chemin, essais + 1, Math.min(24 * 60, 10 * 2 ** essais)]); }
      } else bilan.ratees++;
    }
  }
  await Promise.all(Array.from({ length: enMemeTemps }, ouvrier));
  return { nouveaux, faits, reessais, bilan };
}

/**
 * Publie ce qui a changé dans parChemin, avec la liste (LISTE), et met la file à jour. Sous le verrou « publication » :
 * une seule à la fois (serveur et machine GitHub). Les affiches retirées (au-delà de FICHIERS_MAX) sortent aussi de
 * parChemin. liste : { entree, t } de la dernière liste publiée, tenu par l'appelant (null : refaite à chaque fois).
 * { publie, envoyes, retirees } ; publie false si le verrou était pris.
 */
export async function publierEtEnregistrer(cf, parChemin, nouveaux, { faits = [], reessais = [], liaisons = [], maintenant = new Date().toISOString(), liste = null } = {}) {
  let tous = [...parChemin.values()].sort((a, b) => (a.cree < b.cree ? 1 : -1));
  const retirees = tous.slice(FICHIERS_MAX);
  tous = tous.slice(0, FICHIERS_MAX);
  const changees = tous.filter((f) => f.change);
  let envoyes = 0, publie = false;
  if (changees.length || retirees.length || liaisons.length) {
    if (!(await cf.verrouiller("publication", 10 * 60000))) return { publie: false, envoyes: 0, retirees: 0 };
    try {
      let entree = liste && liste.entree && Date.now() - liste.t < LISTE_MS ? liste.entree : null;
      if (!entree) {
        const buf = contenuListe(tous, maintenant), hash = empreinte(buf, "json");
        nouveaux.set(hash, buf);
        entree = { chemin: LISTE, hash, taille: buf.length };
      }
      envoyes = await cf.publier([...tous, entree], nouveaux, liaisons);
      publie = true;
      if (liste && liste.entree !== entree) { liste.entree = entree; liste.t = Date.now(); }
      for (const f of changees) f.change = false;
      for (const f of retirees) parChemin.delete(f.chemin);
    } finally {
      await cf.liberer("publication").catch(() => {});
    }
  }
  // La file, seulement une fois publié : une affiche absente reste demandée tant qu'elle n'est pas en ligne.
  for (let j = 0; j < faits.length; j += 200) await cf.sql(`DELETE FROM demandes WHERE chemin IN (${faits.slice(j, j + 200).map(texte).join(", ")})`);
  // Mis en file même s'il n'y était pas (affiche redessinée la nuit, à revoir ou en retard), par lots de 25.
  const lignes = reessais.map(([chemin, essais, minutes]) => [chemin, maintenant, essais, new Date(Date.now() + minutes * 60000).toISOString()]);
  for (let j = 0; j < lignes.length; j += 25) {
    const lot = lignes.slice(j, j + 25);
    await cf.sql(`INSERT INTO demandes (chemin, vu, essais, apres) VALUES ${lot.map(() => "(?, ?, ?, ?)").join(", ")} ON CONFLICT(chemin) DO UPDATE SET essais = excluded.essais, apres = excluded.apres`, lot.flat());
  }
  return { publie, envoyes, retirees: retirees.length };
}

/**
 * Ce qui est en ligne ([{ chemin, hash, taille, cree }]) : la plus récente des listes du disque (disque(), ou null) et
 * publiée ; sans aucune, l'ancienne table fichiers (plus écrite depuis le 28 octobre 2026), une seule lecture.
 */
export async function chargerListe(cf, disque = null) {
  let d = null;
  try { d = disque ? disque() : null; } catch { d = null; }
  const p = cf.lireListePubliee ? await cf.lireListePubliee() : null;
  const meilleure = [d, p].filter(Boolean).sort((a, b) => (a.t < b.t ? 1 : -1))[0];
  return meilleure ? meilleure.fichiers : cf.sql("SELECT chemin, hash, taille, cree FROM fichiers");
}

/**
 * Ce qui est en ligne (Map chemin → { chemin, hash, taille, cree }) et la file à dessiner maintenant. connu : ce qui est
 * en ligne, déjà lu (le serveur le garde en mémoire) : la liste des fichiers n'est pas relue. Sinon : la plus récente
 * de celle du disque (disque() : le serveur) et de celle publiée (LISTE) ; à défaut, l'ancienne table fichiers.
 */
export async function lireEtat(cf, { tout = false, max = 3000, connu = null, disque = null } = {}) {
  const maintenant = new Date().toISOString();
  // Deux lectures par l'index sur apres (un OR le contournerait) : seules les lignes à prendre sont lues, pas celles
  // remises à plus tard (titres inconnus, redemandés dans un jour).
  const nouvelles = await cf.sql("SELECT chemin, essais FROM demandes WHERE apres IS NULL ORDER BY vu LIMIT ?", [max]);
  const file = nouvelles.length >= max ? nouvelles
    : [...nouvelles, ...await cf.sql("SELECT chemin, essais FROM demandes WHERE apres <= ? ORDER BY apres LIMIT ?", [maintenant, max - nouvelles.length])];
  // File pleine : des adresses au hasard (robot), pas des cartes de Nuvio ; on ne garde que les plus récentes.
  if (file.length >= max) await cf.sql("DELETE FROM demandes WHERE chemin NOT IN (SELECT chemin FROM demandes ORDER BY vu DESC LIMIT ?)", [max]);
  // Une adresse qui ne se dessinera jamais (réglages perso pas sous leur forme canonique) sort de la file tout de suite.
  const invalides = file.filter((d) => !cheminValable(d.chemin)).map((d) => d.chemin);
  for (let j = 0; j < invalides.length; j += 200) await cf.sql(`DELETE FROM demandes WHERE chemin IN (${invalides.slice(j, j + 200).map(texte).join(", ")})`);
  const enLigne = connu ? [...connu.values()] : await chargerListe(cf, disque);
  const parChemin = connu || new Map(enLigne.map((f) => [f.chemin, f]));
  const aFaire = new Map(file.filter((d) => cheminValable(d.chemin)).map((d) => [d.chemin, d.essais]));
  if (tout) for (const f of enLigne) if (!aFaire.has(f.chemin)) aFaire.set(f.chemin, null);
  return { parChemin, aFaire, file: file.length, enLigne: enLigne.length };
}
