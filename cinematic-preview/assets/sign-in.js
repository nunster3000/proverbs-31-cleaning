(async () => {
  const form = document.querySelector('#email-form');
  const button = form.querySelector('button');
  const email = document.querySelector('#sign-in-email');
  const status = document.querySelector('#sign-in-status');
  let busy = false;
  async function openWorkspace() {
    // Role and email verification come from the authenticated API, never the URL.
    const me = await P31Live.api('me');
    if (!['owner', 'customer'].includes(me.role)) return false;
    location.replace('workspace.html');
    return true;
  }
  try {
    const config = await P31Live.init();
    if (!config.enabled || !config.authEnabled) {
      status.textContent = 'Online account access is being prepared. Please contact us to arrange your cleaning.';
      return;
    }
    const params = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.slice(1));
    if (params.has('error') || hash.has('error')) {
      history.replaceState(null, '', 'sign-in.html');
      status.textContent = 'This sign-in link could not be verified. Request a new email below.';
    }
    const { data: { session }, error } = await P31Live.client.auth.getSession();
    if (error) throw error;
    if (session && !session.user.is_anonymous) {
      if (await openWorkspace()) return;
    }
    // A verified code or email link in another tab can establish this session.
    P31Live.client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session && !session.user.is_anonymous)
        setTimeout(() => openWorkspace().catch(e => status.textContent = e.message), 0);
    });
    button.disabled = false;
    email.disabled = false;
    form.onsubmit = async event => {
      event.preventDefault();
      if (busy || !form.reportValidity()) return;
      busy = true; button.disabled = true;
      status.textContent = '';
      try {
        if (await P31Live.signIn(email.value.trim())) await openWorkspace();
      } catch (e) {
        status.textContent = e.message || 'Unable to sign in. Please try again.';
      } finally {
        busy = false; button.disabled = false;
      }
    };
  } catch {
    status.textContent = 'Account access is temporarily unavailable. Please try again later or contact us.';
  }
})();
