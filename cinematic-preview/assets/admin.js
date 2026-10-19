const A = P31Admin,
  $ = (s) => document.querySelector(s),
  money = P31.money;
const titles = {
  overview: [
    "A little clarity for your day.",
    "Your bookings, your calendar, and the care still to come.",
  ],
  bookings: [
    "Every visit, thoughtfully managed.",
    "Review requests, manage visits, and add bookings received elsewhere.",
  ],
  calendar: [
    "Proverbs 31 Cal",
    "Your scheduling hub. Manage every visit and protect your time.",
  ],
  walkthroughs: [
    "A closer look, before the visit.",
    "Review the space and prepare a clear final quote.",
  ],
  payments: [
    "Every detail, accounted for.",
    "Deposits, adjustments, and final balances in one place.",
  ],
  settings: [
    "A rhythm that works for you.",
    "Set working days and arrival blocks for your owner demo.",
  ],
};
let data = A.read(),
  view = "overview",
  selectedDate = A.dateKey(new Date()),
  month = new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  currentId = null,
  mediaUrls = [],
  mediaToken = 0;
const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
function button(text, fn, cls = "outline") {
  const b = el("button", text, cls);
  b.type = "button";
  b.onclick = fn;
  return b;
}
function say(text) {
  $("#admin-status").textContent = text;
  if ($("#booking-dialog").open) $("#detail-feedback").textContent = text;
}
function write(fn, success) {
  try {
    fn();
    data = A.read();
    renderAll();
    if (success) say(success);
    return true;
  } catch (e) {
    say(e.message || "Unable to save on this device.");
    return false;
  }
}
function change(name) {
  view = name;
  document.querySelectorAll(".view").forEach((s) => (s.hidden = s.id !== name));
  document.querySelectorAll("[data-view]").forEach((b) => {
    if (b.dataset.view === name) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  $("#page-title").textContent = titles[name][0];
  $("#page-subtitle").textContent = titles[name][1];
}
function formatDate(value) {
  return new Date(value + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function bookingCard(b, kind) {
  const card = el("article", undefined, "booking-row"),
    left = el("div"),
    right = el("div", undefined, "right");
  left.append(
    el("div", b.id + " · " + b.source, "eyebrow"),
    el("h3", b.name),
    el("p", b.care + " · " + b.scope),
    el("p", formatDate(b.date) + " · " + b.arrival),
    el(
      "span",
      kind === "payments"
        ? b.invoiceIssued
          ? "Final balance issued"
          : "Final price pending"
        : kind === "walkthroughs"
          ? b.quoteStatus
          : b.status,
      "badge",
    ),
  );
  right.append(
    el(
      "strong",
      money(kind === "payments" ? A.balance(b) : b.price) +
        (kind === "payments" ? "" : "*"),
    ),
    el(
      "small",
      kind === "payments"
        ? "Remaining / estimated balance"
        : "Starting estimate",
    ),
    button(
      kind === "walkthroughs"
        ? "Review walkthrough"
        : kind === "payments"
          ? "Review payments"
          : "Open booking",
      () => openBooking(b.id, kind),
    ),
  );
  card.append(left, right);
  return card;
}
function fillList(id, records, kind) {
  const target = $(id);
  target.replaceChildren();
  records.forEach((b) => target.append(bookingCard(b, kind)));
  if (!records.length) target.append(el("p", "Nothing here yet.", "empty"));
}
function renderOverview() {
  const active = data.bookings.filter((b) => b.status !== "Cancelled");
  const metrics = [
    [
      "Upcoming visits",
      active.filter(
        (b) => b.date >= A.dateKey(new Date()) && b.status !== "Completed",
      ).length,
      "Requested and confirmed",
    ],
    [
      "Quotes to review",
      active.filter((b) => !b.invoiceIssued && b.quoteStatus !== "Accepted")
        .length,
      "Walkthrough / price review",
    ],
    [
      "Deposits recorded",
      money(active.reduce((s, b) => s + (b.depositPaid || 0), 0)),
      "Demo records only",
    ],
    [
      "Issued balances",
      money(
        active
          .filter((b) => b.invoiceIssued)
          .reduce((s, b) => s + A.balance(b), 0),
      ),
      "Awaiting final payment",
    ],
  ];
  $("#metrics").replaceChildren();
  metrics.forEach(([label, value, note]) => {
    const d = el("div", undefined, "metric");
    d.append(el("small", label), el("strong", String(value)), el("span", note));
    $("#metrics").append(d);
  });
  function smallList(id, records) {
    const box = $(id);
    box.replaceChildren();
    records.slice(0, 4).forEach((b) => {
      const row = el("div", undefined, "list-row"),
        text = el("div");
      text.append(
        el("strong", b.name),
        el("small", b.care + " · " + formatDate(b.date)),
        el("small", b.status + " · " + b.quoteStatus),
      );
      row.append(
        text,
        button("Review", () => openBooking(b.id)),
      );
      box.append(row);
    });
    if (!records.length) box.append(el("p", "You’re all caught up.", "empty"));
  }
  smallList(
    "#attention-list",
    active.filter(
      (b) => b.status === "Requested" || b.quoteStatus !== "Accepted",
    ),
  );
  smallList(
    "#upcoming-list",
    active
      .filter(
        (b) => b.date >= A.dateKey(new Date()) && b.status !== "Completed",
      )
      .sort((a, b) => a.date.localeCompare(b.date)),
  );
  const activity = $("#activity-list");
  activity.replaceChildren();
  (data.activity || []).slice(0, 6).forEach((a) => {
    const row = el("div", undefined, "list-row"),
      text = el("div");
    text.append(el("strong", a.name), el("small", a.text));
    row.append(text, el("small", new Date(a.at).toLocaleString()));
    activity.append(row);
  });
  if (!data.activity.length)
    activity.append(
      el("p", "Actions you take in this demo will appear here.", "empty"),
    );
}
function renderCalendar() {
  $("#cal-export").replaceChildren(P31Cal.controls(data.bookings));
  $("#block-through").value = selectedDate;
  $("#block-through").min = selectedDate;
  $("#month-label").textContent = month.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const grid = $("#admin-calendar");
  grid.replaceChildren();
  for (let i = 0; i < month.getDay(); i++) grid.append(el("span"));
  for (
    let n = 1;
    n <= new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    n++
  ) {
    const d = new Date(month.getFullYear(), month.getMonth(), n),
      key = A.dateKey(d),
      visits = data.bookings.filter(
        (b) => b.date === key && b.status !== "Cancelled",
      ),
      blocked =
        !data.availability.days.includes(d.getDay()) ||
        data.availability.blocked.some(
          (x) => x.date === key && !x.block && !x.startTime,
        );
    const partial =
      !blocked && data.availability.blocked.some((x) => x.date === key);
    const b = button(
      String(n),
      () => {
        selectedDate = key;
        renderCalendar();
      },
      (blocked ? "blocked " : partial ? "partial-block " : "") +
        (visits.length ? "has-visits" : ""),
    );
    b.setAttribute(
      "aria-label",
      formatDate(key) +
        (blocked ? " · blocked" : partial ? " · time blocked" : "") +
        " · " +
        visits.length +
        " visit(s)",
    );
    b.setAttribute("aria-pressed", key === selectedDate);
    if (visits.length)
      b.append(
        el("span", visits.length + " visit" + (visits.length === 1 ? "" : "s")),
      );
    if (partial) b.append(el("span", "Time blocked"));
    grid.append(b);
  }
  $("#selected-date-label").textContent = formatDate(selectedDate);
  const slots = $("#calendar-slots");
  slots.replaceChildren();
  A.blocks.forEach((block) => {
    const box = el("div", undefined, "slot"),
      visits = data.bookings.filter(
        (b) =>
          b.date === selectedDate &&
          b.arrival === block &&
          b.status !== "Cancelled",
      );
    box.append(
      el("h3", block),
      el(
        "p",
        A.available(data, selectedDate, block)
          ? "Available capacity"
          : "Unavailable / full",
      ),
    );
    visits.forEach((b) =>
      box.append(
        button(b.name + " · " + b.status, () => openBooking(b.id), "text-btn"),
      ),
    );
    slots.append(box);
  });
  const blocked = $("#blocked-list");
  blocked.replaceChildren();
  data.availability.blocked
    .filter((b) => b.date === selectedDate)
    .forEach((b) => {
      const div = el("div", undefined, "blocked-item");
      div.append(
        el(
          "p",
          (b.startTime
            ? b.startTime + "–" + b.endTime
            : b.block || "Entire day") +
            " · " +
            b.reason,
        ),
        button(
          "Remove block",
          () =>
            write(() => {
              const fresh = A.read();
              fresh.availability.blocked = fresh.availability.blocked.filter(
                (x) => x.id !== b.id,
              );
              A.save(fresh);
            }, "Time block removed from the demo."),
          "text-btn",
        ),
      );
      blocked.append(div);
    });
}
function renderSettings() {
  document
    .querySelectorAll("[name=workday]")
    .forEach(
      (i) => (i.checked = data.availability.days.includes(Number(i.value))),
    );
  document
    .querySelectorAll("[name=workblock]")
    .forEach((i) => (i.checked = data.availability.blocks.includes(i.value)));
  $("#capacity").value = data.availability.capacity;
}
function renderAll() {
  data = A.read();
  renderOverview();
  const term = $("#booking-search").value.toLowerCase(),
    status = $("#booking-filter").value;
  fillList(
    "#booking-list",
    data.bookings.filter(
      (b) =>
        (!status || b.status === status) &&
        [b.name, b.care, b.id, b.email].some((s) =>
          s.toLowerCase().includes(term),
        ),
    ),
  );
  fillList(
    "#walkthrough-list",
    data.bookings.filter((b) => b.status !== "Cancelled" && !b.invoiceIssued),
    "walkthroughs",
  );
  fillList(
    "#payment-list",
    data.bookings.filter((b) => b.status !== "Cancelled"),
    "payments",
  );
  renderCalendar();
  renderSettings();
}
function closeMedia() {
  mediaToken++;
  mediaUrls.forEach(URL.revokeObjectURL);
  mediaUrls = [];
}
function previewEmail(b, kind) {
  $("#message-title").textContent = kind;
  const box = $("#message-body");
  box.replaceChildren(
    el("p", "To: " + b.email),
    el(
      "p",
      kind === "Final balance notice"
        ? (A.balance(b) <= 0
            ? "Your recorded balance is settled. No further payment is due. "
            : "Your final balance of " + money(A.balance(b)) + " is ready. ") +
            (b.accountCreated
              ? "Sign in to your account to review it."
              : "A secure payment link would be included after the payment provider is connected.")
        : kind === "Service completion"
          ? "Your " +
            b.care +
            " visit is marked complete. Thank you for choosing Proverbs 31 Cleaning Co."
          : kind === "Reviewed quote"
            ? "Your reviewed service total is " +
              money(b.finalTotal ?? A.total(b)) +
              ". Please review and approve this amount before your visit."
            : "Your booking for " +
              formatDate(b.date) +
              " has been updated. Current status: " +
              b.status +
              ".",
    ),
    el(
      "p",
      "Preview only. No message, link, or receipt has been sent.",
      "fine",
    ),
  );
  if (kind === "Final balance notice" && !b.accountCreated && b.invoiceIssued) {
    const link = el("a", "Open guest payment preview →", "text-btn");
    link.href = "final-payment.html?booking=" + encodeURIComponent(b.id);
    box.append(
      link,
      el("p", "Local demo link only, not a secure payment link.", "fine"),
    );
  }
  $("#message-dialog").showModal();
}
function labeled(text, input) {
  const label = el("label", text);
  label.append(input);
  return label;
}
function section(title) {
  const s = el("section", undefined, "detail-section");
  s.append(el("h3", title));
  return s;
}
function loadMedia(b, target) {
  const token = ++mediaToken;
  const req = indexedDB.open("p31-local-walkthrough-demo", 1);
  req.onupgradeneeded = () => req.result.createObjectStore("walkthroughs");
  req.onerror = () => {
    target.replaceChildren(
      el("p", "Unable to read local walkthrough media.", "fine"),
    );
  };
  req.onsuccess = () => {
    const db = req.result,
      read = db
        .transaction("walkthroughs")
        .objectStore("walkthroughs")
        .get(b.journeyKey || A.journeyKey(b));
    read.onsuccess = () => {
      db.close();
      if (token !== mediaToken) return;
      target.replaceChildren();
      const record = read.result;
      target.dataset.hasFiles = record?.files?.length ? "true" : "false";
      if (!record?.files?.length) {
        target.append(
          el(
            "p",
            "No walkthrough files saved for this booking on this device. Use the customer portal to save demo media, or document a walkthrough received separately.",
            "media-note",
          ),
        );
        return;
      }
      const grid = el("div", undefined, "media-grid");
      record.files.forEach((item) => {
        const c = el("article"),
          media = el(item.blob.type.startsWith("image/") ? "img" : "video");
        const url = URL.createObjectURL(item.blob);
        mediaUrls.push(url);
        media.src = url;
        if (media.tagName === "VIDEO") {
          media.controls = true;
          media.preload = "metadata";
        } else media.alt = "Walkthrough: " + item.room;
        c.append(media, el("p", item.room + " · " + item.name));
        grid.append(c);
      });
      target.append(
        grid,
        el("p", "Customer notes: " + (record.notes || "No notes added.")),
        el(
          "p",
          "Local demo files only. Nothing was uploaded to a server.",
          "fine",
        ),
      );
    };
    read.onerror = () => {
      db.close();
      target.replaceChildren(el("p", "Could not read local media.", "fine"));
    };
  };
}
function openBooking(id, kind) {
  closeMedia();
  data = A.read();
  const b = data.bookings.find((x) => x.id === id);
  if (!b) return;
  if (currentId !== id) $("#detail-feedback").textContent = "";
  currentId = id;
  $("#detail-id").textContent =
    b.id + " · " + (b.accountCreated ? "Account customer" : "Guest");
  $("#detail-name").textContent = b.name;
  const root = $("#booking-detail");
  root.replaceChildren();
  const grid = el("div", undefined, "detail-grid"),
    left = el("div"),
    right = el("div");
  left.append(P31.renderCareSummary(b));
  const startingNotice = left.querySelector(".care-summary-pending");
  if (b.reviewed)
    startingNotice.textContent =
      "Original starting estimate · see reviewed pricing below";
  const contact = section("Customer & visit");
  contact.append(
    el("p", b.email + " · " + (b.phone || "Phone not added")),
    el("p", b.address),
    el("p", formatDate(b.date) + " · " + b.arrival),
    el("p", "Rhythm: " + (b.rhythm || "One-time cleaning")),
  );
  contact.append(P31Cal.controls([b], undefined, true));
  left.append(contact);
  const visit = section("Manage the booking"),
    form = el("form"),
    status = el("select");
  [
    "Requested",
    "Awaiting walkthrough",
    "Confirmed",
    "Completed",
    "Cancelled",
  ].forEach((s) => {
    const o = el("option", s);
    status.append(o);
  });
  status.value = b.status;
  const date = el("input");
  date.type = "date";
  date.value = b.date;
  date.required = true;
  const block = el("select");
  A.blocks.forEach((s) => block.append(el("option", s)));
  block.value = b.arrival;
  form.append(
    labeled("Booking status", status),
    labeled("Visit date", date),
    labeled("Arrival block", block),
  );
  const reason = el("textarea");
  reason.maxLength = 1000;
  reason.placeholder = "Reason for cancellation or a schedule change";
  form.append(labeled("Change notes", reason));
  const submit = el("button", "Save booking", "primary");
  submit.type = "submit";
  form.append(submit);
  form.onsubmit = (e) => {
    e.preventDefault();
    const moved = date.value !== b.date || block.value !== b.arrival;
    if ((moved || status.value === "Cancelled") && !reason.value.trim()) {
      say("Add a reason for the schedule change or cancellation.");
      reason.focus();
      return;
    }
    const ok = write(
      () =>
        A.update(
          id,
          (r, d) => {
            if (
              moved &&
              status.value !== "Cancelled" &&
              !A.available(d, date.value, block.value, id)
            )
              throw new Error(
                "That arrival block is unavailable. Choose another time.",
              );
            r.journeyKey ||= A.journeyKey(r);
            r.status = status.value;
            r.date = date.value;
            r.arrival = block.value;
            if (reason.value.trim()) r.changeNotes = reason.value.trim();
          },
          "Booking updated: " +
            status.value +
            (reason.value.trim() ? " · " + reason.value.trim() : ""),
        ),
      "Booking updated in this browser.",
    );
    if (ok) openBooking(id, kind);
  };
  visit.append(
    form,
    button(
      "Preview booking email",
      () => previewEmail(b, "Booking update"),
      "text-btn",
    ),
  );
  if (b.status === "Completed")
    visit.append(
      button(
        "Preview completion email",
        () => previewEmail(b, "Service completion"),
        "text-btn",
      ),
    );
  right.append(visit);
  const mediaSection = section("Virtual walkthrough");
  const media = el("div");
  media.dataset.hasFiles = "false";
  media.append(el("p", "Looking for local demo media…", "fine"));
  mediaSection.append(media);
  const reviewForm = el("form"),
    reviewNote = el("textarea");
  reviewNote.required = true;
  reviewNote.value = b.reviewNotes || "";
  reviewNote.maxLength = 2000;
  reviewForm.append(labeled("Walkthrough review notes", reviewNote));
  const outside = el("input");
  outside.type = "checkbox";
  outside.checked = !!b.externalWalkthrough;
  reviewForm.append(
    labeled("Walkthrough was provided outside this demo", outside),
  );
  const mark = el(
    "button",
    b.reviewed ? "Update walkthrough review" : "Mark walkthrough reviewed",
    "outline",
  );
  mark.type = "submit";
  mark.disabled = b.invoiceIssued;
  reviewForm.append(mark);
  reviewForm.onsubmit = (e) => {
    e.preventDefault();
    write(
      () =>
        A.update(
          id,
          (r) => {
            if (media.dataset.hasFiles !== "true" && !outside.checked)
              throw new Error(
                "Add walkthrough media or confirm that the walkthrough was received separately.",
              );
            r.reviewed = true;
            r.reviewNotes = reviewNote.value.trim();
            r.externalWalkthrough = outside.checked;
          },
          "Walkthrough reviewed. Final quote not yet approved.",
        ),
      "Walkthrough review saved.",
    );
    openBooking(id, kind);
  };
  const upload = el("input");
  upload.type = "file";
  upload.multiple = true;
  upload.accept =
    "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime";
  mediaSection.append(
    labeled("Add room photos / videos received elsewhere · local demo", upload),
    el(
      "p",
      "Up to 6 files total, 20 MB each. Only sample media; nothing is uploaded. Room labels and notes can be included in your review below.",
      "fine",
    ),
  );
  upload.onchange = () => {
    const files = [...upload.files];
    if (files.length) saveOwnerMedia(b, files, () => openBooking(id, kind));
  };
  mediaSection.append(reviewForm);
  left.append(mediaSection);
  loadMedia(b, media);
  const pricing = section("Review final pricing");
  pricing.append(
    el(
      "p",
      "Adjustments are separate from the starting estimate. Record the work and obtain customer approval before issuing a balance.",
      "fine",
    ),
  );
  const lines = el("div");
  (b.adjustments || []).forEach((a, i) => {
    const row = el("div", undefined, "quote-line");
    row.append(
      el("span", a.label),
      el("strong", (a.amount < 0 ? "−" : "+") + money(Math.abs(a.amount))),
    );
    if (!b.invoiceIssued)
      row.append(
        button(
          "Remove",
          () => {
            write(() =>
              A.update(
                id,
                (r) => {
                  r.adjustments.splice(i, 1);
                  r.quoteStatus = "Not reviewed";
                  delete r.finalTotal;
                },
                "Pricing adjustment removed. New quote review required.",
              ),
            );
            openBooking(id, kind);
          },
          "text-btn",
        ),
      );
    lines.append(row);
  });
  pricing.append(lines);
  const adjustment = el("form"),
    label = el("input"),
    amount = el("input");
  label.required = true;
  label.maxLength = 150;
  label.placeholder = "Additional work or service credit";
  amount.type = "number";
  amount.step = ".01";
  amount.required = true;
  adjustment.append(
    labeled("Adjustment description", label),
    labeled("Amount · use a negative amount for a credit", amount),
  );
  const add = el("button", "Add adjustment", "outline");
  add.type = "submit";
  add.disabled = b.invoiceIssued;
  adjustment.append(add);
  adjustment.onsubmit = (e) => {
    e.preventDefault();
    const value = Number(amount.value);
    if (!Number.isFinite(value) || value === 0) {
      amount.focus();
      return;
    }
    write(() =>
      A.update(
        id,
        (r) => {
          const next = A.total(r) + value;
          if (next < Math.max(0, r.depositPaid || 0))
            throw new Error(
              "The total cannot be lower than the recorded deposit. Review any refund separately.",
            );
          r.adjustments.push({ label: label.value.trim(), amount: value });
          r.quoteStatus = "Not reviewed";
          delete r.finalTotal;
        },
        "Pricing adjustment saved; customer approval is required again.",
      ),
    );
    openBooking(id, kind);
  };
  pricing.append(adjustment);
  const final = el("div", undefined, "quote-line");
  final.append(
    el("span", "Reviewed total"),
    el("strong", money(b.finalTotal ?? A.total(b))),
  );
  pricing.append(final, el("p", "Quote status: " + b.quoteStatus, "badge"));
  const issue = button("Prepare reviewed quote", () => {
    if (
      write(
        () =>
          A.update(
            id,
            (r) => {
              if (!r.reviewed)
                throw new Error(
                  "Review the walkthrough before preparing a final quote.",
                );
              r.finalTotal = A.total(r);
              r.quoteStatus = "Awaiting approval";
            },
            "Reviewed quote prepared. Customer approval pending.",
          ),
        "Reviewed quote prepared. No email was sent.",
      )
    )
      openBooking(id, kind);
  });
  issue.disabled =
    !b.reviewed ||
    b.invoiceIssued ||
    ["Awaiting approval", "Accepted"].includes(b.quoteStatus);
  pricing.append(issue);
  if (b.quoteStatus === "Awaiting approval") {
    pricing.append(
      button(
        "Preview quote email",
        () => previewEmail(b, "Reviewed quote"),
        "text-btn",
      ),
    );
    const approval = el("form"),
      note = el("input");
    note.required = true;
    note.placeholder = "e.g. Customer approved by phone (demo)";
    approval.append(
      labeled("Record approval received outside the portal", note),
    );
    const ok = el("button", "Record customer approval", "outline");
    ok.type = "submit";
    approval.append(ok);
    approval.onsubmit = (e) => {
      e.preventDefault();
      write(
        () =>
          A.update(
            id,
            (r) => {
              r.quoteStatus = "Accepted";
              r.approvalNote = note.value.trim();
            },
            "Customer approval recorded: " + note.value.trim(),
          ),
        "Approval recorded.",
      );
      openBooking(id, kind);
    };
    pricing.append(approval);
  }
  right.append(pricing);
  const payments = section("Deposits & final balance");
  payments.append(
    el(
      "p",
      "Starting-price deposit: " +
        money(b.deposit) +
        " · Recorded: " +
        money(b.depositPaid || 0),
      "fine",
    ),
  );
  const deposit = el("form"),
    paid = el("input");
  paid.type = "number";
  paid.min = 0;
  paid.step = ".01";
  paid.required = true;
  paid.value = b.depositPaid || 0;
  deposit.append(labeled("Total deposit received · manual record", paid));
  const method = el("select");
  ["Cash", "Cash App", "Venmo", "PayPal", "Square", "Other"].forEach((x) =>
    method.append(el("option", x)),
  );
  method.value = b.paymentMethod || "Cash";
  deposit.append(labeled("Payment method", method));
  const dp = el("button", "Save deposit record", "outline");
  dp.type = "submit";
  deposit.append(dp);
  deposit.onsubmit = (e) => {
    e.preventDefault();
    write(
      () =>
        A.update(
          id,
          (r) => {
            const value = Number(paid.value);
            if (
              value < 0 ||
              value + (r.finalPaid || 0) > (r.finalTotal ?? A.total(r))
            )
              throw new Error(
                "Deposit record must be between zero and the unpaid service total.",
              );
            r.depositPaid = value;
            r.paymentMethod = method.value;
          },
          "Deposit record updated manually; no charge processed.",
        ),
      "Deposit recorded. No money was charged.",
    );
    openBooking(id, kind);
  };
  payments.append(deposit);
  payments.append(
    el(
      "p",
      (b.invoiceIssued ? "Issued balance: " : "Estimated balance: ") +
        money(A.balance(b)),
      "quote-line",
    ),
  );
  const invoice = button("Issue final balance · demo", () => {
    if (
      write(
        () =>
          A.update(
            id,
            (r) => {
              if (
                !r.reviewed ||
                r.quoteStatus !== "Accepted" ||
                r.status !== "Completed"
              )
                throw new Error(
                  "Review the walkthrough, record customer approval, and complete the visit first.",
                );
              r.invoiceIssued = true;
            },
            "Final balance issued in demo. No invoice email sent.",
          ),
        "Final balance issued locally.",
      )
    )
      openBooking(id, kind);
  });
  invoice.disabled =
    b.invoiceIssued ||
    !b.reviewed ||
    b.quoteStatus !== "Accepted" ||
    b.status !== "Completed";
  payments.append(invoice);
  if (!b.invoiceIssued)
    payments.append(
      el(
        "p",
        "Available after walkthrough review, customer quote approval, and visit completion.",
        "fine",
      ),
    );
  if (b.invoiceIssued) {
    payments.append(
      button(
        "Preview final balance email",
        () => previewEmail(b, "Final balance notice"),
        "text-btn",
      ),
    );
    const finalForm = el("form"),
      paymentAmount = el("input");
    paymentAmount.type = "number";
    paymentAmount.min = ".01";
    paymentAmount.max = A.balance(b);
    paymentAmount.step = ".01";
    paymentAmount.required = true;
    paymentAmount.value = A.balance(b).toFixed(2);
    finalForm.append(
      labeled("Final payment received elsewhere", paymentAmount),
    );
    const record = el("button", "Record final payment", "outline");
    record.type = "submit";
    record.disabled = A.balance(b) <= 0;
    finalForm.append(record);
    finalForm.onsubmit = (e) => {
      e.preventDefault();
      write(
        () =>
          A.update(
            id,
            (r) => {
              const value = Number(paymentAmount.value);
              if (!Number.isFinite(value) || value <= 0 || value > A.balance(r))
                throw new Error(
                  "Payment must be positive and cannot exceed the remaining balance.",
                );
              r.finalPaid = (r.finalPaid || 0) + value;
            },
            "Final payment recorded manually; no charge processed.",
          ),
        "Final payment recorded.",
      );
      openBooking(id, kind);
    };
    payments.append(finalForm);
  }
  right.append(payments);
  const owner = section("Owner notes & activity"),
    ownerForm = el("form"),
    ownerNote = el("textarea");
  ownerNote.value = b.ownerNotes || "";
  ownerNote.maxLength = 3000;
  ownerForm.append(labeled("Private owner notes · local demo only", ownerNote));
  const sn = el("button", "Save owner notes", "outline");
  sn.type = "submit";
  ownerForm.append(sn);
  ownerForm.onsubmit = (e) => {
    e.preventDefault();
    write(
      () =>
        A.update(
          id,
          (r) => (r.ownerNotes = ownerNote.value.trim()),
          "Owner notes updated.",
        ),
      "Owner notes saved.",
    );
  };
  owner.append(ownerForm);
  const log = el("ul", undefined, "owner-log");
  (b.events || [])
    .slice(0, 12)
    .forEach((e) =>
      log.append(el("li", new Date(e.at).toLocaleString() + " · " + e.text)),
    );
  owner.append(log);
  left.append(owner);
  grid.append(left, right);
  root.append(grid);
  if (!$("#booking-dialog").open) $("#booking-dialog").showModal();
}
// Navigation and owner controls.
document
  .querySelectorAll("[data-view]")
  .forEach((b) => (b.onclick = () => change(b.dataset.view)));
document
  .querySelectorAll("[data-open-view]")
  .forEach((b) => (b.onclick = () => change(b.dataset.openView)));
document
  .querySelectorAll("[data-close]")
  .forEach(
    (b) => (b.onclick = () => document.getElementById(b.dataset.close).close()),
  );
$("#booking-dialog").addEventListener("close", closeMedia);
["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((name, i) => {
  const input = el("input");
  input.type = "checkbox";
  input.name = "workday";
  input.value = i;
  $("#working-days").append(labeled(name, input));
});
A.blocks.forEach((block) => {
  const option = el("option", block);
  $("#block-window").append(option);
  const input = el("input");
  input.type = "checkbox";
  input.name = "workblock";
  input.value = block;
  $("#working-blocks").append(labeled(block, input));
  $("#manual-arrival").append(el("option", block));
});
$("#booking-search").oninput = renderAll;
$("#booking-filter").onchange = renderAll;
$("#month-prev").onclick = () => {
  month = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  renderCalendar();
};
$("#month-next").onclick = () => {
  month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  renderCalendar();
};
$("#block-window").onchange = () => {
  $("#block-hours").hidden = $("#block-window").value !== "custom";
};
$("#block-week").onclick = () => {
  const d = new Date(selectedDate + "T12:00:00");
  d.setDate(d.getDate() + 6);
  $("#block-through").value = A.dateKey(d);
};
$("#block-form").onsubmit = (e) => {
  e.preventDefault();
  const selected = $("#block-window").value,
    custom = selected === "custom",
    block = custom ? "" : selected,
    reason = $("#block-reason").value.trim(),
    startTime = custom ? $("#block-start").value : null,
    endTime = custom ? $("#block-end").value : null,
    through = $("#block-through").value;
  write(() => {
    if (
      !reason ||
      !through ||
      through < selectedDate ||
      (custom && (!startTime || !endTime || startTime >= endTime))
    )
      throw new Error("Choose valid dates, hours, and a reason.");
    const days = [];
    for (
      let d = new Date(selectedDate + "T12:00:00");
      A.dateKey(d) <= through;
      d.setDate(d.getDate() + 1)
    ) {
      days.push(A.dateKey(d));
      if (days.length > 366) throw new Error("Block up to one year at a time.");
    }
    const d = A.read();
    const overlaps = (arrival) =>
      !custom
        ? !block || block === arrival
        : startTime < (arrival === A.blocks[0] ? "12:00" : "15:00") &&
          endTime > (arrival === A.blocks[0] ? "09:00" : "12:00");
    if (
      d.bookings.some(
        (b) =>
          days.includes(b.date) &&
          overlaps(b.arrival) &&
          !["Cancelled", "Completed"].includes(b.status),
      )
    )
      throw new Error(
        "A visit overlaps this range. Move or cancel it before blocking time. Nothing was changed.",
      );
    days.forEach((date) =>
      d.availability.blocked.push({
        id: crypto.randomUUID(),
        date,
        block,
        reason,
        startTime,
        endTime,
      }),
    );
    A.save(d);
  }, "Time blocked in Proverbs 31 Cal (demo).");
};
$("#availability-form").onsubmit = (e) => {
  e.preventDefault();
  write(() => {
    const d = A.read(),
      days = [...document.querySelectorAll("[name=workday]:checked")].map((i) =>
        Number(i.value),
      ),
      blocks = [...document.querySelectorAll("[name=workblock]:checked")].map(
        (i) => i.value,
      ),
      capacity = Number($("#capacity").value);
    if (!days.length || !blocks.length)
      throw new Error("Choose at least one working day and arrival block.");
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10)
      throw new Error("Capacity must be between 1 and 10.");
    d.availability = { ...d.availability, days, blocks, capacity };
    A.save(d);
  }, "Owner availability saved. Existing visits have not been moved.");
};
P31.services.forEach((s) => $("#manual-service").append(el("option", s)));
function manualSpaces() {
  const service = $("#manual-service").value,
    airbnb = service === "Airbnb Turnover";
  $("#manual-space").replaceChildren();
  P31.spaces.forEach((s, i) => {
    if (airbnb !== !!s.suite) return;
    const option = el(
      "option",
      s.label +
        " · starting " +
        money(s.price + (service === "Deep Cleaning" ? 100 : 0)) +
        "*",
    );
    option.value = i;
    $("#manual-space").append(option);
  });
  $("#manual-mode-label").hidden = service !== "Apartment Cleaning";
}
$("#manual-service").onchange = manualSpaces;
manualSpaces();
$("#new-booking").onclick = () => {
  $("#manual-error").textContent = "";
  $("#manual-form").elements.date.value = selectedDate;
  $("#manual-dialog").showModal();
};
$("#manual-form").onsubmit = (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const d = A.read(),
      service = f.get("service"),
      space = Number(f.get("space")),
      q = P31.quote({ service, space });
    if (!A.available(d, f.get("date"), f.get("arrival")))
      throw new Error(
        "That arrival block is unavailable. Choose another time in the calendar.",
      );
    if (f.get("date") < A.dateKey(new Date()))
      throw new Error("Choose today or a future date.");
    const b = {
      id: "P31-" + Date.now().toString().slice(-7),
      name: f.get("name").trim(),
      email: f.get("email").trim(),
      phone: f.get("phone").trim(),
      address: f.get("address").trim(),
      care:
        service +
        (service === "Apartment Cleaning" ? " · " + f.get("mode") : ""),
      serviceKey: service,
      scopeId: space,
      scope: P31.spaces[space].label,
      apartmentMode: f.get("mode"),
      includedCare: P31.includedCare(service, { mode: f.get("mode") }),
      roomFocus: [],
      extras: q.lines,
      startingBase: q.base,
      price: q.total,
      deposit: q.deposit,
      depositPaid: 0,
      finalPaid: 0,
      date: f.get("date"),
      arrival: f.get("arrival"),
      accountCreated: f.get("account") === "account",
      rhythm: "One-time cleaning",
      source: "Manual booking",
      status: "Requested",
      adjustments: [],
      reviewed: false,
      quoteStatus: "Not reviewed",
      invoiceIssued: false,
      events: [],
      ownerNotes: f.get("notes").trim(),
    };
    d.bookings.unshift(b);
    A.event(d, b, "Manual booking added. No confirmation email sent.");
    A.save(d);
    data = d;
    renderAll();
    $("#manual-dialog").close();
    e.target.reset();
    manualSpaces();
    say("Manual demo booking added.");
    openBooking(b.id);
  } catch (err) {
    $("#manual-error").textContent = err.message;
  }
};
$("#reset-admin").onclick = () => {
  const box = $("#message-body");
  $("#message-title").textContent = "Reset the owner demo?";
  box.replaceChildren(
    el(
      "p",
      "This resets fictional owner bookings, blocks, quotes, and payment records. Saved walkthrough media is kept separately.",
    ),
  );
  const reset = button("Reset local owner records", () => {
    write(() => A.save(A.seed()), "Owner demo reset to sample records.");
    $("#message-dialog").close();
  });
  box.append(reset);
  $("#message-dialog").showModal();
};
window.addEventListener("storage", (e) => {
  if (e.key !== A.KEY) return;
  renderAll();
  if ($("#booking-dialog").open && currentId) {
    if (
      ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
    )
      say(
        "Customer updates received. Close and reopen this booking after saving your notes.",
      );
    else openBooking(currentId);
  }
});
try {
  A.importJourney();
  data = A.read();
} catch {
  say("Local storage is unavailable. Changes may not persist on this device.");
}
renderAll();
change("overview");
function saveOwnerMedia(b, files, done) {
  const types = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "video/mp4",
    "video/webm",
    "video/quicktime",
  ]);
  if (
    files.some(
      (f) => !types.has(f.type) || f.size <= 0 || f.size > 20 * 1024 * 1024,
    )
  ) {
    say("Use JPG, PNG, WebP, MP4, WebM, or MOV files up to 20 MB each.");
    return;
  }
  const key = b.journeyKey || A.journeyKey(b),
    request = indexedDB.open("p31-local-walkthrough-demo", 1);
  request.onupgradeneeded = () =>
    request.result.createObjectStore("walkthroughs");
  request.onerror = () => say("Local media storage is unavailable.");
  request.onsuccess = () => {
    const db = request.result,
      tx = db.transaction("walkthroughs", "readwrite"),
      store = tx.objectStore("walkthroughs"),
      get = store.get(key);
    let rejected = false;
    get.onsuccess = () => {
      const existing = get.result || { files: [], notes: "" };
      if (
        existing.files.length + files.length > 6 ||
        existing.files.reduce((s, f) => s + f.blob.size, 0) +
          files.reduce((s, f) => s + f.size, 0) >
          80 * 1024 * 1024
      ) {
        rejected = true;
        say("Walkthrough limit reached: 6 files or 80 MB total.");
        return;
      }
      store.put(
        {
          ...existing,
          files: [
            ...existing.files,
            ...files.map((f) => ({
              name: f.name,
              room: "Owner-provided walkthrough",
              blob: f,
            })),
          ],
        },
        key,
      );
    };
    tx.oncomplete = () => {
      db.close();
      if (rejected) return;
      write(
        () =>
          A.update(
            b.id,
            (r) => {
              r.journeyKey = key;
            },
            "Walkthrough media saved on this device.",
          ),
        "Demo media saved locally.",
      );
      done();
    };
    tx.onerror = () => {
      db.close();
      say("Unable to save media. Browser storage may be full.");
    };
  };
}
