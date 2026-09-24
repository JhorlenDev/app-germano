import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { chromium } from "@playwright/test";
loadEnvFile(".env");
const root = resolve(process.env.REAL_DOCUMENTS_DIR || "Documentos Germano");
const out = resolve("test-results/real-documents");
await mkdir(out, { recursive: true });
const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const database = `gm_real_test_${process.pid}`;
const dbURL = new URL(process.env.DATABASE_URL);
dbURL.pathname = `/${database}`;
const origin = "http://localhost:5180";
const env = {
  ...process.env,
  DATABASE_URL: dbURL.href,
  PORT: "5180",
  HOST: "127.0.0.1",
  APP_ORIGIN: origin,
  NODE_ENV: "development",
};
let server, browser, testPool;
const errors = [];
const cardText = execFileSync(
  "pdftotext",
  ["-layout", resolve(root, "cnpj.pdf"), "-"],
  { encoding: "utf8" },
);
const cnpj = cardText
  .match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)[0]
  .replace(/\D/g, "");
const cardLines = cardText.split("\n");
const headerIndex = cardLines.findIndex((l) => l.includes("MUNICÍPIO"));
const columns = cardLines[headerIndex].trim().split(/\s{2,}/),
  values = cardLines[headerIndex + 1].trim().split(/\s{2,}/);
const expectedCity = `${values[columns.indexOf("MUNICÍPIO")]} - ${values[columns.indexOf("UF")]}`;
const payrollFile = (await readdir(root)).find((n) =>
  /^FICHA FINANCEIRA.*\.pdf$/i.test(n),
);
const payrollText = execFileSync(
  "pdftotext",
  ["-layout", resolve(root, payrollFile), "-"],
  { encoding: "utf8" },
);
const payrollAmounts = (label) =>
  payrollText
    .split("\n")
    .find((l) => label.test(l))
    .match(/\d[\d.]*,\d{2}/g)
    .map((v) => Number(v.replaceAll(".", "").replace(",", ".")));
const salaries = payrollAmounts(/Salario normal/i),
  proLabores = payrollAmounts(/Pro labore/i);
