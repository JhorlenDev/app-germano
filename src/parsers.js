import { parseSupportDocument, SUPPORT_TYPES } from "./support-documents.js";
import { classifyNCM, formatCompetencia } from "../shared/engine.js";

export function parseCurrencyBR(str) {
  if (!str) return null;
  let s = str.trim();
  if (/,\d{2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}
export function numberNear(text, keywordRegex) {
  const m = keywordRegex.exec(text);
  if (!m) return null;
  const val = m[m.length - 1];
  return parseCurrencyBR(val);
}
export const NUM = String.raw`(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+(?:,\d{2})?)`;

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsText(file, "utf-8");
  });
}
function extractCNAE(text) {
  const m = /CNAE[^\d]{0,20}(\d{4}[-\/]?\d?[-\/]?\d{0,2})/i.exec(text);
  return m ? m[1] : null;
}

export function detectAnexoPGDAS(text) {
  const t = (text || "").toLowerCase();
  if (
    /anexo\s*iv\b|constru[cç][aã]o\s*civil|servi[cç]os?\s*com\s*recolhimento\s*de\s*cpp\s*fora/.test(
      t,
    )
  )
    return { setor: "servicos", anexo: "IV" };
  if (/anexo\s*v\b/.test(t)) return { setor: "servicos", anexo: "V" };
  if (
    /anexo\s*iii\b|loca[cç][aã]o\s*de\s*bens|presta[cç][aã]o\s*de\s*servi[cç]os/.test(
      t,
    )
  )
    return { setor: "servicos", anexo: "III" };
  if (
    /anexo\s*ii\b|venda\s*de\s*mercadorias\s*industrializadas|ind[uú]stria/.test(
      t,
    )
  )
    return { setor: "industria", anexo: "II" };
  if (/anexo\s*i\b|revenda\s*de\s*mercadorias|com[eé]rcio/.test(t))
    return { setor: "comercio", anexo: "I" };
  return null;
}
export function formatCNPJDisplay(digits) {
  if (!digits || digits.length !== 14) return digits || "—";
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

function extractCNPJFromText(text) {
  const matches = (text || "").match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g);
  if (!matches) return null;
  for (const m of matches) {
    const digits = m.replace(/\D/g, "");
    if (digits.length === 14) return digits;
  }
  return null;
}
export function extractRazaoSocial(text) {
  // A missing value must never consume the next field label in a PDF.
  const labels =
    /\b(?:nome empresarial|raz[aã]o social|benefici[aá]rio(?: final)?|nome fantasia|t[ií]tulo do estabelecimento|porte|natureza jur[ií]dica|situa[cç][aã]o cadastral|data de abertura|cnpj|c[oó]digo e descri[cç][aã]o|munic[ií]pio|endere[cç]o|logradouro|capital social|quadro de s[oó]cios|uf)(?:\s*:|\s*$)/i;
  const fields =
    /(?:NOME EMPRESARIAL|RAZ[AÃ]O SOCIAL)[ \t:–—-]*(?:\r?\n[ \t]*)?([^\r\n]*)/gi;
  for (const match of (text || "").matchAll(fields)) {
    let candidate = match[1].trim();
    const nextLabel = labels.exec(candidate);
    if (nextLabel) candidate = candidate.slice(0, nextLabel.index).trim();
    candidate = candidate.replace(/[ \t]+/g, " ");
    if (
      /^(?:n[aã]o informado|n[aã]o consta|n[aã]o se aplica)$/i.test(
        candidate,
      ) ||
      candidate.length < 2 ||
      candidate.length > 200 ||
      !/[a-zÀ-ÿ]/i.test(candidate) ||
      /^[-–—:.]+$/.test(candidate)
    )
      continue;
    return candidate;
  }
  return null;
}
function extractCNAEFromCartao(text) {
  const match =
    /(?:CNAE|ATIVIDADE ECON[ÔO]MICA PRINCIPAL)[^\d]{0,80}(\d{2}\.?\d{2}-?\d[-\/]?\d{2})/i.exec(
      text,
    );
  return match ? match[1] : null;
}
function extractMunicipioUF(text) {
  const mm = /MUNIC[IÍ]PIO[:\s\-]{1,10}([^\r\n]{3,40})/i.exec(text);
  const uf = /\bUF[:\s\-]{1,5}([A-Z]{2})\b/.exec(text);
  if (mm && uf) return `${mm[1].trim()} - ${uf[1]}`;
  if (mm) return mm[1].trim();
  if (uf) return uf[1];
  return null;
}

