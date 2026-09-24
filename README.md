# Diagnóstico Tributário — HTML original com servidor

A aplicação principal usa o visual, as fórmulas e os leitores de documentos do arquivo `diagnostico-tributario-2027-app.html`. O arquivo de referência permanece intacto. O build compila o React original e adapta somente a integração de armazenamento: login por sessão, API Express e PostgreSQL.

Os clientes, os dados extraídos, as seis competências e os resultados são salvos automaticamente no servidor quando o CNPJ mestre está definido. A carteira é compartilhada entre os usuários autenticados desta instalação. O navegador não é o banco de dados. Os exemplos não são cadastrados automaticamente. O sistema impede que uma sessão sobrescreva uma versão alterada por outra.

Os arquivos PDF/XML/TXT são lidos pelo navegador, como no HTML original; os arquivos brutos não são arquivados no servidor. A persistência não altera as limitações de extração do original: PDFs sem texto reconhecível podem exigir ajuste manual. Não há OCR novo nesta versão.

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

O proxy deve apontar para `127.0.0.1:3087`, preservar `Host` e enviar `X-Forwarded-Proto`/`X-Forwarded-For`. A aplicação usa cookies seguros em produção e não aceita acesso de produção por HTTP. `/api/health` verifica também a conexão com o banco.

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
npm run test:original:backend
```

O teste de integração usa uma instância local em execução, as credenciais `ADMIN_*` do `.env` e um cadastro fictício isolado, removido ao final. Verifica upload, salvamento, duas sessões, conflito, backup, exclusão, login e igualdade dos cálculos com o HTML de referência. Veja `VALIDACAO_ORIGINAL.md`.

## Versão com o design anterior

O design anterior está preservado em `src/` e usa `npm run dev:moderno`, `npm run build:moderno`, `Dockerfile.moderno` e `compose.moderno.yaml`. Consulte `README.moderno.md`. As tabelas do modo moderno e do original são separadas; não há conversão automática dos cadastros entre os formatos. Isso preserva os dados e resultados já existentes de cada versão.

Para abrir apenas a referência estática, sem servidor/banco/login, existe `npm run dev:original:estatico`. Esse comando não é o modo de produção.
