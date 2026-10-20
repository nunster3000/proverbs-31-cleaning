/* Shared phone navigation. Desktop links remain available without JavaScript. */
(() => {
  const header = document.querySelector('header');
  if (!header) return;
  const controls = document.createElement('div');
  controls.className = 'mobile-site-controls';
  const login = document.createElement('a');
  login.href = 'sign-in.html';
  login.textContent = 'Login';
  login.className = 'mobile-login';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mobile-menu-button';
  button.textContent = '☰';
  button.setAttribute('aria-label', 'Open navigation menu');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'mobile-site-menu');
  const dialog = document.createElement('dialog');
  dialog.id = 'mobile-site-menu';
  dialog.className = 'mobile-site-menu';
  dialog.setAttribute('aria-label', 'Website navigation');
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close ×';
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Main navigation');
  const links = [['Website Home','index.html'],['Dashboard Home','workspace.html'],['Our Care','index.html#care'],['Services','services.html'],['Contact Us','contact.html'],['About Me','about.html'],['Plan My Care','care.html']];
  for (const [label, href] of links) {
    const a = document.createElement('a');
    a.textContent = label;
    a.href = href;
    a.addEventListener('click', () => dialog.close());
    nav.append(a);
  }
  dialog.append(close, nav);
  document.body.append(dialog);
  controls.append(login, button);
  header.append(controls);
  header.classList.add('has-mobile-site-nav');
  // The opening film remains cinematic; navigation is available immediately.
  button.addEventListener('click', () => {
    dialog.showModal();
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-label', 'Close navigation menu');
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  }});
  dialog.addEventListener('close', () => {
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Open navigation menu');
    button.focus();
  });
  document.addEventListener('p31:authenticated', () => {
    login.textContent = 'Dashboard Home';
    login.href = 'workspace.html';
    login.addEventListener('click', event => { event.preventDefault(); document.getElementById('dashboard-home')?.click(); });
    const dashboardLink = Array.from(nav.querySelectorAll('a')).find(a => a.textContent === 'Dashboard Home');
    dashboardLink?.addEventListener('click', event => { event.preventDefault(); document.getElementById('dashboard-home')?.click(); });
  });
  const media = matchMedia('(max-width: 700px)');
  media.addEventListener('change', () => { if (!media.matches && dialog.open) dialog.close(); });
})();
