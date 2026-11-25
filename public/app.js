import { L, tr, ui, categories, regions, questions, sources, sourceNotes, lessons, outcomes, REVIEW_DATE, REVIEW_UNTIL } from './content.js';
import { createRoute, routeKey, routeTasks, planPrograms, planChoices } from './rules.js';
import { buildExportModel } from './export-model.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const uid = () => crypto.randomUUID();
const STORAGE = 'shanyraq-v1';
const SETTINGS = 'shanyraq-settings-v1';
let storageFailed = false;
function readStorage(store, key) {
  try { return JSON.parse(store.getItem(key) || 'null'); } catch { return null; }
}
const preferences = readStorage(localStorage, SETTINGS) || {};
const saved = readStorage(localStorage, STORAGE) || readStorage(sessionStorage, STORAGE);
const state = {
  screen: saved?.screen || 'home', language: preferences.language === 'kk' ? 'kk' : 'ru',
  answers: saved?.answers || {}, questionIndex: saved?.questionIndex || 0,
  progress: saved?.progress || {}, feedback: saved?.feedback || {}, outcome: saved?.outcome || {},
  completedKey: saved?.completedKey || null, plans: saved?.plans || {},
  remember: Boolean(saved?.remember), session: saved?.session || uid(), visitor: preferences.visitor || uid(),
  consent: preferences.consent === true, groupConsent: preferences.groupConsent === true,
  consentChosen: preferences.consentChosen === true, textSize: preferences.textSize || 'normal',
  highContrast: Boolean(preferences.highContrast), reducedMotion: Boolean(preferences.reducedMotion),
  tab: 'route', search: '', showAll: false,
};
if (!['home', 'question', 'result'].includes(state.screen)) state.screen = 'home';
if (state.screen === 'result' && !state.answers.goal) state.screen = 'home';
let eventChain = Promise.resolve();
let toastTimer;
const t = key => tr(ui[key], state.language);
const text = value => tr(value, state.language);

const paths = {
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>', back: '<path d="M20 12H5m6-6-6 6 6 6"/>',
  home: '<path d="m3 11 9-8 9 8M6 10v11h12V10M10 21v-7h4v7"/>',
  access: '<circle cx="12" cy="4" r="2"/><path d="m5 8 7 2 7-2m-7 2v5m-4 6 4-6 4 6"/>',
  care: '<path d="M12 21 3 12C-2 5 8 1 12 7c4-6 14-2 9 5Z"/>',
  family: '<circle cx="7" cy="6" r="3"/><circle cx="17" cy="6" r="3"/><circle cx="12" cy="13" r="2"/><path d="M2 20v-5a5 5 0 0 1 5-5m15 10v-5a5 5 0 0 0-5-5m-9 12v-3a4 4 0 0 1 8 0v3"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1.2.8-1.5 1.1-1.5 2.5m0 3h.01"/>',
  check: '<path d="m5 12 4 4L19 6"/>', shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5Z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>', download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  print: '<path d="M6 8V3h12v5M6 16H3V9h18v7h-3M6 13h12v8H6Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  document: '<path d="M14 3H5v18h14V8Zm0 0v5h5M8 12h8m-8 4h6"/>',
  wallet: '<path d="M3 6h17v15H3ZM3 6V3h14v3m3 6h-6v5h6m-3-2.5h.01"/>',
  message: '<path d="M21 3H3v14h5v4l5-4h8ZM7 8h10M7 12h7"/>',
  book: '<path d="M12 6C9 3 5 3 2 4v15c3-1 7-1 10 2m0-15c3-3 7-3 10-2v15c-3-1-7-1-10 2Zm0 0v15"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M10 4H3v17h17v-7"/>',
};
const icon = (name, className = '') => `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.compass}</svg>`;

function persist() {
  const draft = { screen: state.screen, answers: state.answers, questionIndex: state.questionIndex,
    progress: state.progress, feedback: state.feedback, outcome: state.outcome, completedKey: state.completedKey, plans: state.plans,
    remember: state.remember, session: state.session };
  const settings = { language: state.language, visitor: state.visitor, consent: state.consent,
    groupConsent: state.groupConsent, consentChosen: state.consentChosen,
    textSize: state.textSize, highContrast: state.highContrast, reducedMotion: state.reducedMotion };
  try {
    localStorage.setItem(SETTINGS, JSON.stringify(settings));
    sessionStorage.setItem(STORAGE, JSON.stringify(draft));
    if (state.remember) localStorage.setItem(STORAGE, JSON.stringify(draft));
    else localStorage.removeItem(STORAGE);
  } catch { storageFailed = true; }
}

async function post(path, payload) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error('Request failed');
  return response.json();
}

function track(kind, extra = {}) {
  if (!state.consent) return Promise.resolve(false);
  const payload = { id: uid(), kind, visitor: state.visitor, session: state.session,
    language: state.language, purpose: state.answers.purpose || 'explore', consent: true,
    groupConsent: state.groupConsent && state.answers.age === 'adult',
    groups: state.answers.categories || [], ...extra };
  const request = eventChain.then(() => post('/api/events', payload));
  eventChain = request.catch(() => {});
  return request.then(() => true).catch(() => false);
}

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 6500);
}

function sourceLink(id, label) {
  const item = sources[id];
  if (!item) return '';
  return `<span class="source-anchor"><a href="${escape(item.url)}" target="_blank" rel="noopener noreferrer">${escape(label || text(item.title))} ${icon('external')}</a>${sourceNotes[id] ? `<small class="source-note">${escape(text(sourceNotes[id]))}</small>` : ''}</span>`;
}

const copy = (ru, kk) => escape(text(L(ru, kk)));
const situations = [
  { id: 'register', icon: 'home', title: L('Встать на жилищный учёт', 'Тұрғын үй есебіне тұру'), body: L('Условия постановки, проверка данных и подача заявления.', 'Есепке тұру шарттары, мәліметтерді тексеру және өтініш беру.'), keywords: 'очередь учет учёт orken оркен кезек есеп' },
  { id: 'rent', icon: 'wallet', title: L('Получить помощь с арендой', 'Жалдауға көмек алу'), body: L('Проверить основания для субсидии и подготовить документы.', 'Субсидия негіздерін тексеру және құжаттарды дайындау.'), keywords: 'аренда аренду субсидия жалдау жалға' },
  { id: 'buy', icon: 'compass', title: L('Купить жильё или начать копить', 'Баспана сатып алу немесе жинақтау'), body: L('Разобраться в программах, накоплениях и первом взносе.', 'Бағдарламаларды, жинақ пен алғашқы жарнаны түсіну.'), keywords: 'ипотека купить покупка кредит депозит накопления наурыз заем заём сатып алу жинақ' },
  { id: 'documents', icon: 'document', title: L('Разобраться с документами', 'Құжаттарды реттеу'), body: L('Какие сведения проверить и где найти нужные услуги.', 'Қандай мәліметтерді тексеру және қызметтерді қайдан табу керек.'), keywords: 'справка документы эцп егов egov данные құжат анықтама мәлімет' },
  { id: 'appeal', icon: 'message', title: L('Разобраться с отказом', 'Бас тартуды түсіну'), body: L('Уточнить причину, исправить ошибку или подать обращение.', 'Себебін нақтылау, қатені түзету немесе өтініш беру.'), keywords: 'отказ жалоба ошибка обращение еотиниш eotinish бас тарту шағым қате' },
  { id: 'received', icon: 'check', title: L('Проверить жильё перед заселением', 'Қоныстанар алдында үйді тексеру'), body: L('Что осмотреть и о чём спросить перед подписанием документов.', 'Құжаттарға қол қою алдында нені қарап, не туралы сұрау керек.'), keywords: 'заселение приемка приёмка доступность осмотр пандус қоныстану қабылдау қолжетімділік' },
  { id: 'privatize', icon: 'shield', title: L('Проверить возможность приватизации', 'Жекешелендіру мүмкіндігін тексеру'), body: L('Уточнить статус жилья и порядок обращения.', 'Тұрғын үй мәртебесін және жүгіну тәртібін нақтылау.'), keywords: 'приватизация приватизировать жекешелендіру' },
  { id: 'relocate', icon: 'arrow', title: L('Узнать о переселении', 'Қоныс аудару туралы білу'), body: L('С чего начать и какие условия уточнить в карьерном центре.', 'Неден бастау және мансап орталығында нені нақтылау керек.'), keywords: 'переселение переезд работа село ауыл қоныс көшу' },
  { id: 'overview', icon: 'question', title: L('Пока не знаю, что выбрать', 'Әзірге не таңдарымды білмеймін'), body: L('Ответьте на вопросы, чтобы увидеть возможные пути.', 'Ықтимал жолдарды көру үшін сұрақтарға жауап беріңіз.'), keywords: 'поддержка помощь варианты көмек қолдау мүмкіндіктер' },
];

