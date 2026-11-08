(function(){const module={exports:{}};const __dirname='';const process={env:{}};const Buffer={concat:chunks=>{const a=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let o=0;for(const c of chunks){a.set(c,o);o+=c.length;}return a;},from:(s)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0))};const require=id=>{if(id==='pdfkit')return window.PDFDocument;if(id==='node:path')return {join:()=> 'font'};if(id==='node:fs')return {existsSync:()=>!!window.proofFont};throw Error(id);};
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const PDFDocument = require("pdfkit");

const FONT_PATH = path.join(__dirname, "assets", "fonts", "NotoSansHK-VF.ttf");
const COLOURS = ["#1d4ed8", "#dc2626", "#059669", "#9333ea", "#d97706", "#0891b2", "#be123c", "#4f46e5", "#15803d", "#7c2d12"];

function text(value, fallback = "-") { return value === null || value === undefined || value === "" ? fallback : String(value); }
function number(value, digits = 1) { return Number.isFinite(value) ? Number(value).toFixed(digits) : "-"; }
function short(value, maximum = 280) { const result = text(value); return result.length > maximum ? result.slice(0, maximum - 3) + "..." : result; }

function renderMonitoringReportPdf(report, options = {}) {
  if (!report || !report.snapshotHash) return Promise.reject(new Error("A validated monitoring report snapshot is required."));
  const fontPath = options.fontPath || process.env.REPORT_FONT_PATH || FONT_PATH;
  if (!fs.existsSync(fontPath)) return Promise.reject(new Error("The report font is unavailable. Restore assets/fonts/NotoSansHK-VF.ttf or set REPORT_FONT_PATH."));
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: "A4", margins: { top: 62, right: 42, bottom: 54, left: 42 }, bufferPages: true, autoFirstPage: false, info: { Title: report.layout.title, Author: report.generatedBy, Subject: `${report.projectName} monitoring report`, Keywords: "settlement monitoring engineering review" } });
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.registerFont("Report", fontPath);
    doc.font("Report");
    const contentWidth = 511;

    function addPage() {
      doc.addPage();
      doc.y = 62;
      doc.x = 42;
    }
    function ensure(height) { if (doc.y + height > 760) addPage(); }
    function heading(value, level = 2) {
      ensure(level === 1 ? 54 : 60);
      if (level !== 1) doc.moveDown(0.5);
      doc.fillColor("#12395d").fontSize(level === 1 ? 22 : 14).text(value, 42, doc.y, { width: contentWidth });
      if (level !== 1) doc.strokeColor("#d7e0e7").moveTo(42, doc.y + 3).lineTo(553, doc.y + 3).stroke().moveDown(0.5);
      doc.x = 42;
    }
    function paragraph(value, style = {}) {
      ensure(35);
      doc.fillColor(style.colour || "#263746").fontSize(style.size || 9).text(text(value), 42, doc.y, { width: contentWidth, lineGap: 2, align: style.align || "left" }).moveDown(0.5);
      doc.x = 42;
    }
    function table(columns, rows, empty = "No entries in the selected scope.") {
      const x = 42;
      const drawHeader = () => {
        ensure(33);
        const headerY = doc.y;
        let cursor = x;
        doc.fillColor("#e7eef5").rect(x, headerY, contentWidth, 30).fill();
        doc.fillColor("#12395d").fontSize(7.2);
        for (const column of columns) { doc.text(column.label, cursor + 4, headerY + 5, { width: column.width - 8, height: 21 }); cursor += column.width; }
        doc.y = headerY + 30;
        doc.x = x;
      };
      if (!rows.length) {
        ensure(25);
        doc.fillColor("#536473").fontSize(8).text(empty, x, doc.y, { width: contentWidth });
        doc.moveDown(0.7);
        doc.x = x;
        return;
      }
      drawHeader();
      rows.forEach((cells, rowIndex) => {
        const values = columns.map((column, index) => short(cells[index], column.maximum || 280));
        doc.fontSize(7.2);
        const height = Math.max(21, ...columns.map((column, index) => doc.heightOfString(values[index], { width: column.width - 8, lineGap: 1 }) + 8));
        if (doc.y + height > 760) { addPage(); drawHeader(); }
        const y = doc.y;
        if (rowIndex % 2) doc.fillColor("#f8fafc").rect(x, y, contentWidth, height).fill();
        let cursor = x;
        doc.fillColor("#263746");
        columns.forEach((column, index) => {
          doc.strokeColor("#d7e0e7").rect(cursor, y, column.width, height).stroke();
          doc.text(values[index], cursor + 4, y + 4, { width: column.width - 8, height: height - 7, lineGap: 1 });
          cursor += column.width;
        });
        doc.y = y + height;
        doc.x = x;
      });
      doc.moveDown(0.7);
      doc.x = x;
    }
    function summaryCards() {
      const entries = [["Markers", report.summary.markers], ["Observations", report.summary.observations], ["No observations", report.summary.markersWithoutObservations], ["Quality findings", report.summary.qualityFindings], ["Exceedances", report.summary.thresholdExceedances], ["Open follow-ups", report.summary.outstandingFollowups]];
      const baseY = doc.y;
      entries.forEach(([label, value], index) => {
        const width = 161, x = 42 + (index % 3) * 175, y = baseY + Math.floor(index / 3) * 55;
        doc.fillColor("#f5f8fa").rect(x, y, width, 45).fill().strokeColor("#cbd5e1").rect(x, y, width, 45).stroke();
        doc.fillColor("#12395d").fontSize(16).text(String(value), x + 8, y + 6, { width: 50, lineBreak: false });
        doc.fillColor("#536473").fontSize(8).text(label, x + 58, y + 12, { width: 95, lineBreak: false });
      });
      doc.y = baseY + 116;
      doc.x = 42;
    }
    function chart(group) {
      addPage(); heading(`Trend chart - ${group.ruleKey}`, 1);
      const values = group.series.flatMap(series => series.values.map(value => ({ ...value, pointId: series.pointId })));
      if (!values.length) { paragraph("No observations are available for this threshold group in the selected period."); return; }
      const x = 62, y = 145, width = 470, height = 250;
      const timestamps = values.map(item => Date.parse(item.date + "T00:00:00Z"));
      const thresholdValues = group.thresholds.filter(item => Number.isFinite(item.valueMm)).map(item => -Math.abs(item.valueMm));
      let minX = Math.min(...timestamps), maxX = Math.max(...timestamps); if (minX === maxX) maxX += 86400000;
      let minY = Math.min(0, ...values.map(item => item.settlement), ...thresholdValues), maxY = Math.max(0, ...values.map(item => item.settlement));
      if (minY === maxY) { minY -= 1; maxY += 1; }
      const px = date => x + (Date.parse(date + "T00:00:00Z") - minX) / (maxX - minX) * width;
      const py = value => y + height - (value - minY) / (maxY - minY) * height;
      doc.strokeColor("#64748b").lineWidth(0.8).rect(x, y, width, height).stroke();
      for (let index = 0; index <= 4; index++) {
        const value = minY + (maxY - minY) * index / 4, lineY = py(value);
        doc.strokeColor("#e2e8f0").moveTo(x, lineY).lineTo(x + width, lineY).stroke();
        doc.fillColor("#536473").fontSize(7).text(number(value), 42, lineY - 4, { width: 18, align: "right" });
      }
      group.thresholds.forEach((threshold, index) => {
        if (!Number.isFinite(threshold.valueMm)) return;
        const value = -Math.abs(threshold.valueMm), lineY = py(value);
        doc.strokeColor(index % 2 ? "#dc2626" : "#d97706").dash(4, { space: 3 }).moveTo(x, lineY).lineTo(x + width, lineY).stroke().undash();
        doc.fillColor("#7f1d1d").fontSize(7).text(`${threshold.label} -${number(threshold.valueMm)} mm`, x + width - 100, lineY - 9, { width: 98, align: "right" });
      });
      group.series.forEach((series, seriesIndex) => {
        const points = series.values;
        if (!points.length) return;
        const colour = COLOURS[seriesIndex % COLOURS.length];
        doc.strokeColor(colour).lineWidth(1.5);
        points.forEach((point, index) => index ? doc.lineTo(px(point.date), py(point.settlement)) : doc.moveTo(px(point.date), py(point.settlement)));
        if (points.length > 1) doc.stroke();
        points.forEach(point => doc.fillColor(colour).circle(px(point.date), py(point.settlement), 2).fill());
      });
      doc.fillColor("#536473").fontSize(7).text(new Date(minX).toISOString().slice(0, 10), x, y + height + 7, { width: 90 }).text(new Date(maxX).toISOString().slice(0, 10), x + width - 90, y + height + 7, { width: 90, align: "right" });
      doc.fillColor("#12395d").fontSize(8).text("Accumulated settlement (mm); negative is settlement", x, y - 18, { width });
      let legendY = y + height + 30;
      group.series.forEach((series, index) => {
        const legendX = x + (index % 4) * 118;
        if (index && index % 4 === 0) legendY += 17;
        doc.fillColor(COLOURS[index % COLOURS.length]).rect(legendX, legendY + 2, 8, 8).fill();
        doc.fillColor("#263746").fontSize(7).text(series.pointId, legendX + 12, legendY, { width: 100 });
      });
      doc.y = legendY + 28;
      paragraph("Threshold baselines are shown as negative values. The chart and detail tables use the same immutable snapshot.", { size: 8 });
    }

    addPage();
    if (report.layout.logo) {
      try { doc.image(Buffer.from(report.layout.logo.data, "base64"), 463, 56, { fit: [90, 45], align: "right" }); }
      catch { throw new Error("The report logo could not be decoded as a valid PNG or JPEG image."); }
    }
    heading(report.layout.title, 1);
    doc.fillColor("#526473").fontSize(12).text(report.projectName, 42, doc.y, { width: 400 }).moveDown(1);
    doc.x = 42;
    table([{ label: "Period", width: 180 }, { label: "Generated", width: 170 }, { label: "Revision", width: 161 }], [[report.period.label, report.generatedAt, report.sourceRevision]]);
    summaryCards();
    paragraph(report.signConvention, { colour: "#7c2d12" });
    paragraph(report.thresholdAssessment, { colour: "#7c2d12" });
    report.notices.forEach(item => paragraph("- " + item, { size: 8 }));

    if (report.layout.sections.includes("summary")) {
      heading("Monitoring point summary");
      table([
        { label: "Point / facility", width: 100 }, { label: "Rule", width: 48 }, { label: "Initial mPD", width: 54 }, { label: "Records", width: 40 }, { label: "Opening date / mm", width: 75 }, { label: "Closing date / mm", width: 75 }, { label: "Period movement mm", width: 58 }, { label: "Peak / worst", width: 61 }
      ], report.markers.map(item => [`${item.pointId}\n${item.facility}`, item.ruleKey, number(item.baseline, 3), item.observationCount, `${text(item.openingDate)}\n${number(item.openingSettlement)}`, `${text(item.closingDate)}\n${number(item.closingSettlement)}`, number(item.periodMovement), `${text(item.peakDate)} ${number(item.peakSettlement)}\n${item.worstSeverity}`]));
    }
    if (report.layout.sections.includes("daily")) {
      heading("Daily observation detail");
      table([{ label: "Date", width: 62 }, { label: "Point", width: 55 }, { label: "Facility", width: 90 }, { label: "Reading mPD", width: 62 }, { label: "Settlement mm", width: 62 }, { label: "Status", width: 65 }, { label: "Note / source", width: 115 }], report.dailyRecords.map(item => [item.date, item.pointId, item.facility, number(item.reading, 3), number(item.settlement), item.severityLabel, `${item.note}\n${item.sourceKey}`]));
    }
    const summaryTable = (title, rows) => { heading(title); table([{ label: "Period", width: 65 }, { label: "Point", width: 55 }, { label: "Records", width: 42 }, { label: "First / last", width: 90 }, { label: "Closing mm", width: 60 }, { label: "Movement mm", width: 60 }, { label: "Peak date / mm", width: 78 }, { label: "Worst status", width: 61 }], rows.map(item => [item.period, item.pointId, item.observations, `${item.firstDate}\n${item.lastDate}`, number(item.closingSettlement), number(item.movementMm), `${item.peakDate}\n${number(item.peakSettlement)}`, item.worstSeverity])); };
    if (report.layout.sections.includes("weekly")) summaryTable("Weekly summaries", report.weeklySummaries);
    if (report.layout.sections.includes("monthly")) summaryTable("Monthly summaries", report.monthlySummaries);
    if (report.layout.sections.includes("quality")) {
      heading("Data-quality findings"); paragraph(report.qualityAssessment, { size: 8 });
      table([{ label: "Point", width: 55 }, { label: "Date", width: 65 }, { label: "Finding", width: 90 }, { label: "Evidence", width: 181 }, { label: "Review", width: 120 }], report.qualityFindings.map(item => [item.pointId, item.date, item.code, JSON.stringify({ previousDate: item.previousDate, elapsedDays: item.elapsedDays, changeMm: item.changeMm, rateMmPerDay: item.rateMmPerDay, spreadMm: item.spreadMm, limit: item.limit }), item.reviewStatus === "confirmed" ? `Confirmed by ${item.reviewedBy}\n${text(item.reviewReason)}` : "Needs review"]));
    }
    if (report.layout.sections.includes("exceedances")) {
      heading("Threshold exceedance history"); paragraph(report.thresholdAssessment, { size: 8 });
      table([{ label: "Date", width: 65 }, { label: "Point", width: 55 }, { label: "Facility", width: 100 }, { label: "Settlement mm", width: 75 }, { label: "Level", width: 70 }, { label: "Rule", width: 55 }, { label: "Assessment", width: 91 }], report.exceedances.map(item => [item.date, item.pointId, item.facility, number(item.settlement), item.severityLabel, item.ruleKey, item.assessmentBasis]));
    }
    if (report.layout.sections.includes("followups")) {
      if (!report.followups.length) paragraph("Follow-up actions: No entries in the selected scope.", { size: 8 });
      else {
        heading("Follow-up actions");
        table([{ label: "Point / event", width: 100 }, { label: "Trigger / latest", width: 75 }, { label: "Severity", width: 60 }, { label: "Workflow", width: 65 }, { label: "Owner / due", width: 90 }, { label: "Action / closure evidence", width: 121 }], report.followups.map(item => [`${item.pointId}\n${item.id}`, `${text(item.triggerDate)}\n${text(item.latestDate)}`, item.eventSeverity, item.status, `${item.ownerName}\n${text(item.dueDate)}`, `${item.actionNote}\n${item.closureEvidence}`]));
      }
    }
    if (report.layout.sections.includes("utility")) {
      heading("Utility settlement reviews");
      paragraph("Signed values in mm; negative means downward. Differential settlement is B minus A. Utility warnings use the recorded limit revision. No angular distortion assessment is included.", { size: 8 });
      if (report.period.type === "full") paragraph("Full history includes all selected utility review dates, even outside the ground observation range shown above.", { size: 8 });
      table([
        { label: "Date / segment", width: 120, maximum: 1000 }, { label: "A / B / difference (mm)", width: 100 },
        { label: "Source / review ID", width: 127, maximum: 2000 }, { label: "Warning / limits", width: 164, maximum: 1000 }
      ], (report.utilityReviews || []).map(item => [
        `${item.date}\n${item.name}\n${item.aId} / ${item.bId}`,
        `A: ${number(item.aMm)}\nB: ${number(item.bMm)}\nB minus A: ${number(item.differenceMm)}`,
        [item.source, item.sourceReference, `Survey: ${item.surveyEpoch}`, `Baseline: ${item.baselineEpoch}`, item.id,
          item.registerLink && `Utility: ${item.registerLink.assetName} v${item.registerLink.assetVersion}\nSegment: ${item.registerLink.segmentName} v${item.registerLink.segmentVersion}`].filter(Boolean).join("\n"),
        [item.severity.replaceAll("_", " "), item.historicalSeverity && `Historical only: ${item.historicalSeverity}`,
          item.rule && `${item.rule.approach} v${item.rule.version} (${item.rule.effectiveDate})\n${item.rule.document}`,
          item.rule?.scopeType && `Criteria scope: ${item.rule.scopeType}\n${item.rule.method}\n${item.rule.precisionPolicy}`].filter(Boolean).join("\n")
      ]));
      if ((report.utilityReviews || []).some(item => item.evidence)) {
        heading("Utility time, precision and assessment evidence");
        table([{ label: "Review ID", width: 120 }, { label: "Recorded contract", width: 391, maximum: 4000 }],
          report.utilityReviews.filter(item => item.evidence).map(item => [item.id, item.evidence.summary]));
      }
      heading("Utility warning checks");
      table([
        { label: "Review ID", width: 120 }, { label: "Metric / point", width: 151 },
        { label: "Value (mm)", width: 80 }, { label: "Limit (mm)", width: 80 }, { label: "Level", width: 80 }
      ], (report.utilityReviews || []).flatMap(item => item.triggers.map(trigger => [
        item.id, trigger.pointId ? `Downward settlement\n${trigger.pointId}` : "Absolute A/B difference",
        number(trigger.valueMm), String(trigger.limitMm), trigger.level
      ])));
    }
    if (report.layout.sections.includes("structure")) {
      const assessments = report.structureAssessments || [];
      heading("Structure assessments");
      paragraph("Captured target-pair results. Movement is in mm. Azimuth is clockwise from grid north. Superseded and reverify-required values retain their original source revisions.", { size: 8 });
      if (report.period.type === "full") paragraph("Full history includes structure survey dates outside the ground observation range.", { size: 8 });
      table([
        { label: "Date / structure", width: 115, maximum: 500 }, { label: "Configuration", width: 105, maximum: 500 },
        { label: "Movement / ratio / grid azimuth", width: 125 }, { label: "Source status", width: 75 },
        { label: "Observation revision", width: 91 }
      ], assessments.map(item => [
        `${item.observation.date}\n${item.structure?.name || "Unavailable"}\nr${item.references.structure.revision}`,
        `${item.configuration?.name || "Unavailable"}\nr${item.references.configuration.revision}`,
        item.result ? `${number(item.result.displacementMm, 4)} mm\n${item.result.ratio === 0 ? "Level (ratio 0)" : "1:" + number(1 / item.result.ratio, 4)}\n${item.result.gridAzimuthDeg === null ? "No direction" : number(item.result.gridAzimuthDeg, 4) + " deg"}` : "Unavailable",
        item.sourceStatus.replaceAll("_", " "), `${item.references.observation.id}\nr${item.references.observation.revision}`
      ]));
      if (report.structureFollowups?.length) {
        heading("Structure warning follow-up (workflow does not clear severity)");
        table([{ label: "Assessment", width: 180 }, { label: "Captured warning / response", width: 331 }],
          report.structureFollowups.map(event => [event.assessmentId,
            `${event.source.assessment.severity} / ${event.sourceStatus} / workflow ${event.status}\nOwner ${event.ownerName || "Unassigned"}; due ${event.dueDate || "Not set"}\n${event.actionNote || ""}\n${event.closureEvidence || ""}`]));
      }
      heading("Structure source revisions");
      const reference = value => value.id + " r" + value.revision;
      const survey = value => value ? [
        `${value.date} / ${value.epoch} / EPSG:2326`,
        `Top E/N: ${value.top.eastingM} / ${value.top.northingM} m`,
        `Bottom E/N: ${value.bottom.eastingM} / ${value.bottom.northingM} m`,
        value.sourceRef, value.actor, value.recordedAt, value.reason
      ].filter(Boolean).join("\n") : "Unavailable";
      table([{ label: "Source", width: 85 }, { label: "Fixed reference", width: 150, maximum: 500 },
        { label: "Captured evidence", width: 276, maximum: 2000 }], assessments.flatMap(item => [
        ["Assessment", item.id, `Snapshot hash: ${item.snapshotHash}\n${item.sourceIssue || item.sourceStatus}`],
        ["Structure", reference(item.references.structure), item.structure ? `${item.structure.name}\n${item.structure.structureType}\n${item.structure.sourceRef}` : "Unavailable"],
        ["Configuration", reference(item.references.configuration), item.configuration ? [
          item.configuration.name, `Top: ${item.configuration.topId} / Bottom: ${item.configuration.bottomId}`,
          `Height: ${item.configuration.heightM} m / Baseline epoch: ${item.configuration.baselineEpoch}`,
          item.configuration.heightSource, item.configuration.sourceRef, item.result?.method
        ].filter(Boolean).join("\n") : "Unavailable"],
        ["Baseline", reference(item.references.baseline), survey(item.baseline)],
        ["Observation", reference(item.references.observation), survey(item.observation)],
        ...(item.evidence ? [["Evidence contract", item.id, item.evidence.summary]] : [])
      ]));
    }
    if (report.layout.sections.includes("trends")) report.trends.forEach(chart);
    heading("Traceability and limitations");
    table([{ label: "Item", width: 145 }, { label: "Snapshot evidence", width: 366 }], [["Output language", report.outputLanguage], ["Snapshot hash", report.snapshotHash], ["Source revision", report.sourceRevision], ["Quality rule version", report.qualityRuleVersion], ["Generated by / at", `${report.generatedBy} / ${report.generatedAt}`], ["Threshold groups", JSON.stringify(report.thresholdGroups)], ["Selected markers", report.filter.markerIds.join(", ")]]);

    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index++) {
      doc.switchToPage(index);
      doc.fillColor("#12395d").fontSize(8).text(report.layout.header, 42, 26, { width: 400, lineBreak: false });
      doc.strokeColor("#cbd5e1").moveTo(42, 43).lineTo(553, 43).stroke();
      doc.strokeColor("#cbd5e1").moveTo(42, 770).lineTo(553, 770).stroke();
      doc.fillColor("#536473").fontSize(7).text(report.layout.footer, 42, 778, { width: 390, lineBreak: false }).text(`Page ${index + 1} of ${range.count}`, 455, 778, { width: 98, align: "right", lineBreak: false });
    }
    doc.end();
  });
}

module.exports = { FONT_PATH, renderMonitoringReportPdf };

window.renderOriginalPdf=module.exports.renderMonitoringReportPdf;})();