/**
 * Page « Monte ta propre salle » (servie sur /copie) : expliquer, sans passer par GitHub, qu'on peut
 * héberger sa propre copie du Catalogue FR (fork Cloudflare gratuit, ou Docker), et comment.
 * Le détail technique reste dans le README (section « Héberger ta propre copie »).
 */

import { feuilles } from "./statique.js";

const REPO = "https://github.com/xnzx07/nuvio-assets";

const COMPOSE = `services:
  catalogue-fr:
    image: ghcr.io/xnzx07/nuvio-assets:latest
    restart: unless-stopped
    ports:
      - "8787:8787"
    environment:
      TMDB_API_KEY: "ta-cle-tmdb"
      ADMIN_PASSWORD: "choisis-un-mot-de-passe"
    volumes:
      - ./donnees:/data`;

export function copiePage({ origin }) {
  const LOGO = origin + "/logo.png";
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Ta propre salle · Nuvio en français</title>
<meta name="description" content="Héberge ta propre copie du Catalogue FR pour Nuvio : gratuite sur Cloudflare, ou avec Docker sur ton serveur.">
<link rel="icon" href="${LOGO}">
${feuilles("polices.css")}
<style>
:root { --velvet: #170c12; --velvet-2: #22121b; --seat: #3d2230; --cream: #f5ead8; --dim: #b9a59c; --bulb: #ffcf6b; --ink: #2a1a14; --red: #e5413a; color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; color: var(--cream); font: 16px/1.55 "Figtree", system-ui, sans-serif;
  background: radial-gradient(ellipse 90% 40% at 50% -5%, rgba(229,65,58,.25), transparent 70%), var(--velvet);
  padding: max(28px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(32px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); }
main { max-width: 720px; margin: 0 auto; display: grid; gap: 22px; }
/* Les grilles ne s'élargissent pas pour le bloc de code : c'est lui qui défile. */
main > *, .salles > *, .salle > * { min-width: 0; }
a { color: var(--bulb); text-underline-offset: 3px; }
.ticket { display: grid; gap: 6px; padding: 18px 20px; border-radius: 14px; background: var(--cream); color: var(--ink); }
.ticket small { font: 800 .72rem "Figtree"; letter-spacing: .16em; text-transform: uppercase; color: #7a5a4c; }
h1, h2 { margin: 0; font-family: "Bebas Neue", Impact, sans-serif; font-weight: 400; letter-spacing: .03em; line-height: 1; }
h1 { font-size: clamp(2.2rem, 7vw, 3rem); }
h2 { font-size: 1.7rem; color: var(--bulb); }
.ticket p { margin: 0; }
p { margin: 0; }
.dim { color: var(--dim); }
.besoin { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.besoin li { padding: 12px 14px; border-radius: 12px; background: var(--velvet-2); border: 1px solid var(--seat); }
.salles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.salle { display: grid; gap: 12px; align-content: start; padding: 18px; border-radius: 16px; background: var(--velvet-2); border: 1px solid var(--seat); }
.salle .pour { font-size: .9rem; color: var(--dim); }
.salle ol { margin: 0; padding-left: 1.3em; display: grid; gap: 8px; }
.code { position: relative; }
pre { margin: 0; overflow: auto; padding: 12px 14px; border-radius: 12px; background: #0f080c; border: 1px solid var(--seat); font: .8rem/1.45 "Courier Prime", monospace; color: #f0e2cf; }
code { font: .9em "Courier Prime", monospace; background: #0f080c; padding: 1px 6px; border-radius: 6px; overflow-wrap: anywhere; }
.copier { justify-self: start; padding: 9px 14px; border-radius: 8px; border: 1px solid var(--cream); background: var(--cream); color: var(--ink); font: 800 .88rem "Figtree"; cursor: pointer; }
.apres { display: grid; gap: 10px; padding: 18px; border-radius: 16px; background: var(--velvet-2); border: 1px solid var(--bulb); }
.apres ol { margin: 0; padding-left: 1.3em; display: grid; gap: 8px; }
.maj { display: grid; gap: 8px; padding: 18px; border-radius: 16px; border: 1px solid var(--red); background: var(--velvet-2); }
.fin { display: flex; flex-wrap: wrap; gap: 10px 20px; justify-content: space-between; font-weight: 800; }
@media (max-width: 680px) { .salles { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<main>
  <div class="ticket">
    <small>Projection privée</small>
    <h1>Monte ta propre salle</h1>
    <p>Le Catalogue FR de ce site est partagé par tout le monde : quand il y a foule, il peut saturer. Ta propre copie fait exactement la même chose (même accueil, mêmes collections, même recherche), avec tes clés et ton quota. Elle est gratuite et ne dépend de personne.</p>
  </div>

  <section aria-labelledby="t-besoin">
    <h2 id="t-besoin">Ce qu'il te faut</h2>
    <ul class="besoin">
      <li><b>Une clé TMDB</b>, gratuite : themoviedb.org → Paramètres → API (clé « v3 »).</li>
      <li><b>Un mot de passe d'hébergeur</b>, que tu inventes (<code>ADMIN_PASSWORD</code>, 10 caractères au moins) : il ouvre ton espace hébergeur et les mises à jour.</li>
      <li class="dim">Facultatif : une clé Gemini pour l'IA (<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a>), à partager avec ta famille si tu veux.</li>
    </ul>
  </section>

  <section class="salles" aria-label="Deux façons de faire">
    <article class="salle">
      <h2>Sur Cloudflare</h2>
      <p class="pour">Gratuit, sans serveur, en 10 minutes. Ton site sera sur une adresse à toi.</p>
      <ol>
        <li>Crée un compte GitHub si tu n'en as pas, puis <a href="${REPO}/fork" target="_blank" rel="noopener">fais ta copie du dépôt</a> (« Fork »).</li>
        <li>Sur <a href="https://dash.cloudflare.com" target="_blank" rel="noopener">dash.cloudflare.com</a> : Workers &amp; Pages → Créer → Importer un dépôt → choisis ta copie.</li>
        <li>Dans ton Worker → Paramètres → Variables et secrets : ajoute <code>TMDB_API_KEY</code> et <code>ADMIN_PASSWORD</code> en secrets. Ajoute aussi, conseillé, le secret <code>HOTE_SECRET</code> : une longue suite de caractères au hasard, qui protège ta connexion à l'espace hébergeur. Et la variable <code>DEPOT</code> = <code>ton-pseudo/nuvio-assets</code> (ta copie sur GitHub), pour que « Mettre à jour » mène à ta copie.</li>
        <li>Ouvre l'adresse de ton Worker : c'est ton site, avec son guide et sa salle 2. Ton addon est sur <code>…/manifest.json</code>.</li>
      </ol>
    </article>
    <article class="salle">
      <h2>Avec Docker</h2>
      <p class="pour">Sur ton NAS, un serveur ou un Raspberry Pi 64 bits, à la maison.</p>
      <ol>
        <li>Crée un fichier <code>docker-compose.yml</code> avec ceci, en mettant ta clé TMDB et ton mot de passe :</li>
      </ol>
      <div class="code"><pre id="compose" tabindex="0" aria-label="docker-compose.yml">${COMPOSE}</pre></div>
      <button type="button" class="copier" id="copier">Copier</button>
      <ol start="2">
        <li>Lance <code>docker compose up -d</code>.</li>
        <li>Ton site est sur <code>http://adresse-du-serveur:8787</code>, ton addon sur <code>…/manifest.json</code> (Nuvio TV accepte le http à la maison).</li>
      </ol>
      <p class="pour">De l'extérieur (téléphone en 4G) : passe par Cloudflare Tunnel, et indique ton adresse dans <code>ADRESSE_PUBLIQUE</code>. Si tout passe par le tunnel (ou un proxy https sur la même machine), publie le port en <code>"127.0.0.1:8787:8787"</code> au lieu de <code>"8787:8787"</code> : plus rien ne circule en clair sur ton réseau. Sur Docker, <code>HOTE_SECRET</code> se crée tout seul.</p>
    </article>
  </section>

  <section class="apres" aria-labelledby="t-apres">
    <h2 id="t-apres">Une fois ta salle montée : ton espace hébergeur</h2>
    <p class="dim">C'est ta page d'administration. Elle n'existe que sur ta copie, pas sur ce site-ci.</p>
    <ol>
      <li>Ouvre <b>ton</b> site (l'adresse de ton Worker, ou celle de ton serveur).</li>
      <li>Va en <b>salle 2</b>, puis clique sur l'onglet <b>«&nbsp;Hébergeur&nbsp;»</b> en haut. Raccourci : ajoute <code>/configure#s-hote</code> au bout de ton adresse.</li>
      <li>Connecte-toi avec ton mot de passe, celui de <code>ADMIN_PASSWORD</code>.</li>
      <li>Facultatif : coche «&nbsp;Alertes de mise à jour dans Nuvio&nbsp;», puis réinstalle ton lien dans Nuvio pour être prévenu sur ton accueil (avec un lien fixe, « Actualiser les addons » suffit).</li>
    </ol>
  </section>

  <section class="maj" aria-labelledby="t-maj">
    <h2 id="t-maj">Les mises à jour, c'est toi qui décides</h2>
    <p>Ta copie te prévient quand une nouvelle version sort, dans ton espace hébergeur et, si tu veux, par une rangée « Mise à jour » sur ton accueil Nuvio. Tu choisis « Mettre à jour » ou « Plus tard » : rien ne change sans ton accord.</p>
  </section>

  <p class="dim">Tous les détails (variables, accès de l'extérieur, sécurité) sont dans le <a href="${REPO}#héberger-ta-propre-copie" target="_blank" rel="noopener">mode d'emploi sur GitHub</a>.</p>

  <nav class="fin" aria-label="Retour">
    <a href="${origin}/">← Retour au hall</a>
    <a href="${origin}/guide">Ou installe tout avec ce site →</a>
  </nav>
</main>
<script>
document.getElementById("copier").addEventListener("click", (e) => {
  const b = e.currentTarget, texte = document.getElementById("compose").textContent;
  const ok = () => { b.textContent = "Copié ✓"; setTimeout(() => { b.textContent = "Copier"; }, 1500); };
  try { navigator.clipboard.writeText(texte).then(ok, () => { b.textContent = "Sélectionne le texte"; }); } catch (err) { b.textContent = "Sélectionne le texte"; }
});
</script>
</body>
</html>`;
}
