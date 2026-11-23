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

test('fullwidth separators are equivalent to the canonical multilabel separators', () => {
  const { predictProfile } = implementation();
  assert.deepEqual(predictProfile(model, {...row, 'Work Values': 'team；flex｜team'}), predictProfile(model, row));
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

test('recommends a non-Hybrid alternative below 80% and retains Hybrid at 80%', () => {
  const { recommendProfile } = implementation();
  const profile = { 'Work Style': 'small', 'Work Values': ['team'] };
  const below = recommendProfile(model, profile, { label: 'hybrid', scores: [.7999, .105, .0951] });
  assert.equal(below.label, 'remote'); // The existing Remote decision weight breaks this comparison.
  assert.equal(below.comparedWith, 'onsite');
  assert.equal(below.isAlternative, true);

  const at = recommendProfile(model, profile, { label: 'hybrid', scores: [.8, .11, .09] });
  assert.equal(at.label, 'hybrid');
  assert.equal(at.comparedWith, 'remote');
  assert.equal(at.isAlternative, false);
});

test('compares an Onsite result with Remote instead of promoting a lower-scoring Hybrid', () => {
  const { recommendProfile } = implementation();
  const result = recommendProfile(model, row, { label: 'onsite', scores: [.36, .41, .23] });
  assert.equal(result.label, 'onsite');
  assert.equal(result.comparedWith, 'remote');
  assert.equal(result.isAlternative, false);
});

test('returns the strongest supporting selected answers from distinct questions', () => {
  const { predictProfile, recommendProfile } = implementation();
  const fixture = {
    ...model,
    features: [
      { key: 'Values', multi: true, choices: ['team', 'stability', 'unused'] },
      { key: 'Culture', choices: ['formal'] },
      { key: 'Style', choices: ['flex'] },
      { key: 'Interest', choices: ['tech'] },
    ],
    terms: {
      'Values::team': [0, .8, 0], 'Values::stability': [0, .6, 0], 'Values::unused': [0, 9, 0],
      'Culture=formal': [0, .5, 0], 'Style=flex': [0, -.4, 0], 'Interest=tech': [0, .02, 0],
    },
  };
  const input = { Values: ['team', 'stability'], Culture: 'formal', Style: 'flex', Interest: 'tech' };
  const result = recommendProfile(fixture, input, predictProfile(fixture, input));
  assert.deepEqual(result.reasons, [{ key: 'Values', value: 'team' }, { key: 'Culture', value: 'formal' }]);
});

test('does not present tiny or opposing contributions as reasons', () => {
  const { recommendProfile } = implementation();
  const fixture = { ...model, terms: { ...model.terms, 'Work Style=small': [0, .01, 0] } };
  const result = recommendProfile(fixture, row, { label: 'onsite', scores: [.2, .6, .2] });
  assert.deepEqual(result.reasons, []);
});
