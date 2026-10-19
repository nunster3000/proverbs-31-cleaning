const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs");
function setup() {
  const storage = new Map(),
    session = new Map(),
    c = {
      window: { dispatchEvent() {} },
      Event: class {},
      localStorage: {
        getItem: (k) => storage.get(k) || null,
        setItem: (k, v) => storage.set(k, v),
      },
      sessionStorage: { getItem: (k) => session.get(k) || null },
    };
  vm.createContext(c);
  vm.runInContext(
    fs.readFileSync("cinematic-preview/assets/service-catalog.js", "utf8"),
    c,
  );
  c.P31 = c.window.P31;
  vm.runInContext(
    fs.readFileSync("cinematic-preview/assets/admin-store.js", "utf8"),
    c,
  );
  return { A: c.window.P31Admin, session };
}
test("owner availability respects capacity, blocked windows and working days", () => {
  const { A } = setup(),
    d = A.seed();
  d.bookings = [];
  const date = "2030-01-07",
    block = A.blocks[0];
  assert.equal(A.available(d, date, block), true);
  d.bookings.push({ id: "a", date, arrival: block, status: "Requested" });
  assert.equal(A.available(d, date, block), false);
  assert.equal(A.available(d, date, block, "a"), true);
  d.bookings[0].status = "Cancelled";
  assert.equal(A.available(d, date, block), true);
  d.availability.blocked = [{ date, block }];
  assert.equal(A.available(d, date, block), false);
  assert.equal(A.available(d, date, A.blocks[1]), true);
  d.availability.blocked = [{ date, block: "" }];
  assert.equal(A.available(d, date, A.blocks[1]), false);
  assert.equal(A.available(d, "2030-01-06", block), false);
});
test("adjustments, deposits and recorded payments reconcile to a nonnegative balance", () => {
  const { A } = setup();
  const b = {
    price: 110,
    adjustments: [{ amount: 25 }, { amount: -5 }],
    depositPaid: 55,
    finalPaid: 0,
  };
  assert.equal(A.total(b), 130);
  assert.equal(A.balance(b), 75);
  b.finalTotal = 130;
  b.finalPaid = 75;
  assert.equal(A.balance(b), 0);
});
test("customer demo import is idempotent and preserves care and account selections", () => {
  const { A, session } = setup();
  session.set(
    "p31-demo-journey",
    JSON.stringify({
      demo: true,
      name: "Demo Customer",
      email: "demo@example.com",
      date: "2030-01-07",
      scope: "1 Bedroom / 1 Bathroom",
      care: "Deep Cleaning",
      accountMode: "signin",
      accountCreated: false,
      deposit: 105,
      price: 250,
      startingBase: 210,
      extras: [{ label: "Laundry", amount: 40, quantity: 2 }],
      roomFocus: ["Kitchen"],
    }),
  );
  const first = A.importJourney(),
    second = A.importJourney();
  assert.equal(first.id, second.id);
  assert.equal(first.accountCreated, true);
  assert.equal(first.depositPaid, 105);
  assert.equal(
    A.read().bookings.filter((b) => b.source === "Customer demo").length,
    1,
  );
  A.update(
    first.id,
    (b) => {
      b.quoteStatus = "Awaiting approval";
      b.finalTotal = 275;
    },
    "Quote reviewed",
  );
  assert.equal(A.read().bookings[0].finalTotal, 275);
  assert.equal(A.read().activity[0].text, "Quote reviewed");
});
