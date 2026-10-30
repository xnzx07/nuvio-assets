/**
 * Le guichet de la salle 2 : « Ta programmation en 3 questions » (films, séries ou les deux ? en famille ? tes
 * abonnements ?) et 4 programmations toutes prêtes (Cinéphile, Famille, Binge, Anime), en affiches de festival.
 * Chacune donne une programmation complète avec les vrais réglages de config.js (rangées, rangées sur mesure,
 * plateformes, Découvrir, mode famille) ; la page l'applique en gardant le nom, le pays, la clé Gemini et le jeton
 * d'alerte, avec « Annuler » pendant 10 secondes.
 *
 * Proposé de lui-même seulement à la première visite (aucun réglage, pas un lien fixe, rien de gardé dans ce
 * navigateur) ; sinon, le bandeau en haut de la salle l'ouvre.
 */

/**
 * Les recettes, autonomes (reprises telles quelles dans le script de la page, et testées à part) : elles ne lisent
 * que D (rows, defaults, providers, genres, discover), les données de la page.
 */
export function creerProgrammations() {
  const copie = (o) => JSON.parse(JSON.stringify(o));
  // Une rangée sur mesure (mêmes champs que cleanCustom de config.js), décrite par les noms des genres et des
  // plateformes : ses positions sont lues dans D, comme le fait la page.
  const sur = (n, t, champs = {}) => ({ sur: { n, t, genres: [], plateformes: [], l: "", y: [0, 0], v: 0, s: 0, ...champs } });
  const ANIMATION = ["Animation"];

  /**
   * Programmation complète : rangées (identifiants, ou { sur } pour une rangée sur mesure, dans l'ordre de
   * l'accueil), plateformes, Découvrir ("movie", "series" ou tous), et le reste par défaut.
   */
  function programme(D, { rangees, p, d, f = false, e = [], m = 0 }) {
    const st = copie(D.defaults);
    const ids = new Set(D.rows.map((r) => r.id));
    const genre = (nom) => D.genres.findIndex((g) => g[0] === nom);
    const plateforme = (id) => D.providers.findIndex((x) => x.id === id);
    st.x = []; st.r = []; st.o = {};
    for (const it of rangees) {
      if (typeof it === "string") { if (ids.has(it) && !st.r.includes(it)) st.r.push(it); continue; }
      const x = it.sur;
      st.x.push({
        n: x.n, t: x.t,
        g: [...new Set(x.genres.map(genre).filter((i) => i >= 0))].sort((a, b) => a - b),
        w: [...new Set(x.plateformes.map(plateforme).filter((i) => i >= 0))].sort((a, b) => a - b),
        l: x.l, y: x.y, v: x.v, s: x.s,
      });
      st.r.push("perso-" + (st.x.length - 1));
    }
    if (p) st.p = D.providers.map((x) => x.id).filter((id) => p.includes(id));
    if (d) st.d = D.discover.filter((x) => x.type === d).map((x) => x.id);
    st.f = f; st.e = e.filter((nom) => genre(nom) >= 0); st.m = m;
    return st;
  }

  const PRETES = {
    cinephile: {
      nom: "Cinéphile", accroche: "Pépites, chefs-d'œuvre et cinéma du monde",
      recette: (D) => programme(D, { rangees: [
        "accueil-saison", "accueil-top10", "accueil-pepites",
        sur("Les chefs-d'œuvre", 0, { s: 1, v: 8 }),
        "accueil-films-cultes", "accueil-cinema-francais",
        sur("Cinéma coréen", 0, { l: "ko", s: 1, v: 7 }),
        sur("Cinéma japonais", 0, { l: "ja", s: 1, v: 7 }),
        sur("Classiques d'avant 1980", 0, { y: [1900, 1979], s: 1, v: 7.5 }),
        "accueil-vod-semaine", "accueil-vod-bientot", "accueil-attendus", "accueil-documentaires",
      ], d: "movie" }),
    },
    famille: {
      nom: "Famille", accroche: "Dessins animés, aventures et rien qui fait peur",
      recette: (D) => programme(D, { rangees: [
        "accueil-saison",
        sur("Dessins animés", 2, { genres: ANIMATION }),
        "accueil-famille",
        sur("Grandes aventures", 0, { genres: ["Aventure"] }),
        "accueil-top10",
        sur("Séries pour les enfants", 1, { genres: ["Enfants"] }),
        "accueil-nouveautes-plateformes", "accueil-vod-semaine",
      ], f: true, e: ["Horreur"] }),
    },
    binge: {
      nom: "Binge", accroche: "Des séries, encore des séries, juste un épisode de plus",
      recette: (D) => programme(D, { rangees: [
        "accueil-tendances-series", "accueil-nouveautes-plateformes",
        sur("Nouvelles séries", 1, { s: 2 }),
        "accueil-series-a-devorer",
        sur("Séries policières", 1, { genres: ["Crime"] }),
        "accueil-mini-series",
        sur("K-dramas", 1, { genres: ["Drame"], l: "ko" }),
        sur("Séries françaises", 1, { l: "fr" }),
        sur("Séries cultes", 1, { s: 1, v: 8 }),
      ], d: "series" }),
    },
    anime: {
      nom: "Anime", accroche: "Shōnen, Ghibli et toute l'animation japonaise",
      recette: (D) => programme(D, { rangees: [
        "accueil-anime",
        sur("Nouveaux anime", 1, { genres: ANIMATION, l: "ja", s: 2 }),
        sur("Anime les mieux notés", 1, { genres: ANIMATION, l: "ja", s: 1 }),
        sur("Films d'animation japonais", 0, { genres: ANIMATION, l: "ja" }),
        sur("Sur Crunchyroll", 2, { plateformes: ["283"] }),
        "accueil-saison", "accueil-tendances-series", "accueil-top10",
      ], p: [...D.defaults.p, "283", "415"] }),
    },
  };

  /** Une recette toute prête, par son nom ; null si elle n'existe pas. */
  const prete = (D, nom) => (Object.hasOwn(PRETES, nom) ? PRETES[nom].recette(D) : null);

  /**
   * Les réponses aux 3 questions : quoi ("films", "series", "deux"), famille (oui/non), plateformes (identifiants
   * TMDB ; aucune = toutes, comme d'origine).
   */
  function depuisReponses(D, { quoi = "deux", famille = false, plateformes = [] } = {}) {
    const t = quoi === "films" ? 0 : quoi === "series" ? 1 : 2;
    const choisies = D.providers.filter((x) => plateformes.includes(x.id));
    const tete = quoi === "films"
      ? ["accueil-saison", "accueil-top10", "accueil-nouveautes-plateformes", "accueil-pepites", "accueil-cinema-francais", "accueil-films-cultes"]
      : quoi === "series"
        ? ["accueil-tendances-series", "accueil-nouveautes-plateformes", sur("Nouvelles séries", 1, { s: 2 }), "accueil-series-a-devorer", "accueil-mini-series"]
        : [...D.defaults.r.filter((id) => !/^accueil-(vod-|attendus)/.test(id))];
    const fin = quoi === "series" ? [sur("Séries les mieux notées", 1, { s: 1, v: 8 })] : ["accueil-vod-semaine", "accueil-vod-bientot", "accueil-attendus"];
    const rangees = [...tete];
    if (famille) rangees.splice(1, 0, sur("Dessins animés", t, { genres: ANIMATION }), ...(quoi === "series" ? [] : ["accueil-famille"]));
    // Le meilleur de chaque abonnement (3 au plus : l'accueil reste lisible), et l'anime pour qui a Crunchyroll ou ADN.
    for (const x of choisies.slice(0, 3)) rangees.push(sur("Le meilleur de " + x.name, t, { plateformes: [x.id], s: 1 }));
    if (choisies.some((x) => x.id === "283" || x.id === "415")) rangees.push("accueil-anime");
    rangees.push(...fin);
    return programme(D, {
      rangees, p: choisies.length ? choisies.map((x) => x.id) : null,
      d: quoi === "films" ? "movie" : quoi === "series" ? "series" : null, f: famille, e: famille ? ["Horreur"] : [],
    });
  }

  return { PRETES, prete, depuisReponses };
}

