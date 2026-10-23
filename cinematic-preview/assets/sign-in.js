(async () => {
  if(location.pathname==='/owner-sign-in.html'&&new URLSearchParams(location.search).get('guest-security-test')==='1'){
    const config=await P31Live.init();if(!config.ownerPreview)return;
    const form=document.querySelector('#email-form');form.replaceChildren();const status=document.querySelector('#sign-in-status'),security=document.createElement('div'),button=document.createElement('button');button.type='button';button.textContent='Verify guest security';form.append(security,button);status.textContent='Private test: no booking, payment, or account registration. Complete the security check.';
    const getToken=await P31Live.captcha(security);button.onclick=async()=>{button.disabled=true;try{const client=P31Live.client;const signed=await client.auth.signInAnonymously({options:{captchaToken:getToken(),data:{p31_guest_captcha_rehearsal:true}}});if(signed.error)throw signed.error;if(!signed.data.user.is_anonymous)throw Error('Expected guest identity');const customers=await client.from('customers').select('id'),bookings=await client.from('bookings').select('id');if(customers.error||bookings.error||customers.data.length||bookings.data.length)throw Error('Isolation check failed');const blocked=await client.rpc('api_create_booking',{p_request:crypto.randomUUID(),p_data:{name:'PRIVATE GUEST SECURITY TEST',email:'khris.nun@proverbs31cleaningcoservices.info',address:'TEST ONLY - NOT A SERVICE ADDRESS',service:'standard',space_id:3,date:'2026-11-25',arrival:'morning'}});if(!blocked.error||!blocked.error.message.includes('October 26'))throw Error('Expected launch protection');status.textContent='PASS: Turnstile verified; guest identity created; other customer records and bookings: 0; early booking blocked by the launch clock. Test identity: '+signed.data.user.id;await client.auth.signOut();getToken.dispose?.();button.hidden=true;}catch(e){status.textContent=e.message;getToken.reset?.();button.disabled=false;}};return;
  }

  const form = document.querySelector('#email-form');
  const button = form.querySelector('button');
  const email = document.querySelector('#sign-in-email');
  const status = document.querySelector('#sign-in-status');
  let busy = false, ownerPreview=false;
  async function openWorkspace() {
    // Role and email verification come from the authenticated API, never the URL.
    const me = await P31Live.api('me');
    if (!['owner', 'customer'].includes(me.role)) return false;
    if(ownerPreview&&me.role!=='owner')throw new Error('This entrance is for the business owner only.');
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
        if (await P31Live.signIn(email.value.trim())) await openWorkspace();
      } catch (e) {
        status.textContent = e.message || 'Unable to sign in. Please try again.';
      } finally {
        busy = false; button.disabled = false;
      }
    };
    const { data: { session }, error } = await P31Live.client.auth.getSession();
    if (error) throw error;
    if (session && !session.user.is_anonymous) {
      if (await openWorkspace()) return;
    }
    // A verified email link in another tab can establish this session.
    P31Live.client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session && !session.user.is_anonymous)
        setTimeout(() => openWorkspace().catch(e => status.textContent = e.message), 0);
    });

  } catch {
    status.textContent = 'Account access is temporarily unavailable. Please try again later or contact us.';
  }
})();
