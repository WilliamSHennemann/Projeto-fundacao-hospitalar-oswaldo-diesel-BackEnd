export const appStore = {
  hospitals: [
    {
      id: 1,
      nome: 'Fundação Hospitalar Dr. Oswaldo Diesel',
      cnpj: '12.345.678/0001-90',
      endereco: 'Rua das Flores, 100',
      criado_em: new Date().toISOString(),
    },
  ],
  setores: [
    { id: 1, hospital_id: 1, nome: 'Recepção', slug: 'recepcao', url: '/recepcao', qrcode: 'qr-recepcao', ativo: true },
    { id: 2, hospital_id: 1, nome: 'Triagem', slug: 'triagem', url: '/triagem', qrcode: 'qr-triagem', ativo: true },
    { id: 3, hospital_id: 1, nome: 'Enfermagem', slug: 'enfermagem', url: '/enfermagem', qrcode: 'qr-enfermagem', ativo: true },
    { id: 4, hospital_id: 1, nome: 'Médico', slug: 'medico', url: '/medico', qrcode: 'qr-medico', ativo: true },
    { id: 5, hospital_id: 1, nome: 'Internação', slug: 'internacao', url: '/internacao', qrcode: 'qr-internacao', ativo: true },
    { id: 6, hospital_id: 1, nome: 'Raio-X', slug: 'raio-x', url: '/raio-x', qrcode: 'qr-raio-x', ativo: true },
  ],
  rotas: [
    { id: 1, setor_id: 1, caminho: '/recepcao', ordem: 1, ativo: true },
    { id: 2, setor_id: 2, caminho: '/triagem', ordem: 1, ativo: true },
    { id: 3, setor_id: 3, caminho: '/enfermagem', ordem: 1, ativo: true },
    { id: 4, setor_id: 4, caminho: '/medico', ordem: 1, ativo: true },
    { id: 5, setor_id: 5, caminho: '/internacao', ordem: 1, ativo: true },
    { id: 6, setor_id: 6, caminho: '/raio-x', ordem: 1, ativo: true },
  ],
  perguntas: [
    { id: 1, hospital_id: 1, setor_id: 1, rota_id: 1, texto: 'Como você avalia a recepção?', tipo: 'rostinho', geral: false, ordem: 1, obrigatoria: false, ativo: true },
    { id: 2, hospital_id: 1, setor_id: 2, rota_id: 2, texto: 'Como você avalia a triagem?', tipo: 'rostinho', geral: false, ordem: 1, obrigatoria: false, ativo: true },
    { id: 3, hospital_id: 1, setor_id: 3, rota_id: 3, texto: 'Como você avalia a enfermagem?', tipo: 'rostinho', geral: false, ordem: 1, obrigatoria: false, ativo: true },
    { id: 4, hospital_id: 1, setor_id: 4, rota_id: 4, texto: 'Como você avalia o atendimento médico?', tipo: 'rostinho', geral: false, ordem: 1, obrigatoria: false, ativo: true },
    { id: 5, hospital_id: 1, setor_id: 5, rota_id: 5, texto: 'Como você avalia a internação?', tipo: 'rostinho', geral: false, ordem: 1, obrigatoria: false, ativo: true },
    { id: 6, hospital_id: 1, setor_id: 6, rota_id: 6, texto: 'Como você avalia o serviço de raio-x?', tipo: 'rostinho', geral: false, ordem: 1, obrigatoria: false, ativo: true },
    {
      id: 7,
      hospital_id: 1,
      setor_id: null,
      rota_id: null,
      texto: 'De 0 a 10, o quanto você recomendaria a Fundação a um amigo ou familiar?',
      tipo: 'nps',
      geral: true,
      ordem: 99,
      obrigatoria: true,
      ativo: true,
    },
  ],
  opcoesResposta: [
    { id: 1, pergunta_id: 1, valor: 1, rotulo: 'Muito ruim', emoji: '😡' },
    { id: 2, pergunta_id: 1, valor: 2, rotulo: 'Ruim', emoji: '🙁' },
    { id: 3, pergunta_id: 1, valor: 3, rotulo: 'Neutro', emoji: '😐' },
    { id: 4, pergunta_id: 1, valor: 4, rotulo: 'Bom', emoji: '🙂' },
    { id: 5, pergunta_id: 1, valor: 5, rotulo: 'Muito bom', emoji: '😍' },
    { id: 6, pergunta_id: 2, valor: 1, rotulo: 'Muito ruim', emoji: '😡' },
    { id: 7, pergunta_id: 2, valor: 2, rotulo: 'Ruim', emoji: '🙁' },
    { id: 8, pergunta_id: 2, valor: 3, rotulo: 'Neutro', emoji: '😐' },
    { id: 9, pergunta_id: 2, valor: 4, rotulo: 'Bom', emoji: '🙂' },
    { id: 10, pergunta_id: 2, valor: 5, rotulo: 'Muito bom', emoji: '😍' },
    { id: 11, pergunta_id: 3, valor: 1, rotulo: 'Muito ruim', emoji: '😡' },
    { id: 12, pergunta_id: 3, valor: 2, rotulo: 'Ruim', emoji: '🙁' },
    { id: 13, pergunta_id: 3, valor: 3, rotulo: 'Neutro', emoji: '😐' },
    { id: 14, pergunta_id: 3, valor: 4, rotulo: 'Bom', emoji: '🙂' },
    { id: 15, pergunta_id: 3, valor: 5, rotulo: 'Muito bom', emoji: '😍' },
    { id: 16, pergunta_id: 4, valor: 1, rotulo: 'Muito ruim', emoji: '😡' },
    { id: 17, pergunta_id: 4, valor: 2, rotulo: 'Ruim', emoji: '🙁' },
    { id: 18, pergunta_id: 4, valor: 3, rotulo: 'Neutro', emoji: '😐' },
    { id: 19, pergunta_id: 4, valor: 4, rotulo: 'Bom', emoji: '🙂' },
    { id: 20, pergunta_id: 4, valor: 5, rotulo: 'Muito bom', emoji: '😍' },
    { id: 21, pergunta_id: 5, valor: 1, rotulo: 'Muito ruim', emoji: '😡' },
    { id: 22, pergunta_id: 5, valor: 2, rotulo: 'Ruim', emoji: '🙁' },
    { id: 23, pergunta_id: 5, valor: 3, rotulo: 'Neutro', emoji: '😐' },
    { id: 24, pergunta_id: 5, valor: 4, rotulo: 'Bom', emoji: '🙂' },
    { id: 25, pergunta_id: 5, valor: 5, rotulo: 'Muito bom', emoji: '😍' },
    { id: 26, pergunta_id: 6, valor: 1, rotulo: 'Muito ruim', emoji: '😡' },
    { id: 27, pergunta_id: 6, valor: 2, rotulo: 'Ruim', emoji: '🙁' },
    { id: 28, pergunta_id: 6, valor: 3, rotulo: 'Neutro', emoji: '😐' },
    { id: 29, pergunta_id: 6, valor: 4, rotulo: 'Bom', emoji: '🙂' },
    { id: 30, pergunta_id: 6, valor: 5, rotulo: 'Muito bom', emoji: '😍' },
  ],
  pacientes: [],
  pesquisas: [],
  respostas: [],
  manifestacoes: [],
  configuracoes: [
    { hospital_id: 1, chave: 'limiar_media_baixa', valor: { valor: 2 } },
    { hospital_id: 1, chave: 'limiar_nps_baixo', valor: { valor: 6 } },
    { hospital_id: 1, chave: 'minutos_abandono', valor: { valor: 30 } },
    { hospital_id: 1, chave: 'retencao_dias', valor: { valor: 365 } },
  ],
  usuarios: [
    { id: 1, nome: 'Super Admin', email: 'super@fundacao.com', perfil_id: 1, setor_id: null, ativo: true },
    { id: 2, nome: 'Ouvidoria', email: 'ouvidoria@fundacao.com', perfil_id: 5, setor_id: null, ativo: true },
  ],
  perfis: [
    { id: 1, nome: 'Super Admin', permissoes: ['super_admin', 'admin_setor', 'gestao', 'ouvidoria', 'visu'] },
    { id: 2, nome: 'Admin de Setor', permissoes: ['admin_setor'] },
    { id: 3, nome: 'Gestão', permissoes: ['gestao'] },
    { id: 4, nome: 'Ouvidoria', permissoes: ['ouvidoria'] },
    { id: 5, nome: 'Visualizador', permissoes: ['visu'] },
  ],
  auditar: [],
  exportacoes: [],
};

export function getPublicSetorFlow(setorSlug) {
  const setor = appStore.setores.find((item) => item.slug === setorSlug && item.ativo);
  if (!setor) {
    return null;
  }

  const perguntas = appStore.perguntas.filter((item) => item.ativo && (item.setor_id === setor.id || item.geral));

  return perguntas
    .sort((a, b) => {
      if (a.geral && !b.geral) return 1;
      if (!a.geral && b.geral) return -1;
      return a.ordem - b.ordem;
    })
    .map((question, index) => ({
      ...question,
      numero: index + 1,
      url: `/pesquisa/${setor.slug}/pergunta/${index + 1}`,
    }));
}

export function getPesquisaById(id) {
  return appStore.pesquisas.find((item) => item.id === id) ?? null;
}

export function getRespostaByPesquisaPergunta(pesquisaId, perguntaId) {
  return appStore.respostas.find((item) => item.pesquisa_id === pesquisaId && item.pergunta_id === perguntaId) ?? null;
}

export function updatePesquisaStatus(id, status) {
  const pesquisa = getPesquisaById(id);
  if (!pesquisa) return null;
  pesquisa.status = status;
  return pesquisa;
}