function renderShell() {
  document.documentElement.lang = state.language;
  document.documentElement.dataset.text = state.textSize;
  document.documentElement.dataset.contrast = state.highContrast ? 'high' : 'normal';
  document.documentElement.dataset.motion = state.reducedMotion ? 'reduced' : 'normal';
  document.title = `Shanyraq · ${t('title')}`;
  $('#skip-link').textContent = t('skipMain');
  $('#header').innerHTML = `<div class="utility-bar"><div class="container utility-inner"><span>${copy('Жилищная поддержка в Казахстане', 'Қазақстандағы тұрғын үй қолдауы')}</span><span class="local-marker"><i></i>${escape(t('local'))}</span></div></div>
    <div class="container header-inner">
      <a href="#" class="brand" data-action="home" aria-label="Shanyraq. ${escape(t('home'))}"><img src="/assets/shanyraq-${state.language}.png" alt="Shanyraq" width="154" height="52"><span class="brand-copy">${escape(t('title'))}</span></a>
      <nav class="main-nav" aria-label="${copy('Основная навигация', 'Негізгі навигация')}"><button data-action="catalog">${copy('Жилищные вопросы', 'Тұрғын үй мәселелері')}</button><button data-action="how">${copy('Как это работает', 'Қалай жұмыс істейді')}</button><button data-action="start">${escape(t('myRoute'))}</button></nav>
      <nav class="header-actions" aria-label="${escape(t('settings'))}"><button class="quiet-button access-button" data-action="access" aria-label="${escape(t('accessibility'))}">${icon('eye')}<span class="sr-only">${escape(t('accessibility'))}</span></button><div class="lang-switch" role="group" aria-label="${state.language === 'ru' ? 'Язык' : 'Тіл'}"><button lang="ru" data-action="language" data-value="ru" aria-pressed="${state.language === 'ru'}">Рус</button><button lang="kk" data-action="language" data-value="kk" aria-pressed="${state.language === 'kk'}">Қаз</button></div></nav>
    </div>`;
  $('#footer').innerHTML = `<div class="container"><div class="footer-top"><div class="footer-info"><img class="footer-brand" src="/assets/shanyraq-${state.language}.png" alt="Shanyraq"><p>${escape(t('projectText'))}</p></div><div class="footer-column"><h2>${copy('Навигатор', 'Навигатор')}</h2><button data-action="catalog">${copy('Жилищные вопросы', 'Тұрғын үй мәселелері')}</button><button data-action="how">${copy('Как это работает', 'Қалай жұмыс істейді')}</button><button data-action="start">${escape(t('myRoute'))}</button></div><div class="footer-column"><h2>${copy('Полезная информация', 'Пайдалы ақпарат')}</h2><button data-action="library">${escape(t('materials'))}</button><button data-action="sources">${escape(t('sources'))}</button><button data-action="help">${escape(t('help'))}</button></div><div class="footer-column"><h2>${copy('Ваши данные', 'Сіздің деректеріңіз')}</h2><button data-action="privacy">${escape(t('privacy'))}</button><button data-action="consent-settings">${escape(t('settings'))}</button><button data-action="clear">${escape(t('clear'))}</button></div></div>
    <div class="footer-project"><div class="footer-logos"><img class="eu" src="/assets/eu.png" alt="Funded by the European Union"><img src="/assets/efca.png" alt="EFCA"><img src="/assets/iteachme.png" alt="ITeachMe"></div><p>${escape(t('disclaimer'))}</p></div><div class="footer-bottom"><span>© 2026 Shanyraq · ITeachMe</span><span>${copy('Локальная версия для обсуждения', 'Талқылауға арналған жергілікті нұсқа')}</span></div></div>`;
}

function catalogMatches() {
  const words = state.search.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return state.showAll ? situations : situations.slice(0, 6);
  return situations.filter(item => {
    const haystack = `${item.title.ru} ${item.title.kk} ${item.body.ru} ${item.body.kk} ${item.keywords}`.toLocaleLowerCase();
    return words.every(word => haystack.includes(word));
  });
}

function renderCatalog() {
  const matches = catalogMatches();
  return `<div class="catalog-grid">${matches.map(item => `<button class="situation-card" data-action="choose-goal" data-value="${item.id}"><span class="situation-icon">${icon(item.icon)}</span><h3>${escape(text(item.title))}</h3><p>${escape(text(item.body))}</p><span class="card-action">${copy('Разобраться', 'Толығырақ')}${icon('arrow')}</span></button>`).join('')}</div>${!matches.length ? `<div class="empty-search">${icon('search')}<h3>${copy('Такую формулировку не нашли', 'Мұндай тұжырым табылмады')}</h3><p>${copy('Попробуйте «аренда», «документы» или начните общий подбор.', '«Жалдау», «құжаттар» деп іздеңіз немесе жалпы таңдауды бастаңыз.')}</p><button class="btn secondary" data-action="choose-goal" data-value="overview">${escape(t('start'))}${icon('arrow')}</button></div>` : ''}${!state.search.trim() ? `<div class="catalog-more"><button class="text-button" data-action="all-situations">${copy(state.showAll ? 'Показать основные вопросы' : 'Все жилищные вопросы', state.showAll ? 'Негізгі мәселелерді көрсету' : 'Барлық тұрғын үй мәселелері')}${icon(state.showAll ? 'back' : 'arrow')}</button></div>` : `<p class="search-count" role="status">${copy('Найдено ситуаций', 'Табылған жағдайлар')}: ${matches.length} <button class="text-button" data-action="reset-search">${copy('Сбросить поиск', 'Іздеуді тазарту')}</button></p>`}`;
}

