/**
 * Une image « sans texte » de TMDB en a-t-elle quand même ? Des affiches étrangères y sont parfois rangées
 * sans langue par erreur (Conjuring : une affiche lituanienne avec titre et générique ; Les Soprano : un mème).
 * Poser notre logo dessus doublerait le titre. On cherche des lignes de lettres : des petites taches de même
 * hauteur, alignées et rapprochées, plus claires ou plus sombres que leur entourage. Les motifs naturels
 * (feuillages, foules, fenêtres) en forment rarement de longues.
 */
import sharp from "sharp";

const LARGEUR = 300;          // l'image est analysée à cette largeur
const RAYON = 6;              // fenêtre du contraste local (pixels)
const CONTRASTE = 38;         // écart minimal avec l'entourage pour faire partie d'une lettre
const LETTRES_LIGNE = 5;      // une ligne de texte compte au moins 5 lettres

/** Moyenne locale par image intégrale (fenêtre carrée de côté 2 × RAYON + 1). */
function moyenneLocale(g, w, h) {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let ligne = 0;
    for (let x = 0; x < w; x++) { ligne += g[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + ligne; }
  }
  const m = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - RAYON), y1 = Math.min(h, y + RAYON + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - RAYON), x1 = Math.min(w, x + RAYON + 1);
      const s = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      m[y * w + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return m;
}

/** Taches (composantes connexes) d'un masque, avec leur boîte et leur nombre de pixels. */
function taches(masque, w, h) {
  const vu = new Uint8Array(w * h), pile = new Int32Array(w * h), liste = [];
  for (let d = 0; d < w * h; d++) {
    if (!masque[d] || vu[d]) continue;
    let n = 0, haut = 1, l = w, r = -1, t = h, b = -1;
    pile[0] = d; vu[d] = 1;
    while (haut) {
      const p = pile[--haut], x = p % w, y = (p - x) / w;
      n++; if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && masque[q] && !vu[q]) { vu[q] = 1; pile[haut++] = q; }
      }
    }
    liste.push({ l, r, t, b, n, lw: r - l + 1, lh: b - t + 1 });
  }
  return liste;
}

/** Une tache qui a la forme d'une lettre (ou d'un petit groupe de lettres collées). */
const lettre = (c) => c.lh >= 5 && c.lh <= 45 && c.lw >= 2 && c.lw <= c.lh * 1.6 && c.n >= 10 && c.n / (c.lw * c.lh) >= 0.18 && c.n / (c.lw * c.lh) <= 0.9;

/** Lignes de lettres : chaînes de taches de hauteur voisine, sur la même ligne, à moins d'une hauteur l'une de l'autre. */
function lignes(lettres) {
  const tri = [...lettres].sort((a, b) => a.l - b.l), prise = new Set(), resultat = [];
  for (const depart of tri) {
    if (prise.has(depart)) continue;
    const chaine = [depart];
    let der = depart;
    for (const c of tri) {
      if (c.l <= der.r || prise.has(c)) continue;
      const hMax = Math.max(der.lh, c.lh), cy = (c.t + c.b) / 2, dy = (der.t + der.b) / 2;
      if (c.l - der.r > hMax * 1.1) continue;
      if (Math.abs(cy - dy) > hMax * 0.3 || c.lh / der.lh > 1.5 || der.lh / c.lh > 1.5) continue;
      chaine.push(c); der = c;
    }
    if (chaine.length >= LETTRES_LIGNE) { chaine.forEach((c) => prise.add(c)); resultat.push(chaine); }
  }
  return resultat;
}

/** Nombre de lignes de texte trouvées dans une image (JPEG, PNG…). */
export async function lignesDeTexte(image) {
  const { data, info } = await sharp(image).resize({ width: LARGEUR }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, m = moyenneLocale(data, w, h);
  let total = 0;
  for (const signe of [1, -1]) {
    const masque = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) masque[i] = signe * (data[i] - m[i]) > CONTRASTE ? 1 : 0;
    total += lignes(taches(masque, w, h).filter(lettre)).length;
  }
  return total;
}

const IMG = "https://image.tmdb.org/t/p/w342";
// mémoires assez grandes pour tout le stock (~10 000 titres, jusqu'à 6 images chacun) : plus rien recalculé chaque nuit
const DELAI_MS = 2500, MAX_MEMO = Number(process.env.MEMO_MAX) || 60000;
let memo = new Map();   // chemin TMDB → promesse de « a du texte » (true aussi pour une image absente ou illisible)
export function resetMemo() { memo = new Map(); }

/**
 * Promesse de « a du texte » : true (aussi pour une image absente ou illisible : écartée), false, ou null si on n'a
 * pas pu la lire (réseau, délai, TMDB en panne). null n'est pas gardé : on réessaiera à la demande suivante.
 */
function aDuTexte(chemin, fetchImpl) {
  if (!memo.has(chemin)) {
    const verdict = fetchImpl(IMG + chemin, { signal: AbortSignal.timeout(DELAI_MS) })
      .then(async (r) => {
        if (!r.ok) return r.status >= 500 || r.status === 429 ? null : true;
        const image = Buffer.from(await r.arrayBuffer());
        try { return (await lignesDeTexte(image)) > 0; } catch { return true; }
      })
      .catch(() => null);
    memo.set(chemin, verdict);
    verdict.then((v) => { if (v === null && memo.get(chemin) === verdict) memo.delete(chemin); });
    // Mémoire plafonnée : les entrées les plus anciennes sortent (une Map garde l'ordre d'arrivée).
    while (memo.size > MAX_MEMO) memo.delete(memo.keys().next().value);
  }
  return memo.get(chemin);
}

/**
 * { chemin : la première image vraiment sans texte parmi les candidates (dans l'ordre de TMDB), ou null ; incertain :
 * une candidate d'avant n'a pas pu être lue (le choix peut changer : l'affiche prend alors le cache court) }.
 */
export async function choisirSansTexte(chemins, fetchImpl = fetch) {
  const verdicts = await Promise.all((chemins || []).map((c) => aDuTexte(c, fetchImpl)));
  const i = verdicts.indexOf(false);
  return { chemin: i < 0 ? null : chemins[i], incertain: verdicts.slice(0, i < 0 ? verdicts.length : i).includes(null) };
}

/** La première image vraiment sans texte parmi les candidates (dans l'ordre de TMDB), ou null. */
export const sansTexte = (chemins, fetchImpl = fetch) => choisirSansTexte(chemins, fetchImpl).then((x) => x.chemin);