// Lauriers dorés des affiches de festival : une branche dessinée une fois, retournée pour l'autre côté.
const BRANCHE = `<path d="M30 54C14 46 8 30 12 12"/><ellipse cx="11" cy="16" rx="3" ry="6.5" transform="rotate(-18 11 16)"/><ellipse cx="11" cy="27" rx="3" ry="6.5" transform="rotate(-40 11 27)"/><ellipse cx="15" cy="38" rx="3" ry="6.5" transform="rotate(-58 15 38)"/><ellipse cx="22" cy="47" rx="3" ry="6.5" transform="rotate(-72 22 47)"/><ellipse cx="18" cy="21" rx="2.6" ry="5.5" transform="rotate(26 18 21)"/><ellipse cx="20" cy="32" rx="2.6" ry="5.5" transform="rotate(8 20 32)"/><ellipse cx="25" cy="41" rx="2.6" ry="5.5" transform="rotate(-10 25 41)"/>`;
const LAURIERS = `<svg class="lauriers" viewBox="0 0 120 60" aria-hidden="true"><g>${BRANCHE}</g><g transform="matrix(-1 0 0 1 120 0)">${BRANCHE}</g></svg>`;

// Chaque affiche : un décor (soleil, pellicule, étoiles…), la mention du festival et 3 rangées à l'affiche.
const AFFICHES = [
  ["cinephile", "Sélection officielle", "Chefs-d'œuvre · Pépites · Cinéma coréen"],
  ["famille", "Tous publics", "Dessins animés · Aventures · Séries enfants"],
  ["binge", "Saison intégrale", "Nouvelles séries · Policières · K-dramas"],
  ["anime", "Grand prix anime", "Nouveaux anime · Films japonais · Crunchyroll"],
];

