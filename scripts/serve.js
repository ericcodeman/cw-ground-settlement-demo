const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../site'), base = '/cw-ground-settlement-demo/';
const names = new Set(JSON.parse(fs.readFileSync(path.join(root, 'build-manifest.json'))).files.map(f => f.name).concat('build-manifest.json'));
http.createServer((req, res) => {
  try { const p = decodeURIComponent(new URL(req.url, 'http://local').pathname); if (!p.startsWith(base)) throw Error(); const name = p.slice(base.length) || 'index.html'; if (!names.has(name)) throw Error(); const file = path.join(root, name); res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.csv': 'text/csv' })[path.extname(name)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res); }
  catch { res.writeHead(404).end(); }
}).listen(Number(process.env.PORT || 3190), '127.0.0.1', () => console.log('Static trial ready'));
