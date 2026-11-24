const AFTER_AT_OR_DOT = /(?<=[@.])/u;

const LONGEST_WHOLE_PART = 20;

const KEPT_TOGETHER = 2;

const TWO_PART_ENDING = /\.[a-z]{2,3}\.[a-z]{2}(?::\d+)?$/iu;

const breakPoints = (value: string) => {
  const parts = value.split(AFTER_AT_OR_DOT);
  const ending = TWO_PART_ENDING.test(value) ? 3 : 2;

  if (parts.length >= ending && parts.at(-ending)?.endsWith(".")) {
    parts.push(parts.splice(-ending).join(""));
  }

  return parts;
};

/**
 * An email address or host that wraps only after "@" or a dot, not at a
 * hyphen or before its ending: "news@ / example.com", never "example. / com",
 * "acme. / co.uk" or "eu-west- / 1". A two-part ending is a two- or
 * three-letter name under a two-letter country code, such as "co.uk" or
 * "com.au". A part longer than 20 characters may be wider than the narrowest
 * column, so it wraps inside like ordinary text instead of pushing the column
 * wider, and keeps its last two characters together, so "@" or "." never
 * starts a line. One that ends in a two-part ending first moves to a line of
 * its own, and wraps inside only when it is wider than the column.
 */
export const Breakable = ({ value }: { value: string }) => (
  <>
    {breakPoints(value).map((part, index) =>
      part.length > LONGEST_WHOLE_PART ? (
        <span
          className={
            TWO_PART_ENDING.test(part)
              ? "inline-block wrap-anywhere"
              : "wrap-anywhere"
          }
          key={`${index}-${part}`}
        >
          {part.slice(0, -KEPT_TOGETHER)}
          <span className="whitespace-nowrap">
            {part.slice(-KEPT_TOGETHER)}
          </span>
        </span>
      ) : (
        <span
          className="inline-block whitespace-nowrap"
          key={`${index}-${part}`}
        >
          {part}
        </span>
      )
    )}
  </>
);
