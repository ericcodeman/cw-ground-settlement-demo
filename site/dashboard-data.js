(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./monitoring-core"), require("./data-interpretation"));
  else root.DashboardData = factory(root.MonitoringCore, root.DataInterpretation);
})(typeof window === "undefined" ? globalThis : window, function (core, interpretation) {
  "use strict";

  const DAY_MS = 24 * 60 * 60 * 1000;

  function dayDifference(later, earlier) {
    return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / DAY_MS);
  }

  function hongKongDate(value = new Date()) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(date);
    const part = type => parts.find(item => item.type === type).value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  }

  function followupOverdue(event, now = new Date()) {
    return Boolean(event && event.status !== "closed" && core.isoDate(event.dueDate)
      && event.dueDate < hongKongDate(now));
  }

  function validRecords(state, throughDate = "") {
    const pointIds = new Set((state.points || []).map(point => point.id));
    return (state.records || []).filter(record => pointIds.has(record.pointId)
      && core.isoDate(record.date)
      && core.finiteNumber(record.reading)
      && (!throughDate || record.date <= throughDate));
  }

  function latestRecords(state, throughDate = "") {
    const latest = new Map();
    for (const record of validRecords(state, throughDate)) {
      const existing = latest.get(record.pointId);
      if (!existing || record.date > existing.date) latest.set(record.pointId, record);
    }
    return latest;
  }

  function workflowByPoint(state) {
    if (state.dashboardWorkflowRestricted === true || !Array.isArray(state.followupEvents)) return null;
    const result = new Map();
    for (const event of state.followupEvents.filter(item => item && item.status !== "closed")) {
      const existing = result.get(event.pointId);
      const timestamp = String(event.updatedAt || event.createdAt || "");
      const existingTimestamp = String(existing?.updatedAt || existing?.createdAt || "");
      if (!existing || timestamp > existingTimestamp) result.set(event.pointId, event);
    }
    return result;
  }

  function qualityFreshness(state) {
    const asOf = interpretation.assessmentDate(state);
    const latest = latestRecords(state, asOf);
    const points = (state.points || []).map(point => {
      const item = interpretation.freshness(state, point.id, latest.get(point.id)?.date, asOf);
      return { pointId: point.id, ...item, freshness: item.status };
    });
    return { configured: points.some(point => point.intervalDays !== null),
      missing: points.filter(point => point.status === "missing").length,
      stale: points.filter(point => point.status === "stale").length,
      notConfigured: points.filter(point => point.status === "not_configured").length,
      asOf, missingDays: null, points };
  }

  function recordMatchesScope(record, scope, latest) {
    const type = scope?.type || "all";
    if (type === "all") return true;
    if (type === "point") return record.point?.id === scope.value;
    if (type === "date") return record.date === scope.value;
    if (type === "historical-exceedances") return record.status !== "Okay";
    if (type === "current-exceedances") {
      const current = latest?.get(record.point?.id);
      return record.status !== "Okay" && current?.date === record.date;
    }
    return true;
  }

  function summarize(state, options = {}) {
    const statusFor = options.statusFor;
    const settlementFor = options.settlementFor || core.settlement;
    if (typeof statusFor !== "function") throw new Error("Dashboard summary needs the active threshold status function.");
    const pointsById = new Map((state.points || []).map(point => [point.id, point]));
    const asOf = interpretation.assessmentDate(state);
    const latest = latestRecords(state, asOf);
    const workflow = workflowByPoint(state);
    const current = [];
    for (const [pointId, record] of latest) {
      const point = pointsById.get(pointId);
      const status = statusFor(point, record);
      if (status === "Okay") continue;
      const followup = workflow?.get(pointId);
      current.push({
        point,
        record,
        status,
        settlement: settlementFor(point, record),
        freshness: interpretation.freshness(state, pointId, record.date, asOf),
        workflowAvailable: workflow !== null,
        workflowStatus: workflow === null ? null : followup?.status || "none",
        followup: followup || null
      });
    }
    const historicalExceedances = validRecords(state).filter(record => {
      const point = pointsById.get(record.pointId);
      return point && statusFor(point, record) !== "Okay";
    }).length;
    const latestObservationDate = [...latest.values()].reduce((date, record) => record.date > date ? record.date : date, "");
    return {
      monitoringPoints: (state.points || []).length,
      currentExceedancePoints: current.length,
      openFollowups: state.dashboardWorkflowRestricted !== true && Array.isArray(state.followupEvents)
        ? state.followupEvents.filter(event => event?.status !== "closed").length
        : null,
      historicalExceedanceRecords: historicalExceedances,
      latestObservationDate: latestObservationDate || null,
      quality: qualityFreshness(state),
      alarmQueue: current
    };
  }

  return { dayDifference, hongKongDate, followupOverdue, validRecords, latestRecords, qualityFreshness, recordMatchesScope, summarize };
});
