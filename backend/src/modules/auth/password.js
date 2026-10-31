import argon2 from 'argon2';
import { AppError } from '../../lib/errors.js';

const argonOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export const DUMMY_PASSWORD_HASH = await argon2.hash('not-a-real-user-password', argonOptions);

export function passwordIssues(password) {
  const issues = [];
  if (password.length < 9) issues.push({ field: 'password', code: 'too_short', message: 'Use at least 9 characters.' });
  if (password.length > 128) issues.push({ field: 'password', code: 'too_long', message: 'Use no more than 128 characters.' });
  if (!/[A-Z]/.test(password)) issues.push({ field: 'password', code: 'uppercase_required', message: 'Include an uppercase letter.' });
  if (!/[a-z]/.test(password)) issues.push({ field: 'password', code: 'lowercase_required', message: 'Include a lowercase letter.' });
  if (!/[^A-Za-z0-9]/.test(password)) issues.push({ field: 'password', code: 'special_required', message: 'Include a special character.' });
  return issues;
}

export function assertPasswordPolicy(password, identityValues = []) {
  const issues = passwordIssues(password);
  const normalized = password.toLowerCase();
  if (identityValues.some(value => value && normalized === String(value).toLowerCase())) {
    issues.push({ field: 'password', code: 'identity_match', message: 'Password must not match your email or name.' });
  }
  if (issues.length) throw new AppError(422, 'VALIDATION_FAILED', 'Password does not meet the required rules.', { fields: issues });
}

export const hashPassword = password => argon2.hash(password, argonOptions);
export const verifyPassword = (hash, password) => argon2.verify(hash, password).catch(() => false);
