"use strict";

(() => {
  const host = document.getElementById("trialGroundReview");
  const search = host.querySelector("input[type=search]");
  const pending = host.querySelector("[data-review-pending]");
  const selection = host.querySelector("[data-review-selection]");
  const scopeText = host.querySelector("[data-review-scope]");
  const details = host.querySelector("[data-review-details]");
  const message = host.querySelector("[role=status]");
  const form = host.querySelector("form");
  const reason = form.elements.reason;
  const outcome = form.elements.outcome;
  const submit = form.querySelector("[type=submit]");
  const discard = form.querySelector("[data-discard]");
  const labels = { accepted: "Accepted", returned: "Returned", remeasure: "Remeasure requested", unreviewed: "Unreviewed" };
  let source, target, currentKey = "", queue = [], generation = 0, busy = false;
  const hasDraft = () => Boolean(reason.value.trim() || outcome.value);
  window.trialGroundReviewHasDraft = () => busy || hasDraft();
  const selectionKey = row => String(row.revisionId);
  const text = (tag, value) => Object.assign(document.createElement(tag), { textContent: value });
  const option = (value, label) => Object.assign(text("option", label), { value });
  function controls() {
    selection.disabled = busy || !source;
    search.disabled = selection.disabled;
    pending.disabled = selection.disabled;
    for (const input of [reason, outcome, submit, discard]) input.disabled = busy || !target;
    if (!busy && hasDraft()) discard.disabled = false;
  }
  function populate() {
    const query = search.value.trim().toLowerCase();
    const matches = queue.filter(row => (!pending.checked || row.reviewStatus === "unreviewed")
      && (row.pointId + " " + row.date).toLowerCase().includes(query));
    const visible = matches.slice(0, 100);
    const current = queue.find(row => selectionKey(row) === currentKey);
    if (current && !visible.some(row => selectionKey(row) === currentKey)) visible.push(current);
    selection.replaceChildren(option("", "Choose an observation revision"), ...visible.map(row => option(selectionKey(row),
      row.pointId + " · " + row.date + " · " + labels[row.reviewStatus])));
    selection.value = currentKey;
    scopeText.textContent = matches.length > 100 ? "Showing the first 100 matches. Search by marker or date to find others." : matches.length + " reviewable observations match.";
  }
  async function request(path, options, revision) {
    return requestJson("/api/ground-observation-reviews" + path, { ...options, headers: { "If-Match": revision } }, { scope: "project" });
  }
  const active = () => window.monitoringAppReady && hasCapability("project:edit") && !host.closest(".view").hidden
    && !host.closest(".view").classList.contains("hidden");
  function stale(captured, revision) {
    return captured !== generation || !active() || revision !== stateRevision || revision !== BrowserTrial.revision();
  }
  async function refresh() {
    if (!active() || busy || hasDraft()) return;
    const revision = stateRevision;
    if (source === revision) return;
    const captured = ++generation;
    source = undefined;
    target = undefined;
    currentKey = "";
    details.replaceChildren();
    controls();
    message.textContent = "Loading Ground observation revisions…";
    try {
      const { result, etag } = await request("", {}, revision);
      if (stale(captured, etag)) return;
      source = etag;
      queue = result.observations.sort((a,b) => b.date.localeCompare(a.date) || a.pointId.localeCompare(b.pointId));
      populate();
      message.textContent = result.legacyCount + " legacy observations have no recorded review revision.";
    } catch (error) {
      if (captured === generation && active()) message.textContent = error.message;
    } finally { controls(); }
  }
  window.trialGroundReviewRefresh = refresh;
  host.querySelector("[data-review-reload]").addEventListener("click", () => {
    if (busy || hasDraft()) { message.textContent = "Save or discard the review draft before refreshing."; return; }
    source = undefined;
    void refresh();
  });
  search.addEventListener("input", populate);
  pending.addEventListener("change", populate);
  window.trialGroundReviewOnlyPending = () => { pending.checked = true; populate(); };
  selection.addEventListener("change", async () => {
    if (hasDraft() || busy) {
      selection.value = currentKey;
      message.textContent = "Save or discard the review draft before selecting another observation.";
      return;
    }
    currentKey = selection.value;
    target = undefined;
    details.replaceChildren();
    controls();
    const row = queue.find(item => selectionKey(item) === currentKey);
    const captured = ++generation, revision = source;
    if (!row) return;
    message.textContent = "Loading selected observation…";
    try {
      const query = new URLSearchParams({ pointId: row.pointId, date: row.date });
      const { result, etag } = await request("?" + query, {}, revision);
      if (stale(captured, etag)) return;
      if (result.history.revisions[0]?.id !== row.revisionId) throw new Error("The selected observation changed. Refresh the review queue.");
      target = row;
      const current = result.history.currentComparison;
      const currentSeverity = current.severity === "none" ? "Below configured thresholds" : current.severity ?? "Criteria not configured";
      const value = row.reading.toFixed(4) + " mPD";
      details.append(text("p", row.pointId + " · " + row.date + " · revision " + row.revisionId + " · " + value));
      details.append(text("p", "Current engineering comparison: " + current.settlementMm.toFixed(1) + " mm · " + currentSeverity));
      const history = text("ul", "");
      for (const entry of result.decisions) history.append(text("li", "Revision " + entry.revisionId + " · " + labels[entry.status] + " · " + entry.role + " simulation · " + entry.reviewedAt + " · " + entry.reason));
      if (history.children.length) details.append(text("h3", "Review decision history"), history);
      message.textContent = "Current review state: " + labels[row.reviewStatus];
    } catch (error) {
      if (captured === generation && active()) message.textContent = error.message;
    } finally { controls(); }
  });
  discard.addEventListener("click", () => {
    form.reset();
    message.textContent = "Review draft discarded.";
    controls();
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || !target || !outcome.value || !reason.value.trim()) return;
    if (hasUnsavedChanges || saveBlocked || qualityPreviewOpen || source !== stateRevision || source !== BrowserTrial.revision()) {
      message.textContent = "Project data changed or a save is pending. Your review draft has been kept.";
      return;
    }
    busy = true;
    controls();
    try {
      const { result, etag } = await request("", { method: "POST", body: JSON.stringify({
        pointId: target.pointId, date: target.date, revisionId: target.revisionId, status: outcome.value, reason: reason.value
      }) }, source);
      stateRevision = etag;
      invalidateDailyReview();
      form.reset();
      const priorKey = currentKey;
      busy = false;
      source = undefined;
      await refresh();
      if (queue.some(row => selectionKey(row) === priorKey) && source === etag) {
        selection.value = priorKey;
        selection.dispatchEvent(new Event("change"));
      }
      message.textContent = "Recorded review: " + labels[result.decision.status] + ".";
    } catch (error) {
      message.textContent = error.message;
    } finally { busy = false; controls(); }
  });
  controls();
  if (window.TrialShell?.ready) void refresh();
})();
