import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertPersonalEmailFormat,
  personalEmailDomain,
} from '../api/src/personal-email-validation.mjs';

test('personalEmailDomain extracts domain', () => {
  assert.equal(personalEmailDomain('user@Example.COM'), 'example.com');
});

test('assertPersonalEmailFormat normalizes valid email', () => {
  assert.equal(assertPersonalEmailFormat('  User@Gmail.com '), 'user@gmail.com');
});

test('assertPersonalEmailFormat rejects missing @', () => {
  assert.throws(() => assertPersonalEmailFormat('notanemail'), /valid email/i);
});

test('assertPersonalEmailFormat rejects example.com', () => {
  assert.throws(() => assertPersonalEmailFormat('user@example.com'), /real email/i);
});

test('assertPersonalEmailFormat rejects .local domains', () => {
  assert.throws(() => assertPersonalEmailFormat('user@corp.local'), /real email/i);
});

test('assertPersonalEmailFormat rejects malformed local part', () => {
  assert.throws(() => assertPersonalEmailFormat('@example.org'), /format/i);
});
