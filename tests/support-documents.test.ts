import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSupportDocument } from "../src/support-documents.js";
import { parseFileRaw } from "../src/parsers.js";
import { importDocuments } from "../src/import-workflow.js";
import { blankState } from "../shared/engine.js";
import { stateSchema } from "../shared/schema";
import { textInReadingOrder } from "../src/pdf-text.js";
const payer = "12.345.678/0001-95";
const payee = "98.765.432/0001-10";
const bradesco = `Comprovante de Transação Bancária\nEmpresa: EMPRESA PAGADORA FICTICIA LTDA | CNPJ: 0${payer}\nRazão Social FORNECEDOR FICTICIO\nBeneficiário:\nCPF/CNPJ Beneficiário: ${payee}`;
test("comprovante identifica pagador, não beneficiário, e não vira cartão CNPJ", async () => {
  const parsed = await parseFileRaw(
    new File([bradesco], "Comprovante Bradesco.txt"),
  );
  assert.ok(
    "tipo" in parsed && "ownCNPJ" in parsed && "razaoSocialDetectada" in parsed,
  );
  assert.equal(parsed.tipo, "comprovante_bancario");
  assert.equal(parsed.ownCNPJ, "12345678000195");
  assert.equal(parsed.razaoSocialDetectada, "EMPRESA PAGADORA FICTICIA LTDA");
  const { patch } = importDocuments(blankState(), [
    { ...parsed, hash: "receipt" },
  ]);
  assert.equal(patch.cnpj, "12345678000195");
  assert.equal(patch.razaoSocial, "EMPRESA PAGADORA FICTICIA LTDA");
  assert.equal(patch.faturamentoMensal, undefined);
});
test("Caixa extrai identidade só do bloco do pagador", () => {
  const parsed = parseSupportDocument(
    `Comprovante de Pagamento de Boleto\nBeneficiário original / Cedente\nNome/Razão Social: FORNECEDOR FICTICIO\nCPF/CNPJ: ${payee}\nPagador Final / Efetivo\nCPF/CNPJ: ${payer}\nNome: EMPRESA PAGADORA\nConta de débito: 111`,
  );
  assert.equal(parsed?.ownCNPJ, "12345678000195");
  assert.equal(parsed?.razaoSocialDetectada, "EMPRESA PAGADORA");
});
test("Cielo preserva resumo separado do cálculo e não usa nome do usuário como empresa", () => {
  const parsed = parseSupportDocument(
    `Detalhado de vendas Cielo\nData da venda 01/01/2024 à 31/01/2024\nUsuário: OPERADOR FICTICIO\nCPF/CNPJ: ${payer}\nTotalizador\nQuantidade de vendas Valor bruto Taxa/tarifa Valor líquido\n10 R$ 1.000,00 -R$ 25,00 R$ 975,00\nLista de vendas`,
  );
  assert.equal(parsed?.razaoSocialDetectada, null);
  assert.equal(parsed?.competencia, "2024-01");
  assert.deepEqual(parsed?.dados, {
    valorBruto: 1000,
    taxas: 25,
    valorLiquido: 975,
  });
  const state = {
    ...blankState(),
    cnpj: "12345678000195",
    faturamentoMensal: 5000,
    competencia: "2030-09",
    historico: [
      {
        competencia: "2024-01",
        faturamento: 5000,
        compras: 0,
        comprasCredito: 0,
        folha: 0,
        proLabore: 0,
        icmsCredito: 0,
      },
    ],
  };
  const { patch } = importDocuments(state, [
    {
      ...parsed,
      id: "cielo",
      hash: "cielo",
      name: "cielo.txt",
      ext: "txt",
      size: 1,
    },
  ]);
  const saved = stateSchema.parse({ ...state, ...patch });
  assert.equal(saved.faturamentoMensal, 5000);
  assert.equal(saved.historico[0].faturamento, 5000);
  assert.equal(saved.competencia, "2030-09");
  assert.equal(saved.documentos[0].dados.valorBruto, 1000);
});
test("extrato sem CNPJ não inventa vínculo; data de emissão não vira competência", () => {
  const parsed = parseSupportDocument(
    "01/02/2024\nExtrato por período\nCliente: EMPRESA FICTICIA\nConta: 111\nMês: Janeiro/2024\nSaldo: 0,00",
  );
  assert.equal(parsed?.ownCNPJ, null);
  assert.equal(parsed?.competencia, "2024-01");
  const result = importDocuments(blankState(), [
    {
      ...parsed,
      id: "caixa",
      hash: "caixa",
      name: "caixa.txt",
      ext: "txt",
      size: 1,
    },
  ]);
  assert.equal(result.master, "");
  assert.equal(result.patch.razaoSocial, undefined);
  assert.equal(result.patch.documentos?.[0].tipo, "extrato_bancario");
});
test("comprovantes Receita usam contribuinte e não são PGDAS/folha", () => {
  const parsed = parseSupportDocument(
    `Comprovante de Arrecadação\nReceita Federal DARF\nCNPJ Razão Social\n${payer} EMPRESA CONTRIBUINTE\nPeríodo Apuração Data de Vencimento\n01/12/2022 20/01/2023\nCONTR PREV SEGURADOS EMPREGADOS`,
  );
  assert.equal(parsed?.tipo, "comprovante_arrecadacao");
  assert.equal(parsed?.ownCNPJ, "12345678000195");
  assert.equal(parsed?.razaoSocialDetectada, "EMPRESA CONTRIBUINTE");
  assert.equal(parsed?.competencia, null);
});
test("PDF com vários pagadores não escolhe uma identidade arbitrária", () => {
  const parsed = parseSupportDocument(
    bradesco + `\nEmpresa: OUTRA EMPRESA | CNPJ: ${payee}`,
  );
  assert.equal(parsed?.ownCNPJ, null);
  assert.equal(parsed?.ambiguous, true);
});
test("documento sem conteúdo cadastral não vira cartão pelo nome do arquivo", async () => {
  const parsed = await parseFileRaw(
    new File(["Documento sem identificação cadastral"], "comprovante.txt"),
  );
  assert.ok("tipo" in parsed);
  assert.equal(parsed.tipo, "desconhecido");
});
test("ordem visual do PDF prevalece sobre ordem interna invertida", () => {
  const items = [
    { str: "EMPRESA FICTICIA", transform: [1, 0, 0, 1, 80, 700] },
    { str: "CNPJ", transform: [1, 0, 0, 1, 10, 720] },
    { str: "Nome Empresarial:", transform: [1, 0, 0, 1, 10, 700] },
  ];
  assert.equal(
    textInReadingOrder(items, {
      convertToViewportPoint: (x: number, y: number) => [x, 800 - y],
    }),
    "CNPJ\nNome Empresarial: EMPRESA FICTICIA",
  );
});
test("reenvio do comprovante corrige nome e classificação anteriores sem duplicar", async () => {
  const parsed = await parseFileRaw(new File([bradesco], "Comprovante.txt"));
  const state = {
    ...blankState(),
    cnpj: "12345678000195",
    razaoSocial: "Beneficiário Final:",
    documentos: [
      {
        id: "original",
        hash: "same",
        name: "Comprovante.txt",
        size: 10,
        ext: "txt",
        status: "ok",
        tipo: "cartao_cnpj",
        competencia: null,
        dados: {},
        badge: "Antiga leitura",
      },
    ],
  };
  const result = importDocuments(state, [{ ...parsed, hash: "same" }]);
  assert.equal(result.reprocessed, 1);
  assert.equal(result.patch.razaoSocial, "EMPRESA PAGADORA FICTICIA LTDA");
  assert.equal(result.patch.documentos?.length, 1);
  assert.equal(result.patch.documentos?.[0].id, "original");
  assert.equal(result.patch.documentos?.[0].tipo, "comprovante_bancario");
});
