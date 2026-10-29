import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const source = resolve(root, "apps/backend/dist");
const output = resolve(root, "dist/desktop/backend/dist");

await rm(resolve(root, "dist/desktop/backend"), { recursive: true, force: true });
await mkdir(resolve(root, "dist/desktop/backend"), { recursive: true });
await cp(source, output, { recursive: true });
