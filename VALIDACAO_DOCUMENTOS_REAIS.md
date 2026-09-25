# Teste com o lote real — 24/09/2026

## Resultado e escopo

O fluxo principal foi exercitado no Chromium com todos os documentos recebidos, em PostgreSQL temporário isolado dos cadastros do usuário. A importação, os valores extraídos, as competências, o salvamento e a recuperação passaram nas verificações abaixo. Isso não constitui validação jurídica/tributária das fórmulas: elas foram preservadas conforme solicitado.

Inventário do material recebido: 10 PDFs, 13.923 XMLs extraídos, 54 ZIPs e 27 CSVs. A auditoria independente também abriu os ZIPs aninhados e encontrou 11.735 chaves de notas únicas no conjunto completo; 1.063 dessas notas não estavam entre os XMLs já extraídos. Entre os XMLs soltos, havia 3.251 cópias idênticas.

O diagnóstico salvo contém 11.772 documentos identificados: 11.735 notas, 27 CSVs e 10 PDFs. Foram detectadas três notas canceladas e duas de ajuste/devolução, respectivamente excluídas dos totais e sinalizadas para conferência. Esses documentos continuam visíveis na lista.

## Falhas encontradas e corrigidas

- O leitor antigo classificou os dez PDFs como desconhecidos; foi substituído por extração de texto com PDF.js local e interpretação dos campos/tabelas.
- RBT12, receita do período e competência passaram a ser lidos dos campos correspondentes do PGDAS, sem usar datas de abertura/geração ou acumulados como valores mensais.
- Ficha financeira: separação das seis colunas mensais e dos salários/pró-labore, sem usar o total semestral como folha de um mês.
- ZIPs, inclusive os aninhados, passaram a ser abertos no navegador; notas e arquivos repetidos não entram duas vezes.
- CSVs passaram a conferir a situação das notas, incluindo cancelamentos, sem acrescentar seus valores novamente.
- Consolidação por competência selecionada, com até seis meses escolhidos livremente no histórico. A receita do PGDAS é usada quando disponível, com aviso quando difere dos XMLs.
- Município lido na coluna correta do cartão CNPJ, sem concatenar o bairro.
- Removida a espera artificial por arquivo e limitada a lista visível a 50 itens por vez; todos os documentos continuam sendo processados e persistidos.
- Metadados da importação, seleção de meses, avisos e ajustes manuais preservados no banco ao reabrir o cliente. Reenvio de documentos já importados não altera valores nem duplica registros.
- Avisos de documentos pendentes e folha ausente aparecem na interface e no parecer.
- Corrigidos os ícones de arquivos no CSS compilado e a impressão dos relatórios: o modal fixo repetia a primeira página e cortava a conclusão; agora o parecer é paginado em fluxo normal.

## Verificações

- Sete testes automatizados de importação: PGDAS, folha em colunas, duplicação/chave conflitante, ZIP aninhado, cancelamento por CSV, XML inválido/CNPJ divergente e isolamento de competências.
- Dez PDFs reais reconhecidos: cartão CNPJ, oito PGDAS e ficha financeira.
- Receitas e RBT12 dos oito meses comparados à leitura independente por `pdftotext`.
- Conjunto completo das chaves fiscais e compras de cada mês comparados à auditoria independente em Python/XML/Decimal, incluindo cancelamentos e pendências.
- Reenvio de todos os 13.923 XMLs extraídos, dez PDFs e 27 CSVs: nenhum documento novo e nenhum valor duplicado.
- Histórico selecionado para janeiro–junho, em vez de manter obrigatoriamente os seis meses mais recentes.
- Salvamento de aproximadamente 10,7 MiB de dados extraídos por cliente; leitura do registro em outra sessão; reinício da API; preservação de correção manual; backup; abertura do parecer; tela móvel.
- Sem erros JavaScript não tratados no fluxo real. Na execução local registrada, o teste completo levou aproximadamente 86 segundos (tempo dependente do equipamento).
- O parecer real foi gerado em PDF, com quatro páginas diferentes, conclusão e assinatura final presentes. A tela móvel passou sem transbordamento horizontal.
- A imagem Docker foi construída e o fluxo de login, upload em ZIP, banco, backup e leitura dos dez PDFs reais passou em HTTPS com a política de segurança de produção.
- `npm run typecheck` passou. O teste de backend também compara os resultados dos três exemplos com o HTML original compilado separadamente.

## Pendências dos documentos e limites

A ficha financeira enviada cobre janeiro a junho. Não foram inventados salários para julho/agosto: esses meses são sinalizados como sem folha e precisam dos documentos ou de preenchimento conferido.

Há diferenças entre a receita declarada no PGDAS e as notas de algumas competências. O sistema apresenta essa diferença; não altera documentos para forçar a igualdade. As duas notas de ajuste/devolução exigem conferência do contador antes de decidir sua aplicação. A escolha de usar a receita do PGDAS está explícita na interface.

PDFs digitalizados sem texto não recebem OCR automático. CSVs são usados para conferência das notas, não como substituto universal de XML ou extrato bancário. As fórmulas e a interpretação tributária do HTML original não foram revisadas nesta entrega.

## Suíte histórica da versão moderna

`npm test` foi executado: 38 testes, 32 passaram e seis regressões preexistentes permaneceram. Elas são da versão moderna guardada, que não foi alterada nesta entrega:

1. Valor brasileiro inteiro com separador de milhar.
2. Competência PGDAS versus data de geração.
3. Receita acumulada versus faturamento mensal.
4. Classificação/leitura de folha.
5. Duas declarações PGDAS da mesma competência.
6. Recomendação para dados inválidos.

Não se deve interpretar a validação do fluxo original integrado como aprovação de toda a suíte antiga. Os sete testes de importação novos e a validação real exercitam os arquivos de `original/` usados pela aplicação principal.

## Reprodução e privacidade

```bash
npm run build
npm run test:original:import
npm run test:original:backend
npm run test:original:real
```

O teste real exige a pasta privada `Documentos Germano`, `pdftotext`, Python, PostgreSQL e Chromium. Relatórios detalhados e imagens ficam em `test-results/real-documents`, ignorado pelo Git. A pasta dos documentos também foi excluída do Git e do contexto Docker. O teste cria e remove seu próprio banco; não substitui nem apaga clientes do banco de uso.

### Correção posterior: tabela e cards

A fidelidade ao HTML original não garantia equivalência entre suas duas funções de cálculo. A aplicação agora usa `computeRegimesOriginal` como motor único: a tabela considera compras totais para a base de ICMS usada pelo simulador principal, crédito de CBS sem arredondamento do percentual e salário/pró-labore separados. Isso alinha as premissas internas; não constitui revisão legal dessas premissas.

Os documentos dos registros antigos recuperam as parcelas ausentes sem exigir reenvio. Sem documentos ou campos separados, históricos antigos mantêm compras informadas como compras totais e folha informada como salário; não é possível inferir parcelas desconhecidas. Alterações manuais no percentual diferentes do valor importado são preservadas.

Regressão: `npm run build && node --test tests/original-month-calculation.test.mjs`. O teste real também compara os três regimes da tabela com os cards em cada competência importada.
