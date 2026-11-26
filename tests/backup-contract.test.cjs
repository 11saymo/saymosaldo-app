const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'auth.js'), 'utf8');

const start = app.indexOf('function validBackupDate(v)');
const end = app.indexOf('function importData(e)', start);
assert.ok(start >= 0 && end > start, 'backup validation functions must exist');
const validBackup = new Function(app.slice(start, end) + '\nreturn validBackup;')();

const sample = {
  app: 'SaymoSaldo',
  version: 6,
  exportedAt: '2026-11-25T00:00:00.000Z',
  tx: [{
    id: 'tx-1', type: 'expense', amount: 12.75, originalAmount: 12.75,
    baseAmount: 12.75, currency: 'RUB', exchangeRate: 1,
    category: 'Покупки', date: '2026-11-25', comment: 'Тест'
  }],
  goals: [{ id: 'g-1', name: 'Накопления', target: 1000.50, saved: 250.25, date: '', kind: 'standard', rate: 0 }],
  budgets: [{ category: 'Покупки', limit: 500.75 }],
  recurring: [{ id: 'r-1', name: 'Подписка', amount: 99.90, category: 'Подписки', day: 12 }],
  debts: [{ id: 'd-1', name: 'Кредит', kind: 'Кредит', original: 10000.50, remaining: 7500.25, monthly: 500.50, day: 5, history: [{ date: '2026-11-05', amount: 500.50, principal: 400.25 }] }],
  chatFinance: [{ role: 'user', text: 'Тест' }]
};

test('backup import accepts legitimate fractional ruble values', () => {
  assert.equal(validBackup(sample), true);
});

test('backup import still rejects invalid dates, negative values, and non-finite amounts', () => {
  assert.equal(validBackup({ ...sample, goals: [{ ...sample.goals[0], target: -1 }] }), false);
  assert.equal(validBackup({ ...sample, budgets: [{ category: 'Покупки', limit: Infinity }] }), false);
  assert.equal(validBackup({ ...sample, tx: [{ ...sample.tx[0], date: '2026-02-31' }] }), false);
});

test('automatic cloud backup functions use authenticated RPCs and refuse restore while local edits are pending', () => {
  assert.match(auth, /async function listBackups\(\)[\s\S]*?ensureFreshSession\(\)[\s\S]*?rpc\/list_my_data_backups/);
  assert.match(auth, /async function restoreBackup\(backupId\)[\s\S]*?ensureFreshSession\(\)[\s\S]*?rpc\/restore_my_data_backup/);
  assert.match(auth, /p_backup_id: id/);
  assert.match(auth, /if \(window\.SaymoSaldoApp\?\.hasPendingSync\(\)\)/);
  assert.match(auth, /Сначала дождитесь надписи «Синхронизировано»/);
});

test('logout warns before leaving when local edits have not reached the cloud', () => {
  assert.match(auth, /hasPending = Boolean\(window\.SaymoSaldoApp\?\.hasPendingSync\?\.\(\)\)/);
  assert.match(auth, /Не удалось отправить последние изменения в облако/);
  assert.match(auth, /if \(!leaveAnyway\)/);
});


test('one-time legacy cleanup never deletes account-scoped local data', () => {
  assert.doesNotMatch(app, /key\.startsWith\('saymosaldo_user_'\)/);
  assert.doesNotMatch(app, /key\.startsWith\('saymosaldo_chat_'\)/);
  assert.match(app, /if \(exact\.has\(key\)\) localStorage\.removeItem\(key\)/);
});
