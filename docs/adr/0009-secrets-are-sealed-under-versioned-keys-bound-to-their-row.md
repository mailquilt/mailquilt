# Secrets at rest are sealed under versioned keys and bound to their row

A secret Mailquilt has to use again later, such as a Provider Connection's SMTP password, is stored sealed with AES-256-GCM through the `CredentialCipher` port (`packages/core/src/credential-cipher.ts`). The keys come from one setting, `ENCRYPTION_KEYS`: comma-separated `version:key` entries, each key 32 random bytes in base64. The highest version seals; any listed version opens. The row stores the key version next to the sealed value (`base64url(nonce ‖ ciphertext ‖ tag)`, with a random 12-byte nonce). Every seal names the row it belongs to as additional authenticated data, `provider_connections:<organization>:<id>`, so a sealed value copied into another row or Organization doesn't open. The app doesn't start without valid keys.

Only the repository seals and opens. The API accepts secrets as `Redacted` values and never returns them, and only the method that sends (`ProviderConnections.withCredentials`) opens them, so nothing else holds them in plain text. Errors on that path are replaced before they become defects, because a Schema error quotes the value it failed on.

We chose AES-GCM from `effect/crypto` because it runs on WebCrypto on both Node and Workers, so one implementation serves both targets, and Effect already ships it.

## Considered Options

- **Derive the key from `AUTH_SECRET`:** no new setting, but rotating the session secret would make every stored credential unreadable, and the two secrets have different owners and lifetimes.
- **XChaCha20-Poly1305:** safer with random nonces at very high volume, but it runs in pure TypeScript instead of the platform's AES, and credentials are written a few times per Organization, far from AES-GCM's random-nonce limit (about 2³² values per key).
- **Postgres `pgcrypto`:** the key would travel in every query and could reach Postgres logs.
- **A key management service (KMS):** right for the hosted service later, but a self-hoster on Docker has none. A KMS can wrap the keys in `ENCRYPTION_KEYS` without changing this format.

## Consequences

- Rotation: add a key with a higher version, deploy, and new and updated secrets use it. Values sealed with the old key still open while it is listed. Re-sealing old rows, so the old key can be removed, needs a job that doesn't exist yet.
- Removing a key that still seals a row makes that row's secret unreadable. A test email through it fails with a 500. A Campaign sending through it fails every batch until the batch's retries run out, then stays `sending` with nothing recorded (#158).
- Every later secret at rest (webhook signing secrets, API tokens for an Integration) uses this port, with its own table and row ID as the context.