/** Le bandeau en haut de la salle 2, et la fenêtre du guichet. */
export const GUICHET_DEPART = `
      <div class="depart" id="depart">
        <p><b>Pas d'idée ?</b> Réponds à 3 questions, ou pars d'une programmation toute prête : tu pourras tout changer ensuite.</p>
        <div class="depart-btns"><button type="button" class="depart-btn" id="depart-questions">Réponds à 3 questions</button><button type="button" class="depart-btn line" id="depart-pretes">Programmations toutes prêtes</button></div>
      </div>`;

const { PRETES } = creerProgrammations();
export function guichetHTML(noms = PRETES) {
  const affiches = AFFICHES.map(([id, mention, rangees]) => `<button type="button" class="festival f-${id}" data-prete="${id}" aria-describedby="fest-${id}">
            <span class="f-decor" aria-hidden="true"></span>
            <span class="f-mention">${LAURIERS}<small>${mention}</small></span>
            <span class="f-titre">${noms[id].nom}</span>
            <span class="f-accroche" id="fest-${id}">${noms[id].accroche}</span>
            <span class="f-rangees" aria-hidden="true">${rangees}</span>
          </button>`).join("\n          ");
  return `
  <div class="guichet" id="guichet" role="dialog" aria-modal="true" aria-labelledby="guichet-titre" hidden>
    <div class="guichet-boite">
      <button type="button" class="guichet-x" id="guichet-fermer" aria-label="Fermer le guichet">✕</button>
      <div class="guichet-vue" id="guichet-accueil">
        <p class="guichet-sur">Le guichet</p>
        <h2 id="guichet-titre" tabindex="-1">Ta programmation en 3 questions</h2>
        <p class="guichet-sub">Films ou séries, en famille ou pas, tes abonnements : on te prépare un accueil complet. Rien n'est figé, tout se change ensuite.</p>
        <button type="button" class="guichet-go" id="guichet-questions">Répondre aux 3 questions <span aria-hidden="true">→</span></button>
        <h3 class="guichet-ou">Ou une programmation toute prête</h3>
        <div class="festivals">
          ${affiches}
        </div>
      </div>
      <form class="guichet-vue" id="guichet-form" hidden novalidate>
        <ol class="guichet-pas" aria-hidden="true"><li></li><li></li><li></li></ol>
        <fieldset class="guichet-q" data-q="0">
          <legend tabindex="-1"><small>Question 1 sur 3</small>Films, séries ou les deux ?</legend>
          <div class="guichet-choix">
            <label><input type="radio" name="quoi" value="films"><span><b>Des films</b><small>Tendances, pépites, cinéma français, sorties</small></span></label>
            <label><input type="radio" name="quoi" value="series"><span><b>Des séries</b><small>À dévorer, mini-séries, nouveautés</small></span></label>
            <label><input type="radio" name="quoi" value="deux" checked><span><b>Les deux</b><small>Un peu de tout, comme d'origine</small></span></label>
          </div>
        </fieldset>
        <fieldset class="guichet-q" data-q="1" hidden>
          <legend tabindex="-1"><small>Question 2 sur 3</small>En famille ?</legend>
          <div class="guichet-choix">
            <label><input type="radio" name="famille" value="oui"><span><b>Oui, avec des enfants</b><small>Mode famille : tous publics, pas d'horreur, des dessins animés</small></span></label>
            <label><input type="radio" name="famille" value="non" checked><span><b>Non, entre grands</b><small>Tout le catalogue</small></span></label>
          </div>
        </fieldset>
        <fieldset class="guichet-q" data-q="2" hidden>
          <legend tabindex="-1"><small>Question 3 sur 3</small>Tes abonnements ?</legend>
          <p class="guichet-aide">Coche ceux que tu as : ils font tes «&nbsp;Nouveautés sur tes plateformes&nbsp;» et une rangée «&nbsp;Le meilleur de…&nbsp;» (3 au plus). Rien de coché : toutes les plateformes, comme d'origine.</p>
          <div class="chips" id="guichet-plateformes"></div>
        </fieldset>
        <div class="guichet-nav">
          <button type="button" class="guichet-retour" id="guichet-retour">← Retour</button>
          <button type="submit" class="guichet-go" id="guichet-suivant">Suivant <span aria-hidden="true">→</span></button>
        </div>
      </form>
    </div>
  </div>`;
}

