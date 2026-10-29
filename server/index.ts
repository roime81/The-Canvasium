import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createApi } from "./app";
import { providerFromEnv } from "./provider";

const root = fileURLToPath(new URL("..", import.meta.url));
const dev = process.argv.includes("--dev");
try {
  process.loadEnvFile(join(root, ".env"));
} catch {
  // .env is optional
}
const port = Number(process.env.PORT ?? 5173);
const host = process.env.HOST ?? "127.0.0.1";
const provider = providerFromEnv(process.env);
const api = createApi({ dataFile: resolve(process.env.DATA_FILE ?? join(root, "data", "canvasium.json")), provider });

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};
const PAGES: Record<string, string> = { "/": "/index.html", "/tracker": "/tracker.html" };

const httpServer = createServer();
let serveUi: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

if (dev) {
  const { createServer: createVite } = await import("vite");
  const vite = await createVite({
    root,
    appType: "mpa",
    server: { middlewareMode: true, hmr: { server: httpServer } },
  });
  serveUi = (req, res) => {
    const pathname = (req.url ?? "/").split("?")[0] ?? "/";
    if (PAGES[pathname]) req.url = PAGES[pathname];
    vite.middlewares(req, res, () => {
      res.statusCode = 404;
      res.end("Not found");
    });
  };
} else {
  const dist = join(root, "dist");
  serveUi = async (req, res) => {
    const pathname = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    const file = normalize(join(dist, PAGES[pathname] ?? pathname));
    if (!file.startsWith(dist + sep)) {
      res.statusCode = 403;
      return void res.end("Forbidden");
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found (did you run `npm run build`?)");
    }
  };
}

httpServer.on("request", async (req, res) => {
  try {
    if (!(await api(req, res))) await serveUi(req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500);
    res.end("Internal server error");
  }
});

httpServer.listen(port, host, () => {
  console.log(`The Canvasium running at http://${host}:${port}  (${dev ? "dev" : "production"})`);
  console.log(`  Prompt workspace: /     Productivity tracker: /tracker`);
  console.log(`  AI: ${provider ? provider.name : "built-in templates (set AI_API_URL to use your own provider)"}`);
});
