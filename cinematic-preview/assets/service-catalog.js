/* Published service catalog. The backend validates all booking quotes and payments. */
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
    { id: 'laundry', label: 'Laundry service', price: 20, detail: 'Washing, folding, and hanging · select the number of loads' },
    { id: 'fridge', label: 'Refrigerator cleaning', price: 75, detail: 'Additional detailed refrigerator care beyond routine kitchen cleaning' },
    { id: 'oven', label: 'Stove / oven cleaning', price: 85, detail: 'Additional detailed stove and oven care beyond routine kitchen cleaning' },
    { id: 'baseboards', label: 'Baseboard cleaning', price: 45, detail: 'Detailed baseboard cleaning · included with Deep Cleaning' }
  ];
  const descriptions = {
    'Standard Cleaning': 'Routine cleaning to keep your home fresh, comfortable, and well cared for. Includes vacuuming, sweeping, mopping, surface cleaning, bed making, and everyday kitchen and bathroom care.',
    'Deep Cleaning': 'A more detailed clean for spaces that need additional attention. Includes standard cleaning, with focused care for baseboards and windows, along with sanitizing and disinfecting to address buildup and refresh your space.',
    'Apartment Cleaning': 'A fresh start for your next chapter. Our move-in and move-out services provide standard cleaning throughout an empty apartment, preparing the space before your belongings arrive or after they have been removed.',
    'Airbnb Turnover': 'Thoughtful cleaning between guest stays to keep your space welcoming and ready for the next arrival. Includes standard cleaning of your selected guest bedroom and bathroom, with optional laundry service to wash, fold, and hang items as needed.'
  };
  const upgrades = Object.fromEntries(services.map(name => [name, name === 'Deep Cleaning' ? 100 : 0]));
  const serviceIds = ['standard', 'deep', 'apartment', 'airbnb'];
  function applyCatalog(catalog) {
    const validCents = value => Number.isSafeInteger(value) && value >= 0;
    if (!catalog || !Array.isArray(catalog.spaces) || !Array.isArray(catalog.services) || !Array.isArray(catalog.addons)) throw new Error('Service pricing is unavailable. Please try again later.');
    const checked = (rows, ids) => {
      if (rows.length !== ids.length || new Set(rows.map(row => row.id)).size !== ids.length) throw new Error('Service pricing is unavailable.');
      return ids.map(id => {
        const row = rows.find(item => item.id === id);
        if (!row || typeof row.label !== 'string' || !row.label.trim()) throw new Error('Service pricing is incomplete.');
        return row;
      });
    };
    const newSpaces = checked(catalog.spaces, spaces.map((_, id) => id));
    const newServices = checked(catalog.services, serviceIds);
    const newAddons = checked(catalog.addons, addons.map(item => item.id));
    if (newSpaces.some((row, id) => !validCents(row.base_cents) || row.base_cents === 0 || row.suite !== (id < 2)) || newServices.some(row => !validCents(row.upgrade_cents)) || newAddons.some(row => !validCents(row.cents) || row.cents === 0 || row.per_load !== (row.id === 'laundry'))) throw new Error('Service pricing is invalid.');
    // Validate the whole response before replacing any published prices.
    newSpaces.forEach((row, id) => Object.assign(spaces[id], {label:row.label, price:row.base_cents / 100}));
    newServices.forEach((row, id) => upgrades[services[id]] = row.upgrade_cents / 100);
    newAddons.forEach((row, id) => Object.assign(addons[id], {label:row.label, price:row.cents / 100}));
  }
  async function loadCatalog() {
    if (!window.P31Live) throw new Error('Unable to load service pricing.');
    const config = await window.P31Live.init();
    if (!config.enabled) return false; // Owner-approved published catalog during prelaunch.
    applyCatalog(await window.P31Live.api('catalog'));
    return true;
  }
  function includedCare(service, { mode = 'Move-In', focus = [] } = {}) {
    const routine = ['Vacuuming, sweeping, and mopping', 'Surface cleaning', 'Bed making', 'Routine kitchen and bathroom cleaning'];
    if (service === 'Deep Cleaning') return [...routine, 'Baseboard and window cleaning', 'Sanitizing and disinfecting', ...(focus.includes('Kitchen') ? ['Refrigerator and stove / oven cleaning included with Kitchen focus'] : [])];
    if (service === 'Apartment Cleaning') return ['Standard cleaning of the empty apartment', 'Vacuuming, sweeping, and mopping', 'Surface, kitchen, and bathroom cleaning', mode === 'Move-Out' ? 'After all belongings have been removed' : 'Before furniture and belongings are moved in'];
    if (service === 'Airbnb Turnover') return ['Standard cleaning of your selected guest bedroom and bathroom', 'Vacuuming, sweeping, and mopping', 'Surface cleaning and bed making', 'Bathroom cleaning between guest stays'];
    return routine;
  }
  function quote({ service = services[0], space = 3, focus = [], extras = {} } = {}) {
    const item = spaces[space];
    if (!item || !services.includes(service)) throw new Error('Invalid service or property size');
    if (item.suite !== true && service === 'Airbnb Turnover' || item.suite === true && service !== 'Airbnb Turnover') throw new Error('Choose a property size offered for this service');
    const deep = service === 'Deep Cleaning';
    const kitchen = deep && focus.includes('Kitchen');
    const included = deep ? ['baseboards', ...(kitchen ? ['fridge', 'oven'] : [])] : [];
    const base = item.price + upgrades[service];
    const lines = addons.map(a => {
      const quantity = a.id === 'laundry' ? Math.max(0, Math.min(20, Math.floor(Number(extras.laundry) || 0))) : (extras[a.id] ? 1 : 0);
      return { ...a, quantity, included: included.includes(a.id), amount: included.includes(a.id) ? 0 : quantity * a.price };
    }).filter(a => a.quantity || a.included);
    const addonsTotal = lines.reduce((sum, a) => sum + a.amount, 0);
    return { base, standardBase: item.price, upgrade: upgrades[service], included, lines, addonsTotal, total: base + addonsTotal, deposit: base / 2, remaining: base + addonsTotal - base / 2 };
  }
  return { services, spaces, addons, upgrades, applyCatalog, loadCatalog, descriptions, includedCare, quote, money: n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n) };
})();
