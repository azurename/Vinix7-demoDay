const options = [
  ['Gaya kerja', ['Tim kecil', 'Fleksibel', 'Mandiri', 'Tim besar']],
  ['Motivasi', ['Uang', 'Pengembangan diri', 'Dampak', 'Prestise', 'Kebebasan']],
  ['Kultur kerja', ['Kolaboratif', 'Formal', 'Lincah', 'Berorientasi hasil']],
  ['Nilai kerja', ['Keseimbangan hidup', 'Pembelajaran', 'Stabilitas', 'Fleksibilitas', 'Pertumbuhan', 'Dampak', 'Kreativitas', 'Prestise']],
]
const get = (id) => document.getElementById(id)

function showScreen() {
  const hash = location.hash.slice(1)
  const route = ['beranda', 'individu', 'excel'].includes(hash) ? hash : 'beranda'
  document.querySelectorAll('.screen').forEach((section) => { section.hidden = section.id !== route })
  document.querySelectorAll('nav a').forEach((link) => {
    if (link.hash === '#' + route) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  })
  window.scrollTo(0, 0)
}

function showSample(target, isProfile = false) {
  const heading = isProfile ? 'HASIL PREDIKSI' : 'PETA PREFERENSI TALENTA'
  const title = isProfile ? 'Hybrid' : 'Setiap talenta, cara kerja berbeda.'
  const bars = [['Hybrid', 62], ['Onsite', 23], ['Remote', 15]].map(([label, value]) =>
    '<div class="prob"><div><span>' + label + '</span><strong>' + value + '%</strong></div><span class="track" aria-hidden="true"><span class="fill" style="width:' + value + '%"></span></span></div>'
  ).join('')
  const details = isProfile
    ? '<h3>Faktor yang paling memengaruhi</h3><ol><li>Kultur kolaboratif</li><li>Fleksibilitas</li><li>Pembelajaran</li></ol>'
    : ''
  target.innerHTML =
    '<div class="result-heading"><p class="eyebrow">' + heading + '</p><span class="sample-label">Contoh hasil</span></div>' +
    '<h2>' + title + '</h2>' +
    (isProfile ? '<p>Kombinasi kerja jarak jauh dan di kantor.</p>' : '') +
    bars + details + '<p class="note">Ilustrasi tampilan hasil model.</p>'
}

get('fields').innerHTML = options.map(([name, choices], index) => {
  const multi = index === 3
  const controls = index === 1
    ? '<select name="motivation" aria-label="Motivasi" required><option value="">Pilih motivasi</option>' + choices.map((item) => '<option>' + item + '</option>').join('') + '</select>'
    : '<div class="choices">' + choices.map((item) => '<label><input name="field-' + index + '" type="' + (multi ? 'checkbox' : 'radio') + '" value="' + item + '"' + (multi ? '' : ' required') + '> ' + item + '</label>').join('') + '</div>'
  return '<fieldset><legend>' + name + '</legend>' + controls + '</fieldset>'
}).join('')

get('profile').addEventListener('change', () => { get('form-message').textContent = '' })
get('profile').addEventListener('submit', (event) => {
  event.preventDefault()
  if (!new FormData(event.currentTarget).has('field-3')) {
    get('form-message').textContent = 'Pilih minimal satu nilai kerja.'
    event.currentTarget.querySelector('[name="field-3"]').focus()
    return
  }
  showSample(get('profile-result'), true)
})

const normalize = (value) => String(value ?? '').trim().toLocaleLowerCase('id')
const allowed = options.map(([, values]) => new Set(values.map(normalize)))
let uploadVersion = 0

async function handleFile(file) {
  if (!file) return
  const version = ++uploadVersion
  get('preview').hidden = true
  get('preview-empty').hidden = false
  const status = get('upload-status')
  status.textContent = 'Memeriksa ' + file.name + '…'
  try {
    if (!file.name.toLowerCase().endsWith('.xlsx') || file.size > 10 * 1024 * 1024) {
      throw new Error('Pilih file .xlsx berukuran maksimal 10 MB.')
    }
    const [header, ...rows] = await readWorkbook(await file.arrayBuffer())
    if (version !== uploadVersion) return
    const columns = options.map(([name]) => header?.cells.map(normalize).indexOf(normalize(name)) ?? -1)
    const missing = options.filter((_, index) => columns[index] < 0).map(([name]) => name)
    if (missing.length) throw new Error('Kolom wajib belum ada: ' + missing.join(', ') + '.')
    if (!rows.length) throw new Error('Belum ada data responden.')
    let valid = 0
    const fragment = document.createDocumentFragment()
    rows.forEach(({ number, cells }, index) => {
      const fields = columns.map((column) => cells[column] ?? '')
      const invalid = fields.flatMap((value, field) => {
        const entries = field === 3 ? normalize(value).split(',').map(normalize) : [normalize(value)]
        return entries.every((entry) => allowed[field].has(entry)) ? [] : [options[field][0]]
      })
      if (!invalid.length) valid++
      if (index >= 50) return
      const row = document.createElement('tr')
      for (const value of [number, ...fields, invalid.length ? 'Periksa: ' + invalid.join(', ') : 'Valid']) {
        const cell = row.insertCell()
        cell.textContent = value
      }
      fragment.append(row)
    })
    get('rows').replaceChildren(fragment)
    get('preview').hidden = false
    get('preview-empty').hidden = true
    status.textContent = valid + ' dari ' + rows.length + ' baris valid.' +
      (rows.length > 50 ? ' Pratinjau menampilkan 50 baris pertama.' : '') +
      ' Prediksi batch belum terhubung ke model.'
  } catch (error) {
    if (version === uploadVersion) status.textContent = error.message
  }
}

get('workbook').addEventListener('change', (event) => {
  handleFile(event.target.files[0])
  event.target.value = ''
})
const drop = get('drop')
drop.addEventListener('dragover', (event) => { event.preventDefault(); drop.classList.add('active') })
drop.addEventListener('dragleave', () => drop.classList.remove('active'))
drop.addEventListener('drop', (event) => {
  event.preventDefault()
  drop.classList.remove('active')
  handleFile(event.dataTransfer.files[0])
})

showSample(get('home-result'))
showSample(get('profile-result'), true)
showScreen()
window.addEventListener('hashchange', showScreen)
