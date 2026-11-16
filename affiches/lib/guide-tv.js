/**
 * Le guide TV public (XML-TV-Fr, xmltvfr.fr) pour la page TV de Kalyo : les chaînes dont le fournisseur Xtream ne donne
 * pas le programme le prennent ici, par leur nom. Le fichier (18 Mo compressé, ~145 Mo ouvert) est lu au fil de l'eau
 * une fois par jour ; seules les 36 prochaines heures sont gardées, en mémoire et sur le disque (relu au démarrage).
 * Servi par serveur.js : /guide/index.json et /guide/<id>.json.
 */
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { readFileSync, writeFileSync, renameSync } from "node:fs";

export const GUIDE_SOURCE = "https://xmltvfr.fr/xmltv/xmltv.xml.gz";
const AVANT_S = 3600;
const APRES_S = 36 * 3600;
const RESUME_MAX = 600;
const JOUR_MS = 24 * 3600 * 1000;
/** Rafraîchi une fois par jour à partir de cette heure UTC (le guide public est refait dans la nuit). */
const HEURE_UTC = 5;

const ENTITES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const texte = (s) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITES[e.toLowerCase()] ?? m;
  }).trim();
const attribut = (balise, nom) => {
  const m = new RegExp(`\\s${nom}="([^"]*)"`).exec(balise);
  return m ? texte(m[1]) : null;
};
const enfant = (bloc, nom) => {
  const m = new RegExp(`<${nom}\\b[^>]*>([\\s\\S]*?)</${nom}>`).exec(bloc);
  return m ? texte(m[1]) : "";
};

/** « 20261115203000 +0100 » → secondes Unix ; null si illisible. */
export function dateXmltv(s) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-])?(\d{2})?(\d{2})?/.exec(s || "");
  if (!m) return null;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) / 1000;
  const decalage = m[7] ? (m[7] === "-" ? -1 : 1) * ((+m[8] || 0) * 3600 + (+m[9] || 0) * 60) : 0;
  return utc - decalage;
}

/**
 * Lit un guide XMLTV déjà décompressé, morceau par morceau (une balise peut être coupée entre deux morceaux). Garde les
 * programmes qui finissent après maintenant − 1 h et commencent avant maintenant + 36 h.
 */
export async function lireGuide(flux, { maintenant }) {
  const chaines = [];
  const programmes = new Map();
  let tampon = "";
  const decodeur = new TextDecoder("utf-8");
  const prendre = () => {
    for (;;) {
      const c = tampon.indexOf("<channel ");
      const p = tampon.indexOf("<programme ");
      const debut = c < 0 ? p : p < 0 ? c : Math.min(c, p);
      if (debut < 0) {
        // rien de commencé : on garde seulement la fin, où une balise peut être coupée
        tampon = tampon.slice(-20);
        return;
      }
      const estChaine = debut === c;
      const fin = tampon.indexOf(estChaine ? "</channel>" : "</programme>", debut);
      if (fin < 0) {
        tampon = tampon.slice(debut);
        return;
      }
      const bloc = tampon.slice(debut, fin);
      tampon = tampon.slice(fin + (estChaine ? 10 : 12));
      const ouvrante = bloc.slice(0, bloc.indexOf(">") + 1);
      if (estChaine) {
        const id = attribut(ouvrante, "id");
        const name = enfant(bloc, "display-name");
        if (id) chaines.push({ id, name: name || id });
        continue;
      }
      const id = attribut(ouvrante, "channel");
      const start = dateXmltv(attribut(ouvrante, "start"));
      const end = dateXmltv(attribut(ouvrante, "stop"));
      if (!id || start === null || end === null || end <= start) continue;
      if (end <= maintenant - AVANT_S || start >= maintenant + APRES_S) continue;
      const liste = programmes.get(id) ?? [];
      liste.push({ title: enfant(bloc, "title"), description: enfant(bloc, "desc").slice(0, RESUME_MAX), start, end });
      programmes.set(id, liste);
    }
  };
  for await (const morceau of flux) {
    tampon += typeof morceau === "string" ? morceau : decodeur.decode(morceau, { stream: true });
    prendre();
  }
  tampon += decodeur.decode();
  prendre();
  for (const liste of programmes.values()) liste.sort((a, b) => a.start - b.start);
  return { chaines, programmes };
}

/**
 * Le guide du serveur : `index()` (les chaînes qui ont des programmes) et `chaine(id)`, `rafraichir()` (télécharge et
 * relit), `demarrer()` (copie disque de moins de 24 h, sinon téléchargement ; puis chaque jour après 5 h UTC).
 */
export function creerGuide({ fetch: fetchImpl = globalThis.fetch, horloge = Date.now, disque = null, source = GUIDE_SOURCE, journal = console } = {}) {
  let etat = { t: 0, chaines: [], programmes: new Map() };
  let encours = null;
  let minuterie = null;

  const appliquer = (t, chaines, programmes) => {
    // seulement les chaînes qui ont quelque chose à montrer
    etat = { t, chaines: chaines.filter((c) => programmes.has(c.id)), programmes };
  };

  function ecrire() {
    if (!disque) return;
    try {
      writeFileSync(disque + ".tmp", JSON.stringify({ t: etat.t, chaines: etat.chaines, programmes: Object.fromEntries(etat.programmes) }));
      renameSync(disque + ".tmp", disque);
    } catch (e) {
      journal.warn(`guide TV sur le disque : ${e.message}`);
    }
  }

  function relire() {
    if (!disque) return false;
    try {
      const o = JSON.parse(readFileSync(disque, "utf8"));
      if (!o || typeof o.t !== "number" || horloge() - o.t > JOUR_MS) return false;
      appliquer(o.t, o.chaines || [], new Map(Object.entries(o.programmes || {})));
      return true;
    } catch {
      return false;
    }
  }

  async function telecharger() {
    const r = await fetchImpl(source, { headers: { "User-Agent": "Mozilla/5.0 (guide TV)" }, signal: AbortSignal.timeout(5 * 60000) });
    if (!r.ok || !r.body) throw new Error(`guide TV : ${r.status}`);
    const flux = Readable.fromWeb(r.body).pipe(createGunzip());
    const t = horloge();
    const { chaines, programmes } = await lireGuide(flux, { maintenant: Math.floor(t / 1000) });
    if (!programmes.size) throw new Error("guide TV vide");
    appliquer(t, chaines, programmes);
    ecrire();
    journal.log(`guide TV : ${etat.chaines.length} chaînes`);
  }

  const rafraichir = () => {
    if (!encours) encours = telecharger().catch((e) => journal.warn(e.message)).finally(() => { encours = null; });
    return encours;
  };

  return {
    index: () => etat.chaines,
    chaine: (id) => etat.programmes.get(id) ?? null,
    age: () => (etat.t ? horloge() - etat.t : null),
    rafraichir,
    demarrer() {
      if (!relire()) void rafraichir();
      // chaque heure : un nouveau jour UTC passé 5 h et une copie d'un autre jour → téléchargée
      minuterie = setInterval(() => {
        const d = new Date(horloge());
        const jourCopie = etat.t ? new Date(etat.t).toISOString().slice(0, 10) : "";
        if (d.getUTCHours() >= HEURE_UTC && d.toISOString().slice(0, 10) !== jourCopie) void rafraichir();
      }, 3600 * 1000);
      minuterie.unref?.();
    },
    arreter() {
      if (minuterie) clearInterval(minuterie);
    },
  };
}
