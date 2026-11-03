const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const silentConsole = { log() {}, warn() {}, error() {} };

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(read('schema.sql'));
  const db = {
    sqlite, readBarrier: null,
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() {
          const row = sqlite.prepare(sql).get(...args) || null;
          if (db.readBarrier && sql.startsWith('SELECT paid, history_json')) await db.readBarrier();
          return row;
        },
        async all() { return { success: true, results: sqlite.prepare(sql).all(...args) }; },
        async run() {
          const result = sqlite.prepare(sql).run(...args);
          return { success: true, meta: { changes: Number(result.changes) } };
        }
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    payment() {
      const row = sqlite.prepare('SELECT paid, history_json FROM payments WHERE year_month = ? AND member_id = ?').get('2026-11', 'm1');
      return row ? { paid: row.paid, history: JSON.parse(row.history_json) } : { paid: 0, history: [] };
    },
    seedPayment(history, paid = history.reduce((s, h) => s + h.amount, 0)) {
      sqlite.prepare('INSERT OR REPLACE INTO payments(year_month, member_id, paid, history_json) VALUES (?, ?, ?, ?)').run('2026-11', 'm1', paid, JSON.stringify(history));
    }
  };
  return db;
}
function overlapReads(db) {
  let count = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  db.readBarrier = async () => { if (++count === 2) release(); if (count <= 2) await gate; };
}
async function backend(t) {
  const db = database();
  t.after(() => db.sqlite.close());
  const ctx = vm.createContext({ crypto: webcrypto, TextEncoder, Request, Response, Headers, URL, console: silentConsole });
  vm.runInContext(read('worker.js').replace('export default {', 'globalThis.worker = {'), ctx);
  const env = { DB: db, ADMIN_PASSWORD: 'test-only-password-123', AUTH_SECRET: 'test-only-auth-secret-at-least-32-characters' };
  const token = await ctx.createAuthToken('admin', env);
  const call = (url, options = {}, override = env) => ctx.worker.fetch(new Request('http://localhost:8787' + url, {
    ...options, headers: { Origin: 'http://localhost:8787', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers }
  }), override);
  const pay = (id, amount = 30000) => call('/api/payments', { method: 'POST', body: JSON.stringify({ id, yearMonth: '2026-11', memberId: 'm1', amount, method: 'cash', date: '2026-11-03' }) });
  return { ctx, db, env, token, call, pay };
}
function client(fetcher = async () => new Response('{"error":"test failure"}', { status: 500 })) {
  const elements = new Map(), cache = new Map();
  function element() {
    const classes = new Set();
    return {
      value: '', checked: false, disabled: false, style: {}, textContent: '', innerHTML: '', children: [],
      classList: { add(...names) { names.forEach(n => classes.add(n)); }, remove(...names) { names.forEach(n => classes.delete(n)); }, contains(n) { return classes.has(n); }, toggle(n, on) { const yes = on ?? !classes.has(n); yes ? classes.add(n) : classes.delete(n); return yes; } },
      append(...nodes) { this.children.push(...nodes); }, appendChild(node) { this.children.push(node); },
      querySelectorAll() { return []; }, addEventListener() {}, focus() {}, remove() {}
    };
  }
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    querySelectorAll() { return []; }, querySelector() { return null; }, createElement: element, addEventListener() {}, body: element()
  };
  const ctx = vm.createContext({
    document, crypto: webcrypto, AbortController, console: silentConsole,
    // Timers are inert for tests; fetch failures are injected explicitly.
    setTimeout() { return 1; }, clearTimeout() {}, location: { protocol: 'https:' }, addEventListener() {}, confirm() { return true; },
    localStorage: { getItem(key) { return cache.get(key) || null; }, setItem(key, value) { cache.set(key, String(value)); }, removeItem(key) { cache.delete(key); } },
    fetch: fetcher
  });
  ctx.window = ctx;
  for (const name of ['config', 'storage', 'tracker', 'checkin', 'payment', 'members', 'app']) vm.runInContext(read(`js/${name}.js`), ctx);
  ctx.Tracker.currentYear = 2026; ctx.Tracker.currentMonth = 11;
  ctx.seed = (extra = {}) => ctx.Storage.saveData({ settings: { mealPrice: 30000 }, members: [{ id: 'm1', name: 'Test member', active: true }], records: {}, payments: {}, ...extra });
  ctx.seed();
  ctx.elements = elements;
  return ctx;
}

