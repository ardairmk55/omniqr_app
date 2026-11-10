const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const TYPES = ['url', 'text', 'wifi', 'vcard', 'email', 'phone', 'sms', 'whatsapp', 'geo', 'event', 'social'];
const initialType = new URLSearchParams(location.search).get('type');
const state = { type: TYPES.includes(initialType) ? initialType : 'url', lang: localStorage.getItem('omniqr-lang'), image: '' };
const fieldsByType = {
  url: [['value', 'labelValue', 'url']], text: [['value', 'labelText', 'textarea']],
  wifi: [['ssid', 'labelSsid', 'text'], ['password', 'labelPassword', 'password'], ['security', 'labelSecurity', 'select']],
  vcard: [['name', 'labelName', 'text'], ['phone', 'labelPhone', 'tel'], ['email', 'labelEmail', 'email']],
  email: [['to', 'labelTo', 'email'], ['subject', 'labelSubject', 'text'], ['body', 'labelBody', 'textarea']],
  phone: [['value', 'labelPhone', 'tel']], sms: [['phone', 'labelPhone', 'tel'], ['message', 'labelMessage', 'textarea']],
  whatsapp: [['phone', 'labelPhone', 'tel'], ['message', 'labelMessage', 'textarea']],
  geo: [['lat', 'labelLat', 'number'], ['lng', 'labelLng', 'number']],
  event: [['title', 'labelTitle', 'text'], ['start', 'labelStart', 'datetime-local'], ['end', 'labelEnd', 'datetime-local']],
  social: [['value', 'labelValue', 'url']],
};
let dict = {};
let timer;
let activeRequest;
let installPrompt;
let scrollPosition = 0;
let menuHistoryState = false;

