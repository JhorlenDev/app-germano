import { test } from "node:test";
import assert from "node:assert/strict";
import { extractRazaoSocial, parseFileRaw } from "../src/parsers.js";
import { importDocuments } from "../src/import-workflow.js";
import { blankState } from "../shared/engine.js";
test("rótulo Beneficiário Final não vira razão social", () => {
  for (const text of [
    "Nome Empresarial:\nBeneficiário Final:",
    "Razão Social: Beneficiário Final: NÃO INFORMADO",
    "NOME EMPRESARIAL\nBENEFICIARIO FINAL",
    "Razão Social:\nCNPJ: 12.345.678/0001-95",
  ])
    assert.equal(extractRazaoSocial(text), null);
});
test("lê nome na mesma linha ou na seguinte e corta rótulo seguinte", () => {
  for (const text of [
    "Nome Empresarial\nEMPRESA FICTÍCIA LTDA",
    "Razão Social: EMPRESA FICTÍCIA LTDA",
    "Nome Empresarial: EMPRESA FICTÍCIA LTDA Beneficiário Final: NÃO INFORMADO",
  ])
    assert.equal(extractRazaoSocial(text), "EMPRESA FICTÍCIA LTDA");
  assert.equal(
    extractRazaoSocial(
      "Nome Empresarial:\nBeneficiário Final:\nRazão Social: EMPRESA CORRETA LTDA",
    ),
    "EMPRESA CORRETA LTDA",
  );
});
test("rótulo inválido não sobrescreve nome já cadastrado na importação", async () => {
  const raw = await parseFileRaw(
    new File(
      [
        "COMPROVANTE DE INSCRIÇÃO\nCNPJ: 12345678000195\nNome Empresarial:\nBeneficiário Final:",
      ],
      "cartao_cnpj.txt",
    ),
  );
  const state = {
    ...blankState(),
    cnpj: "12345678000195",
    razaoSocial: "EMPRESA CORRETA LTDA",
  };
  const { patch } = importDocuments(state, [{ ...raw, hash: "teste" }]);
  assert.equal({ ...state, ...patch }.razaoSocial, "EMPRESA CORRETA LTDA");
});

test('não corta nomes que terminam com parte de um rótulo', () => {
  assert.equal(extractRazaoSocial('Razão Social: EMPRESA DE TRANSPORTE'), 'EMPRESA DE TRANSPORTE');
});
