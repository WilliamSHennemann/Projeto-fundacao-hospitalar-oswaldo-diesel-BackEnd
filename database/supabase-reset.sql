-- ATENCAO: este script apaga e recria as tabelas do SGEP no schema public.
-- Execute no SQL Editor do Supabase somente se quiser descartar os dados atuais.
-- Nao apaga usuarios do Supabase Auth nem arquivos do Storage.

BEGIN;
SET LOCAL search_path TO public;

DROP VIEW IF EXISTS public.vw_nps_por_setor_turno CASCADE;
DROP TABLE IF EXISTS
  public.resposta,
  public.manifestacao,
  public.exportacao,
  public.auditoria,
  public.escala,
  public.equipe,
  public.pesquisa,
  public.paciente,
  public.opcao_resposta,
  public.pergunta,
  public.rota,
  public.usuario,
  public.perfil,
  public.configuracao,
  public.profissional,
  public.setor,
  public.hospital
CASCADE;

CREATE TABLE IF NOT EXISTS hospital (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  cnpj VARCHAR(18) UNIQUE NOT NULL,
  endereco TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS setor (
  id SERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL REFERENCES hospital(id) ON DELETE CASCADE,
  nome VARCHAR(150) NOT NULL,
  slug VARCHAR(150) NOT NULL UNIQUE,
  url VARCHAR(255),
  qrcode TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS rota (
  id SERIAL PRIMARY KEY,
  setor_id INTEGER NOT NULL REFERENCES setor(id) ON DELETE CASCADE,
  caminho VARCHAR(255) NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 1,
  ativo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS pergunta (
  id SERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL REFERENCES hospital(id) ON DELETE CASCADE,
  setor_id INTEGER NULL REFERENCES setor(id) ON DELETE CASCADE,
  rota_id INTEGER NULL REFERENCES rota(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('nps', 'rostinho', 'texto', 'multipla')),
  geral BOOLEAN NOT NULL DEFAULT FALSE,
  ordem INTEGER NOT NULL DEFAULT 1,
  obrigatoria BOOLEAN NOT NULL DEFAULT FALSE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT pergunta_flow_ck CHECK (
    (geral = TRUE AND setor_id IS NULL AND tipo = 'nps' AND obrigatoria = TRUE)
    OR (geral = FALSE AND setor_id IS NOT NULL AND obrigatoria = FALSE)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS pergunta_geral_ativa_idx
  ON pergunta (hospital_id)
  WHERE geral = TRUE AND ativo = TRUE;

CREATE TABLE IF NOT EXISTS opcao_resposta (
  id SERIAL PRIMARY KEY,
  pergunta_id INTEGER NOT NULL REFERENCES pergunta(id) ON DELETE CASCADE,
  valor SMALLINT NOT NULL,
  rotulo VARCHAR(120) NOT NULL,
  emoji VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS paciente (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(120),
  nome_mae VARCHAR(120),
  data_nascimento DATE,
  telefone VARCHAR(30),
  consentimento BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pesquisa (
  id SERIAL PRIMARY KEY,
  setor_id INTEGER NOT NULL REFERENCES setor(id) ON DELETE CASCADE,
  paciente_id INTEGER NULL REFERENCES paciente(id) ON DELETE SET NULL,
  data_hora TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data_atendimento DATE NULL,
  turno VARCHAR(10) NOT NULL CHECK (turno IN ('manha', 'tarde', 'noite')),
  anonimo BOOLEAN NOT NULL DEFAULT FALSE,
  consentimento BOOLEAN NOT NULL DEFAULT FALSE,
  media_parcial DECIMAL(3,1) NULL,
  nps_nota SMALLINT NULL CHECK (nps_nota BETWEEN 0 AND 10),
  status VARCHAR(20) NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'concluida', 'parcial')),
  encaminhado_ouvidoria BOOLEAN NOT NULL DEFAULT FALSE,
  ultima_atividade TIMESTAMPTZ DEFAULT NOW(),
  token VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS resposta (
  id SERIAL PRIMARY KEY,
  pesquisa_id INTEGER NOT NULL REFERENCES pesquisa(id) ON DELETE CASCADE,
  pergunta_id INTEGER NOT NULL REFERENCES pergunta(id) ON DELETE CASCADE,
  opcao_id INTEGER NULL REFERENCES opcao_resposta(id) ON DELETE SET NULL,
  valor SMALLINT NULL,
  texto TEXT NULL,
  UNIQUE (pesquisa_id, pergunta_id)
);

CREATE TABLE IF NOT EXISTS manifestacao (
  id SERIAL PRIMARY KEY,
  pesquisa_id INTEGER NOT NULL REFERENCES pesquisa(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('elogio', 'reclamacao', 'sugestao')),
  descricao TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'em_tratamento', 'concluida')),
  data TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  anonimo BOOLEAN NOT NULL DEFAULT FALSE,
  origem VARCHAR(20) NOT NULL CHECK (origem IN ('pesquisa', 'abandono')),
  media_origem DECIMAL(3,1) NULL,
  motivo_encaminhamento TEXT,
  canal_contato VARCHAR(255),
  parecer_interno TEXT
);

CREATE TABLE IF NOT EXISTS equipe (
  id SERIAL PRIMARY KEY,
  setor_id INTEGER NOT NULL REFERENCES setor(id) ON DELETE CASCADE,
  nome VARCHAR(150) NOT NULL,
  turno VARCHAR(10) NOT NULL CHECK (turno IN ('manha', 'tarde', 'noite')),
  data DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS profissional (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  cargo VARCHAR(150),
  registro VARCHAR(80)
);

CREATE TABLE IF NOT EXISTS escala (
  id SERIAL PRIMARY KEY,
  equipe_id INTEGER NOT NULL REFERENCES equipe(id) ON DELETE CASCADE,
  profissional_id INTEGER NOT NULL REFERENCES profissional(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  turno VARCHAR(10) NOT NULL CHECK (turno IN ('manha', 'tarde', 'noite'))
);

CREATE TABLE IF NOT EXISTS perfil (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(80) NOT NULL,
  permissoes JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS usuario (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  perfil_id INTEGER NOT NULL REFERENCES perfil(id),
  setor_id INTEGER NULL REFERENCES setor(id),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  senha_hash TEXT
);

CREATE TABLE IF NOT EXISTS auditoria (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NULL REFERENCES usuario(id),
  acao VARCHAR(100) NOT NULL,
  entidade VARCHAR(100) NOT NULL,
  entidade_id INTEGER,
  data TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS exportacao (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuario(id),
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('excel', 'pdf')),
  data TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  filtros JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS configuracao (
  hospital_id INTEGER NOT NULL REFERENCES hospital(id) ON DELETE CASCADE,
  chave VARCHAR(80) NOT NULL,
  valor JSONB NOT NULL,
  PRIMARY KEY (hospital_id, chave)
);

CREATE INDEX IF NOT EXISTS idx_pesquisa_setor ON pesquisa(setor_id);
CREATE INDEX IF NOT EXISTS idx_pesquisa_data_hora ON pesquisa(data_hora);
CREATE INDEX IF NOT EXISTS idx_pesquisa_status ON pesquisa(status);
CREATE INDEX IF NOT EXISTS idx_resposta_pesquisa ON resposta(pesquisa_id);
CREATE INDEX IF NOT EXISTS idx_manifestacao_status ON manifestacao(status);

CREATE OR REPLACE VIEW vw_nps_por_setor_turno AS
SELECT
  p.setor_id,
  p.turno,
  COUNT(*) FILTER (WHERE p.nps_nota IS NOT NULL) AS total_avaliacoes,
  ROUND(AVG(p.nps_nota)::numeric, 1) AS media_nps,
  ROUND((100.0 * COUNT(*) FILTER (WHERE p.nps_nota BETWEEN 9 AND 10)) / NULLIF(COUNT(*) FILTER (WHERE p.nps_nota IS NOT NULL), 0), 1) AS promotores_pct,
  ROUND((100.0 * COUNT(*) FILTER (WHERE p.nps_nota BETWEEN 0 AND 6)) / NULLIF(COUNT(*) FILTER (WHERE p.nps_nota IS NOT NULL), 0), 1) AS detratores_pct
FROM pesquisa p
GROUP BY p.setor_id, p.turno;

ALTER TABLE pesquisa ENABLE ROW LEVEL SECURITY;
ALTER TABLE setor ENABLE ROW LEVEL SECURITY;
ALTER TABLE manifestacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY setor_public_read ON setor
  FOR SELECT USING (ativo = TRUE);
CREATE POLICY pesquisa_public_insert ON pesquisa
  FOR INSERT WITH CHECK (TRUE);
CREATE POLICY pesquisa_public_update ON pesquisa
  FOR UPDATE USING (TRUE);
CREATE POLICY manifestacao_ouvidoria_read ON manifestacao
  FOR SELECT USING (TRUE);

CREATE UNIQUE INDEX IF NOT EXISTS opcao_resposta_pergunta_valor_uidx
  ON opcao_resposta (pergunta_id, valor);

ALTER TABLE pergunta DROP CONSTRAINT IF EXISTS pergunta_flow_ck;
ALTER TABLE pergunta ADD CONSTRAINT pergunta_flow_ck CHECK (
  (geral = TRUE AND setor_id IS NULL AND tipo = 'nps' AND obrigatoria = TRUE)
  OR (geral = FALSE AND setor_id IS NOT NULL AND tipo <> 'nps')
);

UPDATE setor SET url = '/' || slug WHERE url IS DISTINCT FROM '/' || slug;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY setor_id ORDER BY ordem, id)::integer AS new_order
  FROM pergunta
  WHERE ativo = TRUE AND geral = FALSE
)
UPDATE pergunta p
SET ordem = ranked.new_order
FROM ranked
WHERE p.id = ranked.id AND p.ordem <> ranked.new_order;

CREATE UNIQUE INDEX IF NOT EXISTS pergunta_setor_ordem_ativa_uidx
  ON pergunta (setor_id, ordem)
  WHERE ativo = TRUE AND geral = FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS pergunta_nps_geral_hospital_ativa_uidx
  ON pergunta (hospital_id)
  WHERE geral = TRUE AND ativo = TRUE;

CREATE INDEX IF NOT EXISTS idx_pesquisa_data_setor_status
  ON pesquisa (data_hora, setor_id, status);
CREATE INDEX IF NOT EXISTS idx_manifestacao_pesquisa_data
  ON manifestacao (pesquisa_id, data DESC);

ALTER TABLE pergunta
  ADD COLUMN IF NOT EXISTS todos_setores BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE pergunta DROP CONSTRAINT IF EXISTS pergunta_flow_ck;
ALTER TABLE pergunta ADD CONSTRAINT pergunta_flow_ck CHECK (
  (geral = TRUE AND setor_id IS NULL AND tipo = 'nps' AND obrigatoria = TRUE AND todos_setores = FALSE)
  OR (
    geral = FALSE
    AND tipo <> 'nps'
    AND ((todos_setores = TRUE AND setor_id IS NULL) OR (todos_setores = FALSE AND setor_id IS NOT NULL))
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS pergunta_compartilhada_ordem_ativa_uidx
  ON pergunta (ordem)
  WHERE ativo = TRUE AND todos_setores = TRUE AND geral = FALSE;

INSERT INTO hospital (id, nome, cnpj, endereco) VALUES
  (1, 'Fundação Hospitalar Dr. Oswaldo Diesel', '90.936.774/0001-11', 'Rua 12 de Maio, 555')
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
SELECT pergunta_id, valor, rotulo, emoji
FROM (
  VALUES
    (1, 1, 'Muito ruim', '😡'), (1, 2, 'Ruim', '🙁'), (1, 3, 'Neutro', '😐'), (1, 4, 'Bom', '🙂'), (1, 5, 'Muito bom', '😍'),
    (2, 1, 'Muito ruim', '😡'), (2, 2, 'Ruim', '🙁'), (2, 3, 'Neutro', '😐'), (2, 4, 'Bom', '🙂'), (2, 5, 'Muito bom', '😍'),
    (3, 1, 'Muito ruim', '😡'), (3, 2, 'Ruim', '🙁'), (3, 3, 'Neutro', '😐'), (3, 4, 'Bom', '🙂'), (3, 5, 'Muito bom', '😍'),
    (4, 1, 'Muito ruim', '😡'), (4, 2, 'Ruim', '🙁'), (4, 3, 'Neutro', '😐'), (4, 4, 'Bom', '🙂'), (4, 5, 'Muito bom', '😍'),
    (5, 1, 'Muito ruim', '😡'), (5, 2, 'Ruim', '🙁'), (5, 3, 'Neutro', '😐'), (5, 4, 'Bom', '🙂'), (5, 5, 'Muito bom', '😍'),
    (6, 1, 'Muito ruim', '😡'), (6, 2, 'Ruim', '🙁'), (6, 3, 'Neutro', '😐'), (6, 4, 'Bom', '🙂'), (6, 5, 'Muito bom', '😍')
) AS v(pergunta_id, valor, rotulo, emoji)
WHERE EXISTS (SELECT 1 FROM pergunta WHERE id = v.pergunta_id)
ON CONFLICT (pergunta_id, valor) DO NOTHING;

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

SELECT setval(pg_get_serial_sequence('hospital', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM hospital;
SELECT setval(pg_get_serial_sequence('setor', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM setor;
SELECT setval(pg_get_serial_sequence('rota', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM rota;
SELECT setval(pg_get_serial_sequence('pergunta', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM pergunta;
SELECT setval(pg_get_serial_sequence('perfil', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM perfil;

COMMIT;
