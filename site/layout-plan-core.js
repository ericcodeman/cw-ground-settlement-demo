(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LayoutPlanCore = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const MAX_FILE_SIZE = 12 * 1024 * 1024;
  const MANUAL_POSITION_NOTICE = "Monitoring point positions are marked manually and are diagrammatic. They do not represent verified survey coordinates.";
  const allowedFiles = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg"
  };

  function fileExtension(name) {
    const match = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : "";
  }

  function validateFileMetadata(file) {
    const extension = fileExtension(file && file.name);
    if (!allowedFiles[extension]) return { valid: false, error: "Use a PNG, JPG or JPEG layout image." };
    if (!file || !Number.isFinite(file.size) || file.size <= 0) return { valid: false, error: "The selected file is empty or corrupted." };
    if (file.size > MAX_FILE_SIZE) return { valid: false, error: "The layout plan must be 12 MB or smaller." };
    if (file.type && file.type !== allowedFiles[extension]) return { valid: false, error: "The file extension and MIME type do not match." };
    return { valid: true, fileType: extension, mimeType: allowedFiles[extension] };
  }

  function isInsideDrawing(drawingX, drawingY, width, height) {
    return Number.isFinite(drawingX) && Number.isFinite(drawingY)
      && drawingX >= 0 && drawingY >= 0 && drawingX <= width && drawingY <= height;
  }

  function relativeFromPointer(pointer, transform, drawing) {
    if (!pointer || !transform || !drawing || !Number.isFinite(transform.scale) || transform.scale <= 0
        || !Number.isFinite(drawing.width) || !Number.isFinite(drawing.height) || drawing.width <= 0 || drawing.height <= 0) return null;
    const drawingX = (pointer.x - transform.offsetX) / transform.scale;
    const drawingY = (pointer.y - transform.offsetY) / transform.scale;
    if (!isInsideDrawing(drawingX, drawingY, drawing.width, drawing.height)) return null;
    return { relativeX: drawingX / drawing.width, relativeY: drawingY / drawing.height };
  }

  function drawingFromRelative(point, drawing) {
    return { x: point.relativeX * drawing.width, y: point.relativeY * drawing.height };
  }

  function selectPdfPage(pageCount, selectedPage) {
    const page = Number(selectedPage);
    if (!Number.isInteger(page) || page < 1 || page > pageCount) throw new Error("Select a valid PDF page.");
    return page;
  }

  function nextPointId(points, prefix) {
    const expression = new RegExp(`^${String(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`, "i");
    const maximum = points.reduce((max, point) => {
      const match = String(point.pointId || "").match(expression);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `${prefix}${String(maximum + 1).padStart(2, "0")}`;
  }

  function hasDuplicatePointId(points, pointId, exceptId) {
    const target = String(pointId || "").trim().toLowerCase();
    return points.some(point => point.id !== exceptId && String(point.pointId || "").trim().toLowerCase() === target);
  }

  function clampRelative(value) {
    return Math.max(0, Math.min(1, Number(value)));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function exportDescriptor(plan, exportedAt) {
    return {
      mimeType: "image/png",
      fileName: `${String(plan.drawingTitle || "layout-plan").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}-annotated.png`,
      projectName: plan.projectName || "Project",
      drawingTitle: plan.drawingTitle || "Layout plan",
      drawingNumber: plan.drawingNumber || "",
      revision: plan.revision || "",
      exportDate: new Date(exportedAt).toISOString(),
      notice: MANUAL_POSITION_NOTICE
    };
  }

  function removePlanRecords(state, planId) {
    return {
      layoutPlans: (state.layoutPlans || []).filter(plan => plan.id !== planId),
      layoutPoints: (state.layoutPoints || []).filter(point => point.layoutPlanId !== planId)
    };
  }

  function fitDrawingRect(containerWidth, containerHeight, drawingWidth, drawingHeight) {
    const scale = Math.min(containerWidth / drawingWidth, containerHeight / drawingHeight);
    const width = drawingWidth * scale;
    const height = drawingHeight * scale;
    return { left: (containerWidth - width) / 2, top: (containerHeight - height) / 2, width, height };
  }

  function screenFromRelative(point, rect) {
    return { x: rect.left + point.relativeX * rect.width, y: rect.top + point.relativeY * rect.height };
  }

  return {
    MAX_FILE_SIZE,
    MANUAL_POSITION_NOTICE,
    allowedFiles,
    fileExtension,
    validateFileMetadata,
    isInsideDrawing,
    relativeFromPointer,
    drawingFromRelative,
    selectPdfPage,
    nextPointId,
    hasDuplicatePointId,
    clampRelative,
    clone,
    exportDescriptor,
    removePlanRecords,
    fitDrawingRect,
    screenFromRelative
  };
});
