import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = workerUrl;
export async function readPDF(file) {
  const task = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
  });
  const doc = await task.promise;
  try {
    if (doc.numPages > 100) throw new Error("PDF limitado a 100 páginas.");
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      pages.push(content.items.map((item) => item.str || "").join(" "));
    }
    return pages.join("\n");
  } finally {
    await task.destroy();
  }
}
