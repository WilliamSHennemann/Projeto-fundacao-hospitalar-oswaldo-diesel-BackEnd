INSERT INTO hospital (id, nome, cnpj, endereco) VALUES
  (1, 'Fundação Hospitalar Dr. Oswaldo Diesel', '12.345.678/0001-90', 'Rua das Flores, 100')
ON CONFLICT (id) DO NOTHING;

INSERT INTO setor (id, hospital_id, nome, slug, url, qrcode, ativo) VALUES
  (1, 1, 'Recepção', 'recepcao', '/recepcao', 'qr-recepcao', TRUE),
  (2, 1, 'Triagem', 'triagem', '/triagem', 'qr-triagem', TRUE),
  (3, 1, 'Enfermagem', 'enfermagem', '/enfermagem', 'qr-enfermagem', TRUE),
  (4, 1, 'Médico', 'medico', '/medico', 'qr-medico', TRUE),
  (5, 1, 'Internação', 'internacao', '/internacao', 'qr-internacao', TRUE),
  (6, 1, 'Raio-X', 'raio-x', '/raio-x', 'qr-raio-x', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO rota (id, setor_id, caminho, ordem, ativo) VALUES
  (1, 1, '/recepcao', 1, TRUE),
  (2, 2, '/triagem', 1, TRUE),
  (3, 3, '/enfermagem', 1, TRUE),
  (4, 4, '/medico', 1, TRUE),
  (5, 5, '/internacao', 1, TRUE),
  (6, 6, '/raio-x', 1, TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO pergunta (id, hospital_id, setor_id, rota_id, texto, tipo, geral, ordem, obrigatoria, ativo)
VALUES
  (1, 1, 1, 1, 'Como você avalia a recepção?', 'rostinho', FALSE, 1, FALSE, TRUE),
  (2, 1, 2, 2, 'Como você avalia a triagem?', 'rostinho', FALSE, 1, FALSE, TRUE),
  (3, 1, 3, 3, 'Como você avalia a enfermagem?', 'rostinho', FALSE, 1, FALSE, TRUE),
  (4, 1, 4, 4, 'Como você avalia o atendimento médico?', 'rostinho', FALSE, 1, FALSE, TRUE),
  (5, 1, 5, 5, 'Como você avalia a internação?', 'rostinho', FALSE, 1, FALSE, TRUE),
  (6, 1, 6, 6, 'Como você avalia o serviço de raio-x?', 'rostinho', FALSE, 1, FALSE, TRUE),
  (7, 1, NULL, NULL, 'De 0 a 10, o quanto você recomendaria a Fundação a um amigo ou familiar?', 'nps', TRUE, 99, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO opcao_resposta (pergunta_id, valor, rotulo, emoji)
SELECT id, valor, rotulo, emoji
FROM (
  VALUES
    (1, 1, 'Muito ruim', '😡'),
    (1, 2, 'Ruim', '🙁'),
    (1, 3, 'Neutro', '😐'),
    (1, 4, 'Bom', '🙂'),
    (1, 5, 'Muito bom', '😍')
) AS v(pergunta_id, valor, rotulo, emoji)
WHERE EXISTS (SELECT 1 FROM pergunta WHERE id = v.pergunta_id);

INSERT INTO perfil (id, nome, permissoes) VALUES
  (1, 'Super Admin', '{"roles": ["super_admin", "admin_setor", "gestao", "ouvidoria", "visualizador"]}'::jsonb),
  (2, 'Admin de Setor', '{"roles": ["admin_setor"]}'::jsonb),
  (3, 'Gestão', '{"roles": ["gestao"]}'::jsonb),
  (4, 'Ouvidoria', '{"roles": ["ouvidoria"]}'::jsonb),
  (5, 'Visualizador', '{"roles": ["visualizador"]}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO configuracao (hospital_id, chave, valor) VALUES
  (1, 'limiar_media_baixa', '{"valor": 2}'),
  (1, 'limiar_nps_baixo', '{"valor": 6}'),
  (1, 'minutos_abandono', '{"valor": 30}'),
  (1, 'retencao_dias', '{"valor": 365}')
ON CONFLICT (hospital_id, chave) DO NOTHING;
