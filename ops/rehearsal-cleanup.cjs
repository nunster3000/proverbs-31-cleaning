// Removes only ledger-tracked rehearsal storage; prepares exact-ID SQL for operator review.
const fs=require('node:fs');
const {createClient}=require('../cinematic-preview/node_modules/@supabase/supabase-js');
const valid=x=>typeof x==='string'&&/^[a-f0-9-]{36}$/i.test(x);
function cleanupSql(ledger){
 for(const id of [...ledger.bookings,...ledger.customers])if(!valid(id))throw Error('Invalid fixture ID');
 const ids=ledger.bookings.length?ledger.bookings.map(x=>"'"+x+"'::uuid").join(','):"'00000000-0000-0000-0000-000000000000'::uuid";
 const customerIds=ledger.customers.filter(id=>!ledger.beforeCustomers.includes(id));
 let sql=`begin;\nset local lock_timeout='3s';\n`;
 sql+=`delete from private.admin_notice_reads where event_id in(select id from public.audit_events where booking_id in(${ids}));\n`;
 sql+=`delete from private.customer_notice_reads where event_id in(select id from public.audit_events where booking_id in(${ids}));\n`;
 for(const table of ['private.guest_booking_access','public.notification_outbox','public.access_signatures','public.quote_adjustments','public.payment_records','public.booking_requests','public.walkthrough_files','public.owner_notes','public.audit_events'])sql+=`delete from ${table} where booking_id in(${ids});\n`;
 sql+=`delete from public.bookings where id in(${ids});\n`;
 for(const id of customerIds)sql+=`delete from public.customers where id='${id}'::uuid and not exists(select 1 from public.bookings where customer_id='${id}'::uuid);\n`;
 if(ledger.date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(ledger.date))throw Error('Invalid date');
  if(ledger.calendar){const windows=ledger.calendar.windows;if(!windows.every(w=>/^[0-9:-]+$/.test(w)))throw Error('Invalid previous calendar window');sql+=`update public.calendar_days set windows=array[${windows.map(w=>"'"+w+"'").join(',')}]::text[] where visit_date='${ledger.date}';\n`;}
  else sql+=`delete from public.calendar_days where visit_date='${ledger.date}' and not exists(select 1 from public.bookings where visit_date='${ledger.date}');\n`;
 }
 sql+=`delete from private.owner_accounts where user_id in(select id from auth.users where lower(email)='khris.nun@proverbs31cleaningcoservices.info');\n`;
 sql+=`select jsonb_build_object('remaining_fixture_bookings',(select count(*) from public.bookings where id in(${ids})),'remaining_fixture_uploads',(select count(*) from public.walkthrough_files where booking_id in(${ids})),'remaining_fixture_emails',(select count(*) from public.notification_outbox where booking_id in(${ids})),'owner_emails',(select jsonb_agg(u.email) from private.owner_accounts o join auth.users u on u.id=o.user_id)) as cleanup_result;\ncommit;\n`;
 return sql;
}
async function run(){
 const ledger=JSON.parse(fs.readFileSync('/tmp/p31-rehearsal-ledger.json','utf8'));
 const service=createClient('https://mokhzraxcbrmzpvedhxz.supabase.co',fs.readFileSync('/tmp/p31-rehearsal-server-key','utf8').trim(),{auth:{persistSession:false,autoRefreshToken:false}});
 if(ledger.files.length){
  // Derive all paths again from the recorded booking IDs, never delete arbitrary ledger paths.
  const rows=await service.from('walkthrough_files').select('path').in('booking_id',ledger.bookings);if(rows.error)throw rows.error;
  const paths=rows.data.map(r=>r.path);if(paths.length){const removed=await service.storage.from('walkthroughs').remove(paths);if(removed.error)throw removed.error;}
 }
 fs.writeFileSync('/tmp/p31-rehearsal-cleanup.sql',cleanupSql(ledger),{mode:0o600});
 console.log('Rehearsal bytes removed; exact-ID SQL cleanup prepared. Run it before enabling notifications.');
}
module.exports={cleanupSql};if(require.main===module)run().catch(()=>{console.error('Cleanup stopped; inspect the private ledger and do not enable notifications.');process.exitCode=1;});
