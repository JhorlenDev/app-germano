# Cadastro e importação automáticos

Referência: `diagnostico-tributario-2027-app.html`, funções `UploadModule`,
`aggregateFiles`, `aggregateHistorico` e autosave de `App`.

## Comportamento restaurado

- Upload sem cadastro manual prévio. Prioridade do CNPJ: cartão, PGDAS, XML.
- Identidade extraída do cartão: razão social, município/UF, CNAE.
- Dados financeiros preenchidos pelo agrupador copiado do HTML original.
  XML de saída prevalece sobre receita PGDAS no lote; folha e pró-labore são
  agregados conforme o original. Sem impor seleção de mês/aplicação manual.
- Até seis competências identificadas atualizam o histórico; o mês da simulação
  é escolhido livremente e não é substituído pelo upload.
- Autosave após 1,2 segundo, com confirmação do servidor, controle de versão e
  erro visível. CNPJ sem nome também pode ser salvo, identificado pelo número.
- Metadados de documentos persistidos para manter agregação após recarga.
- Nenhuma alteração nas fórmulas em `computeRegimes`/`computeMonth`.
- Mantidas proteções existentes: sessão, CNPJ divergente, deduplicação por
  hash/chave, limites de arquivos e tratamento de XML não autorizado/especial.
- Corrigido overflow da tabela de clientes no mobile, isolando seu layout.

## Evidências

- `npm run typecheck`: passou.
- `npm run build`: passou.
- `npx tsx --test tests/engine.test.ts tests/import-workflow.test.ts`: 17 passaram.
  Inclui comparação dos agregadores com as funções executadas diretamente do
  HTML de referência, identidade, divergência, prioridade do cartão, seis meses
  e preservação da competência escolhida.
- `npm run test:e2e`: 6 passaram na execução final. Banco real local e navegador:
  cadastro, recarga, PDF.js, PGDAS/folha/seis XMLs, nome/CNAE, autosave, erro 503
  simulado e nova tentativa, concorrência, backup, impressão e mobile.
- Cadastros sintéticos removidos ao final; resíduos das primeiras execuções
  foram identificados pelos hashes dos documentos de teste e removidos.

## Pendências anteriores preservadas

A suite completa `npm test` executada nesta rodada ainda apresentou as seis
falhas já existentes em `tests/qa-regressions.test.ts` (18 passaram de 24 naquela
execução, antes da adição do teste de paridade). Não foi declarada aprovação
integral dessa suite. A pedido do usuário, não foram modificadas nesta entrega
as regras numéricas/classificação financeira para fazer esses testes passarem:

- número brasileiro com milhares sem centavos/centavos de um dígito;
- competência PGDAS confundida com data de geração;
- receita acumulada confundida com faturamento mensal;
- folha mencionando Simples classificada como PGDAS;
- duas declarações PGDAS da mesma competência somadas;
- recomendação do motor para benefícios com soma inválida (a interface/schema
  já rejeitam esses dados).

Essas limitações da leitura/cálculo permanecem; restauração do fluxo não significa
que qualquer modelo de extrato/PDF tenha todos os campos reconhecidos. Campos
não localizados continuam sujeitos à conferência, como no HTML.

Sem commit ou deploy nesta rodada.

## Correção do nome extraído do PDF

Relato: “Beneficiário Final:” foi usado como nome da empresa. A leitura
cadastral agora interrompe no próximo rótulo, rejeita rótulos sem valor e
busca outra ocorrência válida de Nome Empresarial/Razão Social. Um nome
já cadastrado não é sobrescrito quando a nova leitura não encontra nome.
Sem alteração de fórmulas ou de agregação financeira.

Validação: testes de texto/importação e typecheck passaram; os dois testes
de PDF em navegador passaram, incluindo PDFs sintéticos com campo ausente
e campo preenchido. O PDF específico do usuário não foi fornecido; não se
afirma que o nome correto desse documento foi identificado. Cadastros já
gravados não foram alterados automaticamente por esta correção.

## Validação com os seis PDFs fornecidos pelo usuário

Foram lidos localmente os seis arquivos indicados em Downloads. Nenhum PDF
real foi copiado para o repositório, usado como fixture versionada ou salvo
como cadastro durante a comparação. Testes permanentes usam dados sintéticos.

Comparação executada com as funções do HTML original (`FileReader` reproduzido
com leitura UTF-8, incluindo `crudeTextFromBinary`) e PDF.js real no navegador:

| Arquivo | Leitura do HTML original | Leitura corrigida |
| --- | --- | --- |
| Comprovante Bradesco | Cartão CNPJ, sem nome extraído | Comprovante bancário, titular e nome corretos |
| Comprovante Caixa | Cartão CNPJ, sem nome extraído | Comprovante bancário, titular e nome corretos |
| Comprovantes Receita | Cartão CNPJ, sem nome extraído | Comprovantes de arrecadação, contribuinte correto |
| Extrato Bradesco | Desconhecido | Extrato bancário, empresa e janeiro/2024 |
| Extrato Caixa | Desconhecido | Extrato bancário, nome e janeiro/2024; sem CNPJ confirmado |
| Extrato Cielo | Desconhecido | Relatório de vendas, CNPJ, janeiro/2024 e resumo financeiro |

O parser original não extraiu dados financeiros de nenhum desses seis PDFs.
O termo genérico “comprovante” no nome do arquivo acionava indevidamente a
leitura de Cartão CNPJ. A ordem interna dos objetos do PDF Bradesco também era
invertida em relação à página, gerando captura de rótulos e beneficiários.

Correções: ordem visual por coordenadas no PDF; classificação pelo conteúdo;
identidade no bloco do titular/pagador/contribuinte; documentos de apoio não
alteram totais ou histórico fiscal; resumo Cielo preservado no schema; reenvio
de apoio reprocessa classificação anterior sem duplicar o arquivo. Nenhuma
fórmula financeira ou função de agregação original foi alterada nesta rodada.

Evidências executadas:
- `/tmp/compare-tax-pdfs.mjs`: comparação individual dos seis documentos.
- `/tmp/verify-tax-pdfs.mjs`: asserts passaram para o lote real: schema válido,
  cinco documentos com o mesmo CNPJ e um sem CNPJ, nomes identificados da
  empresa, seis registros, nenhum classificado como cartão, dados financeiros
  prévios e competência escolhida preservados e resumo Cielo persistível.
- Testes direcionados iniciais: 29 passaram (engine, importação, nome e apoio).
- Quatro testes de navegador passaram: PDF comprimido, nomes em PDF, cadastro
  automático/erro de gravação e upload fiscal de seis meses.
- Typecheck e build passaram. Nova regressão cobre reenvio do comprovante com
  classificação/nome antigos, sem duplicar.
- As seis falhas anteriores da suite de QA continuam documentadas acima; não
  se declara aprovação integral da suite geral.

Limite: estes arquivos não contêm os campos necessários para preencher folha
bruta e RBT12. Converter transferências, resgates ou pagamentos em bases
fiscais seria uma regra nova, que não existia no HTML e não foi introduzida.
