import { ProviderConnectionIdSchema } from "@repo/domain";
import { Effect, Schema } from "effect";

const droppedIfInvalid = <S extends Schema.Top>(schema: S) =>
  schema.pipe(Schema.catchDecoding(() => Effect.succeedNone));

const ProvidersSearchInUrl = Schema.Struct({
  connected: Schema.optionalKey(droppedIfInvalid(ProviderConnectionIdSchema)),
  saved: Schema.optionalKey(droppedIfInvalid(ProviderConnectionIdSchema)),
});

/**
 * Which connection was just connected or saved, so Providers opens its test
 * email as the next step. A part that doesn't parse is dropped.
 */
export const decodeProvidersSearch =
  Schema.decodeUnknownSync(ProvidersSearchInUrl);

/** In place of a Providers page before the person has an Organization. */
export const PROVIDERS_NEED_AN_ORGANIZATION =
  "Provider connections belong to an organization. Name yours on Home first.";
