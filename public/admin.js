import { categories, outcomes, tr } from './content.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const purposes = { self: 'Для себя', family: 'Для близкого', consultant: 'Консультирует других', explore: 'Изучает возможности' };
let key = new URLSearchParams(location.hash.slice(1)).get('key') || '';
history.replaceState(null, '', location.pathname);
document.querySelector('#admin-key').value = key;
let latestReport;

function rows(values, labels) {
  const entries = Object.entries(values);
  return entries.length ? entries.map(([id, value]) => `<div class="report-row"><span>${escape(labels[id] || id)}</span><strong>${value}</strong></div>`).join('') : '<p class="muted small">Пока нет данных.</p>';
}

function render(data) {
  latestReport = data;
  const citizenRoutes = (data.purposes.self || 0) + (data.purposes.family || 0);
  document.querySelector('#report').innerHTML = `
    <div class="notices"><p><strong>Как читать показатели.</strong> Код браузера приблизительно отражает устройство, а не подтверждённого человека. Один человек может пользоваться разными браузерами. В одной семье браузер может быть общим. «Завершённый маршрут» — прохождение опроса, «консультация» — отдельное взаимодействие со специалистом.</p><p>Изменение жилищных условий ниже показано со слов пользователя. Для подтверждённого KPI проекта нужны отдельная проверка и согласованная методика учёта.</p></div>
    <div class="admin-metrics">
      <div class="metric"><span class="number">${data.visitors}</span><p>Кодов браузера с событиями</p></div>
      <div class="metric"><span class="number">${data.routes}</span><p>Завершённых прохождений</p></div>
      <div class="metric"><span class="number">${citizenRoutes}</span><p>Маршрутов для себя или близкого</p></div>
      <div class="metric"><span class="number">${data.outcomes.housing || 0}</span><p>Сообщили об изменении жилищных условий</p></div>
    </div>
    <div class="report-grid">
      <section class="report-box"><h2>Для кого проходили</h2>${rows(data.purposes, purposes)}</section>
      <section class="report-box"><h2>Нашли ответ?</h2>${rows(data.feedback, { yes: 'Да', partly: 'Частично', no: 'Пока нет' })}</section>
      <section class="report-box"><h2>Что удалось сделать</h2>${rows(data.outcomes, Object.fromEntries(outcomes.map(([id, label]) => [id, tr(label)])))}</section>
      <section class="report-box"><h2>Язык маршрута</h2>${rows(data.languages, { ru: 'Русский', kk: 'Қазақша' })}</section>
      <section class="report-box"><h2>Категории, с отдельного согласия</h2><p class="small muted">Одно прохождение может относиться к нескольким группам. Суммировать эти строки в общий охват нельзя.</p>${rows(data.groups, Object.fromEntries(categories.map(item => [item.id, tr(item.title)])))}</section>
      <section class="report-box"><h2>Действия в интерфейсе</h2><p class="small muted">Это число событий. Повторные открытия и отметки могут увеличить его.</p>${rows(data.events, { visit: 'Открытия с согласием', started: 'Начали или продолжили опрос', completed: 'Открыли готовый маршрут', task_done: 'Отметили выполненный шаг', downloaded: 'Скачали маршрут', feedback: 'Ответили о полезности', outcome: 'Сообщили о результате' })}</section>
    </div>
    <section class="program-card"><h2>Контакты для проверки результата</h2><p class="small muted">Отдельное согласие на связь. Автоматических писем и записи к консультанту в этой версии нет. Срок хранения до 30 дней. Контакт хранится отдельно от полного набора ответов.</p><div class="table-wrap"><table><thead><tr><th scope="col">Дата, UTC</th><th scope="col">Email</th><th scope="col">Язык</th><th scope="col">Согласие</th><th scope="col">Действие</th></tr></thead><tbody>${data.contacts.map(item => `<tr><td>${escape(item.created)}</td><td>${escape(item.email)}</td><td>${escape(item.language)}</td><td>${escape(item.consent_version)}</td><td><button class="text-button" data-delete="${escape(item.id)}">Удалить</button></td></tr>`).join('') || '<tr><td colspan="5">Контактов пока нет.</td></tr>'}</tbody></table></div></section>
    <section class="program-card"><h2>По дням</h2><div class="table-wrap"><table><thead><tr><th scope="col">Дата, UTC</th><th scope="col">Кодов браузера</th><th scope="col">Событий</th></tr></thead><tbody>${data.days.map(item => `<tr><td>${escape(item.day)}</td><td>${item.visitors}</td><td>${item.events}</td></tr>`).join('') || '<tr><td colspan="3">Пока нет событий.</td></tr>'}</tbody></table></div></section>
    <button class="btn small secondary" id="export-report">Скачать сводку CSV</button> <button class="text-button" id="refresh-report">Обновить</button>
    <p class="small muted">Сводка выгружается без email и браузерных кодов. Обновляется по фактическим событиям этой локальной версии.</p>`;
}

async function loadReport() {
  document.querySelector('#admin-error').textContent = '';
  try {
    const response = await fetch('/api/admin/report', { headers: { Authorization: 'Bearer ' + key } });
    if (!response.ok) throw new Error('Access denied');
    render(await response.json());
    document.querySelector('#admin-form').hidden = true;
  } catch {
    document.querySelector('#admin-form').hidden = false;
    document.querySelector('#admin-error').textContent = 'Не удалось открыть отчёт. Проверьте ключ доступа из окна запуска платформы.';
  }
}

document.querySelector('#admin-form').addEventListener('submit', event => {
  event.preventDefault();
  key = document.querySelector('#admin-key').value.trim();
  loadReport();
});

document.addEventListener('click', async event => {
  if (event.target.id === 'refresh-report') await loadReport();
  if (event.target.id === 'export-report' && latestReport) {
    const data = [['Показатель', 'Значение'], ['Кодов браузера', latestReport.visitors], ['Завершённых прохождений', latestReport.routes]];
    for (const group of ['purposes', 'feedback', 'outcomes', 'languages', 'groups']) {
      for (const [name, value] of Object.entries(latestReport[group])) data.push([`${group} / ${name}`, value]);
    }
    const csv = '\ufeff' + data.map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Shanyraq-statistika.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  if (event.target.dataset.delete && confirm('Удалить этот контакт из локальной базы?')) {
    try {
      const response = await fetch('/api/admin/delete-contact', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify({ id: event.target.dataset.delete }) });
      if (!response.ok) throw new Error('Delete failed');
      await loadReport();
    } catch { document.querySelector('#admin-error').textContent = 'Контакт удалить не удалось. Повторите попытку.'; }
  }
});

if (key) loadReport();
