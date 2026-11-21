# Ports are provided per request; on Workers, Postgres is opened per request

HTTP handlers live in their own `api` package and resolve the ports their use cases call from the request, not when the API is built. Each runtime decides how long a port lives. Node builds its Postgres pool once per process and hands it to every request (`HttpRouter.provideRequest`). Workers builds the app once per isolate but builds the Postgres ports again for every request (`providePerRequest` in `runtime-cloudflare`) and closes them when the handler returns its response, before the body is sent. Hyperdrive keeps the long-lived pool.

We chose this because Workers ties a socket, and any timer, to the request that created it. The foundation spike showed a shared pool failing on `wrangler dev`. The second request that reused a pooled connection failed, and the pool's background fibers (resize and idle timers, started by the first request) then left every later request hanging. A pool per request has nothing shared to break.

## Considered Options

- **Handlers capture ports when the API is built:** simpler, but it forces one shared pool on Workers.
- **One shared pool with connection reuse turned off (`connectionTTL: 0`):** still hangs, because the pool's own background fibers are shared.
- **Effect's sync scheduler (`MixedScheduler("sync")`):** Effect recommends it for fibers shared across requests on Workers. With ports per request no fiber is shared, and the spike passed without it. Add it if a shared fiber is ever introduced on Workers.
- **Building the app at module load:** Effect's preferred setup on Workers, but a Hyperdrive binding can't be read outside a request, so the app is built on the first request instead.

## Consequences

- Handlers never `yield*` a port while the group is being built. A port is a request requirement of `ApiLive`, and each entry app must provide every one of them.
- A port that holds a connection must not be cached across requests on Workers.
- On Workers, a streamed response body can't read from Postgres, because the request's ports are already closed when the body is sent. The first streaming endpoint has to keep them open until the body ends.
