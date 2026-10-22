const {test}=require('node:test');
const assert=require('node:assert/strict');
const {bookingDate}=require('./helpers/booking-date.cjs');
test('booking fixtures use the Eastern business date after UTC midnight and skip closed Sundays',()=>{
  const evening=new Date('2026-10-22T01:24:00Z');
  assert.equal(bookingDate(3,evening),'2026-10-24');
  assert.equal(bookingDate(4,evening),'2026-10-26');
  assert.equal(bookingDate(10,evening),'2026-10-31');
});
test('Eastern booking dates stay consistent through spring and fall daylight saving changes',()=>{
  assert.equal(bookingDate(1,new Date('2026-03-08T04:30:00Z')),'2026-03-09');
  assert.equal(bookingDate(1,new Date('2026-11-01T03:30:00Z')),'2026-11-02');
});
