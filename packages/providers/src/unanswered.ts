import { SendDeferred } from "@repo/core";
import { SendFailed } from "@repo/domain";
import { Option, Schema } from "effect";
import type { HttpClientError } from "effect/http";

const CONNECT_FAILURE_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
]);

const MAX_CAUSE_DEPTH = 5;

const ErrorWithCause = Schema.Struct({
  code: Schema.optionalKey(Schema.String),
  message: Schema.optionalKey(Schema.String),
  cause: Schema.optionalKey(Schema.Unknown),
});

const decodeErrorWithCause = Schema.decodeUnknownOption(ErrorWithCause);

const causesOf = (error: HttpClientError.HttpClientError) => {
  const causes: (typeof ErrorWithCause.Type)[] = [];
  let next = decodeErrorWithCause(error.reason);

  while (Option.isSome(next) && causes.length < MAX_CAUSE_DEPTH) {
    causes.push(next.value);
    next = decodeErrorWithCause(next.value.cause);
  }

  return causes;
};

// WARNING: a request that got no answer may have reached the Provider and been sent, so it's failed, never retried; only one that never connected, such as a failed host lookup, is put off.
/**
 * What a send request to a Provider's HTTP API that got no answer means,
 * in the words of its deepest cause.
 */
export const unanswered = (
  provider: string,
  error: HttpClientError.HttpClientError
) => {
  const causes = causesOf(error);
  const deepest = causes.at(-1);

  const detail = `${provider} didn't answer: ${deepest?.message ?? error.message}`;

  if (causes.some(({ code = "" }) => CONNECT_FAILURE_CODES.has(code))) {
    return new SendDeferred({
      everyEmail: true,
      failed: new SendFailed({ detail, reason: "unreachable" }),
    });
  }

  return new SendFailed({ detail, reason: "failed" });
};
