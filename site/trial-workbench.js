"use strict";

(() => {
  const host = document.getElementById("trialToday");
  const form = document.getElementById("trialGroundSchedule");
  const taskScope = document.getElementById("trialDueTaskScope");
  const taskSelect = taskScope.querySelector("select");
  const point = form.elements.pointId;
  const first = form.elements.firstDueDate;
  const interval = form.elements.intervalDays;
  const message = form.querySelector("[role=status]");
  const scopeMessage = taskScope.querySelector("[role=status]");
  const buttons = Object.fromEntries([...host.querySelectorAll("[data-today-action]")].map(button => [button.dataset.todayAction, button]));
  const statuses = { completed: "Measured", missing: "Missing today", not_due: "Not due today", unconfigured: "Not configured" };
  const text = (tag, value) => Object.assign(document.createElement(tag), { textContent: value });
  const option = (value, label) => Object.assign(text("option", label), { value });
  let view, scope, key, configuredPoint = "", formBasis = "", saving = false;
  const signature = () => JSON.stringify([first.value, interval.value]);
  const dirty = () => formBasis !== "" && signature() !== formBasis;
  window.trialGroundScheduleHasDraft = () => saving || dirty();

  function resetSchedule() {
    configuredPoint = point.value;
    const schedule = view?.tasks.find(row => row.pointId === configuredPoint)?.schedule;
    first.value = schedule?.firstDueDate || "";
    interval.value = schedule?.intervalDays ?? "";
    formBasis = signature();
    first.disabled = interval.disabled = saving || !configuredPoint;
    for (const button of form.querySelectorAll("button")) button.disabled = saving || !configuredPoint;
    form.querySelector("[data-remove-schedule]").disabled ||= !schedule;
  }
  function applyReading(pointId) {
    if (!canEdit() || !scope || scope.project !== activeProjectId || scope.date !== BrowserTrial.hongKongDay()) return;
    if (hasUnsavedChanges || saveBlocked || qualityPreviewOpen || els.readingValue.value.trim() || els.readingNote.value.trim() || recordInputDraft) {
      taskSelect.value = scope.point;
      scopeMessage.textContent = "Finish or recover the current reading before choosing another scheduled point.";
      return;
    }
    if (!scope.points.includes(pointId) || !Array.from(els.pointSelect.options).some(item => item.value === pointId)) return;
    scope.point = pointId;
    els.pointSelect.value = pointId;
    els.pointSelect.dispatchEvent(new Event("change", { bubbles: true }));
    els.readingDate.value = scope.date;
    scopeMessage.textContent = "Enter the observation for " + pointId + " on " + scope.date + ".";
    els.readingValue.focus();
  }
  function clearScope() {
    scope = undefined;
    taskScope.hidden = true;
    taskSelect.replaceChildren();
    scopeMessage.textContent = "";
  }

  function refresh() {
    if (!window.monitoringAppReady) return;
    const date = BrowserTrial.hongKongDay();
    const nextKey = JSON.stringify([BrowserTrial.revision(), date, currentUser.role, Math.floor(Date.now() / 60000)]);
    if (nextKey === key) return;
    key = nextKey;
    view = BrowserTrial.groundWorkbench();
    if (scope && (scope.project !== activeProjectId || scope.date !== date || !canEdit())) clearScope();
    else if (scope) {
      scope.points = [...view.missing];
      if (!scope.points.length) clearScope();
      else {
        taskSelect.replaceChildren(option("", "Choose another due point"), ...scope.points.map(id => option(id, id)));
        taskSelect.value = scope.points.includes(scope.point) ? scope.point : "";
      }
    }
    host.querySelector("[data-today-date]").textContent = date + " (Hong Kong)";
    const set = (name, value, actionable) => {
      buttons[name].querySelector("strong").textContent = value;
      buttons[name].disabled = !actionable;
    };
    set("missing", view.expected == null ? "Not configured" : view.completed + " of " + view.expected + " measured · " + view.missing.length + " missing", canEdit() && view.missing.length);
    set("review", canEdit() ? String(BrowserTrial.groundReviewPending() ?? 0) : "Restricted", canEdit());
    const canViewEvents = hasCapability("followup:view");
    const active = canViewEvents ? TrialShellModel.summary(BrowserTrial.getState()).groundPending : null;
    set("followups", active == null ? "Restricted" : String(active), canViewEvents);
    const notificationCount = BrowserTrial.notificationSummary().overdue;
    set("notifications", notificationCount == null ? "Not configured" : notificationCount + " overdue in simulation", true);
    host.querySelector("[data-today-note]").textContent = view.unconfigured
      ? view.unconfigured + " points have no configured schedule and are excluded from today's expected count."
      : view.tasks.length ? "All registered points have schedules." : "No monitoring points are registered.";
    const rows = view.tasks.map(row => {
      const tr = document.createElement("tr");
      for (const value of [row.pointId, row.lastDate || "No observation", row.schedule
        ? "Every " + row.schedule.intervalDays + " day(s) from " + row.schedule.firstDueDate : "Not configured", statuses[row.status]]) {
        tr.append(text("td", value));
      }
      return tr;
    });
    host.querySelector("tbody").replaceChildren(...rows);
    if (hasCapability("trial:configure") && !saving && !dirty()) {
      const selected = point.value;
      point.replaceChildren(option("", "Choose a monitoring point"), ...view.tasks.map(row => option(row.pointId, row.pointId)));
      point.value = view.tasks.some(row => row.pointId === selected) ? selected : "";
      resetSchedule();
    }
  }

  buttons.missing.addEventListener("click", () => {
    if (qualityPreviewOpen || projectChangeBlocked()) return;
    refresh();
    if (!view.missing.length) return;
    scope = { project: activeProjectId, date: view.date, points: [...view.missing] };
    taskSelect.replaceChildren(...scope.points.map(id => option(id, id)));
    taskScope.hidden = false;
    activateView("records");
    applyReading(taskSelect.value);
  });
  buttons.review.addEventListener("click", () => {
    activateView("trialDataReview");
    window.trialGroundReviewOnlyPending?.();
  });
  const openFollowups = document.getElementById("trialOpenFollowups");
  openFollowups.addEventListener("change", renderFollowups);
  buttons.followups.addEventListener("click", () => {
    activateView("followups");
    openFollowups.checked = true;
    renderFollowups();
  });
  buttons.notifications.addEventListener("click", () => window.trialOpenNotifications("", true));
  taskSelect.addEventListener("change", () => applyReading(taskSelect.value));
  taskScope.querySelector("button").addEventListener("click", clearScope);
  point.addEventListener("change", () => {
    if (dirty() || saving) { point.value = configuredPoint; message.textContent = "Save or discard schedule changes before selecting another point."; return; }
    resetSchedule();
  });
  form.querySelector("[data-discard-schedule]").addEventListener("click", () => { resetSchedule(); message.textContent = "Schedule changes discarded."; });
  async function save(action) {
    if (!hasCapability("trial:configure") || !configuredPoint || saving) return;
    if (hasUnsavedChanges || saveBlocked || qualityPreviewOpen) { message.textContent = "Resolve the current observation or save before updating the schedule."; return; }
    saving = true;
    const revision = stateRevision;
    const input = { pointId: configuredPoint, action, firstDueDate: first.value, intervalDays: Number(interval.value) };
    const controls = [...form.querySelectorAll("button, input, select")];
    controls.forEach(control => { control.disabled = true; });
    try {
      const { etag } = await requestJson("/api/ground-schedules", {
        method: "POST", headers: { "If-Match": revision }, body: JSON.stringify(input)
      }, { scope: "project" });
      stateRevision = etag;
      invalidateDailyReview();
      key = undefined;
      refresh();
      resetSchedule();
      renderStats(); renderPoints(); renderAlarmList();
      if (!document.getElementById("dashboard").classList.contains("hidden")) renderDashboardWebMap();
      message.textContent = action === "clear" ? "Schedule removed. This point is now unconfigured." : "Schedule saved in this trial session.";
    } catch (error) {
      message.textContent = error.message;
    } finally {
      saving = false;
      controls.forEach(control => { control.disabled = false; });
      for (const button of form.querySelectorAll("button")) button.disabled = !configuredPoint;
      form.querySelector("[data-remove-schedule]").disabled ||= !view?.tasks.some(row => row.pointId === configuredPoint && row.schedule);
    }
  }
  form.addEventListener("submit", event => { event.preventDefault(); void save("set"); });
  form.querySelector("[data-remove-schedule]").addEventListener("click", () => { if (window.confirm("Remove this monitoring schedule?")) void save("clear"); });
  window.trialWorkbenchRefresh = refresh;
  window.setInterval(refresh, 30000);
  refresh();
})();
