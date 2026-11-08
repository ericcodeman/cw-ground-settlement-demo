# Browser Trial — public deployment verification

Status: **DEPLOYED_AND_VERIFIED**, within the browser-only single-user trial scope below. This is not R6 acceptance or approval for engineering use.

## Published identity

- Website: https://ericcodeman.github.io/cw-ground-settlement-demo/
- Separate public repository: https://github.com/ericcodeman/cw-ground-settlement-demo
- Synthetic CSV: https://ericcodeman.github.io/cw-ground-settlement-demo/synthetic-monitoring-records.csv
- Original product source: `71295f05ba764dd3f4c0d3a59519c6a65e14c0ea`.
- Isolated authoring implementation: `96e597f`; font correction `6d4b81b`; test synchronization `beb5e8b6031bc7b9fe7f83b62b6690f57b472156`.
- Exact deployed public commit and CI checkout: `a8bc05da7806307c310bb87f108cf488665001da`.
- Browser build: `browser-trial-7776a4da6227bc6c`.
- Payload SHA256: `7776a4da6227bc6c29ca72979470f5c89d3fabf1601c88ef4d45bf384ab83b06`.
- Manifest: `/cw-ground-settlement-demo/build-manifest.json`; 123 hashed site files, excluding the manifest itself.
- GitHub Actions: https://github.com/ericcodeman/cw-ground-settlement-demo/actions/runs/42460811758, attempt **1**.
- Verify job `128669499353`: SUCCESS. Deploy job `128669687499`: SUCCESS.
- Ubuntu 24.04, Node 24.19.0, Playwright 1.62.1, Chromium 151.0.7922.34. Checkout identity was read from the job log, not inferred from the branch name.

Any later documentation-only commit does not change the site payload or the exact deployed commit above. Documentation updates do not automatically run the manual Pages deployment workflow.

## Public HTTPS acceptance

Executed against the actual public URL in new anonymous Windows/Edge browser contexts, without an application backend, account or private API. Eight suites passed; no suite was skipped. Synthetic test data was confined to each context's memory.

| Suite | Actual public result | Evidence run suffix |
| --- | --- | --- |
| Ground manual/CSV, quality confirmation, Trend, recomputed Contour/PNG, current and stale report snapshots/PDF | PASS | 1794124782604 |
| Structure forms, observations, criteria, historical assessment, GIS, local follow-up and report section | PASS | 1794124805479 |
| UU assets/segments, missing-criteria consent, criteria, duplicate conflict, preserved historical review, GIS, local follow-up and report | PASS | 1794124819790 |
| Layout upload, relative placement, export/import and reopening | PASS | 1794124835204 |
| Project creation/switching, metadata, copied-threshold warning, isolation, failed-save draft protection | PASS | 1794124866192 |
| Invalid/conflicting/duplicate CSV, invalid data package, point registration, 5A, role simulation, Reset and narrow view | PASS | 1794124895289 |
| Contour stale-response rejection, too-few-point handling, export invalidation and bounded performance probes | PASS | 1794124922631 |
| Long multipage PDF, date/marker filtering and no-period-observation case | PASS | 1794124937994 |
| Public manifest and nine critical resources match local hashes; no auth cookies; server.js returns 404 | PASS | 1794124801961 |
| Real OpenStreetMap tiles, attribution, four markers and popup; no page errors | PASS | 1794124825527 |

The eight flow suites deliberately block tiles to test the numerical/UI boundary independently. The last row is separate real network evidence, from a bounded normal viewport. It is not based on a stub, offline image or bulk tile download. The actual public Dashboard screenshot was inspected. Earlier original/candidate comparison used matching fixture, date and 1440x1000 viewport, with blocked tiles in both; those comparison images are not real-map evidence.

The exact same eight suites passed in Linux/Chromium before deployment. Local static-only validation also passed. Product baseline evidence remains separate: 474 automated tests, syntax checking and 21 Contour checks; it is not substituted for these browser integration results.

## Report rendering and first-failure history

Initial deployment `17797be` passed run `42456943878` attempt 1. Anonymous public Ground PDF and identity checks then failed because the original 11,906,752-byte font did not finish downloading within the existing test window. These failures were retained and the deployment was not declared accepted.

The trial now ships a 180,976-byte OFL subset of the original font. The original English-output policy selected all 417 supported characters; glyph outlines, widths and sampled shaping are unchanged. Original source font, report renderer, algorithms and test timeouts were not modified. Four fixed/local snapshots produced 32 byte-identical rendered pages with original and subset fonts. The first font test exposed fontkit's U+FFFF cmap sentinel; it is explicitly asserted to map to glyph zero, not admitted as a printable character.

