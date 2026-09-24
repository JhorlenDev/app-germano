# Diagnóstico Tributário — HTML original com servidor

A aplicação principal mantém o visual e as fórmulas do arquivo `diagnostico-tributario-2027-app.html`. O arquivo de referência permanece intacto. O build integra o React original ao login/API/PostgreSQL e ao leitor de documentos testado com o lote real. As correções de leitura e consolidação ficam em `original/import-runtime.js` e `original/upload-module.jsx`; o motor tributário não foi alterado.

Os clientes, os dados extraídos, as seis competências e os resultados são salvos automaticamente no servidor quando o CNPJ mestre está definido. A carteira é compartilhada entre os usuários autenticados desta instalação. O navegador não é o banco de dados. Os exemplos não são cadastrados automaticamente. O sistema impede que uma sessão sobrescreva uma versão alterada por outra.

PDF/XML/TXT/ZIP e CSV de conferência são lidos no navegador. PDFs usam PDF.js servido pela própria aplicação; ZIPs aninhados são expandidos localmente. Os arquivos brutos não são arquivados no servidor: ficam os dados extraídos e a lista de documentos necessária à conferência e à deduplicação após reabrir o cliente. PDFs sem texto precisam de OCR externo ou substituição por um documento com texto.

## Importar os documentos

1. Clique em **Cadastrar / Analisar Novo Cliente**.
2. Selecione o cartão CNPJ, os extratos PGDAS, a ficha financeira/folha e os XMLs ou ZIPs. No lote recebido, bastam os quatro arquivos da raiz de `Documentos Germano`: os dois PDFs e os dois ZIPs.
3. Aguarde o processamento e a mensagem de salvamento no servidor. Lotes grandes levam mais tempo; o contador mostra os arquivos lidos.
4. Escolha a **competência da simulação** e até seis competências para o histórico. Os meses não são somados como um único faturamento mensal.
5. Confira os avisos antes de emitir o parecer. Eles também acompanham o relatório.

A receita e o RBT12 vêm do PGDAS da competência selecionada, quando disponível. As notas alimentam compras, composição das operações e conferência da receita. Diferenças entre PGDAS e XMLs ficam visíveis. A ficha financeira é separada por mês, com salários e pró-labore em campos distintos. Ausência de folha em um mês é sinalizada, sem repetir o valor de outro mês.

Notas repetidas por conteúdo ou chave não são somadas novamente. CSVs com `CHAVE` e `SITUACAO` conferem cancelamentos, sem duplicar valores. Notas de ajuste/devolução ficam pendentes de conferência; documentos ilegíveis, sem titular identificado ou de outro CNPJ não alimentam os totais automaticamente. Quando há duas declarações PGDAS diferentes para o mesmo mês, é preciso conferir qual deve permanecer.

A lista mostra inicialmente 50 documentos para não travar a interface; o restante continua sendo processado, salvo e incluído no backup. A seleção de competências e os ajustes manuais são preservados ao reabrir o cliente.

## Testar localmente

Requisitos: Node.js 22.12+ e PostgreSQL. Instale com `npm ci`, copie `.env.example` para `.env` e configure `DATABASE_URL`, `ADMIN_NAME`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` (mínimo 12 caracteres). Nunca publique o `.env`.

```bash
npm run user:create
npm run dev
```

Abra http://localhost:5173 e entre com a conta criada. `npm run dev` compila o HTML e inicia a API na mesma porta. As tabelas são criadas automaticamente, sem apagar os cadastros existentes. Alterações no HTML/integração exigem `npm run build` e recarga da página.

Para iniciar sem modo de desenvolvimento: `npm run build` e `npm start` (porta definida por `PORT`, padrão 3001). Ajuste `APP_ORIGIN` para a URL efetivamente usada no navegador.

## Instalar no servidor

Use Docker Compose e um proxy HTTPS. No `.env` do servidor, configure:

```dotenv
POSTGRES_PASSWORD=SUBSTITUA_POR_UMA_SENHA_ALEATORIA_LONGA
APP_ORIGIN=https://diagnostico.seudominio.com.br
ADMIN_NAME=Administrador
ADMIN_EMAIL=administrador@seudominio.com.br
ADMIN_PASSWORD=SUBSTITUA_POR_UMA_SENHA_FORTE
```

Use uma senha do PostgreSQL com caracteres alfanuméricos para evitar problemas de codificação na URL de conexão. `APP_ORIGIN` deve corresponder exatamente ao domínio, sem barra final.

```bash
docker compose up -d --build
# Crie a primeira conta somente na primeira instalação:
docker compose run --rm admin
```

O proxy deve apontar para `127.0.0.1:3087`, preservar `Host` e enviar `X-Forwarded-Proto`/`X-Forwarded-For`. Configure também o limite do corpo das requisições para pelo menos **20 MB**: os dados extraídos de um lote grande podem superar 10 MB. No Nginx, use `client_max_body_size 20m;` no bloco da aplicação. A aplicação usa cookies seguros em produção e não aceita acesso de produção por HTTP. `/api/health` verifica também a conexão com o banco.

O PostgreSQL fica na rede interna do Compose, com volume persistente `postgres_data`. Atualizar com `docker compose up -d --build` preserva esse volume. **Não use `docker compose down -v` para atualizar**, pois esse comando remove os dados.

## Backup

O botão **Exportar Backup** baixa a carteira completa no formato JSON original; **Importar Backup** restaura esse formato. Backups JSON podem conter dados dos clientes e devem ser guardados com acesso restrito. Para incluir também usuários, sessões e auditoria, faça backup PostgreSQL:

```bash
docker compose exec -T db pg_dump -U diagnostico diagnostico > diagnostico.sql
```

## Validação

```bash
npm run typecheck
npm run build
npm run test:original:import
npm run test:original:backend
```

O teste de integração usa uma instância local em execução, as credenciais `ADMIN_*` do `.env` e um cadastro fictício isolado, removido ao final. Verifica upload, salvamento, duas sessões, conflito, backup, exclusão, login e igualdade dos cálculos com o HTML de referência. Veja `VALIDACAO_DOCUMENTOS_REAIS.md` e `VALIDACAO_ORIGINAL.md`.

Com a pasta privada de documentos disponível, `npm run test:original:real` audita todos os XMLs/ZIPs/CSVs com Python/Decimal e executa o lote real no Chromium contra um banco temporário separado. Exige `pdftotext`, Python 3, Chromium do Playwright e permissão para criar um banco de teste no PostgreSQL. O banco temporário é removido ao final. Arquivos e resultados privados ficam fora do Git e do Docker.

`TEST_PRINT=1 TEST_REAL_PDF=1 npm run test:original:production` verifica também os PDFs reais e a impressão dos anexos em HTTPS no container (primeiro construa a imagem `gm-tributario-original:local`).

A suíte histórica `npm test` cobre a versão moderna preservada: foram reexecutados 38 testes, com 32 passando e seis regressões preexistentes. Essas seis falhas estão discriminadas no relatório; os testes novos da aplicação principal ficam nos comandos `test:original:*`.

## Versão com o design anterior

O design anterior está preservado em `src/` e usa `npm run dev:moderno`, `npm run build:moderno`, `Dockerfile.moderno` e `compose.moderno.yaml`. Consulte `README.moderno.md`. As tabelas do modo moderno e do original são separadas; não há conversão automática dos cadastros entre os formatos. Isso preserva os dados e resultados já existentes de cada versão.

Para abrir apenas a referência estática, sem servidor/banco/login, existe `npm run dev:original:estatico`. Esse comando não é o modo de produção.
