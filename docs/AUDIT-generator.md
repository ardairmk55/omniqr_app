# Generator audit

Baseline audit began before implementation on 2026-11-11. Findings were recorded before the fixes. The final Playwright pass runs through the rendered Flask app and its real test client, with network routing because this isolated Windows test session cannot reach a separately launched localhost server.

| Issue | Severity | Baseline finding | Status |
|---|---|---|---|
| Invalid or partial fields reach `/api/generate` | P0 | Baseline sent invalid inputs; browser pass now asserts no request for empty, partial, or over-limit values. | Fixed and verified |
| QR preview disappears during generation or invalid edits | P1 | Last successful QR remains visible, dimmed and labeled; invalid fields receive `aria-invalid`; status changes are announced. | Fixed and verified |
| Stale generation responses can replace newer output | P1 | Debounced 300 ms, aborted prior fetches, sequence-checked responses; one expected abort was recorded in Playwright. | Fixed and verified |
| 429, offline, and backend validation errors lack localized states | P1 | Stable API codes map to Turkish/English messages; Playwright simulated 429 and network failure. | Fixed and verified |
| Content-type choices leave a short final row | P2 | The grid uses three columns on wide screens and a two-column grid on phones. | Fixed and verified |
| Appearance step is unnumbered | P2 | Appearance now shows 03 / 03. | Fixed |
| Hero sample disagrees with the generated link | P1 | TR and EN hint and initial link use `https://example.com`; Playwright checks the first generation payload. | Fixed and verified |
| Default QR ink is green | P1 | UI, API, and renderer default to `#2a1f1b`; a pixel-level API test verifies the ink. | Fixed and verified |
| Content values are lost when switching types and after reload | P1 | Per-type form values and all six appearance controls persist; Wi-Fi password survives type switches in memory only. | Fixed and verified |
| Sensitive Wi-Fi values can enter saved favorites/session | P1 | Wi-Fi passwords are removed from favorites and session storage and are blank after reload. | Fixed and verified |
| Export filenames are not localized or sanitized | P2 | Download names use localized content-type labels, ASCII transliteration, safe characters, and the correct extension. | Fixed and verified |
| SVG background and export round trips | P1 | SVG previously had no painted background; it now contains vector paths plus a vector background rectangle. Pytest decodes every type in PNG, SVG, JPEG, WebP, PDF and PNG at all four sizes. | Fixed and verified |
| Responsive overflow, clipping, touch targets, focus, and visual states | P2 | Layout measured at 390×844 touch, 768×844, and 1280×844; no horizontal overflow or clipped generator text, and all audited phone targets are at least 44 px. | Verified; screenshots reviewed |

## Browser pass

Playwright script: `tools/qa_generator.mjs`. It covers 390×844 touch, 768px, and 1280px layouts; all eleven types; empty, partial, long, and special-character values; every appearance control; current and persisted form state; copy; PNG/SVG/JPEG/WebP/PDF downloads; each offered PNG size; and simulated 429/network states. Screenshots are saved in `test-results/` for 390px, 768px, 1280px, and English dark mode. It reported zero browser console errors, zero unexpected failed requests, zero unexpected API error responses, no horizontal overflow, and no clipped selected text.

## Fixes found during verification

- Empty coordinates passed JavaScript's `Number("") === 0` check. Both coordinate fields are now required before numeric range checks.
- First-load localization captured an empty form before rendering fields and overwrote session data. Capture now waits until the form has controls.
- First-load color input dispatch overwrote saved appearance values with defaults. Initialization now restores the saved controls before generation.
- QR filename values are derived from translated content labels and normalized to safe ASCII; Wi-Fi secrets never enter the saved session.
