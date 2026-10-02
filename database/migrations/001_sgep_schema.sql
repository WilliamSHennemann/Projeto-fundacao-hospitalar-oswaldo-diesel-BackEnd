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
  ativo BOOLEAN NOT NULL DEFAULT TRUE
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

CREATE VIEW vw_nps_por_setor_turno AS
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
  FOR SELECT USING (true);
