import { stopAllEmail, unsubscribe, unsubscribePage } from "@repo/core";
import type { InvalidToken, SignedTokens, Unsubscribes } from "@repo/core";
import { Cause, Effect, Layer, Option } from "effect";
import { HttpRouter, HttpServerResponse, UrlParams } from "effect/http";

import {
  formFields,
  htmlPage as page,
  seeOther,
  tokenParam,
} from "../public-pages/responses.ts";
import { PAGE_FIELD } from "../public-pages/shell.ts";
import {
  brokenLinkPage,
  confirmPage,
  failedPage,
  stoppedAllPage,
  unsubscribedPage,
} from "./pages.ts";
import type { FailedStep } from "./pages.ts";

const pathOf = (token: string) =>
  `/unsubscribe?token=${encodeURIComponent(token)}`;

const stopAllPathOf = (token: string) =>
  `/unsubscribe/all?token=${encodeURIComponent(token)}`;

const logFailure = (cause: Cause.Cause<unknown>) =>
  Effect.logError("An unsubscribe link failed", Cause.pretty(cause));

const isOneClick = formFields.pipe(
  Effect.map(
    (fields) =>
      !Option.contains(
        UrlParams.getFirst(fields, PAGE_FIELD.name),
        PAGE_FIELD.value
      )
  )
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
          : seeOther(pathOf(token))
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
