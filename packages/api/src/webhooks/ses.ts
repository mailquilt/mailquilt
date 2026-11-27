import { receiveSesNotification } from "@repo/core";
import { ByteSize, Cause, Effect, Result } from "effect";
import {
  HttpIncomingMessage,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/http";

import { tokenParam } from "../public-pages/responses.ts";

// WARNING: SNS posts messages of up to 256 KB, more than the 64 KiB the API's own routes take, and one refused for size is never sent again.
const MAX_SNS_BODY_SIZE = ByteSize.kibibytes(256);

const answer = (status: number, text: string) =>
  HttpServerResponse.text(text, { status });

const receive = Effect.gen(function* receiveSesWebhook() {
  const token = yield* tokenParam;
  const request = yield* HttpServerRequest.HttpServerRequest;

  const body = yield* request.text.pipe(
    Effect.provideService(HttpIncomingMessage.MaxBodySize, MAX_SNS_BODY_SIZE),
    Effect.result
  );

  if (Result.isFailure(body)) {
    const { reason } = body.failure;

    if (
      reason._tag === "RequestParseError" &&
      reason.reason === "BodyTooLarge"
    ) {
      return answer(413, "The message is larger than SNS sends.");
    }

    yield* Effect.logError(
      "An SES notification couldn't be read",
      reason.message
    );

    return answer(500, "The message couldn't be read. Send it again later.");
  }

  return yield* receiveSesNotification(token, body.success).pipe(
    Effect.as(answer(200, "OK")),
    Effect.catchTags({
      InvalidSnsMessage: (error) =>
        Effect.logWarning("Refused an SES notification", error.detail).pipe(
          Effect.as(answer(403, "This isn't a message SNS signed."))
        ),
      InvalidToken: () =>
        Effect.succeed(answer(404, "This notifications URL doesn't work.")),
      SnsUnreachable: (error) =>
        Effect.logError(
          "An SES notification couldn't be checked",
          error.detail
        ).pipe(
          Effect.as(
            answer(502, "SNS couldn't be reached. Send it again later.")
          )
        ),
    }),
    Effect.catchDefect((defect) =>
      Effect.logError(
        "An SES notification failed",
        Cause.pretty(Cause.die(defect))
      ).pipe(
        Effect.as(
          answer(500, "The message couldn't be recorded. Send it again later.")
        )
      )
    )
  );
});

/**
 * Where an SES Provider Connection's SNS topic posts bounces and complaints
 * (ADR 0019). The token in the query string names the connection and is
 * the only credential; every message must also carry SNS's signature. A
 * message is answered 200 once recorded, or ignored, so SNS stops sending
 * it, and 5xx when it should send it again.
 */
export const SesWebhookRoutes = HttpRouter.add(
  "POST",
  "/api/webhooks/ses",
  receive
);
