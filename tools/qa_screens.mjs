import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';

const host = 'http://127.0.0.1:5067';
const viewports = [
  [320, 740], [360, 780], [375, 812], [390, 844], [412, 915], [430, 932], [600, 850],
  [768, 1024], [820, 1180], [1024, 768], [1280, 800], [1536, 960], [1920, 1080], [2560, 1440], [844, 390],
];
const appearances = [
  ['tr', 'paper'], ['en', 'paper'], ['tr', 'night'], ['en', 'ink'],
];
const output = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
const server = spawn(process.env.PYTHON || 'python', ['-m', 'flask', '--app', 'app:create_app', 'run', '--host', '127.0.0.1', '--port', '5067'], { stdio: 'ignore', windowsHide: true });
let browser;
const failures = [];
const pageErrors = [];

async function waitForServer() {
  for (let attempt = 0; attempt < 70; attempt += 1) {
    try { const response = await fetch(`${host}/api/health`); if (response.ok) return; } catch { /* server is starting */ }
    await delay(250);
  }
  throw new Error('Flask did not start on 127.0.0.1:5067.');
}

try {
  await mkdir(output, { recursive: true });
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  for (const [language, theme] of appearances) {
    const context = await browser.newContext({ deviceScaleFactor: 1 });
    await context.addInitScript(({ lang, mode }) => { localStorage.setItem('omniqr-lang', lang); localStorage.setItem('omniqr-theme', mode); }, { lang: language, mode: theme });
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(`${language}/${theme}: ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(`${language}/${theme}: ${message.text()}`); });
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      await page.goto(host, { waitUntil: 'domcontentloaded' });
      await page.locator('#qr-image.ready').waitFor({ timeout: 15000 });
      await page.evaluate(() => document.fonts.ready);
      const result = await page.evaluate(() => {
        const viewportWidth = document.documentElement.clientWidth;
        const outOfBounds = [...document.querySelectorAll('body *')].filter((element) => {
          if (element.closest('[hidden],dialog:not([open]),.mobile-sheet[aria-hidden="true"],.footer-ornament')) return false;
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && (rect.left < -1 || rect.right > viewportWidth + 1);
        }).slice(0, 8).map((element) => `${element.tagName}.${element.className}`);
        const tapTargets = [...document.querySelectorAll('button,a,summary')].filter((element) => {
          const rect = element.getBoundingClientRect();
          const visible = rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden';
          return visible && innerWidth <= 1024 && (rect.width < 44 || rect.height < 44);
        }).slice(0, 10).map((element) => `${element.tagName}#${element.id}.${element.className}:${Math.round(element.getBoundingClientRect().width)}x${Math.round(element.getBoundingClientRect().height)}:${element.textContent.trim().slice(0, 18)}`);
        const clippedText = [...document.querySelectorAll('.brand-wordmark,.desktop-nav a,.section-head h2,.step-card h3,.faq-item summary,.footer-group summary')].filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && getComputedStyle(element).visibility !== 'hidden' && element.scrollWidth > element.clientWidth + 1;
        }).slice(0, 10).map((element) => `${element.tagName}.${element.className}`);
        return { overflow: document.documentElement.scrollWidth > viewportWidth + 1, scrollWidth: document.documentElement.scrollWidth, outOfBounds, tapTargets, clippedText };
      });
      if (result.overflow || result.outOfBounds.length || result.tapTargets.length || result.clippedText.length) failures.push({ language, theme, width, height, ...result });
      const filename = `${language}-${theme}-${width}x${height}.jpg`;
      await page.screenshot({ path: join(output, filename), fullPage: true, type: 'jpeg', quality: 76, animations: 'disabled' });
    }
    if (language === 'tr' && theme === 'paper') {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(host, { waitUntil: 'domcontentloaded' });
      await page.locator('#qr-image.ready').waitFor({ timeout: 15000 });
      await page.locator('#menu-button').click();
      if (await page.locator('#mobile-sheet').getAttribute('aria-hidden') !== 'false') throw new Error('Mobile navigation did not open.');
      await page.locator('#mobile-theme-trigger').click();
      if (!(await page.locator('#mobile-theme-options').isVisible())) throw new Error('Mobile theme options did not open.');
      await page.locator('#mobile-theme-options [data-set-theme="night"]').click();
      await page.waitForFunction(() => document.body.dataset.theme === 'night', null, { timeout: 5000 });
      await page.locator('#mobile-sheet [data-language="en"]').click();
      await page.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: 5000 });
      await page.locator('#menu-close').click();
      if (await page.locator('#mobile-sheet').getAttribute('aria-hidden') !== 'true') throw new Error('Mobile navigation did not close.');
      await page.locator('#action-style').click();
      if (!(await page.locator('#style-controls').evaluate((element) => element.classList.contains('is-sheet')))) throw new Error('Mobile style sheet did not open.');
      await page.locator('#sheet-backdrop').click({ position: { x: 10, y: 10 } });
      if (await page.locator('#style-controls').evaluate((element) => element.classList.contains('is-sheet'))) throw new Error('Mobile style sheet did not close.');
    }
    await context.close();
  }
  if (pageErrors.length) failures.push({ browserErrors: pageErrors });
  await writeFile(join(output, 'visual-qa-results.json'), JSON.stringify({ viewports: viewports.length, appearances: appearances.length, checks: viewports.length * appearances.length, failures }, null, 2));
  if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exitCode = 1; }
  else console.log(`Visual QA passed: ${viewports.length * appearances.length} viewport/theme combinations.`);
} finally {
  await browser?.close();
  server.kill();
}
