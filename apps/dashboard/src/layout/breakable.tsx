const AFTER_AT_OR_DOT = /(?<=[@.])/u;

const LONGEST_WHOLE_PART = 20;

const KEPT_TOGETHER = 2;

const breakPoints = (value: string) => {
  const parts = value.split(AFTER_AT_OR_DOT);

  if (parts.length > 1 && parts.at(-2)?.endsWith(".")) {
    parts.splice(-2, 2, `${parts.at(-2)}${parts.at(-1)}`);
  }

  return parts;
};

/**
 * An email address or host that wraps only after "@" or a dot, not at a
 * hyphen or before its ending: "news@ / example.com", never "example. / com"
 * or "eu-west- / 1". A part longer than 20 characters may be wider than the
 * narrowest column, so it wraps inside instead of pushing the column wider,
 * and keeps its last two characters together, so "@" or "." never ends up
 * on a line of its own.
 */
export const Breakable = ({ value }: { value: string }) => (
  <>
    {breakPoints(value).map((part, index) =>
      part.length > LONGEST_WHOLE_PART ? (
        <span
          className="inline-block max-w-full wrap-anywhere"
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
