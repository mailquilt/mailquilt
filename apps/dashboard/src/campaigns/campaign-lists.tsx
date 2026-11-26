import type { List } from "@repo/domain";

const DELETED_LIST = "A deleted list";

/** The names of the Lists `ids` names, in that order. */
export const namesOf = (ids: readonly string[], lists: readonly List[]) => {
  const names = new Map<string, string>(
    lists.map((list) => [list.id, list.name])
  );

  return ids.map((id) => names.get(id) ?? DELETED_LIST);
};

/** "Weekly news", or "Weekly news and 2 more". */
export const listSummary = (names: readonly string[]) => {
  const [first = DELETED_LIST, ...rest] = names;

  return rest.length === 0 ? first : `${first} and ${rest.length} more`;
};

/** "Weekly news", "Weekly news or Offers", or "Weekly news, Offers or Customers". */
export const listsInWords = (names: readonly string[]) =>
  names.length <= 1
    ? (names[0] ?? DELETED_LIST)
    : `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;

/** A Campaign's Lists, one per line. */
export const ListLines = ({
  ids,
  lists,
}: {
  ids: readonly string[];
  lists: readonly List[];
}) => {
  const names = namesOf(ids, lists);

  return (
    <span className="mq-list-lines">
      {ids.map((id, index) => (
        <span className="wrap-anywhere" key={id}>
          {names[index]}
        </span>
      ))}
    </span>
  );
};
