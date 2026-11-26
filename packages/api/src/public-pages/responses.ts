import { ByteSize, Effect, Schema } from "effect";
import {
  HttpIncomingMessage,
  HttpServerRequest,
  HttpServerResponse,
  UrlParams,
} from "effect/http";

import { THEME_SCRIPT_HASH } from "./shell.ts";

const MAX_FORM_BODY_SIZE = ByteSize.kibibytes(4);

// WARNING: the token is in the address, so no page may send a Referer, be cached or be indexed; nothing on it loads from elsewhere.
export const PAGE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": `default-src 'none'; script-src '${THEME_SCRIPT_HASH}'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
};

/** A public page's HTML, with the headers every one of them carries. */
export const htmlPage = (html: string, status = 200) =>
  HttpServerResponse.text(html, {
    contentType: "text/html; charset=utf-8",
    headers: PAGE_HEADERS,
    status,
  });

/** After a form's post, back to a page by `GET`, so a reload doesn't post again. */
export const seeOther = (path: string) =>
  HttpServerResponse.redirect(path, { headers: PAGE_HEADERS, status: 303 });

/** The link's token from the query string, or nothing, which no check accepts. */
export const tokenParam = HttpServerRequest.schemaSearchParams(
  Schema.Struct({ token: Schema.String })
).pipe(
  Effect.map(({ token }) => token),
  Effect.orElseSucceed(() => "")
);

/** A posted form's fields, read up to 4 KiB; none when it can't be read. */
export const formFields = HttpServerRequest.HttpServerRequest.pipe(
  Effect.flatMap((request) => request.urlParamsBody),
  Effect.orElseSucceed(() => UrlParams.empty),
  Effect.provideService(HttpIncomingMessage.MaxBodySize, MAX_FORM_BODY_SIZE)
);
