/**
 * Les affiches maison en fichiers statiques, dessinées sur une machine GitHub (workflow affiches-statiques.yml) : le
 * secours du serveur des affiches (affiches/serveur.js), qui dessine à la demande. Quand le serveur s'est signalé il y a
 * moins de 15 minutes, rien à faire ici (sauf --force). Dessin et publication : affiches/lib/statiques.js.
 *   node scripts/affiches-statiques.mjs file   les affiches demandées et absentes (table demandes)
 *   node scripts/affiches-statiques.mjs tout   en plus, toutes celles déjà publiées (statuts du jour), chaque nuit
 *   node scripts/affiches-statiques.mjs code   seulement le code du Worker (sans lire la base)
 *   node scripts/affiches-statiques.mjs sources   la qualité chez Torrentio des titres des affiches, rangée dans la base :
 *                                                le secours du serveur quand le relais de Vercel ne répond pas (chaque nuit)
 *   … --essai                                    dessine sans rien publier ni écrire (20 affiches au plus)
 * Environnement : CLOUDFLARE_API_TOKEN (Workers Scripts et D1 en écriture), CLOUDFLARE_ACCOUNT_ID, D1_AFFICHES (id
 * de la base), TMDB_API_KEY ; MDBLIST_API_KEY facultatif ; AFFICHES_WORKER (nom du Worker, « affiches » par défaut).
 * Sans RELAIS_KEY ici : jamais StreamFusion (chaque appel à l'addon y compte une requête) ; les affiches ont l'avis VF
 * de la photo du jour.
 */
import { createServer } from "node:http";
import { makeHandler } from "../affiches/api/affiche.js";
import { makeTendances } from "../affiches/api/tendances.js";
import { makeNotes } from "../affiches/api/notes.js";
import { makeVf } from "../affiches/api/vf.js";
import { makeQualite } from "../affiches/api/qualite.js";
import { creerCloudflare, dessinerStatique, dessinerTout, publierEtEnregistrer, lireEtat, cheminValable, chargerListe } from "../affiches/lib/statiques.js";
import { lireTorrentio } from "../affiches/lib/qualite.js";
import { titleFacts } from "../affiches/lib/tmdb.js";

const mode = process.argv[2] || "file", force = process.argv.includes("--force"), essai = process.argv.includes("--essai");
const E = process.env;
for (const v of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "D1_AFFICHES", "TMDB_API_KEY"]) if (!E[v]) throw new Error(`${v} manquante`);
const PORT = 8791, BASE = `http://127.0.0.1:${PORT}`;
const cf = creerCloudflare({ jeton: E.CLOUDFLARE_API_TOKEN, compte: E.CLOUDFLARE_ACCOUNT_ID, base: E.D1_AFFICHES, worker: E.AFFICHES_WORKER || "affiches" });

// code : seulement le code du Worker, ses fichiers gardés, sans lire la base (bloquée quand le compte a dépassé ses
// lignes lues du jour).
if (mode === "code") { await cf.mettreAJourCode(); console.log("code du Worker remis en ligne"); process.exit(0); }
if (!essai) await cf.preparer();
if (mode === "sources") {
  // Les titres des affiches en ligne et demandées, une fois chacun (tous styles et formes confondus).
  const lignes = [...await chargerListe(cf), ...await cf.sql("SELECT chemin FROM demandes")];
  const titres = [...new Map(lignes.map((l) => cheminValable(l.chemin)).filter(Boolean).map((a) => [`${a.type}:${a.id}`, { type: a.type, id: a.id }])).values()];
  console.log(`sources : ${titres.length} titres`);
  const t0 = Date.now(), lus = [];
  let i = 0, rates = 0;
  // 4 à la fois : Torrentio reste ménagé (une lecture par titre et par nuit).
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (i < titres.length) {
      const t = titres[i++];
      try {
        const f = await titleFacts({ TMDB_API_KEY: E.TMDB_API_KEY }, { type: t.type, id: t.id, imdb: t.id.startsWith("tt") ? t.id : "" });
        if (!f || !f.imdbId) continue;
        const video = t.type === "series" ? `series/${f.imdbId}:${f.lastSeason || 1}:1` : `movie/${f.imdbId}`;
        const q = await lireTorrentio(video);
        if (q) lus.push([video, JSON.stringify(q)]); else rates++;
      } catch (e) { rates++; }
    }
  }));
  const maintenant = new Date().toISOString(), texte = (v) => `'${String(v).replace(/'/g, "''")}'`;
  for (let j = 0; j < lus.length; j += 100) {
    await cf.sql(`INSERT INTO sources (video, q, lu) VALUES ${lus.slice(j, j + 100).map(([v, q]) => `(${texte(v)}, ${texte(q)}, ${texte(maintenant)})`).join(", ")} ON CONFLICT (video) DO UPDATE SET q = excluded.q, lu = excluded.lu`);
  }
  // Plus lus depuis 30 jours : plus d'affiche pour eux.
  await cf.sql("DELETE FROM sources WHERE lu < ?", [new Date(Date.now() - 30 * 86400000).toISOString()]);
  console.log(`sources : ${lus.length} lues, ${rates} sans réponse, en ${Math.round((Date.now() - t0) / 1000)} s`);
  process.exit(0);
}
if (!force && !essai && await cf.serveurRecent()) { console.log("le serveur des affiches est là : rien à faire ici"); process.exit(0); }
const { parChemin, aFaire, file, enLigne } = await lireEtat(cf, { tout: mode === "tout" });
console.log(`${mode} : ${aFaire.size} affiches à dessiner (${file} dans la file, ${enLigne} en ligne)`);
if (essai) for (const c of [...aFaire.keys()].slice(20)) aFaire.delete(c);
if (!aFaire.size) process.exit(0);

