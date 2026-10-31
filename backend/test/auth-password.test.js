import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordIssues } from '../src/modules/auth/password.js';

test('password policy enforces minimum length and character classes', () => {
  assert.deepEqual(passwordIssues('short'), [
    { field: 'password', code: 'too_short', message: 'Use at least 9 characters.' },
    { field: 'password', code: 'uppercase_required', message: 'Include an uppercase letter.' },
    { field: 'password', code: 'special_required', message: 'Include a special character.' },
  ]);
  assert.deepEqual(passwordIssues('ValidPass!'), []);
});

test('password policy rejects passwords longer than 128 characters', () => {
  const issues = passwordIssues(`A${'a'.repeat(127)}!`);
  assert(issues.some(issue => issue.code === 'too_long'));
});
