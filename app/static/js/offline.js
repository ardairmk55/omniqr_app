const lang = localStorage.getItem('omniqr-lang') || ((navigator.language || 'tr').toLowerCase().startsWith('tr') ? 'tr' : 'en');
const dict = await (await fetch(`/static/i18n/${lang}.json`)).json();
document.documentElement.lang = lang;
document.title = dict.offlineDocumentTitle;
document.querySelectorAll('[data-i18n]').forEach((element) => {
  const value = dict[element.dataset.i18n];
  if (value !== undefined) element.innerHTML = value;
});
document.querySelectorAll('[data-i18n-alt]').forEach((element) => {
  element.alt = dict[element.dataset.i18nAlt] || '';
});
