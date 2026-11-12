const { spawn, spawnSync } = require('child_process');
const fs = require('node:fs'), path = require('node:path');
fs.mkdirSync('output', { recursive: true });
for (const suite of ['smoke-trial-shell', 'smoke-trial-backup']) {
  const result = spawnSync(process.execPath, ['scripts/' + suite + '.js'], {
    env: { ...process.env, PUBLIC_TRIAL_SITE: path.resolve('site') }, stdio: 'inherit'
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
const server = spawn(process.execPath, ['scripts/serve.js'], { env: process.env, stdio: ['ignore', 'pipe', 'inherit'] });
server.stdout.once('data', () => {
  try {
    const env = { ...process.env, TRIAL_URL: 'http://127.0.0.1:' + (process.env.PORT || 3190) + '/cw-ground-settlement-demo/' };
    for (const script of ['test-trial', 'test-trial-structure', 'test-trial-utility', 'test-trial-layout', 'test-trial-projects', 'test-trial-boundaries', 'test-trial-contour-race', 'test-trial-pdf']) {
      const result = spawnSync(process.execPath, ['tests/' + script + '.js'], { env, stdio: 'inherit' });
      if (result.status !== 0) { process.exitCode = result.status || 1; break; }
    }
  } finally { server.kill(); }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.on('exit', code => { if (code) process.exitCode = code; });
