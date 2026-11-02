/**
 * Catalogues et fiches renvoyés au serveur Oracle (worker/oracle/) par le fichier _redirects des fichiers statiques :
 * Cloudflare répond 307 sans lancer le Worker, hors des 100 000 requêtes par jour du compte (essai du 1er novembre 2026 :
 * 300 demandes redirigées, 0 comptée). Paramètres et caractères encodés suivent.
 * Seulement au déploiement de ce dépôt : ni wrangler dev, ni les copies, qui n'ont pas ce serveur.
 * Serveur en panne : .github/workflows/surveillance.yml redéploie tout seul sans elles (ADDON_ORACLE=coupe), puis les
 * remet. Pour les retirer à la main, et que la surveillance n'y touche plus : ACTIF à false, et déployer.
 */
export const ACTIF = true;
export const SERVEUR_ADDON = "https://141-145-210-31.sslip.io";
const CE_DEPOT = /github\.com[/:]xnzx07\/nuvio-assets(\.git)?\/?$/;

export const redirige = ({ actif = ACTIF, coupe = false, commande, depot }) => actif && !coupe && commande !== "dev" && CE_DEPOT.test(String(depot || "").trim());

export const regles = (serveur = SERVEUR_ADDON) => ["catalog", "meta"].flatMap((q) => [
  `/:cfg/${q}/* ${serveur}/:cfg/${q}/:splat 307`,
  `/${q}/* ${serveur}/${q}/:splat 307`,
]).join("\n") + "\n";

// Ces réponses 307 doivent laisser passer les pages web et les applis qui lisent l'addon depuis un navigateur.
export const ENTETES_REDIRECTIONS = "/*\n  Access-Control-Allow-Origin: *\n  Access-Control-Allow-Headers: *\n";
