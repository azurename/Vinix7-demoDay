// Read only the first worksheet and shared strings from an OOXML workbook.
async function readWorkbook(buffer) {
  const data = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  const decoder = new TextDecoder()
  let end = buffer.byteLength - 22
  const minimum = Math.max(0, end - 65535)
  while (end >= minimum && data.getUint32(end, true) !== 0x06054b50) end--
  if (end < minimum) throw new Error('File Excel tidak dapat dibaca.')
  const files = new Map()
  let offset = data.getUint32(end + 16, true)
  for (let index = 0; index < data.getUint16(end + 10, true); index++) {
    if (offset + 46 > end || data.getUint32(offset, true) !== 0x02014b50) throw new Error('Arsip Excel tidak valid.')
    const length = data.getUint16(offset + 28, true)
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + length))
    files.set(name, {
      method: data.getUint16(offset + 10, true),
      size: data.getUint32(offset + 20, true),
      uncompressed: data.getUint32(offset + 24, true),
      start: data.getUint32(offset + 42, true),
    })
    offset += 46 + length + data.getUint16(offset + 30, true) + data.getUint16(offset + 32, true)
  }

  async function xml(name) {
    const entry = files.get(name)
    if (!entry || entry.start + 30 > end || entry.uncompressed > 24 * 1024 * 1024) throw new Error('Bagian Excel hilang atau terlalu besar.')
    const start = entry.start + 30 + data.getUint16(entry.start + 26, true) + data.getUint16(entry.start + 28, true)
    if (start + entry.size > end || ![0, 8].includes(entry.method)) throw new Error('Format kompresi Excel tidak didukung.')
    let text = ''
    if (entry.method === 0) {
      if (entry.size !== entry.uncompressed) throw new Error('Ukuran bagian Excel tidak valid.')
      text = decoder.decode(bytes.subarray(start, start + entry.size))
    } else {
      const source = new Blob([bytes.subarray(start, start + entry.size)])
      const reader = source.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
      const streamDecoder = new TextDecoder()
      let size = 0
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > entry.uncompressed) throw new Error('Ukuran bagian Excel tidak valid.')
          text += streamDecoder.decode(value, { stream: true })
        }
        text += streamDecoder.decode()
      } finally {
        await reader.cancel()
      }
      if (size !== entry.uncompressed) throw new Error('Ukuran bagian Excel tidak valid.')
    }
    const document = new DOMParser().parseFromString(text, 'application/xml')
    if (document.querySelector('parsererror')) throw new Error('Isi file Excel tidak valid.')
    return document
  }

  const [workbook, relations, shared] = await Promise.all([
    xml('xl/workbook.xml'),
    xml('xl/_rels/workbook.xml.rels'),
    files.has('xl/sharedStrings.xml') ? xml('xl/sharedStrings.xml') : null,
  ])
  const elements = (root, tag) => Array.from(root.getElementsByTagNameNS('*', tag))
  const sheet = elements(workbook, 'sheet')[0]
  const id = sheet?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
  const path = elements(relations, 'Relationship').find((relation) => relation.getAttribute('Id') === id)?.getAttribute('Target')
  if (!path) throw new Error('Workbook tidak memiliki lembar data.')
  const name = new URL(path, 'https://xlsx.invalid/xl/workbook.xml').pathname.slice(1)
  const worksheet = await xml(name)
  const strings = shared ? elements(shared, 'si').map((item) => elements(item, 't').map((text) => text.textContent).join('')) : []
  return elements(worksheet, 'row').map((row) => {
    const cells = []
    for (const cell of elements(row, 'c')) {
      const letters = cell.getAttribute('r')?.match(/^[A-Z]{1,3}/)?.[0]
      const column = letters ? [...letters].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1 : cells.length
      const raw = elements(cell, 'v')[0]?.textContent ?? ''
      const type = cell.getAttribute('t')
      cells[column] = type === 's' ? strings[Number(raw)] ?? '' : type === 'inlineStr' ? elements(cell, 't').map((text) => text.textContent).join('') : raw
    }
    return { number: row.getAttribute('r') ?? '', cells }
  }).filter(({ cells }) => cells.some((value) => value.trim()))
}
