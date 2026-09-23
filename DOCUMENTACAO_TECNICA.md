# Documentação Técnica — Diagnóstico de Enquadramento Tributário 2027

**Arquivo da aplicação:** `diagnostico-tributario-2027-app.html`
**Autor original:** gerado com Claude (Anthropic), a pedido de Germano Cunha Miranda — G&M Contabilidade LTDA (CRC-AM-010043-O/9)
**Data desta documentação:** 20/09/2026
**Propósito:** simulador comparativo Simples Nacional Tradicional × Simples Híbrido × Lucro Presumido para os setores Comércio, Indústria e Serviços, com leitura automática de documentos fiscais e geração de Parecer Técnico formal em PDF.

---

## 1. Visão geral e stack técnica

É um **único arquivo HTML autocontido**, sem build step, sem `package.json`, sem servidor de aplicação:

- **React 18** (UMD, via CDN — `react.production.min.js` / `react-dom.production.min.js`)
- **Babel Standalone** (via CDN) faz a transpilação de JSX **no próprio navegador**, em tempo de execução (`<script type="text/babel">`)
- **Tailwind CSS** via CDN (play-CDN, `cdn.tailwindcss.com`)
- **Google Fonts**: Fraunces (display), IBM Plex Sans (corpo), IBM Plex Mono (números)
- Zero dependências de bundler (Webpack/Vite/etc.) — o arquivo roda abrindo direto no navegador ou servido por qualquer servidor HTTP estático (Nginx, Apache, Caddy, `python -m http.server`, etc.)

**Importante para produção:** por não ter build step, o Babel Standalone transpila o JSX a cada carregamento de página — funciona bem para uso interno de escritório, mas para tráfego alto o ideal seria migrar para um build real (Vite/CRA) com JSX pré-compilado. Isso é uma refatoração de infraestrutura, não de lógica de negócio.

---

## 2. Estrutura do arquivo (ordem das seções no `<script type="text/babel">`)

1. **Ícones** — SVGs inline como componentes React (não usa nenhuma lib de ícones, por restrição do ambiente onde foi originalmente publicado)
2. **Tabelas tributárias e constantes** (`ANEXO_I`, `ANEXO_II`, `ANEXO_III`, `ANEXO_V`, `CBS_ALIQ`, `PRESUNCAO_IRPJ`, `PRESUNCAO_CSLL`, `FATOR_R_LIMITE`)
3. **Motor de benefícios da Reforma (LC 214/2025)** — classificação por NCM (comércio/indústria) e CNAE (serviços)
4. **Motor de cálculo tributário** — `computeRegimes(d)` e `computeMesRegimes(d, mes)`
5. **Dados de exemplo** (`EXEMPLO_COMERCIO`, `EXEMPLO_INDUSTRIA`, `EXEMPLO_SERVICOS`) e mocks de arquivos de demonstração
6. **Parser de documentos** (client-side, 100% no navegador) — XML de NF-e/NFC-e, PGDAS-D, Cartão CNPJ, Folha de Pagamento
7. **Componentes de UI** — `NumberField`, `SectorToggle`, `RegimeCard`, `AlertCard`, `BenefitsPanel`, `HistoricoTable`, `UploadModule`, `FileRow`, `ClientesPanel` (protótipo original, sem uso — ver seção 6)
8. **`Parecer`** — componente que renderiza o parecer técnico formal (para impressão via `window.print()`)
9. **Carteira de clientes** — helpers `lsLoadCarteira`, `lsSaveCarteira`, `buildClienteRecord`; lógica de persistência (banco do Claude + fallback `localStorage`) integrada diretamente no componente `App` — ver seção 6
10. **`App`** — componente raiz, guarda todo o estado (`d`) e orquestra tudo

---

## 3. Modelo de dados — o objeto `d` (estado do "cliente em análise")

Todo o app gira em torno de um único objeto de estado (`useState` no componente `App`), chamado `d`. Formato completo:

