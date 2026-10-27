/**
 * Page « Nouveautés » (servie sur /nouveautes) : ce qui a changé sur le site et dans l'addon, pour qui ne suit
 * pas le Discord. Écrite pour les utilisateurs (pas le détail des versions, qui reste dans les commits), la plus
 * récente en haut. Le hall en reprend la dernière (voir hall.js).
 * Pour en ajouter une : un objet en tête de NOUVEAUTES (date au format AAAA-MM-JJ, titre, points en HTML).
 */

import { feuilles } from "./statique.js";

export const NOUVEAUTES = [
  {
    date: "2026-10-27",
    titre: "Des collections qui s'ouvrent comme l'accueil",
    points: [
      "Nouvelle case « Ouvrir les collections comme l'accueil », dans Les collections : une tuile ouverte montre ses rangées comme l'accueil, au lieu des onglets.",
      "Sur Nuvio TV, la bande-annonce du film choisi se lance alors dans le fond, si elle est activée dans les réglages de l'accueil (Paramètres → Disposition). Réimporte les collections (« Tout envoyer dans Nuvio »).",
    ],
  },
  {
    date: "2026-10-27",
    titre: "La VF vérifiée dans le fichier, et des sagas qui défilent bien",
    points: [
      "« Dispo depuis peu », « Bientôt dispo », les fiches et les affiches suivent maintenant le même avis VF, lu dans le fichier lui-même : un film seulement en VF québécoise n'est plus annoncé dispo, et un film arrivé en VF dans la journée reprend ses couleurs sans attendre le lendemain.",
      "Sagas : chaque rangée porte le nom de sa saga et défile seule (avant, elles s'appelaient toutes « Saga » et bougeaient ensemble). Réimporte les collections (« Tout envoyer dans Nuvio »).",
    ],
  },
  {
    date: "2026-10-27",
    titre: "L'ordre de ton accueil, réglé sur le site",
    points: [
      "Nouveau bouton « Ordre de l'accueil » sous les collections : monte ou descends tes rangées et tes collections (Plateformes reste tout en haut). L'aperçu de l'écran suit.",
      "Dans Nuvio, l'ordre arrive avec « Tout envoyer dans Nuvio » (case « L'ordre de l'accueil »). Par défaut : Plateformes, tes rangées, puis les autres collections.",
      "Chaque thème des Sagas s'ouvre maintenant en haut, sur sa première saga.",
    ],
  },
  {
    date: "2026-10-27",
    titre: "TF1+, france.tv et M6+ dans tes plateformes",
    points: [
      "Coche-les dans « Mes plateformes » : leur tuile arrive dans la collection Plateformes (titres du moment chaque lundi), et leurs nouveautés dans « Nouveautés sur tes plateformes ».",
      "Puis réimporte les collections (« Tout envoyer dans Nuvio »).",
    ],
  },
  {
    date: "2026-10-27",
    titre: "Sagas dans l'ordre, animations plus fluides",
    points: [
      "Les films de chaque saga sont dans l'ordre de sortie (Rocky avant Rocky Balboa, Bad Boys avant Bad Boys for Life) : la rangée s'appelle maintenant « Saga · … ».",
      "Les animations des tuiles sont deux fois plus fluides ; celles des plateformes et des studios se jouent une fois puis restent sur la tuile. Le fond animé part de l'image et y revient, sans saut.",
      "Sur la page de configuration, les collections se choisissent dans une fenêtre (bouton « Choisir les collections »).",
      "« Tout envoyer dans Nuvio » met aussi le lien des affiches sur PC et téléphone, plus seulement sur la TV.",
      "Pour en profiter : « Actualiser les addons » dans Nuvio, puis réimporte les collections.",
    ],
  },
  {
    date: "2026-10-26",
    titre: "Sagas par thèmes et plateformes refaites",
    points: [
      "Sagas : 8 thèmes (Action et aventure, Super-héros, Science-fiction et fantastique, Horreur, Animation et famille, Comédie et romance, Cinéma français, Animés) et 175 sagas, une rangée par saga avec les films dans l'ordre. Tout est en français.",
      "Plateformes : chaque tuile montre les deux films et la série du moment, refaits chaque lundi.",
      "Quand tu restes sur une tuile de saga ou de plateforme, le fond s'anime : un mur d'affiches qui glisse.",
      "Pour les voir : réimporte les collections (« Tout envoyer dans Nuvio » ou le lien des collections). « Actualiser les addons » ne suffit pas.",
    ],
  },
  {
    date: "2026-10-26",
    titre: "Tout envoyer dans Nuvio, sans rien coller",
    points: [
      "Tu as un compte Nuvio ? Sur ton billet (salle 2) ou à l'étape 7 du guide, « Tout envoyer dans Nuvio » : tu approuves avec un code dans Nuvio, et l'addon, les collections et les affiches de ta TV arrivent tout seuls, sur tous tes appareils connectés à ce compte.",
      "Tes autres addons et les collections que tu as faites toi-même restent. Ton compte Nuvio reste dans ton navigateur : le site ne le voit jamais.",
      "Sans compte Nuvio, rien ne change : les liens à coller sont toujours sur le billet.",
    ],
  },
  {
    date: "2026-10-26",
    titre: "Tes propres affiches, et la date du cinéma",
    points: [
      "Notes : Rotten Tomatoes, Metacritic et Letterboxd s'affichent enfin, MyAnimeList arrive pour les animés, IMDb et TMDB peuvent s'afficher ensemble, et « La moyenne » montre une seule note, la moyenne de celles que tu as choisies. Tout se coche dans une seule liste : salle 2, Tes affiches, onglet Infos, Notes.",
      "Les logos en français sont ceux de France : Toy Story 4 n'est plus « Histoire de jouets 4 » (le logo du Québec). Sans logo de France, l'anglais ou la langue d'origine.",
      "<b>Tes affiches</b> : tes réglages perso ont maintenant leur propre lien. Règle tout comme tu veux dans la salle 2, puis « Copier mon lien d'affiches » (ou le QR code pour ta TV). La première affiche de chaque titre met une à deux secondes, ensuite elle est instantanée.",
      "Un film qui sort bientôt au cinéma en France : « AU CINÉMA LE 28 OCT. », et en dessous le jour où il arrive chez toi (« DISPO LE 17 NOV. »), la date qui range « Bientôt dispo ». Déjà en salle : « AU CINÉMA », toujours avec la date en dessous.",
    ],
  },
  {
    date: "2026-10-22",
    titre: "Les animés retrouvent leurs saisons",
    points: [
      "Jujutsu Kaisen, Frieren, Dan Da Dan, One Piece… : les épisodes sont rangés dans leurs vraies saisons, plus tout dans une seule. La saison annoncée apparaît aussi (Jujutsu Kaisen saison 4).",
      "Les sources des épisodes après la première saison se trouvent mieux : ils sont demandés avec le bon numéro de saison.",
      "Les affiches et les rangées aussi : « Saison 3 terminée », « S3 · ÉP. 4/12 », « 3 saisons » au lieu de tout compter dans la saison 1.",
      "Si tu avais commencé un de ces animés, la progression des épisodes après la première saison peut être à refaire.",
      "Recherche : « bleach » ou « jojo » donnent l'animé (et plus la filmographie d'un acteur ou d'une chanteuse du même nom), « hitchcock » le film puis les films d'Alfred Hitchcock, et les animés se trouvent aussi par leur nom japonais (« shingeki no kyojin ») ou par un personnage (« ichigo », « luffy », « gojo »), et les séries et films aussi : par un personnage (« walter white », « jon snow », « jack sparrow »), un sigle (« got », « twd ») ou un acteur que la recherche confondait (« belmondo »). Même sans clé Gemini.",
    ],
  },
  {
    date: "2026-10-22",
    titre: "La salle 2 retrouve ta programmation",
    points: [
      "Reviens sur la salle 2 quand tu veux : sur le même appareil, elle rouvre d'elle-même ta dernière programmation (ton lien fixe si tu en as un). Plus besoin de tout refaire.",
      "Pour repartir de zéro : « Revenir à la programmation d'origine ». Sur un autre appareil, le « lien pour modifier » de ton lien fixe ou le QR « Continuer sur le téléphone » emportent tes réglages.",
    ],
  },
  {
    date: "2026-10-22",
    titre: "Quand le film arrive en VF",
    points: [
      "Les fiches disent quand un film sera dispo chez toi : « Dispo le 17 nov. », ou « Dispo vers le … » quand la date n'est pas annoncée, estimée d'après le délai habituel de son distributeur (Universal sort ses films en numérique 18 jours après la salle, Disney 60…).",
      "Film sorti sans VF : la fiche dit « Aucune date ».",
      "Sur les affiches, des dates qui parlent : « DÈS LE 17 NOV. » quand le film arrive chez toi, « PRÉVU VERS LE 24 NOV. » quand la date est estimée, « PRÉVU LE 4 NOV. » pour une sortie annoncée (au cinéma ou ailleurs). Sous « AU CINÉMA », la date reste « DISPO LE … ».",
      "La recherche comprend deux acteurs ensemble (« pacino de niro ») et un genre avec une époque ou un pays (« horreur années 80 », « comédie française »).",
      "<b>Tes affiches</b> : « Essayer sur un titre » montre tes réglages sur n'importe quel film, série ou animé.",
      "Rangée de saison : Spécial Halloween.",
      "Copies Docker : « Erreur inattendue » à l'import des collections, c'est corrigé (il manquait des certificats dans l'image). Mets-la à jour avec <code>docker compose pull</code> puis <code>docker compose up -d</code>.",
    ],
  },
  {
    date: "2026-10-22",
    titre: "Le guichet, la soirée à deux et le film du jour",
    points: [
      "<b>Le guichet</b> (salle 2) : ta programmation en 3 questions, ou 4 toutes prêtes (Cinéphile, Famille, Binge, Anime).",
      "<b>La soirée à deux</b> : reprends les rangées du billet d'un ami.",
      "<b>La galerie des styles d'affiches</b> : publie ton style, essaie celui des autres.",
      "Lien fixe : « Ta TV l'a reçu ✓ » sur le billet dès que Nuvio a lu tes réglages.",
      "Guide : le mot de passe de la séance (le guide voit que l'addon marche dans Nuvio), « Vérifier ma clé » AllDebrid, et un diagnostic à partir d'une photo de ton écran.",
      "Hall : l'avant / après (Nuvio de base contre le résultat du guide), <a href=\"/jeu\">le film du jour à deviner</a> et <a href=\"/etat\">la salle des machines</a>.",
      "Affiches, au choix dans la régie : la langue (VF, MULTI, VOSTFR, VO), série terminée ou annulée, avancement de la saison.",
    ],
  },
  {
    date: "2026-10-21",
    titre: "Des affiches plus justes, un site plus léger",
    points: [
      "Les affiches donnent une date au lieu de « Bientôt » et « En salle » : « Dispo le 2 nov. », « Au cinéma le 16 déc. ».",
      "Plus d'affiches étrangères avec du texte sous le logo (Conjuring, Les Soprano).",
      "Les Tendances du jour suivent le même classement que les N° des affiches : une photo par jour, la même pour tout le monde.",
      "Dans la régie : police Cinéma, note en badge IMDb ou TMDB, âge conseillé (-12, -16…), titre à gauche ou au centre, fondu flou et un style tout prêt « Ciné ».",
      "Pages plus légères : la salle 2 se charge cinq fois plus vite.",
      "Guide : le chemin exact du réglage TMDB dans Nuvio, et un avertissement pour les Fire TV sous Vega OS.",
    ],
  },
  {
    date: "2026-10-20",
    titre: "Affiches maison et liens fixes",
    points: [
      "<b>Les affiches maison</b> remplacent Posters+ : logo du titre, note, genre, année, rang des tendances et qualité (4K, HDR, Dolby Vision). Plus besoin de clé TMDB à l'étape 8 du guide.",
      "<b>La régie</b> (salle 2 → « Régler mes affiches ») : tes vraies affiches sur scène, des styles tout prêts, et chaque élément à allumer, éteindre ou agrandir.",
      "Un titre pas encore dispo en VF passe en noir et blanc.",
      "<b>Les liens fixes</b> : « Créer mon lien fixe » sur le billet. L'adresse ne change plus et tes réglages arrivent dans Nuvio sans réinstaller (« Actualiser les addons »).",
      "Rangées : Téléréalité au choix (Koh-Lanta, Les Marseillais…) ; Découvrir, Populaires et Nouveautés ne montrent que les films déjà dispo dans ton pays ; Marvel, Warner et DC passent dans les Studios.",
      "Collections : choisis l'ordre des tuiles, et « Copier le contenu » pour les importer sur PC ou téléphone. Après un changement, supprime-les dans Nuvio et réimporte leur lien.",
    ],
  },
];

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
// « 2026-10-22 » → « 22 octobre » (« 1er » le premier du mois).
export function jourEnClair(date) {
  const [, m, j] = date.split("-").map(Number);
  return (j === 1 ? "1er" : j) + " " + MOIS[m - 1];
}

