# SGEP Backend

Backend do Sistema de Gestão da Experiência do Paciente para a Fundação Hospitalar Dr. Oswaldo Diesel.

## Stack

- Node.js 20
- JavaScript
- Express
- PostgreSQL + Supabase
- Zod
- Vitest + Supertest

## Scripts

- `npm install`
- `npm run dev`
- `npm test`
- `npm run migrate`
- `npm run seed`

## Conectar ao Supabase

O backend conecta ao PostgreSQL do Supabase usando `pg` (não precisa usar a chave
`anon` nem a `service_role`). Para configurar localmente:

1. No Supabase, abra seu projeto e vá em **Connect**. Copie os dados de conexão do
   **Session pooler**. O pooler é recomendado para backends hospedados, como no
   Render.
2. Crie seu arquivo local de ambiente copiando `.env.example` para `.env`.
3. Cole a URL de conexão em `DATABASE_URL` no `.env`, substituindo o marcador pela
   senha do banco. A URL deve ter o formato
   `postgresql://postgres.[PROJECT-REF]:[SENHA]@[HOST-DO-POOLER]:5432/postgres`.
   Use os valores exatos exibidos pelo botão **Connect** no seu projeto. Se a senha
   tiver caracteres especiais, use a versão codificada para URL.
4. Configure também `JWT_SECRET` com pelo menos 32 caracteres aleatórios.
5. Execute `npm run migrate` para criar as tabelas. Para inserir os dados iniciais
   e criar um administrador, configure `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`
   no `.env` e execute `npm run seed`.
6. Inicie o backend com `npm run dev` e verifique `http://localhost:3000/health`.
   Com a conexão ativa, a resposta inclui `"database":"connected"`.

O servidor carrega `.env` automaticamente, testa a conexão antes de iniciar e
encerra com erro se não conseguir conectar. Em produção, configure as variáveis no
painel da hospedagem (por exemplo, **Environment** no Render), em vez de enviar o
arquivo `.env`. TLS fica habilitado por padrão e valida o certificado do servidor.
Se o Node.js reportar `SELF_SIGNED_CERT_IN_CHAIN`, baixe o certificado CA oficial
do projeto em **Supabase > Database > Settings > SSL Configuration** e configure
seu conteúdo PEM na variável `DB_SSL_CA` do Render. A validação do certificado
continua ativa. Não use `DB_SSL=false` como correção. Não compartilhe nem faça
commit do `.env`, do certificado privado, da senha do banco ou de chaves do Supabase.

Como alternativa à `DATABASE_URL`, também é possível configurar `DB_HOST`,
`DB_PORT`, `DB_NAME`, `DB_USER` e `DB_PASSWORD`; não misture os dois formatos.
Configure `CORS_ORIGIN` com a URL pública do frontend. O Render fornece `PORT`
automaticamente.

## Estrutura

- `src/modules` — módulos de domínio
- `src/shared` — utilitários comuns
- `src/config` — configuração e conexão
- `database` — migrations e seed SQL

## Observações

A aplicação foi projetada para funcionar com Postgres em produção e com fallback em memória para execução local e testes quando a conexão ao banco não está disponível.

## Endpoints principais

- `GET /api/setores`
- `GET /api/setores/:slug/fluxo`
- `POST /api/pesquisas`
- `PUT /api/pesquisas/:id/respostas/:perguntaId`
- `POST /api/pesquisas/:id/finalizar`
- `GET /api/dashboard/resumo`
- `GET /api/dashboard/resumo?inicio=YYYY-MM-DD&fim=YYYY-MM-DD&setor_id=1`
- `GET /api/exportacoes/excel?inicio=YYYY-MM-DD&fim=YYYY-MM-DD&setor_id=1`
- `GET /api/exportacoes/pdf?inicio=YYYY-MM-DD&fim=YYYY-MM-DD&setor_id=1`
- `GET /api/admin/perguntas`
- `POST /api/admin/perguntas`
- `GET /api/admin/setores`
- `POST /api/admin/setores`
- `PATCH /api/admin/setores/:id`
- `DELETE /api/admin/setores/:id`
- `PUT /api/admin/perguntas/:id`
- `DELETE /api/admin/perguntas/:id`
- `PATCH /api/admin/perguntas/reordenar`
- `GET /api/tvwall`
- `GET /docs`

O dashboard aceita `inicio`, `fim` e `setor_id` em `/dashboard/resumo`,
`/dashboard/setores`, `/dashboard/setores/:id/turnos` e `/dashboard/em-andamento`.
`super_admin` pode administrar perguntas de qualquer setor. `gestao` e
`admin_setor` ficam limitados ao setor associado à conta; a Gestão também tem
seus filtros de dashboard e exportação fixados nesse setor. Para uma pergunta
comum aparecer em todos os setores, crie-a como super administrador com
`todos_setores: true` e `setor_id: null`; esse campo corresponde à opção
"todos os setores" do formulário. O NPS geral continua usando `geral: true`.
`visualizador`, `ouvidoria`, `gestao` e `super_admin` podem consultar o dashboard;
apenas `ouvidoria` e `super_admin` podem consultar ou atualizar manifestações.

As rotas `/api/exportacoes/excel` e `/api/exportacoes/pdf` retornam arquivos
baixáveis `.xlsx` e `.pdf`, com total de pesquisas, média das avaliações e NPS
por setor. Aceitam os filtros `inicio`, `fim` e `setor_id`; a Gestão recebe
somente os dados do setor vinculado à sua conta.

Ao cadastrar setor por `POST /api/admin/setores`, o backend normaliza o slug e
retorna `url: "/<slug>"` para o QR Code. O frontend deve tratar essa rota pública
de forma genérica e buscar o fluxo em `GET /api/setores/:slug/fluxo`; assim, novos
setores não precisam de rotas codificadas individualmente.

Ao iniciar uma pesquisa, `POST /api/pesquisas` também aceita opcionalmente
`data_atendimento` no formato `YYYY-MM-DD`. Esse campo guarda o dia informado
pelo paciente, separado de `data_hora`, que registra automaticamente o envio.

### Segurança do fluxo público

`POST /api/pesquisas` retorna `pesquisa_id` e `token`. Envie esse token no cabeçalho
`X-Pesquisa-Token` em todas as chamadas da pesquisa: salvar respostas, finalizar,
registrar contato e enviar manifestação. Um token não pode ser reutilizado em outra
pesquisa. Para contato após uma pesquisa anônima, o paciente precisa informar
`consentimento: true` e um telefone; só então o vínculo de contato é registrado.

O destino da finalização considera somente o NPS: notas de 0 a 6 retornam
`destino: "ouvidoria"` e notas de 7 a 10 retornam `destino: "agradecimento"`.
Uma média baixa nas perguntas anteriores não altera essa decisão.

Em produção, configure `DATABASE_URL` (ou o conjunto `DB_*`), `JWT_SECRET` com
ao menos 32 caracteres e `CORS_ORIGIN` com o domínio exato do frontend. O servidor
recusa iniciar em produção sem banco, com CORS curinga ou com segredo JWT fraco.
