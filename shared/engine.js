import { ANEXO_I, ANEXO_II, ANEXO_III, ANEXO_IV, ANEXO_V } from "./tables.js";
export const ENGINE_VERSION = "2027-simulacao-1";
export const labels = {
  tradicional: "Simples Tradicional",
  hibrido: "Simples Híbrido",
  presumido: "Lucro Presumido",
};
export const sectors = {
  comercio: "Comércio",
  industria: "Indústria",
  servicos: "Serviços",
};
export const money = (value) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
export const percent = (value) =>
  `${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
export const formatCompetencia = (value) =>
  value ? value.split("-").reverse().join("/") : "Sem competência";
export const emptyMonth = () => ({
  competencia: "",
  faturamento: 0,
  compras: 0,
  comprasCredito: 0,
  folha: 0,
  proLabore: 0,
  icmsCredito: 0,
});
export function blankState() {
  return {
    razaoSocial: "",
    cnpj: "",
    setor: "comercio",
    uf: "AM",
    municipioUF: "",
    faturamentoMensal: 0,
    rbt12: 0,
    comprasMensais: 0,
    comprasCredito: 0,
    folhaMensal: 0,
    proLabore: 0,
    fs12: null,
    anexoServicosForcado: "III",
    aliquotaEstMun: 20,
    icmsCredito: 0,
    rat: 2,
    terceiros: 5.8,
    cbs: 8.7,
    ibs: 0.1,
    cestaPct: 0,
    reduzido60Pct: 0,
    reducaoServicos: 0,
    aliquotaPersonalizada: null,
    competencia: "",
    notas: "",
    historico: [],
    documentos: [],
  };
}
export function exampleState(setor = "comercio") {
  const d = {
    ...blankState(),
    setor,
    razaoSocial: "Empresa de demonstração",
    faturamentoMensal: 100000,
    rbt12: 1200000,
    comprasMensais: 50000,
    comprasCredito: 30000,
    folhaMensal: 12000,
    proLabore: 4000,
    aliquotaEstMun: setor === "servicos" ? 3 : 20,
    icmsCredito: setor === "servicos" ? 0 : 6000,
    competencia: "2027-01",
  };
  d.historico = Array.from({ length: 6 }, (_, i) => ({
    ...emptyMonth(),
    competencia: `2027-0${i + 1}`,
    faturamento: 90000 + i * 4000,
    compras: 50000,
    comprasCredito: 30000,
    folha: 12000,
    proLabore: 4000,
    icmsCredito: d.icmsCredito,
  }));
  return d;
}
export function classifyNCM() {
  return "conferir";
} // Benefício só é aplicado após classificação explícita do contador.
export function computeRegimes(d) {
  const warnings = [];
  const fatorR = d.fs12 !== null && d.rbt12 > 0 ? d.fs12 / d.rbt12 : null;
  const nomeAnexo =
    d.setor === "comercio"
      ? "I"
      : d.setor === "industria"
        ? "II"
        : d.anexoServicosForcado === "auto"
          ? fatorR !== null && fatorR >= 0.28
            ? "III"
            : "V"
          : d.anexoServicosForcado;
  const tabela = {
    I: ANEXO_I,
    II: ANEXO_II,
    III: ANEXO_III,
    IV: ANEXO_IV,
    V: ANEXO_V,
  }[nomeAnexo];
  const excede = d.rbt12 > 4800000;
  const faixa = tabela.find((f) => d.rbt12 <= f.max) || tabela.at(-1);
  const aliqEfetiva =
    d.rbt12 > 0
      ? Math.max(
          0,
          (Math.min(d.rbt12, 4800000) * faixa.aliq - faixa.pd) /
            Math.min(d.rbt12, 4800000),
        )
      : faixa.aliq;
  const f = d.faturamentoMensal;
  const cppSeparado =
    nomeAnexo === "IV"
      ? (d.folhaMensal * (20 + d.rat)) / 100 + d.proLabore * 0.2
      : 0;
  const cppPresumido =
    (d.folhaMensal * (20 + d.rat + d.terceiros)) / 100 + d.proLabore * 0.2;
  const fatorBeneficio =
    d.setor === "servicos"
      ? 1 - d.reducaoServicos / 100
      : Math.max(0, 1 - d.cestaPct / 100 - (d.reduzido60Pct * 0.6) / 100);
  const cbsAliq =
    d.aliquotaPersonalizada !== null
      ? d.aliquotaPersonalizada
      : d.cbs * fatorBeneficio;
  const ibsAliq = d.ibs * fatorBeneficio;
  const cbsDebito = (f * cbsAliq) / 100,
    cbsCredito = (d.comprasCredito * d.cbs) / 100;
  const ibsDebito = (f * ibsAliq) / 100,
    ibsCredito = (d.comprasCredito * d.ibs) / 100;
  const cbs = Math.max(0, cbsDebito - cbsCredito),
    ibs = Math.max(0, ibsDebito - ibsCredito);
  const das = f * aliqEfetiva;
  const irpjBase = f * (d.setor === "servicos" ? 0.32 : 0.08);
  const irpj = irpjBase * 0.15 + Math.max(0, irpjBase - 20000) * 0.1;
  const csll = f * (d.setor === "servicos" ? 0.32 : 0.12) * 0.09;
  const estadual =
    d.setor === "servicos"
      ? (f * d.aliquotaEstMun) / 100
      : Math.max(0, (f * d.aliquotaEstMun) / 100 - d.icmsCredito);
  const linha = (label, valor) => ({ label, valor });
  const regimeLines = {
    tradicional: {
      linhas: [
        linha(`DAS — Anexo ${nomeAnexo}`, das),
        linha("Previdência fora do DAS", cppSeparado),
      ],
    },
    hibrido: {
      linhas: [
        linha(
          "DAS reduzido (partilha estimada)",
          das * (1 - faixa.percCBS / 100),
        ),
        linha("CBS líquida", cbs),
        linha("IBS líquido", ibs),
        linha("Previdência fora do DAS", cppSeparado),
      ],
    },
    presumido: {
      linhas: [
        linha("IRPJ + adicional (projeção mensal)", irpj),
        linha("CSLL", csll),
        linha("CBS líquida", cbs),
        linha("IBS líquido", ibs),
        linha(d.setor === "servicos" ? "ISS" : "ICMS líquido", estadual),
        linha("Contribuições patronais", cppPresumido),
      ],
    },
  };
  const regimes = Object.fromEntries(
    Object.entries(regimeLines).map(([key, regime]) => {
      const mensal = regime.linhas.reduce((sum, l) => sum + l.valor, 0);
      return [
        key,
        {
          ...regime,
          label: labels[key],
          mensal,
          anual: mensal * 12,
          cargaEfetiva: f ? (mensal / f) * 100 : 0,
          elegivel: key === "presumido" || !excede,
        },
      ];
    }),
  );
  if (!f || !d.rbt12)
    warnings.push("Informe faturamento e RBT12 para comparar os cenários.");
  if (d.rbt12 > 3600000)
    warnings.push(
      "Receita acima de R$ 3,6 milhões: sublimites e recolhimento de ICMS/ISS fora do DAS exigem apuração específica. Comparação conclusiva indisponível.",
    );
  if (
    d.setor === "servicos" &&
    d.anexoServicosForcado === "auto" &&
    fatorR === null
  )
    warnings.push("Informe a folha acumulada em 12 meses para usar o Fator R.");
  if (d.setor === "industria")
    warnings.push(
      "IPI, Imposto Seletivo e incentivos industriais/ZFM não estão modelados. Comparação conclusiva indisponível.",
    );
  const comparavel =
    !!f &&
    !!d.rbt12 &&
    d.rbt12 <= 3600000 &&
    d.setor !== "industria" &&
    !(
      d.setor === "servicos" &&
      d.anexoServicosForcado === "auto" &&
      fatorR === null
    );
  const sorted = Object.keys(regimes)
    .filter((k) => regimes[k].elegivel)
    .sort((a, b) => regimes[a].mensal - regimes[b].mensal);
  const melhor = comparavel ? sorted[0] : null;
  return {
    regimes,
    melhor,
    economiaAnual: melhor
      ? regimes[sorted.at(-1)].anual - regimes[melhor].anual
      : 0,
    warnings,
    fatorR,
    nomeAnexo,
    aliqEfetiva,
    faixa,
    excede,
    cbsDebito,
    cbsCredito,
    ibsDebito,
    ibsCredito,
    creditoExcedente:
      Math.max(0, cbsCredito - cbsDebito) + Math.max(0, ibsCredito - ibsDebito),
    version: ENGINE_VERSION,
  };
}
export function computeMonth(d, month) {
  return computeRegimes({
    ...d,
    faturamentoMensal: month.faturamento,
    comprasMensais: month.compras,
    comprasCredito: month.comprasCredito,
    folhaMensal: month.folha,
    proLabore: month.proLabore,
    icmsCredito: month.icmsCredito,
  });
}
export function aggregateDocuments(docs, competencia) {
  const monthDocs = docs.filter(
    (f) => f.status === "ok" && f.competencia === competencia,
  );
  const m = { ...emptyMonth(), competencia };
  const saidas = monthDocs.filter((f) =>
    ["nfe_saida", "nfce_saida"].includes(f.tipo),
  );
  const pgdas = monthDocs.filter((f) => f.tipo === "pgdas");
  m.faturamento = saidas.length
    ? saidas.reduce((s, f) => s + (f.dados.vNF || 0), 0)
    : pgdas.reduce((s, f) => s + (f.dados.faturamento || 0), 0);
  for (const f of monthDocs) {
    if (f.tipo === "nfe_entrada") {
      m.compras += f.dados.vNF || 0;
      if (f.dados.credito) m.comprasCredito += f.dados.vNF || 0;
    }
    if (f.tipo === "folha") {
      m.folha += f.dados.folha || 0;
      m.proLabore += f.dados.proLabore || 0;
    }
  }
  return { ...m, rbt12: pgdas.at(-1)?.dados.rbt12 ?? null };
}
export function mergeDocuments(existing, incoming) {
  const seen = new Set(existing.map((f) => f.chave || f.hash || f.id));
  const merged = [...existing];
  let duplicates = 0;
  for (const f of incoming) {
    const key = f.chave || f.hash || f.id;
    if (seen.has(key)) duplicates++;
    else {
      seen.add(key);
      merged.push(f);
    }
  }
  return { merged, duplicates };
}
