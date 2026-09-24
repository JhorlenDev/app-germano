import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transformAsync } from "@babel/core";
import { JSDOM } from "jsdom";
import * as fflate from "fflate";
const dom = new JSDOM('<div id="root"></div>');
const source = await readFile("diagnostico-tributario-2027-app.html", "utf8");
const jsx = source.match(
  /<script type="text\/babel" data-presets="react">([\s\S]*?)<\/script>/,
)[1];
const compiled = await transformAsync(jsx, {
  plugins: ["@babel/plugin-transform-react-jsx"],
});
const context = vm.createContext({
  React: { createElement: () => ({}) },
  ReactDOM: { createRoot: () => ({ render() {} }) },
  document: dom.window.document,
  DOMParser: dom.window.DOMParser,
  window: {},
  File,
  crypto,
  TextDecoder,
  TextEncoder,
  setTimeout,
  fflate,
  console,
});
vm.runInContext(compiled.code, context);
vm.runInContext(await readFile("original/import-runtime.js", "utf8"), context);
const imp = context.window.gmImport;
const helpers = {
  parseXML: context.parseNFeXML,
  detectAnexo: context.detectAnexoPGDAS,
};
const plain = (v) => JSON.parse(JSON.stringify(v));
const id = "12345678000195";
const parse = (name, text) => imp.parse(new File([text], name), helpers);
const finalize = (r) => imp.finalize(r, id, false, context.finalizeFile);
const key = `132601${id}550010000000011000000001`.slice(0, 44).padEnd(44, "0");
const xml = (value = "25.50", own = id) =>
  `<nfeProc><NFe><infNFe Id="NFe${key}"><ide><mod>55</mod><dhEmi>2026-01-02T10:00:00-04:00</dhEmi><tpNF>1</tpNF><finNFe>1</finNFe></ide><emit><CNPJ>${own}</CNPJ><CRT>3</CRT><enderEmit><UF>AM</UF></enderEmit></emit><dest><CNPJ>99999999000199</CNPJ></dest><total><ICMSTot><vNF>${value}</vNF></ICMSTot></total></infNFe></NFe><protNFe><infProt><cStat>100</cStat></infProt></protNFe></nfeProc>`;
test("PGDAS usa período de apuração, total da linha e comércio, sem confundir Fator r", async () => {
  const r = await parse(
    "extrato.pdf.txt",
    `PGDAS-D\nData de abertura: 04/05/2003\nPeríodo de Apuração: 01/03/2026 a 31/03/2026\nCNPJ: ${id}\nReceita Bruta do PA (RPA) - Competência 123.456,78 1.000,00 124.456,78\nReceita bruta acumulada nos doze meses anteriores 900.000,00 20.000,00 920.000,00\nao PA (RBT12)\nFator r = Não se aplica\nRevenda de mercadorias`,
  );
  assert.equal(r.competencia, "2026-03");
  assert.equal(r.dados.faturamento, 124456.78);
  assert.equal(r.dados.rbt12, 920000);
  assert.equal(r.anexoDetectado.anexo, "I");
});
test("ficha financeira separa seis meses, salários e pró-labore sem usar total semestral", () => {
  const result = imp.payroll(
    "PROVENTOS JAN/2026 FEV/2026 MAR/2026 ABR/2026 MAI/2026 JUN/2026 Total\n1 Salario normal 100,00 200,00 300,00 400,00 500,00 600,00 2.100,00\n118 Pro labore 50,00 50,00 50,00 50,00 50,00 50,00 300,00",
  );
  assert.deepEqual(plain(result["2026-01"]), { folha: 100, proLabore: 50 });
  assert.deepEqual(plain(result["2026-06"]), { folha: 600, proLabore: 50 });
  assert.equal(Object.keys(result).length, 6);
});
test("reenvio de XML e ZIP aninhado não duplica nota e chave conflitante fica com erro", async () => {
  const bytes = new TextEncoder().encode(xml());
  const nested = fflate.zipSync({ "nota.xml": bytes });
  const zip = fflate.zipSync({ "pasta/nota.xml": bytes, "outro.zip": nested });
  const { raws, stats } = await imp.ingest(
    [new File([zip], "lote.zip")],
    [],
    helpers,
    () => {},
  );
  assert.equal(raws.length, 1);
  assert.equal(stats.duplicates, 1);
  const duplicate = await imp.ingest(
    [new File([bytes], "renomeada.xml")],
    raws,
    helpers,
    () => {},
  );
  assert.equal(duplicate.raws.length, 0);
  assert.equal(duplicate.stats.duplicates, 1);
  const conflict = await imp.ingest(
    [new File([xml("99.99")], "alterada.xml")],
    raws,
    helpers,
    () => {},
  );
  assert.equal(conflict.raws[0].parseStatus, "erro");
});
test("CSV de cancelamento retira a nota dos totais sem somar o CSV", async () => {
  const invoice = finalize(await parse("nota.xml", xml()));
  const csv = finalize(
    await parse("situacao.csv", `CHAVE;SITUACAO\n'${key}';CANCELADA`),
  );
  assert.equal(
    imp.aggregate([invoice], "2026-01", context.aggregateFiles)
      .faturamentoSaida,
    25.5,
  );
  assert.equal(
    imp.aggregate([invoice, csv], "2026-01", context.aggregateFiles)
      .faturamentoSaida,
    0,
  );
});
test("outro CNPJ, XML inválido e documento sem titular não alimentam os totais", async () => {
  assert.equal(
    finalize(await parse("outra.xml", xml("10.00", "88888888000188"))).status,
    "rejeitado",
  );
  assert.equal((await parse("quebrado.xml", "<NFe>")).parseStatus, "erro");
  const folha = await parse(
    "folha_202601.txt",
    "Folha de pagamento: 5.000,00\nCompetência: 01/2026",
  );
  assert.equal(finalize(folha).status, "estimado");
  assert.equal(
    imp.aggregate([finalize(folha)], "2026-01", context.aggregateFiles).folha,
    0,
  );
});
test("mês selecionado não soma outras competências e PGDAS prevalece com aviso de divergência", () => {
  const rows = [
    {
      id: "a",
      tipo: "pgdas",
      status: "ok",
      competencia: "2026-01",
      dados: { faturamento: 100, rbt12: 1200 },
    },
    {
      id: "b",
      tipo: "pgdas",
      status: "ok",
      competencia: "2026-02",
      dados: { faturamento: 200, rbt12: 2400 },
    },
    {
      id: "c",
      tipo: "nfe_saida",
      status: "ok",
      competencia: "2026-01",
      dados: { vNF: 90 },
    },
  ];
  const jan = imp.aggregate(rows, "2026-01", context.aggregateFiles);
  assert.equal(jan.faturamentoSaida, 100);
  assert.equal(jan.rbt12, 1200);
  assert.ok(jan.warnings.some((w) => w.includes("difere")));
  const feb = imp.aggregate(rows, "2026-02", context.aggregateFiles);
  assert.equal(feb.faturamentoSaida, 200);
  assert.equal(feb.rbt12, 2400);
});
test("folha que menciona Simples Nacional não é classificada como PGDAS", async () => {
  const r = await parse(
    "folha_202601.txt",
    `FOLHA DE PAGAMENTO\nCompetência: 01/2026\nCNPJ: ${id}\nEmpresa optante pelo Simples Nacional\nTotal da folha: 25.000,00\nPró-labore: 5.000,00`,
  );
  assert.equal(r.tipo, "folha");
  assert.equal(r.dados.folha, 25000);
  assert.equal(r.dados.proLabore, 5000);
});