function renderHome() {
  return `<div class="home-page"><div class="hero-wrap"><section class="container hero" aria-labelledby="home-title"><div class="hero-copy"><p class="eyebrow">${escape(t('heroTag'))}</p><h1 id="home-title">${copy('Поможем разобраться с жилищными вопросами', 'Тұрғын үй мәселелерін түсінуге көмектесеміз')}</h1><p class="hero-lead">${copy('Найдите подходящий путь: от проверки условий до обращения за поддержкой. С понятными шагами, документами и официальными ссылками.', 'Қолайлы жолды табыңыз: шарттарды тексеруден қолдауға жүгінуге дейін. Түсінікті қадамдар, құжаттар және ресми сілтемелермен.')}</p>
    <form id="catalog-search-form" class="search-form" role="search"><label for="catalog-search" class="sr-only">${copy('Поиск жилищного вопроса', 'Тұрғын үй мәселесін іздеу')}</label>${icon('search')}<input id="catalog-search" type="search" autocomplete="off" placeholder="${copy('Например, аренда или жилищный учёт', 'Мысалы, жалдау немесе тұрғын үй есебі')}" value="${escape(state.search)}"><button class="btn" type="submit">${copy('Найти', 'Іздеу')}</button></form>
    <div class="quick-search"><span>${copy('Часто ищут:', 'Жиі іздейді:')}</span>${[['аренда', 'жалдау'], ['документы', 'құжаттар'], ['отказ', 'бас тарту']].map(([ru, kk]) => `<button data-action="search-tag" data-value="${copy(ru, kk)}">${copy(ru, kk)}</button>`).join('')}</div>
    <div class="hero-actions"><button class="btn" data-action="start">${escape(Object.keys(state.answers).length ? t('resume') : t('start'))}${icon('arrow')}</button><button class="text-button" data-action="catalog">${copy('Выбрать вопрос из списка', 'Тізімнен мәселені таңдау')}</button></div><p class="hero-fine">${icon('shield')}${escape(t('noAccount'))}<span>·</span>${copy('Около 4 минут', 'Шамамен 4 минут')}</p></div>
    <div class="route-preview"><div class="preview-caption">${icon('compass')}<span>${copy('Пример вашего маршрута', 'Маршрутыңыздың мысалы')}</span></div><h2>${copy('Хочу встать на жилищный учёт', 'Тұрғын үй есебіне тұрғым келеді')}</h2><p class="preview-intro">${copy('После ответов здесь будет ваш план', 'Жауаптардан кейін мұнда сіздің жоспарыңыз болады')}</p><ol class="preview-list">${[
      [L('Проверьте условия', 'Шарттарды тексеріңіз'), L('Статус заявителя и сведения о жилье', 'Өтініш берушінің мәртебесі мен үй туралы мәліметтер')],
      [L('Подготовьте данные', 'Мәліметтерді дайындаңыз'), L('Что уточнить перед обращением', 'Жүгінер алдында нені нақтылау керек')],
      [L('Перейдите к подаче заявления', 'Өтініш беруге өтіңіз'), L('По ссылке на официальный сервис', 'Ресми сервис сілтемесі арқылы')],
    ].map(([title, body], index) => `<li><span class="preview-num">${index + 1}</span><div><strong>${escape(text(title))}</strong><p>${escape(text(body))}</p></div></li>`).join('')}</ol><div class="preview-note">${icon('document')}<span>${copy('Сохраните маршрут и отмечайте сделанное', 'Маршрутты сақтап, орындалғанын белгілеңіз')}</span></div><button class="text-button" data-action="choose-goal" data-value="register">${copy('Составить такой маршрут', 'Осындай маршрут құру')}${icon('arrow')}</button></div></section></div>
    <section class="container catalog-section" aria-labelledby="catalog-title" id="catalog"><div class="section-top"><div><p class="eyebrow">${copy('С чего начнём', 'Неден бастаймыз')}</p><h2 id="catalog-title" tabindex="-1">${copy('Какой вопрос нужно решить?', 'Қандай мәселені шешу керек?')}</h2></div><p>${copy('Выберите ситуацию. Дальше зададим только нужные для неё вопросы.', 'Жағдайды таңдаңыз. Әрі қарай тек оған қажетті сұрақтарды қоямыз.')}</p></div><div id="catalog-results">${renderCatalog()}</div></section>
    <section class="how-section" id="how"><div class="container"><div class="section-top"><div><p class="eyebrow">${copy('Просто и последовательно', 'Қарапайым және ретімен')}</p><h2 id="how-title" tabindex="-1">${copy('От вопроса к плану действий', 'Сұрақтан әрекет жоспарына')}</h2></div><p>${copy('Всё можно пройти самостоятельно или вместе с человеком, которому вы помогаете.', 'Өз бетіңізше немесе көмектесіп жүрген адамыңызбен бірге өтуге болады.')}</p></div><div class="how-grid">${ui.howSteps.map((item,index) => `<article class="how-item"><span class="how-number">${index+1}</span><h3>${escape(text(item))}</h3><p>${escape(text(ui.howBodies[index]))}</p></article>`).join('')}</div></div></section>
    <section class="container support-grid"><div class="plain-info"><span class="situation-icon">${icon('book')}</span><h2>${copy('Понятно о сложных вопросах', 'Күрделі мәселелер туралы түсінікті')}</h2><p>${copy('Как подготовить бюджет, проверить документы и защитить свои права. Короткие пояснения пригодятся на любом этапе.', 'Бюджетті дайындау, құжаттарды тексеру және құқықтарды қорғау. Қысқа түсіндірмелер кез келген кезеңде көмектеседі.')}</p><button class="text-button" data-action="library">${copy('Открыть полезные материалы', 'Пайдалы материалдарды ашу')}${icon('arrow')}</button></div><div class="human-help"><span class="support-kicker">${copy('Нужна помощь с сервисами?', 'Сервистермен көмек керек пе?')}</span><h2>${copy('Иногда лучше уточнить у специалиста', 'Кейде маманнан нақтылаған дұрыс')}</h2><p>${copy('Вопросы о программах уточняйте в Отбасы банке, о государственных услугах — в eGov.', 'Бағдарламалар бойынша Отбасы банкінен, мемлекеттік қызметтер бойынша eGov-тан нақтылаңыз.')}</p><div class="support-phones"><a href="tel:300"><strong>300</strong><span>Отбасы банк</span></a><a href="tel:1414"><strong>1414</strong><span>eGov</span></a></div><button class="help-link" data-action="help">${copy('Контакты и подсказки', 'Байланыстар мен кеңестер')}${icon('arrow')}</button></div></section></div>`;
}

function startGoal(goal) {
  if (!situations.some(item => item.id === goal)) return;
  state.answers = { goal };
  state.questionIndex = 0;
  state.completedKey = null;
  state.session = uid();
  state.screen = 'question';
  track('started');
  render({ focus: true });
  if (!state.consentChosen) openDialog('consent-dialog');
}

function goToSection(section) {
  if (state.screen !== 'home') { state.screen = 'home'; render(); }
  const heading = $(`#${section}-title`);
  heading?.scrollIntoView({ behavior: state.reducedMotion ? 'instant' : 'smooth', block: 'start' });
  heading?.focus({ preventScroll: true });
}

function refreshCatalog() {
  $('#catalog-results').innerHTML = renderCatalog();
}

function deviceSave() {
  return `<div class="device-save"><label class="check-label"><input type="checkbox" id="remember" ${state.remember ? 'checked' : ''}>${escape(t('saveDevice'))}</label><p>${escape(state.remember ? t('savedDevice') : t('sessionOnly'))}</p>${storageFailed ? `<p class="error">${escape(t('storageFail'))}</p>` : ''}</div>`;
}

