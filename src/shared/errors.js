export class AppError extends Error {
  constructor(message, statusCode = 400, code = 'BAD_REQUEST', details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const errorResponse = (error) => {
  if (error instanceof AppError) {
    return {
      erro: error.message,
      codigo: error.code,
      detalhes: error.details,
    };
  }

  return {
    erro: 'Erro interno inesperado',
    codigo: 'INTERNAL_ERROR',
    detalhes: error instanceof Error ? error.message : undefined,
  };
};
