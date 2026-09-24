# Execução do HTML original

Pedido confirmado: usar o HTML original, com visual e comportamento originais,
conservando a versão moderna separadamente.

## Entrega

- `npm run dev` / `npm start`: servidor da página original, porta padrão 5173.
- `npm run build`: gera `dist-original/index.html` sem transformação e inclui
  servidor Node para hospedagem como serviço.
- Docker/Compose padrão: HTML original na porta interna 3001, publicada em
  127.0.0.1:3087, sem exigir PostgreSQL ou variáveis de banco.
- Versão moderna preservada em src/shared/server e no commit 1c85c18,
  com README.moderno.md, Dockerfile.moderno, compose.moderno.yaml e scripts
  dev:moderno/build:moderno/start:moderno.
- O HTML original não recebeu alterações. Cadastros continuam no localStorage
  do navegador quando executado fora do Claude. Nenhum dado PostgreSQL foi
  apagado ou convertido.

## Verificação executada

- `npm run test:original`: 3 testes passaram (bytes idênticos, rotas restritas,
  HEAD/health sem banco).
- `npm run test:original:ui`: renderização, cadastro sintético, autosave local,
  recarga e abertura do parecer passaram em navegador real; nenhum pageerror.
  Viewports desktop e mobile foram usados, sem alterar o layout original.
- `npm run build`: passou; `cmp` confirmou igualdade de index.html gerado com
  o HTML original. `git diff --quiet HEAD -- diagnostico-tributario-2027-app.html`
  confirmou ausência de alterações no arquivo de referência.
- `npm run typecheck`: passou.
- `docker build -t gm-tributario-original:local .`: passou.
- Container executado com usuário node: resposta HTTP igual aos bytes do HTML
  original e health 200. Container temporário encerrado após a verificação.
- `docker compose config --quiet` e `git diff --check`: passaram.

Primeiros testes do container detectaram permissões herdadas do HTML (0600)
e diretório scripts sem execução. Dockerfile corrigido com permissões explícitas;
a verificação final acima passou.

O servidor original está disponível localmente em http://localhost:5173.
Nenhum deploy foi executado em servidor remoto nesta rodada.
As dependências externas e limitações funcionais são as do HTML original.