function extractCompetenciaXML(doc) {
  const el =
    doc.querySelector("ide > dhEmi") || doc.querySelector("ide > dEmi");
  if (!el) return null;
  const m = /^(\d{4})-(\d{2})/.exec(el.textContent.trim());
  return m ? `${m[1]}-${m[2]}` : null;
}

function extractCompetenciaFromText(text, filename) {
  const src1 = filename || "",
    src2 = text || "";
  let m = /(\d{2})\/(20\d{2})/.exec(src2) || /(\d{2})\/(20\d{2})/.exec(src1);
  if (m) return `${m[2]}-${m[1]}`;
  m =
    /(20\d{2})[-_]?(0[1-9]|1[0-2])\b/.exec(src1) ||
    /(20\d{2})[-_]?(0[1-9]|1[0-2])\b/.exec(src2);
  if (m) return `${m[1]}-${m[2]}`;
  return null;
}

export function parseNFeXML(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  if (doc.querySelector("parsererror")) return null;
  const isNFe =
    doc.querySelector("infNFe") ||
    doc.querySelector("NFe") ||
    doc.querySelector("ide");
  if (!isNFe) return null;

  const modEl = doc.querySelector("ide > mod");
  const mod = modEl ? modEl.textContent.trim() : null;
  const vNFEl =
    doc.querySelector("total > ICMSTot > vNF") ||
    doc.querySelector("ICMSTot > vNF") ||
    doc.querySelector("vNF");
  const vNF = vNFEl ? parseFloat(vNFEl.textContent) : 0;
  const emitCNPJEl = doc.querySelector("emit > CNPJ");
  const emitCNPJ = emitCNPJEl ? emitCNPJEl.textContent.trim() : null;
  const destCNPJEl = doc.querySelector("dest > CNPJ");
  const destCNPJ = destCNPJEl ? destCNPJEl.textContent.trim() : null;
  const destCPFEl = doc.querySelector("dest > CPF");
  const crtEl = doc.querySelector("emit > CRT");
  const crt = crtEl ? crtEl.textContent.trim() : null;
  const ufEmitEl =
    doc.querySelector("emit > enderEmit > UF") ||
    doc.querySelector("enderEmit > UF");
  const ufEmit = ufEmitEl ? ufEmitEl.textContent.trim().toUpperCase() : null;

  const detEls = Array.from(doc.querySelectorAll("det"));
  const porCategoria = { conferir: 0, cesta: 0, reduzido60: 0, padrao: 0 };
  const itensNCM = [];
  let cClassTribAmostra = null;
  let temInsumoIndustrial = false;
  const CFOP_INDUSTRIAIS = new Set([
    "1101",
    "2101",
    "1124",
    "2124",
    "1253",
    "2253",
    "1102",
    "2102",
    "1551",
    "2551",
  ]);
  detEls.forEach((det) => {
    const prod = det.querySelector("prod");
    if (!prod) return;
    const ncmEl = prod.querySelector("NCM");
    const xProdEl = prod.querySelector("xProd");
    const vProdEl = prod.querySelector("vProd");
    const cfopEl = prod.querySelector("CFOP");
    const vProd = vProdEl ? parseFloat(vProdEl.textContent) || 0 : 0;
    const ncm = ncmEl ? ncmEl.textContent.trim() : null;
    const cat = classifyNCM(ncm);
    porCategoria[cat] += vProd;
    itensNCM.push({
      ncm,
      descricao: xProdEl ? xProdEl.textContent.trim() : null,
      vProd,
      categoria: cat,
    });
    if (cfopEl && CFOP_INDUSTRIAIS.has(cfopEl.textContent.trim()))
      temInsumoIndustrial = true;
    if (!cClassTribAmostra) {
      const cct = det.querySelector("cClassTrib");
      if (cct && cct.textContent.trim())
        cClassTribAmostra = cct.textContent.trim();
    }
  });

  const competencia = extractCompetenciaXML(doc);
  const chave = (doc.querySelector("infNFe")?.getAttribute("Id") || "").replace(
    /^NFe/,
    "",
  );
  const finalidade = doc.querySelector("ide > finNFe")?.textContent;
  const status = doc.querySelector("protNFe cStat")?.textContent;
  if (
    (finalidade && finalidade !== "1") ||
    (status && status !== "100" && status !== "150")
  )
    return null;
  return {
    chave,
    mod,
    vNF: vNF || 0,
    emitCNPJ,
    destCNPJ,
    destCPF: destCPFEl ? destCPFEl.textContent.trim() : null,
    crt,
    ufEmit,
    porCategoria,
    itensNCM,
    cClassTribAmostra,
    competencia,
    temInsumoIndustrial,
  };
}

