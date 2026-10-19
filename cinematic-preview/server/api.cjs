const { createClient } = require("@supabase/supabase-js");
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const uuid = (x) =>
  typeof x === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    x,
  );
function signatureMatches(mime, bytes) {
  const b = Buffer.from(bytes);
  if (mime === "image/jpeg")
    return b.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  if (mime === "image/png")
    return b
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/webp")
    return (
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP"
    );
  if (mime === "video/webm")
    return b.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]));
  if (mime === "video/mp4") return b.toString("ascii", 4, 8) === "ftyp";
  if (mime === "video/quicktime")
    return ["ftyp", "moov", "mdat", "wide", "free"].includes(
      b.toString("ascii", 4, 8),
    );
  return false;
}
function createHandler({
  env = process.env,
  clientFactory = createClient,
  fetchFile = fetch,
} = {}) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    const reply = (status, body) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(body));
    };
    const url = new URL(req.url, "https://internal.local"),
      route = url.searchParams.get("route") || "config";
    const configured =
      env.BACKEND_ENABLED === "true" &&
      !!env.SUPABASE_URL &&
      !!env.SUPABASE_ANON_KEY &&
      !!env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      if (route === "config") {
        if (req.method !== "GET")
          throw new HttpError(405, "Method not allowed");
        return reply(200, {
          enabled: configured,
          siteMode:
            configured || env.SITE_MODE === "launch" ? "launch" : "demo",
          url: configured ? env.SUPABASE_URL : null,
          key: configured ? env.SUPABASE_ANON_KEY : null,
          turnstileSiteKey: configured ? env.TURNSTILE_SITE_KEY || null : null,
          guestEnabled:
            configured &&
            env.GUEST_CHECKOUT_ENABLED === "true" &&
            !!env.TURNSTILE_SITE_KEY,
        });
      }
      if (!configured)
        throw new HttpError(
          503,
          "The connected backend has not been configured.",
        );
      if (!["GET", "POST", "DELETE"].includes(req.method))
        throw new HttpError(405, "Method not allowed");
      if (req.method !== "GET") {
        const allowed = new URL(
          env.APP_ORIGIN || "https://proverbs-31-cleaning.vercel.app",
        ).origin;
        if (
          req.headers.origin &&
          req.headers.origin !== allowed &&
          !(
            env.VERCEL !== "1" &&
            env.NODE_ENV !== "production" &&
            /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(req.headers.origin)
          )
        )
          throw new HttpError(403, "Origin not allowed");
        if (
          !String(req.headers["content-type"] || "").startsWith(
            "application/json",
          )
        )
          throw new HttpError(415, "Use a JSON request");
      }
      let body = req.body || {};
      if (typeof body === "string") body = JSON.parse(body);
      if (Buffer.byteLength(JSON.stringify(body)) > 65536)
        throw new HttpError(413, "Request too large");
      const token = String(req.headers.authorization || "").match(
        /^Bearer (.+)$/,
      )?.[1];
      const db = clientFactory(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: token ? { Authorization: "Bearer " + token } : {} },
      });
      const rpc = async (name, args) => {
        const { data, error } = await db.rpc(name, args);
        if (error) throw error;
        return data;
      };
      const read = async (query) => {
        const { data, error } = await query;
        if (error) throw error;
        return data;
      };
      if (route === "catalog" && req.method === "GET")
        return reply(200, {
          spaces: await read(db.from("service_spaces").select("*").order("id")),
          services: await read(db.from("service_types").select("*")),
          addons: await read(db.from("service_addons").select("*")),
        });
      if (route === "quote" && req.method === "POST")
        return reply(
          200,
          await rpc("api_quote", {
            p_service: body.service,
            p_space: body.space_id,
            p_focus: body.focus || [],
            p_extras: body.extras || {},
          }),
        );
      if (route === "availability" && req.method === "GET") {
        const date = url.searchParams.get("start");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date || ""))
          throw new HttpError(400, "Start date required");
        return reply(
          200,
          await rpc("api_availability", {
            p_start: date,
            p_days: Number(url.searchParams.get("days") || 31),
          }),
        );
      }
      if (!token) throw new HttpError(401, "Sign in required");
      const auth = await db.auth.getUser(token);
      if (auth.error || !auth.data?.user)
        throw new HttpError(401, "Your session has expired. Sign in again.");
      const user = auth.data.user;
      if (!user.is_anonymous && !user.email_confirmed_at)
        throw new HttpError(403, "Verify your email before continuing.");
      const owner = !!(await rpc("is_owner", {}));
      if (route === "me" && req.method === "GET")
        return reply(200, {
          user: {
            id: user.id,
            email: user.email || null,
            anonymous: !!user.is_anonymous,
          },
          role: owner ? "owner" : user.is_anonymous ? "guest" : "customer",
          profile: !user.is_anonymous ? await rpc("api_profile", {}) : null,
        });
      if (route === "bookings" && req.method === "POST") {
        if (!uuid(body.request_id))
          throw new HttpError(400, "A booking request ID is required");
        return reply(
          201,
          await rpc("api_create_booking", {
            p_data: body.booking,
            p_request: body.request_id,
          }),
        );
      }
      if (user.is_anonymous)
        throw new HttpError(403, "Account sign-in is required for this page.");
      if (route === "calendar" && req.method === "GET") {
        if (!owner) throw new HttpError(403, "Owner access required");
        const month = url.searchParams.get("month");
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || ""))
          throw new HttpError(400, "Choose a calendar month");
        const start = month + "-01",
          end = new Date(
            Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
          )
            .toISOString()
            .slice(0, 10);
        return reply(
          200,
          await read(
            db
              .from("bookings")
              .select(
                "*,customers(name,email,phone,address,access_notes,pet_notes),quote_adjustments(*),payment_records(*),booking_requests(*),walkthrough_files(*)",
              )
              .gte("visit_date", start)
              .lte("visit_date", end)
              .neq("status", "cancelled")
              .order("visit_date")
              .limit(1000),
          ),
        );
      }
      if (route === "bookings" && req.method === "GET") {
        const page = Math.max(
          0,
          Math.min(10000, Number(url.searchParams.get("page")) || 0),
        );
        return reply(
          200,
          await read(
            db
              .from("bookings")
              .select(
                "*,customers(name,email,phone,address,access_notes,pet_notes),quote_adjustments(*),payment_records(*),booking_requests(*),walkthrough_files(*)",
              )
              .order("visit_date", { ascending: false })
              .range(page * 100, page * 100 + 99),
          ),
        );
      }
      if (route === "profile" && req.method === "POST")
        return reply(200, await rpc("api_profile", { p_data: body }));
      if (route === "action" && req.method === "POST") {
        if (!uuid(body.id)) throw new HttpError(400, "Booking ID required");
        if (!["accept_quote", "request_change"].includes(body.action) && !owner)
          throw new HttpError(403, "Owner access required");
        return reply(
          200,
          await rpc("api_booking_action", {
            p_id: body.id,
            p_action: body.action,
            p_data: body.data || {},
            p_request: body.request_id || null,
          }),
        );
      }
      if (route === "customers" && req.method === "GET") {
        if (!owner) throw new HttpError(403, "Owner access required");
        const page = Math.max(
          0,
          Math.min(10000, Number(url.searchParams.get("page")) || 0),
        );
        return reply(
          200,
          await read(
            db
              .from("customers")
              .select("*")
              .order("created_at", { ascending: false })
              .range(page * 100, page * 100 + 99),
          ),
        );
      }
      if (route === "customer" && req.method === "POST") {
        if (!owner || !uuid(body.id))
          throw new HttpError(403, "Owner access required");
        return reply(
          200,
          await rpc("api_owner_customer", {
            p_id: body.id,
            p_data: body.profile,
          }),
        );
      }
      if (route === "owner-state" && req.method === "GET") {
        if (!owner) throw new HttpError(403, "Owner access required");
        return reply(200, {
          settings: await read(
            db.from("business_settings").select("*").single(),
          ),
          days: await read(
            db.from("calendar_days").select("*").order("visit_date"),
          ),
          blocks: await read(
            db.from("time_blocks").select("*").order("visit_date"),
          ),
          activity: await read(
            db
              .from("audit_events")
              .select("*")
              .order("created_at", { ascending: false })
              .limit(100),
          ),
          outbox: await read(
            db
              .from("notification_outbox")
              .select("*")
              .order("created_at", { ascending: false })
              .limit(100),
          ),
          notes: await read(db.from("owner_notes").select("*")),
        });
      }
      if (route === "schedule" && req.method === "POST") {
        if (!owner) throw new HttpError(403, "Owner access required");
        return reply(
          200,
          await rpc("api_owner_schedule", {
            p_action: body.action,
            p_data: body.data,
          }),
        );
      }
      if (route === "owner-notes" && req.method === "POST") {
        if (!owner || !uuid(body.id))
          throw new HttpError(403, "Owner access required");
        await rpc("api_save_owner_notes", {
          p_id: body.id,
          p_notes: body.notes,
        });
        return reply(200, { saved: true });
      }
      if (route === "upload" && req.method === "POST") {
        if (!uuid(body.booking_id))
          throw new HttpError(400, "Booking ID required");
        const file = await rpc("api_upload_request", {
          p_id: body.booking_id,
          p_file: body.file,
        });
        const { data, error } = await db.storage
          .from("walkthroughs")
          .createSignedUploadUrl(file.path);
        if (error) throw error;
        return reply(201, { file, path: data.path, token: data.token });
      }
      if (["file", "upload-finish", "upload-delete"].includes(route)) {
        const id = route === "file" ? url.searchParams.get("id") : body.id;
        if (!uuid(id)) throw new HttpError(400, "File ID required");
        const row = await read(
          db.from("walkthrough_files").select("*").eq("id", id).single(),
        );
        if (!row || row.status === "deleted")
          throw new HttpError(404, "File not found");
        if (route === "upload-delete" && req.method === "POST") {
          await rpc("api_remove_upload", { p_file: id });
          const privileged = clientFactory(
            env.SUPABASE_URL,
            env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { persistSession: false, autoRefreshToken: false } },
          );
          const { error } = await privileged.storage
            .from("walkthroughs")
            .remove([row.path]);
          if (error) throw error;
          return reply(200, { removed: true });
        }
        if (route === "file" && row.status !== "ready")
          throw new HttpError(409, "File validation is pending");
        const reader =
          route === "upload-finish"
            ? clientFactory(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
                auth: { persistSession: false, autoRefreshToken: false },
              })
            : db;
        const { data, error } = await reader.storage
          .from("walkthroughs")
          .createSignedUrl(row.path, 60);
        if (error) throw error;
        if (route === "file" && req.method === "GET") {
          if (row.status !== "ready")
            throw new HttpError(409, "File validation is pending");
          return reply(200, {
            url: data.signedUrl,
            expiresIn: 60,
            mime: row.mime,
          });
        }
        if (route === "upload-finish" && req.method === "POST") {
          const response = await fetchFile(data.signedUrl, {
            headers: { Range: "bytes=0-63" },
            signal: AbortSignal.timeout(10000),
          });
          if (!response.ok)
            throw new HttpError(422, "Unable to verify uploaded file");
          if (
            !signatureMatches(
              row.mime,
              new Uint8Array(await response.arrayBuffer()),
            )
          )
            throw new HttpError(
              422,
              "The file content does not match its type. Remove it and choose a supported file.",
            );
          const privileged = clientFactory(
            env.SUPABASE_URL,
            env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { persistSession: false, autoRefreshToken: false } },
          );
          const finished = await privileged.rpc("api_upload_finish", {
            p_file: id,
            p_actor: user.id,
          });
          if (finished.error) throw finished.error;
          return reply(200, finished.data);
        }
      }
      throw new HttpError(404, "API route not found");
    } catch (error) {
      const status =
        error.status ||
        (error instanceof SyntaxError ? 400 : null) ||
        {
          42501: 403,
          22023: 422,
          P0001: 409,
          23505: 409,
          23514: 422,
          "22P02": 422,
          PGRST116: 404,
        }[error.code] ||
        500;
      const safe =
        error.status || ["42501", "22023", "P0001"].includes(error.code);
      reply(status, {
        error: safe
          ? error.message
          : status === 500
            ? "The backend could not complete this request."
            : "Invalid request or record.",
      });
    }
  };
}
module.exports = { createHandler, signatureMatches };
