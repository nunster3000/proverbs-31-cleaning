const { test, after } = require("node:test");
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
  wasmModule: new WebAssembly.Module(
    fs.readFileSync(
      "cinematic-preview/node_modules/@electric-sql/pglite/dist/pglite.wasm",
    ),
  ),
  fsBundle: new Blob([
    fs.readFileSync(
      "cinematic-preview/node_modules/@electric-sql/pglite/dist/pglite.data",
    ),
  ]),
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
  await db.exec(fs.readFileSync("cinematic-preview/supabase/migrations/002_owner_pricing.sql", "utf8"));
  await db.exec(fs.readFileSync("cinematic-preview/supabase/migrations/003_manual_bookings_progress.sql", "utf8"));
  await db.exec(fs.readFileSync("cinematic-preview/supabase/migrations/004_booking_milestones.sql", "utf8"));
  await db.exec(fs.readFileSync("cinematic-preview/supabase/migrations/005_late_completion_evidence.sql", "utf8"));
  await db.exec(fs.readFileSync("cinematic-preview/supabase/migrations/006_admin_attention.sql", "utf8"));
  await db.exec(fs.readFileSync("cinematic-preview/supabase/migrations/007_customer_attention.sql", "utf8"));
  await db.exec(fs.readFileSync("cinematic-preview/supabase/migrations/008_change_request_review.sql", "utf8"));
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
  await db.exec('reset role');
  await db.query("insert into public.walkthrough_files(booking_id,uploader_id,path,filename,mime,bytes,room,status) values($1,$2,$3,'room.png','image/png',100,'Kitchen','ready')",[booking.id,ids.alice,booking.id+'/test-evidence']);
  await login('owner');
  await rpc('api_booking_action',[booking.id,'record_payment',JSON.stringify({kind:'deposit',cents:10500,method:'Cash'}),'dddddddd-dddd-4ddd-8ddd-dddddddddddd']);
  await rpc('api_booking_action',[booking.id,'approve_booking','{}',null]);
  await rpc('api_booking_action',[booking.id,'status',JSON.stringify({status:'on_the_way'}),null]);
  await rpc('api_booking_action',[booking.id,'status',JSON.stringify({status:'in_progress'}),null]);
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
});

test("Proverbs 31 Cal blocks custom hours across a week atomically and protects existing visits", async () => {
  await ready;
  const d = new Date(day() + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 120);
  while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  const first = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  const through = d.toISOString().slice(0, 10);
  await login("alice");
  await assert.rejects(
    () =>
      rpc("api_owner_schedule", [
        "block",
        JSON.stringify({ date: first, through, reason: "Away" }),
      ]),
    /Owner/,
  );
  await login("owner");
  await rpc("api_owner_schedule", [
    "block",
    JSON.stringify({
      date: first,
      through,
      start_time: "09:30",
      end_time: "10:30",
      reason: "Weekly personal time",
    }),
  ]);
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from public.time_blocks where visit_date between $1 and $2",
        [first, through],
      )
    ).rows[0].n,
    7,
  );
  const available = await rpc("api_availability", [first, 1]);
  assert.equal(available[0].morning, false);
  assert.equal(available[0].afternoon, true);
  await assert.rejects(
    () =>
      rpc("api_owner_schedule", [
        "block",
        JSON.stringify({
          date: first,
          through,
          start_time: "12:00",
          end_time: "09:00",
          reason: "Invalid",
        }),
      ]),
    /valid/,
  );
  await rpc("api_create_booking", [
    JSON.stringify({
      name: "Calendar client",
      email: "calendar@example.com",
      address: "Example address",
      service: "standard",
      space_id: 3,
      date: first,
      arrival: "afternoon",
    }),
    "dddddddd-dddd-4ddd-8ddd-ddddddddddda",
  ]);
  await assert.rejects(
    () =>
      rpc("api_owner_schedule", [
        "block",
        JSON.stringify({ date: first, through, reason: "Whole week" }),
      ]),
    /Nothing was changed/,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from public.time_blocks where visit_date between $1 and $2",
        [first, through],
      )
    ).rows[0].n,
    7,
  );
});

