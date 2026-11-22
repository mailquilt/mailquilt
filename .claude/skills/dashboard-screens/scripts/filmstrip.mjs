import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { BASE_URL, openPage, readArgs, renderSheet, sleep } from "./chrome.mjs";

const USAGE =
  "Usage: node filmstrip.mjs --out <dir> [--path /] [--name load] [--width 1280] [--theme light] [--latency 120] [--duration 3500]";

const args = readArgs(process.argv.slice(2));

if (!args.out) {
  console.error(USAGE);
  process.exit(1);
}

const out = path.resolve(args.out);
const name = args.name ?? "load";
const width = Number(args.width ?? 1280);
const frames = [];
const start = Date.now();

mkdirSync(out, { recursive: true });

const page = await openPage({ theme: args.theme ?? "light", width });

await page.send("Network.emulateNetworkConditions", {
  downloadThroughput: -1,
  latency: Number(args.latency ?? 120),
  offline: false,
  uploadThroughput: -1,
});

page.onMessage((message) => {
  if (message.method === "Page.screencastFrame") {
    frames.push({ at: Date.now() - start, data: message.params.data });
    page.send("Page.screencastFrameAck", {
      sessionId: message.params.sessionId,
    });
  }
});

await page.send("Page.startScreencast", {
  everyNthFrame: 1,
  format: "png",
  maxWidth: width,
});

const url = `${BASE_URL}${args.path ?? "/"}`;

await page.send("Page.navigate", { url });

await sleep(Number(args.duration ?? 3500));

await page.send("Page.stopScreencast");

page.close();

const files = frames.map(({ at, data }, index) => {
  const file = `${name}-${String(index).padStart(3, "0")}-${at}ms.png`;

  writeFileSync(path.join(out, file), Buffer.from(data, "base64"));

  return { at, file };
});

const cells = files
  .map(
    ({ at, file }) =>
      `<figure style="margin:0"><img src="${file}" style="width:300px;border:1px solid #ccc"><figcaption>${at} ms</figcaption></figure>`
  )
  .join("");

const sheet = path.join(out, `${name}-filmstrip.html`);

writeFileSync(
  sheet,
  `<body style="margin:16px;font:12px sans-serif;display:grid;grid-template-columns:repeat(5,300px);gap:12px">${cells}</body>`
);

writeFileSync(
  path.join(out, `${name}-filmstrip.png`),
  await renderSheet(sheet, 1620)
);

console.log(`${files.length} frames, ${name}-filmstrip.png`);
