(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TrialShellModel = api;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
  "use strict";
  const modules = [
    { id: "today", label: "Today / overview", views: ["dashboard", "points", "layoutPlans"] },
    { id: "input", label: "Data input", views: ["records", "structureRecords", "utilityReviews", "structurePreview"] },
    { id: "review", label: "Data review", views: ["trialDataReview"] },
    { id: "analysis", label: "Analysis", views: ["trends", "contours", "utilityReviews", "structureAssessments", "utilityRegister"] },
    { id: "alerts", label: "Alerts and actions", views: ["followups", "utilityReviews", "structureAssessments"] },
    { id: "notifications", label: "Notification tracking", views: ["trialNotifications"] },
    { id: "reports", label: "Reports", views: ["reports", "dailyReview"] },
    { id: "settings", label: "Administration", views: ["markers", "layoutPlans", "utilityRegister", "approach", "pointMaintenance", "contacts", "quality", "users", "structureRecords", "structureAssessments", "utilityReviews", "trialRoleGuide", "trialProjectSettings"] }
  ].map(m => Object.freeze({ ...m, views: Object.freeze(m.views) }));
  Object.freeze(modules);
  const compactModules = Object.freeze(["today", "input", "alerts"]);
  const adminSections = [
    { id: "projects", label: "Projects and layouts", views: ["trialProjectSettings", "layoutPlans"] },
    { id: "points", label: "Points and baselines", views: ["markers", "pointMaintenance", "structureRecords", "utilityRegister"] },
    { id: "criteria", label: "Monitoring criteria", views: ["approach", "structureAssessments", "utilityReviews"] },
    { id: "quality", label: "Data quality rules", views: ["quality"] },
    { id: "contacts", label: "Contacts and notification rules", views: ["contacts"] },
    { id: "users", label: "Users and permissions", views: ["trialRoleGuide"] }
  ];
  function adminSectionFor(view) { return adminSections.find(s => s.views.includes(view))?.id; }
  function moduleFor(view, preferred) {
    if (modules.some(m => m.id === preferred && m.views.includes(view))) return preferred;
    return modules.find(m => m.views.includes(view))?.id || null;
  }
  function compactModuleFor(view, preferred) {
    const supported = modules.filter(module => compactModules.includes(module.id) && module.views.includes(view));
    return supported.find(module => module.id === preferred)?.id || supported[0]?.id || null;
  }
  function compactViews(allowed) { return allowed.filter(view => compactModuleFor(view)); }
  function landing(mode, allowed) {
    const desired = mode === "surveyor" ? "records" : mode === "engineer" ? "trialDataReview" : "dashboard";
    return allowed.includes(desired) ? desired : allowed.includes("dashboard") ? "dashboard" : allowed[0];
  }
  function restore(saved, allowed, mode) {
    if (saved && typeof saved.viewId === "string" && allowed.includes(saved.viewId) && moduleFor(saved.viewId)) {
      const focus = saved.viewId === "dashboard" && ["project-layout", "alerts"].includes(saved.focus) ? saved.focus : "";
      return { viewId: saved.viewId, focus };
    }
    return { viewId: landing(mode, allowed), focus: "" };
  }
  function summary(state) {
    return { groundPending: (state.followupEvents || []).filter(e => ["open", "acknowledged", "in_progress"].includes(e.status)).length,
      reviewPending: null, notificationsOverdue: null };
  }
  return { modules, compactModules, compactViews, compactModuleFor, adminSections, adminSectionFor, moduleFor, landing, restore, summary };
});
