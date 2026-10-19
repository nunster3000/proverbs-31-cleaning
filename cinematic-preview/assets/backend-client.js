window.P31Live = (() => {
  let config, client;
  async function init() {
    if (config) return config;
    const response = await fetch("/api/app?route=config", {
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error("Unable to check the backend connection.");
    config = await response.json();
    if (config.enabled) {
      if (!window.createSupabaseClient) await load("/assets/backend-sdk.js");
      client = window.createSupabaseClient(config.url, config.key, {
        auth: {
          flowType: "pkce",
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      });
    }
    return config;
  }
  function load(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Unable to load sign-in tools."));
      document.head.append(s);
    });
  }
  async function api(route, { method = "GET", data, query = {} } = {}) {
    await init();
    if (!client) throw new Error("The backend is not connected yet.");
    const {
      data: { session },
    } = await client.auth.getSession();
    const response = await fetch(
      "/api/app?" + new URLSearchParams({ route, ...query }),
      {
        method,
        cache: "no-store",
        headers: {
          ...(session
            ? { Authorization: "Bearer " + session.access_token }
            : {}),
          ...(data ? { "Content-Type": "application/json" } : {}),
        },
        body: data ? JSON.stringify(data) : undefined,
      },
    );
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(
        result.error || "Unable to complete this request.",
      );
      error.status = response.status;
      throw error;
    }
    return result;
  }
  async function captcha(target) {
    await init();
    if (!config.turnstileSiteKey) return () => null;
    if (!window.turnstile)
      await load(
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
      );
    let token = null;
    const widget = window.turnstile.render(target, {
      sitekey: config.turnstileSiteKey,
      callback: (value) => (token = value),
      "expired-callback": () => (token = null),
    });
    const value = () => {
      if (!token) throw new Error("Complete the security check first.");
      return token;
    };
    value.reset = () => {
      token = null;
      window.turnstile.reset(widget);
    };
    return value;
  }
  async function signIn(email) {
    await init();
    return new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.className = "live-auth";
      const h = document.createElement("h2");
      h.textContent = "Verify your email";
      const p = document.createElement("p");
      p.textContent =
        "We will send a sign-in link or code to " +
        email +
        ". Your booking stays here while you verify.";
      const security = document.createElement("div"),
        status = document.createElement("p");
      status.setAttribute("role", "status");
      const send = document.createElement("button");
      send.type = "button";
      send.className = "primary";
      send.textContent = "Send sign-in email";
      const form = document.createElement("form"),
        label = document.createElement("label");
      label.textContent = "Email code";
      const input = document.createElement("input");
      input.required = true;
      input.inputMode = "numeric";
      input.autocomplete = "one-time-code";
      input.maxLength = 12;
      label.append(input);
      const verify = document.createElement("button");
      verify.className = "primary";
      verify.textContent = "Verify code";
      form.append(label, verify);
      form.hidden = true;
      const close = document.createElement("button");
      close.className = "outline";
      close.textContent = "Back to booking";
      close.onclick = () => dialog.close();
      dialog.append(h, p, security, send, form, status, close);
      document.body.append(dialog);
      let getToken = () => null;
      captcha(security)
        .then((fn) => (getToken = fn))
        .catch((e) => (status.textContent = e.message));
      send.onclick = async () => {
        try {
          send.disabled = true;
          const { error } = await client.auth.signInWithOtp({
            email,
            options: {
              shouldCreateUser: true,
              emailRedirectTo: location.origin + "/sign-in.html",
              captchaToken: getToken(),
            },
          });
          if (error) throw error;
          status.textContent =
            "Check your email. Enter its code below, or use the sign-in link and return to this booking.";
          form.hidden = false;
        } catch (e) {
          status.textContent = e.message;
        } finally {
          send.disabled = false;
          getToken.reset?.();
        }
      };
      form.onsubmit = async (e) => {
        e.preventDefault();
        try {
          verify.disabled = true;
          const { error } = await client.auth.verifyOtp({
            email,
            token: input.value.trim(),
            type: "email",
          });
          if (error) throw error;
          dialog.close("verified");
        } catch (e) {
          status.textContent = e.message;
        } finally {
          verify.disabled = false;
        }
      };
      dialog.addEventListener(
        "close",
        () => {
          resolve(dialog.returnValue === "verified");
          dialog.remove();
        },
        { once: true },
      );
      dialog.showModal();
    });
  }
  async function upload(bookingId, file, room, notes = "") {
    const reservation = await api("upload", {
      method: "POST",
      data: {
        booking_id: bookingId,
        file: {
          filename: file.name,
          mime: file.type,
          bytes: file.size,
          room,
          notes,
        },
      },
    });
    const { error } = await client.storage
      .from("walkthroughs")
      .uploadToSignedUrl(reservation.path, reservation.token, file, {
        contentType: file.type,
      });
    if (error) throw error;
    return api("upload-finish", {
      method: "POST",
      data: { id: reservation.file.id },
    });
  }
  return {
    init,
    api,
    captcha,
    signIn,
    upload,
    get client() {
      return client;
    },
    get config() {
      return config;
    },
  };
})();