function renderQuestion() {
  const list = questions(state.answers);
  state.questionIndex = Math.max(0, Math.min(state.questionIndex, list.length - 1));
  const item = list[state.questionIndex];
  const answer = state.answers[item.id];
  let fields;
  if (item.type === 'select') {
    fields = `<div class="select-wrap"><label class="field-label" for="region">${escape(t('selectRegion'))}</label><select class="form-field" id="region" name="answer" required><option value="">${escape(t('selectRegion'))}</option>${item.options.map(option => `<option value="${escape(option.id)}" ${answer === option.id ? 'selected' : ''}>${escape(text(option.title))}</option>`).join('')}</select></div>`;
  } else if (item.type === 'income') {
    fields = `<div class="income-grid"><label><span class="field-label">${escape(t('familyIncome'))}</span><input class="form-field" id="income-total" name="incomeTotal" type="number" inputmode="decimal" min="0" max="100000000" step="0.01" value="${escape(answer?.total ?? '')}" aria-describedby="income-hint"></label><label><span class="field-label">${escape(t('familySize'))}</span><input class="form-field" id="income-size" name="incomeSize" type="number" inputmode="numeric" min="1" max="30" step="1" value="${escape(answer?.size ?? '')}" aria-describedby="income-hint"></label></div><p id="income-hint" class="small muted">${escape(t('incomeHint'))}</p>`;
  } else {
    fields = `<fieldset class="options ${item.options.length <= 3 ? 'wide' : ''}"><legend class="sr-only">${escape(text(item.title))}</legend>${item.options.map(option => `<label class="option"><input type="${item.type === 'multi' ? 'checkbox' : 'radio'}" name="answer" value="${escape(option.id)}" ${item.type === 'multi' ? answer?.includes(option.id) ? 'checked' : '' : answer === option.id ? 'checked' : ''}>${option.icon ? icon(option.icon) : ''}<span class="option-copy"><span class="option-title">${escape(text(option.title))}</span>${option.description ? `<span class="option-desc">${escape(text(option.description))}</span>` : ''}</span></label>`).join('')}</fieldset>`;
  }
  const stages = [
    { title: L('Ваша ситуация', 'Сіздің жағдайыңыз'), body: L('Кому и с чем нужна помощь', 'Кімге және қандай көмек керек'), ids: ['purpose', 'categories', 'goal'] },
    { title: L('Условия и данные', 'Шарттар мен мәліметтер'), body: L('То, что влияет на ваш маршрут', 'Маршрутқа әсер ететін деректер'), ids: list.filter(q => !['purpose','categories','goal','digital'].includes(q.id)).map(q => q.id) },
    { title: L('Подготовка к обращению', 'Жүгінуге дайындық'), body: L('Доступ к нужным сервисам', 'Қажетті сервистерге қолжетімділік'), ids: ['digital'] },
  ];
  const currentStage = Math.max(0, stages.findIndex(stage => stage.ids.includes(item.id)));
  return `<div class="container questionnaire"><button class="text-button breadcrumb" data-action="catalog">${icon('back')}${copy('К жилищным вопросам', 'Тұрғын үй мәселелеріне')}</button><div class="question-layout"><aside class="question-sidebar"><p class="eyebrow">${escape(t('myRoute'))}</p><h2>${copy('Составим план по вашей ситуации', 'Жағдайыңызға сай жоспар құрайық')}</h2><ol class="stage-list">${stages.map((stage,index) => {
    const firstIndex = list.findIndex(q => stage.ids.includes(q.id));
    const enabled = firstIndex >= 0 && firstIndex < state.questionIndex;
    return `<li class="${index === currentStage ? 'current' : index < currentStage ? 'complete' : ''}"><button data-action="question-stage" data-value="${firstIndex}" ${enabled ? '' : 'disabled'} ${index === currentStage ? 'aria-current="step"' : ''}><span class="stage-number">${index < currentStage ? icon('check') : index+1}</span><span><strong>${escape(text(stage.title))}</strong><small>${escape(text(stage.body))}</small></span></button></li>`;
  }).join('')}<li><span class="stage-final">${icon('document')}<span>${copy('Ваш маршрут', 'Сіздің маршрутыңыз')}</span></span></li></ol><div class="sidebar-note">${icon('shield')}<p>${escape(t('safe'))}</p></div></aside>
    <section class="wizard" aria-labelledby="question-title"><div class="wizard-meta"><span>${escape(text(stages[currentStage].title))}</span><span>${escape(t('step'))} ${state.questionIndex + 1} / ${list.length}</span></div><progress value="${state.questionIndex + 1}" max="${list.length}" aria-label="${escape(t('section'))}"></progress><div class="wizard-content"><h1 id="question-title" tabindex="-1">${escape(text(item.title))}</h1><p class="question-intro">${escape(text(item.intro))}</p>
    <form id="question-form" data-question="${escape(item.id)}" novalidate>${fields}${item.help ? `<details class="question-help"><summary>${icon('question')}${escape(t('why'))}</summary><p>${escape(text(item.help))}</p>${item.source ? `<p>${sourceLink(item.source)}</p>` : ''}</details>` : ''}<p id="form-error" class="error" role="alert"></p><div class="question-actions"><button class="quiet-button" type="button" data-action="back">${icon('back')}${escape(t('back'))}</button><div class="next-group">${item.optional ? `<button class="text-button" type="button" data-action="skip">${escape(t('skip'))}</button>` : ''}<button class="btn" type="submit">${escape(state.questionIndex === list.length - 1 ? t('getRoute') : t('next'))}${icon('arrow')}</button></div></div></form></div><div class="wizard-save">${deviceSave()}</div></section></div></div>`;

}

const statusLabels = {
  possible: L('Есть основания для проверки', 'Тексеруге негіздер бар'),
  check: L('Нужно уточнить условия', 'Шарттарды нақтылау керек'),
  unlikely: L('В ответах есть ограничение', 'Жауаптарда шектеу бар'),
  guide: L('Практический шаг', 'Практикалық қадам'),
};

function answerSummary(mode = 'all') {
  const compactIds = new Set(['categories', 'goal', 'region', 'purpose']);
  const labels = {
    categories: L('Категории', 'Санаттар'), goal: L('Задача', 'Міндет'), region: L('Регион', 'Өңір'),
    purpose: L('Цель просмотра', 'Қарау мақсаты'), age: L('Возраст заявителя', 'Өтініш берушінің жасы'),
    orphanAge: L('Возраст для проверки сиротства', 'Жетімдік негізін тексеруге арналған жас'),
    orphanStatus: L('Подтверждение сиротства', 'Жетімдік мәртебесін растау'),
    queue: L('Жилищный учёт', 'Тұрғын үй есебі'), citizenship: L('Статус заявителя', 'Өтініш берушінің мәртебесі'),
    housing: L('Сведения о собственности', 'Меншік мәліметтері'), disabilityGroup: L('Группа инвалидности', 'Мүгедектік тобы'),
    digital: L('Доступ к сервисам', 'Сервистерге қолжетімділік'),
    cityRegistration: L('Регистрация в выбранном городе', 'Таңдалған қаладағы тіркеу'),
  };
  return questions(state.answers).filter(item => item.options && state.answers[item.id] && (mode === 'all' || compactIds.has(item.id) === (mode === 'compact'))).map(item => {
    const values = [].concat(state.answers[item.id]);
    const selected = item.options.filter(option => values.includes(option.id)).map(option => text(option.title));
    return `<div class="answer-row"><span class="answer-label">${escape(text(labels[item.id] || item.title))}</span>${escape(selected.join(', '))}</div>`;
  }).join('');
}

function activePlan(route) {
  const remembered = state.plans[routeKey(state.answers)];
  return remembered === 'all' || route.programs.some(item => item.id === remembered) ? remembered : route.defaultProgram || 'all';
}

function routeNotices(route) {
  const notices = [...route.notices];
  const estimate = route.estimate;
  if (estimate) {
    const perPerson = Math.round(estimate.perPerson).toLocaleString(state.language === 'ru' ? 'ru-RU' : 'kk-KZ');
    notices.push(L(
      `Предварительный доход на человека — ${perPerson} ₸ в месяц. ${estimate.current ? `Ориентир субсидии аренды на 2026 год — ${estimate.threshold.toLocaleString('ru-RU')} ₸. Состав семьи и доходов проверяет банк.` : 'Показатель 2026 года устарел. Актуальный порог нужно проверить на сайте банка.'}`,
      `Бір адамға шаққандағы алдын ала табыс — айына ${perPerson} ₸. ${estimate.current ? `2026 жылғы жалдау субсидиясының бағдары — ${estimate.threshold.toLocaleString('kk-KZ')} ₸. Отбасы мен табыс құрамын банк тексереді.` : '2026 жылғы көрсеткіш ескірген. Өзекті шекті банк сайтынан тексеру қажет.'}`,
    ));
  }
  if (new Date() > new Date(`${REVIEW_UNTIL}T23:59:59`)) notices.unshift(ui.expired);
  return notices;
}

