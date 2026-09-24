import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { transformAsync } from '@babel/core';
import { execFileSync } from 'node:child_process';
const source = await readFile('diagnostico-tributario-2027-app.html', 'utf8');
const match = source.match(/<script type="text\/babel" data-presets="react">([\s\S]*?)<\/script>/);
if (!match) throw new Error('Bloco React original não encontrado.');
let jsx = match[1];
function patch(before, after) {
  if (!jsx.includes(before)) throw new Error(`Integração desatualizada: ${before.slice(0, 90)}`);
  jsx = jsx.replace(before, after);
}
// Adapt persistence only. Calculators, document readers and UI remain in the original source.
jsx = jsx.replaceAll('window.claude', 'window.gmServices');
jsx = jsx.replaceAll("setDbStatus('unavailable')", "setDbStatus('error')");
patch("setDbStatus(dbApi ? 'ready' : 'unavailable')", "setDbStatus(dbApi ? 'ready' : 'error')");
patch("if (!d.cnpjMestreLocked || !d.cnpj) return;", `if (!db || !d.cnpjMestreLocked || !d.cnpj) return;
    if ([EXEMPLO_COMERCIO, EXEMPLO_INDUSTRIA, EXEMPLO_SERVICOS].some(e => e.cnpj === d.cnpj)) { window.gmServices.idle(); return; }
    window.gmServices.dirty();`);
patch('const temDadosNaoSalvos = (dd) => ', 'const temDadosNaoSalvos = (dd) => window.gmServices.unsaved() || ');
patch('    setD(rec.d);', '    window.gmServices.select(id);\n    setD(rec.d);');
patch('db.doc(`clientes/${rec.id}`).set(rec)', 'db.doc(`clientes/${rec.id}`).set(rec, { restore: true })');
patch('salvas no banco de dados do Claude (visível a quem acessa este artefato na sua organização)', 'salvas no servidor (PostgreSQL)');
patch('salvas localmente neste navegador (localStorage), sem envio a servidores externos', 'conectando ao servidor');
jsx = jsx.replaceAll('Falha ao carregar clientes do banco de dados do Claude:', 'Falha ao carregar clientes do servidor:');
await mkdir('dist-original/assets', { recursive: true });
const result = await transformAsync(jsx, { plugins: ['@babel/plugin-transform-react-jsx'], comments: true, compact: false });
await writeFile('dist-original/assets/app.js', result.code);
await cp('original/vendor', 'dist-original/assets/vendor', { recursive: true });
for (const file of ['bridge.js', 'login.js', 'session.css']) await cp(`original/${file}`, `dist-original/assets/${file}`);
await cp('original/login.html', 'dist-original/login.html');
await writeFile('dist-original/tailwind-input.css', '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n');
execFileSync(process.execPath, ['node_modules/tailwindcss/lib/cli.js', '-i', 'dist-original/tailwind-input.css', '-o', 'dist-original/assets/tailwind.css', '--content', 'diagnostico-tributario-2027-app.html', '--minify'], { stdio: 'inherit' });
let html = source.replace(match[0], '<script src="/assets/bridge.js"></script>\n<script src="/assets/app.js"></script>')
  .replace(/<script src="https:[^\n]+<\/script>\n/g, '')
  .replace('<style>', '<link rel="stylesheet" href="/assets/tailwind.css">\n<link rel="stylesheet" href="/assets/session.css">\n<script src="/assets/vendor/react.production.min.js"></script>\n<script src="/assets/vendor/react-dom.production.min.js"></script>\n<style>')
  .replace('<div id="root"></div>', '<div class="server-session no-print"><span id="server-status" role="status">Conectado ao servidor</span><a href="/login" target="_blank" rel="noopener">Acesso</a><button id="server-logout" type="button">Sair</button></div>\n<div id="root"></div>');
await writeFile('dist-original/index.html', html, { mode: 0o644 });
console.log('HTML original integrado ao servidor em dist-original.');
