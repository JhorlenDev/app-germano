# G&M · Diagnóstico Tributário

Aplicação para um escritório contábil: carteira compartilhada, comparação de cenários para 2027, importação local de documentos e relatório imprimível. Visual baseado no `front-sgcas`: Nunito, azul, menu lateral claro, cartões arredondados e layout responsivo. O projeto de referência não foi modificado.

## Arquitetura

- React + TypeScript + Vite no frontend, com fontes, ícones e scripts servidos pela própria aplicação.
- Node.js + TypeScript + Express no backend.
- PostgreSQL: usuários, sessões, clientes, resultados versionados e registro das operações de cadastro/alteração/exclusão.
- Login por e-mail/senha (scrypt), sessão em cookie HttpOnly/SameSite e Secure em produção; verificação de origem nas mutações.
- Uma carteira compartilhada para todos os usuários cadastrados deste escritório. Não é um serviço multiempresa/multitenant.
- Salvamento automático após 1,2 segundo de inatividade quando há CNPJ completo, com confirmação do servidor e controle de versão. O botão Salvar continua disponível para tentar novamente em caso de erro.
- Arquivos XML/PDF/TXT originais não são armazenados. Dados extraídos e seus hashes são salvos com o diagnóstico. PDFs digitalizados não têm OCR.

O HTML e a documentação originais foram preservados como referência histórica. Eles **não** são os arquivos que devem ser publicados para executar esta versão.

## Cadastro por upload

Envie Cartão CNPJ, PGDAS ou XML na aba Documentos, sem preencher antes o cadastro.
Comprovantes e extratos reconhecidos também identificam o titular quando
trazem seu CNPJ, após a prioridade dos documentos fiscais.
O CNPJ é identificado nessa ordem de prioridade; documentos de outras empresas
são rejeitados. Cartão CNPJ preenche razão social, município/UF e CNAE quando
localizados. CNPJ digitado manualmente também ativa o salvamento automático;
não existe consulta à Receita pelo número. Sem razão social extraída, o registro
é identificado pelo CNPJ até que o nome seja preenchido.
Os documentos preenchem automaticamente os dados financeiros pelo mesmo
agregador do HTML original e atualizam até seis competências importadas no
histórico. A competência da simulação continua livre e não é sobrescrita pelo upload. Dados de demonstração
não são salvos automaticamente. Falhas de gravação ficam visíveis e preservam
o rascunho na tela; CNPJ já cadastrado exige abrir o cliente existente.

## Desenvolvimento local

Requisitos: Node >= 22.12, npm e PostgreSQL 16 (ou Docker).

