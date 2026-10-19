(() => {
  const id = new URLSearchParams(location.search).get("booking");
  if (!id) return;
  const A = P31Admin,
    $ = (s) => document.querySelector(s),
    pay = $("#guest-pay"),
    simulate = $("#guest-simulate");
  function render() {
    const b = A.read().bookings.find((r) => r.id === id);
    if (!b) {
      $("#guest-status").textContent = "Demo record unavailable";
      $("#guest-balance").textContent = "Not available";
      pay.disabled = true;
      $("#guest-message").textContent =
        "This local booking is not available in this browser. Open it from the owner demo on the same device.";
      return;
    }
    $(".payment-invoice .eyebrow").textContent = "Local demo invoice · " + b.id;
    $(".visit-head h3").textContent = b.care;
    $(".visit-head .fine").textContent = b.name + " · " + b.scope;
    const lines = $(".invoice-lines");
    lines.replaceChildren();
    function row(label, value) {
      const div = document.createElement("div"),
        dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = P31.money(value);
      div.append(dt, dd);
      lines.append(div);
    }
    row("Starting estimate", b.price);
    (b.adjustments || []).forEach((a) => row(a.label, a.amount));
    if (b.finalTotal !== undefined) row("Reviewed service total", b.finalTotal);
    row("Deposit recorded", -(b.depositPaid || 0));
    row("Final payments recorded", -(b.finalPaid || 0));
    const balance = A.balance(b);
    $("#guest-balance").textContent = b.invoiceIssued
      ? P31.money(balance)
      : "Not issued";
    $("#guest-status").textContent = b.invoiceIssued
      ? balance > 0
        ? "Demo · Balance issued"
        : "Demo · Settled"
      : "Awaiting final balance";
    pay.disabled = !b.invoiceIssued || balance <= 0;
    pay.hidden = false;
    pay.textContent =
      balance <= 0 ? "Balance settled · demo" : "Preview final payment →";
    $(".balance-card .fine").textContent =
      "Local demo only. This is not a secure payment link, and no money will be collected.";
    pay.onclick = () => {
      $("#guest-modal .pay-summary strong").textContent = P31.money(balance);
      simulate.textContent = "Simulate payment · " + P31.money(balance);
      $("#guest-modal").showModal();
    };
    simulate.onclick = () => {
      try {
        A.update(
          id,
          (r) => {
            if (!r.invoiceIssued || r.quoteStatus !== "Accepted")
              throw new Error("Balance not ready.");
            r.finalPaid = (r.finalPaid || 0) + A.balance(r);
          },
          "Guest final payment simulated. No charge processed.",
        );
        $("#guest-modal").close();
        render();
        $("#guest-message").textContent =
          "Demo payment recorded. No money was charged or email sent.";
      } catch {
        $("#guest-message").textContent =
          "Unable to record this demo payment. Refresh and try again.";
      }
    };
  }
  render();
  window.addEventListener("storage", (e) => {
    if (e.key === A.KEY) render();
  });
})();
