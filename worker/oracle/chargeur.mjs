// Le chargeur de l'addon sur le serveur Oracle : celui de la construction, mais les .bin (notes IMDb) gardent leurs
// octets (la construction et les tests n'en ont pas besoin, l'addon si).
import { readFile } from "node:fs/promises";
import { load as base } from "../construire/chargeur.mjs";

export async function load(url, context, next) {
  if (url.endsWith(".bin")) {
    const b64 = (await readFile(new URL(url))).toString("base64");
    return { format: "module", source: `const b = Buffer.from("${b64}", "base64"); export default b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);`, shortCircuit: true };
  }
  return base(url, context, next);
}
