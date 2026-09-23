import { SUPPORT_TYPES } from "./support-documents.js";
import { finalizeFile } from "./parsers.js";
import { mergeDocuments } from "../shared/engine.js";
import { aggregateFiles, aggregateHistorico } from "../shared/html-import.js";

// Same master-CNPJ priority as the original HTML, independent of file order.
export function importDocuments(state, raws) {
  const existing = (state.cnpj || "").replace(/\D/g, "");
  const source =
    existing.length === 14
      ? null
      : raws.find(
          (r) =>
            r.tipo === "cartao_cnpj" && r.ownCNPJ && r.parseStatus !== "erro",
        ) ||
        raws.find(
          (r) => r.tipo === "pgdas" && r.ownCNPJ && r.parseStatus !== "erro",
        ) ||
        raws.find(
          (r) => r.ext === "xml" && r.ownCNPJ && r.parseStatus !== "erro",
        ) ||
        raws.find(
          (r) =>
            SUPPORT_TYPES.has(r.tipo) && r.ownCNPJ && r.parseStatus !== "erro",
        );
  const master = existing.length === 14 ? existing : source?.ownCNPJ || "";
  /** @type {Partial<import('../shared/schema').DiagnosticState>} */
  const patch = {};
  if (master) patch.cnpj = master;
  const identity =
    raws.find(
      (r) =>
        r.tipo === "cartao_cnpj" &&
        r.ownCNPJ === master &&
        r.parseStatus !== "erro",
    ) ||
    raws.find(
      (r) =>
        SUPPORT_TYPES.has(r.tipo) &&
        r.ownCNPJ === master &&
        r.razaoSocialDetectada,
    ) ||
    source;
  if (identity?.cnaeDetectado) patch.cnae = identity.cnaeDetectado;
  if (identity?.razaoSocialDetectada)
    patch.razaoSocial = identity.razaoSocialDetectada;
  if (identity?.municipioUFDetectado) {
    patch.municipioUF = identity.municipioUFDetectado;
    const uf = /\b([A-Z]{2})$/.exec(identity.municipioUFDetectado);
    if (uf) patch.uf = uf[1];
  }
  const finalized = raws.map((r) =>
    finalizeFile(r, master, r.id === source?.id),
  );
  // Re-uploading the same support PDF refreshes its previous misclassification.
  let reprocessed = 0;
  const refreshed = state.documentos.map((document) => {
    const replacement = finalized.find(
      (file) =>
        file.hash &&
        file.hash === document.hash &&
        SUPPORT_TYPES.has(file.tipo),
    );
    if (!replacement) return document;
    reprocessed++;
    return { ...replacement, id: document.id };
  });
  const { merged, duplicates } = mergeDocuments(refreshed, finalized);
  patch.documentos = merged;
  // Preserve the HTML's automatic aggregate; the simulation date stays user-owned.
  const fiscalDocuments = merged.filter((f) => !SUPPORT_TYPES.has(f.tipo));
  const agg = aggregateFiles(fiscalDocuments);
  if (agg.faturamentoSaida > 0)
    patch.faturamentoMensal = Math.round(agg.faturamentoSaida);
  if (agg.comprasEntrada > 0) {
    patch.comprasMensais = Math.round(agg.comprasEntrada);
    patch.comprasCredito = Math.round(agg.comprasComCredito);
  }
  if (agg.rbt12) patch.rbt12 = Math.round(agg.rbt12);
  if (agg.temFolha) {
    if (agg.folha) patch.folhaMensal = Math.round(agg.folha);
    if (agg.proLabore) patch.proLabore = Math.round(agg.proLabore);
  }
  const total =
    agg.comercioCategorias.cesta +
    agg.comercioCategorias.reduzido60 +
    agg.comercioCategorias.padrao;
  if (state.setor === "comercio" && total > 0) {
    patch.cestaPct = Math.round((agg.comercioCategorias.cesta / total) * 100);
    patch.reduzido60Pct = Math.round(
      (agg.comercioCategorias.reduzido60 / total) * 100,
    );
  }
  if (agg.cnaeDetectado) patch.cnae = agg.cnaeDetectado;
  if (agg.ufDetectada) {
    patch.uf = agg.ufDetectada;
    if (state.setor !== "servicos" && agg.ufDetectada === "AM")
      patch.aliquotaEstMun = 20;
  }
  if (agg.anexoDetectado) {
    patch.setor = agg.anexoDetectado.setor;
    patch.anexoServicosForcado =
      agg.anexoDetectado.setor === "servicos"
        ? agg.anexoDetectado.anexo
        : "auto";
  }
  const history = aggregateHistorico(fiscalDocuments);
  if (history.competencias.length) {
    patch.historico = [
      ...state.historico.filter(
        (m) => !history.competencias.includes(m.competencia),
      ),
      ...history.competencias.map((comp, i) => {
        const month = history.porMes[i];
        const docs = fiscalDocuments.filter(
          (f) =>
            f.competencia === comp &&
            f.status !== "erro" &&
            f.status !== "rejeitado",
        );
        const proLabore = docs
          .filter((f) => f.tipo === "folha")
          .reduce((sum, f) => sum + (f.dados.proLabore || 0), 0);
        return {
          competencia: comp,
          faturamento: month.faturamento,
          compras: docs
            .filter((f) => f.tipo === "nfe_entrada")
            .reduce((sum, f) => sum + (f.dados.vNF || 0), 0),
          comprasCredito: month.comprasRegimeNormal,
          folha: month.folha - proLabore,
          proLabore,
          icmsCredito:
            state.historico.find((m) => m.competencia === comp)?.icmsCredito ||
            0,
        };
      }),
    ].sort((a, b) => a.competencia.localeCompare(b.competencia));
  }
  return { patch, duplicates, reprocessed, master };
}
