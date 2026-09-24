/* Document ingestion for the original UI. Tax formulas remain in the reference HTML. */
(() => {
  const MONEY = /\d[\d.]*(?:,\d{2})/g;
  const money = (value) =>
    Number(String(value).replace(/\./g, "").replace(",", "."));
  const amounts = (line) => (line.match(MONEY) || []).map(money);
  const normalize = (value) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const hash = async (bytes) =>
    [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  const pause = () => new Promise((r) => setTimeout(r, 0));
  let pdfModule;
  async function readPDF(file, withLayout = false) {
    pdfModule ||= import("/assets/pdfjs/pdf.min.mjs");
    const pdf = await pdfModule;
    pdf.GlobalWorkerOptions.workerSrc = "/assets/pdfjs/pdf.worker.min.mjs";
    const task = pdf.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
      useSystemFonts: true,
    });
    try {
      const doc = await task.promise;
      if (doc.numPages > 100)
        throw new Error("PDF com mais de 100 páginas. Divida o arquivo.");
      const pages = [],
        layout = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n),
          content = await page.getTextContent(),
          viewport = page.getViewport({ scale: 1 });
        const items = content.items
          .filter((i) => i.str?.trim() && i.transform)
          .map((i) => ({
            text: i.str,
            ...(() => {
              const [x, y] = viewport.convertToViewportPoint(
                i.transform[4],
                i.transform[5],
              );
              return { x, y };
            })(),
          }))
          .sort((a, b) => a.y - b.y || a.x - b.x);
        const lines = [];
        for (const item of items) {
          const last = lines.at(-1);
          if (last && Math.abs(last.y - item.y) < 2) last.items.push(item);
          else lines.push({ y: item.y, items: [item] });
        }
        layout.push(...lines);
        pages.push(
          lines
            .map((l) =>
              l.items
                .sort((a, b) => a.x - b.x)
                .map((i) => i.text)
                .join(" "),
            )
            .join("\n"),
        );
      }
      const text = pages.join("\n");
      if (text.trim().length < 20)
        throw new Error(
          "PDF sem texto extraível. É necessário OCR ou um PDF com texto.",
        );
      return withLayout ? { text, layout } : text;
    } finally {
      await task.destroy();
    }
  }
  function competence(text, name) {
    const m =
      /per[ií]odo\s+de\s+apura[cç][aã]o\s*:?\s*\d{2}[\/-](\d{2})[\/-](20\d{2})/i.exec(
        text,
      ) ||
      /compet[eê]ncia\s*:?\s*(0[1-9]|1[0-2])[\/-](20\d{2})/i.exec(text) ||
      /(?:^|\D)(0[1-9]|1[0-2])[ _\/-]+(20\d{2})(?:\D|$)/.exec(name);
    if (m) return `${m[2]}-${m[1]}`;
    const compact = /(20\d{2})[-_]?(0[1-9]|1[0-2])\b/.exec(name);
    return compact ? `${compact[1]}-${compact[2]}` : null;
  }
  function companyName(text) {
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = /(?:nome empresarial|raz[aã]o social)\s*:?\s*(.*)$/i.exec(
        lines[i],
      );
      if (!m) continue;
      const value = (m[1] || lines[i + 1] || "").trim();
      if (
        value.length > 2 &&
        !/^(?:porte|t[ií]tulo|benefici[aá]rio|cnpj|data de)/i.test(value)
      )
        return value;
    }
    return null;
  }
  function tableValue(text, label) {
    const lines = text.split("\n");
    const start = lines.findIndex((l) => label.test(l));
    if (start < 0) return null;
    for (let i = start; i <= Math.min(start + 2, lines.length - 1); i++) {
      const values = amounts(lines[i]);
      if (values.length) return values.at(-1);
    }
    return null;
  }
  function payroll(text) {
    const months = {
      jan: "01",
      fev: "02",
      mar: "03",
      abr: "04",
      mai: "05",
      jun: "06",
      jul: "07",
      ago: "08",
      set: "09",
      out: "10",
      nov: "11",
      dez: "12",
    };
    const header = text
      .split("\n")
      .find((l) =>
        /JAN\/20|FEV\/20|MAR\/20|ABR\/20|MAI\/20|JUN\/20|JUL\/20|AGO\/20|SET\/20|OUT\/20|NOV\/20|DEZ\/20/i.test(
          l,
        ),
      );
    const periods = [
      ...(header || "").matchAll(
        /(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\/(20\d{2})/gi,
      ),
    ].map((m) => `${m[2]}-${months[m[1].toLowerCase()]}`);
    const lines = text.split("\n");
    const salary = lines.find((l) => /sal[aá]rio\s+normal/i.test(l));
    const pro = lines.find((l) => /pr[oó][ -]?labore/i.test(l));
    const salaryValues = amounts(salary || ""),
      proValues = amounts(pro || "");
    const porMes = {};
    if (periods.length && salaryValues.length >= periods.length)
      periods.forEach((c, i) => {
        porMes[c] = { folha: salaryValues[i], proLabore: proValues[i] ?? 0 };
      });
    return porMes;
  }
  async function parse(file, helpers, loaded) {
    const bytes = loaded?.bytes || (await file.arrayBuffer()),
      digest = loaded?.digest || (await hash(bytes)),
      ext = file.name.split(".").pop().toLowerCase();
    const base = {
      id: `file:${digest}`,
      hash: digest,
      name: file.name.split("/").pop(),
      size: file.size,
      ext,
    };
    try {
      if (ext === "xml") {
        const text = new TextDecoder().decode(bytes),
          doc = new DOMParser().parseFromString(text, "text/xml");
        if (doc.querySelector("parsererror")) throw new Error("XML inválido.");
        const event = doc.querySelector("infEvento");
        if (!doc.querySelector("infNFe") && event)
          return {
            ...base,
            tipo: "evento",
            parseStatus: "ok",
            dados: {
              key: doc.querySelector("chNFe")?.textContent,
              tpEvento: doc.querySelector("tpEvento")?.textContent,
            },
            parseBadgeBase: "Evento fiscal para conferência",
          };
        const r = helpers.parseXML(text);
        if (!r) throw new Error("XML não reconhecido como NF-e/NFC-e.");
        const key = (
          doc.querySelector("infNFe")?.getAttribute("Id") || ""
        ).replace(/^NFe/, "");
        if (!/^\d{44}$/.test(key))
          throw new Error("XML sem chave de acesso válida.");
        const tpNF = doc.querySelector("ide > tpNF")?.textContent || "",
          finNFe = doc.querySelector("ide > finNFe")?.textContent || "";
        return {
          ...base,
          ...r,
          id: `xml:${key}`,
          key,
          tpNF,
          finNFe,
          authorization:
            doc.querySelector("protNFe infProt cStat")?.textContent || "",
          ownCNPJ: r.emitCNPJ,
          parseStatus: "ok",
          parseBadgeBase: "",
        };
      }
      if (ext === "csv") {
        const text = new TextDecoder("windows-1252").decode(bytes),
          lines = text
            .split(/\r?\n/)
            .filter((l) => l.trim() && !l.startsWith("sep="));
        const header = lines
          .shift()
          ?.split(";")
          .map((x) => normalize(x.trim()));
        const ki = header?.indexOf("chave"),
          si = header?.indexOf("situacao");
        if (ki < 0 || si < 0 || ki == null)
          throw new Error("CSV sem colunas CHAVE e SITUACAO.");
        const situations = lines
          .map((l) => l.split(";"))
          .map((c) => ({
            key: (c[ki] || "").replace(/\D/g, ""),
            status: normalize(c[si] || ""),
          }))
          .filter((r) => r.key.length === 44);
        return {
          ...base,
          tipo: "conferencia",
          parseStatus: "ok",
          dados: { situations },
          parseBadgeBase: `CSV de conferência: ${situations.length} situações de notas (não soma valores novamente)`,
        };
      }
      const extracted = ext === "pdf" ? await readPDF(file, true) : null;
      const text = extracted ? extracted.text : new TextDecoder().decode(bytes),
        lower = normalize(text);
      const ownCNPJ =
        (text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)?.[0] || "").replace(
          /\D/g,
          "",
        ) || null;
      const comp = competence(text, file.name),
        identity = {
          ownCNPJ,
          competencia: comp,
          razaoSocialDetectada: companyName(text),
        };
      if (
        /comprovante de inscricao|cadastro nacional da pessoa juridica/.test(
          lower,
        )
      ) {
        const cnae =
          /atividade econ[oô]mica principal\s*\n\s*(\d{2}\.?\d{2}-\d[-\/]\d{2})/i.exec(
            text,
          )?.[1] || null;
        const lines = text.split("\n");
        const municipal = lines.findIndex((l) => /MUNIC[IÍ]PIO/i.test(l));
        let municipioUF = null;
        if (extracted) {
          const rowIndex = extracted.layout.findIndex((l) =>
            l.items.some((i) => /MUNIC[IÍ]PIO/i.test(i.text)),
          );
          if (rowIndex >= 0) {
            const row = extracted.layout[rowIndex],
              next = extracted.layout[rowIndex + 1];
            const x = row.items.find((i) => /MUNIC[IÍ]PIO/i.test(i.text)).x,
              ufX = row.items.find((i) => i.text.trim() === "UF")?.x;
            if (next && ufX) {
              const city = next.items
                .filter((i) => i.x >= x - 2 && i.x < ufX - 2)
                .map((i) => i.text)
                .join(" ")
                .trim();
              const uf = next.items.find(
                (i) => i.x >= ufX - 2 && /^[A-Z]{2}$/.test(i.text.trim()),
              )?.text;
              if (city && uf) municipioUF = `${city} - ${uf}`;
            }
          }
        }
        if (!municipioUF && municipal >= 0) {
          const value = lines[municipal + 1] || "";
          const city = /([A-ZÀ-Ü][A-ZÀ-Ü ]+?)\s+([A-Z]{2})\s*$/.exec(value);
          if (city) municipioUF = `${city[1].trim()} - ${city[2]}`;
        }
        return {
          ...base,
          ...identity,
          tipo: "cartao_cnpj",
          dados: {},
          cnaeDetectado: cnae,
          municipioUFDetectado: municipioUF,
          parseStatus: ownCNPJ ? "ok" : "estimado",
          parseBadgeBase: "Cartão CNPJ: identificação extraída",
        };
      }
      const isPayroll =
        /ficha financeira|folha\s*(de\s*)?pagamento|pro[ -]?labore|esocial|dctfweb/.test(
          lower,
        );
      const isPGDAS =
        /pgdas|programa gerador do documento de arrecadacao/.test(lower) ||
        /pgdas|extrato.*simples nacional/i.test(file.name) ||
        (!isPayroll && /simples nacional|rbt\s*-?\s*12/i.test(text));
      if (isPGDAS) {
        const faturamento =
          tableValue(text, /receita\s+bruta\s+do\s+PA\b/i) ??
          tableValue(text, /receita\s+bruta\s*:|faturamento\s*:/i);
        const rbt12 =
          tableValue(
            text,
            /receita bruta acumulada nos doze meses anteriores/i,
          ) ?? tableValue(text, /RBT[\s-]*12\s*:/i);
        const anexoDetectado = /revenda de mercadorias/i.test(text)
          ? { setor: "comercio", anexo: "I" }
          : helpers.detectAnexo(
              text.replace(/fator\s*r\s*=\s*n[aã]o se aplica/gi, ""),
            );
        return {
          ...base,
          ...identity,
          tipo: "pgdas",
          dados: { faturamento, rbt12 },
          anexoDetectado,
          parseStatus:
            ownCNPJ && comp && faturamento !== null && rbt12 !== null
              ? "ok"
              : "estimado",
          parseBadgeBase: comp
            ? "PGDAS-D: receita do período e RBT12 extraídos"
            : "PGDAS-D: competência não identificada; confira o documento",
        };
      }
      if (isPayroll) {
        const porMes = payroll(text),
          periods = Object.keys(porMes).sort();
        const fallback = {
          folha:
            tableValue(text, /total\s*(da\s*)?folha|folha\s*bruta/i) ??
            tableValue(text, /folha\s*(de\s*)?pagamento/i),
          proLabore: tableValue(text, /pr[oó][ -]?labore/i),
        };
        return {
          ...base,
          ...identity,
          tipo: "folha",
          competencia: periods.at(-1) || comp,
          dados: periods.length ? porMes[periods.at(-1)] : fallback,
          porMes,
          parseStatus:
            ownCNPJ &&
            (periods.length || comp) &&
            (periods.length || fallback.folha !== null)
              ? "ok"
              : "estimado",
          parseBadgeBase: periods.length
            ? `Ficha financeira: salários e pró-labore separados por ${periods.length} competências`
            : "Folha: confira os valores e a competência extraídos",
        };
      }
      return {
        ...base,
        ...identity,
        tipo: "desconhecido",
        dados: {},
        parseStatus: "estimado",
        parseBadgeBase:
          "Documento não reconhecido. Não compõe os totais automaticamente.",
      };
    } catch (error) {
      return {
        ...base,
        tipo: "erro",
        dados: {},
        parseStatus: "erro",
        parseBadgeBase: error.message,
      };
    }
  }
  async function* expand(files, stats, cancelled, depth = 0) {
    if (depth > 5)
      throw new Error("ZIP com mais de cinco níveis de pastas compactadas.");
    for (const file of files) {
      if (cancelled()) throw new Error("Importação cancelada.");
      const ext = file.name.split(".").pop().toLowerCase();
      if (ext !== "zip") {
        if (["xml", "pdf", "txt", "csv"].includes(ext)) yield file;
        else stats.ignored++;
        continue;
      }
      const bytes = new Uint8Array(await file.arrayBuffer()),
        digest = await hash(bytes);
      if (stats.archives.has(digest)) {
        stats.duplicateArchives++;
        continue;
      }
      stats.archives.add(digest);
      const ready = [];
      let error;
      const unzip = new fflate.Unzip((entry) => {
        if (!/\.(xml|pdf|txt|csv|zip)$/i.test(entry.name)) {
          if (!entry.name.endsWith("/")) stats.ignored++;
          return;
        }
        const chunks = [];
        let size = 0;
        entry.ondata = (err, data, final) => {
          if (err) {
            error = err;
            return;
          }
          size += data.length;
          stats.expanded += data.length;
          if (
            size > 256 * 1024 * 1024 ||
            stats.expanded > 2 * 1024 * 1024 * 1024
          ) {
            entry.terminate();
            error = new Error(
              "ZIP excedeu o limite de tamanho descompactado. Divida o lote.",
            );
            return;
          }
          chunks.push(data);
          if (final) ready.push(new File(chunks, entry.name.split("/").pop()));
        };
        entry.start();
      });
      unzip.register(fflate.UnzipInflate);
      for (let offset = 0; offset < bytes.length; offset += 131072) {
        unzip.push(
          bytes.subarray(offset, offset + 131072),
          offset + 131072 >= bytes.length,
        );
        if (error) throw error;
        while (ready.length)
          yield* expand([ready.shift()], stats, cancelled, depth + 1);
        if (offset % 1048576 === 0) await pause();
      }
    }
  }
  async function ingest(
    files,
    existing,
    helpers,
    progress,
    cancelled = () => false,
  ) {
    const stats = {
      archives: new Set(),
      duplicateArchives: 0,
      duplicates: 0,
      ignored: 0,
      expanded: 0,
      processed: 0,
    };
    const known = new Map(existing.map((r) => [r.id, r.hash])),
      knownHashes = new Set(existing.map((r) => r.hash)),
      raws = [];
    for await (const file of expand(files, stats, cancelled)) {
      const bytes = await file.arrayBuffer(),
        digest = await hash(bytes);
      stats.processed++;
      if (knownHashes.has(digest)) {
        stats.duplicates++;
        if (stats.processed % 25 === 0) {
          progress({ ...stats, archives: stats.archives.size });
          await pause();
        }
        continue;
      }
      knownHashes.add(digest);
      const r = await parse(file, helpers, { bytes, digest });
      if (known.has(r.id)) {
        if (known.get(r.id) === r.hash) {
          stats.duplicates++;
        } else if (r.ext === "xml") {
          raws.push({
            ...r,
            id: `conflict:${r.hash}`,
            parseStatus: "erro",
            parseBadgeBase:
              "Chave de nota repetida com conteúdo diferente. Confira os arquivos.",
          });
        }
      } else {
        known.set(r.id, r.hash);
        raws.push(r);
      }
      if (stats.processed % 25 === 0) {
        progress({ ...stats, archives: stats.archives.size });
        await pause();
      }
    }
    progress({ ...stats, archives: stats.archives.size });
    return { raws, stats: { ...stats, archives: stats.archives.size } };
  }
  function finalize(r, master, isSource, originalFinalize) {
    if (r.tipo === "conferencia" || r.tipo === "evento")
      return { ...r, status: "ok", badge: r.parseBadgeBase };
    const result = {
      ...originalFinalize(r, master, isSource),
      hash: r.hash,
      key: r.key,
      tpNF: r.tpNF,
      finNFe: r.finNFe,
      authorization: r.authorization,
      porMes: r.porMes,
      ownCNPJ: r.ownCNPJ,
      razaoSocialDetectada: r.razaoSocialDetectada,
      cnaeDetectado: r.cnaeDetectado,
      municipioUFDetectado: r.municipioUFDetectado,
    };
    if (
      r.ext === "xml" &&
      r.parseStatus !== "erro" &&
      r.authorization &&
      !["100", "150"].includes(r.authorization)
    )
      return {
        ...result,
        status: "rejeitado",
        badge: "Nota sem autorização de uso. Não compõe os totais.",
      };
    if (!master || (!r.ownCNPJ && r.ext !== "xml"))
      return {
        ...result,
        ...(!master ? { pendingRaw: r } : {}),
        status: "estimado",
        badge:
          "CNPJ não identificado: documento pendente, sem composição automática dos totais.",
      };
    // Adjustment/return notes require the accountant's decision instead of being treated as ordinary revenue/purchases.
    if (
      r.ext === "xml" &&
      (r.tpNF === "0" || (r.finNFe && r.finNFe !== "1" && r.finNFe !== "2"))
    )
      return {
        ...result,
        status: "estimado",
        badge:
          "Nota de ajuste/devolução ou entrada própria: pendente de conferência; não somada automaticamente.",
      };
    return result;
  }
  function canceledKeys(records) {
    const keys = new Set();
    for (const r of records) {
      if (r.tipo === "conferencia")
        for (const row of r.dados.situations || [])
          if (/cancel|deneg|rejeit/.test(row.status)) keys.add(row.key);
      if (r.tipo === "evento" && r.dados.tpEvento === "110111")
        keys.add(r.dados.key);
    }
    return keys;
  }
  function periods(records) {
    return [
      ...new Set(
        records
          .filter((r) => r.status === "ok")
          .flatMap((r) =>
            Object.keys(r.porMes || {}).length
              ? Object.keys(r.porMes)
              : r.competencia
                ? [r.competencia]
                : [],
          ),
      ),
    ].sort();
  }
  function aggregate(records, period, originalAggregate) {
    const canceled = canceledKeys(records);
    const applicable = records
      .filter((r) => r.status === "ok" && !canceled.has(r.key))
      .flatMap((r) =>
        Object.keys(r.porMes || {}).length
          ? r.porMes[period]
            ? [{ ...r, competencia: period, dados: r.porMes[period] }]
            : []
          : [r],
      )
      .filter((r) => r.competencia === period);
    const pgdas = applicable.filter((r) => r.tipo === "pgdas"),
      warnings = [];
    const chosenPGDAS = pgdas[0];
    if (
      pgdas.length > 1 &&
      pgdas.some(
        (r) => JSON.stringify(r.dados) !== JSON.stringify(chosenPGDAS.dados),
      )
    )
      warnings.push(
        "Há PGDAS diferentes para este mês. Confira qual declaração deve permanecer.",
      );
    const applicableUnique = applicable.filter(
      (r) => r.tipo !== "pgdas" || r === chosenPGDAS,
    );
    const agg = originalAggregate(applicableUnique);
    const xmlTotal = applicable
      .filter((r) => r.tipo === "nfe_saida" || r.tipo === "nfce_saida")
      .reduce((s, r) => s + r.dados.vNF, 0);
    if (chosenPGDAS && Number.isFinite(chosenPGDAS.dados.faturamento)) {
      agg.faturamentoSaida = chosenPGDAS.dados.faturamento;
      if (xmlTotal && Math.abs(xmlTotal - agg.faturamentoSaida) > 0.02)
        warnings.push(
          `Receita do PGDAS difere dos XMLs em R$ ${Math.abs(xmlTotal - agg.faturamentoSaida).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Usado o PGDAS; confira as notas.`,
        );
    }
    if (!agg.temFolha)
      warnings.push(
        "Não há folha para esta competência. Os campos ficam zerados para preenchimento ou envio do documento correspondente.",
      );
    if (!chosenPGDAS)
      warnings.push(
        "Sem PGDAS desta competência: confira o RBT12 antes de usar o diagnóstico.",
      );
    if (!applicable.some((r) => r.tipo === "nfe_entrada"))
      warnings.push("Nenhuma nota de compra válida nesta competência.");
    for (const key of [
      "faturamentoSaida",
      "comprasEntrada",
      "comprasComCredito",
      "vendasB2B",
      "vendasB2C",
      "folha",
      "proLabore",
    ])
      agg[key] = Math.round((agg[key] + Number.EPSILON) * 100) / 100;
    for (const row of Object.values(agg.ncmMap))
      row.valorTotal =
        Math.round((row.valorTotal + Number.EPSILON) * 100) / 100;
    return {
      ...agg,
      xmlTotal: Math.round((xmlTotal + Number.EPSILON) * 100) / 100,
      warnings,
      canceled: canceled.size,
    };
  }
  window.gmImport = {
    parse,
    readPDF,
    ingest,
    finalize,
    periods,
    aggregate,
    canceledKeys,
    money,
    competence,
    payroll,
  };
})();
