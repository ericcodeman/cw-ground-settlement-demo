(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ContourBackground = api;
})(typeof window === "undefined" ? globalThis : window, function () {
  "use strict";
  const MAX_BYTES = 1_000_000, MAX_ENTITIES = 5_000, MAX_VERTICES = 20_000;
  function pairs(text) {
    if (typeof text !== "string" || !text.length || text.length > MAX_BYTES || /\0/.test(text)) throw new Error("DXF must be a non-empty ASCII file no larger than 1 MB.");
    if (/[^\x09\x0a\x0d\x20-\x7e]/.test(text)) throw new Error("Only ASCII DXF is supported.");
    const lines = text.replace(/\r/g, "").split("\n"); if (lines.at(-1) === "") lines.pop();
    if (lines.length % 2) throw new Error("DXF group-code pairs are incomplete.");
    return Array.from({ length: lines.length / 2 }, (_, i) => ({ code: Number(lines[i * 2].trim()), value: lines[i * 2 + 1].trim() }));
  }
  function number(value, label) {
    const result = Number(value); if (!Number.isFinite(result)) throw new Error("DXF " + label + " must be finite."); return result;
  }
  function parse(text) {
    const input = pairs(text); let units;
    for (let i = 0; i < input.length; i += 1) if (input[i].code === 9 && input[i].value === "$INSUNITS") {
      const unit = input.slice(i + 1, i + 5).find(pair => pair.code === 70); units = unit ? Number(unit.value) : undefined;
    }
    if (units !== 6) throw new Error("DXF must declare $INSUNITS = 6 (metres). Unitless or millimetre drawings are not accepted.");
    let inEntities = false; const entities = []; const unsupported = new Set();
    for (let i = 0; i < input.length;) {
      if (input[i].code === 0 && input[i].value === "SECTION" && input[i + 1]?.code === 2 && input[i + 1].value === "ENTITIES") { inEntities = true; i += 2; continue; }
      if (inEntities && input[i].code === 0 && input[i].value === "ENDSEC") { inEntities = false; i += 1; continue; }
      if (!inEntities || input[i].code !== 0) { i += 1; continue; }
      const type = input[i].value.toUpperCase(); const fields = []; i += 1;
      while (i < input.length && input[i].code !== 0) fields.push(input[i++]);
      if (!["LINE", "LWPOLYLINE"].includes(type)) { unsupported.add(type); continue; }
      if (entities.length >= MAX_ENTITIES) throw new Error("DXF exceeds the 5,000 supported-entity limit.");
      const layer = fields.find(pair => pair.code === 8)?.value || "0";
      if (type === "LINE") {
        const find = code => fields.find(pair => pair.code === code)?.value;
        entities.push({ type, layer, points: [[number(find(10), "LINE start X"), number(find(20), "LINE start Y")], [number(find(11), "LINE end X"), number(find(21), "LINE end Y")]] });
      } else {
        if (fields.some(pair => pair.code === 42 && Math.abs(number(pair.value, "bulge")) > 1e-12)) throw new Error("Bulged LWPOLYLINE entities are not supported. Convert arcs to straight segments.");
        const points = []; let pending;
        for (const field of fields) {
          if (field.code === 10) { pending = [number(field.value, "polyline X")]; points.push(pending); }
          else if (field.code === 20 && pending?.length === 1) pending.push(number(field.value, "polyline Y"));
        }
        if (points.length < 2 || points.some(point => point.length !== 2)) throw new Error("LWPOLYLINE needs at least two complete XY vertices.");
        const flags = Number(fields.find(pair => pair.code === 70)?.value || 0); if (flags & 1) points.push([...points[0]]);
        entities.push({ type, layer, points });
      }
    }
    const vertexCount = entities.reduce((sum, entity) => sum + entity.points.length, 0);
    if (!entities.length) throw new Error("DXF contains no supported LINE or LWPOLYLINE entities.");
    if (vertexCount > MAX_VERTICES) throw new Error("DXF exceeds the 20,000 vertex limit.");
    const coordinates = entities.flatMap(entity => entity.points), xs = coordinates.map(p => p[0]), ys = coordinates.map(p => p[1]);
    const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    if (![bounds.minX, bounds.maxX, bounds.minY, bounds.maxY].every(Number.isFinite) || bounds.minX === bounds.maxX || bounds.minY === bounds.maxY) throw new Error("DXF drawing extent is invalid.");
    return { entities, layers: [...new Set(entities.map(entity => entity.layer))].sort(), unsupported: [...unsupported].sort(), bounds, vertexCount, units: "metres", crs: "EPSG:2326 HK1980 Grid" };
  }
  function selected(parsed, layers) {
    const allowed = new Set(Array.isArray(layers) ? layers : parsed.layers);
    return parsed.entities.filter(entity => allowed.has(entity.layer));
  }
  return { MAX_BYTES, MAX_ENTITIES, MAX_VERTICES, parse, selected };
});
