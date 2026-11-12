/**
 * Saisons d'une série comptées comme Cinemeta. TMDB range parfois un anime entier en une saison (Jujutsu Kaisen :
 * une « saison 1 » de 59 épisodes, Frieren, Solo Leveling) ou le découpe autrement (One Piece, Naruto), alors que
 * Cinemeta (IMDb/TVDB) a les saisons de la diffusion. Les addons de sources (Torrentio…) cherchent les épisodes
 * d'après Cinemeta (tt…:2:1) : avec la numérotation de TMDB, la fiche montrait une seule saison et les épisodes
 * après le 24e ne trouvaient pas leurs sources.
 *
 * Les épisodes sont mis bout à bout des deux côtés (spéciaux à part) : le n-ième de TMDB prend la saison et le
 * numéro du n-ième de Cinemeta. Les épisodes que Cinemeta a en plus à la fin (saison annoncée) restent à ajouter ;
 * ceux que TMDB a en plus continuent la dernière saison de Cinemeta, ou en ouvrent une s'ils commencent une
 * nouvelle saison chez TMDB.
 */
import { CINEMETA } from "./cinemeta.js";

const CINEMETA_WAIT_MS = 2500;

/** Les épisodes d'une série chez Cinemeta (gardés un jour par Cloudflare) : [] s'il ne la connaît pas, null en panne. */
export async function videosCinemeta(imdb) {
  try {
    const r = await fetch(`${CINEMETA}/meta/series/${imdb}.json`, {
      cf: { cacheTtl: 86400, cacheEverything: true }, signal: AbortSignal.timeout(CINEMETA_WAIT_MS),
    });
    if (r.status === 404) return [];
    if (!r.ok) return null;
    const j = await r.json();
    return (j && j.meta && Array.isArray(j.meta.videos)) ? j.meta.videos : [];
  } catch (e) {
    return null;
  }
}

// Rangées : les épisodes de Cinemeta réduits (saison, numéro, date) gardés 6 h dans la mémoire de l'instance. Une page
// n'a droit qu'à quelques appels à Cinemeta (budget.cinemeta) : 50 appels sortants au plus par requête chez Cloudflare.
const MEMO_MS = 6 * 3600e3, MAX_MEMO = 300;
const memo = new Map();
export const oublierCinemeta = () => memo.clear();

/** Comme videosCinemeta, réduites et gardées ; undefined quand le budget de la page est épuisé (pas lues). */
export async function videosReduites(imdb, budget) {
  const m = memo.get(imdb);
  if (m && Date.now() - m.at < MEMO_MS) return m.videos;
  if (!budget || !(budget.cinemeta > 0)) return undefined;
  budget.cinemeta--;
  const brut = await videosCinemeta(imdb);
  if (!brut) return null;
  const videos = brut.map((v) => ({ season: v.season, episode: v.episode, released: v.released || null }));
  memo.delete(imdb);
  memo.set(imdb, { at: Date.now(), videos });
  if (memo.size > MAX_MEMO) memo.delete(memo.keys().next().value);
  return videos;
}

const ordre =(a, b) => a.season - b.season || a.episode - b.episode;

/**
 * Mêmes saisons des deux côtés, à un épisode ou deux près (La Villa des cœurs brisés : 55 épisodes en saison 2 chez
 * TMDB, 56 chez Cinemeta) : mêmes numéros de saison (Cinemeta peut en avoir de plus à la fin, annoncées), au plus
 * 2 épisodes d'écart par saison (10 % pour la dernière, qui se remplit) et des écarts tous dans le même sens. Mis bout
 * à bout, l'épisode en moins décalait d'un cran tous ceux des saisons suivantes : on garde alors la numérotation de
 * TMDB. Des écarts qui se compensent (Hunter x Hunter : 4 épisodes de la saison 2 de Cinemeta à la fin de la
 * saison 1 chez TMDB) sont une frontière déplacée : le bout à bout reste. Les dates de saison de TMDB ne servent pas,
 * elles sont parfois fausses (Hunter x Hunter : saison 2 datée du 15 décembre, son 1er épisode du 20 janvier).
 */
function memesSaisons(nos, leurs) {
  const chez = new Map();
  for (const v of leurs) chez.set(v.season, (chez.get(v.season) || 0) + 1);
  const derniere = nos[nos.length - 1].season_number;
  if ([...chez.keys()].some((n) => n < derniere && !nos.some((s) => s.season_number === n))) return false;
  const ecarts = [];
  for (const s of nos) {
    const c = chez.get(s.season_number);
    if (!c) return false;
    const e = (s.episode_count || 0) - c;
    const permis = s.season_number === derniere ? Math.max(2, 0.1 * Math.max(c, s.episode_count || 0)) : 2;
    if (Math.abs(e) > permis) return false;
    if (e) ecarts.push(e);
  }
  return ecarts.every((e) => Math.sign(e) === Math.sign(ecarts[0]));
}

/**
 * seasons = d.seasons de TMDB, videos = celles de Cinemeta → null (même découpage, ou Cinemeta trop incomplet
 * pour s'y fier), ou { place(saison, épisode) de TMDB → { season, episode }, restants : vidéos de Cinemeta sans
 * épisode TMDB, saisons : comme d.seasons, recomptées }.
 */
