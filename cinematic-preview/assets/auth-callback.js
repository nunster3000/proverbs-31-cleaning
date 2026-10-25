window.P31AuthCallback = {
  take(location, history) {
    const query = new URLSearchParams(location.search), hash = new URLSearchParams(location.hash.slice(1));
    const tokenHash = query.get('token_hash'), accessToken = hash.get('access_token'), refreshToken = hash.get('refresh_token');
    const type=query.get('type')||hash.get('type');
    const error = query.has('error') || hash.has('error');
    if (tokenHash || accessToken || refreshToken || error) {
      for (const key of ['token_hash','type','error','error_code','error_description']) query.delete(key);
      history.replaceState(null, '', location.pathname + (query.size ? '?' + query : ''));
    }
    return {tokenHash, accessToken, refreshToken, error,type};
  },
  async finish(auth, callback) {
    if (callback.error) throw Error('This email link has expired or is unavailable. Request a new sign-in link.');
    let result;
    if (callback.tokenHash) result = await auth.verifyOtp({token_hash:callback.tokenHash,type:callback.type==='recovery'?'recovery':'email'});
    else if (callback.accessToken || callback.refreshToken) {
      if (!callback.accessToken || !callback.refreshToken) throw Error('This email link is incomplete. Request a new sign-in link.');
      result = await auth.setSession({access_token:callback.accessToken,refresh_token:callback.refreshToken});
    }
    if (result?.error) throw Error('This email link could not be verified. Request a new sign-in link.');
    return !!result && callback.type==='recovery';
  },
};
