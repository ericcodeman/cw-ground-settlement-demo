"use strict";

function structureInputs() {
  return {
    structure: { name: "Synthetic structure A", structureType: "Building", markerIds: ["SM01", "SM02"],
      sourceRef: "Synthetic structure plan A", reason: "Initial registration" },
    config: { name: "Target pair A", topId: "TOP-A", bottomId: "BOTTOM-A", heightM: 20,
      heightSource: "Synthetic verified height schedule", baselineEpoch: "B1", crs: "EPSG:2326",
      verified: true, sourceRef: "Synthetic target plan A", reason: "Verified target configuration" },
    baseline: { kind: "baseline", date: "2026-09-01", epoch: "B1", verified: true,
      top: { eastingM: 835000, northingM: 820000 }, bottom: { eastingM: 835000, northingM: 820000 },
      sourceRef: "Synthetic baseline survey A", reason: "Baseline verified" },
    current: { kind: "current", date: "2026-09-02", epoch: "S1", verified: true,
      top: { eastingM: 835000.020, northingM: 819999.990 }, bottom: { eastingM: 835000, northingM: 820000 },
      sourceRef: "Synthetic current survey A", reason: "Current pair verified" }
  };
}

module.exports = { structureInputs };