export function decoupageCinemeta(seasons, videos) {
  const leurs = (videos || []).filter((v) => v && v.season > 0 && v.episode > 0).sort(ordre);
  const nos = (seasons || []).filter((s) => s.season_number > 0).sort((a, b) => a.season_number - b.season_number);
  const total = nos.reduce((t, s) => t + (s.episode_count || 0), 0);
  if (!leurs.length || !total || leurs.length < total / 2) return null;
  const debut = {}, taille = {};
  let k = 0;
  const notre = [];
  for (const s of nos) {
    debut[s.season_number] = k;
    taille[s.season_number] = s.episode_count || 0;
    for (let e = 1; e <= (s.episode_count || 0); e++, k++) notre.push({ season: s.season_number, episode: e });
  }
  const n = Math.min(notre.length, leurs.length);
  if (notre.slice(0, n).every((x, i) => x.season === leurs[i].season && x.episode === leurs[i].episode)) return null;
  if (memesSaisons(nos, leurs)) return null;

  const dernier = leurs[leurs.length - 1];
  const charniere = notre[leurs.length - 1];   // l'épisode TMDB placé sur le dernier de Cinemeta, s'il existe
  const place = (season, episode) => {
    if (season === 0 || !(season in debut)) return { season, episode };
    // TMDB numérote parfois tout l'anime d'un bout à l'autre (One Piece : la saison 2 commence au 62).
    const rang = episode > taille[season] && episode > debut[season] ? episode - debut[season] : episode;
    const i = debut[season] + rang - 1;
    if (i < leurs.length) return { season: leurs[i].season, episode: leurs[i].episode };
    if (!charniere) return { season, episode: rang };
    return season === charniere.season
      ? { season: dernier.season, episode: dernier.episode + rang - charniere.episode }
      : { season: dernier.season + season - charniere.season, episode: rang };
  };

  // Saisons recomptées : celles de Cinemeta (date de leur premier épisode), allongées des épisodes TMDB en plus.
  const compte = new Map();
  for (const v of leurs) {
    const s = compte.get(v.season) || { season_number: v.season, episode_count: 0, air_date: v.released ? v.released.slice(0, 10) : null };
    s.episode_count = Math.max(s.episode_count, v.episode);
    compte.set(v.season, s);
  }
  for (const x of notre.slice(leurs.length)) {
    const p = place(x.season, x.episode);
    const s = compte.get(p.season) || { season_number: p.season, episode_count: 0, air_date: (nos.find((o) => o.season_number === x.season) || {}).air_date || null };
    s.episode_count = Math.max(s.episode_count, p.episode);
    compte.set(p.season, s);
  }
  const speciaux = (seasons || []).filter((s) => s.season_number === 0);
  return {
    place,
    restants: leurs.slice(notre.length),
    saisons: [...speciaux, ...[...compte.values()].sort((a, b) => a.season_number - b.season_number)],
  };
}

/**
 * La fiche TMDB d'une série vue avec ce découpage : saisons, dernier et prochain épisode renumérotés, pour que
 * « Saison 3 terminée », « Saison 4 annoncée » ou le rappel de la saison d'avant parlent des mêmes saisons que
 * la liste des épisodes. Le type « finale » de TMDB est oublié : il marquait la fin de sa saison à lui.
 */
export function ficheRecomptee(d, decoupage) {
  const renum = (e) => {
    if (!e) return e;
    const p = decoupage.place(e.season_number, e.episode_number);
    return { ...e, season_number: p.season, episode_number: p.episode, episode_type: undefined };
  };
  return {
    ...d,
    seasons: decoupage.saisons,
    number_of_seasons: decoupage.saisons.filter((s) => s.season_number > 0).length,
    last_episode_to_air: renum(d.last_episode_to_air),
    next_episode_to_air: renum(d.next_episode_to_air),
  };
}

const jourDe = (s) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
const decale = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Les saisons de TMDB comptent-elles autrement que Cinemeta (nombre d'épisodes d'une saison, hors spéciaux) ? */
export function comptesDifferents(seasons, videos) {
  const leurs = new Map();
  for (const v of videos || []) if (v && v.season > 0 && v.episode > 0) leurs.set(v.season, (leurs.get(v.season) || 0) + 1);
  const nos = (seasons || []).filter((s) => s.season_number > 0);
  return leurs.size > 0 && nos.some((s) => (s.episode_count || 0) !== (leurs.get(s.season_number) || 0));
}

/**
 * Comme decoupageCinemeta, mais épisode par épisode d'après la date de diffusion : chaque épisode TMDB prend celui de
 * Cinemeta sorti le même jour (la veille ou le lendemain si aucun ne tombe ce jour-là, pour le décalage horaire).
 * Koh-Lanta : TMDB coupe chaque émission en deux (« Émission 8 (1) », « (2) », 32 épisodes pour 16) ; mis bout à bout,
 * tout glissait et « All Stars » devenait une saison 35. Par date, les deux parties d'une émission prennent le même
 * épisode (tt…:34:8), et la fiche les réunit.
 * episodes = ceux de TMDB ({ season_number, episode_number, air_date }), positionnel = le résultat de
 * decoupageCinemeta (repli des épisodes d'avant la première date reconnue). null sans saison coupée en parties, si les
 * dates ne suffisent pas (moins de 90 % des épisodes de la période de Cinemeta retrouvés) ou si l'ordre recule.
 */
