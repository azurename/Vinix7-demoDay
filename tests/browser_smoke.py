"""Exercise the real static app in a fresh Chromium profile with a synthetic workbook."""
import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
import time
from io import BytesIO
from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ('index.html', 'app.js', 'model.js', 'model-data.js', 'excel.js', 'style.css', 'templat-vinix7.xlsx', 'fonts')
BROWSER = next(p for p in (Path('C:/Program Files/Google/Chrome/Application/chrome.exe'),
                            Path('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')) if p.is_file())

HOOK = r'''
<script>
window.runVinixAudit = async () => {
 const report = document.createElement('pre'); report.id = 'audit-results'; document.body.append(report);
 const phase = value => { report.textContent = JSON.stringify({ phase: value }); };
 phase('startup');
 try {
  const get = id => document.getElementById(id);
  const named = [...get('fields').querySelectorAll('[name]')];
  const names = [...new Set(named.map(el => el.name))];
  if (names.length !== 16) throw Error(`expected 16 fields, got ${names.length}`);
  const form = get('profile');
  const bytes = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
  const home = get('beranda');
  if (!/pencari kerja/i.test(home.innerText) || !/perusahaan/i.test(home.innerText)) throw Error('home does not name both audiences');
  if (/model demo|fitur input/i.test(home.innerText)) throw Error('technical demo text shown on home');
  history.replaceState(null, '', '#individu'); showScreen();
  phase('parse-template');
  const rows = await readWorkbook(bytes(__GOOD_WORKBOOK__).buffer);
  const [headers, sample] = rows;
  for (let i=0; i<headers.cells.length; i++) {
   const key = headers.cells[i];
   const value = sample.cells[i];
   const controls = named.filter(el => el.name === key);
   if (!controls.length) throw Error(`missing control ${key}`);
   if (controls[0].type === 'checkbox') {
    const selected = value.split(/[,;|]/).map(x=>x.trim());
    for (const el of controls) el.checked = selected.includes(el.value);
   } else controls[0].value = value;
  }
  if (!form.checkValidity()) throw Error('valid fixture rejected by form');
  const resultPanel = get('profile-result');
  const submit = get('profile-submit');
  const firstMulti = named.find(el => el.type === 'checkbox');
  const selected = named.filter(el => el.name === firstMulti.name && el.checked);
  for (const el of selected) el.checked = false;
  submit.click();
  if (document.activeElement !== firstMulti || !get('form-message').textContent) throw Error('invalid submit did not focus the missing answer');
  for (const el of selected) el.checked = true;

  submit.focus();
  submit.scrollIntoView({block: 'center', behavior: 'instant'});
  const before = scrollY;
  const initialTop = resultPanel.getBoundingClientRect().top;
  if (before <= 0) throw Error('fixture must start scrolled down at the submit button');
  submit.click();
  const recommendation = resultPanel.querySelector('h2')?.textContent;
  const scores = [...resultPanel.querySelectorAll('.prob strong')].map(el => el.textContent);
  if (!/Hybrid|Onsite|Remote/.test(recommendation) || scores.length !== 3) throw Error('form did not show a real model result');
  if (!resultPanel.contains(document.activeElement)) throw Error('valid submit did not move focus to the result');
  const headingBounds = resultPanel.querySelector('h2').getBoundingClientRect();
  if (headingBounds.top < 0 || headingBounds.bottom > innerHeight) throw Error('result heading is outside the viewport after submit');
  if (initialTop < 0 && scrollY >= before) throw Error('result above the form button did not scroll up');
  if (location.hash !== '#individu') throw Error('valid submit changed the active page');
  if (!/dibanding/i.test(resultPanel.innerText) || !/sebelum melamar/i.test(resultPanel.innerText)) throw Error('form lacks a comparison and an actionable recommendation');
  if (!resultPanel.querySelector('li') || !/kamu memilih/i.test(resultPanel.innerText)) throw Error('form lacks reasons based on selected answers');
  if (/model demo|catatan penggunaan|batang menunjukkan/i.test(get('individu').innerText)) throw Error('form still shows demo or technical chart copy');
  if (!resultPanel.querySelector('details:not([open])')) throw Error('raw comparison scores were not de-emphasized');
  const dropdown = named.find(el => el.tagName === 'SELECT');
  dropdown.dispatchEvent(new Event('change', { bubbles: true }));
  if (resultPanel.querySelector('details')) throw Error('stale result remained after changing an answer');
  if (document.documentElement.scrollWidth > window.innerWidth) throw Error('form overflow');
  history.replaceState(null, '', '#excel'); showScreen();
  phase('batch-good');
  await handleFile(new File([bytes(__GOOD_WORKBOOK__)], 'synthetic.xlsx'));
  const batch = [...get('rows').rows[0].cells].map(el => el.textContent);
  const rawProfile = Object.fromEntries(headers.cells.map((key, i) => [key, sample.cells[i]]));
  const rawResult = predictProfile(globalThis.VINIX7_MODEL, rawProfile);
  const originalLabels = { hybrid: 'Hybrid', onsite: 'Onsite', remote: 'Remote' };
  if (batch[1] !== originalLabels[rawResult.label] || scores.some((score,i) => score !== batch[i+2])) throw Error('batch model label changed or form scores disagree');
  if (!get('upload-status').textContent.startsWith('1 dari 1')) throw Error('valid row total wrong');
  phase('batch-mixed');
  await handleFile(new File([bytes(__MIXED_WORKBOOK__)], 'mixed.xlsx'));
  const mixedRows = [...get('rows').rows];
  if (!mixedRows[1]?.textContent.includes('Periksa')) throw Error('invalid category not isolated to its row');
  if (!mixedRows[2]?.textContent.includes('Periksa: IPK')) throw Error('Excel boolean accepted as an IPK survey code');
  if (!get('upload-status').textContent.startsWith('1 dari 3')) throw Error('mixed workbook count wrong');
  phase('batch-duplicate');
  await handleFile(new File([bytes(__DUP_WORKBOOK__)], 'duplicate-header.xlsx'));
  if (!get('upload-status').textContent.includes('duplikat') || !get('preview').hidden) throw Error('duplicate header not rejected');
  phase('load-font');
  const fonts = await document.fonts.load('400 16px Inter');
  if (!getComputedStyle(document.body).fontFamily.includes('Inter') || !fonts.some(f => f.status === 'loaded' && f.family.includes('Inter'))) throw Error('real Inter not loaded');
  if (document.documentElement.scrollWidth > window.innerWidth) throw Error('page overflow');
  const external = performance.getEntriesByType('resource').filter(entry => /^(https?:|wss?:)/.test(entry.name));
  if (external.length) throw Error('unexpected external web request during inference');
  report.textContent = JSON.stringify({features: names.length, recommendation, originalBatchPrediction: batch[1], scores, mixed: '1 valid / 3', boolean: 'rejected', duplicateHeader: 'rejected', font: fonts[0].family, viewport: innerWidth, externalResources: external.length});
 } catch(e) { report.textContent=JSON.stringify({error:e.message}); }
 return JSON.parse(report.textContent);
};
</script>'''