function renderTaskGroups(route, focus, progress) {
  let index = 0;
  return planPrograms(route, focus).map(item => `<section class="route-group" aria-labelledby="group-${item.id}" data-program="${item.id}">
    <h2 id="group-${item.id}" class="route-group-title">${escape(text(item.title))}</h2>
    ${item.steps.map(task => {
      index += 1;
      return `<article class="task-card ${progress[task.id] ? 'is-done' : ''}">
        <div class="task-header"><input id="task-${task.id}" type="checkbox" data-task="${task.id}" ${progress[task.id] ? 'checked' : ''} aria-label="${escape(t('checkTask') + '. ' + text(task.title))}">
          <div><span class="task-category">${String(index).padStart(2, '0')}</span><label for="task-${task.id}" class="task-heading">${escape(text(task.title))}</label></div>
        </div>
        <details ${index === 1 && !progress[task.id] ? 'open' : ''}><summary>${escape(t('taskDetails'))}</summary>
          <div class="task-body"><p>${escape(text(task.body))}</p>${task.source ? `<div class="task-link">${sourceLink(task.source)}</div><span class="source-line">${escape(t('externalRu'))}</span>` : ''}</div>
        </details>
      </article>`;
    }).join('')}
  </section>`).join('');
}

function renderResult() {
  const route = createRoute(state.answers);
  const focus = activePlan(route);
  const choices = planChoices(route);
  const tasks = routeTasks(route, focus);
  const key = routeKey(state.answers);
  const progress = state.progress[key] || {};
  const done = tasks.filter(item => progress[item.id]).length;
  const notices = routeNotices(route);
  return `<div class="container results"><button class="text-button breadcrumb" data-action="home">${icon('back')}${copy('Главная', 'Басты бет')}</button><div class="results-top"><div><p class="eyebrow">${escape(state.answers.purpose === 'explore' ? t('exploration') : t('myRoute'))}</p><h1 id="result-title" tabindex="-1">${copy('Ваш жилищный маршрут', 'Сіздің тұрғын үй маршрутыңыз')}</h1><p class="results-lead">${escape(t('resultText'))}</p><div class="result-actions"><button class="btn small" data-action="download">${icon('download')}${escape(t('download'))}</button><button class="btn small secondary" data-action="print">${icon('print')}${escape(t('print'))}</button></div></div></div>
    <div class="result-layout"><aside class="result-side">    <nav class="tabs" aria-label="${escape(t('myRoute'))}">${[['route', 'myRoute'], ['programs', 'variants'], ['lessons', 'materials']].map(([value, label]) => `<button class="tab" data-action="tab" data-value="${value}" ${state.tab === value ? 'aria-current="page"' : ''}>${escape(t(label))}</button>`).join('')}</nav><details class="summary-card" id="answer-overview" ${window.matchMedia('(max-width: 600px)').matches ? '' : 'open'}><summary>${escape(t('overview'))}</summary><div class="answers-list">${answerSummary('compact')}</div><details class="answer-details"><summary>${escape(t('selectionBasis'))}</summary>${answerSummary('extra')}</details><button class="text-button" data-action="edit">${escape(t('edit'))}</button>${deviceSave()}</details><div class="sidebar-help">${icon('question')}<h3>${copy('Нужна подсказка?', 'Кеңес керек пе?')}</h3><p>${copy('Поможем найти официальный контакт по вашему вопросу.', 'Мәселеңіз бойынша ресми байланысты табуға көмектесеміз.')}</p><button class="text-button" data-action="help">${escape(t('help'))}${icon('arrow')}</button></div></aside><div class="result-main">

    <div class="tab-panel" ${state.tab !== 'route' ? 'hidden' : ''}>
      <div class="progress-card"><span class="progress-count">${done} / ${tasks.length}</span><div class="progress-text"><h2>${escape(t('done'))}</h2><p>${escape(text(L('Отмечайте действия после выполнения.', 'Әрекеттерді орындаған соң белгілеңіз.')))}</p><progress value="${done}" max="${tasks.length}" aria-label="${escape(t('done'))}"></progress></div>${done < tasks.length ? `<button class="btn small" data-action="next-task">${copy('К ближайшему шагу', 'Алдағы қадамға')}${icon('arrow')}</button>` : `<span class="all-done">${icon('check')}${copy('Готово', 'Дайын')}</span>`}</div>
      ${choices.length ? `<div class="plan-picker no-print"><label class="field-label" for="route-program">${escape(t('planChoice'))}</label><select id="route-program" class="form-field"><option value="all" ${focus === 'all' ? 'selected' : ''}>${escape(t('allVariants'))}</option>${choices.map(item => `<option value="${item.id}" ${focus === item.id ? 'selected' : ''}>${escape(text(item.title))}</option>`).join('')}</select><p class="small muted">${escape(t('planHint'))}</p></div>` : ''}
      <div class="print-only"><h2>${escape(t('overview'))}</h2>${answerSummary()}<p>${escape(t('selectedPlan'))} · ${escape(focus === 'all' ? t('allVariants') : text(route.programs.find(item => item.id === focus)?.title))}</p></div>
      ${focus === 'all' && choices.length > 1 ? `<p class="plan-explanation">${escape(t('allPlanHint'))}</p>` : ''}
      ${notices.length ? `<div class="notices">${notices.map(item => `<p>${escape(text(item))}</p>`).join('')}</div>` : ''}
      ${renderTaskGroups(route, focus, progress)}
    </div>
    <div class="tab-panel" ${state.tab !== 'programs' ? 'hidden' : ''}>${(choices.length ? choices : route.programs).map(item => `<article class="program-card"><span class="badge ${item.status}">${escape(text(statusLabels[item.status]))}</span><h3>${escape(text(item.title))}</h3><p>${escape(text(item.description))}</p><p class="reason">${escape(text(item.reason))}</p><ul>${item.conditions.map(condition => `<li>${escape(text(condition))}</li>`).join('')}</ul>${item.source ? `<p class="source-line">${sourceLink(item.source)}</p>` : ''}${choices.includes(item) ? `<button class="btn small secondary" data-action="plan" data-value="${item.id}">${escape(t('showPlan'))}</button>` : ''}</article>`).join('')}</div>
    <div class="tab-panel" ${state.tab !== 'lessons' ? 'hidden' : ''}>${lessons.map((item, index) => `<article class="program-card"><span class="eyebrow">0${index + 1}</span><h3>${escape(text(item.title))}</h3><p>${escape(text(item.body))}</p>${item.source ? `<p class="source-line">${sourceLink(item.source)}</p>` : ''}</article>`).join('')}<p class="small muted">${escape(t('research'))}</p></div>
    <section class="feedback-card no-print"><h2>${escape(t('feedbackTitle'))}</h2><p>${escape(t('feedbackText'))}</p><button class="text-button" data-action="consent-settings">${escape(t('settings'))}</button><div class="feedback-options">${[['yes', 'yes'], ['partly', 'partly'], ['no', 'no']].map(([value, label]) => `<button class="btn small secondary" data-action="feedback" data-value="${value}" aria-pressed="${state.feedback[key] === value}">${escape(t(label))}</button>`).join('')}</div><h2 class="outcome-title">${escape(t('outcomeTitle'))}</h2><p>${escape(t('outcomeText'))}</p><label for="outcome" class="sr-only">${escape(t('outcomeTitle'))}</label><select id="outcome" class="form-field outcome-select"><option value="">${escape(text(L('Выберите, если уже есть результат', 'Нәтиже болса, таңдаңыз')))}</option>${outcomes.map(([value, label]) => `<option value="${value}" ${state.outcome[key] === value ? 'selected' : ''}>${escape(text(label))}</option>`).join('')}</select></section>
    <details class="contact-card"><summary>${escape(t('contactTitle'))}</summary><p>${escape(t('contactText'))}</p>${state.answers.age === 'adult' ? `<form class="contact-form" id="contact-form" novalidate><label class="field-label" for="contact-email">Email</label><input class="form-field" id="contact-email" type="email" autocomplete="email" maxlength="254" required><label class="check-label"><input id="contact-consent" type="checkbox" required>${escape(t('contactConsent'))}</label><p id="contact-error" class="error" role="alert"></p><button class="btn small" type="submit">${escape(t('contactSend'))}</button></form>` : `<p>${escape(t('contactAdult'))}</p>`}</details>
    <p class="bottom-meta">${escape(t('checked'))} · 11.11.2026<br>${escape(t('review'))}<br><button class="text-button" data-action="sources">${escape(t('sources'))}</button> · <button class="text-button" data-action="fresh">${escape(t('fresh'))}</button></p>
    <div class="print-only"><p>${escape(t('printDate'))} ${escape(new Date().toLocaleDateString(state.language === 'ru' ? 'ru-RU' : 'kk-KZ'))}</p><p>${escape(t('draftNotice'))}</p></div>
    </div></div></div>`;
}

