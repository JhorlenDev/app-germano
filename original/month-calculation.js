// Share the main simulator's assumptions with the monthly table.
const monthImportCache = new WeakMap();
function importedMonth(d, period) {
  if (!period || !d.documentosImportados?.length) return null;
  let periods = monthImportCache.get(d.documentosImportados);
  if (!periods) { periods = new Map(); monthImportCache.set(d.documentosImportados, periods); }
  if (!periods.has(period)) periods.set(period, window.gmImport.aggregate(d.documentosImportados, period, aggregateFiles));
  return periods.get(period);
}
function preciseSimulationData(d) {
  const a = importedMonth(d, d.competenciaImportacao);
  if (!a || !a.comprasEntrada || d.comprasMensais !== a.comprasEntrada) return d;
  const ratio = 100 * a.comprasComCredito / a.comprasEntrada;
  // Recover precision in records saved by the old importer, preserving manual changes.
  return d.pctFornecedorRegimeNormal === Math.round(ratio)
    ? { ...d, pctFornecedorRegimeNormal: ratio } : d;
}
function computeRegimes(d) {
  return computeRegimesOriginal(preciseSimulationData(d));
}
function computeMesRegimes(d, mes) {
  const index = d.historico.indexOf(mes);
  const a = importedMonth(d, d.historicoCompetencias?.[index]);
  const comprasOutras = mes.comprasOutras ?? (a ? Math.max(0, a.comprasEntrada - a.comprasComCredito) : 0);
  const compras = mes.comprasRegimeNormal + comprasOutras;
  const proLabore = Math.min(mes.folha, mes.proLabore ?? a?.proLabore ?? 0);
  const result = computeRegimesOriginal({
    ...d,
    faturamentoMensal: mes.faturamento,
    comprasMensais: compras,
    pctFornecedorRegimeNormal: compras ? 100 * mes.comprasRegimeNormal / compras : 0,
    folhaMensal: mes.folha - proLabore,
    proLabore,
  });
  const keys = ['tradicional', 'hibrido', 'presumido'];
  const valores = Object.fromEntries(keys.map(k => [k, result.regimes[k].mensal]));
  const pior = keys.reduce((a, b) => valores[b] > valores[a] ? b : a);
  return { ...valores, melhor: result.melhor, pior,
    economia: valores[pior] - valores[result.melhor],
    efetivas: Object.fromEntries(keys.map(k => [k, result.regimes[k].cargaEfetiva])),
    aliqEfetiva: result.aliqEfetiva, nomeAnexo: result.nomeAnexo,
    cppNoDAS: result.cppNoDAS, faixa: result.faixa };
}
