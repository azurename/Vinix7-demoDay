function normalizeCode(value) {
  return String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
}

function featureValues(raw, field) {
  const clean = x => normalizeCode(x).replace(/^[\[\]()"']+|[\[\]()"']+$/g, '').trim()
  const values = field.multi
    ? [...new Set((Array.isArray(raw) ? raw : normalizeCode(raw).split(/[,;|]/)).map(clean).filter(Boolean))]
    : [normalizeCode(raw)]
  if (!values.length || values.some(v => !field.choices.includes(v))) {
    throw new Error(`${field.label || field.key}: pilih kode yang tersedia.`)
  }
  if (field.max && values.length > field.max) {
    throw new Error(`${field.label || field.key}: maksimal ${field.max} pilihan.`)
  }
  return values
}

function findFeatureColumns(model, headers = []) {
  const normalized = Array.from(headers, normalizeCode)
  return model.features.map(({ key }) => {
    const column = normalized.indexOf(normalizeCode(key))
    if (column < 0) throw new Error(`Kolom kurang: ${key}. Gunakan templat terbaru.`)
    if (column !== normalized.lastIndexOf(normalizeCode(key))) throw new Error(`Kolom duplikat: ${key}.`)
    return column
  })
}

function predictProfile(model, raw) {
  const logits = model.bias.slice()
  for (const field of model.features) {
    for (const value of featureValues(raw[field.key], field)) {
      const terms = model.terms[field.key + (field.multi ? '::' : '=') + value]
      if (!terms) throw new Error(`Kode ${field.label || field.key} belum didukung model ini.`)
      for (let i = 0; i < logits.length; i++) logits[i] += terms[i]
    }
  }
  const max = Math.max(...logits)
  const exp = logits.map(value => Math.exp(value - max))
  const total = exp.reduce((a, b) => a + b, 0)
  const scores = exp.map(value => value / total)
  if (scores.some(p => !Number.isFinite(p))) throw new Error('Skor model tidak dapat dihitung.')
  const winner = scores.reduce((best, value, i) => value * model.decisionWeights[i] > scores[best] * model.decisionWeights[best] ? i : best, 0)
  return { label: model.classes[winner], scores }
}

function recommendProfile(model, raw, result) {
  const hybrid = model.classes.indexOf('hybrid')
  const canRecommendHybrid = hybrid < 0 || result.scores[hybrid] >= 0.8
  const ranked = model.classes.map((_, i) => i)
    .filter(i => i !== hybrid || canRecommendHybrid)
    .sort((a, b) => result.scores[b] * model.decisionWeights[b] - result.scores[a] * model.decisionWeights[a])
  const [preferred, comparison] = ranked

  // Compare selected coefficients for these two work settings, not global feature importance.
  // Each question supplies at most one reason. Ignore weak or opposing contributions.
  const reasons = model.features.flatMap(field => {
    const answers = featureValues(raw[field.key], field).map(value => {
      const terms = model.terms[field.key + (field.multi ? '::' : '=') + value]
      return { value, impact: terms[preferred] - terms[comparison] }
    }).sort((a, b) => b.impact - a.impact)
    const impact = answers.reduce((sum, answer) => sum + answer.impact, 0)
    return answers[0].impact >= 0.15 && impact >= 0.15
      ? [{ key: field.key, value: answers[0].value, impact }]
      : []
  }).sort((a, b) => b.impact - a.impact).slice(0, 2).map(({ key, value }) => ({ key, value }))

  return {
    label: model.classes[preferred],
    comparedWith: model.classes[comparison],
    isAlternative: result.label === 'hybrid' && !canRecommendHybrid,
    reasons,
  }
}

if (typeof module === 'object' && module.exports) module.exports = { predictProfile, findFeatureColumns, recommendProfile }
