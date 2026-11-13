# SenseOne — Browser Trial

Browser-based single-user trial. **Synthetic/test data only. Local workflow simulation. Not for engineering decisions.**

This publication preserves the original monitoring interface and calculation modules. It is not a production multi-user service and does not complete engineering acceptance.

## Use

Open the GitHub Pages project site after its manual deployment succeeds. No account, password, installation or backend is needed. Do not enter confidential, personal or real project data.

The trial starts with four synthetic markers. Download `site/synthetic-monitoring-records.csv` and use Data input → Monitoring records → Choose CSV → review → confirm. It contains ten further days, with settlement increasing by 2 mm per day at each marker, plus synthetic spatial differences. Negative settlement means downward movement. It is test data, not an approved criterion or survey record.

## Interactive capabilities

- Dashboard and Settlement Contour with a top-right basemap selector. Street, Hong Kong topographic and Hong Kong imagery layers share the same markers and calculation results. Dashboard point popups show the latest observed level in mPD.
- Point registration/maintenance, manual/CSV observations, duplicate/conflict handling, quality preview and correction reasons, configurable 3A/5A thresholds.
- Trend, original illustrative projection, original Ordinary Kriging contour recomputation, colour legend and annotated PNG export.
- Structure registration, configuration, baseline/current observations, assessments, history, criteria, GIS and local follow-up.
- Utility assets/segments, criteria applicability, informed missing-criteria confirmation, Review, differential settlement, relative slope, schematic GIS and local follow-up.
- PNG/JPEG Layout upload, relative point placement and reopening via a trial data package.
- Current-data report snapshot, preview and real English or Traditional Chinese PDF using original PDFKit layout; earlier snapshots remain independent of later edits.
- Today workbench, observation review and history, simulated notification tracking, shared analysis filters, project switching and Reset.
- Complete backup with capacity and replacement previews, archived snapshots/PDFs and an in-session recovery copy.

## Local simulation and limitations

Role selection is a viewpoint demonstration, not authentication or access security. Workflow ownership, criteria approval and acknowledgment are local simulations, not verified approval by another person. No email is sent. No private GitHub API or application backend is used.

Project data lives in page memory. Refresh or closing the page resets it. Before leaving, use **Reports → Report archive and data transfer** to export a complete backup (64 MiB maximum). The archive includes project data and eligible attachments, saved report snapshots and any original PDFs you generated and saved to the archive. Restore replaces the current trial data after preview and confirmation. Limited **Export project JSON / Import project JSON** remains available for project-data transfer (16 MiB, 20 projects) and omits report snapshots and PDFs. Browser-local preferences and optional unfinished-input recovery are separate. Keep downloaded backups privately and use synthetic data only; never treat the trial as durable or shared storage.

Reports and their hashes identify a local snapshot; they are not a digital signature or tamper-proof audit. Captured historical Ground judgments and separate current-rule comparisons are labelled. Missing historical evidence is shown as unknown. Missing criteria is not Normal. Closing a workflow does not clear engineering severity. Grid azimuth is not true north; a zero displacement has no direction. UU connectors are schematic, not verified underground alignment. Contours are interpolation, not a verified survey surface. UU angular-deformation alarms and new instruments are not provided.

Large datasets can block the browser while the original synchronous algorithm runs. Small synthetic timing probes are not production capacity approval. English PDFs use an approximately 181 KB Noto Sans HK subset. Traditional Chinese PDFs fetch the approximately 11.9 MB full font on demand, so the first Chinese PDF can take longer. Original report pagination and explicit ellipsis for long table notes are retained; full text remains in the data package.

External network requests are limited to this site's static resources, OpenStreetMap tiles, and, when selected, Hong Kong Lands Department map tiles and attribution logo. The map providers receive tile requests for the viewed area. Maps require Internet access; blocked tiles show an explicit error while numerical data remains available. No telemetry or monitoring-data delivery is configured. Do not bulk-download tiles. See the [Lands Department topographic API](https://portal.csdi.gov.hk/csdi-webpage/apidoc/TopographicMapAPI) and [imagery API](https://portal.csdi.gov.hk/csdi-webpage/apidoc/ImageryMapAPI) for provider terms, source attribution and limitations. Attribution and third-party notices are retained in `site/THIRD-PARTY-NOTICES.md`.

## Verification and provenance

`site/build-manifest.json` identifies the product source version, browser build, file hashes and payload hash. The manifest excludes itself from the hash to avoid a circular definition. This repository contains a reviewed static payload, not the private application's history, server, accounts, uploads or deployment secrets. No new MIT or other license is assigned to the original application; third-party licenses remain separate.

For local verification, use Node 24 and `npm ci`, `npx playwright install chromium`, `npm run verify`, `npm test`. The tests create isolated synthetic browser contexts and block map tiles. Real tile verification is recorded separately. `npm start` serves only static files at `http://127.0.0.1:3190/cw-ground-settlement-demo/`.

## Deployment, updates and rollback

Only the manual GitHub Actions Pages workflow publishes `site/`. Verify runs before artifact upload/deployment. Updates must be built in the isolated authoring checkout from the original calculation source, reviewed, tested and copied through the allowlist; do not independently maintain a second algorithm here. Never add private-repository credentials to this repository.

To roll back, make a normal revert commit to the previous verified public payload and manually run the deployment workflow. Do not rewrite private history. To withdraw, disable Pages in repository settings and stop sharing the URL; this does not recall copies already downloaded from the public repository.
