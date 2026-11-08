const fs = require('fs'), assert = require('assert/strict');
(async () => {
  const { chromium, launchOptions } = require('../scripts/browser-launch').chromiumBrowser();
  const browser = await chromium.launch(launchOptions);
  const dir = 'output/browser-trial-boundaries-' + Date.now();
  fs.mkdirSync(dir, { recursive: true });
  const errors = [], requests = [];
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    p.on('pageerror', e => errors.push(e.message));
    p.on('request', r => requests.push(r.url()));
    await p.route('https://tile.openstreetmap.org/**', r => r.abort());
    const url = process.env.TRIAL_URL || 'http://127.0.0.1:3184/cw-ground-settlement-demo/';
    await p.goto(url); await p.waitForFunction(() => window.monitoringAppReady);
    await p.waitForFunction(() => document.querySelector('#dashboardContourSummary').textContent.startsWith('4 eligible input markers'));
    const initial = await p.evaluate(() => BrowserTrial.getState());
    // Normal CSV preview: invalid and mutually conflicting input cannot be saved.
    await p.locator('[data-view="records"]').click();
    for (const rows of ['PSM01,not-a-date,9.9\n', 'PSM01,2026-09-02,9.9\nPSM01,2026-09-02,9.8\n']) {
      await p.locator('#recordCsvInput').setInputFiles({ name: 'synthetic-invalid.csv', mimeType: 'text/csv', buffer: Buffer.from('point,date,level\n' + rows) });
      await p.locator('dialog[open]').waitFor();
      assert.equal(await p.getByRole('button', { name: 'Confirm and save observations', exact: true }).isDisabled(), true);
      await p.getByRole('button', { name: 'Cancel preview', exact: true }).click();
      assert.deepEqual(await p.evaluate(() => BrowserTrial.getState()), initial);
    }
    const row = initial.records[0];
    await p.locator('#recordCsvInput').setInputFiles({ name: 'synthetic-duplicate.csv', mimeType: 'text/csv', buffer: Buffer.from(`point,date,level\n${row.pointId},${row.date},${row.reading}\n`) });
    await p.waitForFunction(() => document.querySelector('#recordMessage').textContent.includes('1 identical observations skipped; no notifications generated.'));
    assert.equal(await p.locator('dialog[open]').count(), 0);
    assert.deepEqual(await p.evaluate(() => BrowserTrial.getState()), initial);
    // Invalid imports are atomic and never replace current project data.
    const importFailures = await p.evaluate(async () => {
      const before = JSON.stringify(BrowserTrial.getState()), outcomes = [];
      for (const text of ['{', JSON.stringify({ schema: 'wrong', projects: [] }), JSON.stringify({ schema: 'cw-browser-trial-1', projectId: 'missing', projects: [['trial', BrowserTrial.getState()]] })]) {
        try { await BrowserTrial.importData(new File([text], 'invalid.json')); outcomes.push(false); } catch { outcomes.push(JSON.stringify(BrowserTrial.getState()) === before); }
      }
      try { await BrowserTrial.importData({ size: 17 * 1024 * 1024 }); outcomes.push(false); } catch { outcomes.push(JSON.stringify(BrowserTrial.getState()) === before); }
      return outcomes;
    });
    assert.deepEqual(importFailures, [true, true, true, true]);
    // Original point and 5A forms remain real local operations.
    await p.locator('[data-view="markers"]').click();
    for (const [id, value] of Object.entries({ markerName: 'SYN05', markerFacility: 'Synthetic Zone C', markerEasting: '835100', markerNorthing: '819100', markerDate: '2026-09-01', markerLevel: '10' })) await p.locator('#' + id).fill(value);
    await p.getByRole('button', { name: 'Add monitoring point', exact: true }).click();
    await p.waitForFunction(() => BrowserTrial.getState().points.some(x => x.id === 'SYN05') && !hasUnsavedChanges);
    await p.locator('[data-view="approach"]').click();
    await p.locator('#approachSelect').selectOption('5A');
    await p.getByRole('button', { name: 'Save approach and thresholds', exact: true }).click();
    await p.waitForFunction(() => BrowserTrial.getState().monitoringApproach === '5A' && !hasUnsavedChanges);
    await p.locator('#trialRole').selectOption('client');
    await p.waitForFunction(() => BrowserTrial.role() === 'client' && !canEdit());
    assert.equal(await p.locator('[data-view="markers"]').isVisible(), false);
    await p.locator('#trialRole').selectOption('admin');
    await p.waitForFunction(() => canEdit());
    // Reset is a deliberate UI action and affects only this page's trial memory.
    p.once('dialog', d => d.accept());
    await p.getByRole('button', { name: 'Reset trial', exact: true }).click();
    await p.waitForFunction(() => window.monitoringAppReady && BrowserTrial.getState().points.length === 4);
    assert.deepEqual(await p.evaluate(() => BrowserTrial.getState()), initial);
    await p.setViewportSize({ width: 390, height: 844 });
    await p.screenshot({ path: dir + '/narrow-dashboard.png', fullPage: true });
    assert.ok(await p.locator('#trialToolbar').isVisible());
    // Network boundary: local static resources plus explicitly blocked tiles only.
    const origin = new URL(url).origin;
    assert.deepEqual(requests.filter(u => !u.startsWith('data:') && !u.startsWith('blob:') && !(new URL(u).origin === origin && new URL(u).pathname.startsWith('/cw-ground-settlement-demo/')) && new URL(u).origin !== 'https://tile.openstreetmap.org'), []);
    assert.deepEqual(errors, []);
    fs.writeFileSync(dir + '/result.json', JSON.stringify({ result: 'PASS', scope: 'CSV invalid/conflict/duplicate, atomic invalid import, point registration, 5A, role simulation, reset, narrow screen, resource boundary', requests, errors }, null, 2));
    console.log('PASS ' + dir);
  } catch (e) { fs.writeFileSync(dir + '/failure.json', JSON.stringify({ error: e.stack, errors, requests })); throw e; }
  finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
