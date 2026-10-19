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
  const covered = new Map();
  if (guarded) {
    [...document.body.children].forEach((n) => {
      covered.set(n, n.inert);
      n.inert = true;
    });
    document.body.append(cover);
  }
  function removeCover() {
    covered.forEach((previous, n) => (n.inert = previous));
    cover.remove();
  }
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
    const live = config.enabled || config.siteMode === "launch";
    if (live) {
      document
        .querySelectorAll(".demo,.demo-toolbar,.demo-banner,[data-demo-copy]")
        .forEach((n) => (n.hidden = true));
      document
        .querySelectorAll('a[href="privacy.html"]')
        .forEach((a) => (a.textContent = "Privacy"));
      document
        .querySelectorAll("title")
        .forEach(
          (n) =>
            (n.textContent = n.textContent.replace(
              "Cinematic Preview",
              "Cleaning Company",
            )),
        );
      document.querySelectorAll('a[href="account.html"]').forEach((a) => {
        a.href = "workspace.html";
      });
      if (page === "about.html") {
        const p = document.querySelectorAll("main .details p");
        if (p[2])
          p[2].textContent =
            "Explore Standard Cleaning, Deep Cleaning, Apartment Move-In / Move-Out Cleaning, and Airbnb Turnover.";
        if (p[3]) p[3].hidden = true;
      }
      if (page === "contact.html") {
        const p = document.querySelector("main .fine");
        if (p)
          p.textContent =
            "Contact Proverbs 31 Cleaning Co. to discuss your home and cleaning needs.";
      }
    }
    if (!config.enabled) {
      if (live && page === "privacy.html") {
        const main = document.querySelector("main");
        if (main) {
          main.replaceChildren();
          const h = document.createElement("h2"),
            p = document.createElement("p"),
            a = document.createElement("a");
          h.textContent = "Online services are being prepared";
          p.textContent =
            "Online booking and account registration are not currently available. Please contact Proverbs 31 Cleaning Co. directly to arrange service. Privacy information for online accounts will be available before those services launch.";
          a.href = "contact.html";
          a.textContent = "Contact the company";
          main.append(h, p, a);
        }
      }
      if (live && guarded) {
        cover.replaceChildren();
        const h = document.createElement("h1"),
          p = document.createElement("p");
        h.textContent = "Online booking is being prepared.";
        p.textContent =
          "Please contact Proverbs 31 Cleaning Co. to arrange your cleaning while online booking and account access are being set up.";
        const home = document.createElement("a"),
          contact = document.createElement("a");
        home.href = "index.html";
        home.textContent = "Return home";
        contact.href = "contact.html";
        contact.textContent = "Contact the company";
        cover.append(h, p, contact, home);
        document.querySelectorAll("dialog[open]").forEach((d) => d.close());
        cover.tabIndex = -1;
        cover.focus();
        return;
      }
      removeCover();
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
    removeCover();
  } catch (e) {
    if (guarded) {
      if (
        ["localhost", "127.0.0.1"].includes(location.hostname) &&
        e.message === "Unable to check the backend connection."
      ) {
        removeCover();
        return;
      }
      cover.textContent =
        "The workspace connection is unavailable. Please reload before entering any information.";
    } else removeCover();
  }
})();
