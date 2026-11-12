(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./monitoring-core"));
  else root.DashboardData = factory(root.MonitoringCore);
})(typeof window === "undefined" ? globalThis : window, function (core) {
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
    const missingDays = state.qualityRules?.missingDays;
    const asOf = state.qualityAsOf;
    if (!core.finiteNumber(missingDays) || Number(missingDays) < 0 || !core.isoDate(asOf)) {
      const safe = state.dashboardQualityFreshness;
      if (safe?.configured === true && Number.isInteger(safe.missing) && safe.missing >= 0
          && Number.isInteger(safe.stale) && safe.stale >= 0) {
        return { configured: true, missing: safe.missing, stale: safe.stale, asOf: null, missingDays: null, points: [] };
      }
      return { configured: false, missing: 0, stale: 0, asOf: null, missingDays: null, points: [] };
    }
    const latest = latestRecords(state, asOf);
    const points = (state.points || []).map(point => {
      const record = latest.get(point.id);
      if (!record) return { pointId: point.id, freshness: "missing", observationDate: null, ageDays: null };
      const ageDays = dayDifference(asOf, record.date);
      return { pointId: point.id, freshness: ageDays > Number(missingDays) ? "stale" : "fresh", observationDate: record.date, ageDays };
    });
    return {
      configured: true,
      missing: points.filter(point => point.freshness === "missing").length,
      stale: points.filter(point => point.freshness === "stale").length,
      asOf,
      missingDays: Number(missingDays),
      points
    };
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
    const latest = latestRecords(state);
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
