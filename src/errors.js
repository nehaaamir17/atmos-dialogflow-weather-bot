export class AppError extends Error {
  constructor(message, options = {}) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.code = options.code ?? 'INTERNAL_ERROR';
    this.status = options.status ?? 500;
    this.expose = options.expose ?? false;
    this.details = options.details;
  }
}

export function toPublicError(error) {
  if (error instanceof AppError && error.expose) {
    return { code: error.code, message: error.message, status: error.status };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'The weather service encountered an unexpected error.',
    status: 500,
  };
}

