(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./monitoring-core"));
  else root.MonitoringQuality = factory(root.MonitoringCore);
})(typeof window === "undefined" ? globalThis : window, function (core) {
  "use strict";
  const defaults = Object.freeze({ consecutiveCount: null, toleranceMm: null, changeMm: null, rateMmPerDay: null, missingDays: null });
  const MASK64 = (1n << 64n) - 1n;
  const HASH_BASE = 1099511628211n;
  const MAX_WINDOW = 10000;
  const MAX_FINDINGS = 10000;
  const key = row => JSON.stringify([row.pointId, row.date]);
  const days = (a, b) => (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000;
  function observationToken(row) {
    let hash = 14695981039346656037n;
    for (const char of `${row.date}|${Number(row.reading)}`) hash = ((hash ^ BigInt(char.codePointAt(0))) * HASH_BASE) & MASK64;
    return hash;
  }
  function observationFingerprint(rows) {
    let hash = 0n;
    for (const row of rows) hash = (hash * HASH_BASE + observationToken(row)) & MASK64;
    return hash.toString(16).padStart(16, "0");
  }
  function repeatedIdentity(finding) {
    if (finding.code !== "repeated_reading") return finding;
    const old = Array.isArray(finding.observations) ? finding.observations : null;
    const values = old?.map(row => Number(row.reading));
    return {
      pointId: finding.pointId, date: finding.date, reading: finding.reading, ruleVersion: finding.ruleVersion,
      code: finding.code, startDate: finding.startDate, count: finding.count, spreadMm: finding.spreadMm, limit: finding.limit,
      evidenceVersion: "rolling-v1", minimumReading: old ? Math.min(...values) : finding.minimumReading,
      maximumReading: old ? Math.max(...values) : finding.maximumReading,
      evidenceFingerprint: old ? observationFingerprint(old) : finding.evidenceFingerprint
    };
  }
  function rules(input = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Quality rules must be an object.");
    if (Object.keys(input).some(name => !Object.hasOwn(defaults, name))) throw new Error("Unknown quality rule.");
    const result = { ...defaults, ...input };
    for (const [name, value] of Object.entries(result)) {
      if (value === null) continue;
      if (!core.finiteNumber(value) || Number(value) < 0 || (name !== "toleranceMm" && Number(value) === 0)) throw new Error("Invalid quality rule: " + name);
      result[name] = Number(value);
    }
    if (result.consecutiveCount !== null && (!Number.isInteger(result.consecutiveCount) || result.consecutiveCount < 2 || result.consecutiveCount > MAX_WINDOW)) {
      throw new Error(`Consecutive count must be an integer from 2 to ${MAX_WINDOW} for bounded analysis.`);
    }
    if ((result.consecutiveCount === null) !== (result.toleranceMm === null)) throw new Error("Configure both consecutive count and tolerance, or disable both.");
    return result;
  }
  function analyze(state, incoming, options = {}) {
    core.validateState(state);
    if (!Array.isArray(incoming)) throw new Error("Incoming observations must be an array.");
    const settings = rules(options.rules);
    if (options.asOf !== undefined && !core.isoDate(options.asOf)) throw new Error("Quality cutoff must be YYYY-MM-DD.");
    const ruleVersion = "quality-v1:" + JSON.stringify(settings);
    const points = new Map(state.points.map(p => [p.id.toLowerCase(), p]));
    const previous = new Map(state.records.map(r => [key(r), r]));
    const groups = new Map(), facilityInputs = new Map(), errors = [], skipped = [], changes = [];
    incoming.forEach((row, index) => {
      const point = row && typeof row.pointId === "string" ? points.get(row.pointId.trim().toLowerCase()) : null;
      if (!point || !core.isoDate(row.date) || !core.finiteNumber(row.reading) || !Number.isFinite(core.settlement(point, row))) {
        errors.push({ row: index + 1, code: "invalid_observation" }); return;
      }
      if (Object.hasOwn(row, "facility")) {
        if (typeof row.facility !== "string") { errors.push({ row: index + 1, code: "invalid_facility" }); return; }
        const entries = facilityInputs.get(point.id) || [];
        entries.push({ row: index + 1, value: row.facility.trim(), date: row.date });
        facilityInputs.set(point.id, entries);
      }
      if (Object.hasOwn(row, "note") && typeof row.note !== "string") { errors.push({ row: index + 1, code: "invalid_note" }); return; }
      const record = { pointId: point.id, date: row.date, reading: Number(row.reading) };
      if (Object.hasOwn(row, "note")) record.note = row.note.trim();
      const id = key(record);
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push({ record, row: index + 1 });
    });
    const merged = new Map([...previous].map(([id, row]) => [id, { ...row }]));
    for (const [id, entries] of groups) {
      if (entries.some(entry => entry.record.reading !== entries[0].record.reading)
        || new Set(entries.filter(entry => Object.hasOwn(entry.record, "note")).map(entry => entry.record.note)).size > 1) {
        entries.forEach(entry => errors.push({ row: entry.row, code: "batch_conflict", pointId: entry.record.pointId, date: entry.record.date }));
        continue;
      }
      const entry = entries.find(item => Object.hasOwn(item.record, "note")) || entries[0], old = previous.get(id);
      entries.filter(item => item !== entry).forEach(item => skipped.push({ row: item.row, code: "batch_duplicate" }));
      const record = { ...old, ...entry.record, note: entry.record.note ?? old?.note ?? "" };
      if (old && Number(old.reading) === record.reading && String(old.note || "") === record.note) {
        skipped.push({ row: entry.row, code: "already_exists" }); continue;
      }
      merged.set(id, record);
      const readingChanged = !old || Number(old.reading) !== record.reading;
      changes.push({ kind: old ? readingChanged ? "correction" : "note_correction" : "addition", row: entry.row,
        before: old ? { ...old } : null, after: { ...record }, readingChanged, requiresReason: !!old });
    }
    const facilityChanges = [];
    for (const [pointId, entries] of facilityInputs) {
      if (new Set(entries.map(entry => entry.value)).size > 1) {
        entries.forEach(entry => errors.push({ row: entry.row, code: "facility_conflict", pointId }));
        continue;
      }
      const point = points.get(pointId.toLowerCase()), entry = entries[0];
      if (entry.value !== String(point.facility || "")) facilityChanges.push({ pointId, row: entry.row, date: entry.date,
        before: String(point.facility || ""), after: entry.value });
    }
    const records = [...merged.values()].sort((a, b) => a.pointId.localeCompare(b.pointId) || a.date.localeCompare(b.date));
    const histories = new Map();
    for (const record of records) {
      if (!histories.has(record.pointId)) histories.set(record.pointId, []);
      histories.get(record.pointId).push(record);
    }
    const findings = [];
    const addFinding = finding => {
      if (findings.length >= MAX_FINDINGS) throw new Error(`Data quality analysis exceeds ${MAX_FINDINGS} findings. Narrow the records or disable an overly broad review rule.`);
      findings.push(finding);
    };
    for (const point of state.points) {
      const history = histories.get(point.id) || [];
      const count = settings.consecutiveCount;
      const minimum = [], maximum = [], tokens = [];
      let minHead = 0, maxHead = 0, rollingHash = 0n, oldestPower = 1n;
      if (count !== null) for (let i = 1; i < count; i += 1) oldestPower = (oldestPower * HASH_BASE) & MASK64;
      history.forEach((record, index) => {
        const prior = history[index - 1];
        const base = { pointId: point.id, date: record.date, reading: Number(record.reading), ruleVersion };
        if (prior) {
          const elapsedDays = days(prior.date, record.date);
          // Use the accepted signed 0.1 mm calculation for an observed interval.
          const changeMm = core.settlement({ baseline: prior.reading }, record);
          const rateMmPerDay = changeMm / elapsedDays;
          const evidence = { ...base, previousDate: prior.date, previousReading: Number(prior.reading), elapsedDays, changeMm, rateMmPerDay };
          if (settings.changeMm !== null && Math.abs(changeMm) >= settings.changeMm) addFinding({ ...evidence, code: "interval_change", limit: settings.changeMm });
          if (settings.rateMmPerDay !== null && Math.abs(rateMmPerDay) >= settings.rateMmPerDay) addFinding({ ...evidence, code: "interval_rate", limit: settings.rateMmPerDay });
          if (settings.missingDays !== null && elapsedDays > settings.missingDays) addFinding({ ...evidence, code: "observation_gap", limit: settings.missingDays });
        }
        if (count !== null) {
          const reading = Number(record.reading), token = observationToken(record);
          if (index >= count) rollingHash = (rollingHash - tokens[index - count] * oldestPower) & MASK64;
          rollingHash = (rollingHash * HASH_BASE + token) & MASK64;
          tokens.push(token);
          while (minimum.length > minHead && Number(history[minimum.at(-1)].reading) >= reading) minimum.pop();
          while (maximum.length > maxHead && Number(history[maximum.at(-1)].reading) <= reading) maximum.pop();
          minimum.push(index); maximum.push(index);
          while (minimum[minHead] <= index - count) minHead += 1;
          while (maximum[maxHead] <= index - count) maxHead += 1;
          if (index + 1 >= count) {
            const minimumReading = Number(history[minimum[minHead]].reading), maximumReading = Number(history[maximum[maxHead]].reading);
            // Raw level spread avoids rounding away small differences before this quality check.
            const spreadMm = (maximumReading - minimumReading) * 1000;
            if (spreadMm <= settings.toleranceMm + 1e-9) addFinding({ ...base, code: "repeated_reading", startDate: history[index + 1 - count].date, count, spreadMm, limit: settings.toleranceMm,
              evidenceVersion: "rolling-v1", minimumReading, maximumReading, evidenceFingerprint: rollingHash.toString(16).padStart(16, "0") });
          }
        }
      });
      if (options.asOf && settings.missingDays !== null) {
        // The cutoff scopes freshness only, never validation of observations after it.
        const last = history.filter(record => record.date <= options.asOf).at(-1);
        if (!last) addFinding({ pointId: point.id, date: options.asOf, code: "no_observation", ruleVersion });
        else if (days(last.date, options.asOf) > settings.missingDays) addFinding({ pointId: point.id, date: options.asOf, previousDate: last.date, elapsedDays: days(last.date, options.asOf), code: "stale_observation", limit: settings.missingDays, ruleVersion });
      }
    }
    return { ruleVersion, rules: settings, errors, skipped, changes, facilityChanges, findings, records, canSubmit: errors.length === 0,
      candidates: changes.filter(change => change.readingChanged).map(change => ({ pointId: change.after.pointId, date: change.after.date })) };
  }
  function markerRename(previous, next) {
    const rename = next._markerRename;
    if (rename === undefined) return null;
    if (!rename || typeof rename.from !== "string" || typeof rename.to !== "string" || rename.from === rename.to
      || !previous.points.some(p => p.id === rename.from) || previous.points.some(p => p.id === rename.to)
      || next.points.some(p => p.id === rename.from) || !next.points.some(p => p.id === rename.to)) throw new Error("Invalid marker rename. Refresh and retry.");
    return rename;
  }
  function prepare(previous, next, confirmation, actor, at) {
    if (next.qualityAsOf != null && next.qualityAsOf !== "" && !core.isoDate(next.qualityAsOf)) throw new Error("Quality cutoff must be YYYY-MM-DD.");
    const settings = rules(next.qualityRules === undefined ? {} : next.qualityRules);
    const rename = markerRename(previous, next);
    let previousRecords = previous.records;
    if (rename) {
      // Remap history for comparison only: changed readings still require correction review.
      previousRecords = previous.records.map(r => r.pointId === rename.from ? { ...r, pointId: rename.to } : r);
    }
    const nextKeys = new Set(next.records.map(key));
    const result = analyze({ ...next, records: previousRecords.filter(r => nextKeys.has(key(r))) }, next.records, { rules: settings, asOf: next.qualityAsOf || undefined });
    if (!result.canSubmit) throw new Error("Conflicting or invalid monitoring observations.");
    const facilities = next._csvFacilityCorrections || [];
    if (!Array.isArray(facilities)) throw new Error("Invalid CSV facility corrections.");
    const seenFacilities = new Set();
    for (const change of facilities) {
      const before = previous.points.find(point => point.id === change?.pointId);
      const after = next.points.find(point => point.id === change?.pointId);
      if (!before || !after || seenFacilities.has(change.pointId) || typeof change.before !== "string" || typeof change.after !== "string"
        || String(before.facility || "") !== change.before || String(after.facility || "") !== change.after
        || change.before === change.after || !core.isoDate(change.date)
        || !next.records.some(record => record.pointId === change.pointId && record.date === change.date)) {
        throw new Error("CSV facility correction changed. Analyze and confirm again.");
      }
      seenFacilities.add(change.pointId);
    }
    const needsReview = facilities.length > 0 || result.changes.some(c => c.requiresReason) || (result.changes.length && result.findings.length);
    if (needsReview && (confirmation?.confirmed !== true || typeof confirmation.reason !== "string" || !confirmation.reason.trim())) {
      throw new Error("Confirm the observation preview and provide a correction or verification reason.");
    }
    const audit = [...(previous.qualityAudit || [])];
    if (rename) audit.push({ type: "marker_rename", actor, at, from: rename.from, to: rename.to });
    const selected = next._qualityReview;
    if (selected !== undefined && (!Array.isArray(selected) || !selected.length || selected.some(id => typeof id !== "string" || !result.findings.some(f => findingId(f) === id)))) throw new Error("Quality findings changed. Refresh and review again.");
    if (selected && (confirmation?.confirmed !== true || typeof confirmation.reason !== "string" || !confirmation.reason.trim())) throw new Error("A quality review reason is required.");
    const rulesChanged = JSON.stringify(rules(previous.qualityRules)) !== JSON.stringify(settings) || previous.qualityAsOf !== next.qualityAsOf;
    const previousIds = new Set((previous.qualityFindings || []).map(findingId));
    const currentIds = new Set(result.findings.map(findingId));
    const alreadyReviewed = reviewIndex(audit);
    const reviewedFindings = selected || (needsReview ? [...currentIds].filter(id => !alreadyReviewed.has(id)) : []);
    if (result.changes.length || facilities.length || selected || rulesChanged) audit.push({ actor, at, reason: String(confirmation?.reason || "").trim(), ruleVersion: result.ruleVersion,
      type: result.changes.length || facilities.length ? "observations" : selected ? "review" : "rules", asOf: next.qualityAsOf || null,
      reviewedFindings, rules: result.rules, changes: result.changes, facilityChanges: facilities, findingCount: result.findings.length,
      findings: result.findings.filter(finding => !previousIds.has(findingId(finding))),
      resolvedFindingIds: [...previousIds].filter(id => !currentIds.has(id)) });
    return { ...result, audit };
  }
  function findingId(finding) { return JSON.stringify(repeatedIdentity(finding)); }
  function reviewIndex(audit) {
    const index = new Map();
    for (const entry of audit || []) for (const id of entry.reviewedFindings || []) {
      try { index.set(findingId(JSON.parse(id)), entry); } catch { index.set(id, entry); }
    }
    return index;
  }
  function reviewedInAudit(entry, finding) {
    return reviewIndex([entry]).has(findingId(finding));
  }
  return { defaults, rules, analyze, prepare, markerRename, findingId, reviewedInAudit, reviewIndex };
});
