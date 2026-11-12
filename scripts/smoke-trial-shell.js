"use strict";
const fs = require("node:fs"), path = require("node:path"), http = require("node:http"), assert = require("node:assert/strict");
const { chromium, launchOptions } = require("./browser-launch").chromiumBrowser();
const { finishSmoke } = require("./smoke-lifecycle");
const root = path.resolve(process.env.PUBLIC_TRIAL_SITE || path.join(__dirname, "../output/browser-trial")), prefix = "/cw-ground-settlement-demo/";
const allowed = new Set(process.env.PUBLIC_TRIAL_SITE
  ? JSON.parse(fs.readFileSync(path.join(root, "build-manifest.json"))).files.map(file => file.name)
  : JSON.parse(fs.readFileSync(path.join(root, "serve-allowlist.json"))));
const dir = fs.mkdtempSync(path.resolve(__dirname, "../output/u1a-shell-"));
const server = http.createServer((req, res) => {
  const p = new URL(req.url, "http://local").pathname, name = p.startsWith(prefix) ? p.slice(prefix.length) || "index.html" : "";
  if (!allowed.has(name)) return res.writeHead(404).end();
  res.setHeader("Content-Type", name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css" : name.endsWith(".html") ? "text/html" : "application/octet-stream");
  fs.createReadStream(path.join(root, name)).on("error", () => res.destroy()).pipe(res);
});
(async () => {
  let browser, failure; const checks = [], errors = [];
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    browser = await chromium.launch(launchOptions); const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
    await context.route("https://tile.openstreetmap.org/**", r => r.abort()); const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`); await page.waitForFunction(() => window.monitoringAppReady);
    assert.equal(await page.locator("#shellPrimary button[data-module]").count(), 8);
    await page.waitForFunction(() => window.TrialShell?.ready);
    const initial = await page.evaluate(() => JSON.stringify(BrowserTrial.getState()));
    const navigate = async view => require('../demo/trial-test-navigation')(page,view);
    for (const view of ["dashboard", "points", "records", "structureRecords", "utilityReviews", "structurePreview", "trends", "contours", "structureAssessments", "followups", "reports", "markers", "layoutPlans", "utilityRegister", "approach", "pointMaintenance", "contacts", "quality"]) await navigate(view);
    assert.equal(await page.evaluate(() => JSON.stringify(BrowserTrial.getState())), initial);
    checks.push("All available legacy destinations reached through normal module and function buttons without data mutation");
    await navigate('dashboard'); await page.locator('[data-dashboard-action="latest-date"]').click();
    await page.waitForFunction(() => !document.getElementById('recordScopeBanner').classList.contains('hidden'));
    await page.locator('[data-module="input"]').click();
    assert.equal(await page.locator('#recordScopeBanner').isVisible(), false);
    checks.push('Primary module navigation retains original handler behavior and clears Dashboard-only record scopes');
    await page.locator("#shellWorkMode").selectOption("engineer"); await page.waitForFunction(() => !document.getElementById("trialDataReview").classList.contains("hidden"));
    const dataReview = page.locator('#trialDataReview');
    assert.match(await dataReview.innerText(), /Ground observation reviews/);
    assert.equal(await dataReview.locator('#qualityRulesForm').isVisible(), false);
    assert.equal(await dataReview.getByRole('button', { name: 'Confirm displayed findings', exact: true }).isDisabled(), true);
    await page.locator('[data-module="notifications"]').click(); assert.match(await page.locator("#trialNotifications").innerText(), /No email is sent/);
    checks.push("Engineer mode opens observation reviews and separate quality information; notifications do not claim delivery");
    await page.locator("#shellWorkMode").selectOption("surveyor"); await page.waitForFunction(() => !document.getElementById("records").classList.contains("hidden"));
    await page.locator("#readingValue").fill("9.9900");
    await page.locator("#shellWorkMode").selectOption("engineer"); assert.equal(await page.locator("#shellWorkMode").inputValue(), "surveyor"); assert.equal(await page.locator("#readingValue").inputValue(), "9.9900");
    await page.locator("#readingValue").fill("");
    await page.locator("#trialRole").selectOption("client"); await page.waitForFunction(() => currentUser.role === "client" && !canEdit());
    await page.locator("#shellWorkMode").selectOption("engineer");
    assert.equal(await page.locator('[data-module="settings"]').isVisible(), false); assert.equal(await page.locator('[data-module="review"]').isVisible(), false); assert.equal(await page.locator("#shellAddReading").isVisible(), false);
    assert.equal(await page.evaluate(() => BrowserTrial.role()), "client");
    await page.locator("#trialRole").selectOption("rss"); await page.waitForFunction(() => currentUser.role === "rss");
    assert.equal(await page.locator('[data-module="alerts"] .shell-badge').innerText(), '—');
    assert.match(await page.locator('[data-module="alerts"] .shell-badge').getAttribute('aria-label'), /restricted/);
    assert.equal(await page.locator('#shellAddReading').isVisible(), false);
    await page.locator("#trialRole").selectOption("project_staff"); await page.waitForFunction(() => currentUser.role === "project_staff");
    assert.equal(await page.locator('[data-module="settings"]').isVisible(), false);
    assert.equal(await page.locator('#shellFunctionRail [data-view="contacts"]').isVisible(), false);
    assert.equal(await page.locator('#shellFunctionRail [data-view="approach"]').isVisible(), false);
    checks.push("Modes retain drafts and never grant capabilities; Staff configuration restricted under U1-B; operational access retained");
    await page.locator("#trialRole").selectOption("admin"); await page.waitForFunction(() => currentUser.role === "admin");
    await page.evaluate(() => localStorage.setItem(navigationStorageKey, JSON.stringify({ viewId: "contours", focus: "" })));
    await page.reload(); await page.waitForFunction(() => window.TrialShell?.ready && !document.getElementById("contours").classList.contains("hidden"));
    await page.evaluate(() => localStorage.setItem(navigationStorageKey, JSON.stringify({ viewId: "unknown", focus: "" })));
    await page.reload(); await page.waitForFunction(() => window.TrialShell?.ready);
    assert.equal(await page.locator("#shellPrimary [aria-current=page]").count(), 1);
    await navigate("approach"); await page.locator("#trialRole").selectOption("project_staff");
    await page.waitForFunction(() => currentUser.role === "project_staff" && document.getElementById("approach").classList.contains("hidden"));
    assert.equal(await page.locator('#shellFunctionRail [data-view="approach"]').isVisible(), false);
    await page.locator("#trialRole").selectOption("admin"); await page.waitForFunction(() => currentUser.role === "admin");
    checks.push("Legacy saved view restores; unknown preference falls back to an available mode landing");
    await navigate("dashboard"); await page.screenshot({ path: path.join(dir, "desktop-light.png"), fullPage: true });
    await page.locator('[data-module="today"]').focus(); await page.keyboard.press('Tab');
    assert.equal(await page.locator('[data-module="input"]').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Enter'); await page.waitForFunction(() => !document.getElementById('records').classList.contains('hidden'));
    await navigate('dashboard');
    for (const theme of ["light", "dark"]) {
      if ((await page.locator('html').getAttribute('data-theme') || "light") !== theme) await page.locator("#appearanceButton").click();
      await page.locator('[data-module="analysis"]').focus(); assert.equal(await page.locator('[data-module="analysis"]').evaluate(el => el === document.activeElement), true);
      const ratios = await page.evaluate(() => {
        const lum = color => { const nums = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => { const s = n / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }); return .2126 * nums[0] + .7152 * nums[1] + .0722 * nums[2]; };
        return ['#shellPrimary [aria-current="page"]', '#shellFunctionRail .active', '#shellModuleNotice', '#shellAddReading', '#shellSessionStatus'].map(selector => {
          const el = document.querySelector(selector), style = getComputedStyle(el); let parent = el, bg;
          do { bg = getComputedStyle(parent).backgroundColor; parent = parent.parentElement; } while (bg === 'rgba(0, 0, 0, 0)' && parent);
          const a = lum(style.color), b = lum(bg); return { selector, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
        });
      });
      for (const r of ratios) assert.ok(r.ratio >= 4.5, theme + ' ' + JSON.stringify(r));
      fs.writeFileSync(path.join(dir, theme + '-contrast.json'), JSON.stringify(ratios));
      const focusRatios = [];
      for (const selector of ['#shellPrimary [data-module="analysis"]', '#shellFunctionRail .active', '#shellWorkMode', '#shellAddReading']) {
        await page.locator(selector).focus();
        await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
        assert.equal(await page.locator(selector).evaluate(el => el === document.activeElement && el.matches(':focus-visible')), true);
        const r = await page.locator(selector).evaluate(el => {
          const lum = color => { const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => { const s = n / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }); return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]; };
          let parent = el.parentElement, bg;
          do { bg = getComputedStyle(parent).backgroundColor; parent = parent.parentElement; } while (bg === 'rgba(0, 0, 0, 0)' && parent);
          const a = lum(getComputedStyle(el).outlineColor), b = lum(bg);
          return { ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), width: parseFloat(getComputedStyle(el).outlineWidth), target: el.getBoundingClientRect().height };
        });
        assert.ok(r.ratio >= 3 && r.width >= 2 && r.target >= 44, theme + ' focus ' + selector + ' ' + JSON.stringify(r)); focusRatios.push({ selector, ...r });
      }
      fs.writeFileSync(path.join(dir, theme + '-focus-contrast.json'), JSON.stringify(focusRatios));
      await page.screenshot({ path: path.join(dir, 'desktop-' + theme + '.png'), fullPage: true });
    }
    // Actual synthetic input and original classifications, followed by browser vision emulation.
    await navigate("records");
    const csv = 'point,date,level,note\n' + [9.998, 9.989, 9.983, 9.978, 9.973, 9.965].map((v, i) => `PSM01,2026-09-0${i + 2},${v},Synthetic accessibility observation`).join('\n');
    await page.locator('#recordCsvInput').setInputFiles({ name: 'synthetic-status.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.locator('dialog[open] textarea[name="reason"]').fill('Synthetic source verified for accessibility test');
    await page.getByRole('button', { name: 'Confirm and save observations', exact: true }).click();
    await page.waitForFunction(() => BrowserTrial.getState().records.length === 10 && !hasUnsavedChanges);
    for (const approach of ['3A', '5A']) {
      await navigate('approach'); await page.locator('#approachSelect').selectOption(approach);
      await page.getByRole('button', { name: 'Save approach and thresholds', exact: true }).click();
      await page.waitForFunction(a => BrowserTrial.getState().monitoringApproach === a && !hasUnsavedChanges, approach);
      await navigate('records'); const beforeText = await page.locator('#recordRows').innerText();
      for (const label of approach === '5A' ? ['Alert', 'Alarm', 'Action 1', 'Action 2', 'Action 3'] : ['Alert', 'Alarm', 'Action']) assert.ok(beforeText.includes(label), approach + ' ' + label);
      const cdp = await context.newCDPSession(page);
      try { for (const type of ['achromatopsia', 'deuteranopia', 'protanopia']) {
        await cdp.send('Emulation.setEmulatedVisionDeficiency', { type });
        assert.equal(await page.locator('#recordRows').innerText(), beforeText);
        await page.screenshot({ path: path.join(dir, approach + '-' + type + '.png'), fullPage: true });
      } } finally { await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'none' }); await cdp.detach(); }
    }
    checks.push('Synthetic 3A/5A status text survives grayscale and red/green color-vision emulation; no color-only severity');
    const detail = page.getByRole("dialog", { name: /Ground details/ });
    const closeDetail = detail.getByRole("button", { name: "Close details" });
    const pointId = "PSM01", detailDate = "2026-09-07";
    const detailSource = '[data-trial-details-point="' + pointId + '"][data-trial-details-date="' + detailDate + '"]';
    const readingDetail = page.locator("#recordRows").locator(detailSource);
    await page.locator('#recordRows [data-trial-details-point="PSM01"][data-trial-details-date="2026-09-02"]').click();
    assert.match(await detail.innerText(), /2026-09-02/);
    assert.match(await detail.innerText(), /9\.9980 mPD/);
    assert.doesNotMatch(await detail.innerText(), /9\.9650 mPD/);
    await closeDetail.click();
    await readingDetail.click();
    await detail.waitFor({ state: "visible" });
    const settledDetail = async () => {
      await detail.getByText("Unreviewed", { exact: true }).waitFor();
      return detail.innerText();
    };
    const expectedDetail = await settledDetail();
    assert.match(expectedDetail, /2026-09-07/);
    assert.match(expectedDetail, /9\.9650 mPD/);
    assert.match(expectedDetail, /Action 3/);
    assert.ok(await closeDetail.evaluate(el => el === document.activeElement));
    await page.keyboard.press("Escape");
    await detail.waitFor({ state: "hidden" });
    await page.waitForFunction(selector => document.activeElement.matches(selector), detailSource);

    await navigate("points");
    await page.locator("#pointRows").locator(detailSource).click();
    assert.equal(await settledDetail(), expectedDetail);
    await closeDetail.click();

    await navigate("trends");
    await page.locator('#trialAnalysisFilters summary').click();
    await page.getByRole('button',{name:'Clear point selection',exact:true}).click();
    await page.getByRole('checkbox',{name:new RegExp('^'+pointId+'(?: |$)')}).check();
    await page.getByRole('button',{name:'Apply analysis scope',exact:true}).click();
    const trendDetail = page.locator("#trendChart").locator(detailSource);
    await trendDetail.focus();
    await page.keyboard.press("Enter");
    assert.equal(await settledDetail(), expectedDetail);
    await closeDetail.click();

    await navigate("dashboard");
    await page.locator('[data-alarm-map-point="PSM01"]').click();
    await page.locator("#dashboardWebMap").locator(detailSource).click();
    assert.equal(await settledDetail(), expectedDetail);
    await closeDetail.click();

    await navigate("followups");
    const eventButton = page.locator("#followupRows [data-trial-details-event]").first();
    const eventId = await eventButton.getAttribute("data-trial-details-event");
    const captured = await page.evaluate(id => BrowserTrial.getState().followupEvents.find(item => item.id === id).trigger, eventId);
    await eventButton.click();
    assert.ok((await detail.innerText()).includes(captured.sourceKey));
    assert.ok((await detail.innerText()).includes(Number(captured.reading).toFixed(4) + " mPD"));
    assert.match(await detail.innerText(), /Captured event source/);
    assert.ok(captured.groundSource);
    assert.match(await detail.innerText(), /Reading revision \d+ · baseline v\d+ · operational criteria v\d+/);
    assert.match(await detail.innerText(), /Captured severity/);
    assert.doesNotMatch(await detail.innerText(), /Current baseline/);
    await closeDetail.click();
    await page.setViewportSize({ width: 375, height: 720 });
    await navigate("records");
    await readingDetail.click();
    const bounds = await detail.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 375 && bounds.height <= 720);
    await page.screenshot({ path: path.join(dir, "ground-details-375.png"), fullPage: true });
    await closeDetail.click();
    checks.push("Shared Ground details preserve exact marker/date across Records, Points, Trend and Map; event source is captured, keyboard focus returns and the dialog fits 375 px");
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.clock.setFixedTime(new Date("2026-10-30T02:00:00.000Z"));
    await page.locator("#pointSelect").selectOption("PSM02");
    await page.locator("#readingDate").fill("2026-10-30");
    await page.locator("#readingValue").fill("9.9900");
    await page.getByRole("button", { name: "Add or update record", exact: true }).click();
    await page.locator('dialog[open] textarea[name="reason"]').fill("Synthetic M03 source verification");
    await page.getByRole("button", { name: "Confirm and save observations", exact: true }).click();
    await page.waitForFunction(() => BrowserTrial.getState().records.some(row => row.pointId === "PSM02" && row.date === "2026-10-30") && !hasUnsavedChanges);
    await page.locator('#recordRows [data-trial-details-point="PSM02"][data-trial-details-date="2026-10-30"]').click();
    await detail.getByText("Captured trial assessment", { exact: true }).waitFor();
    const observationDetails = await detail.innerText();
    assert.match(observationDetails, /Reading revision \d+ · baseline v\d+ · criteria v\d+/);
    assert.match(observationDetails, /2026-10-30T02:00:00.000Z/);
    assert.match(observationDetails, /Captured settlement/);
    await closeDetail.click();
    checks.push("Details resolve the captured U2-A assessment and version references for the exact reading");
    const triggered = await page.evaluate(() => BrowserTrial.getState().followupEvents.find(event => event.pointId === "PSM02" && event.trigger.recordDate === "2026-10-30"));
    assert.ok(triggered?.trigger.groundSource);
    await page.clock.setFixedTime(new Date("2026-10-30T03:00:00.000Z"));
    await page.locator("#readingDate").fill("2026-10-30");
    await page.locator("#readingValue").fill("9.9700");
    await page.getByRole("button", { name: "Add or update record", exact: true }).click();
    await page.locator('dialog[open] textarea[name="reason"]').fill("Synthetic correction after threshold event");
    await page.getByRole("button", { name: "Confirm and save observations", exact: true }).click();
    await page.waitForFunction(() => BrowserTrial.getState().records.some(row => row.pointId === "PSM02" && row.date === "2026-10-30" && row.reading === 9.97) && !hasUnsavedChanges);
    const amended = await page.evaluate(id => BrowserTrial.getState().followupEvents.find(event => event.id === id), triggered.id);
    assert.deepEqual(amended.trigger, triggered.trigger);
    assert.notEqual(amended.latestObservation.groundSource.revisionId, triggered.trigger.groundSource.revisionId);
    assert.equal(amended.eventSeverityLabel,"Action 3");
    await navigate("followups");
    await page.locator('#followupRows [data-trial-details-event="' + triggered.id + '"]').click();
    assert.match(await detail.innerText(), /9\.9900 mPD/);
    assert.doesNotMatch(await detail.innerText(), /9\.9700 mPD/);
    await closeDetail.click();
    checks.push("A real Ground threshold event links the exact observation revision and retains its trigger after a higher-severity correction");

    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [1920, 1024, 390, 375, 844]) {
      await page.setViewportSize({ width, height: width === 844 ? 390 : 1080 }); await page.locator('[data-module="input"]').click();
      assert.ok(await page.locator("#shellWorkMode").isVisible()); assert.ok(await page.locator("#recordForm").isVisible());
      await page.screenshot({ path: path.join(dir, "viewport-" + width + ".png"), fullPage: true });
    }
    checks.push("Light/dark computed shell text contrast, keyboard focus, reduced motion and desktop/tablet/narrow viewports");
    assert.deepEqual(errors, []); fs.writeFileSync(path.join(dir, "result.json"), JSON.stringify({ checks, errors, browser: browser.version(), tiles: "Blocked; no live-map acceptance" }, null, 2)); console.log("PASS " + dir);
  } catch (error) { failure = error; }
  finally { await finishSmoke(failure, [["evidence", async () => { if (failure) fs.writeFileSync(path.join(dir, "failure.txt"), failure.stack); }], ["browser", async () => { if (browser) await browser.close(); }], ["server", async () => { if (server.listening) await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }]]); }
})().catch(e => { console.error(e); process.exitCode = 1; });
