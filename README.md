# Mailquilt

Mailquilt is an open-source email platform for newsletters, automations and transactional email. It provides the interface and logic; every email is delivered through a sending service you connect yourself, such as your own SMTP server.

It runs fully on Cloudflare or anywhere Docker runs, from the same code.

## Status

Mailquilt isn't released yet. P1, the first release, is being built; [ROADMAP.md](ROADMAP.md) lists what it includes.

What works today, on Docker and on Cloudflare:

- First-run setup, which creates the instance admin. Sign-up is invite-only by default.
- Sign-up and sign-in with email and password, with email verification. On Cloudflare, account emails aren't sent yet, so only the instance admin, verified at setup, can sign in there.
- Organizations, each with its own Contacts, Lists, Provider Connections and Campaigns.
- Adding Contacts and Lists.
- SMTP Provider Connections, with a test email.
- Sending a Campaign to one List, in the background.

Unsubscribe links, Suppressions, scheduling, templates, imports and the other P1 features are still to come, so don't send to real audiences yet.

## Run it with Docker

You need Docker with Compose.

```sh
git clone https://github.com/mailquilt/mailquilt.git
cd mailquilt
```

Create a `.env` file next to `compose.yaml`:

```sh
# At least 32 random characters: openssl rand -base64 32
AUTH_SECRET=
# A key number and 32 random bytes in base64: echo "1:$(openssl rand -base64 32)"
ENCRYPTION_KEYS=
# Letters and digits only: openssl rand -hex 32
POSTGRES_PASSWORD=
# Where you'll open Mailquilt: http://localhost:3000 to try it on your own machine.
APP_URL=http://localhost:3000
```

On a server, set `APP_URL` to an `https` address instead, such as `https://mail.example.com`, and put a reverse proxy in front that serves it over HTTPS and forwards to the app's port (3000, or `PORT`). Compose doesn't provide one; Coolify does. Browsers drop the sign-in cookie over plain http anywhere but localhost.

Then start it:

```sh
docker compose up -d
```

Open `APP_URL` and follow the first-run setup. The header of [compose.yaml](compose.yaml) explains every setting, including the optional ones.

## Learn more

- [GLOSSARY.md](GLOSSARY.md): the terms Mailquilt uses, such as Organization, Contact and Provider Connection
- [docs/architecture.md](docs/architecture.md): how it's built
- [docs/security.md](docs/security.md): the threat model and its controls
- [CONTRIBUTING.md](CONTRIBUTING.md): setting up the repo and opening a pull request
- [SECURITY.md](SECURITY.md): reporting a vulnerability privately

## License

Mailquilt's core is licensed under the [GNU Affero General Public License v3.0](LICENSE). Contributors sign a [Contributor License Agreement](CLA.md).
