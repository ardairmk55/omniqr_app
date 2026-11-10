import { chromium } from 'playwright';

const base = process.env.QA_NAV_URL || 'http://127.0.0.1:5000';
const targets = ['generator', 'how', 'faq', 'privacy'];
const browser = await chromium.launch({ headless: true });
const failures = [];
try {
  for (const [width, height, mobile] of [[390, 844, true], [768, 1024, true], [1280, 800, false]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
    await context.addInitScript(() => localStorage.setItem('omniqr-lang', 'tr'));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.lang === 'tr' || document.documentElement.lang === 'en');
    for (const id of targets) {
      if (mobile) await page.locator('#menu-button').tap();
      const link = mobile ? page.locator(`#mobile-sheet a[href="#${id}"]`) : page.locator(`.desktop-nav a[href="#${id}"]`);
      if (mobile) await link.tap(); else await link.click();
      const heading = page.locator(`#${id} h1, #${id} h2`).first();
      await heading.waitFor();
      await page.waitForFunction(({ id }) => location.hash === `#${id}` && document.querySelector(`#${id} h1, #${id} h2`)?.getAttribute('tabindex') === '-1', { id });
      await page.waitForFunction(({ id }) => Math.abs(document.querySelector(`#${id} h1, #${id} h2`).getBoundingClientRect().top - document.querySelector('#topbar').getBoundingClientRect().bottom - 18) <= 8, { id }, { timeout: 1500 }).catch(() => {});
      const state = await page.evaluate((id) => ({
        hash: location.hash,
        panelOpen: document.querySelector('#mobile-sheet').getAttribute('aria-hidden') === 'false',
        bodyPosition: getComputedStyle(document.body).position,
        bodyOverflow: getComputedStyle(document.body).overflow,
        bodyTop: document.body.style.top,
        htmlOverflow: document.documentElement.style.overflow,
        active: [...document.querySelectorAll('[data-nav],.mobile-nav-links a')].filter(link => link.getAttribute('aria-current') === 'location').map(link => link.dataset.nav || link.hash.slice(1)),
        targetTop: document.querySelector(`#${id} h1, #${id} h2`).getBoundingClientRect().top,
        headerBottom: document.querySelector('#topbar').getBoundingClientRect().bottom,
      }), id);
      if (state.hash !== `#${id}` || state.panelOpen || state.bodyPosition === 'fixed' || state.bodyOverflow === 'hidden' || state.bodyTop || state.htmlOverflow || state.active[0] !== id || Math.abs(state.targetTop - state.headerBottom - 18) > 8) failures.push({ width, id, state });
    }
    if (errors.length) failures.push({ width, errors });
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`${base}/#faq`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => location.hash === '#faq' && document.querySelector('#faq h2')?.getAttribute('tabindex') === '-1');
  if (await page.locator('#faq h2').evaluate(el => Math.abs(el.getBoundingClientRect().top - document.querySelector('#topbar').getBoundingClientRect().bottom - 18) > 8)) failures.push({ directHash: 'target offset failed' });
  await context.close();
} finally { await browser.close(); }
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exitCode = 1; }
else console.log('Navigation QA passed: 12 link activations across 390, 768, and 1280px plus direct #faq load.');
