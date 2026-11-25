-- Registra o dia informado pelo paciente, separado de data_hora (momento de envio).
ALTER TABLE pesquisa
  ADD COLUMN IF NOT EXISTS data_atendimento DATE NULL;