after(async () => {
  await ready;
  await db.close();
});

test("date-specific 2/3-hour openings control customer availability and preserve occupied time after a pattern change", async () => {
  await ready;
  const d = new Date(day() + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 180);
  while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  const date = d.toISOString().slice(0, 10);
  await login("alice");
  await assert.rejects(
    () =>
      rpc("api_owner_schedule", [
        "day_windows",
        JSON.stringify({ date, windows: ["09:00-11:00"] }),
      ]),
    /Owner/,
  );
  await login("owner");
  const save = (windows) =>
    rpc("api_owner_schedule", [
      "day_windows",
      JSON.stringify({ date, windows }),
    ]);
  await save(["09:00-11:00", "11:00-13:00", "15:00-17:00"]);
  let slots = (await rpc("api_availability", [date, 1]))[0].slots;
  assert.equal(slots.length, 3);
  assert.ok(slots.every((s) => s.available));
  await assert.rejects(
    () => save(["09:00-12:00", "11:00-13:00"]),
    /nonoverlapping/,
  );
  await assert.rejects(() => save(["09:00-10:00"]), /nonoverlapping/);
  await login("alice");
  const made = await rpc("api_create_booking", [
    JSON.stringify({
      name: "Alice",
      address: "Example",
      service: "standard",
      space_id: 3,
      date,
      arrival: "11:00-13:00",
    }),
    "dddddddd-dddd-4ddd-8ddd-dddddddddddb",
  ]);
  assert.equal(made[0].arrival, "11:00-13:00");
  assert.equal(
    (await db.query("select * from public.calendar_days")).rows.length,
    0,
  );
  await login("owner");
  await save(["09:00-12:00", "12:00-15:00", "15:00-18:00"]);
  slots = (await rpc("api_availability", [date, 1]))[0].slots;
  assert.deepEqual(
    slots.map((s) => s.available),
    [false, false, true],
  );
  assert.equal(
    (
      await db.query("select arrival from public.bookings where id=$1", [
        made[0].id,
      ])
    ).rows[0].arrival,
    "11:00-13:00",
  );
  await save([]);
  assert.deepEqual((await rpc("api_availability", [date, 1]))[0].slots, []);
});


test("only owners can change catalog prices, stale edits are rejected, and saved bookings remain unchanged", async () => {
  await ready;
  await login("alice");
  await assert.rejects(rpc("api_owner_price", ["space", "3", 12500, 11000]), /Owner access/);
  await login("owner");
  const before = (await db.query("select quote_snapshot from public.bookings where id=$1", [booking.id])).rows[0].quote_snapshot;
  await rpc("api_owner_price", ["space", "3", 12500, 11000]);
  await rpc("api_owner_price", ["deep", "deep", 12000, 10000]);
  await rpc("api_owner_price", ["addon", "laundry", 2500, 2000]);
  const quote = await rpc("api_quote", ["deep", 3, '["Kitchen"]', '{"laundry":2}']);
  assert.equal(quote.base_cents,24500);assert.equal(quote.total_cents,29500);assert.equal(quote.deposit_cents,12250);
  await assert.rejects(rpc("api_owner_price", ["space", "3", 13000, 11000]), /changed since/);
  await assert.rejects(rpc("api_owner_price", ["addon", "laundry", -1, 2500]), /valid price/);
  await assert.rejects(rpc("api_owner_price", ["space", "3", 0, 12500]), /greater than zero/);
  const after = (await db.query("select quote_snapshot from public.bookings where id=$1", [booking.id])).rows[0].quote_snapshot;
  assert.deepEqual(after,before);
  const events = (await db.query("select details from public.audit_events where action='pricing_changed'")).rows;
  assert.equal(events.length,3);assert.equal(events[0].details.old_cents,11000);
  await login("alice");
  await assert.rejects(db.query("update public.service_spaces set base_cents=1 where id=3"), /permission denied/);
});

