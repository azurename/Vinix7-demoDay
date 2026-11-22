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
window.addEventListener('DOMContentLoaded', async () => {
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
  history.replaceState(null, '', '#individu'); showScreen();
  phase('parse-template');
  const rows = await readWorkbook(bytes(GOOD).buffer);
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
  form.requestSubmit();
  const prediction = get('profile-result').querySelector('h2')?.textContent;
  const scores = [...get('profile-result').querySelectorAll('.prob strong')].map(el => el.textContent);
  if (!['Hybrid','Onsite','Remote'].includes(prediction) || scores.length !== 3) throw Error('form did not show a real model result');
  if (document.documentElement.scrollWidth > window.innerWidth) throw Error('form overflow');
  history.replaceState(null, '', '#excel'); showScreen();
  phase('batch-good');
  await handleFile(new File([bytes(GOOD)], 'synthetic.xlsx'));
  const batch = [...get('rows').rows[0].cells].map(el => el.textContent);
  if (batch[1] !== prediction || scores.some((score,i) => score !== batch[i+2])) throw Error('batch and form results disagree');
  if (!get('upload-status').textContent.startsWith('1 dari 1')) throw Error('valid row total wrong');
  phase('batch-mixed');
  await handleFile(new File([bytes(MIXED)], 'mixed.xlsx'));
  const mixedRows = [...get('rows').rows];
  if (!mixedRows[1]?.textContent.includes('Periksa')) throw Error('invalid category not isolated to its row');
  if (!mixedRows[2]?.textContent.includes('Periksa: IPK')) throw Error('Excel boolean accepted as an IPK survey code');
  if (!get('upload-status').textContent.startsWith('1 dari 3')) throw Error('mixed workbook count wrong');
  phase('batch-duplicate');
  await handleFile(new File([bytes(DUP)], 'duplicate-header.xlsx'));
  if (!get('upload-status').textContent.includes('duplikat') || !get('preview').hidden) throw Error('duplicate header not rejected');
  phase('load-font');
  const fonts = await document.fonts.load('400 16px Inter');
  if (!getComputedStyle(document.body).fontFamily.includes('Inter') || !fonts.some(f => f.status === 'loaded' && f.family.includes('Inter'))) throw Error('real Inter not loaded');
  if (document.documentElement.scrollWidth > window.innerWidth) throw Error('page overflow');
  const external = performance.getEntriesByType('resource').filter(entry => /^(https?:|wss?:)/.test(entry.name));
  if (external.length) throw Error('unexpected external web request during inference');
  report.textContent = JSON.stringify({features: names.length, prediction, scores, mixed: '1 valid / 3', boolean: 'rejected', duplicateHeader: 'rejected', font: fonts[0].family, viewport: innerWidth, externalResources: external.length});
 } catch(e) { report.textContent=JSON.stringify({error:e.message}); }
});
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
    script = HOOK.replace('GOOD', encoded(good)).replace('MIXED', encoded(mixed.getvalue())).replace('DUP', encoded(dup.getvalue()))
    page.write_text(page.read_text(encoding='utf8').replace('</body>',script+'</body>'),encoding='utf8')
    for viewport in ('1440,900','390,844'):
        profile = tmp / ('profile-' + viewport.split(',')[0])
        proc = subprocess.Popen([str(BROWSER), '--headless=new', f'--user-data-dir={profile}', '--remote-debugging-port=0',
            '--disable-background-networking','--disable-sync','--disable-extensions','--no-first-run','--disable-gpu','--allow-file-access-from-files',
            '--force-device-scale-factor=1', f'--window-size={viewport}',page.as_uri()],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            endpoint = profile / 'DevToolsActivePort'
            deadline = time.monotonic() + 8
            while not endpoint.is_file() and proc.poll() is None and time.monotonic() < deadline:
                time.sleep(0.1)
            port = endpoint.read_text().splitlines()[0]
            time.sleep(0.5)  # Wait for the launch URL to be assigned to the target.
            probe = subprocess.run(['node', str(Path(__file__).with_name('browser-cdp.cjs')), port, page.as_uri()],
                                   capture_output=True, text=True, encoding='utf8', timeout=25, check=False)
            assert probe.returncode == 0, probe.stderr
            actual = json.loads(probe.stdout)
            assert actual.get('features') == 16, actual
            print(viewport, json.dumps(actual,ensure_ascii=False))
        finally:
            proc.terminate()
            proc.wait(timeout=8)
