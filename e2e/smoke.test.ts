import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8325";

const MAILPIT_SMTP_HOST = process.env.MAILPIT_SMTP_HOST ?? "mailpit";

const MAILPIT_SMTP_PORT = process.env.MAILPIT_SMTP_PORT ?? "1025";

const ADMIN = {
  email: "grace@acme.example",
  name: "Grace",
  password: "a long smoke-test password",
};

const LIST = "Weekly news";

const CONTACTS = ["ada@example.com", "alan@example.com", "hedy@example.com"];

const setUpInstall = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Your name").fill(ADMIN.name);
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
  await page.getByRole("button", { name: "Create admin account" }).click();
  await expect(page).toHaveURL(/\/instance$/u);
};

const createOrganization = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Organization name").fill("Acme");
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByText("Acme").first()).toBeVisible();
};

const addPostalAddress = async (page: Page) => {
  await page.goto("/settings");
  await page
    .getByRole("textbox", { name: "Postal address" })
    .fill("1 Smoke Test Lane\nTestville");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved the postal address")).toBeVisible();
};

const connectMailpit = async (page: Page) => {
  await page.goto("/providers/new");
  await page.getByLabel("Name", { exact: true }).fill("Mailpit");
  await page.getByLabel("Host", { exact: true }).fill(MAILPIT_SMTP_HOST);
  await page.getByLabel("Port", { exact: true }).fill(MAILPIT_SMTP_PORT);
  await page.getByRole("radio", { name: "None" }).check();
  await page
    .getByRole("checkbox", { name: "This server doesn’t need a sign-in" })
    .check();
  await page
    .getByLabel("From email", { exact: true })
    .fill("news@acme.example");
  await page.getByRole("button", { name: "Connect" }).click();
  await page
    .getByRole("dialog", { name: "Send a test email" })
    .getByRole("button", { name: "Cancel" })
    .click();
};

// WARNING: acme.example has no real DNS; its records come from DEV_DNS_RECORDS in e2e/smoke.env, which the selector must match.
const addSendingDomain = async (page: Page) => {
  const organizations = await page.request.get("/api/organizations");
  const [organization] = await organizations.json();

  const added = await page.request.post(
    `/api/organizations/${organization?.id}/sending-domains`,
    {
      data: { dkimSelectors: ["mailquilt"], domain: "acme.example" },
      headers: { origin: new URL(page.url()).origin },
    }
  );

  expect(added.status()).toBe(201);
};

const addContact = async (page: Page, email: string) => {
  await page.getByRole("button", { name: "Add contact" }).first().click();

  const dialog = page.getByRole("dialog", { name: "Add a contact" });

  await dialog.getByLabel("Email address").fill(email);
  await dialog.getByRole("checkbox", { name: LIST }).check();
  await dialog.getByRole("button", { name: "Add contact" }).click();
  await expect(dialog).toBeHidden();
};

const addContacts = async (page: Page) => {
  await page.goto("/lists");
  await page.getByRole("button", { name: "New list" }).first().click();
  await page.getByLabel("List name").fill(LIST);
  await page.getByRole("button", { name: "Create list" }).click();
  await expect(page.getByRole("cell", { name: LIST })).toBeVisible();

  await page.goto("/contacts");

  for (const email of CONTACTS) {
    // oxlint-disable-next-line no-await-in-loop -- each Contact is added through the same dialog, one after another.
    await addContact(page, email);
  }
};

const SUBJECT = "This week at Acme";

const sendCampaign = async (page: Page) => {
  await page.goto("/campaigns/new");
  await page.getByLabel("Subject").fill(SUBJECT);
  await page
    .getByLabel("Content")
    .fill("<h1>This week at Acme</h1><p>Hello from the smoke test.</p>");
  await page.getByRole("button", { name: "Save draft" }).click();

  await page.getByRole("button", { name: "Send now" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Send now" })
    .click();

  await expect(page.getByText(/^Sent$/u)).toBeVisible();
};

const mailpitSearch = (to: string) =>
  `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}" subject:"${SUBJECT}"`)}`;

test("a Campaign sent from the dashboard arrives in every subscribed Contact's inbox", async ({
  page,
  request,
}) => {
  await setUpInstall(page);
  await createOrganization(page);
  await addPostalAddress(page);
  await connectMailpit(page);
  await addSendingDomain(page);
  await addContacts(page);
  await sendCampaign(page);

  const inboxes = await Promise.all(
    CONTACTS.map(async (to) => {
      const response = await request.get(mailpitSearch(to));

      return response.json();
    })
  );

  for (const inbox of inboxes) {
    expect(inbox).toMatchObject({ messages: [{ Subject: SUBJECT }] });
  }
});
