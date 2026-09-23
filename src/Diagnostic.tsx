import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Save,
  Building2,
  FileUp,
  SlidersHorizontal,
  ChartNoAxesCombined,
  CalendarDays,
  FlaskConical,
  Check,
  Printer,
  ArrowDownRight,
  Info,
  Plus,
  Trash2,
  FileText,
  UploadCloud,
  AlertTriangle,
} from "lucide-react";
import { api } from "./api";
import { Button, Field, NumberField, PageHeading, Empty } from "./ui";
import {
  blankState,
  exampleState,
  computeRegimes,
  computeMonth,
  money,
  percent,
  labels,
  sectors,
  emptyMonth,
  aggregateDocuments,
  mergeDocuments,
  formatCompetencia,
  ENGINE_VERSION,
} from "../shared/engine.js";
import { stateSchema, type DiagnosticState } from "../shared/schema";
import Report from "./Report";
const tabs = [
  { id: "data", label: "Dados da empresa", icon: Building2 },
  { id: "documents", label: "Documentos", icon: FileUp },
  { id: "parameters", label: "Premissas", icon: SlidersHorizontal },
  { id: "history", label: "Histórico", icon: CalendarDays },
  { id: "results", label: "Comparativo", icon: ChartNoAxesCombined },
];
export default function Diagnostic({
  initialRecord,
  onDirty,
  onBusy,
  onSaved,
  onBack,
}: {
  initialRecord: any;
  onDirty: (v: boolean) => void;
  onBusy: (v: boolean) => void;
  onSaved: () => void;
  onBack: () => void;
}) {
  const [d, setD] = useState<DiagnosticState>(
    () => initialRecord?.d || blankState(),
  );
  const [record, setRecord] = useState(initialRecord),
    [tab, setTab] = useState("data"),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [demo, setDemo] = useState(false),
    [report, setReport] = useState(false);
  const change = (patch: Partial<DiagnosticState>) => {
    setD((prev) => ({ ...prev, ...patch }));
    setDirty(true);
    onDirty(true);
    setMessage("");
  };
  const calc = useMemo(() => computeRegimes(d), [d]);
  const inputValid =
    d.cestaPct + d.reduzido60Pct <= 100 && d.comprasCredito <= d.comprasMensais;
  useEffect(() => () => onBusy(false), [onBusy]);
  async function save() {
    setError("");
    const parsed = stateSchema.safeParse(d);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" · "));
      return;
    }
    setBusy(true);
    onBusy(true);
    try {
      const saved = await api(record ? `/clients/${record.id}` : "/clients", {
        method: record ? "PUT" : "POST",
        body: JSON.stringify({ d: parsed.data, version: record?.version }),
      });
      setRecord(saved);
      setD(saved.d);
      setDirty(false);
      onDirty(false);
      setDemo(false);
      setMessage("Diagnóstico salvo no servidor.");
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  const number = (
    key: keyof DiagnosticState,
    label: string,
    hint?: string,
    suffix?: string,
    optional = false,
    max?: number,
  ) => (
    <NumberField
      label={label}
      value={d[key] as number | null}
      onChange={(v) => change({ [key]: v })}
      hint={hint}
      suffix={suffix}
      optional={optional}
      max={max}
    />
  );
  function loadExample() {
    if (
      dirty &&
      !confirm(
        "Substituir os dados da tela por uma demonstração? As alterações não salvas serão descartadas.",
      )
    )
      return;
    setD(exampleState(d.setor) as DiagnosticState);
    setRecord(null);
    setDemo(true);
    setDirty(false);
    onDirty(false);
    setMessage(
      "Demonstração: dados fictícios. Informe um CNPJ e uma razão social reais para cadastrar.",
    );
    setError("");
  }
  return (
    <>
      <button className="back-button" onClick={onBack} disabled={busy}>
        <ArrowLeft size={16} />
        Voltar para a carteira
      </button>
      <PageHeading
        eyebrow="PLANEJAMENTO TRIBUTÁRIO · 2027"
        title={record ? d.razaoSocial : "Novo diagnóstico"}
        description="Organize os dados da empresa e explore os cenários de tributação."
        action={
          <div className="row">
            <span className={`save-state ${dirty ? "pending" : ""}`}>
              {dirty ? (
                "Alterações não salvas"
              ) : record ? (
                <>
                  <Check size={15} />
                  Salvo no servidor
                </>
              ) : (
                "Rascunho"
              )}
            </span>
            <Button onClick={() => void save()} busy={busy}>
              <Save size={17} />
              Salvar diagnóstico
            </Button>
          </div>
        }
      />
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="notice success" role="status">
          {message}
        </div>
      )}
      {demo && (
        <div className="notice">
          <FlaskConical size={18} />
          Você está explorando um exemplo fictício. Ele não foi adicionado à
          carteira.
        </div>
      )}
      <div className="editor-layout">
        <div className="editor-main">
          <div
            className="tabs"
            role="tablist"
            aria-label="Etapas do diagnóstico"
          >
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={tab === t.id ? "selected" : ""}
              >
                <t.icon size={17} />
                {t.label}
              </button>
            ))}
          </div>
          <fieldset disabled={busy} className="editor-fieldset">
            {tab === "data" && (
              <>
                <section className="card">
                  <div className="section-heading">
                    <div>
                      <h2>Conheça a empresa</h2>
                      <p>Identificação e atividade principal do cliente.</p>
                    </div>
                    <span className="step-number">01</span>
                  </div>
                  <div className="form-grid">
                    <Field label="Razão social / nome fantasia">
                      <input
                        value={d.razaoSocial}
                        onChange={(e) =>
                          change({ razaoSocial: e.target.value })
                        }
                        placeholder="Nome da empresa"
                        maxLength={200}
                      />
                    </Field>
                    <Field
                      label="CNPJ"
                      hint="Use o CNPJ da empresa para validar os documentos importados."
                    >
                      <input
                        inputMode="numeric"
                        value={d.cnpj}
                        maxLength={18}
                        onChange={(e) => {
                          if (d.documentos.length) return;
                          change({
                            cnpj: e.target.value
                              .replace(/\D/g, "")
                              .slice(0, 14),
                          });
                        }}
                        readOnly={d.documentos.length > 0}
                        placeholder="14 dígitos"
                      />
                    </Field>
                    <Field label="Atividade principal">
                      <select
                        value={d.setor}
                        onChange={(e) =>
                          change({
                            setor: e.target.value as DiagnosticState["setor"],
                            aliquotaEstMun:
                              e.target.value === "servicos" ? 3 : 20,
                          })
                        }
                      >
                        {Object.entries(sectors).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Município">
                      <input
                        value={d.municipioUF}
                        onChange={(e) =>
                          change({ municipioUF: e.target.value })
                        }
                        placeholder="Ex.: Manaus"
                      />
                    </Field>
                    <Field label="UF">
                      <select
                        value={d.uf}
                        onChange={(e) => change({ uf: e.target.value })}
                      >
                        {"AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO"
                          .split(" ")
                          .map((uf) => (
                            <option key={uf}>{uf}</option>
                          ))}
                      </select>
                    </Field>
                    <Field label="Competência da simulação">
                      <input
                        type="month"
                        value={d.competencia}
                        onChange={(e) =>
                          change({ competencia: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                </section>
                <section className="card">
                  <div className="section-heading">
                    <div>
                      <h2>Dados financeiros</h2>
                      <p>Valores do mês escolhido para a comparação.</p>
                    </div>
                    <span className="step-number">02</span>
                  </div>
                  <div className="form-grid">
                    {number("faturamentoMensal", "Faturamento mensal")}
                    {number("rbt12", "Receita acumulada em 12 meses (RBT12)")}
                    {number("comprasMensais", "Compras totais do mês")}
                    {number(
                      "comprasCredito",
                      "Compras elegíveis ao crédito de CBS/IBS",
                      "Base estimada à alíquota padrão. Revise créditos efetivos, benefícios e restrições.",
                    )}
                    {number("folhaMensal", "Folha de empregados")}
                    {number("proLabore", "Pró-labore dos sócios")}
                    {d.setor !== "servicos" &&
                      number(
                        "icmsCredito",
                        "Crédito de ICMS do mês",
                        "Informe o crédito efetivamente admitido, sem presumir crédito sobre todas as compras.",
                      )}
                    {number(
                      "aliquotaEstMun",
                      d.setor === "servicos"
                        ? "Alíquota de ISS"
                        : "Alíquota de ICMS",
                      "Confirme a alíquota aplicável às operações.",
                      "%",
                      false,
                      100,
                    )}
                  </div>
                  {!inputValid && (
                    <div className="notice error">
                      Compras elegíveis não podem exceder as compras totais;
                      benefícios devem somar até 100%.
                    </div>
                  )}
                </section>
                <div className="editor-bottom">
                  <button className="text-button" onClick={loadExample}>
                    <FlaskConical size={17} />
                    Explorar um exemplo
                  </button>
                  <Button onClick={() => setTab("results")}>
                    Ver comparativo
                    <ChartNoAxesCombined size={17} />
                  </Button>
                </div>
              </>
            )}
            {tab === "parameters" && (
              <>
                <section className="card">
                  <div className="section-heading">
                    <div>
                      <h2>Premissas tributárias</h2>
                      <p>
                        Parâmetros explícitos para uma simulação conferível.
                      </p>
                    </div>
                  </div>
                  <div className="notice">
                    <Info size={18} />
                    CBS de 8,7% + IBS de 0,1% são hipóteses de trabalho, não
                    alíquotas definitivas homologadas. Ajuste após validação do
                    contador.
                  </div>
                  <div className="form-grid">
                    {number(
                      "cbs",
                      "CBS de referência",
                      undefined,
                      "%",
                      false,
                      100,
                    )}
                    {number(
                      "ibs",
                      "IBS de referência",
                      undefined,
                      "%",
                      false,
                      100,
                    )}
                    {number(
                      "rat",
                      "RAT ajustado pelo FAP",
                      "Aplicado à folha de empregados; não ao pró-labore.",
                      "%",
                      false,
                      6,
                    )}
                    {number(
                      "terceiros",
                      "Contribuições a terceiros",
                      "Aplicadas à folha no Lucro Presumido.",
                      "%",
                      false,
                      100,
                    )}
                  </div>
                </section>
                <section className="card">
                  <h2>Benefícios sobre as vendas</h2>
                  <p className="section-description">
                    Informe apenas classificações conferidas. NCM e CNAE,
                    isoladamente, não confirmam o direito ao benefício.
                  </p>
                  <div className="form-grid">
                    {d.setor !== "servicos" ? (
                      <>
                        {number(
                          "cestaPct",
                          "Receita com alíquota zero",
                          undefined,
                          "%",
                          false,
                          100,
                        )}
                        {number(
                          "reduzido60Pct",
                          "Receita com redução de 60%",
                          undefined,
                          "%",
                          false,
                          100,
                        )}
                      </>
                    ) : (
                      <Field label="Redução aplicável aos serviços">
                        <select
                          value={d.reducaoServicos}
                          onChange={(e) =>
                            change({
                              reducaoServicos: Number(e.target.value) as
                                0 | 30 | 60,
                            })
                          }
                        >
                          <option value={0}>Sem redução</option>
                          <option value={30}>
                            Redução de 30% — confirmar requisitos
                          </option>
                          <option value={60}>
                            Redução de 60% — confirmar enquadramento
                          </option>
                        </select>
                      </Field>
                    )}
                    {number(
                      "aliquotaPersonalizada",
                      "CBS efetiva personalizada",
                      "Opcional. Deixe vazio para usar os benefícios; zero é aceito.",
                      "%",
                      true,
                      100,
                    )}
                  </div>
                  {d.cestaPct + d.reduzido60Pct > 100 && (
                    <div className="notice error">
                      Os percentuais de receita não podem somar mais de 100%.
                    </div>
                  )}
                </section>
                {d.setor === "servicos" && (
                  <section className="card">
                    <h2>Enquadramento de serviços</h2>
                    <p className="section-description">
                      Escolha o anexo após conferir a atividade. O teste do
                      Fator R só se aplica às atividades sujeitas a essa regra.
                    </p>
                    <div className="form-grid">
                      <Field label="Anexo de serviços">
                        <select
                          value={d.anexoServicosForcado}
                          onChange={(e) =>
                            change({
                              anexoServicosForcado: e.target
                                .value as DiagnosticState["anexoServicosForcado"],
                            })
                          }
                        >
                          <option value="III">Anexo III</option>
                          <option value="IV">Anexo IV</option>
                          <option value="V">Anexo V</option>
                          <option value="auto">Calcular pelo Fator R</option>
                        </select>
                      </Field>
                      {number(
                        "fs12",
                        "Folha acumulada em 12 meses (FS12)",
                        "Inclua os componentes previstos na regra do Fator R. Não é a folha mensal multiplicada por 12.",
                        undefined,
                        true,
                      )}
                    </div>
                    {calc.fatorR !== null && (
                      <div className="notice success">
                        Fator R: {percent(calc.fatorR * 100)} · Anexo utilizado:{" "}
                        {calc.nomeAnexo}
                      </div>
                    )}
                  </section>
                )}
                <section className="card">
                  <Field label="Observações da análise">
                    <textarea
                      rows={4}
                      value={d.notas}
                      onChange={(e) => change({ notas: e.target.value })}
                      placeholder="Registre particularidades da empresa e pontos que precisam de conferência."
                    />
                  </Field>
                </section>
              </>
            )}
            {tab === "documents" && (
              <Documents
                d={d}
                change={change}
                onBusy={(v) => {
                  setBusy(v);
                  onBusy(v);
                }}
              />
            )}
            {tab === "history" && (
              <section className="card">
                <div className="section-heading">
                  <div>
                    <h2>Histórico por competência</h2>
                    <p>
                      Folha e pró-labore separados, com o mesmo motor de cálculo
                      do comparativo.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={d.historico.length >= 120}
                    onClick={() =>
                      change({ historico: [...d.historico, emptyMonth()] })
                    }
                  >
                    <Plus size={16} />
                    Mês
                  </Button>
                </div>
                <p className="notice">
                  O histórico usa o RBT12 e as premissas atuais em todos os
                  meses. É um cenário comparativo, não a reprodução da apuração
                  fiscal passada.
                </p>
                {!d.historico.length ? (
                  <Empty
                    title="Nenhuma competência adicionada"
                    text="Adicione um mês manualmente ou aplique uma competência na aba Documentos."
                  />
                ) : (
                  <div className="table-wrap">
                    <table className="history-table">
                      <thead>
                        <tr>
                          {[
                            "Competência",
                            "Receita",
                            "Compras",
                            "Compras elegíveis",
                            "Folha",
                            "Pró-labore",
                            "Crédito ICMS",
                            "Tradicional",
                            "Híbrido",
                            "Presumido",
                            "",
                          ].map((x, i) => (
                            <th key={i}>{x}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {d.historico.map((m, index) => {
                          const c = computeMonth(d, m);
                          return (
                            <tr key={index}>
                              <td>
                                <input
                                  type="month"
                                  aria-label={`Competência ${index + 1}`}
                                  value={m.competencia}
                                  onChange={(e) =>
                                    change({
                                      historico: d.historico.map((v, i) =>
                                        i === index
                                          ? {
                                              ...v,
                                              competencia: e.target.value,
                                            }
                                          : v,
                                      ),
                                    })
                                  }
                                />
                              </td>
                              {(
                                [
                                  "faturamento",
                                  "compras",
                                  "comprasCredito",
                                  "folha",
                                  "proLabore",
                                  "icmsCredito",
                                ] as const
                              ).map((field) => (
                                <td key={field}>
                                  <input
                                    aria-label={`${field} mês ${index + 1}`}
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={m[field]}
                                    onChange={(e) =>
                                      change({
                                        historico: d.historico.map((v, i) =>
                                          i === index
                                            ? {
                                                ...v,
                                                [field]: Math.max(
                                                  0,
                                                  Number(e.target.value),
                                                ),
                                              }
                                            : v,
                                        ),
                                      })
                                    }
                                  />
                                </td>
                              ))}
                              {Object.keys(labels).map((k) => (
                                <td
                                  key={k}
                                  className={
                                    c.melhor === k
                                      ? "good-text numeric"
                                      : "numeric"
                                  }
                                >
                                  {money(c.regimes[k].mensal)}
                                </td>
                              ))}
                              <td>
                                <button
                                  className="icon-button danger-text"
                                  aria-label={`Remover mês ${index + 1}`}
                                  onClick={() =>
                                    change({
                                      historico: d.historico.filter(
                                        (_, i) => i !== index,
                                      ),
                                    })
                                  }
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
            {tab === "results" && (
              <>
                <section className="comparison-hero">
                  <div>
                    <span className="badge">COMPARATIVO MENSAL</span>
                    <h2>
                      {calc.melhor && inputValid
                        ? labels[calc.melhor as keyof typeof labels]
                        : "Revise os dados do cenário"}
                    </h2>
                    <p>
                      {calc.melhor && inputValid
                        ? "Menor custo entre os cenários simulados, conforme as premissas informadas."
                        : "As particularidades deste cenário impedem uma indicação automática."}
                    </p>
                  </div>
                  <Button
                    variant="white"
                    disabled={
                      !d.razaoSocial || !inputValid || !d.faturamentoMensal
                    }
                    onClick={() => setReport(true)}
                  >
                    <Printer size={17} />
                    Relatório da simulação
                  </Button>
                </section>
                {calc.warnings.map((w) => (
                  <div className="notice" key={w}>
                    <AlertTriangle size={18} />
                    {w}
                  </div>
                ))}
                {!inputValid && (
                  <div className="notice error">
                    Corrija os percentuais de benefícios e as compras elegíveis
                    antes de comparar.
                  </div>
                )}
                <div className="regimes-grid">
                  {Object.entries(calc.regimes).map(([key, r]) => (
                    <section
                      key={key}
                      className={`card regime-card ${calc.melhor === key && inputValid ? "best" : ""}`}
                    >
                      <div className="regime-header">
                        <span className="regime-icon">
                          <ChartNoAxesCombined size={20} />
                        </span>
                        {calc.melhor === key && inputValid && (
                          <span className="badge good">
                            <Check size={12} />
                            Menor custo
                          </span>
                        )}
                      </div>
                      <h3>{r.label}</h3>
                      <strong className="regime-total">
                        {money(r.mensal)}
                        <small>/ mês</small>
                      </strong>
                      <p>
                        Carga estimada de <b>{percent(r.cargaEfetiva)}</b>
                      </p>
                      <div className="cost-bar">
                        <span
                          style={{
                            width: `${Math.min(100, r.cargaEfetiva * 2)}%`,
                          }}
                        />
                      </div>
                      <div className="regime-lines">
                        {r.linhas.map((l) => (
                          <div key={l.label}>
                            <span>{l.label}</span>
                            <strong>{money(l.valor)}</strong>
                          </div>
                        ))}
                      </div>
                      <div className="regime-annual">
                        <span>Projeção anual</span>
                        <strong>{money(r.anual)}</strong>
                      </div>
                      {!r.elegivel && (
                        <p className="danger-text">
                          Fora do limite modelado para o Simples.
                        </p>
                      )}
                    </section>
                  ))}
                </div>
                {calc.melhor && inputValid && (
                  <div className="savings-banner">
                    <ArrowDownRight size={32} />
                    <div>
                      <small>
                        Diferença anual entre o menor e o maior custo simulado
                      </small>
                      <strong>{money(calc.economiaAnual)}</strong>
                    </div>
                    <span>Projeção de 12 meses iguais</span>
                  </div>
                )}
                <section className="card">
                  <h2>Como interpretar o resultado</h2>
                  <div className="assumptions-list">
                    <p>
                      <Check size={17} />A comparação usa um mês representativo,
                      anualizado por 12.
                    </p>
                    <p>
                      <Info size={17} />
                      IRPJ adicional é uma aproximação mensal; a apuração
                      trimestral deve ser conferida.
                    </p>
                    <p>
                      <Info size={17} />A retirada de PIS/Cofins do DAS é uma
                      hipótese de partilha para o Híbrido, sujeita à revisão das
                      regras de 2027.
                    </p>
                    <p>
                      <Info size={17} />
                      Créditos de CBS/IBS são estimados sobre a base elegível à
                      alíquota padrão. Não há compensação automática de saldos
                      entre competências.
                    </p>
                    <p>
                      <Info size={17} />
                      Atividades mistas, substituição tributária, regimes
                      específicos e incentivos da ZFM exigem análise
                      complementar.
                    </p>
                    {calc.creditoExcedente > 0 && (
                      <p>
                        <Info size={17} />
                        Crédito excedente estimado no mês:{" "}
                        {money(calc.creditoExcedente)}. Não foi tratado como
                        restituição ou economia.
                      </p>
                    )}
                  </div>
                </section>
              </>
            )}
          </fieldset>
        </div>
        <aside className="context-card card">
          <span className="context-icon">
            <Building2 size={25} />
          </span>
          <h3>{d.razaoSocial || "Sua próxima análise"}</h3>
          <p>{d.cnpj || "Preencha os dados para começar"}</p>
          <span className="badge neutral">{sectors[d.setor]}</span>
          <hr />
          <dl>
            <div>
              <dt>Competência</dt>
              <dd>{formatCompetencia(d.competencia)}</dd>
            </div>
            <div>
              <dt>Faturamento mensal</dt>
              <dd>{money(d.faturamentoMensal)}</dd>
            </div>
            <div>
              <dt>RBT12</dt>
              <dd>{money(d.rbt12)}</dd>
            </div>
            <div>
              <dt>Anexo simulado</dt>
              <dd>{calc.nomeAnexo}</dd>
            </div>
            <div>
              <dt>Documentos</dt>
              <dd>{d.documentos.length}</dd>
            </div>
          </dl>
          <div className="context-tip">
            <Info size={18} />
            <p>
              Salve o diagnóstico para continuar depois, de qualquer computador.
            </p>
          </div>
          <small className="engine-version">Motor {ENGINE_VERSION}</small>
        </aside>
      </div>
      {report && <Report d={d} calc={calc} onClose={() => setReport(false)} />}
    </>
  );
}
function Documents({
  d,
  change,
  onBusy,
}: {
  d: DiagnosticState;
  change: (patch: Partial<DiagnosticState>) => void;
  onBusy: (v: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [competencia, setCompetencia] = useState(d.competencia),
    [progress, setProgress] = useState("");
  const competencias = [
    ...new Set(
      d.documentos
        .filter((f) => f.status === "ok" && f.competencia)
        .map((f) => f.competencia!),
    ),
  ].sort();
  const apply = (
    docs: DiagnosticState["documentos"],
    comp: string,
    remove = false,
  ) => {
    const agg = aggregateDocuments(docs, comp);
    const month = {
      competencia: comp,
      faturamento: agg.faturamento,
      compras: agg.compras,
      comprasCredito: agg.comprasCredito,
      folha: agg.folha,
      proLabore: agg.proLabore,
      icmsCredito:
        d.historico.find((m) => m.competencia === comp)?.icmsCredito || 0,
    };
    const historico = [
      ...d.historico.filter((m) => m.competencia !== comp),
      month,
    ].sort((a, b) => a.competencia.localeCompare(b.competencia));
    const patch: Partial<DiagnosticState> = { documentos: docs, historico };
    if (!remove || d.competencia === comp)
      Object.assign(patch, {
        competencia: comp,
        faturamentoMensal: agg.faturamento,
        comprasMensais: agg.compras,
        comprasCredito: agg.comprasCredito,
        folhaMensal: agg.folha,
        proLabore: agg.proLabore,
      });
    if (agg.rbt12 !== null) patch.rbt12 = agg.rbt12;
    else if (
      remove &&
      d.documentos.some(
        (f) => f.competencia === comp && f.tipo === "pgdas" && f.dados.rbt12,
      )
    )
      patch.rbt12 = 0;
    change(patch);
  };
  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    if (d.cnpj.length !== 14) {
      setMessage("Informe o CNPJ da empresa na aba Dados antes de importar.");
      return;
    }
    if (files.length > 100 || d.documentos.length + files.length > 2000) {
      setMessage("Importe até 100 arquivos por lote e 2.000 por cliente.");
      return;
    }
    setBusy(true);
    onBusy(true);
    setMessage("");
    try {
      const { parseFileRaw, finalizeFile } = await import("./parsers.js");
      const results = [];
      for (const [index, file] of selectedFiles.entries()) {
        setProgress(`Processando ${index + 1} de ${selectedFiles.length}`);
        if (
          file.size > 10 * 1024 * 1024 ||
          !/\.(xml|pdf|txt)$/i.test(file.name)
        )
          throw new Error("Use XML, PDF ou TXT de até 10 MB por arquivo.");
        const bytes = await file.arrayBuffer();
        const hash = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        )
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        const raw = await parseFileRaw(file);
        results.push(finalizeFile({ ...raw, hash }, d.cnpj, false));
      }
      const { merged, duplicates } = mergeDocuments(d.documentos, results);
      change({ documentos: merged });
      setMessage(
        `${results.length - duplicates} arquivo(s) adicionado(s). ${duplicates} duplicado(s) ignorado(s). Confira os documentos e escolha a competência para aplicar.`,
      );
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
      onBusy(false);
      setProgress("");
    }
  }
  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <h2>Documentos da empresa</h2>
          <p>
            Importe, confira a competência e aplique os valores ao diagnóstico.
          </p>
        </div>
        <span className="badge neutral">{d.documentos.length} arquivo(s)</span>
      </div>
      <label className={`upload-zone ${busy ? "disabled" : ""}`}>
        <UploadCloud size={37} />
        <strong>{busy ? progress : "Selecione os documentos fiscais"}</strong>
        <span>NF-e/NFC-e em XML · PGDAS e folha em PDF ou TXT</span>
        <small>
          Até 10 MB por arquivo. PDFs digitalizados precisam de OCR externo.
        </small>
        <input
          disabled={busy}
          type="file"
          multiple
          accept=".xml,.pdf,.txt"
          aria-label="Importar documentos fiscais"
          onChange={(e) => {
            void importFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      <div className="document-apply">
        <Field label="Competência para aplicar">
          <select
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
          >
            <option value="">Selecione um mês</option>
            {competencias.map((c) => (
              <option key={c} value={c}>
                {formatCompetencia(c)}
              </option>
            ))}
          </select>
        </Field>
        <Button
          disabled={busy || !competencia || !competencias.includes(competencia)}
          onClick={() => {
            apply(d.documentos, competencia);
            setMessage(
              "Valores desta competência aplicados ao mês e ao histórico. Revise os créditos e o enquadramento.",
            );
          }}
        >
          Aplicar valores deste mês
        </Button>
      </div>
      <p className="small-note">
        PDFs e XMLs são lidos no seu navegador. Ao salvar, apenas os dados
        extraídos ficam no servidor. Notas sem autorização informada ou
        operações especiais exigem conferência adicional; eventos de
        cancelamento externos não são consultados.
      </p>
      <div className="document-list">
        {d.documentos.map((f) => (
          <div className="document-row" key={f.id}>
            <FileText size={20} />
            <div className="document-info">
              <strong>{f.name}</strong>
              <p>{f.badge}</p>
              <div className="row">
                <span
                  className={`badge ${f.status === "ok" ? "good" : f.status === "rejeitado" || f.status === "erro" ? "bad" : "warn"}`}
                >
                  {f.status === "ok"
                    ? "Extraído · conferir"
                    : f.status === "rejeitado"
                      ? "CNPJ divergente / ausente"
                      : f.status === "erro"
                        ? "Não processado"
                        : "Conferência manual"}
                </span>
                {f.competencia ? (
                  <small>{formatCompetencia(f.competencia)}</small>
                ) : (
                  <small>
                    Competência não identificada; ajuste os valores manualmente.
                  </small>
                )}
              </div>
            </div>
            <button
              className="icon-button danger-text"
              disabled={busy}
              aria-label={`Remover ${f.name}`}
              onClick={() => {
                const docs = d.documentos.filter((x) => x.id !== f.id);
                if (
                  f.competencia &&
                  d.historico.some((m) => m.competencia === f.competencia)
                )
                  apply(docs, f.competencia, true);
                else change({ documentos: docs });
                setMessage(
                  "Documento removido. Os totais importados da competência aplicada foram recalculados.",
                );
              }}
            >
              <Trash2 size={17} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
