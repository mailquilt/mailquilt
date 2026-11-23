const AFTER_AT_OR_DOT = /(?<=[@.])/u;

const breakPoints = (value: string) => {
  const parts = value.split(AFTER_AT_OR_DOT);

  if (parts.length > 1 && parts.at(-2)?.endsWith(".")) {
    parts.splice(-2, 2, `${parts.at(-2)}${parts.at(-1)}`);
  }

  return parts;
};

/**
 * An email address or host that wraps only after "@" or a dot, never
 * mid-word, at a hyphen, or before its ending: "news@ / example.com", never
 * "example. / com" or "eu-west- / 1".
 */
export const Breakable = ({ value }: { value: string }) => (
  <>
    {breakPoints(value).map((part, index) => (
      <span className="whitespace-nowrap" key={`${index}-${part}`}>
        {part}
        <wbr />
      </span>
    ))}
  </>
);
