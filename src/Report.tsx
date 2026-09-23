import { Printer, X } from "lucide-react";
import { Button, Brand } from "./ui";
import {
  money,
  percent,
  labels,
  sectors,
  formatCompetencia,
  computeMonth,
} from "../shared/engine.js";
import type { DiagnosticState } from "../shared/schema";
export default function Report({
  d,
  calc,
  onClose,
}: {
  d: DiagnosticState;
  calc: any;
  onClose: () => void;
}) {
  return (
    <div
      className="report-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Relatório da simulação"
    >
      <div className="report-toolbar">
        <span>Prévia do relatório</span>
        <div className="row">
          <Button onClick={() => window.print()}>
            <Printer size={17} />
            Imprimir / Salvar PDF
          </Button>
          <button
            className="icon-button"
            onClick={onClose}
            autoFocus
            aria-label="Fechar relatório"
          >
            <X size={21} />
          </button>
        </div>
      </div>
      <article className="report">
        <header>
          <Brand />
          <span>
            EXERCÍCIO 2027
            <br />
            {new Date().toLocaleDateString("pt-BR")}
          </span>
        </header>
        <h1>Relatório de simulação tributária</h1>
        <p className="report-subtitle">
          Comparação de cenários · {formatCompetencia(d.competencia)}
        </p>
        <section>
          <h2>1. Identificação da empresa</h2>
          <dl className="report-details">
            <div>
              <dt>Razão social</dt>
              <dd>{d.razaoSocial}</dd>
            </div>
            <div>
              <dt>CNPJ</dt>
              <dd>{d.cnpj}</dd>
            </div>
            <div>
              <dt>Atividade</dt>
              <dd>{sectors[d.setor]}</dd>
            </div>
            <div>
              <dt>Município / UF</dt>
              <dd>
                {d.municipioUF} / {d.uf}
              </dd>
            </div>
          </dl>
        </section>
        <section>
          <h2>2. Premissas utilizadas</h2>
          <table>
            <tbody>
              {[
                ["Faturamento mensal", money(d.faturamentoMensal)],
                ["RBT12", money(d.rbt12)],
                ["Compras totais", money(d.comprasMensais)],
                ["Compras elegíveis para CBS/IBS", money(d.comprasCredito)],
                ["Folha de empregados", money(d.folhaMensal)],
                ["Pró-labore", money(d.proLabore)],
                ["Crédito de ICMS", money(d.icmsCredito)],
                [
                  "CBS / IBS de referência",
                  `${percent(d.cbs)} / ${percent(d.ibs)}`,
                ],
                [
                  "RAT ajustado / terceiros",
                  `${percent(d.rat)} / ${percent(d.terceiros)}`,
                ],
                ["ICMS / ISS", percent(d.aliquotaEstMun)],
                [
                  "Anexo / alíquota efetiva do DAS",
                  `${calc.nomeAnexo} / ${percent(calc.aliqEfetiva * 100)}`,
                ],
                [
                  "Receita alíquota zero / redução 60%",
                  `${percent(d.cestaPct)} / ${percent(d.reduzido60Pct)}`,
                ],
                [
                  "Redução serviços / CBS personalizada",
                  `${percent(d.reducaoServicos)} / ${d.aliquotaPersonalizada === null ? "Não aplicada" : percent(d.aliquotaPersonalizada)}`,
                ],
                [
                  "FS12 / Fator R",
                  `${d.fs12 === null ? "Não informado" : money(d.fs12)} / ${calc.fatorR === null ? "Não calculado" : percent(calc.fatorR * 100)}`,
                ],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h2>3. Comparação e memória de cálculo</h2>
          <table>
            <thead>
              <tr>
                <th>Cenário</th>
                <th>Mensal</th>
                <th>Anual*</th>
                <th>Carga</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(calc.regimes).map(([k, r]: [string, any]) => (
                <tr key={k}>
                  <td>{r.label}</td>
                  <td>{money(r.mensal)}</td>
                  <td>{money(r.anual)}</td>
                  <td>{percent(r.cargaEfetiva)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            *Projeção de 12 meses iguais. Não representa apuração trimestral
            efetiva de IRPJ.
          </p>
          {Object.entries(calc.regimes).map(([k, r]: [string, any]) => (
            <div className="report-calculation" key={k}>
              <h3>{r.label}</h3>
              <table>
                <tbody>
                  {r.linhas.map((l: any) => (
                    <tr key={l.label}>
                      <td>{l.label}</td>
                      <td>{money(l.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <p>
            {calc.melhor ? (
              <>
                O menor custo simulado foi o de{" "}
                <strong>{labels[calc.melhor as keyof typeof labels]}</strong>. A
                diferença anual para o maior custo entre os cenários é de{" "}
                {money(calc.economiaAnual)}.
              </>
            ) : (
              "Não há indicação automática para este cenário. As particularidades exigem análise complementar."
            )}
          </p>
        </section>
        {d.historico.length > 0 && (
          <section>
            <h2>4. Histórico comparativo</h2>
            <table>
              <thead>
                <tr>
                  <th>Competência</th>
                  <th>Receita</th>
                  <th>Tradicional</th>
                  <th>Híbrido</th>
                  <th>Presumido</th>
                </tr>
              </thead>
              <tbody>
                {d.historico.map((m, i) => {
                  const c = computeMonth(d, m);
                  return (
                    <tr key={i}>
                      <td>{formatCompetencia(m.competencia)}</td>
                      <td>{money(m.faturamento)}</td>
                      {Object.keys(labels).map((k) => (
                        <td key={k}>{money(c.regimes[k].mensal)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p>RBT12 e premissas constantes em todas as competências.</p>
          </section>
        )}
        <section>
          <h2>Limites e conferência profissional</h2>
          {calc.warnings.map((w: string) => (
            <p key={w}>{w}</p>
          ))}
          <p>
            Alíquotas CBS/IBS são hipóteses informadas. A partilha usada para
            reduzir o DAS do Híbrido é estimativa herdada das parcelas
            PIS/Cofins. Créditos de CBS/IBS são calculados à alíquota padrão
            sobre compras elegíveis; saldos não são transportados entre meses. O
            enquadramento, benefícios, requisitos legais e valores efetivos dos
            documentos precisam ser conferidos pelo contador.
          </p>
          <p>
            Não estão modelados atividades mistas, substituição tributária,
            regimes específicos, IPI/Imposto Seletivo, incentivos da Zona Franca
            de Manaus e regras de início de atividade. Este relatório de
            simulação não é uma declaração fiscal nem um parecer técnico
            homologado.
          </p>
          {d.notas && (
            <p className="preserve-lines">
              <strong>Observações:</strong>
              <br />
              {d.notas}
            </p>
          )}
        </section>
        <footer>
          G&M Contabilidade · Motor {calc.version} · Documento gerado a partir
          dos dados informados.
        </footer>
      </article>
    </div>
  );
}
