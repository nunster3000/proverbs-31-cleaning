(async () => {
const pricingNote = document.querySelector('#type-note');
try {
  await P31.loadCatalog();
} catch {
  pricingNote.setAttribute('role', 'alert');
  pricingNote.textContent = 'Service pricing is temporarily unavailable. Please contact the company for a starting estimate.';
  document.querySelectorAll('.service .price,.extra-card .amount').forEach(node => node.hidden = true);
  document.querySelectorAll('.service [data-scope]').forEach(link => { link.href = 'contact.html'; link.textContent = 'Ask about this service'; });
  return;
}
const params = new URLSearchParams(location.search);
let type = params.get('type');
if (type === 'Move-In / Move-Out') type = 'Apartment Cleaning';
if (!P31.services.includes(type)) type = P31.services[0];
const mode = document.querySelector('#apartment-service');
if (params.get('mode') === 'Move-Out') mode.value = 'Move-Out';
const group = document.querySelector('.types');
P31.services.forEach(service => {
  const b = document.createElement('button'); b.type = 'button'; b.dataset.type = service; b.textContent = service;
  b.onclick = () => { type = service; update(); }; group.append(b);
});
P31.addons.forEach(extra => {
  const card = document.createElement('article'); card.className = 'extra-card';
  const name = document.createElement('strong'); name.textContent = extra.label;
  const amount = document.createElement('p'); amount.className = 'amount'; amount.textContent = P31.money(extra.price) + (extra.id === 'laundry' ? ' / load' : '');
  const detail = document.createElement('p'); detail.textContent = extra.detail;
  card.append(name, amount, detail); document.querySelector('#service-extras').append(card);
});
function update() {
  group.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.type === type));
  document.querySelector('#service-title').textContent = type;
  document.querySelector('#service-description').textContent = P31.descriptions[type];
  document.querySelector('#apartment-mode').hidden = type !== 'Apartment Cleaning';
  document.querySelector('#type-note').textContent = '*Starting prices vary by space. Final pricing is confirmed after reviewing your home and requested services.';
  document.querySelectorAll('.service').forEach(card => {
    const link = card.querySelector('[data-scope]'), id = Number(link.dataset.scope), item = P31.spaces[id];
    card.hidden = (type === 'Airbnb Turnover') !== !!item.suite;
    card.querySelector('h3').textContent = item.label;
    card.querySelector('.price').textContent = '$' + (item.price + P31.upgrades[type]) + '*';
    link.href = 'care.html?' + new URLSearchParams({space: id, type, mode: mode.value});
  });
}
mode.onchange = update;
update();

})();
