import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExportModel } from '../public/export-model.js';

const answers = {
  purpose: 'self', categories: ['disability'], goal: 'rent', age: 'adult',
  citizenship: 'kz', region: 'almaty_region', housing: 'none5', queue: 'yes',
  disabilityGroup: 'one_two', digital: 'help', income: { total: 120000, size: 4 },
};
const steps = model => model.groups.flatMap(group => group.steps);

test('rental export preserves completed main steps without inventing completed substeps', () => {
  const model = buildExportModel({ answers, focus: 'subsidy', progress: { 'digital-access': true } });
  assert.equal(steps(model).find(step => step.id === 'digital-access').done, true);
  assert.equal(model.done, 1);
  assert.ok(steps(model).some(step => step.id === 'rent-contract'));
  assert.ok(steps(model).every(step => step.actions.length > 0));
  assert.match(model.labels.instructions, /Подпункты отмечайте отдельно/);
});

test('a utility assistance export does not include the rental application and queue steps', () => {
  const model = buildExportModel({ answers, focus: 'utilities' });
  assert.ok(steps(model).some(step => step.id === 'utilities-check'));
  assert.ok(!steps(model).some(step => step.id.startsWith('rent-') || step.id.startsWith('queue-')));
});

test('all variants are explicitly described as separate alternatives', () => {
  const model = buildExportModel({ answers, focus: 'all' });
  assert.match(model.allHint, /самостоятельных вариантов/);
  const ids = steps(model).map(step => step.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('Kazakh export has translated steps and preserves Kazakh letters', () => {
  const model = buildExportModel({ answers, language: 'kk', focus: 'subsidy' });
  assert.match(model.labels.title, /тұрғын үй/);
  assert.ok(steps(model).every(step => step.title && step.result && !step.title.includes('undefined')));
  assert.match(JSON.stringify(model), /[әіңғүұқөһ]/i);
});

test('unrecognised extra personal data never enters the exported model', () => {
  const model = buildExportModel({ answers: { ...answers, iin: '123456789000', email: 'not-for-export@example.test' }, focus: 'subsidy' });
  assert.ok(!JSON.stringify(model).includes('123456789000'));
  assert.ok(!JSON.stringify(model).includes('not-for-export@example.test'));
  assert.ok(model.sources.every(source => /^https:\/\//.test(source.url)));
});

test('export date follows the project timezone around midnight', () => {
  const model = buildExportModel({ answers, now: new Date('2026-11-17T20:00:00Z') });
  assert.equal(model.date, '18.11.2026');
  assert.equal(model.reviewDate, '11.11.2026');
});