test('manual prices are owner-only, approval is explicit, and five visit stages persist', async()=>{
 await ready;
 const future=new Date();future.setDate(future.getDate()+50);const d=future.toISOString().slice(0,10);
 const payload={first_name:'Jamie',last_name:'Taylor',name:'Jamie Taylor',email:'jamie@example.com',address:'45 Sample Road',service:'standard',space_id:3,date:d,arrival:'morning',manual_price_cents:18500,pricing_status:'awaiting_approval',pricing_notes:'Reviewed rooms by phone.'};
 await login('alice');
 await assert.rejects(()=>rpc('api_create_booking',[JSON.stringify(payload),crypto.randomUUID()]),/Owner access required/);
 await login('owner');
 await rpc('api_owner_schedule',['day_windows',JSON.stringify({date:d,windows:['morning']})]);
 const made=await rpc('api_create_booking',[JSON.stringify(payload),crypto.randomUUID()]);
 const b=made[0];assert.equal(b.property.first_name,'Jamie');assert.equal(b.property.last_name,'Taylor');assert.equal(b.quote_snapshot.total_cents,18500);assert.equal(b.quote_snapshot.deposit_cents,9250);assert.equal(b.quote_status,'awaiting_approval');assert.equal(b.deposit_paid_cents,0);
 await assert.rejects(()=>rpc('api_booking_action',[b.id,'status',JSON.stringify({status:'completed'}),null]),/required/);
 await assert.rejects(()=>rpc('api_booking_action',[b.id,'external_approval','{}',null]),/approval notes/);
 await rpc('api_booking_action',[b.id,'external_approval',JSON.stringify({notes:'Customer approved the total by phone today.'}),null]);
 await rpc('api_booking_action',[b.id,'record_payment',JSON.stringify({kind:'deposit',cents:9250,method:'Cash'}),crypto.randomUUID()]);
 await rpc('api_booking_action',[b.id,'approve_booking','{}',null]);
 for(const status of ['confirmed','on_the_way','in_progress','completed']){const updated=await rpc('api_booking_action',[b.id,'status',JSON.stringify({status}),null]);assert.equal(updated.status,status);}
 await login('bob');await assert.rejects(()=>rpc('api_booking_action',[b.id,'status',JSON.stringify({status:'confirmed'}),null]));
});

