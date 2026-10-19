/* Shared, local-only owner/customer demo state. No authentication or server storage. */
window.P31Admin = (() => {
  const KEY = "p31-owner-demo-v1";
  const blocks = ["9:00 AM – 12:00 PM", "12:00 PM – 3:00 PM"];
  const dateKey = (d) =>
    [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
  const later = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return dateKey(d);
  };
  const journeyKey = (b) => JSON.stringify([b.email, b.date, b.scope, b.care]);
  function seed() {
    const make = (id, name, email, space, service, offset, extra = {}) => {
      const q = P31.quote({
        space,
        service,
        focus: extra.roomFocus || [],
        extras: extra.addons || {},
      });
      return {
        id,
        name,
        email,
        phone: "202-555-01" + id.slice(-2),
        address: "123 Example Lane, Atlanta, GA 30303",
        scopeId: space,
        scope: P31.spaces[space].label,
        serviceKey: service,
        care: service,
        apartmentMode: "Move-In",
        includedCare: P31.includedCare(service, {
          focus: extra.roomFocus || [],
        }),
        roomFocus: extra.roomFocus || [],
        extras: q.lines,
        startingBase: q.base,
        price: q.total,
        deposit: q.deposit,
        depositPaid: 0,
        date: later(offset),
        arrival: blocks[0],
        rhythm: "One-time cleaning",
        status: "Requested",
        accountCreated: true,
        source: "Sample booking",
        adjustments: [],
        reviewed: false,
        quoteStatus: "Not reviewed",
        invoiceIssued: false,
        finalPaid: 0,
        events: [],
        ...extra,
      };
    };
    return {
      version: 1,
      bookings: [
        make(
          "P31-1001",
          "Avery Williams",
          "avery@example.com",
          3,
          "Deep Cleaning",
          1,
          {
            roomFocus: ["Kitchen"],
            status: "Awaiting walkthrough",
            depositPaid: 105,
          },
        ),
        make(
          "P31-1002",
          "Morgan Ellis",
          "morgan@example.com",
          1,
          "Airbnb Turnover",
          2,
          {
            addons: { laundry: 2 },
            status: "Confirmed",
            depositPaid: 25,
            accountCreated: false,
          },
        ),
        make(
          "P31-1003",
          "Taylor Reed",
          "taylor@example.com",
          4,
          "Standard Cleaning",
          -1,
          {
            status: "Completed",
            depositPaid: 70,
            reviewed: true,
            quoteStatus: "Accepted",
            finalTotal: 140,
            invoiceIssued: true,
          },
        ),
      ],
      availability: {
        days: [1, 2, 3, 4, 5, 6],
        blocks: [...blocks],
        capacity: 1,
        blocked: [],
      },
      activity: [],
    };
  }
  function read() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d?.version === 1 && Array.isArray(d.bookings)) return d;
    } catch {}
    return seed();
  }
  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
    window.dispatchEvent(new Event("p31-owner-change"));
  }
  function event(data, booking, text) {
    const e = { at: new Date().toISOString(), text };
    booking.events ||= [];
    booking.events.unshift(e);
    data.activity.unshift({ ...e, name: booking.name });
    data.activity = data.activity.slice(0, 80);
  }
  function update(id, fn, text) {
    const d = read(),
      b = d.bookings.find((b) => b.id === id);
    if (!b) throw new Error("Booking not found.");
    fn(b, d);
    if (text) event(d, b, text);
    save(d);
    return b;
  }
  function total(b) {
    return (
      Math.round(
        (b.price + (b.adjustments || []).reduce((s, a) => s + a.amount, 0)) *
          100,
      ) / 100
    );
  }
  function balance(b) {
    return Math.max(
      0,
      Math.round(
        ((b.finalTotal ?? total(b)) -
          (b.depositPaid || 0) -
          (b.finalPaid || 0)) *
          100,
      ) / 100,
    );
  }
  function importJourney() {
    let b;
    try {
      b = JSON.parse(sessionStorage.getItem("p31-demo-journey"));
    } catch {}
    if (!b?.demo) return null;
    const d = read(),
      key = journeyKey(b),
      found = d.bookings.find((r) => r.journeyKey === key);
    if (found) return found;
    const record = {
      ...b,
      accountCreated: b.accountMode
        ? b.accountMode !== "guest"
        : !!b.accountCreated,
      id: "P31-" + Date.now().toString().slice(-7),
      journeyKey: key,
      source: "Customer demo",
      status: "Awaiting walkthrough",
      depositPaid: b.deposit || 0,
      adjustments: [],
      reviewed: false,
      quoteStatus: "Not reviewed",
      invoiceIssued: false,
      finalPaid: 0,
      events: [],
    };
    d.bookings.unshift(record);
    event(d, record, "Customer demo booking imported; deposit is simulated.");
    save(d);
    return record;
  }
  function available(d, date, block, ignoreId) {
    const day = new Date(date + "T12:00:00").getDay();
    if (
      !d.availability.days.includes(day) ||
      !d.availability.blocks.includes(block) ||
      d.availability.blocked.some(
        (x) => x.date === date && (!x.block || x.block === block),
      )
    )
      return false;
    return (
      d.bookings.filter(
        (b) =>
          b.id !== ignoreId &&
          b.date === date &&
          b.arrival === block &&
          !["Cancelled", "Completed"].includes(b.status),
      ).length < d.availability.capacity
    );
  }
  return {
    KEY,
    blocks,
    dateKey,
    later,
    journeyKey,
    seed,
    read,
    save,
    event,
    update,
    total,
    balance,
    importJourney,
    available,
  };
})();
