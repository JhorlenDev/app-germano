function UploadModule({ setor, d, onApply, onLoadExample }) {
  const [arquivos, setArquivos] = useState(d.documentosImportados || []);
  const [period, setPeriod] = useState(d.competenciaImportacao || "");
  const [months, setMonths] = useState(d.competenciasImportacao || null);
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 });
  const [dragActive, setDragActive] = useState(false);
  const [aba, setAba] = useState("validos");
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(50);
  const inputRef = useRef(null),
    skipNextAggRef = useRef(Boolean(d.documentosImportados?.length)),
    alive = useRef(true),
    busy = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const allPeriods = useMemo(
    () => window.gmImport.periods(arquivos),
    [arquivos],
  );
  const activePeriod = period || allPeriods.at(-1) || "";
  const selectedMonths = useMemo(
    () =>
      months === null
        ? allPeriods.slice(-6)
        : months.filter((m) => allPeriods.includes(m)),
    [months, allPeriods],
  );
  const agg = useMemo(
    () => window.gmImport.aggregate(arquivos, activePeriod, aggregateFiles),
    [arquivos, activePeriod],
  );
  const hasResults = arquivos.some((f) => f.status === "ok");
  const validos = arquivos.filter((f) => f.status !== "rejeitado");
  const rejeitados = arquivos.filter((f) => f.status === "rejeitado");
  const handleFiles = async (fileList) => {
    if (busy.current) return;
    const files = Array.from(fileList);
    if (!files.length) return;
    busy.current = true;
    setProcessando(true);
    setMessage("");
    try {
      const result = await window.gmImport.ingest(
        files,
        arquivos,
        { parseXML: parseNFeXML, detectAnexo: detectAnexoPGDAS },
        (stats) => {
          if (alive.current)
            setProgresso({ atual: stats.processed, total: stats.processed });
        },
        () => !alive.current,
      );
      if (!alive.current) return;
      if (!result.raws.length) {
        setMessage(
          `${result.stats.processed} arquivos lidos · ${result.stats.duplicates} repetidos ignorados · nenhum documento novo.`,
        );
        return;
      }
      const existing = (d.cnpj || "").replace(/\D/g, "");
      const source =
        result.raws.find(
          (r) =>
            r.tipo === "cartao_cnpj" && r.ownCNPJ && r.parseStatus === "ok",
        ) ||
        result.raws.find(
          (r) => r.tipo === "pgdas" && r.ownCNPJ && r.parseStatus === "ok",
        );
      const master = existing.length === 14 ? existing : source?.ownCNPJ || "";
      const finalizados = result.raws.map((r) =>
        window.gmImport.finalize(r, master, r.id === source?.id, finalizeFile),
      );
      const merged = [
        ...arquivos.map((r) =>
          r.pendingRaw && master
            ? window.gmImport.finalize(
                r.pendingRaw,
                master,
                false,
                finalizeFile,
              )
            : r,
        ),
        ...finalizados,
      ];
      const canceled = window.gmImport.canceledKeys(merged);
      const prepared = merged.map((r) =>
        r.key && canceled.has(r.key)
          ? {
              ...r,
              status: "rejeitado",
              badge:
                "Nota cancelada/rejeitada na conferência fiscal. Não compõe os totais.",
            }
          : r,
      );
      setArquivos(prepared);
      const identity =
        result.raws.find(
          (r) =>
            r.tipo === "cartao_cnpj" &&
            r.ownCNPJ === master &&
            r.parseStatus === "ok",
        ) || source;
      const patch = {};
      if (master) {
        patch.cnpj = formatCNPJDisplay(master);
        patch.cnpjMestreLocked = true;
      }
      if (identity?.razaoSocialDetectada)
        patch.razaoSocial = identity.razaoSocialDetectada;
      if (identity?.municipioUFDetectado) {
        patch.municipioUF = identity.municipioUFDetectado;
        patch.uf = identity.municipioUFDetectado.slice(-2);
      }
      if (identity?.cnaeDetectado)
        patch.beneficios = {
          servicos: {
            cnae: identity.cnaeDetectado,
            categoria: classifyCNAE(identity.cnaeDetectado),
          },
        };
      if (Object.keys(patch).length) onApply(patch);
      setMessage(
        `${result.stats.processed} arquivos lidos · ${result.stats.duplicates} repetidos ignorados · ${result.stats.duplicateArchives} ZIPs repetidos ignorados · ${result.stats.ignored} arquivos de outros formatos ignorados.${master ? "" : " Envie o Cartão CNPJ ou informe o CNPJ da empresa para validar as notas."}`,
      );
    } catch (error) {
      if (alive.current)
        setMessage(`Importação não concluída: ${error.message}`);
    } finally {
      busy.current = false;
      if (alive.current) setProcessando(false);
    }
  };
  useEffect(() => {
    if (skipNextAggRef.current) {
      skipNextAggRef.current = false;
      return;
    }
    if (!arquivos.length) {
      if (d.documentosImportados?.length)
        onApply({
          documentosImportados: [],
          competenciaImportacao: "",
          competenciasImportacao: [],
          faturamentoMensal: 0,
          rbt12: 0,
          comprasMensais: 0,
          folhaMensal: 0,
          proLabore: 0,
          ncmDetalhado: [],
          historicoCompetencias: Array(6).fill(null),
          historico: Array.from({ length: 6 }, () => ({
            faturamento: 0,
            comprasRegimeNormal: 0,
            folha: 0,
          })),
        });
      return;
    }
    const patch = {
      documentosImportados: arquivos,
      competenciaImportacao: activePeriod,
      competenciasImportacao: selectedMonths,
      importacaoAvisos: [
        ...agg.warnings,
        ...(arquivos.some((r) => r.status === "estimado" || r.status === "erro")
          ? [
              "Existem documentos pendentes de conferência ou com erro, não incluídos automaticamente.",
            ]
          : []),
        ...(selectedMonths.some(
          (c) =>
            !window.gmImport.aggregate(arquivos, c, aggregateFiles).temFolha,
        )
          ? ["O histórico contém competências sem folha de pagamento."]
          : []),
      ],
    };
    if (activePeriod) {
      Object.assign(patch, {
        faturamentoMensal: agg.faturamentoSaida,
        rbt12: agg.rbt12 || 0,
        comprasMensais: agg.comprasEntrada,
        pctFornecedorRegimeNormal: agg.comprasEntrada
          ? (100 * agg.comprasComCredito) / agg.comprasEntrada
          : 0,
        pctB2B:
          agg.vendasB2B + agg.vendasB2C
            ? Math.round(
                (100 * agg.vendasB2B) / (agg.vendasB2B + agg.vendasB2C),
              )
            : 0,
        folhaMensal: agg.folha,
        proLabore: agg.proLabore,
        ncmDetalhado: Object.values(agg.ncmMap).sort(
          (a, b) => b.valorTotal - a.valorTotal,
        ),
      });
      if (agg.ufDetectada) patch.uf = agg.ufDetectada;
      if (agg.anexoDetectado) {
        patch.setor = agg.anexoDetectado.setor;
        patch.anexoDetectadoPGDAS = agg.anexoDetectado.anexo;
        patch.anexoServicosForcado =
          agg.anexoDetectado.setor === "servicos"
            ? agg.anexoDetectado.anexo
            : null;
      }
      const total = Object.values(agg.comercioCategorias).reduce(
        (a, b) => a + b,
        0,
      );
      if (setor === "comercio" && total)
        patch.beneficios = {
          comercio: {
            cestaPct: Math.round((100 * agg.comercioCategorias.cesta) / total),
            reduzido60Pct: Math.round(
              (100 * agg.comercioCategorias.reduzido60) / total,
            ),
          },
        };
      const selected = selectedMonths.slice().sort();
      const history = selected.map((c) => {
        const m = window.gmImport.aggregate(arquivos, c, aggregateFiles);
        return {
          faturamento: m.faturamentoSaida,
          comprasRegimeNormal: m.comprasComCredito,
          comprasOutras: Math.max(0, m.comprasEntrada - m.comprasComCredito),
          proLabore: m.proLabore,
          folha: m.folha + m.proLabore,
        };
      });
      patch.historico = [
        ...Array.from({ length: 6 - history.length }, () => ({
          faturamento: 0,
          comprasRegimeNormal: 0,
          folha: 0,
        })),
        ...history,
      ];
      patch.historicoCompetencias = [
        ...Array(6 - selected.length).fill(null),
        ...selected,
      ];
    }
    onApply(patch);
  }, [arquivos, activePeriod, selectedMonths]);
  const toggleMonth = (month) => {
    if (selectedMonths.includes(month))
      setMonths(selectedMonths.filter((m) => m !== month));
    else if (selectedMonths.length < 6)
      setMonths([...selectedMonths, month].sort());
    else
      setMessage(
        "Selecione até seis competências. Desmarque uma antes de adicionar outra.",
      );
  };
  const toggleDirecao = (id) => {
    setArquivos((prev) =>
      prev.map((f) =>
        f.id !== id
          ? f
          : f.tipo === "nfe_saida"
            ? {
                ...f,
                tipo: "nfe_entrada",
                badge: "Entrada reclassificada manualmente",
                dados: { ...f.dados, credito: false },
              }
            : f.tipo === "nfe_entrada"
              ? {
                  ...f,
                  tipo: "nfe_saida",
                  badge: "Saída reclassificada manualmente",
                  dados: { ...f.dados, isB2B: false },
                }
              : f,
      ),
    );
  };
  const removeFile = (id) =>
    setArquivos((prev) => prev.filter((f) => f.id !== id));
  const handleExample = (key) => {
    skipNextAggRef.current = true;
    setArquivos(
      {
        comercio: MOCK_ARQUIVOS_COMERCIO,
        industria: MOCK_ARQUIVOS_INDUSTRIA,
        servicos: MOCK_ARQUIVOS_SERVICOS,
      }[key],
    );
    onLoadExample(key);
  };
  return (
    <div className="card p-5 mb-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display text-[17px] font-semibold flex items-center gap-2">
          <IconUpload
            className="w-5 h-5"
            style={{ color: "var(--petroleo)" }}
            strokeWidth={1.9}
          />
          Upload de documentos fiscais e contábeis
        </h2>
      </div>
      <p className="text-[13px] mb-4" style={{ color: "var(--ink-soft)" }}>
        Envie o Cartão CNPJ, XMLs de NF-e/NFC-e (saídas e entradas), extrato do
        PGDAS-D e relatório de folha de pagamento. O Cartão CNPJ ou PGDAS-D
        define o CNPJ mestre da empresa em análise, e todo arquivo enviado
        depois passa por validação cruzada contra esse CNPJ antes de compor o
        cálculo.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_240px] gap-3 mb-4">
        <div
          className={`dropzone p-6 flex flex-col items-center justify-center text-center gap-2 cursor-pointer ${dragActive ? "drag-active" : ""}`}
          onClick={() => inputRef.current && inputRef.current.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          <IconUpload
            className="w-7 h-7"
            style={{ color: "var(--petroleo)" }}
            strokeWidth={1.6}
          />
          <p className="text-[13.5px] font-medium">
            Arraste os arquivos aqui ou clique para selecionar
          </p>
          <p className="text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
            .xml · .pdf · .txt · .zip · .csv (conferência de notas)
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".xml,.pdf,.txt,.zip,.csv"
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        {d.cnpjMestreLocked ? (
          <div
            className="rounded-lg p-3 text-[11.5px]"
            style={{
              background: "var(--emerald-tint)",
              color: "var(--emerald)",
            }}
          >
            <p className="font-semibold mb-1">CNPJ mestre definido</p>
            <p className="font-mono">{d.cnpj}</p>
            <p className="mt-1">
              Todo arquivo enviado é validado automaticamente contra este CNPJ.
            </p>
          </div>
        ) : (
          <div>
            <label className="field-label">
              CNPJ do contribuinte (opcional)
            </label>
            <input
              type="text"
              placeholder="00.000.000/0000-00"
              value={d.cnpj}
              onChange={(e) => onApply(aplicarCnpjDigitado(e.target.value))}
            />
            <p
              className="text-[11px] mt-1"
              style={{ color: "var(--ink-soft)" }}
            >
              Se deixado em branco, será definido pelo Cartão CNPJ ou PGDAS-D
              enviado.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => handleExample("comercio")}
          className="flex items-center gap-1.5 text-[12.5px] px-3 py-2 rounded-lg font-medium"
          style={{ background: "var(--violet-tint)", color: "var(--violet)" }}
        >
          <IconSparkle className="w-3.5 h-3.5" strokeWidth={2} /> Carregar
          Exemplo Real: Comércio Varejista
        </button>
        <button
          onClick={() => handleExample("industria")}
          className="flex items-center gap-1.5 text-[12.5px] px-3 py-2 rounded-lg font-medium"
          style={{ background: "var(--violet-tint)", color: "var(--violet)" }}
        >
          <IconSparkle className="w-3.5 h-3.5" strokeWidth={2} /> Carregar
          Exemplo Real: Indústria
        </button>
        <button
          onClick={() => handleExample("servicos")}
          className="flex items-center gap-1.5 text-[12.5px] px-3 py-2 rounded-lg font-medium"
          style={{ background: "var(--violet-tint)", color: "var(--violet)" }}
        >
          <IconSparkle className="w-3.5 h-3.5" strokeWidth={2} /> Carregar
          Exemplo Real: Empresa de Serviços
        </button>
      </div>

      {message && (
        <p
          role="status"
          className="text-[12px] mb-3"
          style={{ color: "var(--petroleo)" }}
        >
          {message}
        </p>
      )}
      {allPeriods.length > 0 && (
        <div
          className="rounded-lg p-3 mb-4"
          style={{ background: "var(--paper)" }}
        >
          <label className="field-label" htmlFor="import-period">
            Competência da simulação
          </label>
          <select
            id="import-period"
            value={activePeriod}
            onChange={(e) => setPeriod(e.target.value)}
          >
            {allPeriods.map((c) => (
              <option key={c} value={c}>
                {formatCompetencia(c)}
              </option>
            ))}
          </select>
          <p className="text-[11.5px] mt-2">
            Receita do PGDAS do mês, quando disponível; XMLs para compras e
            conferência. Os meses não são somados como uma única receita mensal.
          </p>
          <p className="field-label mt-3">
            Competências do histórico (até seis)
          </p>
          <div className="flex flex-wrap gap-3">
            {allPeriods.map((c) => (
              <label key={c} className="text-[12px]">
                <input
                  type="checkbox"
                  checked={selectedMonths.includes(c)}
                  onChange={() => toggleMonth(c)}
                />{" "}
                {formatCompetencia(c)}
              </label>
            ))}
          </div>
          {agg.warnings.map((w) => (
            <p
              key={w}
              className="text-[12px] mt-2"
              style={{ color: "var(--amber)" }}
            >
              ⚠ {w}
            </p>
          ))}
          {arquivos.some(
            (r) => r.status === "estimado" || r.status === "erro",
          ) && (
            <p className="text-[12px] mt-2" style={{ color: "var(--amber)" }}>
              Há documentos pendentes ou com erro. Eles não compõem os totais
              automaticamente; confira os avisos na lista.
            </p>
          )}
          {selectedMonths.some(
            (c) =>
              !window.gmImport.aggregate(arquivos, c, aggregateFiles).temFolha,
          ) && (
            <p className="text-[12px] mt-2" style={{ color: "var(--amber)" }}>
              O histórico selecionado contém meses sem folha. Confira esses
              meses antes de emitir o parecer.
            </p>
          )}
        </div>
      )}
      {processando && (
        <div className="mb-4">
          <p
            className="text-[12.5px] flex items-center gap-2 mb-1.5"
            style={{ color: "var(--petroleo)" }}
          >
            <IconLoader className="w-3.5 h-3.5 spin" strokeWidth={2.4} />{" "}
            Processando documentos fiscais... ({progresso.atual} arquivos lidos)
          </p>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{
                width: `${(progresso.atual / Math.max(1, progresso.total)) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {arquivos.length > 0 && (
        <div className="mb-4">
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setAba("validos")}
              className="text-[12px] font-medium px-3 py-1.5 rounded-full"
              style={
                aba === "validos"
                  ? { background: "var(--emerald)", color: "#fff" }
                  : { background: "var(--paper)", color: "var(--ink-soft)" }
              }
            >
              Documentos processados ({validos.length})
            </button>
            <button
              onClick={() => setAba("rejeitados")}
              className="text-[12px] font-medium px-3 py-1.5 rounded-full"
              style={
                aba === "rejeitados"
                  ? { background: "var(--rose)", color: "#fff" }
                  : { background: "var(--paper)", color: "var(--ink-soft)" }
              }
            >
              Documentos rejeitados / cancelados ({rejeitados.length})
            </button>
          </div>
          {(aba === "validos" ? validos : rejeitados).length > visible && (
            <button
              type="button"
              className="text-[12px] mb-2"
              onClick={() => setVisible((n) => n + 50)}
            >
              Mostrar mais 50 documentos ({visible} exibidos)
            </button>
          )}
          <div className="flex flex-col gap-1.5">
            {(aba === "validos" ? validos : rejeitados)
              .slice(0, visible)
              .map((f) => (
                <FileRow
                  key={f.id}
                  f={f}
                  onToggleDirecao={toggleDirecao}
                  onRemove={removeFile}
                />
              ))}
            {(aba === "validos" ? validos : rejeitados).length === 0 && (
              <p
                className="text-[12px] py-2"
                style={{ color: "var(--ink-soft)" }}
              >
                Nenhum documento nesta categoria.
              </p>
            )}
          </div>
        </div>
      )}

      {hasResults && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div
            className="rounded-lg p-3"
            style={{ background: "var(--petroleo-tint)" }}
          >
            <p className="text-[10.5px]" style={{ color: "var(--petroleo)" }}>
              Faturamento da competência
            </p>
            <p
              className="font-mono text-[14px] font-semibold"
              style={{ color: "var(--petroleo)" }}
            >
              {fmtBRL2(agg.faturamentoSaida)}
            </p>
          </div>
          <div
            className="rounded-lg p-3"
            style={{ background: "var(--emerald-tint)" }}
          >
            <p className="text-[10.5px]" style={{ color: "var(--emerald)" }}>
              Compras com crédito de CBS
            </p>
            <p
              className="font-mono text-[14px] font-semibold"
              style={{ color: "var(--emerald)" }}
            >
              {fmtBRL2(agg.comprasComCredito)}{" "}
              {agg.comprasEntrada > 0 &&
                `(${Math.round((agg.comprasComCredito / agg.comprasEntrada) * 100)}%)`}
            </p>
          </div>
          <div
            className="rounded-lg p-3"
            style={{ background: "var(--amber-tint)" }}
          >
            <p className="text-[10.5px]" style={{ color: "var(--amber)" }}>
              Vendas B2C / B2B
            </p>
            <p
              className="font-mono text-[14px] font-semibold"
              style={{ color: "var(--amber)" }}
            >
              {agg.vendasB2B + agg.vendasB2C > 0
                ? `${Math.round((agg.vendasB2C / (agg.vendasB2B + agg.vendasB2C)) * 100)}% / ${Math.round((agg.vendasB2B / (agg.vendasB2B + agg.vendasB2C)) * 100)}%`
                : "—"}
            </p>
          </div>
          <div
            className="rounded-lg p-3"
            style={{ background: "var(--line-soft)" }}
          >
            <p className="text-[10.5px]" style={{ color: "var(--ink-soft)" }}>
              Folha apurada (CPP)
            </p>
            <p className="font-mono text-[14px] font-semibold">
              {agg.temFolha ? fmtBRL2(agg.folha + agg.proLabore) : "—"}
            </p>
          </div>
        </div>
      )}

      <div
        className="flex items-start gap-2 p-3 rounded-lg"
        style={{
          background: "var(--paper)",
          border: "1px solid var(--line-soft)",
        }}
      >
        <IconLock
          className="w-4 h-4 shrink-0 mt-0.5"
          style={{ color: "var(--ink-soft)" }}
          strokeWidth={1.8}
        />
        <p className="text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
          Leitura dos arquivos no navegador. Os dados extraídos e os resultados
          são salvos no servidor do escritório. Os campos permanecem editáveis
          para conferência.
        </p>
      </div>
    </div>
  );
}
