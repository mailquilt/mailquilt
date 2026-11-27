// oxlint-disable no-await-in-loop -- steps on a page run in order, and each worker takes one screenshot at a time.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  BASE_URL,
  clickTarget,
  navigate,
  openPage,
  pressKey,
  readArgs,
  renderSheet,
  sleep,
  typeText,
} from "./chrome.mjs";

const USAGE =
  "Usage: node screens.mjs --out <dir> [--path /] [--name screen] [--widths 320,390,768,1024,1440,1920,2560] [--themes light,dark] [--step click=<selector or text=Label> | type=<text> | press=<Enter|Escape|Tab>]... [--block <url pattern>]... [--wait <ms>] [--parallel 4]";

const args = readArgs(process.argv.slice(2));

if (!args.out) {
  console.error(USAGE);
  process.exit(1);
}

const out = path.resolve(args.out);
const name = args.name ?? "screen";

const widths = (args.widths ?? "320,390,768,1024,1440,1920,2560")
  .split(",")
  .map(Number);

const themes = (args.themes ?? "light,dark").split(",");
const steps = [args.step ?? []].flat();
const blocked = [args.block ?? []].flat();

const wait = args.wait === undefined ? undefined : Number(args.wait);
const parallel = Number(args.parallel ?? 4);
const SHEET_ROW_HEIGHT = 420;
const shots = [];

mkdirSync(out, { recursive: true });

const shoot = async (theme, width) => {
  const page = await openPage({ theme, width });

  try {
    if (blocked.length > 0) {
      await page.send("Network.setBlockedURLs", { urls: blocked });
    }

    await navigate(page, `${BASE_URL}${args.path ?? "/"}`);
    await (wait === undefined ? page.settle() : sleep(wait));

    for (const step of steps) {
      const [kind, ...rest] = step.split("=");
      const value = rest.join("=");

      if (kind === "click") {
        const result = await clickTarget(page, value);

        if (result !== "clicked") {
          throw new Error(
            `${width}px ${theme}: ${result} ${value}; no screenshot taken`
          );
        }
      } else if (kind === "type") {
        await typeText(page, value);
      } else {
        await pressKey(page, value);
      }

      await page.settle({ quiet: 300 });
    }

    const focus = await page.evaluate(
      `(() => { const element = document.activeElement; return element.tagName.toLowerCase() + " " + JSON.stringify(element.getAttribute("aria-label") ?? element.textContent.trim().slice(0, 60)); })()`
    );

    const shot = await page.send("Page.captureScreenshot", { format: "png" });
    const file = `${name}-${width}-${theme}.png`;

    writeFileSync(path.join(out, file), Buffer.from(shot.result.data, "base64"));
    shots.push({ file, theme, width });
    console.log(`${file}  focus: ${focus}`);
  } finally {
    await page.close();
  }
};

const queue = themes.flatMap((theme) =>
  widths.map((width) => ({ theme, width }))
);

// WARNING: on a failure, let the other workers finish their shot so every Chrome is closed.
let failure;

const worker = async () => {
  for (let next = queue.shift(); next; next = queue.shift()) {
    try {
      await shoot(next.theme, next.width);
    } catch (error) {
      failure ??= error;
      queue.length = 0;
    }
  }
};

await Promise.all(Array.from({ length: parallel }, worker));

if (failure) {
  console.error(failure.message);
  process.exit(1);
}

shots.sort(
  (a, b) =>
    themes.indexOf(a.theme) - themes.indexOf(b.theme) ||
    widths.indexOf(a.width) - widths.indexOf(b.width)
);

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
