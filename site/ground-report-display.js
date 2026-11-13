(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GroundReportDisplay = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const heading = "Ground assessment history";
  const labels = ["Point / date / revision", "Reading mPD", "Recorded operational judgment", "Approved dated evidence", "Current comparison for this reading"];
  const widths = [100, 60, 117, 122, 112];
  const severity = { none: "Below configured thresholds", alert: "Alert", alarm: "Alarm", action: "Action", action1: "Action 1", action2: "Action 2", action3: "Action 3" };
  const fixed = (value, places) => Number.isFinite(value) ? value.toFixed(places) : "Unavailable";
  const identity = value => value;
  const limits = (row, t) => row.limits ? row.approach + " · " + t(row.rule) + " · "
    + Object.entries(row.limits).map(([key,value]) => t(severity[key] ?? key) + " " + value + " mm").join(", ") : t("Criteria not configured");
  const result = (row, t) => fixed(row.settlementMm, 1) + " mm · " + t(severity[row.severity] ?? "Criteria not configured");
  const baseline = (row, t) => t("Baseline") + " " + fixed(row.baselineMpd, 4) + " mPD";
  const summary = (section, t = identity) => (section.approvalVersion == null ? t("All selected approval versions") : t("Approved version") + " v" + section.approvalVersion)
    + " · " + section.rows.length + " " + t(section.rows.length === 1 ? "evidence row" : "evidence rows")
    + " · " + section.excluded + " " + t("excluded by the historical filter.") + " " + t("Current report totals use the selected period and points.");
  function cells(row, t = identity) {
    const source = [row.pointId, row.date, row.revisionId == null ? t("Revision unavailable") : t("Revision") + " " + row.revisionId
      + " · " + t(row.superseded ? "Superseded" : "Current revision"), row.sourcePointId !== row.pointId ? t("Source point") + ": " + row.sourcePointId : ""].filter(Boolean).join("\n");
    const recorded = row.recorded, approved = row.approved, current = row.current;
    return [
      source, fixed(row.readingMpd, 4),
      recorded ? [result(recorded,t), baseline(recorded,t) + " · v" + recorded.baselineVersion,
        t("Criteria") + " v" + recorded.criteriaVersion + " · " + t("source revision") + " " + recorded.sourceRevision,
        recorded.assessedAt, limits(recorded,t)].join("\n") : t("Historical judgment unknown"),
      approved ? [result(approved,t), baseline(approved,t) + " · v" + approved.baselineVersion,
        t("Approval") + " v" + approved.approvalVersion + " · " + t("effective") + " " + approved.effectiveDate + " (" + t("Hong Kong") + ")",
        approved.documentRef, limits(approved,t)].join("\n") : t("Historical approval unknown"),
      [result(current,t), baseline(current,t), limits(current,t), current.reviewRequired ? t("Operational criteria pending review") : ""].filter(Boolean).join("\n")
    ];
  }
  return { heading, labels, widths, summary, cells };
});
