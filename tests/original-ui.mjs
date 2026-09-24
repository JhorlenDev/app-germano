import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {originalServer} from '../scripts/serve-original.mjs';
const server=originalServer();
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('heading',{name:'Diagnóstico de Enquadramento Tributário 2027',exact:true}).waitFor();
  await page.getByRole('button',{name:'Cadastrar / Analisar Novo Cliente'}).click();
  await page.getByPlaceholder('Ex.: Amazônia Comércio Ltda').fill('EMPRESA FICTICIA TESTE ORIGINAL');
  await page.getByPlaceholder('00.000.000/0000-00').last().fill('12345678000195');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('hub_tributario_clientes_2027')||'[]').some(c=>c.id==='12345678000195'&&c.razaoSocial==='EMPRESA FICTICIA TESTE ORIGINAL'));
  await page.reload();
  await page.locator('select').first().selectOption('12345678000195');
  assert.equal(await page.getByPlaceholder('Ex.: Amazônia Comércio Ltda').inputValue(),'EMPRESA FICTICIA TESTE ORIGINAL');
  await page.getByRole('button',{name:'Gerar parecer técnico'}).click();
  assert.ok(await page.getByRole('button',{name:/Imprimir/}).count());
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.locator('#root').isVisible());
  assert.deepEqual(errors,[]);
  console.log('HTML original: renderização, cadastro, autosave local, recarga e abertura do parecer passaram.');
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
