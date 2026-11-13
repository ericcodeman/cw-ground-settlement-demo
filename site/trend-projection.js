(function (root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./monitoring-core") : root.MonitoringCore);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TrendProjection = api;
})(typeof window === "undefined" ? globalThis : window, function (core) {
  "use strict";
  const DAY = 86400000;
  const dateValue = value => core.isoDate(value) ? Date.parse(value + "T00:00:00Z") : NaN;
  const iso = value => new Date(value).toISOString().slice(0, 10);

  function calculate(state, pointId, asOfDate, options = {}) {
    const asOf = dateValue(asOfDate);
    if (!Number.isFinite(asOf)) throw new Error("Select a valid projection cutoff date.");
    const point = (state.points || []).find(item => item.id === pointId);
    if (!point) return { ok: false, reason: "Select a known monitoring point." };
    const maxAgeDays = Number.isInteger(options.maxAgeDays) && options.maxAgeDays >= 0 ? options.maxAgeDays : 3;
    const start = asOf - 14 * DAY;
    const seen = new Map();
    const eligible = (state.records || [])
      .filter(record => record.pointId === pointId && dateValue(record.date) >= start && dateValue(record.date) <= asOf && core.finiteNumber(record.reading))
      .sort((a, b) => a.date.localeCompare(b.date));
    for (const record of eligible) {
      if (seen.has(record.date) && Number(seen.get(record.date).reading) !== Number(record.reading)) {
        return { ok: false, reason: `Conflicting observations on ${record.date}; resolve the duplicate before projecting.` };
      }
      seen.set(record.date, record);
    }
    const observations = [...seen.values()]
      .map(record => ({ date: record.date, value: core.settlement(point, record), sourceKey: `${pointId}|${record.date}` }))
      .filter(record => Number.isFinite(record.value));
    if (observations.length < 3) return { ok: false, reason: "At least three distinct valid observations within the preceding 15 calendar days are required.", observations };
    const ageDays = (asOf - dateValue(observations.at(-1).date)) / DAY;
    if (ageDays > maxAgeDays) return { ok: false, reason: `Latest observation is ${ageDays} days before the cutoff; maximum allowed is ${maxAgeDays} days.`, observations };
    const first = dateValue(observations[0].date);
    const samples = observations.map(item => ({ x: (dateValue(item.date) - first) / DAY, y: item.value }));
    const meanX = samples.reduce((sum, item) => sum + item.x, 0) / samples.length;
    const meanY = samples.reduce((sum, item) => sum + item.y, 0) / samples.length;
    const denominator = samples.reduce((sum, item) => sum + (item.x - meanX) ** 2, 0);
    if (denominator <= 0) return { ok: false, reason: "Distinct observation dates are required.", observations };
    const slope = samples.reduce((sum, item) => sum + (item.x - meanX) * (item.y - meanY), 0) / denominator;
    const intercept = meanY - slope * meanX;
    const fittedAtCutoff = { date: asOfDate,
      value: Math.round((intercept + slope * ((asOf - first) / DAY)) * 10) / 10,
      projected: true };
    // Display the same fitted model before the cutoff, not an invented link
    // from the latest measurement. These endpoints are never observations.
    const fittedHistory = [
      { date: observations[0].date, value: Math.round(intercept * 10) / 10, fitted: true },
      { date: asOfDate, value: fittedAtCutoff.value, fitted: true }
    ];
    const forecast = Array.from({ length: 7 }, (_, index) => {
      const time = asOf + (index + 1) * DAY;
      return { date: iso(time), value: Math.round((intercept + slope * ((time - first) / DAY)) * 10) / 10, projected: true };
    });
    return { ok: true, pointId, asOfDate, windowStart: iso(start), observations,
      fittedAtCutoff, fittedHistory, forecast, slopeMmPerDay: slope, method: "ordinary least-squares linear trend on actual elapsed days",
      maxAgeDays, sourceKeys: observations.map(item => item.sourceKey),
      notice: "Illustrative trend projection only; not a measurement, engineering forecast, threshold decision or verified ground response." };
  }
  return { calculate };
});
