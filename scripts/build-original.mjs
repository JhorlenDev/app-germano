import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { transformAsync } from "@babel/core";
import { execFileSync } from "node:child_process";
const source = await readFile("diagnostico-tributario-2027-app.html", "utf8");
const match = source.match(
  /<script type="text\/babel" data-presets="react">([\s\S]*?)<\/script>/,
);
if (!match) throw new Error("Bloco React original não encontrado.");
let jsx = match[1];
function patch(before, after) {
  if (!jsx.includes(before))
    throw new Error(`Integração desatualizada: ${before.slice(0, 90)}`);
  jsx = jsx.replace(before, after);
}
// Preserve the reference and tax formulas; integrate tested ingestion and server persistence.
const parserStart = jsx.indexOf("async function parseFileRaw(file)");
const parserEnd = jsx.indexOf(
  "// Etapa 2 — trava de integridade:",
  parserStart,
);
if (parserStart < 0 || parserEnd < 0)
  throw new Error("Parser original não encontrado.");
jsx =
  jsx.slice(0, parserStart) +
  `async function parseFileRaw(file) { return window.gmImport.parse(file, {parseXML:parseNFeXML,detectAnexo:detectAnexoPGDAS}); }\n\n` +
  jsx.slice(parserEnd);
const uploadStart = jsx.indexOf("function UploadModule("),
  uploadEnd = jsx.indexOf(
    "/* ============================= PARECER",
    uploadStart,
  );
if (uploadStart < 0 || uploadEnd < 0)
  throw new Error("Componente de upload não encontrado.");
jsx =
  jsx.slice(0, uploadStart) +
  (await readFile("original/upload-module.jsx", "utf8")) +
  jsx.slice(uploadEnd);

// Keep the reference HTML intact; use one calculation engine in the running app.
patch("function computeRegimes(d) {", "function computeRegimesOriginal(d) {");
const monthStart = jsx.indexOf("function computeMesRegimes(d, mes) {");
const monthEnd = jsx.indexOf("/* ============================= EXEMPLOS", monthStart);
if (monthStart < 0 || monthEnd < 0) throw new Error("Cálculo mensal não encontrado");
jsx = jsx.slice(0, monthStart) + await readFile("original/month-calculation.js", "utf8") + "\n" + jsx.slice(monthEnd);

patch("fmtBRL2(d.comprasMensais * d.pctFornecedorRegimeNormal / 100)", "fmtBRL2(calc.cbsCredito / CBS_ALIQ)");
patch("{d.pctFornecedorRegimeNormal}%</span>", "{fmtPct(preciseSimulationData(d).pctFornecedorRegimeNormal / 100)}</span>");

