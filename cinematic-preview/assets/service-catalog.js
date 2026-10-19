/* Owner-provided service rules. Demo estimates only; a server must validate live quotes. */
window.P31 = (() => {
  const services = ['Standard Cleaning', 'Deep Cleaning', 'Apartment Cleaning', 'Airbnb Turnover'];
  const spaces = [
    { label: 'King guest suite · bedroom + bathroom', price: 65, suite: true, image: 'king-suite' },
    { label: 'Queen guest suite · bedroom + bathroom', price: 50, suite: true, image: 'queen-suite' },
    { label: 'Studio Apartment', price: 85, image: 'studio' },
    { label: '1 Bedroom / 1 Bathroom', price: 110, image: 'care-home' },
    { label: '2 Bedrooms / 1–2 Bathrooms', price: 140, image: 'two-bed-two-bath' },
    { label: '3 Bedrooms / 2 Bathrooms', price: 175, image: 'three-bed' },
    { label: '4 Bedrooms / 2–3 Bathrooms', price: 225, image: 'four-bed-three-bath' },
    { label: 'Large / Entire Home', price: 250, image: 'large-home' }
  ];
  const addons = [
    { id: 'laundry', label: 'Laundry service', price: 20, detail: 'Per load · includes folding and hanging' },
    { id: 'fridge', label: 'Refrigerator cleaning', price: 75, detail: 'Detailed refrigerator cleaning' },
    { id: 'oven', label: 'Stove / oven cleaning', price: 85, detail: 'Detailed stove and oven cleaning' },
    { id: 'baseboards', label: 'Baseboard cleaning', price: 45, detail: 'Additional attention to baseboards' }
  ];
  const descriptions = {
    'Standard Cleaning': 'Everyday care: vacuuming, sweeping, mopping, making beds, wiping surfaces, and routine kitchen and bathroom cleaning.',
    'Deep Cleaning': 'Standard care plus baseboards, window cleaning, sanitizing, and disinfecting. Starts $100 above the standard size-based price. Select Kitchen as a focus room to include refrigerator and stove/oven cleaning.',
    'Apartment Cleaning': 'Standard cleaning for an empty apartment. Choose Move-In before belongings arrive or Move-Out after everything has been removed.',
    'Airbnb Turnover': 'Standard cleaning between guest stays. Choose a King or Queen guest suite with its bathroom, then add any extra care such as laundry.'
  };
  function quote({ service = services[0], space = 3, focus = [], extras = {} } = {}) {
    const item = spaces[space];
    if (!item || !services.includes(service)) throw new Error('Invalid service or property size');
    if (item.suite !== true && service === 'Airbnb Turnover' || item.suite === true && service !== 'Airbnb Turnover') throw new Error('Choose a property size offered for this service');
    const deep = service === 'Deep Cleaning';
    const kitchen = deep && focus.includes('Kitchen');
    const included = deep ? ['baseboards', ...(kitchen ? ['fridge', 'oven'] : [])] : [];
    const base = item.price + (deep ? 100 : 0);
    const lines = addons.map(a => {
      const quantity = a.id === 'laundry' ? Math.max(0, Math.min(20, Math.floor(Number(extras.laundry) || 0))) : (extras[a.id] ? 1 : 0);
      return { ...a, quantity, included: included.includes(a.id), amount: included.includes(a.id) ? 0 : quantity * a.price };
    }).filter(a => a.quantity || a.included);
    const addonsTotal = lines.reduce((sum, a) => sum + a.amount, 0);
    return { base, standardBase: item.price, upgrade: deep ? 100 : 0, included, lines, addonsTotal, total: base + addonsTotal, deposit: base / 2, remaining: base + addonsTotal - base / 2 };
  }
  return { services, spaces, addons, descriptions, quote, money: n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n) };
})();
