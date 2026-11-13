(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ContourPresentation = api;
})(typeof window === "undefined" ? globalThis : window, function () {
  "use strict";
  const notice = "Diagrammatic interpolation — not a verified survey surface.";
  const signNote = "Negative = settlement; positive = heave. Marker status uses |rounded settlement| (0.1 mm).";
  const groupName = group => ({ ground: "Ground Settlement", utilities: "Utilities Settlement", refuseGround: "West Kowloon Ground", all: "All groups — comparison only" })[group] || group;
  const signed = value => (value > 0 ? "+" : "") + Number(value).toFixed(1);
  function signedColor(value, limit) {
    const ratio = Math.max(-1, Math.min(1, Number(value) / Number(limit)));
    const start = ratio < 0 ? [33, 102, 172] : [247, 247, 247];
    const end = ratio < 0 ? [247, 247, 247] : [179, 88, 6];
    const t = ratio < 0 ? ratio + 1 : ratio;
    return "#" + start.map((channel, index) => Math.round(channel + (end[index] - channel) * t).toString(16).padStart(2, "0")).join("");
  }
  // Display-only bands; warm settlement colours are not alert classifications.
  function bandColor(magnitude, limit, negative) {
    const stops = negative ? [[46, 196, 182], [107, 203, 119], [255, 224, 102], [244, 145, 53], [199, 44, 65]]
      : [[174, 218, 241], [75, 151, 201], [76, 80, 160]];
    const position = Math.max(0, Math.min(1, magnitude / limit)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(position)), t = position - i;
    return "#" + stops[i].map((c, j) => Math.round(c + (stops[i + 1][j] - c) * t).toString(16).padStart(2, "0")).join("");
  }
  function surfaceColor(value, p) {
    if (p.colorStyle !== "banded") return signedColor(value, p.colorLimit);
    if (value === 0) return "#f7f7f7";
    const count = colourBandCount(p.colorLimit, p.bandWidth);
    const index = Math.min(count, Math.max(1, stableCeil(Math.abs(value) / p.bandWidth)));
    const lower = bandBoundary(index - 1, p), upper = bandBoundary(index, p);
    return bandColor((lower + upper) / 2, p.colorLimit, value < 0);
  }
  // Only absorb binary floating-point noise at integral ratios, not meaningful
  // differences near a boundary. This is display classification, not mm rounding.
  function stableCeil(ratio) {
    const nearest = Math.round(ratio);
    return Math.abs(ratio - nearest) <= 4 * Number.EPSILON * Math.max(1, Math.abs(ratio)) ? nearest : Math.ceil(ratio);
  }
  function colourBandCount(limit, width) {
    return stableCeil(limit / width);
  }
  function bandBoundary(index, p) {
    return Math.min(p.colorLimit, Number((index * p.bandWidth).toPrecision(15)));
  }
  function bandLabel(value) {
    const number = Number(value);
    return (number > 0 ? "+" : "") + (Number(number.toFixed(1)) === number ? number.toFixed(1) : String(number));
  }
  function colourBands(p) {
    if (p.colorStyle !== "banded") return [];
    const count = colourBandCount(p.colorLimit, p.bandWidth);
    if (!Number.isFinite(count) || count < 1 || count > 20) throw new Error("Use at most 20 colour bands per sign. Increase the band width.");
    const negative = [], positive = [];
    for (let i = 0; i < count; i += 1) {
      const a = bandBoundary(i, p), b = bandBoundary(i + 1, p);
      negative.unshift({ min: -b, max: a === 0 ? 0 : -a, color: surfaceColor(-(a + b) / 2, p), text: `${bandLabel(-b)} <= s < ${bandLabel(-a)} mm` });
      positive.push({ min: a, max: b, color: surfaceColor((a + b) / 2, p), text: `${bandLabel(a)} < s <= ${bandLabel(b)} mm` });
    }
    return negative.concat([{ min: 0, max: 0, color: surfaceColor(0, p), text: "0.0 mm - zero change" }], positive);
  }
  function scaleSwatches(p) {
    if (p.colorStyle === "banded") return colourBands(p).filter(b => b.max > b.min);
    return Array.from({ length: 64 }, (_, i) => {
      const min = -p.colorLimit + i * p.colorLimit / 32, max = min + p.colorLimit / 32;
      return { min, max, color: surfaceColor((min + max) / 2, p) };
    });
  }
  function status(value, snapshot) {
    if (snapshot.metadata.markerGroup === "all") return "Comparison contour";
    return snapshot.presentation.thresholds.reduce((label, limit) =>
      Number.isFinite(limit.value) && Math.abs(value) >= limit.value ? limit.label : label, "Below Alert");
  }
  function style(label) {
    const styles = {
      Alert: { color: "#986200", dash: [7, 4] },
      Alarm: { color: "#be4b00", dash: [2, 4] },
      Action: { color: "#b42318", dash: [10, 3, 2, 3] },
      "Action 1": { color: "#a44720", dash: [10, 4] },
      "Action 2": { color: "#943300", dash: [7, 3, 2, 3] },
      "Action 3": { color: "#b42318", dash: [10, 3, 2, 3] },
      Okay: { color: "#1f8a5b", dash: [] },
      "Below configured thresholds": { color: "#1f8a5b", dash: [] },
      "Below Alert": { color: "#1f8a5b", dash: [] }
    };
    return styles[label] || { color: "#1769aa", dash: [] };
  }
  function metricProjection(boundary, plot) {
    if (!Array.isArray(boundary) || boundary.length < 3 || boundary.some(p => p.length !== 2 || !p.every(Number.isFinite))) throw new Error("Invalid metric boundary.");
    const xs = boundary.map(p => p[0]), ys = boundary.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    if (maxX <= minX || maxY <= minY) throw new Error("Degenerate metric boundary.");
    const scale = Math.min(plot.width / (maxX - minX), plot.height / (maxY - minY));
    const xOffset = plot.left + (plot.width - (maxX - minX) * scale) / 2;
    const yOffset = plot.top + (plot.height - (maxY - minY) * scale) / 2;
    return { scale, point: ([x, y]) => ({ x: xOffset + (x - minX) * scale, y: yOffset + (maxY - y) * scale }) };
  }
  function metadataRows(snapshot) {
    const m = snapshot.metadata, p = snapshot.presentation, v = m.interpolation.variogram;
    const dates = p.observationDates;
    return [
      ["Project", p.projectName], ["Group", groupName(m.markerGroup)],
      ["Records through", m.markerDate === "latest" ? "Latest available per marker" : m.markerDate],
      ["Observation range", dates.length ? dates[0] + " to " + dates.at(-1) : "No observations"],
      ...(m.observationAge ? [["Maximum observation age", m.observationAge.maximumDays + " days from " + (m.observationAge.referenceDate || "no eligible date") + " (" + m.observationAge.reference + ")"]] : []),
      ["Coverage", p.markers.length + " used / " + p.exclusions.length + " excluded / " + (p.markers.length + p.exclusions.length) + " total"],
      ["Observed value range", signed(m.valueRange[0]) + " to " + signed(m.valueRange[1]) + " mm"],
      ["Contours", snapshot.features.length + " rendered / " + m.levels.length + " requested levels; interval " + p.interval + " mm"],
      ["Signed colour scale", (p.colorMode === "data" ? "data-aware" : "fixed") + " −" + p.colorLimit + " to +" + p.colorLimit + " mm; " + (p.colorSaturated ? "observed values outside the scale are saturated" : "observed values are within the scale")],
      ["Surface opacity", Math.round(p.surfaceOpacity * 100) + "%"],
      ["Colour display", p.colorStyle === "banded" ? "Banded; width " + p.bandWidth + " mm; warm = settlement, cool = heave; colours are not 3A/5A classifications" : "Continuous signed scale; colours are not 3A/5A classifications"],
      ["Interpolated colour saturation", p.surfaceSaturated ? "Displayed surface exceeds colour limits; edge colours are saturated" : "Displayed surface is within colour limits"],
      ["Approach", p.approach + (m.markerGroup === "all" ? "; mixed thresholds disabled for contours; markers retain their own rule" : "")],
      ["Model", "Ordinary Kriging / " + v.type],
      ["Variogram", "sill " + v.sill + " mm²; range " + v.range + " m; nugget " + v.nugget + " mm²"],
      ["Grid / mask", m.grid.rows + " × " + m.grid.columns + "; " + m.boundaryMask],
      ["Display surface", m.surfaceGrid.rows + " × " + m.surfaceGrid.columns + " cells grid; independently capped at " + m.surfaceGrid.maximum],
      ["Coordinates", m.coordinates.interpolationCrs + " / " + m.coordinates.displayCrs],
      ["Coordinate sources", m.coordinates.hk1980 + " HK1980; " + m.coordinates.convertedFromWGS84 + " converted from WGS84"],
      ["Source revision", p.sourceRevision || "Not supplied"],
      ["DXF background", p.background ? p.background.originalFileName + "; " + p.background.entityCount + " " + (p.background.entityCount === 1 ? "entity" : "entities") + "; layers " + p.background.selectedLayers.join(", ") : "None"],
      ["Calculated at", m.generatedAt], ["Sign and status", signNote]
    ];
  }
  function legend(snapshot) {
    return snapshot.features.map(feature => {
      const level = feature.properties.level;
      return { text: signed(level) + " mm · " + (level < 0 ? "Settlement" : level > 0 ? "Heave" : "Zero change"), color: surfaceColor(level, snapshot.presentation), dash: [] };
    });
  }
  function labelAnchors(snapshot, project, minSpacing = 56) {
    const candidates = snapshot.features.map(feature => {
      let longest = null;
      for (const [lineIndex, line] of feature.properties.metricCoordinates.entries()) {
        const geographic = feature.geometry.coordinates[lineIndex];
        if (!Array.isArray(line) || line.length < 2 || geographic?.length !== line.length) continue;
        let length = 0;
        const distances = [0];
        for (let i = 1; i < line.length; i += 1) {
          const a = project(line[i - 1], geographic[i - 1]), b = project(line[i], geographic[i]);
          length += Math.hypot(b.x - a.x, b.y - a.y);
          distances.push(length);
        }
        if (!longest || length > longest.length) longest = { line, geographic, length, distances };
      }
      if (!longest || longest.length < 32) return null;
      const index = longest.distances.findIndex(distance => distance >= longest.length / 2);
      const metric = longest.line[index], wgs84 = longest.geographic[index];
      return { level: feature.properties.level, text: signed(feature.properties.level) + " mm", metric, wgs84, ...project(metric, wgs84), length: longest.length };
    }).filter(Boolean).sort((a, b) => b.length - a.length);
    const accepted = [];
    for (const candidate of candidates) {
      if (accepted.every(label => Math.hypot(label.x - candidate.x, label.y - candidate.y) >= minSpacing)) accepted.push(candidate);
    }
    return accepted;
  }
  function wrappedLines(ctx, text, maxWidth) {
    const lines = []; let line = "";
    for (const char of String(text)) {
      if (line && ctx.measureText(line + char).width > maxWidth) { lines.push(line); line = ""; }
      line += char;
    }
    lines.push(line); return lines;
  }
  // Canvas is supplied by the browser (or a test); no native canvas dependency.
  function renderPng(canvas, snapshot, exportedAt = new Date()) {
    if (!snapshot?.presentation?.markers?.length) throw new Error("Calculate a contour before exporting.");
    const p = snapshot.presentation, m = snapshot.metadata;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot create the contour image.");
    const entries = legend(snapshot);
    const bands = colourBands(p);
    const details = metadataRows(snapshot).concat(
      p.thresholds.map(t => ["Threshold", t.label + ": " + (t.value === null ? "not configured" : "|settlement| ≥ " + t.value + " mm")]),
      [["Source observations", "ID | accumulated mm | observation date | status"]],
      p.markers.map(marker => ["Marker", marker.id + " | " + signed(marker.settlement) + " mm | " + marker.date + " | " + marker.status]),
      p.exclusions.map(marker => ["Excluded", marker.id + " | " + marker.reason]),
      [["Exported", exportedAt.toLocaleString("en-GB", { timeZone: "Asia/Hong_Kong" }) + " HKT"],
       ["Basemap", "Street-map tiles not included. HK1980 metric drawing; grid north up."], ["Notice", notice]]
    );
    ctx.font = "16px Arial";
    const textLines = details.flatMap(([key, value]) => wrappedLines(ctx, key + ": " + value, 1470));
    const titleLines = wrappedLines(ctx, p.projectName + " · Settlement Contour", 1400);
    const plotTop = 90 + titleLines.length * 26;
    const plot = { left: 90, top: plotTop + 30, width: 1000, height: 630 };
    const detailsTop = plot.top + Math.max(850, (entries.length + bands.length) * 27 + 130);
    const height = detailsTop + textLines.length * 24 + 70;
    if (height > 16000) throw new Error("Export is too large. Shorten marker IDs or select a smaller group.");
    canvas.width = 1600; canvas.height = height;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#102f52"; ctx.font = "700 22px Arial";
    titleLines.forEach((line, i) => ctx.fillText(line, 60, 48 + i * 26));
    ctx.font = "16px Arial"; ctx.fillText(groupName(m.markerGroup) + " · records through " + m.markerDate + " · accumulated settlement (mm)", 60, plotTop - 10);
    const projectionExtent = p.metricBoundary.concat(p.background ? p.background.metricLines.flatMap(line => line.points) : []);
    const projection = metricProjection(projectionExtent, plot);
    function path(coordinates, color, dash, width) {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
      coordinates.forEach((coordinate, i) => { const q = projection.point(coordinate); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (p.background) for (const line of p.background.metricLines) path(line.points, "#a3abb5", [], 1);
    ctx.globalAlpha = p.surfaceOpacity;
    for (const cell of p.surfaceCells) {
      ctx.beginPath(); ctx.fillStyle = surfaceColor(cell.value, p);
      cell.metric.forEach((coordinate, i) => { const q = projection.point(coordinate); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    path(p.metricBoundary, "#536274", [6, 5], 2);
    for (const feature of snapshot.features) {
      for (const line of feature.properties.metricCoordinates) path(line, surfaceColor(feature.properties.level, p), [], 2);
    }
    for (const label of labelAnchors(snapshot, projection.point, 56)) {
      ctx.font = "700 12px Arial";
      const width = ctx.measureText(label.text).width + 10;
      ctx.fillStyle = "#ffffff"; ctx.fillRect(label.x - width / 2, label.y - 9, width, 18);
      ctx.fillStyle = "#102f52"; ctx.fillText(label.text, label.x - width / 2 + 5, label.y + 4);
    }
    for (const marker of p.markers) {
      const q = projection.point([marker.x, marker.y]);
      ctx.beginPath(); ctx.fillStyle = style(marker.status).color; ctx.arc(q.x, q.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.font = "12px Arial"; ctx.fillStyle = "#102f52";
      const label = marker.id + " " + signed(marker.settlement);
      // Keep edge labels inside the drawing; full dates/statuses are in the source table.
      ctx.fillText(label, Math.max(55, Math.min(q.x + 8, 1110 - ctx.measureText(label).width)), q.y - 9);
    }
    ctx.fillStyle = "#102f52"; ctx.font = "700 16px Arial";
    ctx.fillText("Grid N ↑", 60, plot.top - 4);
    const rawLength = 180 / projection.scale;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawLength)));
    const metres = [5, 2, 1].map(n => n * magnitude).find(n => n <= rawLength) || magnitude;
    const scaleY = plot.top + plot.height + 55;
    ctx.beginPath(); ctx.moveTo(90, scaleY); ctx.lineTo(90 + metres * projection.scale, scaleY); ctx.strokeStyle = "#102f52"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillText("0", 90, scaleY + 24); ctx.fillText(metres.toPrecision(3) + " m", 90 + metres * projection.scale, scaleY + 24);
    ctx.fillText("Contour legend (" + entries.length + " rendered levels)", 1150, plot.top);
    if (!entries.length) { ctx.font = "14px Arial"; ctx.fillText("No contour crosses this surface.", 1150, plot.top + 30); }
    entries.forEach((entry, i) => {
      const y = plot.top + 30 + i * 27;
      ctx.beginPath(); ctx.setLineDash(entry.dash); ctx.strokeStyle = entry.color; ctx.lineWidth = 3;
      ctx.moveTo(1150, y); ctx.lineTo(1190, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = "14px Arial"; ctx.fillStyle = "#102f52"; ctx.fillText(entry.text, 1200, y + 5);
    });
    const bandTop = plot.top + 65 + entries.length * 27;
    if (bands.length) {
      ctx.font = "700 16px Arial"; ctx.fillText("Colour bands (s in mm)", 1150, bandTop);
      bands.forEach((band, i) => {
        const y = bandTop + 20 + i * 27;
        ctx.fillStyle = band.color; ctx.fillRect(1150, y, 30, 16);
        ctx.fillStyle = "#102f52"; ctx.font = "14px Arial"; ctx.fillText(band.text, 1195, y + 13);
      });
    }
    const barY = scaleY + 50, barWidth = 1000;
    for (const swatch of scaleSwatches(p)) {
      ctx.fillStyle = swatch.color;
      ctx.fillRect(90 + (swatch.min + p.colorLimit) / (2 * p.colorLimit) * barWidth, barY,
        (swatch.max - swatch.min) / (2 * p.colorLimit) * barWidth + 0.5, 20);
    }
    ctx.fillStyle = "#102f52"; ctx.font = "14px Arial";
    ctx.fillText(signed(-p.colorLimit) + " mm settlement", 90, barY + 42);
    ctx.fillText("0", 585, barY + 42);
    ctx.fillText(signed(p.colorLimit) + " mm heave", 950, barY + 42);
    ctx.fillText("Displacement colour scale - not alert status" + (p.colorSaturated || p.surfaceSaturated ? "; saturated outside limits" : ""), 90, barY + 66);
    ctx.font = "16px Arial"; ctx.fillStyle = "#102f52";
    textLines.forEach((line, i) => ctx.fillText(line, 60, detailsTop + i * 24));
    return { width: canvas.width, height: canvas.height };
  }
  function pngBlob(canvas) {
    return new Promise((resolve, reject) => {
      try { canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG encoding failed. Please retry.")), "image/png"); }
      catch (error) { reject(error); }
    });
  }
  return { notice, signNote, groupName, signed, signedColor, surfaceColor, colourBandCount, colourBands, scaleSwatches, status, style, metricProjection, metadataRows, legend, labelAnchors, renderPng, pngBlob };
});
