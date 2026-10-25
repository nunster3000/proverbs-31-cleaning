const {emailLayout,paragraph}=require('./email-layout.cjs');
// RedirectTo is validated against Supabase's exact callback allowlist.
const url='{{ if .RedirectTo }}{{ .RedirectTo }}{{ else }}https://www.proverbs31cleaningcoservices.info/sign-in.html{{ end }}?token_hash={{ .TokenHash }}&amp;type=email';
function renderAuthEmail(kind,confirmationUrl){
 if(!['magic-link','confirm-signup'].includes(kind))throw Error('Unsupported authentication email');
 const signup=kind==='confirm-signup';
 return emailLayout({preheader:signup?'Confirm your email and make room for a little more care.':'Your secure sign-in link. No password needed.',eyebrow:signup?'Welcome to your care account':'Your secure account access',title:signup?'Welcome. Let’s care for your home.':'A warm welcome back.',content:paragraph(signup?'Confirm your email address to finish creating your account. You’ll have one place to manage your cleaning visits, share your walkthrough, and review the details with Gabrielle.':'Use the secure link below to open your Proverbs 31 account. Your cleaning visits and any next steps will be waiting for you.')+paragraph('No password or verification code is needed.'),cta:signup?'Confirm email & sign in':'Sign in to my account',url:confirmationUrl||url,note:'This link can be used once and expires in one hour. Keep it private. If you did not request this email, you can safely ignore it.'});
}
module.exports={renderAuthEmail};
if(require.main===module){const fs=require('node:fs'),path=require('node:path');for(const name of ['magic-link','confirm-signup'])fs.writeFileSync(path.join(__dirname,'../supabase/email-templates',name+'.html'),renderAuthEmail(name)+'\n');}