function detectLanguage() { return state.lang || ((navigator.language || 'tr').toLowerCase().startsWith('tr') ? 'tr' : 'en'); }
function vibrate() { if (!matchMedia('(prefers-reduced-motion: reduce)').matches) navigator.vibrate?.(8); }
function updateAriaAndAlts() {
  $$('[data-i18n-aria]').forEach((element) => element.setAttribute('aria-label', dict[element.dataset.i18nAria] || ''));
  $$('[data-i18n-alt]').forEach((element) => element.setAttribute('alt', dict[element.dataset.i18nAlt] || ''));
  $$('[data-language]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.language === state.lang)));
}
async function setLanguage(lang) {
  const previous = {};
  new FormData($('#qr-form')).forEach((value, key) => { previous[key] = value; });
  state.lang = lang;
  localStorage.setItem('omniqr-lang', lang);
  dict = await (await fetch(`/static/i18n/${lang}.json`)).json();
  document.documentElement.lang = lang;
  $('#language').value = lang;
  document.title = dict.pageTitle;
  $('meta[name="description"]').content = dict.pageDescription;
  $('#qr-image').alt = lang === 'tr' ? 'QR kod önizlemesi' : 'QR code preview';
  $$('[data-i18n]').forEach((element) => { const value = dict[element.dataset.i18n]; if (value !== undefined) element.innerHTML = value; });
  updateAriaAndAlts();
  renderFields();
  Object.entries(previous).forEach(([key, value]) => { const field = $(`#fields [name="${CSS.escape(key)}"]`); if (field) { if (field.type === 'checkbox') field.checked = value === 'true'; else field.value = value; } });
}
function fieldHTML([key, translation, type]) {
  const label = dict[translation] || translation;
  let input;
  if (key === 'security') input = `<select name="${key}" aria-label="${label}"><option value="WPA">WPA / WPA2</option><option value="WEP">WEP</option><option value="nopass">${dict.securityOpen}</option></select>`;
  else if (type === 'textarea') input = `<textarea name="${key}" aria-label="${label}" rows="3" maxlength="1800" placeholder="${dict.placeholderMessage || ''}" ${key === 'value' ? 'required' : ''} autocapitalize="sentences" enterkeyhint="done"></textarea>`;
  else {
    const required = ['value', 'ssid', 'name', 'to', 'phone', 'lat', 'lng', 'title'].includes(key) ? 'required' : '';
    const placeholder = type === 'url' ? dict.placeholderValue : key === 'phone' ? dict.placeholderPhone : key === 'name' ? dict.placeholderName : '';
    const inputMode = type === 'number' ? 'inputmode="decimal" step="any"' : type === 'tel' ? 'inputmode="tel"' : type === 'url' ? 'inputmode="url" autocapitalize="none"' : type === 'email' ? 'inputmode="email" autocapitalize="none"' : '';
    const initial = type === 'url' && state.type === 'url' ? `value="${dict.placeholderValue}"` : '';
    const auto = key === 'password' ? 'autocomplete="new-password"' : type === 'email' ? 'autocomplete="email"' : type === 'tel' ? 'autocomplete="tel"' : '';
    input = `<input name="${key}" aria-label="${label}" type="${type}" ${required} ${inputMode} ${auto} placeholder="${placeholder || ''}" ${initial} enterkeyhint="next">`;
  }
  return `<label class="field"><span>${label}</span>${input}</label>`;
}
function renderFields() {
  const fields = fieldsByType[state.type] || fieldsByType.url;
  $('#fields').innerHTML = fields.map(fieldHTML).join('')
    + (state.type === 'wifi' ? `<label class="check-field"><input type="checkbox" name="hidden" value="true"><span>${dict.labelHidden}</span></label>` : '')
    + (state.type === 'geo' ? `<button type="button" class="text-button location-button" id="locate">⌖ ${dict.getLocation}</button>` : '');
  $$('input,textarea,select', $('#fields')).forEach((element) => element.addEventListener('input', schedule));
  const locate = $('#locate');
  if (locate) locate.onclick = () => navigator.geolocation?.getCurrentPosition((position) => {
    $('#fields [name=lat]').value = position.coords.latitude.toFixed(6);
    $('#fields [name=lng]').value = position.coords.longitude.toFixed(6);
    schedule();
  }, () => toast(dict.locationError));
}
function collect() {
  const data = {};
  new FormData($('#qr-form')).forEach((value, key) => { data[key] = value; });
  const hidden = $('#fields [name=hidden]');
  if (hidden) data.hidden = hidden.checked ? 'true' : 'false';
  return data;
}
function schedule() { clearTimeout(timer); timer = setTimeout(generate, 220); }
function luminance(hex) {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}
function contrastRatio(foreground, background) {
  const a = luminance(foreground); const b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
async function generate() {
  activeRequest?.abort(); activeRequest = new AbortController();
  $('#qr-skeleton').classList.add('visible'); $('#qr-image').classList.remove('ready');
  try {
    const response = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: activeRequest.signal, body: JSON.stringify({ type: state.type, data: collect(), foreground: $('#foreground').value, background: $('#background').value, shape: $('#shape').value, correction: $('#correction').value, border: +$('#border').value }) });
    const result = await response.json(); if (!response.ok) throw Error(result.error?.code || 'ERROR');
    state.image = `data:image/png;base64,${result.image}`; $('#qr-image').src = state.image; $('#qr-image').classList.add('ready');
    $('#qr-version').textContent = `V${result.version} · ${result.modules}×${result.modules}`;
    const contrast = contrastRatio($('#foreground').value, $('#background').value);
    const score = Math.max(0, Math.min(100, Math.round(contrast / 7 * 100) - Math.max(0, result.version - 6) * 3));
    $('#score').textContent = String(score);
    $('#score-text').textContent = contrast < 4.5 ? dict.lowContrast : luminance($('#foreground').value) > luminance($('#background').value) ? dict.invertedWarning : result.version > 8 ? dict.highDensity : dict.assistantReady;
  } catch (error) { if (error.name !== 'AbortError') $('#score-text').textContent = dict.error; }
  finally { if (!activeRequest.signal.aborted) $('#qr-skeleton').classList.remove('visible'); }
}
function filename(extension) {
  const stamp = new Intl.DateTimeFormat(state.lang === 'tr' ? 'tr-TR' : 'en-US', { dateStyle: 'short' }).format(new Date()).replaceAll('/', '-');
  return `omniqr-${state.type}-${stamp}.${extension}`;
}
function download(url, extension) { const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename(extension); anchor.click(); }
async function exportAsset(format) {
  try {
    const response = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: state.type, data: collect(), foreground: $('#foreground').value, background: $('#background').value, shape: $('#shape').value, correction: $('#correction').value, border: +$('#border').value, format, resolution: +$('#resolution').value }) });
    const result = await response.json(); if (!response.ok) throw Error(result.error?.code || 'ERROR');
    download(`data:${result.mime};base64,${result.file}`, result.extension); vibrate(); if (format === 'png') toast(dict.saved);
  } catch { toast(dict.error); }
}
function toast(text) {
  const element = $('#toast'); element.textContent = text; element.classList.add('show');
  clearTimeout(element.hideTimer); element.hideTimer = setTimeout(() => element.classList.remove('show'), 2400);
}
function applyTheme(theme) {
  const change = () => { document.body.classList.remove('dark'); document.body.dataset.theme = theme; $('#theme-choice').value = theme; localStorage.setItem('omniqr-theme', theme); };
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(change); else change();
  $$('[data-set-theme]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.setTheme === theme)));
  updateLogoTone(theme);
}
function updateLogoTone(theme) {
  const systemDark = theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = ['night', 'ink'].includes(theme) || systemDark;
  const logo = dark ? '/static/brand/logo-mark-light.png' : '/static/brand/logo-mark.png';
  $$('.brand-logo,.footer-logo img').forEach((image) => { image.src = logo; });
  const seal = $('.privacy-seal img'); if (seal) seal.src = dark ? '/static/brand/logo-mark-light.png' : '/static/brand/logo-mark-mono.png';
}
function setAccent(color) {
  document.body.style.setProperty('--accent', color);
  const onInk = (Math.max(luminance(color), luminance('#193a32')) + .05) / (Math.min(luminance(color), luminance('#193a32')) + .05);
  const onPaper = (Math.max(luminance(color), luminance('#fffaf2')) + .05) / (Math.min(luminance(color), luminance('#fffaf2')) + .05);
  document.body.style.setProperty('--accent-on', onPaper >= onInk ? '#fffaf2' : '#193a32');
  document.body.style.setProperty('--accent-soft', `color-mix(in srgb,${color} 14%,var(--paper))`);
  localStorage.setItem('omniqr-accent', color);
  $('#accent-picker').value = color; $('#mobile-accent-picker').value = color;
}
function setLanguageControls(lang) {
  $('#language').value = lang;
  $$('[data-language]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.language === lang)));
}
function trapFocus(event, container, close) {
  if (event.key === 'Escape') { event.preventDefault(); close(); return; }
  if (event.key !== 'Tab') return;
  const items = $$('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]', container).filter((item) => item.offsetParent !== null);
  if (!items.length) return;
  if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
  else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
}
function openMenu() {
  const menu = $('#mobile-sheet'); scrollPosition = window.scrollY; document.body.style.setProperty('--scroll-lock-top', `-${scrollPosition}px`); document.body.classList.add('menu-open');
  menu.inert = false; menu.setAttribute('aria-hidden', 'false'); menu.classList.add('open'); $('#menu-backdrop').hidden = false; $('#menu-button').setAttribute('aria-expanded', 'true'); $('#menu-button').setAttribute('aria-label', dict.menuClose); $('#menu-close').focus();
  if (!menuHistoryState) { history.pushState({ omniqrMenu: true }, ''); menuHistoryState = true; }
}
function closeMenu(fromPop = false, { restoreScroll = true } = {}) {
  const menu = $('#mobile-sheet'); menu.classList.remove('open'); menu.inert = true; menu.setAttribute('aria-hidden', 'true'); $('#menu-backdrop').hidden = true; document.body.classList.remove('menu-open'); document.body.style.removeProperty('--scroll-lock-top'); $('#menu-button').setAttribute('aria-expanded', 'false'); $('#menu-button').setAttribute('aria-label', dict.menuOpen);
  if (restoreScroll) window.scrollTo(0, scrollPosition);
  const hadMenuState = menuHistoryState; menuHistoryState = false; $('#menu-button').focus();
  if (hadMenuState && !fromPop && restoreScroll) history.back();
}
async function navigateTo(target, { closePanel = false, updateHash = true } = {}) {
  const section = typeof target === 'string' ? $(target.startsWith('#') ? target : `#${target}`) : target;
  if (!section) return;
  if (closePanel && $('#mobile-sheet').classList.contains('open')) closeMenu(false, { restoreScroll: false });
  if (updateHash && location.hash !== `#${section.id}`) {
    const nextState = { ...history.state, section: section.id };
    if (closePanel || menuHistoryState) history.replaceState(nextState, '', `#${section.id}`);
    else history.pushState(nextState, '', `#${section.id}`);
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  if (section.matches('#how,#faq,#privacy')) { section.style.contentVisibility = 'visible'; section.style.containIntrinsicSize = 'auto'; }
  const heading = section.matches('h1,h2,h3') ? section : section.querySelector('h1,h2,h3') || section;
  heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const headerOffset = (innerWidth <= 700 ? 56 : 60) + 18;
  const targetY = heading.getBoundingClientRect().top + window.scrollY - headerOffset;
  window.scrollTo({ top: targetY, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  updateActiveNav(section.id);
}
function updateActiveNav(id) {
  $$('[data-nav],.mobile-nav-links a').forEach((link) => {
    const active = (link.dataset.nav || link.hash.slice(1)) === id;
    if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
  });
}
function openStyleSheet() {
  const panel = $('#style-controls'); panel.hidden = false; panel.classList.add('is-sheet'); panel.setAttribute('tabindex', '-1'); $('#sheet-backdrop').hidden = false; document.body.classList.add('sheet-open');
  panel.focus(); history.pushState({ omniqrStyle: true }, '');
}
function closeStyleSheet(fromPop = false) {
  const panel = $('#style-controls'); if (!panel.classList.contains('is-sheet')) return;
  panel.classList.remove('is-sheet'); $('#sheet-backdrop').hidden = true; document.body.classList.remove('sheet-open');
  if (!fromPop && history.state?.omniqrStyle) history.back(); $('#action-style').focus();
}
function openThemePopover() { const popover = $('#theme-popover'); popover.hidden = false; $('#theme-toggle').setAttribute('aria-expanded', 'true'); }
function closeThemePopover() { $('#theme-popover').hidden = true; $('#theme-toggle').setAttribute('aria-expanded', 'false'); }
function updateInstallState() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
  const showIos = ios && safari && !standalone;
  $('#ios-install').hidden = !showIos;
  if (standalone) { $('#install').hidden = true; $('#mobile-install').hidden = true; $('#footer-install').hidden = true; }
}
function bind() {
  $$('.type-chip').forEach((button) => button.onclick = () => {
    $('.type-chip.active')?.classList.remove('active'); button.classList.add('active'); state.type = button.dataset.type; renderFields(); generate(); vibrate();
  });
  $$('[data-language]').forEach((button) => button.onclick = async () => { await setLanguage(button.dataset.language); setLanguageControls(state.lang); });
  $('#foreground').oninput = (event) => { event.target.nextElementSibling.textContent = event.target.value.toUpperCase(); schedule(); };
  $('#background').oninput = (event) => { event.target.nextElementSibling.textContent = event.target.value.toUpperCase(); schedule(); };
  ['shape', 'correction', 'border'].forEach((id) => $(`#${id}`).addEventListener('input', () => { if (id === 'border') $('#border-value').value = $('#border').value; schedule(); }));
  $('#download').onclick = () => exportAsset('png'); $('#action-download').onclick = () => exportAsset('png');
  $('#copy-image').onclick = async () => { try { const blob = await (await fetch(state.image)).blob(); await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]); toast(dict.copied); vibrate(); } catch { toast(dict.error); } };
  $('#share').onclick = async () => { try { const blob = await (await fetch(state.image)).blob(); const file = new File([blob], filename('png'), { type: 'image/png' }); if (navigator.share) await navigator.share({ files: [file], title: 'OmniQR Studio' }); else await exportAsset('png'); } catch { /* user cancelled native share */ } };
  $$('[data-export]').forEach((button) => button.onclick = () => exportAsset(button.dataset.export));
  $('#style-toggle').onclick = () => { const panel = $('#style-controls'); panel.hidden = !panel.hidden; $('#style-toggle').setAttribute('aria-expanded', String(!panel.hidden)); $('#style-toggle').textContent = panel.hidden ? dict.expand : dict.collapse; };
  $('#theme-toggle').onclick = () => $('#theme-popover').hidden ? openThemePopover() : closeThemePopover();
  $('#footer-theme').onclick = () => { window.scrollTo({ top: 0, behavior: 'smooth' }); openThemePopover(); $('#theme-toggle').focus(); };
  $$('[data-set-theme]').forEach((button) => button.onclick = () => { applyTheme(button.dataset.setTheme); $('#theme-popover').hidden = true; $('#mobile-theme-options').hidden = true; $('#theme-toggle').setAttribute('aria-expanded', 'false'); vibrate(); });
  $('#theme-choice').onchange = (event) => applyTheme(event.target.value);
  $('#mobile-theme-trigger').onclick = () => { const options = $('#mobile-theme-options'); options.hidden = !options.hidden; $('#mobile-theme-trigger').setAttribute('aria-expanded', String(!options.hidden)); };
  $('#accent-picker').oninput = (event) => setAccent(event.target.value); $('#mobile-accent-picker').oninput = (event) => setAccent(event.target.value);
  $('#favorite').onclick = () => { const favorites = JSON.parse(localStorage.getItem('omniqr-favorites') || '[]'); favorites.push({ type: state.type, data: collect(), time: Date.now() }); localStorage.setItem('omniqr-favorites', JSON.stringify(favorites.slice(-30))); $('#favorite').textContent = '★'; toast(dict.favorite); };
  $('#menu-button').onclick = () => $('#mobile-sheet').classList.contains('open') ? closeMenu() : openMenu(); $('#menu-close').onclick = () => closeMenu(); $('#menu-backdrop').onclick = () => closeMenu();
  $$('a[href^="#"]').forEach((link) => link.addEventListener('click', (event) => {
    const target = $(link.getAttribute('href'));
    if (!target) return;
    event.preventDefault();
    navigateTo(target, { closePanel: link.closest('#mobile-sheet') !== null });
  }));
  $('#mobile-sheet').addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); closeMenu(); } else trapFocus(event, $('#mobile-sheet'), closeMenu); });
  let menuTouchX = 0; $('#mobile-sheet').addEventListener('touchstart', (event) => { menuTouchX = event.touches[0].clientX; }, { passive: true });
  $('#mobile-sheet').addEventListener('touchend', (event) => { if (menuTouchX - event.changedTouches[0].clientX > 85) closeMenu(); }, { passive: true });
  $('#action-preview').onclick = () => $('#preview').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('#action-style').onclick = openStyleSheet; $('#sheet-backdrop').onclick = () => closeStyleSheet();
  $('#style-controls').addEventListener('keydown', (event) => { if ($('#style-controls').classList.contains('is-sheet')) trapFocus(event, $('#style-controls'), closeStyleSheet); });
  let touchStart = 0; $('#style-controls').addEventListener('touchstart', (event) => { touchStart = event.touches[0].clientY; }, { passive: true });
  $('#style-controls').addEventListener('touchend', (event) => { if ($('#style-controls').classList.contains('is-sheet') && event.changedTouches[0].clientY - touchStart > 85) closeStyleSheet(); }, { passive: true });
  $('#ios-install').onclick = () => $('#ios-dialog').showModal(); $('#mobile-install').onclick = () => $('#install').click();
  $('#shortcuts-open').onclick = () => $('#shortcuts-dialog').showModal();
  $$('[data-dialog-close]').forEach((button) => button.onclick = () => button.closest('dialog').close());
  $('#footer-install').onclick = (event) => { event.preventDefault(); if (installPrompt) $('#install').click(); else if (!$('#ios-install').hidden) $('#ios-dialog').showModal(); else window.scrollTo({ top: 0, behavior: 'smooth' }); };
  $('#back-to-top').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  $('#install').onclick = async () => { if (installPrompt) { await installPrompt.prompt(); installPrompt = null; $('#install').hidden = true; $('#mobile-install').hidden = true; $('#footer-install').hidden = true; } };
  window.addEventListener('scroll', () => { requestAnimationFrame(() => $('#topbar').classList.toggle('scrolled', window.scrollY > 12)); }, { passive: true });
  const sectionObserver = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) updateActiveNav(entry.target.id); }), { rootMargin: '-18% 0px -72% 0px' });
  ['generator', 'how', 'faq', 'privacy'].forEach((id) => sectionObserver.observe($(`#${id}`)));
