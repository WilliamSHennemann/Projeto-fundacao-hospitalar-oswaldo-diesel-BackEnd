-- Normalize active question order before enforcing uniqueness.
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
