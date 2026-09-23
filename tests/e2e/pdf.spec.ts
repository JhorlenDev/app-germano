import { test, expect } from "@playwright/test";
// PDF com stream comprimido: prova que a nova leitura não depende de regex no binário.
import { deflateSync } from "node:zlib";
function pdfWithText(text: string) {
  const stream = deflateSync(
    Buffer.from(`BT /F1 12 Tf 40 700 Td (${text}) Tj ET`),
  );
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    ),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    Buffer.concat([
      Buffer.from(
        `<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`,
      ),
      stream,
      Buffer.from("\nendstream"),
    ]),
  ];
  let out = Buffer.from("%PDF-1.4\n");
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(out.length);
    out = Buffer.concat([
      out,
      Buffer.from(`${i + 1} 0 obj\n`),
      obj,
      Buffer.from("\nendobj\n"),
    ]);
  });
  const xref = out.length;
  return Buffer.concat([
    out,
    Buffer.from(
      `xref\n0 6\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
        .join(
          "",
        )}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`,
    ),
  ]);
}
test("PDF.js extrai valores de um PDF com stream Flate comprimido", async ({
  page,
}) => {
  await page.goto("/");
  // Importação direta pelo servidor Vite, exercitando worker real no navegador.
  const bytes = Array.from(
    pdfWithText("PGDAS CNPJ 12.345.678/0001-95 RBT12 1950000,00"),
  );
  const text = await page.evaluate(async (bytes) => {
    // @ts-expect-error módulo servido pelo Vite durante o teste
    const { readPDF } = await import("/src/pdf.js");
    return readPDF(
      new File([new Uint8Array(bytes)], "pgdas.pdf", {
        type: "application/pdf",
      }),
    );
  }, bytes);
  expect(text).toContain("1950000,00");
  expect(text).toContain("12.345.678/0001-95");
});
test("PDF não usa Beneficiário Final como nome e preserva razão social válida", async ({
  page,
  context,
}) => {
  const pdfPage = await context.newPage();
  await pdfPage.setContent(
    "<p>COMPROVANTE DE INSCRIÇÃO</p><p>CNPJ: 12.345.678/0001-95</p><p>Nome Empresarial:</p><p>Beneficiário Final:</p>",
  );
  const missingName = Array.from(await pdfPage.pdf());
  await pdfPage.setContent(
    "<p>COMPROVANTE DE INSCRIÇÃO</p><p>CNPJ: 12.345.678/0001-95</p><p>Nome Empresarial:</p><p>EMPRESA FICTÍCIA LTDA</p><p>Beneficiário Final:</p>",
  );
  const validName = Array.from(await pdfPage.pdf());
  await pdfPage.close();
  await page.goto("/");
  const names = await page.evaluate(
    async (pdfs) => {
      // @ts-expect-error módulo servido pelo Vite durante o teste
      const { parseFileRaw } = await import("/src/parsers.js");
      return Promise.all(
        pdfs.map(
          async (bytes) =>
            (
              await parseFileRaw(
                new File([new Uint8Array(bytes)], "cartao_cnpj.pdf", {
                  type: "application/pdf",
                }),
              )
            ).razaoSocialDetectada,
        ),
      );
    },
    [missingName, validName],
  );
  expect(names).toEqual([null, "EMPRESA FICTÍCIA LTDA"]);
});
