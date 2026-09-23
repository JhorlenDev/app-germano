import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankState,
  computeRegimes,
  computeMonth,
  aggregateDocuments,
  mergeDocuments,
  exampleState,
} from "../shared/engine.js";
import { stateSchema } from "../shared/schema";
import {
  NUM,
  numberNear,
  parseCurrencyBR,
  detectAnexoPGDAS,
  finalizeFile,
  parseNFeXML,
} from "../src/parsers.js";
import { JSDOM } from "jsdom";
const dom = new JSDOM();
Object.assign(globalThis, { DOMParser: dom.window.DOMParser });
const base = () => ({
  ...blankState(),
  razaoSocial: "Empresa de teste",
  cnpj: "12345678000195",
  rbt12: 1200000,
  faturamentoMensal: 100000,
});
test("extrai valores brasileiros com e sem separador de milhar", () => {
  const expression = new RegExp("RBT[\\s-]*12[^\\d]{0,20}" + NUM, "i");
  assert.equal(numberNear("RBT12 1950000,00", expression), 1950000);
  assert.equal(numberNear("RBT12 1.950.000,00", expression), 1950000);
  assert.equal(parseCurrencyBR("1.234,56"), 1234.56);
});
test("preserva CBS personalizada de zero", () => {
  const r = computeRegimes({ ...base(), aliquotaPersonalizada: 0 });
  assert.equal(r.cbsDebito, 0);
});
test("mesmo mês produz exatamente o mesmo resultado nas duas telas", () => {
  const d = exampleState();
  const r = computeRegimes(d),
    month = computeMonth(d, {
      competencia: "2027-01",
      faturamento: d.faturamentoMensal,
      compras: d.comprasMensais,
      comprasCredito: d.comprasCredito,
      folha: d.folhaMensal,
      proLabore: d.proLabore,
      icmsCredito: d.icmsCredito,
    });
  for (const key of ["tradicional", "hibrido", "presumido"])
    assert.equal(r.regimes[key].mensal, month.regimes[key].mensal);
});
test("não indica melhor regime acima do limite ou com sublimite não modelado", () => {
  for (const rbt12 of [3600001, 4800000, 6000000])
    assert.equal(computeRegimes({ ...base(), rbt12 }).melhor, null);
  assert.equal(
    computeRegimes({ ...base(), rbt12: 6000000 }).regimes.tradicional.elegivel,
    false,
  );
});
test("Anexo IV aplica RAT só aos empregados e não aplica terceiros", () => {
  const r = computeRegimes({
    ...base(),
    setor: "servicos",
    anexoServicosForcado: "IV",
    folhaMensal: 10000,
    proLabore: 5000,
    rat: 2,
  });
  assert.equal(r.regimes.tradicional.linhas[1].valor, 3200);
});
test("Fator R usa FS12 real e não anualiza a folha mensal", () => {
  const d = {
    ...base(),
    setor: "servicos",
    anexoServicosForcado: "auto",
    fs12: 336000,
    folhaMensal: 0,
  };
  assert.equal(computeRegimes(d).nomeAnexo, "III");
  assert.equal(computeRegimes({ ...d, fs12: 335999 }).nomeAnexo, "V");
  assert.equal(computeRegimes({ ...d, fs12: null }).melhor, null);
});
const doc = (competencia: string, hash: string) => ({
  id: hash,
  hash,
  status: "ok",
  tipo: "nfe_saida",
  competencia,
  dados: { vNF: 100000 },
});
test("importação separa competências, sem dobrar receita por PGDAS + XML", () => {
  const docs = [
    doc("2027-01", "a"),
    doc("2027-02", "b"),
    {
      ...doc("2027-01", "c"),
      tipo: "pgdas",
      dados: { faturamento: 100000, rbt12: 1200000 },
    },
  ];
  assert.equal(aggregateDocuments(docs, "2027-01").faturamento, 100000);
  assert.equal(aggregateDocuments(docs, "2027-02").faturamento, 100000);
  assert.equal(aggregateDocuments([], "2027-01").faturamento, 0);
});
test("deduplica por hash ou chave fiscal mesmo com nomes diferentes", () => {
  assert.equal(
    mergeDocuments([doc("2027-01", "a")], [doc("2027-01", "a")]).duplicates,
    1,
  );
  assert.equal(
    mergeDocuments(
      [{ ...doc("2027-01", "a"), chave: "123" }],
      [{ ...doc("2027-01", "b"), chave: "123" }],
    ).merged.length,
    1,
  );
});
test("não aceita totais sem CNPJ de origem nem CNPJ divergente", () => {
  for (const ownCNPJ of [null, "11111111000111"]) {
    const rec = finalizeFile(
      {
        id: "t",
        name: "folha.txt",
        ext: "txt",
        parseStatus: "ok",
        tipo: "folha",
        ownCNPJ,
        dados: { folha: 9999 },
      },
      "12345678000195",
      false,
    );
    assert.equal(rec.status, "rejeitado");
  }
});
test("termo Fator R isolado não força Anexo V", () => {
  assert.equal(detectAnexoPGDAS("Anexo III - Fator R 30%")?.anexo, "III");
});
test("schema rejeita valores negativos, benefícios acima de 100 e documentos incompletos", () => {
  assert.equal(stateSchema.safeParse(base()).success, true);
  assert.equal(
    stateSchema.safeParse({ ...base(), faturamentoMensal: -10 }).success,
    false,
  );
  assert.equal(
    stateSchema.safeParse({ ...base(), cestaPct: 80, reduzido60Pct: 30 })
      .success,
    false,
  );
  assert.equal(
    stateSchema.safeParse({ ...base(), documentos: [{ id: "1" }] }).success,
    false,
  );
});
test("parser XML rejeita devoluções e protocolo denegado", () => {
  assert.equal(
    parseNFeXML(
      "<nfeProc><NFe><infNFe><ide><finNFe>4</finNFe></ide></infNFe></NFe></nfeProc>",
    ),
    null,
  );
  assert.equal(
    parseNFeXML(
      "<nfeProc><NFe><infNFe><ide><finNFe>1</finNFe></ide></infNFe></NFe><protNFe><cStat>110</cStat></protNFe></nfeProc>",
    ),
    null,
  );
});
