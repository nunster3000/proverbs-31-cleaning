(async () => {
  const L = P31Live,
    $ = (s) => document.querySelector(s);
  let me,
    records = [],
    state = {},
    customers = [],
    view = "Bookings",
    page = 0,
    activeId,
    calendarDate = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });
  const names = {
      morning: "9:00 AM – 12:00 PM",
      afternoon: "12:00 PM – 3:00 PM",
    },
    labels = {
      standard: "Standard Cleaning",
      deep: "Deep Cleaning",
      apartment: "Apartment Cleaning",
      airbnb: "Airbnb Turnover",
    };
  const arrivalName = (id) => names[id] || P31Windows.label(id);
  const money = (c) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(c / 100);
  const n = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const btn = (text, fn, cls = "outline") => {
    const b = n("button", text, cls);
    b.type = "button";
    b.onclick = fn;
    return b;
  };
  const input = (type = "text", value = "") => {
    const i = n("input");
    i.type = type;
    i.value = value;
    return i;
  };
  const label = (text, field) => {
    const l = n("label", text);
    l.append(field);
    return l;
  };
  function msg(text) {
    $("#workspace-message").textContent = text;
    if ($("#workspace-dialog").open) $("#dialog-message").textContent = text;
  }
  async function act(fn, success) {
    try {
      await fn();
      await reload();
      if (activeId && $("#workspace-dialog").open)
        detail(records.find((b) => b.id === activeId));
      msg(success || "Saved.");
      return true;
    } catch (e) {
      msg(e.message);
      return false;
    }
  }
  async function reload() {
    records = await L.api("bookings", { query: { page } });
    if (me.role === "owner") {
      state = await L.api("owner-state");
      customers = await L.api("customers", { query: { page } });
      [
        ...(state.settings?.windows || []),
        ...(state.days || []).flatMap((d) => d.windows),
      ].forEach((id) => (names[id] = P31Windows.label(id)));
    }
    render();
  }
  function choice(values, current) {
    const s = n("select");
    values.forEach(([value, text]) => {
      const o = n("option", text);
      o.value = value;
      s.append(o);
    });
    s.value = current;
    return s;
  }
  function form(parent, fields, text, submit) {
    const f = n("form");
    for (const [title, field] of fields) f.append(label(title, field));
    const b = n("button", text, "primary");
    f.append(b);
    f.onsubmit = async (e) => {
      e.preventDefault();
      b.disabled = true;
      try {
        await submit();
      } catch (e) {
        msg(e.message);
      } finally {
        b.disabled = false;
      }
    };
    parent.append(f);
    return f;
  }
  function section(title) {
    const s = n("section", undefined, "card");
    s.append(n("h2", title));
    return s;
  }
  function summary(b, parent) {
    const q = b.quote_snapshot;
    parent.append(
      n(
        "p",
        labels[b.service] +
          (b.apartment_mode ? " · " + b.apartment_mode : "") +
          " · " +
          q.space,
      ),
      n("p", b.visit_date + " · " + arrivalName(b.arrival)),
      n("p", "Status: " + b.status.replaceAll("_", " "), "badge"),
    );
    const dl = n("dl", undefined, "care-summary-prices");
    const row = (key, value) => {
      const d = n("div");
      d.append(n("dt", key), n("dd", value));
      dl.append(d);
    };
    row("Starting service price*", money(q.base_cents));
    q.addons.forEach((a) =>
      row(
        a.label + (a.id === "laundry" ? " × " + a.quantity : ""),
        a.included ? "Included" : money(a.amount_cents),
      ),
    );
    row("Starting estimate*", money(q.total_cents));
    row("Starting-price deposit", money(q.deposit_cents));
    if (b.final_cents !== null) row("Reviewed total", money(b.final_cents));
    row("Recorded payments", money(b.deposit_paid_cents + b.final_paid_cents));
    row(
      b.invoice_issued ? "Issued remaining balance" : "Estimated remainder",
      money(
        Math.max(
          0,
          (b.final_cents ?? q.total_cents) -
            b.deposit_paid_cents -
            b.final_paid_cents,
        ),
      ),
    );
    parent.append(
      dl,
      n(
        "p",
        b.invoice_issued
          ? "A final balance has been issued. Online payment processing is not connected; contact the company to arrange payment."
          : "*Starting amounts only. Final pricing follows walkthrough review and customer approval.",
        "fine",
      ),
    );
    const included = n("ul");
    const text =
      b.service === "apartment"
        ? [
            "Standard cleaning of the empty apartment",
            "Floor and surface cleaning",
            "Routine kitchen and bathroom care",
          ]
        : b.service === "airbnb"
          ? [
              "Standard cleaning of the selected guest bedroom and bathroom",
              "Floors, surfaces, bed making, and bathroom care",
            ]
          : [
              "Floors, surfaces, bed making, and routine kitchen/bathroom cleaning",
              ...(b.service === "deep"
                ? ["Baseboards and windows", "Sanitizing and disinfecting"]
                : []),
            ];
    text.forEach((t) => included.append(n("li", t)));
    parent.append(n("h3", "Included care"), included);
  }
  function render() {
    const root = $("#workspace-content");
    root.replaceChildren();
    $("#workspace-title").textContent = view;
    document.querySelectorAll("#workspace-nav button").forEach((b) => {
      b.setAttribute("aria-current", b.textContent === view ? "page" : "false");
    });
    if (view === "Bookings" || view === "Walkthroughs" || view === "Payments") {
      if (me.role === "owner")
        root.append(btn("Add manual booking", manual, "primary"));
      let list = records;
      if (view === "Walkthroughs")
        list = list.filter(
          (b) => !b.invoice_issued && b.status !== "cancelled",
        );
      if (view === "Payments")
        list = list.filter((b) => b.status !== "cancelled");
      list.forEach((b) => {
        const c = section(
          b.property?.name || b.customers?.name || b.quote_snapshot.service,
        );
        c.append(n("p", b.id, "fine"));
        summary(b, c);
        c.append(btn("Open booking", () => detail(b)));
        root.append(c);
      });
      if (!list.length) root.append(n("p", "No bookings to show."));
      const pages = n("div", undefined, "detail-actions");
      if (page > 0)
        pages.append(
          btn("Previous page", () => {
            page--;
            reload().catch((e) => msg(e.message));
          }),
        );
      if (records.length === 100)
        pages.append(
          btn("Next page", () => {
            page++;
            reload().catch((e) => msg(e.message));
          }),
        );
      root.append(pages);
    } else if (view === "Customers") {
      customers.forEach((c) => {
        const card = section(c.name);
        card.append(
          n("p", c.email + " · " + c.phone),
          n("p", c.address),
          n(
            "p",
            c.account_enabled ? "Account customer" : "Guest / manual customer",
            "fine",
          ),
          btn("Edit contact details", () => editCustomer(c)),
        );
        root.append(card);
      });
      if (!customers.length)
        root.append(
          n(
            "p",
            "Your customer database is empty. Bookings and saved profiles create customer records.",
          ),
        );
    } else if (view === "Proverbs 31 Cal") {
      const c = section("Proverbs 31 Cal");
      c.append(
        n(
          "p",
          "This backend schedule controls availability for website, portal, and manual bookings. Exports are personal calendar copies; manage changes here.",
        ),
      );
      const date = input("date", calendarDate),
        exports = n("div"),
        grid = n("div", undefined, "calendar-grid"),
        heading = n("div", undefined, "calendar-heading"),
        monthTitle = n("h3");
      let monthBookings = [];
      const moveMonth = (delta) => {
        const d = new Date(date.value + "T12:00:00");
        d.setDate(1);
        d.setMonth(d.getMonth() + delta);
        calendarDate =
          d.getFullYear() +
          "-" +
          String(d.getMonth() + 1).padStart(2, "0") +
          "-01";
        render();
      };
      heading.append(
        btn("‹ Previous month", () => moveMonth(-1)),
        monthTitle,
        btn("Next month ›", () => moveMonth(1)),
      );
      c.append(exports, heading, grid);
      const loadMonth = async () => {
        const key = date.value.slice(0, 7),
          d = new Date(key + "-01T12:00:00");
        monthTitle.textContent = d.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        });
        grid.replaceChildren();
        monthBookings = await L.api("calendar", { query: { month: key } });
        exports.replaceChildren(
          P31Cal.controls(
            monthBookings,
            state.settings?.timezone || "America/New_York",
          ),
        );
        for (const day of ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"])
          grid.append(n("strong", day));
        for (let i = 0; i < d.getDay(); i++) grid.append(n("span"));
        const total = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        for (let i = 1; i <= total; i++) {
          const day = key + "-" + String(i).padStart(2, "0"),
            count = monthBookings.filter((b) => b.visit_date === day).length;
          const off =
            (!(state.days || []).some((d) => d.visit_date === day) &&
              !(state.settings?.working_days || []).includes(
                new Date(day + "T12:00:00").getDay(),
              )) ||
            (state.days || []).some(
              (d) => d.visit_date === day && !d.windows.length,
            ) ||
            (state.blocks || []).some(
              (b) => b.visit_date === day && !b.arrival && !b.start_time,
            );
          const partial =
            !off && (state.blocks || []).some((b) => b.visit_date === day);
          const b = btn(
            String(i) +
              (count ? " · " + count + " visit" + (count > 1 ? "s" : "") : ""),
            () => {
              calendarDate = day;
              render();
            },
            (off ? "blocked " : partial ? "partial-block " : "") +
              (count ? "has-visits" : ""),
          );
          b.setAttribute(
            "aria-label",
            day +
              " · " +
              count +
              " visits" +
              (off ? " · blocked" : partial ? " · time blocked" : ""),
          );
          b.setAttribute("aria-pressed", day === date.value);
          if (partial) b.append(n("span", "Time blocked"));
          grid.append(b);
        }
        showVisits();
      };
      const slots = n("div");
      const load = async () => {
        try {
          const rows = await L.api("availability", {
            query: { start: date.value, days: 1 },
          });
          slots.replaceChildren(
            n("p", date.value),
            ...(rows[0]?.slots || []).map((slot) =>
              n(
                "p",
                arrivalName(slot.id) +
                  " · " +
                  (slot.available ? "Available" : "Unavailable / full"),
              ),
            ),
            P31Windows.picker(
              (state.days || []).find((d) => d.visit_date === date.value)
                ?.windows ?? state.settings.windows,
              (ids) =>
                act(
                  () =>
                    L.api("schedule", {
                      method: "POST",
                      data: {
                        action: "day_windows",
                        data: { date: date.value, windows: ids },
                      },
                    }),
                  "Open blocks saved.",
                ),
            ),
          );
        } catch (e) {
          msg(e.message);
        }
      };
      date.onchange = () => {
        calendarDate = date.value;
        load();
        loadMonth().catch((e) => msg(e.message));
      };
      const visits = n("div");
      const showVisits = () => {
        visits.replaceChildren(n("h3", "Visits on this date"));
        const found = monthBookings.filter(
          (b) => b.visit_date === date.value && b.status !== "cancelled",
        );
        found.forEach((b) =>
          visits.append(
            btn(
              (b.customers?.name || "Cleaning") +
                " · " +
                arrivalName(b.arrival) +
                " · " +
                b.status,
              () => detail(b),
            ),
          ),
        );
        if (!found.length) visits.append(n("p", "No visits on this date."));
      };
      date.addEventListener("change", showVisits);
      showVisits();
      c.append(label("Date", date), slots, visits);
      load();
      loadMonth().catch((e) => msg(e.message));
      const window = choice(
          [
            ["", "Entire day"],
            ["custom", "Custom hours"],
            ...Object.entries(names),
          ],
          "",
        ),
        reason = input();
      reason.required = true;
      const through = input("date", date.value),
        startTime = input("time", "09:00"),
        endTime = input("time", "12:00");
      through.required = true;
      const hours = n("div");
      hours.hidden = true;
      hours.append(label("From", startTime), label("Until", endTime));
      window.onchange = () => (hours.hidden = window.value !== "custom");
      date.addEventListener("change", () => {
        through.min = date.value;
        through.value = date.value;
      });
      c.append(
        btn("Select seven days", () => {
          const d = new Date(date.value + "T12:00:00");
          d.setDate(d.getDate() + 6);
          through.value =
            d.getFullYear() +
            "-" +
            String(d.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(d.getDate()).padStart(2, "0");
        }),
        hours,
      );
      form(
        c,
        [
          ["Through date", through],
          ["Block", window],
          ["Reason", reason],
        ],
        "Block time",
        () =>
          act(
            () =>
              L.api("schedule", {
                method: "POST",
                data: {
                  action: "block",
                  data: {
                    date: date.value,
                    arrival:
                      window.value === "custom" ? null : window.value || null,
                    through: through.value,
                    start_time:
                      window.value === "custom" ? startTime.value : null,
                    end_time: window.value === "custom" ? endTime.value : null,
                    reason: reason.value,
                  },
                },
              }),
            "Time blocked.",
          ),
      );
      (state.blocks || []).forEach((b) => {
        const p = n(
          "p",
          b.visit_date +
            " · " +
            (b.start_time
              ? b.start_time.slice(0, 5) + "–" + b.end_time.slice(0, 5)
              : b.arrival
                ? arrivalName(b.arrival)
                : "Entire day") +
            " · " +
            b.reason,
        );
        p.append(
          btn(
            "Remove",
            () =>
              act(
                () =>
                  L.api("schedule", {
                    method: "POST",
                    data: { action: "unblock", data: { id: b.id } },
                  }),
                "Block removed.",
              ),
            "text-btn",
          ),
        );
        c.append(p);
      });
      root.append(c);
    } else if (view === "Availability") {
      const c = section("Working days and arrival windows"),
        days = n("fieldset"),
        windows = n("fieldset");
      days.append(n("legend", "Working days"));
      ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((name, i) => {
        const check = input("checkbox");
        check.checked = state.settings.working_days.includes(i);
        check.value = i;
        days.append(label(name, check));
      });
      windows.append(n("legend", "Arrival windows"));
      Object.entries(names).forEach(([id, name]) => {
        const check = input("checkbox");
        check.checked = state.settings.windows.includes(id);
        check.value = id;
        windows.append(label(name, check));
      });
      const capacity = input("number", state.settings.capacity);
      capacity.min = 1;
      capacity.max = 10;
      capacity.required = true;
      c.append(days, windows);
      form(
        c,
        [["Bookings per arrival block", capacity]],
        "Save availability",
        () =>
          act(
            () =>
              L.api("schedule", {
                method: "POST",
                data: {
                  action: "settings",
                  data: {
                    days: [...days.querySelectorAll(":checked")].map((i) =>
                      Number(i.value),
                    ),
                    windows: [...windows.querySelectorAll(":checked")].map(
                      (i) => i.value,
                    ),
                    capacity: Number(capacity.value),
                  },
                },
              }),
            "Availability saved.",
          ),
      );
      root.append(c);
    } else if (view === "Activity") {
      const c = section("Audit history");
      (state.activity || []).forEach((e) =>
        c.append(
          n(
            "p",
            new Date(e.created_at).toLocaleString() +
              " · " +
              e.action +
              " · " +
              (e.booking_id || "Business settings"),
            "fine",
          ),
        ),
      );
      const queue = section("Notification queue");
      queue.append(
        n(
          "p",
          "These notifications are saved, but no email provider is connected. Pending messages have not been sent.",
        ),
      );
      (state.outbox || []).forEach((e) =>
        queue.append(
          n("p", e.kind + " · " + e.recipient + " · " + e.status, "fine"),
        ),
      );
      root.append(c, queue);
    } else if (view === "My Profile") {
      const p = me.profile || {},
        c = section("Your saved details"),
        name = input("text", p.name || ""),
        phone = input("tel", p.phone || ""),
        address = input("text", p.address || ""),
        access = n("textarea"),
        pets = n("textarea");
      name.required = true;
      access.value = p.access_notes || "";
      pets.value = p.pet_notes || "";
      c.append(n("p", me.user.email));
      form(
        c,
        [
          ["Name", name],
          ["Phone", phone],
          ["Address", address],
          ["Access instructions", access],
          ["Pet notes", pets],
        ],
        "Save profile",
        () =>
          act(async () => {
            me.profile = await L.api("profile", {
              method: "POST",
              data: {
                name: name.value,
                phone: phone.value,
                address: address.value,
                access_notes: access.value,
                pet_notes: pets.value,
              },
            });
          }, "Profile saved to your account."),
      );
      root.append(c);
    }
  }
  function action(b, name, data, request_id) {
    return L.api("action", {
      method: "POST",
      data: { id: b.id, action: name, data, request_id },
    });
  }
  function detail(b) {
    if (!b) return;
    activeId = b.id;
    const root = $("#workspace-detail");
    root.replaceChildren();
    const info = section(b.customers?.name || "Your cleaning");
    summary(b, info);
    const property = b.property || b.customers || {};
    info.append(
      n("h3", "Visit details"),
      n("p", property.address || ""),
      n("p", (property.email || "") + " · " + (property.phone || "")),
    );
    if (property.access_notes)
      info.append(n("p", "Access: " + property.access_notes));
    if (property.pet_notes) info.append(n("p", "Pets: " + property.pet_notes));
    if (b.care_notes) info.append(n("p", "Care notes: " + b.care_notes));
    info.append(
      n("p", "Quote status: " + b.quote_status.replaceAll("_", " "), "badge"),
    );
    if (b.review_notes)
      info.append(n("p", "Walkthrough review: " + b.review_notes));
    (b.quote_adjustments || []).forEach((a) =>
      info.append(n("p", a.label + " · " + money(a.cents))),
    );
    info.append(
      P31Cal.controls(
        [b],
        state.settings?.timezone || "America/New_York",
        true,
      ),
    );
    root.append(info);
    if (me.role !== "owner" && b.quote_status === "awaiting_approval")
      info.append(
        btn("Accept reviewed quote", () =>
          act(
            () => action(b, "accept_quote", { revision: b.revision }),
            "Reviewed quote accepted.",
          ),
        ),
      );
    if (me.role !== "owner" && !["completed", "cancelled"].includes(b.status)) {
      const notes = n("textarea");
      notes.required = true;
      const kind = choice(
        [
          ["reschedule", "Reschedule request"],
          ["cancel", "Cancellation request"],
        ],
        "reschedule",
      );
      form(
        info,
        [
          ["Change request", kind],
          ["Preferred date / details", notes],
        ],
        "Send request",
        () =>
          act(
            () =>
              action(b, "request_change", {
                kind: kind.value,
                notes: notes.value,
              }),
            "Your request has been saved for owner review.",
          ),
      );
    }
    const media = section("Virtual walkthrough");
    media.append(
      n(
        "p",
        "Upload room photos or videos for pricing review. Up to 6 files, 20 MB each. Files are private and accessible only to you and the owner.",
        "fine",
      ),
    );
    (b.walkthrough_files || [])
      .filter((f) => f.status !== "deleted")
      .forEach((f) => {
        const row = n("div", undefined, "list-row");
        row.append(n("p", f.room + " · " + f.filename + " · " + f.status));
        if (f.status === "ready")
          row.append(
            btn(
              "Preview",
              async () => {
                try {
                  const data = await L.api("file", { query: { id: f.id } });
                  const win = n("dialog");
                  win.className = "live-auth";
                  const item = n(f.mime.startsWith("image/") ? "img" : "video");
                  item.src = data.url;
                  item.style.maxWidth = "100%";
                  if (item.tagName === "VIDEO") item.controls = true;
                  else item.alt = f.room;
                  win.append(
                    item,
                    btn("Close", () => {
                      win.close();
                      win.remove();
                    }),
                  );
                  document.body.append(win);
                  win.showModal();
                } catch (e) {
                  msg(e.message);
                }
              },
              "text-btn",
            ),
          );
        if (!b.invoice_issued && !["cancelled", "completed"].includes(b.status))
          row.append(
            btn(
              "Remove",
              () =>
                act(
                  () =>
                    L.api("upload-delete", {
                      method: "POST",
                      data: { id: f.id },
                    }),
                  "File removed; walkthrough review is required again.",
                ),
              "text-btn",
            ),
          );
        media.append(row);
      });
    if (!b.invoice_issued && !["cancelled", "completed"].includes(b.status)) {
      const file = input("file");
      file.accept =
        "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime";
      file.required = true;
      const room = input();
      room.required = true;
      room.maxLength = 100;
      const notes = n("textarea");
      form(
        media,
        [
          ["Room", room],
          ["Photo or video", file],
          ["Room notes", notes],
        ],
        "Upload securely",
        () =>
          act(async () => {
            if (!file.files[0]) throw new Error("Choose a file.");
            await L.upload(b.id, file.files[0], room.value, notes.value);
          }, "Walkthrough file uploaded and verified."),
      );
    }
    root.append(media);
    if (me.role === "owner") ownerDetail(b, root);
    if (!$("#workspace-dialog").open) $("#workspace-dialog").showModal();
  }
  function ownerDetail(b, root) {
    const manage = section("Manage visit"),
      status = choice(
        [
          "requested",
          "awaiting_walkthrough",
          "confirmed",
          "completed",
          "cancelled",
        ].map((s) => [s, s.replaceAll("_", " ")]),
        b.status,
      ),
      reason = input();
    form(
      manage,
      [
        ["Status", status],
        ["Reason (required for cancellation)", reason],
      ],
      "Save status",
      () =>
        act(
          () =>
            action(b, "status", { status: status.value, reason: reason.value }),
          "Booking status saved.",
        ),
    );
    const date = input("date", b.visit_date),
      window = choice(Object.entries(names), b.arrival),
      why = input();
    date.required = true;
    why.required = true;
    form(
      manage,
      [
        ["Visit date", date],
        ["Arrival window", window],
        ["Change reason", why],
      ],
      "Reschedule visit",
      () =>
        act(
          () =>
            action(b, "reschedule", {
              date: date.value,
              arrival: window.value,
              reason: why.value,
            }),
          "Visit rescheduled.",
        ),
    );
    (b.booking_requests || [])
      .filter((r) => !r.resolved)
      .forEach((r) => {
        manage.append(
          n("p", r.kind + ": " + r.notes),
          btn(
            "Mark request resolved",
            () =>
              act(
                () => action(b, "resolve_request", { request_id: r.id }),
                "Request resolved.",
              ),
            "text-btn",
          ),
        );
      });
    root.append(manage);
    const review = section("Review & final quote"),
      notes = n("textarea"),
      external = input("checkbox");
    notes.required = true;
    notes.value = b.review_notes || "";
    form(
      review,
      [
        ["Walkthrough review notes", notes],
        ["Walkthrough received separately", external],
      ],
      "Save walkthrough review",
      () =>
        act(
          () =>
            action(b, "review", {
              notes: notes.value,
              external: external.checked,
            }),
          "Walkthrough reviewed.",
        ),
    );
    const adjustment = input(),
      cents = input("number");
    adjustment.required = true;
    cents.required = true;
    cents.step = ".01";
    form(
      review,
      [
        ["Adjustment description", adjustment],
        ["Amount in dollars (negative for credit)", cents],
      ],
      "Add adjustment",
      () =>
        act(
          () =>
            action(b, "adjust", {
              label: adjustment.value,
              cents: Math.round(Number(cents.value) * 100),
            }),
          "Adjustment saved; earlier quote approval has been reset.",
        ),
    );
    review.append(
      btn("Prepare reviewed quote", () =>
        act(
          () => action(b, "prepare_quote", {}),
          "Quote prepared for customer approval.",
        ),
      ),
    );
    const approval = input();
    approval.required = true;
    form(
      review,
      [["Approval received outside the portal", approval]],
      "Record customer approval",
      () =>
        act(
          () => action(b, "record_approval", { notes: approval.value }),
          "Approval recorded.",
        ),
    );
    review.append(
      btn("Issue final balance", () =>
        act(
          () => action(b, "issue_invoice", {}),
          "Final balance issued. Email delivery is pending provider setup.",
        ),
      ),
    );
    root.append(review);
    const pay = section("Record payment received"),
      amount = input("number"),
      kind = choice(
        [
          ["deposit", "Deposit"],
          ["final", "Final payment"],
        ],
        "deposit",
      ),
      method = input();
    amount.required = true;
    amount.min = ".01";
    amount.step = ".01";
    method.required = true;
    let key = crypto.randomUUID();
    form(
      pay,
      [
        ["Payment type", kind],
        ["Amount received in dollars", amount],
        ["Method / reference", method],
      ],
      "Record payment",
      async () => {
        if (
          await act(
            () =>
              action(
                b,
                "record_payment",
                {
                  kind: kind.value,
                  cents: Math.round(Number(amount.value) * 100),
                  method: method.value,
                },
                key,
              ),
            "Payment recorded. No charge was processed.",
          )
        )
          key = crypto.randomUUID();
      },
    );
    pay.append(
      n(
        "p",
        "Only record money actually received. The website does not process cards or automatically mark deposits paid.",
        "fine",
      ),
    );
    root.append(pay);
    const privateNotes = section("Owner notes"),
      text = n("textarea");
    text.value = state.notes?.find((n) => n.booking_id === b.id)?.notes || "";
    form(
      privateNotes,
      [["Private owner notes", text]],
      "Save owner notes",
      () =>
        act(
          () =>
            L.api("owner-notes", {
              method: "POST",
              data: { id: b.id, notes: text.value },
            }),
          "Owner notes saved.",
        ),
    );
    root.append(privateNotes);
  }
  function editCustomer(c) {
    activeId = null;
    const root = $("#workspace-detail");
    root.replaceChildren();
    const box = section("Customer details"),
      name = input("text", c.name),
      phone = input("tel", c.phone),
      address = input("text", c.address),
      access = n("textarea"),
      pets = n("textarea");
    name.required = true;
    access.value = c.access_notes || "";
    pets.value = c.pet_notes || "";
    box.append(
      n(
        "p",
        c.email +
          " · Sign-in email changes must be verified through authentication.",
        "fine",
      ),
    );
    form(
      box,
      [
        ["Name", name],
        ["Phone", phone],
        ["Address", address],
        ["Access instructions", access],
        ["Pet notes", pets],
      ],
      "Save contact details",
      () =>
        act(async () => {
          await L.api("customer", {
            method: "POST",
            data: {
              id: c.id,
              profile: {
                name: name.value,
                phone: phone.value,
                address: address.value,
                access_notes: access.value,
                pet_notes: pets.value,
              },
            },
          });
          $("#workspace-dialog").close();
        }, "Customer details saved."),
    );
    root.append(box);
    $("#workspace-dialog").showModal();
  }
  async function manual() {
    const root = $("#workspace-detail");
    root.replaceChildren();
    activeId = null;
    const c = section("Add a manual booking"),
      name = input(),
      email = input("email"),
      phone = input("tel"),
      address = input(),
      service = choice(Object.entries(labels), "standard"),
      space = choice(
        [
          [3, "1 Bedroom / 1 Bathroom"],
          [2, "Studio"],
          [4, "2 Bedrooms"],
          [5, "3 Bedrooms"],
          [6, "4 Bedrooms"],
          [7, "Large / Entire Home"],
        ],
        "3",
      ),
      mode = choice(
        [
          ["Move-In", "Move-In"],
          ["Move-Out", "Move-Out"],
        ],
        "Move-In",
      ),
      date = input("date"),
      arrival = choice(Object.entries(names), "morning");
    date.onchange = async () => {
      try {
        const rows = await L.api("availability", {
          query: { start: date.value, days: 1 },
        });
        arrival.replaceChildren();
        (rows[0]?.slots || [])
          .filter((s) => s.available)
          .forEach((s) => {
            const o = n("option", arrivalName(s.id));
            o.value = s.id;
            arrival.append(o);
          });
        if (!arrival.options.length) {
          const o = n("option", "No open blocks");
          o.value = "";
          arrival.append(o);
        }
      } catch (e) {
        msg(e.message);
      }
    };
    arrival.required = true;
    [name, email, address, date].forEach((i) => (i.required = true));
    service.onchange = () => {
      space.replaceChildren();
      const vals =
        service.value === "airbnb"
          ? [
              [0, "King guest suite"],
              [1, "Queen guest suite"],
            ]
          : [
              [3, "1 Bedroom / 1 Bathroom"],
              [2, "Studio"],
              [4, "2 Bedrooms"],
              [5, "3 Bedrooms"],
              [6, "4 Bedrooms"],
              [7, "Large / Entire Home"],
            ];
      vals.forEach(([id, text]) => {
        const o = n("option", text);
        o.value = id;
        space.append(o);
      });
    };
    const existing = choice(
      [
        ["", "New guest customer"],
        ...customers.map((c) => [c.id, c.name + " · " + c.email]),
      ],
      "",
    );
    existing.onchange = () => {
      const saved = customers.find((c) => c.id === existing.value);
      if (saved) {
        name.value = saved.name;
        email.value = saved.email;
        phone.value = saved.phone;
        address.value = saved.address;
      }
    };
    let key = crypto.randomUUID();
    form(
      c,
      [
        ["Existing customer", existing],
        ["Name", name],
        ["Email", email],
        ["Phone", phone],
        ["Address", address],
        ["Service", service],
        ["Space", space],
        ["Apartment mode (if applicable)", mode],
        ["Date", date],
        ["Arrival", arrival],
      ],
      "Save booking",
      () =>
        act(async () => {
          await L.api("bookings", {
            method: "POST",
            data: {
              request_id: key,
              booking: {
                ...(existing.value ? { customer_id: existing.value } : {}),
                name: name.value,
                email: email.value,
                phone: phone.value,
                address: address.value,
                service: service.value,
                space_id: Number(space.value),
                apartment_mode: mode.value,
                date: date.value,
                arrival: arrival.value,
                recurrence: { kind: "once" },
                focus: [],
                extras: {},
              },
            },
          });
          key = crypto.randomUUID();
          $("#workspace-dialog").close();
        }, "Manual booking created."),
    );
    root.append(c);
    $("#workspace-dialog").showModal();
  }
  $("#close-workspace-dialog").onclick = () => {
    activeId = null;
    $("#workspace-dialog").close();
  };
  $("#refresh").onclick = () => act(async () => {}, "Workspace refreshed.");
  try {
    const config = await L.init();
    if (!config.enabled) {
      $("#workspace-title").textContent =
        "The connected workspace is not configured yet.";
      $("#workspace-content").append(
        n(
          "p",
          "Supabase setup is required before real customer records can be stored. The public site remains a fictional demo.",
        ),
        Object.assign(n("a", "Return to demo"), { href: "index.html" }),
      );
      return;
    }
    me = await L.api("me");
    if (me.role === "guest")
      throw Object.assign(
        new Error(
          "Sign in with your email to manage an account. Guest bookings are confirmed by the company.",
        ),
        { status: 401 },
      );
    if (me.role === "owner") {
      const adminLink = n("a", "Admin dashboard");
      adminLink.href = "workspace.html";
      document.querySelector("header nav").prepend(adminLink);
    }
    $("#sign-out").hidden = false;
    $("#refresh").hidden = false;
    $("#workspace-role").textContent =
      me.role === "owner" ? "OWNER WORKSPACE" : "CUSTOMER WORKSPACE";
    $("#workspace-subtitle").textContent =
      me.role === "owner"
        ? "Live database · Private customer records · Payments and email delivery pending setup"
        : "Your bookings and private walkthrough files.";
    const tabs =
      me.role === "owner"
        ? [
            "Bookings",
            "Walkthroughs",
            "Payments",
            "Customers",
            "Proverbs 31 Cal",
            "Availability",
            "Activity",
          ]
        : ["Bookings", "Walkthroughs", "Payments", "My Profile"];
    tabs.forEach((name) =>
      $("#workspace-nav").append(
        btn(name, () => {
          view = name;
          render();
        }),
      ),
    );
    $("#sign-out").onclick = async () => {
      await L.client.auth.signOut();
      location.replace("index.html");
    };
    await reload();
  } catch (e) {
    $("#workspace-title").textContent =
      e.status === 401 ? "Sign in to continue" : "Workspace unavailable";
    msg(e.message);
    const a = n("a", "Sign in securely", "primary");
    a.href = "sign-in.html";
    $("#workspace-content").append(a);
  }
})();