export function nouveautesPage({ origin, version }) {
  const LOGO = origin + "/logo.png";
  const entrees = NOUVEAUTES.map((n) => `
  <article class="entree">
    <p class="jour"><time datetime="${n.date}">${jourEnClair(n.date)}</time></p>
    <h2>${n.titre}</h2>
    <ul>${n.points.map((p) => `
      <li>${p}</li>`).join("")}
    </ul>
  </article>`).join("");
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Nouveautés · Nuvio en français</title>
<meta name="description" content="Ce qui a changé dans le Catalogue FR pour Nuvio : affiches, rangées, recherche et site.">
<link rel="icon" href="${LOGO}">
${feuilles("polices.css")}
<style>
:root { --velvet: #170c12; --velvet-2: #22121b; --seat: #3d2230; --cream: #f5ead8; --dim: #b9a59c; --bulb: #ffcf6b; --ink: #2a1a14; --red: #e5413a; color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; color: var(--cream); font: 16px/1.55 "Figtree", system-ui, sans-serif;
  background: radial-gradient(ellipse 90% 40% at 50% -5%, rgba(229,65,58,.25), transparent 70%), var(--velvet);
  padding: max(28px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(32px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); }
main { max-width: 720px; margin: 0 auto; display: grid; gap: 22px; }
a { color: var(--bulb); text-underline-offset: 3px; }
.ticket { display: grid; gap: 6px; padding: 18px 20px; border-radius: 14px; background: var(--cream); color: var(--ink); }
.ticket small { font: 800 .72rem "Figtree"; letter-spacing: .16em; text-transform: uppercase; color: #7a5a4c; }
h1, h2 { margin: 0; font-family: "Bebas Neue", Impact, sans-serif; font-weight: 400; letter-spacing: .03em; line-height: 1; }
h1 { font-size: clamp(2.2rem, 7vw, 3rem); }
h2 { font-size: 1.7rem; color: var(--bulb); }
p { margin: 0; }
.dim { color: var(--dim); }
.entree { display: grid; gap: 10px; padding: 18px; border-radius: 16px; background: var(--velvet-2); border: 1px solid var(--seat); }
.entree:first-of-type { border-color: var(--bulb); }
.jour { font: 800 .72rem "Figtree"; letter-spacing: .16em; text-transform: uppercase; color: var(--dim); }
.entree ul { margin: 0; padding-left: 1.2em; display: grid; gap: 8px; }
code { font: .9em "Courier Prime", monospace; background: #0f080c; padding: 1px 6px; border-radius: 6px; white-space: nowrap; }
.fin { display: flex; flex-wrap: wrap; gap: 10px 20px; justify-content: space-between; font-weight: 800; }
</style>
</head>
<body>
<main>
  <div class="ticket">
    <small>Au programme</small>
    <h1>Les nouveautés</h1>
    <p>Ce qui a changé dans le Catalogue FR, du plus récent au plus ancien. La plupart arrivent toutes seules dans Nuvio, sans rien réinstaller.</p>
  </div>
${entrees}

  <p class="dim">Version actuelle : ${version}.</p>

  <nav class="fin" aria-label="Retour">
    <a href="${origin}/">← Retour au hall</a>
    <a href="${origin}/configure">Composer mon accueil →</a>
  </nav>
</main>
</body>
</html>`;
}