```js
{
  setor: 'comercio' | 'industria' | 'servicos',
  razaoSocial: string,
  cnpj: string,                    // formatado "XX.XXX.XXX/0001-XX"
  municipioUF: string,              // ex.: "Manaus - AM"
  uf: string,                       // sigla de 2 letras, ex.: "AM"
  cnpjMestreLocked: boolean,        // trava de integridade — ver seção 5

  faturamentoMensal: number,
  rbt12: number,                    // receita bruta últimos 12 meses
  comprasMensais: number,
  pctFornecedorRegimeNormal: number, // 0-100
  folhaMensal: number,
  proLabore: number,
  aliquotaEstMun: number,           // ICMS (comércio/indústria) ou ISS (serviços), em %
  pctB2B: number,                   // 0-100

  anexoServicosForcado: 'III' | 'IV' | 'V' | null,  // override manual/detectado do Anexo de serviços
  anexoDetectadoPGDAS: string | null,               // último Anexo detectado num PGDAS-D processado

  beneficios: {
    comercio: { cestaPct: number, reduzido60Pct: number },      // usado também por 'industria'
    servicos: { cnae: string, categoria: 'padrao'|'regulamentada'|'saude_educacao'|'personalizado', aliqPersonalizada: number },
  },

  historico: [ { faturamento, comprasRegimeNormal, folha }, ... ],  // array de 6 posições (6 meses)
  historicoCompetencias: [ 'YYYY-MM' | null, ... ],                  // array de 6 posições
}
```

`BLANK_STATE(setor)` gera um objeto zerado nesse formato; `EXEMPLO_COMERCIO` / `EXEMPLO_INDUSTRIA` / `EXEMPLO_SERVICOS` são exemplos completos e realistas usados nos botões de demonstração.

---

## 4. Motor de cálculo tributário

### 4.1. Tabelas oficiais usadas

Todas as tabelas de "Alíquotas e Partilha do Simples Nacional" foram extraídas diretamente de `normas.receita.fazenda.gov.br` (Resolução CGSN nº 94/2011 e atualizações):

| Anexo | Atividade | CPP no DAS? |
|---|---|---|
| I | Comércio | Sim |
| II | Indústria | Sim (inclui IPI na partilha) |
| III | Serviços com Fator R ≥ 28% | Sim |
| IV | Serviços de lista fixa (construção civil, advocacia, vigilância etc.) | **Não** — recolhida à parte |
| V | Serviços com Fator R < 28% | **Não** — recolhida à parte |

> Observação: os Anexos IV e V têm exatamente a mesma tabela oficial de alíquotas/partilha — o código reaproveita o array `ANEXO_V` para ambos, distinguindo apenas o rótulo `nomeAnexo` exibido (ver `tabelaServicos()`).

Cada faixa de cada anexo carrega um campo `percCBS`, que é o percentual de repartição de **Cofins + PIS/Pasep** daquela faixa — esse é o percentual que, a partir de 2027, passa a corresponder a CBS+IBS (redistribuição neutra em arrecadação, conforme LC 214/2025 e LC 227/2026). É esse valor (e não um percentual médio fixo) que sai do DAS quando o cliente opta pelo Simples Híbrido.

### 4.2. Fator R (`calcFatorR`, `tabelaServicos`)

Para o setor "Serviços", o Anexo é decidido por:

```
Fator R = (folhaMensal + proLabore) × 12 / RBT12
```

- Fator R ≥ 28% → Anexo III
- Fator R < 28% → Anexo V

`d.anexoServicosForcado` permite sobrepor essa decisão automática (usado quando o Anexo IV se aplica, ou quando detectado explicitamente num PGDAS-D).

### 4.3. `computeRegimes(d)` — cálculo "mês representativo" (o simulador principal)

Retorna `{ regimes, melhor, excede, aliqEfetiva, faixa, cbsDebito, cbsCredito, aliqCBSVendas, fatorR, nomeAnexo, cppNoDAS }`.

- **Simples Tradicional**: `faturamentoMensal × aliqEfetiva` (tabela do Anexo aplicável) + CPP separada quando `cppNoDAS === false`.
- **Simples Híbrido**: DAS reduzido pelo `percCBS` da faixa, + CBS líquida (débito 8,8% sobre vendas − crédito 8,8% sobre compras elegíveis) + CPP separada quando aplicável.
- **Lucro Presumido**: IRPJ (presunção 8% comércio/indústria, 32% serviços) + CSLL (12%/32%) + CPP (28,8% sobre folha+pró-labore) + ICMS ou ISS (débito/crédito, alíquota de `d.aliquotaEstMun`) + CBS líquida.

