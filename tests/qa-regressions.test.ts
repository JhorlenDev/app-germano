import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFileRaw, parseCurrencyBR } from '../src/parsers.js';
import { exampleState, computeRegimes, aggregateDocuments, blankState } from '../shared/engine.js';
const txt = (text: string, name = 'pgdas_202701.txt') => new File([text], name, { type: 'text/plain' });
test('QA: valores monetários integrais e centavos brasileiros', () => {
  assert.equal(parseCurrencyBR('1.950.000'),1950000);
  assert.equal(parseCurrencyBR('1234,5'),1234.5);
});
test('QA: competência do PGDAS prevalece sobre a data de geração', async () => {
  const r = await parseFileRaw(txt('PGDAS-D\nData de geração: 15/02/2027\nCNPJ: 12.345.678/0001-95\nPeríodo de Apuração: 01/2027\nRBT12: 1.200.000,00\nReceita bruta do período de apuração (RPA): 100.000,00'));
  assert.equal(r.competencia,'2027-01');
  assert.equal(r.dados.faturamento,100000);
  assert.equal(r.dados.rbt12,1200000);
});
test('QA: receita acumulada não vira faturamento mensal', async () => {
  const r = await parseFileRaw(txt('PGDAS-D\nCNPJ: 12.345.678/0001-95\nPeríodo de Apuração: 01/2027\nReceita Bruta Acumulada nos 12 meses anteriores (RBT12): 1.200.000,00\nReceita bruta do período de apuração (RPA): 100.000,00'));
  assert.equal(r.dados.faturamento,100000);
});
test('QA: folha com competência no cabeçalho não importa o mês como salário', async () => {
  const r = await parseFileRaw(txt('Folha de pagamento\nCompetência: 01/2027\nCNPJ: 12.345.678/0001-95\nEmpresa optante pelo Simples Nacional\nTotal da folha: 12.000,00\nPró-labore: 4.000,00','folha_202701.txt'));
  assert.equal(r.tipo,'folha');
  assert.equal(r.dados.folha,12000);
  assert.equal(r.dados.proLabore,4000);
});
test('QA: não soma duas declarações PGDAS da mesma competência', () => {
  const a={id:'a',status:'ok',tipo:'pgdas',competencia:'2027-01',dados:{faturamento:100000,rbt12:1200000}};
  assert.throws(()=>aggregateDocuments([a,{...a,id:'b',dados:{faturamento:110000,rbt12:1200000}}],'2027-01'),/PGDAS/);
});
test('QA: cálculo comercial conferido contra memória numérica independente', () => {
  const r=computeRegimes(exampleState('comercio'));
  assert.ok(Math.abs(r.regimes.tradicional.mensal-8825)<.0001);
  assert.ok(Math.abs(r.regimes.hibrido.mensal-13617.125)<.0001);
  assert.ok(Math.abs(r.regimes.presumido.mensal-26576)<.0001);
});
test('QA: cálculos de serviços III, IV e V contra valores conferidos', () => {
  const d=exampleState('servicos');
  const a=computeRegimes({...d,anexoServicosForcado:'III'});
  assert.ok(Math.abs(a.regimes.tradicional.mensal-13030)<.0001);
  assert.ok(Math.abs(a.regimes.presumido.mensal-22176)<.0001);
  const b=computeRegimes({...d,anexoServicosForcado:'IV'});
  assert.ok(Math.abs(b.regimes.tradicional.mensal-14125)<.0001);
  assert.ok(Math.abs(b.regimes.hibrido.mensal-17827.45)<.0001);
  const c=computeRegimes({...d,anexoServicosForcado:'V'});
  assert.ok(Math.abs(c.regimes.tradicional.mensal-19075)<.0001);
});
test('QA: dados inválidos não produzem recomendação automática', () => {
  assert.equal(computeRegimes({...exampleState(),cestaPct:90,reduzido60Pct:90}).melhor,null);
  assert.equal(computeRegimes({...blankState()}).melhor,null);
});