test('all application JavaScript parses', () => {
  for (const name of fs.readdirSync(path.join(root, 'js')).filter(n => n.endsWith('.js'))) new vm.Script(read(`js/${name}`), { filename: name });
  new vm.Script(read('worker.js').replace('export default {', 'globalThis.worker = {'));
});

test('missing or weak secrets fail closed; old default credentials do not work', async t => {
  const b = await backend(t);
  for (const overrides of [{ ADMIN_PASSWORD: undefined }, { AUTH_SECRET: undefined }, { ADMIN_PASSWORD: 'admin' }, { AUTH_SECRET: 'short' }]) {
    const res = await b.call('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'admin' }) }, { ...b.env, ...overrides });
    assert.equal(res.status, 503);
  }
  const res = await b.call('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'admin' }) });
  assert.equal(res.status, 401);
});

test('configured login works and tampered or wrong-user tokens fail', async t => {
  const b = await backend(t);
  const res = await b.call('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: b.env.ADMIN_PASSWORD }) });
  assert.equal(res.status, 200);
  assert.ok((await res.json()).token);
  for (const token of [b.token.slice(0, -1) + (b.token.endsWith('0') ? '1' : '0'), await b.ctx.createAuthToken('another-user', b.env), `admin.1.${'a'.repeat(64)}`]) {
    assert.equal((await b.call('/api/members', { headers: { Authorization: `Bearer ${token}` } })).status, 401);
  }
  assert.equal((await b.call('/api/members')).status, 200);
});

test('client has no offline admin/admin fallback and rejects malformed tokens', async () => {
  const c = client(async () => { throw new TypeError('offline'); });
  assert.equal((await c.Storage.login('admin', 'admin')).success, false);
  c.location.protocol = 'file:';
  assert.equal((await c.Storage.login('admin', 'admin')).success, false);
  for (const token of ['anything', `admin.${Date.now() + 100000}.local`, 'admin.Infinity.' + 'a'.repeat(64)]) {
    c.Storage.setToken(token); assert.equal(c.Storage.isAuthenticated(), false);
  }
});

test('toast renders untrusted member names as text', () => {
  const c = client();
  const payload = '<img src=x onerror="window.injected=true">';
  c.App.showToast(payload, 'success');
  const toast = c.document.getElementById('toastContainer').children[0];
  assert.equal(toast.innerHTML, '');
  assert.equal(toast.children[1].textContent, payload);
});

test('every failed mutation rejects without changing confirmed cache, even when disconnected', async () => {
  const c = client();
  const operations = [
    () => c.Storage.addMember({ name: 'New' }), () => c.Storage.updateMember('m1', { name: 'Changed' }), () => c.Storage.deleteMember('m1'),
    () => c.Storage.setRecord('2026-11-03', 'm1', { count: 1 }), () => c.Storage.batchSetRecords([{ date: '2026-11-03', memberId: 'm1', count: 1 }]),
    () => c.Storage.recordPayment('2026-11', 'm1', 30000), () => c.Storage.deletePayment('2026-11', 'm1'),
    () => c.Storage.deletePaymentHistoryItem('2026-11', 'm1', 'pay_one'), () => c.Storage.updateSettings({ mealPrice: 50000 })
  ];
  const before = JSON.stringify(c.Storage.loadData());
  for (const operation of operations) { await assert.rejects(operation, /test failure/); assert.equal(JSON.stringify(c.Storage.loadData()), before); }
  c.fetch = async () => { throw new TypeError('offline'); };
  await assert.rejects(() => c.Storage.setRecord('2026-11-03', 'm1', { count: 1 }), /máy chủ/);
  assert.equal(JSON.stringify(c.Storage.loadData()), before);
});

test('payment UI waits for confirmation, prevents duplicate click and shows failure only', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const c = client(async () => { calls++; await gate; return new Response('{"error":"payment rejected"}', { status: 500 }); });
  const messages = [];
  c.App.showToast = (message, type) => messages.push({ message, type });
  c.Payment.openPaymentModal('m1');
  c.document.getElementById('inputPayAmount').value = '30000';
  const save = c.Payment.savePayment();
  await new Promise(setImmediate);
  assert.equal(c.document.getElementById('btnConfirmPayment').disabled, true);
  assert.equal(messages.length, 0);
  await c.Payment.savePayment();
  assert.equal(calls, 1);
  release(); await save;
  assert.equal(messages.length, 1); assert.equal(messages[0].type, 'error');
  assert.equal(c.Storage.getMemberPayment('2026-11', 'm1').paid, 0);
  assert.equal(c.document.getElementById('btnConfirmPayment').disabled, false);
});

test('new payment has one ID on client/server and deletes immediately', async t => {
  const b = await backend(t), c = client(b.call);
  const payment = await c.Storage.recordPayment('2026-11', 'm1', 30000, 'cash', '', '2026-11-03');
  assert.equal(payment.history[0].id, b.db.payment().history[0].id);
  await c.Storage.deletePaymentHistoryItem('2026-11', 'm1', payment.history[0].id);
  assert.equal(b.db.payment().paid, 0);
  assert.equal(c.Storage.getMemberPayment('2026-11', 'm1').paid, 0);
});

test('lost payment response can be retried without double charging', async t => {
  const b = await backend(t); let lose = true;
  const c = client(async (...args) => { const response = await b.call(...args); if (lose) { lose = false; throw new TypeError('lost response'); } return response; });
  await assert.rejects(() => c.Storage.recordPayment('2026-11', 'm1', 30000, 'cash', '', '2026-11-03'));
  assert.equal(b.db.payment().paid, 30000);
  assert.equal(c.Storage.getMemberPayment('2026-11', 'm1').paid, 0);
  c.Payment.openPaymentModal('m1');
  assert.equal(c.document.getElementById('inputPayAmount').value, 30000);
  assert.equal(c.document.getElementById('selectPayMethod').value, 'cash');
  assert.equal(c.document.getElementById('inputPayDate').value, '2026-11-03');
  await c.Storage.recordPayment('2026-11', 'm1', 30000, 'cash', '', '2026-11-03');
  assert.equal(b.db.payment().paid, 30000); assert.equal(b.db.payment().history.length, 1);
  assert.equal(c.Storage.getMemberPayment('2026-11', 'm1').paid, 30000);
});

for (const existing of [false, true]) test(`overlapping payments preserve both amounts (${existing ? 'existing' : 'new'} row)`, async t => {
  const b = await backend(t);
  if (existing) b.db.seedPayment([{ id: 'pay_initial', amount: 10000 }]);
  overlapReads(b.db);
  const responses = await Promise.all([b.pay('pay_a', 20000), b.pay('pay_b', 30000)]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  assert.equal(b.db.payment().paid, existing ? 60000 : 50000);
  assert.equal(b.db.payment().history.length, existing ? 3 : 2);
});

test('overlapping payment deletion and insertion preserve the new receipt', async t => {
  const b = await backend(t);
  b.db.seedPayment([{ id: 'pay_remove', amount: 10000 }, { id: 'pay_keep', amount: 20000 }]);
  overlapReads(b.db);
  const responses = await Promise.all([b.call('/api/payments/2026-11/m1/pay_remove', { method: 'DELETE' }), b.pay('pay_new', 30000)]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  assert.equal(b.db.payment().paid, 50000);
  assert.deepEqual(b.db.payment().history.map(h => h.id).sort(), ['pay_keep', 'pay_new']);
});

test('retrying a receipt is idempotent; reusing ID with different amount is rejected', async t => {
  const b = await backend(t);
  assert.equal((await b.pay('pay_repeat')).status, 200);
  assert.equal((await b.pay('pay_repeat')).status, 200);
  assert.equal((await b.pay('pay_repeat', 40000)).status, 409);
  assert.equal(b.db.payment().paid, 30000);
});

test('payments keep complete history past 100 entries and preserve legacy paid totals', async t => {
  const b = await backend(t);
  b.db.seedPayment(Array.from({ length: 100 }, (_, i) => ({ id: 'pay_' + i, amount: 1000 })));
  await b.pay('pay_101', 1000);
  assert.equal(b.db.payment().paid, 101000); assert.equal(b.db.payment().history.length, 101);
  b.db.seedPayment([], 70000);
  await b.pay('pay_new', 30000);
  assert.equal(b.db.payment().paid, 100000);
  assert.equal((await b.call('/api/payments/2026-11/m1/pay_legacy_m1', { method: 'DELETE' })).status, 200);
  assert.equal(b.db.payment().paid, 30000);
});

test('hide-weekend filter does not alter monthly meals, amount or debt', () => {
  const c = client();
  c.seed({ records: { '2026-11-06': { m1: { count: 1 } }, '2026-11-07': { m1: { count: 1, price: 50000 } } } });
  const totals = () => ['metricTotalMeals', 'metricTotalAmount', 'metricTotalDebt'].map(id => c.document.getElementById(id).textContent);
  c.Tracker.render(); const before = totals();
  c.document.getElementById('checkHideWeekend').checked = true; c.Tracker.render();
  assert.deepEqual(totals(), before);
  assert.equal(c.Payment.getMemberMonthBilling('m1', '2026-11').totalAmount, 80000);
  assert.equal(before[1], (80000).toLocaleString('vi-VN'));
});

test('month refresh removes deleted dates while keeping other months', async t => {
  const b = await backend(t), c = client(b.call);
  c.seed({ records: { '2026-11-03': { m1: { count: 1 } }, '2026-10-03': { m1: { count: 1 } } } });
  assert.equal(await c.Storage.checkCloudConnection('2026-11'), true);
  assert.equal(Object.keys(c.Storage.getDayRecords('2026-11-03')).length, 0);
  assert.equal(c.Storage.getDayRecords('2026-10-03').m1.count, 1);
});

test('successful member, record, batch and settings writes agree with SQLite', async t => {
  const b = await backend(t), c = client(b.call);
  const member = await c.Storage.addMember({ name: 'New member', active: false });
  await c.Storage.updateMember(member.id, { phone: '0123456789' });
  assert.equal(c.Storage.getMemberById(member.id).active, false);
  await c.Storage.setRecord('2026-11-03', member.id, { count: 2, price: 50000 });
  await c.Storage.batchSetRecords([{ date: '2026-11-04', memberId: member.id, count: 1 }, { date: '2026-11-03', memberId: member.id, clear: true }]);
  await c.Storage.updateSettings({ mealPrice: 45000 });
  await c.Storage.checkCloudConnection('2026-11');
  assert.equal(c.Storage.getSettings().mealPrice, 45000);
  assert.equal(c.Storage.getDayRecords('2026-11-04')[member.id].count, 1);
  assert.equal(c.Storage.getDayRecords('2026-11-03')[member.id], undefined);
  await c.Storage.deleteMember(member.id);
  assert.equal(c.Storage.getMemberById(member.id), null);
});

test('check-all preserves custom prices and paused D1 members stay paused in edit dialog', async t => {
  const b = await backend(t), c = client(b.call);
  c.seed({ records: { '2026-11-03': { m1: { count: 1, price: 50000 } } } });
  c.Checkin.selectedDate = '2026-11-03';
  await c.Checkin.setAllStatus(true);
  assert.equal(c.Storage.getDayRecords('2026-11-03').m1.price, 50000);
  c.seed({ members: [{ id: 'm1', name: 'Paused', active: 0 }] });
  c.Members.openEditModal('m1');
  assert.equal(c.document.getElementById('inputMemberActive').checked, false);
});
