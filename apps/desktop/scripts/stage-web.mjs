import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const standalone = resolve(root, "apps/web/.next/standalone");
const staticDirectory = resolve(root, "apps/web/.next/static");
const publicDirectory = resolve(root, "apps/web/public");
const output = resolve(root, "dist/desktop/web");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(standalone, output, { recursive: true });
const applicationRoot = resolve(output, "apps/web");
await cp(staticDirectory, resolve(applicationRoot, ".next/static"), { recursive: true });
await cp(publicDirectory, resolve(applicationRoot, "public"), { recursive: true });
