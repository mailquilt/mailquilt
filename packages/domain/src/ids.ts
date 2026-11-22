import { Effect, Schema } from "effect";
import { SecureRandom } from "effect/crypto";

const BASE32 = "0123456789abcdefghjkmnpqrstvwxyz";

const ENCODED_LENGTH = 26;

const BASE = 32n;

/**
 * An ID in the TypeID format (ADR 0006): a type prefix, an underscore, and
 * the 16 bytes of a UUID as 26 lowercase Crockford base32 characters. The
 * UUID's 128 bits fill 26 characters' 130 from the right, so the first
 * character is at most 7.
 */
export const encodeTypeId = <const Prefix extends string>(
  prefix: Prefix,
  uuid: Uint8Array
) => {
  let value = 0n;

  for (const byte of uuid) {
    value = value * 256n + BigInt(byte);
  }

  let encoded = "";

  for (let index = ENCODED_LENGTH - 1; index >= 0; index -= 1) {
    encoded += BASE32[Number((value / BASE ** BigInt(index)) % BASE)];
  }

  return `${prefix}_${encoded}` as const;
};

const hasPrefix = (prefix: string) =>
  Schema.isPattern(new RegExp(`^${prefix}_[0-7][0-9a-hjkmnp-tv-z]{25}$`, "u"));

const newId = <const Prefix extends string>(prefix: Prefix) =>
  Effect.gen(function* newTypeId() {
    const random = yield* SecureRandom.SecureRandom;
    const uuid = yield* random.uuidV7({ format: "bytes" });

    return encodeTypeId(prefix, uuid);
  });

/** An Organization's ID, `org_…`. Accepts no other prefix. */
export const OrganizationIdSchema = Schema.String.check(hasPrefix("org")).pipe(
  Schema.brand("OrganizationId")
);

export type OrganizationId = typeof OrganizationIdSchema.Type;

/** A new Organization ID. IDs made later sort after earlier ones. */
export const newOrganizationId = newId("org").pipe(
  Effect.map((id) => OrganizationIdSchema.make(id))
);

/** The ID of one user's place in one Organization, `mem_…`. */
export const MemberIdSchema = Schema.String.check(hasPrefix("mem")).pipe(
  Schema.brand("MemberId")
);

export type MemberId = typeof MemberIdSchema.Type;

/** A new Member ID. IDs made later sort after earlier ones. */
export const newMemberId = newId("mem").pipe(
  Effect.map((id) => MemberIdSchema.make(id))
);

/** A Contact's ID, `cnt_…`. */
export const ContactIdSchema = Schema.String.check(hasPrefix("cnt")).pipe(
  Schema.brand("ContactId")
);

export type ContactId = typeof ContactIdSchema.Type;

/** A new Contact ID. IDs made later sort after earlier ones. */
export const newContactId = newId("cnt").pipe(
  Effect.map((id) => ContactIdSchema.make(id))
);

/** A List's ID, `lst_…`. */
export const ListIdSchema = Schema.String.check(hasPrefix("lst")).pipe(
  Schema.brand("ListId")
);

export type ListId = typeof ListIdSchema.Type;

/** A new List ID. IDs made later sort after earlier ones. */
export const newListId = newId("lst").pipe(
  Effect.map((id) => ListIdSchema.make(id))
);

/** A Subscription's ID, `sub_…`. */
export const SubscriptionIdSchema = Schema.String.check(hasPrefix("sub")).pipe(
  Schema.brand("SubscriptionId")
);

export type SubscriptionId = typeof SubscriptionIdSchema.Type;

/** A new Subscription ID. IDs made later sort after earlier ones. */
export const newSubscriptionId = newId("sub").pipe(
  Effect.map((id) => SubscriptionIdSchema.make(id))
);

/** A signed-in person. Better Auth makes these IDs, so they have no prefix. */
export const UserIdSchema = Schema.String.pipe(Schema.brand("UserId"));

export type UserId = typeof UserIdSchema.Type;
