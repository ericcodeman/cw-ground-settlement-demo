const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert/strict');
const root = path.resolve(__dirname, '../site'), manifest = JSON.parse(fs.readFileSync(path.join(root, 'build-manifest.json')));
function list(dir, prefix = '') { return fs.readdirSync(dir).sort().flatMap(n => { const file = path.join(dir, n), s = fs.lstatSync(file); assert.equal(s.isSymbolicLink(), false); if(s.isFile())assert.equal(s.nlink, 1, 'No hardlinked publication files'); return s.isDirectory() ? list(file, prefix + n + '/') : [prefix + n]; }); }
assert.deepEqual(list(root).filter(n => n !== 'build-manifest.json'), manifest.files.map(f => f.name));
for (const f of manifest.files) {
  assert.ok(!f.name.includes('..')); const bytes = fs.readFileSync(path.join(root, f.name));
  assert.equal(bytes.length, f.bytes); assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), f.sha256);
  assert.ok(!/(^|\/)(server\.js|auth|uploads|\.env|\.git)(\/|$)|\.map$/.test(f.name));
  if (/\.(js|html|json|md|css|txt|csv)$/.test(f.name)) assert.equal(/C:\\Users\\|gan\.hongyang|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]+|BEGIN (RSA |OPENSSH )?PRIVATE KEY/.test(bytes.toString()), false, 'Private content in ' + f.name);
}
assert.equal(crypto.createHash('sha256').update(JSON.stringify(manifest.files)).digest('hex'), manifest.payloadHash);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.match(html, /Browser single-user trial/); assert.match(html, /dashboardWebMap/); assert.match(html, /Content-Security-Policy/);
assert.ok(manifest.files.some(f => f.name === 'font.ttf')); assert.ok(manifest.files.some(f => f.name === 'synthetic-monitoring-records.csv'));
console.log('Verified ' + manifest.files.length + ' site files; ' + manifest.build + '; payload ' + manifest.payloadHash);
