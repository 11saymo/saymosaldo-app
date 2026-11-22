const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const start = html.indexOf("function persistEntries(entries){");
const end = html.indexOf("const CATS=", start);
assert(start >= 0 && end > start, "storage helper block must exist");
// This harness tests storage helpers only. Startup normalization is a separate
// concern and its call sits in the extracted range, so omit that side effect.
const storageCode = html.slice(start, end).replace("if(normalizeRubleData(S))save();", "");

function createHarness(initial, failKey = null) {
  const data = new Map(Object.entries(initial));
  const messages = [];
  let shouldFail = Boolean(failKey);
  const localStorage = {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) {
      if (shouldFail && key === failKey) {
        shouldFail = false;
        throw new Error("simulated quota error");
      }
      data.set(key, String(value));
    },
    removeItem(key) { data.delete(key); }
  };
  const S = { tx: [{ id: "new" }], goals: [{ id: "new" }], budgets: [], recurring: [], debts: [] };
  const context = {
    KEY: "saymosaldo_",
    KEYS: ["tx", "goals", "budgets", "recurring", "debts"],
    S,
    scopedKey: key => "saymosaldo_" + key,
    localStorage,
    toast: message => messages.push(message),
    Object,
    JSON
  };
  vm.createContext(context);
  vm.runInContext(storageCode + "\nthis.runSave = save;", context);
  return { data, S, messages, save: () => context.runSave() };
}

const original = {
  saymosaldo_tx: JSON.stringify([{ id: "old-tx" }]),
  saymosaldo_goals: JSON.stringify([{ id: "old-goal" }]),
  saymosaldo_budgets: "[]",
  saymosaldo_recurring: "[]",
  saymosaldo_debts: "[]"
};

{
  const h = createHarness(original);
  assert.equal(h.save(), true, "a normal save should succeed");
  assert.deepEqual(JSON.parse(h.data.get("saymosaldo_tx")), [{ id: "new" }]);
  assert.deepEqual(JSON.parse(h.data.get("saymosaldo_goals")), [{ id: "new" }]);
}

{
  const h = createHarness(original, "saymosaldo_goals");
  assert.equal(h.save(), false, "a quota failure should be reported");
  assert.deepEqual(Object.fromEntries(h.data), original, "all previously saved keys must be restored");
  assert.deepEqual(h.S.tx, [{ id: "old-tx" }], "in-memory state must roll back too");
  assert.deepEqual(h.S.goals, [{ id: "old-goal" }], "in-memory goals must roll back too");
  assert.ok(h.messages.some(message => message.includes("Не удалось сохранить данные")));
}

console.log("Storage safety tests passed.");
