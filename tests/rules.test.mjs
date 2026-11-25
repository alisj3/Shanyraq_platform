import test from 'node:test';
import assert from 'node:assert/strict';
import { questions, categories, sources, ui, lessons } from '../public/content.js';
import { createRoute, routeTasks, incomeEstimate, routeKey, programs, planPrograms } from '../public/rules.js';

const date = new Date('2026-11-11T12:00:00');
const base = { purpose: 'self', categories: ['disability'], goal: 'rent', age: 'adult', citizenship: 'kz', region: 'astana', housing: 'none5', queue: 'yes', disabilityGroup: 'one_two', digital: 'ready' };

test('research has five target groups and two general choices', () => {
  assert.equal(categories.length, 7);
  assert.equal(categories.slice(0, 5).length, 5);
});

test('single-parent status by itself does not suggest rent subsidy', () => {
  const route = createRoute({ ...base, categories: ['single_parent'] }, date);
  assert(!route.programs.some(item => item.id === 'subsidy'));
  assert(route.programs.some(item => item.id === 'public_rent'));
  assert(route.notices.some(item => item.ru.includes('Неполная семья')));
});

test('overlapping groups preserve a qualifying separate ground', () => {
  const route = createRoute({ ...base, categories: ['single_parent', 'child_disability'] }, date);
  assert(route.programs.some(item => item.id === 'subsidy'));
});

test('disability group III alone does not become a rent subsidy ground', () => {
  assert(!createRoute({ ...base, disabilityGroup: 'three' }, date).programs.some(item => item.id === 'subsidy'));
  assert(createRoute({ ...base, disabilityGroup: 'three', categories: ['disability', 'large_family'] }, date).programs.some(item => item.id === 'subsidy'));
});

test('unknown disability status stays a question, not a positive match', () => {
  const item = createRoute({ ...base, disabilityGroup: 'unknown' }, date).programs.find(item => item.id === 'subsidy');
  assert.equal(item.status, 'check');
});

test('income calculation uses total household monthly average per member', () => {
  const low = { ...base, income: { total: '200000', size: '5' } };
  assert.equal(incomeEstimate(low, date).perPerson, 40000);
  assert.equal(createRoute(low, date).programs.find(item => item.id === 'subsidy').status, 'possible');
  const high = { ...base, income: { total: '300000', size: '1' } };
  assert.equal(createRoute(high, date).programs.find(item => item.id === 'subsidy').status, 'unlikely');
});

test('a future year never reuses an expired financial threshold as a match', () => {
  const answers = { ...base, income: { total: '200000', size: '5' } };
  const future = new Date('2027-02-01');
  assert.equal(incomeEstimate(answers, future).current, false);
  assert.equal(createRoute(answers, future).programs.find(item => item.id === 'subsidy').status, 'check');
});

test('invalid and missing numbers do not qualify anyone', () => {
  for (const income of [{ total: '', size: '' }, { total: '100000', size: 0 }, { total: '-1', size: 3 }, { total: 'Infinity', size: 1 }, { total: '100', size: 1.5 }]) {
    assert.equal(incomeEstimate({ ...base, income }, date), null);
  }
});

test('minor receives representative route without adult credit or subsidy suggestions', () => {
  const route = createRoute({ ...base, age: 'minor' }, date);
  assert.deepEqual(route.programs.map(item => item.id), ['guardian']);
});

test('ownership does not remove all support and does not promise housing registration', () => {
  const route = createRoute({ ...base, housing: 'share' }, date);
  assert(route.programs.some(item => item.id === 'property'));
  assert.equal(route.programs.find(item => item.id === 'register').status, 'check');
  assert(route.programs.some(item => item.id === 'utilities'));
});

test('questions change with goal and do not ask income for an appeal', () => {
  assert(questions(base).some(item => item.id === 'income'));
  const appeal = questions({ ...base, goal: 'appeal' });
  assert(!appeal.some(item => item.id === 'income'));
  assert(!appeal.some(item => item.id === 'disabilityGroup'));
});

test('routes cover each supported goal with usable steps and known sources', () => {
  for (const goal of questions(base).find(item => item.id === 'goal').options.map(item => item.id)) {
    const route = createRoute({ ...base, goal }, date);
    const tasks = routeTasks(route);
    assert(tasks.length > 0);
    assert.equal(tasks.length, new Set(tasks.map(item => item.id)).size);
    for (const task of tasks) {
      assert(task.title.ru && task.title.kk && task.body.ru && task.body.kk);
      if (task.source) assert(sources[task.source]);
    }
  }
});

test('route identity is stable across property and category ordering, changes with answers', () => {
  assert.equal(routeKey({ age: 'adult', categories: ['orphan', 'disability'] }), routeKey({ categories: ['disability', 'orphan'], age: 'adult' }));
  assert.notEqual(routeKey(base), routeKey({ ...base, queue: 'no' }));
});

test('all interface text, lessons, programs and sources have both languages', () => {
  function check(value) {
    if (!value || typeof value !== 'object') return;
    if ('ru' in value) assert.equal(typeof value.kk, 'string');
    for (const child of Object.values(value)) check(child);
  }
  [ui, lessons, programs, sources, questions(base)].forEach(check);
  for (const source of Object.values(sources)) assert(source.url.startsWith('https://'));
});

