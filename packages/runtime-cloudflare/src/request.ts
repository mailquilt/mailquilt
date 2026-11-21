import { Effect, Layer } from "effect";
import type { Types } from "effect";
import { HttpRouter } from "effect/http";
import type { HttpServerResponse } from "effect/http";

/**
 * Like `HttpRouter.provideRequest`, but builds `layer` again for every
 * request and closes it when the handler returns its response, before the
 * body is sent. A streamed body can't read from it. A build failure becomes
 * a 500 response.
 */
export const providePerRequest =
  <A, E>(layer: Layer.Layer<A, E>) =>
  <A2, E2, R2>(self: Layer.Layer<A2, E2, R2>) =>
    Layer.provide(
      self,
      HttpRouter.middleware<{ provides: A }>()(
        (effect) =>
          // SAFETY: same cast as `HttpRouter.provideRequest`; a build error is unhandled, so the router answers 500.
          Effect.provide(effect, layer) as Effect.Effect<
            HttpServerResponse.HttpServerResponse,
            Types.unhandled
          >
      ).layer
    );
