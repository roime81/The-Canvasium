import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const packageDist = dirname(require.resolve("@duckdb/duckdb-wasm"));
const publicDir = join(process.cwd(), "public", "duckdb");
const assets = [
  "duckdb-browser-mvp.worker.js",
  "duckdb-mvp.wasm",
];

await mkdir(publicDir, { recursive: true });
await Promise.all(assets.map((asset) => cp(join(packageDist, asset), join(publicDir, asset))));
