(async () => {
  const page = location.pathname.split("/").pop();
  const guarded = [
    "care.html",
    "admin.html",
    "account.html",
    "final-payment.html",
  ].includes(page);
  const cover = document.createElement("div");
  cover.className = "backend-cover";
  cover.textContent = "Opening your workspace…";
  if (guarded) document.body.append(cover);
  try {
    if (!window.P31Live) {
      const s = document.createElement("script");
      s.src = "assets/backend-client.js";
      document.head.append(s);
      await new Promise((r, j) => {
        s.onload = r;
        s.onerror = j;
      });
    }
    const config = await P31Live.init();
    if (!config.enabled) {
      cover.remove();
      return;
    }
    if (page === "admin.html" || page === "account.html") {
      location.replace(
        "workspace.html" + (page === "admin.html" ? "?owner=1" : ""),
      );
      return;
    }
    if (page === "privacy.html") {
      const main = document.querySelector("main");
      main.replaceChildren();
      const title = document.createElement("h2");
      title.textContent = "Connected workspace data";
      main.append(title);
      [
        "The connected app stores customer contact details, property and access instructions, bookings, walkthrough files, quotes, and payment records in Supabase. These records are used to arrange and manage cleaning services.",
        "Account sign-in is handled by Supabase Auth. Walkthrough files are stored in a private bucket; customer and owner access is checked by the backend. Financial records describe payments recorded by the owner; no card processing is connected.",
        "Fictional demonstration records are separate and are never imported into the connected customer database. Browser storage is used for sign-in sessions and temporary booking request IDs.",
        "The company must approve its privacy policy, retention and deletion schedule, and customer-facing terms before accepting real customers. Contact the company for questions about your information.",
      ].forEach((text) => {
        const p = document.createElement("p");
        p.textContent = text;
        main.append(p);
      });
    }
    if (page === "final-payment.html") {
      cover.textContent =
        "Online guest payments are not connected yet. Please contact the company about an issued balance.";
      const a = document.createElement("a");
      a.href = "index.html";
      a.textContent = "Return home";
      cover.append(a);
      return;
    }
    if (page === "care.html") {
      const s = document.createElement("script");
      s.src = "assets/live-care.js";
      document.body.append(s);
      await new Promise((r, j) => {
        s.onload = r;
        s.onerror = j;
      });
      await window.P31LiveCareReady;
    }
    document
      .querySelectorAll(".demo,.demo-toolbar,.demo-banner")
      .forEach((n) => {
        if (page !== "care.html") n.hidden = true;
      });
    cover.remove();
  } catch (e) {
    if (guarded) {
      if (
        ["localhost", "127.0.0.1"].includes(location.hostname) &&
        e.message === "Unable to check the backend connection."
      ) {
        cover.remove();
        return;
      }
      cover.textContent =
        "The workspace connection is unavailable. Please reload before entering any information.";
    } else cover.remove();
  }
})();
