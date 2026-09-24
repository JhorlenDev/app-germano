import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {originalServer} from '../scripts/serve-original.mjs';
async function withServer(check) {
  const server=originalServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {await check(`http://127.0.0.1:${server.address().port}`);}
  finally {await new Promise(resolve=>server.close(resolve));}
}
test('serve exatamente os bytes do HTML original',async()=>withServer(async url=>{
  const source=readFileSync(new URL('../diagnostico-tributario-2027-app.html',import.meta.url));
  for(const path of ['/','/index.html','/diagnostico-tributario-2027-app.html']) {
    const response=await fetch(url+path);
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'),/text\/html/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),source);
  }
}));
test('servidor não expõe código, configuração ou APIs da versão moderna',async()=>withServer(async url=>{
  for(const path of ['/.env','/package.json','/src/App.tsx','/api/clients','/scripts/serve-original.mjs']) assert.equal((await fetch(url+path)).status,404);
  assert.equal((await fetch(url,{method:'POST'})).status,405);
}));
test('saúde e HEAD funcionam sem banco ou sessão',async()=>withServer(async url=>{
  assert.deepEqual(await(await fetch(url+'/api/health')).json(),{ok:true,version:'html-original'});
  const head=await fetch(url,{method:'HEAD'});
  assert.equal(head.status,200);
  assert.equal(await head.text(),'');
}));
