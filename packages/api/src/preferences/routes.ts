import {
  preferencesPage,
  stopAllFromPreferences,
  subscribeToList,
  unsubscribeFromList,
} from "@repo/core";
import type {
  InvalidToken,
  Preferences,
  SignedTokens,
  Unsubscribes,
} from "@repo/core";
import { Cause, Effect, Layer, Option, Schema } from "effect";
import { HttpRouter, HttpServerRequest, UrlParams } from "effect/http";

import {
  formFields,
  htmlPage,
  seeOther,
  tokenParam,
} from "../public-pages/responses.ts";
import {
  brokenPreferencesLinkPage,
  failedPreferencesPage,
  noListsPage,
  preferencesPage as preferencesHtml,
} from "./pages.ts";
import type { PreferencesNotice, PreferencesStep } from "./pages.ts";

const withToken = (path: string, token: string) =>
  `${path}?token=${encodeURIComponent(token)}`;

const STOP_ALL = "/preferences/all";

const SUBSCRIBE = "/preferences/subscribe";

const UNSUBSCRIBE = "/preferences/unsubscribe";

const actionsFor = (token: string) => ({
  stopAll: withToken(STOP_ALL, token),
  subscribe: withToken(SUBSCRIBE, token),
  unsubscribe: withToken(UNSUBSCRIBE, token),
});

const pageOf = (token: string) => withToken("/preferences", token);

const NoticeParams = Schema.Struct({
  subscribed: Schema.optionalKey(Schema.String),
  unsubscribed: Schema.optionalKey(Schema.String),
});

const noticeOf = (params: typeof NoticeParams.Type) => {
  if (params.subscribed !== undefined) {
    return {
      change: "subscribed",
      listId: params.subscribed,
    } satisfies PreferencesNotice;
  }

  if (params.unsubscribed !== undefined) {
    return {
      change: "unsubscribed",
      listId: params.unsubscribed,
    } satisfies PreferencesNotice;
  }
};

const noticeParam = HttpServerRequest.schemaSearchParams(NoticeParams).pipe(
  Effect.map(noticeOf),
  Effect.option,
  Effect.map(Option.getOrUndefined)
);

const logFailure = (cause: Cause.Cause<unknown>) =>
  Effect.logError("A preferences link failed", Cause.pretty(cause));

const showPage = Effect.gen(function* showPreferencesPage() {
  const token = yield* tokenParam;
  const notice = yield* noticeParam;

  return yield* preferencesPage(token).pipe(
    Effect.map((preferences) =>
      htmlPage(
        preferences.lists.length === 0
          ? noListsPage(preferences)
          : preferencesHtml(preferences, actionsFor(token), notice)
      )
    ),
    Effect.catchTag("InvalidToken", () =>
      Effect.succeed(htmlPage(brokenPreferencesLinkPage(), 404))
    ),
    Effect.catchDefect((defect) =>
      logFailure(Cause.die(defect)).pipe(
        Effect.as(htmlPage(failedPreferencesPage("load", pageOf(token)), 500))
      )
    )
  );
});

const listField = formFields.pipe(
  Effect.map((fields) =>
    UrlParams.getFirst(fields, "list").pipe(Option.getOrElse(() => ""))
  )
);

const act = (step: {
  readonly failed: PreferencesStep;
  readonly path: string;
  readonly run: (
    token: string,
    list: string
  ) => Effect.Effect<
    void,
    InvalidToken,
    SignedTokens | Preferences | Unsubscribes
  >;
  readonly done: (token: string, list: string) => string;
}) =>
  Effect.gen(function* changePreferences() {
    const token = yield* tokenParam;
    const list = yield* listField;

    return yield* step.run(token, list).pipe(
      Effect.as(seeOther(step.done(token, list))),
      Effect.catchTag("InvalidToken", () =>
        Effect.succeed(htmlPage(brokenPreferencesLinkPage(), 404))
      ),
      Effect.catchDefect((defect) =>
        logFailure(Cause.die(defect)).pipe(
          Effect.as(
            htmlPage(
              failedPreferencesPage(
                step.failed,
                withToken(step.path, token),
                list
              ),
              500
            )
          )
        )
      )
    );
  });

const afterChange =
  (change: PreferencesNotice["change"]) => (token: string, list: string) =>
    `${pageOf(token)}&${change}=${encodeURIComponent(list)}`;

/**
 * The preferences page a Campaign's footer links to, and the posts its
 * buttons make. Opening the link changes nothing. Each List's button posts
 * at once and comes back to the page, saying what changed, so the page works
 * without JavaScript. The token in the query string is the only credential
 * (ADR 0016), as on the unsubscribe page.
 */
export const PreferencesRoutes = Layer.mergeAll(
  HttpRouter.add("GET", "/preferences", showPage),
  HttpRouter.add(
    "POST",
    SUBSCRIBE,
    act({
      done: afterChange("subscribed"),
      failed: "subscribe",
      path: SUBSCRIBE,
      run: subscribeToList,
    })
  ),
  HttpRouter.add(
    "POST",
    UNSUBSCRIBE,
    act({
      done: afterChange("unsubscribed"),
      failed: "unsubscribe",
      path: UNSUBSCRIBE,
      run: unsubscribeFromList,
    })
  ),
  HttpRouter.add(
    "POST",
    STOP_ALL,
    act({
      done: (token) => pageOf(token),
      failed: "stop marketing",
      path: STOP_ALL,
      run: (token) => stopAllFromPreferences(token),
    })
  )
);
