/**
 * La base D1 de l'addon (liens fixes, avis, plafonds) lue depuis le serveur Oracle par l'API de Cloudflare : les mêmes
 * données que le Worker, et aucune requête de Worker. Mêmes appels que env.LIENS : prepare().bind().first/all/run, batch.
 */
const API = "https://api.cloudflare.com/client/v4/accounts";

export function creerD1({ jeton, compte, base, fetchImpl = fetch }) {
  const adresse = `${API}/${compte}/d1/database/${base}/query`;
  async function envoyer(corps) {
    const res = await fetchImpl(adresse, { method: "POST", headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
      body: JSON.stringify(corps), signal: AbortSignal.timeout(10000) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.success === false) throw new Error(`D1 : ${res.status} ${JSON.stringify(j.errors || j).slice(0, 300)}`);
    return j.result || [];
  }
  const forme = (r = {}) => ({ results: r.results || [], success: r.success !== false, meta: r.meta || {} });
  const lire = async (sql, params) => forme((await envoyer({ sql, params }))[0]);
  const instruction = (sql, params = []) => ({
    bind: (...valeurs) => instruction(sql, valeurs),
    all: () => lire(sql, params),
    run: () => lire(sql, params),
    async first(colonne) {
      const ligne = (await lire(sql, params)).results[0];
      if (!ligne) return null;
      return colonne ? ligne[colonne] ?? null : ligne;
    },
    async raw() { return (await lire(sql, params)).results.map((l) => Object.values(l)); },
  });
  return {
    prepare: (sql) => instruction(sql),
    // L'une après l'autre, dans l'ordre ; contrairement au vrai batch, sans transaction (ici : des écritures indépendantes).
    async batch(liste) {
      const sorties = [];
      for (const i of liste) sorties.push(await i.run());
      return sorties;
    },
    async exec(sql) { await envoyer({ sql }); return { count: 1, duration: 0 }; },
  };
}
