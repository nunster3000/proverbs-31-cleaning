window.P31PasswordAuth={
 setup({config,complete,status}){
  const $=s=>document.querySelector(s),form=$('#email-form'),email=$('#sign-in-email'),password=$('#account-password'),confirm=$('#confirm-password'),submit=form.querySelector('button'),options=$('#auth-options'),forgot=$('#forgot-password'),security=$('#password-security');
  let mode='password',recovering=!!config.passwordRecovery,token,loading;
  const control={get recovering(){return recovering},get awaitingAction(){return recovering||mode==='reset'},recover(){recovering=true;select('recovery')},async submit(){
   if(mode==='link')return false;
   if(['signup','recovery'].includes(mode)&&password.value!==confirm.value)throw Error('The passwords do not match. Please enter them again.');
   const auth=P31Live.client.auth,address=email.value.trim(),redirectTo=location.origin+(config.ownerPreview?'/owner-sign-in.html':'/sign-in.html');
   if(mode==='recovery'){
    const {error}=await auth.updateUser({password:password.value});if(error)throw error;
    password.value=confirm.value='';recovering=false;status.textContent='Password saved. Opening your account…';await complete();return true;
   }
   await ensureSecurity();const captchaToken=token();
   try{
    if(mode==='password'){
     const {error}=await auth.signInWithPassword({email:address,password:password.value,options:{captchaToken}});
     password.value='';if(error)throw Error('Unable to sign in. Check your email and password, verify your email, or use the password-reset option.');await complete();
    }else if(mode==='signup'){
     const {data,error}=await auth.signUp({email:address,password:password.value,options:{emailRedirectTo:redirectTo,captchaToken}});if(error)throw error;
     password.value=confirm.value='';status.textContent='Check your email to confirm your account. If you already have an account, sign in or reset your password.';if(data?.session)await complete();
    }else if(mode==='reset'){
     const {error}=await auth.resetPasswordForEmail(address,{redirectTo,captchaToken});if(error)throw error;
     status.textContent='If an account exists for this email, you will receive a password-reset link from noreply@proverbs31cleaningcoservices.info. Open the newest email to choose your password.';
    }
   }finally{token?.reset?.()}
   return true;
  }};
  async function ensureSecurity(){if(!loading)loading=P31Live.captcha(security).then(value=>token=value).catch(error=>{loading=null;throw error});await loading;}
  function select(next){
   if(recovering&&next!=='recovery')return;
   mode=next;password.value=confirm.value='';password.type=confirm.type='password';$('#show-password').checked=false;status.textContent='';
   const needsPassword=['password','signup','recovery'].includes(mode),newPassword=['signup','recovery'].includes(mode);
   $('#password-label').hidden=!needsPassword;password.required=needsPassword;password.disabled=!needsPassword;password.minLength=newPassword?12:1;password.autocomplete=newPassword?'new-password':'current-password';
   $('#confirm-password-label').hidden=!newPassword;confirm.required=newPassword;confirm.disabled=!newPassword;confirm.minLength=newPassword?12:1;
   $('#show-password-label').hidden=!needsPassword;$('#password-help').textContent=newPassword?'Use at least 12 characters. A long, unique passphrase works well.':mode==='reset'?'Use this to reset a forgotten password or add a password to an email-link account.':'';
   email.closest('label').hidden=mode==='recovery';email.required=mode!=='recovery';email.disabled=mode==='recovery';
   options.hidden=mode==='recovery';forgot.hidden=mode==='recovery';security.hidden=['link','recovery'].includes(mode);
   submit.textContent={password:'Sign in with password',link:'Continue with email link',signup:'Create account',reset:'Send password-reset email',recovery:'Save new password'}[mode];
   options.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.authMode===mode)));
   if(!security.hidden)ensureSecurity().catch(error=>status.textContent=error.message);
  }
  options.querySelectorAll('button').forEach(b=>b.onclick=()=>{if(!submit.disabled)select(b.dataset.authMode)});
  forgot.onclick=()=>{if(!submit.disabled)select('reset')};$('#show-password').onchange=e=>{password.type=confirm.type=e.target.checked?'text':'password'};
  select(recovering?'recovery':new URLSearchParams(location.search||'').get('action')==='reset-password'?'reset':'password');return control;
 }
};
