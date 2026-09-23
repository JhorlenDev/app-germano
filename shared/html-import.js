// Import aggregation preserved from diagnostico-tributario-2027-app.html.
export function aggregateFiles(arquivos) {
  const agg = {
    faturamentoSaida: 0,
    comprasEntrada: 0,
    comprasComCredito: 0,
    vendasB2B: 0,
    vendasB2C: 0,
    rbt12: null,
    pgdasFaturamento: 0,
    folha: 0,
    proLabore: 0,
    temFolha: false,
    comercioCategorias: { cesta: 0, reduzido60: 0, padrao: 0 },
    cnaeDetectado: null,
    ufDetectada: null,
    anexoDetectado: null,
    ncmMap: {},
  };
  arquivos.forEach((f) => {
    if (f.status === "erro" || f.status === "rejeitado") return;
    if (f.tipo === "nfce_saida" || f.tipo === "nfe_saida") {
      const v = f.dados.vNF || 0;
      agg.faturamentoSaida += v;
      if (f.dados.isB2B) agg.vendasB2B += v;
      else agg.vendasB2C += v;
      if (f.dados.porCategoria) {
        agg.comercioCategorias.cesta += f.dados.porCategoria.cesta || 0;
        agg.comercioCategorias.reduzido60 +=
          f.dados.porCategoria.reduzido60 || 0;
        agg.comercioCategorias.padrao += f.dados.porCategoria.padrao || 0;
      }
      if (f.dados.ufEmit && !agg.ufDetectada) agg.ufDetectada = f.dados.ufEmit;
      if (f.dados.itensNCM) {
        f.dados.itensNCM.forEach((item) => {
          const key = item.ncm || "(sem NCM)";
          if (!agg.ncmMap[key])
            agg.ncmMap[key] = {
              ncm: key,
              descricao: item.descricao || null,
              categoria: item.categoria,
              valorTotal: 0,
              ocorrencias: 0,
            };
          agg.ncmMap[key].valorTotal += item.vProd || 0;
          agg.ncmMap[key].ocorrencias += 1;
          if (!agg.ncmMap[key].descricao && item.descricao)
            agg.ncmMap[key].descricao = item.descricao;
        });
      }
    } else if (f.tipo === "nfe_entrada") {
      const v = f.dados.vNF || 0;
      agg.comprasEntrada += v;
      if (f.dados.credito) agg.comprasComCredito += v;
    } else if (f.tipo === "pgdas") {
      if (f.dados.rbt12) agg.rbt12 = f.dados.rbt12;
      if (f.dados.faturamento) agg.pgdasFaturamento += f.dados.faturamento;
      if (f.dados.cnae && !agg.cnaeDetectado) agg.cnaeDetectado = f.dados.cnae;
      if (f.anexoDetectado && !agg.anexoDetectado)
        agg.anexoDetectado = f.anexoDetectado;
    } else if (f.tipo === "folha") {
      if (f.dados.folha) {
        agg.folha += f.dados.folha;
        agg.temFolha = true;
      }
      if (f.dados.proLabore) {
        agg.proLabore += f.dados.proLabore;
        agg.temFolha = true;
      }
      if (f.dados.cnae && !agg.cnaeDetectado) agg.cnaeDetectado = f.dados.cnae;
    }
  });
  if (agg.faturamentoSaida === 0 && agg.pgdasFaturamento > 0)
    agg.faturamentoSaida = agg.pgdasFaturamento;
  return agg;
}

// Agrupa os arquivos processados por competência (YYYY-MM) identificada, retornando até as 6 mais recentes.
export function aggregateHistorico(arquivos) {
  const byMonth = {};
  arquivos.forEach((f) => {
    if (f.status === "erro" || f.status === "rejeitado" || !f.competencia)
      return;
    if (!byMonth[f.competencia])
      byMonth[f.competencia] = {
        faturamento: 0,
        comprasRegimeNormal: 0,
        folha: 0,
      };
    if (f.tipo === "nfce_saida" || f.tipo === "nfe_saida") {
      byMonth[f.competencia].faturamento += f.dados.vNF || 0;
    } else if (f.tipo === "nfe_entrada" && f.dados.credito) {
      byMonth[f.competencia].comprasRegimeNormal += f.dados.vNF || 0;
    } else if (f.tipo === "folha") {
      byMonth[f.competencia].folha +=
        (f.dados.folha || 0) + (f.dados.proLabore || 0);
    }
  });
  const competencias = Object.keys(byMonth).sort().slice(-6);
  return { competencias, porMes: competencias.map((k) => byMonth[k]) };
}
