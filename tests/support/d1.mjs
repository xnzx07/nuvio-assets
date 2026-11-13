// Base D1 simulée : les plafonds (sf_budget, INSERT … ON CONFLICT … RETURNING) et la mémoire commune des avis VF
// (avis_vf). ecritures : chaque écriture, pour vérifier qu'un plafond atteint n'en fait plus.
export function fakeD1() {
  const budget = new Map(), avis = new Map(), nouvelles = new Map(), ecritures = [];
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    async run() {
      if (sql.startsWith("CREATE")) return {};
      ecritures.push(sql);
      // Compte par origine (« jour:photo », « jour:affiches », « jour:refus ») : sans plafond.
      if (sql.startsWith("INSERT INTO sf_budget")) { const [j, n] = args; budget.set(j, (budget.get(j) || 0) + n); return {}; }
      if (sql.startsWith("INSERT INTO avis_vf")) { const [cle, a, t, depuis] = args; avis.set(cle, { cle, avis: a, t, depuis }); return {}; }
      // Les films passés en VFF à une tournée (vff_nouvelles).
      if (sql.startsWith("DELETE FROM vff_nouvelles")) { for (const [c, t] of nouvelles) if (t < args[0]) nouvelles.delete(c); return {}; }
      if (sql.startsWith("INSERT OR IGNORE INTO vff_nouvelles")) { if (!nouvelles.has(args[0])) nouvelles.set(args[0], args[1]); return {}; }
      throw new Error("requête inattendue : " + sql);
    },
    async first() {
      if (sql.startsWith("SELECT n FROM sf_budget")) return budget.has(args[0]) ? { n: budget.get(args[0]) } : null;
      if (!sql.startsWith("INSERT INTO sf_budget")) throw new Error("requête inattendue : " + sql);
      ecritures.push(sql);
      const [j, n, plafond] = args, avant = budget.get(j);
      if (avant === undefined) { budget.set(j, n); return { n }; }
      if (avant + n > plafond) return null;
      budget.set(j, avant + n);
      return { n: avant + n };
    },
    async all() {
      if (sql.startsWith("SELECT cle, t FROM vff_nouvelles")) return { results: [...nouvelles].filter(([, t]) => t >= args[0]).map(([cle, t]) => ({ cle, t })) };
      if (!sql.startsWith("SELECT cle, avis, t, depuis FROM avis_vf WHERE cle IN")) throw new Error("requête inattendue : " + sql);
      return { results: args.filter((c) => avis.has(c)).map((c) => avis.get(c)) };
    },
  });
  return { budget, avis, nouvelles, ecritures, prepare: (sql) => stmt(sql), batch: async (liste) => Promise.all(liste.map((s) => s.run())) };
}
