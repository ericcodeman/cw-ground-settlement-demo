# Candidate verification

Product source version: `71295f05ba764dd3f4c0d3a59519c6a65e14c0ea`.
Isolated authoring commit: `96e597f` (not pushed to the private product branches).
Browser build: `browser-trial-a46b2cfe6ab6b86b`.
Payload SHA256: `a46b2cfe6ab6b86b5dc8e5f4184a51fd8e258f5b41cdfe520c47565b5d773be3`.

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
