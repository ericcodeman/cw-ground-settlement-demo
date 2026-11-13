"use strict";

(() => {
  const section = document.querySelector("#trialBackup");
  const status = section.querySelector("[data-backup-status]");
  const preview = document.querySelector("#trialBackupPreview");
  const previewStatus = preview.querySelector("[data-restore-status]");
  const recovery = section.querySelector("[data-download-recovery]");
  const list = section.querySelector("[data-report-archive]");
  const toolbarStatus = document.querySelector("#trialDataStatus");
  const capacity = section.querySelector("[data-backup-capacity]");
  const capacityStatus = capacity.querySelector("[data-capacity-status]");
  let pending, previewRequest = 0;
  const text = (tag, value) => Object.assign(document.createElement(tag), { textContent: value });
  const reportError = error => { status.textContent = error.message; };
  function readyToReplace() {
    if (qualityPreviewOpen || projectChangeBlocked()) {
      throw new Error("JSON import cancelled: finish or recover the current input, preview or pending save first. Your projects and drafts are unchanged.");
    }
  }
  function refresh() {
    recovery.hidden = !TrialBackup.hasRecovery();
    list.replaceChildren();
    if (currentUser?.role !== BrowserTrial.role() || !hasCapability("report:export")) return;
    for (const report of TrialBackup.archive()) {
      const entry = document.createElement("li");
      entry.append(text("strong", report.title), text("p", report.language + " · " + report.generatedAt +
        " · " + report.sourceRevision + " · " + report.hash));
      if (report.hasPdf) {
        const button = text("button", "Download original PDF");
        button.type = "button";
        button.className = "button";
        button.addEventListener("click", () => {
          try { TrialBackup.downloadOriginal(report.id); } catch (error) { reportError(error); }
        });
        entry.append(button);
      } else entry.append(text("p", "Snapshot saved in this session. No original PDF was generated."));
      list.append(entry);
    }
    if (!list.childElementCount) list.append(text("li", "No report snapshots in this project."));
  }
  const countLabels = {
    projects: ["project", "projects"], points: ["monitoring point", "monitoring points"],
    observations: ["observation", "observations"], revisions: ["Ground revision", "Ground revisions"],
    layouts: ["layout", "layouts"], attachments: ["attachment", "attachments"],
    reports: ["report snapshot", "report snapshots"], pdfs: ["original PDF", "original PDFs"]
  };
  function counts(summary) {
    return Object.entries(summary).map(([key, count]) => count + " " + countLabels[key][count === 1 ? 0 : 1]).join(" · ");
  }
  window.previewTrialReplacement = async (input, complete) => {
    const file = input.files[0];
    input.value = "";
    if (!file || projectChangeBlocked()) return;
    const request = ++previewRequest;
    status.textContent = "Reading and validating the selected file.";
    try {
      const result = await TrialBackup.preview(file, complete, readyToReplace);
      if (request !== previewRequest) return;
      pending = result.token;
      status.textContent = "";
      previewStatus.textContent = "";
      preview.querySelector("[data-restore-notice]").textContent = result.complete
        ? "Restoring this backup replaces all projects and report archives in this session."
        : "Project JSON replaces all projects and clears the current report archive. The previous projects and reports are included in the temporary recovery copy.";
      preview.querySelector("[data-restore-before]").textContent = result.activeBefore + " · " + counts(result.before);
      preview.querySelector("[data-restore-after]").textContent = result.activeAfter + " · " + counts(result.after);
      preview.querySelector("[data-restore-size]").textContent = result.fileBytes.toLocaleString() + " bytes in the selected file · limit " + result.maximumBytes.toLocaleString() + " bytes";
      preview.querySelector("[data-restore-projects]").replaceChildren(...result.projects.map(row =>
        text("li", row.status + " · " + row.name + " (" + row.id + ")")));
      if (!preview.open) preview.showModal();
    } catch (error) {
      if (request === previewRequest) { reportError(error); toolbarStatus.textContent = error.message; }
      if (!complete) alert(error.message);
    }
  };
  function cancelPreview() { pending = undefined; previewRequest++; TrialBackup.cancel(); }
  preview.addEventListener("cancel", cancelPreview);
  preview.querySelector("[data-confirm-restore]").addEventListener("click", async () => {
    let bytes;
    try { bytes = TrialBackup.apply(pending, readyToReplace); }
    catch (error) { previewStatus.textContent = error.message; return; }
    pending = undefined;
    preview.close();
    status.textContent = "Projects replaced. Recovery copy held in this session (" + bytes.toLocaleString() + " bytes). Download it before refreshing.";
    toolbarStatus.textContent = status.textContent;
    window.dispatchEvent(new Event("trial-backup-replaced"));
    try { await restartTrialView(); } catch (error) { reportError(error); }
    refresh();
  });
  preview.querySelector("[data-cancel-restore]").addEventListener("click", () => { cancelPreview(); preview.close(); });
  section.querySelector("[data-preview-backup-capacity]").addEventListener("click", () => {
    try {
      if (projectChangeBlocked()) return;
      const result = TrialBackup.capacity();
      capacity.hidden = false;
      capacity.querySelector("[data-capacity-bytes]").textContent = result.bytes.toLocaleString() + " bytes";
      capacity.querySelector("[data-capacity-counts]").textContent = counts(result.summary);
      capacityStatus.textContent = "Limit " + result.maximumBytes.toLocaleString() + " bytes. " +
        (result.fits ? "The current package fits." : "The current package exceeds the limit. Export will be refused without omitting data.");
    } catch (error) { capacity.hidden = true; reportError(error); }
  });
  ["trial-data-changed", "trial-report-archived", "trial-project-restored", "trial-role-changed", "trial-backup-replaced"].forEach(event =>
    window.addEventListener(event, () => {
      if (!capacity.hidden) capacityStatus.textContent = "This size was measured before the session changed. Preview capacity again.";
    }));
  section.querySelector("[data-download-complete]").addEventListener("click", () => {
    try {
      if (projectChangeBlocked()) return;
      const bytes = TrialBackup.exportComplete();
      window.dispatchEvent(new Event("trial-complete-backup-exported"));
      status.textContent = "Complete backup download requested (" + bytes.toLocaleString() + " bytes).";
    } catch (error) { reportError(error); }
  });
  recovery.addEventListener("click", () => {
    try { status.textContent = "Recovery download requested (" + TrialBackup.exportRecovery().toLocaleString() + " bytes)."; }
    catch (error) { reportError(error); }
  });
  ["monitoring-app-ready", "trial-report-archived", "trial-project-restored", "trial-role-changed"].forEach(event =>
    window.addEventListener(event, refresh));
  refresh();
})();
