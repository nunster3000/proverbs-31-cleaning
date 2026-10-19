const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
process.chdir(path.resolve(__dirname, ".."));
try {
  process.loadEnvFile(".env.local");
} catch {}
const handler = require("./api.cjs").createHandler();
const root = path.resolve("dist");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
};
http
  .createServer(async (req, res) => {
    if (req.url.startsWith("/api/app")) {
      let body = "";
      try {
        for await (const part of req) {
          body += part;
          if (body.length > 65536) {
            res.writeHead(413);
            res.end();
            return;
          }
        }
        req.body = body ? JSON.parse(body) : {};
        await handler(req, res);
      } catch {
        res.writeHead(400);
        res.end("Invalid request");
      }
      return;
    }
    const filename = path.resolve(
      root,
      "." +
        decodeURIComponent(
          new URL(req.url, "http://local").pathname === "/"
            ? "/index.html"
            : new URL(req.url, "http://local").pathname,
        ),
    );
    if (!filename.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(filename, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.setHeader(
        "Content-Type",
        types[path.extname(filename)] || "application/octet-stream",
      );
      res.end(data);
    });
  })
  .listen(Number(process.env.PORT) || 8766, "127.0.0.1", () =>
    console.log(
      "Backend preview: http://127.0.0.1:" + (process.env.PORT || 8766),
    ),
  );
