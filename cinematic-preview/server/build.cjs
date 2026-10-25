const fs = require('node:fs'), path = require('node:path');
// Rebuild cleanly so removed demo pages/scripts cannot survive a previous build.
fs.rmSync('dist', { recursive: true, force: true });
fs.mkdirSync('dist/assets', { recursive: true });
for (const name of fs.readdirSync('.'))
  if (name.endsWith('.html')) fs.copyFileSync(name, path.join('dist', name));
fs.copyFileSync('workspace.html','dist/owner-preview.html');
for(const name of fs.readdirSync('dist').filter(n=>n.endsWith('.html'))){const file=path.join('dist',name),source=fs.readFileSync(file,'utf8');fs.writeFileSync(file,source.replace(/<\/html>/i,'<script src="/assets/owner-site-preview.js" defer></script></html>'));}
const retired = new Set(['admin-store.js', 'admin.js', 'customer-updates.js',
  'customer-owner-bridge.js', 'guest-owner-bridge.js', 'walkthrough.js']);
fs.cpSync('assets', 'dist/assets', { recursive: true,
  filter: source => !retired.has(path.basename(source)) && !/-(?:prompts|manifest)\.json$|(?:^|[-_])proof\.png$/i.test(path.basename(source)) });
require('esbuild').buildSync({
  entryPoints: ['server/browser-entry.js'], bundle: true, minify: true,
  format: 'iife', outfile: 'dist/assets/backend-sdk.js',
});

require('esbuild').buildSync({
  entryPoints: ['server/heic-entry.js'], bundle: true, minify: true,
  format: 'iife', outfile: 'dist/assets/heic-converter.js',
});
fs.copyFileSync('node_modules/heic-to/LICENSE', 'dist/assets/heic-to-LICENSE.txt');

require("esbuild").buildSync({entryPoints:["server/agreement-pdf-entry.js"],bundle:true,minify:true,format:"iife",outfile:"dist/assets/agreement-pdf.js"});

// Dashboard HTML is not cached; content-based asset versions also prevent stale
// browser/proxy copies from mixing uploader code from different deployments.
for (const name of ['workspace.html','owner-preview.html','sign-in.html','owner-sign-in.html']) {
  const file=path.join('dist',name);
  const html=fs.readFileSync(file,'utf8').replace(/(src|href)="((?:\/?assets\/)[^"?]+\.(?:js|css))"/g,(match,attribute,url)=>{
    const asset=path.join('dist',url.replace(/^\//,''));
    if(!fs.existsSync(asset))return match;
    const version=require('node:crypto').createHash('sha256').update(fs.readFileSync(asset)).digest('hex').slice(0,12);
    return attribute+'="'+url+'?v='+version+'"';
  });
  fs.writeFileSync(file,html);
}
