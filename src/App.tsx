import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Calculator,
  DatabaseBackup,
  Menu,
  X,
  LogOut,
  Plus,
  Search,
  ArrowRight,
  ShieldCheck,
  ChartNoAxesCombined,
  FileCheck2,
  Download,
  Upload,
  RefreshCw,
  Trash2,
  LockKeyhole,
  ChevronRight,
} from "lucide-react";
import { api, downloadJSON } from "./api";
import { Brand, Button, Field, Empty, PageHeading, Stat, Modal } from "./ui";
import { money, labels, sectors } from "../shared/engine.js";
import Diagnostic from "./Diagnostic";
type User = { id: string; name: string; email: string };
export type ClientSummary = {
  id: string;
  name: string;
  cnpj: string;
  sector: keyof typeof sectors;
  results: any;
  version: number;
  updatedAt: string;
};
const nav = [
  { id: "dashboard", label: "Visão geral", icon: LayoutDashboard },
  { id: "clients", label: "Carteira de clientes", icon: Users },
  { id: "diagnostic", label: "Novo diagnóstico", icon: Calculator },
  { id: "backup", label: "Backup e restauração", icon: DatabaseBackup },
];
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [page, setPage] = useState("dashboard"),
    [mobile, setMobile] = useState(false),
    [clients, setClients] = useState<ClientSummary[]>([]);
  const [record, setRecord] = useState<any>(null),
    [editorKey, setEditorKey] = useState(0),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(""),
    [deleting, setDeleting] = useState<ClientSummary | null>(null),
    [notice, setNotice] = useState("");
  const refresh = async () => {
    const result = await api<ClientSummary[]>("/clients");
    setClients(result);
  };
  useEffect(() => {
    api<User>("/auth/me")
      .then(setUser)
      .catch((e) => {
        if (e.status !== 401) setError(e.message);
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (user) refresh().catch((e) => setError(e.message));
  }, [user]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const canLeave = () =>
    !dirty ||
    window.confirm(
      "Há alterações não salvas neste diagnóstico. Deseja descartá-las e sair?",
    );
  const go = (next: string) => {
    if (busy || !canLeave()) return;
    setDirty(false);
    setPage(next);
    setMobile(false);
    setError("");
    if (next === "diagnostic") {
      setRecord(null);
      setEditorKey((k) => k + 1);
    }
  };
  const openClient = async (id: string) => {
    if (busy || !canLeave()) return;
    setBusy(true);
    setError("");
    try {
      const rec = await api(`/clients/${id}`);
      setRecord(rec);
      setEditorKey((k) => k + 1);
      setDirty(false);
      setPage("diagnostic");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    if (busy || !canLeave()) return;
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      setClients([]);
      setRecord(null);
      setPage("dashboard");
      setDirty(false);
    } catch (e: any) {
      setError(e.message);
    }
  };
  if (loading)
    return (
      <main className="center">
        <Brand />
        <p>Preparando seu espaço de trabalho...</p>
      </main>
    );
  if (!user) return <Login onLogin={setUser} initialError={error} />;
  const filtered = clients.filter((c) =>
    `${c.name} ${c.cnpj}`
      .toLowerCase()
      .includes(search.toLowerCase().replace(/[./-]/g, "")),
  );
  const comparable = clients.filter((c) => c.results.melhor);
  const recent = [...clients].slice(0, 5);
  const list = (items: ClientSummary[]) =>
    items.length ? (
      <div className="table-wrap">
        <table className="clients-table">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Atividade</th>
              <th>Menor custo estimado</th>
              <th>Atualização</th>
              <th>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td>
                  <button
                    className="client-link"
                    onClick={() => void openClient(c.id)}
                    disabled={busy}
                  >
                    <span className="company-avatar">
                      {c.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span>
                      <strong>{c.name}</strong>
                      <small>{formatCnpj(c.cnpj)}</small>
                    </span>
                  </button>
                </td>
                <td>
                  <span className="badge neutral">{sectors[c.sector]}</span>
                </td>
                <td>
                  {c.results.melhor ? (
                    <span className="badge good">
                      {labels[c.results.melhor as keyof typeof labels]}
                    </span>
                  ) : (
                    <span className="badge warn">Revisão necessária</span>
                  )}
                </td>
                <td className="muted">
                  {new Date(c.updatedAt).toLocaleDateString("pt-BR")}
                </td>
                <td>
                  <div className="row">
                    <button
                      className="icon-button"
                      onClick={() => void openClient(c.id)}
                      disabled={busy}
                      aria-label={`Abrir ${c.name}`}
                    >
                      <ChevronRight size={19} />
                    </button>
                    {page === "clients" && (
                      <button
                        className="icon-button danger-text"
                        onClick={() => setDeleting(c)}
                        aria-label={`Excluir ${c.name}`}
                      >
                        <Trash2 size={17} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty
        title={
          search ? "Nenhuma empresa encontrada" : "Sua carteira começa aqui"
        }
        text={
          search
            ? "Tente buscar por outro nome ou CNPJ."
            : "Cadastre a primeira empresa para organizar os dados e comparar os cenários tributários."
        }
        action={
          !search && (
            <Button onClick={() => go("diagnostic")}>
              <Plus size={17} />
              Cadastrar empresa
            </Button>
          )
        }
      />
    );
  return (
    <div className="app-shell">
      {mobile && (
        <button
          className="sidebar-overlay"
          onClick={() => setMobile(false)}
          aria-label="Fechar menu"
        />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-only"
            onClick={() => setMobile(false)}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>
        <p className="nav-caption">ESPAÇO DE TRABALHO</p>
        <nav aria-label="Navegação principal">
          {nav.map((n) => (
            <button
              key={n.id}
              aria-label={n.label}
              disabled={busy}
              className={`nav-item ${page === n.id ? "active" : ""}`}
              onClick={() => go(n.id)}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.id === "clients" && <small>{clients.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="fiscal-note">
            <ShieldCheck size={23} />
            <strong>Planejamento com clareza</strong>
            <p>Dados organizados para apoiar a decisão do contador.</p>
            <span>Exercício 2027</span>
          </div>
          <div className="sidebar-credit">
            G&M Contabilidade<small>Diagnóstico tributário · v1.0</small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-only"
            onClick={() => setMobile(true)}
            aria-label="Abrir menu"
          >
            <Menu size={22} />
          </button>
          <div className="breadcrumb">
            Área de trabalho
            <ChevronRight size={14} />
            <strong>{nav.find((n) => n.id === page)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="badge neutral desktop-only">Exercício 2027</span>
            <span className="avatar">
              {user.name
                .split(" ")
                .slice(0, 2)
                .map((n) => n[0])
                .join("")}
            </span>
            <div className="user-info">
              <strong>{user.name}</strong>
              <small>Equipe contábil</small>
            </div>
            <button
              className="icon-button"
              onClick={() => void logout()}
              disabled={busy}
              aria-label="Sair da conta"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="main-content">
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Fechar aviso"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="notice success" role="status">
              {notice}
              <button
                className="icon-button"
                onClick={() => setNotice("")}
                aria-label="Fechar aviso"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {page === "dashboard" && (
            <>
              <PageHeading
                eyebrow="SEU ESCRITÓRIO, MAIS ORGANIZADO"
                title={`Olá, ${user.name.split(" ")[0]}.`}
                description="Uma visão clara da sua carteira e dos próximos diagnósticos."
                action={
                  <Button onClick={() => go("diagnostic")}>
                    <Plus size={18} />
                    Novo diagnóstico
                  </Button>
                }
              />
              <div className="stats-grid">
                <Stat
                  primary
                  label="Empresas na carteira"
                  value={String(clients.length).padStart(2, "0")}
                  caption="Cadastros salvos e disponíveis para sua equipe"
                  icon={<Users size={21} />}
                />
                <Stat
                  label="Cenários comparáveis"
                  value={String(comparable.length).padStart(2, "0")}
                  caption="Diagnósticos dentro do escopo do simulador"
                  icon={<FileCheck2 size={21} />}
                />
                <Stat
                  label="Precisam de revisão"
                  value={String(clients.length - comparable.length).padStart(
                    2,
                    "0",
                  )}
                  caption="Confira os dados e as particularidades fiscais"
                  icon={<ChartNoAxesCombined size={21} />}
                />
              </div>
              <div className="dashboard-grid">
                <section className="card recent-card">
                  <div className="section-heading">
                    <div>
                      <h2>Empresas recentes</h2>
                      <p>Continue de onde você parou.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => go("clients")}
                    >
                      Ver carteira <ArrowRight size={15} />
                    </button>
                  </div>
                  {list(recent)}
                </section>
                <section className="card quick-card">
                  <span className="feature-icon">
                    <Calculator size={27} />
                  </span>
                  <p className="eyebrow">PLANEJAMENTO TRIBUTÁRIO</p>
                  <h2>
                    Compare cenários.
                    <br />
                    Encontre possibilidades.
                  </h2>
                  <p>
                    Organize faturamento, compras e folha para comparar três
                    modelos de tributação.
                  </p>
                  <div className="regime-tags">
                    <span>Simples Tradicional</span>
                    <span>Simples Híbrido</span>
                    <span>Lucro Presumido</span>
                  </div>
                  <Button onClick={() => go("diagnostic")}>
                    Começar diagnóstico
                    <ArrowRight size={17} />
                  </Button>
                </section>
              </div>
              <section className="orientation">
                <ShieldCheck size={24} />
                <div>
                  <strong>Uma ferramenta de apoio à sua análise</strong>
                  <p>
                    As projeções dependem das premissas informadas. Revise as
                    regras aplicáveis à empresa antes de formalizar uma opção
                    tributária.
                  </p>
                </div>
                <span className="badge neutral">Simulação 2027</span>
              </section>
            </>
          )}
          {page === "clients" && (
            <>
              <PageHeading
                eyebrow="RELACIONAMENTO E ORGANIZAÇÃO"
                title="Carteira de clientes"
                description="Os dados de cada empresa, reunidos em um só lugar."
                action={
                  <Button onClick={() => go("diagnostic")}>
                    <Plus size={18} />
                    Novo cliente
                  </Button>
                }
              />
              <section className="card">
                <div className="section-heading">
                  <div className="search-field">
                    <Search size={18} />
                    <input
                      aria-label="Buscar empresa"
                      placeholder="Buscar por nome ou CNPJ..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => refresh().catch((e) => setError(e.message))}
                  >
                    <RefreshCw size={16} />
                    Atualizar
                  </Button>
                </div>
                {list(filtered)}
              </section>
            </>
          )}
          {page === "diagnostic" && (
            <Diagnostic
              key={editorKey}
              initialRecord={record}
              onDirty={setDirty}
              onBusy={setBusy}
              onSaved={() => refresh().catch((e) => setError(e.message))}
              onBack={() => go("clients")}
            />
          )}
          {page === "backup" && <Backup onRestored={refresh} />}
          <footer className="app-footer">
            <span>G&M Contabilidade · Diagnóstico Tributário</span>
            <span>Organização para decidir melhor.</span>
          </footer>
        </main>
      </div>
      {deleting && (
        <Modal
          title="Excluir cliente?"
          onClose={() => !busy && setDeleting(null)}
        >
          <p>
            O cadastro de <strong>{deleting.name}</strong> será removido da
            carteira. Exporte um backup antes se precisar preservar os dados.
          </p>
          <div className="modal-actions">
            <Button
              variant="secondary"
              onClick={() => setDeleting(null)}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              busy={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/clients/${deleting.id}`, {
                    method: "DELETE",
                    body: JSON.stringify({ version: deleting.version }),
                  });
                  setDeleting(null);
                  await refresh();
                  setNotice("Cliente excluído.");
                } catch (e: any) {
                  setError(e.message);
                  setDeleting(null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Excluir cliente
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Login({
  onLogin,
  initialError,
}: {
  onLogin: (user: User) => void;
  initialError: string;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false);
  return (
    <main className="login-page">
      <section className="login-story">
        <Brand />
        <div className="login-message">
          <span className="badge">EXERCÍCIO 2027</span>
          <h1>
            Mais clareza.
            <br />
            Melhores decisões
            <br />
            <em>tributárias.</em>
          </h1>
          <p>
            Seu espaço para organizar empresas, comparar cenários e transformar
            dados em planejamento.
          </p>
          <div className="login-metrics">
            <div>
              <strong>03</strong>
              <span>cenários tributários</span>
            </div>
            <div>
              <strong>01</strong>
              <span>carteira organizada</span>
            </div>
          </div>
        </div>
        <small>G&M Contabilidade · Inteligência contábil</small>
      </section>
      <section className="login-form-side">
        <form
          className="login-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              onLogin(
                await api("/auth/login", {
                  method: "POST",
                  body: JSON.stringify({ email, password }),
                }),
              );
            } catch (err: any) {
              setError(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <span className="feature-icon">
            <LockKeyhole size={25} />
          </span>
          <p className="eyebrow">BEM-VINDO AO SEU ESPAÇO</p>
          <h2>Acesse sua conta</h2>
          <p>Entre para continuar os diagnósticos do escritório.</p>
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          <Field label="E-mail">
            <input
              type="email"
              autoComplete="username"
              placeholder="seu@email.com.br"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Senha">
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Sua senha"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" busy={busy}>
            Entrar na plataforma
            <ArrowRight size={18} />
          </Button>
          <p className="login-help">
            <ShieldCheck size={16} /> Acesso exclusivo à equipe autorizada.
          </p>
          <small>
            Precisa de acesso? Solicite ao administrador do escritório.
          </small>
        </form>
      </section>
    </main>
  );
}
function Backup({ onRestored }: { onRestored: () => Promise<void> }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  return (
    <>
      <PageHeading
        eyebrow="CONTINUIDADE DO ESCRITÓRIO"
        title="Backup e restauração"
        description="Exporte a carteira completa e mantenha uma cópia dos seus diagnósticos."
      />
      <div className="two-columns">
        <section className="card backup-card">
          <span className="feature-icon">
            <Download size={25} />
          </span>
          <h2>Exportar sua carteira</h2>
          <p>
            Baixe todos os clientes, premissas, competências e dados extraídos
            dos documentos em um arquivo JSON.
          </p>
          <Button
            busy={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const data = await api("/backup");
                downloadJSON(
                  data,
                  `gm-backup-${new Date().toISOString().slice(0, 10)}.json`,
                );
                setMessage("Backup exportado com todos os clientes.");
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Download size={17} />
            Exportar backup completo
          </Button>
        </section>
        <section className="card backup-card">
          <span className="feature-icon">
            <Upload size={25} />
          </span>
          <h2>Restaurar um backup</h2>
          <p>
            Importe um backup desta versão. Empresas com CNPJ já cadastrado
            serão preservadas e não serão sobrescritas.
          </p>
          <label
            className={`button secondary file-button ${busy ? "disabled" : ""}`}
          >
            <Upload size={17} />
            Selecionar arquivo JSON
            <input
              disabled={busy}
              aria-label="Selecionar backup JSON"
              type="file"
              accept=".json,application/json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setBusy(true);
                setError("");
                try {
                  if (file.size > 20 * 1024 * 1024)
                    throw new Error("O backup deve ter até 20 MB.");
                  const data = JSON.parse(await file.text());
                  const r = await api("/backup", {
                    method: "POST",
                    body: JSON.stringify(data),
                  });
                  await onRestored();
                  setMessage(
                    `${r.inserted} cliente(s) restaurado(s); ${r.skipped} já existente(s) preservado(s).`,
                  );
                } catch (err: any) {
                  setError(err.message);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
        </section>
      </div>
      {message && (
        <div className="notice success" role="status">
          {message}
        </div>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <div className="orientation">
        <ShieldCheck size={24} />
        <div>
          <strong>Guarde seu backup em um local seguro</strong>
          <p>
            O arquivo contém informações financeiras dos clientes. Os arquivos
            PDF e XML originais não são armazenados nesta versão.
          </p>
        </div>
      </div>
    </>
  );
}
export function formatCnpj(value: string) {
  return value.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5",
  );
}
