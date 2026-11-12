"use strict";

(() => {
  const host = document.getElementById("trialGroundApprovals");
  if (!host) return;
  host.innerHTML = `
    <h3>Approved Ground criteria history</h3>
    <p>Register the limits from the project approval document. These versions support historical comparison by Hong Kong observation date. Existing operational trigger settings are managed above.</p>
    <form class="form-grid" id="trialGroundApprovalForm">
      <label>Rule group<select name="rule"><option value="ground">Ground</option><option value="utilities">Utilities</option><option value="refuseGround">Refuse ground</option></select></label>
      <label>Approach<select name="approach"><option>3A</option><option>5A</option></select></label>
      <label>Approval document reference<input name="documentRef" required maxlength="300"></label>
      <label>Documented approval date (Hong Kong)<input name="approvalDate" type="date" required></label>
      <label>Effective date (Hong Kong)<input name="effectiveDate" type="date" required></label>
      <div class="form-grid" data-approval-limits></div>
      <div class="toolbar"><button class="button primary" type="submit">Register approved criteria</button><button class="button" type="reset">Discard approval draft</button></div>
    </form>
    <p role="status" data-approval-message></p><ul data-approval-list aria-label="Registered Ground criteria"></ul>
  `;
  const form = host.querySelector("form");
  const message = host.querySelector("[data-approval-message]");
  const list = host.querySelector("[data-approval-list]");
  const labels = { alert:"Alert", alarm:"Alarm", action:"Action", action1:"Action 1", action2:"Action 2", action3:"Action 3" };
  const inputs = {};
  let saving = false;
  for (const [key, title] of Object.entries(labels)) {
    const label = document.createElement("label");
    label.textContent = title + " (mm)";
    const input = document.createElement("input");
    Object.assign(input, { name: key, type: "number", min: "0", step: "any", required: true });
    inputs[key] = input;
    label.append(input);
    form.querySelector("[data-approval-limits]").append(label);
  }

  function updateLimits() {
    const five = form.elements.approach.value === "5A";
    for (const [key, input] of Object.entries(inputs)) {
      const visible = key === "alert" || key === "alarm" || (five ? key !== "action" : key === "action");
      input.parentElement.classList.toggle("hidden", !visible);
      input.disabled = !visible || saving;
    }
  }
  function render() {
    list.replaceChildren();
    if (!window.monitoringAppReady || !hasCapability("trial:configure")) return;
    const entries = BrowserTrial.getState().groundCriteriaApprovals ?? [];
    for (const row of entries) {
      const item = document.createElement("li");
      const limits = Object.entries(row.limits).map(([key, value]) => labels[key] + " " + value + " mm").join(", ");
      item.textContent = `v${row.id} · ${row.rule} · ${row.approach} · effective ${row.effectiveDate} · approved ${row.approvalDate} · ${row.documentRef} · ${limits}`;
      list.append(item);
    }
    if (!entries.length) {
      const item = document.createElement("li");
      item.textContent = "No approved Ground criteria have been registered.";
      list.append(item);
    }
  }

  window.trialGroundApprovalHasDraft = () => saving || [...form.querySelectorAll("input")].some(input => input.value.trim());
  form.elements.approach.addEventListener("change", updateLimits);
  form.addEventListener("reset", () => queueMicrotask(updateLimits));
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (saving || !hasCapability("trial:configure")) return;
    if (hasUnsavedChanges || saveBlocked) {
      message.textContent = "Finish or recover the current save before registering approval evidence.";
      return;
    }
    const values = Object.fromEntries(new FormData(form));
    const limits = Object.fromEntries(Object.keys(inputs).filter(key => Object.hasOwn(values, key)).map(key => [key, values[key]]));
    const expected = stateRevision;
    const body = { rule: values.rule, approach: values.approach, limits, documentRef: values.documentRef,
      approvalDate: values.approvalDate, effectiveDate: values.effectiveDate };
    const controls = [...form.elements].filter(control => !control.disabled);
    saving = true;
    controls.forEach(control => { control.disabled = true; });
    message.textContent = "Registering approval evidence…";
    try {
      const { result, etag } = await requestJson("/api/ground-criteria-approvals", {
        method: "POST", headers: { "If-Match": expected }, body: JSON.stringify(body)
      }, { scope: "project", fallback: "The approval could not be registered." });
      if (stateRevision === expected) stateRevision = etag;
      form.reset();
      message.textContent = `Registered Ground criteria version ${result.approval.id}.`;
    } catch (error) {
      message.textContent = error.message;
    } finally {
      saving = false;
      controls.forEach(control => { control.disabled = false; });
      updateLimits();
    }
  });
  window.addEventListener("trial-data-changed", render);
  window.addEventListener("monitoring-app-ready", render);
  window.addEventListener("trial-project-restored", () => { message.textContent = ""; render(); });
  updateLimits();
  render();
})();
