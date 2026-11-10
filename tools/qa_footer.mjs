import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';

const host = 'http://127.0.0.1:5069';
const viewports = [
  [320, 740], [360, 780], [390, 844], [430, 932], [600, 900], [768, 1024], [820, 1180],
  [1024, 768], [1280, 800], [1536, 960], [1920, 1080], [2560, 1440], [844, 390],
];
const zoomViewports = [[320, 740], [390, 844], [820, 1180], [1536, 960]];
const primary = [['tr', 'paper'], ['en', 'paper'], ['tr', 'night'], ['en', 'ink']];
const themeChecks = [
  ['tr', 'terracotta'], ['en', 'terracotta'], ['tr', 'olive'], ['en', 'olive'],
  ['tr', 'system'], ['en', 'system'],
];
const output = fileURLToPath(new URL('../docs/screenshots/footer/', import.meta.url));
const server = spawn(process.env.PYTHON || 'python', ['-m', 'flask', '--app', 'app:create_app', 'run', '--host', '127.0.0.1', '--port', '5069'], { stdio: 'ignore', windowsHide: true });
const failures = [];
const pageErrors = [];
let browser;

async function waitForServer() {
  for (let attempt = 0; attempt < 70; attempt += 1) {
    try { if ((await fetch(`${host}/api/health`)).ok) return; } catch { /* Flask is starting. */ }
    if (server.exitCode !== null) throw new Error(`Flask exited before startup (${server.exitCode}).`);
    await delay(250);
  }
  throw new Error('Flask did not start on 127.0.0.1:5069.');
}

