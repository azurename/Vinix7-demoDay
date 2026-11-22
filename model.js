function normalizeCode(value) {
  return String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
}

function featureValues(raw, field) {
  const clean = x => normalizeCode(x).replace(/^[\[\]()"']+|[\[\]()"']+$/g, '').trim()
  const values = field.multi
    ? [...new Set((Array.isArray(raw) ? raw : String(raw ?? '').split(/[,;|]/)).map(clean).filter(Boolean))]
    : [normalizeCode(raw)]
  if (!values.length || values.some(v => !field.choices.includes(v))) {
    throw new Error(`${field.label || field.key}: pilih kode yang tersedia.`)
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

if (typeof module === 'object' && module.exports) module.exports = { predictProfile, findFeatureColumns }
