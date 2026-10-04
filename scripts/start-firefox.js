import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const appData = fileURLToPath(new URL("../node_modules/.cache/firefox-dev-app-data", import.meta.url));
await mkdir(appData, { recursive: true });

// Keep development separate from personal Firefox data, including on macOS 27.
const child = spawn(process.execPath, [
  fileURLToPath(new URL("../node_modules/web-ext/bin/web-ext.js", import.meta.url)),
  "run", "--source-dir", "extension", ...process.argv.slice(2),
], {
  cwd: project,
  stdio: "inherit",
  env: { ...process.env, MOZ_APP_DATA: appData, MOZ_LOCAL_APP_DATA: appData, NO_UPDATE_NOTIFIER: "1" },
});
child.on("error", (error) => {
  console.error(`Unable to start Firefox: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
