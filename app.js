const model = globalThis.VINIX7_MODEL
const get = id => document.getElementById(id)
const titles = { hybrid: 'Hybrid', onsite: 'Onsite', remote: 'Remote' }
const formatScore = value => (value * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%'

function showScreen() {
  const hash = location.hash.slice(1)
  const route = ['beranda', 'individu', 'excel'].includes(hash) ? hash : 'beranda'
  document.querySelectorAll('.screen').forEach(section => { section.hidden = section.id !== route })
  document.querySelectorAll('nav a').forEach(link => {
    if (link.hash === '#' + route) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  })
  window.scrollTo(0, 0)
}

function element(tag, text, className) {
  const node = document.createElement(tag)
  if (text != null) node.textContent = text
  if (className) node.className = className
  return node
}

function showResult(result) {
  const target = get('profile-result')
  const heading = element('div', null, 'result-heading')
  heading.append(element('p', 'HASIL PREDIKSI', 'eyebrow'), element('span', 'Model demo', 'sample-label'))
  target.replaceChildren(heading, element('h2', titles[result.label]))
  model.classes.forEach((key, i) => {
    const prob = element('div', null, 'prob')
    const summary = element('div')
    const track = element('span', null, 'track')
    const fill = element('span', null, 'fill')
    fill.style.width = `${result.scores[i] * 100}%`
    track.setAttribute('aria-hidden', 'true')
    track.append(fill)
    summary.append(element('span', titles[key]), element('strong', formatScore(result.scores[i])))
    prob.append(summary, track)
    target.append(prob)
  })
  target.append(element('p', 'Batang menunjukkan skor model. Prediksi akhir menggunakan pengali kelas, jadi hasil bisa berbeda dari batang terbesar.', 'note'))
}

function renderFields(features) {
  for (const [i, field] of features.entries()) {
    const fieldset = element('fieldset')
    fieldset.append(element('legend', field.label))
    if (field.multi) {
      const hint = element('p', 'Pilih minimal satu opsi.', 'field-hint')
      hint.id = `feature-hint-${i}`
      fieldset.setAttribute('aria-describedby', hint.id)
      const choices = element('div', null, 'choices')
      for (const code of field.choices) {
        const label = element('label')
        const input = element('input')
        input.name = field.key
        input.type = 'checkbox'
        input.value = code
        label.append(input, document.createTextNode(' ' + field.choiceLabels[code]))
        choices.append(label)
      }
      fieldset.append(hint, choices)
    } else {
      const select = element('select')
      select.name = field.key
      select.required = true
      select.setAttribute('aria-label', field.label)
      select.add(new Option('Pilih ' + field.label, ''))
      for (const code of field.choices) select.add(new Option(field.choiceLabels[code], code))
      fieldset.append(select)
    }
    get('fields').append(fieldset)
  }
}

const initialResult = () => get('profile-result').replaceChildren(
  element('p', 'HASIL PREDIKSI', 'eyebrow'),
  element('h2', 'Belum ada hasil'),
  element('p', 'Isi 16 fitur di formulir untuk melihat hasilnya.'),
)

if (model) renderFields(model.features)
else {
  get('profile-submit').disabled = true
  get('form-message').textContent = 'Model belum dapat dimuat. Coba muat ulang halaman.'
}
const profile = get('profile')
profile.addEventListener('change', () => {
  get('form-message').textContent = ''
  profile.querySelectorAll('[aria-invalid]').forEach(control => control.removeAttribute('aria-invalid'))
  initialResult()
})
profile.addEventListener('submit', event => {
  event.preventDefault()
  if (!model) return
  const data = new FormData(profile)
  const values = Object.fromEntries(model.features.map(field => [field.key, field.multi ? data.getAll(field.key) : data.get(field.key)]))
  try {
    showResult(predictProfile(model, values))
  } catch (error) {
    initialResult()
    get('form-message').textContent = error.message
    const missing = model.features.find(field => field.multi && values[field.key].length === 0)
    if (missing) {
      const control = profile.elements.namedItem(missing.key)[0]
      control.setAttribute('aria-invalid', 'true')
      control.focus()
    }
  }
})

let uploadVersion = 0
async function handleFile(file) {
  if (!file) return
  const version = ++uploadVersion
  const preview = get('preview')
  const empty = get('preview-empty')
  const status = get('upload-status')
  preview.hidden = true
  empty.hidden = false
  status.textContent = 'Memeriksa ' + file.name + '…'
  try {
    if (!model) throw new Error('Model belum dapat dimuat. Coba muat ulang halaman.')
    if (!file.name.toLowerCase().endsWith('.xlsx') || file.size > 10 * 1024 * 1024) {
      throw new Error('Pilih file .xlsx berukuran maksimal 10 MB.')
    }
    const [header, ...rows] = await readWorkbook(await file.arrayBuffer())
    if (version !== uploadVersion) return
    const columns = findFeatureColumns(model, header?.cells)
    if (!rows.length) throw new Error('Belum ada data responden.')
    let valid = 0
    const fragment = document.createDocumentFragment()
    rows.forEach(({ number, cells }, index) => {
      let output
      try {
        const input = Object.fromEntries(model.features.map((field, i) => [field.key, cells[columns[i]]]))
        const result = predictProfile(model, input)
        valid++
        output = [number, titles[result.label], ...result.scores.map(formatScore), 'Valid']
      } catch (error) {
        output = [number, '—', '—', '—', '—', 'Periksa: ' + error.message]
      }
      if (index >= 50) return
      const row = document.createElement('tr')
      for (const value of output) row.insertCell().textContent = value
      fragment.append(row)
    })
    get('rows').replaceChildren(fragment)
    preview.hidden = false
    empty.hidden = true
    status.textContent = `${valid} dari ${rows.length} baris berhasil diprediksi.` +
      (rows.length > 50 ? ' Pratinjau menampilkan 50 baris pertama.' : '')
  } catch (error) {
    if (version === uploadVersion) status.textContent = error.message
  }
}

get('workbook').addEventListener('change', event => {
  handleFile(event.target.files[0])
  event.target.value = ''
})
const drop = get('drop')
drop.addEventListener('dragover', event => { event.preventDefault(); drop.classList.add('active') })
drop.addEventListener('dragleave', () => drop.classList.remove('active'))
drop.addEventListener('drop', event => {
  event.preventDefault()
  drop.classList.remove('active')
  handleFile(event.dataTransfer.files[0])
})

showScreen()
window.addEventListener('hashchange', showScreen)