export function decoupageParDates(seasons, videos, episodes, positionnel) {
  const leurs = (videos || []).filter((v) => v && v.season > 0 && v.episode > 0).sort(ordre);
  const nos = (episodes || []).filter((e) => e && e.season_number > 0 && e.episode_number > 0)
    .map((e) => ({ season: e.season_number, episode: e.episode_number, jour: jourDe(e.air_date) })).sort(ordre);
  if (!leurs.length || !nos.length) return null;
  const parJour = new Map();
  for (const v of leurs) {
    const j = jourDe(v.released);
    if (j) parJour.set(j, [...(parJour.get(j) || []), v]);
  }
  if (!parJour.size) return null;
  const jours = [...parJour.keys()].sort();
  const premier = jours[0], dernier = jours[jours.length - 1];
  const nosJours = new Set(nos.map((x) => x.jour).filter(Boolean));
  const repli = positionnel ? positionnel.place : (season, episode) => ({ season, episode });

  const rangDuJour = new Map(), depart = new Map(), cibles = new Map();
  // Sans épisode Cinemeta ce jour-là (au-delà de Cinemeta) : le suivant du précédent, jamais le même.
  let cur = null, periode = 0, trouves = 0;
  const parties = new Map();   // saison TMDB → épisodes placés sur le même que le précédent
  for (const x of nos) {
    let cands = x.jour && parJour.get(x.jour);
    // Un jour d'écart seulement si la série ne sort pas tous les jours (sinon c'est l'épisode d'à côté).
    if (!cands && x.jour) {
      for (const n of [-1, 1]) {
        const j = decale(x.jour, n);
        if (!nosJours.has(j) && parJour.has(j)) { cands = parJour.get(j); break; }
      }
    }
    const rang = x.jour ? rangDuJour.get(x.jour) || 0 : 0;
    if (x.jour) rangDuJour.set(x.jour, rang + 1);
    // Premier épisode TMDB du jour : les épisodes Cinemeta de ce jour déjà pris (Naruto : TMDB le date d'une semaine
    // plus tôt, un épisode d'avance) sont sautés ; les suivants du même jour continuent de là.
    if (cands && rang === 0) {
      const libre = cur ? cands.findIndex((c) => ordre(c, cur.cible) > 0) : 0;
      depart.set(x.jour, libre < 0 ? cands.length - 1 : libre);
    }
    if (x.jour && x.jour >= premier && x.jour <= dernier) periode++;
    let cible;
    if (cands) {
      if (x.jour >= premier && x.jour <= dernier) trouves++;
      const c = cands[Math.min((depart.get(x.jour) || 0) + rang, cands.length - 1)];
      cible = { season: c.season, episode: c.episode };
    } else if (!cur) cible = repli(x.season, x.episode);
    else if (x.season === cur.season) cible = { season: cur.cible.season, episode: cur.cible.episode + 1 };
    else cible = { season: cur.cible.season + x.season - cur.season, episode: 1 };
    if (cur && ordre(cible, cur.cible) < 0) return null;
    if (cur && cur.season === x.season && ordre(cible, cur.cible) === 0) parties.set(x.season, (parties.get(x.season) || 0) + 1);
    cibles.set(`${x.season}:${x.episode}`, cible);
    cur = { season: x.season, jour: x.jour, cible };
  }
  // Seulement pour des épisodes vraiment coupés en parties : une saison TMDB dont 40 % des épisodes (2 au moins)
  // sont la suite du précédent. Sinon les dates, parfois fausses d'une semaine chez l'un ou l'autre (One Piece),
  // feraient plus de mal que le bout à bout.
  const coupee = (seasons || []).some((s) => s.season_number > 0 && (parties.get(s.season_number) || 0) >= Math.max(2, 0.4 * (s.episode_count || 0)));
  if (!coupee || periode < 3 || trouves < periode * 0.9) return null;

  const derniere = cur.cible;
  const place = (season, episode) => cibles.get(`${season}:${episode}`) || (season === 0 ? { season, episode } : repli(season, episode));
  const compte = new Map();
  const ajoute = (p, air) => {
    const s = compte.get(p.season) || { season_number: p.season, episode_count: 0, air_date: air };
    s.episode_count = Math.max(s.episode_count, p.episode);
    compte.set(p.season, s);
  };
  for (const v of leurs) ajoute(v, jourDe(v.released));
  for (const x of nos) ajoute(cibles.get(`${x.season}:${x.episode}`), x.jour);
  const speciaux = (seasons || []).filter((s) => s.season_number === 0);
  return {
    place,
    restants: leurs.filter((v) => ordre(v, derniere) > 0),
    saisons: [...speciaux, ...[...compte.values()].sort((a, b) => a.season_number - b.season_number)],
  };
}
