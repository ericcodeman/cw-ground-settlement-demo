const fs = require('fs'), assert = require('assert/strict');
module.exports = async function (page, directory, section) {
  await require('./trial-test-navigation')(page, 'reports');
  await page.locator(`#reportSections input[value="${section}"]`).check();
  await page.getByRole('button', { name: 'Generate report preview', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('#downloadMonitoringReport').disabled);
  const snapshot = await page.evaluate(() => structuredClone(monitoringReportSnapshot));
  assert.equal(snapshot[section === 'structure' ? 'structureAssessments' : 'utilityReviews'].length, 2);
  const download = page.waitForEvent('download'); await page.locator('#downloadMonitoringReport').click();
  const file = directory + '/' + section + '-report.pdf'; await (await download).saveAs(file);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true });
  const document = await task.promise, text = [];
  try { for (let n = 1; n <= document.numPages; n++) text.push((await (await document.getPage(n)).getTextContent()).items.map(i => i.str).join(' ')); }
  finally { await task.destroy(); }
  assert.match(text.join(' '), section === 'structure' ? /Structure assessments/ : /Utility settlement reviews/);
  assert.ok(text.join(' ').includes(snapshot.snapshotHash));
  fs.writeFileSync(directory + '/' + section + '-report.snapshot.json', JSON.stringify(snapshot));
};
