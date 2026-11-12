"use strict";

(() => {
  const dialog = document.getElementById("trialGroundDetails");
  const fields = dialog.querySelector("dl");
  const title = dialog.querySelector("h2");
  const context = dialog.querySelector("p");
  const close = dialog.querySelector("button");
  let opener;
  let generation = 0;

  const display = (value, digits, unit) => MonitoringCore.finiteNumber(value)
    ? `${Number(value).toFixed(digits)} ${unit}` : "Unavailable";

  function add(label, value) {
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    fields.append(term, description);
    return description;
  }

  const severityLabel = key => ({none:"Below configured thresholds",alert:"Alert",alarm:"Alarm",action:"Action",
    action1:"Action 1",action2:"Action 2",action3:"Action 3"})[key] || "Unknown";

  async function showHistory(pointId, date, target, approvalTarget, reviewTarget, request) {
    const query = new URLSearchParams({ pointId, date });
    try {
      const response = await trialRequest("/api/ground-history?" + query);
      if (!response.ok) return;
      const history = await response.json();
      if (request !== generation || !dialog.open) return;
      reviewTarget.textContent = history.observationReview || "Review state unavailable";
      const revision = history.revisions[0];
      const snapshot = revision?.assessment;
      if (snapshot && history.historicalStatus === "captured") {
        target.textContent = "Captured trial assessment";
        add("Captured settlement", display(snapshot.settlementMm, 1, "mm"));
        add("Captured severity", severityLabel(snapshot.severity));
        add("Assessment source", "Reading revision " + (revision.assessmentSourceRevision ?? revision.id)
          + " · baseline v" + snapshot.baselineVersion + " · criteria v" + snapshot.criteriaVersion);
        add("Assessed at (UTC)", snapshot.assessedAt);
      }
      const approved = revision?.approvedAssessment;
      if (approved && history.approvedHistoricalStatus === "captured") {
        approvalTarget.textContent = "Captured under approved criteria";
        add("Approved settlement", display(approved.settlementMm, 1, "mm"));
        add("Approved severity", severityLabel(approved.severity));
        add("Approved source", approved.approval.documentRef + " · approval v" + approved.approvalVersion
          + " · effective " + approved.approval.effectiveDate + " (Hong Kong) · baseline v" + approved.baselineVersion);
      }
    } catch {
      if (request === generation && dialog.open) target.textContent = "History unavailable";
    }
  }

  function show(trigger) {
    if (dialog.open || !window.monitoringAppReady || !hasCapability("project:read")) return;
    const eventId = trigger.dataset.trialDetailsEvent;
    if (eventId && !hasCapability("followup:view")) return;
    const event = eventId ? state.followupEvents.find(item => item.id === eventId) : null;
    const snapshot = event?.trigger;
    const pointId = eventId ? event?.pointId : trigger.dataset.trialDetailsPoint;
    const date = eventId ? snapshot?.recordDate : trigger.dataset.trialDetailsDate;
    const point = state.points.find(item => item.id === pointId);
    const record = date ? state.records.find(item => item.pointId === pointId && item.date === date) : null;

    const request = ++generation;
    fields.replaceChildren();
    title.textContent = pointId ? `Ground details: ${pointId}` : "Ground details";
    context.textContent = eventId ? "Captured event source" : "Observation and current-rule comparison";
    if (eventId && snapshot) {
      add("Event", event.reference || event.id);
      add("Source marker and date", snapshot.sourceKey || `${pointId} | ${date || "Unavailable"}`);
      add("Observed level", display(snapshot.reading, 4, "mPD"));
      add("Captured settlement", display(snapshot.accumulatedSettlement, 1, "mm"));
      add("Captured severity", snapshot.severityLabel || "Unknown");
      add("Captured rule", snapshot.ruleVersion ? `${snapshot.monitoringApproach} · ${snapshot.ruleKey} · ${snapshot.ruleVersion}` : "Unknown");
      const link = snapshot.groundSource;
      add("Trigger evidence versions", link
        ? "Reading revision " + link.revisionId + " · baseline v" + link.baselineVersion + " · operational criteria v" + link.criteriaVersion
        : "Revision links unavailable for this captured event");
    } else if (!eventId && point) {
      add("Marker", pointId);
      add("Observation date", date || "No observation selected");
      add("Facility", point.facility || "Unavailable");
      add("Current baseline", display(point.baseline, 4, "mPD"));
      add("Observed level", display(record?.reading, 4, "mPD"));
      add("Current comparison", record ? display(settlementFor(point, record), 1, "mm") : "Unavailable");
      const currentStatus = record ? statusFor(point, record) : "Unavailable";
      add("Current severity", currentStatus === "Okay" ? "Below configured thresholds" : currentStatus);
      const history = add("Recorded operational assessment", "Unknown");
      const approvedHistory = add("Approved historical assessment", "Unknown");
      const review = add("Observation review", record ? "Review state unavailable" : "No observation selected");
      if (record) void showHistory(pointId, date, history, approvedHistory, review, request);
    } else {
      add("Source", "Unavailable");
    }
    opener = trigger;
    dialog.showModal();
    close.focus();
  }

  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    generation++;
    if (opener?.isConnected) opener.focus();
    opener = null;
  });
  function invalidateDetails() {
    generation++;
    opener = null;
    if (dialog.open) dialog.close();
  }
  window.addEventListener("trial-project-restored", invalidateDetails);
  window.addEventListener("trial-data-changed", invalidateDetails);
  const selector = "[data-trial-details-point], [data-trial-details-event]";
  document.addEventListener("click", event => {
    const trigger = event.target.closest?.(selector);
    if (trigger) show(trigger);
  }, true);
  document.addEventListener("keydown", event => {
    const trigger = event.target.closest?.("[data-trial-details-keyboard]");
    if (!trigger || !["Enter", " "].includes(event.key) || event.repeat) return;
    event.preventDefault();
    show(trigger);
  });
})();
