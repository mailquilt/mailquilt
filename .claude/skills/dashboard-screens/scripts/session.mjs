import { BASE_URL, readArgs } from "./chrome.mjs";

const { email, password } = readArgs(process.argv.slice(2));

if (!email || !password) {
  console.error("Usage: node session.mjs --email <email> --password <password>");
  process.exit(1);
}

const response = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
  body: JSON.stringify({ email, password }),
  headers: { "content-type": "application/json", origin: BASE_URL },
  method: "POST",
});

const cookie = response.headers
  .getSetCookie()
  .find((value) => value.includes("session_token="));

if (!cookie) {
  console.error(
    `Sign-in failed with ${response.status}. Is the email verified? Sign-in allows 5 tries a minute per IP.`
  );
  process.exit(1);
}

console.log(cookie.split(";")[0].split("=").slice(1).join("="));