def encoded(data):
    return json.dumps(base64.b64encode(data).decode('ascii'))

with TemporaryDirectory(prefix='vinix7-test-', dir=os.environ.get('TMPDIR')) as tmp:
    tmp = Path(tmp)
    for name in ASSETS:
        path = ROOT / name
        if path.is_dir():
            shutil.copytree(path,tmp / name)
        elif path.is_file():
            shutil.copy2(path,tmp / name)
    template = tmp / 'templat-vinix7.xlsx'
    good = template.read_bytes()
    wb = load_workbook(template)
    sheet = wb.worksheets[0]
    bad = [cell.value for cell in sheet[2]]
    bad[0] = 'kode-sintetis-tidak-valid'
    sheet.append(bad)
    boolean = [cell.value for cell in sheet[2]]
    boolean[[cell.value for cell in sheet[1]].index('IPK')] = True
    sheet.append(boolean)
    mixed = BytesIO()
    wb.save(mixed)
    sheet.cell(1, sheet.max_column + 1, sheet.cell(1,1).value)
    dup = BytesIO()
    wb.save(dup)
    page = tmp / 'index.html'
    # Use sentinels outside the Base64 alphabet so a later replacement cannot corrupt an earlier workbook.
    script = (HOOK.replace('__GOOD_WORKBOOK__', encoded(good))
                  .replace('__MIXED_WORKBOOK__', encoded(mixed.getvalue()))
                  .replace('__DUP_WORKBOOK__', encoded(dup.getvalue())))
    page.write_text(page.read_text(encoding='utf8').replace('</body>',script+'</body>'),encoding='utf8')
    for viewport in ('1440,900','768,900','375,844'):
        profile = tmp / ('profile-' + viewport.split(',')[0])
        proc = subprocess.Popen([str(BROWSER), '--headless=new', f'--user-data-dir={profile}', '--remote-debugging-port=0',
            '--disable-background-networking','--disable-sync','--disable-extensions','--no-first-run','--disable-gpu','--allow-file-access-from-files',
            '--force-device-scale-factor=1', 'about:blank'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            endpoint = profile / 'DevToolsActivePort'
            deadline = time.monotonic() + 8
            port = None
            while proc.poll() is None and time.monotonic() < deadline:
                try:
                    lines = endpoint.read_text().splitlines()
                    if lines and lines[0].isdigit():
                        port = lines[0]
                        break
                except (FileNotFoundError, PermissionError):
                    pass  # Chromium can create the port file before it is readable on Windows.
                time.sleep(0.1)
            assert port, 'Chromium did not publish a readable debugging port'
            probe = subprocess.run(['node', str(Path(__file__).with_name('browser-cdp.cjs')), port, page.as_uri(), viewport],
                                   capture_output=True, text=True, encoding='utf8', timeout=25, check=False)
            assert probe.returncode == 0, probe.stderr
            actual = json.loads(probe.stdout)
            assert actual.get('features') == 16, actual
            assert actual.get('viewport') == int(viewport.split(',')[0]), actual
            print(viewport, json.dumps(actual,ensure_ascii=False))
        finally:
            proc.terminate()
            proc.wait(timeout=8)