const expected = {};
for (const name of await readdir(resolve(root, "EXTRATO SIMPLES NACIONAL"))) {
  if (!name.endsWith(".pdf")) continue;
  const text = execFileSync(
    "pdftotext",
    ["-layout", resolve(root, "EXTRATO SIMPLES NACIONAL", name), "-"],
    { encoding: "utf8" },
  );
  const period = text.match(/Período de Apuração:\s*\d{2}\/(\d{2})\/(\d{4})/);
  const lines = text.split("\n");
  const value = (label) => {
    const line = lines.find((l) => label.test(l));
    return Number(
      line
        .match(/\d[\d.]*,\d{2}/g)
        .at(-1)
        .replaceAll(".", "")
        .replace(",", "."),
    );
  };
  expected[`${period[2]}-${period[1]}`] = {
    faturamento: value(/Receita Bruta do PA/),
    rbt12: value(/Receita bruta acumulada nos doze meses anteriores/),
  };
}
async function waitSaved(page, predicate) {
  for (let n = 0; n < 240; n++) {
    const { rows } = await testPool.query(
      "SELECT data,version FROM original_clients WHERE id=$1",
      [cnpj],
    );
    if (rows[0] && predicate(rows[0].data.d)) return rows[0];
    if (n % 20 === 0)
      console.log(
        "Aguardando banco:",
        await page.locator("#server-status").textContent(),
      );
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Dados importados não foram salvos como esperado.");
}
async function login(context) {
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(origin);
  await page.locator("[name=email]").fill(env.ADMIN_EMAIL);
  await page.locator("[name=password]").fill(env.ADMIN_PASSWORD);
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
  await admin.query(`CREATE DATABASE ${database}`);
  execFileSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "server/create-user.ts"],
    { env, stdio: "pipe" },
  );
  server = spawn(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "server/index.ts"],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stderr.on("data", (d) => console.log(String(d)));
  testPool = new pg.Pool({ connectionString: dbURL.href });
  for (let n = 0; n < 60; n++) {
    try {
      if ((await fetch(`${origin}/api/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await login(context);
  await page
    .getByRole("button", { name: "Cadastrar / Analisar Novo Cliente" })
    .click();
  const files = (await readdir(root))
    .filter((n) => /\.(pdf|zip)$/i.test(n))
    .map((n) => resolve(root, n));
  console.log(
    "Iniciando upload real em banco isolado:",
    files.length,
    "arquivos principais, incluindo ZIPs.",
  );
  const started = Date.now();
  await page.locator("input[type=file][multiple]").setInputFiles(files);
  for (let n = 0; n < 600; n++) {
    const summary = await page.getByRole("status").allTextContents();
    if (summary.some((t) => t.startsWith("Importação não concluída:")))
      throw new Error(
        summary.find((t) => t.startsWith("Importação não concluída:")),
      );
    if (summary.some((t) => t.includes("arquivos lidos ·"))) break;
    if (n % 20 === 0)
      console.log(
        "Progresso:",
        await page
          .getByText(/Processando documentos fiscais/)
          .textContent()
          .catch(() => ""),
      );
    await new Promise((r) => setTimeout(r, 1000));
  }
  const saved = await waitSaved(
    page,
    (d) =>
      d.documentosImportados?.length > 11000 &&
      d.competenciaImportacao === "2026-08",
  );
  const d = saved.data.d;
  await writeFile(
    resolve(out, "saved-real.json"),
    JSON.stringify(saved, null, 2),
  );
  console.log(
    "Salvo:",
    d.documentosImportados.length,
    "documentos;",
    Math.round(JSON.stringify(saved).length / 1024),
    "KiB;",
    Math.round((Date.now() - started) / 1000),
    "s",
  );
  assert.equal(d.cnpj.replace(/\D/g, ""), cnpj);
  const docs = d.documentosImportados;
  const independent = JSON.parse(
    await readFile(resolve(out, "archive-audit.json"), "utf8"),
  );
  assert.equal(
    docs.filter((r) => r.ext === "xml").length,
    independent.uniqueInvoices,
  );
  assert.deepEqual(
    docs
      .filter((r) => r.ext === "xml")
      .map((r) => r.key)
      .sort(),
    Object.keys(independent.invoices).sort(),
  );
  assert.equal(
    docs.filter((r) => r.status === "rejeitado").length,
    independent.stats.canceledInvoices,
  );
  assert.equal(
    docs.filter((r) => r.status === "estimado").length,
    independent.stats.reviewInvoices,
  );
  assert.equal(d.municipioUF, expectedCity);
  const pdfs = docs.filter((r) => r.ext === "pdf");
  assert.equal(pdfs.length, 10);
  assert.equal(pdfs.filter((r) => r.status === "ok").length, 10);
  assert.equal(d.setor, "comercio");
  assert.equal(new Set(docs.map((r) => r.id)).size, docs.length);
  const monthly = {};
  for (const period of Object.keys(expected).sort()) {
    await page
      .getByLabel("Competência da simulação", { exact: true })
      .selectOption(period);
    const row = await waitSaved(
      page,
      (x) => x.competenciaImportacao === period,
    );
    assert.equal(
      row.data.d.faturamentoMensal,
      expected[period].faturamento,
      `Receita PGDAS ${period}`,
    );
    assert.equal(row.data.d.rbt12, expected[period].rbt12, `RBT12 ${period}`);
    assert.equal(
      row.data.d.comprasMensais,
      independent.months[period].entrada,
      `Compras XML sem cancelamentos ${period}`,
    );
    if (period <= "2026-06") {
      assert.equal(
        row.data.d.folhaMensal,
        salaries[Number(period.slice(-2)) - 1],
      );
      assert.equal(
        row.data.d.proLabore,
        proLabores[Number(period.slice(-2)) - 1],
      );
    } else {
      assert.equal(row.data.d.folhaMensal, 0);
      assert.equal(row.data.d.proLabore, 0);
    }
    monthly[period] = {
      revenue: row.data.d.faturamentoMensal,
      rbt12: row.data.d.rbt12,
      purchases: row.data.d.comprasMensais,
      salary: row.data.d.folhaMensal,
      proLabore: row.data.d.proLabore,
    };
  }
  await page
    .getByLabel("Competência da simulação", { exact: true })
    .selectOption("2026-06");
  // Select Jan-Jun freely instead of the default six most recent periods.
  for (const checkbox of await page.locator("input[type=checkbox]").all())
    if (await checkbox.isChecked()) await checkbox.uncheck();
  const labels = await page.locator("input[type=checkbox]").all();
  for (const box of labels.slice(0, 6)) await box.check();
  const history = await waitSaved(
    page,
    (x) =>
      x.competenciaImportacao === "2026-06" &&
      x.historicoCompetencias[0] === "2026-01" &&
      x.historicoCompetencias.at(-1) === "2026-06",
  );
  assert.equal(
    history.data.d.historico[0].faturamento,
    expected["2026-01"].faturamento,
  );
  // Re-upload every extracted file as well: no duplicate or canceled invoice may re-enter totals.
  const extracted = (await readdir(root, { recursive: true }))
    .filter((n) => /\.(xml|pdf|csv)$/i.test(n))
    .map((n) => resolve(root, n));
  await page.locator("input[type=file][multiple]").setInputFiles(extracted);
  await page
    .getByRole("status")
    .filter({ hasText: "nenhum documento novo." })
    .waitFor({ timeout: 180000 });
  const unchanged = await testPool.query(
    "SELECT data FROM original_clients WHERE id=$1",
    [cnpj],
  );
  assert.equal(
    unchanged.rows[0].data.d.documentosImportados.length,
    docs.length,
  );
  assert.equal(
    unchanged.rows[0].data.d.faturamentoMensal,
    expected["2026-06"].faturamento,
  );
  await page.screenshot({
    path: resolve(out, "real-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Gerar parecer técnico" }).click();
  assert.ok(await page.getByRole("button", { name: /Imprimir/ }).count());
  await page.pdf({
    path: resolve(out, "parecer-real.pdf"),
    format: "A4",
    printBackground: true,
  });
  const reportText = execFileSync(
    "pdftotext",
    [resolve(out, "parecer-real.pdf"), "-"],
    { encoding: "utf8" },
  );
  assert.ok(reportText.includes("Conferência dos documentos"));
  assert.ok(reportText.includes(d.cnpj));
  assert.match(reportText, /Recomenda[cç][aã]o\s+T[eé]cnica\s+Conclusiva/);
  assert.ok(
    reportText.includes("Representante Legal da Empresa"),
    "O parecer deve imprimir até a assinatura final",
  );
  const printedPages = reportText
    .split("\f")
    .map((p) => p.trim())
    .filter(Boolean);
  assert.equal(
    new Set(printedPages).size,
    printedPages.length,
    "Não deve repetir a primeira página",
  );
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  const revenueInput = page
    .locator("label")
    .filter({ hasText: /^Faturamento mensal/ })
    .locator("..")
    .locator("input");
  await revenueInput.fill("151234.56");
  await waitSaved(page, (x) => x.faturamentoMensal === 151234.56);
  // Restart the API process; the database and session must retain the record.
  server.kill("SIGTERM");
  await new Promise((r) => server.once("exit", r));
  server = spawn(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "server/index.ts"],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  for (let n = 0; n < 60; n++) {
    try {
      if ((await fetch(`${origin}/api/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  const context2 = await browser.newContext();
  const second = await login(context2);
  await second.locator("select").first().selectOption(cnpj);
  await second
    .getByLabel("Competência da simulação", { exact: true })
    .waitFor();
  assert.equal(
    await second
      .getByLabel("Competência da simulação", { exact: true })
      .inputValue(),
    "2026-06",
  );
  assert.equal(await second.locator("input[type=checkbox]:checked").count(), 6);
  assert.equal(
    Number(
      await second
        .locator("label")
        .filter({ hasText: /^Faturamento mensal/ })
        .locator("..")
        .locator("input")
        .inputValue(),
    ),
    151234.56,
  );
  await second.waitForTimeout(1800);
  const preserved = await testPool.query(
    "SELECT data FROM original_clients WHERE id=$1",
    [cnpj],
  );
  assert.equal(preserved.rows[0].data.d.faturamentoMensal, 151234.56);
  const [download] = await Promise.all([
    second.waitForEvent("download"),
    second
      .getByRole("button", { name: "Exportar Backup", exact: true })
      .click(),
  ]);
  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(backup[0].d.documentosImportados.length, docs.length);
  await second.setViewportSize({ width: 390, height: 844 });
  const mobileWidth = await second.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  assert.ok(
    mobileWidth.content <= mobileWidth.viewport + 1,
    "A tela não deve transbordar horizontalmente no celular",
  );
  await second.evaluate(() => scrollTo(0, 0));
  await second.screenshot({ path: resolve(out, "real-mobile-viewport.png") });
  await second.screenshot({
    path: resolve(out, "real-mobile.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(out, "verified.json"),
    JSON.stringify(
      {
        count: docs.length,
        monthly,
        seconds: (Date.now() - started) / 1000,
        pdfCount: pdfs.length,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: PDFs reais, ZIPs, oito competências, salários, persistência, seleção de seis meses, segunda sessão, backup e parecer.",
  );
} finally {
  await browser?.close();
  if (server) {
    server.kill("SIGTERM");
    await new Promise((r) => server.once("exit", r));
  }
  await testPool?.end();
  await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  await admin.end();
}
