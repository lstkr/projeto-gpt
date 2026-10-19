const test = require('node:test');
const assert = require('node:assert/strict');
const utils = import('../lib/stock-count.mjs');

const cfg = (props = {}) => ({
  enabled: true, mode: 'interval', intervalDays: 7,
  weekday: 1, monthDay: 1, configuredAt: '2026-10-19', ...props
});

test('disabled counting never generates a mandatory date', async () => {
  const { countDueDate } = await utils;
  assert.equal(countDueDate(cfg({ enabled: false }), []), null);
});

test('interval mode handles weeks and year rollover', async () => {
  const { countDueDate } = await utils;
  assert.equal(countDueDate(cfg({ intervalDays: 7 }), []), '2026-10-26');
  assert.equal(countDueDate(cfg({ configuredAt: '2026-12-30', intervalDays: 4 }), []), '2027-01-03');
});

test('most recent completed count restarts the next deadline', async () => {
  const { countDueDate } = await utils;
  const history = [
    { completedAt: '2026-10-18T11:00:00Z' },
    { completedAt: '2026-10-20T23:30:00-03:00' },
    { completedAt: 'invalid date' }
  ];
  assert.equal(countDueDate(cfg({ intervalDays: 7 }), history), '2026-10-27');
});

test('weekly mode: next weekday occurrence, not today', async () => {
  const { countDueDate } = await utils;
  assert.equal(countDueDate(cfg({ mode: 'weekly', weekday: 1 }), []), '2026-10-26');
  assert.equal(countDueDate(cfg({ mode: 'weekly', weekday: 3 }), []), '2026-10-21');
  assert.equal(countDueDate(cfg({ mode: 'weekly', weekday: 7 }), []), '2026-10-25');
});

test('monthly mode handles short months, leap year and same-month deadline', async () => {
  const { countDueDate } = await utils;
  assert.equal(countDueDate(cfg({ mode: 'monthly', monthDay: 31, configuredAt: '2027-01-31' }), []), '2027-02-28');
  assert.equal(countDueDate(cfg({ mode: 'monthly', monthDay: 31, configuredAt: '2028-01-31' }), []), '2028-02-29');
  assert.equal(countDueDate(cfg({ mode: 'monthly', monthDay: 31, configuredAt: '2026-04-30' }), []), '2026-05-31');
  assert.equal(countDueDate(cfg({ mode: 'monthly', monthDay: 15, configuredAt: '2026-10-10' }), []), '2026-10-15');
});

test('corrupt day settings cannot crash schedule calculation', async () => {
  const { countDueDate } = await utils;
  assert.equal(countDueDate(cfg({ mode: 'monthly', monthDay: NaN }), []), '2026-11-01');
  assert.equal(countDueDate(cfg({ mode: 'weekly', weekday: NaN }), []), '2026-10-26');
});

test('Brazilian local date and labels', async () => {
  const { countDay, countDateLabel } = await utils;
  assert.equal(countDay('2026-10-20T01:00:00Z'), '2026-10-19');
  assert.equal(countDateLabel('2026-10-26'), '26/10/2026');
  assert.equal(countDateLabel(null), 'Não definida');
});