test('five categories produce their own preparation and correct rental alternatives', () => {
  const cases = [
    { categories: ['disability'], disabilityGroup: 'one_two', step: 'disability-records', subsidy: true },
    { categories: ['child_disability'], step: 'family-records', subsidy: true },
    { categories: ['large_family'], step: 'family-records', subsidy: true },
    { categories: ['single_parent'], step: 'family-records', subsidy: false },
    { categories: ['orphan'], orphanAge: 'under29', orphanStatus: 'confirmed', step: 'orphan-records', subsidy: true },
  ];
  for (const item of cases) {
    const route = createRoute({ ...base, ...item }, date);
    assert.equal(route.programs.some(program => program.id === 'subsidy'), item.subsidy);
    assert(routeTasks(route).some(task => task.id === item.step));
  }
});

test('a person aged 29+ retains a route to existing registration, without an orphan rent ground', () => {
  const answers = { ...base, categories: ['orphan'], orphanAge: 'over29', orphanStatus: 'confirmed' };
  const route = createRoute(answers, date);
  assert(route.programs.some(item => item.id === 'register'));
  assert(!route.programs.some(item => item.id === 'subsidy'));
  assert(routeTasks(route).some(item => item.id === 'orphan-records'));
  assert(routeTasks(route).some(item => item.id === 'queue-inventory'));
  assert(!questions(answers).some(item => item.id === 'income'));
});

test('young age alone does not confirm the orphan rental ground', () => {
  const answers = { ...base, categories: ['orphan'], orphanAge: 'under29', orphanStatus: 'unknown', income: { total: '20000', size: '1' } };
  assert.equal(createRoute(answers, date).programs.find(item => item.id === 'subsidy').status, 'check');
  assert(!createRoute({ ...answers, orphanStatus: 'not_confirmed' }, date).programs.some(item => item.id === 'subsidy'));
});

test('another valid category can apply when the orphan age ground is unavailable', () => {
  const route = createRoute({ ...base, categories: ['orphan', 'child_disability'], orphanAge: 'over29', orphanStatus: 'confirmed' }, date);
  assert(route.programs.some(item => item.id === 'subsidy'));
});

test('existing registrants receive review and inventory instead of a new first application', () => {
  const route = createRoute(base, date);
  const steps = route.programs.find(item => item.id === 'register').steps.map(item => item.id);
  assert.deepEqual(steps, ['queue-review', 'queue-inventory']);
  assert(createRoute({ ...base, queue: 'no' }, date).programs.find(item => item.id === 'register').steps.some(item => item.id === 'queue-record'));
});

test('high income does not make subsidy the primary plan', () => {
  const route = createRoute({ ...base, income: { total: '900000', size: '4' } }, date);
  assert.equal(route.programs.find(item => item.id === 'subsidy').status, 'unlikely');
  assert.equal(route.defaultProgram, 'public_rent');
  assert(!routeTasks(route, route.defaultProgram).some(item => item.id === 'rent-apply'));
});

test('selecting utility assistance does not include rental and queue requirements', () => {
  const route = createRoute(base, date);
  const selected = planPrograms(route, 'utilities').map(item => item.id);
  assert(selected.includes('utilities'));
  assert(!selected.includes('subsidy'));
  assert(!selected.includes('register'));
  assert(!selected.includes('disability_records'));
  const orphanRoute = createRoute({ ...base, categories: ['orphan'], orphanAge: 'under29', orphanStatus: 'confirmed' }, date);
  assert(!planPrograms(orphanRoute, 'utilities').some(item => item.id === 'orphan_records'));
});

test('purchase route includes budgeting and does not impose a housing queue on every loan', () => {
  const answers = { ...base, goal: 'buy' };
  const route = createRoute(answers, date);
  const selected = planPrograms(route, route.defaultProgram).map(item => item.id);
  assert(selected.includes('savings'));
  assert(selected.includes('mortgage'));
  assert(!selected.includes('register'));
  assert(!questions(answers).some(item => item.id === 'income'));
  assert.deepEqual(planPrograms(route, 'savings').map(item => item.id), ['savings']);
});

test('income is omitted where the selected categories do not establish a rental ground', () => {
  for (const extra of [{ categories: ['single_parent'] }, { disabilityGroup: 'three' }, { disabilityGroup: 'not_confirmed' }]) {
    const answers = { ...base, ...extra, income: { total: '100', size: '1' } };
    assert(!questions(answers).some(item => item.id === 'income'));
    assert.equal(createRoute(answers, date).estimate, null);
  }
});

test('appeals and housing inspection avoid irrelevant financial and property questions', () => {
  for (const goal of ['appeal', 'relocate', 'received', 'privatize']) {
    const ids = questions({ ...base, goal }).map(item => item.id);
    assert(!ids.includes('income'));
    assert(!ids.includes('housing'));
  }
});

test('city registration is checked after queue status and keeps unknown answers tentative', () => {
  const answers = { ...base, queue: 'no', cityRegistration: 'unknown' };
  const ids = questions(answers).map(item => item.id);
  assert(ids.indexOf('cityRegistration') > ids.indexOf('queue'));
  assert.equal(createRoute(answers, date).programs.find(item => item.id === 'register').status, 'check');
  assert(!questions({ ...answers, queue: 'yes' }).some(item => item.id === 'cityRegistration'));
});

test('state housing loan retains queue prerequisites while another bank product stays separate', () => {
  const route = createRoute({ ...base, goal: 'buy' }, date);
  const selected = planPrograms(route, 'state_loan').map(item => item.id);
  assert(selected.includes('register'));
  assert(selected.includes('savings'));
  assert(selected.includes('state_loan'));
  assert(!selected.includes('mortgage'));
});

test('rent checklist reaches the contract and own payment after application', () => {
  const tasks = routeTasks(createRoute(base, date), 'subsidy').map(item => item.id);
  assert(tasks.indexOf('rent-contract') > tasks.indexOf('rent-apply'));
  assert(tasks.indexOf('rent-payment') > tasks.indexOf('rent-contract'));
});
