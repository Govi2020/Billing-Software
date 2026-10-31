import { AppError } from '../lib/errors.js';

export function validate({ body, params, query }) {
  return (req, _res, next) => {
    const errors = {};
    req.validated ??= {};
    for (const [key, schema] of Object.entries({ body, params, query })) {
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (result.success) req.validated[key] = result.data;
      else errors[key] = result.error.issues.map(issue => ({
        path: issue.path.join('.'),
        code: issue.code,
        message: issue.message,
      }));
    }
    if (Object.keys(errors).length) return next(new AppError(422, 'VALIDATION_FAILED', 'Request validation failed.', errors));
    next();
  };
}
