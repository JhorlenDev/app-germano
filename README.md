# Diagnóstico Tributário — HTML original

A versão principal serve **exatamente** `diagnostico-tributario-2027-app.html`.
O arquivo original não foi alterado: visual, fórmulas, leitura de documentos,
exemplos e salvamento seguem seu comportamento original.

## Rodar

Com Node.js 22 instalado, sem precisar instalar dependências:

```bash
npm run dev
```

Abra http://localhost:5173. Para outra porta/interface:

```bash
HOST=0.0.0.0 PORT=3087 npm start
```

## Publicar

Para publicar em hospedagem estática, execute `npm run build` e envie
`dist-original/index.html` como página inicial. O HTML usa os serviços externos
originais de React, Babel, Tailwind e Google Fonts; precisa de acesso à internet.

Para rodar como serviço Node, envie a pasta `dist-original` e execute:

```bash
HOST=0.0.0.0 PORT=3087 node dist-original/scripts/serve-original.mjs
```

Com Docker:

```bash
docker compose up -d --build app
```

O serviço fica em `127.0.0.1:3087`, compatível com o proxy reverso existente.
O servidor só expõe a página original e a rota de saúde, não arquivos do projeto.

## Onde ficam os cadastros

Fora do Claude, o HTML original salva na carteira local do navegador
(`localStorage`). Use seus botões de exportação/importação para backup.
Esta versão não usa login ou PostgreSQL e não sincroniza cadastros entre
computadores. Os dados do banco da versão moderna não são migrados ou apagados.

## Versão moderna preservada

O visual moderno e o backend continuam no repositório, em `src`, `shared` e
`server`. Também estão preservados no Git, no commit `1c85c18`.

- Documentação: [README.moderno.md](README.moderno.md).
- Desenvolvimento: `npm run dev:moderno` (com banco e `.env` configurados).
- Build: `npm run build:moderno`.
- Produção: `npm run start:moderno`.
- Docker: `docker compose -f compose.moderno.yaml up -d --build`.

Execute uma versão por vez: as portas padrão são compartilhadas.
Os testes existentes de aplicação/motor continuam destinados à versão moderna.
`npm run test:original` verifica o servidor da versão original.
`npm run test:original:ui` testa cadastro e recarga no navegador (requer `npm ci`).
