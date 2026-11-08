(function () {
  "use strict";

  const core = window.LayoutPlanCore;
  const pointTypes = {
    ground_settlement: { label: "Ground Settlement Marker", prefix: "SM", symbol: "●", color: "#1769aa" },
    building_settlement: { label: "Building Settlement Marker", prefix: "BSM", symbol: "■", color: "#177245" },
    utility: { label: "Utility Monitoring Point", prefix: "UMP", symbol: "▲", color: "#dc6b20" },
    tilting: { label: "Tilting Marker", prefix: "TM", symbol: "◆", color: "#7448a8" },
    vibration: { label: "Vibration Check Point", prefix: "VCP", symbol: "★", color: "#b04432" },
    standpipe: { label: "Standpipe", prefix: "SP", symbol: "◎", color: "#0f8b8d" },
    piezometer: { label: "Piezometer", prefix: "PZ", symbol: "⬡", color: "#8c6a15" },
    survey_control: { label: "Survey Control Point", prefix: "CP", symbol: "✚", color: "#334e68" }
  };

  const $ = id => document.getElementById(id);
  const ui = {};
  let activePlanId = "";
  let selectedPointId = "";
  let draftPoint = null;
  let placementMode = false;
  let stage;
  let backgroundLayer;
  let pointLayer;
  let drawingNode;
  let backgroundSource;
  let histories = new Map();
  let saveTimer;
  let resizeTimer;
  let backgroundRequest = 0;
  let saveGeneration = 0;
  let uploading = false;

  /** @typedef {{id:string,projectId:string,projectName:string,drawingTitle:string,drawingNumber?:string,revision?:string,originalFileName:string,fileType:"pdf"|"png"|"jpg"|"jpeg",fileUrl:string,selectedPage?:number,originalWidth:number,originalHeight:number,createdAt:string,createdBy:string}} LayoutPlan */
  /** @typedef {{id:string,layoutPlanId:string,pointId:string,pointType:keyof pointTypes,relativeX:number,relativeY:number,description?:string,installationStatus:"proposed"|"installed"|"inactive"|"removed",installedDate?:string,alertLevel?:number,alarmLevel?:number,unit?:string,remarks?:string,createdAt:string,createdBy:string,updatedAt:string,updatedBy:string}} MonitoringPoint */

  function bindUi() {
    ["planList", "planUploadForm", "planProjectName", "planDrawingTitle", "planDrawingNumber", "planRevision", "planFileInput", "planUploadMessage", "planEmpty", "planViewerShell", "activePlanTitle", "activePlanMeta", "planSaveStatus", "deletePlanButton", "pdfPages", "addPlanPoint", "placementPointType", "zoomOutPlan", "zoomInPlan", "fitPlan", "resetPlanView", "undoPlan", "redoPlan", "exportPlanPng", "planPointSearch", "planTypeFilter", "planStatusFilter", "showPlanLabels", "planStageWrap", "planStage", "planLoading", "planLegend", "pointPanelEmpty", "planPointForm", "pointFormHeading", "closePointForm", "planPointId", "planPointType", "planPointDescription", "planPointStatus", "planPointDate", "planPointAlert", "planPointAlarm", "planPointUnit", "planPointRemarks", "planPointMessage", "duplicatePlanPoint", "deletePlanPoint", "zoomToPlanPoint"].forEach(id => { ui[id] = $(id); });
  }

  function hasPointDraft() { return Boolean(draftPoint || window.monitoringDrafts?.has(ui.planPointForm)); }
  function preventPointDraftLoss() {
    if (!hasPointDraft()) return false;
    window.monitoringDrafts?.warn("Unsaved layout-plan monitoring point. Save it or close the point form before changing the selection.");
    return true;
  }
  function clearPointDraft() { window.monitoringDrafts?.clear(ui.planPointForm); }

  function activePlan() { return state.layoutPlans.find(plan => plan.id === activePlanId); }
  function planPoints() { return state.layoutPoints.filter(point => point.layoutPlanId === activePlanId); }
  function now() { return new Date().toISOString(); }
  function makeId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function escapeHtml(value) { return String(value || "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }

  function populateTypes() {
    const options = Object.entries(pointTypes).map(([value, type]) => `<option value="${value}">${type.prefix} · ${type.label}</option>`).join("");
    ui.placementPointType.innerHTML = `<option value="">Select point type…</option>${options}`;
    ui.planPointType.innerHTML = options;
    ui.planTypeFilter.insertAdjacentHTML("beforeend", options);
    ui.planLegend.innerHTML = Object.entries(pointTypes).map(([, type]) => `<span class="legend-item"><i class="legend-symbol" aria-hidden="true">${type.symbol}</i>${type.prefix} · ${type.label}</span>`).join("");
  }

  function renderPlanList() {
    ui.planList.innerHTML = state.layoutPlans.length ? state.layoutPlans.map(plan => `<button class="plan-list-item ${plan.id === activePlanId ? "active" : ""}" type="button" data-plan-id="${escapeHtml(plan.id)}"><strong>${escapeHtml(plan.drawingTitle)}</strong><span>${escapeHtml([plan.drawingNumber, plan.revision && `Rev ${plan.revision}`].filter(Boolean).join(" · ") || plan.originalFileName)}</span></button>`).join("") : '<p class="empty">No layout plans uploaded.</p>';
    ui.deletePlanButton.disabled = !activePlanId || !canEdit();
  }

  function setSaveStatus(label, kind) {
    ui.planSaveStatus.textContent = label;
    ui.planSaveStatus.className = `save-status ${kind}`;
  }

  function autoSave() {
    if (!canEdit()) return;
    markStateDirty();
    const generation = ++saveGeneration;
    setSaveStatus("Unsaved", "unsaved");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      setSaveStatus("Saving…", "saving");
      try { const saved = await saveState(); if (generation === saveGeneration) setSaveStatus(saved ? "Saved" : "Unsaved", saved ? "saved" : "unsaved"); }
      catch { setSaveStatus("Unsaved", "unsaved"); }
    }, 180);
  }

  function snapshot() { return core.clone(state.layoutPoints.filter(point => point.layoutPlanId === activePlanId)); }
  function history() {
    if (!histories.has(activePlanId)) histories.set(activePlanId, { undo: [], redo: [] });
    return histories.get(activePlanId);
  }
  function remember() { const item = history(); item.undo.push(snapshot()); if (item.undo.length > 60) item.undo.shift(); item.redo = []; updateHistoryButtons(); }
  function restoreSnapshot(points) {
    state.layoutPoints = state.layoutPoints.filter(point => point.layoutPlanId !== activePlanId).concat(core.clone(points));
    selectedPointId = ""; draftPoint = null; renderPointForm(); renderPoints(); autoSave();
  }
  function undo() { if (preventPointDraftLoss()) return; const item = history(); if (!item.undo.length) return; item.redo.push(snapshot()); restoreSnapshot(item.undo.pop()); updateHistoryButtons(); }
  function redo() { if (preventPointDraftLoss()) return; const item = history(); if (!item.redo.length) return; item.undo.push(snapshot()); restoreSnapshot(item.redo.pop()); updateHistoryButtons(); }
  function updateHistoryButtons() { const item = activePlanId ? history() : { undo: [], redo: [] }; ui.undoPlan.disabled = !item.undo.length || !canEdit(); ui.redoPlan.disabled = !item.redo.length || !canEdit(); }

  async function fileToDataUrl(file) {
    return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error("The selected file could not be read.")); reader.readAsDataURL(file); });
  }
  async function uploadOriginal(file, dataUrl) {
    const validation = core.validateFileMetadata(file);
    if (!validation.valid) throw new Error(validation.error);
    try {
      const response = await trialRequest("/api/layout-files", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Project-Id": window.activeProjectId || "legacy" }, body: JSON.stringify({ name: file.name, mimeType: validation.mimeType, dataUrl }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Upload failed.");
      return result.fileUrl;
    } catch (error) {
      if (location.protocol !== "file:") throw error;
      return dataUrl;
    }
  }

  async function inspectFile(dataUrl, type) {
    if (!["png", "jpg", "jpeg"].includes(type)) throw new Error("Upload a PNG or JPG layout image.");
    dataUrl = dataUrl.replace(/^data:[^;]*;base64,/, "data:image/" + (type === "png" ? "png" : "jpeg") + ";base64,");
    MonitoringCore.imageDimensionsFromDataUrl(dataUrl);
    const image = await loadImage(dataUrl);
    MonitoringCore.validateImageDimensions(image.naturalWidth, image.naturalHeight);
    return { width: image.naturalWidth, height: image.naturalHeight, pageCount: 1 };
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      if (url.startsWith("data:")) {
        try { MonitoringCore.imageDimensionsFromDataUrl(url); } catch (error) { reject(error); return; }
      }
      const image = new Image();
      const finish = (error) => { clearTimeout(timer); image.onload = null; image.onerror = null; if (error) { image.src = ""; reject(error); } else resolve(image); };
      const timer = setTimeout(() => finish(new Error("The layout image timed out. Check your connection and reopen the plan.")), 30000);
      image.onload = () => finish();
      image.onerror = () => finish(new Error("The layout image could not be decoded. Reopen another plan or replace the damaged file."));
      image.src = url;
    });
  }

  async function handleUpload(event) {
    event.preventDefault();
    if (!canEdit() || uploading) return;
    if (preventPointDraftLoss()) return;
    if (saveBlocked) { ui.planUploadMessage.textContent = "Resolve the previous save failure before uploading another plan."; return; }
    const file = ui.planFileInput.files[0];
    const validation = core.validateFileMetadata(file);
    if (!validation.valid) { ui.planUploadMessage.textContent = validation.error; return; }
    uploading = true;
    ui.planUploadMessage.textContent = "Validating and preserving original file…";
    try {
      const dataUrl = await fileToDataUrl(file);
      const dimensions = await inspectFile(dataUrl, validation.fileType);
      const fileUrl = await uploadOriginal(file, dataUrl);
      const plan = {
        id: makeId(), projectId: "default-project", projectName: ui.planProjectName.value.trim(), drawingTitle: ui.planDrawingTitle.value.trim(),
        drawingNumber: ui.planDrawingNumber.value.trim(), revision: ui.planRevision.value.trim(), originalFileName: file.name,
        fileType: validation.fileType, fileUrl,
        pageCount: dimensions.pageCount, originalWidth: dimensions.width, originalHeight: dimensions.height, createdAt: now(), createdBy: currentUser.username
      };
      state.layoutPlans.push(plan);
      activePlanId = plan.id;
      if (!await saveState()) { ui.planUploadMessage.textContent = "Plan uploaded but register is unsaved. Keep this page open and resolve the save error."; return; }
      ui.planUploadForm.reset();
      ui.planProjectName.value = "Settlement Monitoring — Hong Kong";
      window.monitoringDrafts?.clear(ui.planUploadForm);
      renderPlanList(); await openPlan(plan.id);
    } catch (error) { ui.planUploadMessage.textContent = error.message || "The layout plan could not be uploaded."; }
    finally { uploading = false; }
  }

  async function openPlan(planId) {
    if (preventPointDraftLoss()) return;
    activePlanId = planId; selectedPointId = ""; draftPoint = null; placementMode = false;
    const selectionChanged = state.activeLayoutPlanId !== planId;
    state.activeLayoutPlanId = planId;
    renderPlanList(); renderPointForm(); updateHistoryButtons();
    const plan = activePlan();
    if (!plan) return;
    ui.planEmpty.classList.add("hidden"); ui.planViewerShell.classList.remove("hidden");
    ui.activePlanTitle.textContent = plan.drawingTitle;
    ui.activePlanMeta.textContent = [plan.projectName, plan.drawingNumber, plan.revision && `Rev ${plan.revision}`, plan.originalFileName].filter(Boolean).join(" · ");
    if (selectionChanged) autoSave();
    await loadPlanBackground();
  }

  async function deleteActivePlan() {
    const plan = activePlan();
    if (preventPointDraftLoss()) return;
    if (!plan || !canEdit() || !confirm(`Delete layout plan "${plan.drawingTitle}" and all of its monitoring points?`)) return;
    setSaveStatus("Deleting…", "saving");
    try {
      clearTimeout(saveTimer);
      ++saveGeneration; ++backgroundRequest;
      const previous = { layoutPlans: state.layoutPlans, layoutPoints: state.layoutPoints, activeLayoutPlanId: state.activeLayoutPlanId };
      Object.assign(state, core.removePlanRecords(state, plan.id), { activeLayoutPlanId: "" });
      if (!await saveState()) {
        Object.assign(state, previous);
        throw new Error("The layout register could not be saved. The original image has not been deleted.");
      }
      if (plan.fileUrl && plan.fileUrl.startsWith("/uploads/")) {
        try {
          const storedName = encodeURIComponent(plan.fileUrl.split("/").pop());
          const response = await trialRequest(`/api/layout-files/${storedName}`, { method: "DELETE", credentials: "same-origin", headers: { "X-Project-Id": window.activeProjectId || "legacy" } });
          if (!response.ok && response.status !== 404) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.error || "File cleanup request failed.");
          }
        } catch (error) {
          // Register removal is already durable. Do not leave the viewer attached to
          // a deleted record or describe an original-file cleanup failure as unsaved data.
          ui.planUploadMessage.textContent = `Plan removed from the register. Original image cleanup could not be confirmed: ${error.message} Ask the administrator to review the remaining file.`;
        }
      }
      const remaining = core.removePlanRecords(state, plan.id);
      state.layoutPlans = remaining.layoutPlans;
      state.layoutPoints = remaining.layoutPoints;
      histories.delete(plan.id);
      activePlanId = ""; selectedPointId = ""; draftPoint = null; placementMode = false;
      state.activeLayoutPlanId = "";
      if (stage) { stage.destroy(); stage = null; }
      backgroundSource = null;
      ui.planLoading.classList.add("hidden");
      setSaveStatus("Saved", "saved");
      renderPlanList();
      if (state.layoutPlans.length) await openPlan(state.layoutPlans[0].id);
      else { ui.planViewerShell.classList.add("hidden"); ui.planEmpty.classList.remove("hidden"); }
    } catch (error) {
      setSaveStatus("Unsaved", "unsaved");
      alert(error.message || "The layout plan could not be deleted.");
    }
  }

  async function loadPlanBackground() {
    const plan = activePlan(); if (!plan) return;
    const request = ++backgroundRequest;
    backgroundSource = null;
    ui.addPlanPoint.disabled = true;
    if (stage) { stage.destroy(); stage = null; }
    ui.planStage.innerHTML = "";
    ui.planLoading.classList.remove("hidden");
    try {
      if (plan.fileType === "pdf") throw new Error("This legacy PDF plan cannot be opened. Convert the original to PNG or JPG and upload it again.");
      MonitoringCore.validateImageDimensions(plan.originalWidth, plan.originalHeight);
      ui.pdfPages.classList.add("hidden");
      const image = await loadImage(plan.fileUrl);
      if (request !== backgroundRequest || activePlanId !== plan.id) return;
      MonitoringCore.validateImageDimensions(image.naturalWidth, image.naturalHeight);
      backgroundSource = image;
      plan.originalWidth = backgroundSource.naturalWidth; plan.originalHeight = backgroundSource.naturalHeight;
      createStage();
    } catch (error) {
      if (request === backgroundRequest) ui.planStage.innerHTML = `<div class="plan-empty"><strong>Drawing unavailable</strong><span>${escapeHtml(error.message)}</span></div>`;
    } finally { if (request === backgroundRequest) ui.planLoading.classList.add("hidden"); }
  }

  function createStage() {
    // Hidden containers have no usable viewport. Decode safely, defer canvas.
    if (!backgroundSource || !Number.isFinite(ui.planStageWrap.clientWidth) || !Number.isFinite(ui.planStageWrap.clientHeight) || ui.planStageWrap.clientWidth <= 48 || ui.planStageWrap.clientHeight <= 48) return;
    if (!window.Konva) { ui.planStage.innerHTML = '<div class="plan-empty"><strong>Interactive viewer unavailable</strong><span>Check the internet connection and reload.</span></div>'; return; }
    if (stage) stage.destroy(); ui.planStage.innerHTML = "";
    stage = new Konva.Stage({ container: "planStage", width: ui.planStageWrap.clientWidth, height: ui.planStageWrap.clientHeight, draggable: true });
    backgroundLayer = new Konva.Layer({ listening: false }); pointLayer = new Konva.Layer();
    drawingNode = new Konva.Image({ image: backgroundSource, x: 0, y: 0, width: activePlan().originalWidth, height: activePlan().originalHeight, listening: false });
    backgroundLayer.add(drawingNode); stage.add(backgroundLayer); stage.add(pointLayer);
    stage.on("wheel", handleWheel); stage.on("click tap", handleStageClick);
    fitToScreen(); renderPoints();
    ui.addPlanPoint.disabled = !canEdit();
  }

  function fitToScreen() {
    if (!stage || !activePlan()) return;
    const plan = activePlan(); const padding = 24;
    const scale = Math.min((stage.width() - padding * 2) / plan.originalWidth, (stage.height() - padding * 2) / plan.originalHeight);
    if (!Number.isFinite(scale) || scale <= 0) return;
    stage.scale({ x: scale, y: scale }); stage.position({ x: (stage.width() - plan.originalWidth * scale) / 2, y: (stage.height() - plan.originalHeight * scale) / 2 }); stage.batchDraw(); renderPoints();
  }
  function resetView() { if (!stage) return; stage.scale({ x: 1, y: 1 }); stage.position({ x: 16, y: 16 }); stage.batchDraw(); renderPoints(); }
  function zoomAt(factor, pointer) {
    if (!stage) return; const old = stage.scaleX(); const next = Math.max(.08, Math.min(8, old * factor)); const anchor = pointer || { x: stage.width() / 2, y: stage.height() / 2 };
    if (!Number.isFinite(old) || old <= 0) return;
    const drawing = { x: (anchor.x - stage.x()) / old, y: (anchor.y - stage.y()) / old };
    stage.scale({ x: next, y: next }); stage.position({ x: anchor.x - drawing.x * next, y: anchor.y - drawing.y * next }); stage.batchDraw(); renderPoints();
  }
  function handleWheel(event) { event.evt.preventDefault(); zoomAt(event.evt.deltaY > 0 ? .9 : 1.1, stage.getPointerPosition()); }

  function filteredPoints() {
    const query = ui.planPointSearch.value.trim().toLowerCase();
    return planPoints().filter(point => (ui.planTypeFilter.value === "all" || point.pointType === ui.planTypeFilter.value) && (ui.planStatusFilter.value === "all" || point.installationStatus === ui.planStatusFilter.value) && (!query || point.pointId.toLowerCase().includes(query)));
  }

  function symbolFor(point, selected, draft) {
    if (!stage || !Number.isFinite(stage.scaleX()) || stage.scaleX() <= 0) return null;
    const type = pointTypes[point.pointType]; const plan = activePlan(); const position = core.drawingFromRelative(point, { width: plan.originalWidth, height: plan.originalHeight }); const scale = stage.scaleX();
    const group = new Konva.Group({ x: position.x, y: position.y, draggable: !draft && canEdit(), name: "monitoring-point", id: point.id });
    const size = 13 / scale; const fontSize = 18 / scale;
    const halo = new Konva.Circle({ radius: (selected ? 18 : 15) / scale, fill: selected ? "rgba(255,174,64,.35)" : "rgba(255,255,255,.82)", stroke: selected ? "#dc6b20" : "#ffffff", strokeWidth: 2 / scale });
    const symbol = new Konva.Text({ text: type.symbol, x: -fontSize / 2, y: -fontSize / 2, width: fontSize, height: fontSize, align: "center", verticalAlign: "middle", fontSize, fontStyle: "bold", fill: type.color, listening: false });
    group.add(halo, symbol);
    if (ui.showPlanLabels.checked) group.add(new Konva.Label({ x: size + 5 / scale, y: -12 / scale, listening: false }).add(new Konva.Tag({ fill: "rgba(255,255,255,.92)", stroke: "#8296a8", strokeWidth: 1 / scale, cornerRadius: 3 / scale })).add(new Konva.Text({ text: point.pointId, fontSize: 12 / scale, fontStyle: "bold", fill: "#132f46", padding: 4 / scale })));
    if (!draft) {
      group.on("click tap", event => { event.cancelBubble = true; if (selectedPointId === point.id && hasPointDraft()) return; if (preventPointDraftLoss()) return; selectedPointId = point.id; draftPoint = null; renderPointForm(); renderPoints(); });
      let blockedDrag = false;
      group.on("dragstart", () => {
        blockedDrag = preventPointDraftLoss();
        if (blockedDrag) { group.stopDrag(); group.position(position); return; }
        remember();
      });
      group.on("dragend", () => {
        if (blockedDrag) { blockedDrag = false; group.position(position); group.getLayer()?.batchDraw(); return; }
        point.relativeX = core.clampRelative(group.x() / plan.originalWidth); point.relativeY = core.clampRelative(group.y() / plan.originalHeight); point.updatedAt = now(); point.updatedBy = currentUser.username; renderPoints(); autoSave();
      });
    }
    return group;
  }

  function renderPoints() {
    if (!pointLayer || !stage || !activePlan()) return;
    if (!Number.isFinite(stage.scaleX()) || stage.scaleX() <= 0) return;
    pointLayer.destroyChildren();
    filteredPoints().forEach(point => pointLayer.add(symbolFor(point, point.id === selectedPointId, false)));
    if (draftPoint) pointLayer.add(symbolFor(draftPoint, true, true));
    pointLayer.batchDraw();
  }

  function beginPlacement() {
    if (!canEdit() || !activePlan()) return;
    if (!stage || !backgroundSource) { ui.planPointMessage.textContent = "The drawing is not ready. Reopen a valid layout image before adding a point."; return; }
    if (preventPointDraftLoss()) return;
    if (!ui.placementPointType.value) { alert("Select a monitoring-point type before placement."); ui.placementPointType.focus(); return; }
    placementMode = true; draftPoint = null; selectedPointId = ""; stage.draggable(false); ui.planStageWrap.classList.add("placement"); ui.addPlanPoint.textContent = "Cancel placement"; renderPointForm();
  }
  function cancelPlacement(confirmed = false) {
    if (!confirmed && hasPointDraft() && !confirm("Discard the unsaved layout-plan monitoring point?")) return;
    clearPointDraft();
    placementMode = false; draftPoint = null; if (stage) stage.draggable(true); ui.planStageWrap.classList.remove("placement"); ui.addPlanPoint.textContent = "Add point"; renderPointForm(); renderPoints();
  }
  function handleStageClick(event) {
    if (!placementMode || event.target !== stage) return;
    const plan = activePlan(); const pointer = stage.getPointerPosition();
    const relative = core.relativeFromPointer(pointer, { offsetX: stage.x(), offsetY: stage.y(), scale: stage.scaleX() }, { width: plan.originalWidth, height: plan.originalHeight });
    if (!relative) { ui.planPointMessage.textContent = "Choose a location inside the layout-plan boundary."; return; }
    const type = ui.placementPointType.value; const timestamp = now();
    draftPoint = { id: makeId(), layoutPlanId: plan.id, pointId: core.nextPointId(planPoints(), pointTypes[type].prefix), pointType: type, relativeX: relative.relativeX, relativeY: relative.relativeY, installationStatus: "proposed", createdAt: timestamp, createdBy: currentUser.username, updatedAt: timestamp, updatedBy: currentUser.username };
    placementMode = false; stage.draggable(true); ui.planStageWrap.classList.remove("placement"); ui.addPlanPoint.textContent = "Add point"; renderPointForm(); renderPoints(); setTimeout(() => ui.planPointId.focus(), 0);
  }

  function currentPoint() { return draftPoint || state.layoutPoints.find(point => point.id === selectedPointId); }
  function renderPointForm() {
    const point = currentPoint(); ui.pointPanelEmpty.classList.toggle("hidden", Boolean(point)); ui.planPointForm.classList.toggle("hidden", !point);
    if (!point) { clearPointDraft(); return; }
    ui.pointFormHeading.textContent = draftPoint ? "New monitoring point" : `Point ${point.pointId}`;
    ui.planPointId.value = point.pointId || ""; ui.planPointType.value = point.pointType; ui.planPointDescription.value = point.description || ""; ui.planPointStatus.value = point.installationStatus || "proposed"; ui.planPointDate.value = point.installedDate || ""; ui.planPointAlert.value = point.alertLevel ?? ""; ui.planPointAlarm.value = point.alarmLevel ?? ""; ui.planPointUnit.value = point.unit || ""; ui.planPointRemarks.value = point.remarks || ""; ui.planPointMessage.textContent = "";
    ui.duplicatePlanPoint.disabled = Boolean(draftPoint); ui.deletePlanPoint.textContent = draftPoint ? "Cancel point" : "Delete point";
    ui.planPointForm.querySelectorAll("input, select, textarea").forEach(control => { control.disabled = !canEdit(); });
    ui.planPointForm.querySelectorAll("button[type='submit'], #duplicatePlanPoint, #deletePlanPoint").forEach(control => { control.disabled = !canEdit(); });
    clearPointDraft();
  }

  function valuesFromForm(point) {
    return { ...point, pointId: ui.planPointId.value.trim(), pointType: ui.planPointType.value, description: ui.planPointDescription.value.trim(), installationStatus: ui.planPointStatus.value, installedDate: ui.planPointDate.value || undefined, alertLevel: ui.planPointAlert.value === "" ? undefined : Number(ui.planPointAlert.value), alarmLevel: ui.planPointAlarm.value === "" ? undefined : Number(ui.planPointAlarm.value), unit: ui.planPointUnit.value.trim(), remarks: ui.planPointRemarks.value.trim(), updatedAt: now(), updatedBy: currentUser.username };
  }
  function savePoint(event) {
    event.preventDefault(); if (!canEdit()) return; const point = currentPoint(); if (!point) return; const next = valuesFromForm(point);
    if (!next.pointId) { ui.planPointMessage.textContent = "Point ID is required."; return; }
    if (core.hasDuplicatePointId(planPoints(), next.pointId, draftPoint ? "" : point.id)) { ui.planPointMessage.textContent = "Point ID must be unique within this layout plan."; return; }
    remember();
    if (draftPoint) { state.layoutPoints.push(next); selectedPointId = next.id; draftPoint = null; } else Object.assign(point, next);
    clearPointDraft();
    renderPointForm(); renderPoints(); autoSave();
  }

  function duplicatePoint() {
    if (preventPointDraftLoss()) return;
    if (!canEdit()) return; const source = currentPoint(); if (!source || draftPoint) return; const type = pointTypes[source.pointType]; const timestamp = now(); remember();
    const relative = { relativeX: core.clampRelative(source.relativeX + .025), relativeY: core.clampRelative(source.relativeY + .025) };
    const copy = { ...core.clone(source), ...relative, id: makeId(), pointId: core.nextPointId(planPoints(), type.prefix), createdAt: timestamp, createdBy: currentUser.username, updatedAt: timestamp, updatedBy: currentUser.username };
    state.layoutPoints.push(copy); selectedPointId = copy.id; renderPointForm(); renderPoints(); autoSave();
  }
  function deletePoint() {
    if (!canEdit()) return;
    if (draftPoint) { cancelPlacement(); return; }
    const point = currentPoint(); if (!point || !confirm(`Delete monitoring point ${point.pointId}?`)) return; remember();
    clearPointDraft();
    state.layoutPoints = state.layoutPoints.filter(item => item.id !== point.id); selectedPointId = ""; renderPointForm(); renderPoints(); autoSave();
  }
  function closePointForm() {
    if (hasPointDraft() && !confirm("Discard the unsaved layout-plan monitoring point?")) return;
    clearPointDraft();
    if (draftPoint) cancelPlacement(true);
    selectedPointId = ""; renderPointForm(); renderPoints();
  }
  function zoomToPoint() { const point = currentPoint(); const plan = activePlan(); if (!point || !stage) return; const position = core.drawingFromRelative(point, { width: plan.originalWidth, height: plan.originalHeight }); const scale = Math.max(stage.scaleX(), 1.5); stage.scale({ x: scale, y: scale }); stage.position({ x: stage.width() / 2 - position.x * scale, y: stage.height() / 2 - position.y * scale }); stage.batchDraw(); renderPoints(); }

  function exportAnnotatedPlan() {
    if (typeof hasCapability === "function" && !hasCapability("report:export")) return;
    const plan = activePlan(); if (!plan || !backgroundSource) return;
    const exportInfo = core.exportDescriptor(plan, new Date());
    try {
      const footer = 190; const size = MonitoringCore.boundedImageExport(plan.originalWidth, plan.originalHeight, footer);
      const canvas = document.createElement("canvas"); canvas.width = size.width; canvas.height = size.height; const context = canvas.getContext("2d");
      if (!context) throw new Error("PNG canvas is unavailable. Try a smaller layout image or another browser.");
      context.scale(size.scale, size.scale);
      context.fillStyle = "white"; context.fillRect(0, 0, plan.originalWidth, plan.originalHeight + footer); context.drawImage(backgroundSource, 0, 0, plan.originalWidth, plan.originalHeight);
      const markerSize = Math.max(16, Math.min(plan.originalWidth, plan.originalHeight) / 55);
      filteredPoints().forEach(point => { const type = pointTypes[point.pointType]; const pos = core.drawingFromRelative(point, { width: plan.originalWidth, height: plan.originalHeight }); context.fillStyle = "rgba(255,255,255,.9)"; context.beginPath(); context.arc(pos.x, pos.y, markerSize, 0, Math.PI * 2); context.fill(); context.strokeStyle = type.color; context.lineWidth = 2; context.stroke(); context.fillStyle = type.color; context.font = `bold ${markerSize * 1.15}px sans-serif`; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(type.symbol, pos.x, pos.y); if (ui.showPlanLabels.checked) { context.textAlign = "left"; context.fillStyle = "#132f46"; context.font = `bold ${markerSize * .8}px sans-serif`; context.fillText(point.pointId, pos.x + markerSize + 4, pos.y); } });
      context.textAlign = "left"; context.textBaseline = "alphabetic"; context.fillStyle = "#132f46"; context.font = "bold 22px sans-serif"; context.fillText(exportInfo.projectName, 20, plan.originalHeight + 34); context.font = "16px sans-serif"; context.fillText([exportInfo.drawingTitle, exportInfo.drawingNumber, exportInfo.revision && `Rev ${exportInfo.revision}`].filter(Boolean).join(" · "), 20, plan.originalHeight + 62); context.fillText(`Exported ${new Date(exportInfo.exportDate).toLocaleString()}`, 20, plan.originalHeight + 88);
      context.font = "13px sans-serif"; let x = 20; Object.values(pointTypes).forEach(type => { context.fillStyle = type.color; context.fillText(`${type.symbol} ${type.prefix}`, x, plan.originalHeight + 118); x += 64; });
      context.fillStyle = "#654319"; context.font = "bold 13px sans-serif"; context.fillText("Monitoring point positions are marked manually and are diagrammatic.", 20, plan.originalHeight + 151); context.fillText("They do not represent verified survey coordinates.", 20, plan.originalHeight + 172);
      const link = document.createElement("a"); link.download = exportInfo.fileName; link.href = canvas.toDataURL(exportInfo.mimeType);
      if (!link.href.startsWith("data:image/png")) throw new Error("The browser could not encode the annotated PNG.");
      link.click();
      if (size.scale < 1) ui.planPointMessage.textContent = "PNG exported at " + size.width + " × " + size.height + " pixels to stay within the export resource limit. The original file and relative point positions are unchanged.";
    } catch (error) { ui.planPointMessage.textContent = "PNG export failed: " + error.message + " The original file and point positions are unchanged."; }
  }

  function bindEvents() {
    ui.planUploadForm.addEventListener("submit", handleUpload); ui.deletePlanButton.addEventListener("click", deleteActivePlan);
    ui.planList.addEventListener("click", event => { const button = event.target.closest("[data-plan-id]"); if (button) openPlan(button.dataset.planId); });
    ui.addPlanPoint.addEventListener("click", () => placementMode ? cancelPlacement() : beginPlacement()); ui.zoomInPlan.addEventListener("click", () => zoomAt(1.2)); ui.zoomOutPlan.addEventListener("click", () => zoomAt(.8)); ui.fitPlan.addEventListener("click", fitToScreen); ui.resetPlanView.addEventListener("click", resetView); ui.undoPlan.addEventListener("click", undo); ui.redoPlan.addEventListener("click", redo); ui.exportPlanPng.addEventListener("click", exportAnnotatedPlan);
    [ui.planPointSearch, ui.planTypeFilter, ui.planStatusFilter, ui.showPlanLabels].forEach(control => control.addEventListener("input", renderPoints));
    ui.planPointForm.addEventListener("submit", savePoint); ui.closePointForm.addEventListener("click", closePointForm); ui.duplicatePlanPoint.addEventListener("click", duplicatePoint); ui.deletePlanPoint.addEventListener("click", deletePoint); ui.zoomToPlanPoint.addEventListener("click", zoomToPoint);
    window.addEventListener("keydown", event => { if (document.querySelector("#layoutPlans.hidden")) return; if (event.key === "Escape") cancelPlacement(); if (event.key === "Delete" && selectedPointId && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) deletePoint(); if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); } });
    window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(refreshStage, 120); });
    if (window.ResizeObserver) new ResizeObserver(refreshStage).observe(ui.planStageWrap);
  }

  function refreshStage() {
    const width = ui.planStageWrap.clientWidth, height = ui.planStageWrap.clientHeight;
    if (!backgroundSource || width <= 48 || height <= 48) return;
    if (!stage) createStage();
    else { stage.size({ width, height }); fitToScreen(); }
  }

  function initialize() {
    bindUi(); populateTypes(); bindEvents();
    window.layoutPlanHasDraft = () => Boolean(draftPoint);
    window.refreshLayoutPlanViewer = () => { renderPlanList(); if (activePlan()) { if (backgroundSource) refreshStage(); else openPlan(activePlanId); } };
    const restorePlan = () => { renderPlanList(); if (state.layoutPlans.length) openPlan(state.activeLayoutPlanId || state.layoutPlans[0].id); };
    window.addEventListener('trial-project-restored', () => {
      backgroundRequest++; saveGeneration++;
      clearTimeout(saveTimer); clearTimeout(resizeTimer);
      if(stage)stage.destroy(); stage=null; backgroundSource=null; drawingNode=null;
      activePlanId=''; selectedPointId=''; draftPoint=null; placementMode=false; histories=new Map();
      renderPointForm(); renderPlanList(); restorePlan();
    });
    if (window.monitoringAppReady) restorePlan();
    else window.addEventListener("monitoring-app-ready", restorePlan, { once: true });
  }
  initialize();
})();
