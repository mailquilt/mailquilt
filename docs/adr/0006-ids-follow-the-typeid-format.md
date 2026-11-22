# IDs follow the TypeID format

Every ID Mailquilt makes is a type prefix, an underscore, and a UUIDv7 written as 26 lowercase Crockford base32 characters, as the [TypeID](https://github.com/jetify-com/typeid) specification sets out: `org_01h455vb4pex5vsknk084sn02q`. IDs are part of the public API and never change format. `packages/domain/src/ids.ts` holds the encoding, and one branded Schema per entity (`OrganizationId`, `MemberId`) that accepts only its own prefix, so a Contact's ID can't be passed where an Organization's is expected, in the types or in a request. New IDs come from Effect's `SecureRandom.uuidV7`, which reads the `Clock` (so tests control it) and orders IDs made in the same millisecond.

We chose TypeID over writing the UUID in hex (`org_0189…`, 36 characters) because it is shorter, still sorts by creation time as a string, and is a published format with libraries in most languages, so API clients can decode the timestamp without our help.

## Considered Options

- **Hex UUID after the prefix:** simpler to encode, but 10 characters longer, and a format of our own.
- **Database sequences:** short, but they reveal how many rows exist and can't be made before the insert.
- **Better Auth's generated IDs:** random strings with no prefix and no order.

## Consequences

- Users, sessions and the other Better Auth tables keep Better Auth's IDs. They aren't in the public API. `UserId` is a branded string without a prefix.
- Every later entity adds a prefix (`cnt_`, `lst_`, `cmp_`…) and a branded schema next to the others in `ids.ts`.
