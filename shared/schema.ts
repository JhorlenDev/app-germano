import { z } from "zod";
const amount = z.number().finite().min(0).max(1e12);
const pct = z.number().finite().min(0).max(100);
export const monthSchema = z.object({
  competencia: z.string().regex(/^$|^\d{4}-(0[1-9]|1[0-2])$/),
  faturamento: amount,
  compras: amount,
  comprasCredito: amount,
  folha: amount,
  proLabore: amount,
  icmsCredito: amount,
});
export const documentSchema = z.object({
  id: z.string().max(200),
  hash: z.string().max(64),
  chave: z.string().max(44).nullable().optional(),
  name: z.string().max(255),
  size: amount,
  ext: z.enum(["xml", "pdf", "txt"]),
  competencia: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .nullable(),
  status: z.enum(["ok", "estimado", "erro", "rejeitado"]),
  tipo: z.string().max(40),
  badge: z.string().max(1500),
  anexoDetectado: z
    .object({
      setor: z.enum(["comercio", "industria", "servicos"]),
      anexo: z.enum(["I", "II", "III", "IV", "V"]),
    })
    .nullable()
    .optional(),
  dados: z
    .object({
      vNF: amount.optional(),
      valorBruto: amount.optional(),
      taxas: amount.optional(),
      valorLiquido: amount.optional(),
      isB2B: z.boolean().optional(),
      credito: z.boolean().optional(),
      faturamento: amount.nullable().optional(),
      rbt12: amount.nullable().optional(),
      folha: amount.nullable().optional(),
      proLabore: amount.nullable().optional(),
      cnae: z.string().max(30).nullable().optional(),
      ufEmit: z.string().length(2).nullable().optional(),
      porCategoria: z
        .object({
          conferir: amount.optional(),
          cesta: amount,
          reduzido60: amount,
          padrao: amount,
        })
        .optional(),
      itensNCM: z
        .array(
          z.object({
            ncm: z.string().nullable(),
            descricao: z.string().nullable(),
            vProd: amount,
            categoria: z.string(),
          }),
        )
        .optional(),
    })
    .default({}),
});
export const stateSchema = z
  .object({
    razaoSocial: z.string().trim().max(200),
    cnpj: z.string().regex(/^\d{14}$/, "Informe os 14 dígitos do CNPJ."),
    setor: z.enum(["comercio", "industria", "servicos"]),
    uf: z.string().length(2),
    municipioUF: z.string().max(120),
    cnae: z.string().max(30).default(""),
    faturamentoMensal: amount,
    rbt12: amount,
    comprasMensais: amount,
    comprasCredito: amount,
    folhaMensal: amount,
    proLabore: amount,
    fs12: amount.nullable(),
    anexoServicosForcado: z.enum(["III", "IV", "V", "auto"]),
    aliquotaEstMun: pct,
    icmsCredito: amount,
    rat: z.number().min(0).max(6),
    terceiros: pct,
    cbs: pct,
    ibs: pct,
    cestaPct: pct,
    reduzido60Pct: pct,
    reducaoServicos: z.union([z.literal(0), z.literal(30), z.literal(60)]),
    aliquotaPersonalizada: pct.nullable(),
    competencia: z.string().regex(/^$|^\d{4}-(0[1-9]|1[0-2])$/),
    notas: z.string().max(10000),
    historico: z.array(monthSchema).max(120),
    documentos: z.array(documentSchema).max(2000),
  })
  .superRefine((d, ctx) => {
    for (const [index, month] of d.historico.entries()) {
      if (month.comprasCredito > month.compras)
        ctx.addIssue({
          code: "custom",
          message: "Compras elegíveis do histórico excedem as compras totais.",
          path: ["historico", index, "comprasCredito"],
        });
    }
    if (d.cestaPct + d.reduzido60Pct > 100)
      ctx.addIssue({
        code: "custom",
        message: "Benefícios não podem somar mais de 100%.",
        path: ["cestaPct"],
      });
    if (d.comprasCredito > d.comprasMensais)
      ctx.addIssue({
        code: "custom",
        message: "Compras elegíveis não podem exceder as compras totais.",
        path: ["comprasCredito"],
      });
    if (
      new Set(
        d.historico.filter((m) => m.competencia).map((m) => m.competencia),
      ).size !== d.historico.filter((m) => m.competencia).length
    )
      ctx.addIssue({
        code: "custom",
        message: "Existem competências duplicadas no histórico.",
        path: ["historico"],
      });
  });
export type DiagnosticState = z.infer<typeof stateSchema>;