`CBS_ALIQ = 0.088` — alíquota de referência **projetada** para 2027, ainda pendente de fixação definitiva por Resolução do Senado (prazo legal: 15/12 do ano anterior, LC 214/2025 art. 349). Isso está documentado no rodapé do app e no parecer.

### 4.4. `computeMesRegimes(d, mes)` — usado no demonstrativo cronológico de 6 meses

Mesma lógica de `computeRegimes`, mas aplicada a cada linha do array `d.historico` (mantendo fixos o RBT12, a faixa, os benefícios e a alíquota de CBS — só faturamento/compras/folha variam mês a mês).

### 4.5. Motor de benefícios da Reforma (`aliqCBSComercio`, `aliqCBSServicos`)

- **Comércio/Indústria**: classificação por NCM dos itens de cada XML de saída processado (`classifyNCM`), em 3 categorias: Cesta Básica (alíquota zero), Medicamentos/Insumos Agropecuários/Dispositivos Médicos (redução de 60%), Padrão (8,8%). A alíquota de CBS usada no cálculo é a **média ponderada** pela receita de cada categoria.
- **Serviços**: classificação por CNAE (`classifyCNAE`) em Profissão Regulamentada (art. 127 LC 214/2025, redução de 30%), Saúde/Educação (redução de 60%), Padrão, ou Personalizado (alíquota digitada manualmente).

> ⚠️ **As tabelas de NCM e CNAE usadas (`CESTA_BASICA_NCM4`, `MEDICAMENTOS_NCM2`, `DISPOSITIVOS_MEDICOS_NCM4`, `INSUMOS_AGRO_NCM4`, `CNAE_REGULAMENTADA4`, `CNAE_SAUDE_EDUCACAO4`) são amostras ilustrativas, não exaustivas.** O app deixa isso explícito na interface. Antes de qualquer uso em produção real com clientes, essas listas devem ser expandidas/validadas contra o texto integral dos Anexos I-III e do art. 127 da LC 214/2025.

---

## 5. Parser de documentos e trava de integridade

Tudo roda **100% no navegador** (nenhum arquivo é enviado a servidor algum — nem mesmo ao "backend" do Claude). Fluxo por arquivo enviado (`.xml`, `.pdf`, `.txt`):

1. **`parseFileRaw(file)`** — leitura bruta: para XML usa `DOMParser`; para PDF/TXT lê como texto (para PDF, `crudeTextFromBinary` faz uma extração best-effort baseada em operadores `Tj` do PDF — **não funciona bem com PDFs com stream comprimido/Flate**, que é a maioria dos PDFs gerados por sistemas modernos; funciona melhor com `.txt` puro).
2. **CNPJ Mestre**: o primeiro documento capaz de indicar um CNPJ (prioridade: Cartão CNPJ > PGDAS-D > primeiro XML, ou CNPJ digitado manualmente) fixa `d.cnpj` e trava (`cnpjMestreLocked = true`).
3. **`finalizeFile(r, master, isMasterSource)`** — valida cada arquivo contra o CNPJ mestre:
   - XML de saída: `emit > CNPJ` deve bater com o mestre.
   - XML de entrada: `dest > CNPJ` deve bater com o mestre.
   - PDF/TXT: procura o CNPJ mestre em qualquer lugar do texto.
   - Divergência → arquivo **rejeitado**, excluído de todos os somatórios (aba "Documentos Rejeitados por Divergência" na UI).
4. **Detecção de Anexo via PGDAS-D** (`detectAnexoPGDAS`) — regex sobre o texto do extrato, mapeando termos ("revenda de mercadorias", "indústria", "prestação de serviços", "construção civil", "fator r" etc.) para `{ setor, anexo }`. Isso alterna o setor do app automaticamente.
5. **CFOP industrial** — para o setor Indústria, XMLs de entrada são checados contra uma lista de CFOPs típicos de insumo industrial (1.101, 2.101, 1.124, 2.124, 1.253, 2.253, 1.102, 2.102, 1.551, 2.551) — apenas informativo no badge, não altera o cálculo de crédito (que já depende corretamente do `CRT` do fornecedor).

