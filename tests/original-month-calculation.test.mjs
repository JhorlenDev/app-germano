import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const ctx = vm.createContext({React:{createElement(){}}, ReactDOM:{createRoot:()=>({render(){}})}, document:{getElementById(){}}, window:{}});
vm.runInContext(readFileSync('dist-original/assets/app.js','utf8'), ctx);
function check(d, mes) {
  d.historico = [mes];
  const card = ctx.computeRegimes(d);
  const row = ctx.computeMesRegimes(d, mes);
  for (const k of ['tradicional','hibrido','presumido']) assert.ok(Math.abs(card.regimes[k].mensal-row[k]) < 1e-8, k);
  return row;
}
test('mesma competência usa compras totais, crédito exato e folha separada nos dois resultados',()=>{
  for (const sample of ['EXEMPLO_COMERCIO','EXEMPLO_INDUSTRIA','EXEMPLO_SERVICOS']) {
    const d = JSON.parse(vm.runInContext(`JSON.stringify(${sample})`,ctx));
    Object.assign(d,{comprasMensais:122392.68,pctFornecedorRegimeNormal:100*107599.64/122392.68,folhaMensal:3242,proLabore:5000});
    check(d,{faturamento:d.faturamentoMensal,comprasRegimeNormal:107599.64,comprasOutras:122392.68-107599.64,folha:8242,proLabore:5000});
  }
});
test('registro antigo recupera precisão e parcelas dos documentos sem reupload',()=>{
  ctx.window.gmImport={aggregate:()=>({comprasEntrada:122392.68,comprasComCredito:107599.64,proLabore:5000})};
  const d=JSON.parse(vm.runInContext('JSON.stringify(EXEMPLO_COMERCIO)',ctx));
  Object.assign(d,{documentosImportados:[{}],competenciaImportacao:'2026-08',historicoCompetencias:['2026-08'],comprasMensais:122392.68,pctFornecedorRegimeNormal:88,folhaMensal:3242,proLabore:5000});
  check(d,{faturamento:d.faturamentoMensal,comprasRegimeNormal:107599.64,folha:8242});
  assert.equal(ctx.preciseSimulationData({...d,pctFornecedorRegimeNormal:75}).pctFornecedorRegimeNormal,75);
});
test('compras e folha zeradas não geram NaN',()=>{
 const d=JSON.parse(vm.runInContext('JSON.stringify(EXEMPLO_COMERCIO)',ctx));
 Object.assign(d,{comprasMensais:0,pctFornecedorRegimeNormal:0,folhaMensal:0,proLabore:0});
 check(d,{faturamento:d.faturamentoMensal,comprasRegimeNormal:0,folha:0});
});
