import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function startDemoServer(port = 0) {
  const html = await readFile(new URL("../demo/index.html", import.meta.url));
  const server = createServer((request, response) => {
    if (!["/", "/frame", "/link"].includes(new URL(request.url, "http://localhost").pathname)) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end(html);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await startDemoServer(Number(process.env.PORT || 4173));
  console.log(`Absolute Scrolling test page: ${url}\nLoad the extension in Firefox, then open this URL. Ctrl+C to stop.`);
}
