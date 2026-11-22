const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'dist');
const assets = ['index.html', 'style.css', 'app.js', 'excel.js', 'model.js', 'model-data.js', 'templat-vinix7.xlsx', 'fonts/InterVariable.woff2', 'fonts/OFL-Inter.txt'];
if (fs.existsSync(out)) {
  const check = (dir, rel = '') => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const key = rel + entry.name;
      if (entry.isDirectory() && key === 'fonts') check(path.join(dir, entry.name), 'fonts/');
      else if (!entry.isFile() || !assets.includes(key)) throw new Error(`Unexpected file in dist: ${key}`);
    }
  };
  if (fs.lstatSync(out).isSymbolicLink()) throw new Error('dist may not be a symlink');
  check(out);
}
if (fs.existsSync(path.join(out, 'fonts')) && fs.lstatSync(path.join(out, 'fonts')).isSymbolicLink()) throw new Error('dist/fonts may not be a symlink');
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });
for (const asset of assets) {
  const from = path.join(root, asset);
  if (!fs.lstatSync(from).isFile()) throw new Error(`Not a regular static asset: ${asset}`);
  fs.copyFileSync(from, path.join(out, asset));
}
console.log(`Staged ${assets.length} allowlisted static assets in dist.`);
