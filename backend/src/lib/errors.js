export class AppError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function mapDatabaseError(error) {
  if (error.code === '23505') return new AppError(409, 'DUPLICATE', 'A record with these details already exists.');
  if (error.code === '23503') return new AppError(409, 'REFERENCE_CONFLICT', 'The operation conflicts with a referenced record.');
  if (error.code === '23514') return new AppError(422, 'CONSTRAINT_VIOLATION', 'The supplied values are not valid.');
  if (error.code === '22P02' || error.code === '22003') return new AppError(422, 'INVALID_VALUE', 'The supplied value is invalid or out of range.');
  if (error.code === 'P0001') return new AppError(409, 'INVALID_TRANSITION', 'This change is not allowed in the current state.');
  if (['40001', '40P01', '55P03'].includes(error.code)) {
    return new AppError(503, 'RETRYABLE_CONFLICT', 'The operation conflicted with another transaction. Retry the request.');
  }
  return error;
}
