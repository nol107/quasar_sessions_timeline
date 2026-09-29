// node tests/run.mjs
import assert from 'node:assert/strict';
import { run } from './cases.js';

let fail = 0, n = 0;
run({
  eq(name, actual, expected) {
    n++;
    try { assert.deepEqual(actual, expected); console.log('  ok  ', name); }
    catch { fail++; console.log('  FAIL', name, '\n       reçu    ', JSON.stringify(actual), '\n       attendu ', JSON.stringify(expected)); }
  },
});
console.log(`\n${n - fail}/${n} OK`);
process.exit(fail ? 1 : 0);
