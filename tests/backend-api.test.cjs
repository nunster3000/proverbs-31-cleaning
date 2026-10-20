const { test } = require("node:test"),
  assert = require("node:assert/strict");
const {
  createHandler,
  signatureMatches,
} = require("../cinematic-preview/server/api.cjs");
const env = {
  BACKEND_ENABLED: "true",
  AUTH_ENABLED: "true",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "public-key",
  SUPABASE_SERVICE_ROLE_KEY: "never-public-secret",
  APP_ORIGIN: "https://example.com",
};
async function call(
  handler,
  {
    url = "/api/app?route=config",
    method = "GET",
    body = {},
    token,
    origin,
  } = {},
) {
  let value;
  const headers = {};
  await handler(
    {
      url,
      method,
      body,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: "Bearer " + token } : {}),
        ...(origin ? { origin } : {}),
      },
    },
    {
      setHeader: (k, v) => (headers[k] = v),
      end: (s) => (value = JSON.parse(s)),
      set statusCode(v) {
        this.code = v;
      },
      get statusCode() {
        return this.code;
      },
    },
  );
  return { value, headers };
}
test("disabled backend exposes neither keys nor live services", async () => {
  const h = createHandler({ env: { ...env, BACKEND_ENABLED: "false" } });
  assert.deepEqual((await call(h)).value, {
    enabled: false,
    authEnabled: false,
    siteMode: "launch",
    url: null,
    key: null,
    turnstileSiteKey: null,
    guestEnabled: false,
  });
  assert.match(
    (await call(h, { url: "/api/app?route=bookings" })).value.error,
    /not been configured/,
  );
});
test("public configuration never returns the service-role key", async () => {
  const result = (await call(createHandler({ env }))).value;
  assert.equal(result.enabled, true);
  assert.equal(result.key, "public-key");
  assert.ok(!JSON.stringify(result).includes("never-public-secret"));
});
test("protected requests require a verified session and do not trust caller-provided roles", async () => {
  let called = 0;
  const factory = () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: "user",
            email_confirmed_at: "2026-01-01",
            is_anonymous: false,
          },
        },
      }),
    },
    rpc: async () => ({ data: false, error: null }),
    from: () => {
      called++;
      throw Error("Should not read owner tables");
    },
  });
  const h = createHandler({ env, clientFactory: factory });
  assert.equal(
    (
      await call(h, {
        url: "/api/app?route=customers",
        token: "valid",
        body: { role: "owner" },
      })
    ).value.error,
    "Owner access required",
  );
  assert.equal(
    (
      await call(h, {
        url: "/api/app?route=calendar&month=2026-10",
        token: "valid",
      })
    ).value.error,
    "Owner access required",
  );
  assert.equal((await call(h, {url:"/api/app?route=pricing", method:"POST", token:"valid", body:{kind:"space",id:"3",cents:1,expected_cents:11000,role:"owner"}})).value.error, "Owner access required");
  assert.equal((await call(h,{url:"/api/app?route=notification-preview&id=11111111-1111-4111-8111-111111111111",token:"valid"})).value.error,"Owner access required");
  assert.equal(called, 0);
  assert.match(
    (await call(h, { url: "/api/app?route=bookings" })).value.error,
    /Sign in/,
  );
  assert.equal(
    (
      await call(h, {
        url: "/api/app?route=action",
        method: "POST",
        token: "valid",
        body: {
          id: "11111111-1111-4111-8111-111111111111",
          action: "record_payment",
          role: "owner",
        },
      })
    ).value.error,
    "Owner access required",
  );
});
test("cross-origin mutations are rejected before contacting the database", async () => {
  const h = createHandler({
    env,
    clientFactory: () => {
      throw Error("Unexpected database access");
    },
  });
  assert.equal(
    (
      await call(h, {
        url: "/api/app?route=quote",
        method: "POST",
        origin: "https://attacker.example",
      })
    ).value.error,
    "Origin not allowed",
  );
});
test("file validation rejects a script disguised as a supported image", () => {
  assert.equal(
    signatureMatches("image/png", Buffer.from("<script>alert(1)</script>")),
    false,
  );
  assert.equal(
    signatureMatches(
      "image/png",
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ),
    true,
  );
  assert.equal(
    signatureMatches("image/jpeg", Buffer.from([255, 216, 255, 224])),
    true,
  );
  assert.equal(signatureMatches("image/svg+xml", Buffer.from("<svg/>")), false);
});
test("only the backend can finalize a reserved upload, after validating its content", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  let finished = 0;
  const user = { id, email_confirmed_at: "2026-01-01", is_anonymous: false };
  const factory = (_url, key) =>
    key === env.SUPABASE_SERVICE_ROLE_KEY
      ? {
          storage: {
            from: () => ({
              createSignedUrl: async () => ({
                data: { signedUrl: "https://storage.example/file" },
              }),
            }),
          },
          rpc: async (name, args) => {
            assert.equal(name, "api_upload_finish");
            assert.equal(args.p_actor, id);
            finished++;
            return { data: { status: "ready" } };
          },
        }
      : {
          auth: { getUser: async () => ({ data: { user } }) },
          rpc: async () => ({ data: false }),
          from: () => ({
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id,
                    path: "booking/file",
                    status: "pending",
                    mime: "image/png",
                  },
                }),
              }),
            }),
          }),
          storage: {
            from: () => {
              throw Error("Pending file must be read server-side");
            },
          },
        };
  const request = {
    url: "/api/app?route=upload-finish",
    method: "POST",
    token: "valid",
    body: { id, p_actor: "forged-owner" },
  };
  let handler = createHandler({
    env,
    clientFactory: factory,
    fetchFile: async () => ({
      ok: true,
      arrayBuffer: async () => Buffer.from("<script/>"),
    }),
  });
  assert.match((await call(handler, request)).value.error, /does not match/);
  assert.equal(finished, 0);
  handler = createHandler({
    env,
    clientFactory: factory,
    fetchFile: async () => ({
      ok: true,
      arrayBuffer: async () => Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    }),
  });
  assert.equal((await call(handler, request)).value.status, "ready");
  assert.equal(finished, 1);
});

