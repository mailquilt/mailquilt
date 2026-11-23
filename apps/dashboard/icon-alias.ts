import { fileURLToPath } from "node:url";

/**
 * Sends every import of `@phosphor-icons/react`, Kumo's included, to the
 * dashboard's own icon module, so one file decides every icon (ADR 0013).
 * Type imports still read Phosphor's types, which Kumo's props are typed with.
 */
export const iconAlias = {
  find: /^@phosphor-icons\/react$/u,
  replacement: fileURLToPath(new URL("src/icons/icons.tsx", import.meta.url)),
};
