# Relatório de testes

## Identificação da execução

- Projeto: SGEP Backend
- Data: 24/11/2026
- Comando: `npm test`
- Ferramentas: Vitest 2.1.9 e Supertest 7
- Resultado: **aprovado**
- Duração reportada pelo Vitest: 14,30 s

## Resultado consolidado

| Indicador | Resultado |
|---|---:|
| Arquivos de teste aprovados | 9 de 9 |
| Testes aprovados | 32 de 32 |
| Testes com falha | 0 |

## Cobertura executada

| Arquivo de testes | Testes aprovados |
|---|---:|
| `src/modules/pesquisa/pesquisa.routes.test.js` | 7 |
| `src/modules/dashboard/dashboard.routes.test.js` | 4 |
| `src/modules/admin/admin.routes.test.js` | 9 |
| `src/modules/ouvidoria/ouvidoria.routes.test.js` | 1 |
| `src/modules/exportacao/exportacao.routes.test.js` | 2 |
| `src/modules/jobs/jobs.routes.test.js` | 2 |
| `src/modules/auth/auth.routes.test.js` | 3 |
| `src/app.test.js` | 2 |
| `src/shared/metrics.test.js` | 2 |

Os testes cobrem as rotas de pesquisas, dashboard, administração, ouvidoria,
exportações, jobs e autenticação, além das métricas compartilhadas. A suíte
também verifica que `/docs/` entrega a interface Swagger interativa e que
`/docs/openapi.json` entrega a especificação OpenAPI.

## Ambiente e limitações

A execução utilizou o fallback em memória: não havia conexão PostgreSQL
configurada no ambiente. Portanto, os resultados validam os testes automatizados
da aplicação, mas não representam um teste de integração com banco PostgreSQL.
O comando executado não coletou métricas de cobertura de código.

## Conclusão

A suíte automatizada concluiu sem falhas: **32 testes aprovados em 9 arquivos**.
