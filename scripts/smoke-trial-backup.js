"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { chromium, launchOptions } = require("./browser-launch").chromiumBrowser();
const navigate = require("../demo/trial-test-navigation");
const { finishSmoke } = require("./smoke-lifecycle");

const root = path.resolve(process.env.PUBLIC_TRIAL_SITE || path.join(__dirname, "../output/browser-trial"));
const output = fs.mkdtempSync(path.resolve(__dirname, "../output/m09-backup-"));
const prefix = "/cw-ground-settlement-demo/";
const allowed = new Set(process.env.PUBLIC_TRIAL_SITE
  ? JSON.parse(fs.readFileSync(path.join(root, "build-manifest.json"))).files.map(file => file.name)
  : JSON.parse(fs.readFileSync(path.join(root, "serve-allowlist.json"), "utf8")));
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://local").pathname;
  const name = pathname.startsWith(prefix) ? pathname.slice(prefix.length) || "index.html" : "";
  if (!allowed.has(name)) return response.writeHead(404).end();
  const mime = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html" };
  response.setHeader("Content-Type", mime[path.extname(name)] || "application/octet-stream");
  fs.createReadStream(path.join(root, name)).on("error", () => response.destroy()).pipe(response);
});

(async () => {
  let browser, page, failure;
  const errors = [];
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    browser = await chromium.launch(launchOptions);
    page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
    page.on("pageerror", error => errors.push(error.message));
    await page.route("https://tile.openstreetmap.org/**", route => route.abort());
    const url = "http://127.0.0.1:" + server.address().port + prefix;
    await page.goto(url);
    await page.waitForFunction(() => window.TrialShell?.ready);
    const nav = view => navigate(page, view);
    const state = () => page.evaluate(() => BrowserTrial.getState());
    const saved = () => page.waitForFunction(() => !hasUnsavedChanges && !saveBlocked);
    const backupPanel = page.locator("#trialBackup");
    const preview = page.locator("#trialBackupPreview");
    const archive = backupPanel.locator("[data-report-archive]");
    const download = async (button, filename) => {
      const result = page.waitForEvent("download");
      await button.click();
      const file = path.join(output, filename);
      await (await result).saveAs(file);
      return file;
    };
    await nav("records");
    await page.locator("#pointSelect").selectOption("PSM01");
    await page.locator("#readingDate").fill("2026-09-02");
    await page.locator("#readingValue").fill("9.9700");
    await page.locator("#readingNote").fill("Synthetic backup reading");
    await page.getByRole("button", { name: "Add or update record", exact: true }).click();
    await page.getByRole("button", { name: "Confirm and save observations", exact: true }).click();
    await page.waitForFunction(() => BrowserTrial.getState().followupEvents.some(event => event.pointId === "PSM01"));
    await saved();

    const png = await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 400;
      canvas.getContext("2d").fillRect(0, 0, 640, 400);
      return canvas.toDataURL();
    });
    const image = Buffer.from(png.split(",")[1], "base64");
    const imageInput = { name: "synthetic-plan.png", mimeType: "image/png", buffer: image };
    await nav("followups");
    await page.locator('[data-followup-id]').first().click();
    await page.locator("#followupOwner").selectOption("pilot-reviewer");
    await page.locator("#followupDueDate").fill("2026-12-01");
    await page.locator("#followupActionNote").fill("Synthetic evidence attached for backup");
    await page.locator("#followupEvidenceFile").setInputFiles({ ...imageInput, name: "synthetic-evidence.png" });
    await page.locator("#uploadFollowupEvidence").click();
    await page.getByRole("link", { name: "synthetic-evidence.png", exact: true }).waitFor();
    const firstEvidence = await download(page.getByRole("link", { name: "synthetic-evidence.png", exact: true }), "first-evidence.png");
    assert.deepEqual(fs.readFileSync(firstEvidence), image);

    await nav("layoutPlans");
    await page.locator("#planProjectName").fill("Synthetic backup project");
    await page.locator("#planDrawingTitle").fill("Synthetic backup plan");
    await page.locator("#planFileInput").setInputFiles(imageInput);
    await page.getByRole("button", { name: "Upload and open", exact: true }).click();
    await page.waitForFunction(() => BrowserTrial.getState().layoutPlans.length === 1 && Konva.stages.some(stage => stage.container().id === "planStage"));
    await saved();
    await page.locator("#planUploadMessage").evaluate(message => message.scrollIntoView({ block: "center" }));
    await page.screenshot({ path: path.join(output, "layout-upload-status.png") });
    assert.equal(await page.locator("#planUploadMessage").innerText(), "Layout plan uploaded and saved.");
    await page.locator("#placementPointType").selectOption("ground_settlement");
    await page.locator("#addPlanPoint").click();
    await page.locator("#planStage").scrollIntoViewIfNeeded();
    const position = await page.evaluate(() => {
      const stage = Konva.stages.find(item => item.container().id === "planStage");
      const rect = stage.container().getBoundingClientRect();
      return { x: rect.left + stage.x() + 160 * stage.scaleX(), y: rect.top + stage.y() + 100 * stage.scaleY() };
    });
    await page.mouse.click(position.x, position.y);
    await page.locator("#planPointId").fill("SYN-BACKUP-01");
    await page.locator("#planPointForm button[type=submit]").click();
    await page.waitForFunction(() => BrowserTrial.getState().layoutPoints.length === 1);
    await saved();
    const original = await state();
    assert.ok(Math.abs(original.layoutPoints[0].relativeX - 0.25) < 0.005);
    await nav("reports");
    await page.getByRole("button", { name: "Generate report preview" }).click();
    await archive.getByText("Snapshot saved in this session. No original PDF was generated.").waitFor();
    await page.waitForFunction(() => Boolean(monitoringReportSnapshot?.snapshotHash) && !document.getElementById("downloadMonitoringReport").disabled);
    const firstHash = await page.evaluate(() => monitoringReportSnapshot.snapshotHash);
    const originalPdf = await download(page.getByRole("button", { name: "Download snapshot PDF" }), "original.pdf");
    await archive.getByRole("button", { name: "Download original PDF" }).waitFor();

    await page.locator("#trialReportLanguage").selectOption("zh-HK");
    await page.getByRole("button", { name: "Generate report preview" }).click();
    await archive.getByText("Snapshot saved in this session. No original PDF was generated.").waitFor();
    await page.waitForFunction(() => monitoringReportSnapshot?.locale === "zh-HK");
    await backupPanel.getByRole("button", { name: "Preview backup capacity", exact: true }).click();
    const capacity = backupPanel.locator("[data-backup-capacity]");
    await capacity.getByText(/current package fits/i).waitFor();
    assert.match(await capacity.innerText(), /2 report snapshots.*1 original PDF/s);
    const predictedBytes = Number((await capacity.locator("[data-capacity-bytes]").innerText()).replace(/[^0-9]/g, ""));
    const complete = await download(backupPanel.getByRole("button", { name: "Export complete trial backup" }), "complete.json");
    assert.equal(predictedBytes, fs.statSync(complete).size);
    const pack = JSON.parse(fs.readFileSync(complete, "utf8"));
    assert.equal(pack.data.reports.length, 2);
    assert.equal(pack.data.reports.filter(([, row]) => row.pdf).length, 1);
    const originalRevision = await page.evaluate(() => BrowserTrial.revision());

    await page.locator("#createProjectButton").click();
    await page.locator("#newProjectName").fill("Synthetic project to recover");
    await page.locator("#copyProjectThresholds").check();
    await page.getByRole("button", { name: "Create and open project", exact: true }).click();
    await page.waitForFunction(() => BrowserTrial.getState().projectName === "Synthetic project to recover");
    await nav("reports");
    await archive.getByText("No report snapshots in this project.").waitFor();
    await capacity.getByText(/preview capacity again/i).waitFor();
    const preRestore = await state();

    await page.locator("#trialBackupFile").setInputFiles(complete);
    await preview.getByText(/Removed · Synthetic project to recover/).waitFor();
    assert.match(await preview.locator("[data-restore-size]").innerText(), /bytes in the selected file/);
    assert.deepEqual(await state(), preRestore);
    await preview.getByRole("button", { name: "Cancel replacement" }).click();
    assert.deepEqual(await state(), preRestore);

    const start = performance.now();
    await page.locator("#trialBackupFile").setInputFiles(complete);
    await preview.getByRole("button", { name: "Replace trial data" }).click();
    await page.waitForFunction(() => BrowserTrial.getState().layoutPlans.length === 1 && window.monitoringAppReady);
    const restoreMs = performance.now() - start;
    assert.deepEqual(await state(), original);
    assert.notEqual(await page.evaluate(() => BrowserTrial.revision()), originalRevision);
    await nav("reports");
    await archive.getByText(new RegExp(firstHash)).waitFor();
    assert.equal(await archive.getByRole("button", { name: "Download original PDF" }).count(), 1);
    assert.equal(await page.evaluate(async pdfUrl => (await trialRequest(pdfUrl)).status,
      pack.data.reports.find(([, row]) => row.pdf === null)[1].snapshot.pdfUrl), 409);
    const restoredPdf = await download(archive.getByRole("button", { name: "Download original PDF" }), "restored.pdf");
    assert.deepEqual(fs.readFileSync(restoredPdf), fs.readFileSync(originalPdf));
    const recovery = await download(backupPanel.getByRole("button", { name: "Download last recovery copy" }), "recovery.json");
    const recoveredFile = JSON.parse(fs.readFileSync(recovery, "utf8"));
    assert.equal(recoveredFile.data.projects.length, 2);
    assert.ok(recoveredFile.data.projects.some(([, project]) => project.projectName === preRestore.projectName));

    await nav("layoutPlans");
    await page.waitForFunction(() => Konva.stages.some(stage => stage.container().id === "planStage" && stage.find("Image").length && stage.find(".monitoring-point").length === 1));
    await nav("followups");
    await page.locator('[data-followup-id]').first().click();
    const restoredEvidence = await download(page.getByRole("link", { name: "synthetic-evidence.png", exact: true }), "restored-evidence.png");
    assert.deepEqual(fs.readFileSync(restoredEvidence), image);
    await nav("layoutPlans");
    const uploadMessage = page.locator("#planUploadMessage");
    assert.equal(await uploadMessage.innerText(), "Layout plan uploaded and saved.");
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#deletePlanButton").click();
    await page.locator("#planEmpty").waitFor({ state: "visible" });
    await page.screenshot({ path: path.join(output, "layout-after-delete.png") });
    assert.equal(await uploadMessage.innerText(), "");
    assert.equal((await state()).layoutPlans.length, 0);
    await page.locator("#trialRole").selectOption("client");
    await page.waitForFunction(() => currentUser.role === "client");
    const denied = await page.evaluate(async pdfUrl => {
      const checks = [];
      try { TrialBackup.exportComplete(); } catch (error) { checks.push(error.status); }
      try { await TrialBackup.preview(new File(["{}"], "blocked.json"), true); } catch (error) { checks.push(error.status); }
      checks.push((await trialRequest(pdfUrl)).status);
      return checks;
    }, pack.data.reports.find(([, row]) => row.pdf)[1].snapshot.pdfUrl);
    assert.deepEqual(denied, [403, 403, 403]);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, "result.json"), JSON.stringify({
      result: "PASS", browser: browser.version(), bytes: fs.statSync(complete).size, restoreMs,
      scopes: ["actual report PDFs byte-identical", "preview-only snapshot", "real Layout and attachment restored", "recovery copy", "role and project isolation"]
    }, null, 2));
    console.log("PASS " + output);
  } catch (error) {
    failure = error;
    fs.writeFileSync(path.join(output, "failure.txt"), error.stack);
    console.error(error);
  } finally {
    await finishSmoke(failure, [
      ["browser", async () => { if (browser) await browser.close(); }],
      ["server", async () => { if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }]
    ]);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
