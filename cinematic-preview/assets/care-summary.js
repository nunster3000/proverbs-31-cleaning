/* Shared customer-facing snapshot for review, portal, and walkthrough. */
window.P31.renderCareSummary = function (booking) {
  const node = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
  const section = node('section', undefined, 'care-summary');
  section.append(node('div', 'Your selected care', 'label'), node('h3', booking.care), node('p', booking.scope, 'care-summary-space'));
  section.append(node('h4', 'Included with your service'));
  const included = node('ul');
  const service = booking.serviceKey || booking.care.split(' · ')[0];
  const items = booking.includedCare || P31.includedCare(service, {mode: booking.apartmentMode, focus: booking.roomFocus || []});
  items.forEach(text => included.append(node('li', text)));
  section.append(included);
  if (booking.roomFocus?.length) section.append(node('p', 'Room focus: ' + booking.roomFocus.join(' · '), 'care-summary-focus'));
  const extras = (booking.extras || []).filter(extra => !extra.included && extra.quantity > 0);
  section.append(node('h4', 'Selected add-ons'));
  const dl = node('dl', undefined, 'care-summary-prices');
  function row(list, label, value, total = false) { const div = node('div', undefined, total ? 'summary-total' : ''); div.append(node('dt', label), node('dd', value)); list.append(div); }
  if (extras.length) {
    const list = node('dl', undefined, 'care-summary-prices');
    extras.forEach(extra => row(list, extra.label + (extra.id === 'laundry' ? ' · ' + extra.quantity + ' load' + (extra.quantity === 1 ? '' : 's') + ' at ' + P31.money(extra.price) + '/load' : ''), P31.money(extra.amount)));
    section.append(list);
  } else section.append(node('p', 'No optional add-ons selected.', 'care-summary-empty'));
  const covered = (booking.extras || []).filter(extra => extra.included);
  if (covered.length) section.append(node('p', covered.map(extra => extra.label).join(', ') + ': included in your service, with no additional charge.', 'included-care'));
  row(dl, 'Starting service price*', P31.money(booking.startingBase));
  row(dl, 'Selected add-ons', P31.money(extras.reduce((sum, extra) => sum + extra.amount, 0)));
  row(dl, 'Starting estimate*', P31.money(booking.price), true);
  row(dl, 'Booking deposit · 50% of starting service', P31.money(booking.deposit));
  section.append(dl, node('p', 'Final pricing pending virtual walkthrough review', 'care-summary-pending'), node('p', '*These are starting amounts, not a final quote. The company will review your room photos/videos and requested work before confirming final pricing. Your booking deposit is credited toward the final total.', 'price-disclaimer'));
  return section;
};
