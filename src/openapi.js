const dashboardFilterParameters = () => [
  { name: 'inicio', in: 'query', required: false, schema: { type: 'string', format: 'date' } },
  { name: 'fim', in: 'query', required: false, schema: { type: 'string', format: 'date' } },
  { name: 'setor_id', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
];

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
      pesquisaToken: { type: 'apiKey', in: 'header', name: 'X-Pesquisa-Token' },
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
        security: [],
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
        security: [],
        responses: {
          '200': { description: 'Lista de setores', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Setor' } } } } },
        },
      },
    },
    '/setores/{slug}': {
      get: {
        summary: 'Detalha um setor',
        security: [],
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
        security: [],
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
        security: [],
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
        security: [],
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
                  data_atendimento: { type: 'string', format: 'date', description: 'Dia em que o paciente foi atendido, no formato YYYY-MM-DD' },
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
        security: [{ pesquisaToken: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'perguntaId', in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'X-Pesquisa-Token', in: 'header', required: true, schema: { type: 'string' } },
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
        security: [{ pesquisaToken: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }, { name: 'X-Pesquisa-Token', in: 'header', required: true, schema: { type: 'string' } }],
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
        security: [{ pesquisaToken: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }, { name: 'X-Pesquisa-Token', in: 'header', required: true, schema: { type: 'string' } }],
        responses: {
          '201': { description: 'Paciente registrado' },
          '400': { description: 'Consentimento inválido ou payload inválido' },
        },
      },
    },
    '/pesquisas/{id}/manifestacoes': {
      post: {
        summary: 'Cria uma manifestação a partir da pesquisa',
        security: [{ pesquisaToken: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }, { name: 'X-Pesquisa-Token', in: 'header', required: true, schema: { type: 'string' } }],
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
        parameters: dashboardFilterParameters(),
        responses: {
          '200': { description: 'Resumo do dashboard' },
        },
      },
    },
    '/dashboard/setores': {
      get: {
        summary: 'Resumo por setor',
        security: [{ bearerAuth: [] }],
        parameters: dashboardFilterParameters(),
        responses: {
          '200': { description: 'Dados resumidos por setor' },
        },
      },
    },
    '/dashboard/setores/{id}/turnos': {
      get: {
        summary: 'Resumo por turno de um setor',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }, ...dashboardFilterParameters()],
        responses: {
          '200': { description: 'Dados por turno' },
        },
      },
    },
    '/dashboard/em-andamento': {
      get: {
        summary: 'Pesquisas em andamento',
        security: [{ bearerAuth: [] }],
        parameters: dashboardFilterParameters(),
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
        parameters: dashboardFilterParameters(),
        responses: {
          '200': { description: 'Arquivo Excel .xlsx para download', content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: { type: 'string', format: 'binary' } } } },
        },
      },
    },
    '/exportacoes/pdf': {
      get: {
        summary: 'Exporta dados em PDF',
        security: [{ bearerAuth: [] }],
        parameters: dashboardFilterParameters(),
        responses: {
          '200': { description: 'Arquivo PDF para download', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } },
        },
      },
    },
    '/admin/perguntas': {
      get: {
        summary: 'Lista perguntas administrativas',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Perguntas com opções de resposta' }, '403': { description: 'Permissão insuficiente' } },
      },
      post: {
        summary: 'Cria uma pergunta',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['texto', 'tipo', 'ordem'], properties: { texto: { type: 'string' }, tipo: { type: 'string', enum: ['rostinho', 'texto', 'multipla', 'nps'] }, setor_id: { type: 'integer', nullable: true }, geral: { type: 'boolean', description: 'Pergunta NPS geral obrigatória' }, todos_setores: { type: 'boolean', description: 'Exibe a pergunta em todos os setores; exclusiva do super administrador' }, ordem: { type: 'integer' }, obrigatoria: { type: 'boolean' }, ativo: { type: 'boolean' }, opcoes: { type: 'array', items: { type: 'object', properties: { valor: { type: 'integer' }, rotulo: { type: 'string' }, emoji: { type: 'string' } } } } } } } } },
        responses: { '201': { description: 'Pergunta criada' }, '400': { description: 'Dados inválidos' }, '409': { description: 'Pergunta NPS geral já existe' } },
      },
    },
    '/admin/perguntas/{id}': {
      put: { summary: 'Edita pergunta e opções', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Pergunta atualizada' }, '403': { description: 'Permissão insuficiente para o setor' }, '404': { description: 'Pergunta não encontrada' } } },
      delete: { summary: 'Desativa uma pergunta sem apagar histórico', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Pergunta desativada' }, '404': { description: 'Pergunta não encontrada' } } },
    },
    '/admin/perguntas/reordenar': {
      patch: { summary: 'Reordena perguntas em transação', security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['perguntas'], properties: { perguntas: { type: 'array', items: { type: 'object', required: ['id', 'ordem'], properties: { id: { type: 'integer' }, ordem: { type: 'integer' } } } } } } } } }, responses: { '200': { description: 'Ordem atualizada' }, '400': { description: 'IDs ou ordens inválidas' } } },
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
    '/admin/setores/{id}': {
      patch: {
        summary: 'Atualiza parcialmente um setor; alterar o slug atualiza a URL pública e o QR Code',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { nome: { type: 'string' }, slug: { type: 'string' }, ativo: { type: 'boolean' } } } } } },
        responses: { '200': { description: 'Setor atualizado' }, '400': { description: 'Dados inválidos' }, '404': { description: 'Setor não encontrado' }, '409': { description: 'Slug já utilizado' } },
      },
      delete: {
        summary: 'Desativa um setor sem apagar pesquisas e histórico',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Setor desativado' }, '404': { description: 'Setor não encontrado' } },
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
