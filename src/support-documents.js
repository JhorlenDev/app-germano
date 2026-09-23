// Supporting documents identify the account holder/payer, never a payee.
// Their cash movements are not inputs to the fiscal calculation engine.
export const SUPPORT_TYPES = new Set([
  "comprovante_bancario",
  "comprovante_arrecadacao",
  "extrato_bancario",
  "extrato_adquirente",
]);
const CNPJ = String.raw`(?:0?\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14})`;
const normalizeCNPJ = (value) => value.replace(/\D/g, "").slice(-14);
const clean = (value) => value?.replace(/\s+/g, " ").trim() || null;
function identity(candidates) {
  const ids = [...new Set(candidates.map((c) => c.cnpj).filter(Boolean))];
  if (ids.length !== 1)
    return {
      ownCNPJ: null,
      razaoSocialDetectada: null,
      ambiguous: ids.length > 1,
    };
  return {
    ownCNPJ: ids[0],
    razaoSocialDetectada: clean(
      candidates.find((c) => c.cnpj === ids[0] && c.name)?.name,
    ),
    ambiguous: false,
  };
}
function statementMonth(text) {
  const period =
    /(?:Entre|Data da venda[: ]*)\s*(\d{2})\/(\d{2})\/(\d{4})\s*(?:e|à|a)\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(
      text,
    );
  if (period)
    return period[2] === period[5] && period[3] === period[6]
      ? `${period[3]}-${period[2]}`
      : null;
  const month =
    /M[eê]s:\s*(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\/(\d{4})/i.exec(
      text,
    );
  if (month)
    return `${month[2]}-${String(["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"].indexOf(month[1].toLowerCase()) + 1).padStart(2, "0")}`;
  return null;
}
export function parseSupportDocument(text) {
  const isRevenueReceipt =
    /comprovante de arrecada[cç][aã]o/i.test(text) &&
    /receita federal/i.test(text);
  const isBankReceipt =
    /comprovante (?:de transa[cç][aã]o banc[aá]ria|de pagamento de boleto)/i.test(
      text,
    );
  const isCardStatement = /detalhado de vendas cielo/i.test(text);
  const isBankStatement =
    /extrato (?:mensal\s*\/\s*por per[ií]odo|por per[ií]odo)/i.test(text) &&
    /(?:conta|cr[eé]dito|d[eé]bito|saldo)/i.test(text);
  if (
    !isRevenueReceipt &&
    !isBankReceipt &&
    !isCardStatement &&
    !isBankStatement
  )
    return null;
  const candidates = [];
  let tipo, label;
  if (isRevenueReceipt) {
    tipo = "comprovante_arrecadacao";
    label = "Comprovante de arrecadação";
    for (const m of text.matchAll(
      new RegExp(
        `CNPJ[ \\t]+Raz[aã]o Social\\s*\\n\\s*(${CNPJ})[ \\t]+([^\\n]+)`,
        "gi",
      ),
    ))
      candidates.push({ cnpj: normalizeCNPJ(m[1]), name: m[2] });
  } else if (isBankReceipt || isBankStatement) {
    tipo = isBankReceipt ? "comprovante_bancario" : "extrato_bancario";
    label = isBankReceipt ? "Comprovante bancário" : "Extrato bancário";
    for (const m of text.matchAll(
      new RegExp(`^([^\\n|]+)\\s*\\|\\s*CNPJ:\\s*(${CNPJ})`, "gim"),
    ))
      candidates.push({
        cnpj: normalizeCNPJ(m[2]),
        name: m[1].replace(/^Empresa:\s*/i, ""),
      });
    // Caixa: only the payer block; the beneficiary's CNPJ belongs to another company.
    for (const block of text.matchAll(
      /Pagador (?:Final\s*\/\s*Efetivo|Final\s*-\s*Correntista|Sacado)\s*\n([\s\S]{0,500}?)(?=\n(?:Conta de d[eé]bito|Data do|Pagador |Hist[oó]rico|Benefici[aá]rio)|$)/gi,
    )) {
      const cnpj = new RegExp(`CPF/CNPJ:\\s*(${CNPJ})`, "i").exec(block[1]);
      const name = /^Nome(?:\/Raz[aã]o Social)?:[ \t]*([^\n]+)/im.exec(
        block[1],
      );
      if (cnpj)
        candidates.push({ cnpj: normalizeCNPJ(cnpj[1]), name: name?.[1] });
    }
  } else {
    tipo = "extrato_adquirente";
    label = "Relatório de vendas Cielo";
    for (const m of text.matchAll(new RegExp(`CPF/CNPJ:\\s*(${CNPJ})`, "gi")))
      candidates.push({ cnpj: normalizeCNPJ(m[1]), name: null });
  }
  const company = identity(candidates);
  // Caixa statements without CNPJ cannot be associated solely by the printed name.
  const printedName = isBankStatement
    ? clean(/^Cliente:[ \t]*([^\n]+)/im.exec(text)?.[1])
    : null;
  const competencia =
    isBankStatement || isCardStatement ? statementMonth(text) : null;
  const dados = {};
  let summary = "";
  if (isCardStatement) {
    const section =
      /Totalizador([\s\S]*?)Lista de vendas/i.exec(text)?.[1] || "";
    const values = [...section.matchAll(/-?R\$\s*([\d.]+,\d{2})/g)].map((m) =>
      Number(m[1].replace(/\./g, "").replace(",", ".")),
    );
    if (values.length === 3 && values.every(Number.isFinite)) {
      [dados.valorBruto, dados.taxas, dados.valorLiquido] = values;
      const brl = (n) =>
        n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      summary = ` · vendas brutas ${brl(values[0])} · taxas ${brl(values[1])} · líquido ${brl(values[2])}`;
    }
  }
  return {
    tipo,
    ...company,
    razaoSocialDetectada: company.razaoSocialDetectada || printedName,
    competencia,
    dados,
    parseStatus: "estimado",
    parseBadgeBase: `${label} identificado${summary}. Documento de apoio; não altera os valores da simulação.${company.ambiguous ? " Mais de um CNPJ de titular identificado." : ""}${!company.ownCNPJ ? " CNPJ do titular não identificado; vínculo automático indisponível." : ""}`,
  };
}
