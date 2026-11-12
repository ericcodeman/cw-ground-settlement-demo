(function(root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./monitoring-core") : root.MonitoringCore);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.UtilitySegmentMap = api;
})(typeof window === "undefined" ? globalThis : window, function(Core) {
  "use strict";
  const coordinateSource = "CURRENT_POINT_REGISTER";
  const unavailable = reason => ({ status: "UNAVAILABLE", reason });
  const text = value => typeof value === "string" && value.trim().length > 0;
  const identity = row => ({ reviewId: row.id, date: row.date, baselineEpoch: row.baselineEpoch,
    aId: row.aId, bId: row.bId, assetId: row.registerLink?.assetId, assetVersion: row.registerLink?.assetVersion,
    segmentId: row.registerLink?.segmentId, segmentVersion: row.registerLink?.segmentVersion });

  // Index once per state read. Ambiguous/malformed identities fail closed, not last-row-wins.
  function versionIndex(rows) {
    const index = new Map();
    for (const row of rows) {
      if (!row || !text(row.id)) continue;
      let group = index.get(row.id);
      if (!group) { group = { versions: new Map(), latest: null, invalid: false }; index.set(row.id, group); }
      if (!Number.isInteger(row.version) || row.version < 1 || group.versions.has(row.version)) group.invalid = true;
      group.versions.set(row.version, row);
      if (!group.latest || row.version > group.latest.version) group.latest = row;
    }
    return index;
  }

  // Server read adapter only: no calls to calculations, criteria matching, mutations or private evidence.
  function context(state, reviews, { projectId, revision } = {}) {
    const extension = state.structureUu || {};
    const validRegister = extension.version === 1 &&
      [extension.utilityAssets || [], extension.utilitySegments || []].every(Array.isArray);
    const assets = versionIndex(validRegister ? extension.utilityAssets || [] : []);
    const segments = versionIndex(validRegister ? extension.utilitySegments || [] : []);
    const points = new Map();
    for (const point of state.points || []) {
      if (point && text(point.id)) points.set(point.id, points.has(point.id) ? null : point);
    }
    function item(row) {
      const ref = identity(row), link = row.registerLink;
      const fail = reason => ({ ...ref, coordinateSource, ...unavailable(reason) });
      if (!link) return fail("A registered segment is required for map display; legacy pair details remain available.");
      if (row.verified !== true || row.result?.status !== "AVAILABLE" || row.evidence?.status?.sourceRevision !== "CURRENT") {
        return fail("Review reading sources are unavailable or require reverification. Historical coordinates are not captured.");
      }
      const assetGroup = assets.get(link.assetId), segmentGroup = segments.get(link.segmentId);
      if (!validRegister || !assetGroup || !segmentGroup || assetGroup.invalid || segmentGroup.invalid) {
        return fail("Registered asset/segment identity is missing or ambiguous.");
      }
      const asset = assetGroup.versions.get(link.assetVersion), segment = segmentGroup.versions.get(link.segmentVersion);
      if (!asset || !segment || assetGroup.latest !== asset || segmentGroup.latest !== segment ||
          asset.status !== "active" || segment.status !== "active") {
        return fail("Captured asset/segment revision is no longer the current active association; historical geometry is unavailable.");
      }
      // The established resolver allows an original segment with a subsequently revised asset.
      // Do not equate the segment's creation-time assetVersion with the Review's captured version.
      if (segment.assetId !== asset.id || segment.aId !== row.aId || segment.bId !== row.bId ||
          segment.baselineEpoch !== row.baselineEpoch || segment.verified !== true ||
          segment.lengthM !== row.lengthM || !Number.isFinite(segment.lengthM) || segment.lengthM <= 0 ||
          !text(segment.lengthSource) || row.aId === row.bId) {
        return fail("Captured segment endpoints, baseline or verified connection evidence are inconsistent.");
      }
      const endpoints = [row.aId, row.bId].map(id => points.get(id));
      if (endpoints.some(point => !point || ![point.easting, point.northing].every(Core.finiteNumber))) {
        return fail("Unambiguous current HK1980 endpoint coordinates are unavailable; no coordinate fallback is used.");
      }
      return { ...ref, coordinateSource, status: "AVAILABLE",
        endpoints: endpoints.map(point => ({ pointId: point.id, easting: Number(point.easting), northing: Number(point.northing) })) };
    }
    return { projectId, revision, byReviewId: Object.fromEntries(reviews.map(row => [row.id, item(row)])) };
  }

  // Browser display transform only. Values/status come from the selected Review, never this geometry.
  function build(row, envelope, { projectId, revision, project } = {}) {
    if (!row || !envelope || !text(projectId) || !text(revision) ||
        envelope.projectId !== projectId || envelope.revision !== revision) {
      return unavailable("Map context is unavailable or belongs to another project/read revision. Refresh reviews.");
    }
    const entry = envelope.byReviewId?.[row.id], ref = identity(row);
    if (!entry || Object.keys(ref).some(key => entry[key] !== ref[key])) {
      return unavailable("Map context does not match the selected Review and captured scope.");
    }
    if (entry.status !== "AVAILABLE") return unavailable(entry.reason || "Map geometry unavailable.");
    const result = row.result;
    if (entry.coordinateSource !== coordinateSource || row.verified !== true || !row.registerLink ||
        row.evidence?.status?.sourceRevision !== "CURRENT" || result?.status !== "AVAILABLE" ||
        result.method !== "TWO_POINT_RELATIVE_SLOPE_V1" || result.classification !== "DERIVED_RELATIVE_SLOPE" ||
        ![result.settlementAMm, result.settlementBMm, result.differenceMm, result.magnitudeMm, result.ratio, row.lengthM].every(Number.isFinite) ||
        result.magnitudeMm < 0 || result.ratio < 0 || row.lengthM <= 0 || !Array.isArray(entry.endpoints) || entry.endpoints.length !== 2 ||
        entry.endpoints.some((point, i) => !point || point.pointId !== [row.aId, row.bId][i] ||
          ![point.easting, point.northing].every(Number.isFinite))) {
      return unavailable("Supported result or current endpoint evidence is unavailable or inconsistent.");
    }
    try {
      const geo = entry.endpoints.map(point => project(point.easting, point.northing));
      if (geo.some(point => !point || ![point.lat, point.lng].every(Number.isFinite) ||
          Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180)) return unavailable("Coordinate projection unavailable or invalid.");
      return { status: "AVAILABLE", coordinateSource, endpoints: entry.endpoints,
        positions: geo.map(point => [point.lat, point.lng]),
        coincident: entry.endpoints[0].easting === entry.endpoints[1].easting && entry.endpoints[0].northing === entry.endpoints[1].northing };
    } catch { return unavailable("Coordinate projection unavailable or failed."); }
  }
  return { context, build };
});
