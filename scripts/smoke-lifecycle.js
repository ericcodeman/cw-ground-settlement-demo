"use strict";

// Test infrastructure only: evidence failures must not prevent teardown or replace an assertion.
async function finishSmoke(primaryError, stages, report = value => console.error(JSON.stringify(value))) {
  let failure = primaryError;
  for (const [stage, action] of stages) {
    try { await action(); }
    catch (error) {
      if (!failure) failure = error;
      try { report({ type: "smoke-cleanup-error", stage,
        errorName: ["Error", "AssertionError", "TimeoutError", "TypeError"].includes(error?.name) ? error.name : "Error",
        code: ["EACCES", "ENOSPC", "ENOENT", "EIO"].includes(error?.code) ? error.code : undefined }); } catch {}
    }
  }
  if (failure) throw failure;
}

function failureSummary(suite, diagnostics) {
  const id = value => value === "legacy" || /^[a-f0-9-]{36}$/i.test(value || "") ? value : undefined;
  const revision = value => /^"[a-f0-9]{64}"$/i.test(value || "") ? value : undefined;
  const status = value => ["open", "in_progress", "acknowledged", "closed"].includes(value) ? value : undefined;
  const lastFailure = diagnostics.findLast(row => row.type === "failure");
  const ui = lastFailure?.ui;
  return {
    type: "smoke-failure-summary", suite,
    consoleErrors: diagnostics.filter(row => row.type === "console").length,
    pageErrors: diagnostics.filter(row => row.type === "pageerror").length,
    responses: diagnostics.filter(row => ["response", "create-body"].includes(row.type)).slice(-30).map(row => ({
      type: row.type, method: ["GET", "POST", "PATCH"].includes(row.method) ? row.method : undefined,
      status: Number.isInteger(row.status) ? row.status : undefined,
      project: id(row.project), ifMatch: revision(row.ifMatch), etag: revision(row.etag),
      events: row.events?.slice(0, 20).map(event => ({ id: id(event.id), reviewId: id(event.reviewId), status: status(event.status) }))
    })),
    ui: ui ? {
      project: id(ui.project), revision: revision(ui.revision), selected: id(ui.selected),
      generation: Number.isFinite(ui.generation) ? ui.generation : undefined,
      busy: typeof ui.busy === "boolean" ? ui.busy : undefined,
      hidden: typeof ui.hidden === "boolean" ? ui.hidden : undefined,
      unsaved: typeof ui.unsaved === "boolean" ? ui.unsaved : undefined,
      blocked: typeof ui.blocked === "boolean" ? ui.blocked : undefined,
      form: ui.form ? { eventId: id(ui.form.eventId), status: status(ui.form.status),
        action: ["evidence", "acknowledged", "closed"].includes(ui.form.action) ? ui.form.action : undefined } : undefined
    } : undefined
  };
}

function emitFailureSummary(suite, diagnostics, write = value => console.error(value)) {
  try { write(JSON.stringify(failureSummary(suite, diagnostics))); } catch {}
}

module.exports = { finishSmoke, failureSummary, emitFailureSummary };
