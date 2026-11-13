(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./monitoring-core"));
  else root.DataInterpretation = factory(root.MonitoringCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";
  function assessmentDate(state, now = new Date()) {
    if (core.isoDate(state.qualityAsOf)) return state.qualityAsOf;
    if (core.isoDate(state.dashboardQualityFreshness?.asOf)) return state.dashboardQualityFreshness.asOf;
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    return ["year", "month", "day"].map(type => parts.find(part => part.type === type).value).join("-");
  }
  function freshness(state, pointId, observationDate, assessmentDate) {
    if (!core.isoDate(assessmentDate)) throw new Error("Choose a valid assessment date (YYYY-MM-DD).");
    const schedule = (state.groundSchedules || []).find(item => item.pointId === pointId);
    const intervalDays = Number.isInteger(schedule?.intervalDays) && schedule.intervalDays > 0 ? schedule.intervalDays : null;
    const ageDays = core.isoDate(observationDate) ? (Date.parse(assessmentDate + "T00:00:00Z") - Date.parse(observationDate + "T00:00:00Z")) / 86400000 : null;
    const status = ageDays === null ? "missing" : ageDays < 0 ? "after_assessment" : intervalDays === null ? "not_configured" : ageDays > intervalDays ? "stale" : "fresh";
    return { status, assessmentDate, observationDate: observationDate || null, ageDays, intervalDays };
  }
  const labels = { missing: "No observation", after_assessment: "After assessment date", not_configured: "Not configured", stale: "Stale", fresh: "Fresh" };
  function qualityNotice(rules = {}) {
    const active = ["changeMm", "rateMmPerDay", "missingDays"].some(key => rules[key] != null)
      || (rules.consecutiveCount != null && rules.toleranceMm != null);
    return active ? "Configured plausibility checks only; disabled checks have not been performed. Basic number, date and point identity validation remains active."
      : "Plausibility rules not configured. No plausibility checks have been performed. Basic number, date and point identity validation remains active.";
  }
  return { assessmentDate, freshness, labels, qualityNotice };
});
