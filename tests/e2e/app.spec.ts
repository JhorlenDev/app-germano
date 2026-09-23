import { test, expect, type Page } from "@playwright/test";
import { blankState } from "../../shared/engine.js";
const login = async (page: Page) => {
  await page.goto("/");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill(process.env.ADMIN_EMAIL!);
  await page
    .getByLabel("Senha", { exact: true })
    .fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Entrar na plataforma" }).click();
  await expect(page.getByRole("heading", { name: /Olá,/ })).toBeVisible();
};
test("cadastro real, persistência, concorrência, documentos, impressão e backup", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const cnpj = `99${Date.now().toString().slice(-12)}`;
  const name = `Empresa E2E ${cnpj}`;
  let id: string | undefined;
  try {
    await login(page);
    await page.screenshot({
      path: "test-results/dashboard-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Novo diagnóstico", exact: true })
      .last()
      .click();
    await page.getByLabel("Razão social / nome fantasia").fill(name);
    await page.getByLabel("CNPJ", { exact: false }).fill(cnpj);
    await page.getByLabel("Faturamento mensal", { exact: true }).fill("100000");
    await page
      .getByLabel("Receita acumulada em 12 meses (RBT12)")
      .fill("1200000");
    await page.getByLabel("Competência da simulação").fill("2027-01");
    await page
      .getByRole("button", { name: "Salvar diagnóstico", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("salvo no servidor");
    const saved = await (await page.request.get("/api/clients")).json();
    id = saved.find((c: any) => c.cnpj === cnpj).id;
    await page.reload();
    await page
      .getByRole("button", { name: new RegExp(name) })
      .first()
      .click();
    await expect(
      page.getByLabel("Faturamento mensal", { exact: true }),
    ).toHaveValue("100000");
    await page.getByRole("tab", { name: "Documentos", exact: true }).click();
    const xml = (key: string, month: string) =>
      `<nfeProc><NFe><infNFe Id="NFe${key}"><ide><mod>55</mod><finNFe>1</finNFe><dhEmi>2027-${month}-15T12:00:00-04:00</dhEmi></ide><emit><CNPJ>${cnpj}</CNPJ><CRT>3</CRT></emit><dest><CNPJ>12345678000195</CNPJ></dest><total><ICMSTot><vNF>100000.00</vNF></ICMSTot></total></infNFe></NFe><protNFe><cStat>100</cStat></protNFe></nfeProc>`;
    await page.getByLabel("Importar documentos fiscais").setInputFiles([
      {
        name: "janeiro.xml",
        mimeType: "text/xml",
        buffer: Buffer.from(xml("1".repeat(44), "01")),
      },
      {
        name: "fevereiro.xml",
        mimeType: "text/xml",
        buffer: Buffer.from(xml("2".repeat(44), "02")),
      },
      {
        name: "janeiro-copia.xml",
        mimeType: "text/xml",
        buffer: Buffer.from(xml("1".repeat(44), "01")),
      },
    ]);
    await expect(page.getByRole("status")).toContainText(
      "1 duplicado(s) ignorado(s)",
    );
    await page.getByLabel("Competência para aplicar").selectOption("2027-01");
    await page
      .getByRole("button", { name: "Aplicar valores deste mês" })
      .click();
    await page.getByRole("tab", { name: "Dados da empresa" }).click();
    await expect(
      page.getByLabel("Faturamento mensal", { exact: true }),
    ).toHaveValue("100000");
    await page.getByRole("tab", { name: "Comparativo", exact: true }).click();
    await page.screenshot({
      path: "test-results/comparativo-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Relatório da simulação", exact: true })
      .click();
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".report")).toBeVisible();
    await expect(page.locator(".sidebar")).toBeHidden();
    await page.pdf({
      path: "test-results/relatorio.pdf",
      format: "A4",
      printBackground: true,
    });
    await page.emulateMedia({ media: "screen" });
    await page.getByRole("button", { name: "Fechar relatório" }).click();
    await page.getByRole("tab", { name: "Documentos", exact: true }).click();
    await page
      .getByRole("button", { name: "Remover janeiro.xml", exact: true })
      .click();
    await page.getByRole("tab", { name: "Dados da empresa" }).click();
    await expect(
      page.getByLabel("Faturamento mensal", { exact: true }),
    ).toHaveValue("0");
    await page.getByRole("button", { name: "Salvar diagnóstico" }).click();
    await expect(page.getByRole("status")).toContainText("salvo no servidor");
    await page
      .getByRole("button", { name: "Backup e restauração", exact: true })
      .click();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Exportar backup completo" })
      .click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/gm-backup/);
    const data = await (await page.request.get("/api/backup")).json();
    expect(data.clients.some((c: any) => c.d.cnpj === cnpj)).toBeTruthy();
    expect(errors).toEqual([]);
  } finally {
    if (id) {
      const r = await (await page.request.get(`/api/clients/${id}`)).json();
      await page.request.delete(`/api/clients/${id}`, {
        headers: {
          Origin: "http://localhost:5173",
          "X-Requested-With": "gm-app",
        },
        data: { version: r.version },
      });
    }
  }
});
test("mobile: navegação acessível e sem overflow horizontal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.screenshot({
    path: "test-results/login-mobile.png",
    fullPage: true,
  });
  await login(page);
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page
    .getByRole("button", { name: "Carteira de clientes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Carteira de clientes" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/carteira-mobile.png",
    fullPage: true,
  });
});
test("API exige sessão, valida entradas e evita sobrescrever uma versão antiga", async ({
  request,
}) => {
  expect((await request.get("/api/clients")).status()).toBe(401);
  const headers = {
    Origin: "http://localhost:5173",
    "X-Requested-With": "gm-app",
  };
  expect(
    (
      await request.post("/api/auth/login", {
        headers,
        data: {
          email: process.env.ADMIN_EMAIL,
          password: process.env.ADMIN_PASSWORD,
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.post("/api/clients", {
        headers: { ...headers, Origin: "https://evil.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/clients", {
        headers,
        data: { d: { ...blankState(), faturamentoMensal: -1 } },
      })
    ).status(),
  ).toBe(400);
  const d = {
    ...blankState(),
    razaoSocial: "Teste concorrência",
    cnpj: `88${Date.now().toString().slice(-12)}`,
  };
  const response = await request.post("/api/clients", { headers, data: { d } });
  expect(response.status()).toBe(201);
  const saved = await response.json();
  try {
    expect(
      (
        await request.put(`/api/clients/${saved.id}`, {
          headers,
          data: {
            d: { ...d, razaoSocial: "Atualizado" },
            version: saved.version,
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await request.put(`/api/clients/${saved.id}`, {
          headers,
          data: { d: { ...d, razaoSocial: "Antigo" }, version: saved.version },
        })
      ).status(),
    ).toBe(409);
    const backup = {
      schemaVersion: 1,
      clients: [{ d }, { d: { ...d, cnpj: "INVALID" } }],
    };
    expect(
      (await request.post("/api/backup", { headers, data: backup })).status(),
    ).toBe(400);
    const restoration = await request.post("/api/backup", {
      headers,
      data: { schemaVersion: 1, clients: [{ d }] },
    });
    expect(await restoration.json()).toEqual({ inserted: 0, skipped: 1 });
    expect(
      (await (await request.get(`/api/clients/${saved.id}`)).json()).d
        .razaoSocial,
    ).toBe("Atualizado");
  } finally {
    await request.delete(`/api/clients/${saved.id}`, {
      headers,
      data: { version: saved.version + 1 },
    });
  }
});
