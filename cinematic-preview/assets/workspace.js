(async () => {
  const L = P31Live,
    $ = (s) => document.querySelector(s);
  const previewUrls = new Set();
  const clearPreviews = () => {previewUrls.forEach(url => URL.revokeObjectURL(url));previewUrls.clear();};
  let me,
    records = [],
    state = {},
    customers = [],
    view = "Bookings",
    page = 0,
    activeId,
    pricing = null,
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
    b.onclick = async () => {
      if(b.disabled)return;
      try {
        const pending=fn();
        if(pending && typeof pending.then==='function') {b.disabled=true;await pending;}
      }catch(error){msg(error.message);}
      finally{if(b.isConnected)b.disabled=false;}
    };
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
      if (view === "Pricing") pricing = await L.api("catalog");
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
    const figures = P31Workflow.totals(b);
    row("Pricing adjustments", money(figures.adjustments));
    row("Deposit recorded", money(b.deposit_paid_cents));
    row("Other payments recorded", money(b.final_paid_cents));
    row(
      b.invoice_issued ? "Issued remaining balance" : "Estimated remainder",
      money(
        Math.max(
          0,
          figures.balance,
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
      b.setAttribute("aria-current", b.dataset.view === view ? "page" : "false");
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
        c.append(n("p", "Booking · " + b.id.slice(0,8).toUpperCase(), "fine"));
        c.classList.add("booking-card");
        const facts=n("div",undefined,"booking-facts");
        facts.append(n("span",labels[b.service]),n("span",b.quote_snapshot.space),n("strong",new Date(b.visit_date+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})),n("span",arrivalName(b.arrival)));
        const balance=P31Workflow.totals(b);
        const foot=n("div",undefined,"booking-card-footer");
        foot.append(n("span",b.status.replaceAll("_"," "),"badge"),n("strong",money(balance.total)+(b.final_cents===null?"*":"")));
        c.append(facts,foot,n("p",b.final_cents===null?"Starting estimate · subject to walkthrough review":"Reviewed total · "+({awaiting_customer:"Awaiting your approval",accepted:"Approved",draft:"In review"}[b.quote_status] || b.quote_status.replaceAll("_"," ")),"fine"));
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
          "Manage visits and open cleaning blocks here. Calendar exports save a copy to your personal calendar.",
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
            String(i),
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
          if(count)b.append(n("span",count+" visit"+(count>1?"s":"")));
          if (partial) b.append(n("span", "Blocked"));
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
    } else if (view === "Pricing") {
      root.append(n("p", "Update starting prices for new quotes and bookings. Existing bookings keep their saved price; adjust those individually after walkthrough review.", "fine"));
      if (!pricing) {
        root.append(btn("Load pricing", () => act(async () => { pricing = await L.api("catalog"); })));
        return;
      }
      const groups = [
        ["Home and guest-suite starting prices", "space", pricing.spaces, "base_cents"],
        ["Deep Cleaning adjustment", "deep", pricing.services.filter(item => item.id === "deep"), "upgrade_cents"],
        ["Optional additions", "addon", pricing.addons, "cents"],
      ];
      groups.forEach(([title, kind, rows, key]) => {
        const box = section(title);
        if (kind === "deep") box.append(n("p", "Added to the selected home's Standard Cleaning price. Customers see the combined starting price.", "fine"));
        rows.forEach(item => {
          const amount = input("number", (item[key] / 100).toFixed(2));
          amount.min = kind === "deep" ? "0" : "0.01";
          amount.max = "10000"; amount.step = "0.01"; amount.required = true;
          const title = item.label + (item.per_load ? " · per load" : "") + " (USD)";
          form(box, [[title, amount]], "Save starting price", async () => {
            const cents = Math.round(Number(amount.value) * 100);
            await act(async () => {
              await L.api("pricing", {method:"POST", data:{kind,id:String(item.id),cents,expected_cents:item[key]}});
            }, "Starting price saved. Existing bookings were not changed.");
          });
        });
        root.append(box);
      });
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
          btn("Preview email template",async()=>{
            try {
              const template=await L.api('notification-preview',{query:{id:e.id}});
              const dialog=n('dialog');dialog.className='email-preview';
              const frame=n('iframe');frame.setAttribute('sandbox','');frame.title='Email template preview';frame.srcdoc=template.html;
              dialog.append(n('h2',template.subject),n('p',template.notice,'fine'),frame,btn('Close',()=>dialog.close()));
              dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
            }catch(error){msg(error.message);}
          }),
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
    clearPreviews();
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
    const figures = P31Workflow.totals(b);
    const quote = section("Your pricing review");
    quote.classList.add("quote-comparison");
    const comparison = n("dl");
    [["Original starting estimate",figures.starting],["Adjustments",figures.adjustments],[b.final_cents === null ? "Current estimate*" : "Reviewed total",figures.total],["Recorded payments",figures.paid],["Remaining balance",figures.balance]].forEach(([title,value])=>{
      const row=n("div");row.append(n("dt",title),n("dd",money(value)));comparison.append(row);
    });
    quote.append(comparison,n("p", "Quote revision " + b.revision + " · " + b.quote_status.replaceAll('_',' '),"fine"));
    (b.quote_adjustments || []).forEach(item=>quote.append(n("p",item.label + " · " + money(item.cents))));
    if (b.final_cents === null) quote.append(n("p","This estimate is awaiting walkthrough review. It is not a confirmed final price.","fine"));
    if (b.quote_status === 'accepted') quote.append(n("p","Customer approval is recorded for this quote. Any later adjustment requires a new review and approval.","fine"));
    if (me.role !== "owner" && b.quote_status === "awaiting_approval") {
      const accept = btn("Accept reviewed total · " + money(figures.total), () => act(()=>action(b,"accept_quote",{revision:b.revision}),"Reviewed quote accepted."),"primary");
      const consent = input("checkbox");accept.disabled=true;
      consent.onchange=()=>accept.disabled=!consent.checked;
      quote.append(label("I have reviewed the service details, adjustments, and total shown above.",consent),accept);
    }
    root.append(quote);
    if ((b.payment_records || []).length) {
      const history=section("Payments recorded");
      b.payment_records.forEach(payment=>history.append(n("p",money(payment.cents)+" · "+payment.kind+" · "+payment.method+" · "+new Date(payment.created_at).toLocaleDateString())));
      history.append(n("p","These are payments recorded by the company. No card transaction is processed on this website yet.","fine"));root.append(history);
    }
    if (me.role !== "owner" && !["completed", "cancelled"].includes(b.status)) {
      const notes = n("textarea");
      notes.required = true;notes.maxLength=1000;
      const kind = choice(
        [
          ["reschedule", "Reschedule request"],
          ["cancel", "Cancellation request"],
        ],
        "reschedule",
      );
      info.append(n("p", "A cancellation or rescheduling request does not change your booking until the company reviews it. No automatic fees or refunds are applied.", "fine"));
      (b.booking_requests || []).forEach(request=>info.append(n("p",request.kind.replaceAll('_',' ')+" · "+(request.resolved?'Reviewed by the company':'Awaiting admin review')+" · "+request.notes,"request-status")));
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
        row.append(n("p", f.room + " · " + f.filename + " · " + (f.status === 'ready' ? 'Verified' : 'Upload incomplete')));
        if (f.notes) row.append(n("p",f.notes,"fine"));
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
                  const expired = n("p", "If the preview expires, close it and select Preview again for a fresh private link.","fine");
                  item.onerror = () => {expired.textContent="This preview could not load. Close it and select Preview again."};
                  win.addEventListener('close',()=>{if(item.tagName==='VIDEO')item.pause();win.remove();},{once:true});
                  win.append(
                    n("h3",f.room),item,expired,
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
      file.accept = P31Workflow.types.join(',');file.required=true;
      const room = input();room.required=true;room.maxLength=100;
      room.placeholder="For example: kitchen or guest bathroom";
      const notes=n("textarea");notes.maxLength=2000;
      const preview=n("div",undefined,"upload-preview"),status=n("p"),progress=n("progress");
      status.setAttribute('role','status');progress.max=100;progress.value=0;progress.hidden=true;progress.setAttribute('aria-label','Walkthrough upload progress');
      let selectedFile=null,attempted=false;
      file.onchange=()=>{
        clearPreviews();preview.replaceChildren();selectedFile=null;attempted=false;status.textContent='';progress.hidden=true;
        try {
          const chosen=file.files[0];P31Workflow.validateFile(chosen,b.walkthrough_files || []);selectedFile=chosen;
          const url=URL.createObjectURL(chosen);previewUrls.add(url);
          const item=n(chosen.type.startsWith('image/')?'img':'video');item.src=url;
          if(item.tagName==='VIDEO'){item.controls=true;item.preload='metadata';}else item.alt='Selected room photo';
          preview.append(item,n("p",chosen.name+' · '+(chosen.size/1024/1024).toFixed(1)+' MB',"fine"));
        } catch(error) {status.textContent=error.message;file.value='';}
      };
      const uploadForm=form(media,[["Room",room],["Photo or video",file],["Room notes",notes]],"Upload securely",async()=>{
        const button=uploadForm.querySelector('button');
        try {
          if(!selectedFile)throw Error('Choose a supported room photo or video first.');
          if(!attempted)P31Workflow.validateFile(selectedFile,b.walkthrough_files || []);
          attempted=true;progress.hidden=false;
          const saved=await act(()=>L.upload(b.id,selectedFile,room.value.trim(),notes.value,event=>{
            if(event.percent!==undefined)progress.value=event.percent;
            status.textContent=event.stage==='preparing'?'Preparing private upload…':event.stage==='uploading'?'Uploading · '+(event.percent || 0)+'%':event.stage==='verifying'?'Upload received. Verifying file…':'File verified.';
          }),"Walkthrough file uploaded and verified. Any earlier quote approval must be reviewed again.");
          if(!saved){button.textContent='Retry upload';status.textContent='Upload not completed. Keep this file selected and retry; your room notes are preserved.';}
        }catch(error){status.textContent=error.message;button.textContent='Retry upload';}
      });
      uploadForm.append(preview,progress,status,n("p","Up to 6 files, 20 MB each and 80 MB total per booking. Avoid including people, IDs, payment details, or access codes in your photos.","fine"));
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
      window = choice([["", "Checking availability…"]], ""),
      why = input();
    let dateRequest=0;
    const loadArrival=async()=>{
      const request=++dateRequest;window.disabled=true;
      window.replaceChildren(Object.assign(n('option','Checking availability…'),{value:''}));
      try {
        const days=await L.api('availability',{query:{start:date.value,days:1}});
        if(request!==dateRequest)return;
        const slots=(days[0]?.slots || []).filter(slot=>slot.available || (date.value===b.visit_date && slot.id===b.arrival));
        window.replaceChildren();slots.forEach(slot=>window.append(Object.assign(n('option',arrivalName(slot.id)),{value:slot.id})));
        if(!slots.length)window.append(Object.assign(n('option','No available arrival blocks'),{value:''}));
        if(date.value===b.visit_date && slots.some(slot=>slot.id===b.arrival))window.value=b.arrival;
      }catch(error){if(request===dateRequest){msg(error.message);window.replaceChildren(Object.assign(n('option','Unable to check availability'),{value:''}));}}
      finally{if(request===dateRequest)window.disabled=false;}
    };
    date.onchange=loadArrival;window.required=true;loadArrival();
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
          () => {
            if(window.disabled || !window.value)throw Error('Choose a confirmed available arrival block.');
            return action(b, "reschedule", {date:date.value,arrival:window.value,reason:why.value});
          },
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
    review.append(n("p","1. Review the walkthrough. 2. Explain any pricing adjustments. 3. Prepare the quote for customer approval. Completing the visit and issuing a balance require approval.","fine"));
    const prepare = btn("Prepare reviewed quote", () =>
        act(
          () => action(b, "prepare_quote", {}),
          "Quote prepared for customer approval. No email has been sent.",
        ));
    prepare.disabled=!b.reviewed || b.invoice_issued;
    review.append(prepare);
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
    const issue=btn("Issue final balance",()=>act(()=>action(b,"issue_invoice",{}),"Final balance issued. Email delivery is pending provider setup."));
    issue.disabled=!b.reviewed || b.quote_status!=='accepted' || b.status!=='completed' || b.final_cents===null || b.invoice_issued;
    review.append(issue);
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
    let catalog;
    try { catalog = await L.api("catalog"); }
    catch (error) { msg(error.message); return; }
    const spaceChoices = service => catalog.spaces
      .filter(space => (service === "airbnb") === space.suite)
      .map(space => [space.id, space.label + " · from " + money(space.base_cents + (catalog.services.find(item => item.id === service)?.upgrade_cents || 0)) + "*"]);
    const root = $("#workspace-detail");
    root.replaceChildren();
    activeId = null;
    const c = section("Add a manual booking"),
      name = input(),
      email = input("email"),
      phone = input("tel"),
      address = input(),
      service = choice(catalog.services.map(item => [item.id, item.label]), "standard"),
      space = choice(spaceChoices("standard"), "3"),
      mode = choice(
        [
          ["Move-In", "Move-In"],
          ["Move-Out", "Move-Out"],
        ],
        "Move-In",
      ),
      date = input("date"),
      arrival = choice([["", "Choose a date first"]], "");
    let availabilityRequest = 0;
    date.onchange = async () => {
      const request = ++availabilityRequest;
      arrival.replaceChildren(Object.assign(n("option", "Checking availability…"), { value: "" }));
      arrival.disabled = true;
      try {
        const rows = await L.api("availability", {
          query: { start: date.value, days: 1 },
        });
        if (request !== availabilityRequest) return;
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
        if (request !== availabilityRequest) return;
        arrival.replaceChildren(Object.assign(n("option", "Availability unavailable—choose the date again"), { value: "" }));
        msg(e.message);
      } finally {
        if (request === availabilityRequest) arrival.disabled = false;
      }
    };
    arrival.required = true;
    [name, email, address, date].forEach((i) => (i.required = true));
    service.onchange = () => {
      space.replaceChildren();
      const vals = spaceChoices(service.value);
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
          if (arrival.disabled || !arrival.value) throw new Error("Choose a confirmed available arrival block first.");
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
    clearPreviews();
    $("#workspace-dialog").close();
  };
  $("#refresh").onclick = () => act(async () => {}, "Workspace refreshed.");
  try {
    const config = await L.init();
    if (!config.enabled || !config.authEnabled) {
      location.replace("sign-in.html");
      return;
    }
    const { data: { session } } = await L.client.auth.getSession();
    if (!session || session.user.is_anonymous) {
      location.replace("sign-in.html");
      return;
    }
    L.client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        document.querySelector("#workspace-content").replaceChildren();
        document.querySelector("#workspace-detail").replaceChildren();
        location.replace("sign-in.html");
      }
    });
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
        ? "Your bookings, availability, and customer care."
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
            "Pricing",
            "Activity",
          ]
        : ["Bookings", "Walkthroughs", "Payments", "My Profile"];
    document.body.dataset.role=me.role;
    const iconPaths={Bookings:'M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h4',Walkthroughs:'M3 6h18v14H3z M7 6l2-3h6l2 3 M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',Payments:'M3 5h18v14H3z M3 10h18 M7 15h3',Calendar:'M4 5h16v16H4z M8 3v4 M16 3v4 M4 11h16',Profile:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-3a8 8 0 0 1 16 0v3',More:'M5 12h.01 M12 12h.01 M19 12h.01'};
    const icon=(key)=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',iconPaths[key] || iconPaths.More);svg.append(path);return svg;};
    const selectView=(name)=>{
      view=name;
      const menu=$('#workspace-menu');if(menu.open)menu.close();
      window.scrollTo({top:0,behavior:'instant'});
      if(view==='Pricing')act(async()=>{pricing=await L.api('catalog');},'Pricing refreshed.');else render();
      $('#workspace-title').focus({preventScroll:true});
      document.querySelectorAll('[data-mobile-view]').forEach(b=>b.setAttribute('aria-current',b.dataset.mobileView===view || b.dataset.mobileView==='More' && !['Bookings','Proverbs 31 Cal','Walkthroughs','Payments'].includes(view)?'page':'false'));
    };
    tabs.forEach(name=>{const b=btn(name,()=>selectView(name));b.dataset.view=name;$('#workspace-nav').append(b);});
    const mobileTabs=me.role==='owner'?['Bookings','Proverbs 31 Cal','Walkthroughs','Payments','More']:tabs;
    mobileTabs.forEach(name=>{
      const short=({'Proverbs 31 Cal':'Calendar','My Profile':'Profile'})[name] || name;
      const b=btn('',()=>name==='More'?$('#workspace-menu').showModal():selectView(name));
      b.dataset.mobileView=name;b.setAttribute('aria-label',name==='More'?'More workspace options':name);
      b.append(icon(short),n('span',short));b.setAttribute('aria-current',name===view?'page':'false');$('#mobile-workspace-nav').append(b);
    });
    tabs.filter(name=>!mobileTabs.includes(name)).forEach(name=>$('#workspace-menu-options').append(btn(name,()=>selectView(name))));
    $('#close-workspace-menu').onclick=()=>$('#workspace-menu').close();
    $("#sign-out").onclick = async () => {
      await L.client.auth.signOut();
      location.replace("sign-in.html");
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