// Le service d'affiches sur cette machine : aucune réserve (rien à relire), ni disjoncteur ni budget (ils protègent
// Vercel, pas cette machine) ; ses relais (qualité, notes, VF, tendances) ici même, sans clé.
const env = { TMDB_API_KEY: E.TMDB_API_KEY, MDBLIST_API_KEY: E.MDBLIST_API_KEY, RESERVE: "off", STREAMFUSION: "off", RENDUS_MINUTE: "1000000", RENDUS_HEURE: "1000000", CPU_BUDGET_MIN: "1000000" };
const affiche = makeHandler({ env });
const relais = { tendances: makeTendances({ env }), notes: makeNotes({ env }), vf: makeVf({ env }), qualite: makeQualite({ env }) };
const serveur = createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  let r;
  try {
    const t = /^\/tendances\/(movie|series)\.json$/.exec(url.pathname);
    const q = /^\/qualite\/(movie|series)\/([^/]+)\.json$/.exec(url.pathname);
    if (t) r = await relais.tendances(new Request(`${BASE}/api/tendances?type=${t[1]}`));
    else if (q) r = await relais.qualite(new Request(`${BASE}/api/qualite?type=${q[1]}&video=${decodeURIComponent(q[2])}`));
    else if (/^\/notes\/tt\d{1,10}\.json$/.test(url.pathname)) r = await relais.notes(new Request(`${BASE}/api/notes?imdb=${url.pathname.slice(7, -5)}`));
    else if (url.pathname === "/vf.json") r = await relais.vf(new Request(`${BASE}/api/vf${url.search}`));
    else r = new Response("introuvable", { status: 404 });
  } catch (e) { r = new Response(String(e), { status: 500 }); }
  const entetes = Object.fromEntries([...r.headers].filter(([k]) => !["content-encoding", "content-length", "transfer-encoding"].includes(k)));
  res.writeHead(r.status, entetes);
  res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((ok) => serveur.listen(PORT, "127.0.0.1", ok));

const t0 = Date.now(), cpu0 = process.cpuUsage();
const fait = await dessinerTout([...aFaire], (chemin) => dessinerStatique(affiche, BASE, chemin), parChemin, { enMemeTemps: 8 });
serveur.close();
const ms = (c) => Math.round((c.user + c.system) / 1000);
console.log(`${aFaire.size} affiches en ${Math.round((Date.now() - t0) / 1000)} s, CPU ${ms(process.cpuUsage(cpu0))} ms : ${JSON.stringify(fait.bilan)}`);
if (essai) { console.log("essai : rien de publié", [...parChemin.values()].filter((f) => f.change).length, "prêtes"); process.exit(0); }
const p = await publierEtEnregistrer(cf, parChemin, fait.nouveaux, fait);
console.log(p.publie ? `publié : ${p.envoyes} envoyés, ${p.retirees} retirés` : "rien de publié (rien de nouveau, ou une autre publication en cours)");
process.exit(0);
