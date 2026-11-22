// oxlint-disable no-await-in-loop -- each screenshot runs in its own Chrome, one at a time.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  BASE_URL,
  clickTarget,
  openPage,
  readArgs,
  renderSheet,
  sleep,
} from "./chrome.mjs";

const USAGE =
  "Usage: node screens.mjs --out <dir> [--path /] [--name screen] [--widths 320,390,768,1024,1440,1920] [--themes light,dark] [--click <selector or text=Label>]... [--wait 2500]";

const args = readArgs(process.argv.slice(2));

if (!args.out) {
  console.error(USAGE);
  process.exit(1);
}

const out = path.resolve(args.out);
const name = args.name ?? "screen";

const widths = (args.widths ?? "320,390,768,1024,1440,1920")
  .split(",")
  .map(Number);

const themes = (args.themes ?? "light,dark").split(",");
const clicks = [args.click ?? []].flat();
const wait = Number(args.wait ?? 2500);
const SHEET_ROW_HEIGHT = 420;
const shots = [];

mkdirSync(out, { recursive: true });

for (const theme of themes) {
  for (const width of widths) {
    const page = await openPage({ theme, width });

    await page.send("Page.navigate", { url: `${BASE_URL}${args.path ?? "/"}` });
    await sleep(wait);

    for (const target of clicks) {
      const result = await clickTarget(page, target);

      if (result === "missing") {
        console.warn(`${width}px ${theme}: nothing matched ${target}`);
      }

      await sleep(800);
    }

    const shot = await page.send("Page.captureScreenshot", { format: "png" });
    const file = `${name}-${width}-${theme}.png`;

    writeFileSync(path.join(out, file), Buffer.from(shot.result.data, "base64"));
    shots.push({ file, theme, width });
    page.close();
    console.log(file);
  }
}

const cells = shots
  .map(
    ({ file, theme, width }) =>
      `<figure style="margin:0"><img src="${file}" style="height:${SHEET_ROW_HEIGHT}px"><figcaption>${width}px, ${theme}</figcaption></figure>`
  )
  .join("");

const sheetWidth = Math.min(
  2400,
  shots.reduce(
    (total, { width }) =>
      total + (width * SHEET_ROW_HEIGHT) / (width < 700 ? 844 : 900) + 16,
    32
  )
);

const sheet = path.join(out, `${name}-matrix.html`);

writeFileSync(
  sheet,
  `<body style="margin:16px;font:13px sans-serif;display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start">${cells}</body>`
);

writeFileSync(
  path.join(out, `${name}-matrix.png`),
  await renderSheet(sheet, Math.ceil(sheetWidth))
);

console.log(`${name}-matrix.png`);
