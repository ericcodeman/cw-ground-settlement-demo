(function () {
  "use strict";
  const model = window.TrialShellModel;
  let mounted = false, currentModule = "today", mode = "overview", saving = 0, changed = false, exportRevision = "";
  let completeExportRevision = "", reportsChanged = false;
  const moduleButtons = new Map();
  const node = (tag, text, className) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (className) el.className = className; return el; };
  const moduleIconPaths = {
    today: "M2 11.5 12 3l10 8.5M5 10v11h5v-6h4v6h5V10",
    input: "M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10l-7-7v7h7M8 14h8m-8 3h5",
    review: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM7.5 12l3 3 6-6",
    analysis: "M3 21h18M5 17v-4m5 4V8m5 9V3m5 14V9",
    alerts: "M18 9a6 6 0 0 0-12 0c0 5-3 5-3 8h18c0-3-3-3-3-8M10 21h4",
    notifications: "M8 5h13M8 12h13M8 19h13M4 5h.01M4 12h.01M4 19h.01",
    reports: "M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10l-7-7v7h7M8 17v-3m4 3v-4m4 4v-2",
    settings: "M10 3h4l.5 2.6 2 .9L19 5l2 3-1.8 1.9v2.2L22 14l-1.5 3.5-2.6-.5-1.8 1.5-.6 2.5h-4l-.8-2.4-2-.9-2.4 1-2.2-3 1.6-2.1-.2-2.2L3 10l1.5-3.5 2.6.4L9 5.4 10 3Z M15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z"
  };
  const overviewIconPaths = {
    dashboard: "M4 4h16v16H4zM4 9h16M10 9v11",
    points: "M4 4h16v16H4zM10 9a2.5 2.5 0 1 0-5 0 2.5 2.5 0 1 0 5 0ZM6.3 12l1.2 2 1.2-2M13 9h4m-4 4h4m-4 4h4",
    layoutPlans: "M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5M12 7v10M7 12h10",
    projectLayout: "M12 3 3 8l9 5 9-5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"
  };
  function shellIcon(shape, className) {
    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");
    svg.setAttribute("class", className);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", shape);
    svg.append(path);
    return svg;
  }
  function moduleIcon(id) {
    return shellIcon(moduleIconPaths[id], "shell-module-icon");
  }
  function mount() {
    if (mounted || !window.monitoringAppReady) return;
    mounted = true;
    const narrowViewport = matchMedia("(max-width: 620px)");
    const shortViewport = matchMedia("(max-width: 1000px) and (max-height: 480px)");
    const isCompact = () => narrowViewport.matches || shortViewport.matches;
    document.documentElement.toggleAttribute("data-trial-compact", isCompact());
    const aside = document.querySelector("aside"), originalNav = aside.querySelector("nav"), buttons = [...originalNav.querySelectorAll(".nav-button[data-view]")];
    // Flatten navigation without losing inherited capability restrictions from its old groups.
    for (const button of buttons) {
      if (!button.dataset.capability) {
        const parent = button.parentElement.closest("[data-capability]");
        if (parent && originalNav.contains(parent)) button.dataset.capability = parent.dataset.capability;
      }
    }
    // Admin controls are scoped independently of daily observation/analysis pages.
    for (const view of ["markers", "pointMaintenance", "approach", "contacts", "quality", "trialRoleGuide"]) {
      const section=document.getElementById(view); if(section)section.dataset.capability="trial:configure";
      buttons.filter(b=>b.dataset.view===view).forEach(b=>b.dataset.capability="trial:configure");
    }
    buttons.filter(b=>b.dataset.view==="layoutPlans").forEach(b=>b.dataset.capability="project:read");
    for(const id of ["structureAssetForm", "structureConfigForm", "utilityAssetForm", "utilitySegmentForm"]){
      const form=document.getElementById(id); if(form)form.parentElement.dataset.capability="trial:configure";
    }
    for(const id of ["planUploadForm","addPlanPoint","undoPlan","redoPlan","duplicatePlanPoint","deletePlanPoint"]){const el=document.getElementById(id);if(el)el.dataset.capability="trial:configure";}
    document.getElementById("createProjectButton").dataset.capability="trial:configure";
    document.getElementById("trialToolbar").querySelector('input[type=file]').closest('label').dataset.capability="trial:configure";
    document.getElementById("trialToolbar").querySelector('button[onclick^="if("]').dataset.capability="trial:configure";
    document.getElementById("trialToolbar").querySelector('button[onclick="exportTrialPackage()"]').dataset.capability="report:export";
    const observationNotice=node("p","Staff can record Current survey observations against an existing baseline. Ask an Administrator to create or correct a baseline.");observationNotice.id="trialBaselineNotice";document.getElementById("structureObservationForm").prepend(observationNotice);
    const projectForm=document.getElementById("trialProjectForm");let metadataSaving=false;
    projectForm.addEventListener("submit",async event=>{
      event.preventDefault();if(!hasCapability("trial:configure")||metadataSaving)return;
      const message=document.getElementById("trialProjectMessage");let values;
      try{values=BrowserTrial.validateProjectMetadata(Object.fromEntries(new FormData(projectForm)));}catch(error){message.textContent=error.message;return;}
      const signature=formSignature(projectForm);metadataSaving=true;message.textContent="Saving project metadata…";
      state.projectName=values.name;state.browserProjectMeta={...state.browserProjectMeta,code:values.code,description:values.description};
      try{if(await saveState()){finishSubmittedForm(projectForm,signature,"project metadata");await loadProjects();renderAll();message.textContent="Project metadata saved in this trial session.";}else message.textContent="Project metadata not saved. Keep the form and resolve the save error.";}catch(error){message.textContent=error.message;}finally{metadataSaving=false;}
    });
    const primary = node("nav", null, "shell-primary"); primary.id = "shellPrimary"; primary.setAttribute("aria-label", "Primary modules");
    for (const module of model.modules) {
      const button = node("button"); button.type = "button"; button.dataset.module = module.id;
      button.append(moduleIcon(module.id), node("span", module.label, "shell-module-label"));
      if (["alerts", "review", "notifications"].includes(module.id)) {
        const badge = node("span", null, "shell-badge");

        badge.setAttribute("role", "img");
        button.append(badge);
      }
      button.addEventListener("click", () => {
        const target = module.views.find(view => available().includes(view));
        if (target) { currentModule = module.id; openFunction(target); }
      });
      moduleButtons.set(module.id, button); primary.append(button);
    }
    originalNav.before(primary);
    const context = node("section", null, "shell-context"); context.setAttribute("aria-label", "Module functions");
    const notice = node("p"); notice.id = "shellModuleNotice";
    const rail = node("nav"); rail.id = "shellFunctionRail"; rail.setAttribute("aria-label", "Available module functions");
    const adminRail=node("nav");adminRail.id="shellAdminSections";adminRail.setAttribute("aria-label","Administration sections");
    let adminSection="projects";
    for(const section of model.adminSections){const b=node("button",section.label,"button");b.type="button";b.dataset.adminSection=section.id;b.addEventListener("click",()=>{const target=section.views.find(v=>available().includes(v));if(target){adminSection=section.id;currentModule="settings";openFunction(target);}});adminRail.append(b);}
    context.append(notice, adminRail, rail);
    for (const button of buttons) {
      const id = button.dataset.focus === "project-layout" ? "projectLayout"
        : button.dataset.focus ? null : button.dataset.view;
      const shape = overviewIconPaths[id];
      const glyph = shape && button.querySelector(':scope > span[aria-hidden="true"]');
      if (glyph) {
        glyph.classList.add("shell-overview-glyph");
        glyph.replaceChildren(shellIcon(shape, "shell-overview-icon"));
      }
      rail.append(button);
    }
    const appearance = document.getElementById("appearanceButton"); originalNav.replaceChildren(appearance); originalNav.setAttribute("aria-label", "Appearance");
    const topbar = document.querySelector(".topbar"), toolbar = document.getElementById("trialToolbar");
    const dashboardStorage = node("span", "Refresh clears trial data", "dashboard-storage-note");
    toolbar.querySelector(".shell-trial-notice").after(dashboardStorage);
    const transfer = node("details", null, "shell-transfer");
    const transferControls = node("div", null, "shell-transfer-controls");
    transfer.append(node("summary", "Local data controls"), transferControls);
    const dataNotice = document.getElementById("trialDataNotice");
    const detailedNotice = node("p", dataNotice.textContent, "shell-transfer-detail");
    dataNotice.textContent = "Project JSON excludes report snapshots and PDFs. Not a complete backup.";
    dataNotice.removeAttribute("style");
    transferControls.append(toolbar.querySelector('button[onclick^="if("]'), toolbar.querySelector('button[onclick="exportTrialPackage()"]'),
      toolbar.querySelector('input[type=file]').closest("label"), dataNotice,
      document.getElementById("trialDataStatus"));
    toolbar.querySelector(".shell-trial-limits").append(detailedNotice);
    transfer.open = !isCompact();
    let dashboardActive = false, dashboardTransferOpen = false;
    toolbar.append(transfer);
    topbar.after(toolbar); toolbar.after(context);
    context.after(document.getElementById("trialAnalysisFilters"));
    const roleLabel = document.getElementById("trialRole").closest("label"); roleLabel.classList.add("shell-mode"); document.querySelector(".topbar-actions").prepend(roleLabel);
    const modeLabel = node("label", "Work mode", "shell-mode"), select = node("select"); select.id = "shellWorkMode";
    for (const [id, label] of [["overview", "Overview"], ["surveyor", "Surveyor"], ["engineer", "Engineer"]]) { const option = node("option", label); option.value = id; select.append(option); }
    modeLabel.append(select); roleLabel.before(modeLabel);
    select.addEventListener("change", () => {
      if (qualityPreviewOpen || projectChangeBlocked()) { select.value = mode; return; }
      mode = select.value;
      try { localStorage.setItem(modeKey(), mode); } catch (_) { /* Preference only; never a data save. */ }
      const destination = model.landing(mode, landingViews());
      currentModule = moduleFor(destination);
      openFunction(destination);
    });
    const add = node("button", "+ Add reading", "button primary shell-add"); add.id = "shellAddReading"; add.type = "button";
    add.addEventListener("click", () => { currentModule = "input"; openFunction("records"); els.readingValue.focus(); });
    modeLabel.before(add);
    const footer = aside.querySelector(".system-indicator"); footer.className = "shell-status"; footer.id = "shellPersistenceStatus";
    const sessionStatus = node("p"); sessionStatus.id = "shellSessionStatus"; sessionStatus.setAttribute("role", "status"); toolbar.append(sessionStatus);
    const initialRevision = BrowserTrial.revision();
    const activate = activateView;
    activateView = function (view, options = {}) {
      activate(view, options);
      const visible = buttons.find(b => document.getElementById(b.dataset.view) && !document.getElementById(b.dataset.view).classList.contains("hidden") && eligible(b));
      if (visible) sync(visible.dataset.view);
    };
    const render = renderAll; renderAll = function () { render(); refresh(); };
    const permissions = applyPermissions; applyPermissions = function () { permissions(); refresh(); };
    const save = saveState; saveState = async function (...args) {
      saving++; status();
      try { return await save(...args); } finally { saving--; status(); }
    };
    const exportData = BrowserTrial.exportData; BrowserTrial.exportData = function () {
      const bytes = exportData(); exportRevision = BrowserTrial.revision(); status(); return bytes;
    };
    restoreNavigationPreference = function () {
      mode = readMode(); select.value = mode;
      let saved;
      try { saved = JSON.parse(localStorage.getItem(navigationStorageKey) || "null"); } catch (_) {}
      const target = model.restore(saved, landingViews(), mode); currentModule = moduleFor(target.viewId);
      if (target.focus && !buttons.some(b => eligible(b) && b.dataset.view === target.viewId && (b.dataset.focus || "") === target.focus)) target.focus = "";
      activateView(target.viewId, { focus: target.focus, persist: false, scroll: false });
    };
    window.addEventListener("trial-data-changed", () => { changed = true; refresh(); });
    window.addEventListener("trial-report-archived", () => { completeExportRevision = ""; reportsChanged = true; status(); });
    window.addEventListener("trial-complete-backup-exported", () => { completeExportRevision = BrowserTrial.revision(); reportsChanged = false; status(); });
    window.addEventListener("monitoring-app-ready", refresh);
    function eligible(button) { return !button.classList.contains("permission-hidden") && !button.classList.contains("release-hidden"); }
    function available() { return buttons.filter(eligible).map(b => b.dataset.view); }
    function landingViews() { const allowed = available(); return isCompact() ? model.compactViews(allowed) : allowed; }
    function moduleFor(view, preferred) { return (isCompact() ? model.compactModuleFor(view, preferred) : null) || model.moduleFor(view, preferred); }
    function openFunction(view) {
      const button = buttons.find(b => b.dataset.view === view && !b.dataset.focus && eligible(b));
      if (button) button.click();
    }
    function modeKey() { return "cw-trial-shell-work-mode-" + currentUser.role; }
    function readMode() {
      try { const value = localStorage.getItem(modeKey()); if (["overview", "surveyor", "engineer"].includes(value)) return value; } catch (_) {}
      return currentUser.role === "project_staff" ? "surveyor" : "overview";
    }
    function status() {
      const revision = BrowserTrial.revision();
      if (saveBlocked) footer.textContent = "Save failed · recover input before leaving";
      else if (saving || hasUnsavedChanges) footer.textContent = "Saving / pending in this session";
      else if (completeExportRevision === revision) footer.textContent = "Complete backup download requested";
      else if (reportsChanged) footer.textContent = "Session includes report changes · export complete backup if needed";
      else if (exportRevision === revision) footer.textContent = "Project JSON download requested · PDFs excluded";
      else if (changed || revision !== initialRevision) footer.textContent = "Session changes · export data if needed";
      else footer.textContent = "Session memory · refresh resets data";
      sessionStatus.textContent = footer.textContent;
    }
    const qualityWorkspace = document.getElementById("qualityWorkspace");
    const qualitySettings = document.getElementById("quality");
    const qualityReview = document.getElementById("trialQualityReviewHost");
    function sync(view) {
      const onDashboard = view === "dashboard";
      if (dashboardActive !== onDashboard) {
        if (dashboardActive) dashboardTransferOpen = transfer.open;
        dashboardActive = onDashboard;
        transfer.open = onDashboard ? dashboardTransferOpen : !isCompact();
      }
      document.documentElement.toggleAttribute("data-trial-dashboard", onDashboard);
      const qualityHost = view === "trialDataReview" ? qualityReview : qualitySettings;
      if (qualityWorkspace.parentElement !== qualityHost) qualityHost.append(qualityWorkspace);
      currentModule = moduleFor(view, currentModule) || "today";
      const module = model.modules.find(m => m.id === currentModule);
      for (const [id, button] of moduleButtons) {
        button.hidden = (isCompact() && !model.compactModules.includes(id)) || (id === "settings" && !hasCapability("trial:configure")) || !model.modules.find(m => m.id === id).views.some(v => available().includes(v));
        if (id === currentModule) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
      }
      adminRail.hidden=currentModule!=="settings";
      if(currentModule==="settings")adminSection=model.adminSectionFor(view)||adminSection;
      for(const b of adminRail.children){if(b.dataset.adminSection===adminSection)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");}
      const views=currentModule==="settings"?model.adminSections.find(s=>s.id===adminSection).views:module.views;
      for (const button of buttons) button.hidden = !views.includes(button.dataset.view) || (currentModule === "analysis" && button.dataset.view === "utilityRegister");
      notice.textContent = currentModule === "settings" && currentUser.role !== "admin" ? "Settings available to your role. Work modes do not grant additional access." : currentModule === "analysis" ? "Filters and source rules apply to the selected analysis page." : currentModule === "input" ? "Select the observation form. Your role controls which actions are available." : currentModule === "alerts" ? "Select Ground, UU or Structure follow-up. Closing a workflow does not clear engineering severity." : module.label;
      if (isCompact() && !model.compactModules.includes(currentModule)) notice.textContent = "This screen remains open. Use Today, Data input or Alerts and actions to return to the phone workspace.";
      const label = moduleButtons.get("settings").querySelector(".shell-module-label"); label.textContent = currentUser.role === "admin" ? "Administration" : "Settings · existing access";
      add.hidden = !canEdit();
      transfer.hidden = !hasCapability("report:export");
      window.TrialAnalysis?.activate(currentModule === "analysis" ? view : null);
      refresh();
    }
    function refresh() {
      if (!mounted) return;
      if(!metadataSaving&&!formDrafts.has(projectForm)){
        projectForm.elements.name.value=state.projectName||"";projectForm.elements.code.value=state.browserProjectMeta?.code||"";projectForm.elements.description.value=state.browserProjectMeta?.description||"";clearFormDraft(projectForm);
      }
      document.getElementById("trialBaselineNotice").hidden=hasCapability("trial:configure");
      const kind=document.querySelector('#structureObservationForm [name="kind"]');
      if(kind){const option=kind.querySelector('option[value="baseline"]');if(option)option.disabled=!hasCapability("trial:configure");}
      const source = BrowserTrial.getState(), counts = model.summary(source);
      const ground = moduleButtons.get("alerts").querySelector(".shell-badge"), canViewGround = hasCapability("followup:view");
      ground.textContent = canViewGround ? "G " + counts.groundPending : "—";
      ground.setAttribute("aria-label", canViewGround ? counts.groundPending + " Ground follow-ups pending closure; excludes UU and Structure" : "Ground follow-up details restricted for this role"); ground.title = ground.getAttribute("aria-label");
      const reviewBadge = moduleButtons.get("review").querySelector(".shell-badge");
      const pending = canEdit() ? BrowserTrial.groundReviewPending() : null;
      reviewBadge.textContent = pending ?? "—";
      reviewBadge.setAttribute("aria-label", pending == null ? "Observation review restricted for this role" : pending + " unreviewed Ground revisions");
      reviewBadge.title = reviewBadge.getAttribute("aria-label");
      const notificationBadge = moduleButtons.get("notifications").querySelector(".shell-badge");
      const noticeCount = BrowserTrial.notificationSummary().overdue;
      notificationBadge.textContent = noticeCount ?? "—";
      notificationBadge.setAttribute("aria-label", noticeCount == null ? "Notification deadline not configured" : noticeCount + " notifications overdue in simulation");
      notificationBadge.title = notificationBadge.getAttribute("aria-label");
      window.trialNotificationRefresh?.();
      if (currentModule === "review") void window.trialGroundReviewRefresh?.();
      window.trialWorkbenchRefresh?.();
      window.renderTrialGroundReportOptions?.();
      status();
    }
    function updateViewport() {
      const wasCompact = document.documentElement.hasAttribute("data-trial-compact");
      document.documentElement.toggleAttribute("data-trial-compact", isCompact());
      if (wasCompact !== isCompact() && !dashboardActive) transfer.open = !isCompact();
      const view = buttons.find(button => {
        const section = document.getElementById(button.dataset.view);
        return section && !section.classList.contains("hidden") && eligible(button);
      })?.dataset.view;
      if (!view) return;
      if (isCompact() && !model.compactModuleFor(view, currentModule) && !qualityPreviewOpen && !projectChangeBlocked()) {
        currentModule = "today";
        activateView("dashboard", { persist: false, scroll: false });
      } else sync(view);
    }
    narrowViewport.addEventListener("change", updateViewport);
    shortViewport.addEventListener("change", updateViewport);
    window.TrialShell = { ready: true };
    applyPermissions(); restoreNavigationPreference(); refresh();
  }
  window.addEventListener("monitoring-app-ready", mount);
  mount();
})();