Toda a extração de valores numéricos usa regex "aproximado" (`numberNear`, `parseCurrencyBR`) — funciona bem em `.txt`, e em PDFs simples/não comprimidos; em PDFs complexos o app cai graciosamente em modo "estimado" e pede conferência manual, sem travar o fluxo.

---

## 6. Persistência de dados — dois sistemas, com troca de prioridade no meio do desenvolvimento (⚠️ ler com atenção)

> **Nota de histórico:** este projeto começou usando `localStorage` como único mecanismo de persistência. Ao testar, o usuário reportou que o navegador (Microsoft Edge, com "Tracking Prevention" ativado) bloqueava esse armazenamento — ver seção 10 para o relato completo. Em resposta, a prioridade foi invertida: hoje a capability `db` do Claude é o mecanismo **primário**, com `localStorage` como **fallback**. O problema, no entanto, **persiste mesmo após essa troca** (seção 10) — então não assuma que a arquitetura abaixo está 100% funcional; é o estado atual do código, não uma confirmação de que funciona.

### 6.1. Mecanismo primário (quando disponível): capability `db` do Claude

- Obtida via `await window.claude.use('db')` (estado `db` em `App`, populado num `useEffect` no mount; `dbStatus` indica `'checking' | 'ready' | 'unavailable'`).
- Coleção `clientes`, documento por CNPJ (`db.doc('clientes/' + cnpjDigits)`), assinatura em tempo real via `db.collection('clientes').orderBy('atualizadoEm', 'desc').limit(50).onSnapshot(...)`.
- Só funciona **dentro do claude.ai**, com o app publicado com `capabilities: {db: {}}`, e exige que o visitante esteja autenticado na plataforma (ver seção 10, hipótese 4). **Não funciona no arquivo `.html` aberto localmente nem fora do domínio claude.ai** — nesses casos `db` permanece `null`.
- O componente `ClientesPanel` (definido no código, próximo ao início) foi o protótipo original dessa lógica; hoje está **sem uso** (não é renderizado) — a lógica equivalente foi reimplementada diretamente dentro do componente `App`. Pode ser removido com segurança, ou usado como referência.

### 6.2. Mecanismo de fallback: `localStorage`

- Chave: `hub_tributario_clientes_2027`
- Funções: `lsLoadCarteira()` (retorna `{ list, erro }`), `lsSaveCarteira(list)` (retorna `{ ok, erro }`), `buildClienteRecord(d, calc)`
- Só é usado quando `dbStatus === 'unavailable'` (isto é, fora do claude.ai, ou quando a capability falhou/não foi concedida).
- Autosave com debounce de 1,2s, disparado sempre que `d.cnpjMestreLocked === true`, tentando `db` primeiro e caindo para `localStorage` só se `db` for `null`.
- Falhas de leitura/escrita (inclusive bloqueios do tipo "Tracking Prevention") são capturadas e expostas na UI via o estado `lsErro` (faixa vermelha persistente perto do seletor de clientes) — mas não há confirmação de que esse aviso chegou a aparecer para o usuário durante os testes.
- Limitação inerente: dados ficam presos **naquele navegador específico**; não é compartilhado entre computadores sem o fluxo manual de exportar/importar JSON.

### 6.3. Exportar/Importar Backup

- **Exportar**: usa `window.claude.use('downloads')` (capability específica do Claude) para acionar o diálogo de salvar arquivo do navegador. **Não funciona fora do Claude.**
- **Importar**: usa `FileReader` puro (API padrão do navegador) — funciona em qualquer lugar; se `db` estiver disponível, grava cada registro importado nele (`Promise.all` de `.set()`); senão, funde no `localStorage`.

**Ação necessária para portar ao VPS:** trocar a função `exportarBackup` para usar o padrão web comum:

