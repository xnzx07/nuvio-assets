/**
 * La veille (.github/workflows/veille.yml) : chaque jour, elle relève la version de ce dont le site dépend sans en
 * avoir la main, et prévient par une issue quand ça bouge.
 *   - Nuvio TV : l'aperçu des liens recopie une version précise de l'appli (NUVIO_TV_VERSION, worker/nuvio.js).
 *     Une version plus récente publiée (pré-versions comprises) = l'aperçu est peut-être en retard sur la TV.
 *   - Les pages de réglage des addons de sources que le guide fait remplir (worker/guide.js) : une nouvelle version
 *     peut changer leurs champs, et donc les explications du guide.
 * Les versions vues sont gardées dans data/veille.json : seul un changement par rapport à la veille prévient.
 * Une source illisible (panne, page refaite) ne prévient pas : sa dernière version connue est gardée.
 *
 *   node scripts/veille.mjs
 *
 * Écrit les issues à ouvrir dans $VEILLE_SORTIE (JSON : { nuvio: {titre, corps} | null, pages: [{titre, corps}] })
 * quand la variable existe, et sort toujours avec le code 0 : c'est le workflow qui ouvre les issues.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const RACINE = resolve(import.meta.dirname, "..");
const FICHIER = resolve(RACINE, "data/veille.json");
const DELAI_MS = 20000;

const champVersion = /"version"\s*:\s*"([^"]+)"/;
// [clé, nom affiché, adresse lue, version trouvée dans la réponse]
export const SOURCES = [
  ["torrentio", "Torrentio", "https://torrentio.strem.fun/manifest.json", champVersion],
  ["streamfusion", "StreamFusion", "https://streamfusion.stremio-epsilon.ca/manifest.json", champVersion],
  ["wastream", "WAStream", "https://wastream.noplay.fr/configure", /\bv(\d+\.\d+\.\d+)\b/],
  // Pas de manifest global chez Lumio (il est propre à chaque réglage) : le numéro de son script de réglage.
  ["lumio", "Lumio", "https://mylumio.tv/configure", /configure\.js\?v=([\w.-]+)/],
];
// Le dépôt a quitté tapframe/NuvioTV (redirection). Les versions sont des pré-versions : /releases/latest les
// ignore, d'où la liste complète.
export const NUVIO_RELEASES = "https://api.github.com/repos/NuvioMedia/NuvioTV/releases?per_page=10";

const lireTexte = async (url, f, headers = {}) => {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), DELAI_MS);
  try {
    const r = await f(url, { signal: ctl.signal, headers: { "User-Agent": "veille-catalogue-fr", ...headers } });
    if (!r.ok) throw new Error(`réponse ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
};

/** Dernière version publiée de Nuvio TV (brouillons exclus), sans le « v » du début ; null si illisible. */
export async function versionNuvio(f = fetch, jeton = process.env.GITHUB_TOKEN) {
  try {
    const liste = JSON.parse(await lireTexte(NUVIO_RELEASES, f, jeton ? { Authorization: `Bearer ${jeton}` } : {}));
    const r = (Array.isArray(liste) ? liste : []).find((x) => x && !x.draft && x.tag_name);
    return r ? String(r.tag_name).replace(/^v/i, "") : null;
  } catch { return null; }
}

/** { clé: version | null } pour chaque page de réglage. */
export async function versionsPages(f = fetch) {
  const res = await Promise.all(SOURCES.map(async ([cle, , url, motif]) => {
    try { return [cle, (await lireTexte(url, f)).match(motif)?.[1] || null]; } catch { return [cle, null]; }
  }));
  return Object.fromEntries(res);
}

/** La version de Nuvio TV que recopie l'aperçu (worker/nuvio.js). */
export const versionApercu = (source = readFileSync(resolve(RACINE, "worker/nuvio.js"), "utf8")) =>
  (source.match(/NUVIO_TV_VERSION\s*=\s*"([^"]+)"/) || [])[1] || null;

/**
 * Ce qu'il faut signaler, et les versions à garder.
 * avant : data/veille.json de la veille ; pages : versionsPages() ; nuvio : versionNuvio() ; apercu : versionApercu().
 */
export function comparer(avant, pages, nuvio, apercu) {
  const garde = { ...avant };
  const issues = { nuvio: null, pages: [] };
  for (const [cle, nom] of SOURCES) {
    const v = pages[cle];
    if (!v) continue;                                    // illisible : on garde l'ancienne, sans prévenir
    if (avant[cle] && avant[cle] !== v) {
      issues.pages.push({
        titre: `Veille : ${nom} passe en ${v}`,
        corps: `La version de ${nom} est passée de ${avant[cle]} à ${v}. Sa page de réglage a peut-être changé : ` +
          `vérifier que les explications du guide (worker/guide.js) collent toujours.`,
      });
    }
    garde[cle] = v;
  }
  if (nuvio) garde.nuvio = nuvio;
  if (nuvio && apercu && nuvio !== apercu) {
    issues.nuvio = {
      titre: `Veille : Nuvio TV ${nuvio} (l'aperçu copie ${apercu})`,
      corps: `Nuvio TV ${nuvio} est publiée (https://github.com/NuvioMedia/NuvioTV/releases), alors que l'aperçu des ` +
        `liens recopie ${apercu} (NUVIO_TV_VERSION, worker/nuvio.js). Relire les changements de l'appli, mettre ` +
        `l'aperçu à jour, puis changer NUVIO_TV_VERSION : l'issue se fermera toute seule.`,
    };
  }
  return { garde, issues };
}

async function principal() {
  let avant = {};
  try { avant = JSON.parse(readFileSync(FICHIER, "utf8")); } catch { /* premier passage */ }
  const [pages, nuvio] = await Promise.all([versionsPages(), versionNuvio()]);
  const apercu = versionApercu();
  const { garde, issues } = comparer(avant, pages, nuvio, apercu);
  console.log("Lu :", JSON.stringify({ ...pages, nuvio, apercu }));
  writeFileSync(FICHIER, JSON.stringify(Object.fromEntries(Object.entries(garde).sort()), null, 1) + "\n");
  if (process.env.VEILLE_SORTIE) writeFileSync(process.env.VEILLE_SORTIE, JSON.stringify(issues));
  for (const i of [issues.nuvio, ...issues.pages].filter(Boolean)) console.log("À signaler :", i.titre);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await principal();
