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
