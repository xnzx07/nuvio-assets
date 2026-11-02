/**
 * Écrit les fichiers du site (/statique/…, et /logo.png) dans .statique-site/, avant chaque déploiement et chaque
 * wrangler dev ([build] de wrangler.toml) : Cloudflare les sert lui-même ([assets]), sans lancer le Worker, donc
 * hors des 100 000 requêtes par jour du compte (gratuit). Le Worker garde ses routes /statique/… et /logo.png : un
 * fichier absent d'ici (copie Docker sans le dossier logo/) passe par lui, comme avant.
 * Le contenu vient de worker/statique.js, le même que celui que sert le Worker : chargé sous Node avec chargeur.mjs
 * (polices .woff2, notes .bin, .json importés sans attribut, que l'outil de Cloudflare intègre lui-même).
 */
import { register } from "node:module";
import { mkdir, rm, writeFile, copyFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { redirige, regles, serveurPret, ENTETES_REDIRECTIONS } from "./redirections.mjs";

register("./chargeur.mjs", import.meta.url);
const { nomsStatiques, contenuStatique } = await import("../statique.js");

const racine = new URL("../../", import.meta.url), sortie = new URL(".statique-site/", racine);
await rm(sortie, { recursive: true, force: true });
for (const nom of nomsStatiques()) {
  const f = new URL("statique/" + nom, sortie);
  await mkdir(new URL(".", f), { recursive: true });
  const c = contenuStatique(nom);
  // Fins de ligne de Windows (dépôt cloné sous Windows) dans le code des fonctions recopiées (toString) : retirées.
  await writeFile(f, typeof c === "string" ? c.replace(/\r\n/g, "\n") : Buffer.from(c));
}
// L'adresse versionnée (?v=<empreinte>) change avec le contenu : gardés un an par le navigateur, comme par le Worker.
let entetes = "/statique/*\n  Cache-Control: public, max-age=31536000, immutable\n";
const logo = new URL("logo/addon.png", racine);
if (await access(logo).then(() => true, () => false)) {
  await copyFile(logo, new URL("logo.png", sortie));
  entetes += "/logo.png\n  Cache-Control: public, max-age=86400\n";
}
// Catalogues et fiches au serveur Oracle (redirections.mjs), au déploiement de ce dépôt seulement.
let depot = "";
try { depot = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { /* pas un dépôt git : une copie */ }
const renvoi = redirige({ commande: process.env.WRANGLER_COMMAND, depot, coupe: process.env.ADDON_ORACLE === "coupe" }) && await serveurPret();
if (renvoi) {
  await writeFile(new URL("_redirects", sortie), regles());
  entetes += ENTETES_REDIRECTIONS;
}
await writeFile(new URL("_headers", sortie), entetes);
console.log(`fichiers du site : ${nomsStatiques().length} dans ${fileURLToPath(sortie)}${renvoi ? " ; catalogues et fiches au serveur Oracle" : ""}`);
