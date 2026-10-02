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
- `GET /api/tvwall`
- `GET /docs`
