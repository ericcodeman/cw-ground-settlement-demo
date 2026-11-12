"use strict";

(() => {
  const language = document.getElementById("trialReportLanguage");
  const include = document.getElementById("trialIncludeGroundHistory");
  const approval = document.getElementById("trialReportGroundApproval");
  const preview = document.getElementById("trialGroundReportPreview");
  const title = document.getElementById("trialReportSnapshotTitle");
  window.renderTrialReportSnapshotTitle = snapshot => {
    title.hidden = !snapshot;
    title.textContent = snapshot?.layout.title ?? "";
  };
  const display = window.GroundReportDisplay;
  const previewLimit = 100;
  let lastProject, lastRevision;
  const make = (tag, value) => Object.assign(document.createElement(tag), { textContent: value });
  const option = (value, label) => Object.assign(make("option", label), { value });
  window.trialGroundHistoryInput = () => ({
    language: language.value,
    groundHistory: { include: include.checked, approvalVersion: include.checked && approval.value ? Number(approval.value) : null }
  });
  window.renderTrialGroundReportOptions = () => {
    if (!window.monitoringAppReady) return;
    const revision = BrowserTrial.revision();
    if (lastRevision === revision && lastProject === activeProjectId) return;
    const selected = lastProject === activeProjectId ? approval.value : "";
    lastProject = activeProjectId;
    lastRevision = revision;
    const versions = BrowserTrial.getState().groundCriteriaApprovals ?? [];
    approval.replaceChildren(option("", "All approval versions"), ...versions.map(row => option(String(row.id),
      "v" + row.id + " · " + row.rule + " · " + row.effectiveDate + " · " + row.documentRef)));
    approval.value = versions.some(row => String(row.id) === selected) ? selected : "";
  };
  include.addEventListener("change", () => { approval.disabled = !include.checked; });
  window.renderTrialGroundReportHistory = (section, locale) => {
    preview.hidden = !section;
    preview.querySelector("tbody").replaceChildren();
    if (!section) return;
    const t = window.MonitoringReportLabels.translate(locale);
    preview.querySelector("h3").textContent = t("Ground assessment history");
    preview.querySelector("p").textContent = display.summary(section, t) + (section.rows.length > previewLimit
      ? " " + t("Preview shows the first {count} rows; the PDF includes the full selected evidence.").replace("{count}", previewLimit) : "");
    const head = make("tr", "");
    for (const label of display.labels) head.append(make("th", t(label)));
    preview.querySelector("thead").replaceChildren(head);
    const rows = section.rows.slice(0, previewLimit).map(item => {
      const row = make("tr", "");
      for (const cell of display.cells(item, t)) {
        const value = make("td", cell);
        value.style.whiteSpace = "pre-wrap";
        row.append(value);
      }
      return row;
    });
    if (!rows.length) {
      const row = make("tr", ""), cell = make("td", t("No Ground assessment evidence in the selected scope."));
      cell.colSpan = display.labels.length;
      row.append(cell);
      rows.push(row);
    }
    preview.querySelector("tbody").replaceChildren(...rows);
  };
  window.renderTrialGroundReportOptions();
})();
