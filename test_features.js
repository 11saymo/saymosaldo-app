const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

async function testCurrencyClient() {
  const source = fs.readFileSync("currency.js", "utf8");
  const store = new Map();
  const events = [];
  const now = Math.floor(Date.now() / 1000);
  const context = {
    window: { dispatchEvent: event => events.push(event.type) },
    localStorage: {
      getItem: key => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value))
    },
    fetch: async url => {
      assert.equal(url, "https://open.er-api.com/v6/latest/RUB");
      return {
        ok: true,
        json: async () => ({
          result: "success",
          base_code: "RUB",
          rates: { RUB: 1, USD: 0.0125, EUR: 0.0115, CNY: 0.14, GBP: 0.01, KZT: 5.1 },
          time_last_update_unix: now,
          time_next_update_unix: now + 86400
        })
      };
    },
    AbortController,
    CustomEvent: class CustomEvent { constructor(type) { this.type = type; } },
    Intl,
    Number,
    Object,
    Math,
    Date,
    JSON,
    setTimeout,
    clearTimeout
  };
  vm.runInNewContext(source, context);
  await new Promise(resolve => setTimeout(resolve, 10));
  const api = context.window.SaymoSaldoCurrency;
  assert.ok(api, "currency client should be exposed");
  assert.equal(api.rubPerUnit("RUB"), 1);
  assert.equal(api.rubPerUnit("USD"), 80);
  assert.ok(Math.abs(api.rubPerUnit("EUR") - 1 / 0.0115) < 1e-9);
  assert.equal(Array.from(api.options(), x => x.code).sort().join(","), "CNY,EUR,RUB,USD");
  assert.ok(!api.options().some(x => x.code === "GBP" || x.code === "KZT"));
  assert.ok(Math.abs(api.rubPerUnit("CNY") - 1 / 0.14) < 1e-9);
  assert.ok(store.has("saymosaldo_fx_rub_v1"), "rates should be cached locally");
  assert.ok(events.includes("saymo-rates-updated"));
}

function testBackupAcceptsConvertedAmounts() {
  const html = fs.readFileSync("app.js", "utf8");
  const txValidation = html.slice(html.indexOf("if(d.tx.some"), html.indexOf("if(d.goals.some"));
  assert.match(txValidation, /Number\.isFinite\(Number\(x\.amount\)\)/, "backup validation should accept decimal RUB conversions");
  assert.doesNotMatch(txValidation, /!positive\(x\.amount\)/, "backup validation must not require integer transaction amounts");
  assert.match(html, /amount:originalAmount,originalAmount,baseAmount/, "new operations must preserve their native amount");
  assert.match(html, /const txBaseAmount=x=>/, "analytics must use a separate RUB-equivalent amount");
  assert.match(html, /currencyBalances/, "balances must be tracked separately by currency");
  assert.match(html, /exchangeRate\x27in x&&x.exchangeRate!==null/, "backup import must allow missing rates");
}

function testGoalProjection() {
  const html = fs.readFileSync("app.js", "utf8");
  const match = html.match(/function goalProjection\(g\)\{[^\n]+\}/);
  assert.ok(match, "goal projection function should exist");
  const context = {};
  vm.createContext(context);
  vm.runInContext(match[0] + ";this.project=goalProjection;", context);
  const now = new Date();
  const due = new Date(now.getFullYear(), now.getMonth() + 12, 15);
  const date = due.getFullYear() + "-" + String(due.getMonth() + 1).padStart(2, "0") + "-15";
  const simple = context.project({ target: 120000, saved: 0, date, kind: "standard", rate: 0 });
  assert.equal(simple.months, 12);
  assert.equal(simple.monthly, 10000);
  const deposit = context.project({ target: 120000, saved: 0, date, kind: "deposit", rate: 12 });
  assert.ok(deposit.monthly < 10000, "interest should reduce the required monthly contribution");
  assert.ok(deposit.interest > 0, "deposit goal should project interest income");
  const noDate = context.project({ target: 10000, saved: 1000, date: "", kind: "deposit", rate: 12 });
  assert.equal(noDate.months, 0);
}

(async () => {
  await testCurrencyClient();
  testGoalProjection();
  testBackupAcceptsConvertedAmounts();
  console.log("Currency and savings goal tests passed.");
})().catch(error => { console.error(error); process.exit(1); });