test('deposit, walkthrough approval and verified completion uploads govern milestones',async()=>{
 await ready;await login('owner');const future=new Date();future.setDate(future.getDate()+55);const date=future.toISOString().slice(0,10);
 await rpc('api_owner_schedule',['day_windows',JSON.stringify({date,windows:['morning']})]);
 await login('alice');
 const [b]=await rpc('api_create_booking',[JSON.stringify({name:'Alice',address:'Sample home',service:'standard',space_id:3,date,arrival:'morning'}),crypto.randomUUID()]);
 const file={filename:'room.png',mime:'image/png',bytes:100,room:'Kitchen'};
 await assert.rejects(()=>rpc('api_upload_request',[b.id,JSON.stringify({...file,purpose:'completion'})]));
 const before=await rpc('api_upload_request',[b.id,JSON.stringify(file)]);
 await db.exec('reset role');await db.query("insert into storage.objects(bucket_id,name,metadata) values('walkthroughs',$1,$2)",[before.path,JSON.stringify({size:100,mimetype:'image/png'})]);
 await rpc('api_upload_finish',[before.id,ids.alice]);await login('owner');
 await rpc('api_booking_action',[b.id,'review',JSON.stringify({notes:'Room images reviewed.'}),null]);
 await assert.rejects(()=>rpc('api_booking_action',[b.id,'approve_booking','{}',null]),/Deposit/);
 const partial=await rpc('api_booking_action',[b.id,'record_payment',JSON.stringify({kind:'deposit',cents:100,method:'Cash'}),crypto.randomUUID()]);assert.equal(partial.status,'requested');
 const paid=await rpc('api_booking_action',[b.id,'record_payment',JSON.stringify({kind:'deposit',cents:b.quote_snapshot.deposit_cents-100,method:'Cash'}),crypto.randomUUID()]);assert.equal(paid.status,'awaiting_walkthrough');
 await assert.rejects(()=>rpc('api_booking_action',[b.id,'status',JSON.stringify({status:'confirmed'}),null]),/approved walkthrough/);
 const confirmed=await rpc('api_booking_action',[b.id,'approve_booking','{}',null]);assert.equal(confirmed.status,'confirmed');
 const prepared=await rpc('api_booking_action',[b.id,'prepare_quote','{}',null]);await login('alice');await rpc('api_booking_action',[b.id,'accept_quote',JSON.stringify({revision:prepared.revision}),null]);await login('owner');
 await assert.rejects(()=>rpc('api_booking_action',[b.id,'status',JSON.stringify({status:'in_progress'}),null]),/in order/);
 await rpc('api_booking_action',[b.id,'status',JSON.stringify({status:'on_the_way'}),null]);await rpc('api_booking_action',[b.id,'status',JSON.stringify({status:'in_progress'}),null]);
 const after=await rpc('api_upload_request',[b.id,JSON.stringify({...file,purpose:'completion'})]);
 await db.exec('reset role');
 await assert.rejects(()=>rpc('api_upload_finish',[after.id,ids.owner]),/match its reservation/);
 assert.equal((await db.query('select status from public.bookings where id=$1',[b.id])).rows[0].status,'in_progress');
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('walkthroughs',$1,$2)",[after.path,JSON.stringify({size:100,mimetype:'image/png'})]);
 await rpc('api_upload_finish',[after.id,ids.owner]);await rpc('api_upload_finish',[after.id,ids.owner]);
 const completed=(await db.query('select * from public.bookings where id=$1',[b.id])).rows[0];assert.equal(completed.status,'completed');assert.equal(completed.quote_status,'accepted');assert.equal(completed.final_cents,prepared.final_cents);
 await login('owner');
 await rpc('api_booking_action',[b.id,'issue_invoice','{}',null]);
 const extra=await rpc('api_upload_request',[b.id,JSON.stringify({...file,purpose:'completion'})]);assert.equal(await rpc('walkthrough_access',[extra.path,true]),true);await login('alice');assert.equal(await rpc('walkthrough_access',[extra.path,true]),false);await db.exec('reset role');await db.query("insert into storage.objects(bucket_id,name,metadata) values('walkthroughs',$1,$2)",[extra.path,JSON.stringify({size:100,mimetype:'image/png'})]);await rpc('api_upload_finish',[extra.id,ids.owner]);
 assert.equal((await db.query('select invoice_issued from public.bookings where id=$1',[b.id])).rows[0].invoice_issued,true);
 assert.equal((await db.query("select count(*)::integer n from public.notification_outbox where booking_id=$1 and kind='service_completed'",[b.id])).rows[0].n,1);
});

