import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import { readdir, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
loadEnvFile(".env");
const root = resolve(process.env.REAL_DOCUMENTS_DIR || "Documentos Germano");
const origin = process.env.TEST_ORIGIN || "http://localhost:5173";
await mkdir("test-results/real-documents", { recursive: true });
const files = (await readdir(root, { recursive: true }))
  .filter((f) => f.endsWith(".pdf"))
  .map((f) => resolve(root, f));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    ignoreHTTPSErrors: process.env.TEST_TLS_INSECURE === "1",
  });
  await page.goto(`${origin}/login`);
  await page.locator("[name=email]").fill(process.env.ADMIN_EMAIL);
  await page.locator("[name=password]").fill(process.env.ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page
    .getByRole("heading", {
      name: "Diagnóstico de Enquadramento Tributário 2027",
      exact: true,
    })
    .waitFor();
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.id = "audit-files";
    document.body.append(input);
  });
  await page.locator("#audit-files").setInputFiles(files);
  const results = await page.evaluate(async () => {
    const out = [];
    for (const f of document.querySelector("#audit-files").files) {
      const r = await parseFileRaw(f);
      out.push(r);
    }
    return out;
  });
  await writeFile(
    "test-results/real-documents/pdf-parsed.json",
    JSON.stringify(results, null, 2),
  );
  assert.equal(
    results.filter((r) => r.parseStatus === "ok").length,
    files.length,
    "Todos os PDFs do lote devem ser reconhecidos",
  );
  assert.equal(results.filter((r) => r.tipo === "pgdas").length, 8);
  assert.equal(results.filter((r) => r.tipo === "folha").length, 1);
  assert.equal(results.filter((r) => r.tipo === "cartao_cnpj").length, 1);
  console.log(
    "PASS: os 10 PDFs reais foram lidos pelo navegador, com PDF.js local.",
  );
  await page.getByRole("button", { name: "Sair", exact: true }).click();
} finally {
  await browser.close();
}
