"use strict";
// Test-only: follow the normal module button before its existing function button.
module.exports = async function openTrialView(page, view) {
  const shell = page.locator("#shellPrimary");
  if (await shell.count()) {
    await page.waitForFunction(() => window.TrialShell?.ready);
    const moduleId = await page.evaluate(view => TrialShellModel.moduleFor(view), view);
    if (!moduleId) throw Error("No module mapping for " + view);
    await page.locator(`#shellPrimary [data-module="${moduleId}"]`).click();
    if(moduleId === "settings") {
      const section = await page.evaluate(view => TrialShellModel.adminSectionFor(view), view);
      if(section)await page.locator(`#shellAdminSections [data-admin-section="${section}"]`).click();
    }
    if (view === "utilityRegister" && moduleId === "analysis" && await page.locator("#trialAnalysisFilters").count()) {
      await page.locator('#shellFunctionRail [data-view="utilityReviews"]').first().click();
      await page.getByRole("button", { name: "Open utility register", exact: true }).click();
    } else await page.locator(`#shellFunctionRail [data-view="${view}"]`).first().click();
  } else await page.locator(`[data-view="${view}"]`).first().click();
  await page.waitForFunction(view => !document.getElementById(view).classList.contains("hidden"), view);
};
