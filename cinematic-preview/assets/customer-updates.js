function parseAccountDate(value) { const [y,m,d] = value.split('-').map(Number); return new Date(y,m-1,d); }
const activeBooking = journey?.demo ? journey : null;
const startingBase = activeBooking?.startingBase ?? 110;
const estimate = activeBooking?.price ?? 110;
const bookingDeposit = activeBooking?.deposit ?? startingBase / 2;
document.querySelector('#walkthrough-estimate').textContent = 'Starting service: ' + P31.money(startingBase) + '*. Current estimate with selected add-ons: ' + P31.money(estimate) + '*. Starting-price deposit: ' + P31.money(bookingDeposit) + '.';
if (activeBooking) {
  const id = activeBooking.scopeId ?? P31.spaces.findIndex(s => s.label === activeBooking.scope);
  document.querySelectorAll('a[href^="care.html"]').forEach(a => { if (id >= 0) a.href = 'care.html?' + new URLSearchParams({space: id, type: activeBooking.care.split(' · ')[0], mode: activeBooking.apartmentMode || 'Move-In'}); });
  const payment = document.querySelector('#payments .payment-invoice');
  document.querySelector('#invoice-date').textContent = (activeBooking.date ? day(parseAccountDate(activeBooking.date)) : 'Date pending') + ' · ' + activeBooking.scope;
  payment.querySelector('h3').textContent = activeBooking.care;
  payment.querySelector('.eyebrow').textContent = 'Your booking · Starting estimate';
  const dl = payment.querySelector('.invoice-lines'); dl.replaceChildren();
  function row(label, value) { const div = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value; div.append(dt, dd); dl.append(div); }
  row('Starting service price*', P31.money(startingBase));
  (activeBooking.extras || []).forEach(extra => row(extra.label + (extra.id === 'laundry' ? ' × ' + extra.quantity : ''), extra.included ? 'Included' : P31.money(extra.amount)));
  row('Current starting estimate*', P31.money(estimate));
  row('Booking deposit · simulated', '−' + P31.money(bookingDeposit));
  row('Estimated remainder*', P31.money(estimate - bookingDeposit));
  payment.querySelector('#invoice-status').textContent = 'Awaiting walkthrough review';
  payment.querySelector('#balance-amount').textContent = 'Not issued';
  payment.querySelector('.balance-card>.fine').textContent = 'Your final balance will be issued after the company reviews your walkthrough and confirms pricing. No payment is due through this demo.';
  payment.querySelector('.invoice-lines + .fine').textContent = '*Starting amounts only. Home condition and requested work may change the total. No final price or invoice has been issued.';
  const pay = document.querySelector('#pay-final'); pay.disabled = true; pay.textContent = 'Awaiting final price'; pay.onclick = null;
}
document.querySelectorAll('[data-action=receipt]').forEach(button => button.onclick = () => {
  const box = modal('Starting-price payment preview'); box.className = 'receipt';
  const note = document.createElement('p'); note.textContent = 'Demo only. No payment was collected and no receipt was issued.';
  const summary = document.createElement('p'); summary.textContent = 'Starting service: ' + P31.money(startingBase) + '* · Estimate: ' + P31.money(estimate) + '* · Simulated deposit: ' + P31.money(bookingDeposit) + '. Final pricing awaits walkthrough review.';
  box.append(note, summary);
});
if (new URLSearchParams(location.search).get('view') === 'walkthrough') tab('walkthrough');
