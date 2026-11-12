const fs = require('fs'), assert = require('assert/strict');
(async () => {
  const { chromium, launchOptions } = require('../scripts/browser-launch').chromiumBrowser();
  const b = await chromium.launch(launchOptions), dir = 'output/browser-trial-contour-race-' + Date.now();
  fs.mkdirSync(dir, { recursive: true });
  try {
    const p = await b.newPage(); await p.route('https://tile.openstreetmap.org/**', r => r.abort());
    await p.goto(process.env.TRIAL_URL || 'http://127.0.0.1:3184/cw-ground-settlement-demo/');
    await p.waitForFunction(() => window.monitoringAppReady);
    await require('./trial-test-navigation')(p, 'contours');
    await p.waitForFunction(() => latestContourResult && !document.querySelector('#exportContourPng').disabled);
    // Hold exactly one completed response, without sleeping or changing calculations.
    await p.evaluate(() => {
      const original = trialRequest; window.holdNextContour = true;
      window.trialRequest = async (...args) => {
        const response = await original(...args);
        if (String(args[0]).startsWith('/api/settlement-contours') && window.holdNextContour) {
          window.holdNextContour = false;
          await new Promise(resolve => { window.releaseHeldContour = resolve; });
        }
        return response;
      };
    });
    await p.locator('#refreshContour').click();
    await p.waitForFunction(() => typeof window.releaseHeldContour === 'function');
    await p.locator('#contourDate').fill('2026-08-01'); await p.locator('#contourDate').blur();
    await p.waitForFunction(() => /three|3|insufficient|No eligible/i.test(document.querySelector('#contourStatus').textContent));
    const status = await p.locator('#contourStatus').innerText();
    await p.evaluate(async () => { window.releaseHeldContour(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    assert.equal(await p.locator('#contourStatus').innerText(), status);
    assert.equal(await p.locator('#exportContourPng').isDisabled(), true);
    assert.equal(await p.evaluate(() => !!latestContourResult), false);
    const timings = await p.evaluate(async () => {
      const result = [];
      for (const count of [4, 25]) {
        const data = BrowserTrial.getState();
        if (count === 25) {
          const seed = data.points[0]; data.points = []; data.records = [];
          for (let i = 0; i < count; i++) { const id = 'SYN' + i; data.points.push({ ...seed, id, easting: 835000 + (i % 5) * 20, northing: 819000 + Math.floor(i / 5) * 20, lat: undefined, lng: undefined }); data.records.push({ pointId: id, date: '2026-09-01', reading: 10 - i / 1000, note: 'Synthetic capacity probe' }); }
          await BrowserTrial.importData(new File([JSON.stringify({ schema: 'cw-browser-trial-1', projectId: 'trial', projects: [['trial', data]] })], 'synthetic.json'));
        }
        const start = performance.now(), response = await trialRequest('/api/settlement-contours?group=ground&gridSize=40'), body = await response.json();
        if (!response.ok) throw Error(body.error);
        result.push({ markers: count, milliseconds: performance.now() - start, cells: body.presentation.surfaceCells.length });
      }
      return result;
    });
    fs.writeFileSync(dir + '/result.json', JSON.stringify({ result: 'PASS', status, timings, limitation: 'Synchronous original algorithm; synthetic probes only, not production capacity approval' }, null, 2));
    console.log('PASS ' + dir);
  } catch (e) { fs.writeFileSync(dir + '/failure.txt', e.stack); throw e; } finally { await b.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
