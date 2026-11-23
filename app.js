const model = globalThis.VINIX7_MODEL
const get = id => document.getElementById(id)
const titles = { hybrid: 'Hybrid', onsite: 'Onsite', remote: 'Remote' }
const formatScore = value => (value * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%'
const workSettings = {
  onsite: { phrase: 'bekerja langsung di lokasi', next: 'tanyakan lokasi kerja dan jadwal masuk, lalu pertimbangkan waktu tempuhmu.' },
  remote: { phrase: 'bekerja jarak jauh', next: 'tanyakan jam kerja, kapan kamu perlu siap dihubungi, dan bagaimana tim berkomunikasi.' },
  hybrid: { phrase: 'membagi waktu antara kantor dan kerja jarak jauh', next: 'tanyakan berapa hari kamu perlu ke kantor dan apakah harinya bisa dipilih.' },
}
const questions = {
  'Jalur Karir': 'Apa rencana kariermu?',
  'Bidang Minat': 'Bidang apa yang kamu minati?',
  'Work Values': 'Apa yang penting bagimu dalam pekerjaan?',
  'Work Style': 'Bagaimana kamu lebih nyaman bekerja?',
  'Cognitive Style': 'Bagaimana kamu biasa menghadapi masalah?',
  'Motivasi': 'Apa yang paling memotivasimu saat bekerja?',
  'Ukuran Perusahaan': 'Perusahaan seperti apa yang kamu incar?',
  'Kultur Kerja': 'Suasana kerja seperti apa yang kamu sukai?',
  'Semester': 'Saat ini kamu semester berapa atau sudah lulus?',
  'IPK': 'Berapa kisaran IPK terakhirmu?',
  'Ekspektasi Gaji': 'Berapa kisaran gaji yang kamu harapkan?',
  'Minat Wirausaha': 'Seberapa tertarik kamu membuka usaha sendiri?',
  'Rencana S2/Sertifikasi': 'Adakah rencana mengambil S2 atau sertifikasi?',
  'Frekuensi Belajar': 'Seberapa sering kamu belajar hal baru?',
  'Kesiapan Interview': 'Seberapa siap kamu menghadapi wawancara kerja?',
  'Level Bahasa Inggris': 'Sejauh mana kemampuan bahasa Inggrismu?',
}
const plainLabels = {
  'Cognitive Style': 'Cara menghadapi masalah',
  'Kultur Kerja': 'Suasana kerja',
  'Kesiapan Interview': 'Kesiapan wawancara kerja',
  'Level Bahasa Inggris': 'Kemampuan bahasa Inggris',
}

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

function showResult(result, { label, comparedWith, isAlternative, reasons }) {
  const target = get('profile-result')
  const preferred = workSettings[label]
  const comparison = workSettings[comparedWith]
  const title = element('h2', isAlternative ? `Alternatif: ${titles[label]}` : `Pertimbangkan kerja ${titles[label]}`)
  title.tabIndex = -1
  const intro = isAlternative
    ? `Kalau sedang memilih antara Onsite dan Remote, jawabanmu lebih mendukung pilihan untuk ${preferred.phrase} dibanding ${comparison.phrase}.`
    : `Dari jawabanmu, kamu cenderung lebih cocok ${preferred.phrase} dibanding ${comparison.phrase}.`
  target.replaceChildren(element('p', 'SARAN SISTEM KERJA', 'eyebrow'), title, element('p', intro))

  target.append(element('h3', 'Kenapa saran ini muncul?'))
  if (reasons.length) {
    target.append(element('p', 'Saran ini muncul antara lain karena kamu memilih:'))
    const list = element('ul')
    for (const { key, value } of reasons) {
      const field = model.features.find(item => item.key === key)
      const item = element('li')
      item.append(element('strong', `${plainLabels[key] || field.label}: `), field.choiceLabels[value])
      list.append(item)
    }
    target.append(list)
  } else {
    target.append(element('p', 'Saran ini berasal dari gabungan jawabanmu. Tidak ada satu jawaban yang cukup menonjol untuk dijadikan alasan utama.'))
  }

  target.append(element('h3', 'Sebelum melamar'), element('p', `Saat melihat lowongan ${titles[label]}, ${preferred.next}`))
  const details = element('details', null, 'score-details')
  details.append(element('summary', 'Lihat skor tiap sistem kerja'))
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
    details.append(prob)
  })
  details.append(element('p', 'Skor ini menunjukkan kecenderungan dari jawabanmu, bukan peluang diterima kerja.', 'note'))
  target.append(details)
  title.focus({ preventScroll: true })
  target.scrollIntoView({ block: 'start', behavior: 'instant' })
}

function renderFields(features) {
  for (const [i, field] of features.entries()) {
    const fieldset = element('fieldset')
    const legend = element('legend', questions[field.key] || field.label)
    legend.id = `feature-label-${i}`
    fieldset.append(legend)
    if (field.multi) {
      const hint = element('p', field.max ? `Pilih 1 sampai ${field.max} opsi.` : 'Pilih minimal satu opsi.', 'field-hint')
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
      if (field.max) {
        const boxes = [...choices.querySelectorAll('input')]
        const enforceLimit = () => {
          const checked = boxes.filter(input => input.checked).length
          for (const input of boxes) input.disabled = !input.checked && checked >= field.max
        }
        boxes.forEach(input => input.addEventListener('change', enforceLimit))
        enforceLimit()
      }
      fieldset.append(hint, choices)
    } else {
      const select = element('select')
      select.name = field.key
      select.required = true
      select.setAttribute('aria-labelledby', legend.id)
      select.add(new Option('Pilih jawaban', ''))
      for (const code of field.choices) select.add(new Option(field.choiceLabels[code], code))
      fieldset.append(select)
    }
    get('fields').append(fieldset)
  }
}

const initialResult = () => get('profile-result').replaceChildren(
  element('p', 'SARAN SISTEM KERJA', 'eyebrow'),
  element('h2', 'Belum ada saran'),
  element('p', 'Isi formulir untuk melihat saran dan alasan di baliknya.'),
)

if (model) renderFields(model.features)
else {
  get('profile-submit').disabled = true
  get('form-message').textContent = 'Saran belum bisa ditampilkan. Coba muat ulang halaman.'
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
    const result = predictProfile(model, values)
    showResult(result, recommendProfile(model, values, result))
  } catch (error) {
    initialResult()
    const missing = model.features.find(field => field.multi && values[field.key].length === 0)
    get('form-message').textContent = missing
      ? `Pilih setidaknya satu jawaban untuk pertanyaan “${questions[missing.key] || missing.label}”`
      : 'Saran belum bisa ditampilkan. Coba periksa jawaban atau muat ulang halaman.'
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