function dialog(id, title, body) {
  return `<dialog id="${id}" aria-labelledby="${id}-title"><div class="dialog-header"><h2 id="${id}-title">${escape(title)}</h2><button class="quiet-button" data-action="close-dialog" aria-label="${escape(t('close'))}">${icon('close')}</button></div>${body}</dialog>`;
}

function renderDialogs() {
  const privacyBody = `<p class="consent-intro">${escape(t('draftNotice'))}</p>
    <h3>${escape(text(L('Что остаётся в браузере', 'Браузерде не қалады')))}</h3><p>${escape(text(L('Ваши ответы и отметки сохраняются в этой вкладке. Если включить «Сохранить ответы на этом устройстве», они останутся в браузере до очистки. Это может включать социальную категорию и введённый доход. На общем компьютере лучше завершать работу очисткой данных.', 'Жауаптар мен белгілер осы қойындыда сақталады. «Жауаптарды осы құрылғыда сақтау» қосылса, олар тазартылғанша браузерде қалады. Олардың ішінде әлеуметтік санат пен енгізілген табыс болуы мүмкін. Ортақ компьютерде жұмысты деректерді тазалау арқылы аяқтаған дұрыс.')))}</p>
    <h3>${escape(text(L('Статистика по вашему согласию', 'Келісіміңіз бойынша статистика')))}</h3><p>${escape(text(L('Локальная база получает код браузера в преобразованном виде, код прохождения, язык, цель посещения и события использования. Это псевдонимные данные. Один код не равен одному человеку. Доход, регион, документы, ИИН, диагнозы, IP-адрес и полный набор ответов в базу статистики не записываются. Выбранные социальные категории включаются только с отдельного согласия совершеннолетнего заявителя.', 'Жергілікті база түрлендірілген браузер кодын, өту кодын, тілді, кіру мақсатын және пайдалану оқиғаларын алады. Бұлар бүркеншік кодпен белгіленген деректер. Бір код бір адамға тең емес. Табыс, өңір, құжаттар, ЖСН, диагноздар, IP-мекенжай және жауаптардың толық жиыны статистика базасына жазылмайды. Таңдалған әлеуметтік санаттар тек кәмелетке толған өтініш берушінің бөлек келісімімен қосылады.')))}</p>
    <h3>${escape(text(L('Контакт и срок хранения', 'Контакт және сақтау мерзімі')))}</h3><p>${escape(text(L('Email сохраняется отдельно только по отдельному согласию для обратной связи. События хранятся до 90 дней, контакты до 30 дней. Просроченные записи удаляются при запуске сервера. В этой версии данные находятся в закрытой локальной папке на этом компьютере. Письма автоматически не отправляются. По браузерному коду команда может связать контакт с событиями использования, поэтому контакт не считается анонимным.', 'Email кері байланыс үшін бөлек келісіммен ғана сақталады. Оқиғалар 90 күнге дейін, контактілер 30 күнге дейін сақталады. Мерзімі өткен жазбалар сервер іске қосылғанда жойылады. Бұл нұсқада деректер осы компьютердегі жабық жергілікті папкада орналасады. Хаттар автоматты жіберілмейді. Команда браузер коды арқылы контактіні пайдалану оқиғаларымен байланыстыра алады, сондықтан контакт анонимді болып саналмайды.')))}</p>
    <h3>${escape(text(L('Удаление и дальнейший запуск', 'Жою және кейін іске қосу')))}</h3><p>${escape(text(L('Кнопка «Очистить мои данные» удаляет ответы на устройстве и связанные с текущим кодом события и контакт в локальной базе. При отключении статистики прежние события и контакт также удаляются. Если код потерян, удаление контакта выполняет владелец локальной базы. До публичного запуска ITeachMe уточнит политику, оператора, место хранения и порядок обработки обращений. Для вопросов о проекте — iteachme2020@gmail.com.', '«Деректерімді тазалау» батырмасы құрылғыдағы жауаптарды және ағымдағы кодқа байланысты жергілікті база оқиғалары мен контактіні жояды. Статистика өшірілгенде бұрынғы оқиғалар мен контакт те жойылады. Код жоғалса, контактіні жергілікті база иесі жояды. Көпшілікке іске қосуға дейін ITeachMe саясатты, операторды, сақтау орнын және өтініштерді өңдеу тәртібін нақтылайды. Жоба бойынша сұрақтар үшін — iteachme2020@gmail.com.')))}</p><p>${sourceLink('privacy_law')}</p><button class="btn secondary small" data-action="consent-settings">${escape(t('settings'))}</button>`;
  const consentBody = `<p>${escape(t('analyticsText'))}</p><form id="consent-form"><label class="check-label"><input id="analytics-consent" type="checkbox" ${state.consent ? 'checked' : ''}>${escape(t('analyticsOption'))}</label><label class="check-label"><input id="group-consent" type="checkbox" ${state.groupConsent && state.answers.age === 'adult' ? 'checked' : ''} ${state.answers.age !== 'adult' ? 'disabled' : ''}>${escape(t('groupOption'))}</label><p class="small muted">${escape(t('groupHint'))}</p><p class="small muted">${escape(t('revokeNote'))}</p><p id="consent-error" class="error" role="alert"></p><button class="btn" type="submit">${escape(t('applySettings'))}</button><button class="text-button" type="button" data-action="no-analytics">${escape(t('noAnalytics'))}</button></form><button class="text-button" data-action="privacy">${escape(t('privacy'))}</button>`;
  $('#dialogs').innerHTML = dialog('access-dialog', t('accessibility'), `<h3>${escape(t('size'))}</h3><div class="access-sizes" role="group" aria-label="${escape(t('size'))}">${['normal', 'large', 'largest'].map(value => `<button class="btn small secondary" data-action="text-size" data-value="${value}" aria-pressed="${state.textSize === value}">${escape(t(value))}</button>`).join('')}</div><label class="check-label"><input id="high-contrast" type="checkbox" ${state.highContrast ? 'checked' : ''}>${escape(t('contrast'))}</label><label class="check-label"><input id="reduced-motion" type="checkbox" ${state.reducedMotion ? 'checked' : ''}>${escape(t('reduceMotion'))}</label><p class="muted small">${escape(t('keyboard'))}</p>`)
    + dialog('download-dialog', copy('Скачать подробный маршрут', 'Толық маршрутты жүктеу'), `<p>${copy('В документ войдут выбранный вариант поддержки, подробные действия, официальные ссылки и ваши отметки. Файл формируется на этом устройстве.', 'Құжатқа таңдалған қолдау нұсқасы, толық әрекеттер, ресми сілтемелер мен белгілеріңіз кіреді. Файл осы құрылғыда жасалады.')}</p><div class="download-formats"><button class="download-format" data-action="download-format" data-value="docx"><strong>Word <span>.docx</span></strong><span>${copy('Редактировать текст, отмечать пункты и дополнять заметки', 'Мәтінді өңдеу, тармақтарды белгілеу және жазбаларды толықтыру')}</span>${icon('download')}</button><button class="download-format" data-action="download-format" data-value="pdf"><strong>PDF <span>.pdf</span></strong><span>${copy('Отмечать флажки, заполнять поля, переходить по ссылкам и печатать', 'Жалаушаларды белгілеу, өрістерді толтыру, сілтемелерге өту және басып шығару')}</span>${icon('download')}</button></div><p class="small muted">${copy('После заполнения сохраните копию файла. Изменения в документе не передаются обратно на сайт.', 'Толтырғаннан кейін файл көшірмесін сақтаңыз. Құжаттағы өзгерістер сайтқа кері жіберілмейді.')}</p><p id="download-status" class="small" role="status" aria-live="polite"></p>`)
    + dialog('library-dialog', t('materials'), `${lessons.map((item,index) => `<article class="library-item"><span class="eyebrow">${index+1} / ${lessons.length}</span><h3>${escape(text(item.title))}</h3><p>${escape(text(item.body))}</p>${item.source ? sourceLink(item.source) : ''}</article>`).join('')}`)
    + dialog('privacy-dialog', t('privacy'), privacyBody)
    + dialog('consent-dialog', t('analyticsTitle'), consentBody)
    + dialog('sources-dialog', t('sources'), `<p>${escape(t('checked'))} · ${REVIEW_DATE}</p><p class="consent-intro">${escape(t('draftNotice'))}</p><p class="small muted">${escape(text(L('Некоторые адреса eGov могут перенаправлять на обновлённый портал. Если нужная услуга не открылась, найдите её по названию в поиске eGov или уточните через 1414. Приём в банковскую программу и условия на дату обращения перепроверяются отдельно.', 'Кейбір eGov мекенжайлары жаңартылған порталға бағыттауы мүмкін. Қажетті қызмет ашылмаса, оны eGov іздеуінен атауы бойынша табыңыз немесе 1414 арқылы нақтылаңыз. Банк бағдарламасына қабылдау мен жүгіну күніндегі шарттар бөлек қайта тексеріледі.')))}</p><ul class="source-list">${Object.entries(sources).map(([id, item]) => `<li>${sourceLink(id)}<span class="small">${escape(t('checked'))}: ${REVIEW_DATE}${item.language === 'ru' && state.language === 'kk' ? ' · Орыс тіліндегі дереккөз' : ''}</span></li>`).join('')}</ul><p class="small muted">${escape(t('research'))}</p>`)
    + dialog('help-dialog', t('help'), `<p>${escape(text(L('Если не знаете ответ, выбирайте «Не знаю» или «Нужно проверить». К любому вопросу можно вернуться. Навигатор поможет подготовиться к обращению.', 'Жауабын білмесеңіз, «Білмеймін» немесе «Тексеру керек» нұсқасын таңдаңыз. Кез келген сұраққа оралуға болады. Навигатор жүгінуге дайындалуға көмектеседі.')))}</p><h3>Отбасы банк</h3><p>${sourceLink('contacts')}<br><a href="tel:300">300</a> · ${escape(text(L('с мобильного телефона', 'ұялы телефоннан')))}</p><h3>eGov</h3><p><a href="tel:1414">1414</a> · ${escape(text(L('помощь по государственным сервисам', 'мемлекеттік сервистер бойынша көмек')))}</p><p>${escape(t('safe'))}</p><button class="text-button" data-action="access">${escape(t('accessibility'))}</button>`);
}

