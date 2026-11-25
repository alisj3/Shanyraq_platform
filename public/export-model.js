import { L, tr, ui, questions, sources, sourceNotes, REVIEW_DATE } from './content.js';
import { createRoute, planPrograms, planChoices, routeTasks } from './rules.js';

// Export is a view of the existing route. It does not add eligibility rules.
const results = {
  'digital-access': L('Вход и способ подписи проверены либо определено, какая помощь нужна.', 'Кіру мен қол қою тәсілі тексерілді немесе қандай көмек қажет екені анықталды.'),
  'family-records': L('Состав семьи проверен, недостающие сведения и необходимые согласия уточнены.', 'Отбасы құрамы тексеріліп, жетіспейтін мәліметтер мен қажетті келісімдер нақтыланды.'),
  'disability-records': L('Сведения о статусе проверены, удобный способ обращения выбран.', 'Мәртебе мәліметтері тексеріліп, жүгінудің ыңғайлы тәсілі таңдалды.'),
  'orphan-records': L('Прежняя запись и её дата проверены, вопросы о статусе сформулированы.', 'Бұрынғы жазба мен оның күні тексеріліп, мәртебе туралы сұрақтар дайындалды.'),
  'property-record': L('Сведения о недвижимости проверены, при расхождении понятен следующий адресат.', 'Жылжымайтын мүлік мәліметтері тексеріліп, сәйкессіздік болса келесі адресат анықталды.'),
  'guardian-status': L('Уточнены представитель, порядок обращения и необходимые подтверждения.', 'Өкіл, жүгіну тәртібі және қажетті растаулар нақтыланды.'),
  'queue-record': L('Существующая запись проверена либо результат новой подачи сохранён.', 'Қолданыстағы жазба тексерілді немесе жаңа өтініш нәтижесі сақталды.'),
  'queue-result': L('Результат прочитан и сохранён, следующий шаг понятен.', 'Нәтиже оқылып, сақталды, келесі қадам түсінікті.'),
  'budget-plan': L('Записаны расходы, резерв и посильная сумма накоплений.', 'Шығындар, резерв және жинақтауға болатын сома жазылды.'),
  'mortgage-check': L('Актуальный приём уточнён, расчёт банка сопоставлен с бюджетом семьи.', 'Өзекті қабылдау нақтыланып, банк есебі отбасы бюджетімен салыстырылды.'),
  'refusal-reason': L('Решение сохранено, причина и порядок дальнейшего обращения уточнены.', 'Шешім сақталып, себебі мен кейінгі жүгіну тәртібі нақтыланды.'),
  'appeal-submit': L('Обращение направлено при необходимости, его номер и порядок отслеживания сохранены.', 'Қажет болса өтініш жіберіліп, оның нөмірі мен қадағалау тәртібі сақталды.'),
  'acceptance-flat': L('Замечания записаны, ответственный и порядок устранения уточнены.', 'Ескертулер жазылып, жауапты адам мен жою тәртібі нақтыланды.'),
  'acceptance-access': L('Условия осмотрены с учётом потребностей семьи, вопросы записаны.', 'Жағдайлар отбасы қажеттіліктерін ескеріп қаралып, сұрақтар жазылды.'),
};

export const exportLabels = {
  title: L('Индивидуальный жилищный маршрут', 'Жеке тұрғын үй маршруты'),
  subtitle: L('Подробный чек-лист для самостоятельных действий', 'Өз бетіңізше әрекет етуге арналған толық тізім'),
  created: L('Составлен', 'Жасалған күні'),
  reviewed: L('Источники сверены', 'Дереккөздер тексерілген күні'),
  chosen: L('Выбранный путь', 'Таңдалған жол'),
  profile: L('Ваша ситуация', 'Сіздің жағдайыңыз'),
  contents: L('Быстрый переход к шагам', 'Қадамдарға жылдам өту'),
  actions: L('Проверьте по порядку', 'Ретімен тексеріңіз'),
  result: L('Ожидаемый результат', 'Күтілетін нәтиже'),
  completed: L('Шаг выполнен', 'Қадам орындалды'),
  record: L('Дата и номер обращения если есть', 'Күні және бар болса өтініш нөмірі'),
  notes: L('Что получилось и что уточнить', 'Не орындалды және нені нақтылау керек'),
  back: L('К списку шагов', 'Қадамдар тізіміне'),
  conditions: L('Условия выбранных вариантов', 'Таңдалған нұсқалардың шарттары'),
  answers: L('Ответы на которых построен маршрут', 'Маршрут негізделген жауаптар'),
  sources: L('Официальные ссылки и помощь', 'Ресми сілтемелер мен көмек'),
  important: L('Что учесть перед обращением', 'Жүгінер алдында нені ескеру керек'),
  privacy: L('Храните этот документ у себя. В нём могут быть сведения о социальной категории и обстоятельствах семьи.', 'Бұл құжатты өзіңізде сақтаңыз. Онда әлеуметтік санат пен отбасы жағдайы туралы мәліметтер болуы мүмкін.'),
  instructions: L('Название шага в оглавлении ведёт к инструкции. Отметки с сайта перенесены к крупным шагам. Подпункты отмечайте отдельно, результат записывайте в поле под шагом.', 'Мазмұндағы қадам атауы нұсқаулыққа апарады. Сайттағы белгілер негізгі қадамдарға көшірілген. Ішкі тармақтарды бөлек белгілеп, нәтижені қадам астындағы өріске жазыңыз.'),
  localEdits: L('Изменения в документе остаются в вашей копии и не обновляют маршрут на сайте.', 'Құжаттағы өзгерістер сіздің көшірмеңізде қалады және сайттағы маршрутты жаңартпайды.'),
  pdfHelp: L('В PDF можно нажимать флажки и заполнять поля. После изменений сохраните файл. Поддержка полей зависит от программы просмотра.', 'PDF ішінде жалаушаларды басып, өрістерді толтыруға болады. Өзгерістерден кейін файлды сақтаңыз. Өрістерді қолдау қарау бағдарламасына байланысты.'),
  docxHelp: L('В Word можно отмечать флажки, редактировать текст и дополнять заметки. Переход по ссылке может потребовать Ctrl или Command.', 'Word ішінде жалаушаларды белгілеп, мәтінді өңдеп, жазбаларды толықтыруға болады. Сілтемеге өту үшін Ctrl немесе Command қажет болуы мүмкін.'),
  support: L('Отбасы банк 300 с мобильного телефона. Помощь по государственным сервисам eGov 1414.', 'Отбасы банкке ұялы телефоннан 300. eGov мемлекеттік сервистері бойынша көмек 1414.'),
};