test('admin badges persist reads, count review work per booking, and reject customer access',async()=>{
 await ready;await login('alice');await assert.rejects(()=>rpc('api_owner_attention',[[]]),/Owner access required/);
 await db.exec('reset role');
 const existing=(await db.query('select id from public.bookings order by created_at limit 1')).rows[0].id;
 await db.query("update public.bookings set status='awaiting_walkthrough',reviewed=false,quote_status='accepted',invoice_issued=false where id=$1",[existing]);
 await db.query("insert into public.walkthrough_files(booking_id,uploader_id,path,filename,mime,bytes,room,status) values($1,$2,$3,'badge.png','image/png',100,'Kitchen','ready')",[existing,ids.alice,existing+'/badge-test']);
 const make=async(action,details={})=>(await db.query('insert into public.audit_events(actor_id,booking_id,action,details) values($1,$2,$3,$4) returning id',[ids.alice,existing,action,JSON.stringify(details)])).rows[0].id;
 await make('booking_created',{source:'customer'});await make('walkthrough_uploaded');await make('walkthrough_uploaded');await make('accept_quote');
 await login('owner');const attention=await rpc('api_owner_attention',[[]]);
 assert.equal(attention.items.filter(i=>i.booking_id===existing && i.kind==='walkthrough').length,1);
 const notices=attention.items.filter(i=>i.booking_id===existing && i.kind!=='walkthrough');assert.ok(notices.some(i=>i.kind==='booking'));assert.ok(notices.some(i=>i.kind==='approval'));
 const read=await rpc('api_owner_attention',[notices.map(i=>i.id)]);assert.equal(read.items.filter(i=>i.booking_id===existing && i.kind!=='walkthrough').length,0);
 assert.equal((await rpc('api_owner_attention',[[]])).items.filter(i=>i.booking_id===existing && i.kind!=='walkthrough').length,0);
 await rpc('api_booking_action',[existing,'review',JSON.stringify({notes:'Reviewed badge test upload.'}),null]);assert.equal((await rpc('api_owner_attention',[[]])).items.filter(i=>i.booking_id===existing && i.kind==='walkthrough').length,0);
 await db.exec('reset role');await make('accept_quote');await login('owner');assert.ok((await rpc('api_owner_attention',[[]])).items.some(i=>i.booking_id===existing && i.kind==='approval'));
});

test('customer notices are private, review reads persist, and approval/payment tasks cannot be dismissed',async()=>{
 await ready;await db.exec('reset role');
 const b=(await db.query('select b.id from public.bookings b join public.customers c on c.id=b.customer_id where c.auth_user_id=$1 limit 1',[ids.alice])).rows[0];
 await db.query("update public.bookings set status='confirmed',reviewed=true,quote_status='awaiting_approval',final_cents=20000,deposit_paid_cents=5000,final_paid_cents=0,invoice_issued=false where id=$1",[b.id]);
 const event=(await db.query("insert into public.audit_events(actor_id,booking_id,action) values($1,$2,'review') returning id",[ids.owner,b.id])).rows[0].id;
 await login('alice',true);await assert.rejects(()=>rpc('api_customer_attention',[[]]),/Verified account/);
 await login('bob');assert.equal((await rpc('api_customer_attention',[[event]])).items.some(i=>i.booking_id===b.id),false);
 await login('alice');let notices=await rpc('api_customer_attention',[[]]);assert.ok(notices.items.some(i=>i.id===event && i.kind==='review'));assert.ok(notices.items.some(i=>i.booking_id===b.id && i.kind==='approval'));assert.equal(notices.items.some(i=>i.booking_id===b.id && i.kind==='payment'),false);
 notices=await rpc('api_customer_attention',[[event,b.id]]);assert.equal(notices.items.some(i=>i.id===event && i.kind==='review'),false);assert.ok(notices.items.some(i=>i.booking_id===b.id && i.kind==='approval'));
 assert.equal((await rpc('api_customer_attention',[[]])).items.some(i=>i.id===event),false);
 await db.exec('reset role');await db.query("update public.bookings set status='completed',quote_status='accepted',invoice_issued=true where id=$1",[b.id]);await login('alice');
 notices=await rpc('api_customer_attention',[[b.id]]);assert.equal(notices.items.some(i=>i.booking_id===b.id && i.kind==='approval'),false);assert.equal(notices.items.find(i=>i.booking_id===b.id && i.kind==='payment').amount_cents,15000);
 await db.exec('reset role');await db.query('update public.bookings set final_paid_cents=15000 where id=$1',[b.id]);await login('alice');assert.equal((await rpc('api_customer_attention',[[]])).items.some(i=>i.booking_id===b.id && i.kind==='payment'),false);
});