function render({ focus = false } = {}) {
  renderShell();
  $('#main').innerHTML = state.screen === 'question' ? renderQuestion() : state.screen === 'result' ? renderResult() : renderHome();
  renderDialogs();
  persist();
  if (focus) {
    const target = $('#question-title') || $('#result-title') || $('#main');
    target.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}

function openDialog(id) {
  document.querySelectorAll('dialog[open]').forEach(item => item.close());
  $('#' + id).showModal();
}

function validIncome(value) {
  if (!value || value.total === '' && value.size === '') return true;
  return value.total !== '' && value.size !== '' && Number.isFinite(Number(value.total)) && Number(value.total) >= 0 && Number(value.total) <= 100000000 && Number.isInteger(Number(value.size)) && Number(value.size) >= 1 && Number(value.size) <= 30;
}

function nextQuestion(skip = false) {
  const item = questions(state.answers)[state.questionIndex];
  if (skip) delete state.answers[item.id];
  const answer = state.answers[item.id];
  const valid = item.type === 'income' ? validIncome(answer) : item.type === 'multi' ? answer?.length > 0 : item.options.some(option => option.id === answer);
  if (!skip && !valid) {
    $('#form-error').textContent = item.type === 'income' ? t('incomeError') : t('choose');
    $('#question-form input, #question-form select')?.focus();
    return;
  }
  // A changed branch must not retain answers from a question that no longer applies.
  const list = questions(state.answers);
  const visible = new Set(list.map(question => question.id));
  for (const key of Object.keys(state.answers)) if (!visible.has(key)) delete state.answers[key];
  if (state.answers.age !== 'adult') state.groupConsent = false;
  const currentIndex = list.findIndex(question => question.id === item.id);
  if (currentIndex < list.length - 1) state.questionIndex = currentIndex + 1;
  else {
    state.screen = 'result';
    state.tab = 'route';
    state.completedKey = routeKey(state.answers);
    track('completed', { route: routeKey(state.answers) });
  }
  render({ focus: true });
}

let exportBusy = false;
async function exportRoute(format) {
  if (exportBusy) return;
  exportBusy = true;
  const status = $('#download-status');
  const buttons = [...document.querySelectorAll('[data-action="download-format"], [data-action="download"], [data-action="print"]')];
  buttons.forEach(button => button.disabled = true);
  if (status) status.textContent = text(L('Готовим документ. Это может занять несколько секунд.', 'Құжат дайындалуда. Бірнеше секунд қажет болуы мүмкін.'));
  try {
    const route = createRoute(state.answers);
    const model = buildExportModel({
      answers: state.answers, language: state.language, focus: activePlan(route),
      progress: state.progress[routeKey(state.answers)] || {}, notices: routeNotices(route),
    });
    const { createDownload } = await import('./export-documents.js');
    const file = await createDownload(model, format);
    const url = URL.createObjectURL(new Blob([file.bytes], { type: file.type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `Shanyraq-${model.language}-${new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Almaty' })}.${format}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    track('downloaded', { route: routeKey(state.answers) });
    if (status) status.textContent = text(L('Файл готов. Он сохранён в загрузки браузера.', 'Файл дайын. Ол браузердің жүктеулеріне сақталды.'));
    toast(t('downloaded'));
  } catch (error) {
    if (status) status.textContent = text(L('Не удалось подготовить файл. Проверьте, что локальный навигатор запущен, и попробуйте ещё раз.', 'Файлды дайындау мүмкін болмады. Жергілікті навигатордың іске қосылғанын тексеріп, қайталап көріңіз.'));
    toast(t('retry'));
  } finally {
    exportBusy = false;
    buttons.forEach(button => button.disabled = false);
  }
}

async function clearData() {
  if (!window.confirm(t('clearConfirm'))) return;
  try {
    await eventChain;
    await post('/api/forget', { visitor: state.visitor });
    localStorage.removeItem(STORAGE);
    sessionStorage.removeItem(STORAGE);
    state.visitor = uid();
    state.session = uid();
    state.answers = {};
    state.progress = {};
    state.plans = {};
    state.feedback = {};
    state.outcome = {};
    state.remember = false;
    state.consent = false;
    state.groupConsent = false;
    state.consentChosen = false;
    state.screen = 'home';
    state.questionIndex = 0;
    render({ focus: true });
    toast(t('cleared'));
  } catch { toast(t('deleteFailed')); }
}

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  event.preventDefault();
  const action = button.dataset.action;
  const value = button.dataset.value;
  switch (action) {
    case 'catalog': goToSection('catalog'); break;
    case 'how': goToSection('how'); break;
    case 'choose-goal': startGoal(value); break;
    case 'all-situations':
      state.showAll = !state.showAll; refreshCatalog();
      $('#catalog-results [data-action="all-situations"]')?.focus({ preventScroll: true });
      break;
    case 'search-tag':
      state.search = value; $('#catalog-search').value = value; refreshCatalog(); goToSection('catalog'); break;
    case 'reset-search':
      state.search = ''; $('#catalog-search').value = ''; refreshCatalog(); $('#catalog-search').focus(); break;
    case 'library': openDialog('library-dialog'); break;
    case 'question-stage':
      if (Number(value) >= 0 && Number(value) < state.questionIndex) { state.questionIndex = Number(value); render({ focus: true }); }
      break;
    case 'next-task': {
      const next = document.querySelector('.task-card input:not(:checked)');
      if (next) {
        next.closest('.task-card').querySelector('details').open = true;
        next.closest('.task-card').scrollIntoView({ behavior: state.reducedMotion ? 'instant' : 'smooth', block: 'center' });
        next.focus({ preventScroll: true });
      }
      break;
    }
    case 'home': state.screen = 'home'; render({ focus: true }); break;
    case 'start':
      state.screen = state.completedKey === routeKey(state.answers) ? 'result' : 'question';
      track('started'); render({ focus: true });
      if (!state.consentChosen) openDialog('consent-dialog');
      break;
    case 'back':
      if (state.questionIndex > 0) state.questionIndex -= 1;
      else state.screen = 'home';
      render({ focus: true }); break;
    case 'skip': nextQuestion(true); break;
    case 'language':
      state.language = value;
      render();
      document.querySelector(`[data-action="language"][data-value="${value}"]`)?.focus({ preventScroll: true });
      break;
    case 'edit': state.screen = 'question'; state.questionIndex = 0; render({ focus: true }); break;
    case 'tab':
      state.tab = value;
      render();
      document.querySelector(`[data-action="tab"][data-value="${value}"]`)?.focus({ preventScroll: true });
      break;
    case 'plan':
      state.plans[routeKey(state.answers)] = value;
      state.tab = 'route';
      render();
      $('#route-program')?.focus();
      break;
    case 'fresh': state.screen = 'question'; state.answers = {}; state.session = uid(); state.questionIndex = 0; track('started'); render({ focus: true }); break;
    case 'access': openDialog('access-dialog'); break;
    case 'help': openDialog('help-dialog'); break;
    case 'privacy': openDialog('privacy-dialog'); break;
    case 'sources': openDialog('sources-dialog'); break;
    case 'consent-settings': openDialog('consent-dialog'); break;
    case 'no-analytics':
      $('#analytics-consent').checked = false;
      $('#group-consent').checked = false;
      $('#consent-form').requestSubmit();
      break;
    case 'close-dialog': button.closest('dialog').close(); break;
    case 'clear': await clearData(); break;
    case 'text-size':
      state.textSize = value;
      document.documentElement.dataset.text = value;
      document.querySelectorAll('[data-action="text-size"]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.value === value)));
      persist(); break;
    case 'download': openDialog('download-dialog'); break;
    case 'download-format': await exportRoute(value); break;
    case 'print': openDialog('download-dialog'); await exportRoute('pdf'); break;
    case 'feedback': {
      const key = routeKey(state.answers);
      state.feedback[key] = value;
      persist();
      document.querySelectorAll('[data-action="feedback"]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.value === value)));
      const success = await track('feedback', { route: key, value });
      toast(state.consent ? success ? t('thanks') : t('retry') : t('feedbackPrivate'));
      break;
    }
  }
});

document.addEventListener('input', event => {
  if (event.target.id === 'catalog-search') { state.search = event.target.value; refreshCatalog(); }
  if (event.target.id === 'income-total' || event.target.id === 'income-size') {
    state.answers.income = { total: $('#income-total').value, size: $('#income-size').value };
    persist();
  }
});

document.addEventListener('change', async event => {
  const input = event.target;
  if (input.name === 'answer' && state.screen === 'question') {
    const item = questions(state.answers)[state.questionIndex];
    if (item.type === 'multi') {
      let selected = [...document.querySelectorAll('#question-form input:checked')].map(element => element.value);
      if (input.checked && ['other', 'unsure'].includes(input.value)) selected = [input.value];
      else if (input.checked) selected = selected.filter(value => !['other', 'unsure'].includes(value));
      state.answers[item.id] = selected;
      document.querySelectorAll('#question-form input').forEach(element => element.checked = selected.includes(element.value));
    } else state.answers[item.id] = input.value;
    if ($('#form-error')) $('#form-error').textContent = '';
    persist();
  }
  if (input.id === 'route-program') {
    state.plans[routeKey(state.answers)] = input.value;
    render();
    $('#route-program')?.focus({ preventScroll: true });
  }
  if (input.id === 'remember') {
    state.remember = input.checked;
    persist();
    const message = storageFailed ? t('storageFail') : state.remember ? t('savedDevice') : t('sessionOnly');
    input.closest('.device-save').querySelector('p').textContent = message;
    toast(message);
  }
  if (input.id === 'high-contrast') { state.highContrast = input.checked; document.documentElement.dataset.contrast = input.checked ? 'high' : 'normal'; persist(); }
  if (input.id === 'reduced-motion') { state.reducedMotion = input.checked; document.documentElement.dataset.motion = input.checked ? 'reduced' : 'normal'; persist(); }
  if (input.dataset.task) {
    const key = routeKey(state.answers);
    state.progress[key] ||= {};
    state.progress[key][input.dataset.task] = input.checked;
    if (input.checked) track('task_done', { route: key, task: input.dataset.task });
    persist();
    const open = [...document.querySelectorAll('.task-card details')].map(item => item.open);
    const scroll = window.scrollY;
    render();
    document.querySelectorAll('.task-card details').forEach((item, index) => item.open = open[index]);
    document.querySelector(`[data-task="${input.dataset.task}"]`)?.focus({ preventScroll: true });
    window.scrollTo({ top: scroll, behavior: 'instant' });
  }
  if (input.id === 'outcome' && input.value) {
    const key = routeKey(state.answers);
    state.outcome[key] = input.value;
    persist();
    const success = await track('outcome', { route: key, value: input.value });
    toast(state.consent ? success ? t('thanks') : t('retry') : t('feedbackPrivate'));
  }
});

document.addEventListener('submit', async event => {
  if (event.target.id === 'catalog-search-form') { event.preventDefault(); goToSection('catalog'); return; }
  event.preventDefault();
  if (event.target.id === 'question-form') nextQuestion();
  if (event.target.id === 'consent-form') {
    const consent = $('#analytics-consent').checked;
    const groupConsent = consent && $('#group-consent').checked && state.answers.age === 'adult';
    const submit = event.target.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await eventChain;
      if (state.consent && !consent) await post('/api/forget', { visitor: state.visitor });
      else if (state.groupConsent && !groupConsent) await post('/api/forget-groups', { visitor: state.visitor });
      const newlyAccepted = !state.consent && consent;
      const groupChanged = state.groupConsent !== groupConsent;
      state.consent = consent;
      state.groupConsent = groupConsent;
      state.consentChosen = true;
      persist();
      if (newlyAccepted) {
        track('visit');
        if (state.screen === 'question') track('started');
      }
      if (consent && state.screen === 'result' && (newlyAccepted || groupChanged)) track('completed', { route: routeKey(state.answers) });
      $('#consent-dialog').close();
      toast(t('settingsSaved'));
    } catch { $('#consent-error').textContent = t('retry'); }
    finally { submit.disabled = false; }
  }
  if (event.target.id === 'contact-form') {
    const email = $('#contact-email');
    if (!email.checkValidity() || !$('#contact-consent').checked) {
      $('#contact-error').textContent = t('contactError');
      return;
    }
    const button = event.target.querySelector('button');
    button.disabled = true;
    try {
      await post('/api/contact', { visitor: state.visitor, email: email.value.trim(), language: state.language, consent: true });
      email.value = '';
      $('#contact-consent').checked = false;
      $('#contact-error').textContent = '';
      toast(t('contactSaved'));
    } catch { $('#contact-error').textContent = t('retry'); }
    finally { button.disabled = false; }
  }
});

window.matchMedia('(max-width: 600px)').addEventListener('change', event => {
  const overview = $('#answer-overview');
  if (overview) overview.open = !event.matches;
});

render();
track('visit');