window.addEventListener('popstate', () => { if ($('#mobile-sheet').classList.contains('open')) closeMenu(true); if ($('#style-controls').classList.contains('is-sheet')) closeStyleSheet(true); if (location.hash) navigateTo(location.hash, { updateHash: false }); });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { if (!$('#theme-popover').hidden) closeThemePopover(); if ($('#mobile-sheet').classList.contains('open')) closeMenu(); if ($('#style-controls').classList.contains('is-sheet')) closeStyleSheet(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); exportAsset('png'); }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'c') { event.preventDefault(); $('#copy-image').click(); }
  });
  document.addEventListener('pointerdown', (event) => { if (!event.target.closest('.theme-wrap') && !event.target.closest('#footer-theme')) closeThemePopover(); });
}
function showUpdateToast(worker) {
  const element = $('#toast'); const message = document.createElement('span'); message.textContent = dict.newVersion;
  const refresh = document.createElement('button'); refresh.type = 'button'; refresh.textContent = dict.refresh;
  refresh.onclick = () => { navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true }); worker.postMessage({ type: 'SKIP_WAITING' }); };
  element.replaceChildren(message, refresh); element.classList.add('show');
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').then((registration) => {
  const check = () => { if (registration.waiting && navigator.serviceWorker.controller) showUpdateToast(registration.waiting); };
  registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', check));
  check();
}).catch(() => {});
window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); installPrompt = event; $('#install').hidden = false; $('#mobile-install').hidden = false; $('#footer-install').hidden = false; });
window.addEventListener('appinstalled', () => { $('#install').hidden = true; $('#mobile-install').hidden = true; $('#footer-install').hidden = true; });
$('#language').value = detectLanguage();
setLanguage(detectLanguage()).then(() => {
  $('.type-chip.active')?.classList.remove('active'); $(`.type-chip[data-type="${state.type}"]`)?.classList.add('active');
  bind(); setLanguageControls(state.lang); $('#foreground').dispatchEvent(new Event('input'));
  $('#qr-form').addEventListener('input', schedule); $('#qr-form').addEventListener('submit', (event) => event.preventDefault());
  $('#year').textContent = new Date().getFullYear();
  const savedTheme = localStorage.getItem('omniqr-theme') || 'paper'; applyTheme(savedTheme);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (document.body.dataset.theme === 'system') updateLogoTone('system'); });
  setAccent(localStorage.getItem('omniqr-accent') || '#ba4c32'); updateInstallState();
  if (matchMedia('(display-mode: standalone)').matches) { $('#install').hidden = true; $('#mobile-install').hidden = true; $('#footer-install').hidden = true; }
  generate();
  if (location.hash) navigateTo(location.hash, { updateHash: false });
});
if (window.visualViewport) {
  const syncKeyboard = () => { const offset = Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop); document.documentElement.style.setProperty('--keyboard-offset', `${offset}px`); if (offset > 80) document.activeElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
  window.visualViewport.addEventListener('resize', syncKeyboard, { passive: true }); window.visualViewport.addEventListener('scroll', syncKeyboard, { passive: true });
}
