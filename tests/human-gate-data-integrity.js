const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.resolve(__dirname, '..');
const candidateFiles = [
  'human-gate/data/things.js',
  'human-gate/data/actions.js',
  'human-gate/data/checks.js',
  'human-gate/data/status.js',
  'human-gate/data/safety.js',
  'human-gate/data/places.js',
  'human-gate/data/r1-things.js',
  'human-gate/data/r1-actions.js',
  'human-gate/data/r1-checks.js',
  'human-gate/data/r1-status.js',
  'human-gate/data/r1-safety.js',
  'human-gate/data/r1-places.js',
];

const context = { window: {} };
vm.createContext(context);
for (const relative of candidateFiles) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) throw new Error(`missing candidate file: ${relative}`);
  vm.runInContext(fs.readFileSync(full, 'utf8'), context, { filename: relative });
}

const rows = context.window.HG_CANDIDATES || [];
const fail = (message) => { throw new Error(message); };
if (rows.length !== 884) fail(`candidate count ${rows.length} != 884`);

const ids = rows.map(r => r[0]);
if (new Set(ids).size !== rows.length) fail('duplicate candidate_id detected');

const categories = new Set(['道具・もの','動作・操作','点検・確認・手順','状態・異常','安全・環境','場所・仕事']);
const allowedPatterns = new Set(Array.from({ length: 54 }, (_, i) => `P${String(i + 1).padStart(3, '0')}`));
for (const row of rows) {
  if (!Array.isArray(row) || row.length !== 8) fail(`malformed row: ${JSON.stringify(row)}`);
  if (!categories.has(row[2])) fail(`unknown category: ${row[2]} (${row[0]})`);
  if (!['単文','やり取り'].includes(row[3])) fail(`unknown candidate type: ${row[3]} (${row[0]})`);
  if (!allowedPatterns.has(row[5])) fail(`pattern outside P001-P054: ${row[5]} (${row[0]})`);
  if (row[3] === '単文' && row[7].includes('A：')) fail(`single candidate contains dialogue: ${row[0]}`);
}

const r1 = rows.filter(r => /^B002-/.test(r[0]));
if (r1.length !== 384) fail(`R1 candidate count ${r1.length} != 384`);
const termMap = new Map();
for (const row of r1) {
  if (!termMap.has(row[1])) termMap.set(row[1], []);
  termMap.get(row[1]).push(row);
}
if (termMap.size !== 48) fail(`R1 term count ${termMap.size} != 48`);
for (const [term, termRows] of termMap) {
  if (termRows.length !== 8) fail(`${term}: ${termRows.length} candidates != 8`);
  const single = termRows.filter(r => r[3] === '単文').length;
  const dialogue = termRows.filter(r => r[3] === 'やり取り').length;
  if (single !== 4 || dialogue !== 4) fail(`${term}: single/dialogue = ${single}/${dialogue}`);
}
for (const category of categories) {
  const categoryRows = r1.filter(r => r[2] === category);
  const categoryTerms = new Set(categoryRows.map(r => r[1]));
  if (categoryRows.length !== 64 || categoryTerms.size !== 8) {
    fail(`${category}: rows/terms = ${categoryRows.length}/${categoryTerms.size}, expected 64/8`);
  }
}

vm.runInContext(fs.readFileSync(path.join(root, 'human-gate/data/normalize.js'), 'utf8'), context, { filename: 'normalize.js' });
const normalized = context.window.HG_CANDIDATES || [];
if (normalized.some(r => /^B\d+-/.test(r[0]))) fail('Batch-style candidate IDs remain after normalize.js');
if (new Set(normalized.map(r => r[0])).size !== normalized.length) fail('normalized candidate_id collision detected');
if (normalized.length !== 884) fail('normalize.js changed candidate count');

console.log(`Human Gate data integrity PASS: ${normalized.length} candidates / 73 terms; R1 = 384 candidates / 48 terms.`);
