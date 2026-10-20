(async () => {
  const page = location.pathname.split('/').pop();
  if (['account.html', 'admin.html', 'final-payment.html'].includes(page)) {
    location.replace('workspace.html');
    return;
  }
  if (page !== 'care.html') return;
  const covered = [...document.body.children];
  covered.forEach(node => node.inert = true);
  const cover = document.createElement('section');
  cover.className = 'backend-cover';
  cover.setAttribute('role', 'status');
  cover.textContent = 'Opening your cleaning planner…';
  document.body.append(cover);
  function unavailable(message) {
    cover.replaceChildren();
    const title = document.createElement('h1');
    title.textContent = 'Online booking is being prepared.';
    const p = document.createElement('p');
    p.textContent = message;
    const contact = document.createElement('a');
    contact.href = 'contact.html'; contact.textContent = 'Contact the company';
    const home = document.createElement('a');
    home.href = 'index.html'; home.textContent = 'Return home';
    cover.append(title, p, contact, home);
  }
  try {
    if (!window.P31Live) await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'assets/backend-client.js';
      script.onload = resolve; script.onerror = reject;
      document.head.append(script);
    });
    const config = await P31Live.init();
    if (!config.enabled || !config.authEnabled) {
      unavailable('Please contact Proverbs 31 Cleaning Co. to arrange service while online booking is being connected.');
      return;
    }
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'assets/live-care.js';
      script.onload = resolve; script.onerror = reject;
      document.body.append(script);
    });
    await window.P31LiveCareReady;
    covered.forEach(node => node.inert = false);
    cover.remove();
  } catch {
    unavailable('The booking connection is unavailable. Please contact the company or try again later.');
  }
})();
