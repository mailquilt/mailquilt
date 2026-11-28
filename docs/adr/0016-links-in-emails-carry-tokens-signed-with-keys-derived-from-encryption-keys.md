# Links in emails carry tokens signed with keys derived from ENCRYPTION_KEYS

A link Mailquilt puts in an email, such as an unsubscribe link (#12), and later a preference, tracking or bounce link (#13, #21, #23), has to be trusted when it comes back without a session. Each such link carries a token from `SignedTokens` (`packages/core/src/signed-tokens.ts`). A token is `version.body.tag`:

- the key version;
- the base64url body, which is an optional expiry and the payload, such as the IDs the link acts on;
- an HMAC-SHA-256 tag over the version and the body.

`verify` gives the payload back only if the tag matches, the version's key still exists, and any expiry hasn't passed. Otherwise it fails with `InvalidToken`, whatever the reason, so a caller can't tell a changed token from an expired one.

The HMAC keys are derived from `ENCRYPTION_KEYS` with HKDF-SHA-256, one per key version and per purpose (the HKDF `info` is `mailquilt token <purpose>`). So:

- a self-hoster sets nothing new;
- adding a key version, as for credentials (ADR 0009), makes new tokens use it while older tokens still verify until their version is removed;
- a token made for one purpose never verifies as another, because each purpose has its own key;
- the HMAC key is never the AES key that seals credentials.

## Considered Options

- **A separate `TOKEN_KEYS` setting:** one more secret for every self-hoster to make, keep and rotate, for no gain over deriving from a key they already keep.
- **Using the `ENCRYPTION_KEYS` bytes as HMAC keys directly:** the same bytes would then serve AES-GCM and HMAC, and every purpose would share one key.
- **JWTs:** a header, an algorithm choice and a library for what is a payload and a tag, and the algorithm choice has been a source of bugs elsewhere.
- **Random tokens stored in a table:** a write per recipient per Campaign, and a lookup per click, for links that only need to prove they weren't made up.

## Consequences

- A token's payload is readable by whoever has the link. It holds IDs, never an email address or other personal data. IDs are TypeIDs (ADR 0006), not sequential.
- Removing a key version from `ENCRYPTION_KEYS` breaks every link signed with it, including unsubscribe links in emails already sent. Keep an old version for as long as its links should work.
- An unsubscribe token has no expiry: a link in an old email must keep working, and it can only unsubscribe. A preferences token has none either, for the same reason (#13). Tokens for other purposes choose an expiry when they're added.
- A bounce address can't hold a token this long or let its case change, so it uses a compact form with the same keys: lowercase, an 80-bit tag and no expiry (ADR 0021).