jsx = jsx.replaceAll("window.claude", "window.gmServices");
jsx = jsx.replaceAll("setDbStatus('unavailable')", "setDbStatus('error')");
patch(
  "setDbStatus(dbApi ? 'ready' : 'unavailable')",
  "setDbStatus(dbApi ? 'ready' : 'error')",
);
patch(
  "if (!d.cnpjMestreLocked || !d.cnpj) return;",
  `if (!db || !d.cnpjMestreLocked || !d.cnpj) return;
    if ([EXEMPLO_COMERCIO, EXEMPLO_INDUSTRIA, EXEMPLO_SERVICOS].some(e => e.cnpj === d.cnpj)) { window.gmServices.idle(); return; }
    window.gmServices.dirty();`,
);
patch(
  '<div className="flex flex-col gap-1.5 mb-6 text-[13px]">',
  `<div className="flex flex-col gap-1.5 mb-6 text-[13px]">
          {d.competenciaImportacao && <div><strong>Competência da simulação: {formatCompetencia(d.competenciaImportacao)}</strong></div>}
          {d.importacaoAvisos?.length>0 && <div style={{padding:'10px',border:'1px solid #9A5B12',color:'#7A4510'}}><strong>Conferência dos documentos</strong>{d.importacaoAvisos.map((aviso,i)=><p key={i}>{aviso}</p>)}</div>}`,
);
patch(
  "const temDadosNaoSalvos = (dd) => ",
  "const temDadosNaoSalvos = (dd) => window.gmServices.unsaved() || ",
);
patch(
  "    setD(rec.d);",
  "    window.gmServices.select(id);\n    setD(rec.d);",
);
patch(
  "db.doc(`clientes/${rec.id}`).set(rec)",
  "db.doc(`clientes/${rec.id}`).set(rec, { restore: true })",
);
patch(
  "salvas no banco de dados do Claude (visível a quem acessa este artefato na sua organização)",
  "salvas no servidor (PostgreSQL)",
);
patch(
  "salvas localmente neste navegador (localStorage), sem envio a servidores externos",
  "conectando ao servidor",
);
jsx = jsx.replaceAll(
  "Falha ao carregar clientes do banco de dados do Claude:",
  "Falha ao carregar clientes do servidor:",
);
await mkdir("dist-original/assets", { recursive: true });
const result = await transformAsync(jsx, {
  plugins: ["@babel/plugin-transform-react-jsx"],
  comments: true,
  compact: false,
});
await writeFile("dist-original/assets/app.js", result.code);
await cp("original/vendor", "dist-original/assets/vendor", { recursive: true });
for (const file of [
  "bridge.js",
  "login.js",
  "session.css",
  "import-runtime.js",
])
  await cp(`original/${file}`, `dist-original/assets/${file}`);
await cp("original/login.html", "dist-original/login.html");
await mkdir("dist-original/assets/pdfjs", { recursive: true });
for (const name of ["pdf.min.mjs", "pdf.worker.min.mjs"])
  await cp(
    `node_modules/pdfjs-dist/build/${name}`,
    `dist-original/assets/pdfjs/${name}`,
  );
await cp(
  "node_modules/pdfjs-dist/LICENSE",
  "dist-original/assets/pdfjs/LICENSE",
);
await cp(
  "node_modules/fflate/umd/index.js",
  "dist-original/assets/vendor/fflate.js",
);
await cp(
  "node_modules/fflate/LICENSE",
  "dist-original/assets/vendor/LICENSE-fflate",
);
await writeFile(
  "dist-original/tailwind-input.css",
  "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n",
);
execFileSync(
  process.execPath,
  [
    "node_modules/tailwindcss/lib/cli.js",
    "--config",
    "original/tailwind.config.cjs",
    "-i",
    "dist-original/tailwind-input.css",
    "-o",
    "dist-original/assets/tailwind.css",
    "--content",
    "diagnostico-tributario-2027-app.html,original/upload-module.jsx",
    "--minify",
  ],
  { stdio: "inherit" },
);
let html = source
  .replace(
    match[0],
    '<script src="/assets/bridge.js"></script>\n<script src="/assets/vendor/fflate.js"></script>\n<script src="/assets/import-runtime.js"></script>\n<script src="/assets/app.js"></script>',
  )
  .replace(/<script src="https:[^\n]+<\/script>\n/g, "")
  .replace(
    "<style>",
    '<link rel="stylesheet" href="/assets/tailwind.css">\n<link rel="stylesheet" href="/assets/session.css">\n<script src="/assets/vendor/react.production.min.js"></script>\n<script src="/assets/vendor/react-dom.production.min.js"></script>\n<style>',
  )
  .replace(
    '<div id="root"></div>',
    '<div class="server-session no-print"><span id="server-status" role="status">Conectado ao servidor</span><a href="/login" target="_blank" rel="noopener">Acesso</a><button id="server-logout" type="button">Sair</button></div>\n<div id="root"></div>',
  );
await writeFile("dist-original/index.html", html, { mode: 0o644 });
console.log("HTML original integrado ao servidor em dist-original.");
