import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadShareRecipients() {
  const code = readFileSync(join(root, 'extension/src/share-recipients.js'), 'utf8');
  const sandbox = { globalThis: {} };
  vm.runInNewContext(code, sandbox);
  return sandbox.globalThis.GoldspireShareRecipients;
}

test('parseRecipientEmails splits comma and semicolon lists', () => {
  const { parseRecipientEmails } = loadShareRecipients();
  const result = parseRecipientEmails('a@co.com, b@co.com; c@co.com');
  assert.equal(result.join(','), 'a@co.com,b@co.com,c@co.com');
});

test('isLikelyGroupMailbox flags common group patterns', () => {
  const { isLikelyGroupMailbox } = loadShareRecipients();
  assert.equal(isLikelyGroupMailbox('all-hands@company.com'), true);
  assert.equal(isLikelyGroupMailbox('team-sales@company.com'), true);
  assert.equal(isLikelyGroupMailbox('alice@company.com'), false);
  assert.equal(isLikelyGroupMailbox('staff@googlegroups.com'), true);
});

test('validateDirectShareRecipients rejects group-like addresses', () => {
  const { validateDirectShareRecipients } = loadShareRecipients();
  assert.throws(
    () => validateDirectShareRecipients(['team@company.com']),
    /group or list/,
  );
  assert.equal(validateDirectShareRecipients('bob@co.com').join(','), 'bob@co.com');
});

test('composeMismatchWarning detects group in compose To/Cc', () => {
  const { composeMismatchWarning } = loadShareRecipients();
  const warning = composeMismatchWarning(['bob@co.com'], ['all@co.com', 'bob@co.com']);
  assert.match(warning, /group or list/);
});

test('composeMismatchWarning warns when named recipient missing from compose', () => {
  const { composeMismatchWarning } = loadShareRecipients();
  const warning = composeMismatchWarning(['bob@co.com'], ['alice@co.com']);
  assert.match(warning, /not in your email To\/Cc/);
});

test('composeMismatchWarning warns about extra compose recipients', () => {
  const { composeMismatchWarning } = loadShareRecipients();
  const warning = composeMismatchWarning(['bob@co.com'], ['bob@co.com', 'alice@co.com']);
  assert.match(warning, /will not receive unlock keys/);
});