```js
const blob = new Blob([JSON.stringify(carteira, null, 2)], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `hub_tributario_clientes_2027_backup_${new Date().toISOString().slice(0,10)}.json`;
a.click();
URL.revokeObjectURL(url);
```

E, como `db` nunca estará disponível fora do claude.ai, no VPS o app vai operar **sempre** no modo `localStorage` (seção 6.2) — o que reabre a pergunta da seção 10: se o problema relatado for mesmo bloqueio de `localStorage` pelo navegador, ele provavelmente vai se repetir lá também, a menos que se implemente um backend próprio (ver seção 9, item 3).

---

## 7. O que fica fora do escopo atual (avisos importantes)

- **Segregação proporcional de atividade mista** (ex.: mesmo CNPJ com receita de Comércio Anexo I *e* Serviços Anexo III simultaneamente): não implementado. O app assume um único Anexo/setor por vez.
- **IPI e Imposto Seletivo com incentivos da Zona Franca de Manaus**: não modelado. O IPI só existe embutido na alíquota nominal do Anexo II (Indústria), sem cálculo específico de produto/incentivo de ZFM.
- **NCM/CNAE**: listas ilustrativas, não exaustivas (ver seção 4.5).
- **CBS a 8,8%**: alíquota de referência projetada, não definitiva (ver seção 4.3).
- **Extração de PDF**: heurística simples, sem biblioteca de parsing real (`pdf.js` ou similar) — funciona de forma limitada com PDFs comprimidos.

---

## 8. Base legal utilizada (para referência do programador, não é aconselhamento jurídico)

- EC nº 132/2023 e LC nº 214/2025 — Reforma Tributária do Consumo (CBS/IBS)
- LC nº 227/2026 — ajustes complementares à LC 214/2025 (criação do CGIBS)
- LC nº 123/2006 (Simples Nacional) e Resolução CGSN nº 94/2011 — tabelas de alíquotas e partilha (Anexos I a V)
- Resolução CGSN nº 186/2026 — janela de opção pelo Simples Híbrido (1º a 30/09/2026, efeitos jan-jun/2027, retratação até 30/11/2026)
- LC nº 242/2022 (alterou a LC nº 19/97 — Código Tributário do Estado do Amazonas) — alíquota modal de ICMS de 20% no AM
- LC nº 214/2025, art. 127 — redução de 30% de CBS/IBS para profissões regulamentadas

---

## 9. Como rodar / implantar

1. **Localmente / teste:** basta abrir o arquivo `.html` direto no navegador (duplo clique) — tudo roda client-side.
2. **VPS (produção real de escritório):** copiar o arquivo para a raiz servida por Nginx/Apache/Caddy, ou qualquer servidor de arquivos estáticos. Não precisa de Node.js, banco de dados nem backend — **a menos que** se queira substituir o `localStorage` por persistência compartilhada entre usuários (ver próximo ponto).
3. **Se quiser persistência compartilhada real** (múltiplos contadores do escritório vendo a mesma carteira de clientes): será necessário montar um backend simples (Node.js + SQLite/Postgres, por exemplo) com uma API REST para `GET/POST/PUT/DELETE` de clientes, e trocar as chamadas a `lsLoadCarteira`/`lsSaveCarteira` por chamadas `fetch()` a essa API. É uma extensão natural da estrutura de dados já existente (`buildClienteRecord` já define o formato do registro).

---

## 10. Problema em aberto (não resolvido) — cadastro de novo cliente não persiste

**Sintoma relatado pelo usuário:** ao clicar em "Cadastrar / Analisar Novo Cliente" e digitar um CNPJ completo (14 dígitos), o app deveria travar o CNPJ mestre (badge "mestre fixado" visível) e, após ~1,2s, salvar automaticamente o cliente — mas, segundo o relato, o cadastro não persiste / não aparece salvo, mesmo após várias rodadas de correção.

