const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  PGlite,
} = require("../cinematic-preview/node_modules/@electric-sql/pglite");
const ids = {
  alice: "11111111-1111-4111-8111-111111111111",
  bob: "22222222-2222-4222-8222-222222222222",
  owner: "33333333-3333-4333-8333-333333333333",
};
const db = new PGlite({
  wasmModule: new WebAssembly.Module(fs.readFileSync('cinematic-preview/node_modules/@electric-sql/pglite/dist/pglite.wasm')),
  fsBundle: new Blob([fs.readFileSync('cinematic-preview/node_modules/@electric-sql/pglite/dist/pglite.data')]),
});
const bootstrap = `create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub' $$;
`;
async function login(who, anon = false) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: ids[who],
      email: who + "@example.com",
      is_anonymous: anon,
    }),
  ]);
  await db.exec("set role authenticated");
}
const ready = (async () => {
  await db.exec(
    bootstrap.replace(
      "select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'",
      "select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid",
    ),
  );
  await db.exec(`create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}')$$;grant usage on schema auth,storage to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;
`);
  for (const [name, id] of Object.entries(ids))
    await db.query("insert into auth.users values($1,$2,now())", [
      id,
      name + "@example.com",
    ]);
  await db.exec(
    fs.readFileSync(
      "cinematic-preview/supabase/migrations/001_backend.sql",
      "utf8",
    ),
  );
  await db.query("insert into private.owner_accounts values($1)", [ids.owner]);
})();
async function rpc(name, args) {
  return (
    await db.query(
      `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as result`,
      args,
    )
  ).rows[0].result;
}
let booking;
const day = () => {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};
test("SQL migration applies, pricing is authoritative, and duplicate booking requests are idempotent", async () => {
  await ready;
  await login("alice");
  const payload = {
    name: "Alice",
    email: "fake-owner@example.com",
    address: "123 Example Lane",
    service: "deep",
    space_id: 3,
    date: day(),
    arrival: "morning",
    focus: ["Kitchen"],
    extras: { laundry: 2 },
    total_cents: 1,
    deposit_paid_cents: 999999,
  };
  const key = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const made = await rpc("api_create_booking", [JSON.stringify(payload), key]);
  booking = made[0];
  assert.equal(booking.quote_snapshot.total_cents, 25000);
  assert.equal(booking.quote_snapshot.deposit_cents, 10500);
  assert.equal(booking.deposit_paid_cents, 0);
  assert.equal(
    (await rpc("api_create_booking", [JSON.stringify(payload), key]))[0].id,
    booking.id,
  );
  assert.equal(
    (await db.query("select email from public.customers")).rows[0].email,
    "alice@example.com",
  );
  await rpc("api_profile", [
    JSON.stringify({ name: "Alice", address: "New saved home" }),
  ]);
  assert.equal(
    (
      await db.query("select property from public.bookings where id=$1", [
        booking.id,
      ])
    ).rows[0].property.address,
    "123 Example Lane",
  );
});
test("customers cannot read each other, mutate prices directly, or access owner controls", async () => {
  await ready;
  await login("bob");
  assert.equal(
    (await db.query("select * from public.bookings")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select * from public.customers")).rows.length,
    0,
  );
  await assert.rejects(() =>
    rpc("api_booking_action", [
      booking.id,
      "record_payment",
      JSON.stringify({ kind: "deposit", cents: 1, method: "Cash" }),
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ]),
  );
  await assert.rejects(() =>
    db.query("update public.bookings set invoice_issued=true"),
  );
  await assert.rejects(() =>
    db.query("insert into private.owner_accounts values($1)", [ids.bob]),
  );
  await assert.rejects(() =>
    rpc("api_upload_finish", ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", ids.bob]),
  );
});
test("capacity prevents double-booking and recurring reservations roll back atomically", async () => {
  await ready;
  await login("bob");
  const payload = {
    name: "Bob",
    email: "bob@example.com",
    address: "456 Example Lane",
    service: "standard",
    space_id: 3,
    date: day(),
    arrival: "morning",
  };
  await assert.rejects(
    () =>
      rpc("api_create_booking", [
        JSON.stringify(payload),
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      ]),
    /unavailable/,
  );
  assert.equal(
    (await db.query("select * from public.customers")).rows.length,
    0,
  );
});
test("owner quote/payment workflow requires review, approval, completion, and idempotent payment IDs", async () => {
  await ready;
  await login("owner");
  await assert.rejects(() =>
    rpc("api_booking_action", [booking.id, "issue_invoice", "{}", null]),
  );
  await rpc("api_booking_action", [
    booking.id,
    "review",
    JSON.stringify({
      external: true,
      notes: "Reviewed walkthrough received separately.",
    }),
    null,
  ]);
  await rpc("api_booking_action", [
    booking.id,
    "adjust",
    JSON.stringify({ label: "Additional work", cents: 2500 }),
    null,
  ]);
  const proposed = await rpc("api_booking_action", [
    booking.id,
    "prepare_quote",
    "{}",
    null,
  ]);
  assert.equal(proposed.final_cents, 27500);
  await login("alice");
  await assert.rejects(() =>
    rpc("api_booking_action", [
      booking.id,
      "accept_quote",
      JSON.stringify({ revision: proposed.revision - 1 }),
      null,
    ]),
  );
  await rpc("api_booking_action", [
    booking.id,
    "accept_quote",
    JSON.stringify({ revision: proposed.revision }),
    null,
  ]);
  await login("owner");
  await rpc("api_booking_action", [
    booking.id,
    "status",
    JSON.stringify({ status: "completed" }),
    null,
  ]);
  await rpc("api_booking_action", [booking.id, "issue_invoice", "{}", null]);
  const paymentKey = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const paid = await rpc("api_booking_action", [
    booking.id,
    "record_payment",
    JSON.stringify({ kind: "deposit", cents: 10500, method: "Cash" }),
    paymentKey,
  ]);
  assert.equal(paid.deposit_paid_cents, 10500);
  const duplicate = await rpc("api_booking_action", [
    booking.id,
    "record_payment",
    JSON.stringify({ kind: "deposit", cents: 10500, method: "Cash" }),
    paymentKey,
  ]);
  assert.equal(duplicate.deposit_paid_cents, 10500);
  await assert.rejects(() =>
    rpc("api_booking_action", [
      booking.id,
      "record_payment",
      JSON.stringify({ kind: "final", cents: 999999, method: "Cash" }),
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    ]),
  );
  await rpc("api_save_owner_notes", [booking.id, "Private owner note"]);
  await login("alice");
  assert.equal(
    (await db.query("select * from public.owner_notes")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select * from public.audit_events")).rows.length,
    0,
  );
});
test("a later recurring conflict rolls back the whole booking series and customer insert", async () => {
  await ready;
  await login("owner");
  const first = day(),
    later = new Date(first + "T12:00:00");
  later.setDate(later.getDate() + 7);
  const blocked = later.toISOString().slice(0, 10);
  await rpc("api_owner_schedule", [
    "block",
    JSON.stringify({
      date: blocked,
      arrival: "afternoon",
      reason: "Recurring conflict test",
    }),
  ]);
  await login("bob");
  await assert.rejects(
    () =>
      rpc("api_create_booking", [
        JSON.stringify({
          name: "Bob",
          email: "bob@example.com",
          address: "456 Example Lane",
          service: "standard",
          space_id: 3,
          date: first,
          arrival: "afternoon",
          recurrence: { kind: "weekly" },
        }),
        "abababab-abab-4aba-8aba-abababababab",
      ]),
    /unavailable/,
  );
  assert.equal(
    (await db.query("select * from public.bookings")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select * from public.customers")).rows.length,
    0,
  );
});
test("private file reservations are isolated and completion is server-only", async () => {
  await ready;
  await login("alice");
  const records = await rpc("api_create_booking", [
    JSON.stringify({
      name: "Alice",
      email: "alice@example.com",
      address: "123 Example Lane",
      service: "standard",
      space_id: 3,
      date: day(),
      arrival: "afternoon",
    }),
    "acacacac-acac-4aca-8aca-acacacacacac",
  ]);
  const b = records[0],
    f = await rpc("api_upload_request", [
      b.id,
      JSON.stringify({
        filename: "room.png",
        mime: "image/png",
        bytes: 8,
        room: "Bedroom",
      }),
    ]);
  await db.query(
    "insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)",
    [
      "walkthroughs",
      f.path,
      JSON.stringify({ size: 8, mimetype: "image/png" }),
    ],
  );
  await login("bob");
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    0,
  );
  await assert.rejects(() =>
    rpc("api_upload_request", [
      b.id,
      JSON.stringify({
        filename: "x.png",
        mime: "image/png",
        bytes: 8,
        room: "Bedroom",
      }),
    ]),
  );
  await login("alice");
  await assert.rejects(() => rpc("api_upload_finish", [f.id, ids.alice]));
  await db.exec("reset role;set role service_role");
  const readyFile = await rpc("api_upload_finish", [f.id, ids.alice]);
  assert.equal(readyFile.status, "ready");
  await login("alice");
  assert.equal(
    (
      await db.query(
        "select status from public.walkthrough_files where id=$1",
        [f.id],
      )
    ).rows[0].status,
    "ready",
  );
});
test("anonymous sessions cannot manage customer records or enable themselves as owner", async () => {
  await ready;
  await login("bob", true);
  await assert.rejects(
    () =>
      rpc("api_create_booking", [
        JSON.stringify({
          name: "Guest",
          email: "guest@example.com",
          address: "123 Example Lane",
          service: "standard",
          space_id: 3,
          date: day(),
          arrival: "afternoon",
        }),
        "ffffffff-ffff-4fff-8fff-ffffffffffff",
      ]),
    /Guest checkout/,
  );
  assert.equal(await rpc("is_owner", []), false);
  await db.close();
});
