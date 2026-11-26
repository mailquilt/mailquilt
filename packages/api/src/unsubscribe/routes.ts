import { stopAllEmail, unsubscribe, unsubscribePage } from "@repo/core";
import type { InvalidToken, SignedTokens, Unsubscribes } from "@repo/core";
import { ByteSize, Cause, Effect, Layer, Option, Schema } from "effect";
import {
  HttpIncomingMessage,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
  UrlParams,
} from "effect/http";

import {
  brokenLinkPage,
  confirmPage,
  failedPage,
  stoppedAllPage,
  unsubscribedPage,
  PAGE_FIELD,
} from "./pages.ts";
import type { FailedStep } from "./pages.ts";

const MAX_FORM_BODY_SIZE = ByteSize.kibibytes(4);

// WARNING: the token is in the address, so no page may send a Referer, be cached or be indexed; nothing on it loads from elsewhere.
const PAGE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
};

const page = (html: string, status = 200) =>
  HttpServerResponse.text(html, {
    contentType: "text/html; charset=utf-8",
    headers: PAGE_HEADERS,
    status,
  });

const tokenParam = HttpServerRequest.schemaSearchParams(
  Schema.Struct({ token: Schema.String })
).pipe(
  Effect.map(({ token }) => token),
  Effect.orElseSucceed(() => "")
);

const pathOf = (token: string) =>
  `/unsubscribe?token=${encodeURIComponent(token)}`;

const stopAllPathOf = (token: string) =>
  `/unsubscribe/all?token=${encodeURIComponent(token)}`;

const logFailure = (cause: Cause.Cause<unknown>) =>
  Effect.logError("An unsubscribe link failed", Cause.pretty(cause));

const isOneClick = HttpServerRequest.HttpServerRequest.pipe(
  Effect.flatMap((request) => request.urlParamsBody),
  Effect.map(
    (params) =>
      !Option.contains(
        UrlParams.getFirst(params, PAGE_FIELD.name),
        PAGE_FIELD.value
      )
  ),
  Effect.orElseSucceed(() => true),
  Effect.provideService(HttpIncomingMessage.MaxBodySize, MAX_FORM_BODY_SIZE)
);

const showPage = Effect.gen(function* showUnsubscribePage() {
  const token = yield* tokenParam;

  return yield* unsubscribePage(token).pipe(
    Effect.map((unsubscription) => {
      if (unsubscription.optedOut) {
        return page(stoppedAllPage(unsubscription));
      }

      return unsubscription.subscribed
        ? page(confirmPage(unsubscription, pathOf(token)))
        : page(unsubscribedPage(unsubscription, stopAllPathOf(token)));
    }),
    Effect.catchTag("InvalidToken", () =>
      Effect.succeed(page(brokenLinkPage(), 404))
    ),
    Effect.catchDefect((defect) =>
      logFailure(Cause.die(defect)).pipe(
        Effect.as(page(failedPage("load", pathOf(token)), 500))
      )
    )
  );
});

const act = (step: {
  readonly run: (
    token: string
  ) => Effect.Effect<void, InvalidToken, SignedTokens | Unsubscribes>;
  readonly path: (token: string) => string;
  readonly failed: FailedStep;
}) =>
  Effect.gen(function* unsubscribeStep() {
    const token = yield* tokenParam;
    const oneClick = yield* isOneClick;

    return yield* step.run(token).pipe(
      Effect.as(
        oneClick
          ? HttpServerResponse.text("Unsubscribed.")
          : HttpServerResponse.redirect(pathOf(token), {
              headers: PAGE_HEADERS,
              status: 303,
            })
      ),
      Effect.catchTag("InvalidToken", () =>
        Effect.succeed(
          oneClick
            ? HttpServerResponse.text("This unsubscribe link doesn’t work.", {
                status: 404,
              })
            : page(brokenLinkPage(), 404)
        )
      ),
      Effect.catchDefect((defect) =>
        logFailure(Cause.die(defect)).pipe(
          Effect.as(
            oneClick
              ? HttpServerResponse.text("Unsubscribing didn’t work.", {
                  status: 500,
                })
              : page(failedPage(step.failed, step.path(token)), 500)
          )
        )
      )
    );
  });

/**
 * The unsubscribe page a Campaign's link opens, and the posts it and a mail
 * app's one-click unsubscribe make. Opening the link changes nothing: the
 * page asks first, so a mail scanner that opens links unsubscribes nobody.
 * The token in the query string is the only credential (ADR 0016); it
 * isn't a path parameter because the router caps those at 100 characters.
 */
export const UnsubscribeRoutes = Layer.mergeAll(
  HttpRouter.add("GET", "/unsubscribe", showPage),
  HttpRouter.add(
    "POST",
    "/unsubscribe",
    act({ failed: "unsubscribe", path: pathOf, run: unsubscribe })
  ),
  HttpRouter.add(
    "POST",
    "/unsubscribe/all",
    act({ failed: "stop marketing", path: stopAllPathOf, run: stopAllEmail })
  )
);