function splitActions(body, language) {
  // Keep the reviewed wording verbatim. Sentences become individually checkable items.
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(language, { granularity: 'sentence' });
    return [...segmenter.segment(body)].map(item => item.segment.trim()).filter(Boolean);
  }
  return body.split(/(?<=[.!?])\s+(?=[А-ЯӘҒҚҢӨҰҮҺІA-Z])/u).filter(Boolean);
}

export function buildExportModel({ answers, language = 'ru', focus, progress = {}, notices = [], now = new Date() }) {
  language = language === 'kk' ? 'kk' : 'ru';
  const translate = value => tr(value, language);
  const route = createRoute(answers);
  const validFocus = focus === 'all' || route.programs.some(item => item.id === focus);
  focus = validFocus ? focus : route.defaultProgram || 'all';
  const selected = planPrograms(route, focus);
  const allTasks = routeTasks(route, focus);
  const seen = new Set();
  const labels = Object.fromEntries(Object.entries(exportLabels).map(([key, value]) => [key, translate(value)]));
  const profileLabels = {
    purpose: L('Для кого', 'Кім үшін'), categories: L('Категории', 'Санаттар'),
    goal: L('Задача', 'Міндет'), region: L('Регион', 'Өңір'),
  };
  const summaries = questions(answers).filter(item => item.options && answers[item.id]).map(item => ({
    id: item.id,
    label: translate(profileLabels[item.id] || item.title),
    value: item.options.filter(option => [].concat(answers[item.id]).includes(option.id)).map(option => translate(option.title)).join(', '),
  }));
  let number = 0;
  const groups = selected.map(program => ({
    id: program.id,
    title: translate(program.title),
    steps: program.steps.filter(task => {
      if (seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    }).map(task => {
      number += 1;
      return {
        id: task.id, number, title: translate(task.title), done: progress[task.id] === true,
        actions: splitActions(translate(task.body), language),
        result: translate(results[task.id] || L('Пункты проверены, результат и оставшиеся вопросы записаны ниже.', 'Тармақтар тексеріліп, нәтиже мен қалған сұрақтар төменде жазылды.')),
        source: task.source ? {
          id: task.source, title: translate(sources[task.source].title), url: sources[task.source].url,
          note: sourceNotes[task.source] ? translate(sourceNotes[task.source]) : '',
        } : null,
      };
    }),
  })).filter(group => group.steps.length);
  const sourceIds = [...new Set(selected.flatMap(program => [program.source, ...program.steps.map(task => task.source)]).filter(Boolean))];
  return {
    language, labels, focus,
    date: new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'kk-KZ', { timeZone: 'Asia/Almaty' }).format(now),
    reviewDate: REVIEW_DATE.split('-').reverse().join('.'),
    selectedTitle: focus === 'all' ? translate(ui.allVariants) : translate(route.programs.find(item => item.id === focus).title),
    intro: translate(ui.resultText),
    allHint: focus === 'all' && planChoices(route).length > 1 ? translate(ui.allPlanHint) : '',
    notices: [...new Set(notices.map(translate))],
    profile: summaries.filter(item => ['goal','categories','region','purpose'].includes(item.id)),
    answers: summaries,
    groups,
    tasks: allTasks.length,
    done: allTasks.filter(task => progress[task.id] === true).length,
    programs: selected.filter(item => planChoices(route).includes(item)).map(item => ({
      title: translate(item.title), description: translate(item.description),
      reason: translate(item.reason), conditions: item.conditions.map(translate),
    })),
    sources: sourceIds.map(id => ({ id, title: translate(sources[id].title), url: sources[id].url, note: sourceNotes[id] ? translate(sourceNotes[id]) : '' })),
    project: translate(ui.projectText), disclaimer: translate(ui.disclaimer),
    safe: translate(ui.safe),
  };
}
