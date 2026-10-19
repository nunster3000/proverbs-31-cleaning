// Connect the existing cinematic booking interactions to the owner-approved catalog.
const extrasBox = document.querySelector('#booking-extras');
P31.addons.forEach(extra => {
  const label = document.createElement('label'); label.className = 'extra-choice';
  const input = document.createElement('input'); input.id = 'extra-' + extra.id;
  if (extra.id === 'laundry') { input.type = 'number'; input.min = 0; input.max = 20; input.step = 1; input.value = 0; input.setAttribute('aria-label', 'Laundry loads'); }
  else input.type = 'checkbox';
  const text = document.createElement('span'); text.textContent = extra.label + ' · ' + P31.money(extra.price) + (extra.id === 'laundry' ? ' / load' : '');
  const small = document.createElement('small'); small.textContent = extra.detail; text.append(small); label.append(input, text); extrasBox.append(label);
  input.addEventListener('change', () => { if (extra.id === 'laundry') input.value = Math.max(0, Math.min(20, Math.floor(Number(input.value) || 0))); refreshPricing(); });
});
function refreshPricing() {
  const q = bookingQuote();
  document.querySelector('#scope-price').textContent = '$' + q.total + '*';
  P31.addons.filter(a => a.id !== 'laundry').forEach(a => {
    const input = document.querySelector('#extra-' + a.id); input.disabled = q.included.includes(a.id);
    input.closest('label').querySelector('span').firstChild.nodeValue = a.label + (input.disabled ? ' · Included' : ' · ' + money(a.price));
    input.closest('label').querySelector('small').textContent = input.disabled ? 'Included in your selected deep-cleaning care · no additional charge' : a.detail;
  });
  const included = document.querySelector('#included-care'); included.hidden = !q.included.length;
  included.textContent = q.included.includes('fridge')
    ? 'Baseboards, refrigerator, and stove / oven care are included in this Deep Cleaning selection. No separate add-on charges apply to these items.'
    : 'Baseboard cleaning is included with Deep Cleaning. Select Kitchen as a focus room to include refrigerator and stove / oven care, too.';
  const service = document.querySelector('input[name=care]:checked').value;
  const list = document.querySelector('#care-inclusions-list'); list.replaceChildren();
  P31.includedCare(service, { mode: document.querySelector('#booking-apartment-service').value, focus: [...selected] }).forEach(text => {
    const li = document.createElement('li'); li.textContent = text; list.append(li);
  });
  document.querySelector('#care-inclusions-note').textContent = service === 'Deep Cleaning'
    ? 'For detailed appliance care, select Kitchen on the floor plan. Refrigerator and stove / oven cleaning will then be included in your starting estimate.'
    : service === 'Apartment Cleaning'
    ? 'The apartment must be empty for both Move-In and Move-Out cleaning. Laundry and detailed appliance or baseboard care are optional additions.'
    : service === 'Airbnb Turnover'
    ? 'Your package covers the selected guest suite. Laundry is optional and charged per load, including folding and hanging.'
    : 'Laundry and detailed refrigerator, stove / oven, and baseboard cleaning are available as optional additions.';
  document.querySelector('#room-focus-explanation').textContent = service === 'Deep Cleaning'
    ? 'Select rooms needing extra attention. Kitchen focus includes refrigerator and stove / oven cleaning; the rest of your selected home remains part of the service.'
    : 'Select rooms needing extra attention. These preferences do not remove other rooms from your selected cleaning package.';
  const box = document.querySelector('#live-quote-lines');
  box.replaceChildren();
  [['Starting service price', q.base], ...q.lines.filter(a => !a.included).map(a => [a.label + (a.id === 'laundry' ? ' × ' + a.quantity : ''), a.amount]), ['Booking deposit · 50% of starting service', q.deposit]].forEach(([label, amount]) => {
    const row = document.createElement('div'), key = document.createElement('span'), value = document.createElement('span'); key.textContent = label; value.textContent = money(amount); row.append(key, value); box.append(row);
  });
}
function syncServiceSpace() {
  const service = document.querySelector('input[name=care]:checked').value, airbnb = service === 'Airbnb Turnover';
  const picker = document.querySelector('#scope');
  picker.replaceChildren();
  [3, 0, 1, 2, 4, 5, 6, 7].filter(id => airbnb === !!P31.spaces[id].suite).forEach(id => {
    const p = P31.spaces[id], option = document.createElement('option'); option.value = id;
    option.textContent = p.label + ' · starting $' + (p.price + (service === 'Deep Cleaning' ? 100 : 0)) + '*'; picker.append(option);
  });
  picker.value = airbnb === (currentScope < 2) ? String(currentScope) : airbnb ? '0' : '3';
  if (airbnb !== (currentScope < 2)) { document.querySelector('#scope').value = airbnb ? '0' : '3'; loadScope(); }
  document.querySelector('#booking-apartment-mode').hidden = service !== 'Apartment Cleaning';
  document.querySelector('#care-description').textContent = P31.descriptions[service];
  refreshPricing();
}
const liveLines = document.createElement('div'); liveLines.className = 'quote-lines'; liveLines.id = 'live-quote-lines';
document.querySelector('.summary').insertBefore(liveLines, document.querySelector('#next'));
const disclaimer = document.createElement('p'); disclaimer.className = 'price-disclaimer';
disclaimer.textContent = '*Starting estimate only. Final pricing is confirmed after reviewing your space. The 50% deposit is based on the starting service price; add-ons are separate.';
document.querySelector('#care').append(disclaimer);
const oldSync = sync; sync = function () { oldSync(); refreshPricing(); };
const oldScope = drawScope; drawScope = function () { oldScope(); refreshPricing(); };
// Existing direct callback must point to the wrapper as well.
document.querySelectorAll('input[name=care]').forEach(input => input.onchange = () => { syncServiceSpace(); spark(rooms.includes('Kitchen') ? 'Kitchen' : rooms[0]); });
const params = new URLSearchParams(location.search);
if (params.get('type') === 'Move-In / Move-Out') document.querySelector('input[name=care][value="Apartment Cleaning"]').checked = true;
if (['0','1'].includes(params.get('space')) && !P31.services.includes(params.get('type'))) document.querySelector('input[name=care][value="Airbnb Turnover"]').checked = true;
if (params.get('mode') === 'Move-Out') document.querySelector('#booking-apartment-service').value = 'Move-Out';
document.querySelector('#booking-apartment-service').onchange = refreshPricing;
syncServiceSpace();
// The expanded estimate remains visible only while choosing care.
const previousRender = render; render = function () { previousRender(); liveLines.hidden = stage !== 0; };
const walkthrough = document.createElement('p'); walkthrough.className = 'virtual-callout';
walkthrough.textContent = 'Next, in your customer portal: add photos and/or videos for a virtual walkthrough so the company can confirm your final price before the visit.';
document.querySelector('#review-content').parentElement.append(walkthrough);
document.querySelector('#extra-laundry').addEventListener('input', refreshPricing);
const previousFillReview = fillReview;
fillReview = function () {
  previousFillReview();
  const q = bookingQuote();
  ['review-total', 'payment-total'].forEach(id => document.getElementById(id).textContent = money(q.total) + '*');
  document.querySelectorAll('.quote-card>.fine').forEach(p => { p.textContent = '*Starting estimate, not a final quote. Final pricing follows walkthrough review. Your deposit is 50% of the starting service price, before add-ons.'; });
  document.querySelectorAll('.quote-card .gold-note').forEach(p => { p.textContent = 'Your starting-price deposit is credited toward the final service total.'; });
  ['review-total','payment-total'].forEach(id => {
    const card = document.getElementById(id).closest('.quote-card');
    let details = card.querySelector('.estimate-breakdown');
    if (!details) { details = document.createElement('div'); details.className = 'quote-lines estimate-breakdown'; card.insertBefore(details, card.querySelector('dl')); }
    details.replaceChildren();
    [['Starting service', q.base], ...q.lines.filter(a => !a.included).map(a => [a.label + (a.id === 'laundry' ? ' × ' + a.quantity : ''), a.amount])].forEach(([label, amount]) => {
      const row = document.createElement('div'), key = document.createElement('span'), value = document.createElement('span'); key.textContent = label; value.textContent = money(amount); row.append(key, value); details.append(row);
    });
  });
};
