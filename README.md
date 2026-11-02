# Catalogue FR pour Nuvio

Un addon Nuvio / Stremio en français, servi en direct depuis TMDB, avec son site d'accompagnement
« salle de cinéma » : un guide pour tout installer de zéro et une page pour personnaliser son lien.

| | Adresse |
|---|---|
| Le site (hall, guide, personnalisation) | https://nuvio-assets.xnzxflix.workers.dev |
| L'addon à installer dans Nuvio | `https://nuvio-assets.xnzxflix.workers.dev/manifest.json` |
| Les affiches (Nuvio : Paramètres → Disposition → Custom Poster Source ; à régler en salle 2, « Tes affiches ») | `https://affiches-catalogue-fr.vercel.app/{type}/{shape}/{id}.jpg?imdb={imdb_id?}` |
| Les collections (copier tout son contenu, puis dans Nuvio, onglet Collections, bouton presse-papiers en haut à droite, sur téléphone comme sur PC ; sur téléphone, le lien marche aussi par Importer → URL) | `https://nuvio-assets.xnzxflix.workers.dev/collections.json` |

Le plus simple : ouvrir le site, salle 1 (le guide) si tu n'as pas encore Nuvio, salle 2 pour régler ton lien.

---

## Ce que fait l'addon

**Catalogues et accueil**
- Rangées d'accueil (À la une, Tendances, Au cinéma, En ce moment…) et catalogues des collections
  (Plateformes, Fêtes & saisons, Genres, Sagas, Studios), définis dans `catalogs.json`.
- Pagination sans limite et contenu toujours à jour : chaque réponse est calculée à la volée depuis TMDB.
- Une tuile « En ce moment » qui suit le calendrier (Halloween, Noël, Saint-Valentin, Pâques, été).

**Fiches**
- Résumé, casting, saisons et épisodes en français ; vraies notes IMDb (fichier intégré, aucun appel réseau).
- Y aura-t-il une suite (saga, série terminée ou annulée, saison suivante commandée), scène après le générique,
  œuvre adaptée, temps pour tout voir.
- Épisodes : ⭐ sur les 3 mieux notés de chaque saison, « (remplissage) » sur les anime.
- Séries en cours : « 📺 Nouvel épisode jeudi… » ; films pas encore sortis en numérique : « 📅 Dispo le… »
  (visible seulement si « Informations de base » est désactivé dans Paramètres → Intégrations → TMDB de Nuvio).

**Recherche** (catalogues « Films » et « Séries »)
- Titres français, original ou anglais, classés par ressemblance et notoriété.
- Comprend les sigles (« got »), les fautes de frappe, les mots en trop (« the boys saison 4 »), l'année
  (« dune 2021 »), les numéros de suite (« harry potter 3 »), les personnes (« nolan ») et les studios (« pixar »).