**O que já foi verificado e funciona:**
- Testes automatizados (Node + jsdom + React real, não apenas checagem de sintaxe) confirmam que: o app renderiza sem erros; o clique em "Cadastrar / Analisar Novo Cliente" funciona; digitar um CNPJ de 14 dígitos aciona corretamente `cnpjMestreLocked = true` e a UI reflete isso; o fluxo completo (reset → digitar CNPJ → digitar razão social → aguardar debounce de 1200ms → gravação em `localStorage`) foi simulado com sucesso, com o registro aparecendo tanto no `localStorage` quanto no dropdown "Empresa em Análise".
- Um teste isolado, mínimo (só o campo de CNPJ + lógica de trava, sem o resto do app) foi confirmado pelo usuário como funcionando no navegador dele (apareceu "mestre fixado").

**O que foi identificado como causa provável, mas não confirmado como causa única:**
- O usuário reportou no console do Edge: `Tracking Prevention blocked access to storage for <URL>`, ao abrir o arquivo `.html` localmente (`file:///C:/Users/.../Downloads/...`). Isso é um bloqueio conhecido do Edge a `localStorage`/`IndexedDB` em contextos de arquivo local e, possivelmente, dentro de iframes de terceiros.
- Em resposta, a persistência foi migrada para usar a *capability* `db` do Claude (armazenamento próprio da plataforma, via `window.claude.use('db')`, ver `capabilities: {db: {}, downloads: true}` no publish) como mecanismo primário quando o app roda dentro do claude.ai, com fallback para `localStorage` apenas quando `db` não está disponível (variável de estado `dbStatus === 'unavailable'`).
- Mesmo após essa mudança — testada nos dois modos de acesso que o usuário tem (dentro da conversa do Claude e via link direto `https://claude.ai/artifact/...`) — o usuário reportou que **continua não funcionando**, sem que eu tenha conseguido obter um log de console do app grande (só do teste isolado, que funcionou) para diagnosticar further.

**Hipóteses ainda não descartadas, para o programador investigar com acesso real ao navegador do usuário:**
1. `window.claude.use('db')` pode estar resolvendo `null` (capability não concedida a esta view) — nesse caso o código cai para `localStorage`, que pode estar bloqueado pela mesma política de rastreamento do Edge, resultando em falha dupla e silenciosa (embora exista uma faixa de erro visível — estado `lsErro` — para esse caso específico, não há confirmação de que ela apareceu na tela do usuário).
2. Pode haver alguma diferença de timing/re-render entre o ambiente de teste (jsdom) e o navegador real que faz o `useEffect` de autosave não disparar corretamente — vale revisar se há algum loop de re-render ou closure obsoleta (stale closure) nesse efeito (ele depende de `[d, calc, db]`).
3. Extensões do navegador do usuário (bloqueadores de anúncio/rastreamento) podem estar interferindo tanto com `localStorage` quanto com o carregamento de scripts de terceiros (`cdnjs.cloudflare.com`).
4. Não foi possível confirmar se o usuário está autenticado no claude.ai no navegador usado para testar — a capability `db` exige sessão autenticada; um visitante não autenticado recebe `db = null`.

**Recomendação para o programador:** a forma mais robusta de resolver definitivamente é implementar um backend próprio (Node + Postgres/SQLite, como já sugerido na seção 7) para a persistência de clientes, eliminando de vez a dependência de `localStorage` do navegador ou de capabilities específicas do Claude — ambas se mostraram frágeis neste caso, num navegador (Edge) com Tracking Prevention ativado. As funções `lsLoadCarteira`, `lsSaveCarteira` e `buildClienteRecord` (buscar por esses nomes no arquivo) já definem o formato de dado esperado e são um bom ponto de partida para adaptar a uma API REST. Recomenda-se também testar o app com as Ferramentas de Desenvolvedor abertas (F12 → Console) desde o primeiro carregamento, para capturar qualquer erro que ainda não foi identificado.

## 11. Aviso final

Este é um simulador de apoio à decisão, não um substituto de apuração oficial (PGDAS-D/DAS emitidos pela Receita Federal) nem de análise jurídica individualizada. Os parâmetros tributários foram inseridos com base em pesquisa e nas informações fornecidas ao longo do desenvolvimento, mas **não há nenhum mecanismo de atualização automática de legislação** — qualquer mudança normativa precisa ser replicada manualmente no código (ver seções 4.1 e 4.5 para onde estão as tabelas/constantes).
