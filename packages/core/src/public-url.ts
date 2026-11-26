import { Context } from "effect";

/**
 * Where this install is reached: the origin of `APP_URL`, such as
 * `https://mail.example.com`. Links in emails, such as unsubscribe links,
 * point at it. Each runtime provides it from `APP_URL`.
 */
export class PublicUrl extends Context.Service<
  PublicUrl,
  { readonly origin: string }
>()("@repo/core/PublicUrl") {}
