"use strict";

(() => {
  const host = document.getElementById("trialNotifications");
  const policy = document.getElementById("trialNotificationPolicy");
  const action = host.querySelector("form");
  const selection = action.elements.noticeId;
  const reason = action.elements.reason;
  const type = action.elements.activity;
  const hours = policy.elements.hours;
  const status = host.querySelector("[data-notification-status]");
  const policyStatus = policy.querySelector("[role=status]");
  const detail = host.querySelector("[data-notification-details]");
  const overdueOnly = host.querySelector("[data-notification-overdue]");
  const text = (tag, value) => Object.assign(document.createElement(tag), { textContent: value });
  const option = (value, label) => Object.assign(text("option", label), { value });
  let key, generation = 0, activeEvent = "", selected = "", rows = [], busy = false;
  let savedHours = "", policyLoaded = false;
  const draft = () => Boolean(reason.value.trim() || type.value);
  const policyDraft = () => policyLoaded && hours.value !== savedHours;
  window.trialNotificationHasDraft = () => busy || draft() || policyDraft();
  const visible = element => !element.closest(".view").classList.contains("hidden");
  const listUrl = "/api/trial-notifications";
  const policyUrl = "/api/trial-notification-policy";

  function request(path, options = {}, revision = stateRevision) {
    return requestJson(path, { ...options, headers: { "If-Match": revision } }, { scope: "project" });
  }

  function renderDetails() {
    const row = rows.find(item => item.id === selected);
    detail.replaceChildren();
    for (const input of [type, reason, action.querySelector("[type=submit]")]) input.disabled = busy || !row;
    type.querySelector('[value="receipt"]').disabled = row?.received === true;
    if (!row || !hasCapability("reminder:manage")) return;
    detail.append(text("h3", row.subject), text("p", row.message));
    const history = text("ul", "");
    for (const entry of row.activity) history.append(text("li", (entry.type === "phone" ? "Telephone follow-up recorded" : "Simulated receipt recorded")
      + " · " + hktDateTime(entry.at) + " · " + entry.role + " simulation · " + entry.reason));
    if (history.children.length) detail.append(text("h4", "Recorded activity"), history);
  }

  function render(result) {
    rows = result.notices;
    const legacy = host.querySelector("[data-legacy-notifications]");
    legacy.hidden = !result.legacy.length;
    legacy.querySelector("ul").replaceChildren(...result.legacy.map(row =>
      text("li", [row.pointId,row.date,row.createdAt].filter(Boolean).join(" · ") || "Imported local reference")));
    const scopedEvent = (state.followupEvents || []).find(event => event.id === activeEvent);
    host.querySelector("[data-notification-filter]").textContent = activeEvent
      ? "Event filter: " + (scopedEvent?.reference || activeEvent) : "";
    host.querySelector("[data-notification-clear]").hidden = !activeEvent && !overdueOnly.checked;
    const body = host.querySelector("tbody");
    body.replaceChildren();
    for (const row of rows) {
      const tr = text("tr", "");
      const deadline = row.dueAt ? hktDateTime(row.dueAt) : "Not configured";
      for (const value of [row.eventReference + " · " + row.pointId, row.recipientName || "Restricted",
        "Email simulation", hktDateTime(row.createdAt), "Not sent", row.received ? "Simulated receipt recorded" : "No simulated receipt",
        (row.overdue ? "Overdue in simulation · " : "") + deadline]) tr.append(text("td", value));
      body.append(tr);
    }
    if (!rows.length) {
      const tr = text("tr", ""), td = text("td", "No notification records match this view.");
      td.colSpan = 7; tr.append(td); body.append(tr);
    }
    selection.replaceChildren(option("", "Choose a notification"), ...rows.map(row => option(row.id,
      row.eventReference + " · " + row.pointId + " · " + (row.recipientName || "Restricted"))));
    if (!rows.some(row => row.id === selected)) selected = "";
    selection.value = selected;
    renderDetails();
    const configured = result.summary.configured ? "" : "No deadline configured for new notifications. ";
    status.textContent = configured + (result.summary.overdue == null ? "Overdue count unavailable." : result.summary.overdue + " overdue in simulation.");
  }

  async function refresh() {
    if (!window.monitoringAppReady || busy || stateRevision !== BrowserTrial.revision()) return;
    const admin = hasCapability("trial:configure");
    const listVisible = visible(host);
    const configVisible = admin && visible(policy);
    if ((!listVisible && !configVisible) || (listVisible && draft()) || (configVisible && policyDraft())) return;
    const revision = stateRevision, role = BrowserTrial.role();
    const nextKey = JSON.stringify([revision, role, Math.floor(Date.now() / 60000), listVisible, activeEvent, overdueOnly.checked]);
    if (nextKey === key) return;
    key = nextKey;
    const captured = ++generation;
    const isCurrent = etag => generation === captured && etag === stateRevision && etag === BrowserTrial.revision() && role === BrowserTrial.role();
    try {
      if (listVisible) {
        const query = new URLSearchParams();
        if (activeEvent) query.set("eventId", activeEvent);
        if (overdueOnly.checked) query.set("overdue", "1");
        const { result, etag } = await request(listUrl + "?" + query, {}, revision);
        if (isCurrent(etag) && visible(host) && !draft()) render(result);
      } else if (configVisible) {
        const { result, etag } = await request(policyUrl, {}, revision);
        if (isCurrent(etag) && visible(policy) && !policyDraft()) {
          hours.value = result.hours ?? "";
          savedHours = hours.value;
          policyLoaded = true;
          hours.disabled = policy.querySelector("[type=submit]").disabled = false;
        }
      }
    } catch (error) {
      if (generation === captured) (listVisible ? status : policyStatus).textContent = error.message;
      key = undefined;
    }
  }
  window.trialNotificationRefresh = refresh;

  function open(eventId = "", onlyOverdue = false) {
    if (busy || draft()) { status.textContent = "Save or discard the current notification note before changing filters."; activateView("trialNotifications"); return; }
    activeEvent = eventId;
    overdueOnly.checked = onlyOverdue;
    selected = "";
    activateView("trialNotifications");
    void refresh();
  }
  window.trialOpenNotifications = open;
  document.addEventListener("click", event => {
    const link = event.target.closest?.("[data-trial-notification-event]");
    if (link) open(link.dataset.trialNotificationEvent);
  });
  host.querySelector("[data-notification-clear]").addEventListener("click", () => open());
  overdueOnly.addEventListener("change", () => {
    if (busy || draft()) { overdueOnly.checked = !overdueOnly.checked; status.textContent = "Save or discard the current notification note before filtering."; return; }
    void refresh();
  });
  selection.addEventListener("change", () => {
    if (busy || draft()) { selection.value = selected; status.textContent = "Save or discard the current note before selecting another notification."; return; }
    selected = selection.value;
    renderDetails();
  });
  action.querySelector("[data-discard-notification]").addEventListener("click", () => {
    type.value = reason.value = "";
    renderDetails();
    status.textContent = "Draft discarded.";
  });

  async function save(route, payload, after, message) {
    if (busy || hasUnsavedChanges || saveBlocked || qualityPreviewOpen) { message.textContent = "Resolve pending changes before saving notification tracking."; return; }
    busy = true;
    const form = route === listUrl ? action : policy;
    const controls = [...form.querySelectorAll("button, input, select, textarea")];
    controls.forEach(element => { element.disabled = true; });
    try {
      const { etag } = await request(route, { method: "POST", body: JSON.stringify(payload) });
      stateRevision = etag;
      invalidateDailyReview();
      after();
      key = undefined;
    } catch (error) { message.textContent = error.message; }
    finally {
      busy = false;
      controls.forEach(element => { element.disabled = false; });
      renderDetails();
      void refresh();
    }
  }

  action.addEventListener("submit", event => {
    event.preventDefault();
    if (!selected || !type.value || !reason.value.trim() || !hasCapability("reminder:manage")) return;
    void save(listUrl, { id: selected, type: type.value, reason: reason.value }, () => { reason.value = type.value = ""; }, status);
  });
  policy.addEventListener("submit", event => {
    event.preventDefault();
    if (!hasCapability("trial:configure") || !policyLoaded) return;
    void save(policyUrl, { hours: hours.value === "" ? null : Number(hours.value) }, () => {
      savedHours = hours.value;
      policyStatus.textContent = savedHours ? "Deadline set for new simulated notifications." : "Deadline cleared for new notifications.";
    }, policyStatus);
  });
  policy.querySelector("[data-discard-notification-policy]").addEventListener("click", () => { hours.value = savedHours; policyStatus.textContent = "Draft discarded."; });
  function clearView() {
    generation++;
    key = undefined;
    activeEvent = selected = "";
    rows = [];
    host.querySelector("tbody").replaceChildren();
    host.querySelector("[data-legacy-notifications]").hidden = true;
    selection.replaceChildren(option("", "Choose a notification"));
    renderDetails();
  }
  window.addEventListener("trial-role-changed", clearView);
  window.addEventListener("trial-project-restored", () => { clearView(); void refresh(); });
  renderDetails();
  window.setInterval(refresh, 30000);
  void refresh();
})();