export const GUICHET_CSS = `/* ---------- Le guichet : 3 questions et programmations toutes prêtes (worker/guichet.js) ---------- */
.depart { display: flex; align-items: center; justify-content: space-between; gap: 12px 18px; flex-wrap: wrap; padding: 14px 18px; border-radius: 14px;
  border: 1.5px dashed rgba(255,207,107,.45); background: linear-gradient(100deg, rgba(255,207,107,.1), rgba(229,65,58,.06)); }
.depart p { margin: 0; flex: 1 1 280px; color: #e6d6c8; font: 400 1.08rem/1.4 var(--serif); }
.depart p b { font: 800 1rem var(--body); color: var(--bulb); margin-right: 4px; }
.depart-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.depart-btn { min-height: 44px; padding: 10px 16px; border-radius: 99px; border: 1.5px solid var(--bulb); background: var(--bulb); color: var(--ink); font: 800 .9rem var(--body); cursor: pointer; }
.depart-btn.line { background: transparent; color: var(--bulb); }
.depart-btn:hover { background: #fff1c9; border-color: #fff1c9; color: var(--ink); }

.guichet { position: fixed; inset: 0; z-index: 92; display: grid; place-items: center; padding: 16px; background: rgba(5,3,4,.86); animation: fade-in .2s ease both; }
.guichet[hidden] { display: none; }
.guichet-boite { position: relative; width: min(980px, 100%); max-height: calc(100dvh - 32px); overflow-y: auto; padding: 28px clamp(18px, 4vw, 40px) 30px; border-radius: 20px;
  background: radial-gradient(ellipse 70% 40% at 50% 0, rgba(229,65,58,.22), transparent 70%), var(--velvet-2); border: 1px solid rgba(255,207,107,.35); box-shadow: 0 30px 80px rgba(0,0,0,.7); animation: rise .25s ease both; }
.guichet-x { position: absolute; top: 12px; right: 12px; width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--seat); background: rgba(0,0,0,.25); color: var(--cream); font-size: 1.05rem; cursor: pointer; }
.guichet-vue { display: grid; gap: 14px; }
.guichet-vue[hidden] { display: none; }
.guichet-sur { margin: 0; font: 700 .74rem var(--type); letter-spacing: .18em; text-transform: uppercase; color: var(--red); }
.guichet h2 { margin: 0; padding-right: 48px; font: 400 clamp(2rem, 5vw, 2.8rem)/1 var(--display); letter-spacing: .03em; color: var(--bulb); text-shadow: 0 0 22px rgba(255,207,107,.35); }
.guichet h2:focus { outline: none; }
.guichet-sub { margin: -4px 0 0; max-width: 60ch; color: #cdb8ad; font: 400 1.12rem/1.4 var(--serif); }
.guichet-go { justify-self: start; min-height: 48px; padding: 12px 22px; border-radius: 99px; border: 0; background: var(--bulb); color: var(--ink); font: 800 1rem var(--body); cursor: pointer; box-shadow: 0 0 22px rgba(255,207,107,.3); }
.guichet-go:hover { background: #fff1c9; }
.guichet-ou { margin: 10px 0 0; font: 700 .74rem var(--body); letter-spacing: .2em; text-transform: uppercase; color: var(--dim); }

/* Les affiches de festival : papier vieilli, décor propre à chacune, lauriers dorés, titre en lettres de cinéma. */
.festivals { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.festival { --fond: #5a0f1a; --fond2: #2a0710; --encre: #fff3d6; --or: #ffcf6b;
  position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; aspect-ratio: 2 / 3; min-width: 0; overflow: hidden;
  padding: 14px 12px 12px; border-radius: 10px; border: 0; cursor: pointer; color: var(--encre); font-family: var(--body);
  background: linear-gradient(180deg, var(--fond), var(--fond2)); box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.12), inset 0 0 0 6px rgba(0,0,0,.18), 0 12px 26px rgba(0,0,0,.45);
  transition: transform .2s cubic-bezier(.2,.8,.3,1), box-shadow .2s ease; }
.festival::after { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .18; mix-blend-mode: overlay;
  background: repeating-linear-gradient(0deg, rgba(255,255,255,.25) 0 1px, transparent 1px 3px); }
.festival:hover, .festival:focus-visible { transform: translateY(-4px) rotate(-.6deg); box-shadow: inset 0 0 0 1.5px var(--or), inset 0 0 0 6px rgba(0,0,0,.18), 0 18px 34px rgba(0,0,0,.55), 0 0 26px rgba(255,207,107,.25); }
.festival:focus-visible { outline: 3px solid var(--bulb); outline-offset: 4px; }
.f-decor { position: absolute; inset: 0; pointer-events: none; }
/* La mention entre les deux branches de lauriers (60 px de large au milieu). */
.f-mention { position: relative; display: grid; place-items: center; margin-top: 2px; }
.f-mention > * { grid-area: 1 / 1; }
.f-mention small { width: 60px; font: 700 .5rem/1.2 var(--type); letter-spacing: .04em; text-transform: uppercase; color: var(--or); overflow-wrap: anywhere; }
.lauriers { width: 120px; height: 60px; fill: var(--or); stroke: var(--or); stroke-width: 1.4; }
.lauriers path { fill: none; }
.f-titre { position: relative; margin-top: auto; font: 400 clamp(1.9rem, 3.4vw, 2.7rem)/.9 var(--display); letter-spacing: .04em; text-shadow: 0 3px 0 rgba(0,0,0,.35); }
.f-accroche { position: relative; font: italic 400 .95rem/1.2 var(--serif); color: var(--encre); opacity: .9; }
.f-rangees { position: relative; margin-top: 4px; padding-top: 7px; width: 100%; border-top: 1px solid rgba(255,255,255,.22); font: 700 .56rem/1.4 var(--body); letter-spacing: .1em; text-transform: uppercase; opacity: .8; }
/* Cinéphile : velours rouge, faisceau de projecteur. */
.f-cinephile .f-decor { background: conic-gradient(from 160deg at 50% 0, transparent 0 8deg, rgba(255,236,190,.22) 14deg 26deg, transparent 34deg); }
/* Famille : soleil couchant orangé, collines. */
.f-famille { --fond: #f08a3c; --fond2: #a8361d; --encre: #fff8e8; --or: #fff1c9; }
.f-famille .f-decor { background: radial-gradient(circle at 50% 46%, #ffd36b 0 22%, transparent 22.5%), radial-gradient(ellipse 80% 30% at 20% 82%, #7a2716 0 60%, transparent 61%), radial-gradient(ellipse 80% 34% at 85% 88%, #5e1d11 0 60%, transparent 61%); }
/* Binge : nuit bleue, écran allumé et pastilles d'épisodes. */
.f-binge { --fond: #1d2a6b; --fond2: #0a0f2b; --encre: #e9edff; --or: #9fd0ff; }
.f-binge .f-decor { background: radial-gradient(ellipse 46% 24% at 50% 44%, rgba(159,208,255,.38), transparent 70%), repeating-linear-gradient(90deg, rgba(159,208,255,.3) 0 10px, transparent 10px 16px) 50% 27% / 68px 4px no-repeat; }
/* Anime : soleil levant rouge sur papier crème. */
.f-anime { --fond: #f5ead8; --fond2: #e7d3b6; --encre: #2a1a14; --or: #c21f3a; }
.f-anime .f-decor { background: radial-gradient(circle at 50% 44%, #e5413a 0 20%, transparent 20.5%), repeating-conic-gradient(from 0deg at 50% 44%, rgba(229,65,58,.16) 0 7deg, transparent 7deg 18deg); }
.f-anime .f-titre { text-shadow: none; }
.f-anime .f-rangees { border-top-color: rgba(42,26,20,.25); }

/* Les questions : une à la fois, grandes cases à cocher. */
.guichet-pas { display: flex; gap: 8px; margin: 0; padding: 0; list-style: none; }
.guichet-pas li { width: 34px; height: 8px; border-radius: 99px; background: var(--seat); transition: background .2s ease; }
.guichet-pas li.on { background: var(--bulb); box-shadow: 0 0 10px rgba(255,207,107,.5); }
.guichet-q { margin: 0; padding: 0; border: 0; display: grid; gap: 14px; min-width: 0; }
.guichet-q[hidden] { display: none; }
.guichet-q legend { padding: 0 48px 0 0; margin-bottom: 12px; font: 400 clamp(1.9rem, 5vw, 2.6rem)/1 var(--display); letter-spacing: .03em; color: var(--cream); }
.guichet-q legend:focus { outline: none; }
.guichet-q legend small { display: block; margin-bottom: 6px; font: 700 .74rem var(--type); letter-spacing: .16em; text-transform: uppercase; color: var(--red); }
.guichet-choix { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
.guichet-choix label { position: relative; cursor: pointer; }
.guichet-choix input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.guichet-choix span { display: grid; gap: 4px; height: 100%; padding: 16px 18px; border-radius: 14px; border: 1.5px solid var(--seat); background: var(--velvet); transition: border-color .15s ease, background .15s ease; }
.guichet-choix b { font: 400 1.6rem/1 var(--display); letter-spacing: .03em; color: var(--cream); }
.guichet-choix small { color: var(--dim); font-size: .88rem; line-height: 1.35; }
.guichet-choix input:checked + span { border-color: var(--bulb); background: rgba(255,207,107,.1); box-shadow: 0 0 0 1px var(--bulb), 0 0 22px rgba(255,207,107,.18); }
.guichet-choix input:checked + span b { color: var(--bulb); }
.guichet-choix input:focus-visible + span { outline: 3px solid var(--bulb); outline-offset: 3px; }
.guichet-aide { margin: -6px 0 0; color: #cdb8ad; font: 400 1.05rem/1.4 var(--serif); max-width: 62ch; }
.guichet-nav { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 8px; }
.guichet-retour { min-height: 44px; padding: 8px 4px; border: 0; background: none; color: var(--dim); font: 700 .95rem var(--body); cursor: pointer; text-decoration: underline; text-underline-offset: 4px; }
.guichet-nav .guichet-go { justify-self: auto; margin-left: auto; }

@media (max-width: 760px) {
  .festivals { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .f-rangees { display: none; }
}
@media (max-width: 520px) {
  .guichet { padding: 0; }
  .guichet-boite { max-height: 100dvh; height: 100dvh; border-radius: 0; padding-top: 22px; }
  .depart-btns, .depart-btn { width: 100%; }
}
/* Grand écran (TV) : tout un peu plus grand, à lire du canapé. */
@media (min-width: 1700px) {
  .guichet-boite { width: min(1280px, 100%); }
  .guichet h2 { font-size: 3.4rem; }
  .f-accroche { font-size: 1.15rem; }
  .lauriers { width: 150px; height: 75px; }
  .f-mention small { width: 76px; font-size: .64rem; }
}
@media (prefers-reduced-motion: reduce) { .guichet, .guichet-boite, .festival { animation: none; transition: none; } .festival:hover, .festival:focus-visible { transform: none; } }
`;

