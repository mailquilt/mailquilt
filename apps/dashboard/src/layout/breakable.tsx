const AFTER_AT_OR_DOT = /(?<=[@.])/u;

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
 * or "eu-west- / 1". A part wider than the whole column on its own wraps
 * inside, so it never pushes the column wider.
 */
export const Breakable = ({ value }: { value: string }) => (
  <>
    {breakPoints(value).map((part, index) => (
      <span
        className="inline-block max-w-full wrap-anywhere"
        key={`${index}-${part}`}
      >
        {part}
      </span>
    ))}
  </>
);
