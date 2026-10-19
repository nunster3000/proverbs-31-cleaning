window.P31LiveCareReady = (async () => {
  const L = P31Live;
  const serviceMap = {
    "Standard Cleaning": "standard",
    "Deep Cleaning": "deep",
    "Apartment Cleaning": "apartment",
    "Airbnb Turnover": "airbnb",
  };
  let serverQuote = null,
    availability = new Map(),
    months = new Set(),
    loading = false;
  const error = document.createElement("p");
  error.setAttribute("role", "alert");
  error.className = "price-disclaimer";
  document.querySelector(".summary").prepend(error);
  function selection() {
    return {
      service:
        serviceMap[document.querySelector("input[name=care]:checked").value],
      space_id: currentScope,
      focus: [...selected],
      extras: {
        laundry: Number(document.querySelector("#extra-laundry").value) || 0,
        fridge: document.querySelector("#extra-fridge").checked,
        oven: document.querySelector("#extra-oven").checked,
        baseboards: document.querySelector("#extra-baseboards").checked,
      },
    };
  }
  async function quote() {
    serverQuote = await L.api("quote", { method: "POST", data: selection() });
    return serverQuote;
  }
  const priorFill = fillReview;
  fillReview = function () {
    priorFill();
    if (!serverQuote) return;
    const q = serverQuote;
    const snapshot = {
      care: bookingCareLabel(),
      serviceKey: document.querySelector("input[name=care]:checked").value,
      scope: q.space,
      apartmentMode: document.querySelector("#booking-apartment-service").value,
      roomFocus: [...selected],
      startingBase: q.base_cents / 100,
      price: q.total_cents / 100,
      deposit: q.deposit_cents / 100,
      extras: q.addons.map((a) => ({
        ...a,
        price: a.unit_cents / 100,
        amount: a.amount_cents / 100,
      })),
    };
    const first = document.querySelector("#review-content .care-summary"),
      summary = P31.renderCareSummary(snapshot);
    if (first) {
      const edit = first.querySelector("button");
      if (edit) summary.prepend(edit);
      first.replaceWith(summary);
    }
    document.querySelectorAll(".estimate-breakdown").forEach((box) => {
      box.replaceChildren();
      [
        ["Starting service", q.base_cents],
        ...q.addons
          .filter((a) => !a.included)
          .map((a) => [
            a.label + (a.id === "laundry" ? " × " + a.quantity : ""),
            a.amount_cents,
          ]),
      ].forEach(([label, cents]) => {
        const row = document.createElement("div"),
          key = document.createElement("span"),
          value = document.createElement("span");
        key.textContent = label;
        value.textContent = money(cents / 100);
        row.append(key, value);
        box.append(row);
      });
    });
  };
  function display() {
    if (!serverQuote) return;
    document.querySelector("#scope-price").textContent =
      money(serverQuote.total_cents / 100) + "*";
    ["review-total", "payment-total"].forEach(
      (id) =>
        (document.getElementById(id).textContent =
          money(serverQuote.total_cents / 100) + "*"),
    );
    ["review-deposit", "payment-deposit"].forEach(
      (id) =>
        (document.getElementById(id).textContent = money(
          serverQuote.deposit_cents / 100,
        )),
    );
    ["review-balance", "payment-balance"].forEach(
      (id) =>
        (document.getElementById(id).textContent = money(
          (serverQuote.total_cents - serverQuote.deposit_cents) / 100,
        )),
    );
  }
  // Disable all fictional identity and payment automation in connected mode.
  startDemoTyping = () => {
    demoTypingStarted = true;
    typingActive = false;
    document.querySelector("#next").disabled = false;
    document.querySelector("#typing-status").textContent =
      "Enter your contact and property details.";
    document.querySelector("#skip-typing").hidden = true;
  };
  skipDemoTyping = startDemoTyping;
  document
    .querySelectorAll(
      "#customer-form input:not([type=radio]),#customer-form textarea",
    )
    .forEach((n) => (n.value = ""));
  document.querySelector(".demo-toolbar").replaceChildren();
  const notice = document.createElement("p");
  notice.className = "connected-notice";
  notice.textContent =
    "Connected booking requests · Prices confirmed after walkthrough review · Online payments are not connected";
  document.querySelector(".demo-toolbar").append(notice);
  document
    .querySelectorAll(".account-options>.fine")
    .forEach(
      (n) =>
        (n.textContent =
          "Verify your email to save your booking and manage it securely."),
    );
  const guest = document.querySelector(
    "input[name=account-choice][value=guest]",
  );
  guest.disabled = !L.config.guestEnabled;
  if (guest.disabled) {
    document.querySelector("input[name=account-choice][value=create]").checked =
      true;
    guest.closest("label").querySelector("small").textContent =
      "Guest checkout will be available when enabled by the company.";
  }
  const captcha = document.createElement("div");
  document.querySelector(".account-options").append(captcha);
  const token = await L.captcha(captcha);
  if (!guest.disabled)
    guest.closest("label").querySelector("small").textContent =
      "Request as a guest and keep your booking reference. Email delivery is not connected yet.";
  document.querySelector("#account-message").textContent =
    "Your email must be verified before an account booking is submitted.";
  document.querySelector("#signin-preview").onclick = async () => {
    await L.signIn(customerValue("email"));
  };
  document.querySelector(".availability-note").textContent =
    "Arrival windows are checked against the booking database. Availability is confirmed again when you submit.";
  const priorSchedule = updateSchedule;
  updateSchedule = function () {
    priorSchedule();
    const note = document.querySelector("#schedule-preview .fine");
    if (note)
      note.textContent =
        "The first four recurring visits are reserved together when your request is submitted, subject to availability. Later visits are not automatically scheduled yet.";
  };
  document.querySelectorAll("input[name=account-choice]").forEach(
    (choice) =>
      (choice.onchange = () => {
        const mode = choice.value;
        document.querySelector("#account-message").textContent =
          mode === "guest"
            ? "Guest request selected. Keep your booking reference; account management is not available for guests."
            : "Verify your email before submitting an account booking.";
        document.querySelector("#signin-preview").hidden = mode !== "signin";
      }),
  );
  const previousCustomerSummary = fillCustomerSummary;
  fillCustomerSummary = function () {
    previousCustomerSummary();
    document.querySelector(
      "#payment-customer-summary p:last-child",
    ).textContent =
      document.querySelector("input[name=account-choice]:checked").value ===
      "guest"
        ? "Guest booking request"
        : "Account booking · " + customerValue("email");
  };
  const oldRender = render;
  render = function () {
    oldRender();
    display();
    if (stage === 2) {
      document.querySelector("#next").textContent =
        "Continue to request review →";
      document.querySelector("#typing-status").textContent =
        "Enter your real contact details only when you are ready to request a service.";
    }
    if (stage === 3) {
      document.querySelector("#payment h2").textContent =
        "Review your booking request.";
      document.querySelector("#payment .muted").textContent =
        "No payment will be taken. Your deposit will be arranged with the company.";
      document.querySelector("#next").textContent = "Submit booking request";
      document
        .querySelectorAll(
          "#payment .payment-methods,#payment .processor-placeholder,#payment>.fine",
        )
        .forEach((n) => (n.hidden = true));
      document.querySelector("#payment .payment-banner").textContent =
        "Online payments are not connected. No deposit has been collected.";
    }
  };
  offeredBlocks = (d) =>
    (availability.get(dateKey(d))?.slots || []).map((s) =>
      P31Windows.label(s.id),
    );
  availableBlocks = (d) =>
    (availability.get(dateKey(d))?.slots || [])
      .filter((s) => s.available)
      .map((s) => P31Windows.label(s.id));
  const originalDraw = drawCalendar;
  drawCalendar = function () {
    originalDraw();
    const start = dateKey(visibleMonth),
      monthKey = start.slice(0, 7);
    if (months.has(monthKey) || loading) return;
    loading = true;
    L.api("availability", { query: { start, days: 31 } })
      .then((days) => {
        days.forEach((d) => availability.set(d.date, d));
        months.add(monthKey);
        loading = false;
        drawCalendar();
        drawBlocks();
      })
      .catch((e) => {
        loading = false;
        error.textContent = e.message;
      });
  };
  const profile = await L.client.auth.getUser();
  if (profile.data.user && !profile.data.user.is_anonymous) {
    document.querySelector("#customer-email").value = profile.data.user.email;
  }
  document.querySelector("#next").onclick = async () => {
    const next = document.querySelector("#next");
    next.disabled = true;
    error.textContent = "";
    try {
      if (stage === 0) {
        await quote();
        stage = 1;
        render();
      } else if (stage === 1) {
        if (!date.value || !document.querySelector("#window").value)
          throw new Error("Choose an available date and arrival block.");
        if (
          document.querySelector("input[name=rhythm]:checked").value ===
            "recurring" &&
          document.querySelector("#frequency").value === "custom" &&
          !document.querySelector("#interval").reportValidity()
        )
          return;
        await quote();
        stage = 2;
        render();
      } else if (stage === 2) {
        if (!document.querySelector("#customer-form").reportValidity()) return;
        let {
          data: { user },
        } = await L.client.auth.getUser();
        const asGuest =
          document.querySelector("input[name=account-choice]:checked").value ===
          "guest";
        if (!asGuest && (!user || user.is_anonymous)) {
          if (!(await L.signIn(customerValue("email")))) return;
          user = (await L.client.auth.getUser()).data.user;
        }
        if (
          !asGuest &&
          user.email.toLowerCase() !== customerValue("email").toLowerCase()
        )
          throw new Error("Use your verified account email: " + user.email);
        if (asGuest && !user) {
          const result = await L.client.auth.signInAnonymously({
            options: { captchaToken: token() },
          });
          if (result.error) throw result.error;
        }
        await quote();
        stage = 3;
        render();
      } else {
        let requestId = sessionStorage.getItem("p31-live-request");
        if (!requestId) {
          requestId = crypto.randomUUID();
          sessionStorage.setItem("p31-live-request", requestId);
        }
        const repeating =
            document.querySelector("input[name=rhythm]:checked").value ===
            "recurring",
          frequency = document.querySelector("#frequency").value;
        const payload = {
          ...selection(),
          name: customerValue("name"),
          email: customerValue("email"),
          phone: customerValue("phone"),
          address: [
            customerValue("address"),
            customerValue("unit"),
            customerValue("city"),
            customerValue("state") + " " + customerValue("zip"),
          ]
            .filter(Boolean)
            .join(", "),
          access_notes: customerValue("entry"),
          pet_notes: customerValue("pets"),
          care_notes: document.querySelector("#notes").value,
          date: date.value,
          arrival: (availability.get(date.value)?.slots || []).find(
            (s) =>
              P31Windows.label(s.id) ===
              document.querySelector("#window").value,
          )?.id,
          apartment_mode: document.querySelector("#booking-apartment-service")
            .value,
          recurrence: repeating
            ? {
                kind: frequency,
                interval: Number(document.querySelector("#interval").value),
                unit: document.querySelector("#unit").value,
              }
            : { kind: "once" },
        };
        const records = await L.api("bookings", {
          method: "POST",
          data: { request_id: requestId, booking: payload },
        });
        sessionStorage.removeItem("p31-live-request");
        const dialog = document.createElement("dialog");
        dialog.className = "live-auth";
        const h = document.createElement("h2");
        h.textContent = "Your request is received.";
        const p = document.createElement("p");
        p.textContent =
          records.length +
          " visit request(s) saved. Starting estimate for the first visit: " +
          money(records[0].quote_snapshot.total_cents / 100) +
          "*. No payment has been collected. The company will review your request and walkthrough before confirming final pricing.";
        const id = document.createElement("p");
        id.textContent = "Booking reference: " + records[0].id;
        const link = document.createElement("a");
        link.className = "primary";
        link.href = "workspace.html";
        link.textContent = "Open my account";
        const user = (await L.client.auth.getUser()).data.user;
        if (user?.is_anonymous) {
          link.href = "index.html";
          link.textContent = "Return home";
          p.textContent +=
            " Keep this reference when contacting the company. Guest account management is not enabled.";
        }
        dialog.append(h, p, id, link);
        document.body.append(dialog);
        dialog.showModal();
        next.hidden = true;
      }
    } catch (e) {
      error.textContent = e.message;
      token.reset?.();
      if (stage === 1) {
        months.clear();
        drawCalendar();
      }
    } finally {
      next.disabled = false;
    }
  };
})();