export async function parseFileRaw(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const base = {
    id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    size: file.size,
    ext,
  };
  try {
    if (ext === "xml") {
      const text = await readFileAsText(file);
      const parsed = parseNFeXML(text);
      if (!parsed)
        return {
          ...base,
          parseStatus: "erro",
          parseBadgeBase:
            "XML inválido, não autorizado ou operação especial (devolução/ajuste/complemento). Confira manualmente",
        };
      return {
        ...base,
        ...parsed,
        ownCNPJ: parsed.emitCNPJ,
        parseStatus: "ok",
        parseBadgeBase: "",
      };
    }
    if (ext === "txt" || ext === "pdf") {
      const text =
        ext === "txt"
          ? await file.text()
          : await (await import("./pdf.js")).readPDF(file);
      const support = parseSupportDocument(text);
      if (support) return { ...base, ...support };
      const lower = text.toLowerCase();
      const nameLower = file.name.toLowerCase();
      const cnae = extractCNAE(text);
      const competencia = extractCompetenciaFromText(text, file.name);
      const compNote = competencia
        ? ` · competência ${formatCompetencia(competencia)}`
        : "";
      const ownCNPJ = extractCNPJFromText(text);

      const looksCartao =
        /cart[aã]o\s*cnpj|comprovante\s*de\s*inscri[cç][aã]o|situa[cç][aã]o\s*cadastral/i.test(
          lower,
        ) || /cart[aã]o[ _-]?cnpj/i.test(nameLower);
      const looksPgdas =
        !looksCartao &&
        (/pgdas|rbt\s*-?\s*12|simples\s*nacional/i.test(lower) ||
          /pgdas|das/i.test(nameLower));
      const looksFolha =
        !looksCartao &&
        (/folha\s*(de\s*)?pagamento|pr[oó]-?labore|esocial|dctfweb|inss/i.test(
          lower,
        ) ||
          /folha|esocial|dctf/i.test(nameLower));

      if (looksCartao) {
        const razaoSocialDetectada = extractRazaoSocial(text);
        const cnaeDetectado = extractCNAEFromCartao(text);
        const municipioUFDetectado = extractMunicipioUF(text);
        return {
          ...base,
          tipo: "cartao_cnpj",
          competencia,
          ownCNPJ,
          dados: {},
          razaoSocialDetectada,
          cnaeDetectado,
          municipioUFDetectado,
          parseStatus: ownCNPJ ? "ok" : "estimado",
          parseBadgeBase: `Cartão CNPJ identificado${razaoSocialDetectada ? " · razão social extraída" : ""}${cnaeDetectado ? " · CNAE extraído" : ""}${municipioUFDetectado ? " · município/UF extraído" : ""}${compNote}`,
        };
      }
      if (looksPgdas) {
        const rbt12 = numberNear(
          text,
          new RegExp(`RBT[\\s-]*12[^\\d]{0,20}${NUM}`, "i"),
        );
        const faturamento = numberNear(
          text,
          new RegExp(`(receita\\s*bruta|faturamento)[^\\d]{0,25}${NUM}`, "i"),
        );
        const anexoDetectado = detectAnexoPGDAS(text);
        const anexoNote = anexoDetectado
          ? ` · Anexo ${anexoDetectado.anexo} identificado`
          : "";
        return {
          ...base,
          tipo: "pgdas",
          competencia,
          ownCNPJ,
          dados: { rbt12, faturamento, cnae },
          anexoDetectado,
          parseStatus: rbt12 || faturamento ? "ok" : "estimado",
          parseBadgeBase:
            rbt12 || faturamento
              ? `PGDAS-D processado${rbt12 ? " · RBT12 extraído" : ""}${faturamento ? " · faturamento extraído" : ""}${cnae ? " · CNAE identificado" : ""}${anexoNote}${compNote}`
              : `PGDAS-D identificado · valores não localizados no texto (estimados — confira manualmente)${anexoNote}${compNote}`,
        };
      }
      if (looksFolha) {
        const folha = numberNear(
          text,
          new RegExp(
            `(total\\s*(da\\s*)?folha|folha\\s*bruta|folha\\s*(de\\s*)?pagamento)[^\\d]{0,25}${NUM}`,
            "i",
          ),
        );
        const proLabore = numberNear(
          text,
          new RegExp(`pr[oó]-?labore[^\\d]{0,20}${NUM}`, "i"),
        );
        return {
          ...base,
          tipo: "folha",
          competencia,
          ownCNPJ,
          dados: { folha, proLabore, cnae },
          parseStatus: folha || proLabore ? "ok" : "estimado",
          parseBadgeBase:
            folha || proLabore
              ? `Folha de Pagamento identificada${folha ? " · total bruto extraído" : ""}${proLabore ? " · pró-labore extraído" : ""}${compNote}`
              : `Folha de Pagamento identificada · valores não localizados no texto (estimados — confira manualmente)${compNote}`,
        };
      }
      return {
        ...base,
        tipo: "desconhecido",
        competencia,
        ownCNPJ,
        dados: { cnae },
        parseStatus: "estimado",
        parseBadgeBase:
          ext === "pdf"
            ? "PDF processado localmente, sem padrão reconhecido — modo estimativa (ajuste os campos manualmente)"
            : "Arquivo de texto sem padrão reconhecido — modo estimativa (ajuste os campos manualmente)",
      };
    }
    return {
      ...base,
      parseStatus: "erro",
      parseBadgeBase: "Formato não suportado (aceitos: .xml, .pdf, .txt)",
    };
  } catch (e) {
    return {
      ...base,
      parseStatus: "erro",
      parseBadgeBase: "Falha ao processar o arquivo",
    };
  }
}

