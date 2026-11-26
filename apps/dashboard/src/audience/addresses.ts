import { ContactEmail } from "@repo/domain";
import type { SuppressionsAdded } from "@repo/domain";
import { Schema } from "effect";

import { formatCount, wrappableAddress } from "./format.ts";

/** Whether a value is an email address, by the rule the API checks. */
export const isAddress = Schema.is(ContactEmail);

/** Each address once, ignoring case, in the spelling it first appears in. */
export const eachOnce = (addresses: Iterable<string>) => {
  const byLowerCase = new Map<string, string>();

  for (const address of addresses) {
    if (!byLowerCase.has(address.toLowerCase())) {
      byLowerCase.set(address.toLowerCase(), address);
    }
  }

  return [...byLowerCase.values()];
};

/** "1 address", "1,204 addresses". */
export const countOfAddresses = (count: number) =>
  `${formatCount(count)} ${count === 1 ? "address" : "addresses"}`;

/**
 * What a toast says once addresses were Suppressed: the one address by
 * name, or how many, with those that already were and `alsoSkipped`, such
 * as an import's rows that weren't addresses.
 */
export const suppressedMessage = (
  { added, alreadySuppressed }: SuppressionsAdded,
  { alsoSkipped, only }: { alsoSkipped?: string; only?: string } = {}
) => {
  const total = added + alreadySuppressed;

  if (added === 0) {
    return {
      description:
        alsoSkipped === undefined ? "Nothing changed." : `${alsoSkipped}.`,
      title:
        only === undefined
          ? `All ${formatCount(total)} were already suppressed`
          : `${wrappableAddress(only)} was already suppressed`,
    };
  }

  if (only !== undefined) {
    return { title: `Suppressed ${wrappableAddress(only)}` };
  }

  const already =
    alreadySuppressed === 0
      ? undefined
      : `${formatCount(alreadySuppressed)} ${alreadySuppressed === 1 ? "was" : "were"} already suppressed`;

  const notes = [already, alsoSkipped].filter((note) => note !== undefined);

  return {
    description:
      notes.length === 0
        ? undefined
        : `${new Intl.ListFormat("en").format(notes)}.`,
    title: `${countOfAddresses(added)} suppressed`,
  };
};
