const VALUE_SEPARATOR = ": ";

/**
 * A Better Auth log message without the value it quotes. Better Auth puts
 * request values after a colon, such as `Invalid callbackURL: <url>`, and a
 * client can put anything there, an email address included, which our logs
 * must never hold (#149).
 */
export const logMessage = (message: string) =>
  message.split(VALUE_SEPARATOR, 1)[0] ?? message;
