const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const model = {
  classes: ['hybrid', 'onsite', 'remote'], decisionWeights: [1, 1, 1.3],
  features: [{ key: 'Work Style', choices: ['small', 'big'] }, { key: 'Work Values', multi: true, choices: ['team', 'flex'] }],
  bias: [0, 0, 0], terms: {'Work Style=small': [0, 0, -0.1], 'Work Values::flex': [0, -1, 0], 'Work Values::team': [0, 0, 0]},
};
const row = {'Work Style': ' ＳＭＡＬＬ ', 'Work Values': 'team | Flex; team'};
function implementation() {
  const p = path.join(__dirname, '..', 'model.js');
  assert.ok(fs.existsSync(p), 'model inference has not been implemented');
  return require(p);
}

test('predicts a weighted class while exposing unweighted scores in order', () => {
  const out = implementation().predictProfile(model, row);
  assert.equal(out.label, 'remote');
  const sum = 1 + Math.exp(-1) + Math.exp(-0.1);
  [1 / sum, Math.exp(-1) / sum, Math.exp(-0.1) / sum].forEach((p, i) => assert.ok(Math.abs(out.scores[i] - p) < 1e-12));
  assert.deepEqual(out.scores, implementation().predictProfile(model, {'Work Style': 'small', 'Work Values': ['team', 'flex']}).scores);
});

test('rejects missing, blank and unknown codes instead of scoring a partial profile', () => {
  const predict = raw => implementation().predictProfile(model, raw);
  assert.throws(() => predict({'Work Style': 'small'}), /Work Values/);
  assert.throws(() => predict({...row, 'Work Style': ''}), /Work Style/);
  assert.throws(() => predict({...row, 'Work Values': 'team, typo'}), /Work Values/);
});

test('finds canonical headers out of order, ignores extra headers and rejects ambiguous ones', () => {
  const find = headers => implementation().findFeatureColumns(model, headers);
  assert.deepEqual(find(['Tambahan', ' work VALUES ', 'WORK STYLE']), [2, 1]);
  assert.throws(() => find(['Work Style', 'WORK STYLE', 'Work Values']), /duplikat.*Work Style/i);
  assert.throws(() => find(['Work Style']), /kurang.*Work Values/i);
});
