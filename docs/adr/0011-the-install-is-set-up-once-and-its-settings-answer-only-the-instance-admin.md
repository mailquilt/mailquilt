# The install is set up once, and its settings answer only the instance admin

A self-hosted install has settings no Organization owns: who may sign up, and the System Mailer. They live in one `instance` row (`packages/db/src/schema.ts`). First-run setup (`POST /api/instance/setup`) writes that row, the instance admin and their password in one transaction, inserting the row with `on conflict do nothing`. So setup succeeds exactly once, even when two requests race, and never opens again, even if the admin is later deleted. Whoever reaches a fresh install first becomes its instance admin.

Instance settings endpoints run `asInstanceAdmin` (`packages/core/src/instance.ts`), which checks the signed-in person's `instance_admin` flag and only then provides `InstanceAdmin`. Every repository method that reads or changes the settings requires `InstanceAdmin` in its Effect type, and `@repo/core` exports `InstanceAdmin` as a type only, so, as with `CurrentOrganization` (ADR 0007), a handler that forgets the check doesn't compile. A signed-in person who isn't the instance admin gets 403 `InstanceAdminRequired`: these paths name no tenant, so there is nothing for a 404 to hide.

Setup writes the admin's user and credential account itself rather than through Better Auth's sign-up, because Better Auth's transaction runs on its own connection and can't include the `instance` row. The password is hashed with Better Auth's own `hashPassword`, and the account has the shape Better Auth's sign-up writes (`provider_id` `credential`, `account_id` the user's ID). A test signs the admin in through Better Auth, so an upgrade that changes either fails it. The admin's email is marked verified, because a fresh install has no System Mailer to send a verification link with. The flag reaches the dashboard as `instanceAdmin` in Better Auth's session (`user.additionalFields`, with `input: false`, so sign-up can never set it).

## Considered Options

- **Better Auth's sign-up, then mark the first user admin:** the user and the claim would be two transactions. A crash between them leaves a fresh install with a user and no admin, or two racing sign-ups each believing it was first.
- **A one-time setup token printed in the logs:** protects a fresh install found by someone else before its owner, at the cost of a step every self-hoster must find. Not asked for; it can be added in front of the same endpoint.
- **An admin ID on the `instance` row:** allows only one admin. A flag on `users` leaves room for more, such as hosted operators (#38).
- **404 for non-admins:** right for tenant data (ADR 0007), pointless for a fixed path every install has.

## Consequences

- An install migrated from before this change has no `instance` row: setup is open and sign-up is closed until someone completes it. No release has shipped without it.
- Sign-up is refused (403, code `SIGN_UP_CLOSED`) before setup and while the install is invite-only. Until invitations (#34), invite-only means nobody can sign up.
- Settings that belong to the whole install, such as a hosted operator's, are scoped by `InstanceAdmin` the same way.
