import { test, expect } from "@playwright/test";
test("upload cadastra sem CNPJ prévio e salva alterações sem clicar em Salvar", async ({
  page,
}) => {
  const cnpj = `88${Date.now().toString().slice(-12)}`;
  let id: string | undefined;
  await page.goto("/");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill(process.env.ADMIN_EMAIL!);
  await page
    .getByLabel("Senha", { exact: true })
    .fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Entrar na plataforma" }).click();
  try {
    await page
      .getByRole("button", { name: "Novo diagnóstico", exact: true })
      .last()
      .click();
    await page.getByRole("tab", { name: "Documentos", exact: true }).click();
    await page.getByLabel("Importar documentos fiscais").setInputFiles({
      name: "cartao_cnpj.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(
        `COMPROVANTE DE INSCRIÇÃO\nCNPJ: ${cnpj}\nNOME EMPRESARIAL\nEMPRESA FICTICIA AUTO ${cnpj}\nATIVIDADE ECONÔMICA PRINCIPAL\n47.11-3-02 - Comércio\nMUNICÍPIO\nTEFE\nUF\nAM`,
      ),
    });
    await expect(
      page.getByText("Salvo no servidor", { exact: true }),
    ).toBeVisible();
    const clients = await (await page.request.get("/api/clients")).json();
    id = clients.find((c: { cnpj: string }) => c.cnpj === cnpj)?.id;
    expect(id).toBeTruthy();
    await page.getByRole("tab", { name: "Dados da empresa" }).click();
    await expect(page.getByLabel("CNPJ", { exact: false })).toHaveValue(cnpj);
    await expect(page.getByLabel("Razão social / nome fantasia")).toHaveValue(
      `EMPRESA FICTICIA AUTO ${cnpj}`,
    );
    await expect(page.getByLabel("CNAE principal")).toHaveValue("47.11-3-02");
    await page
      .getByLabel("Razão social / nome fantasia")
      .fill(`EMPRESA ATUALIZADA ${cnpj}`);
    await expect(
      page.getByText("Salvo no servidor", { exact: true }),
    ).toBeVisible();
    const saved = await (await page.request.get(`/api/clients/${id}`)).json();
    expect(saved.d.razaoSocial).toBe(`EMPRESA ATUALIZADA ${cnpj}`);
    expect(saved.d.cnae).toBe("47.11-3-02");
    await page.getByRole("tab", { name: "Premissas", exact: true }).click();
    await page.route(`**/api/clients/${id}`, async (route) => {
      if (route.request().method() === "PUT")
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Falha simulada de gravação" }),
        });
      else await route.continue();
    });
    await page
      .getByLabel("Observações da análise")
      .fill("Rascunho preservado após falha");
    await expect(page.getByRole("alert")).toContainText(
      "Falha simulada de gravação",
    );
    await expect(page.getByLabel("Observações da análise")).toHaveValue(
      "Rascunho preservado após falha",
    );
    await page.unroute(`**/api/clients/${id}`);
    await page
      .getByRole("button", { name: "Salvar diagnóstico", exact: true })
      .click();
    await expect(
      page.getByText("Salvo no servidor", { exact: true }),
    ).toBeVisible();
    const retried = await (await page.request.get(`/api/clients/${id}`)).json();
    expect(retried.d.notas).toBe("Rascunho preservado após falha");
    await page.reload();
    await expect(
      page.getByText(`EMPRESA ATUALIZADA ${cnpj}`, { exact: true }).first(),
    ).toBeVisible();
  } finally {
    if (!id) {
      const clients = await (await page.request.get("/api/clients")).json();
      id = clients.find((c: { cnpj: string }) => c.cnpj === cnpj)?.id;
    }
    if (id) {
      const current = await (
        await page.request.get(`/api/clients/${id}`)
      ).json();
      const deleted = await page.request.delete(`/api/clients/${id}`, {
        headers: {
          Origin: "http://localhost:5173",
          "X-Requested-With": "gm-app",
        },
        data: { version: current.version },
      });
      expect(deleted.ok()).toBeTruthy();
    }
  }
});
test("PGDAS, folha e seis XMLs alimentam os valores, preservando a competência livre", async ({
  page,
}) => {
  const cnpj = `87${Date.now().toString().slice(-12)}`;
  let id: string | undefined;
  await page.goto("/");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill(process.env.ADMIN_EMAIL!);
  await page
    .getByLabel("Senha", { exact: true })
    .fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Entrar na plataforma" }).click();
  try {
    await page
      .getByRole("button", { name: "Novo diagnóstico", exact: true })
      .last()
      .click();
    await page.getByLabel("Competência da simulação").fill("2030-09");
    await page.getByRole("tab", { name: "Documentos", exact: true }).click();
    const xmls = Array.from({ length: 6 }, (_, i) => ({
      name: `nota${i}.xml`,
      mimeType: "text/xml",
      buffer: Buffer.from(
        `<NFe><infNFe Id="NFe${i}${cnpj}"><ide><mod>55</mod><dhEmi>2027-0${i + 1}-01</dhEmi></ide><emit><CNPJ>${cnpj}</CNPJ><CRT>3</CRT></emit><total><ICMSTot><vNF>1000.00</vNF></ICMSTot></total></infNFe></NFe>`,
      ),
    }));
    await page.getByLabel("Importar documentos fiscais").setInputFiles([
      ...xmls,
      {
        name: "pgdas.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(
          `PGDAS-D\nCNPJ: ${cnpj}\nRBT12: 120.000,00\nReceita bruta: 10.000,00\nAnexo I`,
        ),
      },
      {
        name: "folha.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(
          `Total da folha: 5.000,00\nPró-labore: 1.000,00\nCNPJ: ${cnpj}`,
        ),
      },
    ]);
    await expect(
      page.getByText("Salvo no servidor", { exact: true }),
    ).toBeVisible();
    const clients = await (await page.request.get("/api/clients")).json();
    id = clients.find((c: { cnpj: string }) => c.cnpj === cnpj)?.id;
    expect(id).toBeTruthy();
    await page.getByRole("tab", { name: "Dados da empresa" }).click();
    await expect(page.getByLabel("Competência da simulação")).toHaveValue(
      "2030-09",
    );
    await expect(
      page.getByLabel("Faturamento mensal", { exact: true }),
    ).toHaveValue("6000");
    await expect(
      page.getByLabel("Receita acumulada em 12 meses (RBT12)"),
    ).toHaveValue("120000");
    await expect(page.getByLabel("Folha de empregados")).toHaveValue("5000");
    await expect(page.getByLabel("Pró-labore dos sócios")).toHaveValue("1000");
    const saved = await (await page.request.get(`/api/clients/${id}`)).json();
    expect(saved.d.historico).toHaveLength(6);
    expect(saved.d.competencia).toBe("2030-09");
  } finally {
    if (!id) {
      const clients = await (await page.request.get("/api/clients")).json();
      id = clients.find((c: { cnpj: string }) => c.cnpj === cnpj)?.id;
    }
    if (id) {
      const current = await (
        await page.request.get(`/api/clients/${id}`)
      ).json();
      const deleted = await page.request.delete(`/api/clients/${id}`, {
        headers: {
          Origin: "http://localhost:5173",
          "X-Requested-With": "gm-app",
        },
        data: { version: current.version },
      });
      expect(deleted.ok()).toBeTruthy();
    }
  }
});
