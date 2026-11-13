"use strict";

(() => {
  const panel = document.getElementById("trialAnalysisFilters");
  const form = panel.querySelector("form");
  const status = panel.querySelector("[data-analysis-status]");
  const list = panel.querySelector("[data-analysis-points]");
  const views = new Set(["trends", "contours", "utilityReviews", "structureAssessments"]);
  const defaults = () => TrialAnalysisScope.normalize();
  const savedScopes = new Map(), presentation = new Map();
  let project, activeView, context, selection = null, reviewStates;
  const select = form.elements;
  const scope = () => savedScopes.get(activeProjectId) || defaults();

  function options(field, values, label, format = String) {
    const previous = field.value;
    field.replaceChildren(new Option(label, ""), ...values.map(value => new Option(format(value), value)));
    field.value = values.some(value => String(value) === previous) ? previous : "";
  }

  function refreshChoices() {
    context = BrowserTrial.analysisContext();
    options(select.facility, [...new Set(context.points.map(row => row.facility).filter(Boolean))].sort(), "All facilities");
    options(select.groundApproval, context.groundVersions, "All Ground evidence", value => "Ground approval v" + value);
    options(select.structureVersion, context.structureVersions, "All Structure evidence", value => "Structure criterion v" + value);
    options(select.utilityVersion, context.utilityVersions, "All UU evidence", value => "UU criterion v" + value);
  }

  function visiblePoints() {
    const search = select.search.value.trim().toLowerCase();
    return context.points.filter(point => (!select.facility.value || point.facility === select.facility.value) &&
      (!search || (point.id + " " + (point.facility || "")).toLowerCase().includes(search)));
  }

  function renderPoints() {
    const points = visiblePoints();
    list.replaceChildren();
    for (const point of points) {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = point.id;
      checkbox.checked = selection === null || selection.has(point.id);
      label.append(checkbox, document.createTextNode(point.id + (point.facility ? " · " + point.facility : "")));
      list.append(label);
    }
    if (!points.length) list.textContent = "No monitoring points match the search.";
  }

  function populate(value) {
    for (const key of ["facility", "from", "through", "groundApproval", "structureVersion", "utilityVersion"]) {
      select[key].value = value[key] ?? "";
    }
    selection = value.points === null ? null : new Set(value.points);
    select.search.value = "";
    renderPoints();
  }

  function rerender() {
    if (activeView === "trends") { renderTrendChart(); renderTrendProjection(); }
    if (activeView === "contours") void renderSettlementContours();
    if (activeView === "structureAssessments") void loadStructureAssessments();
    if (activeView === "utilityReviews") void refreshUtilityReviews();
  }

  function apply(value) {
    savedScopes.set(activeProjectId, value);
    status.textContent = "Scope applied to this project. Captured criteria filter source evidence; they do not change engineering judgments.";
    rerender();
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    try {
      apply(TrialAnalysisScope.normalize({
        facility: select.facility.value, from: select.from.value, through: select.through.value,
        points: selection === null ? null : [...selection],
        groundApproval: select.groundApproval.value, structureVersion: select.structureVersion.value, utilityVersion: select.utilityVersion.value
      }));
    } catch (error) { status.textContent = error.message; }
  });
  form.querySelector("[data-clear-analysis]").addEventListener("click", () => {
    const value = defaults();
    populate(value);
    select.direction.value = "both";
    select.age.value = "";
    presentation.delete(activeProjectId);
    apply(value);
  });
  form.querySelector("[data-analysis-all]").addEventListener("click", () => { selection = null; renderPoints(); });
  form.querySelector("[data-analysis-none]").addEventListener("click", () => { selection = new Set(); renderPoints(); });
  select.facility.addEventListener("change", renderPoints);
  select.search.addEventListener("input", renderPoints);
  list.addEventListener("change", event => {
    const checkbox = event.target.closest('input[type="checkbox"]');
    if (!checkbox) return;
    if (selection === null) selection = new Set(context.points.map(row => row.id));
    if (checkbox.checked) selection.add(checkbox.value);
    else selection.delete(checkbox.value);
  });
  function rememberPresentation() {
    presentation.set(activeProjectId, { direction: select.direction.value, age: select.age.value });
  }
  select.direction.addEventListener("change", () => { rememberPresentation(); if (activeView === "trends") renderTrendChart(); });
  select.age.addEventListener("change", () => { rememberPresentation(); if (activeView === "contours") void renderSettlementContours(); });
  window.addEventListener("trial-data-changed", () => { reviewStates = undefined; if (activeView) refreshChoices(); });
  window.addEventListener("trial-project-restored", () => { reviewStates = undefined; });
  window.addEventListener("trial-backup-replaced", () => { savedScopes.clear(); presentation.clear(); project = undefined; reviewStates = undefined; });

  window.TrialAnalysis = {
    activate(view) {
      const previous = activeView;
      activeView = views.has(view) ? view : null;
      panel.hidden = !activeView;
      if (!activeView) return;
      refreshChoices();
      const projectChanged = project !== activeProjectId;
      if (projectChanged) {
        project = activeProjectId;
        select.direction.value = presentation.get(project)?.direction ?? "both";
        select.age.value = presentation.get(project)?.age ?? "";
        reviewStates = undefined;
        populate(scope());
        status.textContent = "";
      } else renderPoints();
      for (const element of panel.querySelectorAll("[data-analysis-views]")) {
        element.hidden = !element.dataset.analysisViews.split(" ").includes(activeView);
      }
      if (activeView === "trends" && (previous !== activeView || projectChanged)) rerender();
      if (activeView === "contours" && (previous !== activeView || projectChanged)) invalidateContourScope();
    },
    focusPoint(pointId) {
      const value = TrialAnalysisScope.normalize({ points: [pointId] });
      savedScopes.set(activeProjectId, value);
      if (project === activeProjectId && context) populate(value);
    },
    scopeFor(view) { return view === activeView ? scope() : null; },
    direction() { return select.direction.value; },
    limitsFor(rule) { return context?.thresholds[rule]; },
    age() { return select.age.value; },
    reviewFor(pointId, date) {
      reviewStates ??= BrowserTrial.analysisReviewStates();
      return reviewStates.get(JSON.stringify([pointId, date])) || "Review history unavailable";
    }
  };
})();
