(async () => {
  const form = document.querySelector('#email-form');
  const button = form.querySelector('button');
  const email = document.querySelector('#sign-in-email');
  const status = document.querySelector('#sign-in-status');
  let busy = false, ownerPreview=false, opening, redirected=false;
  async function openWorkspace() {
    // Role and email verification come from the authenticated API, never the URL.
    const me = await P31Live.api('me');
    if (!['owner', 'customer'].includes(me.role)) return false;
    if(ownerPreview&&me.role!=='owner')throw new Error('This entrance is for the business owner only.');
    redirected=true;
    status.textContent = 'Opening your dashboard…';
    button.disabled = true; email.disabled = true;
    location.replace(ownerPreview?'owner-preview.html':'workspace.html');
    return true;
  }
  try {
    const config = await P31Live.init();
    ownerPreview=!!config.ownerPreview;
    if (!config.enabled || !config.authEnabled) {
      status.textContent = 'Online account access is being prepared. Please contact us to arrange your cleaning.';
      return;
    }
    if (config.callbackError) status.textContent = config.callbackError;
    const params = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.slice(1));
    if (params.has('error') || hash.has('error')) {
      history.replaceState(null, '', 'sign-in.html');
      status.textContent = 'This sign-in link could not be verified. Request a new email below.';
    }
    button.disabled = false;
    email.disabled = false;
    form.onsubmit = async event => {
      event.preventDefault();
      if (busy || !form.reportValidity()) return;
      busy = true; button.disabled = true;
      status.textContent = '';
      try {
        if (await P31Live.signIn(email.value.trim())) await resume();
      } catch (e) {
        status.textContent = e.message || 'Unable to sign in. Please try again.';
      } finally {
        busy = false; button.disabled = false;
      }
    };
    // Subscribe before reading: session restoration and email callbacks can finish
    // between the first read and listener registration. SDK callbacks stay synchronous.
    async function resume() {
      if (redirected) return true;
      if (opening) return opening;
      opening = (async () => {
        const { data: { session }, error } = await P31Live.client.auth.getSession();
        if (error) throw error;
        if (!session || session.user.is_anonymous) return false;
        return openWorkspace();
      })();
      try { return await opening; } finally { opening = null; }
    }
    function scheduleResume() {
      setTimeout(() => resume().catch(e => {status.textContent=e.message;}), 0);
    }
    P31Live.client.auth.onAuthStateChange((event, session) => {
      if (['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED'].includes(event) && session && !session.user.is_anonymous)
        scheduleResume();
    });
    window.addEventListener('pageshow', scheduleResume);
    window.addEventListener('focus', scheduleResume);
    if (await resume()) return;
    if (config.callbackReceived && !config.callbackError) {
      status.textContent = 'Finishing your secure sign-in…';
      // A bounded fallback also covers browsers that restore storage after their
      // initial auth event. No reload and no repeated email request is needed.
      for (let attempt=0; attempt<10 && !redirected; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        if (await resume()) return;
      }
      if (!redirected) status.textContent = 'Your session could not be opened. Please request a new sign-in link.';
    }

  } catch {
    status.textContent = 'Account access is temporarily unavailable. Please try again later or contact us.';
  }
})();
