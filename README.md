# WB Specialty Shakes — SCORM Training

Wahlburgers Specialty Shakes LTO training (Fruity Pebbles & Kit Kat), packaged as
SCORM 1.2 for the Schoox LMS.

## Contents

| Path | Description |
|------|-------------|
| `CounterService/` | Counter-Service edition source (16 oz takeout builds only) |
| `FullService/` | Full-Service edition source (12 oz dine-in + 16 oz takeout builds) |
| `original_zips/` | Original SCORM zips as uploaded, kept as a restore point |
| `preview/` | Self-contained single-file HTML previews for proofing before import |
| `dist/` | Re-packaged SCORM zips ready to import into Schoox |

## Each SCORM package

- `index.html` — the full interactive module (CSS + screen logic inline)
- `scorm.js` — SCORM 1.2 runtime wrapper (falls back to standalone for preview)
- `assets/images.js` — all photography/branding embedded as base64 data URIs
- `imsmanifest.xml` — SCORM manifest (mastery score 90)

## Previewing

Open any file in `preview/` directly in a browser — no server or LMS needed.
The module detects there is no LMS and runs in standalone mode so you can click
through every screen exactly as a learner would.
