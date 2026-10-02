export const openApiDocument = {
  openapi: '3.0.0',
  info: {
    title: 'SGEP API',
    version: '1.0.0',
    description: 'Sistema de Gestão da Experiência do Paciente da Fundação Hospitalar Dr. Oswaldo Diesel',
  },
  servers: [{ url: '/api' }],
  paths: {
    '/setores': {
      get: { summary: 'Lista setores ativos', responses: { '200': { description: 'OK' } } },
    },
    '/pesquisas': {
      post: { summary: 'Cria pesquisa', responses: { '201': { description: 'OK' } } },
    },
    '/dashboard/resumo': {
      get: { summary: 'Resumo do dashboard', responses: { '200': { description: 'OK' } } },
    },
    '/tvwall': {
      get: { summary: 'Dados agregados do TV Wall', responses: { '200': { description: 'OK' } } },
    },
  },
};
