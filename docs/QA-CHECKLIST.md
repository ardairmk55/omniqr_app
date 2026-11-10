# QA checklist

## Automated viewport run

Run `npm run qa:screens`. The Playwright script starts Flask and captures full-page screenshots for Turkish/English with the linen and two dark palettes across the configured phone, tablet, desktop, landscape, and 4K viewports. It reports horizontal overflow, interactive controls below 44px on touch viewports, off-canvas elements, and browser console errors in `docs/screenshots/visual-qa-results.json`.

## Manual device checks

- [ ] iOS Safari: add to Home Screen, safe areas, share sheet, keyboard focus, landscape, and the offline shell.
- [ ] Android Chrome: install prompt, system back with the menu or style sheet open, keyboard, landscape, haptics, and offline shell.
- [ ] Desktop Chrome/Edge/Firefox: install, update toast, keyboard navigation, all theme choices, and 200% zoom.
- [ ] Scan each of the 11 content payload families and all four module shapes on a physical phone.
- [ ] Test on 320 / 360 / 375 / 390 / 412 / 430 / 600 / 768 / 820 / 1024 / 1280 / 1536 / 1920 / 2560 CSS-pixel widths, portrait and landscape.
- [ ] Test reduced motion, forced colors, increased contrast, large OS font size, and split-screen/foldable layouts.
- [ ] Verify PWA icons, maskable safe area, first install, app update flow, and install-hidden standalone behavior.