/** @returns {import('../shared/schema').DiagnosticState['documentos'][number]} */
export function finalizeFile(r, master, isMasterSource) {
  const rec = {
    id: r.id,
    chave: r.chave || null,
    hash: r.hash,
    name: r.name,
    size: r.size,
    ext: r.ext,
    competencia: r.competencia || null,
  };
  if (r.parseStatus === "erro") {
    rec.status = "erro";
    rec.tipo = "erro";
    rec.badge = r.parseBadgeBase;
    rec.dados = {};
    return rec;
  }

  if (r.ext === "xml") {
    if (!master) {
      rec.status = "estimado";
      rec.tipo = "desconhecido";
      rec.dados = {};
      rec.badge =
        "XML lido, mas o CNPJ mestre ainda não foi definido — envie um Cartão CNPJ, PGDAS-D, ou informe o CNPJ manualmente.";
      return rec;
    }
    const cctNote = r.cClassTribAmostra
      ? ` · cClassTrib: ${r.cClassTribAmostra}`
      : "";
    const compNote = r.competencia
      ? ` · competência ${formatCompetencia(r.competencia)}`
      : "";
    if (r.emitCNPJ === master) {
      const ufNote = r.ufEmit ? ` · UF ${r.ufEmit}` : "";
      if (r.mod === "65") {
        rec.status = "ok";
        rec.tipo = "nfce_saida";
        rec.badge = `Aprovado: vinculado com sucesso à empresa · NFC-e (mod. 65) · Saída B2C identificada${cctNote}${compNote}${ufNote}`;
        rec.dados = {
          vNF: r.vNF,
          isB2B: false,
          porCategoria: r.porCategoria,
          ufEmit: r.ufEmit,
          itensNCM: r.itensNCM,
        };
      } else {
        const isB2B = !!r.destCNPJ;
        rec.status = "ok";
        rec.tipo = "nfe_saida";
        rec.badge = `Aprovado: vinculado com sucesso à empresa · XML Saída lido (${isB2B ? "B2B — CNPJ dest." : "B2C — CPF/consumidor"})${cctNote}${compNote}${ufNote}`;
        rec.dados = {
          vNF: r.vNF,
          isB2B,
          porCategoria: r.porCategoria,
          ufEmit: r.ufEmit,
          itensNCM: r.itensNCM,
        };
      }
    } else if (r.destCNPJ === master) {
      const credito = r.crt === "3";
      const insumoNote = r.temInsumoIndustrial
        ? " · insumo industrial identificado (CFOP)"
        : "";
      rec.status = "ok";
      rec.tipo = "nfe_entrada";
      rec.badge = `Aprovado: vinculado com sucesso à empresa · XML Entrada lido (fornecedor ${credito ? "Regime Normal — gera crédito de CBS" : "Simples Nacional — sem crédito pleno"})${insumoNote}${compNote}`;
      rec.dados = { vNF: r.vNF, credito };
    } else {
      const divergente = r.emitCNPJ || r.destCNPJ || null;
      rec.status = "rejeitado";
      rec.tipo = "rejeitado";
      rec.dados = {};
      rec.badge = divergente
        ? `REJEITADO: o arquivo "${r.name}" pertence ao CNPJ ${formatCNPJDisplay(divergente)}, incompatível com a empresa em análise (${formatCNPJDisplay(master)}). O arquivo foi descartado e não compõe o cálculo.`
        : `REJEITADO: não foi possível identificar o CNPJ do arquivo "${r.name}" para validação cruzada. O arquivo foi descartado por segurança.`;
    }
    return rec;
  }

  if (SUPPORT_TYPES.has(r.tipo) && (!master || !r.ownCNPJ)) {
    rec.status = "estimado";
    rec.tipo = r.tipo;
    rec.dados = r.dados;
    rec.badge = r.parseBadgeBase;
    return rec;
  }
  if (!master || !r.ownCNPJ || r.ownCNPJ !== master) {
    rec.status = "rejeitado";
    rec.tipo = "rejeitado";
    rec.dados = {};
    rec.badge = `REJEITADO: o arquivo "${r.name}" pertence ao CNPJ ${formatCNPJDisplay(r.ownCNPJ)}, incompatível com a empresa em análise (${formatCNPJDisplay(master)}). O arquivo foi descartado e não compõe o cálculo.`;
    return rec;
  }
  rec.status = r.parseStatus;
  rec.tipo = r.tipo;
  rec.dados = r.dados;
  rec.anexoDetectado = r.anexoDetectado || null;
  const prefix = isMasterSource
    ? "CNPJ mestre definido a partir deste documento · "
    : r.ownCNPJ
      ? "Aprovado: vinculado com sucesso à empresa · "
      : "";
  const unverified =
    !r.ownCNPJ && master
      ? " · CNPJ não localizado no documento — validação cruzada não aplicada"
      : "";
  rec.badge = prefix + r.parseBadgeBase + unverified;
  return rec;
}
