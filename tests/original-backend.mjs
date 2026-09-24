import { zipSync } from "fflate";
import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import { readFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomInt } from "node:crypto";
import vm from "node:vm";
import { transformAsync } from "@babel/core";
import { chromium, request } from "@playwright/test";
try {
  loadEnvFile(".env");
} catch {}
const baseURL = process.env.TEST_ORIGIN || "http://localhost:5173";
const ignoreHTTPSErrors = process.env.TEST_TLS_INSECURE === "1";
const headers = { Origin: baseURL, "X-Requested-With": "gm-app" };
const browser = await chromium.launch();
const contexts = [],
  ids = new Set();
const errors = [];
const cnpj = `89${randomInt(100000, 999999)}000195`;
const name = `TESTE ORIGINAL ${cnpj}`;
const api = await request.newContext({
  baseURL,
  ignoreHTTPSErrors,
  extraHTTPHeaders: headers,
});
async function records() {
  const r = await api.get("/api/original/clients");
  assert.equal(r.status(), 200);
  return r.json();
}
async function waitRecord(predicate) {
  for (let n = 0; n < 100; n++) {
    const r = (await records()).find((r) => r.record.id === cnpj);
    if (r && predicate(r)) return r;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Cadastro esperado não foi persistido.");
}
async function open() {
  const context = await browser.newContext({
    baseURL,
    ignoreHTTPSErrors,
    viewport: { width: 1440, height: 1000 },
  });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  assert.ok(page.url().endsWith("/login"));
  await page.locator("[name=email]").fill(process.env.ADMIN_EMAIL);
  await page.locator("[name=password]").fill(process.env.ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page
    .getByRole("heading", {
      name: "Diagnóstico de Enquadramento Tributário 2027",
      exact: true,
    })
    .waitFor();
  return page;
}
try {
  assert.equal((await api.get("/api/original/clients")).status(), 401);
  assert.equal(
    (await api.put(`/api/original/clients/${cnpj}`, { data: {} })).status(),
    401,
  );
  assert.equal(
    (
      await api.post("/api/auth/login", {
        data: {
          email: process.env.ADMIN_EMAIL,
          password: process.env.ADMIN_PASSWORD,
        },
      })
    ).status(),
    200,
  );
  const before = await records();
  const a = await open();
  await a.waitForTimeout(1600);
  assert.equal(
    (await records()).length,
    before.length,
    "Os exemplos não devem virar cadastros.",
  );
  // Compare every sample result against a separately compiled, untouched original source.
  const source = await readFile("diagnostico-tributario-2027-app.html", "utf8");
  const jsx = source.match(
    /<script type="text\/babel" data-presets="react">([\s\S]*?)<\/script>/,
  )[1];
  const compiled = await transformAsync(jsx, {
    plugins: ["@babel/plugin-transform-react-jsx"],
  });
  const reference = vm.createContext({
    React: { createElement: () => ({}) },
    ReactDOM: { createRoot: () => ({ render() {} }) },
    document: { getElementById: () => ({}) },
  });
  vm.runInContext(compiled.code, reference);
  const expected = vm.runInContext(
    "JSON.stringify([EXEMPLO_COMERCIO, EXEMPLO_INDUSTRIA, EXEMPLO_SERVICOS].map(computeRegimes))",
    reference,
  );
  const actual = await a.evaluate(() =>
    JSON.stringify(
      [EXEMPLO_COMERCIO, EXEMPLO_INDUSTRIA, EXEMPLO_SERVICOS].map(
        computeRegimes,
      ),
    ),
  );
  assert.deepEqual(
    JSON.parse(actual),
    JSON.parse(expected),
    "Fórmulas devem permanecer iguais ao original.",
  );
  await a
    .getByRole("button", { name: "Cadastrar / Analisar Novo Cliente" })
    .click();
  ids.add(cnpj);
  const files = [
    {
      name: "cartao_cnpj.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(
        `COMPROVANTE DE INSCRIÇÃO\nCNPJ: ${cnpj}\nNOME EMPRESARIAL\n${name}\nCÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL\n47.11-3/02 - Comércio\nMUNICÍPIO\nTEFE\nUF\nAM`,
      ),
    },
    {
      name: "pgdas_202701.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(
        `PGDAS-D\nCNPJ: ${cnpj}\nRBT12: 120.000,00\nReceita bruta: 10.000,00\nCompetência 01/2027`,
      ),
    },
  ];
  const invoiceKey = `132701${cnpj}550010000000011123456789`;
  files.push({
    name: "nota.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(
      `<nfeProc><NFe><infNFe Id="NFe${invoiceKey}"><ide><mod>55</mod><dhEmi>2027-01-02T10:00:00-04:00</dhEmi><tpNF>1</tpNF><finNFe>1</finNFe></ide><emit><CNPJ>${cnpj}</CNPJ><CRT>1</CRT><enderEmit><UF>AM</UF></enderEmit></emit><det nItem="1"><prod><NCM>39269090</NCM><xProd>ITEM TESTE</xProd><vProd>10000.00</vProd></prod></det><total><ICMSTot><vNF>10000.00</vNF></ICMSTot></total></infNFe></NFe><protNFe><infProt><cStat>100</cStat></infProt></protNFe></nfeProc>`,
    ),
  });
  await a
    .locator("input[type=file][multiple]")
    .setInputFiles({
      name: "documentos.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(
        zipSync(
          Object.fromEntries(files.map((file) => [file.name, file.buffer])),
        ),
      ),
    });
  const saved = await waitRecord(
    (r) => r.record.d.razaoSocial === name && r.record.d.rbt12 === 120000,
  );
  assert.equal(saved.record.d.cnpj.replace(/\D/g, ""), cnpj);
  assert.equal(saved.record.d.historico.length, 6);
  assert.equal(saved.record.d.historicoCompetencias.at(-1), "2027-01");
  assert.equal(
    await a.evaluate(() =>
      localStorage.getItem("hub_tributario_clientes_2027"),
    ),
    null,
  );
  await a.getByRole("button", { name: "Gerar parecer técnico" }).click();
  assert.ok(await a.getByRole("button", { name: /Imprimir/ }).count());
  await a.getByRole("button", { name: "Fechar", exact: true }).click();
  if (process.env.TEST_PRINT === "1") {
    await mkdir("test-results/print-smoke", { recursive: true });
    for (const [button, file, expectedText] of [
      ["Memorial de cálculo (Anexo A)", "memorial", "Memorial Descritivo"],
      ["NCMs para conferência (Anexo B)", "ncm", "39269090"],
    ]) {
      await a.getByRole("button", { name: button, exact: true }).click();
      const path = `test-results/print-smoke/${file}.pdf`;
      await a.pdf({ path, preferCSSPageSize: true, printBackground: true });
      const text = execFileSync("pdftotext", [path, "-"], { encoding: "utf8" });
      assert.ok(
        text.includes(expectedText),
        `Conteúdo do ${file} deve estar no PDF`,
      );
      const pages = text
        .split("\f")
        .map((t) => t.trim())
        .filter(Boolean);
      assert.equal(
        new Set(pages).size,
        pages.length,
        `PDF ${file} sem páginas repetidas`,
      );
      await a.getByRole("button", { name: "Fechar", exact: true }).click();
    }
  }
  const b = await open();
  await b.locator("select").first().selectOption(cnpj);
  assert.equal(
    await b.getByPlaceholder("Ex.: Amazônia Comércio Ltda").inputValue(),
    name,
  );
  await b.waitForTimeout(1400);
  await a
    .getByPlaceholder("Ex.: Amazônia Comércio Ltda")
    .fill(`${name} ALTERADO`);
  await waitRecord((r) => r.record.razaoSocial === `${name} ALTERADO`);
  await b
    .getByPlaceholder("Ex.: Amazônia Comércio Ltda")
    .fill(`${name} CONFLITO`);
  await b.getByRole("status").filter({ hasText: "Não foi salvo:" }).waitFor();
  assert.equal(
    (await records()).find((r) => r.record.id === cnpj).record.razaoSocial,
    `${name} ALTERADO`,
  );
  const wrongOrigin = await api.put(`/api/original/clients/${cnpj}`, {
    headers: { Origin: "https://invalid.example" },
    data: {},
  });
  assert.equal(wrongOrigin.status(), 403);
  const malformed = await api.put(`/api/original/clients/${cnpj}`, {
    data: {
      record: { ...saved.record, id: cnpj, cnpj: "00000000000000" },
      version: 1,
    },
  });
  assert.equal(malformed.status(), 400);
  // Failed requests cannot silently fall back to browser storage.
  await a.route("**/api/original/clients/*", (route) =>
    route.request().method() === "PUT"
      ? route.abort("failed")
      : route.continue(),
  );
  await a
    .getByPlaceholder("Ex.: Amazônia Comércio Ltda")
    .fill(`${name} OFFLINE`);
  await a.getByRole("status").filter({ hasText: "Não foi salvo:" }).waitFor();
  assert.equal(
    (await records()).find((r) => r.record.id === cnpj).record.razaoSocial,
    `${name} ALTERADO`,
  );
  assert.equal(
    await a.evaluate(() =>
      localStorage.getItem("hub_tributario_clientes_2027"),
    ),
    null,
  );
  await a.unroute("**/api/original/clients/*");
  await a
    .getByPlaceholder("Ex.: Amazônia Comércio Ltda")
    .fill(`${name} ALTERADO`);
  await a
    .getByRole("status")
    .filter({ hasText: "Dados salvos no servidor" })
    .waitFor();
  // Restore uses the original JSON backup format; downloads come from the server.
  const [download] = await Promise.all([
    a.waitForEvent("download"),
    a.getByRole("button", { name: "Exportar Backup", exact: true }).click(),
  ]);
  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  const exported = backup.find((r) => r.id === cnpj);
  assert.equal(exported.razaoSocial, `${name} ALTERADO`);
  exported.razaoSocial = `${name} RESTAURADO`;
  exported.d.razaoSocial = exported.razaoSocial;
  await a
    .locator('input[type=file][accept=".json,application/json"]')
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify([exported])),
    });
  await waitRecord((r) => r.record.razaoSocial === `${name} RESTAURADO`);
  await a.reload();
  await a.locator("select").first().selectOption(cnpj);
  assert.equal(
    await a.getByPlaceholder("Ex.: Amazônia Comércio Ltda").inputValue(),
    `${name} RESTAURADO`,
  );
  await a.waitForTimeout(1400);
  await a.setViewportSize({ width: 390, height: 844 });
  assert.ok(await a.locator("#root").isVisible());
  await a.getByRole("button", { name: "Excluir Cliente", exact: true }).click();
  await a
    .getByText(`Cliente "${name} RESTAURADO" excluído.`, { exact: true })
    .waitFor();
  assert.ok(!(await records()).some((r) => r.record.id === cnpj));
  await a.getByRole("button", { name: "Sair", exact: true }).click();
  await a.waitForURL("**/login");
  assert.equal((await a.request.get("/api/original/clients")).status(), 401);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: login, PostgreSQL, upload original, competências, fórmulas iguais, duas sessões, conflito, backup/restauração, exclusão, logout e tela móvel.",
  );
} finally {
  for (const row of await records().catch(() => []))
    if (ids.has(row.record.id)) {
      const response = await api.delete(
        `/api/original/clients/${row.record.id}`,
        { data: { version: row.version } },
      );
      assert.equal(response.status(), 200, "Limpeza do cadastro de teste");
    }
  await api.post("/api/auth/logout");
  await Promise.all(contexts.map((c) => c.close()));
  await browser.close();
  await api.dispose();
}