test("launch preparation never advertises demo mode when Supabase is not connected", async () => {
  const result = (
    await call(
      createHandler({
        env: { ...env, BACKEND_ENABLED: "false", SITE_MODE: "launch" },
      }),
    )
  ).value;
  assert.equal(result.siteMode, "launch");
  assert.equal(result.enabled, false);
  assert.equal(result.key, null);
  assert.equal(result.url, null);
});

test("connected database can serve its catalog while authenticated operations remain disabled", async () => {
 const h=createHandler({env:{...env,AUTH_ENABLED:"false"}});
 const config=(await call(h)).value;
 assert.equal(config.enabled,true);assert.equal(config.authEnabled,false);assert.equal(config.guestEnabled,false);
 for(const route of ['me','bookings','owner-state','pricing']) {
  const result=await call(h,{url:'/api/app?route='+route,method:'POST',token:'valid'});
  assert.match(result.value.error,/not enabled yet/);
 }
});

test('private previews reject unverified uploads and verification failures never finalize them',async()=>{
 const id='11111111-1111-4111-8111-111111111111';let finished=0,signed=0;
 const user={id,email_confirmed_at:'2026-01-01',is_anonymous:false};
 const factory=(_url,key)=>key===env.SUPABASE_SERVICE_ROLE_KEY?{storage:{from:()=>({createSignedUrl:async()=>{signed++;return{data:{signedUrl:'https://storage.example/private'}}}})},rpc:async()=>{finished++;return{data:{status:'ready'}}}}:{auth:{getUser:async()=>({data:{user}})},rpc:async()=>({data:false}),from:()=>({select:()=>({eq:()=>({single:async()=>({data:{id,path:'booking/private',status:'pending',mime:'video/mp4'}})})})})};
 let h=createHandler({env,clientFactory:factory,fetchFile:async()=>({ok:false})});
 assert.match((await call(h,{url:'/api/app?route=file&id='+id,token:'valid'})).value.error,/pending/);assert.equal(signed,0);
 assert.match((await call(h,{url:'/api/app?route=upload-finish',method:'POST',token:'valid',body:{id}})).value.error,/Unable to verify/);assert.equal(finished,0);
 h=createHandler({env,clientFactory:factory,fetchFile:async()=>{throw Error('Transfer timed out')}});assert.ok((await call(h,{url:'/api/app?route=upload-finish',method:'POST',token:'valid',body:{id}})).value.error);assert.equal(finished,0);
 h=createHandler({env,clientFactory:factory,fetchFile:async()=>({ok:true,arrayBuffer:async()=>Buffer.from('not a video')})});assert.match((await call(h,{url:'/api/app?route=upload-finish',method:'POST',token:'valid',body:{id}})).value.error,/does not match/);assert.equal(finished,0);
});
