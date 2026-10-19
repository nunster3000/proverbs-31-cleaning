const fs = require("node:fs"),
  path = require("node:path");
fs.mkdirSync("dist", { recursive: true });
for (const name of fs.readdirSync("."))
  if (name.endsWith(".html")) fs.copyFileSync(name, path.join("dist", name));
fs.cpSync("assets", "dist/assets", { recursive: true });
require("esbuild").buildSync({
  entryPoints: ["server/browser-entry.js"],
  bundle: true,
  minify: true,
  format: "iife",
  outfile: "dist/assets/backend-sdk.js",
});
