export const openApiDocument = {
  openapi: '3.0.0',
  info: {
    title: 'SGEP API',
    version: '1.0.0',
    description: 'Sistema de Gestão da Experiência do Paciente da Fundação Hospitalar Dr. Oswaldo Diesel',
  },
  servers: [{ url: '/api' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      Setor: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          nome: { type: 'string' },
          slug: { type: 'string' },
          url: { type: 'string' },
          qrcode: { type: 'string' },
          ativo: { type: 'boolean' },
        },
      },
      Usuario: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          nome: { type: 'string' },
          email: { type: 'string' },
          perfil: { type: 'string' },
          setor_id: { type: ['integer', 'null'] },
          permissoes: { type: 'array', items: { type: 'string' } },
        },
      },
      AuthLoginRequest: {
        type: 'object',
        required: ['email', 'senha'],
        properties: {
          email: { type: 'string', format: 'email' },
          senha: { type: 'string', minLength: 4 },
        },
      },
      AuthLoginResponse: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          usuario: { $ref: '#/components/schemas/Usuario' },
        },
      },
      PesquisaCriada: {
        type: 'object',
        properties: {
          pesquisa_id: { type: 'integer' },
          token: { type: 'string' },
          setor: { type: 'string' },
        },
      },
      RespostaRequest: {
        type: 'object',
        properties: {
          valor: { type: 'integer', minimum: 0, maximum: 10 },
          texto: { type: 'string' },
          opcao_id: { type: 'integer' },
          pergunta_id: { type: 'integer' },
        },
      },
      Manifestacao: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          pesquisa_id: { type: 'integer' },
          tipo: { type: 'string', enum: ['elogio', 'reclamacao', 'sugestao'] },
          descricao: { type: 'string' },
          status: { type: 'string' },
          data: { type: 'string', format: 'date-time' },
          anonimo: { type: 'boolean' },
          origem: { type: 'string' },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/auth/login': {
      post: {
        summary: 'Login do usuário',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AuthLoginRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'Login realizado com sucesso', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthLoginResponse' } } } },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Credenciais inválidas' },
        },
      },
    },
    '/auth/me': {
      get: {
        summary: 'Retorna o usuário autenticado',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Usuário autenticado', content: { 'application/json': { schema: { type: 'object', properties: { usuario: { $ref: '#/components/schemas/Usuario' } } } } } },
          '401': { description: 'Token ausente ou inválido' },
        },
      },
    },
    '/setores': {
      get: {
        summary: 'Lista setores ativos',
        responses: {
          '200': { description: 'Lista de setores', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Setor' } } } } },
        },
      },
    },
    '/setores/{slug}': {
      get: {
        summary: 'Detalha um setor',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Setor encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Setor' } } } },
          '404': { description: 'Setor não encontrado' },
        },
      },
    },
    '/setores/{slug}/fluxo': {
      get: {
        summary: 'Retorna o fluxo da pesquisa por setor',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Fluxo retornado com sucesso' },
          '404': { description: 'Setor não encontrado' },
        },
      },
    },
    '/setores/{slug}/perguntas/{n}': {
      get: {
        summary: 'Busca uma pergunta específica do fluxo',
        parameters: [
          { name: 'slug', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'n', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': { description: 'Pergunta retornada' },
          '404': { description: 'Pergunta não encontrada' },
        },
      },
    },
    '/pesquisas': {
      post: {
        summary: 'Cria uma pesquisa para um setor',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['setor_id'],
                properties: {
                  setor_id: { type: 'integer' },
                  anonimo: { type: 'boolean' },
                  consentimento: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Pesquisa criada com sucesso', content: { 'application/json': { schema: { $ref: '#/components/schemas/PesquisaCriada' } } } },
          '404': { description: 'Setor não encontrado' },
        },
      },
    },
    '/pesquisas/{id}/respostas/{perguntaId}': {
      put: {
        summary: 'Salva ou atualiza a resposta de uma pergunta',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'perguntaId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RespostaRequest' } } },
        },
        responses: {
          '200': { description: 'Resposta salva com sucesso' },
          '404': { description: 'Pesquisa ou pergunta não encontrada' },
          '400': { description: 'Dados inválidos' },
        },
      },
    },
    '/pesquisas/{id}/finalizar': {
      post: {
        summary: 'Finaliza a pesquisa e decide destino',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          '200': { description: 'Pesquisa finalizada', content: { 'application/json': { schema: { type: 'object', properties: { destino: { type: 'string' }, motivo: { type: 'string' } } } } } },
          '404': { description: 'Pesquisa não encontrada' },
          '422': { description: 'NPS obrigatório antes de finalizar' },
        },
      },
    },
    '/pesquisas/{id}/paciente': {
      post: {
        summary: 'Registra dados do paciente com consentimento',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          '201': { description: 'Paciente registrado' },
          '400': { description: 'Consentimento inválido ou payload inválido' },
        },
      },
    },
    '/pesquisas/{id}/manifestacoes': {
      post: {
        summary: 'Cria uma manifestação a partir da pesquisa',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          '201': { description: 'Manifestação criada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Manifestacao' } } } },
        },
      },
    },
    '/manifestacoes': {
      get: {
        summary: 'Lista manifestações',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Lista de manifestações', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Manifestacao' } } } } },
        },
      },
    },
    '/manifestacoes/{id}': {
      get: {
        summary: 'Detalha uma manifestação',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          '200': { description: 'Manifestação detalhada' },
          '404': { description: 'Manifestação não encontrada' },
        },
      },
      patch: {
        summary: 'Atualiza status ou parecer de uma manifestação',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          '200': { description: 'Manifestação atualizada' },
          '404': { description: 'Manifestação não encontrada' },
        },
      },
    },
    '/dashboard/resumo': {
      get: {
        summary: 'Resumo geral do dashboard',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Resumo do dashboard' },
        },
      },
    },
    '/dashboard/setores': {
      get: {
        summary: 'Resumo por setor',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Dados resumidos por setor' },
        },
      },
    },
    '/dashboard/setores/{id}/turnos': {
      get: {
        summary: 'Resumo por turno de um setor',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          '200': { description: 'Dados por turno' },
        },
      },
    },
    '/dashboard/em-andamento': {
      get: {
        summary: 'Pesquisas em andamento',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Lista de pesquisas em andamento' },
        },
      },
    },
    '/tvwall': {
      get: {
        summary: 'Dados agregados para TV Wall',
        responses: {
          '200': { description: 'Dados agregados da experiência do paciente' },
        },
      },
    },
    '/jobs/abandono': {
      get: {
        summary: 'Monitora pesquisas em abandono',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Métricas de abandono' },
        },
      },
    },
    '/jobs/retencao': {
      get: {
        summary: 'Calcula indicador de retenção',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Métricas de retenção' },
        },
      },
    },
    '/exportacoes/excel': {
      get: {
        summary: 'Exporta dados em Excel',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Exportação concluída' },
        },
      },
    },
    '/exportacoes/pdf': {
      get: {
        summary: 'Exporta dados em PDF',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Exportação concluída' },
        },
      },
    },
    '/admin/setores': {
      get: {
        summary: 'Lista setores administrativos',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Lista de setores' },
        },
      },
      post: {
        summary: 'Cria setor administrativo',
        security: [{ bearerAuth: [] }],
        responses: {
          '201': { description: 'Setor criado' },
        },
      },
    },
    '/admin/perfis': {
      get: {
        summary: 'Lista perfis disponíveis',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Lista de perfis' },
        },
      },
    },
    '/admin/usuarios': {
      get: {
        summary: 'Lista usuários do sistema',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Lista de usuários' },
        },
      },
    },
  },
};
