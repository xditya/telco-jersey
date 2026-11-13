import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate, toCsv, readToken, SIZES } from './api/_shared.js';

const ok = validate({ uid: ' ab12 ', name: 'Asha   Rao', size: '38/M', jerseyName: "d'souza", jerseyNumber: '07' });
assert.deepEqual(ok.errors, {});
assert.deepEqual(ok.entry, { uid: 'AB12', name: 'Asha Rao', size: '38/M', jerseyName: "D'SOUZA", jerseyNumber: 7 });
assert.equal(validate({ ...ok.entry, jerseyNumber: 0 }).entry.jerseyNumber, 0);

const bad = validate({ uid: '', name: 'A', size: 'M', jerseyName: '7UP', jerseyNumber: '100' });
assert.deepEqual(Object.keys(bad.errors).sort(), ['jerseyName', 'jerseyNumber', 'name', 'size', 'uid']);
assert.equal(Object.keys(validate(null).errors).length, 5);
assert.ok(validate({ ...ok.entry, jerseyNumber: '-1' }).errors.jerseyNumber);

assert.equal(toCsv([['=1+1', 'a,b', 'say "hi"', 5]]), '﻿\'=1+1,"a,b","say ""hi""",5\r\n');

const tok = 'a'.repeat(43);
const req = (cookie) => ({ headers: new Headers(cookie ? { cookie } : {}) });
assert.equal(readToken(req(`x=1; jt=${tok}`)), tok);
assert.equal(readToken(req(`jt=${tok}x`)), null);
assert.equal(readToken(req()), null);

// The page builds its size options from the guide table; the API must accept exactly those.
const html = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
assert.deepEqual([...html.matchAll(/<tr><td>([^<]+)<\/td>/g)].map((m) => m[1]), SIZES);

console.log('ok');
