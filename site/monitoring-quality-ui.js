(function (root) {
  "use strict";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const labels = { consecutiveCount: "Consecutive observations (count)", toleranceMm: "Near-identical spread (mm)", changeMm: "Interval change limit (mm)", rateMmPerDay: "Interval rate limit (mm/day)", missingDays: "Observation gap limit (days)" };
  const titles = { interval_change: "Interval change", interval_rate: "Interval rate", observation_gap: "Observation gap", repeated_reading: "Repeated / near-identical readings", stale_observation: "Missing recent observation", no_observation: "No observation through cutoff" };
  function evidence(f) {
    return [f.previousDate && `Compared with ${f.previousDate}`, f.elapsedDays != null && `${f.elapsedDays} elapsed days`,
      f.changeMm != null && `${f.changeMm} mm interval change`, f.rateMmPerDay != null && `${f.rateMmPerDay} mm/day interval average`,
      f.count && `${f.count} readings since ${f.startDate}`, f.spreadMm != null && `${Number(f.spreadMm.toFixed(6))} mm spread`,
      f.limit != null && `Configured limit: ${f.limit}`].filter(v => v !== false && v !== undefined && v !== null).join("; ");
  }
  function table(headers, rows) { return `<div class="table-wrap" style="max-height:360px;overflow:auto"><table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${headers.length}">No entries.</td></tr>`}</tbody></table></div>`; }
  function observationRows(result, state) {
    const core = root.MonitoringCore, points = new Map((state?.points || []).map(p => [p.id, p]));
    const histories = new Map();
    for (const record of result.records || []) {
      if (!histories.has(record.pointId)) histories.set(record.pointId, []);
      histories.get(record.pointId).push(record);
    }
    for (const history of histories.values()) history.sort((a, b) => a.date.localeCompare(b.date));
    const level = value => core.finiteNumber(value) ? Number(value).toFixed(4) : "—";
    const mm = value => Number.isFinite(value) ? value.toFixed(1) : "—";
    return result.changes.map(c => {
      const point = points.get(c.after.pointId), history = histories.get(c.after.pointId) || [];
      let lo = 0, hi = history.length;
      while (lo < hi) { const mid = (lo + hi) >>> 1; if (history[mid].date < c.after.date) lo = mid + 1; else hi = mid; }
      const prior = history[lo - 1];
      return { change: c, baseline: level(point?.baseline), previousDate: prior?.date || "—", previous: level(prior?.reading),
        elapsedDays: prior ? (Date.parse(c.after.date + "T00:00:00Z") - Date.parse(prior.date + "T00:00:00Z")) / 86400000 : "—",
        changeMm: prior ? mm(core.settlement({ baseline: prior.reading }, c.after)) : "—",
        existing: level(c.before?.reading), proposed: level(c.after.reading), accumulatedMm: mm(core.settlement(point, c.after)) };
    });
  }
  function describeIssue(issue, context = {}) {
    const row = context.incoming?.[issue.row - 1], pointId = issue.pointId || row?.pointId;
    const scope = `Row ${issue.row}${pointId ? `: ${pointId}` : ""}${issue.date || row?.date ? ` (${issue.date || row.date})` : ""}`;
    const messages = {
      batch_conflict: "has conflicting readings or notes for the same point/date in this CSV. Correct the conflicting rows before saving.",
      facility_conflict: "has conflicting facility names in this CSV. Use one facility value for the point.",
      invalid_facility: "needs a text facility value.", invalid_note: "needs a text note.",
      batch_duplicate: "duplicates another row in this CSV and will be skipped.", already_exists: "already exists with the same value and note and will be skipped."
    };
    if (issue.code !== "invalid_observation") return `${scope}: ${messages[issue.code] || issue.code}`;
    const remedies = [], core = root.MonitoringCore;
    if (context.state && !context.state.points.some(p => p.id.toLowerCase() === String(pointId || "").trim().toLowerCase())) remedies.push("choose a registered point ID");
    if (row && !core.isoDate(row.date)) remedies.push("use a valid YYYY-MM-DD date");
    if (row && !core.finiteNumber(row.reading)) remedies.push("enter a finite measured level in mPD; blank is not zero");
    return `${scope}: ${remedies.length ? remedies.join("; ") : "check the registered point, YYYY-MM-DD date and finite measured level in mPD"}.`;
  }
  function groundBasis(preview) {
    const result = (row, baseline) => {
      const label = row.severity === "none" ? "Below configured thresholds" : row.severity ?? "Criteria not configured";
      return `${Number(baseline).toFixed(4)} mPD · ${row.settlementMm.toFixed(1)} mm · ${label}`;
    };
    const limits = criteria => criteria.limits
      ? `${criteria.approach} (${Object.entries(criteria.limits).map(([key,value]) => `${key} ${value} mm`).join(", ")})`
      : "Criteria not configured";
    return `<section data-ground-preview aria-label="Ground assessment basis"><h3>Ground assessment basis</h3>
      <p>These proposed results use the project revision at preview time. Operational thresholds drive the existing alarm workflow.</p>
      ${table(["Data row", "Point", "Date", "Recorded operational basis", "Approved dated evidence", "Current operational comparison"], preview.rows.map(row => {
        const op = row.operational, approved = row.approved;
        const operational = op ? `${result(op,op.baseline.baseline)} · Baseline v${op.baselineVersion} · Criteria v${op.criteriaVersion} · ${limits(op.criteria)}${op.basis === "current-rule-comparison" ? " · Historical judgment unknown" : ""}` : "Historical judgment unknown";
        const approvedText = approved ? `${result(approved,approved.baseline.baseline)} · Baseline v${approved.baselineVersion} · Approval v${approved.approvalVersion} · ${approved.approval.documentRef} · Effective ${approved.approval.effectiveDate} · ${limits(approved.approval)}` : "Historical approval unknown";
        const current = `${result(row.current,row.current.baseline)} · ${limits(row.current.criteria)}${row.current.criteria.reviewRequired ? " · Operational criteria pending review" : ""}`;
        return `<tr>${[row.row,row.pointId,row.date,operational + (row.retainsPriorAssessment ? " · Prior assessment retained for note-only edit" : ""),approvedText,current].map(value => `<td>${esc(value)}</td>`).join("")}</tr>`;
      }))}</section>`;
  }

  function preview(result, context = {}) {
    const dialog = document.createElement("dialog");
    dialog.style.cssText = "width:min(1100px,94vw);max-height:90vh;overflow:auto;border:1px solid #64748b;border-radius:8px;padding:20px;background:var(--card,#fff);color:var(--text,#172b4d)";
    const needsReason = result.changes.some(c => c.requiresReason) || (result.facilityChanges || []).length > 0 || result.findings.length > 0;
    dialog.innerHTML = `<h2>Monitoring observation preview</h2><p>${result.changes.length} observation additions/corrections · ${(result.facilityChanges || []).length} facility corrections · ${result.skipped.length} duplicate rows · ${result.errors.length} errors · ${result.findings.length} quality findings</p>
      <p>Review all proposed values before saving. Quality verification does not clear engineering exceedances.</p>
      ${table(["Data row", "Point", "Date", "Baseline mPD", "Previous earlier date", "Previous mPD", "Elapsed days", "Interval change mm", "Existing mPD", "Proposed mPD", "Accumulated mm", "Operation"], observationRows(result, context.state).map(r => `<tr>${[r.change.row,r.change.after.pointId,r.change.after.date,r.baseline,r.previousDate,r.previous,r.elapsedDays,r.changeMm,r.existing,r.proposed,r.accumulatedMm,r.change.kind].map(v => `<td>${esc(v)}</td>`).join("")}</tr>`))}
      ${context.groundPreview ? groundBasis(context.groundPreview) : ""}
      <p>Earlier observations include other proposed rows in this batch. Interval change is measured since the displayed earlier date; it is not necessarily a daily change. Levels are displayed to four decimals; calculations retain the original input precision.</p>
      ${table(["Data row", "Existing note", "Proposed note"], result.changes.map(c => `<tr>${[c.row,c.before?.note ?? "—",c.after.note ?? ""].map(v => `<td>${esc(v)}</td>`).join("")}</tr>`))}
      ${(result.facilityChanges || []).length ? table(["Point", "Source date", "Existing facility", "Proposed facility"], result.facilityChanges.map(c => `<tr>${[c.pointId,c.date,c.before,c.after].map(v => `<td>${esc(v)}</td>`).join("")}</tr>`)) : ""}
      <details ${result.errors.length ? "open" : ""}><summary>Errors and skipped rows</summary>${table(["Data row", "How to resolve"], [...result.errors,...result.skipped].map(e => `<tr><td>${esc(e.row)}</td><td>${esc(describeIssue(e, context))}</td></tr>`))}</details>
      <details ${result.findings.length ? "open" : ""}><summary>Quality findings, including reevaluated history</summary>${table(["Point", "Date", "Finding", "Evidence"], result.findings.map(f => `<tr>${[f.pointId,f.date,titles[f.code],evidence(f)].map(v => `<td>${esc(v)}</td>`).join("")}</tr>`))}</details>
      <form><label>Correction / verification reason ${needsReason ? "(required)" : "(optional)"}<textarea name="reason" rows="3" maxlength="2000" style="width:100%" ${needsReason ? "required" : ""}></textarea></label>
      <p role="status">${result.errors.length ? "Nothing can be saved until all invalid or conflicting rows are corrected. Data row numbers exclude the CSV header." : "The server will verify the observations again before saving."}</p>
      <button class="button primary" type="submit" ${!result.canSubmit || !(result.changes.length || (result.facilityChanges || []).length) ? "disabled" : ""}>Confirm and save observations</button>
      <button class="button" type="button" data-cancel>Cancel preview</button></form>`;
    document.body.appendChild(dialog);
    return new Promise(resolve => {
      let completed = false;
      const finish = value => { if (completed) return; completed = true; dialog.close(); dialog.remove(); resolve(value); };
      dialog.querySelector("[data-cancel]").onclick = () => finish(null);
      dialog.addEventListener("cancel", event => { event.preventDefault(); finish(null); });
      dialog.querySelector("form").onsubmit = event => {
        event.preventDefault(); const reason = dialog.querySelector("textarea").value.trim();
        if (!result.canSubmit || !(result.changes.length || (result.facilityChanges || []).length) || (needsReason && !reason)) return;
        finish({ confirmed: true, reason });
      };
      dialog.showModal();
    });
  }
  function mount(host, context) {
    host.innerHTML = `<h2>Data quality configuration and review</h2><p>Quality rules prompt verification. They do not change 3A/5A severity or exclude observations. Blank means disabled; configure values approved for the project.</p>
      <form id="qualityRulesForm" class="form-grid">${Object.entries(labels).map(([key,label]) => `<label>${label}<input name="${key}" type="number" min="${key === "consecutiveCount" ? 2 : 0}" ${key === "consecutiveCount" ? 'max="10000"' : ""} step="${key === "consecutiveCount" ? 1 : "any"}" placeholder="Disabled"></label>`).join("")}
      <label>Missing-data assessment through date<input name="asOf" type="date"><small>Cutoff applies only to missing-data freshness; blank disables freshness checks. All observations are still checked for changes, rates, repeated readings and gaps.</small></label>
      <button class="button primary" type="submit">Save quality rules</button></form><p id="qualityMessage" role="status"></p>
      <label>Search marker / finding / reviewer<input id="qualitySearch" type="search"></label>
      <h3>Quality findings</h3><div id="qualityFindingRows"></div>
      <form id="qualityReviewForm"><label>Review reason<textarea name="reason" required maxlength="2000"></textarea></label><button class="button" type="submit">Confirm displayed findings</button></form>
      <h3>Review and correction history</h3><div id="qualityAuditRows"></div>`;
    const rulesForm = host.querySelector("#qualityRulesForm"), search = host.querySelector("#qualitySearch"), reviewForm = host.querySelector("#qualityReviewForm");
    const message = text => { host.querySelector("#qualityMessage").textContent = text; };
    let visible = [], busy = false;
    const render = (refreshRules = true) => {
      const state = context.getState(), editable = context.canEdit() && !busy;
      if (refreshRules) {
        for (const key of Object.keys(labels)) rulesForm.elements.namedItem(key).value = state.qualityRules?.[key] ?? "";
        rulesForm.elements.namedItem("asOf").value = state.qualityAsOf || "";
      }
      for (const input of host.querySelectorAll("form input, form textarea, form button")) input.disabled = !editable;
      const query = search.value.trim().toLowerCase(), audit = state.qualityAudit || [];
      const reviewIndex = root.MonitoringQuality.reviewIndex(audit);
      let findings;
      try { findings = root.MonitoringQuality.analyze(state, [], { rules: state.qualityRules || {}, asOf: state.qualityAsOf || undefined }).findings; }
      catch (error) {
        visible = [];
        host.querySelector("#qualityFindingRows").textContent = error.message;
        host.querySelector("#qualityMessage").textContent = error.message;
        reviewForm.querySelector("button").disabled = true;
        return;
      }
      visible = findings.filter(f => `${f.pointId} ${titles[f.code]}`.toLowerCase().includes(query));
      host.querySelector("#qualityFindingRows").innerHTML = table(["Point", "Date", "Data quality", "Evidence", "Review status"], visible.map(f => {
        const review = reviewIndex.get(root.MonitoringQuality.findingId(f));
        return `<tr>${[f.pointId,f.date,titles[f.code],evidence(f),review ? `Confirmed by ${review.actor} at ${review.at}` : "Needs review"].map(v => `<td>${esc(v)}</td>`).join("")}</tr>`;
      }));
      host.querySelector("#qualityAuditRows").innerHTML = table(["Time", "Reviewer", "Action", "Reason", "Evidence"], [...audit].reverse().filter(a => JSON.stringify(a).toLowerCase().includes(query)).map(a => `<tr><td>${esc(a.at)}</td><td>${esc(a.actor)}</td><td>${esc(a.type || "observations")}</td><td>${esc(a.reason)}</td><td><details><summary>${(a.changes || []).length} changed observations; rule snapshot</summary><pre style="white-space:pre-wrap">${esc(JSON.stringify(a,null,2))}</pre></details></td></tr>`));
      reviewForm.querySelector("button").disabled = !editable || !visible.length;
    };
    const save = async (update, confirmation, review) => {
      if (busy || !context.canEdit()) return;
      busy = true;
      try {
        const reasonField = reviewForm.elements.namedItem("reason");
        const ok = await context.save(update, confirmation, review);
        if (ok && review && reasonField.value.trim() === confirmation.reason) reasonField.value = "";
        message(ok ? "Saved. Engineering severity remains threshold-derived." : "Not saved. Resolve the project save error before retrying."); }
      catch (error) { message(error.message); }
      finally { busy = false; render(); }
    };
    rulesForm.onsubmit = event => {
      event.preventDefault();
      try {
        const values = Object.fromEntries(Object.keys(labels).map(key => [key, rulesForm.elements.namedItem(key).value === "" ? null : Number(rulesForm.elements.namedItem(key).value)]));
        save({ qualityRules: root.MonitoringQuality.rules(values), qualityAsOf: rulesForm.elements.namedItem("asOf").value || null }, null);
      } catch (error) { message(error.message); }
    };
    reviewForm.onsubmit = event => { event.preventDefault(); const reason = reviewForm.elements.namedItem("reason").value.trim(); if (reason && visible.length) save({}, { confirmed: true, reason }, visible.map(root.MonitoringQuality.findingId)); };
    search.oninput = () => render(false);
    render();
    return { render };
  }
  root.MonitoringQualityUI = { preview, mount, observationRows, describeIssue };
})(typeof window === "undefined" ? globalThis : window);