test('reschedule and cancellation require explicit admin review, preserve money, and notify both dashboards',async()=>{
 await ready;await db.exec('reset role');
 const b=(await db.query('select b.* from public.bookings b join public.customers c on c.id=b.customer_id where c.auth_user_id=$1 limit 1',[ids.alice])).rows[0];
 const dates=[90,91].map(offset=>{const d=new Date();d.setDate(d.getDate()+offset);return d.toISOString().slice(0,10)});
 await db.query("update public.bookings set status='confirmed',invoice_issued=false,reviewed=true,walkthrough_approved=true,quote_status='accepted',visit_date=$2,arrival='morning' where id=$1",[b.id,dates[0]]);
 await login('owner');for(const date of dates)await rpc('api_owner_schedule',['day_windows',JSON.stringify({date,windows:['morning']})]);
 const snapshot=async()=>{await db.exec('reset role');return(await db.query('select quote_snapshot,final_cents,deposit_paid_cents,final_paid_cents from public.bookings where id=$1',[b.id])).rows[0]};const money=await snapshot();
 const act=async(role,action,data)=>{await login(role);return rpc('api_booking_action',[b.id,action,JSON.stringify(data),null])};
 const pending=async()=>{await db.exec('reset role');return(await db.query('select * from public.booking_requests where booking_id=$1 and not resolved order by created_at desc',[b.id])).rows[0]};
 await act('alice','request_change',{kind:'reschedule',notes:'Please move my visit to the next day.'});let req=await pending();
 await assert.rejects(()=>act('alice','request_change',{kind:'reschedule',notes:'Duplicate'}),/already awaiting/);
 await login('owner');assert.ok((await rpc('api_owner_attention',[[]])).items.some(i=>i.id===req.id&&i.kind==='change'));
 await assert.rejects(()=>act('bob','review_request',{request_id:req.id,decision:'approved',notes:'Unauthorized'}));
 await assert.rejects(()=>act('owner','review_request',{request_id:req.id,decision:'approved',date:dates[1],arrival:'invalid',notes:'Unavailable'}));assert.ok(await pending());
 let changed=await act('owner','review_request',{request_id:req.id,decision:'approved',date:dates[1],arrival:'morning',notes:'Your new date is approved.'});assert.equal(changed.status,'confirmed');assert.equal(changed.visit_date,dates[1]);
 await login('alice');assert.ok((await rpc('api_availability',[dates[0],1]))[0].slots.some(s=>s.id==='morning'&&s.available));assert.equal((await rpc('api_availability',[dates[1],1]))[0].slots.some(s=>s.id==='morning'&&s.available),false);
 let notices=await rpc('api_customer_attention',[[]]);let updates=notices.items.filter(i=>i.booking_id===b.id&&i.kind==='change');assert.equal(updates.length,1);assert.equal((await rpc('api_customer_attention',[updates.map(i=>i.id)])).items.some(i=>i.kind==='change'&&i.booking_id===b.id),false);
 await act('alice','request_change',{kind:'cancel',notes:'Please cancel this visit.'});req=await pending();changed=await act('owner','review_request',{request_id:req.id,decision:'declined',notes:'Please contact us to discuss your request.'});assert.equal(changed.status,'confirmed');
 await act('alice','request_change',{kind:'cancel',notes:'We have discussed this; please cancel.'});req=await pending();changed=await act('owner','review_request',{request_id:req.id,decision:'approved',notes:'Cancellation approved; payment handling will be reviewed separately.'});assert.equal(changed.status,'cancelled');
 assert.deepEqual(await snapshot(),money);
 await login('owner');assert.equal((await rpc('api_owner_attention',[[]])).items.some(i=>i.booking_id===b.id),false);
 await login('alice');assert.ok((await rpc('api_availability',[dates[1],1]))[0].slots.some(s=>s.id==='morning'&&s.available));assert.equal((await rpc('api_customer_attention',[[]])).items.filter(i=>i.booking_id===b.id&&i.kind==='change').length,2);
 await login('bob');assert.equal((await rpc('api_customer_attention',[[]])).items.some(i=>i.booking_id===b.id),false);
 await act('owner','review_request',{request_id:req.id,decision:'approved',notes:'Repeated review'});await assert.rejects(()=>act('owner','review_request',{request_id:req.id,decision:'declined',notes:'Conflicting review'}),/already been reviewed/);
 assert.deepEqual(await snapshot(),money);
});
