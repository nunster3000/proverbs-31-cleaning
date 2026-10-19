const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const c = { window: {}, Intl, TextEncoder, Date };
vm.createContext(c);
vm.runInContext(
  fs.readFileSync("cinematic-preview/assets/proverbs-cal.js", "utf8"),
  c,
);
const cal = c.window.P31Cal;
test("calendar export uses DST-aware UTC, stable event IDs, escaping, and excludes cancelled visits", () => {
  const events = [
    {
      id: "winter",
      date: "2030-01-07",
      arrival: "morning",
      name: "Doe, Jane",
      address: "Line 1\nLine 2",
      status: "Confirmed",
    },
    {
      id: "summer",
      date: "2030-07-08",
      arrival: "afternoon",
      name: "Client",
      status: "Confirmed",
    },
    {
      id: "cancelled",
      date: "2030-07-08",
      arrival: "morning",
      status: "Cancelled",
    },
  ];
  const text = cal.calendar(events);
  assert.match(text, /DTSTART:20300107T140000Z/);
  assert.match(text, /DTSTART:20300708T160000Z/);
  assert.match(text, /UID:winter@proverbs31cal/);
  assert.match(text, /Doe\\, Jane/);
  assert.match(text, /Line 1\\nLine 2/);
  assert.doesNotMatch(text, /UID:cancelled/);
  assert.equal((text.match(/BEGIN:VEVENT/g) || []).length, 2);
});
test("demo custom hour blocks close only overlapping arrival windows", () => {
  const context = {
    window: { dispatchEvent() {} },
    Event: class {},
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
    sessionStorage: {
      getItem() {
        return null;
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync("cinematic-preview/assets/service-catalog.js", "utf8"),
    context,
  );
  context.P31 = context.window.P31;
  vm.runInContext(
    fs.readFileSync("cinematic-preview/assets/admin-store.js", "utf8"),
    context,
  );
  const A = context.window.P31Admin,
    d = A.seed();
  d.bookings = [];
  d.availability.blocked = [
    { date: "2030-01-07", startTime: "10:00", endTime: "12:00", block: "" },
  ];
  assert.equal(A.available(d, "2030-01-07", A.blocks[0]), false);
  assert.equal(A.available(d, "2030-01-07", A.blocks[1]), true);
});
