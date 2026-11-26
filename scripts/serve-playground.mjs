import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";

const ROOT = resolve("playground");
const PORT = Number.parseInt(process.env.PORT ?? "4318", 10);
const HOST = "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function resolvePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const pathname = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const target = resolve(ROOT, pathname);
  const fromRoot = relative(ROOT, target);
  if (isAbsolute(fromRoot) || fromRoot === ".." || fromRoot.startsWith(".." + sep)) return null;
  return target;
}

const server = createServer(async (request, response) => {
  let target;
  try {
    target = resolvePath(request.url ?? "/");
  } catch {
    response.writeHead(400).end("Invalid path");
    return;
  }
  if (!target) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const info = await stat(target);
    const file = info.isDirectory() ? join(target, "index.html") : target;
    const body = await readFile(file);
    response.writeHead(200, {
      "content-type": MIME[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`ClearCue playground: http://${HOST}:${PORT}/`);
});