Run `42460412921` attempt 1, checkout `34624b9`, then failed Ground testing because the test read the save-completion message immediately after the data commit, before the awaited UI refresh. Manifest verification passed; deployment was skipped; the other seven suites were not run. The regression now waits for the exact completion message and closed preview, retaining observation assertions. No fixed sleep or timeout increase was used. Fresh run `42460811758` passed all eight suites.

Actual public PDFs were rendered page by page and compared with the unchanged original Node renderer using exactly the same captured snapshots: 22 long-report pages, three filtered pages, three empty-period pages, five Structure pages and five UU pages. **All 38 rendered pages are pixel-identical**. Evidence suffix: `1794125117100`. Earlier page-by-page visual review of the same layout found no overlap, cropped tables or footer collisions. Original deliberate note ellipsis and pagination white space remain; full text remains in the exported data package. PDF snapshots do not change after later edits.

Git smart-HTTP transfer failures were retained. API transport uploaded the exact reviewed Git blobs/tree/commit; SHA equality was checked before non-force expected-parent ref updates. No history was rewritten.

## Capability boundary

**Interactive:** original Dashboard/street map/navigation, Ground manual/CSV validation and local updates, point maintenance, configurable 3A/5A, Trend/projection, original Kriging recomputation and PNG, Structure/UU input and analysis/GIS, Layout, current-data report snapshots and real English PDF, local projects and JSON import/export/Reset.

**Local simulation:** role views, workflow ownership, criterion approval, acknowledgment/closure and reminder configuration. These are not trusted authentication or independent approval. Missing criteria is not Normal; workflow closure does not remove engineering severity. Historical snapshots are not rewritten by later criteria.

**Not provided:** application backend, trusted multi-user access, real email delivery, cloud storage/synchronization, server-authenticated audit/signature, production capacity or R6 acceptance. UU angular-deformation alarms, new instrument classes and retrospective reassessment were not added.

## Storage, browser and engineering limitations

- Data is current-page memory. Refresh or close resets it. Use **Export trial data** before leaving; use **Import trial data** to restore. Maximum package 16 MB / 20 projects. Separate tabs/contexts are independent. Optional unfinished-input recovery is separately browser-local; it is not durable project storage.
- Use synthetic/test data only. No project data is uploaded to an application server. Static hosting and OpenStreetMap still receive normal network requests.
- Tested desktop environments are Windows/Edge and Linux/Chromium. A narrow 390 px layout was checked; physical mobile devices and Safari/Firefox were not accepted. Narrow navigation requires scrolling and tables may require horizontal scrolling.
- Maps require Internet access. Tile failure is shown explicitly. Large datasets can block the original synchronous computation. Small four/25-marker probes are not formal capacity approval.
- Contours are interpolated visualization, not a verified survey surface. Projection is illustrative and never saved as observation/alarm input. Grid azimuth is not true north; zero displacement has no direction. UU connectors are schematic.
- Snapshot hashes are local identifiers, not digital signatures. Original source precision, settlement sign, coordinate transformations and engineering algorithms are preserved.
- The existing browser libraries require the documented inline/eval CSP allowances. This public trial is not a security certification. Four low-severity build-only dependency findings were recorded; the implicated unused elliptic code is absent from the shipped bundle.

## Preservation and operations

All 24 recorded protected-file entries, including the original 13, and all 276 R6 evidence files matched their original hashes. The private original main remains `b7b92506afeed479efb55c578b15f03833e3ef92`; the competition branch remains `71295f05ba764dd3f4c0d3a59519c6a65e14c0ea`. Original app authentication, real data, live services, previous previews and failed evidence were not replaced or stopped. Only independent test-owned servers/browsers were cleaned up. No private history, uploads, credentials or raw traces were published. Issue #43 was not closed and this is not R6 acceptance.

To update: build from reviewed original cores in the isolated authoring checkout, verify the allowlist and manifest, run browser tests, commit normally to the separate public repository, then manually run Pages verification/deployment and repeat anonymous URL checks. Do not maintain a second approximate engineering algorithm.

To roll back: use a normal revert commit to the previous verified payload and rerun the manual workflow; do not force-push. To withdraw: disable GitHub Pages in repository settings and stop sharing its URL. Publicly downloaded copies cannot be recalled. Never add private tokens or real data to this repository.
