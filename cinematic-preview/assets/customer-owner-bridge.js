// Customer-facing review/payment states shared with the local owner demo.
(() => {
  const A = P31Admin;
  let record;
  try {
    record = A.importJourney();
  } catch {}
  if (!record) return;
  const boxes = [];
  for (const selector of [
    "#overview .care-summary",
    "#bookings .care-summary",
    "#walkthrough .care-summary",
  ]) {
    const box = document.createElement("section");
    box.className = "card owner-quote-status";
    document.querySelector(selector).after(box);
    boxes.push(box);
  }
  function refresh() {
    const b = A.read().bookings.find((r) => r.id === record.id);
    if (!b) return;
    const updatedDate = new Date(b.date + "T12:00:00");
    visit = updatedDate;
    arrival = b.arrival;
    const displayDate = updatedDate.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    document
      .querySelectorAll("#overview-date, #booking-date")
      .forEach((n) => (n.textContent = displayDate));
    document
      .querySelectorAll("#overview-window, #booking-window")
      .forEach((n) => (n.textContent = b.arrival));
    document.querySelector("#invoice-date").textContent =
      displayDate + " · " + b.scope;

    document
      .querySelectorAll(".care-summary-pending")
      .forEach(
        (n) =>
          (n.textContent =
            b.quoteStatus === "Accepted"
              ? "Original starting estimate · reviewed quote accepted below"
              : b.quoteStatus === "Awaiting approval"
                ? "Original starting estimate · reviewed quote ready below"
                : "Final pricing pending virtual walkthrough review"),
      );
    boxes.forEach((box) => {
      box.replaceChildren();
      const h = document.createElement("h3");
      h.textContent = "Your pricing review";
      const p = document.createElement("p");
      if (b.quoteStatus === "Awaiting approval") {
        p.textContent =
          "Your walkthrough has been reviewed. Proposed final total: " +
          P31.money(b.finalTotal) +
          ". Review the adjustments before accepting.";
      } else if (b.quoteStatus === "Accepted") {
        p.textContent =
          "Reviewed quote accepted: " +
          P31.money(b.finalTotal) +
          ". Your recorded deposit of " +
          P31.money(b.depositPaid || 0) +
          " will be applied toward this total.";
      } else
        p.textContent =
          "Final pricing is pending walkthrough review. Your starting estimate remains " +
          P31.money(b.price) +
          "*.";
      box.append(h, p);
      if (b.reviewNotes) {
        const note = document.createElement("p");
        note.textContent = "Walkthrough review: " + b.reviewNotes;
        box.append(note);
      }
      (b.adjustments || []).forEach((a) => {
        const row = document.createElement("p");
        row.textContent =
          a.label +
          ": " +
          (a.amount < 0 ? "−" : "+") +
          P31.money(Math.abs(a.amount));
        box.append(row);
      });
      if (b.quoteStatus === "Awaiting approval") {
        const accept = document.createElement("button");
        accept.className = "primary";
        accept.textContent = "Accept reviewed quote · demo";
        accept.onclick = () => {
          try {
            A.update(
              b.id,
              (r) => {
                if (r.quoteStatus !== "Awaiting approval")
                  throw new Error(
                    "This quote has changed. Reload to review it.",
                  );
                r.quoteStatus = "Accepted";
                r.approvalNote = "Accepted in customer demo account";
              },
              "Reviewed quote accepted in customer demo account.",
            );
            refresh();
          } catch {
            p.textContent =
              "Unable to save your approval. Refresh and try again.";
          }
        };
        box.append(accept);
      }
      const note = document.createElement("p");
      note.className = "fine";
      note.textContent =
        "Local demo only. No contract, message, or charge is created.";
      box.append(note);
    });
    document.querySelector("#visit-status").textContent = "Demo · " + b.status;
    document.querySelector("#price-review-status").textContent = b.reviewed
      ? "Walkthrough reviewed · " + b.quoteStatus
      : "Awaiting walkthrough · Demo";
    document.querySelector("#invoice-status").textContent = b.invoiceIssued
      ? A.balance(b) > 0
        ? "Demo · Final balance issued"
        : "Demo · Paid"
      : "Awaiting final balance";
    const pay = document.querySelector("#pay-final");
    document.querySelector("#balance-amount").textContent = b.invoiceIssued
      ? P31.money(A.balance(b))
      : "Not issued";
    pay.hidden = false;
    pay.disabled = !b.invoiceIssued || A.balance(b) <= 0;
    pay.textContent = b.invoiceIssued
      ? A.balance(b) > 0
        ? "Simulate final payment →"
        : "Balance settled · demo"
      : "Awaiting final price";
    document.querySelector("#payments .balance-card>.fine").textContent =
      b.invoiceIssued
        ? "Your reviewed total is " +
          P31.money(b.finalTotal) +
          ". No payment processor is connected; the button below only simulates payment."
        : "Your final balance will be issued after walkthrough review, quote acceptance, and visit completion.";
    let finalLines = document.querySelector("#owner-final-lines");
    if (!finalLines) {
      finalLines = document.createElement("dl");
      finalLines.className = "invoice-lines";
      finalLines.id = "owner-final-lines";
      document.querySelector("#payments .invoice-lines").after(finalLines);
    }
    finalLines.replaceChildren();
    if (b.finalTotal !== undefined) {
      [
        ["Reviewed total", b.finalTotal],
        ["Deposit recorded", -(b.depositPaid || 0)],
        ["Final payments recorded", -(b.finalPaid || 0)],
        ["Remaining balance", A.balance(b)],
      ].forEach(([name, amount]) => {
        const row = document.createElement("div"),
          dt = document.createElement("dt"),
          dd = document.createElement("dd");
        dt.textContent = name;
        dd.textContent = P31.money(amount);
        row.append(dt, dd);
        finalLines.append(row);
      });
    }
    pay.onclick = () => {
      const box = modal("Simulate final payment");
      box.className = "";
      const note = document.createElement("p");
      note.textContent =
        "Demo only. Simulate settling " +
        P31.money(A.balance(b)) +
        ". No card details or real payment will be collected.";
      const confirm = document.createElement("button");
      confirm.className = "primary";
      confirm.textContent = "Simulate payment · " + P31.money(A.balance(b));
      confirm.onclick = () => {
        try {
          A.update(
            b.id,
            (r) => {
              if (!r.invoiceIssued || r.quoteStatus !== "Accepted")
                throw new Error("Balance is not ready.");
              r.finalPaid = (r.finalPaid || 0) + A.balance(r);
            },
            "Final payment simulated in customer portal. No charge processed.",
          );
          document.querySelector("#modal").close();
          refresh();
        } catch {
          note.textContent =
            "Unable to save this simulation. Refresh and try again.";
        }
      };
      box.append(note, confirm);
    };
  }
  refresh();
  window.addEventListener("storage", (e) => {
    if (e.key === A.KEY) refresh();
  });
  window.addEventListener("p31-owner-change", refresh);
})();
