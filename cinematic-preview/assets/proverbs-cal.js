window.P31Cal = (() => {
  const windows = {
    morning: ["09:00", "12:00"],
    afternoon: ["12:00", "15:00"],
  };
  const escape = (s) =>
    String(s || "")
      .replace(/\\/g, "\\\\")
      .replace(/\r\n|\r|\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  const stamp = (d) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  function utc(date, time, zone = "America/New_York") {
    const target = Date.parse(date + "T" + time + ":00Z");
    let value = target;
    const f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    for (let i = 0; i < 3; i++) {
      const a = Object.fromEntries(
        f.formatToParts(new Date(value)).map((x) => [x.type, x.value]),
      );
      value +=
        target -
        Date.UTC(+a.year, +a.month - 1, +a.day, +a.hour, +a.minute, +a.second);
    }
    return new Date(value);
  }
  function event(b, zone) {
    const date = b.visit_date || b.date;
    const times =
      (/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(b.arrival)
        ? b.arrival.split("-")
        : null) ||
      (window.P31Windows
        ? window.P31Windows.times(b.arrival).map(window.P31Windows.clock)
        : null) ||
      windows[b.arrival] ||
      (String(b.arrival).startsWith("9:")
        ? windows.morning
        : windows.afternoon);
    return {
      id: b.id,
      date,
      start: utc(date, times[0], zone),
      end: utc(date, times[1], zone),
      title:
        "Proverbs 31 · " + (b.service==='class'?'Class · '+(b.property?.name||b.customers?.name||'Learning group')+' · '+b.quote_snapshot.students+' students':(b.customers?.name || b.name || "Cleaning visit")),
      address: b.property?.address || b.address || "",
      description:
        (b.service==='class'?"Reserved class block · ":"Arrival window · ") +
        (b.serviceLabel || b.service || "Cleaning") +
        ". Manage this visit in Proverbs 31 Cal. Exported copy; changes here do not update the booking.",
    };
  }
  function calendar(bookings, zone = "America/New_York") {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Proverbs 31//Proverbs 31 Cal//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Proverbs 31 Cal",
    ];
    bookings
      .filter((b) => !["cancelled", "Cancelled"].includes(b.status))
      .forEach((b) => {
        const e = event(b, zone);
        lines.push(
          "BEGIN:VEVENT",
          "UID:" + escape(e.id) + "@proverbs31cal",
          "DTSTAMP:" + stamp(new Date()),
          "DTSTART:" + stamp(e.start),
          "DTEND:" + stamp(e.end),
          "SUMMARY:" + escape(e.title),
          "LOCATION:" + escape(e.address),
          "DESCRIPTION:" + escape(e.description),
          "END:VEVENT",
        );
      });
    lines.push("END:VCALENDAR");
    return (
      lines
        .map((line) => {
          let out = "",
            length = 0;
          for (const ch of line) {
            const size = new TextEncoder().encode(ch).length;
            if (length + size > 73) {
              out += "\r\n ";
              length = 1;
            }
            out += ch;
            length += size;
          }
          return out;
        })
        .join("\r\n") + "\r\n"
    );
  }
  function download(bookings, zone) {
    const url = URL.createObjectURL(
      new Blob([calendar(bookings, zone)], {
        type: "text/calendar;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "proverbs-31-cal.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function controls(bookings, zone = "America/New_York", single = false) {
    const row = document.createElement("div");
    row.className = "cal-tools";
    const button = (text, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "outline";
      b.textContent = text;
      b.onclick = fn;
      row.append(b);
    };
    button(
      single
        ? "Save visit to Apple / calendar (.ics)"
        : "Export visits · Apple / Google (.ics)",
      () => download(bookings, zone),
    );
    button("Google Calendar", () => {
      const d = document.createElement("dialog");
      d.className = "live-auth";
      const h = document.createElement("h2");
      h.textContent = "Take Proverbs 31 Cal with you";
      const p = document.createElement("p");
      p.textContent =
        "No account connection is required. Export the .ics file, then import it in Google Calendar → Settings → Import & export, or open it in Apple Calendar. This is a snapshot, not automatic sync. Re-importing may create duplicates. Manage all bookings and availability here.";
      const a = document.createElement("a");
      a.href = "https://calendar.google.com/calendar/u/0/r/settings/export";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "outline";
      a.textContent = "Open Google import settings";
      const close = document.createElement("button");
      close.textContent = "Done";
      close.className = "primary";
      close.onclick = () => d.close();
      d.append(h, p, a, close);
      d.addEventListener("close", () => d.remove());
      document.body.append(d);
      d.showModal();
    });
    return row;
  }
  return { calendar, event, controls };
})();
