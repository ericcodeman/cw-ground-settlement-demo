(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../monitoring-core"));
  else root.TrialAnalysisScope = factory(root.MonitoringCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  function normalize(input = {}) {
    const { from = "", through = "", facility = "", points = null } = input;
    if ((from && !core.isoDate(from)) || (through && !core.isoDate(through)) ||
        (from && through && from > through) || typeof from !== "string" || typeof through !== "string") {
      throw new Error("Use valid dates with From on or before Through.");
    }
    if (typeof facility !== "string" ||
        (points !== null && (!Array.isArray(points) || points.some(id => typeof id !== "string" || !id)))) {
      throw new Error("Choose a valid facility and monitoring points.");
    }
    const version = value => {
      if (value === "" || value == null) return null;
      if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
        throw new Error("Choose a valid captured criteria version.");
      }
      return Number(value);
    };
    return { from, through, facility, points: points === null ? null : [...new Set(points)],
      groundApproval: version(input.groundApproval), structureVersion: version(input.structureVersion),
      utilityVersion: version(input.utilityVersion) };
  }

  function pointMatches(point, scope, selected = scope.points === null ? null : new Set(scope.points)) {
    return Boolean(point && (!scope.facility || point.facility === scope.facility) && (!selected || selected.has(point.id)));
  }

  function dateMatches(date, scope) {
    return core.isoDate(date) && (!scope.from || date >= scope.from) && (!scope.through || date <= scope.through);
  }

  function approvedObservationKeys(state, version) {
    const history = state.groundHistory;
    const keys = new Set();
    for (const link of history?.active ?? []) {
      const head = history.revisions[link.revisionId - 1];
      const evidence = head?.assessmentSourceRevision ? history.revisions[head.assessmentSourceRevision - 1] : head;
      if (evidence?.approvedAssessment?.approvalVersion === version) keys.add(JSON.stringify([link.pointId, link.date]));
    }
    return keys;
  }

  function observations(state, scope) {
    const selected = scope.points === null ? null : new Set(scope.points);
    const points = state.points.filter(point => pointMatches(point, scope, selected));
    const ids = new Set(points.map(point => point.id));
    const approved = scope.groundApproval === null ? null : approvedObservationKeys(state, scope.groundApproval);
    const records = state.records.filter(row => ids.has(row.pointId) && dateMatches(row.date, scope) &&
      (!approved || approved.has(JSON.stringify([row.pointId, row.date]))));
    return { points, records };
  }

  function linkedMarkerMatches(ids, scope, byId) {
    if (!scope.facility && scope.points === null) return true;
    return ids.some(id => pointMatches(byId.get(id), scope));
  }
  function structureMatches(row, scope, byId) {
    return dateMatches(row.observation?.date, scope) && linkedMarkerMatches(row.structure?.markerIds ?? [], scope, byId) &&
      (scope.structureVersion === null || row.criteriaAssessment?.criterion?.version === scope.structureVersion);
  }
  function utilityVersion(row) {
    return row.settlementAssessment?.historical?.version ?? row.settlementAssessment?.version ?? null;
  }
  function utilityMatches(row, scope, byId) {
    return dateMatches(row.date, scope) && linkedMarkerMatches([row.aId, row.bId], scope, byId) &&
      (scope.utilityVersion === null || utilityVersion(row) === scope.utilityVersion);
  }

  function thresholdReferences(levels, limits, direction = "settlement") {
    const directions = direction === "both" ? [-1, 1] : direction === "heave" ? [1] : [-1];
    return levels.flatMap((level, index) => {
      const limit = limits?.[level.key];
      if (!core.finiteNumber(limit) || Number(limit) <= 0) return [];
      return directions.map(sign => ({ index, key: level.key, label: level.label, value: sign * Number(limit),
        text: level.label + (sign < 0 ? " −" : " +") + Number(limit) + " mm", direction: sign < 0 ? "settlement" : "heave" }));
    });
  }

  return { normalize, dateMatches, observations, structureMatches, utilityMatches, utilityVersion, thresholdReferences };
});
