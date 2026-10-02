export function calculateAverage(values) {
  const valid = values.filter((value) => value !== null && value !== undefined && Number.isFinite(value));
  if (valid.length === 0) {
    return null;
  }

  return Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(1));
}

export function calculateNps(scores) {
  const valid = scores.filter((value) => value !== null && value !== undefined && Number.isFinite(value));
  if (valid.length === 0) {
    return 0;
  }

  const promoters = valid.filter((value) => value >= 9 && value <= 10).length;
  const detractors = valid.filter((value) => value >= 0 && value <= 6).length;

  return Number((((promoters - detractors) / valid.length) * 100).toFixed(1));
}

export function buildFlow(questions) {
  const sorted = [...questions].sort((a, b) => {
    if (a.geral && !b.geral) return 1;
    if (!a.geral && b.geral) return -1;
    return a.ordem - b.ordem;
  });

  return sorted.map((question, index) => ({
    ...question,
    numero: index + 1,
    url: `/pesquisa/${question.id}/pergunta/${index + 1}`,
  }));
}

export function resolveNextQuestionUrl(currentPosition, total) {
  if (currentPosition >= total) {
    return null;
  }

  return `/pesquisa/proxima/pergunta/${currentPosition + 1}`;
}
