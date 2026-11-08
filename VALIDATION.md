**Final acceptance:** see [Deployment verification](DEPLOYMENT-VERIFICATION-2026-11-08.md). The pending gates below are preserved historical candidate records.

# Candidate verification

Product source version: `71295f05ba764dd3f4c0d3a59519c6a65e14c0ea`.
Isolated authoring commit: `96e597f` (not pushed to the private product branches).
Browser build: `browser-trial-7776a4da6227bc6c`.
Payload SHA256: `7776a4da6227bc6c29ca72979470f5c89d3fabf1601c88ef4d45bf384ab83b06`.

## Local checks

Windows / Node 24.19.0 / Edge 157.0.4341.42 / Playwright 1.62.1.
All eight suites ran from this self-contained candidate with its own static-only server and lockfile:

| Suite | Result |
| --- | --- |
| Ground manual/CSV, Trend, Contour PNG, current/stale report snapshots and PDF | PASS |
| Structure normal forms, calculation, GIS, criteria, local follow-up, optional PDF section | PASS |
| Utility normal forms, missing criteria, historical snapshot, duplicate conflict, GIS, local workflow, optional PDF section | PASS |
| Layout image upload, relative point placement, data export/import and reopen | PASS |
| Projects, metadata, copied threshold warning, tabs/contexts, failed-save draft protection | PASS |
| Invalid/conflicting/duplicate CSV, invalid import, point register, 5A, roles, Reset, narrow view and network boundary | PASS |
| Held Contour response, sparse-data error, export invalidation and bounded timing probes | PASS |
| PDF long names/88 observations, date/marker filters and no-period-observation case | PASS |

No suite was skipped. Automated suites block map tiles. A separate single-viewport network check confirmed real OpenStreetMap tiles, attribution and marker popup. Original/candidate screenshots used the same synthetic baseline, date and viewport; blocked-tile screenshots are not real-map evidence.

The 22-page long PDF and both three-page filtered/empty-period variants were rendered and visually reviewed page by page. Both five-page Structure/Utility reports were also reviewed. No overlapping/cropped content or footer collision was observed. Original explicit long-note ellipsis and pagination white space remain; source text is retained in data packages.

The product baseline separately passed 474 automated tests, syntax checks and 21 Contour numerical checks. Earlier three-input Contour portability comparisons and a four-page fixed PDF proof remain bounded evidence, not substitutes for these integrated suites. Synthetic four/25-marker grid-40 timing probes were about 24/32 ms on this machine, not a general capacity guarantee.

## Failures retained and corrected

The first standalone package test lacked its synthetic Structure fixture; this was included and its test startup was made cleanup-safe. Matched screenshot review found a stale zero-marker Dashboard input summary during projection-script loading; the original summary now refreshes on readiness and a permanent four-input assertion covers it. Other implementation/test iterations and their failure records are retained privately; no raw traces or runtime credentials are published.

## Content audit and boundaries

Only manifest-listed site files deploy. No private history, server, credentials, real project data, uploads or diagnostics are included. Third-party source notices and font license are supplied. The original application is not relicensed. Build-tool audit found four low-severity transitive issues through unused crypto-browserify/elliptic; the actual shipping inventory excludes elliptic after narrowing the crypto adapter. This is not an exhaustive security certification.

Real authorization, multi-user approval, email, central audit, deployment capacity and R6 engineering acceptance are not provided. Current data is page-local memory; export before refresh. GitHub Actions and actual anonymous HTTPS acceptance must be checked separately; local success alone is not deployment evidence.

## Public first-download correction

Initial deployment 17797be5c7f25a95279fd6672d3166d6e4260216 passed Linux/Chromium Verify and Pages deployment (run 42456943878, attempt 1). Actual anonymous HTTPS testing then failed: the original 11,906,752-byte font did not finish downloading within the existing 30-second request/download test window. The initial Ground and identity failures are retained; this was not treated as completed acceptance.

The trial font now contains every original cmap character permitted by the original English-output policy (417 codepoints), using fontTools 4.60.1. Its 180,976 bytes retain the original glyph outlines, advances and sampled shaping. All 32 rendered pages across fixed, 22-page long, filtered and empty-period snapshots are byte-identical to the original-font render. No timeout, engineering algorithm, report layout or original source font was changed. The first regression attempt explicitly exposed fontkit's U+FFFF cmap terminator; it is now separately asserted to map to glyph zero, rather than treated as a printable character.

This candidate requires its own exact-checkout CI and anonymous HTTPS retest. Earlier deployment evidence is not substituted for it.

## First correction CI failure retained

Run 42460412921 attempt 1 tested exact checkout 34624b91fb8ce815bd506173603e2962715eacc5. Payload verification passed, but Ground browser testing failed because the test read an empty status message immediately after observing the data commit. The original UI awaits further refresh work before publishing its completion message. Deployment was skipped. The test now waits for the exact completed-save message, and CSV also waits for the preview dialog to close; record values and exact message assertions remain mandatory. No product code, timeout or fixed sleep changed. The remaining seven suites were not run in that failed attempt; they are not reported as passed.

