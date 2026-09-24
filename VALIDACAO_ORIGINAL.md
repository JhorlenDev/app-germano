> Registro da entrega anterior, antes do lote real. A validação e as correções atuais do leitor estão em [VALIDACAO_DOCUMENTOS_REAIS.md](VALIDACAO_DOCUMENTOS_REAIS.md).

# HTML original com backend — validação de 24/09/2026

Esta entrega substitui o modo estático padrão do commit e9ce86f. O requisito final é manter o original e executá-lo com backend, login e banco no servidor.

## Implementado

- HTML original preservado byte a byte no arquivo de referência.
- Build com React 18 e CSS local; sem Babel ou Tailwind executados por CDN em produção. Fontes Google continuam externas, com fallback do próprio HTML.
- Adaptação de persistência para API Express/PostgreSQL, com o payload original completo, resultados e seis competências.
- Login por sessão, cookies HttpOnly/SameSite/Secure em produção, logout, verificação de origem e auditoria.
- Carteira compartilhada entre usuários autenticados; controle de versão bloqueia sobrescrita de outra sessão.
- Exemplos permanecem na interface, sem serem cadastrados automaticamente no banco.
- Autosave com indicação de falha e sem fallback silencioso para localStorage; backup JSON e restauração.
- Docker/Compose com PostgreSQL persistente e serviço `admin` para criar a primeira conta.
- Design anterior e respectivas tabelas preservados; nenhuma migração automática dos cadastros entre formatos.

## Verificação executada

- `npm run typecheck`: passou.
- `npm run build`: passou.
- `npm run build:moderno`: passou; aplicação anterior continua compilando.
- `npm run test:original:backend`: passou com Chromium real e PostgreSQL local.
  - Acesso anônimo bloqueado; login e logout funcionando.
  - Upload de cartão CNPJ e PGDAS sintéticos em TXT, com preenchimento e autosave no banco.
  - Identidade, RBT12 e competência persistidos; seis posições do histórico conservadas.
  - Resultados dos três exemplos iguais aos obtidos do HTML original compilado separadamente.
  - Cadastro aberto em outro contexto de navegador sem localStorage compartilhado.
  - Conflito entre duas sessões bloqueado, sem sobrescrever a primeira alteração.
  - Falha de rede simulada: aviso de não salvamento e ausência de cadastro no localStorage.
  - Origem indevida bloqueada e payload com CNPJ divergente rejeitado.
  - Parecer aberto; backup exportado, restaurado e confirmado após recarga; exclusão confirmada no banco.
  - Interface aberta em viewport móvel; sem erros JavaScript não tratados.
- `docker build -t gm-tributario-original:local .`: passou.
- `node tests/original-production.mjs`: a mesma integração passou contra o container com usuário `node`, NODE_ENV=production, PostgreSQL e proxy HTTPS local. Container temporário removido ao final.
- Compose validado com `docker compose config --quiet` usando valores fictícios de configuração.
- `git diff --exit-code -- diagnostico-tributario-2027-app.html`: referência sem alterações.
- Cadastros fictícios removidos após os testes; nenhum cadastro real removido.

## Limites desta validação

Não é uma revisão da legislação nem das fórmulas. Os cálculos e leitores de documentos mantêm o comportamento do HTML, inclusive suas limitações. Não foi validada a extração de todos os tipos de PDF, nem implementado OCR. Os arquivos brutos não são arquivados: são persistidos os dados extraídos e os diagnósticos.

A suíte antiga da versão moderna não foi reexecutada integralmente nesta entrega; suas falhas já registradas não foram alteradas. Os testes estáticos `test:original` e `test:original:ui` são da referência sem backend, não demonstram a persistência no servidor.

Execução local disponível em http://localhost:5173. Nenhum deploy em servidor remoto foi realizado: o pacote e o procedimento estão prontos no README, mas faltam os dados de acesso/domínio do servidor de destino.