async function measure(page, language, theme, width, height, zoom) {
  const result = await page.evaluate(() => {
    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    };
    const footer = document.querySelector('#site-footer');
    const footerRect = rect(footer);
    const clipped = [...footer.querySelectorAll('a,button,h2,p,span:not(.sr-only)')].filter((element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && element.scrollWidth > element.clientWidth + 1;
    }).map((element) => `${element.tagName}.${element.className}`);
    const outOfBounds = [...footer.querySelectorAll('*')].filter((element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && (box.left < footerRect.left - 1 || box.right > footerRect.right + 1);
    }).slice(0, 8).map((element) => `${element.tagName}.${element.className}`);
    const tapTargets = [...footer.querySelectorAll('a,button')].filter((element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && getComputedStyle(element).display !== 'none' && (box.width < 44 || box.height < 44);
    }).map((element) => `${element.tagName}.${element.className}:${Math.round(element.getBoundingClientRect().width)}x${Math.round(element.getBoundingClientRect().height)}`);
    const zones = ['.footer-top', '.footer-developer', '.footer-bottom'].map((selector) => rect(footer.querySelector(selector)));
    const overlaps = [];
    for (let i = 0; i < zones.length; i += 1) for (let j = i + 1; j < zones.length; j += 1) {
      if (Math.min(zones[i].right, zones[j].right) - Math.max(zones[i].left, zones[j].left) > 1 && Math.min(zones[i].bottom, zones[j].bottom) - Math.max(zones[i].top, zones[j].top) > 1) overlaps.push(`${i}/${j}`);
    }
    const footerBottom = rect(footer.querySelector('.footer-bottom'));
    const actionBar = document.querySelector('.mobile-action-bar');
    const actionRect = actionBar && getComputedStyle(actionBar).display !== 'none' ? rect(actionBar) : null;
    const bodyOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = 1; colorCanvas.height = 1;
    const colorContext = colorCanvas.getContext('2d', { willReadFrequently: true });
    const rgb = (value) => {
      colorContext.clearRect(0, 0, 1, 1);
      colorContext.fillStyle = value;
      colorContext.fillRect(0, 0, 1, 1);
      return [...colorContext.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const luminance = (value) => {
      const channels = rgb(value);
      if (!channels) return null;
      const linear = channels.map((channel) => { const c = channel / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
      return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
    };
    const contrastFailures = [...footer.querySelectorAll('.footer-description,.footer-privacy,.footer-heading,.footer-developer-byline,.footer-meta,.footer-column a,.footer-column button,.footer-control,.footer-portfolio,.language-switch button')].flatMap((element) => {
      const style = getComputedStyle(element);
      let background = style.backgroundColor;
      if (background.endsWith(', 0)') || background === 'transparent') background = getComputedStyle(footer).backgroundColor;
      const foregroundLuminance = luminance(style.color), backgroundLuminance = luminance(background);
      if (foregroundLuminance === null || backgroundLuminance === null) return [];
      const ratio = (Math.max(foregroundLuminance, backgroundLuminance) + .05) / (Math.min(foregroundLuminance, backgroundLuminance) + .05);
      return ratio < 4.5 ? [`${element.tagName}#${element.id}.${element.className} “${element.textContent.trim().slice(0, 20)}” ${ratio.toFixed(2)}:1 (${style.color} on ${background})`] : [];
    });
    return { bodyOverflow, clipped, outOfBounds, tapTargets, overlaps, footerBottom, actionRect, contrastFailures };
  });
  const { bodyOverflow, clipped, outOfBounds, tapTargets, overlaps, footerBottom, actionRect, contrastFailures, ...detail } = result;
  const failuresForViewport = [];
  if (bodyOverflow) failuresForViewport.push('document overflow');
  if (clipped.length) failuresForViewport.push(`clipped text: ${clipped.join(', ')}`);
  if (outOfBounds.length) failuresForViewport.push(`footer content outside container: ${outOfBounds.join(', ')}`);
  if (overlaps.length) failuresForViewport.push(`footer zones overlap: ${overlaps.join(', ')}`);
  if (width <= 1024 && tapTargets.length) failuresForViewport.push(`small touch targets: ${tapTargets.join(', ')}`);
  if (contrastFailures.length) failuresForViewport.push(`text contrast below WCAG AA: ${contrastFailures.join(', ')}`);
  if (width < 640 && actionRect && footerBottom.bottom > actionRect.top + 1) failuresForViewport.push('sticky action bar overlaps footer controls');
  if (failuresForViewport.length) failures.push({ language, theme, width, height, zoom, problems: failuresForViewport, ...detail });
  return failuresForViewport;
}

async function makePage(language, theme, zoom = false) {
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  await context.addInitScript(({ lang, mode }) => {
    localStorage.setItem('omniqr-lang', lang);
    localStorage.setItem('omniqr-theme', mode);
  }, { lang: language, mode: theme });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/static/css/premium.css', async (route) => {
    const response = await route.fetch();
    const zoomRule = zoom ? ':root{font-size:200%!important}' : '';
    await route.fulfill({ response, body: `${await response.text()}\n${zoomRule}\nhtml.qa-footer-capture #topbar,html.qa-footer-capture .skip-link,html.qa-footer-capture .mobile-action-bar{visibility:hidden!important}` });
  });
  page.on('pageerror', (error) => pageErrors.push(`${language}/${theme}: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(`${language}/${theme}: ${message.text()}`); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(host, { waitUntil: 'domcontentloaded' });
  await page.locator('#site-footer').waitFor({ state: 'visible' });
  await page.waitForFunction(({ lang, mode }) => document.documentElement.lang === lang && document.body.dataset.theme === mode, { lang: language, mode: theme });
  await page.evaluate(() => document.fonts.ready);
  if (zoom) await page.waitForFunction(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize) >= 32);
  return { context, page };
}

async function capturePage(page, language, theme, width, height, zoom = false) {
  await page.setViewportSize({ width, height });
  await page.evaluate(async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const before = document.documentElement.scrollHeight;
      window.scrollTo(0, before);
      await new Promise(requestAnimationFrame);
      if (document.documentElement.scrollHeight === before && window.scrollY >= before - window.innerHeight - 1) break;
    }
  });
  await measure(page, language, theme, width, height, zoom);
  const suffix = zoom ? '-text-zoom-200' : '';
  const name = `${language}-${theme}-${width}x${height}${suffix}.png`;
  await page.evaluate(() => document.documentElement.classList.add('qa-footer-capture'));
  await page.locator('#site-footer').screenshot({ path: join(output, name), animations: 'disabled' });
  await page.evaluate(() => document.documentElement.classList.remove('qa-footer-capture'));
}

try {
  await mkdir(output, { recursive: true });
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  for (const [language, theme] of primary) {
    const standard = await makePage(language, theme);
    for (const [width, height] of viewports) await capturePage(standard.page, language, theme, width, height);
    await standard.context.close();
    const zoom = await makePage(language, theme, true);
    for (const [width, height] of zoomViewports) await capturePage(zoom.page, language, theme, width, height, true);
    await zoom.context.close();
  }
  for (const language of ['tr', 'en']) {
    const themeContext = await browser.newContext({ deviceScaleFactor: 1 });
    await themeContext.addInitScript((lang) => localStorage.setItem('omniqr-lang', lang), language);
    const themePage = await themeContext.newPage();
    await themePage.emulateMedia({ reducedMotion: 'reduce' });
    themePage.on('pageerror', (error) => pageErrors.push(`${language}/theme switch: ${error.message}`));
    themePage.on('console', (message) => { if (message.type() === 'error') pageErrors.push(`${language}/theme switch: ${message.text()}`); });
    await themePage.setViewportSize({ width: 390, height: 844 });
    await themePage.goto(host, { waitUntil: 'domcontentloaded' });
    await themePage.locator('#site-footer').waitFor({ state: 'visible' });
    await themePage.waitForFunction((lang) => document.documentElement.lang === lang, language);
    for (const theme of ['terracotta', 'olive', 'system']) {
      await themePage.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await themePage.locator('#theme-toggle').click();
      await themePage.locator(`#theme-popover [data-set-theme="${theme}"]`).click();
      await themePage.waitForFunction((mode) => document.body.dataset.theme === mode, theme);
      for (const [width, height] of [[320, 740], [390, 844], [1024, 768], [1536, 960]]) await capturePage(themePage, language, theme, width, height);
    }
    await themeContext.close();
  }

  const context = await browser.newContext({ deviceScaleFactor: 1 });
  await context.addInitScript(() => { localStorage.setItem('omniqr-lang', 'tr'); localStorage.setItem('omniqr-theme', 'paper'); });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(host, { waitUntil: 'domcontentloaded' });
  await page.locator('#qr-image.ready').waitFor({ timeout: 15000 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.locator('#footer-theme').click();
  await page.locator('#theme-popover').waitFor({ state: 'visible' });
  await page.locator('#theme-popover').evaluate((element) => { element.hidden = true; });
  await page.locator('#site-footer [data-language="en"]').click();
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
  await page.locator('#back-to-top').click();
  await page.waitForFunction(() => window.scrollY < 2);
  await page.evaluate(() => {
    const prompt = new Event('beforeinstallprompt', { cancelable: true });
    prompt.prompt = () => Promise.resolve();
    window.dispatchEvent(prompt);
  });
  if (!(await page.locator('#footer-install').isVisible())) failures.push({ interaction: 'Install button did not appear after beforeinstallprompt.' });
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  if (await page.locator('#footer-install').isVisible()) failures.push({ interaction: 'Install button remained visible after appinstalled.' });
  await context.close();

  if (pageErrors.length) failures.push({ browserErrors: pageErrors });
  await writeFile(join(output, 'visual-qa-results.json'), JSON.stringify({ viewports: viewports.length, primaryAppearances: primary.length, zoomChecks: zoomViewports.length * primary.length, additionalThemeChecks: themeChecks.length * 4, screenshots: viewports.length * primary.length + zoomViewports.length * primary.length + themeChecks.length * 4, failures }, null, 2));
  if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exitCode = 1; }
  else console.log(`Footer QA passed: ${viewports.length * primary.length + zoomViewports.length * primary.length + themeChecks.length * 4} screenshots, all footer checks clean.`);
} finally {
  await browser?.close();
  server.kill();
}