// __name : voir NUVIO_JS (nuvio.js), le code d'une fonction recopiée telle quelle peut l'appeler.
export const GUICHET_JS = "var __name = function (f) { return f; };\nconst PROG = (" + creerProgrammations + ")();\n" + `// ---------- Le guichet : 3 questions et programmations toutes prêtes (worker/guichet.js) ----------
// Une programmation choisie remplace la programmation en cours (rangées, rangées sur mesure, plateformes, filtres,
// Découvrir, collections), mais garde le nom, le pays, la clé Gemini et le jeton d'alerte ; « Annuler » 10 secondes.
{
  const boite = $("guichet"), form = $("guichet-form");
  let declencheur = null, fond = [], pas = 0, seul = false;
  const vue = (questions) => { $("guichet-accueil").hidden = questions; form.hidden = !questions; };
  // seul : ouvert de lui-même (première visite) ; refermé, le focus va au bandeau sans faire défiler la page.
  function ouvre(questions, depuis, deLuiMeme) {
    declencheur = depuis || null; seul = !!deLuiMeme;
    boite.hidden = false;
    document.body.classList.add("regie-ouverte");
    // Fenêtre modale : le reste de la page est inerte tant qu'elle est ouverte (les messages restent lisibles).
    fond = [...document.body.children].filter((n) => n !== boite && !n.classList.contains("toast") && n.tagName !== "SCRIPT" && !n.inert);
    fond.forEach((n) => { n.inert = true; });
    if (questions) montreQuestions(0); else { vue(false); $("guichet-titre").focus(); }
  }
  function ferme() {
    boite.hidden = true;
    document.body.classList.remove("regie-ouverte");
    fond.forEach((n) => { n.inert = false; }); fond = [];
    if (declencheur && declencheur.isConnected) declencheur.focus({ preventScroll: seul });
  }
  function montreQuestions(n) {
    vue(true); pas = n;
    form.querySelectorAll(".guichet-q").forEach((q) => { q.hidden = Number(q.dataset.q) !== n; });
    form.querySelectorAll(".guichet-pas li").forEach((li, i) => li.classList.toggle("on", i <= n));
    $("guichet-suivant").firstChild.textContent = n === 2 ? "Voir ma programmation " : "Suivant ";
    form.querySelector('.guichet-q[data-q="' + n + '"] legend').focus();
  }
  // Abonnements : les pastilles de la salle (couleur de chaque plateforme), cochées d'après la programmation en cours
  // seulement si elle n'est pas celle d'origine (sinon tout serait coché d'office).
  D.providers.forEach((x) => chip($("guichet-plateformes"), "guichet-p-" + x.id, x.name, !same(state.p, D.defaults.p) && state.p.includes(x.id), () => {}, x.color));

  function applique(nouveau, texte) {
    const avant = clone(state), ordreAvant = [...order];
    Object.assign(state, nouveau, { n: state.n, g: state.g, k: state.k, al: state.al });
    $("builder").hidden = true;
    ferme();
    renderAll();
    effet("popcorn", $("depart-questions")); bruit("punch");
    proposeAnnuler(texte, avant, ordreAvant, $("depart-questions"));
    marque();
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (pas < 2) { montreQuestions(pas + 1); bruit("click"); return; }
    const lu = new FormData(form);
    const reponses = { quoi: lu.get("quoi") || "deux", famille: lu.get("famille") === "oui",
      plateformes: D.providers.filter((x) => $("guichet-p-" + x.id).checked).map((x) => x.id) };
    applique(PROG.depuisReponses(D, reponses), "Ta programmation est prête : regarde l'écran.");
  });
  $("guichet-retour").addEventListener("click", () => { if (pas > 0) montreQuestions(pas - 1); else { vue(false); $("guichet-titre").focus(); } });
  boite.querySelectorAll("[data-prete]").forEach((b) => b.addEventListener("click", () => {
    const nom = b.dataset.prete;
    applique(PROG.prete(D, nom), "Programmation « " + PROG.PRETES[nom].nom + " » à l'affiche.");
  }));
  $("guichet-questions").addEventListener("click", () => montreQuestions(0));
  $("guichet-fermer").addEventListener("click", ferme);
  boite.addEventListener("click", (e) => { if (e.target === boite) ferme(); });
  boite.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); ferme(); } });
  $("depart-questions").addEventListener("click", (e) => ouvre(true, e.currentTarget));
  $("depart-pretes").addEventListener("click", (e) => ouvre(false, e.currentTarget));

  // Première visite (aucun réglage, pas un lien fixe, rien de gardé dans ce navigateur, pas dans le guide) : le guichet
  // s'ouvre de lui-même, une seule fois. Stockage bloqué : jamais (on ne pourrait pas s'en souvenir).
  const VU = "salle2-guichet";
  function marque() { try { localStorage.setItem(VU, "1"); } catch (e) {} }
  let premiere = false;
  try {
    premiere = !localStorage.getItem(VU) && !Object.keys(JSON.parse(localStorage.getItem("liens-fixes") || "{}") || {}).length;
  } catch (e) { premiere = false; }
  premiere = premiere && !D.fixed && !hashDepart && !document.documentElement.classList.contains("dans-guide")
    && !Object.keys(compact({ ...state, n: D.defaults.n, k: "", al: "" })).length;
  marque();
  if (premiere) addEventListener("load", () => setTimeout(() => { if ($("regie").hidden && boite.hidden) ouvre(false, $("depart-questions"), true); }, 700));
}
`;