**Avec une clé Gemini** (facultative, gratuite sur [Google AI Studio](https://aistudio.google.com/apikey))
- Recherche par description (« le film où un mec revit la même journée »), par réplique (« je suis ton père »)
  ou par mélange (« entre Amélie et Fight Club ») ; chaque titre proposé est vérifié dans TMDB.
- Sur les fiches : « pour qui », « à savoir » et le rappel de l'œuvre précédente.
- Chacun colle sa propre clé dans la salle 2 : elle est rangée dans son lien et l'IA tourne avec son quota.
  Sans clé, l'addon relit les réponses déjà en cache sans jamais appeler Gemini.

## Le site

| Adresse | Page | Fichier |
|---|---|---|
| `/` | Le hall : on choisit sa salle | `worker/hall.js` |
| `/guide` | Salle 1 : installer Nuvio et toute la configuration (`#apercu` : l'accueil final) | `worker/guide.js` |
| `/configure` | Salle 2 : personnaliser son lien d'addon | `worker/page.js` |
| `/f…/manifest.json` | Lien fixe : les réglages gardés dans la base D1 `LIENS` (créée toute seule au déploiement), modifiables sans réinstaller | `worker/fixe.js` |
| `/<config ou f…>/programmation.json` | « Soirée à deux » (salle 2) : les rangées d'un lien, sans clé Gemini ni jeton d'alerte | `worker/soiree.js` |
| `/galerie/…` | Galerie des styles d'affiches de la régie (table `galerie` de la même base D1, limite facultative `LIMITE_GALERIE`) | `worker/galerie.js` |
| `/copie` | Monte ta propre salle : héberger sa copie | `worker/copie.js` |
| `/nouveautes` | Ce qui a changé, du plus récent au plus ancien (pour qui ne suit pas le Discord) | `worker/nouveautes.js` |
| `/lien#u=…` | Ouverte par les QR codes du guide, pour copier un lien sur le téléphone | `worker/lien.js` |
| `/tv` | Adresse courte pour Downloader : télécharge l'APK de Nuvio TV | |

Décor de fête à prévisualiser : `?saison=noel`, `saint-valentin`, `paques`, `ete` ou `halloween`.

---

## Héberger ta propre copie

Le lien principal est partagé par tout le monde : ses quotas gratuits peuvent saturer. Ta copie tourne avec tes
clés et ton quota, avec le même code, et continue de lire les images et données communes sur ce dépôt
(tuiles, vocabulaire de la recherche) : elle profite de leurs mises à jour de chaque nuit. Les notes IMDb, elles,
sont intégrées au code de l'addon (refaites chaque lundi) : une copie Cloudflare les reçoit avec « Sync fork »
(puis le redéploiement automatique), une copie Docker avec la nouvelle image (`docker compose pull`), refaite
dès que les notes changent.

Il te faut :
- une clé TMDB (gratuite : themoviedb.org → Paramètres → API, clé v3) ;
- un mot de passe d'hébergeur de ton choix (10 caractères au moins, pas celui de l'exemple) ;
- facultatif : une clé Gemini.

### Sur Cloudflare (gratuit, sans serveur)

1. **Fork** de ce dépôt sur GitHub.
2. Sur dash.cloudflare.com : Workers & Pages → Créer → Importer un dépôt → ton fork, réglages par défaut.
3. Dans ton Worker → Paramètres → Variables et secrets, ajoute au moins `TMDB_API_KEY` et `ADMIN_PASSWORD`
   (voir le tableau plus bas).
4. Ton site : `https://nuvio-assets.<ton-sous-domaine>.workers.dev`, ton addon : `…/manifest.json`.

### Avec Docker (serveur, NAS, Raspberry Pi 64 bits)

1. Copie [`docker-compose.yml`](docker-compose.yml), mets-y ta clé TMDB et ton mot de passe.
2. `docker compose up -d`
3. Le site : `http://<adresse-du-serveur>:8787`, l'addon : `…:8787/manifest.json`
   (Nuvio TV accepte le http sur le réseau de la maison). Si tout passe par un tunnel ou un proxy https sur
   la même machine, publie le port en `127.0.0.1:8787:8787` : plus rien ne circule en clair.
4. Pour y accéder de l'extérieur : Cloudflare Tunnel (gratuit, https, aucun port à ouvrir) vers
   `http://localhost:8787`, ou ton reverse proxy (nginx : `proxy_set_header Host $host;`).
   Renseigne alors `ADRESSE_PUBLIQUE`, sinon les liens resteraient en `http://`.

Le conteneur fait tourner le Worker avec `wrangler dev` (runtime workerd de Cloudflare), sans les droits root ;
le cache, tes choix et le secret de connexion sont gardés dans `./donnees`. Image : `ghcr.io/xnzx07/nuvio-assets:latest` (ou `:<version>`).
`docker ps` affiche `healthy` quand l'addon répond.

### Variables

| Variable | | Rôle |
|---|---|---|
| `TMDB_API_KEY` | obligatoire | Clé TMDB v3 |
| `ADMIN_PASSWORD` | obligatoire | Mot de passe de l'espace hébergeur (salle 2), 10 caractères au moins |
| `HOTE_SECRET` | conseillé sur Cloudflare | Longue suite de caractères au hasard qui signe la connexion (créé tout seul sur Docker) |
| `GEMINI_API_KEY` | facultatif | Clé Gemini de ta copie (pages `/debug`) |
| `GEMINI_PUBLIC` | facultatif | `on` : cette clé sert aussi aux liens sans clé, et au diagnostic par photo du guide pour qui n'a pas de clé |
| `RELAIS_KEY` | facultatif | Si tu héberges aussi le service d'affiches avec une variable `RELAIS_KEY` : la même valeur, pour que l'addon y lise la VF des sources (`/vf.json`) |
| `TOP_10_KEY` | facultatif | Clé gratuite de la [Streaming Availability API](https://www.movieofthenight.com/about/api) : le top de chaque plateforme en France, lu une fois par jour (12 appels). Sans elle, ces rangées restent vides |
| `DEPOT` | Cloudflare | `ton-pseudo/nuvio-assets`, pour que « Mettre à jour » mène à ton fork |
| `ADRESSE_PUBLIQUE` | Docker | Ton adresse https derrière un tunnel ou un proxy |

Sur Cloudflare, ces variables survivent aux redéploiements (`keep_vars` dans `wrangler.toml`).

### Mises à jour : c'est toi qui décides

Ta copie compare sa version à celle de ce dépôt et ne te propose que les vrais paliers (5.23 → 5.24), jamais
chaque correction. Rien ne change sans ton accord.

- **Sur le site** : sur **ton** site, salle 2 → onglet « Hébergeur » (raccourci : `https://ton-adresse/configure#s-hote`),
  connexion avec `ADMIN_PASSWORD`. Tu y vois la nouvelle version, ses nouveautés, et deux boutons :
  « Mettre à jour » (Cloudflare : « Sync fork » sur GitHub, puis redéploiement automatique ;
  Docker : `docker compose pull && docker compose up -d`) et « Plus tard » (plus rien jusqu'au palier suivant).
- **Dans Nuvio** : coche « Alertes de mise à jour dans Nuvio » dans l'espace hébergeur et réinstalle ton lien (avec un lien fixe, « Actualiser les addons » dans Nuvio suffit).
  Une rangée « Mise à jour » apparaît en tête de l'accueil quand une version sort (si tu as réorganisé tes
  rangées, remonte-la une fois). Les liens que tu donnes aux autres n'ont jamais cette rangée.

<details>
<summary>Sécurité et détails</summary>

- Le cookie de connexion et le jeton du lien avec alertes sont signés avec ton mot de passe et un secret du
  serveur (`HOTE_SECRET`, sinon ta clé TMDB) : impossible de retrouver le mot de passe à partir du lien.
- La connexion dure 30 jours ; « Se déconnecter » ferme toutes les sessions ouvertes.
- 10 essais ratés en un quart d'heure depuis une même adresse bloquent les suivants, et 100 toutes adresses
  confondues ; les demandes venues d'un autre site sont refusées. Un mot de passe trop court ou laissé tel que
  dans l'exemple garde l'espace hébergeur fermé.
- Une copie se reconnaît à son adresse : son addon a son propre identifiant (`com.xnzx07.catalogue-fr.perso`),
  on peut donc installer les deux dans Nuvio.
- « Plus tard » est gardé dans `./donnees` sur Docker ; sur Cloudflare, dans le cache (ou un KV `ETAT` déclaré
  dans ton `wrangler.toml`). Si le cache est vidé, la proposition revient.
- Sur Docker, les clés passent au Worker par un fichier lisible par lui seul, jamais en ligne de commande.

</details>

---

## Développement

### Organisation

| Dossier / fichier | Contenu |
|---|---|
| `worker/` | L'addon et le site (Cloudflare Worker, point d'entrée `worker/index.js`) |
| `affiches/` | Le service des affiches maison, sur Vercel (voir `affiches/README.md`) |
| `worker/search.js`, `worker/ai.js` | Recherche classique et recherche par IA |
| `worker/hote.js` | Copies auto-hébergées : version, espace hébergeur, alertes |
| `worker/stage.js`, `worker/statique.js` | Mise en scène commune et feuilles de style partagées |
| `worker/polices/`, `worker/tiers/` | Polices du site (licence OFL) et bibliothèque des QR codes (MIT), servies par le site lui-même (`worker/statique.js`) |
| `worker/nuvio.js`, `worker/apercu.js`, `worker/reglages.js` | Les écrans Nuvio TV recopiés pour les aperçus du guide |
| `catalogs.json` | Définition des catalogues et rangées |
| `collections/` | Les collections Nuvio |
| `assets.json`, `genres/`, `seasons/`, `gifs/`, `titles/` | Images des tuiles de collections (1280×720) et animations au survol |
| `data/` | Données communes : notes IMDb, vocabulaire de recherche, plateformes, fenêtres salle → numérique des distributeurs (`estimations-vod.json`, lues aussi par les copies) |
| `scripts/` | Scripts Python lancés par GitHub Actions |
| `addon/` | Ancien addon statique (encore construit chaque nuit pour les anciennes installations) |
| `Dockerfile`, `docker/`, `docker-compose.yml` | Image des copies Docker |

### Tests

```sh
node --import ./tests/support/register.mjs --test "tests/*.test.js"   # addon et site
cd affiches && npm ci && npm test                                     # service des affiches
python -m unittest discover -s tests/python                           # scripts (Pillow nécessaire)
```

Addon et site : Node 22 ou plus, aucun paquet à installer (`tests/support` charge les JSON et le fichier des
notes IMDb comme le fait Cloudflare). Les trois suites tournent sur GitHub à chaque push et pull request
(workflow « Tests »).

### Déploiement et tâches automatiques

Le Worker est déployé par Cloudflare (Workers Builds) à chaque push sur `main`. Le service des affiches
(`affiches/`) est déployé par Vercel, seulement quand ce dossier change. Ni l'un ni l'autre n'attend le
workflow « Tests ».

| Workflow | Quand | Ce qu'il fait |
|---|---|---|
| Tests | à chaque push et pull request | Les trois suites de tests |
| Surveillance du serveur Oracle | lancée par le Worker (toutes les 5 minutes, `worker/surveillance.js`, jeton `SURVEILLANCE_GITHUB`) quand il y a à faire ; toutes les heures en secours | Serveur injoignable 3 fois de suite : catalogues et fiches repassent par le Worker (déploiement sans `_redirects`), passage en rouge ; il répond 5 fois de suite : ils y retournent. Exercice à la main : `forcer` à `couper` |
| Mettre à jour l'addon | chaque nuit, et à chaque changement de `catalogs.json`, `scripts/update_addon.py`, `scripts/build_search_words.py` ou `scripts/build_fenetres_vod.py` | Addon statique, saison en cours, vocabulaire de recherche, fenêtres des distributeurs américains (dates « Dispo vers le ») |
| Notes IMDb | chaque soir, et à chaque changement de `scripts/build_imdb_ratings.py` | Refait `data/imdb-ratings.bin`, puis relance l'image Docker le lundi s'il a changé |
| Générer les images des collections | à chaque changement d'`assets.json`, `scripts/make_assets.py` ou `fonts/` | Tuiles et GIF |
| Image Docker | à chaque changement du Worker, de `catalogs.json`, `wrangler.toml`, `Dockerfile` ou `docker/`, et après de nouvelles notes IMDb | Publie `ghcr.io/xnzx07/nuvio-assets` |
| Liste des plateformes TMDB | à la main | Refait `data/providers_fr.json` |

Secret GitHub nécessaire : `TMDB_API_KEY`. Les workflows qui enregistrent sur `main` ne tournent que sur ce
dépôt (jamais sur un fork) ; en cas d'échec, ils ouvrent une issue « Échec de … » (ou la complètent).
Une panne de TMDB ne publie pas un addon troué : une liste en échec garde ses pages de la veille, et au-delà
de 10 % de listes en échec rien n'est modifié.

### Diagnostics

Les pages `/debug/…` dépensent la clé Gemini de l'instance : elles ne s'ouvrent que depuis le lien d'addon
de l'hébergeur, celui qui contient cette clé.

- `/<config>/debug/search/<movie|series>/<requête>` : détail d'une recherche
- `/<config>/debug/renewal/<id TMDB>` : diagnostic « saison suivante »

---

## Crédits

Données et images : [TMDB](https://www.themoviedb.org) (ce produit utilise l'API TMDB sans être approuvé ni
certifié par TMDB). Notes : fichiers publics d'[IMDb](https://developer.imdb.com/non-commercial-datasets/).
Épisodes de remplissage : [animefillerlist.com](https://www.animefillerlist.com).
Police : Bebas Neue, licence SIL OFL (`fonts/OFL.txt`).
