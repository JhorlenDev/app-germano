import { test } from "node:test";
import assert from "node:assert/strict";
import { blankState } from "../shared/engine.js";
import { importDocuments } from "../src/import-workflow.js";
import { parseFileRaw } from "../src/parsers.js";
import { stateSchema } from "../shared/schema";
const cnpj = "12345678000195";
const card = () =>
  new File(
    [
      `COMPROVANTE DE INSCRIÇÃO\nCNPJ: ${cnpj}\nNOME EMPRESARIAL\nEMPRESA FICTICIA TESTE LTDA\nCÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL\n47.11-3-02 - Comércio\nMUNICÍPIO\nTEFE\nUF\nAM`,
    ],
    "cartao_cnpj.txt",
  );
test("cartão extrai identidade e tem prioridade sobre XML no mesmo lote", async () => {
  const raw = await parseFileRaw(card());
  const { patch } = importDocuments(blankState(), [
    {
      id: "xml",
      hash: "xml",
      ext: "xml",
      name: "entrada.xml",
      size: 1,
      ownCNPJ: "99999999000199",
      emitCNPJ: "99999999000199",
      destCNPJ: cnpj,
      parseStatus: "ok",
      vNF: 500,
      crt: "3",
      competencia: "2027-01",
    },
    { ...raw, hash: "card" },
  ]);
  assert.equal(patch.cnpj, cnpj);
  assert.equal(patch.razaoSocial, "EMPRESA FICTICIA TESTE LTDA");
  assert.equal(patch.municipioUF, "TEFE - AM");
  assert.equal(patch.cnae, "47.11-3-02");
  assert.equal(patch.comprasMensais, 500);
  assert.ok(stateSchema.safeParse({ ...blankState(), ...patch }).success);
});
test("CNPJ existente não é substituído por documento de outro cliente", async () => {
  const { patch } = importDocuments(
    { ...blankState(), cnpj: "99999999000199" },
    [{ ...(await parseFileRaw(card())), hash: "card" }],
  );
  assert.equal(patch.cnpj, "99999999000199");
  assert.equal(patch.razaoSocial, undefined);
  assert.equal(patch.documentos?.[0].status, "rejeitado");
});
test("PGDAS autoidentifica e soma o lote como no HTML, sem forçar competência", () => {
  const raws = ["01", "02"].map((month, i) => ({
    id: month,
    hash: month,
    name: "pgdas.txt",
    size: 1,
    ext: "txt",
    tipo: "pgdas",
    parseStatus: "ok",
    parseBadgeBase: "PGDAS",
    ownCNPJ: cnpj,
    competencia: `2027-${month}`,
    dados: { faturamento: 1000 * (i + 1), rbt12: 12000 },
  }));
  const { patch } = importDocuments(blankState(), raws);
  assert.equal(patch.cnpj, cnpj);
  assert.equal(patch.faturamentoMensal, 3000);
  assert.equal(patch.competencia, undefined);
  assert.equal(patch.historico?.length, 2);
  assert.ok(stateSchema.safeParse({ ...blankState(), ...patch }).success);
  const second = importDocuments({ ...blankState(), ...patch }, raws);
  assert.equal(second.duplicates, 2);
  assert.equal(second.patch.faturamentoMensal, 3000);
});
test("lote de seis meses preenche totais e histórico sem mudar a competência escolhida", () => {
  const state = { ...blankState(), cnpj, competencia: "2030-09" };
  const raws = Array.from({ length: 6 }, (_, i) => ({
    id: `xml${i}`,
    hash: `hash${i}`,
    name: `nota${i}.xml`,
    size: 1,
    ext: "xml",
    parseStatus: "ok",
    ownCNPJ: cnpj,
    emitCNPJ: cnpj,
    destCNPJ: null,
    mod: "55",
    competencia: `2027-0${i + 1}`,
    vNF: 1000,
    ufEmit: "AM",
    porCategoria: { conferir: 0, cesta: 0, reduzido60: 0, padrao: 1000 },
    itensNCM: [],
  }));
  const { patch } = importDocuments(state, raws);
  assert.equal(patch.faturamentoMensal, 6000);
  assert.equal({ ...state, ...patch }.competencia, "2030-09");
  assert.equal(patch.historico?.length, 6);
  assert.ok(patch.historico?.every((m) => m.faturamento === 1000));
  const persisted = stateSchema.parse({ ...state, ...patch });
  assert.deepEqual(
    importDocuments(persisted, []).patch.historico,
    patch.historico,
  );
});
test("agregadores importados mantêm os resultados das funções do HTML original", async () => {
  const { readFileSync } = await import("node:fs");
  const { runInNewContext } = await import("node:vm");
  const { aggregateFiles, aggregateHistorico } =
    await import("../shared/html-import.js");
  const html = readFileSync(
    new URL("../diagnostico-tributario-2027-app.html", import.meta.url),
    "utf8",
  );
  const start = html.indexOf("function aggregateFiles(");
  const end = html.indexOf("/* ============================= UI PIECES", start);
  const original = runInNewContext(
    html.slice(start, end) + "; ({aggregateFiles,aggregateHistorico})",
  );
  const documents = [
    {
      status: "ok",
      tipo: "pgdas",
      competencia: "2027-01",
      dados: { rbt12: 123400, faturamento: 9000, cnae: "47.11-3-02" },
      anexoDetectado: { setor: "comercio", anexo: "I" },
    },
    {
      status: "estimado",
      tipo: "folha",
      competencia: "2027-01",
      dados: { folha: 1200, proLabore: 300 },
    },
    {
      status: "ok",
      tipo: "nfe_saida",
      competencia: "2027-02",
      dados: {
        vNF: 1000,
        isB2B: true,
        ufEmit: "AM",
        porCategoria: { cesta: 500, reduzido60: 200, padrao: 300 },
      },
    },
    {
      status: "ok",
      tipo: "nfe_entrada",
      competencia: "2027-02",
      dados: { vNF: 600, credito: true },
    },
    {
      status: "rejeitado",
      tipo: "nfe_saida",
      competencia: "2027-02",
      dados: { vNF: 999999 },
    },
  ];
  for (const fn of ["aggregateFiles", "aggregateHistorico"] as const) {
    const actual = { aggregateFiles, aggregateHistorico }[fn](documents);
    assert.deepEqual(
      JSON.parse(JSON.stringify(actual)),
      JSON.parse(JSON.stringify(original[fn](documents))),
    );
  }
});
