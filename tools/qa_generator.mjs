import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:5000';
const widths = [390, 768, 1280];
const validValues = {
  url: { value: 'https://example.com' }, text: { value: 'Merhaba, dünya! İ ı ş ğ ç ö ü 🙂\n"tırnak"' },
  wifi: { ssid: 'Omni, ağ; İ ş 🙂', password: 'gizli; "şifre"', security: 'WPA', hidden: false },
  vcard: { name: 'Çağrı Yılmaz', phone: '+905551112233', email: 'cagri@example.com' },
  email: { to: 'ada@example.com', subject: 'Merhaba, İ', body: 'Selam; dünya 🙂\n"evet"' },
  phone: { value: '+905551112233' }, sms: { phone: '+905551112233', message: 'Selam, ş ğ 🙂' },
  whatsapp: { phone: '+90 555 111 2233', message: 'Merhaba; 🙂' }, geo: { lat: '41.0082', lng: '28.9784' },
  event: { title: 'İstanbul, etkinlik 🙂', start: '2026-11-12T12:00', end: '2026-11-12T13:00' },
  social: { value: 'https://example.com/profil' },
};
const selectedTypes = process.env.QA_QUICK ? ['url'] : Object.keys(validValues);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
const results = { baseURL, widths: [], types: [], appearance: [], validTypesByWidth: { 390: [] }, consoleErrors: [], failedRequests: [], abortedRequests: [], expectedNetworkFailures: [], apiResponses: [] };
let forcedApiStatus = 0;
let abortNextGenerate = false;
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, locale: 'tr-TR', serviceWorkers: 'block' });
await context.addInitScript(() => {
  if (sessionStorage.getItem('generatorSeeded')) return;
  localStorage.setItem('omniqr-favorites', JSON.stringify([{ type: 'wifi', data: { ssid: 'old-network', password: 'LEGACY-SECRET' }, time: 1 }]));
  localStorage.setItem('omniqr-generator-session', JSON.stringify({ type: 'url', forms: { wifi: { ssid: 'old-network', password: 'LEGACY-SECRET' } }, appearance: {} }));
  sessionStorage.setItem('generatorSeeded', '1');
});
const page = await context.newPage();
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  if (results.simulatingErrorState) results.expectedSimulationConsoleErrors.push(message.text());
  else results.consoleErrors.push(message.text());
});
results.generateRequests = 0;
page.on('request', (request) => {
  if (new URL(request.url()).pathname !== '/api/generate') return;
  results.generateRequests += 1;
  try { const body = request.postDataJSON(); if (body.type === 'url' && body.data?.value === 'https://example.com') results.defaultUrlPayload = body.data.value; } catch { /* malformed requests are covered by API tests */ }
});
page.on('requestfailed', (request) => {
  const failure = { url: request.url(), error: request.failure()?.errorText };
  if (request.url().includes('/api/generate') && results.expectNetworkFailure) { results.expectNetworkFailure = false; results.expectedNetworkFailures.push(failure); }
  else if (failure.error === 'net::ERR_ABORTED') results.abortedRequests.push(failure);
  else results.failedRequests.push(failure);
});
page.on('response', async (response) => {
  if (response.url().includes('/api/')) {
    let body = null;
    try { body = await response.json(); } catch { /* non-JSON response */ }
    results.apiResponses.push({ path: new URL(response.url()).pathname, status: response.status(), code: body?.error?.code || null, mime: body?.mime || null, extension: body?.extension || null, fileLength: body?.file?.length || null, resolution: body?.resolution || null });
  }
});
// Use Playwright's network routing with Flask's real test client. This keeps
// the UI/API audit runnable in isolated Windows sessions without opening ports.
const pythonBridge = `import json,sys\nfrom app import create_app\napp=create_app({'TESTING':True})\nclient=app.test_client()\npath=sys.argv[1]\nif path=='/':\n r=client.get('/')\n print(json.dumps({'status':r.status_code,'content_type':r.content_type,'body':r.get_data(as_text=True)}))\nelse:\n method=sys.argv[2]\n raw=sys.stdin.read()\n payload=json.loads(raw) if raw else None\n r=client.open(path,method=method,json=payload)\n print(json.dumps({'status':r.status_code,'content_type':r.content_type,'body':r.get_data(as_text=True)}))`;
await page.route('**/*', async (route) => {
  const request = route.request(); const url = new URL(request.url());
  if (url.origin !== baseURL) return route.continue();
  if (url.pathname === '/api/generate' && abortNextGenerate) {
    abortNextGenerate = false; results.expectNetworkFailure = true; await route.abort('failed'); return;
  }
  if (url.pathname === '/api/generate' && forcedApiStatus) {
    const status = forcedApiStatus; forcedApiStatus = 0;
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: { code: status === 429 ? 'RATE_LIMITED' : 'ERROR', details: {} } }) });
  }
  let result;
  if (url.pathname.startsWith('/static/')) {
    const file = resolve('app', url.pathname.slice(1));
    if (existsSync(file)) result = { status: 200, content_type: ({ '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream', body: readFileSync(file) };
    else result = { status: 404, content_type: 'text/plain', body: 'Not found' };
    return route.fulfill({ status: result.status, contentType: result.content_type, body: result.body });
  }
  const args = [pythonBridge, url.pathname];
  if (url.pathname !== '/') args.push(request.method());
  const output = spawnSync('python', ['-c', ...args], { input: request.postData() || '', encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (output.status !== 0) return route.fulfill({ status: 500, contentType: 'text/plain', body: output.stderr || 'Flask test client failed' });
  result = JSON.parse(output.stdout);
  return route.fulfill({ status: result.status, contentType: result.content_type, body: result.body });
});
await page.goto(baseURL, { waitUntil: 'networkidle' });
await page.waitForSelector('#qr-image.ready');
if (results.defaultUrlPayload !== 'https://example.com') throw new Error(`The default field and QR request disagree: ${results.defaultUrlPayload}`);
if ((await page.evaluate(() => localStorage.getItem('omniqr-favorites'))).includes('LEGACY-SECRET')) throw new Error('A previously stored Wi-Fi favorite password was not scrubbed.');
if ((await page.evaluate(() => localStorage.getItem('omniqr-generator-session'))).includes('LEGACY-SECRET')) throw new Error('A previously stored Wi-Fi session password was not scrubbed.');
await page.locator('.type-chip[data-type="url"]').focus();
await page.keyboard.press('Tab');
const focusAfterUrl = await page.evaluate(() => ({ type: document.activeElement?.dataset.type, ring: getComputedStyle(document.activeElement).outlineWidth }));
await page.keyboard.press('Tab');
const focusAfterText = await page.evaluate(() => document.activeElement?.dataset.type);
if (focusAfterUrl.type !== 'text' || focusAfterText !== 'wifi' || parseFloat(focusAfterUrl.ring) < 2) throw new Error(`Unexpected generator keyboard order/focus ring: ${JSON.stringify({ focusAfterUrl, focusAfterText })}`);
results.focusOrder = ['url', 'text', 'wifi'];
for (const type of selectedTypes) {
  await page.locator(`.type-chip[data-type="${type}"]`).click();
  const inputs = page.locator('#fields input:not([type=checkbox]), #fields textarea, #fields select');
  const names = await inputs.evaluateAll((els) => els.map((el) => el.name));
  let invalidBaseline = results.generateRequests;
  // Capture empty and partial states before entering complete valid values.
  if (names.length) {
    const first = page.locator(`#fields [name="${names[0]}"]`);
    const inputType = await first.getAttribute('type');
    await first.fill('');
    await page.waitForTimeout(500);
    if (results.generateRequests !== invalidBaseline) throw new Error(`${type}: empty input called /api/generate`);
    const stalePreview = await page.locator('#qr-image').evaluate((el) => ({ ready: el.classList.contains('ready'), dimmed: el.classList.contains('waiting-valid'), badge: !document.querySelector('#qr-pending').hidden }));
    if (!stalePreview.ready || !stalePreview.dimmed || !stalePreview.badge) throw new Error(`${type}: invalid input did not preserve and label the last valid QR: ${JSON.stringify(stalePreview)}`);
    results.types.push({ type, phase: 'empty', requests: results.apiResponses.filter((x) => x.path === '/api/generate').length });
    if (['number', 'datetime-local'].includes(inputType)) await first.fill('');
    else await first.fill('İ,;🙂"\n');
    await page.waitForTimeout(500);
    if (['text', 'wifi', 'vcard'].includes(type)) {
      if (results.generateRequests === invalidBaseline) throw new Error(`${type}: valid special-character input did not call /api/generate`);
      invalidBaseline = results.generateRequests;
    } else if (results.generateRequests !== invalidBaseline) throw new Error(`${type}: partial/special input called /api/generate`);
    results.types.push({ type, phase: 'partial-or-special', requests: results.apiResponses.filter((x) => x.path === '/api/generate').length });
    if (!['number', 'datetime-local', 'email'].includes(inputType)) {
      const longValue = 'ğ'.repeat(1200);
      if (type === 'geo') await first.fill('999');
      else if (type === 'email') await page.locator('#fields [name="body"]').fill(longValue);
      else if (type === 'sms' || type === 'whatsapp') await page.locator('#fields [name="message"]').fill(longValue);
      else await first.fill(longValue);
      await page.waitForTimeout(400);
      if (results.generateRequests !== invalidBaseline) throw new Error(`${type}: invalid long input called /api/generate`);
      results.types.push({ type, phase: 'very-long', requests: results.apiResponses.filter((x) => x.path === '/api/generate').length });
    }
  }
  for (const [name, value] of Object.entries(validValues[type])) {
    const input = page.locator(`#fields [name="${name}"]`);
    if (await input.count()) {
      if (name === 'hidden') await input.setChecked(Boolean(value));
      else if (name === 'security') await input.selectOption(value);
      else await input.fill(String(value));
    }
  }
  await page.waitForTimeout(600);
  if (results.generateRequests === invalidBaseline) throw new Error(`${type}: valid input did not call /api/generate`);
  results.types.push({ type, phase: 'valid', ready: await page.locator('#qr-image').evaluate((el) => el.classList.contains('ready')), payloadCalls: results.apiResponses.filter((x) => x.path === '/api/generate').length });
  results.validTypesByWidth[390].push(type);
}
for (const selector of ['#foreground', '#background', '#shape', '#correction', '#border', '#resolution']) {
  const control = page.locator(selector);
  if (selector === '#foreground') await control.fill('#2a1f1b');
  else if (selector === '#background') await control.fill('#f5f0e6');
  else if (selector === '#shape') await control.selectOption('rounded');
  else if (selector === '#correction') await control.selectOption('H');
  else if (selector === '#border') await control.fill('6');
  else await control.selectOption('2048');
  await page.waitForTimeout(400);
  results.appearance.push({ selector, value: await control.inputValue() });
}
for (const width of (process.env.QA_QUICK ? [390] : widths)) {
  await page.setViewportSize({ width, height: 844 });
  if (width !== 390) {
    for (const type of selectedTypes) {
      await page.locator(`.type-chip[data-type="${type}"]`).click();
      for (const [name, value] of Object.entries(validValues[type])) {
        const input = page.locator(`#fields [name="${name}"]`);
        if (!(await input.count())) continue;
        if (name === 'hidden') await input.setChecked(Boolean(value));
        else if (name === 'security') await input.selectOption(value);
        else await input.fill(String(value));
      }
      await page.waitForTimeout(450);
      if (!(await page.locator('#qr-image').evaluate((el) => el.classList.contains('ready')))) throw new Error(`${width}px ${type} did not render a QR image`);
      results.validTypesByWidth[width] ??= [];
      results.validTypesByWidth[width].push(type);
    }
  }
  await page.waitForTimeout(250);
  const metrics = await page.evaluate(() => ({
    width: innerWidth, documentWidth: document.documentElement.scrollWidth,
    scrollX, bodyWidth: document.body.getBoundingClientRect().width,
    workspace: { display: getComputedStyle(document.querySelector('.workspace')).display, left: document.querySelector('.workspace').getBoundingClientRect().left, right: document.querySelector('.workspace').getBoundingClientRect().right },
    clippedText: [...document.querySelectorAll('.type-chip, .field, .proof-card, .export-options button')]
      .filter((el) => el.getBoundingClientRect().width && (el.scrollWidth > el.clientWidth + 2)).length,
    offscreenGeneratorNodes: [...document.querySelectorAll('.workspace, .left-column, .right-column, .type-grid, #fields, .proof-card, .qr-frame, #style-controls')]
      .filter((el) => el.getBoundingClientRect().width && (el.getBoundingClientRect().left < -1 || el.getBoundingClientRect().right > innerWidth + 1)).map((el) => el.className || el.id),
    activeElement: document.activeElement?.id || document.activeElement?.name || document.activeElement?.className || document.activeElement?.tagName,
    typeColumns: getComputedStyle(document.querySelector('.type-grid')).gridTemplateColumns,
    appearanceStepVisible: getComputedStyle(document.querySelector('.styling-head')).display !== 'none' && document.querySelector('.styling-head .step-index').textContent.trim() === '03 / 03',
    smallTapTargets: [...document.querySelectorAll('.type-chip, .color-control input, #shape, #correction, #border, #resolution, .export-options button')]
      .filter((el) => Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height) < 44).map((el) => el.id || el.dataset.type || el.dataset.export || el.name || el.tagName),
  }));
  results.widths.push(metrics);
  if (metrics.documentWidth > width || metrics.scrollX !== 0 || metrics.clippedText || metrics.offscreenGeneratorNodes.length || !metrics.appearanceStepVisible || (width === 390 && metrics.smallTapTargets.length)) throw new Error(`Responsive layout issue at ${width}px: ${JSON.stringify(metrics)}`);
  await page.evaluate(() => { document.documentElement.scrollTop = 0; document.body.scrollTop = 0; window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); });
  await page.waitForTimeout(100);
  await page.screenshot({ path: `test-results/generator-${width}.png`, fullPage: false });
}
if (results.apiResponses.some((entry) => entry.status >= 400)) throw new Error(`Unexpected API error response: ${JSON.stringify(results.apiResponses.filter((entry) => entry.status >= 400))}`);
if (results.consoleErrors.length || results.failedRequests.length) throw new Error(`Browser errors: ${JSON.stringify({ consoleErrors: results.consoleErrors, failedRequests: results.failedRequests })}`);
await page.setViewportSize({ width: 390, height: 844 });
await page.locator('#menu-button').click();
await page.locator('#mobile-sheet [data-language="en"]').click();
await page.locator('#menu-close').click();
if (await page.locator('html').getAttribute('lang') !== 'en') throw new Error('English locale did not apply');
await page.locator('#theme-toggle').click();
await page.locator('[data-set-theme="ink"]').first().click();
await page.evaluate(() => { document.documentElement.scrollTop = 0; document.body.scrollTop = 0; window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); });
await page.waitForTimeout(300);
const darkViewState = await page.evaluate(() => ({ width: innerWidth, scrollX, bodyClass: document.body.className, menuOpen: document.querySelector('#mobile-sheet').classList.contains('open'), bodyLocked: document.body.classList.contains('menu-open'), backdropHidden: document.querySelector('#menu-backdrop').hidden, themeOpen: !document.querySelector('#theme-popover').hidden, mobileThemesOpen: !document.querySelector('#mobile-theme-options').hidden }));
if (darkViewState.width !== 390 || darkViewState.scrollX !== 0 || darkViewState.menuOpen || darkViewState.bodyLocked || !darkViewState.backdropHidden || darkViewState.themeOpen || darkViewState.mobileThemesOpen) throw new Error(`Dark screenshot captured an overlay or shifted page: ${JSON.stringify(darkViewState)}`);
await page.screenshot({ path: 'test-results/generator-en-dark-390.png', fullPage: false });
results.screenThemes = ['tr-paper-390', 'en-ink-390'];
await page.locator('#menu-button').click();
await page.locator('#mobile-sheet [data-language="tr"]').click();
await page.locator('#menu-close').click();
if (await page.locator('html').getAttribute('lang') !== 'tr') throw new Error('Turkish locale did not restore');
await page.locator('#theme-toggle').click();
await page.locator('[data-set-theme="paper"]').first().click();
await page.locator('.type-chip[data-type="wifi"]').click();
await page.locator('#fields [name="ssid"]').fill('özel-ağ');
await page.locator('#fields [name="password"]').fill('SECRET-DO-NOT-STORE');
await page.locator('#favorite').click();
await page.waitForTimeout(350);
const beforeReload = await page.evaluate(() => ({ ssid: document.querySelector('#fields [name="ssid"]')?.value, form: [...new FormData(document.querySelector('#qr-form')).entries()], session: localStorage.getItem('omniqr-generator-session') }));
if (beforeReload.ssid !== 'özel-ağ' || !beforeReload.session.includes('özel-ağ')) throw new Error(`Wi-Fi form did not persist before reload: ${JSON.stringify(beforeReload)}`);
const savedSession = beforeReload.session;
if (savedSession.includes('SECRET-DO-NOT-STORE') || (await page.evaluate(() => localStorage.getItem('omniqr-favorites'))).includes('SECRET-DO-NOT-STORE')) throw new Error('Wi-Fi password was persisted in localStorage or favorites');
await page.locator('.type-chip[data-type="text"]').click();
await page.locator('.type-chip[data-type="wifi"]').click();
if (await page.locator('#fields [name="password"]').inputValue() !== 'SECRET-DO-NOT-STORE') throw new Error('Wi-Fi password was lost when switching content types during this session');
await page.reload({ waitUntil: 'networkidle' });
if (await page.locator('#fields [name="ssid"]').inputValue() !== 'özel-ağ') throw new Error(`Wi-Fi SSID was not restored after reload: type=${await page.locator('.type-chip.active').getAttribute('data-type')} value=${await page.locator('#fields [name="ssid"]').inputValue()} session=${await page.evaluate(() => localStorage.getItem('omniqr-generator-session'))}`);
if (await page.locator('#fields [name="password"]').inputValue() !== '') throw new Error('Wi-Fi password was restored after reload');
const hash = await page.evaluate(() => location.hash);
if (hash.includes('SECRET-DO-NOT-STORE')) throw new Error('A secret was placed in the URL hash');
const restoredAppearance = await page.evaluate(() => Object.fromEntries(['foreground', 'background', 'shape', 'correction', 'border', 'resolution'].map((id) => [id, document.querySelector(`#${id}`).value])));
if (restoredAppearance.foreground !== '#2a1f1b' || restoredAppearance.shape !== 'rounded' || restoredAppearance.correction !== 'H' || restoredAppearance.border !== '6' || restoredAppearance.resolution !== '2048') throw new Error(`Appearance settings did not restore: ${JSON.stringify(restoredAppearance)}`);
for (const [type, values] of Object.entries(validValues)) {
  await page.locator(`.type-chip[data-type="${type}"]`).click();
  for (const [name, expected] of Object.entries(values)) {
    const input = page.locator(`#fields [name="${name}"]`);
    if (!(await input.count()) || name === 'password') continue;
    const actual = name === 'hidden' ? await input.isChecked() : await input.inputValue();
    const expectedValue = type === 'wifi' && name === 'ssid' ? 'özel-ağ' : expected;
    if (String(actual) !== String(expectedValue)) throw new Error(`${type}.${name} was not restored: ${actual}`);
  }
}
await page.locator('.type-chip[data-type="wifi"]').click();
await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL });
await page.locator('#copy-image').click();
await page.waitForFunction(() => document.querySelector('#toast')?.classList.contains('show'));
results.copy = 'passed';
for (const [selector, format] of [['#download', 'png'], ['[data-export="svg"]', 'svg'], ['[data-export="jpeg"]', 'jpg'], ['[data-export="webp"]', 'webp'], ['[data-export="pdf"]', 'pdf']]) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator(selector).click()]);
  if (!download.suggestedFilename().endsWith(`.${format}`)) throw new Error(`Wrong ${format} filename: ${download.suggestedFilename()}`);
  results.downloads ??= [];
  results.downloads.push(download.suggestedFilename());
  await download.cancel();
}
for (const resolution of ['512', '1024', '2048', '4096']) {
  await page.locator('#resolution').selectOption(resolution);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
  if (!download.suggestedFilename().endsWith('.png')) throw new Error(`PNG ${resolution} export did not download`);
  await download.cancel();
}
const exportResponses = results.apiResponses.filter((entry) => entry.path === '/api/export');
if (exportResponses.length !== 9 || exportResponses.some((entry) => !entry.mime || !entry.extension || !entry.fileLength || entry.status !== 200)) throw new Error(`Export API responses are incomplete: ${JSON.stringify(exportResponses)}`);
if (!['512', '1024', '2048', '4096'].every((size) => exportResponses.some((entry) => entry.mime === 'image/png' && String(entry.resolution) === size))) throw new Error('A PNG resolution was not exported.');
const trMessages = JSON.parse(readFileSync('app/static/i18n/tr.json', 'utf8'));
results.expectedSimulationConsoleErrors = [];
results.simulatingErrorState = true;
forcedApiStatus = 429;
await page.locator('#fields [name="ssid"]').fill('rate-limit-network');
await page.waitForFunction((message) => document.querySelector('#score-text')?.textContent === message, trMessages.errRateLimit);
abortNextGenerate = true;
await page.locator('#fields [name="ssid"]').fill('network-error-test');
await page.waitForFunction((message) => document.querySelector('#score-text')?.textContent === message, trMessages.errNetwork);
results.simulatingErrorState = false;
results.simulatedStates = ['429 localized', 'network localized'];
await page.locator('#fields [name="ssid"]').fill('restored-after-error');
await page.waitForTimeout(500);
if (results.consoleErrors.length || results.failedRequests.length) throw new Error(`Unexpected browser errors: ${JSON.stringify({ consoleErrors: results.consoleErrors, failedRequests: results.failedRequests })}`);
console.log(JSON.stringify({
  status: 'PASS', url: results.baseURL, viewportWidths: results.widths.map(({ width, documentWidth, clippedText, typeColumns, smallTapTargets }) => ({ width, documentWidth, clippedText, typeColumns, smallTapTargets })),
  typesPerViewport: Object.fromEntries(Object.entries(results.validTypesByWidth).map(([width, types]) => [width, types.length])),
  invalidInputApiCalls: '0', defaultUrlPayload: results.defaultUrlPayload, appearanceControls: results.appearance.map(({ selector }) => selector),
  exports: exportResponses.map(({ mime, extension, resolution, fileLength }) => ({ mime, extension, resolution, bytesBase64: fileLength })),
  copy: results.copy, downloads: results.downloads, simulatedStates: results.simulatedStates, focusOrder: results.focusOrder,
  consoleErrors: results.consoleErrors, expectedSimulationConsoleErrors: results.expectedSimulationConsoleErrors, unexpectedFailedRequests: results.failedRequests.length,
  abortedStaleRequests: results.abortedRequests.length, simulatedNetworkFailures: results.expectedNetworkFailures.length, screenshots: ['test-results/generator-390.png', 'test-results/generator-768.png', 'test-results/generator-1280.png', 'test-results/generator-en-dark-390.png'],
}, null, 2));
await browser.close();
