/**
 * Locale check: both dictionaries carry the same keys and every key referenced
 * through t(...) / translate(...) exists in them. Guards against a new control
 * that renders an undefined locale string.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'client.js'), 'utf8');

/** Extract the key set of one `const <name> = { ... }` locale block. */
function keysOf(name) {
  const start = source.indexOf('const ' + name + ' = {');
  assert.ok(start >= 0, 'locale block ' + name + ' must exist');
  let depth = 0;
  let end = start;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const block = source.slice(start, end);
  const keys = new Set();
  for (const match of block.matchAll(/'([a-z][\w.]*)':\s/g)) keys.add(match[1]);
  return keys;
}

const zhKeys = keysOf('zh');
const enKeys = keysOf('en');
assert.ok(zhKeys.size > 40, 'the Chinese dictionary must be populated');
assert.deepEqual([...zhKeys].sort(), [...enKeys].sort(), 'zh and en must carry the same keys');

const referenced = new Set();
for (const match of source.matchAll(/\b(?:t|translate)\(\s*'([^']+)'/g)) referenced.add(match[1]);
const missing = [...referenced].filter((key) => !zhKeys.has(key));
assert.deepEqual(missing, [], 'every referenced key must exist in the dictionaries');

console.log('locale parity: ok (' + zhKeys.size + ' keys)');
