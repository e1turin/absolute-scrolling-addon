import { cp, copyFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve("extension");
const destination = resolve("dist/chromium");
const manifest = resolve("chromium/manifest.json");

await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true, filter: (path) => path !== resolve(source, "manifest.json") });
await copyFile(manifest, resolve(destination, "manifest.json"));
console.log(`Chromium extension is ready: ${destination}`);
