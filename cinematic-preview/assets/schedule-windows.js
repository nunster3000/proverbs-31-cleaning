window.P31Windows = (() => {
  const legacy = { morning: "09:00-12:00", afternoon: "12:00-15:00" };
  const minutes = (s) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };
  const clock = (n) =>
    String(Math.floor(n / 60)).padStart(2, "0") +
    ":" +
    String(n % 60).padStart(2, "0");
  const pretty = (n) => {
    const h = Math.floor(n / 60),
      m = n % 60;
    return (
      (h % 12 || 12) +
      ":" +
      String(m).padStart(2, "0") +
      " " +
      (h >= 12 ? "PM" : "AM")
    );
  };
  function times(value) {
    const id = legacy[value] || value;
    if (/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(id)) return id.split("-").map(minutes);
    const match = String(value).match(
      /(\d{1,2}):(\d{2})\s*(AM|PM)\s*[–-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i,
    );
    if (!match) return [NaN, NaN];
    return [
      [match[1], match[2], match[3]],
      [match[4], match[5], match[6]],
    ].map(
      ([h, m, p]) =>
        ((Number(h) % 12) + (p.toUpperCase() === "PM" ? 12 : 0)) * 60 +
        Number(m),
    );
  }
  const label = (id) => {
    const [a, b] = times(id);
    return pretty(a) + " – " + pretty(b);
  };
  const id = (value) => times(value).map(clock).join("-");
  const overlap = (a, b) => {
    const [s, e] = times(a),
      [x, y] = times(b);
    return s < y && e > x;
  };
  function generate(start, end, hours) {
    const a = minutes(start),
      b = minutes(end),
      step = Number(hours) * 60;
    if (![120, 180].includes(step) || a >= b || a < 0 || b > 1440)
      throw Error(
        "Choose valid working hours and a 2-hour or 3-hour duration.",
      );
    const result = [];
    for (let n = a; n + step <= b; n += step)
      result.push(clock(n) + "-" + clock(n + step));
    if (!result.length)
      throw Error("The working range must fit at least one complete block.");
    return result;
  }
  function picker(selected, save) {
    const box = document.createElement("section");
    box.className = "slot-editor";
    const h = document.createElement("h3");
    h.textContent = "Open booking blocks";
    const p = document.createElement("p");
    p.textContent =
      "Choose 2-hour or 3-hour blocks, then check the times to offer on this date. Save to publish availability. Existing visits keep their booked times. Blocked time and existing bookings can still make a checked block unavailable.";
    const row = document.createElement("div");
    row.className = "cal-tools";
    const fields = {};
    for (const [name, type, value] of [
      ["Block length", "select", "3"],
      ["Start of day", "time", "09:00"],
      ["End of day", "time", "18:00"],
    ]) {
      const l = document.createElement(type === "select" ? "div" : "label");
      l.textContent = name;
      const i = document.createElement(type === "select" ? "select" : "input");
      if (type === "select") {
        i.hidden = true;
        const toggles = document.createElement("div");
        toggles.className = "duration-toggle";
        toggles.setAttribute("role", "group");
        toggles.setAttribute("aria-label", "Block length");
        for (const hours of [2, 3]) {
          const toggle = document.createElement("button");
          toggle.type = "button";
          toggle.dataset.duration = hours;
          toggle.textContent = hours + " hours";
          toggle.onclick = () => {
            i.value = hours;
            render();
          };
          toggles.append(toggle);
          const o = document.createElement("option");
          o.value = hours;
          o.textContent = hours + " hours";
          i.append(o);
        }
        l.append(toggles);
      } else i.type = type;
      i.value = value;
      i.setAttribute("aria-label", name);
      l.append(i);
      fields[name] = i;
      row.append(l);
    }
    const current = selected.map(id);
    if (current.length) {
      fields["Block length"].value =
        times(current[0])[1] - times(current[0])[0] === 120 ? "2" : "3";
      fields["Start of day"].value = clock(
        Math.min(...current.map((x) => times(x)[0])),
      );
      fields["End of day"].value = clock(
        Math.max(18 * 60, ...current.map((x) => times(x)[1])),
      );
    }
    const list = document.createElement("div");
    list.className = "slot-checks";
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    const render = () => {
      list.replaceChildren();
      row
        .querySelectorAll("[data-duration]")
        .forEach((b) =>
          b.setAttribute(
            "aria-pressed",
            b.dataset.duration === fields["Block length"].value,
          ),
        );
      try {
        generate(
          fields["Start of day"].value,
          fields["End of day"].value,
          fields["Block length"].value,
        ).forEach((value) => {
          const l = document.createElement("label");
          const i = document.createElement("input");
          i.type = "checkbox";
          i.value = value;
          i.checked = current.includes(value);
          l.append(i, document.createTextNode(label(value)));
          list.append(l);
        });
        status.textContent =
          "Unchecked blocks are closed to new bookings. Only complete blocks fit within the selected working hours.";
      } catch (e) {
        status.textContent = e.message;
      }
    };
    Object.values(fields).forEach((i) => (i.onchange = render));
    const b = document.createElement("button");
    b.type = "button";
    b.className = "primary";
    b.textContent = "Save open blocks";
    b.onclick = async () => {
      try {
        generate(
          fields["Start of day"].value,
          fields["End of day"].value,
          fields["Block length"].value,
        );
        b.disabled = true;
        const saved = await save(
          [...list.querySelectorAll("input:checked")].map((i) => i.value),
        );
        if (saved === false) throw new Error("Open blocks were not saved. Please review the error and try again.");
        status.textContent = "Open blocks saved.";
      } catch (e) {
        status.textContent = e.message;
      } finally {
        b.disabled = false;
      }
    };
    box.append(h, p, row, list, b, status);
    render();
    return box;
  }
  return { times, label, id, overlap, generate, picker, clock };
})();
