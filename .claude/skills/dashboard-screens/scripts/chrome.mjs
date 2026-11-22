// oxlint-disable no-await-in-loop -- Chrome starts once per screenshot, and steps on a page run in order.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export { setTimeout as sleep } from "node:timers/promises";

/** Where the app runs; `MAILQUILT_URL`, or the local server. */
export const BASE_URL = process.env.MAILQUILT_URL ?? "http://localhost:3000";

const CHROME =
  process.env.CHROME_PATH ??
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "google-chrome");

const SESSION_COOKIE = "__Secure-mailquilt.session_token";

const PHONE_BELOW = 700;

/** Reads `--name value` pairs into an object; a repeated flag becomes an array. */
export const readArgs = (argv) => {
  const args = {};

  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index].replace(/^--/u, "");
    const value = argv[index + 1];

    args[key] = args[key] === undefined ? value : [args[key], value].flat();
  }

  return args;
};

const startChrome = async () => {
  const port = 9300 + Math.floor(Math.random() * 600);

  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${mkdtempSync(path.join(tmpdir(), "mailquilt-screens-"))}`,
      "--hide-scrollbars",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();

      return { chrome, page: targets.find((target) => target.type === "page") };
    } catch {
      await sleep(100);
    }
  }

  chrome.kill();

  throw new Error(`Chrome didn't start. Set CHROME_PATH (tried ${CHROME}).`);
};

/** Opens a page at `width` in `theme`, signed in when `MAILQUILT_SESSION` is set. */
export const openPage = async ({ width, theme }) => {
  const { chrome, page } = await startChrome();
  const socket = new WebSocket(page.webSocketDebuggerUrl);

  await once(socket, "open");

  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);

    pending.get(message.id)?.(message);
    pending.delete(message.id);

    for (const listener of listeners) {
      listener(message);
    }
  });

  const send = (method, params = {}) => {
    const reply = Promise.withResolvers();

    nextId += 1;
    pending.set(nextId, reply.resolve);
    socket.send(JSON.stringify({ id: nextId, method, params }));

    return reply.promise;
  };

  const evaluate = async (expression) => {
    const reply = await send("Runtime.evaluate", {
      awaitPromise: true,
      expression,
    });

    return reply.result?.result?.value;
  };

  await send("Network.enable");

  const session = process.env.MAILQUILT_SESSION;

  if (session) {
    await send("Network.setCookie", {
      domain: new URL(BASE_URL).hostname,
      httpOnly: true,
      name: SESSION_COOKIE,
      path: "/",
      sameSite: "Lax",
      secure: true,
      value: session,
    });
  }

  await send("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: 1,
    height: width < PHONE_BELOW ? 844 : 900,
    mobile: width < PHONE_BELOW,
    width,
  });
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: theme }],
  });

  return {
    close: () => {
      socket.close();
      chrome.kill();
    },
    evaluate,
    onMessage: (listener) => listeners.add(listener),
    send,
  };
};

/**
 * Clicks the element `target` names with a real mouse click at its centre,
 * as a person would, so focus moves as it does for them. `target` is a CSS
 * selector, or `text=Label` for the last button, link or menu item whose
 * text starts with that. Sign out and destructive actions are refused, so a
 * screenshot run can't end the session or delete data.
 */
export const clickTarget = async (page, target) => {
  const found = await page.evaluate(`(() => {
    const target = ${JSON.stringify(target)};
    const element = target.startsWith("text=")
      ? [...document.querySelectorAll("button, a, [role=menuitem], [role=menuitemradio], [role=option], [role=tab]")]
          .filter((candidate) => candidate.textContent.trim().startsWith(target.slice(5)))
          .at(-1)
      : document.querySelector(target);
    if (!element) return null;
    if (/^(sign out|delete|remove|revoke)/iu.test(element.textContent.trim())) return "refused";
    element.scrollIntoView({ block: "center" });
    const box = element.getBoundingClientRect();
    return JSON.stringify({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  })()`);

  if (found === null || found === "refused") {
    return found ?? "missing";
  }

  const { x, y } = JSON.parse(found);

  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
    await page.send("Input.dispatchMouseEvent", {
      button: "left",
      clickCount: 1,
      type,
      x,
      y,
    });
  }

  return "clicked";
};

/** Types into whatever has focus, as a keyboard would. */
export const typeText = (page, text) => page.send("Input.insertText", { text });

const KEYS = {
  Enter: { code: "Enter", text: "\r", windowsVirtualKeyCode: 13 },
  Escape: { code: "Escape", windowsVirtualKeyCode: 27 },
  Tab: { code: "Tab", windowsVirtualKeyCode: 9 },
};

/**
 * Presses a key as a keyboard would. Enter carries "\r" as its text, which
 * Chrome needs before it submits a form.
 */
export const pressKey = async (page, key) => {
  const details = KEYS[key];

  if (!details) {
    throw new Error(`Unknown key ${key}. Known: ${Object.keys(KEYS).join(", ")}`);
  }

  await page.send("Input.dispatchKeyEvent", { key, type: "keyDown", ...details });
  await page.send("Input.dispatchKeyEvent", { key, type: "keyUp", ...details });
};

/** Renders an HTML contact sheet, all of it, to PNG bytes. */
export const renderSheet = async (htmlPath, width) => {
  const page = await openPage({ theme: "light", width });

  await page.send("Page.navigate", { url: `file://${htmlPath}` });
  await sleep(800);

  const height = await page.evaluate("document.documentElement.scrollHeight");

  await page.send("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: 1,
    height,
    mobile: false,
    width,
  });

  const shot = await page.send("Page.captureScreenshot", { format: "png" });

  page.close();

  return Buffer.from(shot.result.data, "base64");
};