1. `npm ci`
2. Copie `.env.example` para `.env` e ajuste `DATABASE_URL` e `APP_ORIGIN`.
3. Disponibilize um PostgreSQL vazio dedicado à aplicação.
4. Defina `ADMIN_NAME`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` (12 caracteres ou mais) no ambiente e execute `npm run user:create`.
5. `npm run dev`
6. Acesse http://localhost:5173. A API fica em 127.0.0.1:3001.

Na preparação inicial deste workspace foi criado um banco Docker dedicado chamado `gm-diagnostico-db`, volume `gm-diagnostico-data`, porta local 55432. As credenciais de desenvolvimento estão no `.env`, que não é versionado. Não há senha padrão no código. As migrações são executadas na inicialização.

A origem é verificada exatamente: use `localhost:5173`, ou configure `APP_ORIGIN` para a URL de rede que desejar utilizar. Em produção ela precisa ser HTTPS.

## Instalação no servidor com Docker Compose

1. Copie o projeto, sem `.env`, `node_modules`, `test-results` e sem o banco de desenvolvimento.
2. Crie `.env` no servidor com permissões restritas (`chmod 600 .env`):

```dotenv
POSTGRES_PASSWORD=SUBSTITUA_POR_UMA_SENHA_LONGA_HEXADECIMAL
APP_ORIGIN=https://tributario.seudominio.com.br
```

3. Configure o domínio HTTPS no Nginx/CloudPanel. Use o trecho em `scripts/nginx.conf.example` no vhost. Não exponha o PostgreSQL publicamente.
4. Execute `docker compose up -d --build`. A aplicação fica em `127.0.0.1:3087`.
5. Crie o primeiro usuário, informando a senha por entrada oculta:

```bash
read -r -p 'Nome: ' ADMIN_NAME
read -r -p 'E-mail: ' ADMIN_EMAIL
read -r -s -p 'Senha (mínimo 12 caracteres): ' ADMIN_PASSWORD
export ADMIN_NAME ADMIN_EMAIL ADMIN_PASSWORD
docker compose exec -e ADMIN_NAME -e ADMIN_EMAIL -e ADMIN_PASSWORD app npx tsx server/create-user.ts
unset ADMIN_PASSWORD
```

Use o mesmo procedimento para outros membros do escritório. Todas as contas têm acesso à mesma carteira. O cadastro de usuários é administrativo, por terminal; não há autoinscrição pública nem recuperação de senha por e-mail nesta versão.

6. Valide `/api/health` pelo domínio, login, cadastro e exportação. O cookie de produção exige HTTPS.

Nenhum deploy remoto é executado automaticamente por este repositório.

## Backup e restauração

**Pela interface:** exporta todos os clientes (sem limite de 50). A restauração valida o arquivo inteiro e insere somente CNPJs ausentes, preservando os existentes. Formato próprio `schemaVersion: 1`. Backups do HTML antigo precisam de conversão; não são aceitos silenciosamente. Contas de acesso e auditoria não fazem parte do JSON de clientes.

**Banco completo:** `./scripts/backup-db.sh` gera um dump PostgreSQL incluindo contas, sessões e auditoria. Agende em cron e copie para armazenamento separado. Não use apenas o volume Docker como backup.

Exemplo de agenda diária (ajuste o diretório real):

```cron
0 2 * * * cd /opt/gm-tributario && ./scripts/backup-db.sh >> /var/log/gm-backup.log 2>&1
```

Para restaurar em um ambiente de recuperação vazio:

```bash
docker compose exec -T db pg_restore -U diagnostico -d diagnostico --no-owner < backups/SEU_BACKUP.dump
```

Não aplique restauração completa sobre uma base em uso sem um plano de recuperação. O JSON da interface é a opção de importação não destrutiva para clientes ausentes.

## Escopo tributário e correções

Corrigidos: extração de números sem pontos de milhar; duplicidade por hash/chave NF-e; soma indevida de diferentes competências; resíduos de totais após remover documentos aplicados; divergência de fórmula entre mês e histórico; CBS personalizada zero; RAT do Anexo IV; Fator R por FS12 informado; recomendações automáticas em situações fora do escopo.

As alíquotas padrão configuráveis de CBS (8,7%) e IBS (0,1%) são **hipóteses de simulação**, não homologação das alíquotas de 2027. A retirada de PIS/Cofins do DAS no Híbrido continua sendo uma hipótese de partilha herdada, explicitada no relatório. Não houve homologação tributária completa.

- Benefícios dependem de percentuais confirmados pelo contador; não são atribuídos automaticamente por listas ilustrativas de NCM/CNAE.
- Fator R exige FS12 real informada e seleção explícita de atividade sujeita ao teste.
- Anexo IV considera 20% + RAT ajustado sobre empregados e 20% sobre pró-labore, sem terceiros.
- Crédito de ICMS é informado, não presumido sobre todas as compras. CBS/IBS usam base de compras elegíveis e alíquota padrão; créditos específicos e saldos acumulados exigem conferência.
- Não há indicação automática de menor custo para indústria, receita acima de R$ 3,6 milhões, dados insuficientes ou Fator R sem FS12. Os totais nesses cenários são parciais, para conferência.
- Histórico usa as premissas e RBT12 atuais para todos os meses; não reconstitui apuração fiscal.
- IRPJ adicional é uma projeção mensal, não apuração trimestral.
- Sem atividades mistas, ST, IPI/Seletivo, incentivos da ZFM, regime de caixa, início de atividade ou verificação remota de cancelamento de notas.
- O CNPJ aceito nesta versão é numérico de 14 dígitos. Não há consulta cadastral, validação de situação fiscal ou suporte ao formato alfanumérico.
- PDF usa PDF.js para extrair texto. Os valores identificados ainda precisam de revisão. Documentos sem CNPJ confirmado não entram nos totais.

Fontes consultadas na revisão:

- [Receita Federal — contribuição previdenciária do Anexo IV](https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/cobrancas-e-intimacoes/contribuicao-previdenciaria-anexo-iv-do-simples-nacional)
- [LC 214/2025, texto compilado](https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm)
- [Manual PGDAS-D](https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/MANUAL_PGDAS-D_2018_V4.pdf)

## Verificação

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Os testes de navegador requerem banco/usuário local, `.env` e Chromium do Playwright (`npx playwright install chromium`). Eles criam clientes temporários e os removem ao concluir. Cobrem cadastro, recarga, duplicatas, competências, remoção, impressão, backup, validação, sessão, conflito de versão e layout móvel. Screenshots e PDF de teste ficam em `test-results/`.

### Extratos e comprovantes de apoio

Comprovantes Bradesco/Caixa usam os dados do pagador; comprovantes de arrecadação
usam o contribuinte, sem confundir fornecedor ou beneficiário com o cliente.
Os extratos reconhecidos têm identificação e período; o relatório de vendas
Cielo também exibe seu resumo bruto/taxas/líquido. Esses documentos aparecem
como documentos de apoio e não alteram os valores fiscais da simulação.
O extrato Caixa sem CNPJ não é vinculado automaticamente apenas pelo nome.
Reenviar o mesmo PDF de apoio atualiza sua classificação sem duplicá-lo.

O leitor PDF reconstrói as linhas pela posição visual: a ordem interna de
objetos de alguns PDFs bancários é invertida. As fórmulas e os agregadores
fiscais originais permanecem inalterados.
